/**
 * lib/promotions.ts — Ưu đãi số lượng (đợt sales, Chủ chuỗi tạo)
 *
 * Đơn chưa thanh toán → refreshOrderPromotion() tính lại mỗi khi món thay đổi và trước mọi bước tính tiền:
 *   1. Lọc chương trình đang chạy: thời gian, ngày trong tuần, khung giờ, kênh (tại bàn / mang về / giao), chi nhánh
 *   2. Đếm ly được tính: món lẻ thuộc phạm vi (không tính món trong combo, món tặng)
 *   3. Bậc cao nhất đạt được → thưởng (kết hợp được): mua X tặng Y (ly rẻ nhất 0đ) → giảm % (có trần) → giảm tiền,
 *      miễn ship, tặng món chỉ định (dòng 0đ, vẫn trừ kho)
 *   4. Nhiều chương trình cùng đạt → lấy chương trình có lợi nhất cho khách (không cộng dồn)
 * Kết quả ghi lên đơn: discountAmt = promoDiscount (voucher / điểm cộng thêm lúc thanh toán), shippingDiscount, dòng quà tặng.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { bizMinute, bizWeekday } from "./bizTime.js";
import { unsellableProductIds } from "./storeProducts.js";

type Db = PrismaClient | Prisma.TransactionClient;

export type Channel = "dineIn" | "takeaway" | "delivery";

export function channelOf(orderType: string): Channel {
  if (orderType === "Delivery") return "delivery";
  return orderType.toLowerCase().includes("take") ? "takeaway" : "dineIn";
}

export type PromoLine = {
  productId: number;
  categoryId: number;
  hasSizes: boolean;
  quantity: number;
  unitPrice: number;
  comboId: number | null;
  isGift?: boolean;
};

const promoInclude = { tiers: true, stores: true, categories: true, products: true } as const;
export type PromoFull = Prisma.BulkPromotionGetPayload<{ include: typeof promoInclude }>;
type Tier = PromoFull["tiers"][number];

/** Chương trình đang chạy cho chi nhánh + kênh tại thời điểm `at` */
export async function activePromotions(db: Db, opts: { storeId: number; channel: Channel; at?: Date }) {
  const at = opts.at ?? new Date();
  const rows = await db.bulkPromotion.findMany({
    where: { isActive: true, startAt: { lte: at }, endAt: { gte: at }, [opts.channel]: true },
    include: promoInclude,
  });
  const day = bizWeekday(at);
  const min = bizMinute(at);
  return rows.filter((p) => {
    if (!p.allStores && !p.stores.some((s) => s.storeId === opts.storeId)) return false;
    if (p.daysOfWeek?.trim() && !p.daysOfWeek.split(",").map(Number).includes(day)) return false;
    if (p.startMin != null && p.endMin != null && (min < p.startMin || min >= p.endMin)) return false;
    return p.tiers.length > 0;
  });
}

/** Món có được tính vào chương trình không */
export function inScope(p: Pick<PromoFull, "scope" | "categories" | "products">, l: Pick<PromoLine, "productId" | "categoryId" | "hasSizes">) {
  if (p.scope === "ALL") return true;
  if (p.scope === "DRINKS") return l.hasSizes;
  if (p.scope === "CATEGORIES") return p.categories.some((c) => c.categoryId === l.categoryId);
  return p.products.some((x) => x.productId === l.productId);
}

export type PromoResult = {
  promoId: number;
  promoName: string;
  allowVoucher: boolean;
  tier: Tier;
  qty: number;
  amount: number;
  discount: number;
  shippingDiscount: number;
  gifts: { productId: number; qty: number; value: number }[];
  /** Tổng lợi ích cho khách — dùng để chọn chương trình tốt nhất */
  value: number;
};

