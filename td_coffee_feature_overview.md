# TD Coffee — Tổng quan chức năng hệ thống

> **Stack:** React + Vite (frontend) · Node.js + Express + Prisma (backend) · MySQL · Redis · Socket.io  
> **Môi trường:** Docker (MySQL 3307, Redis) · Backend :4000 · Frontend :5173

---

## Phân quyền nhân sự (Roles)

| Role | Tên | Quyền truy cập |
|------|-----|---------------|
| `Admin` | Quản lý | Toàn bộ hệ thống |
| `Cashier` | Thu ngân | POS, Sơ đồ bàn, Kiểm kho |
| `Waiter` | Phục vụ | Sơ đồ bàn (order tại bàn) |
| `Kitchen` | Pha chế | KDS, Kiểm kho |

---

## A. Khu vực khách hàng (Public)

### 1. Trang chủ / Giới thiệu (`/`, `/about`)
- Trang chào mừng TD Coffee
- Trang giới thiệu cửa hàng (lịch sử, địa chỉ, giờ mở cửa)

### 2. Đăng ký / Tài khoản khách (`/register`, `/account`)
- Khách đăng ký bằng SĐT + mật khẩu
- Xem thông tin tài khoản, tích điểm, hạng thành viên (Đồng/Bạc/Vàng)
- Hệ thống điểm thưởng: cứ 1.000đ → 100 điểm, 1 điểm = 1đ giảm giá

### 3. Menu (`/menu`, `/product/:id`)
- Danh sách sản phẩm chia theo danh mục
- Trang chi tiết sản phẩm: hình ảnh, giá, mô tả, đánh giá từ khách
- Khách có thể xem reviews (sao + bình luận)

### 4. Giỏ hàng & Đặt hàng (`/cart`)
- Thêm/bớt món, xem tổng tiền
- Chọn bàn hoặc mua mang về
- Áp dụng điểm tích lũy để giảm giá
- Đặt hàng → tạo Order với trạng thái `Pending_Grace`

### 5. Thời gian ân hạn hủy đơn (`/order/:id/grace`)
- Sau khi đặt hàng, khách có N giây để hủy nếu đặt nhầm
- Hiển thị countdown, sau đó chuyển sang `Confirmed`

### 6. Thanh toán (`/order/:id/checkout`)
- 4 phương thức thanh toán:
  - **Tiền mặt** — xác nhận tại quầy
  - **VietQR** — quét QR chuyển khoản, tự động xác nhận qua SePay webhook
  - **VNPay** — redirect sang cổng VNPay, callback về `/vnpay-return`
  - **MoMo** — deeplink app MoMo / QR / web
- Sau thanh toán: cộng điểm tích lũy cho khách

---

## B. Khu vực nhân sự (Staff Shell)

> Đăng nhập tại `/staff/login` — chọn tên + nhập mật khẩu

### 7. Thu ngân POS (`/pos`) — Cashier, Admin
- Tạo đơn hàng nhanh tại quầy (walk-in)
- Giao diện 2 cột: danh mục bên trái, sản phẩm bên phải
- Bấm + để thêm vào bill, hỗ trợ thêm ghi chú từng món
- Xem bill hiện tại, tính tổng tiền có VAT
- Thanh toán nhiều phương thức
- Quản lý ca: mở ca (nhập tiền mặt đầu ca), kết ca (kiểm tiền thực tế vs dự kiến)

### 8. Sơ đồ bàn (`/staff/tables`) — Waiter, Cashier, Admin
- Hiển thị sơ đồ bàn realtime (Socket.io)
- Bàn có màu sắc theo trạng thái: Trống / Có khách / Chờ thanh toán
- Nhấn vào bàn → xem menu, thêm món theo form:
  - Danh sách món dọc kèm hình ảnh
  - Cột số lượng với nút `+` / `−`
  - Nút `...` để thêm ghi chú từng món
- Gửi order → thông báo realtime lên KDS

### 9. Pha chế / KDS (`/kds`) — Kitchen, Admin
- Hiển thị các order đang cần pha chế theo thứ tự thời gian
- Mỗi card: tên bàn, danh sách món, trạng thái từng món
- Đánh dấu hoàn thành từng món, tự cập nhật realtime

