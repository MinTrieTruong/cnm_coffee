# Kết nối Socket.io: Khách — Bếp — Thu ngân

Tài liệu này mô tả cách các phân hệ dùng chung một máy chủ Socket.io (chạy cùng **backend-node** trên cổng `PORT`, mặc định `4000`).

## Phòng (rooms)

| Room    | Ai join                         | Mục đích                                      |
|---------|----------------------------------|-----------------------------------------------|
| `kds`   | Màn hình bếp (KDS)               | Nhận đơn mới, cập nhật trạng thái làm món     |
| `staff` | App phục vụ                      | Nhận thông báo món xong để bưng ra            |
| `pos`   | Thu ngân (mở rộng sau)           | Chuông thanh toán, cập nhật bàn               |

Sau khi client kết nối, gửi sự kiện:

```ts
socket.emit("join", "kds"); // hoặc "staff" | "pos"
```

## Sự kiện từ server → client

### `order:confirmed` (tới room `pos`)

Khi đơn hết thời gian ân hạn (`Pending_Grace` → `Confirmed`), worker emit để POS biết có đơn/bàn cập nhật.

### `order:new` (tới room `kds`)

Sau khi đơn chuyển `Confirmed`, chi tiết món chuyển từ `Hold` → `Waiting`; server emit (không emit trong lúc `Pending_Grace`).

Khi khách (hoặc POS) tạo đơn qua `POST /api/orders` **trước đây** bản demo emit ngay — hiện tại emit **sau ân hạn**:

```json
{
  "orderId": 2,
  "details": [ /* OrderDetail + product */ ]
}
```

KDS render thẻ vào cột **Chờ làm** (theo `kdsStatus: Waiting`).

### `kds:update` (tới room `staff`)

Khi bếp gọi `PATCH /api/kds/details/:id` với `kdsStatus` (ví dụ `Ready`), server forward chi tiết dòng đơn cho phục vụ để hiện toast: *“Món X bàn Y đã xong”*.

## Luồng mở rộng (grace 60s + Redis)

Theo mental model trong `readme.md.txt`:

1. Khách **Chốt đơn** → backend tạo bản ghi trạng thái `Grace` và job Redis TTL 60s.
2. Trong 60s: `Hủy/Sửa` → xóa job, cập nhật CSDL.
3. Hết 60s: worker Redis (hoặc BullMQ) chuyển đơn sang `Confirmed`, emit `order:new` tới `kds` và có thể emit `table:update` tới `staff`.

Phiên bản hiện tại của repo: tạo đơn **Pending/Queued** trực tiếp và emit `order:new` để KDS hoạt động ngay; bạn có thể thêm Redis và job queue theo bảng trạng thái ở trên mà không đổi contract socket cơ bản.

## Ví dụ client (KDS)

```ts
import { io } from "socket.io-client";

const socket = io(API_ORIGIN);
socket.emit("join", "kds");
socket.on("order:new", (payload) => {
  console.log("Đơn mới", payload.orderId);
});
```

## CORS

Socket.io server cấu hình `cors.origin` theo biến `CORS_ORIGIN` (mặc định `http://localhost:5173`).
