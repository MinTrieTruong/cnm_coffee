/**
 * Hồ sơ khách hàng cho quản lý: thói quen (món hay uống, khung giờ, kênh), tần suất quay lại,
 * lịch sử mua / điểm, voucher, quà trúng, đánh giá.
 *
 * Phạm vi: đơn hàng theo chi nhánh của người xem (quản lý chi nhánh chỉ thấy đơn tại chi nhánh mình,
 * Chủ chuỗi xem toàn chuỗi hoặc chi nhánh đang chọn). Điểm, voucher, quà là của cả chuỗi.
 */
import { Router } from "express";
import type { Request } from "express";
import type { PrismaClient } from "@prisma/client";
import { attachStaff, requireRoles } from "../middleware/staff.js";
import { storeWhere } from "../lib/storeScope.js";
import { bizHour, bizYmd } from "../lib/bizTime.js";
import { RANK_LABELS } from "../lib/rank.js";
import { isOwner, type StaffRequest } from "../middleware/staff.js";
import { reqStoreId } from "../lib/storeScope.js";
import { addPoints } from "../lib/points.js";
import { audit } from "../lib/audit.js";

const DAY = 86_400_000;
/** Mốc hạng theo tổng chi tiêu tích luỹ (khớp lib/rank.ts) */
const RANK_STEPS = [
  { id: "Dong", min: 0 },
  { id: "Bac", min: 5_000_000 },
  { id: "Vang", min: 20_000_000 },
  { id: "KimCuong", min: 50_000_000 },
];

export type LifeStatus = "NONE" | "NEW" | "RETURNING" | "LOYAL" | "AT_RISK" | "LOST";

/**
 * Trạng thái khách theo lịch sử ghé:
 * - Đã rời: > 60 ngày không ghé · Sắp rời: lâu hơn 2 lần chu kỳ ghé quen thuộc (tối thiểu 14 ngày)
 * - Thân thiết: ≥ 5 đơn và có mua ở ≥ 3 trong 6 tháng gần nhất · Mới: 1 đơn · Quay lại: ≥ 2 đơn
 */
export function lifeStatus(visits: Date[], now = Date.now()): { status: LifeStatus; daysSince: number | null; avgGapDays: number | null; activeMonths6: number } {
  if (!visits.length) return { status: "NONE", daysSince: null, avgGapDays: null, activeMonths6: 0 };
  const sorted = [...visits].sort((a, b) => a.getTime() - b.getTime());
  const last = sorted[sorted.length - 1].getTime();
  const daysSince = Math.floor((now - last) / DAY);
  const avgGapDays = sorted.length > 1 ? Math.round(((last - sorted[0].getTime()) / DAY / (sorted.length - 1)) * 10) / 10 : null;
  const since6 = now - 183 * DAY;
  const activeMonths6 = new Set(sorted.filter((d) => d.getTime() >= since6).map((d) => bizYmd(d).slice(0, 7))).size;
  let status: LifeStatus;
  if (daysSince > 60) status = "LOST";
  else if (avgGapDays != null && daysSince > Math.max(2 * avgGapDays, 14)) status = "AT_RISK";
  else if (sorted.length >= 5 && activeMonths6 >= 3) status = "LOYAL";
  else if (sorted.length === 1) status = "NEW";
  else status = "RETURNING";
  return { status, daysSince, avgGapDays, activeMonths6 };
}

/** Thời điểm ghé của đơn: lúc thanh toán (thiếu thì lúc tạo) */
const visitAt = (o: { paidAt: Date | null; createdAt: Date }) => o.paidAt ?? o.createdAt;

/** Buổi trong ngày theo giờ quán */
const partOf = (h: number) => (h >= 6 && h < 11 ? 0 : h >= 11 && h < 14 ? 1 : h >= 14 && h < 18 ? 2 : 3);

/** Đường / đá từ ghi chú đồ uống ("Size M · Đá 100% · Đường 50%") */
function optionsOf(notes: string | null) {
  const sugar = /Đường (\d+)%/.exec(notes ?? "")?.[1];
  const ice = /Đá (\d+)%/.exec(notes ?? "")?.[1];
  return { sugar: sugar ? `${sugar}%` : null, ice: ice ? `${ice}%` : null };
}

