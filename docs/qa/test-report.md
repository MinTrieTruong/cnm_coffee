# Báo cáo kiểm thử QA — TD Coffee

## 0. Trạng thái sửa lỗi (cập nhật 01/11/2026)

**Đã sửa cả 26 lỗi.** Chạy lại toàn bộ `tests/qa` (03–08) trên backend test: **233 đạt · 0 lỗi · 1 bỏ qua** (JWT hết hạn). Không còn lỗi 500 sau khi sửa.

| Mã | Cách sửa (file chính) |
|---|---|
| 001 | `/sepay/confirm` chỉ xác nhận khi tự tra hoá đơn trên SePay thấy đã trả đủ; mã hoá đơn quay về qua `success_url` (`sepay.ts`, `OrderCheckout.tsx`) |
| 002 | VNPay client-confirm kiểm `vnp_SecureHash`, số tiền, đúng đơn, trạng thái; IPN kiểm số tiền + không nhận đơn đã hủy (`vnpay.ts`) |
| 003 | IPN SePay luôn tra lại hoá đơn trên SePay; có header chữ ký thì phải khớp; `confirmOrderPaid` chỉ nhận đơn chờ thanh toán (`sepay.ts`) |
| 004, 026 | POS chiếm đơn bằng `updateMany where status=Confirmed` đầu transaction; máy sau nhận 409 (`pos.ts`) |
| 005 | `canViewOrder` cho `/orders/:id`, `/bill`, `/tracking`; `/pos/bills/:id` cần thu ngân cùng chi nhánh; `api()` gửi `X-Order-Session` / `X-Table-Id` (`lib/orderAccess.ts`) |
| 006 | PATCH nhân viên theo danh sách trắng; quản lý không tự đổi lương/vai trò/trạng thái; response bỏ hash (`admin.ts`) |
| 007, 008 | `consumeVoucher` nguyên tử (Used_Count < Quantity, mỗi khách 1 lần) dùng ở POS / SePay / VNPay / MoMo / apply; POS kiểm lại voucher, báo thu ngân khi bỏ (`lib/vouchers.ts`, `Pos.tsx`) |
| 009 | POS chỉ nhận `Cash` / `Transfer_QR` / `Card`; tiền mặt thiếu → 400 (`pos.ts`) |
| 010 | Áp điểm bắt buộc đúng token chủ đơn (`orders.ts`) |
| 011 | Hồ sơ khách bỏ hash, chuẩn hoá + kiểm trùng SĐT (`customer.ts`) |
| 012 | Khách chỉ tự hủy khi còn ân hạn hoặc chưa món nào xuống bếp; nhân viên vẫn hủy được (`orders.ts`) |
| 013 | `/staff/members` cần đăng nhập, theo chi nhánh, bỏ username (`staffAuth.ts`) |
| 014 | Chuẩn hoá SĐT (đăng ký + đăng nhập); trùng ID khi đồng thời thì thử lại (khách + nhân viên) (`auth.ts`, `admin.ts`) |
| 015 | Bán kính giao tối đa 15 km (`MAX_DELIVERY_KM`), giỏ hàng báo + khoá nút (`lib/delivery.ts`, `Cart.tsx`) |
| 016 | Menu ẩn món không đủ nguyên liệu; đặt món kiểm đủ nguyên liệu theo số ly / size; trừ kho không xuống âm (`lib/storeProducts.ts`, `lib/menuPrice.ts`, `lib/inventory.ts`) |
| 017 | Phòng socket `order:` / `tracking:` chỉ cho chủ đơn hoặc nhân viên cùng chi nhánh (`socket/handlers.ts`) |
| 018 | Bài đăng lọc HTML khi lưu (`sanitizeHtml`) và khi hiển thị (`safeHtml`) (`posts.ts`, `BlogDetail.tsx`) |
| 019 | Kiểm dữ liệu voucher khi tạo / sửa (`vouchers.ts`) |
| 020 | KDS chỉ nhận `Waiting` / `Cooking` / `Ready` / `Served` (`orders.ts`) |
| 021 | Mỗi đơn 1 đánh giá; ảnh chỉ nhận `/uploads/<uuid>.<ảnh>` (`reviews.ts`) |
| 022 | `bizRange` loại ngày không có thật (`lib/bizTime.ts`) |
| 023 | Upload kiểm magic bytes PNG/JPEG/WebP/GIF (`lib/uploadImage.ts`) |
| 024 | Mật khẩu nhân viên ≥ 6 ký tự (tạo, sửa, tự đổi; cả frontend) |
| 025 | `.c-filter-row { position: relative }` — chữ ẩn `.c-sr` không thoát vùng cuộn (`customer.css`) |

Còn mở: SePay (001/003) chưa thử với SePay thật (máy test không gọi ra SePay được); ID khách / nhân viên vẫn cấp `max+1` (có thử lại), đổi sang `AUTO_INCREMENT` cần migration trên CSDL thật.

## 1. Tóm tắt

