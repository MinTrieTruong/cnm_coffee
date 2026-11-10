Bạn đang làm việc trên repo TD Coffee, nhánh `feat/chain-stores` (frontend-app: Vite + React 19 + TypeScript + react-router-dom 7; trang khách trong `src/pages/` — HomePage.tsx, Menu.tsx, ProductDetail.tsx, StorePage.tsx (Về chúng tôi), Promotions.tsx, Blog.tsx, BlogDetail.tsx, Cart.tsx, Account.tsx; khung chung `components/PublicLayout.tsx`; CSS trong `index.css` + `styles/tokens.css`; font hiện chỉ có Inter trong `index.html`).

NHIỆM VỤ: Làm lại giao diện KHU VỰC KHÁCH HÀNG cho có **chất riêng của TD Coffee** — đẹp, có cá tính như web của chuỗi thật (tham khảo cách bố trí của Highlands Coffee), và **không còn dấu hiệu "web do AI làm"**. Chỉ đổi giao diện; KHÔNG đổi API, luồng đặt hàng, giỏ hàng, thanh toán; KHÔNG đụng khu vực nhân sự (/app, /pos, /staff).

══════════ 1. NHỮNG DẤU HIỆU "AI" CẦN BỎ (đã thấy trên trang chủ hiện tại) ══════════
- Hero ảnh hạt cà phê phủ tối, chữ "TD Coffee" căn giữa, câu slogan chung chung, 2 nút bo tròn pill cạnh nhau, badge nhỏ "Pha tươi mỗi ngày" phía trên tiêu đề.
- Tiêu đề mục kèm icon trong ô tròn/vuông màu nhạt (vd icon tia sét + "Flash Sale — Hot Deals"), trộn tiếng Anh tiếng Việt.
- Banner gradient cam đỏ bo tròn với icon trong vòng tròn.
- Font Inter ở mọi nơi, mọi tiêu đề cùng một kiểu chữ; mọi nút/badge đều pill; thẻ bóng đổ mềm đồng loạt; animation fade-up (framer-motion) cho mọi khối.
- Icon trang trí rải khắp (lucide trước mỗi tiêu đề, mỗi dòng menu).
QUY TẮC: icon chỉ dùng khi mang chức năng (giỏ hàng, tìm kiếm, tài khoản, đóng, mũi tên điều hướng, gọi điện). Không icon trước tiêu đề mục. Không gradient. Không emoji. Không badge "kiểu AI" trên hero. Bỏ animation vào trang trừ hiệu ứng chuyển slide banner và hover nhẹ.

══════════ 2. NHẬN DIỆN "SIGNATURE" CỦA TD COFFEE ══════════
Chủ đề: **"Quán cà phê Sài Gòn — poster & menu giấy"**. Ấm, có chất in ấn, chữ to đậm như biển hiệu/poster quảng cáo cà phê.
- **Chữ tiêu đề (display):** font nén, đậm, IN HOA kiểu poster — `Oswald` 600/700 (hoặc `Anton`), PHẢI có bộ ký tự tiếng Việt (tải Google Fonts với `subset=vietnamese`, kiểm tra hiển thị đúng dấu "Ừ Ữ Ặ Ỷ" trước khi dùng). Dùng cho tiêu đề banner, tiêu đề mục ("THỨC UỐNG BÁN CHẠY", "ƯU ĐÃI HÔM NAY"), tên chương trình, giá lớn. Tiêu đề mục có thể kèm một dòng chữ phụ nghiêng nhỏ bằng serif (`Playfair Display` italic, có tiếng Việt) như kiểu menu quán: "— pha phin mỗi sáng".
- **Chữ nội dung:** `Be Vietnam Pro` 400/500/600 (font thiết kế cho tiếng Việt) thay Inter ở trang khách.
- **Màu:** nền giấy kem `#F6F0E6`, bề mặt trắng ngà `#FFFCF7`, chữ mực nâu đen `#2A1B12`, màu chủ đạo **đỏ gạch / đất nung** `#B23A1E` (thanh danh mục, nút "Mua ngay", giá), màu phụ nâu cà phê `#6F4E37`, điểm nhấn vàng bơ `#E2A93B` (nhãn giảm giá, tem). Khai báo token riêng cho trang khách (`--c-*`) trong `styles/customer-tokens.css`, không làm đổi màu khu vực nhân sự.
- **Chi tiết đặc trưng (dùng tiết chế, nhất quán):**
  • Đường kẻ mảnh 1px màu nâu nhạt và đường kẻ đôi dưới tiêu đề mục — như menu giấy.
  • Nhãn giảm giá dạng **tem / con dấu** (khung chữ nhật xoay -4°, viền đứt, chữ in hoa) thay badge pill đỏ.
  • Thẻ voucher dạng **vé xé** (mép răng cưa / lỗ tròn hai bên) hiển thị mã + điều kiện.
  • Giá in kiểu menu: tên món ……… giá (dotted leader) ở danh sách dạng menu.
  • Ảnh sản phẩm đặt trên nền khối màu kem đồng nhất, bo góc nhỏ (4–6px), không bóng đổ.
  • Bo góc tổng thể nhỏ (4–6px); nút hình chữ nhật chữ in hoa đậm, không pill.
