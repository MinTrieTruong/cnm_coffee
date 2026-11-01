import { Router } from "express";
import type { Order, PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { SePayPgClient } from "sepay-pg-node";
import crypto from "crypto";
import { deductInventoryForOrder } from "../lib/inventory.js";
import { releaseOrderToKitchen } from "../lib/delivery.js";
import { customerShipping, refreshOrderPromotion } from "../lib/promotions.js";
import { consumeVoucher, resolveVoucher, voucherHold } from "../lib/vouchers.js";

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
    await refreshOrderPromotion(prisma, orderId);

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
    const chargeAmount = Math.max(1000, Math.round(computed.totalAmount + customerShipping(order)));

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
    const invoice = `TD${orderId}-${Date.now()}`;
    const fields = client.checkout.initOneTimePaymentFields({
      payment_method:       "BANK_TRANSFER",
      order_invoice_number: invoice,
      order_amount:         chargeAmount,
      currency:             "VND",
      order_description:    `TD Coffee don ${orderId}`,
      // Mã hoá đơn quay về cùng trang success để /sepay/confirm tra cứu lại trên SePay
      success_url:          `${publicUrl}/order/${orderId}/checkout?sepay=success&inv=${encodeURIComponent(invoice)}`,
      error_url:            `${publicUrl}/order/${orderId}/checkout?sepay=error`,
      cancel_url:           `${publicUrl}/order/${orderId}/checkout?sepay=cancel`,
    });

    console.log("[sepay] create:", { orderId, amount: chargeAmount, env });
    return res.json({ checkoutUrl, fields });
  });

  /**
   * POST /api/sepay/ipn
   * SePay gọi server-to-server sau khi thanh toán. Không tin nội dung gửi tới: luôn tra cứu lại hoá đơn trên SePay
   * (đã thanh toán + đủ tiền) rồi mới ghi nhận. Có header X-SePay-Signature thì chữ ký phải khớp.
   * Trả 400 khi chưa xác minh được để SePay gửi lại sau.
   */
  r.post("/sepay/ipn", async (req, res) => {
    const body      = (req.body ?? {}) as Record<string, unknown>;
    const secretKey = process.env.SEPAY_SECRET_KEY ?? "";
    const received  = req.headers["x-sepay-signature"] as string | undefined;

    if (received) {
      const expected = crypto.createHmac("sha256", secretKey).update(JSON.stringify(body)).digest("hex");
      if (received !== expected) {
        console.warn("[sepay/ipn] Chữ ký không khớp");
        return res.status(400).json({ error: "Invalid signature" });
      }
    }

    // Format: TD{orderId}-{timestamp}
    const ord = (body.order as Record<string, unknown> | undefined) ?? {};
    const invoice = String(body.order_invoice_number ?? ord.order_invoice_number ?? body.invoice_number ?? "");
    const m = /^TD(\d+)-\d{10,16}$/.exec(invoice);
    if (!m) return res.json({ success: true, ignored: true });
    const orderId = Number(m[1]);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.status === "Paid") return res.json({ success: true });

    const paid = await lookupSepayPaid(invoice);
    const expected = await sepayExpectedAmount(prisma, order);
    if (!paid.ok || paid.amount < expected) {
      console.warn("[sepay/ipn] Chưa xác minh được giao dịch", { invoice, ...paid, expected });
      return res.status(400).json({ error: "Không xác minh được giao dịch với SePay." });
    }

    await confirmOrderPaid(prisma, io, orderId, { order_invoice_number: invoice, transaction: body.transaction });
    console.log("[sepay/ipn] Đã tra cứu SePay, xác nhận đơn #", orderId);
    return res.json({ success: true });
  });

  /**
   * POST /api/orders/:id/sepay/confirm  body { invoice }
   * Frontend gọi sau khi SePay chuyển về trang success — fallback khi IPN không tới được server (localhost, ngrok hết hạn…).
   * Không tin trình duyệt: chỉ xác nhận khi tự tra cứu hoá đơn trên SePay thấy đã thanh toán đủ tiền.
   * Tra không được / chưa trả → trả { confirmed:false, pending:true }, chờ IPN.
   */
  r.post("/orders/:id/sepay/confirm", async (req, res) => {
    const orderId = Number(req.params.id);
    if (Number.isNaN(orderId)) return res.status(400).json({ error: "Id không hợp lệ" });

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: "Đơn không tìm thấy" });

    // Nếu đã Paid rồi (IPN tới trước) → trả về luôn
    if (order.status === "Paid") {
      return res.json({ confirmed: true, alreadyPaid: true });
    }

    // Chỉ cho confirm nếu đơn đang ở trạng thái chờ
    if (!["Confirmed", "Pending_Grace", "Waiting_Pay"].includes(order.status)) {
      return res.status(400).json({ error: "Đơn không ở trạng thái có thể xác nhận" });
    }

    // Hoá đơn phải do chính đơn này tạo (TD{orderId}-{timestamp}) — không dùng hoá đơn đã trả của đơn khác
    const invoice = String((req.body as { invoice?: unknown } | undefined)?.invoice ?? "");
    if (!new RegExp(`^TD${orderId}-\\d{10,16}$`).test(invoice)) {
      return res.status(400).json({ error: "Thiếu hoặc sai mã hoá đơn thanh toán." });
    }

    const paid = await lookupSepayPaid(invoice);
    const expected = await sepayExpectedAmount(prisma, order);
    if (!paid.ok || paid.amount < expected) {
      console.warn("[sepay/confirm] Chưa xác nhận được đơn #", orderId, { invoice, ...paid, expected });
      return res.status(202).json({ confirmed: false, pending: true, message: "Đang chờ SePay xác nhận thanh toán." });
    }

    await confirmOrderPaid(prisma, io, orderId, { source: "sepay_lookup", invoice, amount: paid.amount });
    console.log("[sepay/confirm] Đã tra cứu SePay, xác nhận đơn #", orderId);
    return res.json({ confirmed: true });
  });

  return r;
}

