import type { Prisma, PrismaClient, Product } from "@prisma/client";
import { stockPerCup } from "./inventory.js";

/**
 * Món nào không bán được tại chi nhánh: món ngừng kinh doanh toàn chuỗi (`isActive = false`),
 * bị chi nhánh tắt (`isAvailable = false`) hoặc chi nhánh báo hết (`outOfStock`).
 */
export async function unsellableProductIds(
  prisma: PrismaClient,
  storeId: number,
  products: Pick<Product, "id" | "isActive" | "outOfStock">[],
): Promise<Set<number>> {
  // outOfStock toàn chuỗi: cờ cũ, giữ tới khi trang quản trị chuyển hẳn sang theo chi nhánh
  const out = new Set(products.filter((p) => !p.isActive || p.outOfStock).map((p) => p.id));
  const overrides = await prisma.storeProduct.findMany({
    where: { storeId, productId: { in: products.map((p) => p.id) } },
  });
  for (const o of overrides) if (!o.isAvailable || o.outOfStock) out.add(o.productId);
  return out;
}

/** Món chi nhánh đang tắt, báo hết, hoặc hết nguyên liệu — ẩn khỏi thực đơn của khách. */
export async function hiddenProductIds(prisma: PrismaClient, storeId: number | null): Promise<Set<number>> {
  const { disabled, soldOut } = await storeMenuState(prisma, storeId);
  return new Set([...disabled, ...soldOut]);
}

/**
 * Trạng thái thực đơn tại chi nhánh, tách hai loại:
 * - `disabled`: chi nhánh không bán món (`isAvailable = false`) → ẩn hẳn
 * - `soldOut`: chi nhánh báo hết hoặc hết nguyên liệu → vẫn hiện, làm mờ "Hết hàng"
 */
export async function storeMenuState(prisma: PrismaClient, storeId: number | null): Promise<{ disabled: Set<number>; soldOut: Set<number> }> {
  if (storeId == null) return { disabled: new Set(), soldOut: new Set() };
  const rows = await prisma.storeProduct.findMany({
    where: { storeId, OR: [{ isAvailable: false }, { outOfStock: true }] },
    select: { productId: true, isAvailable: true },
  });
  const disabled = new Set(rows.filter((r) => !r.isAvailable).map((r) => r.productId));
  const soldOut = new Set(rows.filter((r) => r.isAvailable).map((r) => r.productId));
  for (const id of await ingredientShortProductIds(prisma, storeId)) if (!disabled.has(id)) soldOut.add(id);
  return { disabled, soldOut };
}

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Nguyên liệu còn thiếu cho các ly cần làm tại chi nhánh. Chỉ xét nguyên liệu chi nhánh có theo dõi tồn
 * (có dòng Store_Inventory) — chi nhánh chưa nhập kho nguyên liệu nào thì không chặn bán.
 * Trả productId → true nếu không đủ.
 */
export async function shortCups(db: Db, storeId: number, cups: { productId: number; size?: string | null; quantity: number }[]) {
  const formulas = await db.productFormula.findMany({ where: { productId: { in: [...new Set(cups.map((c) => c.productId))] } } });
  if (!formulas.length) return new Set<number>();
  const stock = await db.storeInventory.findMany({
    where: { storeId, itemId: { in: [...new Set(formulas.map((f) => f.itemId))] } },
    select: { itemId: true, stockQty: true },
  });
  const have = new Map(stock.map((x) => [x.itemId, x.stockQty]));
  const need = new Map<number, number>();
  for (const c of cups) for (const f of formulas) if (f.productId === c.productId) need.set(f.itemId, (need.get(f.itemId) ?? 0) + stockPerCup(f, c.size) * c.quantity);
  const shortItems = new Set([...need].filter(([itemId, qty]) => have.has(itemId) && have.get(itemId)! < qty - 1e-9).map(([itemId]) => itemId));
  return new Set(formulas.filter((f) => shortItems.has(f.itemId) && cups.some((c) => c.productId === f.productId)).map((f) => f.productId));
}

/** Món không còn đủ nguyên liệu để làm 1 ly cỡ nhỏ nhất tại chi nhánh — tự coi là hết món */
export async function ingredientShortProductIds(db: Db, storeId: number): Promise<Set<number>> {
  const formulas = await db.productFormula.findMany({ select: { productId: true, itemId: true, qtyPerUnit: true, qtySizeS: true, qtySizeM: true, qtySizeL: true, conversionFactor: true } });
  if (!formulas.length) return new Set();
  const stock = await db.storeInventory.findMany({ where: { storeId }, select: { itemId: true, stockQty: true } });
  const have = new Map(stock.map((x) => [x.itemId, x.stockQty]));
  const out = new Set<number>();
  for (const f of formulas) {
    if (!have.has(f.itemId)) continue;
    const smallest = Math.min(...(["S", "M", "L", null] as const).map((sz) => stockPerCup(f, sz)));
    if (have.get(f.itemId)! < smallest - 1e-9) out.add(f.productId);
  }
  return out;
}

/** `?store=` từ query của khách (không hợp lệ → null). */
export function storeFromQuery(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}
