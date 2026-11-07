# Prompt: Nâng cấp giao diện web khách TD Coffee lên phong cách sang trọng

> Dán nguyên phần dưới đường kẻ vào Claude Code. Prompt này xây tiếp trên bản `prompt-giao-dien-khach.md` (đã làm xong: header 2 tầng, footer 4 cột, Banner, Liên hệ, Menu giấy, sáng/tối, song ngữ, chủ đề dịp lễ). Lần này đổi **phong cách** từ "poster / menu giấy, góc vuông" sang **"quán cà phê cao cấp, mềm mại, nhiều ảnh"** và **bổ sung đủ các trang** của một website chuỗi thật.

---

Bạn đang làm việc trên repo TD Coffee, nhánh `feat/chain-stores`. Frontend: `frontend-app` (Vite + React 19 + TypeScript + react-router-dom 7). Trang khách: `src/pages/` (HomePage, Menu, ProductDetail, StorePage = /about, Promotions, Blog, BlogDetail, Cart, Account, Contact, Policy, OrderTracking…), khung chung `components/PublicLayout.tsx`, phần dùng chung `components/site/*` (SiteHeader, SiteFooter, parts.tsx: SectionHead, Crumbs, ProductCard, ProductImage, VoucherTicket…). CSS: `styles/customer-tokens.css` (token `--c-*`) + `styles/customer.css` (class `c-*`). Màu do `lib/siteTheme.ts` tính từ màu chủ chuỗi chọn trong **Website › Giao diện**; sáng/tối qua `data-c-mode`; song ngữ qua `lib/i18n.ts` + `lib/i18n-en.ts`; chủ đề lễ trong `components/site/Festive.tsx`. Tiến độ lần trước ghi ở `docs/customer-ui-progress.md` — đọc trước khi làm.

## MỤC TIÊU

Chủ chuỗi nhận xét web khách hiện tại: **ít trang, nhìn vuông vức, thiếu ảnh**. Hãy nâng cấp để web trông **sang trọng như chuỗi cà phê cao cấp** (cảm giác một quán specialty coffee có không gian đẹp, ảnh chụp chuyên nghiệp, nhiều khoảng thở), đồng thời **đủ các trang** mà khách mong đợi ở web một thương hiệu.

GIỮ NGUYÊN, KHÔNG ĐƯỢC LÀM HỎNG: API và luồng đặt hàng / giỏ hàng / thanh toán / theo dõi đơn; hệ thống màu tùy chỉnh (`siteTheme.ts`: mọi màu mới phải đi qua token, không mã màu cứng trong component); chế độ tối; song ngữ (mọi chữ mới bọc `t()` và thêm bản tiếng Anh vào `i18n-en.ts`); chủ đề dịp lễ; BottomNav điện thoại; cụm nút liên hệ nổi; popup; khu vực nhân sự (/app, /pos, /staff) không đổi gì.

## 1. NGÔN NGỮ THIẾT KẾ MỚI: "Mềm, ấm, cao cấp"

Chủ đề: **"Một buổi sáng ở quán cà phê có nắng"**. Ảnh lớn, chữ serif thanh lịch, góc bo mềm, khối xếp chồng lệch nhau, nhiều khoảng trắng, chuyển động nhẹ.

**Bỏ những thứ đang làm web "vuông vức":**
- Góc bo 4–6px ở mọi nơi, thẻ xếp lưới đều tăm tắp, đường kẻ 1px khắp nơi, tiêu đề in hoa nén (Oswald) cho mọi mục, nền phẳng một màu kéo dài cả trang, khối nào cũng full chiều ngang và cao bằng nhau.

