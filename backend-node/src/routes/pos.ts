import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { attachStaff, requireRoles, type StaffRequest } from "../middleware/staff.js";
import { computeBill, computePointsEarned, getStoreSettings, roundCashAmount } from "../lib/pricing.js";
import { rankTierFromLifetimeSpend } from "../lib/rank.js";

export function posRouter(prisma: PrismaClient, io: Server) {
  const r = Router();
  const auth = attachStaff(prisma);
  const cashier = [auth, requireRoles("Cashier", "Admin")];

  r.get("/pos/tables", async (_req, res) => {
    const tables = await prisma.cafeTable.findMany({
      orderBy: { id: "asc" },
      include: {
        orders: {
          where: { status: { in: ["Confirmed", "Pending_Grace"] } },
          take: 1,
          orderBy: { id: "desc" },
        },
      },
    });
    res.json(tables);
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

  r.get("/pos/pending-orders", ...cashier, async (_req, res) => {
    const orders = await prisma.order.findMany({
      where: {
        status: "Confirmed",
        payments: { none: {} },
      },
      include: {
        details: { include: { product: true } },
        table: true,
        customer: { select: { id: true, fullName: true, phone: true, points: true } },
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

    const shift = await prisma.shift.findFirst({ where: { staffId: staff.id, endTime: null } });
    if (!shift) {
      return res.status(400).json({ error: "Phải mở ca (YCCN-TN01) trước khi thanh toán." });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, payments: true },
    });
    if (!order || order.status !== "Confirmed") {
      return res.status(400).json({ error: "Đơn không ở trạng thái chờ thanh toán." });
    }
    if (order.payments.length > 0) {
      return res.status(400).json({ error: "Đơn đã có giao dịch thanh toán." });
    }

    const settings = await getStoreSettings(prisma);
    const maxPts = order.customer
      ? Math.min(
          order.customer.points,
          Math.floor(Math.max(0, order.subTotal - order.discountAmt) / settings.pointValueVnd),
        )
      : 0;
    const pointsToUse = Math.min(rawPts ?? 0, maxPts);

    const { vatAmount, totalAmount, pointsDiscount } = computeBill(
      order.subTotal,
      order.discountAmt,
      pointsToUse,
      settings.pointValueVnd,
      settings.vatRatePercent,
    );
    const discountAmt = order.discountAmt + pointsDiscount;

    const displayTotal =
      method === "Cash" ? roundCashAmount(totalAmount, settings.cashRoundTo) : totalAmount;

    let change = 0;
    if (method === "Cash") {
      if (typeof cashGiven !== "number") {
        return res.status(400).json({ error: "Nhập số tiền khách đưa (tiền mặt)." });
      }
      change = cashGiven - displayTotal;
    }

    const pointsEarned = computePointsEarned(
      displayTotal,
      settings.pointEarnEveryVnd,
      settings.pointEarnEach,
    );

    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          orderId,
          shiftId: shift.id,
          method,
          amount: displayTotal,
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: "Paid",
          vatAmount,
          discountAmt,
          totalAmount: displayTotal,
        },
      });
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
          data: { status: "Empty" },
        });
      }
    });

    io.to("pos").emit("payment:done", { orderId });
    res.json({
      ok: true,
      totalAmount: displayTotal,
      vatAmount,
      discountAmt,
      pointsUsed: pointsToUse,
      pointsEarned,
      change: method === "Cash" ? change : null,
    });
  });

  return r;
}
