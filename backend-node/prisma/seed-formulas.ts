import { PrismaClient } from "@prisma/client";
import { adjustStoreStock } from "../src/lib/inventory.js";
import { recalcProductCost } from "../src/lib/productCost.js";

/**
 * Định mức nguyên liệu cho toàn bộ món nước, theo size S / M / L.
 * - Bổ sung nguyên liệu còn thiếu trong kho (kèm giá nhập + tồn ban đầu mỗi chi nhánh).
 * - Điền giá nhập cho nguyên liệu đang để 0đ, ghi quy đổi đơn vị công thức cho từng nguyên liệu.
 * - Tính lại giá vốn món (Product.costPrice) từ định mức.
 * - Ghi đè định mức của các món bên dưới (chạy lại nhiều lần không sao).
 * Số lượng ghi theo đơn vị công thức (g, ml, cái); `per` = số đơn vị công thức trong 1 đơn vị kho.
 */
const prisma = new PrismaClient();

type ItemDef = { key: string; name: string; unit: string; category: string; recipeUnit: string; per: number; cost: number; stock?: number; min?: number };

/** Nguyên liệu dùng trong định mức. Có `stock` = thêm mới nếu kho chưa có. */
const ITEMS: ItemDef[] = [
  // Đã có trong kho
  { key: "robusta", name: "Cà Phê Phin Robusta (Bịch 1Kg)", unit: "Bịch", category: "Cà Phê", recipeUnit: "g", per: 1000, cost: 230_000 },
  { key: "arabica", name: "Cà Phê Máy Arabica (Bịch 1Kg)", unit: "Bịch", category: "Cà Phê", recipeUnit: "g", per: 1000, cost: 320_000 },
  { key: "suaDac", name: "Sữa Đặc Ngôi Sao (Lon)", unit: "Lon", category: "Sữa", recipeUnit: "g", per: 380, cost: 26_000 },
  { key: "suaTuoi", name: "Sữa Tươi Thanh Trùng 1L (Hộp)", unit: "Hộp", category: "Sữa", recipeUnit: "ml", per: 1000, cost: 38_000 },
  { key: "traDen", name: "Trà Đen Lộc Phát (Bịch 1Kg)", unit: "Bịch", category: "Trà", recipeUnit: "g", per: 1000, cost: 160_000 },
  { key: "oolong", name: "Trà Oolong Nướng (Bịch 1Kg)", unit: "Bịch", category: "Trà", recipeUnit: "g", per: 1000, cost: 280_000 },
  { key: "matcha", name: "Bột Matcha Nhật Bản (Bịch 500g)", unit: "Bịch", category: "Trà", recipeUnit: "g", per: 500, cost: 450_000 },
  { key: "botSua", name: "Bột Sữa Béo Indo (Bịch 1Kg)", unit: "Bịch", category: "Sữa", recipeUnit: "g", per: 1000, cost: 75_000 },
  { key: "duongDen", name: "Syrup Đường Đen Đài Loan (Chai 2.5Kg)", unit: "Chai", category: "Syrup", recipeUnit: "g", per: 2500, cost: 180_000 },
  { key: "tranChau", name: "Trân Châu Đen (Bịch 1Kg)", unit: "Bịch", category: "Topping", recipeUnit: "g", per: 1000, cost: 45_000 },
  { key: "thach", name: "Thạch Trái Cây (Hộp 1Kg)", unit: "Hộp", category: "Topping", recipeUnit: "g", per: 1000, cost: 60_000 },
  { key: "ly", name: "Ly Nhựa Kèm Nắp (Cái)", unit: "Cái", category: "Bao Bì", recipeUnit: "Cái", per: 1, cost: 1_500 },
  // Bổ sung
  { key: "duong", name: "Đường Cát Trắng (Bịch 1Kg)", unit: "Bịch", category: "Đường & Syrup", recipeUnit: "g", per: 1000, cost: 24_000, stock: 20, min: 4 },
  { key: "da", name: "Đá Viên Tinh Khiết (Bao 20Kg)", unit: "Bao", category: "Đá", recipeUnit: "g", per: 20_000, cost: 25_000, stock: 15, min: 4 },
  { key: "ongHut", name: "Ống Hút (Bịch 100 Cái)", unit: "Bịch", category: "Bao Bì", recipeUnit: "Cái", per: 100, cost: 18_000, stock: 30, min: 5 },
  { key: "kemBeo", name: "Kem Béo Thực Vật Rich's (Hộp 1L)", unit: "Hộp", category: "Sữa", recipeUnit: "ml", per: 1000, cost: 95_000, stock: 12, min: 3 },
  { key: "muoi", name: "Muối Hồng Himalaya (Hũ 500g)", unit: "Hũ", category: "Gia Vị", recipeUnit: "g", per: 500, cost: 55_000, stock: 4, min: 1 },
  { key: "cotDua", name: "Nước Cốt Dừa (Lon 400ml)", unit: "Lon", category: "Sữa", recipeUnit: "ml", per: 400, cost: 22_000, stock: 24, min: 6 },
  { key: "caramel", name: "Sốt Caramel Monin (Chai 700ml)", unit: "Chai", category: "Đường & Syrup", recipeUnit: "ml", per: 700, cost: 210_000, stock: 6, min: 2 },
  { key: "dao", name: "Đào Ngâm Thái (Lon 820g)", unit: "Lon", category: "Trái Cây", recipeUnit: "g", per: 820, cost: 58_000, stock: 24, min: 6 },
  { key: "cam", name: "Cam Vàng Tươi (Kg)", unit: "Kg", category: "Trái Cây", recipeUnit: "g", per: 1000, cost: 45_000, stock: 10, min: 3 },
  { key: "sa", name: "Sả Cây Tươi (Kg)", unit: "Kg", category: "Trái Cây", recipeUnit: "g", per: 1000, cost: 30_000, stock: 3, min: 1 },
  { key: "vai", name: "Vải Ngâm (Lon 565g)", unit: "Lon", category: "Trái Cây", recipeUnit: "g", per: 565, cost: 48_000, stock: 24, min: 6 },
  { key: "traLai", name: "Trà Lài (Bịch 1Kg)", unit: "Bịch", category: "Trà", recipeUnit: "g", per: 1000, cost: 180_000, stock: 5, min: 1 },
  { key: "mutBuoi", name: "Mứt Bưởi Hồng (Hũ 1Kg)", unit: "Hũ", category: "Trái Cây", recipeUnit: "g", per: 1000, cost: 150_000, stock: 6, min: 2 },
];