**Thay bằng:**
- **Hình khối mềm:** token mới `--c-radius-sm: 10px`, `--c-radius: 18px`, `--c-radius-lg: 28px`, `--c-radius-pill: 999px`. Thẻ món, thẻ tin, ô ảnh dùng 18–28px. Nút chính bo 999px (pill) hoặc 14px, cao 48px, chữ thường có chữ hoa đầu, letter-spacing nhẹ.
- **Khung ảnh hình vòm (arch):** dấu ấn riêng của TD Coffee. Ảnh câu chuyện, ảnh trang Về chúng tôi, ảnh chi nhánh dùng khung bo tròn phía trên (`border-radius: 999px 999px 24px 24px`), giống ô cửa quán. Dùng có chủ ý ở 4–6 chỗ, không lạm dụng.
- **Bố cục xếp lớp:** ảnh lớn + ảnh nhỏ đè lệch một góc, thẻ chữ nổi đè lên mép ảnh, khối nền màu kem đậm chạy lệch ra sau ảnh. Xen kẽ trái/phải giữa các mục để mắt không bị đều.
- **Chữ:**
  • Tiêu đề: serif thanh lịch có tiếng Việt, đề xuất `Playfair Display` (400/500/600 + italic) hoặc `Cormorant Garamond` (500/600). Tiêu đề lớn 48–72px desktop, chữ thường, có thể nghiêng một từ để nhấn ("Cà phê *đúng vị* Sài Gòn").
  • Nội dung: `Be Vietnam Pro` 400/500 giữ nguyên, cỡ 16–17px, line-height 1.7.
  • Nhãn nhỏ phía trên tiêu đề (eyebrow): chữ in hoa 12px, letter-spacing 0.2em, màu nhấn, ví dụ "CÂU CHUYỆN CỦA CHÚNG TÔI".
  • `Oswald` chỉ còn dùng cho giá lớn và con số thống kê, hoặc bỏ hẳn nếu không hợp.
  • Tải qua Google Fonts với `subset=vietnamese&display=swap`; chụp ảnh kiểm tra dấu "Ừ Ữ Ặ Ỷ ẫ ờ" ở cỡ tiêu đề trước khi chốt font.
- **Màu:** giữ cơ chế `siteTheme.ts`, nhưng thêm 1 bộ màu gợi ý mới làm mặc định tên **"Espresso & Kem"**: nền `#FAF6F0`, nền phụ `#F1E8DC`, bề mặt `#FFFFFF`, chữ `#2B1D14`, chủ đạo nâu espresso `#4A2C1D`, nhấn vàng đồng `#C08A4B`, footer `#1F1510`. Các bộ màu cũ vẫn chọn được. Cho phép **gradient rất nhẹ chỉ để phủ lên ảnh** (đen trong suốt từ dưới lên, giúp chữ trên ảnh đọc được); không dùng gradient làm nền khối hay nút.
- **Kết cấu:** một lớp nhiễu hạt (grain) SVG rất nhẹ (opacity 3–4%) trên nền kem để không bị phẳng; vài nét vẽ tay mảnh (hạt cà phê, cành lá, hơi nước bốc lên) dạng SVG một màu, đặt góc mục làm điểm nhấn. Tất cả nhận màu từ token để chạy được ở chế độ tối.
- **Bóng đổ:** một kiểu duy nhất, mềm và sâu: `0 20px 50px -20px rgb(43 29 20 / 0.25)`, chỉ cho thẻ nổi và khi hover.
- **Chuyển động (tiết chế, có chủ đích):** hiện dần + trượt 16px khi cuộn tới (IntersectionObserver, mỗi phần tử một lần), ảnh zoom 1.04 khi hover thẻ, parallax nhẹ cho ảnh hero (≤ 40px), số thống kê đếm lên khi hiện. Tắt toàn bộ khi `prefers-reduced-motion: reduce`. Không dùng framer-motion cho mọi khối; viết một hook `useReveal()` dùng chung.
- **Vẫn giữ quy tắc chống "web AI":** không emoji, không icon trang trí trước tiêu đề mục, không gradient tím/cam, không badge lấp lánh trên hero, không câu slogan chung chung kiểu "Trải nghiệm tuyệt vời nhất". Viết câu cụ thể, có chất Sài Gòn.

## 2. ẢNH MINH HỌA

