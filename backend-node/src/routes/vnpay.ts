import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { buildVnpayUrl, verifyVnpaySign } from "../lib/vnpay.js";
import { computeBill, getStoreSettings, computePointsEarned } from "../lib/pricing.js";
import { rankTierFromLifetimeSpend } from "../lib/rank.js";
import { deductInventoryForOrder } from "../lib/inventory.js";
import { releaseOrderToKitchen } from "../lib/delivery.js";

export function vnpayRouter(prisma: PrismaClient, io: Server) {
  const r = Router();

  /**
   * POST /api/orders/:id/vnpay/create
   * Tạo URL thanh toán VNPay cho đơn hàng — frontend redirect tới URL này.
   */
  r.post("/orders/:id/vnpay/create", async (req, res) => {
    const orderId = Number(req.params.id);
    if (Number.isNaN(orderId)) return res.status(400).json({ error: "Id không hợp lệ" });

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
    const { discountVoucherAmt = 0, voucherCode = null } = (req.body ?? {}) as { discountVoucherAmt?: number, voucherCode?: string | null };
    const computed = computeBill(
      Number(order.subTotal),
      Number(order.discountAmt) + Number(discountVoucherAmt),
      Number(order.pointsUsed),
      settings.pointValueVnd,
      settings.vatRatePercent,
    );
    const chargeAmount = Math.max(1000, Math.round(computed.totalAmount + Number(order.shippingFee || 0)));

    // Save the voucherCode temporarily in cancelReason (format VOUCHER:code:discount)
    await prisma.order.update({
      where: { id: orderId },
      data: {
        cancelReason: voucherCode ? `VOUCHER:${voucherCode}:${discountVoucherAmt}` : null,
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

    const { vnp_ResponseCode, vnp_TxnRef } = (req.body ?? {}) as {
      vnp_ResponseCode?: string;
      vnp_TxnRef?: string;
    };
    if (vnp_ResponseCode !== "00") return res.json({ ok: false, reason: "not_success" });

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ ok: false });

    // Dùng vnp_TxnRef làm key idempotent (tránh double-payment kể cả race condition)
    const transCode = vnp_TxnRef
      ? `VNPAY-${vnp_TxnRef}`
      : `VNPAY-CLIENT-${orderId}`;

    // Kiểm tra payment theo transCode (idempotent hoàn toàn)
    const existingByCode = vnp_TxnRef
      ? await prisma.payment.findFirst({ where: { transCode } })
      : null;

    // Kiểm tra payment theo orderId+method (phòng IPN đã xử lý)
    const existingByOrder = await prisma.payment.findFirst({
      where: { orderId, method: "VNPay" },
    });

    if (existingByCode || existingByOrder || order.status === "Paid") {
      // Đảm bảo status = Paid
      if (order.status !== "Paid") {
        await prisma.order.update({ where: { id: orderId }, data: { status: "Paid" } });
      }
      return res.json({ ok: true, alreadyPaid: true });
    }

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
    const chargeAmount = Math.round(finalTotal);

    await prisma.$transaction(async (tx) => {
      const updateResult = await tx.order.updateMany({ 
        where: { id: orderId, status: { not: "Paid" } }, 
        data: { 
          status: "Paid",
          discountAmt: Number(order.discountAmt) + voucherDiscount,
          vatAmount: computed.vatAmount,
          totalAmount: finalTotal,
          cancelReason: null,
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

      if (voucherCode) {
        await tx.voucher.updateMany({
          where: { code: voucherCode },
          data: { usedCount: { increment: 1 } },
        });
      }

      if (order.customerId) {
        const customer = await tx.customer.findUnique({ where: { id: order.customerId } });
        if (customer) {
          const pointsEarned = computePointsEarned(computed.totalAmount, settings.pointEarnEveryVnd, settings.pointEarnEach);
          const prevPaid = await tx.order.aggregate({
            where: { customerId: order.customerId, status: "Paid" },
            _sum: { totalAmount: true },
          });
          const lifetimeAfter = (prevPaid._sum.totalAmount ?? 0) + computed.totalAmount;
          const rankTier = rankTierFromLifetimeSpend(lifetimeAfter);
  
          await tx.customer.update({
            where: { id: order.customerId },
            data: {
              points: customer.points - Number(order.pointsUsed) + pointsEarned,
              rankTier,
            },
          });
        }
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
      io.to("pos").emit("payment:done", {
        orderId,
        method: "VNPay",
        amount: chargeAmount,
        tableLabel,
        customerLabel,
        isOnline: true,
      });
      io.to("staff").emit("payment:done", {
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

        const updateResult = await tx.order.updateMany({
          where: { id: orderId, status: { not: "Paid" } },
          data: { 
            status: "Paid",
            discountAmt: Number(order.discountAmt) + voucherDiscount,
            vatAmount: computed.vatAmount,
            totalAmount: computed.totalAmount,
            cancelReason: null,
          },
        });
        if (updateResult.count === 0) return; // Đã được xử lý bởi request khác
        await deductInventoryForOrder(tx, orderId);

        await tx.payment.create({
          data: {
            orderId,
            method: "VNPay",
            amount: Math.round(computed.totalAmount),
            transCode: txnRef,
          },
        });

        if (voucherCode) {
          await tx.voucher.updateMany({
            where: { code: voucherCode },
            data: { usedCount: { increment: 1 } },
          });
        }

        if (order.customerId) {
          const customer = await tx.customer.findUnique({ where: { id: order.customerId } });
          if (customer) {
            const pointsEarned = computePointsEarned(computed.totalAmount, settings.pointEarnEveryVnd, settings.pointEarnEach);
            const prevPaid = await tx.order.aggregate({
              where: { customerId: order.customerId, status: "Paid" },
              _sum: { totalAmount: true },
            });
            const lifetimeAfter = (prevPaid._sum.totalAmount ?? 0) + computed.totalAmount;
            const rankTier = rankTierFromLifetimeSpend(lifetimeAfter);
    
            await tx.customer.update({
              where: { id: order.customerId },
              data: {
                points: customer.points - Number(order.pointsUsed) + pointsEarned,
                rankTier,
              },
            });
          }
        }
    
        if (order.tableId) {
          await tx.cafeTable.update({
            where: { id: order.tableId },
            data: { status: "Cleaning" },
          });
        }
      });
    }

    // Cập nhật socket cho frontend
    const updatedOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: { table: true, customer: { select: { fullName: true } } },
    });

    if (responseCode === "00" && updatedOrder) {
      // Thông báo POS
      const tableLabel = updatedOrder.table ? updatedOrder.table.name : "Mang về";
      const customerLabel = updatedOrder.customer?.fullName ?? "Vãng lai";
      io.to("pos").emit("payment:done", {
        orderId,
        method: "VNPay",
        amount: updatedOrder.totalAmount,
        tableLabel,
        customerLabel,
        isOnline: true,
      });
      io.to("staff").emit("payment:done", {
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
