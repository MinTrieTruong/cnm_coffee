/**
 * addSugarAndSizeFormulas.ts
 *
 * 1. Thêm "Đường Trắng" vào kho (InventoryItem id = 13, đơn vị: Kg, 1 Kg = 1000g)
 * 2. Cập nhật tất cả ProductFormula: bổ sung qtySizeS / qtySizeM / qtySizeL
 *    cho các nguyên liệu chính (cà phê, trà, bột matcha, sữa…)
 * 3. Thêm đường (item 13) vào công thức các sản phẩm:
 *    đường 100% → qtyM = 10g, qtyS = 8g, qtyL = 12g
 *    (syrup đường đen vẫn giữ nguyên, Đường Trắng dùng riêng)
 *
 * Chạy:
 *   npx ts-node -e "require('./scripts/addSugarAndSizeFormulas.ts')"
 * hoặc:
 *   npx tsx scripts/addSugarAndSizeFormulas.ts
 */

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// ── Định mức theo size cho từng nguyên liệu chính ──────────────────────────
// Quy tắc: S = 80% M, L = 130% M (làm tròn)
// Ghi đè theo từng cặp [productId, itemId]: { S, M, L }

type SizeQty = { s: number; m: number; l: number };

const SIZE_MAP: Record<string, SizeQty> = {
  // productId_itemId → {s, m, l}

  // Cà Phê Đen Đá (1): cà phê phin (item 1) → M=20g, S=15g, L=25g
  "1_1":  { s: 15, m: 20, l: 25 },

  // Bạc Xỉu Đá (2): cà phê phin (1)=10g, sữa đặc (3)=40g, sữa tươi (4)=60ml
  "2_1":  { s:  8, m: 10, l: 13 },
  "2_3":  { s: 30, m: 40, l: 50 },
  "2_4":  { s: 50, m: 60, l: 80 },

  // Americano (3): cà phê Arabica (2)
  "3_2":  { s:  8, m: 10, l: 13 },

  // Latte (4): Arabica (2), sữa tươi (4)
  "4_2":  { s:  8, m: 10, l: 13 },
  "4_4":  { s:120, m:150, l:200 },

  // Trà Sữa TT (5): trà đen (5), bột sữa béo (8), sữa đặc (3)
  "5_5":  { s:  5, m:  6, l:  8 },
  "5_8":  { s: 25, m: 30, l: 40 },
  "5_3":  { s: 15, m: 20, l: 25 },

  // Trà Sữa Oolong (6): oolong (6), bột sữa béo (8)
  "6_6":  { s:  5, m:  6, l:  8 },
  "6_8":  { s: 25, m: 30, l: 40 },

  // Trà Sữa TCĐD (7): trà (5), bột sữa (8), trân châu (10), syrup đen (9)
  "7_5":  { s:  5, m:  6, l:  8 },
  "7_8":  { s: 25, m: 30, l: 40 },
  "7_10": { s: 25, m: 30, l: 40 },
  "7_9":  { s: 12, m: 15, l: 20 },

  // Trà Đen Macchiato (8): trà (5), sữa tươi (4)
  "8_5":  { s:  4, m:  5, l:  7 },
  "8_4":  { s: 30, m: 40, l: 55 },

  // Sữa Tươi TCĐD (9): sữa tươi (4), syrup đen (9), trân châu (10)
  "9_4":  { s:120, m:150, l:200 },
  "9_9":  { s: 15, m: 20, l: 25 },
  "9_10": { s: 40, m: 50, l: 65 },

  // Matcha Latte (10): matcha (7), sữa tươi (4)
  "10_7": { s:  4, m:  5, l:  7 },
  "10_4": { s:120, m:150, l:200 },

  // Matcha Frappe (11): matcha (7), sữa tươi (4), bột sữa (8)
  "11_7": { s:  4, m:  5, l:  7 },
  "11_4": { s: 50, m: 60, l: 80 },
  "11_8": { s: 12, m: 15, l: 20 },

  // Sữa Tươi Matcha TC (12): sữa tươi (4), matcha (7), trân châu (10)
  "12_4": { s:120, m:150, l:200 },
  "12_7": { s:  3, m:  4, l:  5 },
  "12_10":{ s: 32, m: 40, l: 52 },
};

