/**
 * Seed 3 banner trang chủ bằng ảnh món có sẵn (chữ poster đặt trên ảnh). Quản lý thay ảnh thật ở Website › Banner.
 * Chạy: npm run db:site — đã có banner thì bỏ qua.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (await prisma.banner.count()) {
    console.log("Đã có banner — bỏ qua.");
    return;
  }
  const pick = async (kw: string) =>
    prisma.product.findFirst({ where: { isActive: true, imageUrl: { not: null }, name: { contains: kw } }, orderBy: { id: "asc" } });
  const fallback = await prisma.product.findMany({ where: { isActive: true, imageUrl: { not: null } }, orderBy: { id: "asc" }, take: 3 });
  const items = [
    { p: (await pick("Phin")) ?? (await pick("Đen")) ?? fallback[0], title: "Cà phê phin Sài Gòn", subtitle: "Rang mộc, pha phin mỗi sáng — đậm mà không gắt" },
    { p: (await pick("Bạc Xỉu")) ?? fallback[1], title: "Bạc xỉu đá", subtitle: "Sữa đặc, sữa tươi và một chút cà phê — ly quen của dân văn phòng" },
    { p: (await pick("Matcha")) ?? fallback[2], title: "Matcha latte mới", subtitle: "Trà xanh Nhật, sữa tươi thanh — thử ngay trong tháng này" },
  ];
  let i = 0;
  for (const it of items) {
    if (!it.p?.imageUrl) continue;
    await prisma.banner.create({
      data: { imageUrl: it.p.imageUrl, title: it.title, subtitle: it.subtitle, link: `/product/${it.p.id}`, sortOrder: ++i },
    });
  }
  console.log(`Đã tạo ${i} banner.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
