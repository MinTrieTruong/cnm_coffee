/**
 * routes/myStats.ts — Số liệu hôm nay của chính nhân viên (Bảng điều khiển)
 *
 * GET /staff/me/today
 *  - Thu ngân: đơn & tiền đã thu trong các ca của tôi (Payment.shiftId → Shift.staffId)
 *  - Phục vụ:  đơn bàn tôi mở (Order.staffId), số món, số bàn đã phục vụ
 *  - Pha chế:  hao hụt tôi ghi (WasteLog.staffId)
 *  - Mọi vai trò: số việc được giao hôm nay & đã xong
 * Hôm nay tính theo giờ quán (lib/bizTime).
 *
 * GET /staff/kitchen/stats?from=&to=&prevFrom=&prevTo=&staffId= — Thống kê pha chế của chi nhánh
 *  - Đếm các dòng món đã pha xong (KDS: Ready / Served) của đơn không huỷ, theo ngày tạo đơn
 *  - Tổng ly, số đơn, theo ngày (hoặc theo giờ nếu chỉ 1 ngày), giờ cao điểm, món pha nhiều nhất (kèm size)
 *  - Theo người pha (OrderDetail.madeById — người bấm "Xong" trên KDS): bảng xếp hạng + số ly của tôi;
 *    ?staffId= lọc mọi số liệu theo một người. Món cũ chưa ghi người pha tính vào "untracked"
 *  - Không có tiền: màn này cho pha chế xem
 */