Web đang thiếu ảnh, đây là phần quan trọng nhất để thấy "sang".

1. **Tải ảnh miễn phí bản quyền** từ Unsplash hoặc Pexels (giấy phép cho dùng thương mại, không cần ghi nguồn nhưng vẫn ghi vào `frontend-app/public/site/CREDITS.md`: tên tác giả + link). Chủ đề cần (khoảng 20–25 ảnh):
   - Hero: không gian quán có nắng, quầy pha, tay barista rót sữa, ly cà phê phin trên bàn gỗ (3–4 ảnh ngang 2400px).
   - Câu chuyện / Về chúng tôi: hạt cà phê rang, vườn cà phê Tây Nguyên, máy rang, người pha chế, khách ngồi trò chuyện (6–8 ảnh).
   - Không gian chi nhánh: góc ngồi, bàn ngoài trời, quầy bánh (4–6 ảnh).
   - Tuyển dụng, đặt tiệc / sự kiện, thành viên, FAQ: mỗi trang 1–2 ảnh.
   - Ảnh ghép menu giấy / bánh ngọt cho các mục trang chủ (3–4 ảnh).
2. Chuyển sang **WebP**, mỗi ảnh 2 cỡ (1600px và 800px, dùng `srcset`/`sizes`), đặt ở `frontend-app/public/site/<trang>/…`. Tổng dung lượng thư mục ≤ 6 MB. Ảnh hero đầu trang `fetchpriority="high"`, không lazy; còn lại `loading="lazy"`, luôn có `aspect-ratio` để không giật trang, có `alt` tiếng Việt mô tả đúng.
3. **Mọi ảnh trang trí phải thay được trong quản trị** (xem mục 4: bảng `SitePage` lưu đường dẫn ảnh từng khối), ảnh trong `public/site/` chỉ là mặc định.
4. Nếu môi trường không tải được ảnh từ mạng: tạo ảnh giữ chỗ bằng SVG minh họa nét vẽ tay một màu (ly cà phê, phin, cành cà phê) theo đúng tỉ lệ khung, ghi rõ trong báo cáo danh sách ảnh cần thay, và vẫn làm xong bố cục.
5. Ảnh món: CSDL chỉ có 1 ảnh/món. Thêm bảng `ProductImage` (productId, url, sortOrder) + ô tải nhiều ảnh trong màn sửa món, để trang chi tiết món có dải ảnh nhỏ. Món thiếu ảnh hiện khối kem bo tròn có nét vẽ ly cà phê + tên món chữ serif, không để ô xám.

## 3. DANH SÁCH TRANG (CŨ LÀM LẠI + MỚI)

Menu chính (header) đổi thành, có **menu thả xuống dạng mega menu** (có ảnh nhỏ) trên desktop:
`Thực đơn ▾` (các danh mục kèm ảnh + "Xem tất cả") · `Về TD Coffee ▾` (Câu chuyện · Cà phê của chúng tôi · Tuyển dụng) · `Cửa hàng` · `Ưu đãi ▾` (Khuyến mãi · Thành viên · Mini game đang chạy) · `Tin tức` · `Liên hệ`.
Header: trong suốt đè lên ảnh hero ở trang chủ và các trang có hero; khi cuộn chuyển nền kem mờ (`backdrop-filter: blur`) + bóng nhẹ, cao từ 88px xuống 64px. Mobile: logo giữa, nút menu trái mở ngăn kéo toàn màn hình có ảnh nền mờ, giỏ hàng phải; BottomNav giữ nguyên.

Mỗi trang nội dung có **hero trang** chung (component `PageHero`): ảnh nền cao 360–440px bo góc dưới 28px hoặc khung vòm, eyebrow + tiêu đề serif + 1 câu mô tả + breadcrumb chữ nhỏ.

