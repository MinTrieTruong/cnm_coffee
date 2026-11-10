VAI TRÒ: Bạn là **QA tester** của dự án TD Coffee (repo này, nhánh hiện tại). Nhiệm vụ: **kiểm thử lại toàn bộ luồng nghiệp vụ** của hệ thống chuỗi quán cà phê và **báo cáo lỗi bằng văn bản**. KHÔNG sửa code ứng dụng (chỉ được viết script test riêng). KHÔNG chụp ảnh màn hình, KHÔNG quay video / trace Playwright, KHÔNG lưu file nặng — báo cáo chỉ là text.

══════════ 0. CHUẨN BỊ ══════════
1. Đọc nhanh README, `backend-node/prisma/schema.prisma`, danh sách route trong `backend-node/src/routes/`, `frontend-app/src/App.tsx` và `src/apps/registry.tsx` để lập **danh mục chức năng** thực tế (đừng chỉ dựa vào danh sách bên dưới — chức năng nào có trong code mà danh sách thiếu thì test luôn).
2. Chạy hệ thống như README (MySQL + Redis qua docker, backend :4000, frontend :5173, AI service nếu có). **Dùng CSDL test riêng** (vd tạo database `cmn_test`, trỏ `DATABASE_URL` sang đó, `prisma migrate deploy` / `db push` + seed). TUYỆT ĐỐI không reset/xóa CSDL đang dùng của chủ dự án.
3. Lấy tài khoản demo từ seed (mật khẩu nhân sự thường là `staff123`); tạo thêm khách test bằng luồng đăng ký.
4. `npm run build` ở backend-node và frontend-app — lỗi build/TypeScript cũng ghi vào báo cáo.

══════════ 1. CÁCH TEST ══════════
- Ưu tiên **test qua API** bằng script (Node + fetch, hoặc file `.http`) cho logic nghiệp vụ, phân quyền, tính tiền; dùng Playwright headless **không screenshot, không video, không trace** chỉ cho các luồng giao diện quan trọng (thêm giỏ, thanh toán, POS, KDS) và lỗi console/JS.
- Đặt script trong `tests/qa/` (nhẹ, chỉ code). Thêm `tests/qa/output/`, `test-results/`, `playwright-report/` vào `.gitignore`.
- Với mỗi chức năng kiểm: luồng chuẩn, dữ liệu biên (0, âm, rất lớn, chuỗi rỗng, ký tự tiếng Việt có dấu), thao tác lặp / bấm 2 lần, hai người thao tác cùng lúc (tồn kho, số lượng giải, voucher), sai quyền, hết hạn / đã hủy.
- Kiểm tra số liệu bằng cách đối chiếu CSDL sau mỗi thao tác (tiền, điểm, tồn kho, trạng thái).
- Theo dõi log backend và console trình duyệt: mọi lỗi 500, exception, cảnh báo React đều ghi lại.

══════════ 2. DANH MỤC LUỒNG CẦN TEST (tối thiểu) ══════════
**A. Khách hàng**
1. Đăng ký / đăng nhập SĐT, quên mật khẩu (nếu có), đăng xuất, khách vãng lai từ QR bàn.
2. Chọn chi nhánh, xem menu, tìm kiếm (có dấu / không dấu), chi tiết món, size S/M/L, giá theo size, món hết hàng bị ẩn / chặn đặt.
3. Giỏ hàng: thêm/bớt, ghi chú, đổi chi nhánh khi giỏ có món chi nhánh khác không bán.
4. Đặt hàng tại bàn / mang đi / giao hàng; thời gian ân hạn hủy đơn (hủy trong hạn, hủy quá hạn, khôi phục giỏ).
5. Phí ship theo khoảng cách (ngưỡng miễn phí, ngoài bán kính tối đa), bắt trả trước với khách rủi ro (nếu có).
6. Thanh toán: tiền mặt, VietQR/SePay webhook (giả lập gọi webhook), VNPay/MoMo (chế độ sandbox hoặc giả lập callback — kiểm tra chữ ký sai bị từ chối, callback gọi 2 lần không cộng tiền 2 lần).
7. Voucher: lưu vào ví, áp dụng, điều kiện đơn tối thiểu, hết hạn, hết lượt, sai chi nhánh, dùng 2 lần, giờ vàng.
8. Điểm & hạng: cộng điểm sau thanh toán, dùng điểm, hoàn điểm khi hủy/hoàn đơn, lịch sử điểm, lên hạng.
9. Theo dõi đơn giao (trạng thái, vị trí shipper, ETA), đơn thất bại / boom.
10. Đánh giá sau khi đơn Paid (chặn đánh giá đơn chưa thanh toán / người khác), ảnh đính kèm, phản hồi của quán.
11. Trang Tài khoản: sửa hồ sơ, đổi avatar, đổi mật khẩu, các mục đơn hàng / voucher / quà.
12. Chat hỗ trợ / chatbot, khiếu nại; nút liên hệ nổi (link đúng theo chi nhánh); pop up (tối đa 3, tần suất, đích đúng trang); mini game vòng quay / lì xì (nhận lượt, quay, phát thưởng, không vượt số lượng giải, mã nhận quà) — chỉ test module nào đã có trong code.
13. Đa ngôn ngữ VI/EN, chế độ tối (nếu có), responsive 390px / 1440px (chỉ kiểm bằng kích thước viewport + kiểm tra phần tử bị tràn/che, không chụp ảnh).

