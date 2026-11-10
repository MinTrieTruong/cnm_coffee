# Prompt: Trợ lý AI hỏi số liệu cho chủ chuỗi (#1)

Tính năng #1 trong `plan/de-xuat-ai-gemini.md`. Chủ chuỗi / quản lý **hỏi bằng tiếng Việt như ChatGPT**, AI tự đọc dữ liệu trong hệ thống rồi **trả lời, tóm tắt, vẽ biểu đồ**. Làm trên nhánh `feat/chain-stores`, chia **2 phiên Claude Code** (prompt A rồi prompt B).

## Ví dụ câu hỏi (dùng để demo và để kiểm thử)

- "Tóm tắt tình hình hôm nay của cả chuỗi."
- "Tuần này chi nhánh nào doanh thu giảm nhiều nhất so với tuần trước? Món nào kéo xuống?"
- "Top 5 món bán chạy tháng 10 ở chi nhánh Q1, vẽ biểu đồ."
- "Giờ nào vắng khách nhất ở Gò Vấp?"
- "Tháng này hao hụt bao nhiêu tiền, nguyên nhân chính là gì?"
- "Nguyên liệu nào sắp hết hoặc sắp hết hạn?"
- "Khách chê gì nhiều nhất tuần qua?"
- "Ai đi trễ nhiều nhất tháng này?"
- Hỏi nối tiếp: "Còn tháng trước thì sao?", "So với chi nhánh Q3 thì sao?"

## Thiết kế (đọc trước khi dán prompt)

**Cách AI đọc dữ liệu: gọi công cụ, không viết SQL.**
Gemini được khai báo khoảng 12 **công cụ** (function calling), mỗi công cụ là một hàm truy vấn có sẵn trong backend (doanh thu, top món, hao hụt…). AI đọc câu hỏi, tự chọn công cụ và tham số (khoảng ngày, chi nhánh), backend chạy hàm, trả số liệu cho AI, AI viết câu trả lời. Một câu hỏi có thể gọi nhiều công cụ (tối đa 5 vòng).

Vì sao không cho AI viết SQL: an toàn (không thể xóa / sửa dữ liệu, không đọc được bảng mật khẩu, SĐT khách), **đúng phân quyền** (công cụ chạy với quyền người hỏi: quản lý chi nhánh A không hỏi được chi nhánh B), và số liệu khớp đúng với các màn báo cáo đang có. Đây cũng là câu trả lời tốt khi hội đồng hỏi về bảo mật.

**Câu trả lời có 3 phần:** đoạn văn tóm tắt (markdown) + biểu đồ / bảng (nếu hợp) + dòng nhỏ "Đã tra: doanh thu theo chi nhánh 01/11–07/11, top món…" (bấm mở xem chi tiết công cụ và tham số). Phần "đã tra" giúp người xem tin số liệu và giúp giải thích AI khi bảo vệ.

**Biểu đồ do backend dựng, không do AI bịa số:** AI chỉ chọn "vẽ biểu đồ cột từ kết quả công cụ số 2, cột X là tên món, cột Y là số ly". Backend lấy đúng dữ liệu của công cụ đó để vẽ bằng `recharts` (đã có trong frontend).

