/**
 * seedVouchers.ts
 * Tạo dữ liệu mẫu mã giảm giá (voucher) cho trang Ưu đãi của khách.
 * - discountValue là số tiền giảm cố định (VNĐ), quantity = -1 nghĩa là không giới hạn.
 * - Ngày hết hạn tính từ lúc chạy script, nên chạy lại để "làm mới" hạn dùng khi demo.
 * Chạy: npx tsx scripts/seedVouchers.ts   (hoặc npm run seed:vouchers)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;

type VoucherSeed = {
  code: string;
  description: string;
  discountValue: number;
  minBillValue: number;
  daysValid: number;
  quantity: number;
  voucherType?: "public" | "personal";
  goldHourStart?: number;
  goldHourEnd?: number;
};

const vouchers: VoucherSeed[] = [
  {
    code: "CHAOBANMOI",
    description: "Chào bạn mới — giảm 20.000đ cho đơn đầu tiên từ 50.000đ.",
    discountValue: 20000,
    minBillValue: 50000,
    daysValid: 90,
    quantity: 500,
  },
  {
    code: "TDCOFFEE15",
    description: "Giảm 15.000đ cho mọi đơn từ 99.000đ, áp dụng tất cả chi nhánh.",
    discountValue: 15000,
    minBillValue: 99000,
    daysValid: 60,
    quantity: -1,
  },
  {
    code: "SANGKHOE",
    description: "Giờ vàng buổi sáng 6h–10h: giảm 10.000đ cho đơn từ 45.000đ.",
    discountValue: 10000,
    minBillValue: 45000,
    daysValid: 45,
    quantity: 300,
    goldHourStart: 6,
    goldHourEnd: 10,
  },
  {
    code: "CHIEUCHILL",
    description: "Xế chiều 14h–17h: giảm 12.000đ cho đơn từ 60.000đ.",
    discountValue: 12000,
    minBillValue: 60000,
    daysValid: 45,
    quantity: 300,
    goldHourStart: 14,
    goldHourEnd: 17,
  },
  {
    code: "CUOITUAN30",
    description: "Cuối tuần thảnh thơi — giảm 30.000đ cho đơn từ 200.000đ.",
    discountValue: 30000,
    minBillValue: 200000,
    daysValid: 30,
    quantity: 200,
  },
  {
    code: "FREESHIP25",
    description: "Hỗ trợ phí giao hàng 25.000đ cho đơn giao tận nơi từ 120.000đ.",
    discountValue: 25000,
    minBillValue: 120000,
    daysValid: 30,
    quantity: 150,
  },
  {
    code: "TIECVANPHONG50",
    description: "Đặt cho cả văn phòng — giảm 50.000đ cho đơn từ 400.000đ.",
    discountValue: 50000,
    minBillValue: 400000,
    daysValid: 60,
    quantity: 100,
  },
  {
    code: "SINHNHAT40",
    description: "Quà sinh nhật dành riêng cho thành viên — giảm 40.000đ, không cần đơn tối thiểu.",
    discountValue: 40000,
    minBillValue: 0,
    daysValid: 365,
    quantity: -1,
    voucherType: "personal",
  },
];

async function main() {
  const now = new Date();
  console.log("Bắt đầu seed voucher...");

  for (const v of vouchers) {
    const data = {
      description: v.description,
      discountValue: v.discountValue,
      minBillValue: v.minBillValue,
      startDate: now,
      endDate: new Date(now.getTime() + v.daysValid * DAY),
      quantity: v.quantity,
      isActive: true,
      voucherType: v.voucherType ?? "public",
      goldHourStart: v.goldHourStart ?? null,
      goldHourEnd: v.goldHourEnd ?? null,
    };
    // Upsert theo code: chạy lại chỉ gia hạn/cập nhật, không đụng usedCount.
    await prisma.voucher.upsert({
      where: { code: v.code },
      update: data,
      create: { code: v.code, ...data },
    });
    console.log(`  ✓ ${v.code} (−${v.discountValue.toLocaleString("vi-VN")}đ)`);
  }

  console.log(`Xong: ${vouchers.length} voucher.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
