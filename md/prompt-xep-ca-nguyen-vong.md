# Prompt: Xếp ca từ nguyện vọng viết tự nhiên (#10)

Tính năng #10 trong đề xuất AI Gemini (file đề xuất không có trong repo; những gì cần đều ghi ở đây). Làm trên nhánh `feat/chain-stores`, **2 phiên Claude Code**: prompt A (nguyện vọng + AI hiểu câu), prompt B (thuật toán xếp ca có nguyện vọng + giải thích + chỉ số).

## Ý tưởng

- **Nhân viên** gõ vào app như nhắn tin: *"Tháng 12 em đi học sáng thứ 3, thứ 5 nên không làm ca sáng được. Muốn làm tối cuối tuần. 24/12 em xin nghỉ. Tuần cuối tháng em muốn làm ít thôi, tầm 3 ca."*
- **Gemini** chuyển câu đó thành **ràng buộc có cấu trúc**; nhân viên xem lại danh sách ("Không thể: ca sáng mọi thứ 3, thứ 5 tháng 12 · Muốn: ca tối thứ 7, CN · Không thể: cả ngày 24/12 · Tối đa 3 ca tuần 28/12–31/12") và bấm **Xác nhận**.
- **Quản lý** bấm "Tự xếp lịch tháng" như hiện nay. Thuật toán (code, không phải AI) xếp ca thỏa định biên, luật nghỉ giữa ca, số ca tối đa / tuần **và nguyện vọng**, rồi cải thiện cục bộ để tăng số nguyện vọng được đáp ứng mà vẫn chia đều.
- Kết quả có **chỉ số**: % nguyện vọng "muốn" được đáp ứng, số "không thể" bị vi phạm (phải bằng 0), số ca thiếu người, độ lệch số ca giữa nhân viên. **AI viết lời giải thích** cho từng người ("Lan không được ca tối thứ 7 ngày 14 vì ca đó đã đủ 2 người có nguyện vọng trước và Lan đã có 2 ca cuối tuần").

**Vì sao hợp để bảo vệ:** kết hợp **LLM (hiểu ngôn ngữ tự nhiên)** với **thuật toán tối ưu cổ điển (tham lam + tìm kiếm cục bộ)**, có số đo rõ ràng, và AI không trực tiếp quyết định ai làm ca nào.

## Hiện trạng (đã kiểm tra code)

- `backend-node/src/lib/autoSchedule.ts`: thuật toán tham lam theo ngày, xếp ô khó trước. Ràng buộc cứng: đúng vị trí, không trùng ngày nghỉ đã duyệt, không trùng giờ, 1 ca / ngày, nghỉ tối thiểu `minRestHours`, tối đa `maxShiftsPerWeek`. Mục tiêu: chia đều ca tháng, chia đều ca cuối tuần, giữ cùng loại ca.
- `POST /api/schedule/admin/auto` (`routes/schedule.ts`): xóa nháp cũ của tháng, gọi `autoSchedule` **chỉ cho các ngày từ hôm nay** (`futureDays`), giữ nguyên ca APPROVED / PENDING / OPEN_SHIFT đã có (tính vào định biên và ràng buộc), lưu `WorkSchedule` trạng thái `DRAFT`; quản lý xem rồi `POST /api/schedule/admin/publish` (chỉ đổi trạng thái + bắn socket `schedule:published`, **chưa** gửi thông báo qua `lib/notify.ts`, **không** ghi lại tháng nào đã công bố).
- Ca APPROVED không chỉ đến từ publish: `POST /schedule/admin` (gán tay) tạo thẳng APPROVED. Vì vậy "tháng có ca APPROVED" ≠ "tháng đã công bố".
- `autoSchedule` chỉ có `take()` (ghi ca vào `busy`, `weekCount`, `monthCount`, `weekendCount`, `codeCount`), chưa có hàm gỡ ca; hòa điểm dùng `Math.random()`.
- Ca mẫu: `ShiftTemplate` (code, name, startMin, endMin) + định biên `StaffingRule` (role, weekdayCount, weekendCount) — **dùng chung toàn chuỗi**, không có storeId. Cấu hình: `HrConfig` (một dòng id = 1 cho cả chuỗi: minRestHours, maxShiftsPerWeek), sửa qua `routes/hrConfig.ts` + màn `modules/hr/ShiftConfig.tsx`. Nghỉ phép: `LeaveRequest` (APPROVED, `date` – `toDate`).
- Vai trò được xếp ca: `SHIFT_ROLES` trong `lib/hrConfig.ts` = Cashier, Waiter, Kitchen, Shipper, Warehouse. Admin (quản lý chi nhánh) và Owner không được xếp ca. `mgmtOnly` = `attachStaff + requireRoles("Admin") + requireStore` (Owner qua được vì có mọi quyền Admin).
- Màn quản lý: `frontend-app/src/modules/hr/Schedule.tsx`. Lịch cá nhân của nhân viên là `pages/WorkSchedule.tsx` (mục `hr/my-schedule`, nhóm "Của tôi" trong `apps/sidebar.ts`, khai báo ở `apps/registry.tsx`). `components/AttendanceCalendar.tsx` là lịch **chấm công** (`pages/Attendance.tsx`), chỉ mượn style nếu cần.
- Đơn từ: `pages/HrRequests.tsx`, tab `LEAVE` gửi `POST /api/hr/leave { date, toDate, reason }`. Form **chưa** nhận ngày điền sẵn từ ngoài vào.
- AI: `backend-node/src/ai/gemini.ts` (`gemini()`, `withRetry`, `AI_CONFIG.chatModel`), `ai/settings.ts` (`AI_FEATURES`, `isAiEnabled`). Tắt tính năng → API trả 503 `{ unavailable }`, giao diện ẩn nút. Frontend `lib/aiFeatures.ts` (`useAiFeatures`) **chỉ chạy cho Admin / Owner**, vai trò khác luôn nhận tập rỗng → không dùng được cho màn nhân viên.
- Hạn mức AI không có hàm dùng chung: mỗi tính năng tự đếm, thường bằng bảng `AiCallLog` (feature, storeId, staffId, status, inputKind…) — xem `routes/voiceOrder.ts` quanh dòng 98.
- Thông báo: `lib/notify.ts` — `NotifyType` là union TypeScript (cột `Type` là VarChar nên thêm loại mới không cần migration). `dedupeKey` chỉ chặn trùng trong `dedupeMinutes` (mặc định **30 phút**). Tác vụ nền theo mẫu `setInterval(run, 86_400_000).unref()` (VD `lib/notify.ts`, `lib/openShifts.ts`), khởi động trong `index.ts`.
- Migration: SQL tay trong `backend-node/prisma/sql/NNN_ten.sql` (MySQL, `SET NAMES utf8mb4`, bảng / cột dạng `Shift_Wishes`, `Wish_ID`, `Store_ID`, `Created_At`, `utf8mb4_unicode_ci`) + sửa `schema.prisma` bằng `@map` / `@@map` tương ứng. Số đã dùng tới **026**; 023 / 024 là WIP chưa commit của tính năng khác, không đụng vào.
- Repo không có dữ liệu ngày lễ; không có framework test — kiểm thử bằng script `tsx scripts/xxx.ts`. Frontend đã có `recharts`.