- Logo: giữ `LogoMark` hiện có, đặt trái header, cỡ lớn hơn.

══════════ 3. BỐ CỤC THEO TỪNG TRANG (tham khảo cấu trúc Highlands) ══════════
**Header (mọi trang khách)**
- Hàng 1 nền kem: logo trái · ô tìm kiếm rộng ở giữa (placeholder "Hôm nay bạn muốn uống gì?") · bên phải: hotline (số lấy từ cấu hình chi nhánh/nút liên hệ, hai dòng "Đặt hàng / 1900 xxxx"), Tài khoản (Đăng nhập / tên khách), Giỏ hàng có số lượng. Ô chọn chi nhánh (StorePicker) dạng chữ nhỏ dưới logo hoặc cạnh hotline.
- Hàng 2 thanh màu đỏ gạch: nút **"DANH MỤC SẢN PHẨM"** (nền kem, mở danh mục) · Thực đơn · Khuyến mãi · Tin tức · Cửa hàng · Liên hệ — chữ trắng, không icon trang trí.
- Dính đầu trang khi cuộn (thu gọn còn hàng 2 + logo nhỏ).

**Trang chủ**
- Khối đầu: **cột trái danh sách danh mục** (ảnh nhỏ món tiêu biểu + tên danh mục, lấy từ API danh mục) + **banner carousel lớn** bên phải. Banner là ảnh do quản lý tải lên (nếu chưa có module Banner thì tạo bảng `Banner` đơn giản: ảnh, tiêu đề, link, thứ tự, bật/tắt, chi nhánh + màn quản trị "Website → Banner"; tạm thời seed 3 banner bằng ảnh món có sẵn với chữ tiêu đề poster đặt trên ảnh). Trên mobile: banner trước, danh mục thành hàng cuộn ngang.
- **Dải voucher dạng vé xé** (4 thẻ, cuộn ngang trên mobile): "NHẬP MÃ: XXX" + điều kiện + nút "Lưu mã"; dữ liệu từ API voucher đang có.
- Nếu có chiến dịch mini game đang chạy: một dải ngang nền nâu, chữ poster "VÒNG QUAY THÁNG 11" + 1 dòng mô tả + nút "Chơi ngay" — thay banner gradient cam hiện tại.
- Các mục sản phẩm: "ƯU ĐÃI HÔM NAY", "BÁN CHẠY", "MÓN MỚI" — tiêu đề poster + gạch đôi + "Xem tất cả →" bên phải; lưới 4 cột desktop / 2 cột mobile; thẻ món: ảnh trên nền kem, tem giảm giá, tên đậm, mô tả 1 dòng, giá gốc gạch + giá bán màu đỏ gạch, nút "+" vuông nhỏ thêm vào giỏ.
- Một khối "CÂU CHUYỆN TD COFFEE": ảnh quán thật / ảnh quầy pha + đoạn văn ngắn + chữ ký tay (SVG) của chủ quán — tạo chất riêng.
- Khối tin tức: 3 bài mới nhất.

**Thực đơn / danh mục**: cột trái danh mục (dính), phải là lưới món; có chế độ xem **"Menu giấy"** (danh sách tên ……… giá theo nhóm, giống menu treo tường) bên cạnh chế độ lưới.

