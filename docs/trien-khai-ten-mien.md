# Đưa TD Coffee lên tên miền — cài đặt VPS, HTTPS và cổng thanh toán

Tiếp nối [huong-dan-thue-vps.md](huong-dan-thue-vps.md) (thuê VPS, mua và trỏ tên miền). Tài liệu này đi từ lúc đã `ssh` vào được VPS Ubuntu 24.04 và tên miền đã trỏ về IP.

Ví dụ dưới đây dùng tên miền `tdcoffee.id.vn`. Hãy thay bằng tên miền của bạn.

---

## 1. Kiến trúc nên dùng: một tên miền, nginx chia đường

```
https://tdcoffee.id.vn
  nginx (HTTPS Let's Encrypt)
    ├─ /             → frontend-app/dist (file tĩnh, SPA)
    ├─ /api/*        → backend :4000 (PM2)
    ├─ /socket.io/*  → backend :4000 (WebSocket)
    └─ /uploads/*    → backend :4000 (ảnh upload)
  MySQL 8 (Docker, chỉ 127.0.0.1)
```

Vì sao nên dùng **một** tên miền (không tách `api.` riêng):

- Frontend gọi `/api` cùng tên miền, nên **không cần đặt `VITE_API_URL`** và không vướng CORS hay lỗi Mixed Content.
- MoMo tự lấy `PUBLIC_APP_URL + /api/momo/ipn` làm IPN, nên chỉ đúng khi `/api` nằm cùng tên miền với web.
- Chỉ cần một chứng chỉ HTTPS.

---

## 2. Cài phần mềm trên VPS

```bash
# Giờ Việt Nam cho cả máy (báo cáo, chấm công, log)
sudo timedatectl set-timezone Asia/Ho_Chi_Minh

# Node 22 LTS, nginx, certbot, docker
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx docker.io docker-compose-v2 git
sudo npm i -g pm2

# Tường lửa: chỉ mở SSH, HTTP, HTTPS
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

---

## 3. MySQL — KHÔNG dùng nguyên `docker-compose.yml` của máy dev

File dev đang để `ports: "3307:3306"` và mật khẩu `root` / `coffee123`. Trên VPS, Docker **vượt qua `ufw`**, nên cấu hình này đưa DB ra internet với mật khẩu yếu.

Tạo `/opt/tdcoffee/docker-compose.prod.yml`:

```yaml
services:
  mysql:
    image: mysql:8.0
    container_name: cmn-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: coffee_shop_db
      MYSQL_USER: coffee
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
      TZ: Asia/Ho_Chi_Minh
    ports:
      - "127.0.0.1:3307:3306"   # chỉ nghe nội bộ
    volumes:
      - mysql_data:/var/lib/mysql
    command: --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
volumes:
  mysql_data:
```

```bash
cd /opt/tdcoffee
printf "MYSQL_ROOT_PASSWORD=%s\nMYSQL_PASSWORD=%s\n" "$(openssl rand -base64 24)" "$(openssl rand -base64 24)" > .env
sudo docker compose -f docker-compose.prod.yml up -d
```

Redis không cần chạy vì code không dùng tới.

---

## 4. Lấy code và build

```bash
cd /opt/tdcoffee
git clone <repo> app && cd app
git checkout main          # hoặc nhánh muốn chạy

cd backend-node && npm ci && npx prisma generate && npm run build
cd ../frontend-app && npm ci && npm run build      # KHÔNG cần VITE_API_URL khi dùng 1 tên miền
```

- Frontend build production mà để trống `VITE_API_URL` thì gọi API **cùng tên miền**. Bản cũ trỏ `http://localhost:4000` và đã được sửa ngày 01/11/2026.
- Chỉ đặt `VITE_API_URL=https://api.ten-mien` khi API nằm ở tên miền khác.

### Dữ liệu ban đầu

- **Chuyển dữ liệu đang có:** trên máy dev chạy `docker exec cmn-mysql mysqldump -uroot -proot coffee_shop_db > dump.sql`, chép lên VPS rồi `mysql … < dump.sql`. Sau đó `npx prisma db push` để thêm bảng/cột mới.
- **Bắt đầu sạch:** `npx prisma db push`, rồi chạy các script seed như trong `docs/qa/test-report.md`.
- Đổi mật khẩu mọi tài khoản mẫu (owner, admin…) trước khi mở cho người ngoài.

