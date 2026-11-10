# Đăng nhập khách bằng Google / Facebook — hướng dẫn cài đặt

Khách hàng (không áp dụng cho nhân sự) có thể đăng nhập / đăng ký bằng Google hoặc Facebook, bên cạnh SĐT + mật khẩu như cũ.
Trình duyệt chỉ lấy token rồi gửi lên backend; **backend tự xác minh với Google / Meta**, không tin id hay email trình duyệt gửi.

## 1. Biến môi trường

| Nơi | Biến | Là gì | Bí mật? |
|---|---|---|---|
| `backend-node/.env` | `GOOGLE_CLIENT_ID` | OAuth Client ID loại Web (`…apps.googleusercontent.com`) | Không |
| `backend-node/.env` | `FACEBOOK_APP_ID` | App ID của app Meta | Không |
| `backend-node/.env` | `FACEBOOK_APP_SECRET` | App Secret của app Meta | **Có — chỉ để ở backend** |
| `frontend-app/.env` | `VITE_GOOGLE_CLIENT_ID` | Giống `GOOGLE_CLIENT_ID` (tuỳ chọn) | Không |
| `frontend-app/.env` | `VITE_FACEBOOK_APP_ID` | Giống `FACEBOOK_APP_ID` (tuỳ chọn) | Không |

- Biến `VITE_…` để trống thì frontend dùng ID backend trả về ở `GET /api/auth/providers`, nên thường **chỉ cần điền backend**.
- Thiếu biến nào thì nút tương ứng **tự ẩn**, backend in cảnh báo khi khởi động (`[social-login] Thiếu GOOGLE_CLIENT_ID…`), app không bị sập.
- **Không bao giờ** đặt `FACEBOOK_APP_SECRET` vào `frontend-app/.env`: mọi biến `VITE_…` đều bị nhúng vào bundle công khai.
- Sửa `.env` xong thì khởi động lại backend (và build lại frontend nếu có sửa biến `VITE_…`).

## 2. Google Cloud Console

1. Vào <https://console.cloud.google.com/> → chọn hoặc tạo **Project** (vd. `TD Coffee`).
2. **APIs & Services › OAuth consent screen** (màn hình đồng ý OAuth):
   - User type: **External**.
   - Điền tên app (`TD Coffee`), email hỗ trợ, logo (tuỳ chọn), email liên hệ của nhà phát triển.
   - **App domain**: trang chủ, link **Chính sách quyền riêng tư** `https://<tên-miền>/privacy`. Điều khoản dịch vụ có thể dùng `https://<tên-miền>/policy/dat-hang`.
   - **Authorized domains**: tên miền thật (vd. `tdcoffee.vn`).
   - Scopes: chỉ cần `openid`, `email`, `profile` (mặc định, không cần Google duyệt).
   - Khi còn **Testing**, chỉ các tài khoản trong mục *Test users* đăng nhập được. Bấm **Publish app** để mọi người dùng được; scope cơ bản thường không cần xác minh.
3. **APIs & Services › Credentials › Create credentials › OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins**:
     - `http://localhost:5173` (dev)
     - `http://localhost:4173` (vite preview, nếu dùng)
     - `https://<tên-miền-thật>` (production, không có dấu `/` ở cuối)
   - **Authorized redirect URIs**: để trống (dùng nút Google Identity Services, không chuyển hướng).
4. Sao chép **Client ID** vào `GOOGLE_CLIENT_ID` (backend), và vào `VITE_GOOGLE_CLIENT_ID` nếu muốn. Dự án này không dùng **Client secret**.

> Google chỉ chấp nhận origin `http://localhost…` hoặc `https://…`. Mở web qua IP LAN (vd. `http://192.168.1.10:5173`) thì nút Google báo lỗi origin. Khi demo trên điện thoại, dùng tên miền HTTPS (vd. tunnel ngrok / Cloudflare) rồi thêm origin đó vào danh sách.

## 3. Meta for Developers (Facebook)

