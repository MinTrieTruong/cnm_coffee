/**
 * lib/analytics/sales.ts — Doanh thu, top món, lợi nhuận, bảng điều khiển, so sánh chi nhánh.
 *
 * Tách từ routes/reports.ts: route báo cáo và trợ lý AI gọi cùng hàm nên ra cùng con số.
 * Doanh thu = tiền thật đã thu (bỏ thanh toán bằng điểm) − phí ship thu hộ shipper.
 */
import type { PrismaClient } from "@prisma/client";
import { addDaysYmd, bizDayEnd, bizDayStart, bizHour, bizYmd, daysInRange } from "../bizTime.js";
import type { StoreFilter } from "./scope.js";

/** Doanh thu tổng hợp + theo ngày + theo phương thức (GET /reports/revenue) */
export async function revenueReport(db: PrismaClient, sw: StoreFilter, from: Date, to: Date) {
  const payments = await db.payment.findMany({
    where: { paymentTime: { gte: from, lte: to }, order: { ...sw, status: "Paid" } },
    include: { order: { select: { id: true, status: true, shippingFee: true } } },
  });

  // Tách riêng: tiền thật vs. điểm đổi
  const cashPayments = payments.filter(p => p.method !== "Points");
  const pointsPayments = payments.filter(p => p.method === "Points");

  // Phí ship khách trả cùng đơn là tiền của shipper (cộng vào lương) — không tính doanh thu quán
  // Chỉ đơn có tiền thu trong kỳ (dòng hoàn ra điểm ở kỳ sau không trừ phí ship lần nữa)
  const shipOf = new Map(payments.filter(p => p.amount > 0).map(p => [p.order.id, p.order.shippingFee]));
  const shippingFee = [...shipOf.values()].reduce((s, v) => s + v, 0);
  const total = cashPayments.reduce((s, p) => s + p.amount, 0) - shippingFee;
  const pointsRedeemTotal = pointsPayments.reduce((s, p) => s + p.amount, 0);

  const byDay: Record<string, { cash: number; points: number }> = {};
  const shipCounted = new Set<number>();
  for (const p of payments) {
    const d = bizYmd(p.paymentTime);
    if (!byDay[d]) byDay[d] = { cash: 0, points: 0 };
    if (p.method !== "Points") {
      byDay[d].cash += p.amount;
      if (p.amount > 0 && !shipCounted.has(p.order.id)) {
        shipCounted.add(p.order.id);
        byDay[d].cash -= p.order.shippingFee;
      }
    } else byDay[d].points += p.amount;
  }
  // Theo phương thức thanh toán (tiền mặt / chuyển khoản / thẻ / online…)
  const byMethod: Record<string, number> = {};
  for (const p of cashPayments) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;

  return {
    total,               // tiền thực thu (không bao gồm điểm)
    pointsRedeemTotal,   // tổng điểm đổi (chi phí loyalty)
    grandTotal: total + pointsRedeemTotal, // doanh thu gộp
    shippingFee,         // phí ship thu hộ shipper (không tính doanh thu)
    byMethod,
    byDay,
  };
}

export type ProductSales = { productId: number; name: string; categoryId: number; quantity: number; revenue: number; costPrice: number; profit: number };

/** Số ly, doanh thu, lãi gộp từng món của đơn đã thanh toán (tạo trong kỳ); `categoryId` lọc theo danh mục */
export async function productSales(db: PrismaClient, sw: StoreFilter, from: Date, to: Date, opts: { categoryId?: number; productIds?: number[] } = {}) {
  const lines = await db.orderDetail.findMany({
    where: {
      order: { ...sw, status: "Paid", createdAt: { gte: from, lte: to } },
      ...(opts.categoryId ? { product: { categoryId: opts.categoryId } } : {}),
      ...(opts.productIds ? { productId: { in: opts.productIds } } : {}),
    },
    include: { product: { select: { name: true, sellPrice: true, costPrice: true, categoryId: true } } },
  });

  const map: Record<string, ProductSales> = {};
  for (const l of lines) {
    const key = String(l.productId);
    if (!map[key]) map[key] = { productId: l.productId, name: l.product.name, categoryId: l.product.categoryId, quantity: 0, revenue: 0, costPrice: l.product.costPrice, profit: 0 };
    map[key].quantity += l.quantity;
    map[key].revenue  += l.quantity * l.unitPrice;
  }
  for (const i of Object.values(map)) i.profit = i.revenue - i.quantity * i.costPrice;
  return Object.values(map);
}

/** Món bán chạy theo số ly (GET /reports/top-products) */
export async function topProductsReport(db: PrismaClient, sw: StoreFilter, from: Date, to: Date, lim: number) {
  const items = (await productSales(db, sw, from, to))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, lim)
    .map(i => ({ name: i.name, quantity: i.quantity, revenue: i.revenue, costPrice: i.costPrice, profit: i.profit }));
  return { items };
}

