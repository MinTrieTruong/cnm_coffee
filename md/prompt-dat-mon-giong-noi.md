# Prompt: Đặt món bằng giọng nói / câu tự nhiên (#3)

Tính năng #3 trong `plan/de-xuat-ai-gemini.md`. Làm trên nhánh `feat/chain-stores`, **2 phiên Claude Code**: prompt A (backend + POS), prompt B (web khách).

## Demo mong muốn

- **POS / Sơ đồ bàn:** thu ngân bấm giữ nút micro, nói *"hai bạc xỉu ít đá, một trà đào size lớn ít ngọt, một croissant"* → hiện bảng xác nhận 3 dòng đúng món, số lượng, size, đá, đường → bấm "Thêm vào đơn".
- **Web khách:** ô "Nói hoặc gõ món bạn muốn" trên trang Thực đơn. Khách gõ *"cf sữa đá ít ngọt vs 1 bánh mì que"* → thẻ xác nhận → "Thêm vào giỏ".
- Món không có / hết hàng: *"matcha dừa"* → "Quán chưa có Matcha dừa. Bạn thử: Matcha Latte, Trà xanh sữa dừa?" và ghi vào **Khách tìm kiếm**.
- Nói sửa: *"à đổi bạc xỉu thành size L"* khi bảng xác nhận đang mở → cập nhật dòng đó.

## Thiết kế (đọc trước khi dán prompt)

**Một lần gọi Gemini làm cả hai việc:** nghe âm thanh (hoặc đọc chữ) và trả về **JSON giỏ hàng** theo schema. Gửi kèm **thực đơn của chi nhánh** (id, tên, có size không, giá) nên AI chỉ chọn được món có thật. Gửi file âm thanh thẳng cho Gemini, không dùng nhận dạng giọng nói của trình duyệt, vì Safari / iPhone không hỗ trợ tốt và quán cà phê ồn.

**Backend kiểm tra lại tất cả:** productId phải thuộc thực đơn chi nhánh và đang bán; size hợp lệ (món `hasSizes = false` thì bỏ size); số lượng 1–20. **Giá luôn do backend tính** (dùng hàm tính giá có sẵn), không lấy giá từ AI.

**Luôn có bước xác nhận.** AI không bao giờ tự gửi đơn xuống bếp hay tự thanh toán. Dòng AI không chắc (độ tin < 0,7) tô vàng và có ô chọn món khác.

**Khớp với dữ liệu đang có (đã kiểm tra code):**

| | Hiện có |
|---|---|
| Size | `S` / `M` / `L` (`Product.priceSizeS`, `sellPrice` = M, `priceSizeL`), `hasSizes` |
| Đá, đường | Web khách: `CartItem.icePct` 0/50/100, `sugar` "0"/"50"/"100" (`frontend-app/src/lib/cart.ts`, `ProductDetail.tsx`) |
| Ghi chú | `OrderDetail.customNotes`; POS ghép "Size L · Ít đá · …" vào ghi chú (`components/TablePanel.tsx`, kiểu `OrderLine`) |
| Thực đơn chi nhánh | `GET /api/menu` + `StoreProduct` (`isAvailable`, `outOfStock`), `lib/storeProducts.ts` |
| Combo | bảng `Combo`, `addComboToCart()` ở web khách |
| Chuẩn hóa / gõ sai | `lib/searchInsights.ts` → `normalizeTerm()`, `levenshtein()` |
| Ghi nhu cầu chưa có | `POST /api/search-log`, bảng `SearchLog` |
| Topping | **chưa có** trong CSDL → AI ghi vào ghi chú ("thêm trân châu"), không tính tiền |

**Từ lóng, viết tắt:** cho phép quản lý thêm **từ đồng nghĩa** cho từng món ("bx", "bạc xỉu", "bac siu" → Bạc Xỉu) để gửi kèm cho AI; tận dụng luôn cho ô tìm kiếm thường.