## Thiết kế

**Loại ràng buộc** (AI chỉ được trả các loại này):

| type | Nghĩa | Cứng / mềm |
|---|---|---|
| `UNAVAILABLE` | Không thể làm (ngày / thứ / ca / khung giờ) | **Cứng** (xếp vi phạm = lỗi) |
| `PREFER` | Muốn làm ca này / ngày này | Mềm, cộng điểm |
| `AVOID` | Không thích nhưng làm được | Mềm, trừ điểm |
| `MAX_SHIFTS` | Tối đa N ca trong tuần / tháng / khoảng ngày | Cứng nếu nhỏ hơn quy định chung |
| `MIN_SHIFTS` | Muốn ít nhất N ca (cần thu nhập) | Mềm |
| `DAY_OFF_PATTERN` | Muốn nghỉ cố định 1 ngày / tuần (VD CN) | Mềm |

Phạm vi mỗi ràng buộc: `dates` (ngày cụ thể) hoặc `weekdays` (0–6, 0 = CN) trong khoảng `fromDate`–`toDate`; `shiftCodes` (mã ca) hoặc `timeFrom`–`timeTo` (phút trong ngày; VD sau 18:00 → code tự quy ra các ca giao nhau). Mỗi ràng buộc kèm `quote` (đoạn câu gốc sinh ra nó) để nhân viên đối chiếu.

**"Không thể" khác "Nghỉ phép":** nguyện vọng "không thể" chỉ dùng khi xếp lịch, không thay đơn nghỉ phép. Nếu nhân viên viết "xin nghỉ 24/12", AI vẫn tạo `UNAVAILABLE` và gợi ý thêm "Tạo đơn nghỉ phép cho 24/12?" (mở form đơn từ có sẵn).

**Đơn vị đếm nguyện vọng** (dùng chung cho chỉ số ở prompt B): mỗi rule được quy đổi (`lib/shiftWish/normalize.ts`) thành các **lần** (ngày, tập mã ca). Rule `PREFER` có ngày / thứ → mỗi ngày là một lần (VD "muốn ca tối T7, CN tháng 12" = 9 lần); một lần được đáp ứng khi hôm đó người này được xếp một ca trong tập mã ca. Rule `PREFER` chỉ có loại ca, không có ngày / thứ ("chỉ thích ca tối") → mỗi ca được xếp cho người đó là một lần, đáp ứng khi ca đó thuộc tập mã ca. `AVOID` tương tự nhưng ngược dấu. `MIN_SHIFTS` / `MAX_SHIFTS` / `DAY_OFF_PATTERN` đếm theo kỳ (tuần T2–CN / tháng / khoảng ngày). Tuần không trọn trong tháng (VD 28/12–31/12) dùng `period = "RANGE"`.

**Hạn chót gửi nguyện vọng:** cấu hình trong `HrConfig` (VD ngày 20 hằng tháng cho tháng sau; `HrConfig` dùng chung toàn chuỗi nên hạn chót áp cho mọi chi nhánh). Sau hạn chót nhân viên vẫn sửa được nhưng hiện nhãn "gửi muộn", quản lý quyết định có xếp lại không.

