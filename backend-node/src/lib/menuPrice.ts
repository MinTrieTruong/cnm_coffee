import { randomUUID } from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { unsellableProductIds } from "./storeProducts.js";

export type Size = "S" | "M" | "L";
type Db = PrismaClient | Prisma.TransactionClient;
type PricedProduct = { sellPrice: number; priceSizeS: number | null; priceSizeL: number | null; discountPercent: number | null };

export const normalizeSize = (s: unknown): Size => (s === "S" || s === "L" ? s : "M");

/** Size thật của dòng: món chỉ 1 loại (bánh, đồ ăn — hasSizes = false) luôn là M, bỏ qua size trình duyệt gửi */
export const sizeFor = (p: { hasSizes: boolean }, s: unknown): Size => (p.hasSizes ? normalizeSize(s) : "M");

/**
 * Giá bán theo size — giống quy tắc trang đặt món & màn quản lý món:
 * S/L chưa đặt giá riêng thì S = M − 3.000đ, L = M + 5.000đ.
 */
export function sizePrice(p: PricedProduct, size: Size) {
  if (size === "S") return p.priceSizeS ?? Math.max(0, p.sellPrice - 3000);
  if (size === "L") return p.priceSizeL ?? p.sellPrice + 5000;
  return p.sellPrice;
}

/** Giá khách trả cho 1 ly: giá theo size rồi trừ % giảm giá của món (làm tròn như frontend) */
export function unitPriceOf(p: PricedProduct, size: Size) {
  const base = sizePrice(p, size);
  return p.discountPercent && p.discountPercent > 0 ? Math.round(base * (1 - p.discountPercent / 100)) : base;
}

export type RawLine = { productId?: number; quantity?: number; size?: unknown; customNotes?: string | null; comboId?: number | null };
export type PricedLine = {
  productId: number; quantity: number; unitPrice: number; size: Size; customNotes: string | null; comboId: number | null;
  /** Các dòng của cùng 1 lần mua combo chung mã — đếm số combo đã bán */
  comboRef: string | null; comboQty: number | null;
};

const MAX_QTY = 99;

/**
 * Tính giá phía máy chủ cho các dòng giỏ hàng — KHÔNG tin giá trình duyệt gửi lên.
 * - Món lẻ: giá theo size, trừ % giảm giá.
 * - Combo (comboId): tách thành các món bên trong (bếp thấy từng món, kho trừ đúng nguyên liệu),
 *   giá combo chia cho các món theo tỷ lệ giá gốc, tổng đúng bằng giá combo.
 * Món không bán ở chi nhánh / combo ngừng bán → báo lỗi.
 */
export async function priceLines(db: Db, storeId: number, raw: RawLine[]): Promise<{ lines: PricedLine[] } | { error: string }> {
  for (const l of raw) {
    if (!Number.isInteger(l.quantity) || (l.quantity as number) < 1 || (l.quantity as number) > MAX_QTY) {
      return { error: "Số lượng món không hợp lệ." };
    }
  }
  const comboIds = [...new Set(raw.filter((l) => l.comboId).map((l) => Number(l.comboId)))];
  const combos = comboIds.length
    ? await db.combo.findMany({ where: { id: { in: comboIds }, isActive: true }, include: { items: { orderBy: { id: "asc" } } } })
    : [];
  if (combos.length !== comboIds.length) return { error: "Combo không còn bán." };

  const productIds = [
    ...new Set([
      ...raw.filter((l) => !l.comboId).map((l) => Number(l.productId)),
      ...combos.flatMap((c) => c.items.map((i) => i.productId)),
    ]),
  ];
  if (productIds.some((id) => !Number.isInteger(id) || id <= 0)) return { error: "Món không hợp lệ." };
  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, isActive: true, outOfStock: true, sellPrice: true, priceSizeS: true, priceSizeL: true, discountPercent: true, hasSizes: true },
  });
  if (products.length !== productIds.length) return { error: "Một số món không còn phục vụ tại chi nhánh này." };
  const unsellable = await unsellableProductIds(db as PrismaClient, storeId, products);
  if (unsellable.size > 0) {
    const names = products.filter((p) => unsellable.has(p.id)).map((p) => p.name);
    return { error: `Món không còn phục vụ tại chi nhánh này: ${names.join(", ")}.` };
  }
  const byId = new Map(products.map((p) => [p.id, p]));

  const lines: PricedLine[] = [];
  for (const l of raw) {
    const customNotes = l.customNotes?.trim() || null;
    if (!l.comboId) {
      const p = byId.get(Number(l.productId))!;
      const size = sizeFor(p, l.size);
      lines.push({ productId: p.id, quantity: l.quantity!, unitPrice: unitPriceOf(p, size), size, customNotes, comboId: null, comboRef: null, comboQty: null });
      continue;
    }
    // Combo: chia giá combo theo tỷ lệ giá gốc (size M) của từng món
    const combo = combos.find((c) => c.id === Number(l.comboId))!;
    let weights = combo.items.map((i) => byId.get(i.productId)!.sellPrice * i.quantity);
    if (weights.every((w) => w === 0)) weights = combo.items.map((i) => i.quantity);
    const totalWeight = weights.reduce((s, w) => s + w, 0);
    // Giá 1 đơn vị từng món (làm tròn xuống), phần lẻ dồn vào món cuối để tổng 1 suất = đúng giá combo.
    // Phần lẻ không chia hết cho số lượng món đó → tách 1 đơn vị ra dòng riêng mang phần lẻ (đơn giá phải là số nguyên).
    const unit = combo.items.map((i, idx) => Math.floor((combo.comboPrice * weights[idx]) / totalWeight / i.quantity));
    const last = combo.items.length - 1;
    const restOfLast = combo.comboPrice - combo.items.reduce((s, i, idx) => (idx === last ? s : s + unit[idx] * i.quantity), 0);
    const lastQty = combo.items[last].quantity;
    unit[last] = Math.floor(restOfLast / lastQty);
    const extra = restOfLast - unit[last] * lastQty; // 0 ≤ extra < lastQty
    const ref = randomUUID();
    const notes = [`[Combo ${combo.name}]`, customNotes].filter(Boolean).join(" ");
    const base = { size: "M" as Size, customNotes: notes, comboId: combo.id, comboRef: ref, comboQty: l.quantity! };
    combo.items.forEach((i, idx) => {
      if (idx === last && extra > 0) {
        if (lastQty > 1) lines.push({ ...base, productId: i.productId, quantity: (lastQty - 1) * l.quantity!, unitPrice: unit[idx] });
        lines.push({ ...base, productId: i.productId, quantity: l.quantity!, unitPrice: unit[idx] + extra });
        return;
      }
      lines.push({ ...base, productId: i.productId, quantity: i.quantity * l.quantity!, unitPrice: unit[idx] });
    });
  }
  return { lines };
}
