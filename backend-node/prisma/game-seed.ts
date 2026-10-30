/**
 * Seed demo mini game: chiến dịch "Vòng quay tháng 11" (cả chuỗi, 8 ô) + ~40 lượt quay mẫu.
 * Chạy: npm run db:games  (chạy lại không tạo trùng — đã có chiến dịch cùng tên thì bỏ qua)
 * Lượt quay mẫu đi qua đúng luồng thật (playCampaign) nên số lượng giải / ví voucher / điểm / mã nhận quà đều khớp.
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { deliverClaim, playCampaign } from "../src/games/service.js";

const prisma = new PrismaClient();
const NAME = "Vòng quay tháng 11";

const DEMO_CUSTOMERS = [
  ["Nguyễn Minh Anh", "0901000001"], ["Trần Quốc Bảo", "0901000002"], ["Lê Thu Hà", "0901000003"],
  ["Phạm Gia Huy", "0901000004"], ["Võ Ngọc Lan", "0901000005"], ["Đặng Hoàng Nam", "0901000006"],
  ["Bùi Khánh Linh", "0901000007"], ["Hồ Thanh Tâm", "0901000008"], ["Dương Bảo Ngọc", "0901000009"],
  ["Ngô Đức Thịnh", "0901000010"], ["Lý Mỹ Duyên", "0901000011"], ["Phan Tuấn Kiệt", "0901000012"],
] as const;

async function main() {
  if (await prisma.gameCampaign.findFirst({ where: { name: NAME } })) {
    console.log(`Đã có chiến dịch "${NAME}" — bỏ qua.`);
    return;
  }
  const stores = await prisma.store.findMany({ where: { isActive: true }, select: { id: true } });
  if (!stores.length) throw new Error("Chưa có chi nhánh — chạy db:seed trước.");
  const endAt = new Date("2026-11-30T23:59:59+07:00");
  const startAt = new Date(Date.now() - 5 * 86_400_000);

  // Khách demo (Customer.id không tự tăng)
  const hash = await bcrypt.hash("123456", 10);
  let nextId = ((await prisma.customer.aggregate({ _max: { id: true } }))._max.id ?? 0) + 1;
  for (const [fullName, phone] of DEMO_CUSTOMERS) {
    if (await prisma.customer.findUnique({ where: { phone } })) continue;
    await prisma.customer.create({ data: { id: nextId++, fullName, phone, passwordHash: hash } });
  }

  // Quà hiện vật + tồn từng chi nhánh
  const helmet = await prisma.giftItem.create({ data: { name: "Nón bảo hiểm TD Coffee", value: 85_000, note: "Quà vòng quay tháng 11" } });
  const upsize = await prisma.giftItem.create({ data: { name: "Phiếu nâng size miễn phí", value: 6_000, note: "Nâng size M → L cho 1 ly bất kỳ" } });
  const per = Math.ceil(30 / stores.length);
  for (const s of stores) {
    await prisma.giftStock.create({ data: { giftItemId: helmet.id, storeId: s.id, qty: per } });
    await prisma.giftStock.create({ data: { giftItemId: upsize.id, storeId: s.id, qty: 300 } });
  }

  // Voucher cá nhân chỉ phát qua vòng quay (hệ thống voucher hiện giảm theo số tiền cố định)
  const mkVoucher = (code: string, value: number, description: string) =>
    prisma.voucher.upsert({
      where: { code },
      update: {},
      create: { code, discountValue: value, minBillValue: value * 3, endDate: endAt, quantity: 500, voucherType: "personal", description },
    });
  const v20 = await mkVoucher("VQT11-20K", 20_000, "Giảm 20.000đ — quà vòng quay tháng 11");
  const v15 = await mkVoucher("VQT11-15K", 15_000, "Giảm 15.000đ — quà vòng quay tháng 11");

  const bacXiu = await prisma.product.findFirst({ where: { name: { contains: "Bạc Xỉu" } } });
  if (!bacXiu) throw new Error("Không tìm thấy món Bạc Xỉu trong thực đơn.");

  const campaign = await prisma.gameCampaign.create({
    data: {
      gameType: "WHEEL", name: NAME, description: "Mỗi đơn từ 50.000đ được 1 lượt quay. Quà hiện vật nhận tại quầy trong 7 ngày.",
      startAt, endAt, isActive: true, allStores: true,
      config: { backgroundUrl: null, wheelColor: "#FFF7ED", borderColor: "#92400E" },
      minOrderValue: 50_000, maxPlaysPerDay: 100, allowPointExchange: true, pointsPerTicket: 5_000, claimDays: 7,
      prizes: {
        create: [
          { kind: "PRODUCT", productId: bacXiu.id, label: "1 ly Bạc Xỉu", imageUrl: bacXiu.imageUrl, weight: 8, quantity: 50, sortOrder: 0, color: "#FDE68A" },
          { kind: "PRODUCT", giftItemId: helmet.id, label: "Nón bảo hiểm TD Coffee", weight: 2, quantity: 30, dailyLimit: 3, sortOrder: 1, color: "#FFFFFF" },
          { kind: "VOUCHER", voucherId: v20.id, label: "Voucher giảm 20.000đ", weight: 10, quantity: 200, sortOrder: 2, color: "#BFDBFE" },
          { kind: "VOUCHER", voucherId: v15.id, label: "Voucher giảm 15.000đ", weight: 15, quantity: 300, sortOrder: 3, color: "#FFFFFF" },
          { kind: "POINTS", points: 10_000, label: "10.000 điểm", weight: 3, quantity: 20, sortOrder: 4, color: "#FED7AA" },
          { kind: "POINTS", points: 2_000, label: "2.000 điểm", weight: 20, sortOrder: 5, color: "#FFFFFF" },
          { kind: "PRODUCT", giftItemId: upsize.id, label: "Nâng size miễn phí", weight: 17, quantity: 400, sortOrder: 6, color: "#BBF7D0" },
          { kind: "NONE", label: "Chúc bạn may mắn lần sau", weight: 25, sortOrder: 7, color: "#E7E5E4" },
        ],
      },
    },
  });

  // ~40 lượt quay mẫu qua luồng thật
  const customers = await prisma.customer.findMany({ where: { phone: { in: DEMO_CUSTOMERS.map((c) => c[1]) } }, select: { id: true } });
  const staff = await prisma.staff.findFirst({ where: { role: "Admin" }, select: { id: true, storeId: true } });
  let n = 0;
  for (let i = 0; i < 40; i++) {
    const c = customers[i % customers.length];
    const storeId = stores[i % stores.length].id;
    await prisma.gameTicket.create({ data: { customerId: c.id, campaignId: campaign.id, source: "ADMIN", expiresAt: endAt } });
    const r = await playCampaign(prisma, { campaignId: campaign.id, customerId: c.id, storeId });
    // Rải thời điểm quay trong 5 ngày gần đây cho danh sách trúng thưởng giống thật
    const at = new Date(Date.now() - Math.floor(Math.random() * 5 * 86_400_000));
    await prisma.gamePlay.update({ where: { id: r.playId }, data: { playedAt: at } });
    // Một nửa số quà hiện vật đã được trao
    if (r.giftClaim && staff && i % 2 === 0) {
      await deliverClaim(prisma, r.giftClaim.code, staff, r.giftClaim.storeId ?? staff.storeId ?? storeId).catch(() => null);
    }
    n++;
  }
  await prisma.gameCampaign.update({ where: { id: campaign.id }, data: { maxPlaysPerDay: 3 } });
  console.log(`Đã tạo "${NAME}" (#${campaign.id}) với 8 ô và ${n} lượt quay mẫu.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