**Thuật toán (prompt B):**
1. Ràng buộc cứng = cứng hiện có + `UNAVAILABLE` + `MAX_SHIFTS` → loại khỏi ứng viên.
2. Điểm chọn người cho mỗi ô (thấp hơn = ưu tiên), giữ các thành phần hiện có và thêm: `PREFER` −W_pref, `AVOID` +W_avoid, gần chạm `MIN_SHIFTS` −W_min, đúng `DAY_OFF_PATTERN` +W_off. Trọng số là hằng số ở đầu file có chú thích. **Cố ý giữ W_PREFER = 60 < 100 (trọng số số ca tháng):** chia đều số ca là trên hết, nguyện vọng chỉ quyết định giữa những người cùng số ca; phần tăng % đáp ứng chủ yếu đến từ bước cải thiện cục bộ.
3. **Công bằng nguyện vọng:** người đã được đáp ứng nhiều nguyện vọng trong tháng bị giảm ưu tiên dần (tránh một người luôn được ưu tiên).
4. **Cải thiện cục bộ** sau khi tham lam: lặp hoán đổi 2 người giữa 2 ô cùng vị trí (hoặc chuyển 1 người sang ô thiếu) nếu không vi phạm cứng và **giảm tổng chi phí** (chi phí = phạt nguyện vọng + phạt lệch số ca + phạt ô thiếu người). Giới hạn số vòng / thời gian (VD 2 giây) để API phản hồi nhanh. Có seed ngẫu nhiên để kết quả tái lập được.
5. Trả thêm: mỗi ô xếp kèm **lý do** dạng mã (PREFER_MET, ONLY_CANDIDATE, BALANCE…), danh sách nguyện vọng không đáp ứng được kèm **nguyên nhân** dạng mã (FULL_BY_OTHERS, MAX_WEEK_REACHED, REST_RULE, NO_SLOT…). Nguyên nhân tính **sau cùng** trên lịch cuối (sau cải thiện cục bộ), không ghi lúc tham lam. AI chỉ diễn đạt các mã này thành câu.
6. **Ca cũ được giữ nguyên** (APPROVED đã có) có thể trái "không thể": đếm riêng `existingConflicts`, không tính vào `hardViolations` (chỉ tính ca mới xếp, phải = 0).

**Tắt được:** thêm `SHIFT_WISH_AI` (AI hiểu câu nguyện vọng) và `SHIFT_EXPLAIN_AI` (AI viết giải thích) vào `AI_FEATURES`. Tắt AI thì nhân viên vẫn nhập nguyện vọng bằng **form chọn tay** (ngày, thứ, ca, loại) và thuật toán vẫn dùng nguyện vọng; giải thích hiện bằng mẫu câu theo mã.

---

## Prompt A: nguyện vọng của nhân viên

