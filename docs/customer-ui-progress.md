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

---

# Giao diện v2 — "quán cà phê Sài Gòn có nắng" (md/prompt-nang-cap-giao-dien-khach-v2.md)

## Đợt 1 — đã xong (nền móng + header + footer + trang chủ)
- Bộ màu mặc định **Espresso & Kem** (`siteTheme.ts`, bộ cũ vẫn chọn được); tiêu đề Playfair Display chữ thường, nội dung Be Vietnam Pro; Oswald chỉ cho giá lớn + con số (`--c-font-num`).
- Token: bo góc 10/18/28/999px, khung vòm `--c-arch`, một kiểu bóng `--c-shadow`, `--c-grain` (hạt nhiễu), `--c-tile-svg` (gạch bông), lớp `.c-grain` / `.c-tile` / `.c-spotlights`; đổi sáng/tối mượt 0.28s.
- Component (`components/site/lux.tsx`): Eyebrow, Divider, PageHero, ArchImage, Reveal/useReveal, StatCounter, Skeleton, EmptyState, Lightbox, Gallery, SiteImg, useHeroHeader. `SectionHead` = eyebrow + serif + vạch chia. Nút `c-btn--solid / --outline / --ghost`.
- Ảnh mặc định: 31 ảnh WebP 2 cỡ (4,2 MB) ở `public/site/`, nguồn Wikimedia Commons (CC0 / CC BY / CC BY-SA) ghi trong `public/site/CREDITS.md`.
- Header (`SiteHeader.tsx` + `MegaMenu.tsx`, CSS `customer-nav.css`): một hàng, mega menu Thực đơn có ảnh danh mục, trong suốt trên hero trang chủ, co 88 → 64px khi cuộn, ngăn kéo toàn màn hình trên điện thoại. Dải lời chúc dịp lễ chuyển lên trên header.
- Footer: dải 6 ảnh, logo + 1 câu, 4 cột (Khám phá · Hỗ trợ · Chính sách · Ghé quán), mạng xã hội nút tròn viền, đăng ký nhận tin.
- Trang chủ (`HomePage.tsx`, CSS `customer-home.css`): hero "ly cà phê nổi" · danh mục ảnh tròn · dải banner (bảng Banner) · món nổi bật xếp lớp có tab · Hợp thời tiết · câu chuyện ảnh vòm · dải số liệu · Từ hạt đến ly · voucher cuộn ngang · mini game · Khách nói gì · tin tức 1 lớn + 2 nhỏ.
- API mới `GET /api/site/stats` (chi nhánh, món đang bán, ly đã phục vụ = tổng số lượng món trong đơn Paid, điểm đánh giá TB; đệm 5 phút). `GET /api/reviews` trả thêm `storeName`.
- Ảnh trước / sau: `docs/screenshots/giao-dien-v2/dot-1/` (trang chủ + Khuyến mãi, 1440 & 390px, sáng & tối).

## Ghi chú đợt 1
- Link chưa có trang đang ẩn trong `MegaMenu.tsx` (cờ `ready`): Về TD Coffee (Câu chuyện, Cà phê của chúng tôi, Tuyển dụng), Ưu đãi › Thành viên. "Cửa hàng" tạm trỏ `/about` cho tới đợt 3 (`/stores`).
- CSDL mới có 1 đánh giá có lời nhận xét → mục "Khách nói gì" hiện 1 thẻ (không tạo đánh giá giả). Mục tự ẩn khi không có.
- Một số món mẫu có đường dẫn ảnh hỏng → hero / thẻ hiện khối kem nét vẽ ly (đúng thiết kế, nên sửa dữ liệu).
- Món chưa có mô tả / nốt hương vị → thẻ món lớn chỉ hiện danh mục + nhãn dinh dưỡng; đợt 2 thêm cột `description`, `tastingNotes`.
- Nội dung đoạn câu chuyện thứ hai và 4 bước "Từ hạt đến ly" đang viết cứng (có bản EN); đợt 3 chuyển sang `SitePage` để chủ chuỗi tự sửa.

## Còn lại
- Đợt 2: dữ liệu món (mô tả, hương vị, nhiều ảnh), Thực đơn, Chi tiết món, Bộ sưu tập, Giỏ hàng.
- Đợt 3: SitePage + Về chúng tôi, Cà phê của chúng tôi, Cửa hàng, Thư viện ảnh, 404, SEO.
- Đợt 4: Thành viên, Tuyển dụng, Đặt tiệc, FAQ, Khuyến mãi (bậc thang ngang, EmptyState), thanh bước, Tin tức kiểu tạp chí, các trang còn lại.
