# Hướng dẫn thuê VPS & tên miền cho TD Coffee

Tài liệu này hướng dẫn chuẩn bị **máy chủ (VPS)** và **tên miền** để đưa hệ thống TD Coffee lên internet, sau đó gắn CI/CD: mỗi lần `git push` lên nhánh `main` thì VPS tự cập nhật.

> Giá và chương trình ưu đãi của các nhà cung cấp thay đổi thường xuyên — luôn kiểm tra lại trên trang của họ lúc đăng ký.

---

## Mục lục

1. [Hệ thống cần những gì](#1-hệ-thống-cần-những-gì)
2. [Chọn cấu hình VPS](#2-chọn-cấu-hình-vps)
3. [Chọn nhà cung cấp](#3-chọn-nhà-cung-cấp)
4. [Tạo khoá SSH trên máy Windows](#4-tạo-khoá-ssh-trên-máy-windows)
5. [Tạo VPS](#5-tạo-vps)
6. [Đăng nhập & kiểm tra VPS](#6-đăng-nhập--kiểm-tra-vps)
7. [Mua & trỏ tên miền](#7-mua--trỏ-tên-miền)
8. [Những gì sẽ chạy trên VPS](#8-những-gì-sẽ-chạy-trên-vps)
9. [Bảo mật — những điều không được làm](#9-bảo-mật--những-điều-không-được-làm)
10. [Checklist trước khi cài đặt](#10-checklist-trước-khi-cài-đặt)
11. [Câu hỏi thường gặp](#11-câu-hỏi-thường-gặp)

---

## 1. Hệ thống cần những gì

| Thành phần | Vai trò | Ghi chú |
|---|---|---|
| **Backend** (Node.js, Express, Socket.io) | API, thanh toán, realtime cho POS / bếp / shipper | Chạy liên tục bằng PM2 |
| **Frontend** (React, Vite) | Web khách, ERP nhân sự, POS | Build ra file tĩnh, Nginx phục vụ |
| **MySQL 8** | Cơ sở dữ liệu | Chạy trong Docker, chỉ nghe nội bộ |
| **Nginx** | Cổng vào duy nhất, HTTPS | Chuyển `/api`, `/socket.io`, `/uploads` vào backend |
| **Tên miền + HTTPS** | Bắt buộc cho VNPay / SePay gọi lại, camera chấm công, định vị | Chứng chỉ Let's Encrypt miễn phí |

**Không cần** đưa lên: `ai-service-python` (chỉ là bản giả lập, backend tự bỏ qua khi không có) và Redis (không dùng tới).

---

## 2. Chọn cấu hình VPS

Việc **build** chạy trên GitHub Actions (miễn phí), VPS chỉ việc **chạy** nên không cần mạnh.

| | Tối thiểu | Khuyên dùng |
|---|---|---|
| CPU | 1 vCPU | **2 vCPU** |
| RAM | 1 GB (phải bật swap) | **2 GB** |
| Ổ cứng | 20 GB SSD | **40 GB SSD** (ảnh upload, bản sao lưu DB) |
| Hệ điều hành | Ubuntu 22.04 LTS | **Ubuntu 24.04 LTS** |
| Vị trí đặt máy | Singapore | **Việt Nam** (khách ở VN truy cập nhanh nhất) |
| IP | 1 IPv4 tĩnh | |

> Chọn đúng **Ubuntu LTS** — script cài đặt sẽ viết cho Ubuntu. Không chọn Windows Server, CentOS, hay bản có sẵn "control panel" (cPanel, aaPanel…).

---

## 3. Chọn nhà cung cấp

### Cách 1 — Nhà cung cấp Việt Nam (đơn giản nhất)

Ví dụ: **Vietnix, AZDIGI, TinoHost, BKNS, Viettel IDC, iNET**.

- ✅ Thanh toán chuyển khoản / ví điện tử, **không cần thẻ quốc tế**
- ✅ Máy đặt tại Việt Nam → nhanh, hỗ trợ tiếng Việt
- ✅ Thuê theo tháng, hết đồ án thì ngừng
- ⚠️ Gói 2 GB RAM thường vài trăm nghìn đồng / tháng (tuỳ nơi, tuỳ khuyến mãi)

Khi so sánh các gói, nhìn vào: **RAM, ổ SSD/NVMe, có IPv4 riêng, có cho chọn Ubuntu 24.04, có snapshot / backup không**.

### Cách 2 — Ưu đãi sinh viên (gần như miễn phí trong thời gian làm đồ án)

| Chương trình | Điều kiện thường gặp | Ghi chú |
|---|---|---|
| **GitHub Student Developer Pack** | Email trường hoặc thẻ sinh viên | Thường có credit **DigitalOcean**; DigitalOcean có thể yêu cầu thẻ/PayPal để xác minh |
| **Azure for Students** | Email trường | Thường cấp credit **không cần thẻ** |

- ✅ Miễn phí / rất rẻ trong thời hạn credit
- ⚠️ Máy đặt ở Singapore (chậm hơn VN một chút, vẫn ổn)
- ⚠️ Hết credit là bị tính tiền / tắt máy — nhớ đặt lời nhắc
- ⚠️ Điều kiện thay đổi theo thời gian, đọc kỹ trước khi đăng ký

### Gợi ý

> Có email trường → thử **GitHub Student Pack** trước. Vướng thẻ hoặc muốn nhanh gọn → **thuê VPS Việt Nam theo tháng**.

---

## 4. Tạo khoá SSH trên máy Windows

Khoá SSH dùng để đăng nhập VPS an toàn hơn mật khẩu. Làm **trước** khi tạo VPS.

Mở **PowerShell** và chạy:

```powershell
ssh-keygen -t ed25519 -C "tdcoffee-vps"
```

- Hỏi đường dẫn lưu → nhấn **Enter** (mặc định `C:\Users\<tên>\.ssh\id_ed25519`)
- Hỏi passphrase → có thể đặt (nên đặt) hoặc nhấn Enter để bỏ qua

Xem **khoá công khai** (phần được phép chia sẻ):

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

Kết quả dạng:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA...xyz tdcoffee-vps
```

→ Copy **cả dòng** này, dán vào ô **SSH Key** khi tạo VPS.

| File | Là gì | Được chia sẻ? |
|---|---|---|
| `id_ed25519.pub` | Khoá **công khai** | ✅ Dán lên nhà cung cấp VPS, GitHub |
| `id_ed25519` (không đuôi) | Khoá **bí mật** | ❌ **Không bao giờ** gửi cho ai |

---

## 5. Tạo VPS

Trên trang nhà cung cấp, thường gồm các bước:

1. **Chọn gói** theo [mục 2](#2-chọn-cấu-hình-vps)
2. **Hệ điều hành:** Ubuntu **24.04 LTS** (bản 64-bit, không kèm panel)
3. **Vị trí:** Việt Nam hoặc Singapore
4. **Xác thực:** chọn **SSH Key** và dán khoá công khai ở [mục 4](#4-tạo-khoá-ssh-trên-máy-windows)
   - Nếu chỉ có tuỳ chọn mật khẩu root → đặt mật khẩu mạnh (≥ 16 ký tự), sau này sẽ chuyển sang khoá SSH
5. **Hostname:** ví dụ `tdcoffee`
6. Bật **backup / snapshot** nếu rẻ (rất hữu ích khi lỡ tay làm hỏng)
7. Thanh toán → đợi vài phút → nhận **địa chỉ IP** (ví dụ `103.x.x.x`)

---

## 6. Đăng nhập & kiểm tra VPS

Từ PowerShell:

```powershell
ssh root@103.x.x.x
```

- Lần đầu hỏi `Are you sure you want to continue connecting?` → gõ `yes`
- Thấy dấu nhắc `root@tdcoffee:~#` là thành công

Chạy vài lệnh kiểm tra rồi ghi lại kết quả:

```bash
lsb_release -d      # phiên bản Ubuntu
free -h             # RAM
df -h /             # dung lượng ổ
nproc               # số CPU
```

Gõ `exit` để thoát.

> Không vào được? Kiểm tra: đúng IP, VPS đã "Running", khoá SSH dán đúng (cả dòng), mạng công ty/trường có chặn cổng 22 không.

---

## 7. Mua & trỏ tên miền

### Vì sao cần tên miền

- **HTTPS** chỉ cấp được cho tên miền → không có HTTPS thì **VNPay / SePay không gọi lại được**, trình duyệt chặn **camera** (chấm công khuôn mặt) và **định vị** (giao hàng, chấm công GPS)
- Khách nhớ `tdcoffee.id.vn` dễ hơn một dãy IP

### Mua ở đâu

Các nhà đăng ký tại Việt Nam: **iNET, Mắt Bão, PA Việt Nam, Tenten, Nhân Hòa…**

| Đuôi | Ghi chú |
|---|---|
| `.id.vn` | Dành cho cá nhân, thường rất rẻ; có thời điểm có chương trình miễn phí năm đầu cho người trẻ |
| `.io.vn` | Tương tự, rẻ |
| `.com` / `.vn` | Đắt hơn, chuyên nghiệp hơn |

Đăng ký tên miền `.vn` cần khai báo thông tin chủ thể (CCCD) theo quy định.

### Trỏ tên miền về VPS

Vào **Quản lý DNS** của tên miền, thêm 2 bản ghi:

| Loại | Tên (Host) | Giá trị | TTL |
|---|---|---|---|
| `A` | `@` | IP của VPS | mặc định |
| `A` | `www` | IP của VPS | mặc định |

Đợi vài phút đến vài giờ, kiểm tra trên PowerShell:

```powershell
nslookup tdcoffee.id.vn
```

Ra đúng IP của VPS là xong.

---

## 8. Những gì sẽ chạy trên VPS

Sau khi có VPS + tên miền, phần cài đặt sẽ có **script viết sẵn** — bạn chỉ chạy, không cần cài tay từng thứ.

```
Bạn git push lên main
   └─ GitHub Actions (miễn phí):
        1. Kiểm tra kiểu + build backend & frontend
           → lỗi thì dừng, VPS giữ nguyên bản đang chạy
        2. Gửi bản build lên VPS qua SSH
        3. Trên VPS: cài thư viện → cập nhật cấu trúc DB (an toàn) → khởi động lại backend

VPS:
   Nginx (HTTPS, Let's Encrypt)
     ├─ /                       → giao diện web (file tĩnh)
     ├─ /api, /uploads          → backend Node.js (PM2, cổng 4000 nội bộ)
     └─ /socket.io              → backend (realtime)
   MySQL 8 (Docker, chỉ nghe 127.0.0.1)
   Sao lưu DB tự động mỗi đêm
   Múi giờ Asia/Ho_Chi_Minh (báo cáo ngày, chấm công, lương đúng giờ VN)
```

Một số điều cần biết:

- **Dữ liệu trên VPS không bị ghi đè** khi deploy. Deploy chỉ cập nhật code và **thêm** bảng / cột mới; thay đổi có thể làm mất dữ liệu sẽ bị chặn lại để xử lý thủ công.
- **Ảnh upload** lưu ở thư mục cố định ngoài mã nguồn → deploy không làm mất ảnh.
- CI/CD chạy theo nhánh **`main`** → cần gộp nhánh `feat/chain-stores` vào `main` trước.

---

## 9. Bảo mật — những điều không được làm

| ❌ Không | ✅ Thay vào đó |
|---|---|
| Gửi mật khẩu root, khoá bí mật `id_ed25519` qua chat / email | Chỉ chia sẻ **khoá công khai** `.pub` |
| Commit file `.env` lên GitHub | `.env` chỉ nằm trên VPS (đã có trong `.gitignore`) |
| Dán key VNPay / SePay / JWT vào code | Để trong `.env` trên VPS hoặc **GitHub › Settings › Secrets** |
| Mở cổng MySQL (3306/3307) ra internet | MySQL chỉ nghe `127.0.0.1` |
| Dùng mật khẩu yếu cho DB, tài khoản Owner | Mật khẩu ngẫu nhiên ≥ 16 ký tự |
| Để `JWT_SECRET` mặc định | Sinh chuỗi ngẫu nhiên dài |

Sinh chuỗi ngẫu nhiên an toàn trên PowerShell (dùng cho `JWT_SECRET`, mật khẩu DB):

```powershell
$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

---

## 10. Checklist trước khi cài đặt

- [ ] Đã tạo khoá SSH, giữ khoá bí mật an toàn
- [ ] Đã có VPS **Ubuntu 24.04 LTS**, **≥ 2 GB RAM** (hoặc 1 GB + chấp nhận bật swap)
- [ ] `ssh root@<IP>` vào được
- [ ] Đã ghi lại: IP, phiên bản Ubuntu, RAM, dung lượng ổ
- [ ] Đã mua tên miền, trỏ bản ghi `A` (`@` và `www`) về IP, `nslookup` ra đúng IP
- [ ] Quyết định dữ liệu ban đầu: **chuyển dữ liệu hiện tại** lên hay **bắt đầu sạch** (dữ liệu mẫu)
- [ ] Đã gộp `feat/chain-stores` vào `main` (hoặc quyết định deploy theo nhánh nào)
- [ ] Chuẩn bị (không gửi ai): key VNPay sandbox, SePay, số tài khoản VietQR

**Thông tin cần gửi để làm tiếp:** IP, phiên bản Ubuntu + RAM, tên miền, lựa chọn dữ liệu ban đầu.

---

## 11. Câu hỏi thường gặp

**Chưa có tên miền thì chạy bằng IP được không?**
Được để thử, nhưng chỉ có HTTP: VNPay/SePay không gọi lại được, camera chấm công và định vị bị trình duyệt chặn trên điện thoại. Nên có tên miền trước khi demo.

**VPS 1 GB RAM có chạy nổi không?**
Chạy được vì phần build làm trên GitHub. Cần bật swap 2 GB (script sẽ tự bật). Nếu tiền không quá chênh, chọn 2 GB cho thoải mái.

**Lỡ deploy bản lỗi thì sao?**
Bản build lỗi bị GitHub Actions chặn trước, không lên VPS. Nếu lên rồi mới phát hiện lỗi, có thể deploy lại commit trước đó (sẽ có hướng dẫn kèm script).

**Có tốn tiền GitHub Actions không?**
Repo công khai: miễn phí. Repo riêng tư: có hạn mức phút miễn phí mỗi tháng, đủ cho đồ án.

**Hết đồ án muốn tắt thì sao?**
Tải bản sao lưu DB + thư mục ảnh về máy, rồi xoá VPS trên trang nhà cung cấp (VPS chạy là tính tiền kể cả khi không dùng). Tên miền vẫn giữ tới hết hạn.
