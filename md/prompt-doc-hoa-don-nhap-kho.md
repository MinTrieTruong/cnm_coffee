# Prompt: Chụp hóa đơn nhà cung cấp → tự điền phiếu nhập kho (#2)

Tính năng #2 trong `plan/de-xuat-ai-gemini.md`. Làm trên nhánh `feat/chain-stores`, **một phiên Claude Code** (prompt ở cuối file).

**Yêu cầu chính của bạn:** AI chỉ **điền sẵn**, người nhận hàng **phải kiểm tra lại từng dòng** rồi mới bấm xác nhận. AI không bao giờ tự nhập kho.

## Hiện trạng (đã kiểm tra code)

- Màn nhận hàng theo đơn mua (PO) ở `frontend-app/src/pages/ProcurementAdmin.tsx` (hàm `receiveOrder`, biến `recvInvoice`). Người nhận đang phải **tự gõ** từng dòng: số thực nhận, số hỏng / trả lại, hạn sử dụng; và **bắt buộc chụp ảnh hóa đơn** (`invoicePhoto`) làm chứng từ công nợ.
- API `POST /api/purchasing/orders/:id/receive` trong `backend-node/src/routes/procurement.ts` nhận `{ lines: [{ itemId, receivedQty, rejectedQty, expiryDate, rejectReason, rejectPhoto, shortAction, backorderDate, note }], invoicePhoto, note }`, tạo `GoodsReceipt` + `GoodsReceiptItem` + lô `InventoryBatch` + công nợ `SupplierBill`.
- Giá đặt nằm ở `SupplierQuoteItem.unitPrice` (PO tạo từ báo giá). Đơn vị kho ở `InventoryItem.unit`.

→ Ảnh hóa đơn **đã được chụp sẵn** trong quy trình. Tính năng này chỉ thêm một bước: AI đọc chính ảnh đó để điền form, thay vì người dùng gõ tay. Không đổi API nhập kho.

## Luồng mới

1. Mở "Nhận hàng" của một PO → chụp / chọn ảnh hóa đơn như hiện tại (cho phép **tối đa 3 ảnh** nếu hóa đơn dài).
2. Bấm **"Đọc hóa đơn bằng AI"** (hoặc tự chạy ngay sau khi chụp) → khoảng 3–8 giây.
3. Form được điền sẵn. Mỗi ô do AI điền có **viền tím + biểu tượng AI**; ô AI không chắc có **viền vàng**; chỗ lệch với đơn mua có **nhãn đỏ** (giao thiếu, giao dư, giá khác báo giá, mặt hàng không có trong đơn).
4. **Bước kiểm tra bắt buộc:**
   - Màn chia đôi: bên trái **ảnh hóa đơn** (phóng to, kéo được; bấm vào một dòng trong form thì ảnh **tô sáng vùng dòng đó** nếu AI trả được tọa độ), bên phải form.
   - Mỗi dòng có ô **"Đã kiểm"**. Nút **"Xác nhận nhập kho"** chỉ bật khi **mọi dòng đã được tích**. Có nút "Tích tất cả các dòng không có cảnh báo" để nhanh, nhưng dòng vàng / đỏ phải tích từng dòng.
   - Sửa bất kỳ ô nào thì ô đó mất viền tím (thành giá trị do người nhập).
   - Hộp xác nhận cuối cùng tóm tắt: N dòng, tổng tiền theo hóa đơn so với tổng theo đơn mua, các lệch còn lại.
5. Bấm xác nhận → gọi API nhập kho **như cũ**. Lưu thêm kết quả AI gốc để đối chiếu.
6. AI tắt / lỗi / ảnh mờ → hiện "Không đọc được, vui lòng nhập tay", form để trống như hiện nay. Không chặn việc nhận hàng.

## AI đọc ra những gì

Từ ảnh hóa đơn / phiếu giao hàng: số hóa đơn, ngày, tên nhà cung cấp, từng dòng (tên hàng như in trên hóa đơn, số lượng, đơn vị, đơn giá, thành tiền, hạn sử dụng / số lô nếu có), tổng tiền.

