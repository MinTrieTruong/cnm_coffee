🔧 PHẦN BỔ SUNG CHỨC NĂNG HỆ THỐNG
1. Bổ sung chức năng quản lý nhân viên

Hệ thống được mở rộng thêm module Quản lý nhân viên, không chỉ dừng lại ở việc phân quyền (role) mà còn quản lý thông tin chi tiết từng nhân viên.

Nội dung bổ sung:
Lưu trữ các thông tin:
Họ tên
Số điện thoại
Ngày vào làm
Vị trí (Nhân viên bàn, Pha chế, Thu ngân, Quản lý)
Trạng thái (Active/Inactive)
Quản lý tài khoản:
Mỗi nhân viên có tài khoản riêng theo cú pháp:
Nhân viên bàn: NVB_Ten
Pha chế: PC_Ten
Thu ngân: TN_Ten
Phân quyền thao tác:
Quản lý (Admin):
Thêm / sửa / xóa tài khoản nhân viên
Nhân viên:
Cập nhật thông tin cá nhân
Đổi mật khẩu
2. Bổ sung hệ thống Audit Log

Hệ thống được bổ sung chức năng ghi log hoạt động (Audit Log) nhằm theo dõi toàn bộ thao tác của người dùng.

Các hành động được ghi nhận:
Nhập kho
Kiểm kho
Order
Thanh toán
Mở ca / đóng ca
Ví dụ:
PC_Tuan kiểm kho mở ca
TN_Tram thanh toán
NVB_Bich tạo order
3. Bổ sung quản lý nhà cung cấp

Thêm module Quản lý nhà cung cấp để phục vụ nhập nguyên liệu.

Thông tin bao gồm:
Tên nhà cung cấp
Số điện thoại
Đơn giá nhập
Ngày nhập
Chức năng:
Thêm / sửa / xóa nhà cung cấp
Theo dõi lịch sử nhập
4. Bổ sung chi tiết báo cáo doanh thu

Phần báo cáo doanh thu được mở rộng chi tiết hơn.

Nội dung bổ sung:
Hiển thị đầy đủ:
Mã hóa đơn
Nhân viên thực hiện
Thời gian
Danh sách món
Tổng tiền
Trạng thái
Export:
File báo cáo tải về phải chứa đầy đủ tất cả các trường dữ liệu, không được lược bỏ
5. Bổ sung chức năng tính lợi nhuận

Hệ thống được bổ sung chức năng tính lợi nhuận dựa trên giá vốn nguyên liệu.


Nguyên tắc:
Đơn giá nguyên liệu sử dụng là giá nhập mới nhất
Áp dụng theo từng sản phẩm / ly nước
Xem được biểu đồ, đồ thị để dễ hình dung doanh thu, lợi nhuận, sản phẩm best-seller...

6. Bổ sung thông báo Real-time

Hệ thống được bổ sung cơ chế thông báo tự động khi nguyên liệu sắp hết.

Điều kiện:
Khi số lượng tồn ≤ mức tồn tối thiểu
Hành động:
Gửi thông báo ngay cho Admin
Ví dụ:
Nguyên liệu Trà đen đã chạm mức tồn tối thiểu
Cần nhập thêm Sữa tươi