**Chi tiết món** (theo bố cục Highlands): ảnh lớn trái + ảnh nhỏ bên dưới; phải: tên món (display font), mã/tình trạng, giá lớn đỏ gạch, chọn size S/M/L dạng ô vuông, số lượng −/+, nút **MUA NGAY** (đỏ gạch, đặc) + **THÊM VÀO GIỎ** (viền); dưới: "Mô tả sản phẩm" (tiêu đề gạch chân) và cột phải **"ĂN KÈM NGON HƠN"** — danh sách món thường mua kèm (dùng API gợi ý mua kèm nếu có, chưa có thì lấy món cùng nhóm Bánh) với nút "+" thêm nhanh. Đánh giá khách ở dưới cùng.

**Liên hệ** (trang mới `/contact`, menu "Liên hệ"): trái: tên công ty, địa chỉ, SĐT, email (lấy từ cấu hình chuỗi), danh sách chi nhánh có giờ mở cửa; form "LIÊN HỆ VỚI CHÚNG TÔI" (Họ tên, Email, SĐT, Nội dung, nút gửi) — lưu vào bảng `ContactMessage` và hiện ở quản trị (CRM → Liên hệ từ khách); phải: **bản đồ** chi nhánh (Leaflet có sẵn, marker từng chi nhánh, bấm marker hiện địa chỉ + nút "Chỉ đường" mở Google Maps).

**Footer** nền nâu đậm `#2A1B12`, chữ kem: 4 cột — Thông tin công ty (logo, mô tả ngắn, địa chỉ, SĐT, email, mạng xã hội lấy từ cấu hình nút liên hệ) · Chính sách (đặt hàng, bảo mật, thanh toán, đổi trả — trang tĩnh đơn giản) · Hỗ trợ (Tìm kiếm, Đăng nhập, Đăng ký, Giỏ hàng, Liên hệ) · Đăng ký nhận tin (ô email + nút) ; dòng bản quyền dưới cùng. Không icon trước mỗi dòng trừ địa chỉ/SĐT/email.

**Các trang còn lại** (Khuyến mãi, Tin tức, Giỏ hàng, Tài khoản, Đăng nhập/Đăng ký, Theo dõi đơn): áp cùng font, màu, nút, tiêu đề poster, breadcrumb "Trang chủ / …" như Highlands; bỏ icon trang trí và hiệu ứng thừa.

══════════ 4. YÊU CẦU KỸ THUẬT ══════════
- Tải font qua Google Fonts có `subset=vietnamese` + `display=swap`; khai báo `--c-font-display`, `--c-font-serif`, `--c-font-body`.
- CSS trang khách tách ra `styles/customer.css` (dùng class tiền tố `c-`), xóa các class `hp-*` cũ không còn dùng; không để trang khách phụ thuộc token ERP.
- Giữ BottomNav trên điện thoại và cụm nút liên hệ nổi; header mobile: logo + tìm kiếm (icon) + giỏ hàng.
- Ảnh: `loading="lazy"`, tỉ lệ cố định (aspect-ratio) để không giật trang; ảnh thiếu thì hiện khối nền kem có tên món chữ poster thay vì ô xám trống.
- Khả năng truy cập: tương phản chữ ≥ 4.5:1, focus nhìn thấy được, alt cho ảnh.

══════════ 5. CÁCH LÀM & KIỂM TRA ══════════
Thứ tự: token + font → Header + Footer + PublicLayout → Trang chủ → Chi tiết món → Thực đơn → Liên hệ (+ bảng ContactMessage, Banner nếu chưa có) → các trang còn lại → dọn CSS cũ. Mỗi bước một commit; `npm run build` sạch lỗi.
Tự kiểm tra ở 1440px, 1024px, 390px: tiếng Việt có dấu hiển thị đúng ở font tiêu đề; không còn icon trước tiêu đề mục, không gradient, không nút pill; luồng xem món → thêm giỏ → thanh toán vẫn chạy; khu vực nhân sự không đổi màu/font.
Chụp ảnh so sánh TRƯỚC / SAU cho trang chủ, chi tiết món, liên hệ, footer (desktop + điện thoại).
Nếu sắp hết hạn mức phiên: dừng ở cuối một bước, commit, ghi tiến độ vào docs/customer-ui-progress.md.

BÁO LẠI: font đã dùng và đã kiểm tra tiếng Việt chưa, các bảng mới (Banner, ContactMessage), ảnh trước/sau.
