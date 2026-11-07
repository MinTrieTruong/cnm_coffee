# Đọc hoá đơn nhà cung cấp bằng AI — kết quả bộ ảnh mẫu

Chạy: `npx tsx scripts/testInvoiceOcr.ts` · 11:21:03 7/11/2026 · đơn mua PO-202611-0009 (5 mặt hàng) · 7 ảnh trong `backend-node/scripts/fixtures/invoices/` (dựng bằng `make.mjs`)

- Nhận ra đọc được / không: 7/7 (100%)
- Đúng mặt hàng (có / không có trên hoá đơn): 30/30 (100%)
- Đúng số nhận (đơn vị kho, đã quy đổi): 16/16 (100%)
- Đúng hạn sử dụng: 16/16 (100%)
- Nhận ra mặt hàng ngoài đơn mua: 1/1 (100%)
- Có cảnh báo mong đợi (giá khác, giao thiếu, cận hạn): 4/4 (100%)
- Thời gian đọc trung bình: 4657 ms · Token trung bình: 2651 / ảnh

| Ảnh | Đọc được | Mặt hàng | Số nhận | HSD | Ngoài đơn mua | Cảnh báo | ms |
|---|---|:-:|:-:|:-:|---|---|--:|
| inv1-chuan.png | có | 5/5 | 5/5 | 5/5 | — | NEAR_EXPIRY | 3805 |
| inv2-quy-doi-thung.png | có | 5/5 | 2/2 | 2/2 | — | NOT_ON_INVOICE, NOT_ON_INVOICE, NOT_ON_INVOICE | 3921 |
| inv3-gia-khac-giao-thieu.png | có | 5/5 | 2/2 | 2/2 | — | NOT_ON_INVOICE, NOT_ON_INVOICE, SHORT, PRICE, NOT_ON_INVOICE | 3163 |
| inv4-ngoai-don-mua.png | có | 5/5 | 2/2 | 2/2 | Bột cacao nguyên chất 500g | NOT_ON_INVOICE, NOT_ON_INVOICE, NOT_ON_INVOICE | 8001 |
| inv5-viet-tay.png | có | 5/5 | 3/3 | 3/3 | — | SHORT, SHORT, NOT_ON_INVOICE, NOT_ON_INVOICE | 6142 |
| inv6-anh-mo.png | không | — | — | — | — | DATE, NOT_ON_INVOICE, NOT_ON_INVOICE, PRICE, NOT_ON_INVOICE | 3392 |
| inv7-can-han.png | có | 5/5 | 2/2 | 2/2 | — | NOT_ON_INVOICE, NOT_ON_INVOICE, NEAR_EXPIRY, NOT_ON_INVOICE | 4176 |

Ảnh mẫu: hoá đơn in chuẩn, quy đổi thùng → hộp, giá khác báo giá + giao thiếu, có mặt hàng ngoài đơn mua, phiếu giao viết tay, ảnh mờ, hàng cận hạn.
