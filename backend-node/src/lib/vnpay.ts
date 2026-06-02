import crypto from "crypto";

/**
 * Tạo URL thanh toán VNPay
 * Tài liệu: https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html
 */
export function buildVnpayUrl(p: {
  amount: number;        // Số tiền VND
  orderId: number;       // ID đơn hàng
  orderInfo: string;     // Mô tả đơn hàng
  ipAddr: string;        // IP khách
  returnUrl: string;     // URL redirect sau khi thanh toán
  tmnCode: string;
  hashSecret: string;
  vnpUrl: string;
}): string {
  const now = new Date();
  const z = (n: number) => String(n).padStart(2, "0");
  const createDate = [
    now.getFullYear(),
    z(now.getMonth() + 1),
    z(now.getDate()),
    z(now.getHours()),
    z(now.getMinutes()),
    z(now.getSeconds()),
  ].join("");

  const params: Record<string, string> = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: p.tmnCode,
    vnp_Amount: String(Math.round(p.amount) * 100), // VNPay nhân 100
    vnp_CurrCode: "VND",
    vnp_TxnRef: `${p.orderId}_${Date.now()}`,
    vnp_OrderInfo: p.orderInfo,
    vnp_OrderType: "billpayment",
    vnp_Locale: "vn",
    vnp_ReturnUrl: p.returnUrl,
    vnp_IpAddr: p.ipAddr,
    vnp_CreateDate: createDate,
  };

  // Sort key alphabetically (bắt buộc của VNPay)
  const sorted = Object.keys(params)
    .sort()
    .reduce<Record<string, string>>((acc, k) => {
      acc[k] = params[k];
      return acc;
    }, {});

  const signData = new URLSearchParams(sorted).toString();
  const hash = crypto.createHmac("sha512", p.hashSecret).update(signData).digest("hex");

  return `${p.vnpUrl}?${signData}&vnp_SecureHash=${hash}`;
}

/**
 * Xác minh chữ ký VNPay trả về (dùng cho cả Return URL và IPN)
 */
export function verifyVnpaySign(
  query: Record<string, string>,
  hashSecret: string,
): { valid: boolean; responseCode: string; txnRef: string } {
  const secureHash = query.vnp_SecureHash ?? "";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { vnp_SecureHash: _h, vnp_SecureHashType: _ht, ...rest } = query;

  const sorted = Object.keys(rest)
    .sort()
    .reduce<Record<string, string>>((acc, k) => {
      if (rest[k] !== undefined && rest[k] !== "") acc[k] = rest[k];
      return acc;
    }, {});

  const signData = new URLSearchParams(sorted).toString();
  const expected = crypto.createHmac("sha512", hashSecret).update(signData).digest("hex");

  return {
    valid: expected.toLowerCase() === secureHash.toLowerCase(),
    responseCode: query.vnp_ResponseCode ?? "",
    txnRef: query.vnp_TxnRef ?? "",
  };
}