| Mục | Giá trị |
|---|---|
| Ngày test | 01/11/2026 |
| Nhánh / commit | `feat/chain-stores` @ `49bda23` + thay đổi chưa commit trong working tree (mini game thẻ cào / hộp quà / lì xì, chủ đề lễ, vòng quay) |
| Môi trường | Windows 11, Node 22.19, MySQL 8 (container `cmn-mysql`, **CSDL test riêng `cmn_test`**), backend test cổng **4100**, frontend build production (`VITE_API_URL=http://localhost:4100`) chạy bằng `vite preview` cổng **4173**, trình duyệt Edge headless (playwright-core, không ảnh/video/trace) |
| Dữ liệu | `prisma db push` + seed: `seed`, `seed-store2`, `seed-staff`, `seed-formulas`, `game-seed`, `popup-seed`, `contact-seed`, `site-seed` (77 nhân sự, 2 chi nhánh, 12 món, vòng quay mẫu) |
| CSDL / server của chủ dự án | **Không đụng tới**: backend :4000 + `coffee_shop_db` + Vite :5173 vẫn chạy nguyên trạng |
| Build | `backend-node: npm run build` (tsc) **đạt**. `frontend-app: tsc -b` **đạt**; `vite build` **đạt**, có cảnh báo chunk > 500 kB |
| Danh mục route | 350 route / 47 file (`tests/qa/01-routes-inventory.mjs`). Dò quyền động mọi route với không token, token khách và GET với 8 vai trò (`02-authz-probe.mjs`) |
| Kết quả kiểm tra tự động | **171 đạt · 38 lỗi · 1 bỏ qua** (chưa tính ma trận dò quyền). Gộp lại thành **26 lỗi**: 9 Nghiêm trọng · 5 Cao · 7 Trung bình · 5 Thấp |

Kết quả theo script:

| Script | Đạt | Lỗi | Bỏ qua |
|---|---|---|---|
| 03 Khách: đăng ký, đặt món, ân hạn, ship, thanh toán, điểm, đánh giá, IDOR | 39 | 18 | 0 |
| 04 POS, ca & két, voucher, mini game, đồng thời | 24 | 8 | 0 |
| 05 Phân quyền vai trò / chi nhánh, CRUD nhân viên, JWT, upload, XSS | 27 | 6 | 1 (JWT hết hạn: cần secret thật để ký token) |
| 06 Realtime socket (5 phiên song song) | 4 | 1 | 0 |
| 07 Kho, báo cáo đối chiếu CSDL, hiệu năng | 7 | 4 | 0 |
| 08 Giao diện: 12 trang × 390/1440px, thêm giỏ, VI/EN, tối, đăng nhập 6 vai trò | 70 | 1 | 0 |

Một số kiểm tra lỗi trùng nhau (cùng một nguyên nhân), nên số lỗi trong bảng dưới ít hơn số kiểm tra lỗi.

## 2. Bảng lỗi

| Mã | Mức độ | Module | Tiêu đề ngắn | Vai trò |
|---|---|---|---|---|
| BUG-001 | Nghiêm trọng | Thanh toán SePay | `POST /orders/:id/sepay/confirm` không cần đăng nhập, không đối chiếu giao dịch → ai cũng đánh dấu đơn "Đã thanh toán" + được cộng điểm | Khách / người lạ |
| BUG-002 | Nghiêm trọng | Thanh toán VNPay | `POST /orders/:id/vnpay/client-confirm` không kiểm chữ ký; còn chuyển cả đơn **đã hủy** sang Paid | Khách / người lạ |
| BUG-003 | Nghiêm trọng | Thanh toán SePay | IPN SePay bỏ qua chữ ký ở sandbox **hoặc khi thiếu header** (kể cả production), không kiểm số tiền | Người lạ |
| BUG-004 | Nghiêm trọng | POS | 2 thu ngân thanh toán cùng một đơn cùng lúc → 2 Payment, cộng điểm 2 lần (lúc khác thì 500 deadlock) | Thu ngân |
| BUG-005 | Nghiêm trọng | Đơn hàng | Lộ dữ liệu khách: `/orders/:id`, `/orders/:id/bill`, `/pos/bills/:id`, `/orders/:id/tracking` không cần đăng nhập (tên, SĐT, điểm, địa chỉ, toạ độ), ID tăng dần | Người lạ |
| BUG-006 | Nghiêm trọng | Nhân sự | Quản lý chi nhánh tự tăng lương của chính mình (PATCH `/admin/staff/:id` nhận mọi trường); API trả `passwordHash`, `faceDescriptor` | Admin |
| BUG-007 | Nghiêm trọng | Voucher | Voucher còn 1 lượt bị 2 khách dùng (Used_Count 2/1) | Khách + Thu ngân |
| BUG-008 | Nghiêm trọng | Voucher | Cùng một khách dùng lại một voucher nhiều lần (không đánh dấu `isUsed` ở luồng khách gửi yêu cầu → POS) | Khách |
| BUG-009 | Nghiêm trọng | POS | POS nhận tiền mặt khách đưa ít hơn tổng bill (tiền thối âm), chấp nhận phương thức thanh toán tuỳ ý → két lệch | Thu ngân |
| BUG-010 | Cao | Điểm | IDOR: người lạ không token áp toàn bộ điểm của khách khác vào đơn của khách đó | Người lạ |
| BUG-011 | Cao | Tài khoản khách | `PATCH /customer/profile` trả về `passwordHash`; đổi SĐT không kiểm định dạng ("xyz" được lưu) | Khách |
| BUG-012 | Cao | Đặt món | Khách hủy được đơn tại quán **sau** thời gian ân hạn (đơn đã vào bếp) | Khách |
| BUG-013 | Cao | Nhân sự | `GET /api/staff/members` công khai: 77 username + họ tên + vai trò | Người lạ |
| BUG-014 | Cao | Đăng ký | Đăng ký đồng thời lỗi: 4/6 người bị 409 "Dữ liệu bị trùng"/500 (ID khách = max+1); SĐT sai định dạng → 500 | Khách |
| BUG-015 | Trung bình | Giao hàng | Không giới hạn bán kính giao: đặt từ Hà Nội (~1.100 km) được nhận, phí ship 5.720.000đ | Khách |
| BUG-016 | Trung bình | Kho | Hết nguyên liệu: món không tự hết hàng, vẫn đặt được, tồn kho xuống âm | Hệ thống |
| BUG-017 | Trung bình | Realtime | Ai cũng join được phòng socket `order:<id>` / `tracking:<id>` → nhận `payment:success`, vị trí shipper của đơn người khác | Người lạ |
| BUG-018 | Trung bình | Website / bài đăng | Stored XSS: bài đăng lưu nguyên `<script>`/`onerror`, BlogDetail render bằng `dangerouslySetInnerHTML` không lọc | Owner (người đăng) → mọi khách |
| BUG-019 | Trung bình | Voucher | Tạo voucher không kiểm dữ liệu: giá trị âm, ngày bắt đầu sau ngày kết thúc | Owner / Admin |
| BUG-020 | Trung bình | KDS | `PATCH /kds/details/:id` nhận trạng thái tuỳ ý ("Hacked") → món biến mất khỏi luồng bếp | Pha chế |
| BUG-021 | Trung bình | Đánh giá | Một đơn đánh giá được nhiều lần; `imageUrl` không kiểm (lưu `javascript:alert(1)`, được render ở trang Cửa hàng) | Khách |
| BUG-022 | Thấp | Báo cáo | Ngày báo cáo sai định dạng → 500 (`RangeError: Invalid time value`) | Admin |
| BUG-023 | Thấp | Upload | Ảnh chỉ kiểm tiền tố `data:image/...`, không kiểm nội dung (SVG/HTML khai báo image/png vẫn lưu) | Mọi người dùng upload |
| BUG-024 | Thấp | Nhân sự | Mật khẩu nhân viên mới chỉ cần 4 ký tự | Admin |
| BUG-025 | Thấp | Giao diện | `/menu` ở 390px tràn ngang 81px (2 ô lọc `select`) | Khách |
| BUG-026 | Thấp | POS | Khi 2 thu ngân trùng thao tác, người thứ 2 nhận 500 "Lỗi máy chủ" thay vì thông báo "đơn đã thanh toán" (không retry deadlock) | Thu ngân |