/** Đánh giá 1 chương trình trên các dòng món. giftPrice: giá bán món tặng nếu còn bán ở chi nhánh, null = bỏ quà */
export function evaluatePromotion(p: PromoFull, lines: PromoLine[], shippingFee: number, giftPrice: (productId: number) => number | null): PromoResult | null {
  const eligible = lines.filter((l) => !l.comboId && !l.isGift && l.quantity > 0 && inScope(p, l));
  const qty = eligible.reduce((s, l) => s + l.quantity, 0);
  const amount = eligible.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const tier = [...p.tiers].sort((a, b) => b.minQty - a.minQty || b.minAmount - a.minAmount).find((t) => qty >= t.minQty && amount >= t.minAmount);
  if (!tier) return null;

  // Mua X tặng Y: cứ mỗi (X + Y) ly, Y ly rẻ nhất được 0đ
  let freeDisc = 0;
  if (tier.buyQty > 0 && tier.getQty > 0) {
    const free = Math.floor(qty / (tier.buyQty + tier.getQty)) * tier.getQty;
    const units = eligible.flatMap((l) => Array<number>(l.quantity).fill(l.unitPrice)).sort((a, b) => a - b);
    freeDisc = units.slice(0, free).reduce((s, v) => s + v, 0);
  }
  const base = Math.max(0, amount - freeDisc);
  let pct = tier.percentOff > 0 ? Math.round((base * tier.percentOff) / 100) : 0;
  if (tier.maxDiscount > 0) pct = Math.min(pct, tier.maxDiscount);
  const off = Math.min(tier.amountOff, Math.max(0, base - pct));
  const discount = Math.min(amount, freeDisc + pct + off);
  const shippingDiscount = tier.freeShipping ? shippingFee : 0;
  const gifts: PromoResult["gifts"] = [];
  if (tier.giftProductId && tier.giftQty > 0) {
    const price = giftPrice(tier.giftProductId);
    if (price != null) gifts.push({ productId: tier.giftProductId, qty: tier.giftQty, value: price * tier.giftQty });
  }
  const giftValue = gifts.reduce((s, g) => s + g.value, 0);
  return { promoId: p.id, promoName: p.name, allowVoucher: p.allowVoucher, tier, qty, amount, discount, shippingDiscount, gifts, value: discount + shippingDiscount + giftValue };
}

/** Chương trình có lợi nhất cho khách (null = không chương trình nào đạt) */
export async function bestPromotion(db: Db, ctx: { storeId: number; channel: Channel; lines: PromoLine[]; shippingFee: number; at?: Date }) {
  const promos = await activePromotions(db, ctx);
  if (!promos.length) return { best: null as PromoResult | null, promos };
  const giftIds = [...new Set(promos.flatMap((p) => p.tiers.map((t) => t.giftProductId).filter((x): x is number => x != null)))];
  const giftRows = giftIds.length ? await db.product.findMany({ where: { id: { in: giftIds } }, select: { id: true, sellPrice: true, isActive: true, outOfStock: true } }) : [];
  const blocked = giftRows.length ? await unsellableProductIds(db as PrismaClient, ctx.storeId, giftRows) : new Set<number>();
  const giftPrice = (id: number) => {
    const g = giftRows.find((x) => x.id === id);
    return g && !blocked.has(id) ? g.sellPrice : null;
  };
  let best: PromoResult | null = null;
  for (const p of promos) {
    const r = evaluatePromotion(p, ctx.lines, ctx.shippingFee, giftPrice);
    if (r && (!best || r.value > best.value)) best = r;
  }
  return { best, promos };
}

/**
 * Bậc kế tiếp gần nhất khách có thể đạt (gợi ý "thêm N ly để được …").
 * Chỉ xét chương trình đang chạy; trả về chương trình cần ít ly thêm nhất.
 */
export function nextTierHint(promos: PromoFull[], lines: PromoLine[]) {
  let hint: { promoName: string; needQty: number; tier: Tier } | null = null;
  for (const p of promos) {
    const qty = lines.filter((l) => !l.comboId && !l.isGift && inScope(p, l)).reduce((s, l) => s + l.quantity, 0);
    for (const t of p.tiers) {
      const need = t.minQty - qty;
      if (need > 0 && (!hint || need < hint.needQty)) hint = { promoName: p.name, needQty: need, tier: t };
    }
  }
  return hint;
}