**Khớp dòng hóa đơn với mặt hàng trong đơn mua:** gửi kèm cho Gemini danh sách mặt hàng của PO đó (itemId, tên, đơn vị kho, số còn phải giao, đơn giá báo giá). AI chọn `itemId` cho từng dòng; dòng không khớp mặt hàng nào thì để `null` (hiện ở mục "Không có trong đơn mua", người dùng chọn tay hoặc bỏ qua).

**Quy đổi đơn vị:** hóa đơn ghi "2 thùng (24 hộp)" nhưng kho tính theo "hộp" → AI trả `qtyInvoice`, `unitInvoice` và `qtyStock` (đã quy đổi) kèm `conversionNote` ("1 thùng = 24 hộp"). Quy đổi không chắc thì viền vàng. Ghi nhớ quy đổi đã được người dùng xác nhận theo cặp (nhà cung cấp, tên hàng trên hóa đơn) để lần sau gửi kèm cho AI.

**Kiểm tra bằng code sau khi AI trả về (không tin AI):**
- `itemId` phải thuộc PO; `qtyStock` nguyên, ≥ 0, không vượt số còn phải giao (vượt → nhãn đỏ "giao dư", điền tối đa bằng số còn lại).
- Thành tiền ≈ số lượng × đơn giá (lệch > 1% → vàng). Tổng các dòng ≈ tổng hóa đơn.
- Đơn giá khác giá báo giá > 2% → nhãn đỏ "giá khác báo giá: 52.000đ so với 50.000đ".
- Hạn sử dụng phải là ngày hợp lệ ở tương lai; còn dưới 30 ngày → nhãn vàng "cận hạn" (gợi ý chọn lý do trả lại `NEAR_EXPIRY` nếu cần).
- Ngày hóa đơn quá xa hôm nay (> 7 ngày) → vàng.
- Số hóa đơn đã dùng ở phiếu nhập khác của cùng nhà cung cấp → đỏ "có thể trùng hóa đơn".

---

## Prompt (dán vào Claude Code)

