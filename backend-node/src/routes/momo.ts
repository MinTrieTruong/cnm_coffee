import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { createMomoPayment, verifyMomoIpn } from "../lib/momo.js";

export function momoRouter(prisma: PrismaClient) {
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

    try {
      const result = await createMomoPayment({
        amount:      Math.round(order.totalAmount),
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
        await prisma.order.update({
          where: { id: rawOrderId },
          data:  { status: "Paid" },
        });
        await prisma.payment.create({
          data: {
            orderId:   rawOrderId,
            method:    "MoMo",
            amount:    order.totalAmount,
            transCode: String(body.transId ?? momoOrderId),
          },
        });
        console.log("[momo/ipn] Đã xác nhận thanh toán đơn #", rawOrderId);
      }
    }

    // MoMo yêu cầu trả về 204 (no content) để xác nhận đã nhận
    res.status(204).end();
  });

  return r;
}