/** Mô tả ngắn phần thưởng của 1 bậc — hiển thị trên bill / giỏ hàng */
export function describeTier(t: Pick<Tier, "percentOff" | "maxDiscount" | "amountOff" | "freeShipping" | "buyQty" | "getQty" | "giftQty">, giftName?: string | null) {
  const parts: string[] = [];
  if (t.buyQty > 0 && t.getQty > 0) parts.push(`mua ${t.buyQty} tặng ${t.getQty}`);
  if (t.percentOff > 0) parts.push(`giảm ${t.percentOff}%${t.maxDiscount > 0 ? ` (tối đa ${t.maxDiscount.toLocaleString("vi-VN")}đ)` : ""}`);
  if (t.amountOff > 0) parts.push(`giảm ${t.amountOff.toLocaleString("vi-VN")}đ`);
  if (t.freeShipping) parts.push("miễn ship");
  if (t.giftQty > 0) parts.push(`tặng ${t.giftQty} ${giftName ?? "món"}`);
  return parts.join(" + ");
}

/**
 * Tính lại ưu đãi cho 1 đơn CHƯA thanh toán và ghi lên đơn (idempotent).
 * Đồng bộ dòng quà tặng: thêm phần còn thiếu, bỏ phần dư chưa làm (đã pha / đã làm thì giữ).
 */
export async function refreshOrderPromotion(db: Db, orderId: number) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { details: { include: { product: { select: { categoryId: true, hasSizes: true, name: true } } } }, payments: { select: { id: true } } },
  });
  if (!order || !["Pending_Grace", "Confirmed"].includes(order.status) || order.payments.length) return null;

  const lines: PromoLine[] = order.details.map((d) => ({
    productId: d.productId, categoryId: d.product.categoryId, hasSizes: d.product.hasSizes,
    quantity: d.quantity, unitPrice: d.unitPrice, comboId: d.comboId, isGift: d.isGift,
  }));
  const { best } = await bestPromotion(db, { storeId: order.storeId, channel: channelOf(order.orderType), lines, shippingFee: order.shippingFee, at: new Date() });

  // Đồng bộ dòng quà tặng
  const want = new Map((best?.gifts ?? []).map((g) => [g.productId, g.qty]));
  const giftLines = order.details.filter((d) => d.isGift);
  const removable = (k: string) => k === "Hold" || k === "Waiting";
  for (const d of giftLines) {
    const need = want.get(d.productId) ?? 0;
    if (need >= d.quantity) {
      want.set(d.productId, need - d.quantity);
      continue;
    }
    if (!removable(d.kdsStatus)) {
      // Đã pha / đã làm: giữ nguyên, coi như đã tặng
      want.set(d.productId, Math.max(0, need - d.quantity));
      continue;
    }
    if (need > 0) {
      await db.orderDetail.update({ where: { id: d.id }, data: { quantity: need } });
      want.set(d.productId, 0);
    } else {
      await db.orderDetail.delete({ where: { id: d.id } });
    }
  }
  const phase = order.details.some((d) => !d.isGift && d.kdsStatus === "Hold") || order.status === "Pending_Grace" ? "Hold" : "Waiting";
  for (const [productId, qty] of want) {
    if (qty <= 0) continue;
    await db.orderDetail.create({
      data: { orderId, productId, quantity: qty, unitPrice: 0, size: "M", isGift: true, customNotes: `[Quà tặng: ${best!.promoName}]`, kdsStatus: phase },
    });
  }

  const discount = best?.discount ?? 0;
  const shippingDiscount = best?.shippingDiscount ?? 0;
  await db.order.update({
    where: { id: orderId },
    data: {
      promoId: best?.promoId ?? null,
      promoDiscount: discount,
      promoQty: best?.qty ?? 0,
      giftValue: best ? best.gifts.reduce((s, g) => s + g.value, 0) : 0,
      shippingDiscount,
      // Trước khi thanh toán, discountAmt chỉ gồm ưu đãi số lượng (voucher / điểm cộng lúc thanh toán)
      discountAmt: discount,
      totalAmount: Math.max(0, order.subTotal - discount) + order.shippingFee - shippingDiscount,
    },
  });
  return best;
}

/** Phí ship khách thực trả (đã trừ phần quán miễn) */
export const customerShipping = (o: { shippingFee: number; shippingDiscount: number }) => Math.max(0, o.shippingFee - o.shippingDiscount);
