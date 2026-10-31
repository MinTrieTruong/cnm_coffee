# Giao diện khách TD Coffee — tiến độ

Theo `md/prompt-giao-dien-khach.md`. Nhánh `feat/chain-stores`.

## Đã xong
- Token + font (`styles/customer-tokens.css`, `--c-*`, bảng màu "gạch bông Sài Gòn": xanh #1e5a5f · vàng nghệ #e0a531 · giấy kem; Oswald / Playfair Display italic / Be Vietnam Pro, Google Fonts `subset=vietnamese&display=swap`). Đã xem ảnh chụp: dấu tiếng Việt ở chữ poster hiển thị đúng (CÀ PHÊ PHIN SÀI GÒN, ƯU ĐÃI HÔM NAY, LIÊN HỆ VỚI CHÚNG TÔI, ĐĂNG KÝ NHẬN TIN).
- Header 2 tầng + footer 4 cột + trang chính sách.
- Trang chủ, Chi tiết món (API mới `GET /api/products/:id/extras`: ăn kèm + đánh giá), Thực đơn (lưới / Menu giấy), Liên hệ `/contact` (Leaflet), Khuyến mãi, Tin tức, Cửa hàng, Giỏ hàng, Tài khoản, Đăng nhập/Đăng ký, Thanh toán, Theo dõi đơn.
- Bảng `Banner`, `ContactMessage` + quản trị: Website › Banner, Website › Thông tin công ty, CRM › Liên hệ từ khách.
- Xoá CSS `hp-*` cũ và `AdvancedFilter`.

## Còn lại / ghi chú
- Ảnh chi tiết món: chỉ có 1 ảnh/món trong CSDL nên chưa có dải ảnh nhỏ.
- "Mô tả sản phẩm": bảng `Product` chưa có cột mô tả — đang ghép từ nhóm, bảng giá theo size và nhãn.
- OrderGrace, GamePlay, PopupHost, BottomNav mới chỉ nhận màu/font qua token, chưa viết lại bố cục.
- Một số ảnh món trong dữ liệu mẫu bị lỗi đường dẫn → hiện khối kem tên món (đúng thiết kế, nhưng nên sửa dữ liệu).

## Sáng/tối, màu tuỳ chỉnh, song ngữ
- Màu: `StoreSettings.siteTheme` (JSON) + `PATCH /api/admin/site-theme`; màn **Website › Giao diện** (5 bộ màu gợi ý, tự chọn màu chủ đạo/nhấn, xem trước sáng + tối, mặc định sáng/tối/theo máy, bật/tắt nút cho khách). `lib/siteTheme.ts` tính toàn bộ biến màu từ 2 màu và tự chỉnh để chữ ≥ 4.5:1 ở cả hai chế độ.
- Tối: nền trung tính trong `customer-tokens.css` (`:root[data-c-mode="dark"] .c-site`), script đầu `index.html` đặt chế độ trước khi vẽ (không chớp).
- Song ngữ: `lib/i18n.ts` + `lib/i18n-en.ts` (khoá = câu tiếng Việt, thiếu bản dịch thì hiện tiếng Việt). Đã dịch: header, footer, thanh đáy, trang chủ, thực đơn, chi tiết món, giỏ hàng, khuyến mãi, tin tức, cửa hàng, liên hệ, đăng nhập/đăng ký, chọn chi nhánh.
- Chưa dịch: Tài khoản, Thanh toán, Theo dõi đơn, Ân hạn, Mini game, pop up, nội dung trang chính sách. Dữ liệu từ CSDL (tên món, danh mục, banner, bài viết, mô tả voucher) vẫn tiếng Việt — muốn dịch cần thêm cột tiếng Anh.