**B. Nhân sự theo vai trò** (Owner / Admin-Quản lý chi nhánh / Warehouse / Cashier / Waiter / Kitchen / Shipper)
14. Đăng nhập, menu hiển thị đúng quyền, trang chủ theo vai trò, đổi chi nhánh (Owner).
15. **Phân quyền qua API:** mỗi vai trò gọi thử API của vai trò khác và của chi nhánh khác → phải bị 401/403 (đây là mục quan trọng, ghi rõ mọi API lọt quyền).
16. Sơ đồ bàn realtime, gọi món tại bàn, chuyển bàn, gộp bàn, tách bill, phân khu vực nhân viên.
17. POS: tạo đơn, thanh toán nhiều phương thức, in bill, nhận đơn online, nhận quà mini game.
18. KDS: nhận món realtime, đổi trạng thái từng món, tách trạm pha chế / bếp (nếu có).
19. Ca & két: mở ca, thu chi trong ca, kết ca — **tiền dự kiến phải = đầu ca + tiền mặt thu − chi**, tách TM / CK, chênh lệch, sổ quỹ, báo cáo cuối ngày.
20. Kho: tồn theo chi nhánh, trừ kho theo định mức khi bán, kiểm kho mở/kết ca, phiếu xin nguyên liệu, điều chuyển kho giữa chi nhánh (gửi/nhận, số lượng lệch), hủy hàng hết hạn / hư hỏng, cảnh báo sắp hết / sắp hết hạn, tự ẩn món khi hết nguyên liệu.
21. Mua hàng: đề nghị mua → báo giá → đơn mua → nhận hàng (đủ / thiếu / lỗi) → trả hàng NCC → công nợ NCC.
22. Giao hàng: điều phối shipper tự động, shipper online/offline, nhận đơn, lấy hàng, tối ưu tuyến, giao thành công / thất bại, hoàn tiền ra điểm.
23. Nhân sự: nhân viên CRUD, lịch ca, đổi ca, nghỉ phép, chấm công (test qua API — bỏ qua nhận diện khuôn mặt thật), cảnh báo chấm công, bảng lương, phiếu lương.
24. Thực đơn & khuyến mãi: món, danh mục, combo, giá theo chi nhánh, voucher, bài đăng, đánh giá (ẩn/trả lời).
25. Báo cáo: doanh thu, lợi nhuận, top món, so sánh chi nhánh, xuất CSV/Excel — **đối chiếu số trên báo cáo với dữ liệu thật trong CSDL**.
26. Cấu hình: cài đặt cửa hàng, chi nhánh, nút liên hệ, nhật ký hệ thống (thao tác quan trọng có ghi audit log không).
27. Thông báo / công việc realtime (socket): mở 2 phiên song song kiểm tra sự kiện tới đúng phòng, đúng chi nhánh.

**C. Phi chức năng**
28. Bảo mật cơ bản: JWT hết hạn / giả mạo, SQL/HTML injection ở ô nhập (mô tả, đánh giá, chat — có bị chèn script không), upload file không phải ảnh / quá lớn, lộ thông tin khách khác qua API (SĐT, email), webhook thanh toán không kiểm chữ ký.
29. Toàn vẹn dữ liệu: giao dịch đồng thời (2 thu ngân thanh toán cùng đơn, 2 khách dùng voucher còn 1 lượt, 2 người quay giải còn 1 cái), số âm trong kho/két/điểm.
30. Hiệu năng sơ bộ: API chậm > 1 giây với dữ liệu seed, truy vấn N+1 rõ ràng.

══════════ 3. BÁO CÁO (chỉ text) ══════════
Ghi vào `docs/qa/test-report.md` (một file duy nhất, không ảnh):
1. **Tóm tắt:** ngày test, nhánh + commit, môi trường, số luồng đã test / đạt / lỗi / bỏ qua (kèm lý do bỏ qua).
2. **Bảng lỗi** sắp theo mức độ:
   | Mã | Mức độ (Nghiêm trọng / Cao / Trung bình / Thấp) | Module | Tiêu đề ngắn | Vai trò |
3. **Chi tiết từng lỗi:** mã (BUG-001…), mức độ, module, các bước tái hiện (request / thao tác cụ thể, dữ liệu dùng), kết quả mong đợi, kết quả thực tế (status code, thông báo lỗi, trích log ngắn ≤ 10 dòng), **nghi vấn nguyên nhân** (`file:dòng` nếu tìm được), gợi ý sửa 1–2 câu.
   Mức độ: *Nghiêm trọng* = mất tiền / sai tiền / lọt quyền / lộ dữ liệu / sập; *Cao* = luồng chính không chạy được; *Trung bình* = sai số liệu phụ, lỗi có cách né; *Thấp* = giao diện, chính tả, i18n.
4. **Danh sách luồng ĐẠT** (một dòng mỗi luồng) để biết đã phủ những gì.
5. **Rủi ro / đề xuất** chưa phải lỗi nhưng nên xem (thiếu validate, thiếu audit log, code trùng lặp nguy hiểm).

Commit duy nhất gồm `tests/qa/` (script) + `docs/qa/test-report.md` + `.gitignore`; không commit output, ảnh, video, file log lớn. Nếu sắp hết hạn mức phiên: dừng ở cuối một nhóm luồng, ghi phần đã test vào báo cáo kèm mục "CHƯA TEST" để phiên sau làm tiếp từ đó.

Cuối cùng trả lời trong chat: số lỗi theo mức độ + 5 lỗi nghiêm trọng nhất (mỗi lỗi 1 dòng).