### 3.1 Trang chủ `/` (làm lại)
1. **Hero toàn màn hình** (90vh): slide ảnh lớn từ bảng Banner (giữ dữ liệu cũ), chữ serif lớn căn trái, 1 câu mô tả, nút "Đặt món ngay" (pill đặc) + "Xem thực đơn" (pill viền). Chấm chuyển slide dạng gạch mảnh, tự chuyển 6s, dừng khi hover. Góc dưới có một thẻ nổi nhỏ: chi nhánh gần nhất + giờ mở cửa + "Chỉ đường".
2. **Danh mục dạng vòng tròn ảnh** (cuộn ngang): ảnh món tiêu biểu trong khung tròn 120px + tên danh mục; hover ảnh xoay nhẹ.
3. **Món nổi bật dạng xếp lớp**: 1 món lớn bên trái (ảnh to, khung vòm, mô tả, giá, nút thêm) + lưới 4 món nhỏ bên phải. Có tab "Bán chạy / Món mới / Ưu đãi hôm nay" chuyển mượt.
4. **Hợp thời tiết hôm nay** (`WeatherPicks` đã có) đổi sang dạng thẻ ngang bo tròn có ảnh nền theo thời tiết.
5. **Câu chuyện** (thay khối cũ): ảnh vòm lớn + ảnh nhỏ đè lệch, eyebrow "CÂU CHUYỆN CỦA CHÚNG TÔI", tiêu đề, 2 đoạn ngắn, chữ ký tay SVG, nút "Đọc câu chuyện" → `/about`.
6. **Dải số liệu** trên nền nâu espresso: số chi nhánh, số món, số ly đã phục vụ, điểm đánh giá trung bình (lấy số thật từ API, đếm lên khi hiện).
7. **Từ hạt đến ly**: 4 bước (Chọn hạt · Rang · Pha · Phục vụ), mỗi bước một ảnh tròn + số thứ tự serif lớn + 1 câu; trên desktop nối bằng đường cong nét đứt SVG.
8. **Voucher** dạng vé (giữ VoucherTicket, bo tròn lại) trên nền kem đậm, cuộn ngang.
9. **Mini game** (nếu có chiến dịch): thẻ ngang lớn có ảnh, không còn dải phẳng.
10. **Không gian quán**: lưới ảnh kiểu masonry 5–6 ảnh, bấm mở xem lớn (lightbox, phím mũi tên, Esc đóng).
11. **Khách nói gì**: carousel 3 đánh giá thật (API reviews) có ảnh đại diện, sao, tên chi nhánh.
12. **Tin tức**: 1 bài lớn + 2 bài nhỏ.
13. **Đăng ký nhận tin** trên nền ảnh mờ, ô email bo pill + nút.

### 3.2 Về chúng tôi `/about` (làm lại hoàn toàn, tách khỏi danh sách cửa hàng)
PageHero → **Tầm nhìn**: đoạn mở đầu lớn chữ serif nghiêng, căn giữa → **Hành trình**: timeline dọc các mốc (năm thành lập, chi nhánh đầu, mở rộng…), mỗi mốc có ảnh nhỏ, xen trái/phải → **Giá trị cốt lõi**: 3–4 thẻ bo tròn có ảnh (Hạt Việt chọn lọc · Pha mới mỗi ly · Giá thân thiện · Không gian để ở lại) → **Đội ngũ**: ảnh khung vòm + tên + vai trò (lấy từ nội dung quản trị, không lấy nhân viên thật trong CSDL) → **Số liệu** → **Thư viện ảnh** → CTA "Ghé quán gần bạn" → `/stores`.

### 3.3 Cà phê của chúng tôi `/our-coffee` (mới)
Vùng trồng (bản đồ Việt Nam SVG đánh dấu Cầu Đất, Buôn Ma Thuột…), loại hạt (Robusta, Arabica, Culi) dạng thẻ có thang hương vị (đậm, chua, đắng thanh), quy trình rang, các cách pha (phin, espresso, cold brew) mỗi cách một ảnh + thời gian + tỉ lệ, cuối trang gợi ý món dùng hạt đó (link sang thực đơn).

