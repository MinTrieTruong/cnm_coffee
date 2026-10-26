import { Router } from "express";
import type { Order, PrismaClient } from "@prisma/client";
import { createMomoPayment, verifyMomoIpn } from "../lib/momo.js";
import type { Server } from "socket.io";
import { deductInventoryForOrder } from "../lib/inventory.js";
import { releaseOrderToKitchen } from "../lib/delivery.js";
import { computeBill, computePointsEarned, getStoreSettings } from "../lib/pricing.js";
import { settlePaidPoints } from "../lib/points.js";
import { resolveVoucher, voucherHold } from "../lib/vouchers.js";
import { toStore } from "../lib/storeScope.js";

/** Tổng tiền thanh toán online: VAT, điểm đã áp, voucher đang giữ trong cancelReason (VOUCHER:code:giá trị), phí ship */
async function onlineBill(prisma: PrismaClient, order: Order) {
  let voucherCode: string | null = null;
  let voucherDiscount = 0;
  if (order.cancelReason?.startsWith("VOUCHER:")) {
    const parts = order.cancelReason.split(":");
    voucherCode = parts[1] || null;
    voucherDiscount = Number(parts[2]) || 0;
  }
  const settings = await getStoreSettings(prisma);
  const computed = computeBill(order.subTotal, order.discountAmt + voucherDiscount, order.pointsUsed, settings.pointValueVnd, settings.vatRatePercent);
  return { voucherCode, voucherDiscount, computed, finalTotal: computed.totalAmount + order.shippingFee, settings };
}

