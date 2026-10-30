/**
 * routes/promotions.ts — Ưu đãi số lượng (đợt sales)
 *
 * Chủ chuỗi:  GET/POST /admin/promotions · PUT/DELETE /admin/promotions/:id · PATCH /admin/promotions/:id/toggle
 *             GET /admin/promotions/stats?from=&to=
 * Khách:      GET  /promotions/active?store=&channel=        — chương trình đang chạy (trang Khuyến mãi)
 *             POST /promotions/preview { store, orderType, lines } — giỏ hàng: ưu đãi đang đạt + gợi ý bậc kế tiếp
 */
import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { attachStaff, requireRoles, type StaffRequest } from "../middleware/staff.js";
import { storeFromQuery } from "../lib/storeProducts.js";
import { bizRange } from "../lib/bizTime.js";
import { priceLines, type RawLine } from "../lib/menuPrice.js";
import { activePromotions, bestPromotion, channelOf, describeTier, nextTierHint, type Channel, type PromoLine } from "../lib/promotions.js";

type TierInput = {
  minQty?: number; minAmount?: number; percentOff?: number; maxDiscount?: number; amountOff?: number;
  freeShipping?: boolean; buyQty?: number; getQty?: number; giftProductId?: number | null; giftQty?: number;
};
type PromoInput = {
  name?: string; description?: string; isActive?: boolean; startAt?: string; endAt?: string;
  daysOfWeek?: number[]; startMin?: number | null; endMin?: number | null;
  dineIn?: boolean; takeaway?: boolean; delivery?: boolean;
  allStores?: boolean; storeIds?: number[];
  scope?: string; categoryIds?: number[]; productIds?: number[];
  allowVoucher?: boolean; tiers?: TierInput[];
};

const int = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : d);

