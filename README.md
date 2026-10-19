# Hệ thống quán cà phê TD Coffee (demo)

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

## 🚀 CHẠY PROJECT — ĐỌC CÁI NÀY TRƯỚC

### Thư mục gốc
```
d:\cmn-cs - Copy\
```

---

## ▶️ Chạy hằng ngày (3 terminal)

> Mở **Docker Desktop** trước, đợi trạng thái "Running".

**Terminal 1 — Khởi động MySQL (database):**
```bash
cd "d:\cmn-cs - Copy"
docker start cmn-mysql cmn-redis
```
> ⚠️ **KHÔNG dùng `docker rm -f`** — sẽ xóa hết dữ liệu DB!  
> Nếu báo "container not found", chạy lần đầu thay bằng: `docker compose up -d`

**Terminal 2 — Backend (API):**
```bash
cd "d:\cmn-cs - Copy\backend-node"
npm run dev
```
> Thành công khi thấy: `API + Socket.io: http://localhost:4000`

**Terminal 3 — Frontend (giao diện):**
```bash
cd "d:\cmn-cs - Copy\frontend-app"
npm run dev
```
> Mở trình duyệt: **http://localhost:5173**

---

## 🆕 Lần đầu chạy (hoặc sau khi cập nhật schema DB)

```bash
# 1. Chạy docker trước
cd "d:\cmn-cs - Copy"
docker compose up -d

# 2. Cài dependencies + sync DB + seed dữ liệu mẫu
cd "d:\cmn-cs - Copy\backend-node"
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev

# 3. Frontend (terminal khác)
cd "d:\cmn-cs - Copy\frontend-app"
npm install
npm run dev
```

`npm run db:seed` tạo sẵn Chi nhánh #1. Muốn có thêm Chi nhánh #2 để thử chuỗi cửa hàng: `npm run db:seed-store2`.

### Nâng cấp DB đang có dữ liệu lên chuỗi cửa hàng

