/**
 * lib/productCost.ts — Giá vốn món tính từ định mức × giá nhập nguyên liệu.
 * Product.costPrice = giá vốn ly size M, tự cập nhật khi sửa định mức hoặc giá nhập thay đổi.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { stockPerCup } from "./inventory.js";

type Db = PrismaClient | Prisma.TransactionClient;
export type SizeCost = { S: number; M: number; L: number };

/** Giá vốn S/M/L của các món có định mức (VND, chưa làm tròn) */
export async function productCosts(db: Db, productIds?: number[]) {
  const formulas = await db.productFormula.findMany({
    where: productIds ? { productId: { in: productIds } } : {},
    include: { item: { select: { unitCostPrice: true } } },
  });
  const costs = new Map<number, SizeCost>();
  for (const f of formulas) {
    const c = costs.get(f.productId) ?? costs.set(f.productId, { S: 0, M: 0, L: 0 }).get(f.productId)!;
    for (const size of ["S", "M", "L"] as const) c[size] += stockPerCup(f, size) * f.item.unitCostPrice;
  }
  return costs;
}

/** Ghi lại giá vốn (size M) cho các món — gọi sau khi sửa định mức / giá nhập */
export async function recalcProductCost(db: Db, productIds?: number[]) {
  const costs = await productCosts(db, productIds);
  for (const [id, c] of costs) await db.product.update({ where: { id }, data: { costPrice: Math.round(c.M) } });
  return costs;
}

/** Món dùng các nguyên liệu này (để tính lại giá vốn khi giá nhập đổi) */
export async function productsUsingItems(db: Db, itemIds: number[]) {
  const rows = await db.productFormula.findMany({ where: { itemId: { in: itemIds } }, select: { productId: true }, distinct: ["productId"] });
  return rows.map((r) => r.productId);
}

/**
 * Hàng nhập kho có giá → cập nhật giá nhập bình quân gia quyền của nguyên liệu và giá vốn các món dùng nó.
 * Giá vốn dùng chung cả chuỗi nên tồn cũ là tổng tồn mọi chi nhánh; gọi TRƯỚC khi cộng tồn của lần nhập này.
 * Tồn cũ chưa có giá (0đ) thì không tính vào, lấy luôn giá nhập — tránh kéo giá vốn xuống vô lý.
 */
export async function applyIncomingCost(db: Db, itemId: number, qty: number, unitPrice: number) {
  if (!(qty > 0) || !(unitPrice > 0)) return;
  const [item, chainStock] = await Promise.all([
    db.inventoryItem.findUnique({ where: { id: itemId }, select: { unitCostPrice: true } }),
    db.storeInventory.aggregate({ where: { itemId }, _sum: { stockQty: true } }),
  ]);
  const oldQty = Math.max(0, chainStock._sum.stockQty ?? 0);
  const oldCost = item?.unitCostPrice ?? 0;
  const after = oldQty + qty;
  const avg = oldCost > 0 && after > 0 ? Math.round((oldQty * oldCost + qty * unitPrice) / after) : Math.round(unitPrice);
  await db.inventoryItem.update({ where: { id: itemId }, data: { unitCostPrice: avg } });
  await recalcProductCost(db, await productsUsingItems(db, [itemId]));
}
