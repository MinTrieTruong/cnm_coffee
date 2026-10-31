# Giao diện khách TD Coffee — tiến độ

Theo `md/prompt-giao-dien-khach.md`. Nhánh `feat/chain-stores`.

## Đã xong
- Token + font (`styles/customer-tokens.css`, `--c-*`; Oswald / Playfair Display italic / Be Vietnam Pro, Google Fonts `subset=vietnamese&display=swap`). Đã xem ảnh chụp: dấu tiếng Việt ở chữ poster hiển thị đúng (CÀ PHÊ PHIN SÀI GÒN, ƯU ĐÃI HÔM NAY, LIÊN HỆ VỚI CHÚNG TÔI, ĐĂNG KÝ NHẬN TIN).
- Header 2 tầng + footer 4 cột + trang chính sách.
- Trang chủ, Chi tiết món (API mới `GET /api/products/:id/extras`: ăn kèm + đánh giá), Thực đơn (lưới / Menu giấy), Liên hệ `/contact` (Leaflet), Khuyến mãi, Tin tức, Cửa hàng, Giỏ hàng, Tài khoản, Đăng nhập/Đăng ký, Thanh toán, Theo dõi đơn.
- Bảng `Banner`, `ContactMessage` + quản trị: Website › Banner, Website › Thông tin công ty, CRM › Liên hệ từ khách.
- Xoá CSS `hp-*` cũ và `AdvancedFilter`.

## Còn lại / ghi chú
- Ảnh chi tiết món: chỉ có 1 ảnh/món trong CSDL nên chưa có dải ảnh nhỏ.
- "Mô tả sản phẩm": bảng `Product` chưa có cột mô tả — đang ghép từ nhóm, bảng giá theo size và nhãn.
- OrderGrace, GamePlay, PopupHost, BottomNav mới chỉ nhận màu/font qua token, chưa viết lại bố cục.
- Một số ảnh món trong dữ liệu mẫu bị lỗi đường dẫn → hiện khối kem tên món (đúng thiết kế, nhưng nên sửa dữ liệu).
