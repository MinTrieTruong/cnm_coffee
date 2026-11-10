import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { attachStaff, requireRoles } from "../middleware/staff.js";
import { storeWhere } from "../lib/storeScope.js";
import { bizRange, daysInRange } from "../lib/bizTime.js";
import { dashboardReport, profitReport, revenueReport, storesCompareReport, topProductsReport } from "../lib/analytics/sales.js";

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
    const { from, to, fromYmd, toYmd } = bizRange(fromStr, toStr, 29);

    res.json({ ...(await revenueReport(prisma, storeWhere(req), from, to)), from: fromYmd, to: toYmd });
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
    const { from, to, fromYmd, toYmd } = bizRange(fromStr, toStr, 0);

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
    const { from, to, fromYmd, toYmd } = bizRange(fromStr, toStr, 0);

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
    const fname = `donhang_${fromYmd}_${toYmd}.csv`;
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
    const { from, to, fromYmd, toYmd } = bizRange(fromStr, toStr, 29);

    res.json(await topProductsReport(prisma, storeWhere(req), from, to, lim));
  });

  /**
   * GET /api/admin/reports/profit?from=&to=
   * Lợi nhuận: doanh thu - giá vốn sản phẩm - chi phí nguyên liệu
   */
  r.get("/reports/profit", ...admin, async (req, res) => {
    const fromStr = req.query.from as string | undefined;
    const toStr   = req.query.to   as string | undefined;
    const { from, to, fromYmd, toYmd } = bizRange(fromStr, toStr, 29);

    res.json({ from: fromYmd, to: toYmd, ...(await profitReport(prisma, storeWhere(req), from, to)) });
  });

  /**
   * GET /api/admin/reports/dashboard?from=&to=
   * Số liệu gộp cho Bảng điều khiển (thay việc tải từng trang /reports/orders):
   *  - summary: doanh số (đơn không hủy, trừ phí ship), công nợ (đơn chưa thanh toán), số đơn, số đơn hủy
   *  - series: theo giờ (khi xem 1 ngày) hoặc theo ngày — doanh số, thực thu, đơn tạo, đơn hủy (giờ quán)
   *  - channels: doanh số theo kênh tại quán / mang đi / giao hàng
   */
  r.get("/reports/dashboard", ...admin, async (req, res) => {
    const { from, to, fromYmd, toYmd } = bizRange(req.query.from, req.query.to, 6);
    const days = daysInRange(fromYmd, toYmd);
    if (days > 370) return res.status(400).json({ error: "Khoảng ngày tối đa 1 năm." });

    res.json({ from: fromYmd, to: toYmd, ...(await dashboardReport(prisma, storeWhere(req), fromYmd, toYmd)) });
  });

  /**
   * GET /api/admin/reports/stores-compare?from=&to=
   * So sánh các chi nhánh (chỉ Chủ chuỗi): doanh thu thực thu, số đơn, giá trị đơn TB, lợi nhuận gộp.
   */
  r.get("/reports/stores-compare", auth, requireRoles("Owner"), async (req, res) => {
    const fromStr = req.query.from as string | undefined;
    const toStr   = req.query.to   as string | undefined;
    const { from, to, fromYmd, toYmd } = bizRange(fromStr, toStr, 29);

    res.json({ from: fromYmd, to: toYmd, ...(await storesCompareReport(prisma, from, to)) });
  });

  return r;
}
