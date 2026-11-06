Bạn đang làm việc trên repo TD Coffee (backend-node: Express + Prisma + MySQL, JWT cho khách ở `lib/jwt.ts` + `middleware/customer.ts`, route `routes/auth.ts`; frontend-app: Vite + React 19, trang `/login`, `/register`, `/account`). Khách hiện đăng nhập bằng SĐT/email + mật khẩu (`Customer.phone` unique, `passwordHash` có thể null, có `avatarUrl`).

NHIỆM VỤ: Thêm **đăng nhập / đăng ký khách bằng Google và Facebook**. Chỉ cho KHÁCH HÀNG — không áp dụng cho đăng nhập nhân sự. Giữ nguyên đăng nhập SĐT + mật khẩu.

══════════ 1. CÁCH XÁC THỰC (an toàn, xác minh ở server) ══════════
- **Google:** dùng Google Identity Services ở frontend (nút "Đăng nhập với Google" chính thức hoặc One Tap) → nhận **ID token** → gửi `POST /api/auth/google { idToken }` → backend xác minh bằng thư viện `google-auth-library` (`verifyIdToken`, kiểm `aud` = `GOOGLE_CLIENT_ID`, `iss`, hạn) → lấy `sub`, `email`, `email_verified`, `name`, `picture`.
- **Facebook:** dùng Facebook JS SDK (Facebook Login) → nhận **access token** → `POST /api/auth/facebook { accessToken }` → backend gọi Graph API `debug_token` (bằng app token từ `FACEBOOK_APP_ID|FACEBOOK_APP_SECRET`) kiểm `app_id` khớp và `is_valid`, rồi `GET /me?fields=id,name,email,picture.type(large)` → lấy `id`, `name`, `email` (có thể không có), ảnh.
- KHÔNG bao giờ tin `email`/`id` do frontend gửi lên; chỉ tin dữ liệu backend tự xác minh. Secret chỉ nằm ở backend.
- Sau khi xác minh: phát **JWT khách giống hệt luồng đăng nhập hiện tại** (cùng payload, cùng hạn, cùng cách frontend lưu) để mọi trang khác chạy như cũ.

══════════ 2. CSDL (prisma migrate) ══════════
Bảng `CustomerIdentity`: id, customerId, provider (`GOOGLE` | `FACEBOOK`), providerUserId (sub / id), email (lúc liên kết), tên, ảnh, createdAt, lastLoginAt; unique (`provider`, `providerUserId`). Một khách có thể liên kết nhiều nhà cung cấp.

══════════ 3. LUỒNG NGHIỆP VỤ ══════════
1. **Đã liên kết** (tìm thấy `provider + providerUserId`) → đăng nhập luôn, cập nhật `lastLoginAt`.
2. **Chưa liên kết, chưa có tài khoản** → tạo `Customer` mới (tên, email từ nhà cung cấp; `passwordHash` null; ảnh nhà cung cấp làm `avatarUrl` nếu có) + `CustomerIdentity` → đăng nhập → **chuyển sang bước "Bổ sung số điện thoại"** (bắt buộc vì đơn hàng, điểm, giao hàng dùng SĐT): nhập SĐT 10 số. Nếu SĐT chưa ai dùng → lưu. Nếu SĐT đã thuộc tài khoản khác → xem bước 3. Cho phép "Để sau" nhưng chặn đặt giao hàng / tích điểm cho tới khi có SĐT (hiện nhắc nhở).
3. **Trùng với tài khoản có sẵn** (email Google đã `email_verified` trùng email của một Customer, hoặc SĐT nhập vào đã tồn tại) → KHÔNG tự gộp (tránh chiếm tài khoản). Hiện màn "Tài khoản này đã tồn tại — đăng nhập bằng mật khẩu để liên kết": khách nhập mật khẩu của tài khoản cũ → đúng thì gắn `CustomerIdentity` vào tài khoản cũ (giữ nguyên điểm, hạng, lịch sử đơn), xóa tài khoản tạm vừa tạo nếu có và chưa phát sinh dữ liệu. Tài khoản cũ không có mật khẩu → hướng dẫn liên hệ quán.
4. **Facebook không trả email** → vẫn tạo được tài khoản, chỉ cần SĐT ở bước bổ sung.
5. Khách đã đăng nhập vào **Tài khoản → Bảo mật / Liên kết tài khoản**: thấy Google, Facebook (đã liên kết: email + ngày; nút "Hủy liên kết"); chưa liên kết: nút "Liên kết". Không cho hủy liên kết phương thức đăng nhập cuối cùng (chưa có mật khẩu thì yêu cầu đặt mật khẩu trước). Khách tạo từ mạng xã hội có thể **đặt mật khẩu** để đăng nhập bằng SĐT sau này.
6. Ghi log đăng nhập (provider, thời điểm, IP) và audit khi liên kết / hủy liên kết.

