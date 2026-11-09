# TD Coffee — Hệ thống chuỗi quán cà phê quản lý thông minh, tích hợp AI

TD Coffee là hệ thống quản lý cho một **chuỗi quán cà phê nhiều chi nhánh**. Khách đặt món qua website hoặc quét mã QR tại bàn, chọn uống tại quán, mang về hay giao hàng, thanh toán online và tích điểm. Nhân sự làm việc trên cùng một ứng dụng web theo vai trò: thu ngân (POS), phục vụ (sơ đồ bàn), pha chế (KDS), thủ kho, giao hàng, quản lý chi nhánh và chủ chuỗi. AI (Google Gemini) hỗ trợ tư vấn khách, trả lời câu hỏi số liệu của quản lý, đặt món bằng giọng nói, đọc hoá đơn nhập kho, phác thảo món mới và hiểu nguyện vọng xếp ca.

**Trạng thái:** đồ án tốt nghiệp, đang phát triển. Nhánh phát triển chính: `feat/chain-stores` (nhánh `main` đã cũ). Chưa có bản demo công khai — xem mục [17. Triển khai](#17-triển-khai-railway--cicd).

## Mục lục

1. [Điểm nổi bật](#1-điểm-nổi-bật)
2. [Ảnh minh hoạ](#2-ảnh-minh-hoạ)
3. [Kiến trúc hệ thống](#3-kiến-trúc-hệ-thống)
4. [Công nghệ sử dụng](#4-công-nghệ-sử-dụng)
5. [Cấu trúc thư mục](#5-cấu-trúc-thư-mục)
6. [Chức năng theo phân hệ](#6-chức-năng-theo-phân-hệ)
7. [Tính năng AI](#7-tính-năng-ai)
8. [Cơ sở dữ liệu](#8-cơ-sở-dữ-liệu)
9. [Realtime (Socket.io)](#9-realtime-socketio)
10. [Cài đặt và chạy local](#10-cài-đặt-và-chạy-local)
11. [Biến môi trường](#11-biến-môi-trường)
12. [Tài khoản demo](#12-tài-khoản-demo)
13. [Các trang chính](#13-các-trang-chính)
14. [API](#14-api)
15. [Kiểm thử](#15-kiểm-thử)
16. [Tác vụ nền](#16-tác-vụ-nền)
17. [Triển khai (Railway + CI/CD)](#17-triển-khai-railway--cicd)
18. [Lỗi thường gặp](#18-lỗi-thường-gặp)
19. [Tài liệu liên quan](#19-tài-liệu-liên-quan)
20. [Hạn chế đã biết và hướng phát triển](#20-hạn-chế-đã-biết-và-hướng-phát-triển)
21. [Tác giả và giấy phép](#21-tác-giả-và-giấy-phép)

---

## 1. Điểm nổi bật

- **Chuỗi nhiều chi nhánh**: thực đơn, giá, khuyến mãi, website do Chủ chuỗi quản lý chung (chi nhánh bật / tắt món của mình); tồn kho, bàn, ca, nhân sự, két tiền tách theo từng chi nhánh. Chủ chuỗi chọn chi nhánh (hoặc "Tất cả chi nhánh") ở thanh trên cùng; nhân viên chỉ thấy dữ liệu chi nhánh của mình.
- **Đặt món tại bàn qua QR** (không cần đăng ký), mang về, giao hàng có tính phí theo khoảng cách và theo dõi shipper trên bản đồ.
- **Ân hạn 60 giây** (QTNV-01): đơn vừa chốt nằm ở trạng thái chờ, khách được hủy / sửa; hết 60 giây mới xuống bếp.
- **Realtime** bằng Socket.io: POS, sơ đồ bàn, KDS, giao hàng, chat, thông báo cập nhật tức thì theo từng chi nhánh.
- **Thanh toán online**: VNPay, MoMo, SePay (kèm QR chuyển khoản VietQR), tiền mặt / thẻ tại quầy; két tiền theo ca, sổ quỹ.
- **Kho theo lô + định mức**: mỗi ly trừ nguyên liệu theo công thức từng size, lô hết hạn trước xuất trước, kiểm kê, chuyển kho, sổ hao hụt, giá vốn món tính từ định mức.
- **Mua hàng đầy đủ**: đề nghị mua → báo giá → đơn mua → nhận hàng (đọc hoá đơn bằng AI) → trả hàng → công nợ nhà cung cấp, có cổng riêng cho nhà cung cấp.
- **Nhân sự**: xếp lịch tháng tự động (thuật toán có nguyện vọng nhân viên), chấm công GPS + nhận diện khuôn mặt, đơn từ, giao việc có ảnh bằng chứng, bảng lương.
- **AI có thể bật / tắt từng tính năng** và đặt hạn mức; thiếu khoá Gemini thì hệ thống vẫn chạy (lùi về tìm theo từ khoá, mẫu câu, nhập tay).
- **Marketing**: voucher, ưu đãi số lượng, combo, mini game vòng quay, pop up, banner, bài viết, theo dõi hành vi khách và từ khoá khách tìm.

## 2. Ảnh minh hoạ

Ảnh có sẵn trong `docs/` (chụp trong quá trình phát triển).

| | | |
|---|---|---|
| ![Trang chủ khách](docs/screenshots/giao-dien-v2/dot-1/sau-home-1440-light.webp) | ![Câu chuyện thương hiệu](docs/screenshots/cau-chuyen-thuong-hieu/sau-about-1440-light.webp) | ![Gợi ý theo thời tiết](docs/screenshots/thoi-tiet/1-trang-chu-390.png) |
| Trang chủ khách (máy tính) | Trang câu chuyện thương hiệu `/about` | "Hợp thời tiết hôm nay" trên điện thoại |
| ![Bảng điều khiển quản trị](docs/erp-phase1/03-bang-dieu-khien.png) | ![Thu ngân trên điện thoại](docs/mobile-nav/thu-ngan-390.png) | ![Shipper](docs/mobile-nav/shipper-390.png) |
| Bảng điều khiển khu quản trị `/app` | Thu ngân trên điện thoại | Màn shipper |
| ![Trợ lý AI hỏi số liệu](docs/screenshots/tro-ly-ai/1-top-mon-bieu-do-cot.png) | ![Đặt món bằng giọng nói](docs/screenshots/dat-mon-giong-noi/1-xac-nhan-cau-goi-mon.png) | ![Đọc hoá đơn](docs/screenshots/doc-hoa-don/2-kiem-tra-2-cot.png) |
| Trợ lý AI trả lời kèm biểu đồ | Gọi món bằng giọng nói ở POS | Đọc hoá đơn nhà cung cấp khi nhận hàng |
| ![AI phác thảo món mới](docs/screenshots/mon-moi-ai/4-gia-von-gia-ban.png) | ![Nhãn dinh dưỡng](docs/screenshots/dinh-duong/2-nhan-the-mon.png) | ![Danh sách món](docs/erp-phase1/01-danh-sach-mon.png) |
| AI phác thảo món mới, giá vốn do hệ thống tính | Nhãn dinh dưỡng / caffeine trên thẻ món | Quản lý món & giá |

## 3. Kiến trúc hệ thống

```mermaid
flowchart LR
  B["Trình duyệt<br/>khách · nhân sự · nhà cung cấp"] -->|HTTP /api, /uploads<br/>WebSocket /socket.io| FE["frontend-app<br/>Vite + React 19<br/>(dev: proxy về :4000)"]
  FE --> BE["backend-node<br/>Express + Prisma + Socket.io<br/>+ tác vụ nền"]
  BE --> DB[("MySQL 8<br/>Docker, cổng 3307")]
  BE --> PY["ai-service-python<br/>FastAPI :8000<br/>(gợi ý món — mock)"]
  BE --> GM["Google Gemini API<br/>chat · embedding · đọc ảnh/âm thanh"]
  BE --> PAY["VNPay · MoMo · SePay / VietQR"]
  BE --> WX["Open-Meteo<br/>(thời tiết, không cần khoá)"]
  BE --> WP["Web Push (VAPID)"]
  BE --> SO["Google / Facebook<br/>đăng nhập khách"]
```

- Khi chạy dev, Vite (cổng 5173) chuyển `/api`, `/uploads`, `/socket.io` sang backend `http://127.0.0.1:4000` nên trình duyệt chỉ cần một địa chỉ.
- Backend vừa phục vụ REST API, vừa là máy chủ Socket.io, vừa chạy các tác vụ nền (hết ân hạn đơn, điều phối shipper, nhắc việc… — xem [mục 16](#16-tác-vụ-nền)).
- `docker-compose.yml` có thêm Redis nhưng **code hiện chưa dùng Redis** (xem [mục 20](#20-hạn-chế-đã-biết-và-hướng-phát-triển)).

**Luồng một đơn tại bàn (QR → bếp → thanh toán):**

1. Khách quét QR của bàn (`/?idtable=<id bàn>`), chọn đăng nhập / đăng ký hoặc tiếp tục không đăng nhập, rồi đặt món ở `/menu` → `/cart`.
2. `POST /api/orders` tạo đơn ở trạng thái `Pending_Grace`, các món ở trạng thái `Hold`; khách được chuyển tới `/order/:id/grace` để hủy / sửa trong 60 giây.
3. Tác vụ nền `graceWorker` (quét mỗi ~2 giây) chuyển đơn hết hạn sang `Confirmed`, món sang `Waiting`, phát `order:new` tới phòng `kds:<chi nhánh>` và `order:confirmed` tới `pos:<chi nhánh>`.
4. Pha chế đổi trạng thái món trên KDS (`Waiting` → `Cooking` → `Ready`); phục vụ nhận thông báo món xong (`kds:update`) để bưng ra.
5. Khách thanh toán online (VNPay / MoMo / SePay) hoặc gọi thanh toán; thu ngân chốt ở POS. Thanh toán xong: trừ kho theo định mức, cộng điểm, cập nhật hạng, giải phóng bàn (`table:cleared`), khách được mời đánh giá.

## 4. Công nghệ sử dụng

| Tầng | Công nghệ (phiên bản theo `package.json` / `requirements.txt`) | Ghi chú |
|---|---|---|
| Frontend | React 19, React Router 7, Vite 6, TypeScript 5.8 | Một ứng dụng cho cả trang khách lẫn khu quản trị `/app/*` |
| Giao diện | lucide-react (icon), recharts 2 (biểu đồ), leaflet (bản đồ giao hàng), html2pdf.js (xuất PDF), date-fns | Song ngữ VI/EN, sáng / tối |
| Nhận diện khuôn mặt | face-api.js 0.22 (mô hình trong `frontend-app/public/models`) | Chấm công FaceID chạy trên trình duyệt |
| Backend | Node.js 22, Express 4, TypeScript, `tsx` (chạy dev) | `npm run build` → `dist/` |
| ORM / CSDL | Prisma 6, MySQL 8 (Docker) | Schema ở `backend-node/prisma/schema.prisma`, 119 model |
| Realtime | Socket.io 4 (server + client) | Phòng theo chi nhánh |
| Xác thực | JWT (`jsonwebtoken`), `bcryptjs`, Google Identity (`google-auth-library`), Facebook Login | JWT riêng cho khách, nhân sự, nhà cung cấp |
| AI | Google Gemini qua `@google/genai` 3 (chat, embedding, đọc ảnh / PDF / âm thanh), `unpdf`, `mammoth` (đọc tài liệu kho tri thức) | Model mặc định `gemini-3.5-flash`, lite `gemini-3.5-flash-lite`, embedding `gemini-embedding-001` |
| Dịch vụ AI phụ | Python 3, FastAPI 0.115, Uvicorn 0.34 | `/recommendations` hiện trả kết quả cố định |
| Thanh toán | VNPay (ký HMAC), MoMo, SePay (`sepay-pg-node`), VietQR | Mặc định môi trường sandbox |
| Khác | `exceljs` (xuất Excel), `multer` (upload ảnh, kiểm magic bytes), `web-push` (thông báo đẩy) | |
| Hạ tầng | Docker Compose (MySQL 8, Redis 7) | Triển khai Railway / VPS: xem [mục 17](#17-triển-khai-railway--cicd) |

## 5. Cấu trúc thư mục

```
.
├── backend-node/              API Express + Prisma + Socket.io
│   ├── prisma/
│   │   ├── schema.prisma      Toàn bộ model CSDL
│   │   ├── sql/               Migration SQL viết tay (001…028) để nâng cấp CSDL đang có dữ liệu
│   │   └── *.ts               Seed & migration dữ liệu (npm run db:*)
│   ├── scripts/               Script kiểm thử AI / thuật toán, seed phụ, fixtures
│   ├── src/
│   │   ├── index.ts           Khởi động: middleware, mount route, socket, tác vụ nền
│   │   ├── routes/            60 file route REST
│   │   ├── lib/               Nghiệp vụ: kho, thanh toán, giao hàng, xếp ca, thông báo…
│   │   ├── ai/                Gemini, AI Agent, kho tri thức (RAG), trợ lý số liệu, cài đặt AI
│   │   ├── games/             Mini game (chọn giải, đổi lượt, trả thưởng)
│   │   ├── socket/            Xử lý vào phòng socket
│   │   ├── middleware/        Xác thực nhân sự / khách
│   │   ├── shared/            Kiểu dữ liệu dùng chung với frontend (alias @shared)
│   │   └── graceWorker.ts     Hết ân hạn 60 giây → đơn xuống bếp
│   └── uploads/               Ảnh người dùng tải lên (tạo khi chạy)
├── frontend-app/              Vite + React
│   ├── public/models/         Mô hình face-api.js
│   └── src/
│       ├── App.tsx            Định tuyến trang khách + /app/* + chuyển hướng URL cũ
│       ├── apps/              registry.tsx (màn quản trị + vai trò), sidebar.ts (nhóm menu)
│       ├── modules/           Màn quản trị theo phân hệ (overview, sales, hr, ai, website…)
│       ├── pages/             Trang khách và các màn nhân sự dạng trang
│       ├── components/        Thành phần dùng chung (erp/, site/, procurement/…)
│       ├── lib/               Gọi API, i18n, tiện ích
│       └── styles/            CSS theo khu vực
├── ai-service-python/         FastAPI gợi ý món (mock)
├── tests/qa/                  Kiểm thử QA bằng script (API + Playwright headless)
├── docs/                      Tài liệu đề tài, hướng dẫn, báo cáo kiểm thử, ảnh chụp
├── md/                        Các prompt dùng khi phát triển cùng trợ lý AI (tham khảo nội bộ)
├── docker-compose.yml         MySQL 8 (cổng host 3307) + Redis 7
├── SOCKET_IO.md               Mô tả socket (bản cũ — xem mục 9 cho bản cập nhật)
├── project_description.md     Mô tả dự án (bản trước khi có chuỗi cửa hàng)
└── td_coffee_feature_overview.md  Tổng quan chức năng (bản trước khi có khu /app)
```

`step_*.json` ở thư mục gốc là nhật ký của một công cụ AI dùng lúc phát triển, không ảnh hưởng ứng dụng.

## 6. Chức năng theo phân hệ

Mã `QTNV-xx` (quy tắc nghiệp vụ) và `YCCN-xx` (yêu cầu chức năng) lấy từ đề tài gốc [`docs/cmn.md`](docs/cmn.md).

### 6.1. Khách hàng (trang web)

| Chức năng | Mô tả | Trang / route |
|---|---|---|
| Đăng ký / đăng nhập | SĐT hoặc email + mật khẩu; Google / Facebook (tự ẩn nút nếu chưa cấu hình); liên kết tài khoản mạng xã hội (YCCN-KH01) | `/login`, `/register`, `/login/phone`, `/login/link`, `/welcome` |
| Vào từ QR bàn | QR trỏ `/?idtable=<id>`; khách có thể tiếp tục không đăng nhập (YCCN-KH02, QTNV-02) | `/` |
| Chọn chi nhánh | Món đang bán, còn / hết, phí giao theo chi nhánh đang chọn; trang giới thiệu từng chi nhánh | `/stores`, `/stores/:id` |
| Thực đơn | Danh mục có ảnh, tìm kiếm, lọc theo chế độ ăn, chi tiết món: size S/M/L, nóng / đá, mức đường, ghi chú, dinh dưỡng, đánh giá (YCCN-KH03) | `/menu`, `/product/:id` |
| Món quen | Gợi ý theo lịch sử 30 ngày + tần suất (QTNV-08) | `/menu`, trang chủ |
| Giỏ hàng | Tại quán / mang về / giao hàng; phí ship theo khoảng cách (tối đa `MAX_DELIVERY_KM`, mặc định 15 km); ghi chú mặc định của khách | `/cart` |
| Ân hạn hủy đơn | Đếm ngược 60 giây được hủy / sửa, khôi phục giỏ (QTNV-01, YCCN-KH04) | `/order/:id/grace` |
| Thanh toán | VNPay, MoMo, SePay / VietQR, gọi thanh toán tại quầy (YCCN-KH05) | `/order/:id/checkout`, `/vnpay-return`, `/order/:id/success` |
| Theo dõi đơn giao | Trạng thái + vị trí shipper realtime | `/order/:id/tracking` |
| Voucher & ưu đãi | Mã giảm giá công khai / cá nhân, ưu đãi theo số lượng, combo | `/promotions`, `/cart` |
| Điểm & hạng | Tích điểm khi đơn đã thanh toán (QTNV-06); hạng theo tổng chi tiêu: Đồng, Bạc (≥ 5 triệu), Vàng (≥ 20 triệu), Kim cương (≥ 50 triệu) (YCCN-KH07) | `/account` |
| Đánh giá | Mỗi đơn đã thanh toán được đánh giá một lần, kèm ảnh (QTNV-07) | sau thanh toán, `/account` |
| Tài khoản | Hồ sơ, địa chỉ giao hàng, lịch sử đơn, voucher, sở thích ăn uống, xoá dữ liệu | `/account`, `/account/:section`, `/data-deletion` |
| Chat | Chat với quán: AI Agent trả lời, chuyển nhân viên khi cần (YCCN-KH06) | khung chat mọi trang |
| Đặt món bằng giọng nói | Nói / gõ câu tự nhiên, AI hiểu thành món (xem 7.3) | `/menu` |
| Nút liên hệ, pop up, banner | Gọi ngay / Zalo / Messenger theo chi nhánh; pop up theo đối tượng; banner trang chủ | mọi trang |
| Mini game | Đổi điểm lấy lượt, quay vòng quay nhận voucher / điểm / quà | `/game/:campaignId` |
| Nội dung | Bài viết / tin khuyến mãi, câu chuyện thương hiệu, liên hệ, chính sách | `/blog`, `/blog/:id`, `/about`, `/contact`, `/policy/:slug`, `/privacy` |
| Giao diện | Song ngữ VI/EN, sáng / tối, ưu tiên điện thoại | toàn site |

### 6.2. Nhân sự theo vai trò

Đăng nhập tại `/staff/login`, sau đó vào khu quản trị `/app/<app>/<màn>`. Danh sách lấy từ `frontend-app/src/apps/registry.tsx`.

Vai trò: **Owner** (Chủ chuỗi), **Admin** (Quản lý chi nhánh), **Cashier** (Thu ngân), **Waiter** (Phục vụ), **Kitchen** (Pha chế), **Warehouse** (Thủ kho), **Shipper** (Giao hàng). Bảng đánh dấu đúng vai trò khai báo cho từng màn; ngoài ra **Owner vào được mọi màn của Admin khi đang chọn một chi nhánh** (`canSee` trong `registry.tsx`).

| Nhóm | Màn hình (đường dẫn `/app/...`) | Owner | Admin | Cashier | Waiter | Kitchen | Warehouse | Shipper |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Tổng quan | Bảng điều khiển `overview/home`, Thông báo `overview/notifications` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Tổng quan | Trợ lý AI `overview/assistant`, Doanh thu, Lợi nhuận, Khiếu nại, Đề xuất chi nhánh | ✓ | ✓ | | | | | |
| Tổng quan | So sánh chi nhánh `overview/compare` | ✓ | | | | | | |
| Bán hàng | Món & giá `sales/products`, Voucher, Đề xuất món, Khách tìm kiếm, Hành vi khách, Khách hàng, Đánh giá | ✓ | ✓ | | | | | |
| Bán hàng | Danh mục, Combo, Ưu đãi số lượng | ✓ | | | | | | |
| Thu ngân | POS `/pos` | | ✓ | ✓ | | | | |
| Bàn | Sơ đồ bàn `tables/floor`, Tin nhắn `tables/chat` | | ✓ | ✓ | ✓ | | | |
| Bàn | Trạng thái món `tables/order-status` | | ✓ | | ✓ | | | |
| Bàn | Bàn & khu vực `tables/zones`, Mã QR `tables/qr` | | ✓ | | | | | |
| Pha chế | KDS `kitchen/kds`, Thống kê pha chế | | ✓ | | | ✓ | | |
| Pha chế | Công thức & giá vốn `kitchen/formulas`, Dinh dưỡng nguyên liệu | ✓ | ✓ | | | | | |
| Kho | Tồn kho, Cần hàng gấp, Kiểm kê, Sổ hao hụt (`inventory/*`) | | ✓ | | | | ✓ | |
| Kho | Chuyển kho `inventory/transfers` | | | | | | ✓ | |
| Mua hàng | Mua hàng `purchase/orders` | | ✓ | | | | ✓ | |
| Mua hàng | Nhà cung cấp `purchase/suppliers` | ✓ | | | | | ✓ | |
| Tài chính | Két & quỹ, Phiếu thu chi, Báo cáo ca (`finance/*`) | ✓ | ✓ | ✓ | | | | |
| Tài chính | Báo cáo cuối ngày `finance/daily` | | ✓ | | | | | |
| Tài chính | Công nợ NCC, Lãi lỗ | ✓ | ✓ | | | | | |
| Giao hàng | Trạng thái đơn giao `delivery/orders` | | ✓ | ✓ | | | | |
| Giao hàng | Màn shipper `delivery/shipper` | | | | | | | ✓ |
| Nhân sự | Nhân viên, Gửi thông báo, Cảnh báo chấm công, Cấu hình ca & chấm công | ✓ | ✓ | | | | | |
| Nhân sự | Xếp lịch tháng `hr/schedule` (nhân viên xem dạng "Bảng lịch tổng") | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Nhân sự | Giao việc, Bảng lương, Duyệt đơn từ | | ✓ | | | | | |
| Nhân sự | Việc được giao, Lịch cá nhân, Đơn từ của tôi | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Nhân sự | Nguyện vọng xếp ca, Ca trống cần người | | | ✓ | ✓ | ✓ | ✓ | ✓ |
| Nhân sự | Chấm công, Phiếu lương của tôi, Tài khoản của tôi | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| CRM | Mini game, Trúng thưởng, Pop up, Quà tặng hiện vật, Liên hệ từ khách | ✓ | ✓ | | | | | |
| AI | AI Agents, Kho tri thức | ✓ | ✓ | | | | | |
| AI | Bảng điều khiển AI (bật / tắt, hạn mức, lịch sử) | ✓ | | | | | | |
| Website | Banner | ✓ | ✓ | | | | | |
| Website | Bài đăng, Giao diện, Câu chuyện thương hiệu, Thông tin công ty | ✓ | | | | | | |
| Cấu hình | Chi nhánh, Nút liên hệ, Nhật ký hệ thống | ✓ | ✓ | | | | | |
| Cấu hình | Cài đặt chung `settings/store` | ✓ | | | | | | |

Quản lý chi nhánh vào được các màn thao tác ca (POS, sơ đồ bàn, KDS, trạng thái món, chat, đơn giao) để hỗ trợ; sidebar gom các màn này vào nhóm "Vận hành ca".

### 6.3. Vận hành

| Chức năng | Mô tả |
|---|---|
| POS | Tạo đơn tại quầy, gọi món bằng giọng nói, áp voucher / điểm, thu tiền mặt (tính tiền thừa, làm tròn — QTNV-04, YCCN-TN03) / chuyển khoản QR / thẻ, in hoá đơn (YCCN-TN04), mở / đóng ca két (YCCN-TN01, QTNV-05) |
| Sơ đồ bàn | Bàn theo khu vực, trạng thái realtime, order hộ khách, gộp bàn, chuyển bàn, dọn bàn, gọi thanh toán (YCCN-PV01–PV04; chưa có tách bàn) |
| KDS | Món theo thứ tự ưu tiên (QTNV-09), chuyển trạng thái, báo phục vụ khi xong (YCCN-PC01–PC03), ghi hao hụt |
| Trạng thái món / tin nhắn | Phục vụ theo dõi món đã xong, trả lời chat khách (YCCN-PV05) |
| Két & quỹ | Phiên két, phiếu thu chi, báo cáo ca, báo cáo cuối ngày |
| Giao hàng | Điều phối đơn cho shipper (tác vụ nền), shipper nhận đơn, cập nhật vị trí, khách theo dõi trên bản đồ, hoàn tiền đơn hủy |

### 6.4. Kho và mua hàng

| Chức năng | Mô tả |
|---|---|
| Tồn kho theo chi nhánh | Nguyên liệu dùng chung, tồn riêng từng chi nhánh, cảnh báo sắp hết (`inventory:low`) |
| Lô hàng | Phiếu nhập theo lô, hết hạn trước xuất trước |
| Định mức | Công thức nguyên liệu theo size S/M/L, quy đổi đơn vị; bán một ly trừ kho theo định mức; giá vốn món tính từ định mức |
| Kiểm kê, hao hụt | Phiếu kiểm kê, sổ hao hụt (QTNV-10, YCCN-PC04, YCCN-QL04) |
| Cần hàng gấp, chuyển kho | Chi nhánh xin hàng, chuyển kho giữa chi nhánh |
| Mua hàng | Đề nghị mua → yêu cầu báo giá → báo giá NCC → đơn mua → nhận hàng (đọc hoá đơn bằng AI) → hàng về thiếu (nhắc tự động) → trả hàng NCC → công nợ |
| Cổng nhà cung cấp | `/supplier`: NCC đăng nhập xem yêu cầu báo giá, gửi báo giá, theo dõi đơn |

### 6.5. Nhân sự và lương

| Chức năng | Mô tả |
|---|---|
| Nhân viên & phân quyền | Tạo tài khoản, vai trò, chi nhánh (YCCN-QL01) |
| Cấu hình ca | Ca mẫu (giờ, màu), định biên theo vị trí, quy tắc chấm công, nghỉ tối thiểu giữa 2 ca, số ca tối đa / tuần, hạn gửi nguyện vọng |
| Xếp lịch tháng | Tự xếp bằng thuật toán (tham lam + tìm kiếm cục bộ) theo định biên, nghỉ phép, nguyện vọng nhân viên; so sánh nhiều phương án; công bố lịch |
| Nguyện vọng xếp ca | Nhân viên viết nguyện vọng tự nhiên, AI chuyển thành ràng buộc; quản lý xem bản đồ nhiệt (xem 7.8) |
| Ca trống, ca bổ sung | Ca trống mời nhân viên nhận (ai bấm trước được ca), ca bổ sung vài tiếng tính như làm thêm |
| Đơn từ | Xin nghỉ, đổi ca, làm thêm / về sớm / đi muộn, giải trình chấm công; quản lý duyệt |
| Chấm công | Check-in GPS (bán kính chi nhánh) + nhận diện khuôn mặt (face-api.js), cảnh báo đi muộn / về sớm |
| Giao việc | Việc trong ngày, nhân viên báo xong kèm ảnh bằng chứng, quản lý duyệt / yêu cầu làm lại |
| Lương | Bảng lương tháng của chi nhánh, phiếu lương cá nhân |
| Thông báo | Trung tâm thông báo, gửi thông báo theo vai trò / chi nhánh, thông báo đẩy (Web Push) |

### 6.6. Bán hàng và marketing

| Chức năng | Mô tả |
|---|---|
| Món, danh mục, combo | Món có size, nóng / đá, ảnh; danh mục có ảnh; combo (YCCN-QL02) |
| Món theo chi nhánh | Chi nhánh bật / tắt món, báo hết; hết nguyên liệu thì tự ẩn món (giá bán dùng chung cả chuỗi) |
| Đề xuất món | Pha chế đề xuất món mới, AI phác thảo (xem 7.5), Chủ chuỗi duyệt |
| Voucher, ưu đãi số lượng | Voucher công khai / cá nhân theo chi nhánh; ưu đãi theo số lượng (đợt sales) |
| Mini game, pop up | Chiến dịch vòng quay theo chi nhánh, giải voucher / điểm / quà hiện vật; pop up theo đối tượng |
| Website | Bài đăng, banner, giao diện dịp lễ, thông tin công ty, câu chuyện thương hiệu, hồ sơ chi nhánh |
| Khách hàng | Hồ sơ khách: thói quen, tần suất quay lại, lịch sử (Owner / Admin) |
| Khách tìm kiếm | Từ khoá khách tìm, món quán chưa có → gợi ý món mới |
| Hành vi khách | Phễu xem → thêm giỏ → đặt, món xem nhiều ít mua, bỏ giỏ, màn hình, nguồn, thiết bị, giờ × thứ (không lưu IP / toạ độ; bật / tắt và số ngày lưu trong cài đặt) |

### 6.7. Báo cáo và tổng quan

| Chức năng | Mô tả |
|---|---|
| Bảng điều khiển | Theo vai trò: số liệu hôm nay của chính nhân viên, hàng chờ, KPI chi nhánh |
| Doanh thu, lợi nhuận, lãi lỗ | Theo khoảng ngày, chi nhánh; xuất Excel (YCCN-QL06) |
| So sánh chi nhánh | Chủ chuỗi so sánh các chi nhánh |
| Đánh giá, khiếu nại | Xem / phản hồi đánh giá (YCCN-QL05), khiếu nại khách |
| Nhật ký hệ thống | Ghi lại thao tác quan trọng của nhân sự |

## 7. Tính năng AI

Tất cả gọi Gemini **từ backend** (khoá không bao giờ gửi xuống trình duyệt — `backend-node/src/ai/gemini.ts`). Chủ chuỗi bật / tắt từng tính năng và đặt hạn mức ngày / giờ ở **AI › Bảng điều khiển AI** (bảng `AI_Settings`, danh sách trong `AI_FEATURES` của `backend-node/src/ai/settings.ts`). Tính năng đang tắt hoặc thiếu khoá: API trả `503 { unavailable }`, giao diện ẩn nút và dùng đường thay thế.

| Tính năng (mã trong `AI_FEATURES`) | Nơi dùng | Khi không có AI |
|---|---|---|
| AI Agent tư vấn (chat web) | Khung chat khách; quản lý ở AI › AI Agents | Chuyển nhân viên trả lời |
| Trợ lý hỏi số liệu (`ANALYST`) | `/app/overview/assistant` | Ẩn mục menu |
| Gọi / đặt món bằng giọng nói (`VOICE_ORDER_POS`, `VOICE_ORDER_WEB`) | POS, sơ đồ bàn, `/menu` | Chọn món bằng tay |
| Đọc hoá đơn NCC (`INVOICE_OCR`) | Nhận hàng theo đơn mua | Nhập tay |
| Gợi ý dinh dưỡng nguyên liệu (`NUTRITION_ASSIST`) | Pha chế › Dinh dưỡng nguyên liệu | Nhập tay |
| Câu gợi ý món theo thời tiết (`WEATHER_PICKS`) | Trang chủ khách | Câu mẫu theo luật |
| AI phác thảo món mới (`MENU_DRAFT`) | Bán hàng › Đề xuất món, Khách tìm kiếm | Đề xuất tay |
| Hiểu nguyện vọng xếp ca (`SHIFT_WISH_AI`) | Nhân sự › Nguyện vọng xếp ca | Form chọn tay |
| Giải thích kết quả xếp ca (`SHIFT_EXPLAIN_AI`) | Nhân sự › Xếp lịch tháng | Mẫu câu theo mã |

### 7.1. AI Agent tư vấn + kho tri thức (RAG)

- **Mục đích:** trả lời khách trên khung chat web (món, giá, khuyến mãi, chi nhánh, đơn hàng, dinh dưỡng), chuyển nhân viên khi cần.
- **Cách hoạt động** (`src/ai/agent/engine.ts`): mỗi lượt lấy tài liệu liên quan từ kho tri thức → gọi Gemini có **công cụ (function calling)** tra dữ liệu thật: `tra_cuu_mon`, `tra_cuu_combo`, `khuyen_mai_hien_tai`, `thong_tin_chi_nhanh`, `trang_thai_don`, `tra_dinh_duong`, `tim_mon_theo_che_do_an`, `tim_kien_thuc`, `tim_tren_web`, `chuyen_nhan_vien`. Giá, món còn / hết, giờ mở cửa luôn tra từ CSDL, không nằm trong tài liệu.
- **Kho tri thức** (`src/ai/knowledge/`): tải tài liệu (văn bản, PDF, Word, bảng hỏi – đáp) → cắt đoạn → embedding `gemini-embedding-001` (768 chiều). Tìm kiếm **lai**: vector (cosine) + BM25 trên chữ bỏ dấu, gộp bằng Reciprocal Rank Fusion (k = 60). Thiếu khoá / Gemini lỗi → chỉ tìm theo từ khoá.
- **Quản lý:** AI Agents (lời chào, giờ hoạt động, kho tri thức gắn kèm, trả lời nhanh), Kho tri thức, Bảng điều khiển AI (lịch sử chạy, chi phí ước tính theo token, đánh giá câu trả lời).
- **Dữ liệu mẫu:** `npm run db:knowledge`. **Kiểm thử:** `npm run test:chunk` (cắt đoạn + từ khoá, không cần Gemini).

### 7.2. Trợ lý AI hỏi số liệu (analyst)

- **Mục đích:** Chủ chuỗi / Quản lý chi nhánh hỏi bằng tiếng Việt ("Top 5 món tuần này", "So sánh doanh thu 2 chi nhánh"), nhận câu trả lời kèm bảng / biểu đồ.
- **Cách hoạt động** (`src/ai/analyst/`): Gemini chọn công cụ truy vấn có sẵn — `revenue_summary`, `profit_summary`, `top_products`, `product_trend`, `compare_periods`, `inventory_status`, `waste_summary`, `cash_issues`, `attendance_summary`, `reviews_summary`, `complaints_summary`, `search_demand`, `customer_behavior`, `list_stores`. Số liệu do code tính, AI chỉ diễn đạt; quản lý chi nhánh chỉ hỏi được chi nhánh của mình.
- **Kiểm thử:** `npx tsx scripts/testAnalyst.ts` (`--no-ai`: chỉ đối chiếu số / phân quyền). Ảnh: `docs/screenshots/tro-ly-ai/`.

### 7.3. Gọi / đặt món bằng giọng nói

- **Nơi dùng:** POS và sơ đồ bàn (nhân viên), `/menu` (khách). `POST /api/voice-order/parse`.
- **Cách hoạt động** (`src/lib/voiceOrder/`): gửi âm thanh (hoặc câu gõ) + thực đơn chi nhánh cho Gemini → món, số lượng, size, nóng / đá, đường, ghi chú; món không có trong thực đơn được báo riêng; người dùng xác nhận trước khi thêm vào giỏ. Model mặc định là model lite (`VOICE_ORDER_MODEL` để đổi). Giới hạn theo phiên / IP / ngày cho web khách.
- **Kiểm thử:** `npx tsx scripts/testVoiceOrder.ts 1` (`--audio` thêm file ghi âm trong `scripts/fixtures/voice`) → [`docs/qa/voice-order-ket-qua.md`](docs/qa/voice-order-ket-qua.md). Ảnh: `docs/screenshots/dat-mon-giong-noi/`.

### 7.4. Đọc hoá đơn nhà cung cấp khi nhận hàng (OCR)

- **Nơi dùng:** Mua hàng › nhận hàng theo đơn mua (`POST /api/purchasing/orders/:id/...`).
- **Cách hoạt động** (`src/lib/invoiceOcr/`): chụp ảnh / tải PDF hoá đơn → Gemini đọc dòng hàng, số lượng, đơn giá, số hoá đơn → code khớp với đơn mua (tên gọi khác của NCC, quy đổi đơn vị), hiện bảng 2 cột để thủ kho xác nhận. PDF dạng ảnh chỉ đọc khi `AI_PDF_OCR=true`.
- **Kiểm thử:** `npx tsx scripts/seedInvoiceDemo.ts 1` rồi `npx tsx scripts/testInvoiceOcr.ts` → [`docs/qa/invoice-ocr-ket-qua.md`](docs/qa/invoice-ocr-ket-qua.md). Ảnh: `docs/screenshots/doc-hoa-don/`.

### 7.5. AI phác thảo món mới

- **Nơi dùng:** từ từ khoá khách tìm mà quán chưa có, hoặc ý tưởng của nhân viên (Bán hàng › Đề xuất món / Khách tìm kiếm).
- **Cách hoạt động** (`src/lib/menuDraft/`): Gemini đưa 2–3 phương án (tên, mô tả, định mức S/M/L chọn từ nguyên liệu có trong kho, cách pha). **AI không ghi giá** — giá vốn tính từ định mức × giá nhập, giá bán gợi ý theo tỉ lệ giá vốn của danh mục. Chủ chuỗi duyệt mới thành món.
- **Kiểm thử:** `npx tsx scripts/testMenuDraft.ts 1 --md` → [`docs/qa/menu-draft-ket-qua.md`](docs/qa/menu-draft-ket-qua.md). Ảnh: `docs/screenshots/mon-moi-ai/`.

### 7.6. Dinh dưỡng ước tính

- **Cách hoạt động** (`src/lib/nutrition/`): AI gợi ý dinh dưỡng cho từng nguyên liệu (quản lý duyệt) → code tính dinh dưỡng món theo size từ công thức → nhãn caffeine / đường / dị ứng, lọc theo chế độ ăn, tổng caffeine trong giỏ, sở thích ăn uống của khách.
- **Kiểm thử:** `npx tsx scripts/testNutrition.ts --suggest`, `npx tsx scripts/recomputeNutrition.ts --md` → [`docs/qa/nutrition-bang-mon.md`](docs/qa/nutrition-bang-mon.md). Ảnh: `docs/screenshots/dinh-duong/`.

### 7.7. Gợi ý theo thời tiết, món quen, dịch vụ Python

- **"Hợp thời tiết hôm nay"** (`src/lib/weatherPicks.ts`): thời tiết từ Open-Meteo theo toạ độ chi nhánh → code chọn món theo luật (nóng / mưa / sáng / tối) → AI viết câu dẫn ngắn (mất mạng / tắt AI → câu mẫu). `GET /api/home/weather-picks`. Kiểm thử: `npx tsx scripts/testWeatherPicks.ts 1 --ai`.
- **Món quen** (`src/lib/customerHabits.ts`, QTNV-08): code thuần theo lịch sử 30 ngày + tần suất. Kiểm thử: `npm run test:habits`.
- **Dịch vụ Python** (`ai-service-python/main.py`): `GET /recommendations?customer_id=` **hiện trả cố định 3 món** (mock), backend gọi qua `AI_SERVICE_URL` làm phương án dự phòng.

### 7.8. Nguyện vọng xếp ca + thuật toán xếp lịch

- **Nguyện vọng** (`SHIFT_WISH_AI`, `src/lib/shiftWish/parse.ts`): nhân viên viết "Tháng 12 em đi học sáng thứ 3, thứ 5… 24/12 em xin nghỉ…" → Gemini chuyển thành ràng buộc (không thể / muốn / hạn chế / tối đa – tối thiểu số ca / nghỉ cố định) kèm câu gốc → code kiểm tra (mã ca, ngày trong tháng, khung giờ) → nhân viên sửa và xác nhận. Quản lý xem bản đồ nhiệt ngày × ca × vị trí, nhắc người chưa gửi.
- **Xếp lịch** (`src/lib/autoSchedule.ts`) — **thuật toán, không phải AI**: tham lam xếp ô khó trước, sau đó tìm kiếm cục bộ (hoán đổi / chuyển / thay người) giảm hàm chi phí gồm phạt nguyện vọng, độ lệch số ca, chỗ thiếu người; có seed nên chạy lại ra cùng kết quả. Ràng buộc cứng: nghỉ phép, "không thể", nghỉ tối thiểu giữa 2 ca, số ca tối đa / tuần.
- **Giải thích** (`SHIFT_EXPLAIN_AI`): AI diễn đạt mã lý do thành câu cho quản lý và từng nhân viên; mọi con số trong câu được code đối chiếu với số liệu, sai thì dùng mẫu câu.
- **Kiểm thử:** `npx tsx scripts/testShiftWish.ts --md` (12 câu mẫu → [`docs/qa/shift-wish-ket-qua.md`](docs/qa/shift-wish-ket-qua.md)), `npx tsx scripts/testAutoSchedule.ts` (50 bộ dữ liệu, 0 vi phạm cứng), `npx tsx scripts/testAutoScheduleWishes.ts --md` (so sánh 3 phương án → [`docs/qa/auto-schedule-ket-qua.md`](docs/qa/auto-schedule-ket-qua.md)).

### 7.9. Model và biến cấu hình

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `GEMINI_API_KEY` | (trống) | Khoá Gemini (aistudio.google.com). Trống: mọi tính năng AI tắt, hệ thống vẫn chạy |
| `GEMINI_CHAT_MODEL` | `gemini-3.5-flash` | Model chính |
| `GEMINI_LITE_MODEL` | `gemini-3.5-flash-lite` | Model nhẹ; model chính quá tải / hết hạn mức (429, 500, 503) thì các tính năng tự chuyển sang model này |
| `GEMINI_EMBED_MODEL` | `gemini-embedding-001` | Embedding kho tri thức |
| `GEMINI_EMBED_DIM` | `768` | Số chiều vector — đổi thì bấm "Xử lý lại" tài liệu |
| `AI_PDF_OCR` | `false` | `true`: PDF dạng ảnh cũng nhờ Gemini đọc |
| `VOICE_ORDER_MODEL` | model lite | Model cho đặt món bằng giọng nói |
| `AI_PRICE_INPUT_USD_PER_M`, `AI_PRICE_OUTPUT_USD_PER_M`, `AI_USD_VND` | `0.3`, `2.5`, `26000` | Đơn giá để ước tính chi phí AI trên bảng điều khiển |

Mọi lời gọi có thử lại khi Gemini báo 429 / 500 / 503 (`withRetry`, lùi 1 s, 2 s, 4 s…) và ghi nhật ký vào `AI_Call_Logs` để đếm hạn mức.

## 8. Cơ sở dữ liệu

MySQL 8, quản lý bằng Prisma (`backend-node/prisma/schema.prisma`, **119 model**). Bảng và cột đặt tên kiểu `Order_Details`, `Order_ID` (ánh xạ bằng `@@map` / `@map`).

### 8.1. Nhóm model

| Nhóm | Model chính |
|---|---|
| Chuỗi & cấu hình | `Store`, `StoreSettings`, `StoreProduct`, `StoreInventory`, `Zone`, `CafeTable`, `BrandSection` |
| Thực đơn | `Category`, `Product`, `ProductFormula`, `Combo`, `ComboItem`, `IngredientNutrition`, `ProductNutrition`, `MenuProposal` |
| Khách hàng | `Customer`, `CustomerIdentity`, `CustomerAuthLog`, `CustomerAddress`, `PointTransaction`, `Review`, `CustomerEvent`, `SearchLog`, `SearchTermDismissal` |
| Đơn hàng & thanh toán | `Order`, `OrderDetail`, `Payment` |
| Khuyến mãi & mini game | `Voucher`, `UserVoucher`, `VoucherStore`, `BulkPromotion` (+ `Tier`, `Store`, `Category`, `Product`), `GameCampaign`, `GameCampaignStore`, `GamePrize`, `GameTicket`, `GamePlay`, `GiftItem`, `GiftStock`, `GiftClaim`, `Popup`, `PopupStore` |
| Kho | `InventoryItem`, `InventoryTransaction`, `StockReceipt`, `InventoryBatch`, `InventoryRequest`, `StockRequest`, `StockTransfer`, `StockTransferItem`, `InventoryCount`, `InventoryCountLine`, `WasteLog`, `ShiftInventoryLog` |
| Mua hàng | `Supplier`, `PurchaseRequisition` (+ `Item`), `RequestForQuotation`, `SupplierQuote` (+ `Item`), `PurchaseOrder`, `PurchaseOrderCancel`, `GoodsReceipt` (+ `Item`), `SupplierReturn` (+ `Item`), `SupplierBill`, `SupplierCredit`, `SupplierUnitAlias`, `InvoiceExtraction` |
| Tài chính | `Shift` (ca két), `SafeSession`, `CashEntry` |
| Nhân sự | `Staff`, `WorkSchedule`, `ShiftTemplate`, `StaffingRule`, `HrConfig`, `ShiftWish`, `ShiftWishRule`, `ScheduleMonth`, `ScheduleRun`, `LeaveRequest`, `ShiftSwapRequest`, `WorkRequest`, `AttendanceAdjustment`, `WorkTask`, `WorkTaskAssignee`, `PayrollConfig`, `Payslip`, `BranchProposal` |
| Thông báo & liên hệ | `Notification`, `NotificationRecipient`, `PushSubscription`, `ChatSession`, `ChatMessage`, `ChatReaction`, `ContactButton`, `ContactClick`, `ContactMessage`, `CustomerMessage`, `Banner`, `Post`, `AuditLog` |
| AI | `KnowledgeBase`, `KnowledgeDocument`, `KnowledgeChunk`, `AiAgent`, `AiAgentKnowledgeBase`, `AiAgentBinding`, `AiQuickReply`, `AiRunLog`, `AiSetting`, `AiCallLog`, `AnalystConversation`, `AnalystMessage` |

### 8.2. ERD rút gọn (lõi bán hàng)

```mermaid
erDiagram
  Store ||--o{ Zone : "có"
  Store ||--o{ CafeTable : "có"
  Zone ||--o{ CafeTable : "gồm"
  Store ||--o{ Staff : "nhân viên"
  Store ||--o{ StoreProduct : "bán"
  Product ||--o{ StoreProduct : "giá / bật tắt"
  Category ||--o{ Product : "gồm"
  Product ||--o{ ProductFormula : "định mức"
  InventoryItem ||--o{ ProductFormula : "nguyên liệu"
  Store ||--o{ StoreInventory : "tồn"
  InventoryItem ||--o{ StoreInventory : "tồn"
  Store ||--o{ Order : "nhận"
  Customer |o--o{ Order : "đặt"
  CafeTable |o--o{ Order : "tại bàn"
  Staff |o--o{ Order : "tạo / giao"
  Order ||--|{ OrderDetail : "gồm"
  Product ||--o{ OrderDetail : "món"
  Order ||--o{ Payment : "thanh toán"
  Staff ||--o{ Shift : "ca két"
  Shift |o--o{ Payment : "thu trong ca"
  Order ||--o{ Review : "đánh giá"
  Customer ||--o{ PointTransaction : "điểm"
```

### 8.3. Tạo CSDL mới

Dùng `prisma db push` (tạo đủ bảng theo schema) rồi seed — xem [mục 10.2](#102-lần-đầu-chạy). Không cần chạy các file `prisma/sql/`.

### 8.4. Nâng cấp CSDL đang có dữ liệu

Các file `backend-node/prisma/sql/NNN_*.sql` là migration viết tay, **mỗi file chạy đúng một lần, theo thứ tự số**. Hiện có `001` → `028`; **không có `023` và `024`** (hai số này thuộc tính năng chưa đưa vào nhánh). Dừng backend trước (để `prisma generate` không bị khoá file trên Windows) và sao lưu:

```bash
# Thư mục: backend-node/
docker exec cmn-mysql mysqldump -uroot -proot --single-transaction coffee_shop_db > ../backup_truoc_nang_cap.sql
```

**Chuyển CSDL cũ (trước khi có chuỗi cửa hàng) sang chuỗi** — chỉ làm một lần, dữ liệu cũ thành Chi nhánh #1:

```bash
# Thư mục: backend-node/
# ID đơn hàng tự tăng (MySQL không cho db push đổi cột có khoá ngoại)
docker exec cmn-mysql mysql -uroot -proot coffee_shop_db -e "SET FOREIGN_KEY_CHECKS=0; ALTER TABLE Orders MODIFY Order_ID INT NOT NULL AUTO_INCREMENT; ALTER TABLE Order_Details MODIFY Detail_ID INT NOT NULL AUTO_INCREMENT; SET FOREIGN_KEY_CHECKS=1;"
for f in prisma/sql/001_*.sql prisma/sql/002_*.sql prisma/sql/003_*.sql prisma/sql/004_*.sql; do
  docker exec -i cmn-mysql mysql -uroot -proot --default-character-set=utf8mb4 coffee_shop_db < "$f"
done
npx prisma generate
npm run db:owner         # tạo Chủ chuỗi owner / owner123 (đổi bằng OWNER_PASSWORD) nếu chưa có
npm run db:seed-store2   # Chi nhánh #2 mẫu + thủ kho "kho" cho Chi nhánh #1
```

**Các file tiếp theo** — chạy những file chưa chạy (Git Bash / macOS / Linux):

```bash
# Thư mục: backend-node/  — ví dụ chạy từ 021 đến 028
for f in prisma/sql/02{1,2,5,6,7,8}_*.sql; do
  docker exec -i cmn-mysql mysql -uroot -proot --default-character-set=utf8mb4 coffee_shop_db < "$f"
done
npx prisma generate
```

PowerShell: `Get-Content prisma\sql\027_shift_wishes.sql -Raw | docker exec -i cmn-mysql mysql -uroot -proot --default-character-set=utf8mb4 coffee_shop_db` (từng file).

| File | Nội dung |
|---|---|
| `001`–`004` | Chuỗi cửa hàng: bảng `Stores`, cột `Store_ID`, tồn kho theo chi nhánh, dọn cài đặt, phiếu yêu cầu |
| `005`–`011` | Đánh giá theo món, chat đã đọc, nhật ký FaceID, ca bổ sung (+ nhóm), tin nhắn khách, ảnh bằng chứng |
| `012`–`014` | Kho tri thức (RAG), AI Agent tư vấn, trạng thái phiên AI |
| `015` | Bật / tắt tính năng AI (`AI_Settings`), Trợ lý hỏi số liệu |
| `016` | Đặt món bằng giọng nói: tên gọi khác của món, nhật ký gọi AI |
| `017` | Đọc hoá đơn NCC, số hoá đơn trên phiếu nhập, quy đổi đơn vị |
| `018` | Nhật ký gọi AI lưu câu nghe được + tóm tắt |
| `019` | Dinh dưỡng nguyên liệu / món, sở thích ăn uống của khách |
| `020` | Đề xuất món: định mức nháp, giá vốn ước tính, bản AI phác thảo |
| `021` | Trang câu chuyện thương hiệu (`Brand_Sections`), hồ sơ giới thiệu chi nhánh — sau đó `npm run seed:brand` |
| `022` | Ảnh danh mục (`Categories.Image_URL`) — sau đó `npm run db:site` |
| `025` | Ghi chú mặc định của khách (`Customers.Default_Note`) |
| `026` | Hành vi khách (`Customer_Events`), công tắc ghi nhận + số ngày lưu |
| `027` | Nguyện vọng xếp ca (`Shift_Wishes`, `Shift_Wish_Rules`), `Schedule_Months`, hạn gửi nguyện vọng |
| `028` | Lưu các lần chạy tự xếp lịch (`Schedule_Runs`), lần chạy đang áp dụng |

### 8.5. Script dữ liệu (`backend-node/package.json`)

| Lệnh | Làm gì | Ghi đè dữ liệu? |
|---|---|---|
| `npm run db:seed` | Dữ liệu gốc: Chi nhánh #1, danh mục, món, kho, bàn, khách mẫu, 6 tài khoản nhân sự | **Có — xoá sạch đơn, khách, kho, món… rồi tạo lại.** Chỉ chạy trên CSDL mới |
| `npm run db:seed-store2` | Chi nhánh #2: khu vực, 10 bàn (ID 101–110), 6 nhân viên, tồn kho ban đầu; thủ kho `kho` cho CN1 | Không, chạy lại được |
| `npm run db:seed-staff` | Bổ sung nhân viên đủ định biên mọi chi nhánh (4 thu ngân, 19 phục vụ, 6 pha chế, 5 giao hàng, 3 thủ kho; tên / SĐT ngẫu nhiên) | Không, chỉ thêm phần thiếu |
| `npm run db:seed-formulas` | Định mức S/M/L cho toàn bộ món nước, bổ sung nguyên liệu, tính lại giá vốn | **Ghi đè định mức** các món trong danh sách |
| `npm run db:lots` | Gộp lô hàng cũ (`Inventory_Batches`) sang `Stock_Receipts`, cân lại số còn của lô | Chạy lại được |
| `npm run db:cakes` | Bánh / đồ ăn: món 1 loại, tạo nguyên liệu "(Cái)" và công thức 1:1 | Chạy lại được |
| `npm run db:owner` | Tạo Chủ chuỗi `owner` (mật khẩu `OWNER_PASSWORD`, mặc định `owner123`) nếu chưa có | Không |
| `npm run db:knowledge` | Kho tri thức mẫu "TD Coffee – Chung" (3 tài liệu + 15 câu hỏi – đáp); có khoá thì tạo embedding | Không |
| `npm run db:games` | Chiến dịch "Vòng quay tháng 11" (8 ô) + 40 lượt quay mẫu | Không |
| `npm run games:sim` | Kiểm tra tỉ lệ giải: quay 200 lượt trên chiến dịch tạm rồi dọn | Không (tự dọn) |
| `npm run db:popups` | 3 pop up mẫu | Không |
| `npm run db:contacts` | Nút liên hệ mặc định + hotline riêng CN2 | Không |
| `npm run db:site` | Ảnh danh mục còn trống, thay link ảnh món đã chết, 3 banner | Không ghi đè phần đã sửa |
| `npm run db:promos` | 10 voucher, 3 ưu đãi số lượng, 6 bài khuyến mãi (gia hạn nếu đã có) | Gia hạn, không đổi lượt đã dùng |
| `npm run seed:brand` | 15 mục câu chuyện thương hiệu + hồ sơ mọi chi nhánh (`-- --force` để ghi đè) | Không (trừ `--force`) |
| `npm run db:tracking` | ~2.000 phiên / 30 ngày cho trang "Hành vi khách" | Xoá dữ liệu mẫu cũ (`seed-*`) rồi sinh lại |
| `npm run db:clear-oos` | Bỏ cờ hết hàng kiểu cũ trên món | Có (chỉ cờ cũ) |
| `npm run db:push` / `db:generate` | `prisma db push` / `prisma generate` | — |
| `npx tsx scripts/seedSuppliers.ts` | 7 nhà cung cấp mẫu | Upsert |

## 9. Realtime (Socket.io)

Socket.io chạy chung cổng với backend. Client gửi `socket.emit("join", "<phòng>")`; server kiểm tra quyền (`backend-node/src/socket/handlers.ts`). Phòng vận hành **tách theo chi nhánh**: nhân viên vào `kds` thực tế được đưa vào `kds:<storeId>` của chi nhánh mình.

| Phòng | Ai vào | Sự kiện chính (server → client) |
|---|---|---|
| `kds:<storeId>` | Pha chế | `order:new`, `order:updated`, `inventory:low`, `menu:availability` |
| `pos:<storeId>` | Thu ngân | `order:pending_grace`, `order:confirmed`, `order:updated`, `payment:request`, `payment:done`, `table:cleared`, `delivery:new`, `delivery:update`, `shipper:location`, `menu:availability` |
| `staff:<storeId>` | Phục vụ, nhân viên | `kds:update`, `kds:ready`, `kds:served`, `payment:done`, `table:cleared`, `openshift:update`, `menu:availability`, `chat:reply`, `chat:escalate`, `chat:read`, `chat:ai_state`, `chat:session_closed` |
| `admin_room:<storeId>` | Owner / Admin | `schedule:updated`, `hr:request`, `complaint:new`, `complaint:update`, `inventory:low`, `kitchen:waste`, `task:update`, `kb:doc_status`, `chat:reply` (khiếu nại) |
| `staff_<id>` | Đúng nhân viên đó | `notify:new`, `notify:recalled`, `hr:reviewed`, `schedule:updated` (và các sự kiện lịch khác), `shipper:new_order`, `shipper:refresh`, `analyst:status` |
| `order:<id>` | Chủ đơn hoặc nhân viên cùng chi nhánh | `payment:success`, `order:refunded` |
| `tracking:<id>` | Chủ đơn hoặc nhân viên cùng chi nhánh | `delivery:status`, `delivery:location` |
| `chat:<phiên>:<mã bí mật>` | Khách của phiên chat | `chat:reply` và trạng thái phiên chat |

`voucher:new` phát cho mọi kết nối. Tài liệu cũ hơn (phòng chưa tách chi nhánh, còn nhắc Redis / `CORS_ORIGIN`): [`SOCKET_IO.md`](SOCKET_IO.md).

## 10. Cài đặt và chạy local

### 10.1. Yêu cầu

- Node.js 22 (đã kiểm với 22.19) và npm 10
- Docker Desktop (MySQL 8 + Redis)
- Python 3.11 (chỉ cần cho `ai-service-python`, tuỳ chọn)
- Git; trên Windows dùng PowerShell hoặc Git Bash

### 10.2. Lần đầu chạy

```bash
git clone https://github.com/MinTrieTruong/cnm_coffee.git
cd cnm_coffee
git checkout feat/chain-stores

# 1) CSDL — thư mục gốc
docker compose up -d                 # MySQL (cổng host 3307) + Redis
```

```bash
# 2) Backend — thư mục backend-node/
cp .env.example .env                 # PowerShell: Copy-Item .env.example .env
npm install
npx prisma generate
npx prisma db push                   # tạo bảng theo schema
npm run db:seed                      # dữ liệu gốc (XOÁ dữ liệu cũ — chỉ chạy trên CSDL mới)
npm run db:seed-store2               # Chi nhánh #2
npm run db:seed-staff                # đủ nhân viên để tự xếp lịch
npm run db:seed-formulas             # định mức + giá vốn
npm run db:knowledge                 # kho tri thức cho AI tư vấn
npm run db:games && npm run db:popups && npm run db:contacts && npm run db:site && npm run db:promos
npm run seed:brand                   # trang câu chuyện thương hiệu
npm run db:tracking                  # (tuỳ chọn) dữ liệu mẫu "Hành vi khách"
npm run dev                          # thấy "API + Socket.io: http://localhost:4000"
```

```bash
# 3) Frontend — thư mục frontend-app/ (terminal khác)
npm install
npm run dev                          # http://localhost:5173
```

```bash
# 4) Dịch vụ AI Python (tuỳ chọn) — thư mục ai-service-python/
python -m venv .venv
.venv\Scripts\activate               # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000
```

Kiểm tra: `curl http://localhost:4000/api/health` → `{"ok":true,"service":"cmn-coffee-backend","database":"up"}`; `curl http://localhost:8000/health` → `{"ok":true,"service":"ai-service-python"}`.

Muốn dùng AI: điền `GEMINI_API_KEY` trong `backend-node/.env` rồi khởi động lại backend (`npm run db:knowledge` lần nữa để tạo embedding).

### 10.3. Chạy hằng ngày

Mở Docker Desktop trước, rồi 3–4 terminal:

```bash
docker start cmn-mysql cmn-redis     # thư mục bất kỳ; lần đầu thì dùng docker compose up -d
cd backend-node && npm run dev
cd frontend-app && npm run dev
cd ai-service-python && uvicorn main:app --port 8000   # tuỳ chọn
```

> **Cảnh báo:** không dùng `docker rm -f cmn-mysql` hay `docker compose down -v` — xoá container / volume là **mất toàn bộ dữ liệu**. Không chạy `npx prisma migrate reset` hay `db push --force-reset`.

### 10.4. Địa chỉ sau khi chạy

| Dịch vụ | Địa chỉ |
|---|---|
| Web (khách + quản trị) | http://localhost:5173 |
| API + Socket.io | http://localhost:4000 (`/api/...`) |
| AI Python | http://localhost:8000 |
| MySQL | `localhost:3307`, user `coffee` / `coffee123`, root / `root`, CSDL `coffee_shop_db` |

**Mở trên điện thoại cùng mạng Wi-Fi:** Vite đã bật `host: true`, mở `http://<IP máy tính>:5173`. Camera (chấm công FaceID, quét QR) và micro (đặt món bằng giọng nói) chỉ chạy trên **HTTPS** hoặc `localhost`; repo có cài `@vitejs/plugin-basic-ssl` nhưng **chưa bật** trong `vite.config.ts`. Cách đơn giản: dùng một đường hầm HTTPS (ví dụ ngrok tới cổng 5173 — `allowedHosts` đã mở), hoặc thêm `basicSsl()` vào `plugins` khi cần thử.

## 11. Biến môi trường

### 11.1. `backend-node/.env`

| Tên | Bắt buộc? | Giá trị mẫu / mặc định | Ý nghĩa | Thiếu thì sao |
|---|---|---|---|---|
| `DATABASE_URL` | Có | `mysql://coffee:coffee123@localhost:3307/coffee_shop_db?connect_timeout=30&pool_timeout=30&connection_limit=10` | Kết nối MySQL | Backend thoát khi khởi động |
| `PORT` | Không | `4000` | Cổng API + Socket.io | Dùng 4000 |
| `JWT_SECRET` | Có khi deploy | `change-me-in-production` | Ký JWT khách / nhân sự / NCC | Dùng `dev-secret-change-me` (không an toàn) |
| `PUBLIC_APP_URL` | Khi deploy | `http://localhost:5173` | URL web công khai: link QR bàn, URL trả về VNPay / MoMo / SePay | Dùng localhost |
| `FRONTEND_URL` | Không | `http://localhost:5173` | Link phiên mang về khi request không có header Origin | Dùng localhost |
| `AI_SERVICE_URL` | Không | `http://localhost:8000` | Dịch vụ gợi ý Python | Dùng localhost:8000 |
| `GEMINI_API_KEY` và các biến AI | Không | xem [mục 7.9](#79-model-và-biến-cấu-hình) | AI | Tắt tính năng AI |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Không | tạo bằng `npx web-push generate-vapid-keys` | Thông báo đẩy | Không gửi được thông báo đẩy |
| `GOOGLE_CLIENT_ID` | Không | | Đăng nhập Google (xem [`docs/social-login-setup.md`](docs/social-login-setup.md)) | Ẩn nút Google |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | Không | | Đăng nhập Facebook | Ẩn nút Facebook |
| `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET` | Khi dùng VNPay | | Mã website + khoá ký VNPay | Không tạo được link VNPay |
| `VNPAY_URL` | Không | `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html` | Cổng VNPay | Dùng sandbox |
| `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY` | Khi dùng MoMo | | Thông tin đối tác MoMo | Không tạo được giao dịch |
| `MOMO_ENDPOINT` | Không | `https://test-payment.momo.vn/v2/gateway/api/create` | API MoMo | Dùng môi trường test |
| `MOMO_IPN_URL` | Không | `<PUBLIC_APP_URL>/api/momo/ipn` | URL MoMo gọi báo kết quả | Tự suy ra |
| `SEPAY_MERCHANT_ID`, `SEPAY_SECRET_KEY` | Khi dùng SePay | | Cổng SePay | Không tạo được hoá đơn |
| `SEPAY_ENV` | Không | `sandbox` | `sandbox` / `production` | sandbox |
| `VIETQR_BANK_ID`, `VIETQR_ACCOUNT_NO`, `VIETQR_ACCOUNT_NAME` | Khi dùng chuyển khoản QR | `mbbank`, —, `TD Coffee` | Tài khoản nhận chuyển khoản hiện trên mã VietQR | Thiếu số tài khoản → QR không dùng được (lưu ý: route VNPay có số tài khoản mặc định trong code) |
| `MAX_DELIVERY_KM` | Không | `15` | Bán kính giao hàng tối đa | 15 km |
| `BIZ_TZ_OFFSET_MIN` | Không | `420` | Múi giờ kinh doanh (phút, UTC+7) cho báo cáo | UTC+7 |
| `OWNER_PASSWORD` | Không | `owner123` | Mật khẩu Chủ chuỗi khi chạy `db:owner` | owner123 |
| `NODE_ENV` | Không | `development` / `production` | Mức log Prisma | — |
| `SOCIAL_TEST_SECRET` | Không | | Chỉ dùng khi `NODE_ENV=test` để giả lập đăng nhập MXH trong kiểm thử | — |

**Biến có trong code nhưng chưa có trong `.env.example`:** `PUBLIC_APP_URL`, `FRONTEND_URL`, `AI_SERVICE_URL`, `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_URL`, `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY`, `MOMO_ENDPOINT`, `MOMO_IPN_URL`, `SEPAY_MERCHANT_ID`, `SEPAY_SECRET_KEY`, `SEPAY_ENV`, `VIETQR_BANK_ID`, `VIETQR_ACCOUNT_NO`, `VIETQR_ACCOUNT_NAME`, `MAX_DELIVERY_KM`, `BIZ_TZ_OFFSET_MIN`, `VOICE_ORDER_MODEL`, `AI_PRICE_INPUT_USD_PER_M`, `AI_PRICE_OUTPUT_USD_PER_M`, `AI_USD_VND`, `OWNER_PASSWORD`, `SOCIAL_TEST_SECRET`.

**Có trong `.env.example` nhưng code không đọc:** `STORE_NAME` (tên quán lấy từ cài đặt trong CSDL), `CORS_ORIGIN` (backend đang cho mọi origin: `cors({ origin: true })`).

### 11.2. `frontend-app/.env`

| Tên | Bắt buộc? | Ý nghĩa |
|---|---|---|
| `VITE_API_URL` | Chỉ khi build / deploy mà API khác tên miền | URL API công khai. Khi `npm run dev`, frontend gọi `/api` qua proxy của Vite nên bỏ qua biến này |
| `VITE_GOOGLE_CLIENT_ID`, `VITE_FACEBOOK_APP_ID` | Không | ID công khai cho nút đăng nhập; bỏ trống thì lấy từ `GET /api/auth/providers` của backend |

## 12. Tài khoản demo

Sau khi chạy đủ seed ở [mục 10.2](#102-lần-đầu-chạy) (đã kiểm tra đăng nhập được):

| Vai trò | Tài khoản | Mật khẩu | Chi nhánh | Vào |
|---|---|---|---|---|
| Khách hàng | `0900000000` | `123456` | — | `/login` → `/menu` |
| Chủ chuỗi (Owner) | `owner` | `staff123` (tạo bởi `db:seed`) hoặc `owner123` (tạo bởi `db:owner` trên CSDL nâng cấp) | Cả chuỗi | `/staff/login` |
| Quản lý chi nhánh | `admin` / `admin2` | `staff123` | CN1 / CN2 | `/staff/login` |
| Thu ngân | `cashier` / `cashier2` | `staff123` | CN1 / CN2 | `/pos` |
| Phục vụ | `waiter` / `waiter2` | `staff123` | CN1 / CN2 | `/app/tables/floor` |
| Pha chế | `kitchen` / `kitchen2` | `staff123` | CN1 / CN2 | `/app/kitchen/kds` |
| Thủ kho | `kho` / `kho2` | `staff123` | CN1 / CN2 | `/app/inventory/stock` |
| Giao hàng | `shipper2` (CN2); CN1 dùng tài khoản `SP_…` do `db:seed-staff` sinh (xem ở Nhân sự › Nhân viên) | `staff123` | CN2 / CN1 | `/app/delivery/shipper` |
| Nhà cung cấp | Không có sẵn — Chủ chuỗi đặt tên đăng nhập / mật khẩu khi tạo NCC ở Mua hàng › Nhà cung cấp | | | `/supplier` |

Quên mật khẩu trên máy dev: chạy lại `npm run db:seed` (xoá dữ liệu) hoặc đặt lại từng tài khoản ở Nhân sự › Nhân viên. Đổi mật khẩu mặc định trước khi deploy.

## 13. Các trang chính

| URL | Mô tả | Ai dùng |
|---|---|---|
| `/` | Trang chủ, đích của QR bàn (`/?idtable=<id>`) | Khách |
| `/menu`, `/product/:id` | Thực đơn, chi tiết món | Khách |
| `/cart` | Giỏ hàng, chọn hình thức nhận | Khách |
| `/order/:id/grace`, `/order/:id/checkout`, `/order/:id/success`, `/order/:id/tracking` | Ân hạn, thanh toán, kết quả, theo dõi giao | Khách |
| `/promotions`, `/blog`, `/about`, `/stores`, `/contact` | Khuyến mãi, tin tức, thương hiệu, chi nhánh, liên hệ | Khách |
| `/account`, `/account/:section` | Tài khoản khách | Khách đã đăng nhập |
| `/game/:campaignId` | Mini game | Khách đã đăng nhập |
| `/supplier` | Cổng nhà cung cấp | Nhà cung cấp |
| `/staff/login` | Đăng nhập nhân sự | Mọi nhân sự |
| `/app/overview/home` | Bảng điều khiển theo vai trò | Mọi nhân sự |
| `/pos` | Thu ngân | Cashier, Admin |
| `/app/tables/floor` | Sơ đồ bàn | Waiter, Cashier, Admin |
| `/app/kitchen/kds` | Màn hình pha chế | Kitchen, Admin |
| `/app/delivery/shipper` | Giao hàng | Shipper |
| `/app/hr/attendance` | Chấm công | Mọi nhân sự |
| `/app/<app>/<màn>` | Các màn quản trị khác — xem bảng [6.2](#62-nhân-sự-theo-vai-trò) | Theo vai trò |

URL cũ vẫn chuyển hướng: `/admin?tab=…` → màn tương ứng trong `/app`, `/kds` → `/app/kitchen/kds`, `/staff/tables` → `/app/tables/floor`, `/staff/inventory` → `/app/inventory/stock`, `/staff/schedule` → `/app/hr/my-schedule`, …

## 14. API

Toàn bộ API dưới tiền tố `/api` — **484 endpoint trong 60 file route**. Danh mục đầy đủ (phương thức, đường dẫn, middleware) sinh tự động từ mã nguồn bằng `node docs/scripts/gen-api.mjs`: [`docs/api.md`](docs/api.md).

**Xác thực:** header `Authorization: Bearer <JWT>`.
- **Khách:** `POST /api/auth/login` (`{ login, password }`), đăng ký `POST /api/auth/register`, Google / Facebook / liên kết tài khoản ở `/api/auth/google`, `/api/auth/facebook`, `/api/auth/providers`, `/api/auth/identities`. Khách vãng lai xem đơn bằng header `X-Order-Session` / `X-Table-Id`.
- **Nhân sự:** `POST /api/staff/login` (`{ username, password }`) trả JWT kèm vai trò. Chủ chuỗi chọn chi nhánh bằng header `X-Store-Id` (bỏ trống = tất cả chi nhánh).
- **Nhà cung cấp:** `POST /api/supplier/login`.

| Tiền tố chính | File | Chức năng |
|---|---|---|
| `/api/auth`, `/api/staff` | `auth` (+ `socialAuth` gắn bên trong), `staffAuth` | Đăng nhập / đăng ký khách, nhân sự, Google / Facebook |
| `/api/menu…`, `/api/store-config`, `/api/categories`, `/api/products/:id/extras`, `/api/stores`, `/api/home/weather-picks` | `menu`, `catalog`, `stores`, `home` | Thực đơn, danh mục, chi nhánh, gợi ý thời tiết (công khai) |
| `/api/orders…`, `/api/kds/…`, `/api/takeaway/new`, `/api/staff/tables/…`, `/api/kitchen/…` | `orders`, `staffOps`, `kitchen` | Đặt món, ân hạn, KDS, phiên mang về, thao tác bàn, quầy pha chế |
| `/api/pos`, `/api/shifts`, `/api/cash` | `pos`, `shifts`, `cash` | Thu ngân, ca két, sổ quỹ |
| `/api/orders/:id/vnpay/…`, `/api/orders/:id/momo/create`, `/api/orders/:id/sepay/…`, `/api/orders/:id/vietqr` | `vnpay`, `momo`, `sepay` | Thanh toán online + **webhook**: `GET /api/vnpay/ipn`, `POST /api/momo/ipn`, `POST /api/sepay/ipn` |
| `/api/delivery…`, `/api/customer-addresses` | `delivery`, `addresses` | Giao hàng, địa chỉ khách |
| `/api/customer`, `/api/reviews`, `/api/chat…` | `customer`, `reviews`, `chat` | Tài khoản khách, đánh giá, chat |
| `/api/vouchers`, `/api/promotions…`, `/api/combos…`, `/api/games…`, `/api/popups…` | `vouchers`, `promotions`, `combo`, `games`, `popups` | Khuyến mãi, mini game, pop up |
| `/api/admin…` | `admin`, `customerInsights`, `reports`, `auditLog`, `supplier`, `stockTransfer`, `formula` | Quản trị: món, bàn, nhân viên, báo cáo, nhật ký, NCC, chuyển kho, định mức |
| `/api/purchasing…`, `/api/supplier…`, `/api/inventory-counts`, `/api/stock-requests` | `procurement`, `invoiceOcr`, `inventoryCounts`, `stockRequests` | Mua hàng, cổng NCC, đọc hoá đơn, kiểm kê, cần hàng gấp |
| `/api/schedule`, `/api/shift-wishes`, `/api/hr…`, `/api/attendance`, `/api/tasks`, `/api/payroll` | `schedule`, `shiftWishes`, `hrConfig`, `hrRequests`, `attendance`, `tasks`, `payroll` | Nhân sự, xếp lịch, nguyện vọng, đơn từ, chấm công, giao việc, lương |
| `/api/notifications…`, `/api/staff/me…` | `notifications`, `myStats` | Thông báo, số liệu cá nhân |
| `/api/ai…`, `/api/knowledge…`, `/api/analyst…`, `/api/voice-order/parse` | `aiAgents`, `aiDashboard`, `knowledge`, `analyst`, `voiceOrder` | AI |
| `/api/posts`, `/api/site-info`, `/api/site/brand`, `/api/admin/brand/…`, `/api/contact-buttons` | `posts`, `site`, `brand`, `contactButtons` | Website, banner, thương hiệu, nút liên hệ |
| `/api/menu-proposals`, `/api/branch-proposals`, `/api/search-log`, `/api/track`, `/api/behavior-insights`, `/api/nutrition/…` | `menuProposals`, `branchProposals`, `searchInsights`, `tracking`, `nutrition` | Đề xuất, phân tích tìm kiếm / hành vi khách, dinh dưỡng |
| `/api/health` | `index.ts` | Kiểm tra sống + kết nối CSDL |

Lỗi trả về dạng `{ "error": "câu tiếng Việt" }`; tính năng AI tắt trả `503 { "unavailable": true, "reason": "…" }`.

## 15. Kiểm thử

### 15.1. Kiểm thử QA (`tests/qa`)

Script Node chạy trên **backend TEST cổng 4100** với CSDL riêng (mặc định `cmn_test`), không đụng CSDL dev. Báo cáo: [`docs/qa/test-report.md`](docs/qa/test-report.md).

```bash
# Thư mục: tests/qa/
npm install                                   # playwright-core (dùng Edge có sẵn, không tải trình duyệt)
# Backend test (terminal khác, thư mục backend-node/): DATABASE_URL trỏ CSDL cmn_test, PORT=4100, rồi npm run dev
node 01-routes-inventory.mjs                  # danh mục route → output/routes.json, liệt kê route không có xác thực
node 02-authz-probe.mjs                       # dò phân quyền
npm run customer                              # 03 đặt món phía khách
npm run pos                                   # 04 POS, két, voucher, mini game
npm run security                              # 05 phân quyền nhân sự, bảo mật
npm run realtime                              # 06 socket
npm run inventory                             # 07 kho, báo cáo, hiệu năng
npm run ui                                    # 08 giao diện: cần build frontend với VITE_API_URL=http://localhost:4100 + vite preview :4173
```

Biến: `QA_API` (mặc định `http://localhost:4100`), `QA_DB` (mặc định `cmn_test`), `QA_WEB` (mặc định `http://localhost:4173`), `QA_BROWSER` (mặc định `msedge`), `QA_ONLY` (chạy một số nhóm).

### 15.2. Kiểm thử AI và thuật toán (`backend-node/scripts`)

| Lệnh (thư mục `backend-node/`) | Cần | Kết quả |
|---|---|---|
| `npm run test:chunk` | — | Cắt đoạn + tìm từ khoá kho tri thức |
| `npm run test:habits` | CSDL | Thói quen / món quen của khách |
| `npx tsx scripts/testAnalyst.ts [--no-ai]` | CSDL (+ Gemini) | Trợ lý hỏi số liệu |
| `npx tsx scripts/testVoiceOrder.ts 1 [--audio]` | CSDL + Gemini | [`docs/qa/voice-order-ket-qua.md`](docs/qa/voice-order-ket-qua.md) |
| `npx tsx scripts/testInvoiceOcr.ts` | CSDL + Gemini, chạy `seedInvoiceDemo.ts` trước | [`docs/qa/invoice-ocr-ket-qua.md`](docs/qa/invoice-ocr-ket-qua.md) |
| `npx tsx scripts/testMenuDraft.ts 1 --md [--no-ai]` | CSDL (+ Gemini) | [`docs/qa/menu-draft-ket-qua.md`](docs/qa/menu-draft-ket-qua.md) |
| `npx tsx scripts/testNutrition.ts [--suggest]`, `recomputeNutrition.ts --md` | CSDL (+ Gemini) | [`docs/qa/nutrition-bang-mon.md`](docs/qa/nutrition-bang-mon.md) |
| `npx tsx scripts/testWeatherPicks.ts 1 [--ai]` | CSDL (+ Gemini) | 5 tình huống thời tiết |
| `npx tsx scripts/testShiftWish.ts --md [--no-ai]` | (Gemini) | [`docs/qa/shift-wish-ket-qua.md`](docs/qa/shift-wish-ket-qua.md) |
| `npx tsx scripts/testAutoSchedule.ts` | — | 50 bộ dữ liệu: 0 vi phạm cứng, chi phí không tăng, tái lập theo seed |
| `npx tsx scripts/testAutoScheduleWishes.ts --md` | — | [`docs/qa/auto-schedule-ket-qua.md`](docs/qa/auto-schedule-ket-qua.md) |
| `npm run games:sim` | CSDL | Tỉ lệ giải vòng quay |

Kiểm tra kiểu: `npx tsc --noEmit -p .` ở `backend-node/` và `frontend-app/`; `npm run build` ở `frontend-app/` (chạy `tsc -b` + `vite build`).

## 16. Tác vụ nền

Khởi động cùng backend (`backend-node/src/index.ts`):

| Tác vụ | Làm gì |
|---|---|
| `startGraceWorker` | Đơn hết ân hạn 60 giây → `Confirmed`, đẩy xuống KDS |
| `startDispatchWorker` | Điều phối đơn giao cho shipper |
| `startOpenShiftJob` | Mời nhân viên nhận ca trống, nhắc quản lý khi chưa ai nhận |
| `startShiftWishReminder` | 3 ngày trước hạn gửi nguyện vọng xếp ca, nhắc người chưa gửi |
| `startBackorderReminder` | Nhắc hàng nhà cung cấp giao thiếu |
| `startGiftClaimExpiryJob` | Hết hạn mã nhận quà mini game |
| `startNotificationCleanup`, `startSearchLogCleanup`, `startCustomerEventCleanup`, `startAiLogCleanup` | Dọn dữ liệu cũ (thông báo 90 ngày, nhật ký tìm kiếm / hành vi / AI theo cấu hình) |
| `resumeKnowledgeQueue`, `resumeAiReplies` | Tiếp tục xử lý tài liệu / tin nhắn AI dở dang sau khi khởi động lại |

## 17. Triển khai (Railway + CI/CD)

> **Áp dụng sau khi merge PR #3** (nhánh `claude/project-thread-h7md37`). Các file deploy (`Dockerfile`, `Caddyfile`, `.github/workflows/*`, `deploy/*`, `docs/trien-khai.md`) **chưa có trên nhánh này**; hướng dẫn từng bước nằm ở [`docs/trien-khai.md` trong PR #3](https://github.com/MinTrieTruong/cnm_coffee/blob/claude/project-thread-h7md37/docs/trien-khai.md).

**Kiến trúc trên Railway** — 4 service, một tên miền:

| Service | Lấy từ | Vai trò | Ra Internet |
|---|---|---|---|
| `MySQL` | Database của Railway | CSDL | Không |
| `backend` | `backend-node/` (Dockerfile) | API + Socket.io + tác vụ nền; ảnh upload lưu trên **Volume**; health check `/api/health` | Không |
| `ai` | `ai-service-python/` (Dockerfile) | Gợi ý món | Không |
| `web` | `frontend-app/` (Dockerfile + Caddy) | Phục vụ giao diện React, chuyển `/api`, `/uploads`, `/socket.io` sang `backend` qua mạng nội bộ | Có |

```
Khách ──HTTPS──► web (Caddy) ──┬─ /, /menu, ...               ─► file React
                               └─ /api, /uploads, /socket.io  ─► backend.railway.internal:4000 ─► MySQL, ai
```

**CI/CD:** `git push main` → GitHub Actions `CI` (backend: `prisma validate`, `prisma generate`, `npm run build`; frontend: `vite build`, `tsc -b`; AI: cài requirements, import thử) → Railway bật "Wait for CI" tự build Dockerfile từng service và deploy; CI đỏ thì giữ bản cũ.

**Biến cần khai báo** (chi tiết trong PR #3): `backend` — `DATABASE_URL` (tham chiếu MySQL của Railway), `JWT_SECRET`, `PUBLIC_APP_URL`, `AI_SERVICE_URL`, khoá Gemini / thanh toán / VAPID / đăng nhập MXH nếu dùng; `web` — `SITE_ADDRESS`, `BACKEND_UPSTREAM`, `VITE_API_URL`; `ai` — `HOST`, `PORT`.

**Chi phí ước tính** (theo PR #3): gói Hobby 5 USD/tháng + phần dùng thêm, tổng khoảng 8–12 USD/tháng; nên đặt Usage Limit khoảng 20 USD.

**Phương án dự phòng VPS:** `deploy/docker-compose.prod.yml` (MySQL + backend + ai + web Caddy tự cấp HTTPS), `.github/workflows/deploy-vps.yml` (deploy qua SSH), `deploy/backup-db.sh` (sao lưu CSDL). Xem thêm [`docs/huong-dan-thue-vps.md`](docs/huong-dan-thue-vps.md), [`docs/trien-khai-ten-mien.md`](docs/trien-khai-ten-mien.md).

**Cần kiểm tra lại khi merge PR #3** (PR dựng trên `main` cũ):
- `frontend-app/Dockerfile` build với ngữ cảnh chỉ thư mục `frontend-app`, nhưng code hiện import `@shared` từ `../backend-node/src/shared` (trang câu chuyện thương hiệu) → cần đổi ngữ cảnh build về thư mục gốc hoặc chép `shared` vào.
- Backend container chạy `prisma db push` khi khởi động — phù hợp CSDL mới; CSDL production đã có dữ liệu cần chạy các file `prisma/sql/` như [mục 8.4](#84-nâng-cấp-csdl-đang-có-dữ-liệu).
- CI chỉ chạy cho `main`, trong khi nhánh phát triển là `feat/chain-stores`.
- PR #3 cũng sửa `README.md` → sẽ xung đột với README này.

## 18. Lỗi thường gặp

| Dấu hiệu | Cách sửa |
|---|---|
| `docker compose up` báo cổng 3307 (hoặc 6379) đã bị dùng | Tắt dịch vụ đang chiếm cổng, hoặc đổi cổng host trong `docker-compose.yml` và sửa `DATABASE_URL` cho khớp |
| `error during connect` / Docker không chạy | Mở Docker Desktop, đợi trạng thái Running rồi chạy lại |
| Backend in `Database: connection failed` hoặc `/api/health` trả `database: down` | `docker start cmn-mysql`; kiểm tra `DATABASE_URL` (cổng 3307, user `coffee` / `coffee123`) |
| `prisma db push` lỗi đổi cột có khoá ngoại (ID tự tăng) | Chạy lệnh `ALTER TABLE … AUTO_INCREMENT` với `FOREIGN_KEY_CHECKS=0` như [mục 8.4](#84-nâng-cấp-csdl-đang-có-dữ-liệu), hoặc chạy file SQL tương ứng thay vì `db push` |
| `prisma generate` báo `EPERM … query_engine-windows.dll.node` (Windows) | Backend đang chạy giữ file — dừng `npm run dev` rồi chạy lại |
| `prisma db push` cảnh báo mất dữ liệu | Dừng lại, sao lưu, dùng file SQL trong `prisma/sql/`; không thêm `--accept-data-loss` / `--force-reset` trên dữ liệu thật |
| Không đăng nhập được tài khoản demo | Chưa chạy seed, hoặc token cũ: DevTools → Application → Local Storage → xoá `cmn_staff_token`, `cmn_staff_info` |
| Nút "AI đọc giúp", trợ lý AI… không hiện; API trả `503 unavailable` | Thiếu `GEMINI_API_KEY`, hoặc tính năng đang tắt / hết hạn mức ở AI › Bảng điều khiển AI |
| Gemini báo 429 "exceeded your current quota" | Hết hạn mức của khoá: các tính năng tự chuyển sang model lite / mẫu câu; đợi hoặc đổi khoá |
| Nút đăng nhập Google / Facebook không hiện | Thiếu `GOOGLE_CLIENT_ID` / `FACEBOOK_APP_ID` (backend in cảnh báo `[social-login]` khi khởi động) — xem [`docs/social-login-setup.md`](docs/social-login-setup.md) |
| Camera (FaceID, quét QR) hoặc micro không chạy trên điện thoại | Trình duyệt chỉ cho dùng trên HTTPS / localhost — xem [mục 10.4](#104-địa-chỉ-sau-khi-chạy) |
| Frontend báo lỗi mạng, trang trắng khi gọi API | Backend chưa chạy ở cổng 4000 (proxy Vite trỏ `127.0.0.1:4000`); bản build thì kiểm tra `VITE_API_URL` |
| Realtime không cập nhật (KDS không nhận đơn) | Kiểm tra backend đang chạy và tab console không lỗi socket; đơn chỉ xuống KDS **sau 60 giây ân hạn** |
| Thanh toán online lỗi chữ ký / không quay về | Kiểm tra khoá VNPay / MoMo / SePay và `PUBLIC_APP_URL`; IPN cần URL công khai (localhost không nhận được) |
| Ảnh món mẫu không hiện | Link ảnh mẫu đã chết: `npm run db:site` thay link mới |

## 19. Tài liệu liên quan

| Tài liệu | Nội dung |
|---|---|
| [`docs/cmn.md`](docs/cmn.md) | Đề tài gốc: Chương 1–2, quy tắc nghiệp vụ QTNV, yêu cầu chức năng YCCN, ERD, use case |
| [`docs/api.md`](docs/api.md) | Danh mục 484 endpoint (sinh tự động từ mã nguồn) |
| [`SOCKET_IO.md`](SOCKET_IO.md) | Mô tả socket ban đầu (đã cũ — bản cập nhật ở mục 9) |
| [`project_description.md`](project_description.md) | Mô tả dự án, use case, luồng chính (bản trước chuỗi cửa hàng) |
| [`td_coffee_feature_overview.md`](td_coffee_feature_overview.md) | Tổng quan chức năng (bản trước khu `/app`) |
| [`docs/minigame-architecture.md`](docs/minigame-architecture.md) | Kiến trúc mini game |
| [`docs/social-login-setup.md`](docs/social-login-setup.md) | Cấu hình đăng nhập Google / Facebook |
| [`docs/trien-khai-ten-mien.md`](docs/trien-khai-ten-mien.md) | Gắn tên miền |
| [`docs/huong-dan-thue-vps.md`](docs/huong-dan-thue-vps.md) | Thuê và chuẩn bị VPS |
| [`docs/customer-ui-progress.md`](docs/customer-ui-progress.md) | Tiến độ giao diện khách |
| [`docs/prompt-ai-chatbot.md`](docs/prompt-ai-chatbot.md) | Thiết kế AI chatbot |
| [`docs/qa/test-report.md`](docs/qa/test-report.md) | Báo cáo kiểm thử QA (26 lỗi đã sửa) |
| [`docs/qa/`](docs/qa/) | Kết quả kiểm thử AI / thuật toán (giọng nói, hoá đơn, món mới, dinh dưỡng, nguyện vọng, xếp ca) |
| [`docs/screenshots/`](docs/screenshots/), [`docs/erp-phase1/`](docs/erp-phase1/), [`docs/mobile-nav/`](docs/mobile-nav/) | Ảnh chụp màn hình |

## 20. Hạn chế đã biết và hướng phát triển

- **Dịch vụ AI Python là mock:** `/recommendations` trả cố định 3 món; gợi ý thật đang làm trong backend (món quen, thời tiết).
- **Redis chưa dùng:** có trong `docker-compose.yml` nhưng backend không kết nối; ân hạn 60 giây dùng tác vụ nền quét CSDL.
- **Mini game:** schema có các loại `SCRATCH`, `MYSTERY_BOX`, `STAMP`, `MISSION`, `QUIZ`, `SEASONAL`, nhưng **hiện mới cài vòng quay (`WHEEL`)**; thẻ cào, hộp quà… đang phát triển.
- **SePay** chưa thử với tài khoản SePay thật (xem báo cáo QA); thanh toán mặc định sandbox.
- **ID khách / nhân viên** cấp kiểu `max + 1` (có thử lại khi trùng); chuyển sang `AUTO_INCREMENT` cần migration.
- **Migration** dùng file SQL viết tay + `db push` thay vì `prisma migrate`.
- **HTTPS khi dev** chưa bật sẵn (xem 10.4); `.env.example` còn thiếu nhiều biến (xem 11.1).
- Hướng phát triển: kênh Zalo / Messenger cho AI Agent (bộ máy đã tách khỏi web), gợi ý món cá nhân hoá thật ở dịch vụ Python, merge PR #3 để có CI/CD và bản demo công khai.

## 21. Tác giả và giấy phép

- Sinh viên thực hiện: `<họ tên, MSSV>`
- Giảng viên hướng dẫn: `<họ tên>`
- Trường / khoa: `<tên trường, khoa>`
- Giấy phép: **chưa khai báo** (repo chưa có file `LICENSE`).