/** Giá trị xuất hiện nhiều nhất (bỏ null) */
function mode(values: (string | null | undefined)[]) {
  const c = new Map<string, number>();
  for (const v of values) if (v) c.set(v, (c.get(v) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [k, v] of c) if (v > n) [best, n] = [k, v];
  return best;
}

export function customerInsightsRouter(prisma: PrismaClient) {
  const r = Router();
  const admin = [attachStaff(prisma), requireRoles("Admin")];
  const paidWhere = (req: Request, customerId: number) => ({ customerId, status: "Paid", ...storeWhere(req) });

  /** Số liệu cho danh sách khách: số đơn, tổng chi, lần mua gần nhất, trạng thái (theo phạm vi chi nhánh) */
  r.get("/customers/summary", ...admin, async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { customerId: { not: null }, status: "Paid", ...storeWhere(req) },
      select: { customerId: true, totalAmount: true, paidAt: true, createdAt: true },
    });
    const by = new Map<number, { total: number; visits: Date[] }>();
    for (const o of orders) {
      const row = by.get(o.customerId!) ?? { total: 0, visits: [] };
      row.total += o.totalAmount;
      row.visits.push(visitAt(o));
      by.set(o.customerId!, row);
    }
    const out: Record<number, { orderCount: number; totalSpent: number; lastOrderAt: Date; status: LifeStatus }> = {};
    for (const [id, v] of by) {
      out[id] = { orderCount: v.visits.length, totalSpent: v.total, lastOrderAt: new Date(Math.max(...v.visits.map((d) => d.getTime()))), status: lifeStatus(v.visits).status };
    }
    res.json(out);
  });

  /** Hồ sơ đầy đủ của 1 khách */
  r.get("/customers/:id/insights", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const customer = await prisma.customer.findUnique({
      where: { id },
      select: { id: true, fullName: true, phone: true, email: true, dob: true, gender: true, points: true, rankTier: true, createdAt: true, lastLogin: true, avatarUrl: true },
    });
    if (!customer) return res.status(404).json({ error: "Không tìm thấy khách hàng." });

    const [orders, lifetime, vouchers, tickets, plays, gifts, reviews] = await Promise.all([
      prisma.order.findMany({
        where: paidWhere(req, id),
        select: {
          id: true, orderType: true, totalAmount: true, paidAt: true, createdAt: true,
          store: { select: { name: true } },
          payments: { select: { method: true } },
          details: { select: { productId: true, quantity: true, size: true, temperature: true, customNotes: true, isGift: true, product: { select: { name: true, imageUrl: true } } } },
        },
      }),
      // Hạng tính theo chi tiêu cả chuỗi
      prisma.order.aggregate({ where: { customerId: id, status: "Paid" }, _sum: { totalAmount: true } }),
      prisma.userVoucher.findMany({
        where: { customerId: id },
        orderBy: { claimedAt: "desc" },
        select: { id: true, isUsed: true, usedAt: true, claimedAt: true, orderId: true, voucher: { select: { code: true, description: true, discountValue: true, minBillValue: true, endDate: true, isActive: true } } },
      }),
      prisma.gameTicket.count({ where: { customerId: id, status: "UNUSED", expiresAt: { gt: new Date() } } }),
      prisma.gamePlay.findMany({
        where: { customerId: id },
        orderBy: { playedAt: "desc" },
        take: 50,
        select: { id: true, playedAt: true, prizeLabel: true, prizeKind: true, campaign: { select: { name: true } } },
      }),
      prisma.giftClaim.findMany({
        where: { customerId: id },
        orderBy: { createdAt: "desc" },
        select: { id: true, code: true, status: true, expiresAt: true, deliveredAt: true, createdAt: true, product: { select: { name: true } }, giftItem: { select: { name: true } }, store: { select: { name: true } } },
      }),
      prisma.review.findMany({
        where: { customerId: id },
        orderBy: { createdAt: "desc" },
        select: { id: true, rating: true, comment: true, createdAt: true, hidden: true, adminReply: true, product: { select: { name: true } } },
      }),
    ]);

    // ── Tổng quan ──
    const visits = orders.map(visitAt);
    const life = lifeStatus(visits);
    const totalSpent = orders.reduce((s, o) => s + o.totalAmount, 0);
    const lifetimeSpend = lifetime._sum.totalAmount ?? 0;
    const tierIdx = Math.max(0, RANK_STEPS.findIndex((t) => t.id === customer.rankTier));
    const next = RANK_STEPS[tierIdx + 1] ?? null;
    let birthdayInDays: number | null = null;
    if (customer.dob) {
      const today = new Date(`${bizYmd(new Date())}T00:00:00Z`);
      const md = bizYmd(customer.dob).slice(5);
      let bd = new Date(`${today.getUTCFullYear()}-${md}T00:00:00Z`);
      if (bd < today) bd = new Date(`${today.getUTCFullYear() + 1}-${md}T00:00:00Z`);
      birthdayInDays = Math.round((bd.getTime() - today.getTime()) / DAY);
    }

    // ── Thói quen ──
    const items = new Map<number, { productId: number; name: string; imageUrl: string | null; qty: number; orders: Set<number>; sizes: (string | null)[]; temps: (string | null)[]; sugars: (string | null)[]; ices: (string | null)[] }>();
    const hours = Array(24).fill(0) as number[];
    const grid = Array.from({ length: 7 }, () => [0, 0, 0, 0]);
    const channels = new Map<string, number>();
    const stores = new Map<string, number>();
    const payments = new Map<string, number>();
    for (const o of orders) {
      const at = visitAt(o);
      const h = bizHour(at);
      hours[h]++;
      grid[new Date(`${bizYmd(at)}T00:00:00Z`).getUTCDay()][partOf(h)]++;
      channels.set(o.orderType, (channels.get(o.orderType) ?? 0) + 1);
      if (o.store) stores.set(o.store.name, (stores.get(o.store.name) ?? 0) + 1);
      const method = mode(o.payments.map((p) => p.method));
      if (method) payments.set(method, (payments.get(method) ?? 0) + 1);
      for (const d of o.details) {
        if (d.isGift) continue;
        const it = items.get(d.productId) ?? { productId: d.productId, name: d.product.name, imageUrl: d.product.imageUrl, qty: 0, orders: new Set<number>(), sizes: [], temps: [], sugars: [], ices: [] };
        it.qty += d.quantity;
        it.orders.add(o.id);
        const opt = optionsOf(d.customNotes);
        it.sizes.push(d.size);
        it.temps.push(d.temperature);
        it.sugars.push(opt.sugar);
        it.ices.push(opt.ice);
        items.set(d.productId, it);
      }
    }
    const topItems = [...items.values()]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8)
      .map((it) => ({
        productId: it.productId, name: it.name, imageUrl: it.imageUrl, qty: it.qty,
        orderShare: orders.length ? Math.round((it.orders.size / orders.length) * 100) : 0,
        size: mode(it.sizes), temperature: mode(it.temps), sugar: mode(it.sugars), ice: mode(it.ices),
      }));
    const toList = (m: Map<string, number>) => [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);

    // ── Voucher: đang có / đã dùng / hết hạn ──
    const now = new Date();
    const voucherRows = vouchers.map((v) => ({
      id: v.id, code: v.voucher.code, description: v.voucher.description, discountValue: v.voucher.discountValue, minBillValue: v.voucher.minBillValue,
      endDate: v.voucher.endDate, claimedAt: v.claimedAt, usedAt: v.usedAt, orderId: v.orderId,
      state: v.isUsed ? "USED" : v.voucher.endDate < now || !v.voucher.isActive ? "EXPIRED" : "ACTIVE",
    }));

    res.json({
      customer: { ...customer, rankLabel: RANK_LABELS[customer.rankTier] ?? customer.rankTier },
      overview: {
        orderCount: orders.length,
        totalSpent,
        avgOrder: orders.length ? Math.round(totalSpent / orders.length) : 0,
        firstAt: visits.length ? new Date(Math.min(...visits.map((d) => d.getTime()))) : null,
        lastAt: visits.length ? new Date(Math.max(...visits.map((d) => d.getTime()))) : null,
        ...life,
        lifetimeSpend,
        nextRank: next ? { id: next.id, label: RANK_LABELS[next.id], min: next.min, remaining: Math.max(0, next.min - lifetimeSpend) } : null,
        rankFloor: RANK_STEPS[tierIdx].min,
        birthdayInDays,
      },
      habits: { topItems, hours, weekdayParts: grid, channels: toList(channels), stores: toList(stores), payments: toList(payments) },
      vouchers: voucherRows,
      games: {
        ticketsUnused: tickets,
        plays: plays.map((p) => ({ id: p.id, playedAt: p.playedAt, prizeLabel: p.prizeLabel, prizeKind: p.prizeKind, campaign: p.campaign?.name ?? null })),
      },
      gifts: gifts.map((g) => ({
        id: g.id, code: g.code, name: g.product?.name ?? g.giftItem?.name ?? "Quà", store: g.store?.name ?? null,
        status: g.status === "WAITING" && g.expiresAt < now ? "EXPIRED" : g.status, expiresAt: g.expiresAt, deliveredAt: g.deliveredAt, createdAt: g.createdAt,
      })),
      reviews: reviews.map((v) => ({ id: v.id, rating: v.rating, comment: v.comment, createdAt: v.createdAt, hidden: v.hidden, adminReply: v.adminReply, product: v.product?.name ?? null })),
    });
  });

  /** Lịch sử mua (đơn đã thanh toán), phân trang; ?from=YYYY-MM-DD&to=YYYY-MM-DD */
  r.get("/customers/:id/orders", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = 15;
    const ymd = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const from = ymd(req.query.from);
    const to = ymd(req.query.to);
    const where = {
      ...paidWhere(req, id),
      ...(from || to
        ? { createdAt: { ...(from ? { gte: new Date(Date.parse(`${from}T00:00:00+07:00`)) } : {}), ...(to ? { lt: new Date(Date.parse(`${to}T00:00:00+07:00`) + DAY) } : {}) } }
        : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, orderType: true, subTotal: true, discountAmt: true, pointsUsed: true, pointsRedeemAmt: true, pointsEarned: true,
          shippingFee: true, totalAmount: true, voucherCode: true, paidAt: true, createdAt: true,
          store: { select: { name: true } },
          details: { select: { id: true, quantity: true, unitPrice: true, size: true, customNotes: true, isGift: true, product: { select: { name: true } } } },
        },
      }),
    ]);
    res.json({ total, page, limit, rows });
  });

  /** Lịch sử tích / tiêu điểm (cả chuỗi), phân trang, kèm số dư sau từng giao dịch */
  r.get("/customers/:id/points", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = 20;
    const customer = await prisma.customer.findUnique({ where: { id }, select: { points: true } });
    if (!customer) return res.status(404).json({ error: "Không tìm thấy khách hàng." });
    const [total, rows, newer] = await Promise.all([
      prisma.pointTransaction.count({ where: { customerId: id } }),
      prisma.pointTransaction.findMany({ where: { customerId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit }),
      // Tổng biến động của các giao dịch mới hơn trang này → suy ra số dư sau từng dòng
      prisma.pointTransaction.findMany({ where: { customerId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: (page - 1) * limit, select: { delta: true } }),
    ]);
    let balance = customer.points - newer.reduce((s, t) => s + t.delta, 0);
    const out = rows.map((t) => {
      const row = { id: t.id, createdAt: t.createdAt, type: t.type, delta: t.delta, note: t.note, orderId: t.orderId, balanceAfter: balance };
      balance -= t.delta;
      return row;
    });
    res.json({ total, page, limit, balance: customer.points, rows: out });
  });

  /* ───────────── Thao tác chăm sóc: tặng voucher · điều chỉnh điểm · nhắn khách ─────────────
     Mỗi thao tác gửi 1 tin vào Hộp thư của khách và ghi nhật ký (cột "Lịch sử" trên hồ sơ khách). */
  const MAX_ADJUST = 100_000;

  /** Voucher cá nhân còn hiệu lực mà người xem được tặng (Chủ chuỗi: tất cả; quản lý: toàn chuỗi + chi nhánh mình) */
  async function giftableVouchers(req: Request) {
    const me = (req as StaffRequest).staffRow!;
    const now = new Date();
    const rows = await prisma.voucher.findMany({
      where: {
        voucherType: "personal", isActive: true, endDate: { gt: now },
        ...(isOwner(me.role) ? {} : { OR: [{ stores: { none: {} } }, { stores: { some: { storeId: me.storeId ?? -1 } } }] }),
      },
      orderBy: { endDate: "asc" },
      select: { id: true, code: true, description: true, discountValue: true, minBillValue: true, endDate: true, quantity: true, usedCount: true, _count: { select: { userVouchers: true } } },
    });
    // Còn lượt phát: số ví đã giữ chưa vượt số lượng (-1 = không giới hạn)
    return rows.filter((v) => v.quantity === -1 || v._count.userVouchers < v.quantity);
  }

  r.get("/customers/:id/care/vouchers", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const owned = new Set((await prisma.userVoucher.findMany({ where: { customerId: id }, select: { voucherId: true } })).map((u) => u.voucherId));
    res.json((await giftableVouchers(req)).map(({ _count, ...v }) => ({ ...v, alreadyOwned: owned.has(v.id) })));
  });

  r.post("/customers/:id/care/voucher", ...admin, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    const { voucherId, note } = req.body as { voucherId?: number; note?: string };
    const customer = await prisma.customer.findUnique({ where: { id }, select: { id: true, fullName: true } });
    if (!customer) return res.status(404).json({ error: "Không tìm thấy khách hàng." });
    const v = (await giftableVouchers(req)).find((x) => x.id === Number(voucherId));
    if (!v) return res.status(400).json({ error: "Voucher không tặng được (hết hạn, hết lượt hoặc không thuộc chi nhánh)." });
    try {
      await prisma.userVoucher.create({ data: { customerId: id, voucherId: v.id } });
    } catch (e: any) {
      if (e.code === "P2002") return res.status(409).json({ error: "Khách đã có voucher này trong ví." });
      throw e;
    }
    const msg = (note ?? "").trim().slice(0, 500);
    await prisma.customerMessage.create({
      data: {
        customerId: id, kind: "VOUCHER", senderId: me.id, storeId: reqStoreId(req),
        title: `Bạn được tặng voucher ${v.code}`,
        body: `${v.description ?? `Giảm ${v.discountValue.toLocaleString("vi-VN")}đ`} · HSD ${v.endDate.toLocaleDateString("vi-VN")}. Đã có trong Ví voucher của bạn.${msg ? `\n${msg}` : ""}`,
      },
    });
    audit(me.id, "CUSTOMER_CARE_VOUCHER", `Customer #${id}`, `Tặng voucher ${v.code}${msg ? ` — ${msg}` : ""}`.slice(0, 500));
    res.json({ ok: true });
  });

  r.post("/customers/:id/care/points", ...admin, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    const delta = Math.trunc(Number((req.body as { delta?: number }).delta));
    const reason = String((req.body as { reason?: string }).reason ?? "").trim().slice(0, 200);
    if (!delta || Math.abs(delta) > MAX_ADJUST) return res.status(400).json({ error: `Số điểm từ 1 đến ${MAX_ADJUST.toLocaleString("vi-VN")} (cộng hoặc trừ).` });
    if (reason.length < 5) return res.status(400).json({ error: "Nhập lý do (tối thiểu 5 ký tự)." });
    try {
      await prisma.$transaction(async (tx) => {
        const c = await tx.customer.findUnique({ where: { id }, select: { points: true } });
        if (!c) throw Object.assign(new Error("Không tìm thấy khách hàng."), { status: 404 });
        if (c.points + delta < 0) throw Object.assign(new Error(`Khách chỉ có ${c.points.toLocaleString("vi-VN")} điểm, không trừ được ${Math.abs(delta).toLocaleString("vi-VN")}.`), { status: 400 });
        await addPoints(tx, { customerId: id, delta, type: "ADJUST", note: `${delta > 0 ? "Quán tặng" : "Điều chỉnh"}: ${reason}` });
        await tx.customerMessage.create({
          data: {
            customerId: id, kind: "POINTS", senderId: me.id, storeId: reqStoreId(req),
            title: delta > 0 ? `Bạn được cộng ${delta.toLocaleString("vi-VN")} điểm` : `Điều chỉnh trừ ${Math.abs(delta).toLocaleString("vi-VN")} điểm`,
            body: reason,
          },
        });
      });
    } catch (e: any) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      throw e;
    }
    audit(me.id, "CUSTOMER_CARE_POINTS", `Customer #${id}`, `${delta > 0 ? "+" : ""}${delta} điểm — ${reason}`);
    res.json({ ok: true });
  });

  r.post("/customers/:id/care/message", ...admin, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    const title = String((req.body as { title?: string }).title ?? "").trim().slice(0, 150);
    const body = String((req.body as { body?: string }).body ?? "").trim().slice(0, 1000);
    if (title.length < 3 || body.length < 3) return res.status(400).json({ error: "Nhập tiêu đề và nội dung." });
    if (!(await prisma.customer.findUnique({ where: { id }, select: { id: true } }))) return res.status(404).json({ error: "Không tìm thấy khách hàng." });
    await prisma.customerMessage.create({ data: { customerId: id, kind: "MESSAGE", senderId: me.id, storeId: reqStoreId(req), title, body } });
    audit(me.id, "CUSTOMER_CARE_MESSAGE", `Customer #${id}`, `Nhắn khách: ${title}`);
    res.json({ ok: true });
  });

  return r;
}