══════════ 4. GIAO DIỆN ══════════
- Trang `/login` và `/register`: dưới form hiện tại thêm dải "hoặc" + 2 nút full width: **"Tiếp tục với Google"** (nền trắng, viền, logo Google theo hướng dẫn thương hiệu Google) và **"Tiếp tục với Facebook"** (nền #1877F2, chữ trắng, logo Facebook). Có trạng thái đang xử lý, báo lỗi rõ ràng ("Bạn đã hủy đăng nhập", "Không xác minh được tài khoản Google, thử lại").
- Có thể đặt thêm 2 nút này trong popup yêu cầu đăng nhập trước khi quay mini game / thanh toán (nếu đã có popup đó).
- Màn "Bổ sung số điện thoại" và "Liên kết với tài khoản có sẵn" theo design system trang khách hiện có; mobile-first.
- Sau đăng nhập quay lại đúng trang khách đang đứng trước đó (`redirect`).
- Tải SDK Google / Facebook **lười** — chỉ khi vào trang đăng nhập hoặc mở popup đăng nhập, không làm chậm trang chủ.

══════════ 5. CẤU HÌNH ══════════
- Biến môi trường backend: `GOOGLE_CLIENT_ID`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`; frontend: `VITE_GOOGLE_CLIENT_ID`, `VITE_FACEBOOK_APP_ID`. Thêm vào `.env.example` (không commit giá trị thật).
- Công tắc bật/tắt từng phương thức trong Cấu hình cửa hàng (Chủ chuỗi) — tắt thì ẩn nút và backend từ chối. Thiếu biến môi trường thì tự ẩn nút và log cảnh báo khi khởi động, không làm sập app.
- Viết `docs/social-login-setup.md` hướng dẫn từng bước bằng tiếng Việt:
  • Google Cloud Console: tạo OAuth Client ID loại Web, thêm Authorized JavaScript origins `http://localhost:5173` và tên miền thật, màn hình đồng ý OAuth.
  • Meta for Developers: tạo app, thêm sản phẩm Facebook Login, khai báo domain / Valid OAuth Redirect URIs, chế độ Development (chỉ tài khoản được thêm làm tester đăng nhập được) và điều kiện để chuyển Live (chính sách quyền riêng tư, xác minh doanh nghiệp nếu Meta yêu cầu).
  • Cần trang **Chính sách quyền riêng tư** và **Xóa dữ liệu người dùng** (Meta bắt buộc) → tạo 2 trang tĩnh `/privacy` và `/data-deletion` trên web khách.

══════════ 6. KIỂM TRA ══════════
- `npm run build` hai phía sạch lỗi.
- Test backend bằng script với token giả / sai `aud` / hết hạn / app_id khác → bị từ chối 401; token đúng (dùng tài khoản test thật nếu có cấu hình) → đăng nhập được.
- Luồng: khách mới Google → bổ sung SĐT → đặt hàng tích điểm; khách cũ (có SĐT + mật khẩu) đăng nhập Google cùng email → bắt nhập mật khẩu → liên kết → giữ nguyên điểm; hủy liên kết; không hủy được phương thức cuối; tắt công tắc thì nút ẩn và API từ chối.
- Không có `FACEBOOK_APP_SECRET` hay client secret nào xuất hiện trong bundle frontend (kiểm tra `dist/`).

BÁO LẠI: các bảng/API đã thêm, các bước người dùng cần làm trên Google Cloud và Meta (tóm tắt từ docs), những gì chưa test được vì thiếu thông tin app thật.