/** Lợi nhuận: doanh thu − giá vốn món; kèm chi phí nhập nguyên liệu (GET /reports/profit) */
export async function profitReport(db: PrismaClient, sw: StoreFilter, from: Date, to: Date) {
  // 1. Doanh thu từ đơn đã thanh toán
  // Tiền thật (bỏ điểm đổi) trừ phí ship thu hộ shipper
  const payments = (await db.payment.findMany({
    where: { paymentTime: { gte: from, lte: to }, method: { not: "Points" }, order: { ...sw, status: "Paid" } },
    include: { order: { select: { id: true, shippingFee: true } } },
  }));
  const shipSeen = new Set<number>();
  const netOf = (p: (typeof payments)[number]) => {
    if (p.amount <= 0 || shipSeen.has(p.order.id)) return p.amount;
    shipSeen.add(p.order.id);
    return p.amount - p.order.shippingFee;
  };
  const netAmounts = payments.map((p) => ({ p, net: netOf(p) }));
  const totalRevenue = netAmounts.reduce((s, x) => s + x.net, 0);

  // 2. Giá vốn từ chi tiết đơn × costPrice sản phẩm
  const orderLines = await db.orderDetail.findMany({
    where: { order: { ...sw, status: "Paid", createdAt: { gte: from, lte: to } } },
    include: {
      product: { select: { name: true, costPrice: true, sellPrice: true } },
      order: { select: { createdAt: true } },
    },
  });

  let totalProductCost = 0;
  const byProduct: Record<string, { name: string; qty: number; revenue: number; cost: number }> = {};
  for (const l of orderLines) {
    totalProductCost += l.quantity * l.product.costPrice;
    const k = String(l.productId);
    if (!byProduct[k]) byProduct[k] = { name: l.product.name, qty: 0, revenue: 0, cost: 0 };
    byProduct[k].qty     += l.quantity;
    byProduct[k].revenue += l.quantity * l.unitPrice;
    byProduct[k].cost    += l.quantity * l.product.costPrice;
  }

  // 3. Chi phí nguyên liệu nhập kho trong kỳ (từ StockReceipt)
  const receipts = await db.stockReceipt.findMany({
    where: { ...sw, receivedAt: { gte: from, lte: to } },
    include: { item: { select: { unitCostPrice: true } } },
  });
  const totalIngredientCost = receipts.reduce((s, r) => {
    const price = r.unitPrice ?? r.item.unitCostPrice;
    return s + r.qty * price;
  }, 0);

  // Lợi nhuận gộp = Doanh thu - Giá vốn SP
  const grossProfit = totalRevenue - totalProductCost;

  // Theo ngày
  const byDay: Record<string, { revenue: number; cost: number; profit: number }> = {};
  for (const { p, net } of netAmounts) {
    const d = bizYmd(p.paymentTime);
    if (!byDay[d]) byDay[d] = { revenue: 0, cost: 0, profit: 0 };
    byDay[d].revenue += net;
  }
  for (const l of orderLines) {
    const d = bizYmd(l.order.createdAt);
    if (!byDay[d]) byDay[d] = { revenue: 0, cost: 0, profit: 0 };
    byDay[d].cost += l.quantity * l.product.costPrice;
  }
  for (const d of Object.values(byDay)) d.profit = d.revenue - d.cost;

  return {
    totalRevenue,
    totalProductCost,
    totalIngredientCost,
    grossProfit,
    byDay,
    byProduct: Object.values(byProduct).sort((a, b) => b.revenue - a.revenue).slice(0, 20),
  };
}

/** Kênh bán của đơn: tại quán / mang đi / giao hàng */
export const channelOf = (t: string) => (t === "Delivery" ? "ship" : t.toLowerCase().includes("take") ? "take" : "dine");
export const CHANNEL_LABEL = { dine: "Tại quán", take: "Mang đi", ship: "Giao hàng" } as const;

/**
 * Số liệu gộp cho Bảng điều khiển (GET /reports/dashboard):
 *  - summary: doanh số (đơn không hủy, trừ phí ship), công nợ (đơn chưa thanh toán), số đơn, số đơn hủy
 *  - series: theo giờ (khi xem 1 ngày) hoặc theo ngày — doanh số, thực thu, đơn tạo, đơn hủy (giờ quán)
 *  - channels: doanh số theo kênh tại quán / mang đi / giao hàng
 */