---

## C. Kho vận

### 10. Kiểm kho (`/staff/inventory`) — Kitchen, Admin

#### Tab 1: Kiểm kho
- Bảng danh sách toàn bộ nguyên liệu trong kho
- Hiển thị: tồn kho hệ thống, mức tối thiểu, trạng thái (Đủ / Sắp hết / Hết)
- Nhân viên nhập số lượng **thực tế đếm được**, ghi chú
- Chọn loại kiểm: **Mở ca** hoặc **Kết ca**
- Lưu log → dùng cho báo cáo hao hụt

#### Tab 2: Phiếu nhập hàng
- Pha chế/Admin tạo phiếu xin nhập nguyên liệu (nhiều mặt hàng 1 lần)
- Chọn nguyên liệu, số lượng, ghi chú
- Gửi phiếu → Admin duyệt/từ chối
- Khi Admin **duyệt**: tự động `+stockQty` và tạo bản ghi **Lịch sử nhập kho**
- Xem danh sách phiếu đã tạo + trạng thái (Chờ / Duyệt / Từ chối)

#### Tab 3: Lịch sử ca
- **Lọc theo ngày** (date picker, mặc định hôm nay)
- **Bảng tổng hợp tiêu thụ** (tự tính):

  | Nguyên liệu | Mở ca 🟡 | Kết ca 🟣 | Đã dùng 🟢 | Giờ mở | Giờ kết |
  |---|---|---|---|---|---|
  
  - Đã dùng = Mở ca − Kết ca  
  - "Chưa kết ca" nếu chưa có log kết  
  - "+N (lạ)" nếu kết ca > mở ca

- **Chi tiết log thô**: xem từng dòng mở/kết ca
- **Lịch sử nhập kho trong ngày**: hiện khi có phiếu được duyệt (chỉ Admin thấy)

---

## D. Quản trị Admin

### 11. Trang Admin (`/admin`) — Admin only

#### Dashboard
- Tổng doanh thu hôm nay / tháng này
- Số đơn hàng, khách mới, điểm đã tặng
- Biểu đồ doanh thu 7 ngày

#### Quản lý Menu
- CRUD sản phẩm: tên, giá bán, giá vốn, hình ảnh, danh mục
- Bật/tắt sản phẩm, đánh dấu hết hàng
- CRUD danh mục

#### Quản lý Kho (Admin)
- Xem danh sách nguyên liệu + tồn kho
- Thêm/sửa/xóa nguyên liệu (tên, đơn vị, mức tối thiểu, nhà cung cấp)
- Nhập hàng tay (tăng stockQty trực tiếp)
- **Duyệt phiếu nhập hàng** từ nhân viên (Approve/Reject)
  - Approve → tự cộng kho + tạo lịch sử nhập kho

#### Quản lý Nhân sự
- Xem danh sách staff (tên, role, lương cơ bản, trạng thái)
- Thêm/sửa/xóa nhân viên

#### Quản lý Bàn
- Xem danh sách bàn, trạng thái
- Thêm/sửa/xóa bàn, cập nhật QR code

#### Quản lý Đơn hàng
- Xem tất cả đơn hàng, lọc theo trạng thái/ngày
- Hủy đơn, xem chi tiết

#### Quản lý Ca làm việc
- Xem lịch sử ca của Cashier (mở ca, kết ca, tiền đầu/cuối, chênh lệch)

#### Quản lý Khách hàng
- Danh sách khách, tổng chi tiêu, điểm tích lũy, hạng thành viên
- Xem lịch sử đơn hàng của khách

#### Đánh giá (Reviews)
- Xem tất cả review của khách
- Admin reply bình luận
- Ẩn review vi phạm

#### Cài đặt cửa hàng
- Tỷ lệ VAT (%)
- Công thức tích điểm (N VND → M điểm)
- Tỷ giá quy đổi điểm (1 điểm = N đồng)
- Làm tròn tiền mặt

---

### 12. Định mức nguyên liệu (`/admin/formulas`) — Admin only