import { computeBill, getStoreSettings, computePointsEarned } from "../lib/pricing.js";
import { settlePaidPoints } from "../lib/points.js";
import { toStore } from "../lib/storeScope.js";

/** Trạng thái đơn còn nhận thanh toán */
const PAYABLE = ["Confirmed", "Pending_Grace", "Waiting_Pay"];

/** Trạng thái hoá đơn SePay coi là đã thu tiền */
const SEPAY_PAID = new Set(["CAPTURED", "PAID", "COMPLETED", "SUCCESS", "APPROVED"]);

/**
 * Tra cứu hoá đơn trên SePay (GET order/detail/{invoice}). Lỗi mạng / quá 8 giây / không tìm thấy → ok:false.
 * Đọc mềm vài tên trường vì SDK không công bố kiểu dữ liệu trả về.
 */
async function lookupSepayPaid(invoice: string): Promise<{ ok: boolean; amount: number; status?: string; error?: string }> {
  const merchantId = process.env.SEPAY_MERCHANT_ID ?? "";
  const secretKey = process.env.SEPAY_SECRET_KEY ?? "";
  if (!merchantId || !secretKey) return { ok: false, amount: 0, error: "missing_config" };
  const env = (process.env.SEPAY_ENV ?? "sandbox") as "sandbox" | "production";
  const client = new SePayPgClient({ env, merchant_id: merchantId, secret_key: secretKey });
  try {
    const res = await Promise.race([
      client.order.retrieve(invoice),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
    ]);
    const body = (res.data ?? {}) as Record<string, unknown>;
    const d = ((body.data as Record<string, unknown> | undefined) ?? body) as Record<string, unknown>;
    if (d.order_invoice_number !== undefined && String(d.order_invoice_number) !== invoice) return { ok: false, amount: 0, error: "invoice_mismatch" };
    const status = String(d.order_status ?? d.status ?? "").toUpperCase();
    const amount = Number(d.order_amount ?? d.amount ?? 0);
    return { ok: SEPAY_PAID.has(status) && amount > 0, amount: Number.isFinite(amount) ? amount : 0, status };
  } catch (e) {
    return { ok: false, amount: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Số tiền khách phải trả qua SePay — cùng công thức lúc tạo phiên thanh toán (/sepay/create) */
async function sepayExpectedAmount(prisma: PrismaClient, order: Order) {
  const voucherDiscount = order.cancelReason?.startsWith("VOUCHER:") ? Number(order.cancelReason.split(":")[2]) || 0 : 0;
  const settings = await getStoreSettings(prisma);
  const computed = computeBill(Number(order.subTotal), Number(order.discountAmt) + voucherDiscount, Number(order.pointsUsed), settings.pointValueVnd, settings.vatRatePercent);
  return Math.max(1000, Math.round(computed.totalAmount + customerShipping(order)));
}

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
  const finalTotal = computed.totalAmount + customerShipping(order);

  await prisma.$transaction(async (tx) => {
    // Re-check order status within transaction to prevent race conditions
    const currentOrder = await tx.order.findUnique({
      where: { id: orderId },
      select: { status: true }
    });
    // Chỉ đơn đang chờ thanh toán (không nhận đơn đã hủy / đã thanh toán)
    if (!currentOrder || !PAYABLE.includes(currentOrder.status)) return;

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
        method:    "SePay",
        amount:    Math.round(finalTotal),
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