## 3. Chi tiết lỗi

### BUG-001 — Xác nhận thanh toán SePay không xác thực (Nghiêm trọng · Thanh toán)
- **Tái hiện**:
  1. Khách đăng nhập tạo đơn mang về `POST /api/orders {orderType:"Takeaway", storeId:1, lines:[{productId:2,quantity:2,size:"M"}]}` → đơn `Confirmed`.
  2. Không token: `POST /api/orders/{id}/sepay/confirm` với body rỗng.
- **Mong đợi**: 401/403, hoặc chỉ xác nhận khi tra được giao dịch thật trên SePay.
- **Thực tế**: 200 `{"confirmed":true}`. Đơn chuyển `Paid`, tạo Payment, khách được cộng 7.700 điểm, món đẩy vào bếp, doanh thu báo cáo tăng. Log: `[sepay/confirm] Fallback xác nhận đơn # …`.
- **Nghi vấn**: `backend-node/src/routes/sepay.ts:162-181`. Route "fallback" không có middleware, chỉ kiểm trạng thái đơn.
- **Gợi ý sửa**: bỏ route, hoặc bắt buộc gọi API tra cứu giao dịch SePay theo `order_invoice_number` và so số tiền trước khi `confirmOrderPaid`.

### BUG-002 — VNPay client-confirm tin dữ liệu từ trình duyệt (Nghiêm trọng · Thanh toán)
- **Tái hiện**: `POST /api/orders/{id}/vnpay/client-confirm` body `{"vnp_ResponseCode":"00"}`, không token.
  - Lặp lại với một đơn đã `Cancelled`, kèm `vnp_TxnRef`.
- **Mong đợi**: kiểm `vnp_SecureHash` bằng `verifyVnpaySign`; đơn đã hủy không đổi trạng thái.
- **Thực tế**: 200 `{"ok":true}` → đơn `Paid`. Đơn đã hủy cũng chuyển `Paid`.
- **Nghi vấn**:
  - `backend-node/src/routes/vnpay.ts:102-110`: chỉ so `vnp_ResponseCode === "00"`.
  - `vnpay.ts:130-134`: cập nhật `Paid` mà không xét trạng thái đơn.
- **Gợi ý sửa**: frontend gửi toàn bộ query VNPay trả về, server `verifyVnpaySign` + kiểm `vnp_Amount` + chỉ nhận đơn ở trạng thái chờ thanh toán.

### BUG-003 — IPN SePay không kiểm chữ ký (Nghiêm trọng · Thanh toán)
- **Tái hiện**: `POST /api/sepay/ipn {"order_invoice_number":"TD{id}-1","status":"SUCCESS","amount":1}`, không header `X-SePay-Signature`.
- **Mong đợi**: 400 Invalid signature; số tiền 1đ không được chấp nhận.
- **Thực tế**: đơn chuyển `Paid`.
- **Nghi vấn**: `backend-node/src/routes/sepay.ts:124`. Điều kiện `if (env === "production" && received)`: thiếu header là bỏ qua kiểm tra kể cả ở production. Không so `amount` với `totalAmount`.
- **Gợi ý sửa**: luôn bắt buộc chữ ký (sandbox dùng secret sandbox), từ chối khi thiếu header, so số tiền.