export function momoRouter(prisma: PrismaClient, io?: Server) {
  const r = Router();

  /**
   * POST /api/orders/:id/momo/create
   * Tạo link thanh toán MoMo cho đơn hàng.
   * Trả về { payUrl, deeplink, qrCodeUrl }
   *
   * Sandbox test:
   *   partnerCode : MOMOBKUN20180529
   *   accessKey   : klm056883RRSR632
   *   secretKey   : at67qH6mk8w5Y1nAySRECHmSuvYuzh48
   *   Tài khoản   : SĐT 0123456789 | OTP 000000
   */
  r.post("/orders/:id/momo/create", async (req, res) => {
    const orderId = Number(req.params.id);
    if (Number.isNaN(orderId)) return res.status(400).json({ error: "Id không hợp lệ" });

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: "Đơn không tìm thấy" });
    if (!["Confirmed", "Pending_Grace"].includes(order.status)) {
      return res.status(400).json({ error: "Đơn chưa được xác nhận" });
    }

    const partnerCode = process.env.MOMO_PARTNER_CODE ?? "";
    const accessKey   = process.env.MOMO_ACCESS_KEY ?? "";
    const secretKey   = process.env.MOMO_SECRET_KEY ?? "";
    const endpoint    = process.env.MOMO_ENDPOINT ?? "https://test-payment.momo.vn/v2/gateway/api/create";
    const publicAppUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:5173";

    if (!partnerCode || !accessKey || !secretKey) {
      return res.status(500).json({
        error: "Chưa cấu hình MoMo (MOMO_PARTNER_CODE / MOMO_ACCESS_KEY / MOMO_SECRET_KEY trong .env).",
      });
    }

    // IPN URL phải public. Khi dev local, cài ngrok và set MOMO_IPN_URL.
    // Nếu không có, dùng fallback (MoMo sẽ không gọi được nhưng payUrl/deeplink vẫn hoạt động).
    const ipnUrl = process.env.MOMO_IPN_URL ?? `${publicAppUrl}/api/momo/ipn`;

    // Tính tiền giống VNPay/SePay (VAT, điểm, voucher, phí ship); giá trị voucher lấy từ DB, không tin trình duyệt
    const v = await resolveVoucher(prisma, (req.body as { voucherCode?: string | null } | undefined)?.voucherCode, order);
    if ("error" in v) return res.status(400).json({ error: v.error });
    await prisma.order.update({ where: { id: orderId }, data: { cancelReason: voucherHold(v) } });
    const { finalTotal } = await onlineBill(prisma, { ...order, cancelReason: voucherHold(v) });

    try {
      const result = await createMomoPayment({
        amount:      Math.max(1000, Math.round(finalTotal)),
        orderId,
        orderInfo:   `TD Coffee don ${orderId}`,
        redirectUrl: `${publicAppUrl}/order/${orderId}/checkout`,
        ipnUrl,
        partnerCode,
        accessKey,
        secretKey,
        endpoint,
      });

      return res.json(result);
    } catch (err) {
      console.error("[momo] create error:", err);
      return res.status(502).json({
        error: err instanceof Error ? err.message : "Lỗi kết nối MoMo",
      });
    }
  });

  /**
   * POST /api/momo/ipn
   * MoMo gọi server-to-server sau khi thanh toán xong (IPN callback).
   * Phải trả 204 nhanh. MoMo sẽ retry nhiều lần nếu không nhận được.
   *
   * orderId MoMo có format: MOMOBKUN20180529<timestamp>_<orderId>
   * vd: MOMOBKUN2018052917034567890_42
   */
  r.post("/momo/ipn", async (req, res) => {
    const body = req.body as Record<string, string | number>;

    const accessKey = process.env.MOMO_ACCESS_KEY ?? "";
    const secretKey = process.env.MOMO_SECRET_KEY ?? "";

    // Xác minh chữ ký IPN (bảo mật — tránh giả mạo)
    const isValid = verifyMomoIpn(body, accessKey, secretKey);
    if (!isValid) {
      console.warn("[momo/ipn] Chữ ký không hợp lệ:", body);
      return res.status(400).json({ error: "Invalid signature" });
    }

    const resultCode = Number(body.resultCode);
    const momoOrderId = String(body.orderId ?? "");

    // Tách orderId DB từ format: MOMOBKUN20180529<timestamp>_<orderId>
    // requestId = `${partnerCode}${Date.now()}_${orderId}`
    const underscoreIdx = momoOrderId.lastIndexOf("_");
    const rawOrderId = underscoreIdx !== -1
      ? Number(momoOrderId.slice(underscoreIdx + 1))
      : NaN;

    console.log("[momo/ipn] resultCode:", resultCode, "orderId:", momoOrderId, "→ DB orderId:", rawOrderId);

    if (resultCode === 0 && !Number.isNaN(rawOrderId)) {
      const order = await prisma.order.findUnique({ where: { id: rawOrderId } });
      if (order && order.status !== "Paid") {
        const { voucherCode, voucherDiscount, computed, finalTotal, settings } = await onlineBill(prisma, order);
        const paidAmount = Math.round(Number(body.amount) || finalTotal);
        const done = await prisma.$transaction(async (tx) => {
          // Khóa theo trạng thái: MoMo gọi IPN lại nhiều lần
          const locked = await tx.order.updateMany({
            where: { id: rawOrderId, status: { not: "Paid" } },
            data: {
              status: "Paid",
              paidAt: new Date(),
              discountAmt: order.discountAmt + voucherDiscount,
              vatAmount: computed.vatAmount,
              totalAmount: finalTotal,
              cancelReason: null,
              voucherCode,
            },
          });
          if (locked.count === 0) return false;
          await deductInventoryForOrder(tx, rawOrderId);
          await tx.payment.create({
            data: {
              orderId:   rawOrderId,
              method:    "MoMo",
              amount:    paidAmount,
              transCode: String(body.transId ?? momoOrderId),
            },
          });
          if (voucherCode) {
            await tx.voucher.updateMany({ where: { code: voucherCode }, data: { usedCount: { increment: 1 } } });
          }
          if (order.customerId) {
            await settlePaidPoints(tx, {
              customerId: order.customerId,
              orderId: rawOrderId,
              pointsUsed: order.pointsUsed,
              pointsEarned: computePointsEarned(computed.totalAmount, settings.pointEarnEveryVnd, settings.pointEarnEach),
            });
          }
          if (order.tableId) {
            await tx.cafeTable.update({ where: { id: order.tableId }, data: { status: "Cleaning" } });
          }
          return true;
        });
        if (done) {
          if (paidAmount !== Math.round(finalTotal)) console.warn("[momo/ipn] Số tiền lệch đơn #", rawOrderId, paidAmount, "≠", finalTotal);
          console.log("[momo/ipn] Đã xác nhận thanh toán đơn #", rawOrderId);
          if (io) {
            toStore(io, "pos", order.storeId).emit("payment:done", { orderId: rawOrderId, method: "MoMo", amount: paidAmount, isOnline: true });
            io.to(`order:${rawOrderId}`).emit("payment:success", { orderId: rawOrderId, totalAmount: finalTotal, method: "MoMo" });
            await releaseOrderToKitchen(prisma, io, rawOrderId);
          }
        }
      }
    }

    // MoMo yêu cầu trả về 204 (no content) để xác nhận đã nhận
    res.status(204).end();
  });

  return r;
}