### 3.4 Hệ thống cửa hàng `/stores` và `/stores/:id` (mới, `/about` cũ phần danh sách chuyển sang đây)
- `/stores`: bản đồ Leaflet chiếm nửa phải (dính khi cuộn), danh sách thẻ chi nhánh bên trái có ảnh, địa chỉ, giờ, trạng thái "Đang mở / Sắp đóng / Đã đóng" tính theo giờ hiện tại, lọc theo quận, nút "Gần tôi" (định vị trình duyệt, sắp xếp theo khoảng cách). Bấm thẻ thì bản đồ bay tới marker.
- `/stores/:id`: hero ảnh chi nhánh, thông tin, tiện ích (Wifi, ổ cắm, chỗ đậu xe máy, phòng lạnh, chỗ ngồi ngoài trời — lưu cột JSON `amenities` trong bảng Store, sửa ở màn quản lý chi nhánh), thư viện ảnh chi nhánh, bản đồ nhỏ, nút "Đặt món tại chi nhánh này" (đặt StorePicker rồi chuyển /menu), đánh giá của chi nhánh.

### 3.5 Thành viên `/membership` (mới)
Giải thích hạng thành viên và tích điểm, lấy từ cấu hình hạng có sẵn (`lib/rank.ts`, `lib/points.ts`): thẻ hạng dạng thẻ thành viên bo tròn có hoa văn, quyền lợi từng hạng dạng bảng so sánh, cách tích/đổi điểm, FAQ ngắn; nếu đã đăng nhập hiện hạng hiện tại + điểm + thanh tiến độ lên hạng; chưa đăng nhập thì nút "Đăng ký ngay".

### 3.6 Tuyển dụng `/careers` (mới)
Hero ảnh barista, lý do làm việc ở TD Coffee (4 thẻ), danh sách vị trí đang tuyển (bảng `JobPosting`: tiêu đề, chi nhánh, loại hình, mô tả, bật/tắt), bấm mở chi tiết + form ứng tuyển (họ tên, SĐT, email, vị trí, chi nhánh mong muốn, file CV PDF ≤ 5MB qua `uploadImage`/upload sẵn có) lưu bảng `JobApplication`; quản trị: **Nhân sự › Tuyển dụng** (quản lý tin + xem hồ sơ, đổi trạng thái Mới / Đã liên hệ / Đã nhận / Từ chối).

### 3.7 Đặt tiệc & sự kiện `/events` (mới)
Giới thiệu dịch vụ (sinh nhật, họp nhóm, workshop pha chế, quà tặng doanh nghiệp) bằng thẻ ảnh lớn, gói tham khảo, form đặt (ngày, giờ, chi nhánh, số người, nhu cầu) lưu vào `ContactMessage` với `type = EVENT` (thêm cột `type` nếu chưa có), hiện ở CRM › Liên hệ từ khách có bộ lọc theo loại.

### 3.8 Câu hỏi thường gặp `/faq` (mới)
Nhóm câu hỏi (Đặt hàng, Giao hàng, Thanh toán, Thành viên, Cửa hàng) dạng accordion bo tròn, ô tìm kiếm lọc câu hỏi, cuối trang "Không thấy câu trả lời?" mở chat AI tư vấn có sẵn hoặc sang Liên hệ. Nội dung lấy từ `SitePage` slug `faq`.

### 3.9 Thư viện ảnh `/gallery` (mới)
Lưới masonry có lọc theo chi nhánh / chủ đề (Không gian, Đồ uống, Sự kiện), lightbox. Dùng lại API `/api/posts/gallery` nếu phù hợp, hoặc lấy từ ảnh trong `SitePage` + ảnh chi nhánh.

### 3.10 Trang 404 (mới)
Thay việc chuyển thẳng về `/`: trang "Ly này hết rồi" với minh họa SVG ly cà phê đổ, nút về trang chủ và thực đơn.