### BUG-004 — Hai thu ngân thanh toán trùng một đơn (Nghiêm trọng · POS · đồng thời)
- **Tái hiện**: `cashier` và `TN_Ha` mỗi người mở ca. Gửi đồng thời 2 request `POST /api/pos/pay {orderId, method:"Transfer"}` cho cùng một đơn.
- **Mong đợi**: 1 thành công, 1 báo "Đơn đã có giao dịch thanh toán".
- **Thực tế**:
  - Lần chạy 2: cả hai 200, `Payments=2`, `Point_Transactions=2` (khách cộng điểm đôi, doanh thu đôi, kho trừ đôi).
  - Lần chạy 1: một bên 500 `Transaction failed due to a write conflict or a deadlock` (BUG-026).
- **Nghi vấn**: `backend-node/src/routes/pos.ts:101-110`. Kiểm `status`/`payments.length` **ngoài** transaction, rồi `tx.order.update` không có điều kiện trạng thái (`pos.ts:200`).
- **Gợi ý sửa**: trong transaction dùng `updateMany({ where:{ id, status:"Confirmed" } })` và bỏ cuộc nếu `count = 0` (hoặc `SELECT … FOR UPDATE`), retry khi deadlock.

### BUG-005 — Đọc đơn / bill của người khác không cần đăng nhập (Nghiêm trọng · Lộ dữ liệu)
- **Tái hiện**: khách A tạo đơn giao hàng (địa chỉ "123 Đường Riêng Tư, Q1"). Người lạ, không token, gọi:
  - `GET /api/orders/{id}` → lộ `deliveryAddress`, `customerLat/Lng`.
  - `GET /api/orders/{id}/bill` → `customerName`, `customerPhone`, `customerPoints`.
  - `GET /api/pos/bills/{id}` → tên + SĐT.
  - `GET /api/orders/{id}/tracking` → địa chỉ.
- **Mong đợi**: chỉ chủ đơn (token / phiên mang về / bàn) hoặc nhân viên chi nhánh.
- **Thực tế**: 200 cả 4. ID đơn tuần tự (1, 2, 3…) nên dò được toàn bộ khách.
- **Nghi vấn**: `routes/orders.ts:42` và `:54`, `routes/pos.ts:376`, `routes/delivery.ts:385`. Không có middleware xác thực.
- **Gợi ý sửa**: dùng lại logic `isOwnerCustomer || isStaff` của route hủy đơn (`orders.ts:448-458`). `/pos/bills/:id` thêm `...cashier` + `inStore`.

### BUG-006 — Quản lý chi nhánh tự sửa lương, API trả hash (Nghiêm trọng · Leo thang quyền)
- **Tái hiện**: đăng nhập `admin`, gọi `PATCH /api/admin/staff/{id của chính admin}` với `{"baseSalary":99999999}`.
- **Mong đợi**: 403. Quản lý không tự sửa lương/phụ cấp của mình.
- **Thực tế**: 200, `Base_Salary` 0 → 99.999.999. Response chứa `passwordHash`, `faceDescriptor`, `cccd`.
- **Nghi vấn**:
  - `backend-node/src/routes/admin.ts:455-460`: cho sửa chính mình khi không đổi vai trò.
  - `admin.ts:465` `const data = { ...b }`: nhận mọi trường từ body.
  - `admin.ts:482` `res.json(updated)` trả nguyên bản ghi.
- **Gợi ý sửa**: danh sách trắng trường được sửa. Khi tự sửa thì chỉ cho thông tin cá nhân. Lương/phụ cấp chỉ cấp trên được sửa. Trả về DTO không có hash.

### BUG-007 — Voucher vượt số lượt (Nghiêm trọng · Voucher · đồng thời)
- **Tái hiện**: Owner tạo voucher `quantity:1`. Khách V1 và V2 mỗi người tạo đơn rồi gửi đồng thời `POST /orders/:id/request-payment {voucherCode}`. Thu ngân thanh toán cả hai.
- **Mong đợi**: chỉ 1 đơn được giảm.
- **Thực tế**: cả hai giữ mã 200/200, cả hai được giảm, `Used_Count = 2 / Quantity = 1`.
- **Nghi vấn**:
  - `lib/vouchers.ts:39`: chỉ kiểm lúc giữ mã.
  - `routes/pos.ts:218-221`: `usedCount: { increment: 1 }` không điều kiện.
- **Gợi ý sửa**: trong transaction thanh toán `updateMany({ where:{ code, usedCount:{ lt: quantity } } })`. Nếu `count = 0` thì bỏ giảm giá và báo thu ngân.

### BUG-008 — Một khách dùng lại voucher nhiều lần (Nghiêm trọng · Voucher)
- **Tái hiện**: cùng khách, 2 đơn liên tiếp, mỗi đơn `request-payment {voucherCode}` → POS `pay`.
- **Mong đợi**: lần 2 báo "Bạn đã sử dụng voucher này rồi".
- **Thực tế**: lần 2 vẫn 200 và được giảm 10.000đ.
- **Nghi vấn**: `isUsed` chỉ được đặt ở `routes/vouchers.ts:383` (`/vouchers/apply`). Luồng `/pos/pay` (`pos.ts:216-221`) không ghi `UserVoucher`, nên `resolveVoucher` (`lib/vouchers.ts:41-46`) không chặn được.
- **Gợi ý sửa**: trong `/pos/pay` (và `confirmOrderPaid` online) upsert `UserVoucher { isUsed:true, orderId }`, đồng thời kiểm "một khách một lần" với cả voucher public.