/** [S, M, L] theo đơn vị công thức */
type Line = [key: string, s: number, m: number, l: number];
/** Đá, ly, ống hút cho món đá */
const ICED: Line[] = [["da", 150, 200, 260], ["ly", 1, 1, 1], ["ongHut", 1, 1, 1]];
const ESPRESSO: Line = ["arabica", 14, 18, 24]; // 1 shot / 2 shot / 2 shot đậm

const RECIPES: Record<string, Line[]> = {
  "Cà Phê Đen Đá": [["robusta", 15, 20, 28], ["duong", 10, 15, 20], ...ICED],
  "Cà Phê Sữa Đá": [["robusta", 15, 20, 28], ["suaDac", 26, 35, 45], ...ICED],
  "Bạc Xỉu Đá": [["robusta", 8, 10, 14], ["suaDac", 22, 30, 40], ["suaTuoi", 45, 60, 80], ...ICED],
  "Cà Phê Muối": [["robusta", 15, 20, 28], ["suaDac", 22, 30, 40], ["kemBeo", 30, 40, 50], ["muoi", 1, 1.5, 2], ...ICED],
  "Cà Phê Cốt Dừa": [["robusta", 15, 20, 28], ["suaDac", 18, 25, 33], ["cotDua", 45, 60, 80], ["da", 170, 220, 290], ["ly", 1, 1, 1], ["ongHut", 1, 1, 1]],
  "Americano (Đá)": [ESPRESSO, ...ICED],
  "Latte (Đá/Nóng)": [ESPRESSO, ["suaTuoi", 110, 150, 200], ...ICED],
  "Cappuccino (Nóng/Đá)": [ESPRESSO, ["suaTuoi", 90, 120, 160], ["da", 110, 150, 200], ["ly", 1, 1, 1], ["ongHut", 1, 1, 1]],
  "Caramel Macchiato": [ESPRESSO, ["suaTuoi", 110, 150, 200], ["caramel", 15, 20, 27], ...ICED],
  "Trà Sữa Truyền Thống": [["traDen", 6, 8, 11], ["botSua", 22, 30, 40], ["duong", 18, 25, 33], ["tranChau", 40, 50, 65], ...ICED],
  "Trà Sữa Oolong Nướng": [["oolong", 6, 8, 11], ["botSua", 22, 30, 40], ["duong", 18, 25, 33], ["tranChau", 40, 50, 65], ...ICED],
  "Trà Sữa Trân Châu Đường Đen": [["traDen", 6, 8, 11], ["botSua", 22, 30, 40], ["duongDen", 22, 30, 40], ["tranChau", 45, 60, 80], ...ICED],
  "Trà Đen Macchiato": [["traDen", 6, 8, 11], ["duong", 15, 20, 26], ["kemBeo", 30, 40, 50], ["muoi", 0.5, 1, 1.5], ...ICED],
  "Sữa Tươi Trân Châu Đường Đen": [["suaTuoi", 130, 180, 240], ["duongDen", 26, 35, 45], ["tranChau", 45, 60, 80], ...ICED],
  "Matcha Latte (Nóng/Đá)": [["matcha", 3, 4, 5], ["suaTuoi", 120, 160, 210], ["duong", 10, 15, 20], ...ICED],
  "Matcha Đá Xay (Frappe)": [["matcha", 4, 5, 7], ["suaTuoi", 90, 120, 160], ["botSua", 15, 20, 26], ["duong", 18, 25, 33], ["kemBeo", 20, 30, 40], ["da", 180, 250, 320], ["ly", 1, 1, 1], ["ongHut", 1, 1, 1]],
  "Sữa Tươi Matcha Trân Châu": [["matcha", 3, 4, 5], ["suaTuoi", 130, 170, 220], ["duong", 10, 15, 20], ["tranChau", 40, 50, 65], ...ICED],
  "Trà Đào Cam Sả": [["traDen", 5, 6, 8], ["dao", 60, 80, 105], ["cam", 30, 40, 55], ["sa", 8, 10, 13], ["duong", 10, 15, 20], ...ICED],
  "Trà Vải Lài": [["traLai", 5, 6, 8], ["vai", 60, 80, 105], ["duong", 10, 15, 20], ["thach", 20, 30, 40], ...ICED],
  "Trà Oolong Bưởi Hồng": [["oolong", 5, 6, 8], ["mutBuoi", 30, 40, 52], ["duong", 8, 10, 14], ...ICED],
};