// Đường trắng: 100% đường → grams/ly theo size (base cho đường 100%)
// Các sản phẩm nào cho thêm đường: tất cả trừ ly trà, sữa đặc đã ngọt sẵn
const SUGAR_PRODUCTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const SUGAR_ITEM_ID  = 13;
// Lượng đường (g) cho size S / M / L khi khách chọn đường 100%
const SUGAR_S = 8;
const SUGAR_M = 10;
const SUGAR_L = 13;

async function main() {
  // ── 1. Upsert item Đường Trắng ──────────────────────────────────────────
  const sugar = await prisma.inventoryItem.upsert({
    where: { id: SUGAR_ITEM_ID },
    create: {
      id: SUGAR_ITEM_ID,
      name: "Đường Trắng",
      unit: "Kg",
      stockQty: 5,           // 5 kg ban đầu
      minLevel: 2,           // cảnh báo khi dưới 2 Kg
      unitCostPrice: 20000,  // 20.000đ/kg
      supplier: "Chợ/Siêu thị",
    },
    update: { name: "Đường Trắng", unit: "Kg" },
  });
  console.log(`✅ Item #${sugar.id}: ${sugar.name} (${sugar.unit})`);

  // ── 2. Cập nhật qtySizeS/M/L cho các formula hiện có ───────────────────
  let updatedSize = 0;
  for (const [key, { s, m, l }] of Object.entries(SIZE_MAP)) {
    const [pid, iid] = key.split("_").map(Number);
    const res = await prisma.productFormula.updateMany({
      where: { productId: pid, itemId: iid },
      data: { qtySizeS: s, qtySizeM: m, qtySizeL: l, qtyPerUnit: m },
    });
    if (res.count > 0) {
      console.log(`  📐 product:${pid} item:${iid} → S=${s} M=${m} L=${l}`);
      updatedSize += res.count;
    } else {
      console.log(`  ⚠️  Không tìm thấy formula product:${pid} item:${iid} — bỏ qua`);
    }
  }
  console.log(`\nĐã cập nhật size cho ${updatedSize} định mức.\n`);

  // ── 3. Thêm Đường Trắng vào formula các sản phẩm ───────────────────────
  let addedSugar = 0;
  for (const productId of SUGAR_PRODUCTS) {
    const result = await prisma.productFormula.upsert({
      where: { productId_itemId: { productId, itemId: SUGAR_ITEM_ID } },
      create: {
        productId,
        itemId: SUGAR_ITEM_ID,
        qtyPerUnit: SUGAR_M,
        qtySizeS: SUGAR_S,
        qtySizeM: SUGAR_M,
        qtySizeL: SUGAR_L,
        recipeUnit: "g",
        conversionFactor: 1000, // 1 Kg kho = 1000g công thức
        note: "Lượng đường khi khách chọn 100% đường. Điều chỉnh tỷ lệ theo %.",
      },
      update: {
        qtyPerUnit: SUGAR_M,
        qtySizeS: SUGAR_S,
        qtySizeM: SUGAR_M,
        qtySizeL: SUGAR_L,
        recipeUnit: "g",
        conversionFactor: 1000,
        note: "Lượng đường khi khách chọn 100% đường. Điều chỉnh tỷ lệ theo %.",
      },
    });
    console.log(`  🍬 product:${productId} ← Đường Trắng S=${SUGAR_S}g M=${SUGAR_M}g L=${SUGAR_L}g  (formula #${result.id})`);
    addedSugar++;
  }

  console.log(`\n✅ Hoàn tất: ${addedSugar} sản phẩm đã có định mức đường.`);
  console.log("💡 Lưu ý: qtyPerUnit = lượng 100% đường. Backend nên nhân với (sugarPct/100) khi tính thực tế.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
