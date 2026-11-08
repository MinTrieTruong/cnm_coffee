/**
 * Seed dữ liệu mẫu cho trang Khuyến mãi: voucher (công khai + cá nhân), ưu đãi số lượng (BulkPromotion)
 * và bài viết khuyến mãi (Tin tức). Ngày tính từ lúc chạy → luôn còn hạn khi demo.
 * Chạy: npm run db:promos — chạy lại không trùng: voucher / ưu đãi đã có thì chỉ gia hạn (bật lại, dời ngày),
 * không đổi số lượt đã dùng; bài viết đã có thì bỏ qua.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DAY = 86_400_000;
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY);
/** Hết hạn cuối ngày (23:59:59 giờ Việt Nam) */
const endOfDay = (n: number) => {
  const d = daysFromNow(n);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 16, 59, 59));
};

async function main() {
  const product = async (name: string) => prisma.product.findFirst({ where: { name: { contains: name } }, orderBy: { id: "asc" } });
  const stores = await prisma.store.findMany({ where: { isActive: true }, orderBy: { id: "asc" }, select: { id: true, name: true } });
  const secondStore = stores[1] ?? null;

  /* ─────────── Voucher ─────────── */
  type V = {
    code: string; description: string; discountValue: number; minBillValue: number; days: number; quantity: number;
    usedCount?: number; voucherType?: "public" | "personal"; goldHourStart?: number; goldHourEnd?: number; storeIds?: number[];
  };
  const vouchers: V[] = [
    { code: "SANGPHIN15", description: "Giảm 15.000đ cho đơn buổi sáng, áp dụng 6:00–9:00", discountValue: 15000, minBillValue: 59000, days: 45, quantity: 300, usedCount: 42, goldHourStart: 6, goldHourEnd: 9 },
    { code: "TRUA10K", description: "Nghỉ trưa thêm ly cà phê: giảm 10.000đ từ 11:00–13:00", discountValue: 10000, minBillValue: 49000, days: 30, quantity: 500, usedCount: 128, goldHourStart: 11, goldHourEnd: 13 },
    { code: "CUOITUAN25", description: "Cuối tuần hẹn bạn: giảm 25.000đ cho đơn từ 120.000đ", discountValue: 25000, minBillValue: 120000, days: 30, quantity: 200, usedCount: 37 },
    { code: "GIAOHANG20", description: "Bù phí giao hàng 20.000đ cho đơn từ 99.000đ", discountValue: 20000, minBillValue: 99000, days: 60, quantity: 400, usedCount: 95 },
    { code: "MATCHA15", description: "Tháng của matcha: giảm 15.000đ cho đơn từ 70.000đ", discountValue: 15000, minBillValue: 70000, days: 25, quantity: 250, usedCount: 18 },
    { code: "NHOM50K", description: "Đặt nhóm, họp team: giảm 50.000đ cho đơn từ 250.000đ", discountValue: 50000, minBillValue: 250000, days: 90, quantity: 100, usedCount: 9 },
    { code: "SAPHET12", description: "Mã cuối đợt — giảm 12.000đ cho đơn từ 45.000đ", discountValue: 12000, minBillValue: 45000, days: 5, quantity: 80, usedCount: 61 },
    ...(secondStore
      ? [{ code: "KHAITRUONG30", description: `Mừng khai trương ${secondStore.name}: giảm 30.000đ cho đơn từ 100.000đ`, discountValue: 30000, minBillValue: 100000, days: 21, quantity: 150, usedCount: 23, storeIds: [secondStore.id] }]
      : []),
    { code: "SINHNHAT30", description: "Quà sinh nhật: giảm 30.000đ, không yêu cầu giá trị đơn", discountValue: 30000, minBillValue: 0, days: 120, quantity: -1, voucherType: "personal" },
    { code: "QUAYLAI20", description: "Lâu rồi chưa gặp — giảm 20.000đ cho đơn từ 60.000đ", discountValue: 20000, minBillValue: 60000, days: 30, quantity: 300, voucherType: "personal" },
  ];
  let nv = 0;
  let rv = 0;
  for (const v of vouchers) {
    if (await prisma.voucher.findUnique({ where: { code: v.code } })) {
      await prisma.voucher.update({ where: { code: v.code }, data: { startDate: daysFromNow(-3), endDate: endOfDay(v.days), isActive: true } });
      rv++;
      continue;
    }
    await prisma.voucher.create({
      data: {
        code: v.code, description: v.description, discountValue: v.discountValue, minBillValue: v.minBillValue,
        startDate: daysFromNow(-3), endDate: endOfDay(v.days), quantity: v.quantity, usedCount: v.usedCount ?? 0,
        voucherType: v.voucherType ?? "public", goldHourStart: v.goldHourStart ?? null, goldHourEnd: v.goldHourEnd ?? null,
        ...(v.storeIds && { stores: { create: v.storeIds.map((storeId) => ({ storeId })) } }),
      },
    });
    nv++;
  }
  console.log(`Voucher: tạo ${nv}, gia hạn ${rv}.`);

  /* ─────────── Ưu đãi số lượng ─────────── */
  const owner = await prisma.staff.findFirst({ where: { role: "Owner" }, select: { id: true } });
  if (!owner) {
    console.log("Chưa có tài khoản Owner — bỏ qua ưu đãi số lượng.");
  } else {
    const catByName = async (name: string) => (await prisma.category.findFirst({ where: { name: { contains: name } } }))?.id;
    const phinCat = await catByName("Phin");
    const teaCats = (await Promise.all([catByName("Trà Trái Cây"), catByName("Trà Sữa")])).filter((x): x is number => x != null);
    const croissant = await product("Sừng Trâu");
    const tiramisu = await product("Tiramisu");

    type Tier = { minQty: number; percentOff?: number; maxDiscount?: number; amountOff?: number; freeShipping?: boolean; buyQty?: number; getQty?: number; giftProductId?: number | null; giftQty?: number };
    type P = {
      name: string; description: string; days: number; daysOfWeek?: string; startMin?: number; endMin?: number;
      dineIn?: boolean; takeaway?: boolean; delivery?: boolean; scope: string; categoryIds?: number[]; allowVoucher?: boolean; tiers: Tier[];
    };
    const promos: P[] = [
      {
        name: "Rủ bạn cùng uống", description: "Đặt càng nhiều ly càng giảm sâu — tính mọi món nước có size.",
        days: 30, scope: "DRINKS",
        tiers: [{ minQty: 2, percentOff: 10, maxDiscount: 20000 }, { minQty: 4, percentOff: 15, maxDiscount: 50000 }, { minQty: 6, percentOff: 20, maxDiscount: 90000, freeShipping: true }],
      },
      ...(phinCat
        ? [{
            name: "Sáng nào cũng phin", description: "Thứ Hai đến thứ Sáu, 6:00–9:00: cà phê phin mua 2 tặng 1.",
            days: 45, daysOfWeek: "1,2,3,4,5", startMin: 6 * 60, endMin: 9 * 60, delivery: false, scope: "CATEGORIES", categoryIds: [phinCat],
            tiers: [{ minQty: 3, buyQty: 2, getQty: 1 }],
          }]
        : []),
      ...(teaCats.length && croissant
        ? [{
            name: "Trà chiều có bánh", description: "14:00–17:00 mỗi ngày: trà trái cây, trà sữa từ 2 ly tặng bánh.",
            days: 30, startMin: 14 * 60, endMin: 17 * 60, scope: "CATEGORIES", categoryIds: teaCats, allowVoucher: true,
            tiers: [
              { minQty: 2, giftProductId: croissant.id, giftQty: 1 },
              { minQty: 4, giftProductId: (tiramisu ?? croissant).id, giftQty: 1, amountOff: 10000 },
            ],
          }]
        : []),
      {
        name: "Đặt nhóm văn phòng", description: "Đơn giao hàng từ 10 món: giảm 15% và miễn phí giao. Dùng chung được với voucher.",
        days: 60, dineIn: false, takeaway: false, delivery: true, scope: "ALL", allowVoucher: true,
        tiers: [{ minQty: 10, percentOff: 15, maxDiscount: 100000, freeShipping: true }, { minQty: 20, percentOff: 20, maxDiscount: 200000, freeShipping: true }],
      },
    ];
    let np = 0;
    let rp = 0;
    for (const p of promos) {
      const cur = await prisma.bulkPromotion.findFirst({ where: { name: p.name }, select: { id: true } });
      if (cur) {
        await prisma.bulkPromotion.update({ where: { id: cur.id }, data: { startAt: daysFromNow(-2), endAt: endOfDay(p.days), isActive: true } });
        rp++;
        continue;
      }
      await prisma.bulkPromotion.create({
        data: {
          name: p.name, description: p.description, isActive: true, startAt: daysFromNow(-2), endAt: endOfDay(p.days),
          daysOfWeek: p.daysOfWeek ?? null, startMin: p.startMin ?? null, endMin: p.endMin ?? null,
          dineIn: p.dineIn ?? true, takeaway: p.takeaway ?? true, delivery: p.delivery ?? true,
          allStores: true, scope: p.scope, allowVoucher: p.allowVoucher ?? false, createdById: owner.id,
          tiers: {
            create: p.tiers.map((t) => ({
              minQty: t.minQty, percentOff: t.percentOff ?? 0, maxDiscount: t.maxDiscount ?? 0, amountOff: t.amountOff ?? 0,
              freeShipping: t.freeShipping ?? false, buyQty: t.buyQty ?? 0, getQty: t.getQty ?? 0,
              giftProductId: t.giftProductId ?? null, giftQty: t.giftProductId ? t.giftQty ?? 1 : 0,
            })),
          },
          ...(p.categoryIds && { categories: { create: p.categoryIds.map((categoryId) => ({ categoryId })) } }),
        },
      });
      np++;
    }
    console.log(`Ưu đãi số lượng: tạo ${np}, gia hạn ${rp}.`);
  }

  /* ─────────── Bài viết khuyến mãi (Tin tức) ─────────── */
  const img = async (name: string) => (await product(name))?.imageUrl ?? null;
  const posts = [
    {
      title: "Sáng nào cũng phin: mua 2 tặng 1 từ 6 đến 9 giờ",
      image: await img("Đen Đá"),
      pinned: true,
      body: `<p><em>Ly phin đầu ngày không cần phải uống một mình.</em></p><p>Từ thứ Hai đến thứ Sáu, trong khung <strong>6:00–9:00</strong>, gọi 3 ly cà phê phin bất kỳ (đen đá, sữa đá, bạc xỉu, cà phê muối…) thì ly rẻ nhất được tính <strong>0đ</strong>. Áp dụng tại quán và mang về, tự trừ khi thanh toán — không cần nhập mã.</p><p>Đi một mình? Nhập mã <strong>SANGPHIN15</strong> để giảm 15.000đ cho đơn từ 59.000đ trong cùng khung giờ.</p><p>Robusta Buôn Ma Thuột rang mộc, pha phin nhôm từng ly, sữa đặc rót tay. Ghé sớm để kịp chỗ ngồi cạnh cửa sổ nhé.</p>`,
    },
    {
      title: "Rủ bạn cùng uống — càng đông càng giảm, tới 20%",
      image: await img("Bạc Xỉu"),
      pinned: false,
      body: `<p><em>Hai ly giảm 10%, bốn ly giảm 15%, sáu ly giảm 20% và miễn phí giao.</em></p><p>Chương trình <strong>Rủ bạn cùng uống</strong> tính cho mọi món nước có size: cà phê, trà trái cây, trà sữa, matcha. Ưu đãi tự áp ngay trong giỏ hàng, giỏ hàng còn gợi ý thêm mấy ly nữa để lên bậc kế tiếp.</p><ul><li>Từ 2 ly: giảm 10% (tối đa 20.000đ)</li><li>Từ 4 ly: giảm 15% (tối đa 50.000đ)</li><li>Từ 6 ly: giảm 20% (tối đa 90.000đ) + miễn phí giao</li></ul><p>Lưu ý: chương trình không dùng chung với mã giảm giá — hệ thống tự chọn mức có lợi hơn cho bạn.</p>`,
    },
    {
      title: "Trà chiều có bánh: 2 ly trà tặng một bánh sừng trâu",
      image: await img("Oolong Nướng"),
      pinned: false,
      body: `<p><em>Ba giờ chiều, ly trà đào cam sả và một chiếc croissant còn ấm.</em></p><p>Từ <strong>14:00 đến 17:00</strong> mỗi ngày, gọi 2 ly trà trái cây hoặc trà sữa được tặng 1 bánh sừng trâu. Gọi từ 4 ly: tặng bánh tiramisu và giảm thêm 10.000đ.</p><p>Bánh tặng được thêm thẳng vào đơn với giá 0đ. Chương trình dùng chung được với voucher, áp dụng cả giao hàng.</p>`,
    },
    {
      title: "Tháng của matcha: nhập MATCHA15 giảm 15.000đ",
      image: await img("Matcha Latte"),
      pinned: false,
      body: `<p><em>Matcha Uji pha với sữa tươi thanh trùng, ngọt vừa, không gắt.</em></p><p>Cả tháng này, nhập mã <strong>MATCHA15</strong> ở bước xác nhận đơn để giảm 15.000đ cho đơn từ 70.000đ. Gợi ý cho người mới: <strong>Matcha Latte đá</strong> ít ngọt, hoặc <strong>Sữa tươi matcha trân châu</strong> nếu bạn thích nhai.</p><p>Số lượng mã có hạn, mỗi tài khoản dùng một lần.</p>`,
    },
    {
      title: "Đặt nhóm cho văn phòng: giảm 15%, miễn phí giao",
      image: await img("Trà Sữa Truyền Thống"),
      pinned: false,
      body: `<p><em>Họp đầu tuần, sinh nhật đồng nghiệp hay chiều thứ Sáu cần chút đường.</em></p><p>Đơn giao hàng từ <strong>10 món</strong> được giảm 15% (tối đa 100.000đ) và miễn phí giao; từ <strong>20 món</strong> giảm 20% (tối đa 200.000đ). Ưu đãi tự áp, dùng chung được với mã <strong>NHOM50K</strong> (giảm 50.000đ cho đơn từ 250.000đ).</p><p>Ghi chú tên từng người trên ly trong phần ghi chú món — quán dán nhãn sẵn để chia cho nhanh.</p>`,
    },
    ...(secondStore
      ? [{
          title: `Mừng khai trương ${secondStore.name}: giảm 30.000đ với mã KHAITRUONG30`,
          image: await img("Latte"),
          pinned: false,
          body: `<p><em>Thêm một địa chỉ để ghé, thêm một lý do để ở lại lâu hơn.</em></p><p>Trong 3 tuần đầu, nhập mã <strong>KHAITRUONG30</strong> khi đặt tại <strong>${secondStore.name}</strong> để được giảm 30.000đ cho đơn từ 100.000đ. Mã chỉ áp dụng tại chi nhánh này — nhớ chọn đúng chi nhánh trước khi đặt.</p><p>Quán có phòng lạnh, ổ cắm ở mọi bàn và chỗ đậu xe máy rộng. Hẹn gặp bạn!</p>`,
        }]
      : []),
  ];
  let nb = 0;
  for (const p of posts) {
    if (await prisma.post.findFirst({ where: { title: p.title } })) continue;
    await prisma.post.create({ data: { title: p.title, body: p.body, imageUrl: p.image, pinned: p.pinned, isPublished: true } });
    nb++;
  }
  console.log(`Bài khuyến mãi: tạo ${nb}/${posts.length}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
