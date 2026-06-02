/**
 * Seed định mức nguyên liệu (ProductFormula) theo bảng Admin cung cấp.
 *
 * ITEM IDs:
 *  1  = Cà Phê Phin Robusta  (Bịch, 1 Bịch = 1000g)
 *  2  = Cà Phê Máy Arabica   (Bịch, 1 Bịch = 1000g)
 *  3  = Sữa Đặc Ngôi Sao     (Lon,  1 Lon   = 380g)
 *  4  = Sữa Tươi Thanh Trùng (Hộp,  1 Hộp   = 1000ml)
 *  5  = Trà Đen Lộc Phát     (Bịch, 1 Bịch = 1000g)
 *  6  = Trà Oolong Nướng     (Bịch, 1 Bịch = 1000g)
 *  7  = Bột Matcha Nhật Bản  (Bịch, 1 Bịch = 500g)  ← chỉ 500g!
 *  8  = Bột Sữa Béo Indo     (Bịch, 1 Bịch = 1000g)
 *  9  = Syrup Đường Đen      (Chai, 1 Chai = 2500g)
 *  10 = Trân Châu Đen        (Bịch, 1 Bịch = 1000g)
 *  11 = Thạch Trái Cây       (Hộp,  1 Hộp  = 1000g)
 *  12 = Ly Nhựa Kèm Nắp     (Cái,  1 Cái  = 1 Cái)
 *
 * PRODUCT IDs:
 *  1  = Cà Phê Đen Đá
 *  2  = Bạc Xỉu Đá
 *  3  = Americano (Đá)
 *  4  = Latte (Đá/Nóng)
 *  5  = Trà Sữa Truyền Thống
 *  6  = Trà Sữa Oolong Nướng
 *  7  = Trà Sữa Trân Châu Đường Đen
 *  8  = Trà Đen Macchiato
 *  9  = Sữa Tươi Trân Châu Đường Đen
 *  10 = Matcha Latte (Nóng/Đá)
 *  11 = Matcha Đá Xay (Frappe)
 *  12 = Sữa Tươi Matcha Trân Châu
 */

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

type FormulaInput = {
  productId: number;
  itemId: number;
  qtyPerUnit: number;
  recipeUnit: string;
  conversionFactor: number;
  note?: string;
};