```
Làm trên nhánh feat/chain-stores. Đọc md/prompt-xep-ca-nguyen-vong.md (phần "Hiện trạng", "Thiết kế" — đặc biệt "Đơn vị đếm nguyện vọng"). Cây làm việc đang có WIP của tính năng khác: chỉ sửa / commit phần của mình.

Mục tiêu: nhân viên gửi nguyện vọng xếp ca cho một tháng bằng câu tự nhiên; Gemini chuyển thành ràng buộc có cấu trúc; nhân viên xem lại, sửa, xác nhận; quản lý xem tổng hợp. Chưa đổi thuật toán xếp ca (để prompt B).

## 0. Bật / tắt
Thêm vào AI_FEATURES (backend-node/src/ai/settings.ts):
- SHIFT_WISH_AI: "Hiểu nguyện vọng xếp ca viết tự nhiên", mặc định bật, dailyLimit 300, hourlyPerUser 10.
- SHIFT_EXPLAIN_AI: "Giải thích kết quả xếp ca", mặc định bật, dailyLimit 100.
Tắt → API trả 503 { unavailable }, giao diện ẩn nút AI. Hạn mức tự đếm bằng AiCallLog (feature "SHIFT_WISH_AI", staffId, storeId, inputKind "text", status OK/ERROR) giống routes/voiceOrder.ts: quá dailyLimit hoặc hourlyPerUser theo staffId → 429 kèm câu tiếng Việt.
Màn nhân viên KHÔNG dùng useAiFeatures (chỉ chạy cho Admin/Owner): lấy cờ aiAvailable từ GET /api/shift-wishes/my.

## 1. Dữ liệu (backend-node/prisma/sql/027_shift_wishes.sql + schema.prisma)
Theo quy ước tên của repo (bảng Shift_Wishes / Shift_Wish_Rules / Schedule_Months, cột Wish_ID, Store_ID, Staff_ID…, utf8mb4_unicode_ci, như 026).
- Bảng ShiftWish: id, storeId, staffId, month (CHAR 7 "YYYY-MM"), rawText (Text, ≤ 1000 ký tự), status ("DRAFT" | "CONFIRMED"), late Boolean, submittedAt, updatedAt; unique (staffId, month).
- Bảng ShiftWishRule: id, wishId (xóa wish → xóa rule), type ("UNAVAILABLE"|"PREFER"|"AVOID"|"MAX_SHIFTS"|"MIN_SHIFTS"|"DAY_OFF_PATTERN"), dates JSON null (["YYYY-MM-DD"]), weekdays JSON null ([0..6], 0 = CN), fromDate, toDate (Date null), shiftCodes JSON null, timeFrom, timeTo (Int phút null), count Int null, period ("WEEK"|"MONTH"|"RANGE" null), quote VarChar(255) null (cắt bớt nếu dài), source ("AI"|"MANUAL"), confidence Float null.
- Bảng ScheduleMonth: id, storeId, month CHAR(7), publishedAt DateTime null, publishedById Int null, unique (storeId, month). Route POST /schedule/admin/publish (khi publish theo ?month=) upsert dòng này. Đây là dấu "tháng đã công bố" (không suy từ việc có ca APPROVED, vì gán tay cũng tạo APPROVED). Prompt B sẽ thêm cột trỏ tới lần chạy đã áp dụng.
- HrConfig thêm wishDeadlineDay Int default 20 (hạn gửi nguyện vọng cho tháng sau), maxWishRules Int default 15. Thêm 2 trường này vào route sửa cấu hình (routes/hrConfig.ts, kiểm tra 1–28 và 1–30) và màn modules/hr/ShiftConfig.tsx.

## 2. AI hiểu câu: backend-node/src/lib/shiftWish/
normalize.ts (code thuần, không AI — prompt B và bản đồ nhiệt dùng lại):
- expandRule(rule, { days, templates }) → các lần { date, codes:Set<string> } theo "Đơn vị đếm nguyện vọng": dates hoặc weekdays trong fromDate–toDate (mặc định cả tháng) ∩ tháng; shiftCodes hoặc timeFrom–timeTo → mã ca có giờ giao nhau (xử lý ca qua đêm); không có ca / giờ = mọi ca.
- validateRules(rules, ctx) dùng chung cho parse và PUT (mục kiểm tra bên dưới).
parse.ts — parseWish({ text, month, storeId, staffId }):
- Ngữ cảnh gửi kèm: tháng (ngày đầu / cuối, thứ của từng ngày), danh sách ca đang dùng (code, tên, giờ bắt đầu – kết thúc, từ getShiftTemplates(prisma, true)), vai trò của nhân viên, quy định chung (maxShiftsPerWeek, minRestHours). Repo không có dữ liệu ngày lễ: bỏ qua, không bịa. KHÔNG gửi tên, SĐT nhân viên.
- Gemini (AI_CONFIG.chatModel) responseSchema: { rules: [ ...đúng các trường của ShiftWishRule trừ id/wishId/source, kèm confidence ], leaveSuggestions: [{ from, to, reason }], unclear: string[] (đoạn không hiểu, để hỏi lại) }.
- System prompt tiếng Việt: chuyển nguyện vọng thành ràng buộc; chỉ dùng mã ca có trong danh sách; "sáng / trưa / chiều / tối / ca 1, ca 2" ánh xạ theo giờ ca; "không được / bận / đi học" = UNAVAILABLE; "muốn / thích / ưu tiên" = PREFER; "hạn chế / không thích lắm" = AVOID; "xin nghỉ ngày X" = UNAVAILABLE và thêm leaveSuggestions; số ca → MAX_SHIFTS / MIN_SHIFTS với period; ngày ngoài tháng thì bỏ và ghi vào unclear; mỗi rule có quote là đoạn câu gốc; không bịa ràng buộc không có trong câu.
- Kiểm tra bằng code (validateRules): ngày nằm trong tháng; weekday 0–6; shiftCodes tồn tại trong ca đang dùng; timeFrom < timeTo (hoặc qua đêm hợp lệ) và quy ra shiftCodes giao nhau; count 1–31; tổng rule ≤ maxWishRules; UNAVAILABLE phủ quá 60% số (ngày × ca đang dùng) trong tháng → cảnh báo "nguyện vọng quá hẹp, có thể không xếp được". Gộp rule trùng. Rule bị loại ghi vào warnings (nêu lý do), không âm thầm bỏ.
- confidence do AI tự khai, chỉ dùng để tô viền thẻ, không dùng để lọc.

## 3. API (routes/shiftWishes.ts, mount "/api" trong index.ts)
Nhân viên (vai trò trong SHIFT_ROLES; vai trò khác → 403):
- GET /api/shift-wishes/my?month= → wish + rules + hạn chót + đã quá hạn chưa + tháng đã công bố chưa (ScheduleMonth) + aiAvailable (isAiEnabled("SHIFT_WISH_AI")).
- POST /api/shift-wishes/parse { month, text } → { rules, leaveSuggestions, unclear, warnings } (không lưu; 503 khi SHIFT_WISH_AI tắt; ghi AiCallLog + hạn mức như mục 0).
- PUT /api/shift-wishes/my { month, text, rules, confirm } → lưu (rules từ AI hoặc người dùng sửa / thêm tay, kiểm tra lại bằng validateRules); confirm=true → CONFIRMED, late nếu quá hạn. Tháng đã có ScheduleMonth.publishedAt → 409 kèm câu rõ ràng, gợi ý dùng đổi ca / đơn từ.
Quản lý (mgmtOnly, chi nhánh mình — storeId lấy bằng mustStoreId):
- GET /api/shift-wishes?month= → mỗi nhân viên (Active, SHIFT_ROLES, chi nhánh): trạng thái (chưa gửi / nháp / đã xác nhận / gửi muộn), số rule theo loại, rawText, rules; và bản đồ nhiệt theo ngày × ca × vị trí (tính bằng expandRule): số người có thể làm (trừ UNAVAILABLE và nghỉ phép APPROVED) / số người PREFER so với định biên StaffingRule (ô có số người có thể làm < định biên → đỏ). Chỉ tính nguyện vọng CONFIRMED.
- POST /api/shift-wishes/remind { month } → gửi thông báo (lib/notify.ts, thêm "SHIFT_WISH" vào NotifyType; link mở màn nguyện vọng) cho nhân viên chưa gửi / còn nháp.
Tác vụ nền (lib/shiftWish/remindJob.ts, khởi động trong index.ts, chạy mỗi ngày như lib/notify.ts): đúng 3 ngày trước hạn chót của tháng sau, nhắc người chưa gửi. Chống gửi trùng: dedupeKey `shift-wish:${storeId}:${month}:${staffId}` và dedupeMinutes = 4 ngày (mặc định chỉ 30 phút là không đủ).

## 4. Giao diện nhân viên
Trong nhóm "Của tôi" (apps/sidebar.ts nhóm "mine", cạnh hr/my-schedule; khai báo trong apps/registry.tsx với roles = các vai trò SHIFT_ROLES, không cho Admin / Owner), màn "Nguyện vọng xếp ca":
- Chọn tháng (mặc định tháng sau), dòng hạn chót.
- Ô văn bản lớn với ví dụ gợi ý; nút "AI đọc giúp" (ẩn khi aiAvailable = false; API trả 503 giữa chừng thì ẩn nút và báo nhẹ). Có nút micro dùng lại component ghi âm của VoiceOrder nếu đơn giản, không bắt buộc.
- Sau khi đọc: danh sách thẻ ràng buộc, mỗi thẻ: biểu tượng theo loại (Không thể đỏ, Muốn xanh, Hạn chế vàng, Số ca xám), mô tả tiếng Việt dễ hiểu ("Không làm ca Sáng (07:00–12:00) các thứ 3, thứ 5 từ 01/12 đến 31/12"), trích câu gốc (quote) mờ bên dưới, nút sửa / xóa. Thẻ AI không chắc (confidence < 0,7) viền vàng.
- Lịch tháng xem trước: tô màu ô ngày × ca theo ràng buộc (tính bằng logic giống expandRule; có thể mượn style lưới của components/AttendanceCalendar.tsx — đó là lịch chấm công, không sửa hành vi của nó) để nhân viên thấy ngay.
- "unclear" hiện thành câu hỏi: "AI chưa hiểu: 'tuần sau nữa' — bạn chọn giúp khoảng ngày".
- leaveSuggestions: thẻ "Bạn có muốn tạo đơn nghỉ phép 24/12?" mở form đơn từ có sẵn với ngày điền sẵn. pages/HrRequests.tsx hiện chưa nhận ngày từ ngoài: thêm đọc query ?tab=LEAVE&date=YYYY-MM-DD&toDate=YYYY-MM-DD → mở sẵn form tab LEAVE với ngày đã điền (không đổi hành vi khi không có query).
- Thêm tay ràng buộc bằng form (loại, ngày / thứ, ca, số ca) — đây là đường chính khi AI tắt.
- Nút "Xác nhận gửi". Cảnh báo nguyện vọng quá hẹp hiện trước khi gửi.

## 5. Giao diện quản lý (modules/hr/Schedule.tsx)
- Thẻ "Nguyện vọng tháng YYYY-MM": x/y nhân viên đã gửi, nút "Nhắc người chưa gửi".
- Bản đồ nhiệt ngày × ca (số người có thể làm so với định biên, số người muốn), bấm ô xem ai không thể / ai muốn.
- Bấm một nhân viên → xem câu gốc + danh sách ràng buộc.

## 6. Kiểm thử
- backend-node/scripts/testShiftWish.ts (cần GEMINI key; chạy bằng tsx): 12 câu mẫu (đi học theo thứ, xin nghỉ ngày lẻ, khoảng ngày, "chỉ làm tối", số ca tối đa / tuần, "cần nhiều ca kiếm thêm", câu có ngày ngoài tháng, câu mơ hồ "tuần sau nữa", câu viết tắt không dấu, câu có giờ "sau 6h chiều", câu mâu thuẫn "muốn ca sáng thứ 2" + "không làm thứ 2"), in rules và so với đáp án viết tay. Cách chấm: so sau khi quy đổi bằng expandRule (so tập lần (type, ngày, mã ca) và count/period, không so chữ). Báo 2 mức: (1) câu đúng hoàn toàn / 12, (2) precision và recall theo rule. Ghi bảng vào docs/qa/ để đưa vào báo cáo.
- Kiểm tra: mã ca bịa bị loại (có warning); ngày ngoài tháng bị loại; AI tắt → nút ẩn, form tay vẫn lưu được; nhân viên không xem được nguyện vọng của người khác; quản lý chi nhánh A không xem được chi nhánh B; tháng đã công bố → PUT trả 409; nhắc 2 lần liền chỉ gửi 1 lần.
- tsc backend và frontend; kiểm tra khung 390px.
Báo lại: tỉ lệ đúng trên 12 câu mẫu, ảnh chụp màn nhân viên và bản đồ nhiệt.
```