1. Vào <https://developers.facebook.com/apps> → **Create app**:
   - Use case: **Authenticate and request data from users with Facebook Login**.
   - App type (nếu được hỏi): **Consumer**.
2. Trong app: **Use cases › Authentication and account creation › Customize**:
   - Quyền: `public_profile` (mặc định) và **`email`** (bấm *Add*).
3. **Facebook Login › Settings**:
   - **Login with the JavaScript SDK**: **Yes**.
   - **Allowed Domains for the JavaScript SDK**: `https://<tên-miền-thật>` (localhost được phép sẵn khi app ở chế độ Development).
   - **Valid OAuth Redirect URIs**: `https://<tên-miền-thật>/login` (SDK dùng popup, nhưng Meta yêu cầu khai báo).
   - Bật **Client OAuth login**, **Web OAuth login**, **Enforce HTTPS**.
4. **App settings › Basic**:
   - **App domains**: `<tên-miền-thật>`.
   - **Privacy Policy URL**: `https://<tên-miền-thật>/privacy`
   - **User data deletion**: chọn *Data deletion instructions URL* → `https://<tên-miền-thật>/data-deletion`
   - Category, icon 1024×1024.
   - Sao chép **App ID** → `FACEBOOK_APP_ID`, **App Secret** (bấm *Show*) → `FACEBOOK_APP_SECRET` (chỉ backend).
5. **Chế độ Development** (mặc định): chỉ tài khoản có vai trò trong app đăng nhập được. Thêm người thử ở **App roles › Roles** (Administrator / Developer / Tester); người được mời phải chấp nhận lời mời.
6. **Chuyển sang Live** (cho mọi khách):
   - Phải có Privacy Policy URL và Data deletion URL truy cập công khai (2 trang `/privacy`, `/data-deletion` đã có trên web khách).
   - Quyền `public_profile` và `email` thường được duyệt sẵn ở mức Standard Access, không cần App Review.
   - Meta có thể yêu cầu **Business verification** (xác minh doanh nghiệp: giấy phép kinh doanh, tên miền, số điện thoại) trước khi cho Live hoặc khi app cần Advanced Access. Làm ở **Business settings › Security center**.
   - Bật công tắc **App mode: Live** ở thanh trên cùng.

> Facebook Login trên web bắt buộc **HTTPS** (trừ `localhost` khi app ở Development). Có tài khoản không chia sẻ email: hệ thống vẫn tạo được tài khoản, khách chỉ cần bổ sung SĐT.

## 4. Bật / tắt trong hệ thống

**Cấu hình › Cài đặt chung › Đăng nhập khách hàng** (chỉ Chủ chuỗi sửa):

- Tắt một phương thức thì nút ẩn khỏi `/login`, `/register`, mục Tài khoản › Bảo mật, và backend trả `403` nếu ai vẫn gọi API.
- Nếu máy chủ thiếu biến môi trường, màn cấu hình hiện cảnh báo đỏ *"Máy chủ chưa cấu hình…"*; bật công tắc lúc đó nút vẫn ẩn.

## 5. Luồng nghiệp vụ (tóm tắt)

| Tình huống | Kết quả |
|---|---|
| Google / Facebook đã liên kết | Đăng nhập luôn |
| Chưa liên kết, email không trùng ai | Tạo tài khoản mới (không mật khẩu) → màn **Bổ sung số điện thoại** (cho phép "Để sau") |
| Email (đã xác minh) trùng tài khoản có sẵn | **Không tự gộp** → màn *Tài khoản đã tồn tại*, nhập mật khẩu tài khoản cũ để liên kết (giữ điểm, hạng, đơn) |
| SĐT bổ sung đã thuộc tài khoản khác | Như trên. Liên kết xong thì tài khoản tạm vừa tạo bị xoá nếu chưa có dữ liệu |
| Tài khoản cũ chưa có mật khẩu | Báo liên hệ quán (hiện hotline) |
| Chưa có SĐT | Không đặt được giao hàng, đơn đã trả không tích điểm, có nhắc ở Giỏ hàng / Tài khoản |