export function promotionsRouter(prisma: PrismaClient) {
  const r = Router();
  const owner = [attachStaff(prisma), requireRoles("Owner")];
  const include = { tiers: { orderBy: { minQty: "asc" as const } }, stores: true, categories: true, products: true } as const;

  /** Kiểm tra & chuẩn hoá dữ liệu form → data cho Prisma (lỗi → string) */
  async function parse(b: PromoInput) {
    if (!b.name?.trim()) return "Đặt tên chương trình.";
    const startAt = new Date(String(b.startAt));
    const endAt = new Date(String(b.endAt));
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) return "Thời gian bắt đầu / kết thúc không hợp lệ.";
    if (!b.dineIn && !b.takeaway && !b.delivery) return "Chọn ít nhất 1 kênh bán.";
    const hasWindow = b.startMin != null && b.endMin != null;
    if (hasWindow && !(int(b.startMin) < int(b.endMin) && int(b.endMin) <= 1440)) return "Khung giờ không hợp lệ.";
    const scope = ["ALL", "DRINKS", "CATEGORIES", "PRODUCTS"].includes(String(b.scope)) ? String(b.scope) : "DRINKS";
    if (scope === "CATEGORIES" && !b.categoryIds?.length) return "Chọn danh mục được tính.";
    if (scope === "PRODUCTS" && !b.productIds?.length) return "Chọn món được tính.";
    // Mặc định toàn chuỗi; chỉ khi bỏ chọn toàn chuỗi mới cần danh sách chi nhánh
    if (b.allStores === false && !b.storeIds?.length) return "Chọn chi nhánh áp dụng.";
    if (!b.tiers?.length) return "Thêm ít nhất 1 bậc ưu đãi.";
    const tiers = [];
    for (const t of b.tiers) {
      const tier = {
        minQty: int(t.minQty), minAmount: int(t.minAmount), percentOff: Math.min(100, int(t.percentOff)), maxDiscount: int(t.maxDiscount),
        amountOff: int(t.amountOff), freeShipping: !!t.freeShipping, buyQty: int(t.buyQty), getQty: int(t.getQty),
        giftProductId: t.giftProductId ? Number(t.giftProductId) : null, giftQty: t.giftProductId ? Math.max(1, int(t.giftQty, 1)) : 0,
      };
      if (tier.minQty < 1) return "Mỗi bậc cần số ly tối thiểu ≥ 1.";
      if ((tier.buyQty > 0) !== (tier.getQty > 0)) return "Mua X tặng Y: nhập đủ cả X và Y.";
      if (tier.buyQty > 0 && tier.minQty < tier.buyQty + tier.getQty) tier.minQty = tier.buyQty + tier.getQty;
      if (!tier.percentOff && !tier.amountOff && !tier.freeShipping && !tier.getQty && !tier.giftProductId) return `Bậc từ ${tier.minQty} ly chưa có ưu đãi nào.`;
      if (tier.giftProductId && !(await prisma.product.findUnique({ where: { id: tier.giftProductId } }))) return "Món tặng không tồn tại.";
      tiers.push(tier);
    }
    if (new Set(tiers.map((t) => `${t.minQty}|${t.minAmount}`)).size !== tiers.length) return "Hai bậc trùng điều kiện.";
    return {
      data: {
        name: b.name.trim().slice(0, 150), description: b.description?.trim().slice(0, 500) || null, isActive: b.isActive ?? true,
        startAt, endAt,
        daysOfWeek: b.daysOfWeek?.length && b.daysOfWeek.length < 7 ? [...new Set(b.daysOfWeek.map(Number))].filter((d) => d >= 0 && d <= 6).sort().join(",") : null,
        startMin: hasWindow ? int(b.startMin) : null, endMin: hasWindow ? int(b.endMin) : null,
        dineIn: !!b.dineIn, takeaway: !!b.takeaway, delivery: !!b.delivery,
        allStores: b.allStores !== false, scope, allowVoucher: !!b.allowVoucher,
      },
      tiers,
      storeIds: b.allStores !== false ? [] : [...new Set(b.storeIds!.map(Number))],
      categoryIds: scope === "CATEGORIES" ? [...new Set(b.categoryIds!.map(Number))] : [],
      productIds: scope === "PRODUCTS" ? [...new Set(b.productIds!.map(Number))] : [],
    };
  }

  const nested = (p: Exclude<Awaited<ReturnType<typeof parse>>, string>) => ({
    tiers: { create: p.tiers },
    stores: { create: p.storeIds.map((storeId) => ({ storeId })) },
    categories: { create: p.categoryIds.map((categoryId) => ({ categoryId })) },
    products: { create: p.productIds.map((productId) => ({ productId })) },
  });

  r.get("/admin/promotions", ...owner, async (_req, res) => {
    res.json(await prisma.bulkPromotion.findMany({ include, orderBy: [{ isActive: "desc" }, { startAt: "desc" }] }));
  });

  r.post("/admin/promotions", ...owner, async (req, res) => {
    const p = await parse(req.body as PromoInput);
    if (typeof p === "string") return res.status(400).json({ error: p });
    const row = await prisma.bulkPromotion.create({ data: { ...p.data, createdById: (req as StaffRequest).staffRow!.id, ...nested(p) }, include });
    res.status(201).json(row);
  });

  r.put("/admin/promotions/:id", ...owner, async (req, res) => {
    const id = Number(req.params.id);
    if (!(await prisma.bulkPromotion.findUnique({ where: { id } }))) return res.status(404).json({ error: "Không tìm thấy chương trình." });
    const p = await parse(req.body as PromoInput);
    if (typeof p === "string") return res.status(400).json({ error: p });
    const row = await prisma.$transaction(async (tx) => {
      await tx.bulkPromotionTier.deleteMany({ where: { promoId: id } });
      await tx.bulkPromotionStore.deleteMany({ where: { promoId: id } });
      await tx.bulkPromotionCategory.deleteMany({ where: { promoId: id } });
      await tx.bulkPromotionProduct.deleteMany({ where: { promoId: id } });
      return tx.bulkPromotion.update({ where: { id }, data: { ...p.data, ...nested(p) }, include });
    });
    res.json(row);
  });

  r.patch("/admin/promotions/:id/toggle", ...owner, async (req, res) => {
    const cur = await prisma.bulkPromotion.findUnique({ where: { id: Number(req.params.id) } });
    if (!cur) return res.status(404).json({ error: "Không tìm thấy chương trình." });
    res.json(await prisma.bulkPromotion.update({ where: { id: cur.id }, data: { isActive: !cur.isActive }, include }));
  });

  r.delete("/admin/promotions/:id", ...owner, async (req, res) => {
    const id = Number(req.params.id);
    // Đã áp cho đơn: giữ lại để còn báo cáo — chỉ cho tắt
    if (await prisma.order.count({ where: { promoId: id } })) return res.status(400).json({ error: "Chương trình đã áp cho đơn — hãy tắt thay vì xoá để giữ báo cáo." });
    await prisma.bulkPromotion.delete({ where: { id } });
    res.json({ ok: true });
  });

  /** Báo cáo theo chương trình (đơn đã thanh toán): số đơn, ly, doanh thu, tiền giảm, ship quán chịu, quà tặng, ly / đơn so với đơn thường */
  r.get("/admin/promotions/stats", ...owner, async (req, res) => {
    const { from, to, fromYmd, toYmd } = bizRange(req.query.from as string | undefined, req.query.to as string | undefined, 29);
    const store = (req as StaffRequest).storeId;
    const where = { status: "Paid", createdAt: { gte: from, lte: to }, ...(store != null ? { storeId: store } : {}) };
    const [promos, withPromo, cups] = await Promise.all([
      prisma.bulkPromotion.findMany({ select: { id: true, name: true, isActive: true, startAt: true, endAt: true } }),
      prisma.order.groupBy({
        by: ["promoId"], where: { ...where, promoId: { not: null } },
        _count: { _all: true }, _sum: { totalAmount: true, promoDiscount: true, shippingDiscount: true, giftValue: true, promoQty: true },
      }),
      // Ly / đơn của đơn KHÔNG có ưu đãi trong cùng kỳ (để so sánh)
      prisma.orderDetail.aggregate({ where: { order: { ...where, promoId: null }, isGift: false, comboId: null }, _sum: { quantity: true } }),
    ]);
    const plainOrders = await prisma.order.count({ where: { ...where, promoId: null } });
    const rows = promos.map((p) => {
      const g = withPromo.find((x) => x.promoId === p.id);
      const orders = g?._count._all ?? 0;
      return {
        ...p,
        orders,
        cups: g?._sum.promoQty ?? 0,
        revenue: g?._sum.totalAmount ?? 0,
        discount: g?._sum.promoDiscount ?? 0,
        shippingDiscount: g?._sum.shippingDiscount ?? 0,
        giftValue: g?._sum.giftValue ?? 0,
        cupsPerOrder: orders ? Math.round(((g?._sum.promoQty ?? 0) / orders) * 10) / 10 : 0,
      };
    }).sort((a, b) => b.orders - a.orders);
    res.json({ from: fromYmd, to: toYmd, rows, baseline: { orders: plainOrders, cupsPerOrder: plainOrders ? Math.round(((cups._sum.quantity ?? 0) / plainOrders) * 10) / 10 : 0 } });
  });

  /* ─────────── Khách ─────────── */

  r.get("/promotions/active", async (req, res) => {
    const storeId = storeFromQuery(req.query.store);
    const channels: Channel[] = ["dineIn", "takeaway", "delivery"].includes(String(req.query.channel)) ? [req.query.channel as Channel] : ["dineIn", "takeaway", "delivery"];
    const stores = storeId ? [storeId] : (await prisma.store.findMany({ where: { isActive: true }, select: { id: true } })).map((s) => s.id);
    const seen = new Map<number, Awaited<ReturnType<typeof activePromotions>>[number]>();
    for (const s of stores) for (const c of channels) for (const p of await activePromotions(prisma, { storeId: s, channel: c })) seen.set(p.id, p);
    const giftIds = [...new Set([...seen.values()].flatMap((p) => p.tiers.map((t) => t.giftProductId).filter((x): x is number => x != null)))];
    const gifts = new Map((await prisma.product.findMany({ where: { id: { in: giftIds } }, select: { id: true, name: true } })).map((g) => [g.id, g.name]));
    res.json([...seen.values()].map((p) => ({
      id: p.id, name: p.name, description: p.description, endAt: p.endAt, scope: p.scope,
      dineIn: p.dineIn, takeaway: p.takeaway, delivery: p.delivery, allowVoucher: p.allowVoucher,
      startMin: p.startMin, endMin: p.endMin, daysOfWeek: p.daysOfWeek,
      tiers: [...p.tiers].sort((a, b) => a.minQty - b.minQty).map((t) => ({ minQty: t.minQty, minAmount: t.minAmount, text: describeTier(t, t.giftProductId ? gifts.get(t.giftProductId) : null) })),
    })));
  });

  r.post("/promotions/preview", async (req, res) => {
    const { store, orderType, lines } = (req.body ?? {}) as { store?: number; orderType?: string; lines?: RawLine[] };
    const storeId = storeFromQuery(store);
    if (!storeId || !lines?.length) return res.json({ applied: null, next: null });
    const priced = await priceLines(prisma, storeId, lines);
    if ("error" in priced) return res.json({ applied: null, next: null });
    const products = new Map((await prisma.product.findMany({ where: { id: { in: priced.lines.map((l) => l.productId) } }, select: { id: true, categoryId: true, hasSizes: true } })).map((p) => [p.id, p]));
    const promoLines: PromoLine[] = priced.lines.map((l) => ({ ...l, categoryId: products.get(l.productId)!.categoryId, hasSizes: products.get(l.productId)!.hasSizes }));
    const channel = channelOf(orderType ?? "Dine-in");
    const { best, promos } = await bestPromotion(prisma, { storeId, channel, lines: promoLines, shippingFee: 0 });
    const giftName = async (id: number | null) => (id ? (await prisma.product.findUnique({ where: { id }, select: { name: true } }))?.name ?? null : null);
    // Gợi ý bậc kế tiếp: bỏ bậc thấp hơn hoặc bằng bậc đang đạt của cùng chương trình
    const next = nextTierHint(promos.map((p) => (best && p.id === best.promoId ? { ...p, tiers: p.tiers.filter((t) => t.minQty > best.tier.minQty) } : p)), promoLines);
    res.json({
      applied: best && { promoId: best.promoId, name: best.promoName, qty: best.qty, discount: best.discount, freeShipping: best.tier.freeShipping, text: describeTier(best.tier, await giftName(best.tier.giftProductId)), allowVoucher: best.allowVoucher },
      next: next && { name: next.promoName, needQty: next.needQty, text: describeTier(next.tier, await giftName(next.tier.giftProductId)) },
    });
  });

  return r;
}