## Prompt B: thuật toán xếp ca có nguyện vọng + giải thích

```
Làm trên nhánh feat/chain-stores, sau prompt A (đã có ShiftWish, ShiftWishRule, ScheduleMonth, lib/shiftWish/normalize.ts). Đọc md/prompt-xep-ca-nguyen-vong.md, phần "Hiện trạng" và "Thiết kế" (đặc biệt "Đơn vị đếm nguyện vọng" và "Thuật toán"). Cây làm việc đang có WIP của tính năng khác: chỉ sửa / commit phần của mình.

Mục tiêu: nâng lib/autoSchedule.ts để dùng nguyện vọng (cứng + mềm), thêm bước cải thiện cục bộ, trả chỉ số và lý do; AI viết lời giải thích từ các mã lý do. Không phá hành vi cũ khi không có nguyện vọng nào.

## 1. Thuật toán: backend-node/src/lib/autoSchedule.ts (giữ chữ ký cũ, thêm tham số tùy chọn)
- Input thêm wishes: Map<staffId, WishRule[]>, mỗi rule đã quy đổi bằng expandRule của prompt A về dạng chuẩn { ruleId, type, occurrences: { date, codes:Set<string> }[] (UNAVAILABLE / PREFER / AVOID có ngày), codes:Set<string>|null (PREFER / AVOID chỉ theo loại ca, không ngày), count, period, rangeFrom, rangeTo, weekday (DAY_OFF_PATTERN) } và options { seed, timeBudgetMs (mặc định 2000), weights, improve (mặc định true — tắt để chạy phương án (b) khi kiểm thử) }. Không truyền wishes → chạy y như cũ (trừ seed).
- Ràng buộc cứng thêm vào canWork: UNAVAILABLE (ngày + ca), MAX_SHIFTS (theo tuần T2–CN / tháng / khoảng; chỉ cứng khi count nhỏ hơn maxShiftsPerWeek tương ứng). Đếm MAX_SHIFTS theo tháng phải tính cả ca cũ trong tháng (take() đã cộng ca existing vào monthCount).
- Điểm chọn người (giữ các thành phần cũ: số ca tháng ×100, ca cuối tuần ×10, cùng loại ca −1) cộng thêm hằng số đầu file có chú thích:
  W_PREFER = 60 (trừ khi ô khớp PREFER), W_AVOID = 40 (cộng khi khớp AVOID), W_MIN = 30 (trừ khi còn dưới MIN_SHIFTS), W_DAYOFF = 25 (cộng khi rơi vào ngày muốn nghỉ cố định), W_FAIR = 8 × số lần nguyện vọng đã được đáp ứng của người đó (công bằng nguyện vọng).
  Ghi chú trong code: W_PREFER = 60 < 100 là cố ý — chia đều số ca được ưu tiên hơn nguyện vọng; ở vòng tham lam nguyện vọng chỉ quyết định giữa những người cùng số ca tháng.
- Thay Math.random() bằng bộ sinh ngẫu nhiên có seed (VD mulberry32) để chạy lại ra cùng kết quả.
- Thêm untake(id, date, code, startMin, endMin): gỡ ca khỏi busy, weekCount, monthCount, weekendCount, codeCount (ngược với take()). Mọi bước di chuyển: untake → kiểm canWork → take, không hợp lệ thì hoàn tác.
- Sau vòng tham lam (nếu improve): tìm kiếm cục bộ trong timeBudgetMs:
  chi phí tổng = Σ phạt nguyện vọng mềm không đáp ứng (mỗi lần PREFER không được xếp: W_PREFER; mỗi lần AVOID bị xếp: W_AVOID; MIN_SHIFTS thiếu: W_MIN × số ca thiếu; DAY_OFF vi phạm: W_DAYOFF mỗi lần) + W_BALANCE (đặt hằng số, VD 50) × (độ lệch chuẩn số ca tháng trong cùng vị trí, cộng các vị trí) + W_SHORT (1000) × số chỗ thiếu người.
  Bước di chuyển (chỉ trên ca mới xếp, không đụng ca existing): (a) hoán đổi người giữa 2 ô cùng vị trí khác ngày / khác ca, (b) chuyển một người từ ô đủ người sang ô thiếu cùng vị trí, (c) thay người trong ô (hoặc điền ô trống staffId null) bằng người chưa được xếp ô đó. Chỉ nhận bước không vi phạm ràng buộc cứng và giảm chi phí. Dừng khi hết thời gian hoặc 200 vòng liền không cải thiện. Có thể tính lại chi phí toàn phần mỗi bước nếu đủ nhanh; tối ưu tính chênh lệch sau nếu cần.
- Output thêm:
  - slots[i].reason: "PREFER_MET" | "ONLY_CANDIDATE" | "BALANCE" | "SAME_SHIFT_TYPE" | "FILLED_SHORTAGE" (tính trên lịch cuối).
  - unmetWishes: [{ staffId, ruleId, date, code, cause, detail }] — tính SAU CÙNG trên lịch cuối, cho mỗi lần PREFER không đáp ứng, xét theo thứ tự: "ON_LEAVE" (nghỉ phép) → "NO_SLOT_FOR_ROLE" (định biên vị trí đó ở ca đó = 0, hoặc ngày đã qua / không xếp) → "FULL_BY_OTHERS" (ô đã đủ người) → "MAX_WEEK_REACHED" (đã chạm số ca / tuần hoặc MAX_SHIFTS) → "REST_RULE" (vướng nghỉ giữa ca / đã có ca khác hôm đó) → "BALANCE_TRADEOFF".
  - metrics: { preferMet, preferTotal (đếm theo lần), avoidViolated, hardViolations (chỉ ca mới xếp, phải = 0, > 0 là lỗi), existingConflicts (ca cũ giữ nguyên trái UNAVAILABLE), shortages, shiftsStdDevByRole, cost, perStaff: [{ staffId, shifts, weekendShifts, preferMet, preferTotal }], iterations, ms }. Chỉ tính trên các ngày được xếp (futureDays).
- Kiểm thử thuật toán (repo không có framework test → script tsx, VD backend-node/scripts/testAutoSchedule.ts): trên dữ liệu ngẫu nhiên 50 seed: không vi phạm UNAVAILABLE / nghỉ phép / minRest / maxShiftsPerWeek / MAX_SHIFTS; cost(có cải thiện) ≤ cost(chỉ tham lam) (KHÔNG khẳng định preferMet luôn tăng — tìm kiếm cục bộ có thể đổi bớt nguyện vọng lấy chia đều; chỉ báo cáo preferMet); cùng seed → cùng kết quả; không có nguyện vọng thì kết quả hợp lệ như cũ.

## 2. Dữ liệu + API (migration số tiếp theo sau của prompt A; routes/schedule.ts)
- Bảng ScheduleRun (Schedule_Runs): id, storeId, month, seed, useWishes, includeLate, metrics JSON, unmetWishes JSON, assignments JSON ([{ date, code, role, staffId|null, startMin, endMin, reason }] — để áp dụng lại phương án), explanations JSON null ({ summary, perStaff: { [staffId]: text } }), createdById, createdAt.
- ScheduleMonth thêm appliedRunId Int null (lần chạy đang nằm trong bản nháp / đã công bố).
- POST /schedule/admin/auto nhận thêm { useWishes?: boolean (mặc định true), includeLate?: boolean (mặc định false), seed? (không có thì sinh ngẫu nhiên và trả lại) }. Đọc ShiftWish CONFIRMED (và late nếu includeLate) của tháng → wishes. Lưu ScheduleRun, ghi bản nháp như cũ, cập nhật ScheduleMonth.appliedRunId. Response thêm metrics, unmetWishes, runId, seed (giữ các trường cũ).
- GET /schedule/admin/runs?month= → các lần chạy gần nhất (chỉ số, seed, thời điểm, đang áp dụng hay không).
- POST /schedule/admin/runs/:id/apply → xóa nháp tháng (như /auto), ghi lại bản nháp từ assignments của run đó (bỏ ô trùng với ca đã có / đã qua), cập nhật appliedRunId. Tháng đã công bố → 409.
- POST /schedule/admin/runs/:id/explain { staffId? } → giải thích, lưu vào ScheduleRun.explanations:
  - Nếu isAiEnabled("SHIFT_EXPLAIN_AI") (hạn mức dailyLimit đếm bằng AiCallLog như prompt A): Gemini nhận metrics + unmetWishes + perStaff (mã nhân viên và tên gọi — chỉ tên, không họ đệm, không SĐT; cố ý khác prompt A vì câu giải thích cần gọi tên) → JSON { summary (3–4 câu cho quản lý), perStaff: [{ staffId, text (≤ 2 câu, giọng lịch sự, nói rõ nguyện vọng nào được / không được và vì sao, dựa vào cause) }] }. Kiểm tra bằng code: mọi con số xuất hiện trong summary phải là một giá trị có trong metrics (preferMet, preferTotal, %, shortages…), mọi số trong text của một người phải khớp perStaff của người đó; sai → dùng mẫu câu cho phần đó. staffId lạ bị bỏ.
  - Không thì dùng mẫu câu theo mã cause (lib/shiftWish/explainTemplates.ts, dùng chung với frontend nếu tiện).
- Khi publish lịch theo tháng: ScheduleMonth.publishedAt (prompt A đã làm). Nếu appliedRunId có explanations → gửi mỗi nhân viên thông báo "Lịch tháng YYYY-MM đã công bố" qua lib/notify.ts (type "SHIFT_WISH" hoặc thêm "SCHEDULE_PUBLISHED" vào NotifyType) kèm câu giải thích của họ; không có thì gửi thông báo không kèm câu.
- POST /schedule/admin và PUT /schedule/:id (gán / đổi người): nếu người được gán có UNAVAILABLE trùng ô đó (nguyện vọng CONFIRMED của tháng) → vẫn lưu nhưng response thêm warning: "Lan đã báo không thể làm ca này: «…quote…»". Frontend hiện cảnh báo ngay.
- GET /schedule/my?month= (lịch cá nhân) trả thêm khi tháng đã công bố: wishSummary { preferMet, preferTotal, text } lấy từ run đã áp dụng, và với mỗi ca: wishMet boolean (tra assignments.reason / expandRule).

## 3. Giao diện quản lý (modules/hr/Schedule.tsx)
- Hộp "Tự xếp lịch tháng": ô tích "Dùng nguyện vọng nhân viên (x/y đã gửi)", "Tính cả nguyện vọng gửi muộn".
- Sau khi chạy: thẻ chỉ số (Nguyện vọng được đáp ứng 87% · Vi phạm "không thể": 0 · Ca thiếu người: 2 · Chênh lệch số ca: ±1; existingConflicts > 0 thì thêm dòng cảnh báo riêng), biểu đồ nhỏ số ca / người (recharts), danh sách nguyện vọng chưa đáp ứng kèm nguyên nhân, khối "AI tóm tắt" (ẩn khi SHIFT_EXPLAIN_AI tắt — dùng useAiFeatures được vì đây là màn quản lý — thay bằng mẫu câu).
- Trên lưới lịch: ô được xếp đúng nguyện vọng có chấm xanh; tooltip lý do (lấy reason từ assignments của run đang áp dụng, khớp theo ngày + ca + người).
- Nút "Chạy lại (phương án khác)" đổi seed; bảng so sánh các lần chạy (chỉ số) với nút "Dùng phương án này" (gọi /runs/:id/apply) để chọn phương án tốt nhất trước khi công bố.
- Sửa tay một ô sau khi xếp: hiện warning từ API nếu vi phạm "không thể" của người đó.

## 4. Giao diện nhân viên (pages/WorkSchedule.tsx — Lịch cá nhân)
- Tháng đã công bố: dòng "Nguyện vọng được đáp ứng 5/6" + câu giải thích (từ wishSummary); ca khớp nguyện vọng có chấm xanh. Tháng chưa công bố / không gửi nguyện vọng thì không hiện gì.

## 5. Kiểm thử
- backend-node/scripts/testAutoScheduleWishes.ts (không cần DB, gọi thẳng autoSchedule): dựng 1 chi nhánh, 12 nhân viên, 3 ca, định biên thật, nguyện vọng ngẫu nhiên có mâu thuẫn, seed cố định; chạy (a) tham lam cũ không nguyện vọng (preferMet tính hậu kiểm trên cùng bộ nguyện vọng), (b) tham lam có nguyện vọng (improve=false), (c) có nguyện vọng + cải thiện cục bộ; lặp vài seed và in bảng so sánh chỉ số (preferMet %, hardViolations, shortages, std dev, cost, ms). Ghi bảng vào docs/qa/ để đưa vào chương đánh giá của báo cáo.
- Kiểm tra API: chạy 2 lần khác seed → apply lần 1 → bản nháp khớp assignments của lần 1; publish → nhân viên nhận thông báo kèm câu giải thích; SHIFT_EXPLAIN_AI tắt → mẫu câu; gán tay vào ô UNAVAILABLE → có warning.
- tsc backend và frontend.
Báo lại: bảng so sánh 3 phương án, thời gian chạy, ảnh chụp thẻ chỉ số và giải thích.
```

