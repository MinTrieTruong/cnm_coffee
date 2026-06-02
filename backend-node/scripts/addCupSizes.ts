/**
 * addCupSizes.ts
 *
 * 1. Thêm 3 item ly mới:
 *    - Item 14: Ly Nhựa Size S (cái)
 *    - Item 15: Ly Nhựa Size M (cái)
 *    - Item 16: Ly Nhựa Size L (cái)
 *
 * 2. Với mỗi sản phẩm (1–12):
 *    - Xóa formula cũ dùng item 12 (Ly Nhựa chung)
 *    - Thêm 3 formula mới (Ly S / M / L), mỗi cái chỉ gán qty cho đúng size đó:
 *        Ly S: qtySizeS=1, qtySizeM=null, qtySizeL=null
 *        Ly M: qtySizeS=null, qtySizeM=1, qtySizeL=null
 *        Ly L: qtySizeS=null, qtySizeM=null, qtySizeL=1
 *
 * Chạy: npx tsx scripts/addCupSizes.ts
 */

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const PRODUCT_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const CUP_ITEMS = [
  { id: 14, name: "Ly Nhựa Size S", note: "Ly size S (240ml)" },
  { id: 15, name: "Ly Nhựa Size M", note: "Ly size M (350ml)" },
  { id: 16, name: "Ly Nhựa Size L", note: "Ly size L (500ml)" },
];

async function main() {
  // ── 1. Upsert 3 item ly ─────────────────────────────────────────────────
  for (const cup of CUP_ITEMS) {
    const item = await prisma.inventoryItem.upsert({
      where: { id: cup.id },
      create: {
        id: cup.id,
        name: cup.name,
        unit: "Cái",
        stockQty: 200,      // 200 cái ban đầu
        minLevel: 50,
        unitCostPrice: 800, // ~800đ/cái
        supplier: "Bao bì/Siêu thị",
      },
      update: { name: cup.name, unit: "Cái" },
    });
    console.log(`✅ Item #${item.id}: ${item.name}`);
  }

  // ── 2. Cập nhật formula cho từng sản phẩm ──────────────────────────────
  for (const productId of PRODUCT_IDS) {
    // Xóa formula cũ (item 12 = Ly Nhựa chung)
    const deleted = await prisma.productFormula.deleteMany({
      where: { productId, itemId: 12 },
    });
    if (deleted.count > 0) {
      console.log(`  🗑  product:${productId} ← Đã xóa formula ly cũ (item 12)`);
    }

    // Thêm Ly S → chỉ qtySizeS = 1
    await prisma.productFormula.upsert({
      where: { productId_itemId: { productId, itemId: 14 } },
      create: {
        productId, itemId: 14,
        qtyPerUnit: 0,  // không dùng cho size khác
        qtySizeS: 1, qtySizeM: null, qtySizeL: null,
        recipeUnit: "Cái", conversionFactor: 1,
        note: "Chỉ dùng khi gọi size S",
      },
      update: {
        qtyPerUnit: 0,
        qtySizeS: 1, qtySizeM: null, qtySizeL: null,
        note: "Chỉ dùng khi gọi size S",
      },
    });

    // Thêm Ly M → chỉ qtySizeM = 1
    await prisma.productFormula.upsert({
      where: { productId_itemId: { productId, itemId: 15 } },
      create: {
        productId, itemId: 15,
        qtyPerUnit: 1,  // M là mặc định (fallback)
        qtySizeS: null, qtySizeM: 1, qtySizeL: null,
        recipeUnit: "Cái", conversionFactor: 1,
        note: "Chỉ dùng khi gọi size M",
      },
      update: {
        qtyPerUnit: 1,
        qtySizeS: null, qtySizeM: 1, qtySizeL: null,
        note: "Chỉ dùng khi gọi size M",
      },
    });

    // Thêm Ly L → chỉ qtySizeL = 1
    await prisma.productFormula.upsert({
      where: { productId_itemId: { productId, itemId: 16 } },
      create: {
        productId, itemId: 16,
        qtyPerUnit: 0,
        qtySizeS: null, qtySizeM: null, qtySizeL: 1,
        recipeUnit: "Cái", conversionFactor: 1,
        note: "Chỉ dùng khi gọi size L",
      },
      update: {
        qtyPerUnit: 0,
        qtySizeS: null, qtySizeM: null, qtySizeL: 1,
        note: "Chỉ dùng khi gọi size L",
      },
    });

    console.log(`  🥤 product:${productId} ← Ly S(14) M(15) L(16) đã gán`);
  }

  console.log("\n✅ Hoàn tất: 3 loại ly S/M/L đã được thêm vào kho và công thức.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