```
Làm trên nhánh feat/chain-stores. Đọc plan/prompt-doc-hoa-don-nhap-kho.md và plan/de-xuat-ai-gemini.md (mục #2 và mục 3 "Bật / tắt AI").

Mục tiêu: trong màn Nhận hàng theo đơn mua, AI đọc ảnh hóa đơn nhà cung cấp và ĐIỀN SẴN form; người nhận BẮT BUỘC kiểm tra từng dòng rồi mới xác nhận. Không đổi logic nhập kho hiện có (POST /api/purchasing/orders/:id/receive).

## 0. Hạ tầng AI dùng chung
Tìm lib/gemini.ts, AiSetting, AiCallLog, lib/aiSettings.ts (isAiEnabled). Chưa có thì tạo theo plan/prompt-ban-tin-cuoi-ngay.md mục 0. Bổ sung cho gemini.ts gửi nhiều ảnh inline (jpeg/png/webp, mỗi ảnh nén về cạnh dài ≤ 2000px, ≤ 3 ảnh).
Thêm tính năng "INVOICE_OCR" (mặc định bật, dailyLimit 200).

## 1. Đọc hóa đơn: backend-node/src/lib/invoiceOcr/
- context.ts → buildPoContext(poId): mặt hàng còn phải giao của PO (dùng orderedLines có sẵn trong procurement.ts, tách ra lib nếu cần): { itemId, name, unit, remaining, quotedPrice }, tên nhà cung cấp, và các quy đổi đơn vị đã ghi nhớ của nhà cung cấp đó.
- extract.ts → extractInvoice({ images, poContext }) gọi Gemini với responseSchema:
  {
    readable: boolean, reason: string|null,
    invoiceNo: string|null, invoiceDate: "YYYY-MM-DD"|null, supplierName: string|null, totalAmount: integer|null,
    lines: [{
      rawName: string, itemId: integer|null, matchConfidence: number,
      qtyInvoice: number, unitInvoice: string|null, qtyStock: integer|null, conversionNote: string|null,
      unitPrice: integer|null, lineTotal: integer|null,
      expiryDate: "YYYY-MM-DD"|null, lotNo: string|null,
      box: { page: integer, x: number, y: number, w: number, h: number } | null   // vùng dòng trên ảnh, tỉ lệ 0–1
    }]
  }
  System prompt tiếng Việt: đọc hóa đơn / phiếu giao hàng tiếng Việt (in hoặc viết tay); số tiền VNĐ ("52.000", "52k", "52,000" = 52000); ngày dạng dd/MM/yyyy; CHỈ chọn itemId trong danh sách gửi kèm, không chắc thì null và matchConfidence thấp; quy đổi về đơn vị kho dựa vào thông tin trên hóa đơn hoặc quy đổi đã ghi nhớ, không đoán; không đọc được thì readable=false kèm lý do (mờ, lóa, không phải hóa đơn).
- validate.ts → validateExtraction(extraction, poContext, storeId): áp các kiểm tra trong mục "Kiểm tra bằng code" của file plan, gắn cho từng dòng flags [{ code, level: "warn"|"error", text }] và tính draftLines đúng dạng body của API receive: { itemId, receivedQty, expiryDate, note } (note ghi số lô nếu có). Kiểm tra trùng số hóa đơn trên GoodsReceipt của cùng nhà cung cấp.

## 2. Lưu kết quả AI để đối chiếu
- Bảng InvoiceExtraction: id, storeId, poId, grnId (null cho tới khi xác nhận), staffId, imageUrls Json, result Json (nguyên văn AI), validated Json (sau kiểm tra), finalLines Json (giá trị người dùng xác nhận), model, tokensIn, tokensOut, latencyMs, createdAt. Thêm cột GoodsReceipt.invoiceNo (VarChar 50, null) để kiểm tra trùng. SQL migration theo cách backend-node/prisma/sql đang làm.
- Bảng SupplierUnitAlias: supplierId, rawName (đã normalizeTerm), itemId, factor (1 đơn vị hóa đơn = factor đơn vị kho), confirmedById, updatedAt; unique (supplierId, rawName).

## 3. API
- POST /api/purchasing/orders/:id/read-invoice (cùng quyền purchasingStore như /receive; multipart hoặc data URL, 1–3 ảnh)
  → kiểm tra isAiEnabled("INVOICE_OCR", storeId) → lưu ảnh bằng saveDataUrlImage (để dùng lại làm invoicePhoto, không bắt chụp lại) → extract → validate → lưu InvoiceExtraction → trả { extractionId, readable, reason, header: { invoiceNo, invoiceDate, supplierName, totalAmount, supplierMismatch }, lines: [...validated, flags], unmatched: [...], totals: { invoice, byPo, diff }, imageUrls }.
  AI tắt / lỗi / quá 20 giây → 503 { unavailable: true }.
- Sửa POST /receive (thay đổi nhỏ, không phá luồng cũ): nhận thêm tùy chọn extractionId, invoiceNo, invoicePhotoUrl (đường dẫn ảnh đã lưu ở bước read-invoice, chỉ chấp nhận đường dẫn do hệ thống cấp, giống cách reviews.ts kiểm tra ảnh), unitAliases [{ rawName, itemId, factor }].
  Trong transaction: gắn grnId và finalLines vào InvoiceExtraction, lưu invoiceNo, upsert SupplierUnitAlias người dùng đã xác nhận.
- GET /api/ai/invoice-ocr/stats (Owner): số lần đọc, tỉ lệ đọc được, và ĐỘ CHÍNH XÁC theo trường = % dòng mà giá trị AI (itemId, receivedQty, expiryDate, unitPrice) trùng giá trị người dùng xác nhận. Số này đưa vào báo cáo đồ án.

## 4. Giao diện (ProcurementAdmin.tsx, khung Nhận hàng)
Tách phần nhận hàng thành component riêng nếu file quá dài (VD components/procurement/ReceiveDialog.tsx), giữ nguyên hành vi cũ.
- Ô ảnh hóa đơn: cho thêm tối đa 3 ảnh. Khi có ảnh và AI bật: nút "Đọc hóa đơn bằng AI" (icon Sparkles). Đang đọc: khung chờ trên form, vẫn cho nhập tay.
- Sau khi đọc: bố cục 2 cột trên máy tính (trái ảnh phóng to / kéo / xoay, phải form); điện thoại: ảnh thu gọn ở trên, bấm để phóng to toàn màn hình.
- Phần đầu: số hóa đơn (sửa được), ngày, nhà cung cấp đọc được (khác NCC của PO → cảnh báo đỏ), tổng hóa đơn so với tổng theo đơn mua.
- Mỗi dòng mặt hàng của PO: các ô sẵn có (thực nhận, hỏng / trả lại, HSD, xử lý phần thiếu) được điền từ draftLines. Ô do AI điền: viền tím + chấm AI. Ô có flag warn: viền vàng + chú thích; error: nhãn đỏ. Hiện "Trên hóa đơn: 2 thùng × 520.000đ (1 thùng = 24 hộp)" dưới dòng. Bấm vào dòng → tô sáng vùng box trên ảnh.
- Ô "Đã kiểm" ở mỗi dòng. Nút "Tích các dòng không có cảnh báo". Nút "Xác nhận nhập kho" bị khóa cho tới khi mọi dòng có số nhận > 0 hoặc có cảnh báo đều đã tích; tooltip nói còn bao nhiêu dòng chưa kiểm.
- Mục "Không có trong đơn mua": dòng hóa đơn chưa khớp, cho chọn mặt hàng của PO hoặc "Bỏ qua".
- Dòng có quy đổi đơn vị: ô tích "Ghi nhớ quy đổi này cho nhà cung cấp" (mặc định bật khi người dùng sửa / xác nhận).
- Hộp xác nhận cuối: tóm tắt số dòng, tổng tiền, các lệch còn lại, và các dòng còn để AI điền chưa sửa.
- Gửi /receive như cũ + extractionId, invoiceNo, invoicePhotoUrl, unitAliases.
- AI tắt (theo GET trạng thái AI) → ẩn nút đọc, mọi thứ như hiện nay. Đọc lỗi → "Không đọc được hóa đơn (lý do). Vui lòng nhập tay."

## 5. Kiểm thử
- Tạo 5–8 ảnh hóa đơn mẫu (chụp hóa đơn thật hoặc dựng bằng HTML rồi chụp, có 1 ảnh viết tay, 1 ảnh mờ, 1 ảnh có quy đổi thùng → hộp, 1 ảnh giá khác báo giá, 1 ảnh có mặt hàng ngoài PO) để trong backend-node/scripts/fixtures/invoices/.
- backend-node/scripts/testInvoiceOcr.ts: với một PO mẫu, chạy extract + validate cho từng ảnh, in bảng so với đáp án viết tay (JSON cạnh ảnh), tính độ chính xác theo trường.
- Kiểm tra: không tích đủ thì không xác nhận được; itemId ngoài PO bị loại; số vượt phần còn phải giao bị chặn; số hóa đơn trùng bị cảnh báo; AI tắt thì luồng cũ chạy y như trước; nhận hàng không dùng AI vẫn chạy (không gửi extractionId).
- tsc backend và frontend.
Báo lại: độ chính xác trên bộ ảnh mẫu, thời gian đọc trung bình, token mỗi lần, ảnh chụp màn hình bước kiểm tra.
```

## Câu trả lời sẵn khi hội đồng hỏi

- **"AI đọc sai thì sao?"** AI chỉ điền nháp; người nhận phải tích kiểm từng dòng mới xác nhận được; code kiểm tra lại số lượng, giá, hạn dùng, trùng hóa đơn và đánh dấu chỗ lệch.
- **"Chính xác bao nhiêu?"** Hệ thống lưu giá trị AI đọc và giá trị người xác nhận, tự tính độ chính xác theo từng trường (màn thống kê AI).
- **"Lợi ích?"** Giảm gõ tay và sai sót khi nhận hàng, phát hiện giao thiếu / giá khác báo giá / hàng cận hạn ngay lúc nhận, ảnh hóa đơn vẫn là chứng từ công nợ như trước.