#### Tab 1: Quản lý định mức (Recipe Editor)
- Chọn sản phẩm → xem công thức nguyên liệu hiện tại
- **Batch input**: thêm nhiều nguyên liệu cùng lúc cho 1 sản phẩm
- Mỗi dòng:
  - Chọn nguyên liệu → **tự động điền** đơn vị CT và hệ số quy đổi (theo bảng chuẩn)
  - Nhập lượng / ly (ví dụ: 20g)
  - Đơn vị công thức (g, ml, Cái...)
  - Hệ số quy đổi (1 Bịch = 1000g)
- **Preview tính toán**: `1 Bịch Cà Phê Robusta → 50 ly`
- Xóa từng dòng định mức

**Bảng quy đổi chuẩn đã có sẵn** (12 nguyên liệu):

| Nguyên liệu | Đơn vị kho | Quy đổi | Đơn vị CT |
|---|---|---|---|
| Sữa Đặc Ngôi Sao | Lon | 380 | g |
| Syrup Đường Đen | Chai | 2500 | g |
| Sữa Tươi Thanh Trùng | Hộp | 1000 | ml |
| Bột Matcha Nhật (500g) | Bịch | **500** | g |
| Còn lại (1kg) | Bịch | 1000 | g |
| Ly Nhựa Kèm Nắp | Cái | 1 | Cái |

**41 định mức** đã seed sẵn cho 12 sản phẩm (Cà Phê Đen Đá, Bạc Xỉu, Americano, Latte, Trà Sữa các loại, Matcha...)

#### Tab 2: Báo cáo hao hụt
- Chọn ngày → xem báo cáo đối soát
- Tính toán:
  - **Lý thuyết (đv CT)** = Σ(số ly bán × định mức/ly)
  - **Lý thuyết (đv kho)** = lý thuyết ÷ hệ số quy đổi
  - **Thực tế** = log mở ca − log kết ca
  - **Chênh lệch** = thực tế − lý thuyết
- Badge trạng thái: 🟢 Vừa đủ · 🔴 Hao hụt · 🟡 Ít hơn dự kiến · ⚪ Chưa kết ca
- Click vào nguyên liệu → **expand** xem chi tiết sản phẩm nào dùng bao nhiêu

---

## E. Cơ sở dữ liệu — Các bảng chính

```
StoreSettings       — Cấu hình VAT, điểm thưởng
Categories          — Danh mục sản phẩm
Products            — Sản phẩm (giá, hình, trạng thái)
ProductFormula      — Định mức nguyên liệu (qtyPerUnit, recipeUnit, conversionFactor)
InventoryItem       — Nguyên liệu kho (stockQty, minLevel, unit)
StockReceipt        — Lịch sử nhập kho (source: Request/Manual)
InventoryRequest    — Phiếu xin nhập hàng
ShiftInventoryLog   — Log kiểm kho mở/kết ca (shiftId nullable)
CafeTable           — Bàn café (status, QR)
Staff               — Nhân viên (role, lương, CCCD)
Shift               — Ca làm việc (tiền đầu/cuối ca)
Customer            — Khách hàng (điểm, hạng)
Order               — Đơn hàng (type, VAT, status, grace period)
OrderDetail         — Chi tiết đơn (qty, ghi chú, KDS status)
Payment             — Thanh toán (method, transCode)
Review              — Đánh giá (rating, reply, hidden)
```

---

## F. Tích hợp bên thứ ba

| Dịch vụ | Mục đích |
|---------|---------|
| **SePay** | Webhook xác nhận thanh toán QR/chuyển khoản tự động |
| **VNPay** | Cổng thanh toán quốc tế (redirect + return callback) |
| **MoMo** | Thanh toán ví điện tử (HMAC-SHA256 signature) |
| **Socket.io** | Realtime: cập nhật bàn, KDS, trạng thái đơn |
| **Redis** | Cache session, pub/sub Socket.io |

---

## G. Khởi động dự án (Dev)

```bash
# 1. Database + Cache
docker start cmn-mysql cmn-redis

# 2. Backend
cd backend-node && npm run dev   # → http://localhost:4000

# 3. Frontend  
cd frontend-app && npm run dev   # → http://localhost:5173
```
