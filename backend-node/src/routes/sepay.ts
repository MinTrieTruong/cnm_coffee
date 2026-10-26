import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { SePayPgClient } from "sepay-pg-node";
import crypto from "crypto";
import { deductInventoryForOrder } from "../lib/inventory.js";
import { releaseOrderToKitchen } from "../lib/delivery.js";
import { resolveVoucher, voucherHold } from "../lib/vouchers.js";

export function sepayRouter(prisma: PrismaClient, io: Server) {
  const r = Router();

  /**
   * GET /api/orders/:id/vietqr
   * Tạo thông tin QR chuyển khoản VietQR để hiển thị trực tiếp trong app.
   * Không cần redirect sang trang SePay — tránh Cloudflare block.
   */
  r.get("/orders/:id/vietqr", async (req, res) => {
    const orderId = Number(req.params.id);
    if (Number.isNaN(orderId)) return res.status(400).json({ error: "Id không hợp lệ" });

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: "Đơn không tìm thấy" });

    const bankId      = process.env.VIETQR_BANK_ID      ?? "mbbank";
    const accountNo   = process.env.VIETQR_ACCOUNT_NO   ?? "";
    const accountName = process.env.VIETQR_ACCOUNT_NAME ?? "TD Coffee";
    const amount      = Math.round(order.totalAmount);

    // Mã nội dung chuyển khoản — SePay dùng để khớp giao dịch
    const transferContent = `TD${orderId}`;

    // VietQR public image API — free, không cần API key
    const qrUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.jpg`
      + `?amount=${amount}`
      + `&addInfo=${encodeURIComponent(transferContent)}`
      + `&accountName=${encodeURIComponent(accountName)}`;

    return res.json({ qrUrl, amount, accountNo, accountName, bankId, transferContent });
  });

  /**
   * POST /api/orders/:id/sepay/create
   * Trả về { checkoutUrl, fields } để frontend tự POST form sang SePay.
   */
  r.post("/orders/:id/sepay/create", async (req, res) => {
    const orderId = Number(req.params.id);
    if (Number.isNaN(orderId)) return res.status(400).json({ error: "Id không hợp lệ" });

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: "Đơn không tìm thấy" });
    if (!["Confirmed", "Pending_Grace"].includes(order.status)) {
      return res.status(400).json({ error: "Đơn chưa được xác nhận" });
    }

    // Voucher: kiểm tra và lấy giá trị giảm từ DB (bỏ qua discountVoucherAmt trình duyệt gửi lên)
    const v = await resolveVoucher(prisma, (req.body as { voucherCode?: string | null } | undefined)?.voucherCode, order);
    if ("error" in v) return res.status(400).json({ error: v.error });
    
    const settings = await getStoreSettings(prisma);
    const computed = computeBill(
      Number(order.subTotal),
      Number(order.discountAmt) + v.voucherDiscount,
      Number(order.pointsUsed),
      settings.pointValueVnd,
      settings.vatRatePercent,
    );
    const chargeAmount = Math.max(1000, Math.round(computed.totalAmount + Number(order.shippingFee || 0)));

    // Save the voucherCode temporarily in cancelReason (format VOUCHER:code:discount)
    await prisma.order.update({
      where: { id: orderId },
      data: {
        cancelReason: voucherHold(v),
      },
    });

    const merchantId = process.env.SEPAY_MERCHANT_ID ?? "";
    const secretKey  = process.env.SEPAY_SECRET_KEY ?? "";
    const env        = (process.env.SEPAY_ENV ?? "sandbox") as "sandbox" | "production";
    
    // Ưu tiên lấy origin từ request để redirect đúng IP nội bộ (LAN) khi khách dùng điện thoại
    const rawOrigin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);
    const publicUrl = rawOrigin || process.env.PUBLIC_APP_URL || "http://localhost:5173";

    if (!merchantId || !secretKey) {
      return res.status(500).json({
        error: "Chưa cấu hình SePay (SEPAY_MERCHANT_ID / SEPAY_SECRET_KEY trong .env).",
      });
    }

    const client = new SePayPgClient({ env, merchant_id: merchantId, secret_key: secretKey });

    const checkoutUrl = client.checkout.initCheckoutUrl();
    const fields = client.checkout.initOneTimePaymentFields({
      payment_method:       "BANK_TRANSFER",
      order_invoice_number: `TD${orderId}-${Date.now()}`,
      order_amount:         chargeAmount,
      currency:             "VND",
      order_description:    `TD Coffee don ${orderId}`,
      success_url:          `${publicUrl}/order/${orderId}/checkout?sepay=success`,
      error_url:            `${publicUrl}/order/${orderId}/checkout?sepay=error`,
      cancel_url:           `${publicUrl}/order/${orderId}/checkout?sepay=cancel`,
    });

    console.log("[sepay] create:", { orderId, amount: chargeAmount, env });
    return res.json({ checkoutUrl, fields });
  });

  /**
   * POST /api/sepay/ipn
   * SePay gọi server-to-server sau khi thanh toán thành công.
   * Xác minh bằng X-SePay-Signature header.
   */
  r.post("/sepay/ipn", async (req, res) => {
    const body      = req.body as Record<string, unknown>;
    const secretKey = process.env.SEPAY_SECRET_KEY ?? "";
    const env       = process.env.SEPAY_ENV ?? "sandbox";
    const received  = req.headers["x-sepay-signature"] as string | undefined;

    // Chỉ verify signature ở production; sandbox bỏ qua để debug dễ hơn
    if (env === "production" && received) {
      const bodyJson  = JSON.stringify(body);
      const expectedJson = crypto.createHmac("sha256", secretKey).update(bodyJson).digest("hex");

      if (received !== expectedJson) {
        console.warn("[sepay/ipn] Chữ ký không khớp (production):", { received, expectedJson });
        return res.status(400).json({ error: "Invalid signature" });
      }
    }

    const invoiceNumber =
      String(body.order_invoice_number ?? body.invoice_number ?? body.order_code ?? "");

    // Format: TD{orderId}-{timestamp}
    const rawOrderId = Number(invoiceNumber.replace(/^TD/, "").split("-")[0]);

    const txStatusRaw =
      (body.transaction as Record<string, unknown> | undefined)?.status ??
      body.status ??
      body.transaction_status;
    const txStatus = String(txStatusRaw ?? "").toUpperCase();
    const isSuccess = txStatus === "SUCCESS" || txStatus === "1" || txStatus === "COMPLETED";

    console.log("[sepay/ipn] invoice:", invoiceNumber, "→ orderId:", rawOrderId, "status:", txStatus, "isSuccess:", isSuccess);
    console.log("[sepay/ipn] body:", JSON.stringify(body));

    if (isSuccess && !Number.isNaN(rawOrderId) && rawOrderId > 0) {
      await confirmOrderPaid(prisma, io, rawOrderId, body);
    }

    return res.json({ success: true });
  });

  /**
   * POST /api/orders/:id/sepay/confirm
   * Frontend gọi thủ công sau khi redirect về từ SePay success.
   * Dùng như fallback khi IPN không đến được server (localhost, ngrok hết hạn…).
   */
  r.post("/orders/:id/sepay/confirm", async (req, res) => {
    const orderId = Number(req.params.id);
    if (Number.isNaN(orderId)) return res.status(400).json({ error: "Id không hợp lệ" });

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: "Đơn không tìm thấy" });

    // Nếu đã Paid rồi → trả về luôn
    if (order.status === "Paid") {
      return res.json({ confirmed: true, alreadyPaid: true });
    }

    // Chỉ cho confirm nếu đơn đang ở trạng thái chờ
    if (!["Confirmed", "Pending_Grace", "Waiting_Pay"].includes(order.status)) {
      return res.status(400).json({ error: "Đơn không ở trạng thái có thể xác nhận" });
    }

    await confirmOrderPaid(prisma, io, orderId, { source: "frontend_fallback" });
    console.log("[sepay/confirm] Fallback xác nhận đơn #", orderId);
    return res.json({ confirmed: true });
  });

  return r;
}

import { computeBill, getStoreSettings, computePointsEarned } from "../lib/pricing.js";
import { settlePaidPoints } from "../lib/points.js";
import { toStore } from "../lib/storeScope.js";

/** Hàm dùng chung: cập nhật đơn thành Paid + tạo Payment record + emit socket */
async function confirmOrderPaid(
  prisma: PrismaClient,
  io: Server,
  orderId: number,
  body: Record<string, unknown>,
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { table: true, customer: { select: { id: true, fullName: true } } },
  });
  if (!order || order.status === "Paid") return;

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
  const finalTotal = computed.totalAmount + Number(order.shippingFee || 0);

  await prisma.$transaction(async (tx) => {
    // Re-check order status within transaction to prevent race conditions
    const currentOrder = await tx.order.findUnique({
      where: { id: orderId },
      select: { status: true }
    });
    if (!currentOrder || currentOrder.status === "Paid") return;

    // Check if SePay payment already exists
    const transCode = String(
      (body.transaction as Record<string, unknown> | undefined)?.id ??
      body.order_invoice_number ??
      body.invoice_number ??
      `MANUAL-${orderId}`,
    );
    const existingPmt = await tx.payment.findFirst({
      where: { orderId, transCode }
    });
    if (existingPmt) return;

    const updateResult = await tx.order.updateMany({ 
      where: { id: orderId, status: { not: "Paid" } }, 
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
        method:    "SePay",
        amount:    Math.round(finalTotal),
        transCode,
      },
    });

    if (voucherCode) {
      await tx.voucher.updateMany({
        where: { code: voucherCode },
        data: { usedCount: { increment: 1 } },
      });
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
  console.log("[sepay] Đã xác nhận đơn #", orderId, "→ Paid");

  // Thông báo POS: đơn đã thanh toán qua SePay (không cần thu ngân xác nhận)
  const tableLabel = order.table ? order.table.name : "Mang về";
  const customerLabel = order.customer?.fullName ?? "Vãng lai";
  toStore(io, "pos", order.storeId).emit("payment:done", {
    orderId,
    method: "SePay",
    amount: order.totalAmount,
    tableLabel,
    customerLabel,
    isOnline: true,
  });
  toStore(io, "staff", order.storeId).emit("payment:done", {
    orderId,
    method: "SePay",
    amount: order.totalAmount,
    tableLabel,
    customerLabel,
    isOnline: true,
  });
  // Thông báo trang khách
  io.to(`order:${orderId}`).emit("payment:success", {
    orderId,
    totalAmount: order.totalAmount,
    method: "SePay",
  });

  // Đẩy món vào bếp (đơn giao hàng: chờ thu ngân xác nhận trước)
  await releaseOrderToKitchen(prisma, io, orderId);
}