### BUG-009 — POS nhận thiếu tiền mặt / phương thức tuỳ ý (Nghiêm trọng · POS)
- **Tái hiện**:
  - `POST /api/pos/pay {orderId, method:"Cash", cashGiven:1000}` cho bill 39.000đ.
  - `{method:"MienPhi"}`.
- **Mong đợi**: 400 "Tiền khách đưa chưa đủ", phương thức ngoài danh sách bị từ chối.
- **Thực tế**: 200 `change:-38000`, đơn `Paid`. Ca ghi doanh thu tiền mặt 39.000đ trong khi chỉ thu 1.000đ, két lệch. Phương thức "MienPhi" được lưu vào Payments.
- **Nghi vấn**: `routes/pos.ts:162-168` (không chặn `cashGiven < displayTotal`), `pos.ts:90` (không whitelist `method`).
- **Gợi ý sửa**: chặn `cashGiven < displayTotal`. `method ∈ {Cash, Transfer, Card, …}` theo `METHOD_LABEL`.

### BUG-010 — Áp điểm của người khác (Cao · Điểm · IDOR)
- **Tái hiện**: khách có 50.000 điểm tạo đơn. Người lạ, **không token**, gọi `POST /api/orders/{id}/redeem-points {"pointsToUse":999999}`.
- **Mong đợi**: 401/403.
- **Thực tế**: 200, `pointsUsed=35000`. Điểm của chủ đơn sẽ bị trừ khi thanh toán.
- **Nghi vấn**: `routes/orders.ts:186` `if (reqCustomerId && reqCustomerId !== order.customerId)`. Không token thì bỏ qua kiểm tra.
- **Gợi ý sửa**: đơn có `customerId` thì bắt buộc `reqCustomerId === order.customerId`.

### BUG-011 — Hồ sơ khách trả hash, SĐT không kiểm (Cao · Tài khoản)
- **Tái hiện**:
  - `PATCH /api/customer/profile {"fullName":"…"}` → response có `passwordHash`.
  - `{"phone":"xyz"}` → 200, khách không đăng nhập bằng SĐT được nữa.
- **Nghi vấn**: `routes/customer.ts:47` `res.json(c)`, `customer.ts:28` (không validate).
- **Gợi ý sửa**: trả DTO như `/auth/me`. Validate SĐT theo `normalizeVnPhone`, kiểm trùng thì trả 409 với thông báo rõ.

### BUG-012 — Khách hủy được đơn sau ân hạn (Cao · Đặt món)
- **Tái hiện**: đơn tại bàn → chờ 19s (ân hạn 15s, worker đã chuyển `Confirmed` và đẩy món vào bếp) → khách `POST /orders/:id/cancel`.
- **Mong đợi**: 400 "Đã hết thời gian hủy".
- **Thực tế**: 200, đơn `Cancelled` trong khi bếp có thể đã pha.
- **Nghi vấn**: `routes/orders.ts:483-491`. Không xét `graceEndsAt` hay trạng thái KDS của món.
- **Gợi ý sửa**: khách chỉ được hủy khi `status = Pending_Grace` (hoặc mọi món còn `Hold/Waiting`). Sau đó nhân viên mới hủy được.

### BUG-013 — Danh sách nhân sự công khai (Cao · Lộ dữ liệu)
- **Tái hiện**: `GET /api/staff/members` không token.
- **Thực tế**: 200, 77 bản ghi `{id, fullName, role, username}`, tạo điều kiện dò mật khẩu (mật khẩu seed `staff123`).
- **Nghi vấn**: `routes/staffAuth.ts:41`. Không middleware.
- **Gợi ý sửa**: thêm `attachStaff` (đang dùng cho chat nội bộ thì chỉ trả nhân sự cùng chi nhánh).

### BUG-014 — Đăng ký: lỗi khi đồng thời và SĐT sai định dạng (Cao · Đăng ký)
- **Tái hiện**:
  - 6 request `POST /api/auth/register` cùng lúc với 6 SĐT khác nhau → chỉ 2 thành công, còn lại 409 "Dữ liệu bị trùng" hoặc 500.
  - `{"phone":"abc-khong-phai-sdt"}` → 500 (Prisma: vượt `VARCHAR(15)`).
- **Nghi vấn**: `routes/auth.ts:64` cấp ID bằng `max(id)+1`, `auth.ts:50` không validate SĐT. (Staff cũng dùng `max+1`: `admin.ts:404`.)
- **Gợi ý sửa**: dùng `AUTO_INCREMENT`, validate bằng `normalizeVnPhone`.

### BUG-015 — Không giới hạn bán kính giao hàng (Trung bình · Giao hàng)
- **Tái hiện**: đơn Delivery với toạ độ Hà Nội `21.0285, 105.8542` từ chi nhánh Q1.
- **Thực tế**: 201, phí ship 5.720.000đ.
- **Nghi vấn**: `lib/delivery.ts:55-58`. Phí tăng tuyến tính, không có `MAX_KM`.
- **Gợi ý sửa**: cấu hình bán kính tối đa (vd 10 km) trong Store Settings, quá thì 400.