Tài khoản › Bảo mật: xem / liên kết / hủy liên kết Google, Facebook; khách tạo bằng mạng xã hội có thể **đặt mật khẩu** (không cần mật khẩu cũ). Hệ thống không cho hủy phương thức đăng nhập cuối cùng.

Nhật ký: bảng `Customer_Auth_Logs` ghi `LOGIN / REGISTER / LINK / UNLINK / SET_PASSWORD` kèm phương thức, IP, trình duyệt.

## 6. API

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/auth/providers` | Phương thức nào đang bật + ID công khai |
| POST | `/api/auth/google` `{ idToken }` | Đăng nhập / đăng ký bằng Google |
| POST | `/api/auth/facebook` `{ accessToken }` | Đăng nhập / đăng ký bằng Facebook |
| POST | `/api/auth/social/link` `{ ticket, password }` | Liên kết vào tài khoản có sẵn (phiếu sống 10 phút, sai tối đa 5 lần) |
| POST | `/api/auth/phone` `{ phone }` | Bổ sung SĐT (cần đăng nhập) |
| GET | `/api/auth/identities` | Danh sách liên kết của khách |
| POST | `/api/auth/identities/google\|facebook` | Liên kết thêm |
| DELETE | `/api/auth/identities/google\|facebook` | Hủy liên kết |

Kết quả đăng nhập giống `POST /api/auth/login` (`{ token, user }`), thêm `needsPhone`, `isNew`. Trùng tài khoản trả `409 { code: "LINK_REQUIRED", ticket, account }`.

## 7. Kiểm thử

- `tests/qa/10-social-login.mjs`: backend test phải chạy với `NODE_ENV=test SOCIAL_TEST_SECRET=qa-social-secret`. Ở chế độ này backend chấp nhận token giả `test.<jwt>` thay cho token Google / Meta, để chạy hết luồng nghiệp vụ. Chế độ này **chỉ bật khi `NODE_ENV=test`**, môi trường khác bỏ qua `SOCIAL_TEST_SECRET`.
- Nhóm giao diện (S7) cần frontend build với `VITE_GOOGLE_CLIENT_ID` / `VITE_FACEBOOK_APP_ID` bất kỳ. ID giả làm Google in lỗi console `The given client ID is not found`, nên đừng chạy `08-ui-smoke.mjs` trên bản build có ID giả.
- Token thật bị từ chối khi sai `aud` / hết hạn / app khác: `google-auth-library` (`verifyIdToken`, kiểm `aud` và `iss`) và Graph API `debug_token` (kiểm `app_id`, `is_valid`) đảm nhận. Phần này chỉ thử được khi đã có app thật.
- Kiểm tra bundle không lộ secret: `npm run build` rồi `grep -r "FACEBOOK_APP_SECRET\|<giá trị secret>" frontend-app/dist` phải không ra gì.

## 8. Lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Không thấy nút | Thiếu biến môi trường (xem log backend lúc khởi động) hoặc công tắc đang tắt |
| Google: `origin_mismatch` / `The given origin is not allowed` | Thêm đúng origin (cả cổng) vào *Authorized JavaScript origins*, chờ vài phút |
| Google: `The given client ID is not found` | Sai Client ID hoặc dùng nhầm loại client (phải là **Web**) |
| Facebook: *App not active* / *chỉ admin đăng nhập được* | App đang Development, thêm tài khoản vào Roles hoặc chuyển Live |
| Facebook: *Can't load URL… domain isn't included* | Thêm tên miền vào *App domains* và *Allowed Domains for the JavaScript SDK* |
| Facebook: nút mờ mãi | SDK không tải được (mạng chặn `connect.facebook.net`, trình chặn quảng cáo) |
| "Không xác minh được tài khoản…" | Backend không gọi được Google / Graph API, hoặc `GOOGLE_CLIENT_ID` / `FACEBOOK_APP_ID` backend khác với frontend |