import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { attachStaff, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { mustStoreId } from "../lib/storeScope.js";
import { bizDayEnd, bizDayStart, bizHour, bizRange, bizToday, bizYmd } from "../lib/bizTime.js";

/** Món đã pha xong trên KDS */
const MADE = ["Ready", "Served"];

export function myStatsRouter(prisma: PrismaClient) {
  const r = Router();

  r.get("/staff/me/today", attachStaff(prisma), requireStore, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const storeId = mustStoreId(req);
    const today = bizToday();
    const from = bizDayStart(today);
    const to = bizDayEnd(today);

    const [payments, orders, waste, tasks] = await Promise.all([
      me.role === "Cashier" || me.role === "Admin"
        ? prisma.payment.findMany({
            where: { paymentTime: { gte: from, lte: to }, method: { not: "Points" }, shift: { staffId: me.id }, order: { storeId } },
            select: { amount: true, orderId: true, order: { select: { shippingFee: true } } },
          })
        : Promise.resolve([]),
      me.role === "Waiter"
        ? prisma.order.findMany({
            where: { storeId, staffId: me.id, createdAt: { gte: from, lte: to }, status: { not: "Cancelled" } },
            select: { tableId: true, details: { select: { quantity: true } } },
          })
        : Promise.resolve([]),
      me.role === "Kitchen"
        ? prisma.wasteLog.aggregate({ where: { storeId, staffId: me.id, createdAt: { gte: from, lte: to } }, _count: { _all: true }, _sum: { costValue: true } })
        : Promise.resolve(null),
      prisma.workTaskAssignee.findMany({
        where: { staffId: me.id, task: { storeId, workDate: new Date(`${today}T00:00:00Z`) } },
        select: { status: true },
      }),
    ]);

    // Phí ship thu hộ shipper — trừ 1 lần mỗi đơn
    const shipSeen = new Set<number>();
    const collected = payments.reduce((s, p) => {
      const fee = shipSeen.has(p.orderId) ? 0 : p.order.shippingFee;
      shipSeen.add(p.orderId);
      return s + p.amount - fee;
    }, 0);

    res.json({
      date: today,
      cashier: me.role === "Cashier" || me.role === "Admin" ? { bills: new Set(payments.map((p) => p.orderId)).size, collected } : null,
      waiter:
        me.role === "Waiter"
          ? {
              orders: orders.length,
              items: orders.reduce((s, o) => s + o.details.reduce((a, d) => a + d.quantity, 0), 0),
              tables: new Set(orders.map((o) => o.tableId).filter((x) => x != null)).size,
            }
          : null,
      kitchen: waste ? { wasteCount: waste._count._all, wasteValue: waste._sum.costValue ?? 0 } : null,
      tasks: { total: tasks.length, done: tasks.filter((t) => t.status === "DONE").length },
    });
  });

  r.get("/staff/kitchen/stats", attachStaff(prisma), requireRoles("Kitchen", "Admin"), requireStore, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const storeId = mustStoreId(req);
    const { from, to, fromYmd, toYmd } = bizRange(req.query.from, req.query.to, 0);
    const staffId = Number(req.query.staffId) || null;
    const madeWhere = (gte: Date, lte: Date) => ({ kdsStatus: { in: MADE }, order: { storeId, status: { not: "Cancelled" }, createdAt: { gte, lte } } });

    const hasPrev = typeof req.query.prevFrom === "string" && typeof req.query.prevTo === "string";
    const prev = hasPrev ? bizRange(req.query.prevFrom, req.query.prevTo, 0) : null;
    const [all, prevSum] = await Promise.all([
      prisma.orderDetail.findMany({
        where: madeWhere(from, to),
        select: { orderId: true, productId: true, quantity: true, size: true, madeById: true, product: { select: { name: true } }, order: { select: { createdAt: true } } },
      }),
      prev
        ? prisma.orderDetail.aggregate({ where: { ...madeWhere(prev.from, prev.to), ...(staffId ? { madeById: staffId } : {}) }, _sum: { quantity: true } })
        : Promise.resolve(null),
    ]);
    // Bảng xếp hạng người pha luôn tính cả quầy; các số liệu còn lại theo người đang lọc (nếu có)
    const lines = staffId ? all.filter((l) => l.madeById === staffId) : all;

    const oneDay = fromYmd === toYmd;
    const byKey = new Map<string, number>();
    const byHour = new Array<number>(24).fill(0);
    const products = new Map<number, { name: string; quantity: number; sizes: Record<string, number> }>();
    for (const l of lines) {
      const at = l.order.createdAt;
      const h = bizHour(at);
      byHour[h] += l.quantity;
      const key = oneDay ? String(h) : bizYmd(at);
      byKey.set(key, (byKey.get(key) ?? 0) + l.quantity);
      const p = products.get(l.productId) ?? products.set(l.productId, { name: l.product.name, quantity: 0, sizes: {} }).get(l.productId)!;
      p.quantity += l.quantity;
      if (l.size) p.sizes[l.size] = (p.sizes[l.size] ?? 0) + l.quantity;
    }

    // Đủ mọi ngày / giờ (kể cả 0) để biểu đồ không bị hở
    const series: { key: string; cups: number }[] = [];
    if (oneDay) for (let h = 0; h < 24; h++) series.push({ key: String(h), cups: byKey.get(String(h)) ?? 0 });
    else for (let t = Date.parse(`${fromYmd}T00:00:00Z`); t <= Date.parse(`${toYmd}T00:00:00Z`); t += 86_400_000) {
      const k = new Date(t).toISOString().slice(0, 10);
      series.push({ key: k, cups: byKey.get(k) ?? 0 });
    }

    // Theo người pha
    const people = new Map<number, { cups: number; orders: Set<number> }>();
    let untracked = 0;
    for (const l of all) {
      if (l.madeById == null) { untracked += l.quantity; continue; }
      const p = people.get(l.madeById) ?? people.set(l.madeById, { cups: 0, orders: new Set() }).get(l.madeById)!;
      p.cups += l.quantity;
      p.orders.add(l.orderId);
    }
    // Danh sách để chọn lọc: pha chế của chi nhánh + ai đã từng bấm xong trong kỳ (VD quản lý pha phụ)
    const staffRows = await prisma.staff.findMany({
      where: { OR: [{ storeId, role: "Kitchen", status: "Active" }, { id: { in: [...people.keys()] } }] },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: "asc" },
    });
    const byStaff = staffRows
      .map((s) => ({ staffId: s.id, name: s.fullName, role: s.role, cups: people.get(s.id)?.cups ?? 0, orders: people.get(s.id)?.orders.size ?? 0 }))
      .sort((a, b) => b.cups - a.cups);

    const total = lines.reduce((s, l) => s + l.quantity, 0);
    const peakHour = total ? byHour.indexOf(Math.max(...byHour)) : null;
    const busiest = !oneDay && total ? series.reduce((a, b) => (b.cups > a.cups ? b : a)) : null;
    res.json({
      from: fromYmd,
      to: toYmd,
      byHour: oneDay,
      total,
      prevTotal: prevSum ? prevSum._sum.quantity ?? 0 : null,
      orders: new Set(lines.map((l) => l.orderId)).size,
      days: series.length && !oneDay ? series.length : 1,
      peakHour,
      busiestDay: busiest ? { date: busiest.key, cups: busiest.cups } : null,
      series,
      top: [...products.values()].sort((a, b) => b.quantity - a.quantity),
      staffId,
      byStaff,
      untracked,
      mine: people.get(me.id)?.cups ?? 0,
    });
  });

  return r;
}