### Ảnh upload

Backend lưu ảnh ở `<thư mục chạy>/uploads`. Hãy để ngoài mã nguồn để deploy lại không mất ảnh:

```bash
sudo mkdir -p /opt/tdcoffee/uploads && ln -s /opt/tdcoffee/uploads /opt/tdcoffee/app/backend-node/uploads
```

---

## 5. File `.env` production của backend

`/opt/tdcoffee/app/backend-node/.env` (không commit lên git):

```ini
DATABASE_URL="mysql://coffee:<MYSQL_PASSWORD>@127.0.0.1:3307/coffee_shop_db?connect_timeout=30&pool_timeout=30&connection_limit=10"
PORT=4000
NODE_ENV=production
JWT_SECRET=<openssl rand -base64 48>
PUBLIC_APP_URL=https://tdcoffee.id.vn        # dùng cho link QR bàn, returnUrl, IPN MoMo
FRONTEND_URL=https://tdcoffee.id.vn
BIZ_TZ_OFFSET_MIN=420

# VietQR (chuyển khoản tay) — PHẢI điền, nếu trống code dùng số tài khoản mặc định viết sẵn trong code
VIETQR_BANK_ID=mbbank
VIETQR_ACCOUNT_NO=<số tài khoản>
VIETQR_ACCOUNT_NAME=<TÊN CHỦ TÀI KHOẢN>

# VNPay
VNPAY_TMN_CODE=...
VNPAY_HASH_SECRET=...
VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html   # thật: https://pay.vnpay.vn/vpcpay.html

# SePay (cổng thanh toán)
SEPAY_ENV=sandbox            # thật: production
SEPAY_MERCHANT_ID=...
SEPAY_SECRET_KEY=...

# MoMo
MOMO_PARTNER_CODE=...
MOMO_ACCESS_KEY=...
MOMO_SECRET_KEY=...
MOMO_ENDPOINT=https://test-payment.momo.vn/v2/gateway/api/create   # thật: https://payment.momo.vn/v2/gateway/api/create
# MOMO_IPN_URL=  (bỏ trống → https://tdcoffee.id.vn/api/momo/ipn)

# Web Push, đăng nhập Google/Facebook: xem .env.example và docs/social-login-setup.md
```

> **Không bao giờ** đặt `NODE_ENV=test` hay `SOCIAL_TEST_SECRET` trên VPS. Hai biến này bật chế độ nhận token giả, chỉ dùng cho script kiểm thử.

Chạy backend:

```bash
cd /opt/tdcoffee/app/backend-node
pm2 start dist/index.js --name tdcoffee-api --time
pm2 save && pm2 startup     # tự chạy lại khi VPS khởi động
```

---

## 6. Nginx + HTTPS

`/etc/nginx/sites-available/tdcoffee`:

```nginx
server {
    listen 80;
    server_name tdcoffee.id.vn www.tdcoffee.id.vn;

    root /opt/tdcoffee/app/frontend-app/dist;
    index index.html;
    client_max_body_size 8m;            # backend nhận ảnh base64 tới 6 MB

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;   # VNPay cần IP khách (vnp_IpAddr)
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /uploads/ {
        proxy_pass http://127.0.0.1:4000;
    }
    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;       # POS / bếp giữ kết nối lâu
    }
    # SPA: mọi đường dẫn khác trả index.html (/menu, /order/42/checkout, /app/...)
    location / {
        try_files $uri $uri/ /index.html;
    }
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/tdcoffee /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d tdcoffee.id.vn -d www.tdcoffee.id.vn   # tự thêm HTTPS + tự gia hạn
```

Kiểm tra: `curl https://tdcoffee.id.vn/api/health` phải trả `{"ok":true,…,"database":"up"}`.

---

## 7. Cổng thanh toán khi chạy trên tên miền

### Có bắt buộc tài khoản thật không?