export async function dashboardReport(db: PrismaClient, sw: StoreFilter, fromYmd: string, toYmd: string) {
  const days = daysInRange(fromYmd, toYmd);
  const orders = await db.order.findMany({
    where: { ...sw, createdAt: { gte: bizDayStart(fromYmd), lte: bizDayEnd(toYmd) } },
    select: { createdAt: true, status: true, orderType: true, totalAmount: true, shippingFee: true, payments: { select: { method: true, amount: true } } },
  });

  const byHour = days === 1;
  type Bucket = { key: string; sales: number; cash: number; created: number; cancelled: number };
  const buckets = new Map<string, Bucket>();
  const blank = (key: string): Bucket => ({ key, sales: 0, cash: 0, created: 0, cancelled: 0 });
  if (byHour) {
    const hours = orders.map((o) => bizHour(o.createdAt));
    for (let h = Math.min(6, ...hours); h <= Math.max(22, ...hours); h++) buckets.set(String(h), blank(String(h)));
  } else {
    for (let i = 0; i < days; i++) {
      const k = addDaysYmd(fromYmd, i);
      buckets.set(k, blank(k));
    }
  }

  const channels: Record<"dine" | "take" | "ship", number> = { dine: 0, take: 0, ship: 0 };
  const summary = { sales: 0, debt: 0, orders: 0, cancelled: 0 };
  for (const o of orders) {
    const b = buckets.get(byHour ? String(bizHour(o.createdAt)) : bizYmd(o.createdAt));
    if (b) b.created += 1;
    if (o.status === "Cancelled") {
      summary.cancelled += 1;
      if (b) b.cancelled += 1;
      continue;
    }
    // Phí ship là tiền của shipper — không tính doanh số quán
    const net = o.totalAmount - o.shippingFee;
    summary.sales += net;
    summary.orders += 1;
    channels[channelOf(o.orderType)] += net;
    if (o.status !== "Paid") summary.debt += net;
    else if (b) b.cash += Math.max(0, o.payments.filter((p) => p.method !== "Points").reduce((s, p) => s + p.amount, 0) - o.shippingFee);
    if (b) b.sales += net;
  }

  return {
    granularity: byHour ? "hour" : "day",
    summary,
    series: [...buckets.values()],
    channels: [
      { id: "dine", label: CHANNEL_LABEL.dine, value: channels.dine },
      { id: "take", label: CHANNEL_LABEL.take, value: channels.take },
      { id: "ship", label: CHANNEL_LABEL.ship, value: channels.ship },
    ],
  };
}

/** So sánh các chi nhánh: doanh thu thực thu, số đơn, giá trị đơn TB, lợi nhuận gộp (GET /reports/stores-compare) */
export async function storesCompareReport(db: PrismaClient, from: Date, to: Date, storeIds?: number[]) {
  const only = storeIds ? { storeId: { in: storeIds } } : {};
  const [stores, payments, orders, lines] = await Promise.all([
    db.store.findMany({ where: storeIds ? { id: { in: storeIds } } : {}, orderBy: { id: "asc" }, select: { id: true, code: true, name: true, isActive: true } }),
    db.payment.findMany({
      where: { paymentTime: { gte: from, lte: to }, method: { not: "Points" }, order: { ...only, status: "Paid" } },
      select: { amount: true, order: { select: { id: true, storeId: true, shippingFee: true } } },
    }),
    db.order.groupBy({
      by: ["storeId"],
      where: { ...only, status: "Paid", createdAt: { gte: from, lte: to } },
      _count: { _all: true },
      _sum: { totalAmount: true, shippingFee: true },
    }),
    db.orderDetail.findMany({
      where: { order: { ...only, status: "Paid", createdAt: { gte: from, lte: to } } },
      select: { quantity: true, product: { select: { costPrice: true } }, order: { select: { storeId: true } } },
    }),
  ]);

  // Doanh thu quán không gồm phí ship (thu hộ, trả cho shipper qua lương) — trừ 1 lần mỗi đơn
  const revenue = new Map<number, number>();
  const shipDeducted = new Set<number>();
  for (const p of payments) {
    let amt = p.amount;
    if (p.amount > 0 && p.order.shippingFee > 0 && !shipDeducted.has(p.order.id)) {
      shipDeducted.add(p.order.id);
      amt -= p.order.shippingFee;
    }
    revenue.set(p.order.storeId, (revenue.get(p.order.storeId) ?? 0) + amt);
  }
  const cost = new Map<number, number>();
  for (const l of lines) cost.set(l.order.storeId, (cost.get(l.order.storeId) ?? 0) + l.quantity * l.product.costPrice);

  const rows = stores.map((s) => {
    const o = orders.find((x) => x.storeId === s.id);
    const orderCount = o?._count._all ?? 0;
    const rev = revenue.get(s.id) ?? 0;
    return {
      ...s,
      revenue: rev,
      orders: orderCount,
      avgOrderValue: orderCount ? Math.round(((o?._sum.totalAmount ?? 0) - (o?._sum.shippingFee ?? 0)) / orderCount) : 0,
      grossProfit: rev - (cost.get(s.id) ?? 0),
    };
  });

  return {
    stores: rows,
    total: {
      revenue: rows.reduce((s, r) => s + r.revenue, 0),
      orders: rows.reduce((s, r) => s + r.orders, 0),
      grossProfit: rows.reduce((s, r) => s + r.grossProfit, 0),
    },
  };
}
