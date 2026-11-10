Bạn đang làm việc trên repo TD Coffee, nhánh `feat/chain-stores` (backend-node: Express + Prisma + MySQL; frontend-app: Vite + React 19 + TypeScript + lucide-react). Trang khách dùng `components/PublicLayout.tsx`; đã có `components/ChatWidget.tsx` (chat với quán), `components/BottomNav.tsx` (thanh đáy trên điện thoại), bảng `Store` (chi nhánh, có `phone`), khách chọn chi nhánh qua `StorePicker`.

NHIỆM VỤ: Thêm **cụm nút liên hệ nổi** ở góc phải màn hình trang khách, xếp dọc từ trên xuống: **Gọi ngay**, **Zalo**, **Messenger**, và dưới cùng là nút **Chat** (nút ChatWidget hiện có, có thể dùng ảnh linh vật). Bấm là nhảy thẳng vào gọi điện / mở Zalo / mở Messenger của quán. Chủ chuỗi / quản lý tự dán link, thêm bớt nút trên trang quản trị (động, không hard-code).

══════════ 1. CSDL & CẤU HÌNH (ĐỘNG — KHÔNG HARD-CODE LINK) ══════════
Mọi số điện thoại / link do Chủ chuỗi (và Quản lý chi nhánh cho chi nhánh mình) **dán vào trên giao diện quản trị**, lưu trong CSDL; KHÔNG ghi cứng trong code hay file .env. Không cần API của Zalo / Facebook — chỉ là link.
- Migration bảng `ContactButton`: id, `storeId` (null = mặc định cả chuỗi), `type` (PHONE | ZALO | MESSENGER | CUSTOM), nhãn hiển thị, giá trị (SĐT hoặc link người quản lý dán vào), màu nền (mặc định theo loại), icon (với CUSTOM: chọn từ danh sách icon có sẵn — TikTok, Facebook, Instagram, Google Maps, Shopee/GrabFood, Website…, hoặc tải ảnh icon), thứ tự, bật/tắt, thời điểm sửa, người sửa.
- Logic áp dụng: chi nhánh có nút riêng thì dùng nút của chi nhánh; loại nào chi nhánh không khai báo thì lấy nút mặc định của chuỗi.
- Màn quản trị **"Cấu hình → Nút liên hệ"**:
  • Ô chọn phạm vi: "Mặc định cả chuỗi" (chỉ Chủ chuỗi) hoặc từng chi nhánh.
  • Danh sách nút dạng bảng sửa trực tiếp: kéo-thả đổi thứ tự, công tắc bật/tắt, loại, nhãn, **ô dán link / SĐT**, màu, icon, nút "Thử" (mở link ở tab mới để kiểm tra), nút Xóa; nút "+ Thêm nút" (chọn loại).
  • Bên phải: **xem trước cụm nút** cập nhật ngay khi sửa.
  • Nút "Lưu" → có hiệu lực ngay trên web khách, không cần build lại.
  • Tự nhận diện & chuẩn hóa khi dán: SĐT Việt Nam (bỏ khoảng trắng, +84 → 0); Zalo nhận số hoặc `https://zalo.me/...`; Messenger nhận `https://m.me/...`, `https://www.facebook.com/<page>` hoặc `fb.com/<page>` (tự đổi sang `https://m.me/<page>`); CUSTOM chỉ nhận `https://`. Sai định dạng → báo lỗi dưới ô. Ghi `AuditLog` khi sửa.
- API: admin CRUD `/api/admin/contact-buttons`; công khai `GET /api/contact-buttons?storeId=` trả danh sách nút đã gộp (chi nhánh + mặc định chuỗi), đã chuẩn hóa link, chỉ nút đang bật, theo thứ tự. Frontend lấy dữ liệu này để vẽ, không có link nào nằm trong code.

══════════ 2. COMPONENT `FloatingContact.tsx` ══════════
- Vị trí: cố định góc phải, cách mép phải 16px, cách đáy 24px (trên điện thoại cách đáy = chiều cao BottomNav + 16px + `env(safe-area-inset-bottom)` để không che thanh đáy). z-index thấp hơn modal / pop up.
- Mỗi nút: hình tròn 52px (44px trên điện thoại nhỏ), nền **xanh dương #0068FF** (màu Zalo, giống ảnh mẫu) hoặc theo màu thương hiệu từng nút: Gọi ngay = xanh dương / xanh lá, Zalo = #0068FF, Messenger = #0084FF; icon trắng ở giữa (Phone của lucide; logo Zalo và Messenger dùng SVG inline đơn giản, không tải ảnh ngoài); viền trắng 3px và bóng đổ nhẹ để nổi trên mọi nền; khoảng cách giữa các nút 12px.
- Nút Gọi ngay có hiệu ứng nhịp nhẹ (pulse vòng sóng) để thu hút, tắt khi `prefers-reduced-motion`.
- Rê chuột (desktop): hiện nhãn bên trái nút ("Gọi 0901 234 567", "Chat Zalo", "Nhắn Messenger").
- Hành vi:
  • Gọi ngay → `tel:<hotline>`; trên desktop không gọi được thì hiện hộp nhỏ có số điện thoại + nút sao chép.
  • Zalo → `https://zalo.me/<số hoặc OA>` (mở app Zalo trên điện thoại, mở web trên máy tính), tab mới.
  • Messenger → `https://m.me/<page>`, tab mới.
  • Chat → mở ChatWidget hiện có (chuyển nút mở ChatWidget vào cuối cụm này để không bị chồng hai nút nổi).
- Vẽ cụm nút từ API `GET /api/contact-buttons` (thứ tự, màu, icon, nhãn theo cấu hình); nút CUSTOM mở link ở tab mới. Không có nút nào bật thì ẩn cả cụm (trừ nút Chat). Có nút thu gọn nhỏ (mũi tên) để khách giấu cụm nút; nhớ lựa chọn trong sessionStorage (bọc try/catch).
- Ghi lượt bấm từng nút (`POST /api/contact-clicks` hoặc gộp vào cơ chế thống kê hiện có) để báo cáo kênh liên hệ nào được dùng nhiều.
- Có `aria-label` cho từng nút, focus nhìn thấy được khi dùng bàn phím.

══════════ 3. HIỂN THỊ Ở ĐÂU ══════════
- Gắn trong `PublicLayout` → hiện ở mọi trang khách (trang chủ, menu, chi tiết món, khuyến mãi, tin tức, tài khoản, theo dõi đơn).
- Ẩn ở trang thanh toán (`/order/:id/checkout`) và khi đang mở pop up / modal để không cản thao tác.
- KHÔNG hiện ở khu vực nhân sự (/app, /pos, /staff/…).

══════════ 4. KIỂM TRA ══════════
- `npm run build` ở backend-node và frontend-app sạch lỗi.
- Seed: nút mặc định cả chuỗi (Gọi ngay, Zalo, Messenger) + 1 chi nhánh có hotline riêng.
- Ở 390px và 1440px: cụm nút không che BottomNav, nút Thêm vào giỏ, hay nội dung chính; đổi chi nhánh thì số điện thoại / link đổi theo; bấm Gọi ngay trên điện thoại mở trình gọi điện; Zalo / Messenger mở đúng link; chi nhánh để trống link thì nút ẩn hoặc dùng mặc định chuỗi; ChatWidget vẫn mở được và chỉ còn một nút chat.

BÁO LẠI: các trường đã thêm, ảnh chụp cụm nút trên điện thoại và máy tính, ảnh màn "Cấu hình → Nút liên hệ" (có xem trước); xác nhận đổi link trong quản trị là web khách đổi ngay không cần build.
