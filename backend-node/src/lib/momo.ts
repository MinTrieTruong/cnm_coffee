import crypto from "crypto";
import https from "https";

export interface MomoCreateResult {
  payUrl: string;      // URL web thanh toán — mở trên trình duyệt
  deeplink: string;    // Deep link mở thẳng app MoMo
  qrCodeUrl: string;   // URL ảnh QR để hiển thị
}

/**
 * Tạo link thanh toán MoMo qua cổng AIO v2 (captureWallet)
 * Docs: https://developers.momo.vn/v3/vi/docs/payment/onpayment/pay-quickly
 *
 * Sandbox credentials (developers.momo.vn/v3):
 *   partnerCode : MOMOBKUN20180529
 *   accessKey   : klm056883RRSR632
 *   secretKey   : at67qH6mk8w5Y1nAySRECHmSuvYuzh48
 *   Endpoint    : https://test-payment.momo.vn/v2/gateway/api/create
 *   Test account: SĐT 0123456789 | OTP / PIN: 000000
 */
export async function createMomoPayment(p: {
  amount: number;        // VND (số nguyên)
  orderId: number;       // ID đơn hàng trong DB
  orderInfo: string;     // Mô tả đơn hàng hiển thị cho người dùng
  redirectUrl: string;   // Redirect về sau khi thanh toán xong (trình duyệt)
  ipnUrl: string;        // Server-to-server callback từ MoMo
  partnerCode: string;
  accessKey: string;
  secretKey: string;
  endpoint: string;      // https://test-payment.momo.vn/v2/gateway/api/create
}): Promise<MomoCreateResult> {
  // requestId và orderId MoMo phải duy nhất mỗi request
  const requestId = `${p.partnerCode}${Date.now()}_${p.orderId}`;
  const momoOrderId = requestId; // orderId MoMo = requestId (theo docs)
  const extraData = "";
  const requestType = "captureWallet";
  const lang = "vi";

  // Công thức rawSignature — đúng thứ tự theo docs chính thức MoMo:
  // accessKey=&amount=&extraData=&ipnUrl=&orderId=&orderInfo=
  // &partnerCode=&redirectUrl=&requestId=&requestType=
  const rawSignature = [
    `accessKey=${p.accessKey}`,
    `amount=${p.amount}`,
    `extraData=${extraData}`,
    `ipnUrl=${p.ipnUrl}`,
    `orderId=${momoOrderId}`,
    `orderInfo=${p.orderInfo}`,
    `partnerCode=${p.partnerCode}`,
    `redirectUrl=${p.redirectUrl}`,
    `requestId=${requestId}`,
    `requestType=${requestType}`,
  ].join("&");

  const signature = crypto
    .createHmac("sha256", p.secretKey)
    .update(rawSignature)
    .digest("hex");

  const requestBody = JSON.stringify({
    partnerCode: p.partnerCode,
    accessKey: p.accessKey,
    requestId,
    amount: p.amount,
    orderId: momoOrderId,
    orderInfo: p.orderInfo,
    redirectUrl: p.redirectUrl,
    ipnUrl: p.ipnUrl,
    lang,
    extraData,
    requestType,
    signature,
  });

  return new Promise((resolve, reject) => {
    const url = new URL(p.endpoint);
    const options: import("https").RequestOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(requestBody),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      res.on("end", () => {
        try {
          const json = JSON.parse(data) as {
            resultCode: number;
            message: string;
            payUrl?: string;
            deeplink?: string;
            qrCodeUrl?: string;
          };

          console.log("[momo] API response:", JSON.stringify(json));

          if (json.resultCode !== 0) {
            reject(new Error(`MoMo [${json.resultCode}]: ${json.message}`));
          } else {
            resolve({
              payUrl: json.payUrl ?? "",
              deeplink: json.deeplink ?? "",
              qrCodeUrl: json.qrCodeUrl ?? "",
            });
          }
        } catch {
          reject(new Error(`MoMo: phản hồi không hợp lệ — raw: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on("error", (err) => {
      console.error("[momo] request error:", err);
      reject(err);
    });

    req.write(requestBody);
    req.end();
  });
}

/**
 * Xác minh chữ ký IPN callback từ MoMo
 * Docs: https://developers.momo.vn/v3/vi/docs/payment/onpayment/pay-quickly#ipn-callback
 *
 * rawSignature IPN:
 * accessKey=&amount=&extraData=&message=&orderId=&orderInfo=
 * &orderType=&partnerCode=&payType=&requestId=&responseTime=
 * &resultCode=&transId=
 */
export function verifyMomoIpn(
  body: Record<string, string | number>,
  accessKey: string,
  secretKey: string,
): boolean {
  const {
    amount, extraData, message, orderId, orderInfo,
    orderType, partnerCode, payType, requestId,
    responseTime, resultCode, transId,
    signature: receivedSig,
  } = body as Record<string, string>;

  const rawSignature = [
    `accessKey=${accessKey}`,
    `amount=${amount}`,
    `extraData=${extraData ?? ""}`,
    `message=${message ?? ""}`,
    `orderId=${orderId}`,
    `orderInfo=${orderInfo ?? ""}`,
    `orderType=${orderType ?? ""}`,
    `partnerCode=${partnerCode}`,
    `payType=${payType ?? ""}`,
    `requestId=${requestId}`,
    `responseTime=${responseTime}`,
    `resultCode=${resultCode}`,
    `transId=${transId}`,
  ].join("&");

  const expected = crypto
    .createHmac("sha256", secretKey)
    .update(rawSignature)
    .digest("hex");

  return expected === receivedSig;
}
