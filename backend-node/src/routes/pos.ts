import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { attachStaff, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { inStore, storeWhere, toStore } from "../lib/storeScope.js";
import { computeBill, computePointsEarned, getStoreSettings, roundCashAmount } from "../lib/pricing.js";
import { rankTierFromLifetimeSpend } from "../lib/rank.js";
import { deductInventoryForOrder } from "../lib/inventory.js";
import { releaseOrderToKitchen } from "../lib/delivery.js";

export function posRouter(prisma: PrismaClient, io: Server) {
  const r = Router();
  const auth = attachStaff(prisma);
  const cashier = [auth, requireRoles("Cashier", "Admin"), requireStore];
  const floor = [auth, requireRoles("Waiter", "Cashier", "Admin", "Manager"), requireStore];

  r.get("/pos/zones", auth, async (req, res) => {
    res.json(await prisma.zone.findMany({ where: { ...storeWhere(req), isActive: true }, orderBy: { id: "asc" } }));
  });

  r.get("/pos/tables", auth, async (req, res) => {
    const zoneId = req.query.zoneId ? Number(req.query.zoneId) : undefined;
    const tables = await prisma.cafeTable.findMany({
      where: { ...storeWhere(req), ...(zoneId ? { zoneId } : {}) },
      orderBy: { id: "asc" },
      include: {
        zone: true,
        orders: {
          where: { status: { in: ["Confirmed", "Pending_Grace"] } },
          take: 1,
          orderBy: { id: "desc" },
          include: { details: true },
        },
      },
    });
    const mapped = tables.map((t) => {
      const isPaid = t.status === "Cleaning";
      return {
        ...t,
        paymentStatus: isPaid ? "Paid" : "Unpaid",
      };
    });
    res.json(mapped);
  });

  r.get("/pos/store-settings", ...cashier, async (_req, res) => {
    const s = await getStoreSettings(prisma);
    res.json({
      vatRatePercent: s.vatRatePercent,
      pointPerVnd: s.pointPerVnd,
      pointValueVnd: s.pointValueVnd,
      cashRoundTo: s.cashRoundTo,
      pointEarnEveryVnd: s.pointEarnEveryVnd,
      pointEarnEach: s.pointEarnEach,
    });
  });

  r.get("/pos/pending-orders", ...cashier, async (req, res) => {
    const orders = await prisma.order.findMany({
      where: {
        ...storeWhere(req),
        OR: [
          { status: "Confirmed" },
          { status: "Pending_Grace" },
          { status: "Waiting_Pay" },
          { status: "Paid", payments: { some: { shiftId: null } } },
        ]
      },
      include: {
        details: { include: { product: true } },
        table: true,
        customer: { select: { id: true, fullName: true, phone: true, points: true } },
        payments: true,
      },
      orderBy: { id: "asc" },
    });
    res.json(orders);
  });

  r.post("/pos/pay", ...cashier, async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const { orderId, method, cashGiven, pointsToUse: rawPts } = req.body as {
      orderId?: number;
      method?: string;
      cashGiven?: number;
      pointsToUse?: number;
    };
    if (!orderId || !method) {
      return res.status(400).json({ error: "Thiếu orderId hoặc phương thức thanh toán." });
    }

    const shift = await prisma.shift.findFirst({ where: { ...storeWhere(req), staffId: staff.id, endTime: null } });
    if (!shift) {
      return res.status(400).json({ error: "Phải mở ca (YCCN-TN01) trước khi thanh toán." });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, payments: true },
    });
    if (!order || !inStore(req, order) || order.status !== "Confirmed") {
      return res.status(400).json({ error: "Đơn không ở trạng thái chờ thanh toán." });
    }
    if (order.payments.length > 0) {
      return res.status(400).json({ error: "Đơn đã có giao dịch thanh toán." });
    }

    const settings = await getStoreSettings(prisma);

    // --- Xử lý điểm ---
    // Ưu tiên: điểm đã được khách áp dụng sẵn (qua /redeem-points) hoặc POS nhập tay
    const savedPointsUsed = order.pointsUsed ?? 0;
    const maxPts = order.customer
      ? Math.min(
          order.customer.points,
          Math.floor(Math.max(0, order.subTotal - order.discountAmt) / settings.pointValueVnd),
        )
      : 0;
    const pointsToUse = savedPointsUsed > 0
      ? savedPointsUsed
      : Math.min(rawPts ?? 0, maxPts);
    const pointsRedeemAmt = pointsToUse * settings.pointValueVnd;

    // --- Xử lý Voucher ---
    let voucherCode = null;
    let voucherDiscount = 0;
    if (order.cancelReason && order.cancelReason.startsWith("VOUCHER:")) {
      const parts = order.cancelReason.split(":");
      voucherCode = parts[1];
      voucherDiscount = Number(parts[2]) || 0;
    }

    // Tính bill cuối cùng (bao gồm cả giảm trừ điểm và voucher vào discountAmt)
    const effectiveDiscount = order.discountAmt + pointsRedeemAmt + voucherDiscount;
    const { vatAmount, totalAmount } = computeBill(
      order.subTotal,
      effectiveDiscount,
      0,
      settings.pointValueVnd,
      settings.vatRatePercent,
    );

    // Tiền thực tế phải trả bằng tiền mặt/chuyển khoản (sau khi trừ điểm)
    const displayTotal =
      method === "Cash" ? roundCashAmount(totalAmount, settings.cashRoundTo) : totalAmount;

    let change = 0;
    if (method === "Cash") {
      if (typeof cashGiven !== "number") {
        return res.status(400).json({ error: "Nhập số tiền khách đưa (tiền mặt)." });
      }
      change = cashGiven - displayTotal;
    }

    // Điểm cộng thêm chỉ tính trên tiền thực thu (không tính phần điểm đổi)
    const pointsEarned = computePointsEarned(
      displayTotal,
      settings.pointEarnEveryVnd,
      settings.pointEarnEach,
    );

    await prisma.$transaction(async (tx) => {
      // Tạo Payment cho phần điểm đổi (nếu có)
      if (pointsToUse > 0) {
        await tx.payment.create({
          data: {
            orderId,
            shiftId: shift.id,
            method: "Points",
            amount: pointsRedeemAmt,
            transCode: `PTS-${orderId}-${pointsToUse}pts`,
          },
        });
      }
      // Tạo Payment cho phần tiền thật
      await tx.payment.create({
        data: {
          orderId,
          shiftId: shift.id,
          method,
          amount: displayTotal,
        },
      });
      // Cập nhật Order
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: "Paid",
          vatAmount,
          discountAmt: effectiveDiscount,
          totalAmount: displayTotal + pointsRedeemAmt, // tổng bill gốc (không thay đổi doanh thu gộp)
          pointsUsed: pointsToUse,
          pointsRedeemAmt,
          cancelReason: null,
        },
      });
      // Deduct inventory
      await deductInventoryForOrder(tx, orderId);
      // Consume voucher if applied
      if (voucherCode) {
        await tx.voucher.updateMany({
          where: { code: voucherCode },
          data: { usedCount: { increment: 1 } },
        });
      }
      // Cập nhật điểm + rank khách
      if (order.customerId && order.customer) {
        const prevPaid = await tx.order.aggregate({
          where: { customerId: order.customerId, status: "Paid" },
          _sum: { totalAmount: true },
        });
        const lifetimeAfter = (prevPaid._sum.totalAmount ?? 0) + displayTotal;
        const rankTier = rankTierFromLifetimeSpend(lifetimeAfter);
        await tx.customer.update({
          where: { id: order.customerId },
          data: {
            points: order.customer.points - pointsToUse + pointsEarned,
            rankTier,
          },
        });
      }
      if (order.tableId) {
        await tx.cafeTable.update({
          where: { id: order.tableId },
          // Cleaning = đã thanh toán, khách có thể còn ngồi — nhân viên bấm "Báo trống" khi khách đi
          data: { status: "Cleaning" },
        });
      }
    });

    toStore(io, "pos", order.storeId).emit("payment:done", { orderId });
    io.to(`order:${orderId}`).emit("payment:success", {
      orderId,
      totalAmount: displayTotal,
      pointsEarned,
      change: method === "Cash" ? change : null,
    });

    // Đẩy món vào bếp (đơn giao hàng: chờ thu ngân xác nhận trước)
    await releaseOrderToKitchen(prisma, io, orderId);

    res.json({
      ok: true,
      totalAmount: displayTotal,
      vatAmount,
      discountAmt: effectiveDiscount,
      pointsUsed: pointsToUse,
      pointsRedeemAmt,
      pointsEarned,
      change: method === "Cash" ? change : null,
    });
  });

  /**
   * POST /pos/ack-online
   * Xác nhận đơn đã thanh toán online (gắn shiftId vào payment).
   */
  r.post("/pos/ack-online", ...cashier, async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const { orderId } = req.body as { orderId?: number };

    if (!orderId) return res.status(400).json({ error: "Missing orderId" });

    // Lấy ca đang mở
    const shift = await prisma.shift.findFirst({
      where: { ...storeWhere(req), staffId: staff.id, endTime: null },
    });
    if (!shift) return res.status(400).json({ error: "Chưa mở ca làm việc." });
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || !inStore(req, order)) return res.status(404).json({ error: "Không tìm thấy đơn" });

    // Cập nhật payment
    await prisma.payment.updateMany({
      where: { orderId, shiftId: null },
      data: { shiftId: shift.id },
    });

    // Báo cho các POS khác làm mới danh sách
    toStore(io, "pos", order.storeId).emit("payment:request", { orderId });

    res.json({ ok: true });
  });


  /**
   * GET /pos/bills?date=YYYY-MM-DD
   * Lịch sử bill trong ngày (chỉ cho phép 20 ngày gần nhất).
   * Trả về tất cả đơn Paid trong ngày đó kèm chi tiết đầy đủ.
   */
  r.get("/pos/bills", ...cashier, async (req, res) => {
    const dateStr = (req.query.date as string | undefined)?.trim();

    // Tính giới hạn 20 ngày gần nhất
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const oldest = new Date();
    oldest.setDate(oldest.getDate() - 19);
    oldest.setHours(0, 0, 0, 0);

    let dayStart: Date;
    let dayEnd: Date;

    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      dayStart = new Date(`${dateStr}T00:00:00`);
      dayEnd = new Date(`${dateStr}T23:59:59.999`);
      // Validate trong 20 ngày
      if (dayStart < oldest || dayStart > today) {
        return res.status(400).json({ error: "Chỉ xem được lịch sử trong vòng 20 ngày gần nhất." });
      }
    } else {
      // Mặc định hôm nay
      dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      dayEnd = new Date();
      dayEnd.setHours(23, 59, 59, 999);
    }

    const orders = await prisma.order.findMany({
      where: {
        ...storeWhere(req),
        status: "Paid",
        createdAt: { gte: dayStart, lte: dayEnd },
      },
      include: {
        details: { include: { product: true }, orderBy: { id: "asc" } },
        table: true,
        customer: { select: { id: true, fullName: true, phone: true } },
        payments: { orderBy: { id: "desc" }, take: 1 },
      },
      orderBy: { id: "desc" },
    });

    res.json(
      orders.map((o) => ({
        id: o.id,
        createdAt: o.createdAt,
        orderType: o.orderType,
        tableName: o.table?.name ?? null,
        customerName: o.customer?.fullName ?? null,
        customerPhone: o.customer?.phone ?? null,
        subTotal: o.subTotal,
        discountAmt: o.discountAmt,
        vatAmount: o.vatAmount,
        totalAmount: o.totalAmount,
        payMethod: o.payments[0]?.method ?? null,
        paidAt: o.payments[0]?.paymentTime ?? null,
        items: o.details.map((d) => ({
          id: d.id,
          name: d.product.name,
          quantity: d.quantity,
          unitPrice: d.unitPrice,
          lineTotal: d.unitPrice * d.quantity,
          customNotes: d.customNotes,
        })),
      })),
    );
  });

  /**
   * GET /api/pos/bills/:id
   * Lấy 1 bill cụ thể theo ID để in lại (rất hữu ích cho thanh toán online)
   */
  r.get("/pos/bills/:id", async (req, res) => {
    const orderId = Number(req.params.id);
    if (Number.isNaN(orderId)) return res.status(400).json({ error: "Invalid ID" });

    const o = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        details: { include: { product: true }, orderBy: { id: "asc" } },
        table: true,
        customer: { select: { id: true, fullName: true, phone: true } },
        payments: { orderBy: { id: "desc" }, take: 1 },
      },
    });

    if (!o) return res.status(404).json({ error: "Order not found" });

    res.json({
      id: o.id,
      createdAt: o.createdAt,
      orderType: o.orderType,
      tableName: o.table?.name ?? null,
      customerName: o.customer?.fullName ?? null,
      customerPhone: o.customer?.phone ?? null,
      subTotal: o.subTotal,
      discountAmt: o.discountAmt,
      vatAmount: o.vatAmount,
      totalAmount: o.totalAmount,
      payMethod: o.payments[0]?.method ?? null,
      paidAt: o.payments[0]?.paymentTime ?? null,
      items: o.details.map((d) => ({
        id: d.id,
        name: d.product.name,
        quantity: d.quantity,
        unitPrice: d.unitPrice,
        lineTotal: d.unitPrice * d.quantity,
        customNotes: d.customNotes,
      })),
    });
  });
  r.post("/pos/move-table", ...floor, async (req, res) => {
    const { sourceTableId, targetTableId } = req.body as { sourceTableId: number; targetTableId: number };
    if (!sourceTableId || !targetTableId || sourceTableId === targetTableId) return res.status(400).json({ error: "Invalid tables" });
    const target = await prisma.cafeTable.findUnique({ where: { id: targetTableId } });
    if (!target || !inStore(req, target) || target.status !== "Empty") return res.status(400).json({ error: "Bàn đích không hợp lệ hoặc đang có khách" });
    const source = await prisma.cafeTable.findUnique({ where: { id: sourceTableId }, include: { orders: { where: { status: { in: ["Confirmed", "Pending_Grace"] } } } } });
    if (!source || !inStore(req, source) || source.orders.length === 0) return res.status(400).json({ error: "Bàn nguồn không có đơn active" });
    const orderId = source.orders[0].id;
    await prisma.$transaction([
      prisma.order.update({ where: { id: orderId }, data: { tableId: targetTableId } }),
      prisma.cafeTable.update({ where: { id: sourceTableId }, data: { status: "Empty" } }),
      prisma.cafeTable.update({ where: { id: targetTableId }, data: { status: "Occupied" } }),
    ]);
    res.json({ ok: true });
  });

  r.post("/pos/merge-tables", ...floor, async (req, res) => {
    const { sourceTableId, targetTableId } = req.body as { sourceTableId: number; targetTableId: number };
    if (!sourceTableId || !targetTableId || sourceTableId === targetTableId) return res.status(400).json({ error: "Invalid tables" });
    const source = await prisma.cafeTable.findUnique({ where: { id: sourceTableId }, include: { orders: { where: { status: { in: ["Confirmed", "Pending_Grace"] } } } } });
    const target = await prisma.cafeTable.findUnique({ where: { id: targetTableId }, include: { orders: { where: { status: { in: ["Confirmed", "Pending_Grace"] } } } } });
    if (!source || !inStore(req, source) || source.orders.length === 0) return res.status(400).json({ error: "Bàn nguồn không có đơn active" });
    if (!target || !inStore(req, target) || target.orders.length === 0) return res.status(400).json({ error: "Bàn đích không có đơn active" });
    
    const sourceOrderId = source.orders[0].id;
    const targetOrderId = target.orders[0].id;
    
    await prisma.$transaction(async (tx) => {
      await tx.orderDetail.updateMany({ where: { orderId: sourceOrderId }, data: { orderId: targetOrderId } });
      const details = await tx.orderDetail.findMany({ where: { orderId: targetOrderId } });
      const subTotal = details.reduce((acc, d) => acc + d.unitPrice * d.quantity, 0);
      await tx.order.update({ where: { id: targetOrderId }, data: { subTotal, totalAmount: subTotal, vatAmount: 0 } });
      await tx.order.delete({ where: { id: sourceOrderId } });
      await tx.cafeTable.update({ where: { id: sourceTableId }, data: { status: "Empty", mergedWithTableId: targetTableId } });
    });
    res.json({ ok: true });
  });

  r.post("/pos/split-order", auth, requireRoles("Cashier", "Admin", "Manager"), requireStore, async (req, res) => {
    const { originalOrderId, itemsToMove } = req.body as { originalOrderId: number; itemsToMove: { orderItemId: number; quantity: number }[] };
    if (!originalOrderId || !itemsToMove || itemsToMove.length === 0) return res.status(400).json({ error: "Thiếu thông tin split" });
    const order = await prisma.order.findUnique({ where: { id: originalOrderId }, include: { details: true } });
    if (!order || !inStore(req, order)) return res.status(404).json({ error: "Không tìm thấy đơn" });
    
    try {
      await prisma.$transaction(async (tx) => {
        const newOrder = await tx.order.create({
          data: {
            storeId: order.storeId,
            tableId: order.tableId,
            customerId: order.customerId,
            staffId: order.staffId,
            sessionId: order.sessionId,
            orderType: order.orderType,
            subTotal: 0,
            totalAmount: 0,
            status: "Confirmed",
          }
        });
        
        for (const move of itemsToMove) {
          const d = order.details.find(x => x.id === move.orderItemId);
          if (!d || move.quantity <= 0 || move.quantity > d.quantity) throw new Error("Invalid quantity for " + move.orderItemId);
          
          if (move.quantity === d.quantity) {
            await tx.orderDetail.update({ where: { id: d.id }, data: { orderId: newOrder.id } });
          } else {
            await tx.orderDetail.update({ where: { id: d.id }, data: { quantity: d.quantity - move.quantity } });
            await tx.orderDetail.create({
              data: {
                orderId: newOrder.id,
                productId: d.productId,
                comboId: d.comboId,
                quantity: move.quantity,
                unitPrice: d.unitPrice,
                customNotes: d.customNotes,
                kdsStatus: d.kdsStatus,
                priority: d.priority,
              }
            });
          }
        }
        
        const oldDetails = await tx.orderDetail.findMany({ where: { orderId: order.id } });
        const newDetails = await tx.orderDetail.findMany({ where: { orderId: newOrder.id } });
        
        const oldSubTotal = oldDetails.reduce((a, b) => a + b.unitPrice * b.quantity, 0);
        const newSubTotal = newDetails.reduce((a, b) => a + b.unitPrice * b.quantity, 0);
        
        await tx.order.update({ where: { id: order.id }, data: { subTotal: oldSubTotal, totalAmount: oldSubTotal, vatAmount: 0 } });
        await tx.order.update({ where: { id: newOrder.id }, data: { subTotal: newSubTotal, totalAmount: newSubTotal, vatAmount: 0 } });
      });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  return r;
}