| Cổng | Demo / bảo vệ đồ án | Thu tiền thật |
|---|---|---|
| **VNPay** | **Sandbox** miễn phí: đăng ký tại sandbox.vnpayment.vn, thanh toán bằng thẻ test NCB | Ký hợp đồng với VNPay, cần **đăng ký kinh doanh**. VNPay cấp `TmnCode` / `HashSecret` thật và cấu hình IPN cho bạn |
| **SePay** (cổng thanh toán) | **Sandbox** miễn phí: đăng ký my.sepay.vn → kích hoạt Payment Gateway, không cần tài khoản ngân hàng thật | Liên kết tài khoản ngân hàng thật → *Switch to Production* → nhận `merchant_id` / `secret_key` production (khác sandbox) |
| **MoMo** | **Test** dùng bộ khoá công khai trong `routes/momo.ts`, app MoMo test | Tài khoản đối tác tại business.momo.vn, dành cho **doanh nghiệp / hộ kinh doanh** (cần giấy phép kinh doanh), không dùng tài khoản MoMo cá nhân |
| **VietQR** (QR chuyển khoản tay) | Dùng tài khoản ngân hàng cá nhân thật, khách chuyển là tiền vào thật | Như cột bên trái. Lưu ý: không tự xác nhận, thu ngân phải xác nhận |

**Kết luận:** chạy demo trên tên miền thật với **sandbox** hoàn toàn được, không cần tài khoản thật. Sandbox chỉ cần đúng ba thứ: HTTPS, khai báo IPN URL, và khoá sandbox trong `.env`. Muốn thu tiền thật thì VNPay và MoMo cần đăng ký kinh doanh; SePay thì liên kết ngân hàng thật (điều kiện hồ sơ cụ thể nên hỏi SePay).

### Khai báo IPN (server-to-server) cho từng cổng

IPN là cách cổng thanh toán báo cho backend "đã trả tiền". Đây là chỗ hay hỏng nhất khi lên tên miền, vì `localhost` không nhận được IPN.

| Cổng | URL cần khai báo | Khai báo ở đâu |
|---|---|---|
| VNPay | `https://tdcoffee.id.vn/api/vnpay/ipn` | Sandbox: merchant portal sandbox → *Thông tin tài khoản* → cấu hình Terminal (IPN URL). Thật: gửi URL cho VNPay cấu hình |
| SePay | `https://tdcoffee.id.vn/api/sepay/ipn` | my.sepay.vn → *Cổng thanh toán* → *Cấu hình* → *IPN* |
| MoMo | Tự gửi theo từng giao dịch (`PUBLIC_APP_URL/api/momo/ipn`) | Không cần khai báo, chỉ cần `PUBLIC_APP_URL` đúng tên miền HTTPS |

URL trả khách về sau khi thanh toán (`/order/:id/checkout`) do code tự tạo theo tên miền đang mở, nên không cần khai báo.

### Khi IPN chưa tới thì sao

- **VNPay, SePay:** có đường dự phòng. Khi khách quay về trang checkout, frontend gửi kết quả lên. VNPay được kiểm chữ ký HMAC-SHA512, SePay thì backend tự tra hoá đơn trên SePay. Vì vậy đơn vẫn chuyển "Đã thanh toán" dù IPN chậm.
- **MoMo:** **không** có đường dự phòng. Nếu IPN không tới được (sai `PUBLIC_APP_URL`, nginx chặn `/api`), đơn sẽ đứng ở trạng thái chờ dù khách đã trả tiền.

---

## 8. Kết quả rà soát code thanh toán (01/11/2026)

### Đã sửa

| Vấn đề | Hậu quả nếu không sửa |
|---|---|
| VNPay lấy `vnp_CreateDate` theo **giờ máy chủ**. VPS / Docker thường chạy UTC, lệch 7 tiếng so với giờ VN mà VNPay dùng | Khách bấm thanh toán VNPay bị báo giao dịch quá hạn. Nay cố định GMT+7 và thêm `vnp_ExpireDate` (15 phút) |
| Frontend production thiếu `VITE_API_URL` thì gọi `http://localhost:4000` | Trên tên miền, mọi API và socket gọi vào máy của khách, nên trang không tải được. Nay mặc định gọi cùng tên miền |

