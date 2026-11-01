import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { buildVnpayUrl, verifyVnpaySign } from "../lib/vnpay.js";
import { computeBill, getStoreSettings, computePointsEarned } from "../lib/pricing.js";
import { settlePaidPoints } from "../lib/points.js";
import { deductInventoryForOrder } from "../lib/inventory.js";
import { releaseOrderToKitchen } from "../lib/delivery.js";
import { customerShipping, refreshOrderPromotion } from "../lib/promotions.js";
import { consumeVoucher, resolveVoucher, voucherHold } from "../lib/vouchers.js";
import { toStore } from "../lib/storeScope.js";

/** Trạng thái đơn còn nhận thanh toán */
const PAYABLE = ["Confirmed", "Pending_Grace", "Waiting_Pay"];

export function vnpayRouter(prisma: PrismaClient, io: Server) {
  const r = Router();

  /**
   * POST /api/orders/:id/vnpay/create
   * Tạo URL thanh toán VNPay cho đơn hàng — frontend redirect tới URL này.
   */
  r.post("/orders/:id/vnpay/create", async (req, res) => {
    const orderId = Number(req.params.id);
    if (Number.isNaN(orderId)) return res.status(400).json({ error: "Id không hợp lệ" });
    await refreshOrderPromotion(prisma, orderId);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: "Đơn không tìm thấy" });
    if (!["Confirmed", "Pending_Grace"].includes(order.status)) {
      return res.status(400).json({ error: "Đơn chưa được xác nhận bởi bếp" });
    }

    const tmnCode = process.env.VNPAY_TMN_CODE ?? "";
    const hashSecret = process.env.VNPAY_HASH_SECRET ?? "";
    const vnpUrl =
      process.env.VNPAY_URL ?? "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";

    // Ưu tiên lấy origin từ request để returnUrl về đúng IP (LAN/localhost)
    const rawOrigin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);
    const publicAppUrl = rawOrigin || process.env.PUBLIC_APP_URL || "http://localhost:5173";

    if (!tmnCode || !hashSecret) {
      return res.status(500).json({
        error:
          "Chưa cấu hình VNPay (VNPAY_TMN_CODE / VNPAY_HASH_SECRET trong .env).",
      });
    }

    // Tính lại tổng tiền đúng (có VAT) — giống bill endpoint
    const settings = await getStoreSettings(prisma);
    // Voucher: kiểm tra và lấy giá trị giảm từ DB (bỏ qua discountVoucherAmt trình duyệt gửi lên)
    const v = await resolveVoucher(prisma, (req.body as { voucherCode?: string | null } | undefined)?.voucherCode, order);
    if ("error" in v) return res.status(400).json({ error: v.error });
    const computed = computeBill(
      Number(order.subTotal),
      Number(order.discountAmt) + v.voucherDiscount,
      Number(order.pointsUsed),
      settings.pointValueVnd,
      settings.vatRatePercent,
    );
    const chargeAmount = Math.max(1000, Math.round(computed.totalAmount + customerShipping(order)));

    // Save the voucherCode temporarily in cancelReason (format VOUCHER:code:discount)
    await prisma.order.update({
      where: { id: orderId },
      data: {
        cancelReason: voucherHold(v),
      },
    });

    const ipAddr =
      (req.headers["x-forwarded-for"] as string | undefined)
        ?.split(",")[0]
        ?.trim() ??
      req.socket.remoteAddress ??
      "127.0.0.1";

    const payUrl = buildVnpayUrl({
      amount: chargeAmount,
      orderId,
      orderInfo: `TD Coffee don ${orderId}`,
      ipAddr,
      returnUrl: `${publicAppUrl}/order/${orderId}/checkout`,
      tmnCode,
      hashSecret,
      vnpUrl,
    });

    // VietQR Quick Link — khách quét bằng app ngân hàng bất kỳ (không cần ví VNPay)
    const bankId = process.env.VIETQR_BANK_ID ?? "mbbank";
    const bankAccount = process.env.VIETQR_ACCOUNT_NO ?? "0389730361";
    const accountName = encodeURIComponent(process.env.VIETQR_ACCOUNT_NAME ?? "TD Coffee");
    const addInfo = encodeURIComponent(`TD Coffee don ${orderId}`);
    const vietQrUrl = `https://img.vietqr.io/image/${bankId}-${bankAccount}-compact2.png?amount=${chargeAmount}&addInfo=${addInfo}&accountName=${accountName}`;

    return res.json({ payUrl, vietQrUrl });
  });

  /**
   * POST /api/orders/:id/vnpay/client-confirm
   * Frontend gọi khi VNPay redirect về client (fallback khi IPN không đến được localhost).
   * Nhận { vnp_ResponseCode, vnp_TxnRef } từ body, xác nhận đơn paid nếu code = "00".
   */
  r.post("/orders/:id/vnpay/client-confirm", async (req, res) => {
    const orderId = Number(req.params.id);
    if (Number.isNaN(orderId)) return res.status(400).json({ ok: false });

    // Trình duyệt gửi lại nguyên bộ tham số vnp_* VNPay trả về — chỉ tin khi chữ ký đúng
    const query = Object.fromEntries(
      Object.entries((req.body ?? {}) as Record<string, unknown>)
        .filter(([k, v]) => k.startsWith("vnp_") && typeof v === "string")
        .map(([k, v]) => [k, v as string]),
    );
    const { valid, responseCode, txnRef } = verifyVnpaySign(query, process.env.VNPAY_HASH_SECRET ?? "");
    if (!valid) return res.status(400).json({ ok: false, reason: "invalid_signature" });
    if (responseCode !== "00" || (query.vnp_TransactionStatus && query.vnp_TransactionStatus !== "00")) {
      return res.json({ ok: false, reason: "not_success" });
    }
    if (Number(txnRef.split("_")[0]) !== orderId) return res.status(400).json({ ok: false, reason: "wrong_order" });

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ ok: false });
    if (order.status === "Paid") return res.json({ ok: true, alreadyPaid: true });
    if (!PAYABLE.includes(order.status)) return res.status(400).json({ ok: false, reason: "not_payable" });

    // Dùng vnp_TxnRef làm key idempotent (tránh double-payment kể cả race condition)
    const transCode = `VNPAY-${txnRef}`;
    const existing = await prisma.payment.findFirst({ where: { OR: [{ transCode }, { orderId, method: "VNPay" }] } });
    if (existing) return res.json({ ok: true, alreadyPaid: true });

    let voucherCode = null;
    let voucherDiscount = 0;
    if (order.cancelReason && order.cancelReason.startsWith("VOUCHER:")) {
      const parts = order.cancelReason.split(":");
      voucherCode = parts[1];
      voucherDiscount = Number(parts[2]) || 0;
    }

    const settings = await getStoreSettings(prisma);
    const computed = computeBill(
      Number(order.subTotal),
      Number(order.discountAmt) + voucherDiscount,
      Number(order.pointsUsed),
      settings.pointValueVnd,
      settings.vatRatePercent,
    );
    const finalTotal = computed.totalAmount + customerShipping(order);
    const chargeAmount = Math.round(finalTotal);
    // VNPay nhân 100; số khách thực trả phải đủ số tiền đơn
    if (Number(query.vnp_Amount) / 100 < chargeAmount) return res.status(400).json({ ok: false, reason: "amount_mismatch" });

    await prisma.$transaction(async (tx) => {
      const updateResult = await tx.order.updateMany({
        where: { id: orderId, status: { in: PAYABLE } },
        data: { 
          status: "Paid",
          discountAmt: Number(order.discountAmt) + voucherDiscount,
          vatAmount: computed.vatAmount,
          totalAmount: finalTotal,
          cancelReason: null,
          paidAt: new Date(),
          voucherCode,
        } 
      });
      if (updateResult.count === 0) return; // Đã được xử lý bởi request khác
      await deductInventoryForOrder(tx, orderId);

      await tx.payment.create({
        data: {
          orderId,
          method: "VNPay",
          amount: chargeAmount,
          transCode,
        },
      });

      // Tiêu lượt voucher nguyên tử; khách đã trả tiền online nên không huỷ giao dịch, chỉ ghi log khi vượt lượt
      if (voucherCode && !(await consumeVoucher(tx, voucherCode, order.customerId, orderId))) {
        console.warn("[voucher] Đơn #%d thanh toán online với voucher %s đã hết lượt / khách đã dùng", orderId, voucherCode);
      }

      if (order.customerId) {
        await settlePaidPoints(tx, {
          customerId: order.customerId,
          orderId,
          pointsUsed: Number(order.pointsUsed),
          pointsEarned: computePointsEarned(computed.totalAmount, settings.pointEarnEveryVnd, settings.pointEarnEach),
        });
      }
  
      if (order.tableId) {
        await tx.cafeTable.update({
          where: { id: order.tableId },
          data: { status: "Cleaning" },
        });
      }
    });

    const updatedOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: { table: true, customer: { select: { fullName: true } } },
    });

    if (updatedOrder) {
      const tableLabel = updatedOrder.table ? updatedOrder.table.name : "Mang về";
      const customerLabel = updatedOrder.customer?.fullName ?? "Vãng lai";
      toStore(io, "pos", updatedOrder.storeId).emit("payment:done", {
        orderId,
        method: "VNPay",
        amount: chargeAmount,
        tableLabel,
        customerLabel,
        isOnline: true,
      });
      toStore(io, "staff", updatedOrder.storeId).emit("payment:done", {
        orderId,
        method: "VNPay",
        amount: chargeAmount,
        tableLabel,
        customerLabel,
        isOnline: true,
      });
      io.to(`order:${orderId}`).emit("payment:success", {
        orderId,
        totalAmount: chargeAmount,
        method: "VNPay",
      });

      // Đẩy món vào bếp (đơn giao hàng: chờ thu ngân xác nhận trước)
      await releaseOrderToKitchen(prisma, io, orderId);
    }

    return res.json({ ok: true });
  });

  /**
   * GET /api/vnpay/ipn
   * VNPay gọi server-to-server để xác nhận thanh toán.
   * Phải trả về JSON { RspCode, Message } để VNPay biết đã nhận.
   */
  r.get("/vnpay/ipn", async (req, res) => {
    const query = req.query as Record<string, string>;
    const hashSecret = process.env.VNPAY_HASH_SECRET ?? "";

    const { valid, responseCode, txnRef } = verifyVnpaySign(query, hashSecret);
    if (!valid) {
      return res.json({ RspCode: "97", Message: "Invalid Checksum" });
    }

    const orderId = Number(txnRef.split("_")[0]);
    if (Number.isNaN(orderId)) {
      return res.json({ RspCode: "01", Message: "Order Not Found" });
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.json({ RspCode: "01", Message: "Order Not Found" });
    if (order.status === "Paid") {
      return res.json({ RspCode: "02", Message: "Order Already Confirmed" });
    }
    // Đơn đã hủy / đã giao… không nhận tiền nữa (tránh chuyển đơn đã hủy sang Paid)
    if (!PAYABLE.includes(order.status)) {
      return res.json({ RspCode: "02", Message: "Order Not Payable" });
    }

    let amountBad = false;
    let paidNow = false;
    if (responseCode === "00") {
      await prisma.$transaction(async (tx) => {
        const existingPmt = await tx.payment.findFirst({
          where: { orderId, method: "VNPay" },
        });
        if (existingPmt) return;

        let voucherCode = null;
        let voucherDiscount = 0;
        if (order.cancelReason && order.cancelReason.startsWith("VOUCHER:")) {
          const parts = order.cancelReason.split(":");
          voucherCode = parts[1];
          voucherDiscount = Number(parts[2]) || 0;
        }

        const settings = await getStoreSettings(tx as any);
        const computed = computeBill(
          Number(order.subTotal),
          Number(order.discountAmt) + voucherDiscount,
          Number(order.pointsUsed),
          settings.pointValueVnd,
          settings.vatRatePercent,
        );
        // Khách trả cả phí ship (giống lúc tạo link thanh toán)
        const finalTotal = computed.totalAmount + customerShipping(order);
        // VNPay nhân 100; trả thiếu thì không ghi nhận
        if (Number(query.vnp_Amount) / 100 < Math.round(finalTotal)) {
          amountBad = true;
          return;
        }

        const updateResult = await tx.order.updateMany({
          where: { id: orderId, status: { in: PAYABLE } },
          data: {
            status: "Paid",
            discountAmt: Number(order.discountAmt) + voucherDiscount,
            vatAmount: computed.vatAmount,
            totalAmount: finalTotal,
            cancelReason: null,
            paidAt: new Date(),
            voucherCode,
          },
        });
        if (updateResult.count === 0) return; // Đã được xử lý bởi request khác
        paidNow = true;
        await deductInventoryForOrder(tx, orderId);

        await tx.payment.create({
          data: {
            orderId,
            method: "VNPay",
            amount: Math.round(finalTotal),
            transCode: txnRef,
          },
        });

        // Tiêu lượt voucher nguyên tử; khách đã trả tiền online nên không huỷ giao dịch, chỉ ghi log khi vượt lượt
        if (voucherCode && !(await consumeVoucher(tx, voucherCode, order.customerId, orderId))) {
          console.warn("[voucher] Đơn #%d thanh toán online với voucher %s đã hết lượt / khách đã dùng", orderId, voucherCode);
        }

        if (order.customerId) {
          await settlePaidPoints(tx, {
            customerId: order.customerId,
            orderId,
            pointsUsed: Number(order.pointsUsed),
            pointsEarned: computePointsEarned(computed.totalAmount, settings.pointEarnEveryVnd, settings.pointEarnEach),
          });
        }
        if (order.tableId) {
          await tx.cafeTable.update({
            where: { id: order.tableId },
            data: { status: "Cleaning" },
          });
        }
      });
    }

    if (amountBad) return res.json({ RspCode: "04", Message: "Invalid Amount" });

    // Cập nhật socket cho frontend
    const updatedOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: { table: true, customer: { select: { fullName: true } } },
    });

    if (paidNow && updatedOrder) {
      // Thông báo POS
      const tableLabel = updatedOrder.table ? updatedOrder.table.name : "Mang về";
      const customerLabel = updatedOrder.customer?.fullName ?? "Vãng lai";
      toStore(io, "pos", updatedOrder.storeId).emit("payment:done", {
        orderId,
        method: "VNPay",
        amount: updatedOrder.totalAmount,
        tableLabel,
        customerLabel,
        isOnline: true,
      });
      toStore(io, "staff", updatedOrder.storeId).emit("payment:done", {
        orderId,
        method: "VNPay",
        amount: updatedOrder.totalAmount,
        tableLabel,
        customerLabel,
        isOnline: true,
      });
      io.to(`order:${orderId}`).emit("payment:success", {
        orderId,
        totalAmount: updatedOrder.totalAmount,
        method: "VNPay",
      });

      // Đẩy món vào bếp (đơn giao hàng: chờ thu ngân xác nhận trước)
      await releaseOrderToKitchen(prisma, io, orderId);
    }

    return res.json({ RspCode: "00", Message: "Confirm Success" });
  });

  return r;
}
