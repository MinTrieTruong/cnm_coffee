import type { Prisma, PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { POINTS_REFUND_METHOD } from "./cash.js";
import { adjustStoreStock, restoreLots } from "./inventory.js";
import { computePointsEarned, getStoreSettings } from "./pricing.js";
import { rankTierFromLifetimeSpend } from "./rank.js";
import { toStore } from "./storeScope.js";

type Tx = Prisma.TransactionClient;

export type PointTxType = "EARN" | "REDEEM" | "CANCEL_REFUND" | "REDEEM_RETURN" | "EARN_REVERSAL";

/** Cộng/trừ điểm khách và ghi lịch sử. delta = 0 thì bỏ qua. */
export async function addPoints(
  tx: Tx,
  args: { customerId: number; delta: number; type: PointTxType; orderId?: number | null; note?: string | null },
) {
  if (!args.delta) return;
  await tx.customer.update({ where: { id: args.customerId }, data: { points: { increment: args.delta } } });
  await tx.pointTransaction.create({
    data: { customerId: args.customerId, orderId: args.orderId ?? null, delta: args.delta, type: args.type, note: args.note ?? null },
  });
}

/** Thanh toán xong: trừ điểm khách dùng, cộng điểm thưởng, cập nhật hạng. Gọi trong transaction thanh toán. */
export async function settlePaidPoints(
  tx: Tx,
  args: { customerId: number; orderId: number; pointsUsed: number; pointsEarned: number },
) {
  const { customerId, orderId } = args;
  await addPoints(tx, { customerId, orderId, delta: -args.pointsUsed, type: "REDEEM", note: `Dùng điểm cho đơn #${orderId}` });
  await addPoints(tx, { customerId, orderId, delta: args.pointsEarned, type: "EARN", note: `Tích điểm đơn #${orderId}` });
  // Đơn hiện tại đã được đánh dấu Paid trước khi gọi → đã nằm trong tổng
  const paid = await tx.order.aggregate({ where: { customerId, status: "Paid" }, _sum: { totalAmount: true } });
  await tx.customer.update({
    where: { id: customerId },
    data: { rankTier: rankTierFromLifetimeSpend(paid._sum.totalAmount ?? 0) },
  });
  await tx.order.update({ where: { id: orderId }, data: { pointsEarned: args.pointsEarned } });
}

/* ─────────────── Hoàn tiền đơn giao hàng ra điểm ─────────────── */

export type FailReasonCode = "DAMAGED" | "SHIPPER_INCIDENT" | "LATE" | "NO_ANSWER" | "WRONG_ADDRESS" | "CUSTOMER_REFUSED" | "OTHER";

/** Lý do giao thất bại. `storeFault` = lỗi phía quán/shipper → tự hoàn 100%; còn lại → chờ quản lý quyết. */
export const FAIL_REASONS: Record<FailReasonCode, { label: string; storeFault: boolean }> = {
  DAMAGED: { label: "Hàng bị đổ / hỏng", storeFault: true },
  SHIPPER_INCIDENT: { label: "Shipper gặp sự cố", storeFault: true },
  LATE: { label: "Giao quá trễ, khách từ chối nhận", storeFault: true },
  NO_ANSWER: { label: "Không liên lạc được khách", storeFault: false },
  WRONG_ADDRESS: { label: "Sai địa chỉ / vị trí", storeFault: false },
  CUSTOMER_REFUSED: { label: "Khách đổi ý, không nhận hàng", storeFault: false },
  OTHER: { label: "Lý do khác", storeFault: false },
};

/** Tiền khách đã trả thật (không tính phần trả bằng điểm) */
export function paidMoney(payments: { method: string; amount: number }[]) {
  return payments.filter((p) => p.method !== "Points").reduce((s, p) => s + p.amount, 0);
}

/** Số điểm hoàn cho 100% tiền đã trả (làm tròn lên để khách không thiệt) */
export function moneyToPoints(amountVnd: number, pointValueVnd: number) {
  return Math.ceil(amountVnd / Math.max(1, pointValueVnd));
}

/** Khách còn được tự hủy đơn giao hàng đã trả không; trả về hạn hủy (null = không áp dụng) */
export function customerCancelDeadline(
  order: { orderType: string; status: string; deliveryStatus: string | null; paidAt: Date | null; createdAt: Date },
  windowMinutes: number,
) {
  if (order.orderType !== "Delivery" || order.status !== "Paid") return null;
  return new Date((order.paidAt ?? order.createdAt).getTime() + windowMinutes * 60_000);
}

export class RefundError extends Error {}

/**
 * Điểm thưởng khách đã nhận từ đơn. Đơn thanh toán trước khi có cột pointsEarned / lịch sử điểm
 * (paidAt = null, chưa có dòng EARN) thì tính lại theo công thức tích điểm lúc thanh toán:
 * trên tiền thật đã trả, không gồm phí ship.
 */
async function earnedPointsOf(
  tx: Tx,
  order: { id: number; pointsEarned: number; paidAt: Date | null; shippingFee: number; payments: { method: string; amount: number }[] },
  settings: { pointEarnEveryVnd: number; pointEarnEach: number },
) {
  if (order.pointsEarned > 0 || order.paidAt) return order.pointsEarned;
  const logged = await tx.pointTransaction.count({ where: { orderId: order.id, type: "EARN" } });
  if (logged) return 0;
  return computePointsEarned(Math.max(0, paidMoney(order.payments) - order.shippingFee), settings.pointEarnEveryVnd, settings.pointEarnEach);
}

/**
 * Hoàn tiền đơn đã trả online ra điểm, trong 1 transaction.
 * - full: hoàn 100% tiền đã trả + trả lại điểm khách đã dùng + trả voucher + thu hồi điểm thưởng; đơn → Cancelled.
 * - partial: chỉ hoàn `points` điểm cho phần tiền; đơn giữ Paid (quán vẫn giữ phần còn lại).
 *   Ghi 1 dòng thanh toán âm PointsRefund + giảm tổng đơn → doanh thu tự trừ phần đã hoàn.
 * `expect` = điều kiện khóa trạng thái (VD deliveryStatus đang Awaiting_Confirm) để không đụng thao tác song song.
 */
export async function refundOrderToPoints(
  prisma: PrismaClient,
  orderId: number,
  opts: {
    mode: "full" | "partial";
    by: "Customer" | "Store" | "Shipper" | "Manager";
    reason: string;
    /** Chỉ dùng cho partial */
    points?: number;
    expect?: Prisma.OrderWhereInput;
    /** Dữ liệu cập nhật thêm cho đơn (VD deliveryStatus, deliveryNote) */
    extra?: Prisma.OrderUncheckedUpdateManyInput;
  },
) {
  const settings = await getStoreSettings(prisma);
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { payments: true } });
    if (!order) throw new RefundError("Không tìm thấy đơn");
    if (!order.customerId) throw new RefundError("Đơn không gắn tài khoản khách, không thể hoàn ra điểm.");
    const customerId = order.customerId;

    const money = paidMoney(order.payments);
    const fullPoints = moneyToPoints(money, settings.pointValueVnd);
    const refundPoints = opts.mode === "full" ? fullPoints : Math.floor(opts.points ?? 0);
    if (opts.mode === "partial" && (refundPoints <= 0 || refundPoints > fullPoints)) {
      throw new RefundError(`Số điểm hoàn phải từ 1 đến ${fullPoints.toLocaleString("vi-VN")}.`);
    }

    // Khóa trạng thái: chỉ 1 request thắng (khách hủy ↔ quán nhận đơn, bấm 2 lần…)
    const now = new Date();
    const locked = await tx.order.updateMany({
      where: { id: orderId, status: "Paid", OR: [{ refundStatus: null }, { refundStatus: "Pending" }], ...opts.expect },
      data: {
        ...opts.extra,
        refundStatus: "Refunded",
        refundPoints,
        cancelledAt: now,
        cancelledBy: opts.by,
        cancelReason: opts.reason.slice(0, 255),
        ...(opts.mode === "full" ? { status: "Cancelled", routeSeq: null } : {}),
      },
    });
    if (locked.count === 0) throw new RefundError("Đơn đã đổi trạng thái, vui lòng tải lại.");

    const earned = opts.mode === "full" ? await earnedPointsOf(tx, order, settings) : 0;

    if (opts.mode === "partial") {
      const refundMoney = Math.min(money, refundPoints * settings.pointValueVnd);
      await tx.payment.create({
        data: { orderId, method: POINTS_REFUND_METHOD, amount: -refundMoney, transCode: `REFUND-${orderId}`, paymentTime: now },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { totalAmount: { decrement: refundMoney }, discountAmt: { increment: refundMoney } },
      });
    }

    await addPoints(tx, {
      customerId, orderId, delta: refundPoints, type: "CANCEL_REFUND",
      note: `Hoàn ${opts.mode === "full" ? "100%" : "một phần"} tiền đơn #${orderId} (${money.toLocaleString("vi-VN")}đ)`,
    });

    if (opts.mode === "full") {
      await addPoints(tx, { customerId, orderId, delta: order.pointsUsed, type: "REDEEM_RETURN", note: `Trả lại điểm đã dùng ở đơn #${orderId}` });
      await addPoints(tx, { customerId, orderId, delta: -earned, type: "EARN_REVERSAL", note: `Thu hồi điểm thưởng đơn #${orderId}` });

      if (order.voucherCode) {
        const v = await tx.voucher.findUnique({ where: { code: order.voucherCode } });
        if (v) {
          await tx.voucher.updateMany({ where: { id: v.id, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
          await tx.userVoucher.updateMany({ where: { customerId, voucherId: v.id, isUsed: true }, data: { isUsed: false, usedAt: null, orderId: null } });
        }
      }

      // Bếp chưa bắt tay làm món nào → nhập lại nguyên liệu đã trừ lúc thanh toán
      const details = await tx.orderDetail.findMany({ where: { orderId }, select: { kdsStatus: true } });
      if (details.every((d) => d.kdsStatus === "Hold" || d.kdsStatus === "Waiting")) {
        const sold = await tx.inventoryTransaction.groupBy({
          by: ["itemId"],
          where: { storeId: order.storeId, referenceId: `ORDER-${orderId}`, transactionType: "SELL" },
          _sum: { qtyChange: true },
        });
        for (const s of sold) {
          const qty = -(s._sum.qtyChange ?? 0);
          if (qty <= 0) continue;
          await adjustStoreStock(tx, { storeId: order.storeId, itemId: s.itemId, qtyChange: qty, type: "SELL_CANCEL", referenceId: `ORDER-${orderId}` });
          await restoreLots(tx, order.storeId, s.itemId, qty);
        }
      }
      await tx.orderDetail.updateMany({ where: { orderId, kdsStatus: { in: ["Hold", "Waiting", "Cooking"] } }, data: { kdsStatus: "Cancelled" } });
    }

    // Hạng tính theo tổng chi tiêu đơn Paid — đơn hủy / giảm tổng thì tính lại
    const paid = await tx.order.aggregate({ where: { customerId, status: "Paid" }, _sum: { totalAmount: true } });
    await tx.customer.update({ where: { id: customerId }, data: { rankTier: rankTierFromLifetimeSpend(paid._sum.totalAmount ?? 0) } });

    const totalReturned = refundPoints + (opts.mode === "full" ? order.pointsUsed - earned : 0);
    return { orderId, storeId: order.storeId, refundPoints, totalReturned, money };
  });
}

/** Báo khách (trang theo dõi / tài khoản) + POS/KDS sau khi hoàn điểm */
export function emitRefunded(io: Server, r: { orderId: number; storeId: number; refundPoints: number; totalReturned: number }) {
  io.to(`order:${r.orderId}`).emit("order:refunded", r);
  toStore(io, "pos", r.storeId).emit("delivery:update", { orderIds: [r.orderId] });
  toStore(io, "pos", r.storeId).emit("order:updated", { id: r.orderId });
  toStore(io, "kds", r.storeId).emit("order:updated", { id: r.orderId });
}
