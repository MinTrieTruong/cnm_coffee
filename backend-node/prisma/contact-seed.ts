/**
 * Seed nút liên hệ demo: mặc định cả chuỗi (Gọi ngay, Zalo, Messenger) + chi nhánh 2 có hotline riêng.
 * Chạy: npm run db:contacts — đã có nút thì bỏ qua. Link Messenger là ví dụ: quản lý sửa trong Cấu hình › Nút liên hệ.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (await prisma.contactButton.count()) {
    console.log("Đã có nút liên hệ — bỏ qua.");
    return;
  }
  // Hotline chung lấy từ số đang in ở chân trang web
  const hotline = "0389730362";
  await prisma.contactButton.createMany({
    data: [
      { storeId: null, type: "PHONE", label: "Gọi ngay", value: hotline, sortOrder: 1 },
      { storeId: null, type: "ZALO", label: "Chat Zalo", value: `https://zalo.me/${hotline}`, sortOrder: 2 },
      { storeId: null, type: "MESSENGER", label: "Nhắn Messenger", value: "https://m.me/tdcoffee", sortOrder: 3 },
    ],
  });
  const store2 = await prisma.store.findFirst({ where: { isActive: true }, orderBy: { id: "desc" } });
  if (store2) {
    const own = store2.phone?.replace(/\D/g, "") || "0901234567";
    await prisma.contactButton.create({ data: { storeId: store2.id, type: "PHONE", label: "Gọi chi nhánh", value: own, sortOrder: 1 } });
    console.log(`Chi nhánh "${store2.name}" có hotline riêng ${own}.`);
  }
  console.log("Đã tạo nút liên hệ mặc định cả chuỗi.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