**Tắt được:** tính năng `VOICE_ORDER` trong cài đặt AI, tách được POS và web khách (`VOICE_ORDER_POS`, `VOICE_ORDER_WEB`). Tắt thì nút micro / ô nói ẩn hẳn, gọi món bằng tay như cũ.

**Chi phí:** mỗi lần nói khoảng 5–10 giây âm thanh + thực đơn (~2–4 nghìn token). Web khách cần chống lạm dụng: tối đa 10 lần / phiên / giờ, giới hạn theo IP.

---

## Prompt A: backend + POS

```
Làm trên nhánh feat/chain-stores. Đọc plan/prompt-dat-mon-giong-noi.md và plan/de-xuat-ai-gemini.md (mục #3 và mục 3 "Bật / tắt AI").

Mục tiêu: API hiểu câu gọi món (âm thanh hoặc chữ) thành danh sách món, và nút micro trong màn gọi món của POS / Sơ đồ bàn.

## 0. Hạ tầng AI dùng chung
Tìm lib/gemini.ts, AiSetting, AiCallLog, lib/aiSettings.ts (isAiEnabled) — thread chatbot hoặc bản tin cuối ngày có thể đã tạo. Chưa có thì tạo theo plan/prompt-ban-tin-cuoi-ngay.md mục 0. Bổ sung cho gemini.ts khả năng gửi âm thanh inline (audio/webm, audio/mp4, audio/ogg, audio/wav; ≤ 1 MB, ≤ 20 giây).
Thêm 2 tính năng VOICE_ORDER_POS (mặc định bật) và VOICE_ORDER_WEB (mặc định bật, dailyLimit 500).

## 1. Từ đồng nghĩa cho món
- Thêm cột Product.aliases (JSON mảng chuỗi, tối đa 10, mỗi chuỗi ≤ 40 ký tự) bằng SQL migration theo cách backend-node/prisma/sql đang làm.
- Màn sửa món (Thực đơn) thêm ô "Tên gọi khác" dạng thẻ. Chỉ Owner sửa.
- Ô tìm kiếm thực đơn khách hiện có cũng khớp theo aliases (dùng normalizeTerm).

## 2. lib/voiceOrder/menuContext.ts
buildMenuContext(storeId): danh sách món đang bán ở chi nhánh (StoreProduct isAvailable, chưa hết hàng) + món chuỗi có nhưng chi nhánh đang hết (để AI nói "đang hết"), dạng gọn:
{ id, name, aliases, category, hasSizes, outOfStock } và combo đang bán { comboId, name }.
Cache 60 giây theo storeId, xóa cache khi đổi thực đơn / báo hết món (dùng sự kiện trong lib/menuEvents.ts nếu có).

## 3. lib/voiceOrder/parse.ts → parseOrder({ storeId, audio?, text?, current? , channel: "POS"|"WEB" })
- Gọi Gemini với responseSchema:
  {
    transcript: string,               // câu AI nghe được (để hiện cho người dùng)
    intent: "add" | "modify" | "remove" | "clear" | "unclear",
    items: [{ productId: number|null, comboId: number|null, spokenName: string, qty: integer,
              size: "S"|"M"|"L"|null, ice: 0|50|100|null, sugar: 0|50|100|null,
              note: string|null, confidence: number, targetLine: integer|null }],
    unknown: [{ spokenName: string, suggestions: number[] }],   // món không có trong thực đơn, ≤3 gợi ý productId
    clarify: string|null              // câu hỏi lại khi không hiểu, VD "Bạn muốn size nào?"
  }
- System prompt tiếng Việt: vai trò nhận order quán cà phê; CHỈ chọn productId / comboId trong thực đơn gửi kèm; hiểu tiếng Việt nói tự nhiên, không dấu, viết tắt, số đếm ("hai", "2", "một cặp" = 2, "chục" = 10); quy ước: "nhỏ"/"S" = S, "vừa"/không nói = M, "lớn"/"bự"/"L" = L; "ít đá" = 50, "không đá" = 0, "ít ngọt"/"ít đường" = 50, "không đường" = 0, "ngọt bình thường" = 100; topping và yêu cầu khác ghi vào note; món đồ ăn không có size / đá / đường; "đổi …", "bỏ …", "thêm … nữa" khi có current (giỏ đang xác nhận, gửi kèm có đánh số dòng) thì dùng intent modify / remove với targetLine; không chắc thì confidence thấp, không đoán bừa.
- Sau khi nhận: kiểm tra lại từng dòng (productId thuộc menuContext, hết hàng thì chuyển sang unknown kèm gợi ý, hasSizes=false thì size=null, qty 1–20, ice/sugar chỉ cho đồ uống). Tính unitPrice bằng hàm giá có sẵn (lib/menuPrice.ts / pricing.ts), không lấy giá từ AI.
- Món unknown → ghi SearchLog như tìm kiếm rỗng (query = spokenName, resultCount = 0) để hiện ở Khách tìm kiếm.
- Ghi AiCallLog (feature, storeId, staffId hoặc null, token, độ trễ). KHÔNG lưu file âm thanh.

## 4. API
- POST /api/voice-order/parse (multipart: audio file hoặc trường text; trường current JSON tùy chọn; storeId)
  - POS: nhân viên đăng nhập, chi nhánh lấy từ phiên nhân viên, kiểm tra isAiEnabled("VOICE_ORDER_POS", storeId).
  - Web khách: không cần đăng nhập; storeId lấy như /api/menu đang lấy; kiểm tra isAiEnabled("VOICE_ORDER_WEB", storeId); giới hạn 10 lần / phiên / giờ và 30 lần / IP / giờ (trả 429 kèm câu thân thiện).
  - Trả { transcript, intent, lines: [{ productId, comboId, name, imageUrl, qty, size, ice, sugar, note, unitPrice, confidence, targetLine }], unknown: [{ spokenName, suggestions: [{ id, name, imageUrl, price }] }], clarify }.
  - AI tắt / lỗi / quá 10 giây → 503 { unavailable: true }, không lỗi 500.
- GET /api/voice-order/status?storeId= → { pos: boolean, web: boolean } để giao diện biết có hiện nút không.

## 5. Giao diện POS (components/TablePanel.tsx, dùng chung cho Pos.tsx và StaffTables.tsx)
- Nút micro to cạnh ô tìm món. Bấm giữ để nói (máy tính: giữ phím Space khi không ở ô nhập cũng được), thả ra để gửi. Dùng MediaRecorder; tự dừng sau 20 giây. Có ô gõ chữ thay giọng nói (Enter để gửi).
- Khi đang ghi: sóng âm / chấm đỏ nhấp nháy + đồng hồ giây. Khi đang xử lý: "Đang hiểu…".
- Bảng xác nhận (popup hoặc khung bên phải): dòng "Nghe được: …" (transcript); mỗi dòng món: ảnh, tên, số lượng +/−, chọn size S/M/L, đá, đường, ghi chú, giá; dòng confidence < 0,7 tô vàng kèm nút "Đổi món" (mở ô tìm món). Mục "Chưa có trong thực đơn" kèm gợi ý bấm để thêm. clarify thì hiện câu hỏi to.
- Trong lúc bảng xác nhận mở, bấm micro nói tiếp ("đổi bạc xỉu thành size L", "bỏ croissant", "thêm một cái nữa") → gửi kèm current, cập nhật bảng.
- "Thêm vào đơn" → đổ vào danh sách món đang gọi theo đúng cách TablePanel đang ghép OrderLine (size, ghi chú "Size L · Ít đá · Ít đường · <note>"). Không tự gửi bếp.
- Chưa cấp quyền micro / trình duyệt không hỗ trợ → ẩn micro, vẫn còn ô gõ chữ. AI tắt → ẩn cả hai.

## 6. Kiểm thử
- backend-node/scripts/testVoiceOrder.ts: chạy 15 câu chữ mẫu (có không dấu, viết tắt, số bằng chữ, món đồ ăn, món không có, món hết hàng, câu sửa với current), in kết quả; ghi tỉ lệ đúng món / đúng số lượng / đúng size vào docs để đưa vào báo cáo.
- Thử 3–5 file ghi âm thật (để trong backend-node/scripts/fixtures/voice/, không commit nếu nặng > 1 MB).
- Kiểm tra: productId bịa / ngoài chi nhánh bị loại; giá không lấy từ AI; AI tắt → nút ẩn, API 503; tsc backend và frontend.
Báo lại: tỉ lệ đúng trên bộ câu mẫu, độ trễ trung bình, token mỗi lần.
```

