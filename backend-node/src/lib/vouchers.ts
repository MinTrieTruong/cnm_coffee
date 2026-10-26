import type { PrismaClient } from "@prisma/client";
import { voucherStoreError } from "./stores.js";

/**
 * Kiểm tra voucher cho 1 đơn và trả về giá trị giảm lấy từ DB — không bao giờ tin số tiền trình duyệt gửi lên.
 * Quy tắc: còn hoạt động, trong hạn, đúng giờ vàng, đủ giá trị tối thiểu, còn lượt (-1 = không giới hạn),
 * áp dụng tại chi nhánh, voucher cá nhân phải có trong ví, mỗi khách chỉ dùng 1 lần.
 */
export async function resolveVoucher(
  prisma: PrismaClient,
  code: string | null | undefined,
  ctx: { subTotal: number; storeId: number | null; customerId: number | null },
): Promise<{ voucherCode: string | null; voucherDiscount: number; voucherId: number | null } | { error: string }> {
  if (!code?.trim()) return { voucherCode: null, voucherDiscount: 0, voucherId: null };
  const voucher = await prisma.voucher.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!voucher) return { error: "Mã voucher không tồn tại." };
  if (!voucher.isActive) return { error: "Voucher đã bị khóa." };

  const storeErr = await voucherStoreError(prisma, voucher.id, ctx.storeId);
  if (storeErr) return { error: storeErr };

  const now = new Date();
  if (voucher.startDate > now) return { error: "Voucher chưa đến ngày hiệu lực." };
  if (voucher.endDate < now) return { error: "Voucher đã hết hạn." };
  if (voucher.goldHourStart !== null && voucher.goldHourEnd !== null) {
    const hour = now.getHours();
    if (hour < voucher.goldHourStart || hour >= voucher.goldHourEnd) {
      return { error: `Voucher chỉ áp dụng trong Giờ Vàng ${voucher.goldHourStart}h–${voucher.goldHourEnd}h.` };
    }
  }
  if (ctx.subTotal < voucher.minBillValue) {
    return { error: `Hóa đơn cần tối thiểu ${voucher.minBillValue.toLocaleString("vi-VN")}đ để dùng voucher này.` };
  }
  if (voucher.quantity !== -1 && voucher.usedCount >= voucher.quantity) return { error: "Voucher đã hết lượt sử dụng." };

  if (ctx.customerId) {
    const uv = await prisma.userVoucher.findUnique({
      where: { customerId_voucherId: { customerId: ctx.customerId, voucherId: voucher.id } },
    });
    if (voucher.voucherType === "personal" && !uv) return { error: "Mã này dành riêng — bạn chưa có trong ví." };
    if (uv?.isUsed) return { error: "Bạn đã sử dụng voucher này rồi." };
  } else if (voucher.voucherType === "personal") {
    return { error: "Voucher cá nhân cần đăng nhập để sử dụng." };
  }

  return { voucherCode: voucher.code, voucherDiscount: voucher.discountValue, voucherId: voucher.id };
}

/** Giữ voucher đã kiểm tra trên đơn tới lúc thanh toán (cột cancelReason, dạng VOUCHER:code:giá trị) */
export function voucherHold(v: { voucherCode: string | null; voucherDiscount: number }) {
  return v.voucherCode ? `VOUCHER:${v.voucherCode}:${v.voucherDiscount}` : null;
}
