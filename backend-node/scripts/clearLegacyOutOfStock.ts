/**
 * Dọn cờ "Hết hàng" cũ ở món chung (Products.Out_Of_Stock).
 * Hết hàng giờ là trạng thái theo chi nhánh (Store_Products.Out_Of_Stock); cờ ở món chung còn sót từ trước khi có chuỗi
 * làm món hết ở MỌI chi nhánh và chi nhánh không bỏ tick được (menu tính "món chung || chi nhánh").
 *
 *   npm run db:clear-oos                         — chỉ liệt kê món còn cờ cũ, không ghi gì
 *   npm run db:clear-oos -- --apply              — xóa cờ cũ → món có hàng lại ở mọi chi nhánh
 *   npm run db:clear-oos -- --apply --to-stores  — chuyển cờ cũ thành "hết hàng" tại từng chi nhánh đang hoạt động rồi xóa
 *                                                  (menu khách không đổi; chi nhánh tự bỏ tick khi có hàng)
 *
 * Backend đang chạy giữ bộ nhớ đệm menu (gọi món bằng giọng nói/AI) — khởi động lại sau khi --apply.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const toStores = process.argv.includes("--to-stores");

async function main() {
  const products = await prisma.product.findMany({ where: { outOfStock: true }, select: { id: true, name: true }, orderBy: { id: "asc" } });
  if (!products.length) return console.log("Không còn món nào mang cờ hết hàng cũ.");
  console.log(`${products.length} món còn cờ hết hàng cũ:`);
  for (const p of products) console.log(`  #${p.id} ${p.name}`);
  if (!apply) return console.log("\nChưa ghi gì. Thêm -- --apply để xóa (kèm --to-stores để giữ hết hàng tại từng chi nhánh).");

  const ids = products.map((p) => p.id);
  const stores = toStores ? await prisma.store.findMany({ where: { isActive: true }, select: { id: true } }) : [];
  await prisma.$transaction([
    ...stores.flatMap((s) =>
      ids.map((productId) =>
        prisma.storeProduct.upsert({
          where: { storeId_productId: { storeId: s.id, productId } },
          update: { outOfStock: true },
          create: { storeId: s.id, productId, outOfStock: true },
        }),
      ),
    ),
    prisma.product.updateMany({ where: { id: { in: ids } }, data: { outOfStock: false } }),
  ]);
  console.log(
    toStores
      ? `\nĐã chuyển ${ids.length} món sang "hết hàng" tại ${stores.length} chi nhánh và xóa cờ ở món chung.`
      : `\nĐã xóa cờ hết hàng cũ của ${ids.length} món — có hàng lại ở mọi chi nhánh (trừ nơi tự báo hết).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
