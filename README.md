# Hệ thống quán cà phê CMN

Web app đặt món (mobile-first), API Node.js + Prisma (MySQL), gợi ý món qua Python FastAPI, Docker (MySQL + Redis). Luồng **QR**: trỏ tới trang chủ (`/`) — đăng nhập / đăng ký hoặc **Tiếp tục không đăng nhập** → `/menu`.

## Cấu trúc

| Thư mục | Vai trò |
|---------|---------|
| `frontend-app/` | Vite + React (`/`, `/menu`, `/account`, `/cart`, `/kds`, `/pos`, `/admin`, `/staff/tables`, …) |
| `backend-node/` | Express + Prisma + Socket.io |
| `ai-service-python/` | `GET /recommendations?customer_id=` (mock Top 3) |
| `SOCKET_IO.md` | Mô tả phòng và sự kiện real-time |
| `docs/cmn.md` | Bản Markdown đầy đủ từ đề tài (Chương 1–2, YCNV, ERD, UC) |

## Đã hiện thực theo `docs/cmn.md` (tóm tắt)

- **CSDL / ERD:** `Customers` (điểm, hạng, đăng nhập SĐT), `Staffs` (username/role), `Tables` (QR), `Orders` (`Pending_Grace`, `Grace_Ends_At`, `Session_ID` takeaway), `Order_Details` (KDS `Hold` → `Waiting`/`Cooking`/`Ready`), `Shifts`, `Payments`, `Reviews`, `Requests`, mở rộng `Products`/`Inventory`/`Categories`.
- **QTNV-01 ân hạn 60s:** Chốt đơn → `Pending_Grace`, KDS **không** nhận; worker ~2s đổi `Confirmed` + đẩy socket `order:new`. Khách hủy trong 60s → `Cancelled`, khôi phục giỏ từ backup.
- **Món quen (QTNV-08):** Top gợi ý theo lịch sử **30 ngày** + tần suất (fallback AI + món hot).
- **Đăng nhập:** Khách: SĐT/email + mật khẩu (`/api/auth/*`). Nhân sự: `/api/staff/login` (JWT + role) — demo: `kitchen` / `cashier` / `admin` / `waiter`, mật khẩu `staff123`.
- **Ca két (YCCN-TN01):** `/api/shifts/open`, `/api/shifts/close` (cần Bearer staff Cashier/Admin).
- **Chat bot tối thiểu (YCCN-KH06):** `/api/chat` (wifi, WC; còn lại escalate socket `chat:escalate`).
- **Đánh giá (API):** `POST /api/reviews` (sau khi đơn `Paid`).

**Giao diện:** `/admin` (Admin — thống kê, CRUD, kho, phiếu NL, đánh giá, cài đặt VAT/điểm, CSV), `/pos` (Cashier/Admin — ca, thanh toán VAT/điểm), `/staff/tables` (Waiter — yêu cầu thanh, gộp đơn), chat nổi trên `/menu`.

**Có thể mở rộng:** VietQR thật, tách bàn phức tạp, OTP quên mật khẩu, báo cáo Excel ngoài CSV, v.v.

## Chạy project (dễ thao tác)

### 0) Yêu cầu
- Cài Docker Desktop (khuyến nghị), Node.js 20+.
- Mở Docker Desktop trước khi chạy lệnh.

### 1) Chạy lần đầu (copy-paste theo thứ tự)

**Terminal 1 - database (MySQL + Redis):**
```bash
cd d:\cmn-cs
docker compose up -d
docker ps
```

**Terminal 2 - backend:**
```bash
cd d:\cmn-cs\backend-node
copy .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

**Terminal 3 - frontend:**
```bash
cd d:\cmn-cs\frontend-app
copy .env.example .env
npm install
npm run dev
```

Mở: `http://localhost:5173`

### 2) Chạy hằng ngày (sau lần đầu)

**Terminal 1:**
```bash
cd d:\cmn-cs
docker compose up -d
```

**Terminal 2:**
```bash
cd d:\cmn-cs\backend-node
npm run dev
```

**Terminal 3:**
```bash
cd d:\cmn-cs\frontend-app
npm run dev
```

### 3) Tài khoản demo

- **Khách hàng:** `0900000000` / `123456`
- **Nhân sự (mật khẩu chung):** `staff123`
  - `admin` -> `/admin`
  - `cashier` -> `/pos`
  - `waiter` -> `/staff/tables`
  - `kitchen` -> `/kds`

### 4) Nếu không đăng nhập được `admin`

Chạy lại seed để reset tài khoản demo:
```bash
cd d:\cmn-cs\backend-node
npm run db:seed
```

Nếu vẫn lỗi, xóa dữ liệu đăng nhập cũ trên trình duyệt:
- DevTools -> Application -> Local Storage -> `http://localhost:5173`
- Xóa `cmn_staff_token` và `cmn_staff_info`, rồi đăng nhập lại.

### 5) AI service (tùy chọn)

Chỉ cần khi muốn gợi ý món từ service Python:
```bash
cd d:\cmn-cs\ai-service-python
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Thêm vào `backend-node/.env`:
```bash
AI_SERVICE_URL=http://localhost:8000
```

### 6) Ghi chú nhanh

- MySQL dùng cổng host `3307` (mapping `3307 -> 3306`).
- Nếu Docker báo `dockerDesktopLinuxEngine` hoặc không kết nối được: mở Docker Desktop và chờ trạng thái running.
- Nếu máy đã có MySQL riêng ở cổng `3306`, cứ giữ nguyên vì project dùng cổng `3307`.

## QR code

In QR trỏ tới URL công khai của bạn, ví dụ `https://your-domain.com/` hoặc `https://your-domain.com/?table=3`. (Tham số `table` có thể đọc thêm ở frontend để gán `tableId` khi chốt đơn.)

## Dữ liệu mẫu

Seed khớp menu / kho / đơn demo bạn cung cấp; ảnh món lưu tại cột `Image_URL` (URL Unsplash). Đổi ảnh bằng cách cập nhật DB hoặc chỉnh `prisma/seed.ts`.

## Tài liệu gốc

- `docs/cmn.md` — nội dung đề tài (đã copy từ `d:\video\cmn\cmn.md`).
- `d:\video\readme.md.txt` — mental model bổ sung.
# cnm_coffee