## Prompt B: web khách

```
Làm trên nhánh feat/chain-stores, sau khi prompt A đã xong (API /api/voice-order/parse chạy được). Đọc plan/prompt-dat-mon-giong-noi.md.

1. Trang Thực đơn (pages/Menu.tsx) và thanh tìm kiếm trên header điện thoại: thêm nút micro trong ô tìm kiếm + dòng gợi ý "Thử nói: 'Hai bạc xỉu ít đá'". Chỉ hiện khi GET /api/voice-order/status trả web = true.
2. Khách có thể:
   - Bấm micro (chạm một lần để bắt đầu, chạm lại để dừng; điện thoại không bắt giữ nút), hoặc
   - Gõ câu dài có số lượng / tùy chọn rồi bấm nút "Đặt nhanh" (gõ ngắn kiểu tìm kiếm thì vẫn là tìm kiếm thường như cũ).
3. Thẻ xác nhận (bottom sheet trên điện thoại, popup trên máy tính) theo style trang khách hiện có, sáng / tối, VI / EN:
   - "Bạn muốn: …" (transcript), danh sách món kèm ảnh, số lượng, size, đá, đường, ghi chú, giá, tổng tiền.
   - Dòng chưa chắc: nhãn "Kiểm tra lại" + nút đổi món.
   - Món chưa có: "Quán chưa có X. Bạn thử:" + gợi ý.
   - Nút "Thêm tất cả vào giỏ" → gọi addToCart / addComboToCart trong lib/cart.ts với icePct, sugar, notes đúng định dạng ProductDetail.tsx đang ghép ("Size L · Đá 50% · Đường 50% · ghi chú"), rồi toast "Đã thêm N món" + nút "Xem giỏ".
   - Nói / gõ tiếp để sửa như ở POS (gửi kèm current).
4. Quyền micro bị từ chối hoặc trình duyệt không có MediaRecorder: ẩn micro, giữ "Đặt nhanh" bằng chữ. Bị 429: "Bạn thử lại sau ít phút nhé". 503: ẩn tính năng đến khi tải lại trang.
5. Chuỗi văn bản mới thêm vào i18n (VI / EN).
Kiểm tra trên khung điện thoại 390px và máy tính, Chrome và Safari; chạy tsc frontend. Quay một đoạn màn hình demo nói → giỏ hàng để đưa vào slide bảo vệ.
```

## Câu trả lời sẵn khi hội đồng hỏi

- **"AI có thể thêm món không có thật hoặc sai giá không?"** Không. AI chỉ được chọn trong thực đơn gửi kèm; backend kiểm tra lại từng món và tự tính giá; người dùng luôn xác nhận trước khi thêm.
- **"Sao không dùng nhận dạng giọng nói của trình duyệt?"** Không chạy ổn trên iPhone / Safari và kém trong môi trường ồn; Gemini nghe và hiểu trong một lần gọi, xử lý được cả câu sửa ("đổi thành size L").
- **"Đo độ chính xác thế nào?"** Bộ 15 câu mẫu + vài file ghi âm, đo tỉ lệ đúng món, đúng số lượng, đúng tùy chọn (kết quả trong docs).
- **"Có giá trị gì cho quán?"** Thu ngân gọi món nhanh lúc đông khách; khách đặt món tự nhiên như nói với nhân viên; món khách nói mà quán chưa có được ghi lại để cân nhắc thêm vào thực đơn.
