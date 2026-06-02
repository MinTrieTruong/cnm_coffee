/**
 * Script cập nhật conversionFactor cho tất cả ProductFormula dựa theo bảng quy đổi:
 * - Cà Phê Phin/Máy (Bịch 1kg)     → 1 Bịch = 1000g
 * - Sữa Đặc Ngôi Sao (Lon)          → 1 Lon  = 380g
 * - Sữa Tươi Thanh Trùng (Hộp 1L)  → 1 Hộp  = 1000ml
 * - Trà Đen/Oolong (Bịch 1kg)       → 1 Bịch = 1000g
 * - Bột Matcha Nhật (Bịch 500g)     → 1 Bịch = 500g  ← đặc biệt
 * - Bột Sữa Béo Indo (Bịch 1kg)     → 1 Bịch = 1000g
 * - Syrup Đường Đen (Chai 2.5kg)    → 1 Chai = 2500g
 * - Trân Châu Đen (Bịch 1kg)        → 1 Bịch = 1000g
 * - Thạch Trái Cây (Hộp 1kg)        → 1 Hộp  = 1000g
 * - Ly Nhựa Kèm Nắp (Cái)           → 1 Cái  = 1 Cái
 */

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// itemId → { conversionFactor, recipeUnit }
const CONVERSIONS: Record<number, { cf: number; unit: string }> = {
  1:  { cf: 1000, unit: "g"   }, // Cà Phê Phin Robusta
  2:  { cf: 1000, unit: "g"   }, // Cà Phê Máy Arabica
  3:  { cf: 380,  unit: "g"   }, // Sữa Đặc Ngôi Sao (1 lon = 380g)
  4:  { cf: 1000, unit: "ml"  }, // Sữa Tươi Thanh Trùng (1 hộp = 1000ml)
  5:  { cf: 1000, unit: "g"   }, // Trà Đen Lộc Phát
  6:  { cf: 1000, unit: "g"   }, // Trà Oolong Nướng
  7:  { cf: 500,  unit: "g"   }, // Bột Matcha Nhật (bịch 500g, không phải 1kg!)
  8:  { cf: 1000, unit: "g"   }, // Bột Sữa Béo Indo
  9:  { cf: 2500, unit: "g"   }, // Syrup Đường Đen (chai 2.5kg = 2500g)
  10: { cf: 1000, unit: "g"   }, // Trân Châu Đen
  11: { cf: 1000, unit: "g"   }, // Thạch Trái Cây (hộp 1kg)
  12: { cf: 1,    unit: "Cái" }, // Ly Nhựa Kèm Nắp (1:1)
};

async function main() {
  let updated = 0;

  for (const [itemIdStr, { cf, unit }] of Object.entries(CONVERSIONS)) {
    const itemId = Number(itemIdStr);

    // Cập nhật tất cả ProductFormula có itemId này
    const result = await prisma.productFormula.updateMany({
      where: { itemId },
      data: {
        conversionFactor: cf,
        recipeUnit: unit,
      },
    });

    const item = await prisma.inventoryItem.findUnique({
      where: { id: itemId },
      select: { name: true, unit: true },
    });

    console.log(
      `[${itemId}] ${item?.name ?? "?"} (${item?.unit ?? "?"})` +
      ` → 1 ${item?.unit} = ${cf} ${unit}` +
      ` | ${result.count} công thức cập nhật`
    );
    updated += result.count;
  }

  console.log(`\nTổng cộng: ${updated} định mức đã cập nhật.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