const FORMULAS: FormulaInput[] = [
  // ── Cà Phê Đen Đá (product 1) ──────────────────────────────────
  { productId: 1, itemId: 1,  qtyPerUnit: 20,  recipeUnit: "g",   conversionFactor: 1000, note: "Định mức bột khô" },
  { productId: 1, itemId: 12, qtyPerUnit: 1,   recipeUnit: "Cái", conversionFactor: 1 },

  // ── Bạc Xỉu Đá (product 2) ─────────────────────────────────────
  { productId: 2, itemId: 1,  qtyPerUnit: 10,  recipeUnit: "g",   conversionFactor: 1000 },
  { productId: 2, itemId: 3,  qtyPerUnit: 40,  recipeUnit: "g",   conversionFactor: 380,  note: "1 lon = 380g" },
  { productId: 2, itemId: 4,  qtyPerUnit: 60,  recipeUnit: "ml",  conversionFactor: 1000, note: "1 hộp = 1000ml" },
  { productId: 2, itemId: 12, qtyPerUnit: 1,   recipeUnit: "Cái", conversionFactor: 1 },

  // ── Americano Đá (product 3) ────────────────────────────────────
  { productId: 3, itemId: 2,  qtyPerUnit: 10,  recipeUnit: "g",   conversionFactor: 1000, note: "1 shot espresso" },
  { productId: 3, itemId: 12, qtyPerUnit: 1,   recipeUnit: "Cái", conversionFactor: 1 },

  // ── Latte Đá/Nóng (product 4) ──────────────────────────────────
  { productId: 4, itemId: 2,  qtyPerUnit: 10,  recipeUnit: "g",   conversionFactor: 1000 },
  { productId: 4, itemId: 4,  qtyPerUnit: 150, recipeUnit: "ml",  conversionFactor: 1000 },
  { productId: 4, itemId: 12, qtyPerUnit: 1,   recipeUnit: "Cái", conversionFactor: 1 },

  // ── Trà Sữa Truyền Thống (product 5) ───────────────────────────
  { productId: 5, itemId: 5,  qtyPerUnit: 6,   recipeUnit: "g",   conversionFactor: 1000 },
  { productId: 5, itemId: 8,  qtyPerUnit: 30,  recipeUnit: "g",   conversionFactor: 1000 },
  { productId: 5, itemId: 3,  qtyPerUnit: 20,  recipeUnit: "g",   conversionFactor: 380 },
  { productId: 5, itemId: 12, qtyPerUnit: 1,   recipeUnit: "Cái", conversionFactor: 1 },

  // ── Trà Sữa Oolong Nướng (product 6) ───────────────────────────
  { productId: 6, itemId: 6,  qtyPerUnit: 6,   recipeUnit: "g",   conversionFactor: 1000 },
  { productId: 6, itemId: 8,  qtyPerUnit: 30,  recipeUnit: "g",   conversionFactor: 1000 },
  { productId: 6, itemId: 12, qtyPerUnit: 1,   recipeUnit: "Cái", conversionFactor: 1 },

  // ── Trà Sữa Trân Châu Đường Đen (product 7) ────────────────────
  { productId: 7, itemId: 5,  qtyPerUnit: 6,   recipeUnit: "g",   conversionFactor: 1000 },
  { productId: 7, itemId: 8,  qtyPerUnit: 30,  recipeUnit: "g",   conversionFactor: 1000 },
  { productId: 7, itemId: 10, qtyPerUnit: 30,  recipeUnit: "g",   conversionFactor: 1000, note: "Trọng lượng hạt khô" },
  { productId: 7, itemId: 9,  qtyPerUnit: 15,  recipeUnit: "g",   conversionFactor: 2500, note: "1 chai = 2.5kg" },
  { productId: 7, itemId: 12, qtyPerUnit: 1,   recipeUnit: "Cái", conversionFactor: 1 },

  // ── Trà Đen Macchiato (product 8) ──────────────────────────────
  { productId: 8, itemId: 5,  qtyPerUnit: 5,   recipeUnit: "g",   conversionFactor: 1000 },
  { productId: 8, itemId: 4,  qtyPerUnit: 40,  recipeUnit: "ml",  conversionFactor: 1000, note: "Đánh bọt kem" },
  { productId: 8, itemId: 12, qtyPerUnit: 1,   recipeUnit: "Cái", conversionFactor: 1 },

  // ── Sữa Tươi Trân Châu Đường Đen (product 9) ───────────────────
  { productId: 9, itemId: 4,  qtyPerUnit: 150, recipeUnit: "ml",  conversionFactor: 1000 },
  { productId: 9, itemId: 9,  qtyPerUnit: 20,  recipeUnit: "g",   conversionFactor: 2500 },
  { productId: 9, itemId: 10, qtyPerUnit: 50,  recipeUnit: "g",   conversionFactor: 1000 },
  { productId: 9, itemId: 12, qtyPerUnit: 1,   recipeUnit: "Cái", conversionFactor: 1 },

  // ── Matcha Latte (product 10) ───────────────────────────────────
  { productId: 10, itemId: 7,  qtyPerUnit: 5,   recipeUnit: "g",   conversionFactor: 500, note: "1 bịch = 500g" },
  { productId: 10, itemId: 4,  qtyPerUnit: 150, recipeUnit: "ml",  conversionFactor: 1000 },
  { productId: 10, itemId: 12, qtyPerUnit: 1,   recipeUnit: "Cái", conversionFactor: 1 },

  // ── Matcha Đá Xay / Frappe (product 11) ────────────────────────
  { productId: 11, itemId: 7,  qtyPerUnit: 5,   recipeUnit: "g",   conversionFactor: 500 },
  { productId: 11, itemId: 4,  qtyPerUnit: 60,  recipeUnit: "ml",  conversionFactor: 1000 },
  { productId: 11, itemId: 8,  qtyPerUnit: 15,  recipeUnit: "g",   conversionFactor: 1000, note: "Tạo độ ngậy/sét" },
  { productId: 11, itemId: 12, qtyPerUnit: 1,   recipeUnit: "Cái", conversionFactor: 1 },

  // ── Sữa Tươi Matcha Trân Châu (product 12) ─────────────────────
  { productId: 12, itemId: 4,  qtyPerUnit: 150, recipeUnit: "ml",  conversionFactor: 1000 },
  { productId: 12, itemId: 7,  qtyPerUnit: 4,   recipeUnit: "g",   conversionFactor: 500 },
  { productId: 12, itemId: 10, qtyPerUnit: 40,  recipeUnit: "g",   conversionFactor: 1000 },
  { productId: 12, itemId: 12, qtyPerUnit: 1,   recipeUnit: "Cái", conversionFactor: 1 },
];

async function main() {
  console.log(`Đang seed ${FORMULAS.length} định mức cho ${new Set(FORMULAS.map(f => f.productId)).size} sản phẩm...\n`);

  let created = 0;
  let updated = 0;

  for (const f of FORMULAS) {
    const result = await prisma.productFormula.upsert({
      where: { productId_itemId: { productId: f.productId, itemId: f.itemId } },
      create: {
        productId: f.productId,
        itemId: f.itemId,
        qtyPerUnit: f.qtyPerUnit,
        recipeUnit: f.recipeUnit,
        conversionFactor: f.conversionFactor,
        note: f.note ?? null,
      },
      update: {
        qtyPerUnit: f.qtyPerUnit,
        recipeUnit: f.recipeUnit,
        conversionFactor: f.conversionFactor,
        note: f.note ?? null,
      },
      select: { id: true },
    });

    // Determine if created or updated by checking if id existed before
    const isNew = !await prisma.productFormula.findFirst({
      where: { id: { lt: result.id }, productId: f.productId, itemId: f.itemId }
    });

    console.log(`  product:${f.productId} item:${f.itemId} → ${f.qtyPerUnit}${f.recipeUnit} (1 đv kho = ${f.conversionFactor}${f.recipeUnit})`);
    created++;
  }

  console.log(`\nHoàn tất: ${created} định mức đã được upsert.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