### 3.11 Các trang đã có — áp phong cách mới
- **Thực đơn**: PageHero ảnh món; thanh danh mục dạng pill dính đầu khi cuộn; thẻ món bo 20px, ảnh nền kem, hover nhấc lên + nút "+" tròn hiện ra; chế độ "Menu giấy" giữ lại nhưng trình bày như thực đơn nhà hàng sang (2 cột, tên serif, dotted leader, giá).
- **Chi tiết món**: dải ảnh (ProductImage), ảnh chính bo 28px; chọn size/nóng-đá/đường dạng chip bo tròn; nút "Thêm vào giỏ" lớn pill; thông tin dinh dưỡng (NutritionPanel) dạng thẻ; "Ăn kèm ngon hơn" dạng thẻ ngang có ảnh; đánh giá có thanh phân bố sao.
- **Khuyến mãi, Tin tức, Chi tiết bài viết** (bài viết: ảnh bìa lớn, cột chữ 720px, chữ cái đầu đoạn lớn kiểu tạp chí, bài liên quan), **Liên hệ** (bản đồ bo tròn, form trên thẻ nổi đè lên ảnh), **Giỏ hàng, Thanh toán, Theo dõi đơn, Tài khoản, Đăng nhập/Đăng ký** (đăng nhập: chia đôi màn hình, nửa trái ảnh quán, nửa phải form), **Chính sách**: cùng font, nút, bo góc, khoảng cách.
- **Footer**: nền espresso đậm, trên cùng là dải ảnh Instagram-style 6 ảnh vuông bo tròn; logo lớn + 1 câu; 4 cột link (thêm các trang mới); mạng xã hội dạng nút tròn viền; dòng bản quyền.

## 4. NỘI DUNG QUẢN TRỊ ĐƯỢC (để chủ chuỗi tự sửa)

- Bảng `SitePage` (slug, title, eyebrow, heroImage, `blocks` JSON, isPublished, updatedAt). Các loại khối: `richText`, `imageText` (ảnh + chữ, chọn ảnh trái/phải, khung vòm hay bo tròn), `stats`, `timeline`, `values` (thẻ giá trị), `team`, `gallery`, `faq`, `steps`, `cta`. Trang Về chúng tôi, Cà phê của chúng tôi, Thành viên (phần giới thiệu), Đặt tiệc, FAQ đọc từ đây.
- Màn quản trị **Website › Trang nội dung**: danh sách trang, sửa từng khối bằng form đơn giản (thêm / xóa / kéo đổi thứ tự khối, tải ảnh), nút "Xem trước" mở trang khách ở tab mới.
- Script seed `prisma/site-pages-seed.ts` tạo sẵn nội dung tiếng Việt hay, cụ thể, có chất Sài Gòn cho tất cả các trang trên (không dùng lorem ipsum, không câu sáo rỗng), dùng ảnh trong `public/site/`.
- Migration SQL đánh số tiếp theo trong `backend-node/prisma/sql/` (sau 020) cho các bảng/cột mới: `SitePage`, `ProductImage`, `JobPosting`, `JobApplication`, cột `Store.amenities`, `Store.imageUrl` (nếu chưa có), `ContactMessage.type`. Cập nhật README phần migration.
- API công khai: `GET /api/site/pages/:slug`, `GET /api/stores/:id` (chi tiết + ảnh + tiện ích + điểm đánh giá), `GET /api/jobs`, `POST /api/jobs/:id/apply`, `GET /api/site/stats` (số chi nhánh, số món, số đơn đã hoàn thành, điểm đánh giá TB). API quản trị theo phân quyền hiện có (chủ chuỗi / quản lý).

## 5. YÊU CẦU KỸ THUẬT

