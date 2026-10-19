import type { PrismaClient, Product } from "@prisma/client";

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
