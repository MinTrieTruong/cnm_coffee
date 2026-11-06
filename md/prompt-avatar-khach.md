Bạn đang làm việc trên repo TD Coffee (frontend-app trang khách + backend-node). Khách đã có ảnh đại diện (`Customer.avatarUrl`, đổi ở trang Tài khoản). NHIỆM VỤ: hiện **avatar của khách** ở 3 chỗ còn đang thiếu, dùng chung một component, và cập nhật ngay khi khách đổi ảnh. Không đổi luồng nghiệp vụ.

══════════ 1. COMPONENT DÙNG CHUNG `CustomerAvatar` ══════════
`src/components/CustomerAvatar.tsx` — props: `src?`, `name`, `size` (24 | 32 | 40 | 48 | 64), `className?`.
- Có ảnh: ảnh tròn `object-fit: cover`, viền 1px màu viền trang khách, `loading="lazy"`, có `alt={name}`.
- Không có ảnh hoặc ảnh lỗi (`onError`): vòng tròn hiện **chữ cái viết tắt** (2 chữ: "Nguyễn Hoàng Lâm" → "HL" — chữ đầu tên đệm cuối + tên; một chữ thì 1 ký tự), nền lấy từ bảng 6 màu ấm theo token trang khách, chọn cố định theo hash của tên/ID (cùng một khách luôn cùng màu), chữ trắng đậm.
- Đường dẫn ảnh tương đối thì ghép với base URL API như các ảnh khác trong dự án.
- Dùng lại component này cho avatar ở trang Tài khoản để mọi nơi giống nhau.

══════════ 2. NGUỒN DỮ LIỆU & ĐỒNG BỘ ══════════
- Lưu `avatarUrl` cùng thông tin khách trong session/context phía frontend (nơi đang giữ tên khách cho header). Khi đổi avatar ở trang Tài khoản → cập nhật context ngay → header, chat, đánh giá đổi theo không cần tải lại trang.
- Backend:
  • API đánh giá (danh sách review trang chủ / chi tiết món / mục "Khách nói gì về quán"): trả thêm `customer: { name, avatarUrl }` — CHỈ tên và avatar, không trả SĐT/email của người khác.
  • API tin nhắn chat: mỗi tin có `senderType` (CUSTOMER / BOT / STAFF); tin của khách kèm `avatarUrl` của khách (hoặc frontend lấy từ context nếu là chính khách đang chat); tin nhân viên kèm tên + avatar nhân viên nếu có.
  • API đăng nhập / lấy hồ sơ khách (`/api/auth/me` hoặc tương đương) trả `avatarUrl`.

══════════ 3. BA VỊ TRÍ ══════════
**(1) Đánh giá — "Khách nói gì về quán" (và mọi danh sách review, kể cả chi tiết món):**
- Mỗi review: `CustomerAvatar` 40px bên trái; bên phải là hàng tên (đậm) + sao + ngày (ngày căn phải như hiện tại), dưới là nội dung, ảnh đính kèm, phản hồi của quán (nếu có, thụt vào, kèm logo quán 24px + "TD Coffee phản hồi").
- Review ẩn danh (nếu có tùy chọn này) → avatar chữ "?" màu xám, tên "Khách hàng".
- Điện thoại: avatar 32px, bố cục giữ nguyên dạng hàng.

**(2) Chatbot / chat hỗ trợ (`ChatWidget`):**
- Tin của khách (bên phải, bong bóng màu chủ đạo): `CustomerAvatar` 28–32px ở **bên phải** bong bóng, căn đáy với bong bóng; các tin liên tiếp của cùng người chỉ hiện avatar ở tin cuối nhóm (như Messenger).
- Tin của bot (bên trái): avatar là logo TD Coffee tròn 28–32px + nhãn "TD Bot"; tin của nhân viên: avatar + tên nhân viên.
- Giờ gửi nằm dưới bong bóng, căn theo phía bong bóng; bỏ dấu "+" lạc ở dưới tin (đang hiện trong ảnh) nếu đó là nút phản ứng thì chỉ hiện khi hover.
- Khách chưa đăng nhập: avatar chữ viết tắt từ tên đã nhập, hoặc icon người mặc định.
- Thay emoji trên header/tab chat ("💬", "⚠️") bằng icon lucide nhỏ hoặc bỏ, theo quy tắc giao diện mới không dùng emoji.

**(3) Header / thanh nav (cạnh tên khách):**
- Thay icon người bằng `CustomerAvatar` 32px, bên phải là tên khách (đậm) — dòng dưới nhỏ: hạng thành viên (vd "Hạng Đồng · 22.420 điểm") thay cho chữ "Đăng xuất".
- Bấm vào cụm avatar + tên → **menu thả xuống**: Tài khoản · Đơn hàng · Ví voucher · Quà của tôi · Đăng xuất (chữ đỏ, cuối). Đóng khi bấm ra ngoài hoặc Esc; dùng được bằng bàn phím (`aria-haspopup`, `aria-expanded`).
- Chưa đăng nhập: giữ "Đăng nhập / Đăng ký" như hiện tại.
- Điện thoại: tab "Tài khoản" của BottomNav hiện avatar 24px thay icon khi đã đăng nhập.

══════════ 4. KIỂM TRA ══════════
- `npm run build` ở frontend-app và backend-node sạch lỗi.
- Khách có avatar: thấy ảnh ở header, BottomNav, review của mình, tin chat của mình. Đổi avatar ở Tài khoản → 3 chỗ đổi ngay.
- Khách không có avatar / link ảnh hỏng: hiện chữ viết tắt, cùng màu ở mọi chỗ.
- API review không lộ SĐT/email người khác.
- 1440px và 390px không vỡ bố cục; menu thả xuống của header không bị che bởi thanh danh mục.

BÁO LẠI: ảnh chụp 3 vị trí (desktop + điện thoại) với khách có avatar và khách không có avatar.
