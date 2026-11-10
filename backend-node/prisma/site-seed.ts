/**
 * Dữ liệu mẫu web khách cho CSDL đang chạy. Chạy: npm run db:site — chạy lại nhiều lần không ghi đè dữ liệu chủ quán đã sửa.
 *  - Ảnh danh mục: chỉ gán cho danh mục đang chưa có ảnh (tìm theo tên)
 *  - Ảnh món: thay các link Unsplash mẫu đã chết (404) — chỉ đúng các link đó
 *  - 3 banner trang chủ bằng ảnh món có sẵn (đã có banner thì bỏ qua). Quản lý thay ảnh thật ở Website › Banner.
 */
import { PrismaClient } from "@prisma/client";
import { categoryImageByName, categoryImages, deadProductImages } from "./sample-images.js";

const prisma = new PrismaClient();

async function sampleImages() {
  let cats = 0;
  for (const c of await prisma.category.findMany({ where: { imageUrl: null } })) {
    const hit = categoryImageByName.find(([kw]) => c.name.toLocaleLowerCase("vi").includes(kw.toLocaleLowerCase("vi")));
    if (!hit) continue;
    await prisma.category.update({ where: { id: c.id }, data: { imageUrl: categoryImages[hit[1]] } });
    cats++;
  }
  let prods = 0;
  for (const [dead, alive] of Object.entries(deadProductImages)) prods += (await prisma.product.updateMany({ where: { imageUrl: dead }, data: { imageUrl: alive } })).count;
  console.log(`Ảnh danh mục: gán ${cats}. Ảnh món hỏng: thay ${prods}.`);
}

async function main() {
  await sampleImages();
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