## Câu trả lời sẵn khi hội đồng hỏi

- **"AI có quyết định ai làm ca nào không?"** Không. AI chỉ hiểu câu nguyện vọng thành ràng buộc (nhân viên xác nhận lại) và viết lời giải thích. Việc xếp ca do thuật toán tối ưu có ràng buộc cứng / mềm và trọng số rõ ràng.
- **"Thuật toán gì?"** Tham lam xếp ô khó trước, sau đó tìm kiếm cục bộ (hoán đổi / chuyển ca) để giảm hàm chi phí gồm phạt nguyện vọng, phạt lệch số ca, phạt thiếu người. Có seed nên tái lập được.
- **"Đánh giá thế nào?"** So sánh 3 phương án trên cùng dữ liệu: % nguyện vọng đáp ứng, số vi phạm cứng (bằng 0), số ca thiếu, độ lệch số ca, thời gian chạy. Độ chính xác AI hiểu câu đo trên bộ 12 câu mẫu.
- **"Công bằng không?"** Có thành phần công bằng nguyện vọng (người đã được đáp ứng nhiều sẽ giảm ưu tiên) và vẫn giữ mục tiêu chia đều số ca, ca cuối tuần như thuật toán cũ.
- **"Sao trọng số nguyện vọng (60) nhỏ hơn trọng số số ca (100)?"** Cố ý: chia đều số ca (ảnh hưởng thu nhập) quan trọng hơn sở thích. Khi tham lam, nguyện vọng quyết định giữa những người cùng số ca; bước tìm kiếm cục bộ mới đổi chỗ để tăng nguyện vọng mà không làm lệch số ca. Số đo ở bảng so sánh (b) và (c).
- **"Lịch đã có ca duyệt trước trái nguyện vọng thì sao?"** Thuật toán không động vào ca đã duyệt; số ca này báo riêng (existingConflicts), còn vi phạm do thuật toán xếp luôn bằng 0.
