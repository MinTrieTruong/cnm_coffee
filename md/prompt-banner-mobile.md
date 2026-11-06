Bạn đang làm việc trên repo TD Coffee (frontend-app: Vite + React 19 + TypeScript), nhánh feat/chain-stores.

NHIỆM VỤ: Trên điện thoại (màn hình ≤ 768px), thu gọn banner lớn ở trang chủ khách để ảnh banner lộ ra. Chỉ sửa CSS responsive cho mobile, desktop giữ nguyên. Không sửa backend, không đổi logic React.

HIỆN TRẠNG CẦN BIẾT
- Banner là component BannerCarousel trong src/pages/HomePage.tsx: các class .c-banner, .c-banner-copy (khung giới thiệu: .c-banner-title, .c-banner-sub, nút .c-btn "Xem ngay"), .c-banner-dots (các nút chuyển slide).
- CSS nằm ở src/styles/customer.css, trong khối `@media (max-width: 768px)` đã có vài dòng cho .c-banner.
- Lỗi "ô chuyển slide to": src/index.css có luật vùng chạm chung `@media (pointer: coarse), (max-width: 900px) { .site-main button { min-height: var(--tap); min-width: var(--tap); } }` (44px), nên chấm 22×6px bị kéo thành ô vuông 44px. Luật này cũng làm nút "Xem ngay" cao 44px.

YÊU CẦU (tất cả trong `@media (max-width: 768px)` của customer.css)

1. Chấm chuyển slide
   - Thành chấm tròn 7×7px, chấm đang xem kéo dài thành thanh 18px (transition width 0.2s), khoảng cách 8px, đặt góc trên phải (top 10px, right 12px).
   - Ghi đè luật 44px bằng selector mạnh hơn: `.c-banner .c-banner-dots button { min-width: 0; min-height: 0; ... }`.
   - Giữ vùng chạm đủ rộng bằng pseudo trong suốt: button `position: relative`, `::after { content: ""; position: absolute; inset: -10px -4px; }`.

2. Khung giới thiệu
   - Không còn trải hết chiều ngang: left 10px, bottom 10px, right auto, max-width min(72%, 300px).
   - Padding 10px 12px 12px, gap 6px, viền trái 4px, nền giấy hơi trong: `color-mix(in srgb, var(--c-paper) 90%, transparent)`.
   - Tiêu đề: font-size clamp(1.05rem, 0.8rem + 1.6vw, 1.4rem), line-height 1.05.
   - Mô tả: 0.82rem, line-height 1.35, tối đa 2 dòng (-webkit-line-clamp: 2).
   - Nút "Xem ngay": `.c-banner .c-banner-copy .c-btn { min-height: 34px; min-width: 0; padding: 0 12px; font-size: 0.78rem; border-width: 1.5px; }`.

3. Giữ nguyên các dòng mobile đang có (.c-banner aspect-ratio 4/3, ẩn mũi tên). Không đổi gì ngoài khối media query này.

CÁCH KIỂM TRA
- `npm run build` trong frontend-app không lỗi.
- Mở trang chủ ở khổ 375px (DevTools): chấm chuyển slide là chấm nhỏ, khung giới thiệu chiếm khoảng 70% chiều ngang và thấp, thấy rõ ảnh banner; bấm chấm vẫn chuyển slide.
- Khổ 1280px: banner y như cũ.
- Mở PR vào feat/chain-stores, mô tả ngắn nguyên nhân và thay đổi.