### Còn lại — cần biết khi triển khai

| Vấn đề | Mức | Cách xử lý |
|---|---|---|
| `docker-compose.yml` dev mở MySQL ra mọi địa chỉ, mật khẩu yếu | **Cao trên VPS** | Dùng file `docker-compose.prod.yml` ở mục 3 |
| Thiếu `VIETQR_ACCOUNT_NO` thì QR của VNPay dùng số tài khoản mặc định viết sẵn trong `routes/vnpay.ts` | Trung bình | Luôn điền `VIETQR_*` trong `.env` production |
| SePay IPN: code kiểm header `X-SePay-Signature`, nhưng tài liệu cổng thanh toán SePay dùng `X-Secret-Key` (khi chọn kiểu xác thực SECRET_KEY) | Thấp | Không mất an toàn vì backend luôn tra lại hoá đơn trên SePay trước khi ghi nhận. Có thể thêm kiểm `X-Secret-Key` cho chặt |
| SePay IPN loại `TRANSACTION_VOID` (huỷ giao dịch) không được xử lý riêng, backend trả 400 | Thấp | Đơn không bị đánh dấu sai, chỉ SePay gửi lại vài lần |
| `returnUrl` VNPay / SePay lấy theo header `Origin` của request (để chạy được qua IP LAN khi dev) | Thấp | Trên production nên chỉ nhận origin trùng `PUBLIC_APP_URL` |
| CORS `origin: true` (chấp nhận mọi web gọi API) | Thấp | API dùng token Bearer, không dùng cookie. Có thể giới hạn về tên miền thật |
| MoMo không có xác nhận dự phòng phía trình duyệt | Trung bình nếu dùng MoMo | Kiểm IPN MoMo trên tên miền (mục 9) |
| Express chưa bật `trust proxy`, nên sau nginx `req.ip` luôn là 127.0.0.1 | Thấp | Chỉ ảnh hưởng IP trong nhật ký đăng nhập khách. Thêm `app.set("trust proxy", 1)` khi chạy sau nginx |

---

## 9. Thử sau khi lên tên miền (sandbox)

1. `https://tdcoffee.id.vn/api/health` trả `database: up`.
2. Mở web trên điện thoại (4G, không dùng wifi nhà): thực đơn, giỏ hàng, chi nhánh.
3. Đặt đơn mang về và thử từng cổng:
   - **VNPay:** thẻ test NCB `9704198526191432198`, tên `NGUYEN VAN A`, ngày phát hành `07/15`, OTP `123456` (theo trang sandbox VNPay, kiểm tra lại trên trang của họ).
   - **SePay:** làm theo hướng dẫn sandbox trên my.sepay.vn.
   - **MoMo test:** dùng app MoMo bản test và tài khoản test trong comment `routes/momo.ts`.
   - Sau mỗi lần: đơn chuyển *Đã thanh toán*, POS kêu thông báo, bếp nhận món, khách được cộng điểm.
4. Xem log để chắc IPN đã tới (không chỉ đường dự phòng): `pm2 logs tdcoffee-api | grep -i "ipn"`.
5. Kiểm tra socket: mở POS ở máy khác, đặt đơn từ điện thoại, POS phải hiện ngay.
6. Camera chấm công và định vị giao hàng chỉ chạy trên HTTPS. Thử trên điện thoại thật.

## 10. Cập nhật code về sau

```bash
cd /opt/tdcoffee/app && git pull
cd backend-node && npm ci && npx prisma generate && npx prisma db push && npm run build && pm2 restart tdcoffee-api
cd ../frontend-app && npm ci && npm run build
```

`prisma db push` tự dừng nếu thay đổi có thể làm mất dữ liệu. Khi đó **không** thêm `--accept-data-loss` mà sao lưu trước rồi xử lý tay. Sao lưu DB hằng đêm bằng cron:

```bash
0 2 * * * docker exec cmn-mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" coffee_shop_db' | gzip > /opt/tdcoffee/backup/db-$(date +\%F).sql.gz
```
