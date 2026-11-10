/** Khớp REJECT_REASONS / RETURN_RESOLUTIONS ở backend (lib/supplierReturns.ts) */
export const REJECT_REASON: Record<string, string> = {
  DAMAGED: "Hỏng / vỡ",
  WRONG_SPEC: "Sai quy cách",
  NEAR_EXPIRY: "Cận hạn / hết hạn",
  WRONG_ITEM: "Sai mặt hàng",
  QUALITY: "Không đạt chất lượng",
};

export const RESOLUTION_LABEL: Record<string, string> = {
  CREDIT: "Giảm trừ công nợ",
  REFUND: "NCC hoàn tiền",
  REPLACE: "Đổi hàng (NCC giao lại)",
  WRITE_OFF: "NCC không nhận — ghi hao hụt",
};

export const RETURN_STATUS: Record<string, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
};

export const SUPPLIER_STATUS: Record<string, string> = {
  CONFIRMED: "NCC đã xác nhận",
  DISPUTED: "NCC khiếu nại",
};
