/**
 * lib/supplierReturns.ts — Hàng lỗi / giao thiếu từ nhà cung cấp
 *
 *  - Lúc nhận hàng: dòng giao thiếu / trả lại → chờ giao bù (có ngày hẹn) hoặc hủy phần đó (PurchaseOrderCancel)
 *  - Sau khi nhập kho: phiếu trả hàng (SupplierReturn) theo lô, quản lý duyệt → trừ kho đúng lô và xử lý tiền:
 *      CREDIT    giảm trừ công nợ (SupplierCredit, tự bù vào hoá đơn chưa trả của NCC)
 *      REFUND    NCC hoàn tiền → phiếu thu vào két / ngân hàng
 *      REPLACE   đổi hàng → mở lại đơn mua cho phần đó
 *      WRITE_OFF NCC không nhận → ghi hao hụt "Lỗi nhà cung cấp"
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { notify } from "./notify.js";

type Db = PrismaClient | Prisma.TransactionClient;

export const REJECT_REASONS: Record<string, string> = {
  DAMAGED: "Hỏng / vỡ",
  WRONG_SPEC: "Sai quy cách",
  NEAR_EXPIRY: "Cận hạn / hết hạn",
  WRONG_ITEM: "Sai mặt hàng",
  QUALITY: "Không đạt chất lượng",
};

export const RETURN_RESOLUTIONS = ["CREDIT", "REFUND", "REPLACE", "WRITE_OFF"] as const;
export type ReturnResolution = (typeof RETURN_RESOLUTIONS)[number];

/** Hoá đơn còn phải trả = tổng − đã chi tiền − đã bù trừ */
export function billRemaining(b: { amount: number; paidAmount: number; creditApplied: number }) {
  return b.amount - b.paidAmount - b.creditApplied;
}

/** Trạng thái hoá đơn sau khi trả / bù trừ */
export function billStatus(b: { amount: number; paidAmount: number; creditApplied: number }) {
  const settled = b.paidAmount + b.creditApplied;
  return settled >= b.amount ? "PAID" : settled > 0 ? "PARTIAL" : "UNPAID";
}

/**
 * Bù trừ khoản NCC còn nợ quán vào các hoá đơn chưa trả của NCC đó tại chi nhánh.
 * `preferBillId`: bù hoá đơn này trước (VD hoá đơn của đợt nhận có hàng bị trả).
 * Gọi khi duyệt phiếu trả hàng (CREDIT) và khi phát sinh hoá đơn mới.
 */
export async function applySupplierCredits(tx: Db, storeId: number, supplierId: number, preferBillId?: number | null) {
  const credits = await tx.supplierCredit.findMany({ where: { storeId, supplierId, status: "OPEN" }, orderBy: { id: "asc" } });
  if (!credits.length) return 0;
  const bills = await tx.supplierBill.findMany({
    where: { storeId, supplierId, status: { in: ["UNPAID", "PARTIAL"] } },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
  });
  bills.sort((a, b) => Number(b.id === preferBillId) - Number(a.id === preferBillId));
  let applied = 0;
  for (const c of credits) {
    let left = c.amount - c.usedAmount;
    for (const b of bills) {
      if (left <= 0) break;
      const take = Math.min(left, billRemaining(b));
      if (take <= 0) continue;
      b.creditApplied += take;
      await tx.supplierBill.update({ where: { id: b.id }, data: { creditApplied: b.creditApplied, status: billStatus(b) } });
      left -= take;
      applied += take;
    }
    const used = c.amount - left;
    if (used !== c.usedAmount) {
      await tx.supplierCredit.update({ where: { id: c.id }, data: { usedAmount: used, status: used >= c.amount ? "USED" : "OPEN" } });
    }
  }
  return applied;
}

/** Hạn trả hàng của 1 lô */
export function returnDeadline(lot: { receivedAt: Date }, days: number) {
  return new Date(lot.receivedAt.getTime() + days * 86400_000);
}

/** Mỗi giờ: đơn mua quá ngày hẹn giao bù mà chưa nhận đủ → nhắc quản lý + thủ kho (mỗi đơn tối đa 1 lần / ngày) */
export function startBackorderReminder(prisma: PrismaClient) {
  const tick = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const late = await prisma.purchaseOrder.findMany({
      where: { status: { in: ["PENDING", "PARTIAL"] }, backorderDue: { lt: today } },
      include: { supplier: { select: { name: true } } },
    });
    for (const po of late) {
      void notify({
        type: "PO_BACKORDER",
        title: `${po.code}: ${po.supplier.name} quá hẹn giao bù`,
        body: `Hẹn ${po.backorderDue!.toLocaleDateString("vi-VN")} — liên hệ NCC hoặc hủy phần còn thiếu.`,
        link: "/app/purchase/orders",
        storeId: po.storeId,
        to: { storeId: po.storeId, roles: ["Admin", "Warehouse"] },
        dedupeKey: `po-backorder-${po.id}`,
        dedupeMinutes: 24 * 60,
      });
    }
  };
  setTimeout(() => void tick().catch((e) => console.error("[backorder]", e)), 60_000);
  setInterval(() => void tick().catch((e) => console.error("[backorder]", e)), 3600_000);
}