Chỉ làm 1 lần trên DB tạo trước khi có tính năng chuỗi (dữ liệu cũ trở thành Chi nhánh #1). **Dừng backend trước.**

```bash
cd backend-node
# Sao lưu trước
docker exec cmn-mysql mysqldump -uroot -proot --single-transaction coffee_shop_db > ../backup_before_chain.sql
# ID đơn hàng tự tăng (MySQL không cho db push đổi cột có khoá ngoại)
docker exec cmn-mysql mysql -uroot -proot coffee_shop_db -e "SET FOREIGN_KEY_CHECKS=0; ALTER TABLE Orders MODIFY Order_ID INT NOT NULL AUTO_INCREMENT; ALTER TABLE Order_Details MODIFY Detail_ID INT NOT NULL AUTO_INCREMENT; SET FOREIGN_KEY_CHECKS=1;"
# Chạy lần lượt các migration chuỗi cửa hàng
docker exec -i cmn-mysql mysql -uroot -proot coffee_shop_db < prisma/sql/001_chain_stores.sql
docker exec -i cmn-mysql mysql -uroot -proot coffee_shop_db < prisma/sql/002_drop_item_stock.sql
docker exec -i cmn-mysql mysql -uroot -proot coffee_shop_db < prisma/sql/003_store_settings_cleanup.sql
docker exec -i cmn-mysql mysql -uroot -proot coffee_shop_db < prisma/sql/004_requests_fulfilled.sql
npx prisma generate
npm run db:owner          # tạo tài khoản Chủ chuỗi: owner / owner123 (đổi bằng OWNER_PASSWORD)
npm run db:seed-store2    # Chi nhánh #2 mẫu + tài khoản Thủ kho `kho` cho Chi nhánh #1
```

---

## 🔑 Tài khoản demo

| Loại | Tài khoản | Mật khẩu | Vào trang |
|------|-----------|----------|-----------|
| Khách hàng | `0900000000` | `123456` | `/menu` |
| Admin | `admin` | `staff123` | `/admin` |
| Thu ngân | `cashier` | `staff123` | `/pos` |
| Phục vụ | `waiter` | `staff123` | `/staff/tables` |
| Bếp | `kitchen` | `staff123` | `/kds` |
| Chủ chuỗi | `owner` | `staff123` (seed) / `owner123` (db:owner) | `/app/overview/dashboard` |
| Thủ kho | `kho` | `staff123` | `/app/overview/home` |
| Nhân viên Chi nhánh #2 | `admin2`, `cashier2`, `kitchen2`, `waiter2`, `shipper2`, `kho2` | `staff123` | sau `npm run db:seed-store2` |

**Phân vai:** Chủ chuỗi quản lý thực đơn, giá, khuyến mãi, website, nhà cung cấp, chi nhánh. Quản lý chi nhánh quản lý nhân sự, duyệt phiếu/đơn từ/mua hàng, xem báo cáo chi nhánh. Thủ kho làm kho & mua hàng. Thu ngân, phục vụ, pha chế, shipper làm việc trong ca.

Chủ chuỗi chọn chi nhánh ở thanh trên cùng (hoặc "Tất cả chi nhánh" để xem báo cáo tổng). Nhân viên chỉ thấy dữ liệu chi nhánh của mình.

---

## 🗺️ Các trang chính

| URL | Ai dùng | Mô tả |
|-----|---------|-------|
| `/` | Khách | Trang chủ / QR |
| `/menu` | Khách | Đặt món |
| `/pos` | Thu ngân | Thanh toán, mở/đóng ca |
| `/staff/inventory` | **Nhân viên** | **Kiểm kho mở/kết ca, tạo phiếu nhập hàng** |
| `/staff/tables` | Phục vụ | Sơ đồ bàn |
| `/kds` | Bếp | Màn hình bếp |
| `/admin` | Admin | Quản trị toàn bộ |

---

## 🛠️ Lỗi thường gặp

**API không kết nối / trang trắng:**
```bash
# Kiểm tra health
curl http://localhost:4000/api/health
# Phải thấy: {"ok":true,"database":"up"}
```

**Không đăng nhập được:**
```bash
cd "d:\cmn-cs - Copy\backend-node"
npm run db:seed
```
Rồi xóa localStorage trên trình duyệt: DevTools → Application → Local Storage → xóa `cmn_staff_token` + `cmn_staff_info`.

**Docker không chạy được:**
Mở Docker Desktop, đợi icon taskbar chuyển xanh rồi chạy lại `docker compose up -d`.

---

## 📝 Ghi chú kỹ thuật

- MySQL cổng host: **3307** (map → 3306 trong container)
- Backend: **http://localhost:4000**
- Frontend dev (Vite proxy): **http://localhost:5173**
- Ảnh upload lưu tại: `backend-node/uploads/`
- Schema DB thay đổi → chạy lại: `npx prisma db push` (trong `backend-node/`)

---

## Cấu trúc thư mục

| Thư mục | Vai trò |
|---------|---------|
| `frontend-app/` | Vite + React (giao diện) |
| `backend-node/` | Express + Prisma + Socket.io (API) |
| `ai-service-python/` | Gợi ý món (tuỳ chọn, cổng 8000) |
| `docs/cmn.md` | Tài liệu đề tài |

## QR code

In QR trỏ tới URL công khai của bạn, ví dụ `https://your-domain.com/` hoặc `https://your-domain.com/?table=3`. (Tham số `table` có thể đọc thêm ở frontend để gán `tableId` khi chốt đơn.)

## Dữ liệu mẫu

Seed khớp menu / kho / đơn demo bạn cung cấp; ảnh món lưu tại cột `Image_URL` (URL Unsplash). Đổi ảnh bằng cách cập nhật DB hoặc chỉnh `prisma/seed.ts`.

## Tài liệu gốc

- `docs/cmn.md` — nội dung đề tài (đã copy từ `d:\video\cmn\cmn.md`).
- `d:\video\readme.md.txt` — mental model bổ sung.
# cnm_coffee