### BUG-016 — Hết nguyên liệu không tự hết món, tồn kho âm (Trung bình · Kho)
- **Tái hiện**: đặt `Stock_Qty = 0` cho nguyên liệu #1 (định mức của Bạc Xỉu) ở CN1 → `GET /menu` → đặt + thanh toán 1 ly.
- **Mong đợi**: món báo hết hàng, không đặt được, tồn không âm.
- **Thực tế**: `outOfStock=false`, đặt được (201), tồn #1 = −0.01.
- **Nghi vấn**: `outOfStock` chỉ là cờ tay (`lib/menuEvents.ts`). `lib/inventory.ts:83` cộng trừ thẳng (`increment: qtyChange`), không chặn âm.
- **Gợi ý sửa**: tính "làm được bao nhiêu ly" từ tồn và định mức khi trả menu / khi định giá đơn. Chặn hoặc cảnh báo khi trừ làm tồn âm.

### BUG-017 — Phòng socket đơn hàng không xác thực (Trung bình · Realtime)
- **Tái hiện**: socket không token `emit("join","order:{id}")` cho đơn của người khác → thu ngân thanh toán.
- **Thực tế**: nhận `payment:success {"orderId":79,"totalAmount":38500,"pointsEarned":3800}`. Phòng `tracking:{id}` cũng mở tương tự (vị trí shipper).
- **Nghi vấn**: `backend-node/src/socket/handlers.ts` (khối `/^order:\d+$/`, `/^tracking:\d+$/`).
- **Gợi ý sửa**: dùng tên phòng kèm mã bí mật như phòng chat (`order:{id}:{secret}`), hoặc kiểm token khách / phiên.

### BUG-018 — Stored XSS trong bài đăng (Trung bình · Website)
- **Tái hiện**: Owner `POST /api/posts` với body `<img src=x onerror="alert(document.cookie)"><script>…`.
- **Thực tế**: 201, lưu nguyên. `frontend-app/src/pages/BlogDetail.tsx:51` render `dangerouslySetInnerHTML={{ __html: post.body }}` không lọc. Token khách ở `localStorage` có thể bị lấy.
- **Nghi vấn**: `routes/posts.ts:63` không gọi `sanitizeHtml` (pop up thì có: `popups.ts:140`).
- **Gợi ý sửa**: lọc bằng `lib/sanitizeHtml.ts` khi lưu và/hoặc `safeHtml` khi render.

### BUG-019 — Tạo voucher không kiểm dữ liệu (Trung bình · Voucher)
- **Tái hiện**:
  - `POST /api/vouchers/admin {discountValue:-50000, …}` → 201.
  - `startDate` sau `endDate` → 201.
- **Nghi vấn**: `routes/vouchers.ts:65-67`. Chỉ kiểm có giá trị.
- **Gợi ý sửa**: `discountValue > 0`, `quantity` nguyên ≥ 1 hoặc −1, `startDate < endDate`, giờ vàng 0–24.

### BUG-020 — KDS nhận trạng thái tuỳ ý (Trung bình · KDS)
- **Tái hiện**: `PATCH /api/kds/details/{id} {"kdsStatus":"Hacked"}` (token kitchen CN1).
- **Thực tế**: 200, `KDS_Status = Hacked`. Món rơi khỏi mọi cột KDS.
- **Nghi vấn**: `routes/orders.ts:531-532`. Chỉ kiểm có giá trị.
- **Gợi ý sửa**: whitelist `Waiting | Cooking | Ready | Served`.

### BUG-021 — Đánh giá trùng, ảnh không kiểm (Trung bình · Đánh giá)
- **Tái hiện**: đơn đã Paid, `POST /api/reviews` 2 lần → 201/201. `imageUrl: "javascript:alert(1)"` → 201. Trang `/about` tải `http://localhost:4100/javascript:alert(1)`.
- **Nghi vấn**: `routes/reviews.ts:34-43`.
- **Gợi ý sửa**: unique `(orderId)` hoặc kiểm đã có review. `imageUrl` chỉ nhận `/uploads/…` do server cấp.

### BUG-022 — Báo cáo ngày sai định dạng → 500 (Thấp · Báo cáo)
- **Tái hiện**: `GET /api/admin/reports/revenue?from=khong-phai-ngay&to=2026-13-45`.
- **Thực tế**: 500. Log: `RangeError: Invalid time value at addDaysYmd (lib/bizTime.ts:22)`.
- **Gợi ý sửa**: validate `YYYY-MM-DD` trong `bizRange`, sai thì 400.

### BUG-023 — Upload ảnh không kiểm nội dung (Thấp · Upload)
- **Tái hiện**: avatar `data:image/png;base64,` + base64 của `<svg onload=alert(1)>` → 200, lưu `/uploads/….png`.
- **Nghi vấn**: `lib/uploadImage.ts:9`. Chỉ regex tiền tố MIME. (Đã chặn đúng `text/html` và ảnh > 2,5MB.)
- **Gợi ý sửa**: kiểm magic bytes (PNG/JPEG/WebP/GIF) trước khi ghi.

### BUG-024 — Mật khẩu nhân viên tối thiểu 4 ký tự (Thấp · Nhân sự)
- `routes/admin.ts:387` `b.password.length < 4`. Khách thì yêu cầu ≥ 6. Nên thống nhất ≥ 6–8.

### BUG-025 — Thực đơn tràn ngang ở 390px (Thấp · Giao diện)
- **Tái hiện**: viewport 390×844, mở `/menu`.
- **Thực tế**: `scrollWidth` vượt 81px. Phần tử tràn: `label.c-filter-sel` / `select.c-input` (`frontend-app/src/pages/Menu.tsx:212,226`, CSS `customer.css:802` `width:auto`).
- **Gợi ý sửa**: cho hàng lọc `flex-wrap` hoặc `min-width:0; max-width:100%` cho select trên mobile.

