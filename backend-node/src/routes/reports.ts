import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { attachStaff, requireRoles } from "../middleware/staff.js";
import { storeWhere } from "../lib/storeScope.js";

const prisma = new PrismaClient();

function vnd(n: number) { return n.toLocaleString("vi-VN") + "đ"; }

export function reportsRouter() {
  const r = Router();
  const auth = attachStaff(prisma);
  const admin = [auth, requireRoles("Admin")];

  /**
   * GET /api/admin/reports/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD
   * Doanh thu tổng hợp + theo ngày
   */
  r.get("/reports/revenue", ...admin, async (req, res) => {
    const fromStr = req.query.from as string | undefined;
    const toStr   = req.query.to   as string | undefined;
    const from = fromStr ? new Date(fromStr) : (() => { const d = new Date(); d.setDate(d.getDate() - 29); d.setHours(0,0,0,0); return d; })();
    const to   = toStr   ? new Date(toStr)   : new Date();
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);

    const payments = await prisma.payment.findMany({
      where: { paymentTime: { gte: from, lte: to }, order: { ...storeWhere(req), status: "Paid" } },
      include: { order: { select: { id: true, status: true, shippingFee: true } } },
    });

    // Tách riêng: tiền thật vs. điểm đổi
    const cashPayments = payments.filter(p => p.method !== "Points");
    const pointsPayments = payments.filter(p => p.method === "Points");

    // Phí ship khách trả cùng đơn là tiền của shipper (cộng vào lương) — không tính doanh thu quán
    const shipOf = new Map(payments.map(p => [p.order.id, p.order.shippingFee]));
    const shippingFee = [...shipOf.values()].reduce((s, v) => s + v, 0);
    const total = cashPayments.reduce((s, p) => s + p.amount, 0) - shippingFee;
    const pointsRedeemTotal = pointsPayments.reduce((s, p) => s + p.amount, 0);

    const byDay: Record<string, { cash: number; points: number }> = {};
    const shipCounted = new Set<number>();
    for (const p of payments) {
      const d = p.paymentTime.toISOString().slice(0, 10);
      if (!byDay[d]) byDay[d] = { cash: 0, points: 0 };
      if (p.method !== "Points") {
        byDay[d].cash += p.amount;
        if (!shipCounted.has(p.order.id)) {
          shipCounted.add(p.order.id);
          byDay[d].cash -= p.order.shippingFee;
        }
      } else byDay[d].points += p.amount;
    }
    // Theo phương thức thanh toán (tiền mặt / chuyển khoản / thẻ / online…)
    const byMethod: Record<string, number> = {};
    for (const p of cashPayments) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;

    res.json({
      total,               // tiền thực thu (không bao gồm điểm)
      pointsRedeemTotal,   // tổng điểm đổi (chi phí loyalty)
      grandTotal: total + pointsRedeemTotal, // doanh thu gộp
      shippingFee,         // phí ship thu hộ shipper (không tính doanh thu)
      byMethod,
      byDay,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    });

  });

  /**
   * GET /api/admin/reports/orders?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&limit=50
   * Danh sách đơn hàng chi tiết (cho báo cáo doanh thu đầy đủ)
   */
  r.get("/reports/orders", ...admin, async (req, res) => {
    const fromStr = req.query.from as string | undefined;
    const toStr   = req.query.to   as string | undefined;
    const page  = Math.max(1, Number(req.query.page)  || 1);
    const limit = Math.min(500, Number(req.query.limit) || 50);
    const from = fromStr ? new Date(fromStr) : (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
    const to   = toStr   ? new Date(toStr)   : new Date();
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);

    const [total, orders] = await Promise.all([
      prisma.order.count({ where: { ...storeWhere(req), createdAt: { gte: from, lte: to } } }),
      prisma.order.findMany({
        where: { ...storeWhere(req), createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          store:   { select: { name: true } },
          staff:   { select: { fullName: true, username: true } },
          table:   { select: { name: true } },
          details: { include: { product: { select: { name: true } } } },
          payments: { select: { method: true, amount: true } },
        },
      }),
    ]);

    res.json({ total, page, limit, orders });
  });

  /**
   * GET /api/admin/reports/orders/export?from=&to=
   * Xuất CSV toàn bộ đơn hàng
   */
  r.get("/reports/orders/export", ...admin, async (req, res) => {
    const fromStr = req.query.from as string | undefined;
    const toStr   = req.query.to   as string | undefined;
    const from = fromStr ? new Date(fromStr) : (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
    const to   = toStr   ? new Date(toStr)   : new Date();
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);

    const orders = await prisma.order.findMany({
      where: { ...storeWhere(req), createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: "desc" },
      take: 5000,
      include: {
        store:    { select: { name: true } },
        staff:    { select: { fullName: true, username: true } },
        table:    { select: { name: true } },
        customer: { select: { fullName: true, phone: true } },
        details:  { include: { product: { select: { name: true } } } },
        payments: { select: { method: true, amount: true } },
      },
    });

    const esc = (s: string | null | undefined) => `"${String(s ?? "").replace(/"/g, '""')}"`;

    const header = [
      "Mã ĐH", "Ngày giờ", "Chi nhánh", "Loại", "Bàn", "Nhân viên", "Khách hàng", "SĐT khách",
      "Danh sách món", "Tạm tính", "Giảm giá", "VAT", "Tổng tiền",
      "Phương thức TT", "Trạng thái",
    ].map(esc).join(",");

    const rows = orders.map(o => {
      const items = o.details.map(d => `${d.product.name} x${d.quantity}`).join("; ");
      const methods = o.payments.map(p => `${p.method}:${vnd(p.amount)}`).join("; ");
      return [
        o.id,
        new Date(o.createdAt).toLocaleString("vi-VN"),
        o.store.name,
        o.orderType,
        o.table?.name ?? "Mang về",
        o.staff?.fullName ?? "—",
        o.customer?.fullName ?? "Khách lẻ",
        o.customer?.phone ?? "—",
        items,
        o.subTotal,
        o.discountAmt,
        o.vatAmount,
        o.totalAmount,
        methods,
        o.status,
      ].map(v => esc(String(v))).join(",");
    });

    const csv = "\uFEFF" + [header, ...rows].join("\r\n"); // UTF-8 BOM for Excel
    const fname = `donhang_${from.toISOString().slice(0,10)}_${to.toISOString().slice(0,10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`);
    res.send(csv);
  });

  /**
   * GET /api/admin/reports/top-products?from=&to=&limit=15
   */
  r.get("/reports/top-products", ...admin, async (req, res) => {
    const fromStr = req.query.from as string | undefined;
    const toStr   = req.query.to   as string | undefined;
    const lim     = Math.min(50, Number(req.query.limit) || 15);
    const from = fromStr ? new Date(fromStr) : (() => { const d = new Date(); d.setDate(d.getDate() - 29); d.setHours(0,0,0,0); return d; })();
    const to   = toStr   ? new Date(toStr)   : new Date();
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);

    const lines = await prisma.orderDetail.findMany({
      where: { order: { ...storeWhere(req), status: "Paid", createdAt: { gte: from, lte: to } } },
      include: { product: { select: { name: true, sellPrice: true, costPrice: true } } },
    });

    const map: Record<string, { name: string; quantity: number; revenue: number; costPrice: number }> = {};
    for (const l of lines) {
      const key = String(l.productId);
      if (!map[key]) map[key] = { name: l.product.name, quantity: 0, revenue: 0, costPrice: l.product.costPrice };
      map[key].quantity += l.quantity;
      map[key].revenue  += l.quantity * l.unitPrice;
    }

    const items = Object.values(map)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, lim)
      .map(i => ({ ...i, profit: i.revenue - i.quantity * i.costPrice }));

    res.json({ items });
  });

  /**
   * GET /api/admin/reports/profit?from=&to=
   * Lợi nhuận: doanh thu - giá vốn sản phẩm - chi phí nguyên liệu
   */
  r.get("/reports/profit", ...admin, async (req, res) => {
    const fromStr = req.query.from as string | undefined;
    const toStr   = req.query.to   as string | undefined;
    const from = fromStr ? new Date(fromStr) : (() => { const d = new Date(); d.setDate(d.getDate() - 29); d.setHours(0,0,0,0); return d; })();
    const to   = toStr   ? new Date(toStr)   : new Date();
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);

    // 1. Doanh thu từ đơn đã thanh toán
    // Tiền thật (bỏ điểm đổi) trừ phí ship thu hộ shipper
    const payments = (await prisma.payment.findMany({
      where: { paymentTime: { gte: from, lte: to }, method: { not: "Points" }, order: { ...storeWhere(req), status: "Paid" } },
      include: { order: { select: { id: true, shippingFee: true } } },
    }));
    const shipSeen = new Set<number>();
    const netOf = (p: (typeof payments)[number]) => {
      if (shipSeen.has(p.order.id)) return p.amount;
      shipSeen.add(p.order.id);
      return p.amount - p.order.shippingFee;
    };
    const netAmounts = payments.map((p) => ({ p, net: netOf(p) }));
    const totalRevenue = netAmounts.reduce((s, x) => s + x.net, 0);

    // 2. Giá vốn từ chi tiết đơn × costPrice sản phẩm
    const orderLines = await prisma.orderDetail.findMany({
      where: { order: { ...storeWhere(req), status: "Paid", createdAt: { gte: from, lte: to } } },
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
    const receipts = await prisma.stockReceipt.findMany({
      where: { ...storeWhere(req), receivedAt: { gte: from, lte: to } },
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
      const d = p.paymentTime.toISOString().slice(0, 10);
      if (!byDay[d]) byDay[d] = { revenue: 0, cost: 0, profit: 0 };
      byDay[d].revenue += net;
    }
    for (const l of orderLines) {
      const d = l.order.createdAt.toISOString().slice(0, 10);
      if (!byDay[d]) byDay[d] = { revenue: 0, cost: 0, profit: 0 };
      byDay[d].cost += l.quantity * l.product.costPrice;
    }
    for (const d of Object.values(byDay)) d.profit = d.revenue - d.cost;

    res.json({
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      totalRevenue,
      totalProductCost,
      totalIngredientCost,
      grossProfit,
      byDay,
      byProduct: Object.values(byProduct).sort((a, b) => b.revenue - a.revenue).slice(0, 20),
    });
  });

  /**
   * GET /api/admin/reports/stores-compare?from=&to=
   * So sánh các chi nhánh (chỉ Chủ chuỗi): doanh thu thực thu, số đơn, giá trị đơn TB, lợi nhuận gộp.
   */
  r.get("/reports/stores-compare", auth, requireRoles("Owner"), async (req, res) => {
    const fromStr = req.query.from as string | undefined;
    const toStr   = req.query.to   as string | undefined;
    const from = fromStr ? new Date(fromStr) : (() => { const d = new Date(); d.setDate(d.getDate() - 29); d.setHours(0,0,0,0); return d; })();
    const to   = toStr   ? new Date(toStr)   : new Date();
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);

    const [stores, payments, orders, lines] = await Promise.all([
      prisma.store.findMany({ orderBy: { id: "asc" }, select: { id: true, code: true, name: true, isActive: true } }),
      prisma.payment.findMany({
        where: { paymentTime: { gte: from, lte: to }, method: { not: "Points" }, order: { status: "Paid" } },
        select: { amount: true, order: { select: { id: true, storeId: true, shippingFee: true } } },
      }),
      prisma.order.groupBy({
        by: ["storeId"],
        where: { status: "Paid", createdAt: { gte: from, lte: to } },
        _count: { _all: true },
        _sum: { totalAmount: true, shippingFee: true },
      }),
      prisma.orderDetail.findMany({
        where: { order: { status: "Paid", createdAt: { gte: from, lte: to } } },
        select: { quantity: true, product: { select: { costPrice: true } }, order: { select: { storeId: true } } },
      }),
    ]);

    // Doanh thu quán không gồm phí ship (thu hộ, trả cho shipper qua lương) — trừ 1 lần mỗi đơn
    const revenue = new Map<number, number>();
    const shipDeducted = new Set<number>();
    for (const p of payments) {
      let amt = p.amount;
      if (p.order.shippingFee > 0 && !shipDeducted.has(p.order.id)) {
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

    res.json({
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      stores: rows,
      total: {
        revenue: rows.reduce((s, r) => s + r.revenue, 0),
        orders: rows.reduce((s, r) => s + r.orders, 0),
        grossProfit: rows.reduce((s, r) => s + r.grossProfit, 0),
      },
    });
  });

  return r;
}
