import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import type { Request } from "express";
import { randomUUID } from "crypto";
import { attachStaff, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { inStore, storeWhere, toStore } from "../lib/storeScope.js";
import { resolveCustomerStore } from "../lib/stores.js";
import { resolveVoucher, voucherHold } from "../lib/vouchers.js";
import { priceLines, type RawLine } from "../lib/menuPrice.js";
import { optionalCustomerAuth } from "../middleware/customer.js";
import { computeBill, computePointsEarned, getStoreSettings } from "../lib/pricing.js";
import { DS, getStoreLocation, haversineKm, onKitchenProgress, shippingFeeForDistance } from "../lib/delivery.js";
import { customerCancelDeadline, emitRefunded, refundOrderToPoints, RefundError } from "../lib/points.js";
import { verifyToken, type StaffPayload } from "../lib/jwt.js";

/** Dòng giỏ hàng khách gửi lên. unitPrice của trình duyệt chỉ để tham khảo — máy chủ tự tính lại giá (lib/menuPrice). */
type CartLine = RawLine & { unitPrice?: number };

const GRACE_MS = 15_000; // 15 giây ân hạn

/** Nhân viên đang hoạt động nếu request mang token nhân sự (không bắt buộc) */
async function staffFromToken(prisma: PrismaClient, req: Request) {
  const h = req.headers.authorization;
  const token = h?.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return null;
  try {
    const p = verifyToken<StaffPayload>(token);
    if (p.typ !== "staff") return null;
    const s = await prisma.staff.findUnique({ where: { id: p.sub } });
    return s && s.status === "Active" ? s : null;
  } catch {
    return null;
  }
}

export function ordersRouter(prisma: PrismaClient, io: Server) {
  const r = Router();
  const kitchenAuth = [attachStaff(prisma), requireRoles("Kitchen", "Admin"), requireStore];

  r.get("/orders/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ" });
    const order = await prisma.order.findUnique({
      where: { id },
      include: { details: { include: { product: true } }, table: true },
    });
    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn" });
    res.json(order);
  });

  /** Bill preview / chi tiết như hóa đơn (VAT, tổng, điểm dự kiến). */
  r.get("/orders/:id/bill", async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ" });
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        details: { include: { product: true }, orderBy: { id: "asc" } },
        table: true,
        store: { select: { name: true, address: true } },
        customer: { select: { id: true, fullName: true, phone: true, points: true } },
        payments: { orderBy: { id: "asc" } },
      },
    });
    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn" });
    const settings = await getStoreSettings(prisma);
    const computed = computeBill(
      order.subTotal,
      order.discountAmt,
      order.pointsUsed,          // dùng pointsUsed thực tế trong DB
      settings.pointValueVnd,
      settings.vatRatePercent,
    );
    const isPaid = order.status === "Paid";
    // vatAmount: luôn tính lại từ computed (tránh order.vatAmount = 0 do bug cũ)
    const vatAmount = order.vatAmount > 0 ? order.vatAmount : computed.vatAmount;
    // Tổng khách trả = tiền hàng (sau giảm, có VAT) + phí ship (thu hộ shipper)
    const totalAmount = isPaid
      ? (order.totalAmount > 0 ? order.totalAmount : computed.totalAmount + order.shippingFee)
      : computed.totalAmount + order.shippingFee;

    // Điểm còn lại của khách (chưa dùng — để frontend hiển thị)
    const customerPoints = order.customer?.points ?? 0;
    // Tối đa điểm có thể dùng cho đơn này (chưa trừ khi chưa paid)
    const maxPointsCanUse = order.customerId && !isPaid
      ? Math.min(
          customerPoints,
          Math.floor(Math.max(0, order.subTotal - order.discountAmt) / settings.pointValueVnd),
        )
      : 0;

    // Tính điểm sẽ cộng (tính trên tiền thực thu — trừ đi phần điểm đổi)
    const cashPaid = isPaid
      ? order.payments.filter(p => p.method !== "Points").reduce((s, p) => s + p.amount, 0)
      : totalAmount;
    // Phí ship là tiền của shipper — không tích điểm
    const pointsEarnedPreview = order.customerId
      ? computePointsEarned(Math.max(0, cashPaid - order.shippingFee), settings.pointEarnEveryVnd, settings.pointEarnEach)
      : 0;

    res.json({
      storeName: order.store.name,
      storeAddress: order.store.address,
      storeId: order.storeId,
      orderId: order.id,
      status: order.status,
      orderType: order.orderType,
      createdAt: order.createdAt,
      tableName: order.table?.name ?? null,
      tableId: order.tableId,
      customerName: order.customer?.fullName ?? null,
      customerPhone: order.customer?.phone ?? null,
      customerPoints,
      maxPointsCanUse,
      pointValueVnd: settings.pointValueVnd,
      items: order.details.map((d) => ({
        id: d.id,
        name: d.product.name,
        quantity: d.quantity,
        unitPrice: d.unitPrice,
        lineTotal: d.quantity * d.unitPrice,
      })),
      subTotal: order.subTotal,
      discountAmt: order.discountAmt,
      // Điểm đã áp dụng (sau khi gọi redeem-points hoặc khi đơn đã Paid)
      pointsUsed: order.pointsUsed,
      pointsRedeemAmt: order.pointsRedeemAmt,
      vatRatePercent: settings.vatRatePercent,
      vatAmount,
      shippingFee: order.shippingFee,
      totalAmount,
      cashRoundTo: settings.cashRoundTo,
      pointsEarnedPreview,
      // Tất cả payments (để hiển thị chi tiết trên bill: tiền mặt, điểm, chuyển khoản…)
      payments: order.payments.map(p => ({
        method: p.method,
        amount: p.amount,
        paymentTime: p.paymentTime,
      })),
      paidAt: order.payments.find(p => p.method !== "Points")?.paymentTime
        ?? order.payments[0]?.paymentTime ?? null,
    });
  });

  /**
   * POST /api/orders/:id/redeem-points
   * Khách áp dụng điểm vào đơn (trước khi thanh toán tiền).
   * Body: { pointsToUse: number }
   * - validate số điểm
   * - lưu pointsUsed + pointsRedeemAmt vào Order
   * - trả về bill mới (totalAmount sau khi trừ điểm)
   */
  r.post("/orders/:id/redeem-points", optionalCustomerAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ" });

    const { pointsToUse: rawPts, remove } = req.body as { pointsToUse?: number; remove?: boolean };

    const order = await prisma.order.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn" });
    if (!["Confirmed", "Pending_Grace"].includes(order.status)) {
      return res.status(400).json({ error: "Đơn không ở trạng thái có thể áp dụng điểm" });
    }
    if (!order.customerId || !order.customer) {
      return res.status(400).json({ error: "Chỉ khách đăng nhập mới dùng điểm được" });
    }

    const reqCustomerId = (req as Request & { customerId?: number }).customerId;
    if (reqCustomerId && reqCustomerId !== order.customerId) {
      return res.status(403).json({ error: "Không có quyền trên đơn này" });
    }

    const settings = await getStoreSettings(prisma);

    // Nếu xóa điểm đã áp dụng
    if (remove) {
      await prisma.order.update({
        where: { id },
        data: { pointsUsed: 0, pointsRedeemAmt: 0 },
      });
      return res.json({ ok: true, pointsUsed: 0, pointsRedeemAmt: 0, newTotal: order.totalAmount });
    }

    // Tính max điểm có thể dùng
    const maxPts = Math.min(
      order.customer.points,
      Math.floor(Math.max(0, order.subTotal - order.discountAmt) / settings.pointValueVnd),
    );
    const pointsToUse = Math.max(0, Math.min(rawPts ?? 0, maxPts));
    const pointsRedeemAmt = pointsToUse * settings.pointValueVnd;

    // Tính lại total sau khi trừ điểm
    const { vatAmount, totalAmount } = computeBill(
      order.subTotal,
      order.discountAmt + pointsRedeemAmt,
      0,
      settings.pointValueVnd,
      settings.vatRatePercent,
    );

    // Phí ship không chịu VAT / giảm giá — cộng nguyên vào tổng khách trả
    const newTotal = totalAmount + order.shippingFee;
    await prisma.order.update({
      where: { id },
      data: { pointsUsed: pointsToUse, pointsRedeemAmt, vatAmount, totalAmount: newTotal },
    });

    return res.json({
      ok: true,
      pointsUsed: pointsToUse,
      pointsRedeemAmt,
      vatAmount,
      newTotal,
    });
  });




  /** Khách gửi yêu cầu in bill / thanh toán tới POS (giống staff nhưng xác minh phiên/bàn/tài khoản). */
  r.post("/orders/:id/request-payment", optionalCustomerAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ" });
    const body = req.body as { sessionId?: string | null; tableId?: number | null; voucherCode?: string | null };
    const order = await prisma.order.findUnique({
      where: { id },
      include: { payments: true, customer: true, table: true },
    });
    if (!order || order.status !== "Confirmed") {
      return res.status(400).json({ error: "Đơn không ở trạng thái chờ thanh toán." });
    }
    if (order.payments.length > 0) {
      return res.status(400).json({ error: "Đơn đã thanh toán." });
    }
    // Đơn giao hàng không nhận COD — bắt buộc thanh toán online trước khi quán nhận đơn
    if (order.orderType === "Delivery") {
      return res.status(400).json({ error: "Đơn giao hàng cần thanh toán online (VNPay / chuyển khoản) trước." });
    }
    const reqCustomerId = (req as Request & { customerId?: number }).customerId;
    if (order.customerId) {
      if (!reqCustomerId || reqCustomerId !== order.customerId) {
        return res.status(403).json({ error: "Cần đăng nhập đúng tài khoản đặt đơn." });
      }
    } else if (order.sessionId) {
      const sid = body.sessionId?.trim() ?? "";
      if (sid !== order.sessionId) {
        return res.status(403).json({ error: "Phiên mang về không khớp." });
      }
    } else if (order.tableId) {
      const tid = body.tableId != null ? Number(body.tableId) : NaN;
      if (Number.isNaN(tid) || tid !== order.tableId) {
        return res.status(403).json({ error: "Số bàn không khớp với đơn." });
      }
    } else {
      return res.status(400).json({ error: "Không xác định được quyền trên đơn này." });
    }
    // Giá trị giảm lấy từ DB, không tin số tiền trình duyệt gửi lên (POS thu theo giá trị này)
    const v = await resolveVoucher(prisma, body.voucherCode, order);
    if ("error" in v) return res.status(400).json({ error: v.error });
    if (order.tableId) {
      await prisma.cafeTable.update({
        where: { id: order.tableId },
        data: { status: "Waiting_Pay" },
      });
    }
    if (v.voucherCode) {
      await prisma.order.update({ where: { id: order.id }, data: { cancelReason: voucherHold(v) } });
    }

    toStore(io, "pos", order.storeId).emit("payment:request", {
      orderId: order.id,
      tableId: order.tableId,
      fromCustomer: true,
    });
    res.json({ ok: true });
  });

  r.post("/orders", optionalCustomerAuth, async (req, res) => {
    const body = req.body as {
      tableId?: number | null;
      storeId?: number | null;
      orderType?: string;
      sessionId?: string | null;
      payMode?: "now" | "later";
      lines?: CartLine[];
      deliveryAddress?: string;
      customerLat?: number;
      customerLng?: number;
      shippingFee?: number;
    };
    const lines = body.lines ?? [];
    if (!lines.length) {
      return res.status(400).json({ error: "Giỏ hàng trống." });
    }
    const orderType = body.orderType ?? "Dine-in";
    const payMode = body.payMode ?? "later";
    const isTakeaway = orderType.toLowerCase().includes("take") || orderType === "Takeaway";
    const isDelivery = orderType === "Delivery";
    /** Mang về hoặc Giao hàng: chốt ngay (trừ khi là COD payLater, nhưng demo cứ dùng logic hiện tại). */
    const immediatePay = isTakeaway || isDelivery || payMode === "now";
    
    if (!isTakeaway && !isDelivery && !body.tableId) {
      return res.status(400).json({ error: "Đơn tại quán bắt buộc phải có thông tin bàn." });
    }
    // Khách lấy từ token đăng nhập, không tin customerId trình duyệt gửi lên
    const customerId = (req as Request & { customerId?: number }).customerId ?? null;
    // Đơn giao hàng trả trước, hủy thì hoàn ra điểm → bắt buộc có tài khoản
    if (isDelivery && !customerId) {
      return res.status(401).json({ error: "Vui lòng đăng nhập để đặt giao hàng." });
    }
    if (isDelivery && !body.deliveryAddress) {
      return res.status(400).json({ error: "Đơn giao hàng bắt buộc phải có địa chỉ." });
    }
    if (isDelivery && (typeof body.customerLat !== "number" || typeof body.customerLng !== "number")) {
      return res.status(400).json({ error: "Vui lòng ghim vị trí giao hàng trên bản đồ." });
    }
    // Đơn tại bàn theo chi nhánh của bàn; mang về/giao hàng theo chi nhánh khách chọn
    const resolved = await resolveCustomerStore(prisma, isTakeaway || isDelivery ? null : body.tableId, body.storeId);
    if ("error" in resolved) return res.status(400).json({ error: resolved.error });
    const { storeId } = resolved;

    // Giá do máy chủ tính theo món / size / % giảm giá / combo — không tin giá trình duyệt gửi lên
    const priced = await priceLines(prisma, storeId, lines);
    if ("error" in priced) return res.status(400).json({ error: priced.error });
    const subTotal = priced.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

    // Phí ship tính phía server theo khoảng cách từ chi nhánh
    let shippingFee = 0;
    if (isDelivery) {
      const store = await getStoreLocation(prisma, storeId);
      shippingFee = shippingFeeForDistance(
        haversineKm(store, { lat: body.customerLat as number, lng: body.customerLng as number }),
      );
    }
    
    const sessionId =
      (isTakeaway || isDelivery) ? body.sessionId ?? randomUUID() : null;

    const graceEndsAt = immediatePay ? null : new Date(Date.now() + GRACE_MS);

    const order = await prisma.order.create({
      data: {
        storeId,
        tableId: body.tableId ?? null,
        customerId,
        staffId: null,
        sessionId,
        orderType,
        subTotal,
        discountAmt: 0,
        vatAmount: 0,
        shippingFee,
        deliveryAddress: body.deliveryAddress ?? null,
        customerLat: body.customerLat ?? null,
        customerLng: body.customerLng ?? null,
        totalAmount: subTotal + shippingFee,
        status: immediatePay ? "Confirmed" : "Pending_Grace",
        graceEndsAt,
        details: {
          create: priced.lines.map((l) => {
            const base = (l.customNotes ?? "").trim();
            const taPrefix = isTakeaway ? "[MANG VỀ — ưu tiên] " : "";
            const merged = `${taPrefix}${base}`.trim();
            return {
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              size: l.size,
              customNotes: merged || null,
              priority: isTakeaway,
              comboId: l.comboId,
              // immediatePay: giữ Hold — chỉ chuyển Waiting sau khi thanh toán xong
              // payLater: giữ Hold — graceWorker chuyển sang Waiting sau ân hạn
              kdsStatus: "Hold",
            };
          }),
        },
      },
      include: { details: { include: { product: true } }, table: true },
    });

    if (order.tableId) {
      await prisma.cafeTable.update({
        where: { id: order.tableId },
        data: { status: immediatePay ? "Waiting_Pay" : "Occupied" },
      });
    }

    const pos = toStore(io, "pos", storeId);
    pos.emit("order:pending_grace", {
      orderId: order.id,
      tableId: order.tableId,
      payMode,
    });
    if (immediatePay && !isDelivery) {
      // KHÔNG emit order:new ngay — chờ sau khi thanh toán mới đẩy vào bếp
      pos.emit("order:confirmed", { orderId: order.id });
      pos.emit("payment:request", { orderId: order.id, tableId: order.tableId, fromCustomer: true });
    }

    res.status(201).json({
      ...order,
      graceSeconds: 15,
    });
  });

  /**
   * Hủy đơn. Người gọi phải là: khách đặt đơn (token), đúng phiên mang về / bàn, hoặc nhân viên chi nhánh.
   * Đơn giao hàng đã trả online: khách tự hủy trong `cancelWindowMinutes` khi quán chưa nhận → hoàn 100% ra điểm.
   */
  r.post("/orders/:id/cancel", optionalCustomerAuth, async (req, res) => {
    const id = Number(req.params.id);
    const { cancelReason, sessionId, tableId } = (req.body || {}) as { cancelReason?: string; sessionId?: string | null; tableId?: number | null };
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ" });
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn" });

    const reqCustomerId = (req as Request & { customerId?: number }).customerId;
    const staff = await staffFromToken(prisma, req);
    const isStaff = !!staff && (staff.role === "Owner" || staff.storeId === order.storeId);
    const isOwnerCustomer = order.customerId
      ? reqCustomerId === order.customerId
      : order.sessionId
        ? !!sessionId && sessionId === order.sessionId
        : order.tableId != null && Number(tableId) === order.tableId;
    if (!isStaff && !isOwnerCustomer) {
      return res.status(403).json({ error: "Bạn không có quyền hủy đơn này." });
    }

    if (order.orderType === "Delivery" && order.status === "Paid") {
      if (!isOwnerCustomer) return res.status(400).json({ error: "Đơn giao hàng đã thanh toán — quán hủy trên bảng Đơn giao hàng." });
      if (order.deliveryStatus !== DS.AwaitingConfirm) {
        return res.status(400).json({ error: "Quán đã nhận đơn, không thể tự hủy. Vui lòng liên hệ quán." });
      }
      const settings = await getStoreSettings(prisma);
      const deadline = customerCancelDeadline(order, settings.cancelWindowMinutes)!;
      if (Date.now() > deadline.getTime()) {
        return res.status(400).json({ error: `Đã quá ${settings.cancelWindowMinutes} phút kể từ lúc thanh toán, không thể tự hủy. Vui lòng liên hệ quán.` });
      }
      try {
        const r2 = await refundOrderToPoints(prisma, id, {
          mode: "full",
          by: "Customer",
          reason: cancelReason?.trim() || "Khách hàng tự hủy",
          expect: { deliveryStatus: DS.AwaitingConfirm },
          extra: { deliveryStatus: DS.Rejected, deliveryNote: "Khách hủy đơn" },
        });
        emitRefunded(io, r2);
        return res.json({ ok: true, refundPoints: r2.refundPoints, totalReturned: r2.totalReturned });
      } catch (e) {
        if (e instanceof RefundError) return res.status(400).json({ error: e.message });
        throw e;
      }
    }

    if (["Paid", "Shipping", "Delivered", "Failed", "Cancelled"].includes(order.status)) {
      return res.status(400).json({ error: "Không thể hủy đơn ở trạng thái này." });
    }
    if (order.deliveryStatus && order.deliveryStatus !== DS.AwaitingConfirm) {
      return res.status(400).json({ error: "Quán đã nhận đơn, không thể hủy. Vui lòng liên hệ quán." });
    }
    
    // Kiểm tra xem đã có thanh toán nào chưa
    const payments = await prisma.payment.findMany({ where: { orderId: id } });
    if (payments.length > 0) {
      return res.status(400).json({ error: "Đơn đã có thanh toán, không thể hủy online." });
    }

    await prisma.order.update({
      where: { id },
      data: {
        status: "Cancelled",
        cancelReason: cancelReason || "Khách hàng tự hủy",
        cancelledAt: new Date(),
        cancelledBy: isOwnerCustomer ? "Customer" : "Store",
        ...(order.deliveryStatus ? { deliveryStatus: DS.Rejected, deliveryNote: "Khách hủy đơn" } : {}),
      },
    });
    if (order.deliveryStatus) toStore(io, "pos", order.storeId).emit("delivery:update", { orderIds: [id] });
    // Thông báo cho POS và bếp
    toStore(io, "pos", order.storeId).emit("order:updated", { id });
    toStore(io, "kds", order.storeId).emit("order:updated", { id });
    res.json({ ok: true });
  });

  r.get("/kds/queue", ...kitchenAuth, async (req, res) => {
    const details = await prisma.orderDetail.findMany({
      where: {
        kdsStatus: { in: ["Waiting", "Cooking"] },
        // Bao gồm cả "Paid": đơn takeaway/payNow đã thanh toán trước, pha chế sau
        order: { ...storeWhere(req), status: { in: ["Confirmed", "Paid"] } },
      },
      include: {
        product: true,
        order: { include: { table: true } },
      },
      orderBy: [{ priority: "desc" }, { orderId: "asc" }, { id: "asc" }],
    });
    res.json(details);
  });

  r.patch("/kds/details/:id", ...kitchenAuth, async (req, res) => {
    const id = Number(req.params.id);
    const { kdsStatus } = req.body as { kdsStatus?: string };
    if (!kdsStatus) return res.status(400).json({ error: "Thiếu kdsStatus" });
    const cur = await prisma.orderDetail.findUnique({ where: { id }, include: { order: true } });
    if (!cur || !inStore(req, cur.order)) return res.status(404).json({ error: "Không tìm thấy món." });
    if (!["Confirmed", "Paid"].includes(cur.order.status)) {
      return res.status(400).json({ error: "Đơn chưa xác nhận xuống bếp." });
    }
    // Ghi người pha khi món chuyển sang "Xong"; bị đưa lại hàng chờ thì xoá (thống kê pha chế theo người)
    const me = (req as StaffRequest).staffRow!;
    const made =
      kdsStatus === "Ready" && cur.kdsStatus !== "Ready" && cur.kdsStatus !== "Served"
        ? { madeById: me.id, madeAt: new Date() }
        : kdsStatus === "Waiting" || kdsStatus === "Cooking"
          ? { madeById: null, madeAt: null }
          : {};
    const d = await prisma.orderDetail.update({
      where: { id },
      data: { kdsStatus, ...made },
      include: { product: true, order: { include: { table: true } } },
    });
    const staffRoom = toStore(io, "staff", d.order.storeId);
    staffRoom.emit("kds:update", d);
    // Thông báo món sẵn sàng phục vụ tới màn hình phục vụ
    if (kdsStatus === "Ready") {
      staffRoom.emit("kds:ready", {
        detailId: d.id,
        productName: d.product.name,
        quantity: d.quantity,
        tableName: d.order.table?.name ?? "Mang về",
        orderId: d.orderId,
      });
    }
    await onKitchenProgress(prisma, io, d.orderId);
    res.json(d);
  });

  return r;
}