### BUG-026 — Trùng thao tác thanh toán trả 500 (Thấp · POS)
- Xem BUG-004, lần chạy 1. Log `POST /api/pos/pay … Transaction failed due to a write conflict or a deadlock` (`pos.ts:200`). Nên bắt lỗi P2034 rồi retry, hoặc trả 409 "Đơn vừa được thanh toán".

## 4. Luồng ĐẠT

- Build backend (tsc), frontend (tsc -b, vite build).
- Đăng ký SĐT hợp lệ, tên tiếng Việt có dấu. Trùng SĐT → 409. Mật khẩu < 6 → 400. Đăng nhập sai → 401. `/auth/me` không lộ hash. Đổi mật khẩu rồi đăng nhập lại.
- Đặt món: giá do server tính (bỏ qua `unitPrice` gửi lên). Số lượng 0 / âm / lẻ / 100.000, giỏ rỗng, món không tồn tại, thiếu bàn đều bị chặn.
- Ân hạn: đơn tại bàn `Pending_Grace`, hủy trong hạn được, sau 15s worker chuyển `Confirmed`.
- Hủy đơn: khách khác, người lạ biết số bàn, thu ngân chi nhánh khác đều bị chặn. Đơn mang về đã Paid không hủy được.
- Giao hàng: chưa đăng nhập → 401. ≤ 3 km miễn phí ship. Phí ship do server tính. Đơn giao hàng không cho trả tiền mặt.
- VNPay IPN chữ ký sai bị từ chối (RspCode 97). MoMo IPN chữ ký sai → 400. Gọi xác nhận 3 lần song song chỉ tạo 1 Payment, điểm cộng 1 lần.
- Dùng điểm âm bị bỏ qua. Dùng điểm vượt giá trị đơn bị kẹp, tổng ≥ 0.
- Đánh giá: chặn đơn chưa thanh toán, chặn đơn người khác, rating ngoài 1–5.
- POS: mở ca, mở ca lần 2 → 409, phục vụ không mở được ca. Thu ngân CN2 không thanh toán được đơn CN1. Lịch sử bill CN2 không chứa đơn CN1.
- Ca & két:
  - Thu khác, phiếu chi bắt buộc ảnh, số tiền âm bị chặn, chi vượt quỹ chuyển "chờ duyệt", thu ngân không lập phiếu RENT.
  - Đếm lệch phải ghi lý do, thông báo đếm mù không lộ số dự kiến.
  - **Kết ca: dự kiến 100.000 = 0 + TM 70.000 + 50.000 − 20.000, lệch 0**. Có ghi audit log mở/đóng ca, phiếu thu chi.
- Voucher: đơn dưới tối thiểu, hết hạn, sai chi nhánh, ngoài giờ vàng đều bị chặn. Dùng hợp lệ trừ đúng 10.000đ.
- Mini game vòng quay: 10 người quay đồng thời giải còn 1 → đúng 1 người trúng, Won_Count không vượt Quantity. Hết giải rơi về ô không trúng. Hết lượt → 400. Chưa đăng nhập → 401.
- Phân quyền vai trò: cashier/waiter/kitchen/shipper/kho gọi API quản trị, báo cáo, audit, voucher admin, staff đều 403. Admin không đăng bài chuỗi. Token khách ↔ token nhân sự không dùng lẫn.
- Phân quyền chi nhánh:
  - Quản lý CN2 không sửa/khoá được nhân viên CN1. Pha chế CN2 không đổi món CN1. Phục vụ CN2 không gọi món/chuyển bàn CN1.
  - Danh sách nhân viên theo chi nhánh. Owner chọn chi nhánh không tồn tại → 400. Quản lý CN2 gửi `X-Store-Id=1` vẫn chỉ thấy CN2.
- Quản lý chi nhánh không nâng ai lên Admin, không tạo Owner. `/admin/customers` không lộ hash. Token nhân viên đã khoá bị từ chối.
- JWT ký sai, `alg=none`, ký bằng secret mặc định đều 401. Upload `text/html` bị chặn, ảnh > 2,5MB bị chặn. Tìm kiếm chuỗi SQL không lỗi. Chat bot nhận HTML không lỗi.
- Realtime: thu ngân CN1 nhận sự kiện đơn CN1, thu ngân CN2 không nhận. Socket không token join `pos/kds/admin_room` không nhận gì. Phục vụ không vào được `admin_room`.
- Kho: bán 2 ly trừ tồn đủ 6 nguyên liệu theo định mức, có phiếu `SELL` tham chiếu đơn.
- Báo cáo: doanh thu hôm nay = SUM(Payments) − phí ship trong CSDL (2.371.900đ). Tổng chuỗi = CN1 + CN2. Xuất CSV chạy.
- Hiệu năng: 16 API chính (menu, homepage, POS, KDS, dashboard, lợi nhuận, top món, khách, nhân viên, kho, két, audit, so sánh chi nhánh) đều < 1s.
- Giao diện: 12 trang khách × 390px & 1440px không lỗi console/JS/5xx; 11/12 trang × 2 cỡ không tràn ngang. Thêm giỏ từ chi tiết món, giỏ hiển thị đúng. Chuyển EN (nav + `html lang=en`). Chế độ tối. Đăng nhập UI 6 vai trò (cashier, admin, kitchen, owner, waiter, kho) vào trang chủ, không trắng trang, không lỗi console.

## 5. Rủi ro / đề xuất (chưa phải lỗi)

