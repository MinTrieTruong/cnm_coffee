/**
 * Bánh / đồ ăn: món 1 loại, bán 1 cái trừ thẳng 1 cái trong kho, giá vốn = giá nhập.
 *  - Món thuộc danh mục "Đồ ăn" / "Bánh" (và danh mục con) → hasSizes = false, bỏ giá size S/L
 *  - Món chưa có công thức → tạo nguyên liệu kho "<tên món> (Cái)" với giá nhập = giá vốn đang nhập tay,
 *    công thức 1 cái / món, tồn 0 ở mọi chi nhánh (nhập kho qua đơn mua hoặc nhập tay)
 *  - Tính lại giá vốn món từ công thức (= giá nhập của nguyên liệu)
 * Chạy lại nhiều lần không sao: món đã có công thức thì bỏ qua.
 *
 *   npm run db:cakes
 */
import { PrismaClient } from "@prisma/client";
import { recalcProductCost } from "../src/lib/productCost.js";

const prisma = new PrismaClient();
const FOOD = /đồ ăn|bánh/i;

async function main() {
  const cats = await prisma.category.findMany();
  const food = new Set(cats.filter((c) => FOOD.test(c.name)).map((c) => c.id));
  for (const c of cats) if (c.parentId != null && food.has(c.parentId)) food.add(c.id);
  const products = await prisma.product.findMany({ where: { categoryId: { in: [...food] } }, include: { formulas: true } });
  const stores = await prisma.store.findMany({ select: { id: true } });
  console.log(`Danh mục đồ ăn: ${cats.filter((c) => food.has(c.id)).map((c) => c.name).join(", ") || "(không có)"} — ${products.length} món`);

  for (const p of products) {
    await prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: p.id }, data: { hasSizes: false, priceSizeS: null, priceSizeL: null } });
      if (p.formulas.length) {
        // Đã có công thức: chỉ bỏ định mức theo size
        await tx.productFormula.updateMany({ where: { productId: p.id }, data: { qtySizeS: null, qtySizeM: null, qtySizeL: null } });
        console.log(`  #${p.id} ${p.name}: đã có công thức — chỉ bỏ size`);
        return;
      }
      const name = `${p.name} (Cái)`;
      let item = await tx.inventoryItem.findFirst({ where: { name } });
      if (!item) {
        const maxId = (await tx.inventoryItem.aggregate({ _max: { id: true } }))._max.id ?? 0;
        item = await tx.inventoryItem.create({
          data: { id: maxId + 1, name, category: "Bánh & đồ ăn", unit: "Cái", recipeUnit: "cái", recipePerUnit: 1, unitCostPrice: p.costPrice },
        });
        for (const s of stores) {
          await tx.storeInventory.upsert({ where: { storeId_itemId: { storeId: s.id, itemId: item.id } }, update: {}, create: { storeId: s.id, itemId: item.id, stockQty: 0 } });
        }
      }
      await tx.productFormula.create({
        data: { productId: p.id, itemId: item.id, qtyPerUnit: 1, recipeUnit: "cái", conversionFactor: 1, note: "1 cái / món" },
      });
      await recalcProductCost(tx, [p.id]);
      const after = await tx.product.findUniqueOrThrow({ where: { id: p.id }, select: { costPrice: true } });
      console.log(`  #${p.id} ${p.name}: nguyên liệu #${item.id} "${item.name}" giá nhập ${item.unitCostPrice} → giá vốn ${after.costPrice}`);
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
