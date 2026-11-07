/**
 * lib/analytics/finance.ts — Lãi lỗ (tách từ GET /cash/pnl).
 *
 * Lãi ròng = Doanh thu (tiền thật − phí ship thu hộ) − Giá vốn món bán − Hao hụt
 *   − Chi phí vận hành (phiếu chi, trừ trả NCC vì đã nằm trong giá vốn) − Lương (không gồm phí ship của shipper)
 */
import type { PrismaClient } from "@prisma/client";
import { CATEGORIES, PURCHASE_CATEGORIES } from "../cash.js";
import type { StoreFilter } from "./scope.js";

/** `start` tính từ, `end` không tính (nửa mở) */
export async function pnlReport(db: PrismaClient, sw: StoreFilter, start: Date, end: Date) {
  const [payments, lines, waste, expenses, payslips] = await Promise.all([
    db.payment.findMany({
      where: { paymentTime: { gte: start, lt: end }, order: { ...sw, status: "Paid" } },
      select: { method: true, amount: true, order: { select: { id: true, shippingFee: true } } },
    }),
    db.orderDetail.findMany({
      where: { order: { ...sw, status: "Paid", createdAt: { gte: start, lt: end } } },
      select: { quantity: true, product: { select: { costPrice: true } } },
    }),
    db.wasteLog.aggregate({ where: { ...sw, createdAt: { gte: start, lt: end } }, _sum: { costValue: true } }),
    db.cashEntry.findMany({
      where: { ...sw, kind: "OUT", status: "APPROVED", category: { notIn: PURCHASE_CATEGORIES }, createdAt: { gte: start, lt: end } },
      select: { category: true, amount: true },
    }),
    db.payslip.findMany({ where: { staff: sw }, select: { month: true, year: true, netSalary: true, shippingIncome: true } }),
  ]);
  const money = payments.filter((p) => p.method !== "Points");
  const collected = money.reduce((s, p) => s + p.amount, 0);
  // Phí ship trừ theo đơn có tiền thu trong kỳ (dòng hoàn ra điểm ở kỳ sau không trừ lại)
  const orderShip = new Map(payments.filter((p) => p.amount > 0).map((p) => [p.order.id, p.order.shippingFee]));
  const shippingFee = [...orderShip.values()].reduce((s, v) => s + v, 0);
  const revenue = collected - shippingFee;
  const cogs = lines.reduce((s, l) => s + l.quantity * l.product.costPrice, 0);
  const wasteCost = waste._sum.costValue ?? 0;
  const expenseByCat = new Map<string, number>();
  for (const e of expenses) expenseByCat.set(e.category, (expenseByCat.get(e.category) ?? 0) + e.amount);
  const operating = expenses.reduce((s, e) => s + e.amount, 0);
  // Lương: các tháng nằm trong kỳ
  const inRange = (m: number, y: number) => {
    const d = new Date(y, m - 1, 1);
    return d >= new Date(start.getFullYear(), start.getMonth(), 1) && d < end;
  };
  const salary = payslips.filter((p) => inRange(p.month, p.year)).reduce((s, p) => s + p.netSalary - p.shippingIncome, 0);
  const grossProfit = revenue - cogs;
  return {
    from: start.toISOString(),
    to: end.toISOString(),
    collected,
    points: payments.filter((p) => p.method === "Points").reduce((s, p) => s + p.amount, 0),
    shippingFee,
    revenue,
    cogs,
    grossProfit,
    wasteCost,
    operating,
    operatingByCategory: [...expenseByCat.entries()].map(([category, amount]) => ({ category, label: CATEGORIES[category]?.label ?? category, amount })),
    salary,
    netProfit: grossProfit - wasteCost - operating - salary,
  };
}