async function main() {
  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  const ids = new Map<string, number>();
  let nextId = ((await prisma.inventoryItem.aggregate({ _max: { id: true } }))._max.id ?? 0) + 1;
  let added = 0;
  let priced = 0;

  for (const d of ITEMS) {
    const found = await prisma.inventoryItem.findFirst({ where: { name: d.name } });
    if (found) {
      ids.set(d.key, found.id);
      // Giá 0đ (chưa có) hoặc giá bị kéo thấp bởi lỗi tính bình quân cũ (< 1/10 giá thị trường) → điền giá chuẩn
      const fixPrice = found.unitCostPrice === 0 || found.unitCostPrice < d.cost / 10;
      if (fixPrice) priced++;
      await prisma.inventoryItem.update({
        where: { id: found.id },
        data: { recipeUnit: d.recipeUnit, recipePerUnit: d.per, ...(fixPrice ? { unitCostPrice: d.cost } : {}) },
      });
      continue;
    }
    if (d.stock == null) throw new Error(`Kho thiếu nguyên liệu "${d.name}"`);
    const item = await prisma.inventoryItem.create({
      data: { id: nextId++, name: d.name, unit: d.unit, category: d.category, unitCostPrice: d.cost, recipeUnit: d.recipeUnit, recipePerUnit: d.per },
    });
    ids.set(d.key, item.id);
    // Tồn ban đầu mỗi chi nhánh, ghi như một lần nhập kho
    for (const s of stores) {
      await prisma.$transaction(async (tx) => {
        await adjustStoreStock(tx, { storeId: s.id, itemId: item.id, qtyChange: d.stock!, type: "RECEIVE", referenceId: "SEED-FORMULA" });
        await tx.storeInventory.update({ where: { storeId_itemId: { storeId: s.id, itemId: item.id } }, data: { minLevel: d.min ?? 0 } });
      });
    }
    added++;
  }
  console.log(`Nguyên liệu: thêm ${added}, điền giá nhập ${priced}`);

  const byKey = new Map(ITEMS.map((d) => [d.key, d]));
  let lines = 0;
  for (const [productName, recipe] of Object.entries(RECIPES)) {
    const product = await prisma.product.findFirst({ where: { name: productName } });
    if (!product) {
      console.warn(`  ! Không tìm thấy món "${productName}" — bỏ qua`);
      continue;
    }
    const itemIds = recipe.map(([k]) => ids.get(k)!);
    // Định mức của món = đúng danh sách dưới đây
    await prisma.productFormula.deleteMany({ where: { productId: product.id, itemId: { notIn: itemIds } } });
    for (const [key, s, m, l] of recipe) {
      const d = byKey.get(key)!;
      const data = { qtyPerUnit: m, qtySizeS: s, qtySizeM: m, qtySizeL: l, recipeUnit: d.recipeUnit, conversionFactor: d.per };
      await prisma.productFormula.upsert({
        where: { productId_itemId: { productId: product.id, itemId: ids.get(key)! } },
        create: { productId: product.id, itemId: ids.get(key)!, ...data },
        update: data,
      });
      lines++;
    }
  }
  console.log(`Định mức: ${Object.keys(RECIPES).length} món, ${lines} dòng`);

  // Giá vốn món = định mức × giá nhập (size M), in kèm S / L và % so với giá bán
  const before = new Map((await prisma.product.findMany({ select: { id: true, costPrice: true } })).map((p) => [p.id, p.costPrice]));
  const costs = await recalcProductCost(prisma);
  const vnd = (n: number) => Math.round(n).toLocaleString("vi-VN");
  for (const p of await prisma.product.findMany({ where: { id: { in: [...costs.keys()] } }, orderBy: { id: "asc" } })) {
    const c = costs.get(p.id)!;
    console.log(`  ${p.name.padEnd(30)} S ${vnd(c.S).padStart(6)} · M ${vnd(c.M).padStart(6)} · L ${vnd(c.L).padStart(6)}  | bán M ${vnd(p.sellPrice)} → ${Math.round((c.M / p.sellPrice) * 100)}% (cũ ghi ${vnd(before.get(p.id) ?? 0)})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