- `lib/jwt.ts:3` có secret mặc định `"dev-secret-change-me"` khi thiếu `JWT_SECRET`. Nên dừng server nếu thiếu biến này ở production.
- Tồn kho lưu số thực, cộng dồn sai số (`14.290000000000015`). Nên dùng `DECIMAL` hoặc làm tròn khi ghi.
- `GET /api/schedule/admin/all` trả SĐT của toàn bộ đồng nghiệp cho mọi vai trò (phục vụ, shipper…). Nên ẩn SĐT với nhân viên thường.
- ID khách và nhân viên đều cấp bằng `max+1` (`auth.ts:64`, `admin.ts:404`). Nên dùng AUTO_INCREMENT.
- Dữ liệu seed dùng ảnh Unsplash và ô bản đồ OSM bên ngoài. Môi trường chặn mạng ngoài bị `ERR_BLOCKED_BY_ORB` / `ERR_CONNECTION_RESET`, demo offline sẽ mất ảnh.
- `/api/takeaway/new` chuyển hướng về `FRONTEND_URL ?? "http://localhost:5173"` (`staffOps.ts:22-23`), không dùng `PUBLIC_APP_URL` như các chỗ khác. Đặt sai biến thì QR mang về trỏ nhầm.
- Bundle frontend có chunk > 500 kB. Nên tách `manualChunks` (tiptap, face-api, leaflet).
- Thanh toán online lưu voucher trong cột `cancelReason` (`VOUCHER:code:giá`). Dễ nhầm và trùng nghĩa, nên tách cột riêng.
- Logic xác nhận thanh toán bị lặp ở `sepay.ts:192+`, `vnpay.ts:138+`, `momo`, `pos.ts:82+`. Ba nơi khác nhau về kiểm trạng thái và voucher, là nguồn gốc của BUG-002/004/007/008. Nên gom về một hàm `markOrderPaid` duy nhất có khoá và điều kiện trạng thái.

## 6. CHƯA TEST (để phiên sau làm tiếp)

| Mục | Lý do / ghi chú |
|---|---|
| 22 Giao hàng: điều phối shipper tự động, online/offline, nhận/lấy/giao, tối ưu tuyến, thất bại → hoàn điểm | Chỉ dò quyền GET. Cần kịch bản dài với shipper + vị trí |
| 21 Mua hàng: đề nghị → báo giá → đơn mua → nhận hàng → trả NCC → công nợ | Chỉ dò quyền (đều yêu cầu đăng nhập đúng vai trò) |
| 20 Điều chuyển kho, hủy hàng hết hạn, kiểm kho mở/kết ca, phiếu xin nguyên liệu | Chưa test nghiệp vụ |
| 23 Lịch ca, đổi ca, nghỉ phép, chấm công, bảng lương, phiếu lương | Chỉ dò quyền. Nhân viên thường gọi được `/hr/*` nhưng chỉ thấy dữ liệu của mình (rỗng) |
| 16 Chuyển bàn, gộp bàn, tách bill, phân khu vực | Chỉ kiểm phục vụ CN2 không chuyển bàn CN1 |
| 24 Combo, giá theo chi nhánh, ẩn/trả lời đánh giá | Chưa test |
| 12 Chat nhân viên, khiếu nại, pop up (tối đa 3, tần suất), nút liên hệ theo chi nhánh | Chỉ kiểm chat bot không lỗi |
| 1 Khách vãng lai từ QR bàn, quên mật khẩu | Không thấy route quên mật khẩu trong code. QR bàn chưa chạy UI |
| 8 Lên hạng thành viên, hoàn điểm khi hoàn đơn | Chưa test |
| Mini game thẻ cào / hộp quà / lì xì | Dùng chung `pickPrize` với vòng quay (đã đạt). Chưa chạy riêng |
| JWT hết hạn | Cần ký token bằng secret thật. `jsonwebtoken` mặc định kiểm `exp` |

## Cách chạy lại

```bash
# CSDL test riêng (KHÔNG dùng coffee_shop_db)
docker exec cmn-mysql mysql -uroot -proot -e "CREATE DATABASE IF NOT EXISTS cmn_test; GRANT ALL ON cmn_test.* TO 'coffee'@'%';"
cd backend-node
export DATABASE_URL="mysql://coffee:coffee123@localhost:3307/cmn_test"
npx prisma db push && npx tsx prisma/seed.ts && npx tsx prisma/seed-store2.ts && npx tsx prisma/seed-staff.ts \
  && npx tsx prisma/seed-formulas.ts && npx tsx prisma/game-seed.ts && npx tsx prisma/popup-seed.ts \
  && npx tsx prisma/contact-seed.ts && npx tsx prisma/site-seed.ts
PORT=4100 npx tsx src/index.ts                     # backend test

cd ../frontend-app                                 # build riêng, KHÔNG chạy Vite dev thứ hai
VITE_API_URL=http://localhost:4100 npx vite build --outDir <thư mục tạm>
npx vite preview --outDir <thư mục tạm> --port 4173

cd ../tests/qa && npm install                      # playwright-core (dùng Edge có sẵn)
node 01-routes-inventory.mjs && node 02-authz-probe.mjs && node 03-customer-orders.mjs \
  && node 04-pos-cash-voucher-games.mjs && node 05-staff-authz-security.mjs && node 06-realtime.mjs \
  && node 07-inventory-reports-perf.mjs && node 08-ui-smoke.mjs
```

Kết quả từng kiểm tra ghi ở `tests/qa/output/*.json` (không commit).
