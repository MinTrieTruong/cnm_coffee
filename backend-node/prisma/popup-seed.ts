/**
 * Seed 3 pop up demo (cả chuỗi, đang bật): mini game, voucher đơn đầu tiên, món mới.
 * Chạy: npm run db:popups — đã có pop up cùng tên thì bỏ qua.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const IMG = {
  game: "https://images.unsplash.com/photo-1513151233558-d860c5398176?w=800&q=80",
  voucher: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80",
  matcha: "https://images.unsplash.com/photo-1515823064-d6e0c04616a7?w=800&q=80",
};

async function upsertPopup(name: string, data: Omit<Parameters<typeof prisma.popup.create>[0]["data"], "name">) {
  if (await prisma.popup.findFirst({ where: { name } })) {
    console.log(`Đã có "${name}" — bỏ qua.`);
    return;
  }
  await prisma.popup.create({ data: { name, ...data } });
  console.log(`Tạo pop up "${name}".`);
}

async function main() {
  const game = await prisma.gameCampaign.findFirst({ where: { isActive: true, endAt: { gte: new Date() } }, orderBy: { id: "asc" } });
  if (game) {
    await upsertPopup(game.name, {
      description: "<p>Mỗi đơn từ <strong>50.000đ</strong> được 1 lượt quay. Trúng <strong>nón bảo hiểm</strong>, voucher, điểm thưởng và nhiều quà khác!</p>",
      imageUrl: IMG.game, targetType: "MINIGAME", targetRef: String(game.id), buttonText: "Quay ngay", sortOrder: 1, isActive: true,
      endAt: game.endAt, frequency: "DAILY",
    });
  } else console.log("Chưa có chiến dịch mini game — bỏ qua pop up mini game (chạy npm run db:games trước).");

  // Hệ thống voucher giảm theo số tiền cố định → voucher chào mừng giảm 20.000đ, dành cho khách lưu vào ví
  const end = new Date("2026-12-31T23:59:59+07:00");
  const v = await prisma.voucher.upsert({
    where: { code: "CHAO20K" },
    update: {},
    create: { code: "CHAO20K", description: "Giảm 20.000đ cho đơn đầu tiên từ 60.000đ", discountValue: 20_000, minBillValue: 60_000, endDate: end, quantity: 1000, voucherType: "personal" },
  });
  await upsertPopup("Giảm 20.000đ đơn đầu tiên", {
    description: "<p>Chào bạn mới! Lưu voucher <strong>CHAO20K</strong> vào ví để được giảm <strong>20.000đ</strong> cho đơn đầu tiên từ 60.000đ.</p>",
    imageUrl: IMG.voucher, targetType: "VOUCHER", targetRef: String(v.id), buttonText: "Lưu voucher", sortOrder: 2, isActive: true,
    audience: "NEW", frequency: "ONCE",
  });

  const matcha = (await prisma.product.findFirst({ where: { isActive: true, name: { contains: "Matcha" } } })) ?? (await prisma.product.findFirst({ where: { isActive: true } }));
  if (matcha) {
    await upsertPopup("Món mới: Matcha Latte", {
      description: `<p>Thử ngay <strong>${matcha.name}</strong> — vị trà xanh thanh mát, béo nhẹ, chỉ ${matcha.sellPrice.toLocaleString("vi-VN")}đ.</p>`,
      imageUrl: matcha.imageUrl || IMG.matcha, targetType: "PRODUCT", targetRef: String(matcha.id), buttonText: "Xem món", sortOrder: 3, isActive: true,
      frequency: "DAILY",
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
