import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import type { Request } from "express";
import { randomUUID } from "crypto";
import { attachStaff, requireRoles } from "../middleware/staff.js";
import { optionalCustomerAuth } from "../middleware/customer.js";
import { computeBill, computePointsEarned, getStoreSettings } from "../lib/pricing.js";

type CartLine = {
  productId: number;
  quantity: number;
  unitPrice: number;
  customNotes?: string;
};

const GRACE_MS = 15_000; // 15 giây ân hạn

export function ordersRouter(prisma: PrismaClient, io: Server) {
  const r = Router();
  const kitchenAuth = [attachStaff(prisma), requireRoles("Kitchen", "Admin")];

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
    const totalAmount = isPaid
      ? (order.totalAmount > 0 ? order.totalAmount : computed.totalAmount)
      : computed.totalAmount;

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
    const pointsEarnedPreview = order.customerId
      ? computePointsEarned(cashPaid, settings.pointEarnEveryVnd, settings.pointEarnEach)
      : 0;

    res.json({
      storeName: process.env.STORE_NAME ?? "TD Coffee",
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

    await prisma.order.update({
      where: { id },
      data: { pointsUsed: pointsToUse, pointsRedeemAmt, vatAmount, totalAmount },
    });

    return res.json({
      ok: true,
      pointsUsed: pointsToUse,
      pointsRedeemAmt,
      vatAmount,
      newTotal: totalAmount,
    });
  });




  /** Khách gửi yêu cầu in bill / thanh toán tới POS (giống staff nhưng xác minh phiên/bàn/tài khoản). */
  r.post("/orders/:id/request-payment", optionalCustomerAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ" });
    const body = req.body as { sessionId?: string | null; tableId?: number | null; discountVoucherAmt?: number; voucherCode?: string | null };
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
    if (order.tableId) {
      await prisma.cafeTable.update({
        where: { id: order.tableId },
        data: { status: "Waiting_Pay" },
      });
    }
    const discountVoucherAmt = body.discountVoucherAmt ?? 0;
    const voucherCode = body.voucherCode ?? null;
    if (discountVoucherAmt > 0 || voucherCode) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          cancelReason: voucherCode ? `VOUCHER:${voucherCode}:${discountVoucherAmt}` : null,
        }
      });
    }

    io.to("pos").emit("payment:request", {
      orderId: order.id,
      tableId: order.tableId,
      fromCustomer: true,
    });
    res.json({ ok: true });
  });

  r.post("/orders", async (req, res) => {
    const body = req.body as {
      tableId?: number | null;
      customerId?: number | null;
      orderType?: string;
      sessionId?: string | null;
      payMode?: "now" | "later";
      lines?: CartLine[];
    };
    const lines = body.lines ?? [];
    if (!lines.length) {
      return res.status(400).json({ error: "Giỏ hàng trống." });
    }
    const subTotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const orderType = body.orderType ?? "Dine-in";
    const payMode = body.payMode ?? "later";
    const isTakeaway = orderType.toLowerCase().includes("take") || orderType === "Takeaway";
    /** Mang về: luôn chốt xuống bếp ngay, khách xem bill chờ thu ngân (không ân hạn tại chỗ). */
    const immediatePay = isTakeaway || payMode === "now";
    if (!isTakeaway && !body.tableId) {
      return res.status(400).json({ error: "Đơn tại quán bắt buộc phải có thông tin bàn." });
    }
    const sessionId =
      isTakeaway ? body.sessionId ?? randomUUID() : null;

    const maxOrder = (await prisma.order.aggregate({ _max: { id: true } }))._max.id ?? 0;
    const maxDetail = (await prisma.orderDetail.aggregate({ _max: { id: true } }))._max.id ?? 0;
    const graceEndsAt = immediatePay ? null : new Date(Date.now() + GRACE_MS);

    const order = await prisma.order.create({
      data: {
        id: maxOrder + 1,
        tableId: body.tableId ?? null,
        customerId: body.customerId ?? null,
        staffId: null,
        sessionId,
        orderType,
        subTotal,
        discountAmt: 0,
        vatAmount: 0,
        totalAmount: subTotal,
        status: immediatePay ? "Confirmed" : "Pending_Grace",
        graceEndsAt,
        details: {
          create: lines.map((l, i) => {
            const base = (l.customNotes ?? "").trim();
            const taPrefix = isTakeaway ? "[MANG VỀ — ưu tiên] " : "";
            const merged = `${taPrefix}${base}`.trim();
            return {
              id: maxDetail + i + 1,
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              customNotes: merged || null,
              priority: isTakeaway,
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

    io.to("pos").emit("order:pending_grace", {
      orderId: order.id,
      tableId: order.tableId,
      payMode,
    });
    if (immediatePay) {
      // KHÔNG emit order:new ngay — chờ sau khi thanh toán mới đẩy vào bếp
      io.to("pos").emit("order:confirmed", { orderId: order.id });
      io.to("pos").emit("payment:request", { orderId: order.id, tableId: order.tableId, fromCustomer: true });
    }

    res.status(201).json({
      ...order,
      graceSeconds: 15,
    });
  });

  r.post("/orders/:id/cancel", async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ" });
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn" });
    if (order.status !== "Pending_Grace") {
      return res.status(400).json({ error: "Chỉ hủy được trong thời gian ân hạn." });
    }
    const now = new Date();
    if (order.graceEndsAt && order.graceEndsAt < now) {
      return res.status(400).json({ error: "Đã hết thời gian ân hạn." });
    }
    await prisma.order.update({
      where: { id },
      data: { status: "Cancelled", cancelReason: "Hủy bởi khách (ân hạn)" },
    });
    res.json({ ok: true });
  });

  r.get("/kds/queue", ...kitchenAuth, async (_req, res) => {
    const details = await prisma.orderDetail.findMany({
      where: {
        kdsStatus: { in: ["Waiting", "Cooking"] },
        // Bao gồm cả "Paid": đơn takeaway/payNow đã thanh toán trước, pha chế sau
        order: { status: { in: ["Confirmed", "Paid"] } },
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
    const d = await prisma.orderDetail.update({
      where: { id },
      data: { kdsStatus },
      include: { product: true, order: { include: { table: true } } },
    });
    if (!["Confirmed", "Paid"].includes(d.order.status)) {
      return res.status(400).json({ error: "Đơn chưa xác nhận xuống bếp." });
    }
    io.to("staff").emit("kds:update", d);
    // Thông báo món sẵn sàng phục vụ tới màn hình phục vụ
    if (kdsStatus === "Ready") {
      io.to("staff").emit("kds:ready", {
        detailId: d.id,
        productName: d.product.name,
        quantity: d.quantity,
        tableName: d.order.table?.name ?? "Mang về",
        orderId: d.orderId,
      });
    }
    res.json(d);
  });

  return r;
}