**Dùng chung:** `lib/gemini.ts`, `AiSetting`, `AiCallLog` (tạo ở thread chatbot hoặc prompt bản tin cuối ngày, ai làm trước thì người sau dùng lại). Nếu bản tin cuối ngày (#4) đã làm, các hàm trong `lib/dailyBrief/facts.ts` được bọc luôn thành công cụ.

**Tắt được:** tính năng `ANALYST` trong cài đặt AI. Tắt thì mục "Trợ lý AI" ẩn khỏi menu và API trả 403.

## Code có sẵn (đã kiểm tra trên `feat/chain-stores`)

| Dữ liệu | Hiện nằm ở |
|---|---|
| Doanh thu theo ngày, đơn hàng, top món, lợi nhuận, dashboard | `routes/reports.ts` (`/reports/revenue`, `/orders`, `/top-products`, `/profit`, `/dashboard`); logic viết thẳng trong route |
| So sánh chi nhánh | `/reports/stores-compare` (chỉ Owner) |
| Tiền trong ngày, lệch két, lãi lỗ | `routes/cash.ts` (`/cash/daily`, `/cash/pnl`) |
| Hao hụt | `routes/kitchen.ts` (`/kitchen/waste`), bảng `WasteLog` |
| Tồn kho, lô hết hạn | `StoreInventory`, `InventoryBatch`, `lib/inventory.ts` |
| Đi trễ / vắng | `/attendance/warnings`, `lib/attendanceRules.ts` → `evaluateShift` |
| Đánh giá, khiếu nại | `Review`, `ChatSession.complaintStatus` |
| Khách tìm không thấy món | `lib/searchInsights.ts` |
| Phân quyền chi nhánh | `lib/storeScope.ts`, `middleware/staff.ts` (Owner chọn chi nhánh qua header `X-Store-Id`, null = cả chuỗi; Admin = quản lý 1 chi nhánh) |
| Ngày theo giờ quán | `lib/bizTime.ts` |

---

## Prompt A: backend (công cụ + vòng gọi Gemini)

```
Làm trên nhánh feat/chain-stores. Đọc plan/prompt-tro-ly-hoi-so-lieu.md và plan/de-xuat-ai-gemini.md (mục #1 và mục 3 "Bật / tắt AI").

Mục tiêu: API trợ lý hỏi số liệu. Người dùng (Owner hoặc Admin) gửi câu hỏi tiếng Việt, Gemini gọi các công cụ truy vấn có sẵn để đọc dữ liệu rồi trả lời. AI KHÔNG viết SQL, KHÔNG có công cụ ghi / sửa / xóa.

## 0. Hạ tầng AI dùng chung
Tìm trong backend-node/src/lib và schema.prisma xem đã có gemini.ts, AiSetting, AiCallLog, aiSettings.ts (isAiEnabled) chưa (thread chatbot hoặc bản tin cuối ngày có thể đã tạo).
- Chưa có thì tạo theo mô tả trong plan/prompt-ban-tin-cuoi-ngay.md mục 0, và bổ sung vào gemini.ts hàm chatWithTools() hỗ trợ function calling nhiều vòng.
- Thêm tính năng "ANALYST" vào AiSetting (mặc định bật, dailyLimit 200 câu hỏi / ngày toàn hệ thống, thêm giới hạn 30 câu / người / giờ).

## 1. Tách logic báo cáo thành hàm dùng chung: backend-node/src/lib/analytics/
Logic trong routes/reports.ts, cash.ts, kitchen.ts, attendance.ts đang viết thẳng trong route. Chuyển phần tính toán ra hàm thuần nhận (prisma, scope, params) và cho route cũ gọi lại hàm đó, để màn báo cáo và trợ lý ra CÙNG con số. Không đổi định dạng JSON của các route cũ (chạy thử trước và sau để so).
scope = { role, storeIds: number[] | "ALL" } lấy từ người hỏi: Admin = [storeId của họ]; Owner = "ALL" hoặc chi nhánh đang chọn.
Nếu lib/dailyBrief/facts.ts đã có thì dùng lại các hàm đó thay vì viết lại.

## 2. Công cụ cho Gemini: backend-node/src/lib/analyst/tools.ts
Mỗi công cụ: name, description tiếng Việt rõ ràng (Gemini chọn công cụ dựa vào đây), parameters (JSON schema), run(scope, args). Tham số ngày luôn là from/to "YYYY-MM-DD"; storeId tùy chọn (bỏ trống = mọi chi nhánh trong scope).
Danh sách:
1. list_stores — danh sách chi nhánh trong phạm vi (id, mã, tên). AI gọi khi người hỏi nhắc tên chi nhánh để đổi tên → id.
2. revenue_summary(from, to, storeId?, groupBy: "day"|"week"|"month"|"store"|"hour"|"weekday"|"channel") — doanh thu thuần, số đơn, giá trị đơn TB. channel = tại quán / mang về / giao hàng.
3. compare_periods(metric: "revenue"|"orders"|"avg_order", from, to, prevFrom, prevTo, storeId?, groupBy?: "store"|"product") — so sánh 2 kỳ, trả chênh lệch và %.
4. top_products(from, to, storeId?, sort: "qty"|"revenue"|"profit", order: "desc"|"asc", limit ≤20, categoryId?) — có cả món bán chậm (asc).
5. product_trend(productName hoặc productId, from, to, storeId?, groupBy) — xu hướng một món. Khớp tên gần đúng, không dấu.
6. profit_summary(from, to, storeId?) — doanh thu, giá vốn, lợi nhuận gộp, chi phí (phiếu chi), lãi lỗ.
7. waste_summary(from, to, storeId?) — tổng giá trị hao hụt, theo lý do, top món / nguyên liệu.
8. inventory_status(storeId?, type: "low"|"expiring"|"all", days?=3) — dưới mức tối thiểu, lô sắp hết hạn.
9. reviews_summary(from, to, storeId?, maxRating?) — số đánh giá, điểm TB, phân bố sao, tối đa 20 nhận xét gần nhất (chỉ sao + nội dung + ngày, KHÔNG tên / SĐT khách).
10. complaints_summary(from, to, storeId?) — số khiếu nại, đang mở / đã xử lý.
11. attendance_summary(from, to, storeId?) — theo nhân viên: số ca, đi trễ (lượt, phút), về sớm, vắng. Chỉ trả họ tên và vai trò.
12. cash_issues(from, to, storeId?) — ca lệch két, phiếu chi chờ duyệt.
13. search_demand(from, to, storeId?) — từ khóa khách tìm mà không có món.
Quy tắc chung trong run():
- Kiểm tra storeId nằm trong scope; ngoài scope thì trả { error: "Bạn không có quyền xem chi nhánh này" } (không ném lỗi, để AI nói lại cho người dùng).
- Khoảng ngày tối đa 366 ngày; from > to thì đổi chỗ.
- Kết quả gọn: tối đa 50 dòng, số làm tròn, kèm trường "unit" (đ, ly, %, phút). Mỗi kết quả có meta { tool, args, rowCount }.
- Không công cụ nào trả mật khẩu, token, SĐT, email, địa chỉ khách.

## 3. Vòng hỏi đáp: backend-node/src/lib/analyst/run.ts
- System prompt tiếng Việt, có: hôm nay là ngày nào (giờ quán) và thứ mấy; vai trò người hỏi và các chi nhánh họ được xem; đơn vị tiền VNĐ; quy tắc:
  "Luôn gọi công cụ để lấy số liệu, không đoán. Chỉ dùng số trong kết quả công cụ. Hiểu 'hôm nay', 'tuần này' (thứ Hai đến hôm nay), 'tuần trước', 'tháng này', 'quý', 'năm nay' theo ngày hiện tại. Câu hỏi mơ hồ thì chọn cách hiểu hợp lý nhất và nói rõ đã hiểu thế nào. Không có dữ liệu thì nói không có, không bịa. Câu hỏi ngoài phạm vi quán (thời tiết, chính trị…) thì từ chối lịch sự. Trả lời ngắn gọn, mở đầu bằng câu trả lời chính, sau đó 2–4 gạch đầu dòng ý quan trọng, cuối cùng một gợi ý hành động nếu có."
- Lịch sử: gửi kèm 10 lượt hỏi đáp gần nhất của cuộc hội thoại (để hỏi nối tiếp "còn tháng trước thì sao?").
- Vòng function calling tối đa 5 vòng; vượt thì trả lời bằng những gì đã có. Mỗi công cụ timeout 8 giây.
- Kết quả cuối yêu cầu JSON (responseSchema):
  { answer: string (markdown, ≤250 từ), charts: [{ type: "bar"|"line"|"pie"|"table", title, toolCallIndex, x, y: string[] }] (≤2), followUps: string[] (3 câu hỏi gợi ý tiếp) }
  Backend lấy dữ liệu của chart từ kết quả công cụ thứ toolCallIndex theo tên cột x / y. Cột không tồn tại thì bỏ chart đó.
- Ghi AiCallLog (tổng token mọi vòng, độ trễ).

## 4. Lưu hội thoại
Bảng AnalystConversation (id, staffId, storeScope, title (lấy từ câu hỏi đầu, ≤80 ký tự), createdAt, updatedAt) và AnalystMessage (id, conversationId, role "user"|"assistant", content, charts Json, toolCalls Json [{ name, args, rowCount, ms }], tokensIn, tokensOut, latencyMs, rating -1|0|1, createdAt). Viết SQL migration theo cách backend-node/prisma/sql đang làm.

## 5. API (chỉ Owner và Admin, kiểm tra isAiEnabled("ANALYST"))
- POST /api/analyst/ask { conversationId?, question } → tạo hội thoại nếu chưa có, trả { conversationId, message }.
  Dùng thêm Socket.IO (hoặc stream) để đẩy trạng thái "Đang tra doanh thu…", "Đang tra top món…" theo từng công cụ đang chạy; nếu khó thì làm bản không stream trước.
- GET /api/analyst/conversations, GET /api/analyst/conversations/:id, DELETE /api/analyst/conversations/:id (chỉ của mình).
- POST /api/analyst/messages/:id/rate { rating }.
- AI tắt / thiếu khóa / Gemini lỗi → trả { unavailable: true, reason } với HTTP 503, không lỗi 500.

## 6. Kiểm thử
- backend-node/scripts/testAnalyst.ts: chạy 10 câu hỏi mẫu trong plan/prompt-tro-ly-hoi-so-lieu.md với tài khoản Owner và một Admin, in công cụ đã gọi, tham số và câu trả lời. Đối chiếu ít nhất 3 câu với số trên màn báo cáo tương ứng.
- Kiểm tra: Admin chi nhánh A hỏi "doanh thu chi nhánh B" → AI trả lời không có quyền; câu hỏi "xóa đơn 123" → AI nói không làm được; câu hỏi ngoài lề bị từ chối; route báo cáo cũ trả JSON như trước khi tách hàm.
- tsc backend.
Báo lại: danh sách công cụ, kết quả 10 câu mẫu, số token trung bình mỗi câu.
```

## Prompt B: giao diện "Trợ lý AI"

```
Làm trên nhánh feat/chain-stores, sau khi API /api/analyst ở prompt A đã chạy. Đọc plan/prompt-tro-ly-hoi-so-lieu.md.

Tạo màn "Trợ lý AI" kiểu ChatGPT cho Owner và Admin:
1. Thêm mục vào menu nhân viên (registry trong frontend-app/src/apps + sidebar.ts), đặt trong nhóm Tổng quan, ngay dưới Bảng điều khiển, icon Sparkles hoặc Bot của lucide-react. Ẩn mục khi tính năng ANALYST tắt (lấy từ API cài đặt AI) hoặc người dùng không phải Owner / Admin.
2. Bố cục máy tính: cột trái danh sách hội thoại (Mới, đổi tên tự động theo câu hỏi đầu, xóa); bên phải khung chat. Điện thoại: một cột, danh sách hội thoại mở bằng nút ở đầu trang. Theo style và biến màu đang dùng trong app nhân viên (sáng / tối).
3. Màn trống: lời chào "Hỏi gì về số liệu của quán?" + 6 câu hỏi mẫu bấm được (lấy từ mục "Ví dụ câu hỏi" trong file plan). Owner thấy thêm bộ chọn phạm vi: Cả chuỗi / từng chi nhánh (dùng cơ chế chọn chi nhánh hiện có).
4. Tin nhắn trả lời:
   - Câu trả lời render markdown (đậm, gạch đầu dòng, bảng).
   - Biểu đồ bằng recharts theo charts[] (bar, line, pie); type "table" thì hiện bảng có thể cuộn ngang. Số tiền định dạng 1.250.000đ.
   - Dòng nhỏ "Đã tra: …" liệt kê các công cụ đã gọi (tên tiếng Việt + khoảng ngày + chi nhánh), bấm mở xem tham số và số dòng.
   - Nút sao chép, thích / không thích (gọi /rate).
   - 3 nút câu hỏi gợi ý tiếp (followUps).
5. Khi đang chờ: hiện trạng thái theo từng công cụ ("Đang tra doanh thu…") nếu API có đẩy socket; không thì hiệu ứng "đang suy nghĩ". Không khóa ô nhập của hội thoại khác.
6. Ô nhập: Enter gửi, Shift+Enter xuống dòng, tối đa 500 ký tự. Nút micro (tùy chọn, dùng Web Speech API của trình duyệt, lang "vi-VN") để hỏi bằng giọng nói nếu trình duyệt hỗ trợ.
7. AI tắt hoặc trả 503: hiện thông báo "Trợ lý AI đang tạm tắt" với đường dẫn tới các màn Báo cáo thường.
8. Thêm lối tắt: ở Bảng điều khiển có ô "Hỏi trợ lý AI…" gõ xong Enter là mở màn Trợ lý với câu hỏi đó.
Kiểm tra trên máy tính và khung điện thoại 390px, cả giao diện sáng và tối; chạy tsc frontend. Chụp màn hình 2–3 câu hỏi mẫu có biểu đồ để đưa vào báo cáo.
```

## Câu trả lời sẵn khi hội đồng hỏi

- **"AI đọc dữ liệu kiểu gì?"** Gọi công cụ (function calling): AI chỉ được chọn trong 13 hàm truy vấn có sẵn, không viết SQL, không có quyền ghi.
- **"Có lộ dữ liệu không?"** Công cụ chạy với quyền người hỏi; không công cụ nào trả thông tin cá nhân khách; Gemini chỉ thấy số liệu tổng hợp.
- **"AI có bịa số không?"** Mọi số lấy từ kết quả công cụ, biểu đồ vẽ từ dữ liệu gốc chứ không từ chữ AI viết, và mỗi câu trả lời ghi rõ đã tra những gì.
- **"Khác gì màn báo cáo thường?"** Báo cáo thường phải biết vào màn nào, lọc gì; trợ lý hiểu câu hỏi tự nhiên, kết hợp nhiều nguồn (doanh thu + món + hao hụt) trong một câu trả lời và hỏi nối tiếp được.
