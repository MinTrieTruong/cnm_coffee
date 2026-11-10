# Đề xuất sắp xếp lại menu dashboard quản trị

Áp dụng cho sidebar desktop và danh sách "Thêm" trên điện thoại (cùng dựng từ `frontend-app/src/apps/sidebar.ts`). Ảnh chụp là góc nhìn **Quản lý chi nhánh (Admin)**.

## 1. Vì sao đang lộn xộn

Sidebar hiện gom **cả một app** vào một nhóm (`SIDEBAR_GROUPS` trong `sidebar.ts`), nên mục nào thuộc app nào là dính theo app đó, kể cả khi không cùng nghĩa:

| Vấn đề | Ví dụ trên ảnh |
|---|---|
| Nhóm "Sản phẩm" = app Thực đơn + app Bếp, nên lẫn đủ thứ | Voucher, Khách hàng, Đánh giá, Khách tìm kiếm, Thống kê pha chế nằm chung với Thực đơn |
| "Tổng quan" chứa việc không phải tổng quan | Khiếu nại khách, Đề xuất chi nhánh |
| Màn hình làm ca bị đẩy xuống **cuối cùng** ("Theo dõi ca") | Thu ngân, Sơ đồ bàn, KDS, Đơn giao hàng — thứ quản lý dùng nhiều nhất |
| "Bán hàng" chỉ còn 2 mục cài đặt | Bàn & khu vực, Mã QR (là cấu hình, không phải bán hàng) |
| Báo cáo tiền rải ở 2 nơi | Doanh thu, Lợi nhuận ở Tổng quan; Lãi lỗ, Báo cáo ca ở Tài chính |
| Đồ của trang khách rải ở 3 nhóm | Pop up (CRM), Banner (Website), Nút liên hệ (Cấu hình) |
| Việc quản lý lẫn việc cá nhân trong Nhân sự, menu lồng 2 tầng, tên trùng | "Bảng lương › Bảng lương", "Giao việc" cạnh "Việc được giao" |

## 2. Cấu trúc đề xuất (góc nhìn Quản lý chi nhánh)

Thứ tự từ trên xuống theo **tần suất dùng trong ngày**: làm ca → hàng & món → khách → người → tiền → cài đặt.

1. **Tổng quan**
   - Bảng điều khiển
   - Thông báo
   - Gửi thông báo *(từ Nhân sự lên)*
   - Đề xuất chi nhánh *(gửi Chủ chuỗi)*
2. **Vận hành ca** *(thay "Theo dõi ca", đưa lên đầu)*
   - Thu ngân · Sơ đồ bàn · KDS · Trạng thái món · Đơn giao hàng · Tin nhắn
3. **Thực đơn**
   - Thực đơn chi nhánh · Công thức & giá vốn · Đề xuất món
   - (Chủ chuỗi thấy thêm: Danh mục, Combo)
4. **Kho & mua hàng** *(giữ nguyên, đã hợp lý)*
   - Tồn kho · Cần hàng gấp · Kiểm kê · Sổ hao hụt · Đơn mua hàng
5. **Khách hàng & khuyến mãi** *(thay "CRM" và phần khách trong "Sản phẩm")*
   - Chăm sóc: Đánh giá · Khiếu nại khách · Liên hệ từ khách
   - Khuyến mãi: Voucher · Mini game · Trúng thưởng · Quà tặng hiện vật
   - (Chủ chuỗi thấy thêm: Khách hàng, Ưu đãi số lượng)
6. **Nhân sự** *(chỉ việc của quản lý, bỏ lồng 2 tầng)*
   - Nhân viên · Giao việc · Xếp lịch tháng · Cảnh báo chấm công · Duyệt đơn từ · Bảng lương · Cấu hình ca & chấm công
7. **Tài chính**
   - Két & quỹ · Phiếu thu chi · Báo cáo ca · Báo cáo cuối ngày · Công nợ NCC
8. **Báo cáo** *(gom mọi màn "xem số")*
   - Doanh thu · Lợi nhuận · Lãi lỗ · Thống kê pha chế · Khách tìm kiếm
   - (Chủ chuỗi thấy thêm: So sánh chi nhánh)
9. **Website**
   - Banner · Pop up · Nút liên hệ
   - (Chủ chuỗi thấy thêm: Bài đăng, Giao diện, Thông tin công ty)
10. **Cấu hình**
    - Chi nhánh · Bàn & khu vực · Mã QR · Nhật ký hệ thống
11. **Của tôi** *(việc cá nhân, cuối menu)*
    - Chấm công · Lịch cá nhân · Việc được giao · Phiếu lương của tôi · Đơn từ của tôi

Nhân viên (thu ngân, pha chế, phục vụ…) dùng cùng cấu trúc, mỗi người chỉ thấy nhóm có quyền: ví dụ thu ngân sẽ thấy **Vận hành ca → Tài chính → Của tôi**, gọn hơn hẳn hiện tại.

## 3. Điểm cần bạn chọn

- **Lợi nhuận vs Lãi lỗ**: hai màn gần giống nhau (lợi nhuận gộp vs lãi lỗ có chi phí). Đề xuất để cạnh nhau trong "Báo cáo" trước; sau này có thể gộp thành 1 màn 2 tab.
- **"Của tôi" để cuối hay đầu?** Đề xuất để cuối với quản lý; nhân viên thường thì nhóm này tự nổi lên vì ít nhóm khác.
- **Nhóm thu gọn mặc định**: có thể cho Website, Cấu hình, Của tôi thu gọn sẵn để menu ngắn lại.

## 4. Cách làm (khi bạn đồng ý)

- Chỉ sửa `frontend-app/src/apps/sidebar.ts`: cho `SIDEBAR_GROUPS` gom theo **từng mục** (`"overview/home"`, `"tables/floor"`…) thay vì cả app. Gộp cơ chế "Theo dõi ca" vào nhóm Vận hành ca.
- **Không đổi đường dẫn** (`/app/...`), không đổi phân quyền, không đổi backend. Link cũ, bookmark vẫn chạy.
- Badge số (đơn mới, việc được giao, hàng sắp hết…) giữ nguyên theo mục.
- Kiểm tra bằng cách đăng nhập từng vai trò (Chủ chuỗi, Quản lý, Thu ngân, Pha chế, Kho, Shipper) và chụp lại sidebar.