- Component dùng chung mới trong `components/site/`: `PageHero`, `Eyebrow`, `ArchImage`, `Reveal`/`useReveal`, `Lightbox`, `StatCounter`, `MegaMenu`, `BlockRenderer` (vẽ khối SitePage). Không lặp CSS giữa các trang.
- Token mới khai báo trong `customer-tokens.css`, có giá trị cho chế độ tối (ảnh phủ tối thêm 15% ở chế độ tối, nét vẽ SVG đổi sang màu sáng).
- `siteTheme.ts`: thêm bộ màu "Espresso & Kem" làm mặc định; kiểm tra tương phản chữ ≥ 4.5:1 cho mọi tổ hợp mới (chữ trên ảnh dùng lớp phủ để đạt chuẩn).
- Song ngữ: dịch toàn bộ chữ giao diện mới sang tiếng Anh; nội dung `SitePage` có cột `blocksEn` tùy chọn, thiếu thì hiện tiếng Việt.
- Hiệu năng: Lighthouse trang chủ (mobile) Performance ≥ 80, CLS < 0.1, LCP < 2.5s ở chế độ build; ảnh WebP + srcset; route mới tải lười bằng `React.lazy`.
- Khả năng truy cập: điều hướng bàn phím được mega menu, lightbox, carousel; focus rõ; `alt` đầy đủ; carousel có nút dừng.
- Responsive: kiểm tra 1440, 1024, 768, 390px. Ở 390px các bố cục xếp lớp chuyển thành một cột, ảnh đè lệch thu nhỏ lại chứ không bị cắt chữ; không cuộn ngang ngoài các dải được thiết kế để cuộn ngang.
- SEO cơ bản: `<title>` + meta description riêng từng trang, Open Graph ảnh hero, `sitemap.xml` liệt kê các trang công khai.

## 6. CÁCH LÀM & KIỂM TRA

Thứ tự, mỗi bước một commit, `npm run build` (frontend + backend) sạch lỗi:
1. Token, font, bộ màu mặc định mới, grain, bóng, bo góc; component dùng chung.
2. Ảnh: tải, nén WebP, CREDITS.md.
3. Header (trong suốt + mega menu + ngăn kéo mobile) và Footer.
4. Bảng mới + migration + API + seed nội dung + màn Website › Trang nội dung.
5. Trang chủ.
6. Về chúng tôi, Cà phê của chúng tôi, Cửa hàng (danh sách + chi tiết).
7. Thành viên, Tuyển dụng (+ quản trị), Đặt tiệc, FAQ, Thư viện ảnh, 404.
8. Áp phong cách cho Thực đơn, Chi tiết món (+ ProductImage), Khuyến mãi, Tin tức, Liên hệ, Giỏ hàng, Thanh toán, Theo dõi đơn, Tài khoản, Đăng nhập/Đăng ký, Chính sách.
9. Dịch tiếng Anh, kiểm tra chế độ tối, chủ đề dịp lễ, dọn CSS không còn dùng.

Tự kiểm tra bằng Playwright (chụp ảnh ở 1440px và 390px, cả sáng và tối):
- Mọi trang mới mở được, không lỗi console; luồng xem món → thêm giỏ → thanh toán → theo dõi đơn vẫn chạy.
- Đổi màu chủ đạo trong Website › Giao diện thì toàn bộ trang mới đổi theo; bật chủ đề Tết vẫn hiện đúng.
- Tiếng Việt có dấu hiển thị đúng ở font tiêu đề mới; chuyển EN không còn chữ tiếng Việt ở phần giao diện.
- Khu vực nhân sự không đổi màu/font.
- Lưu ảnh **trước / sau** vào `docs/screenshots/giao-dien-sang-trong/` cho: trang chủ, Về chúng tôi, Cửa hàng, Chi tiết chi nhánh, Thực đơn, Chi tiết món, Tuyển dụng, footer (desktop + điện thoại).

Nếu sắp hết hạn mức phiên: dừng ở cuối một bước, commit, cập nhật `docs/customer-ui-progress.md` (đã xong / còn lại).

BÁO LẠI: font và bộ màu đã chốt, danh sách trang mới + đường dẫn, bảng/migration mới, nguồn ảnh (hoặc danh sách ảnh giữ chỗ cần thay), điểm Lighthouse, và ảnh trước/sau.
