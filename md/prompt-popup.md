Bạn đang làm việc trên repo TD Coffee, nhánh `feat/chain-stores` (backend-node: Express + Prisma + MySQL; frontend-app: Vite + React 19 + TypeScript; khung quản trị trong `src/components/erp/`, menu trong `src/apps/registry.tsx`; trình soạn thảo rich text Tiptap có sẵn ở `components/PostEditor.tsx`; tải ảnh qua `lib/uploadImage.ts` phía backend). Hệ thống có chuỗi chi nhánh (`Store`), bài đăng (`Post`, trang `/blog/:id`), voucher (`Voucher`, trang `/promotions`), menu (`/menu`, `/product/:id`), giỏ hàng (`/cart`). Module Mini game dùng kiến trúc chung `GameCampaign` + trang chơi `/game/:campaignId` (xem `docs/minigame-architecture.md` nếu đã có; nếu chưa có module mini game thì vẫn làm, ô "Mini game" để trống danh sách).

NHIỆM VỤ: Làm module **Pop up** — hộp quảng bá hiện lên khi khách vừa vào web, bấm vào thì nhảy tới trang đích (đọc tin, xem ưu đãi, chơi mini game, xem món…). Giao diện quản trị theo mô tả dưới (dựa trên phần mềm mẫu chủ dự án đưa).

══════════ 1. CSDL (prisma migrate) ══════════
`Popup`: id, tên (bắt buộc), mô tả (HTML từ rich text), ảnh pop up (bắt buộc), **loại đích** `targetType` + **đích** `targetRef`, nút hành động (chữ trên nút, mặc định "Xem ngay"), thứ tự hiển thị (số nguyên), trạng thái (Bật/Tắt), thời gian bắt đầu/kết thúc (tùy chọn), phạm vi chi nhánh (cả chuỗi hoặc danh sách `Store`), đối tượng (mọi khách / chỉ khách đã đăng nhập / chỉ khách mới), tần suất hiển thị (mỗi lần vào web / 1 lần mỗi ngày / 1 lần duy nhất), số lượt hiển thị, số lượt bấm, người tạo, thời điểm tạo/sửa.

**Danh sách loại đích** (`targetType`) — khai báo MỘT chỗ duy nhất (`shared/popupTargets.ts` hoặc tương đương dùng chung cho backend validate + frontend dropdown) để sau này thêm loại mới chỉ cần thêm một dòng:
| targetType | Nhãn trong dropdown | targetRef | Dẫn tới |
|---|---|---|---|
| PROMOTIONS | Ưu đãi | — | `/promotions` |
| VOUCHER | Một voucher cụ thể | voucherId | `/promotions?voucher=<id>` (mở sẵn voucher, nút "Lưu vào ví") |
| MINIGAME | Mini game | gameCampaignId | `/game/<id>` (chỉ liệt kê chiến dịch đang bật) |
| CATEGORY | Danh mục | categoryId | `/menu?category=<id>` |
| PRODUCT | Sản phẩm nổi bật / một món | productId | `/product/<id>` |
| CART | Giỏ hàng của bạn | — | `/cart` |
| ABOUT | Thông tin về chúng tôi | — | `/about` |
| NEWS | Tin tức | — | `/blog` |
| POST | Một bài tin cụ thể | postId | `/blog/<id>` |
| ACCOUNT | Tài khoản / Quà của tôi | — | `/account` |
| URL | Liên kết tùy chỉnh | đường dẫn | đường dẫn nội bộ bắt đầu bằng `/` (hoặc https://… mở tab mới) |

══════════ 2. QUẢN TRỊ (menu CRM → "Pop up", quyền Chủ chuỗi + Quản lý chi nhánh — Quản lý chi nhánh chỉ thấy/sửa pop up của chi nhánh mình) ══════════
a) **Trang danh sách**
   - Breadcrumb "Chiến dịch / Pop up"; tiêu đề **"Danh sách Pop up (chỉ được hiển thị tối đa 3 Pop up)"**; góc phải nút chính **"Thêm Pop up"** có icon (+).
   - Thẻ trắng chứa: ô Tìm kiếm bên trái; bên phải 3 nút icon (làm mới, chọn cột, cài đặt).
   - Bảng cột: ô chọn, **Hình ảnh** (thumbnail), **Tên** (kèm dòng phụ xám: nhãn đích, vd "Mini game: Vòng quay tháng 11"), **Thứ tự hiển thị** (ô số sửa trực tiếp hoặc kéo-thả dòng để đổi thứ tự), **Trạng thái** (công tắc Bật/Tắt), cột phụ Thời gian chạy và Lượt xem / Lượt bấm (tỉ lệ bấm %), **Chỉnh sửa** (icon sửa, icon xóa có xác nhận).
   - Trạng thái rỗng: icon hộp + "Chưa có dữ liệu" + "Bấm "Thêm Pop up" để tạo pop up đầu tiên."
   - Cuối bảng nút **"Lưu"** (icon lưu) để lưu thứ tự + trạng thái đã sửa trực tiếp.
   - **Giới hạn 3:** không cho bật quá 3 pop up đang hiệu lực cùng lúc trong cùng phạm vi chi nhánh (kiểm tra cả ở backend); khi bật cái thứ 4 hiện thông báo rõ và giữ ở Tắt.
b) **Trang Thêm / Sửa pop up** (breadcrumb "Chiến dịch / Pop up / Thêm pop-up"), bố cục 2 cột:
   - Cột trái thẻ **"Thông tin"**: *Tên pop up \** (input "Nhập tên pop up"); *Mô tả pop up* (rich text dùng lại Tiptap PostEditor: kiểu chữ, cỡ chữ, đậm/nghiêng/gạch chân/gạch ngang, màu chữ, màu nền, căn lề, trích dẫn, code, danh sách, thụt lề, chỉ số trên/dưới, chèn link, chèn ảnh, xóa định dạng); *Đường dẫn đến trang \** (dropdown theo bảng loại đích; chọn loại có targetRef thì hiện thêm dropdown thứ hai có tìm kiếm để chọn voucher / chiến dịch mini game / danh mục / món / bài tin, hoặc ô nhập URL); *Chữ trên nút*; *Thứ tự hiển thị*; *Thời gian chạy*; *Chi nhánh áp dụng*; *Đối tượng*; *Tần suất*; *Trạng thái*.
   - Cột phải thẻ **"Hình ảnh pop up"**: ô vuông viền đứt "Tải ảnh lên từ thiết bị" (kéo-thả hoặc bấm chọn, xem trước, đổi/xóa ảnh, gợi ý tỉ lệ 4:5 hoặc 1:1, ≤ 2MB), bên dưới là **xem trước pop up** đúng như khách sẽ thấy (khung điện thoại).
   - Góc dưới phải nút **"Tạo mới"** (khi sửa là "Cập nhật"); validate trường bắt buộc, báo lỗi dưới từng ô.
   - Ghi `AuditLog` khi tạo/sửa/xóa/bật/tắt.

══════════ 3. PHÍA KHÁCH ══════════
- API công khai `GET /api/popups/active?storeId=` trả tối đa 3 pop up đang bật, trong thời gian chạy, đúng chi nhánh khách đang chọn và đúng đối tượng, sắp theo thứ tự hiển thị. Đích MINIGAME / VOUCHER mà chiến dịch/voucher đã hết hạn hoặc tắt thì tự loại pop up đó.
- Component `PopupHost` gắn trong `PublicLayout` (chỉ ở trang khách, không hiện ở /app, /pos, /staff…): khi vào web hiện pop up đầu tiên giữa màn hình trên lớp nền mờ tối; nội dung: ảnh lớn (bấm ảnh = đi tới đích), tên, mô tả HTML (đã lọc an toàn — sanitize, chỉ cho thẻ định dạng cơ bản), nút hành động màu chủ đạo, nút X đóng góc trên, chấm chỉ số "1/3" và vuốt/nút mũi tên nếu có nhiều pop up; tùy chọn "Không hiện lại hôm nay".
- Bấm nút/ảnh → ghi lượt bấm (`POST /api/popups/:id/click`) → `navigate` tới đường dẫn theo bảng loại đích (đích MINIGAME mà khách chưa đăng nhập thì đi qua trang đăng nhập rồi quay lại trang chơi). Ghi lượt hiển thị khi pop up hiện.
- Tần suất: lưu trong localStorage theo id pop up (bọc try/catch; lỗi storage thì vẫn hiện bình thường, tối đa 1 lần mỗi phiên).
- Không hiện pop up khi khách vào thẳng từ QR bàn đang gọi món giữa chừng (trang giỏ hàng / checkout / theo dõi đơn) để không cản thao tác — chỉ hiện ở trang chủ, menu, khuyến mãi, tin tức.
- Mobile: pop up chiếm ~90% chiều rộng, ảnh co theo, nút đóng dễ bấm (≥ 44px), không che BottomNav khi đã đóng.

══════════ 4. GIAO DIỆN ══════════
Theo design system hiện có của nhánh (styles/tokens.css, components/erp): thẻ trắng viền mảnh, bảng dày đặc chữ 13px, nút chính màu chủ đạo, không emoji, không gradient. Pop up phía khách được phép nổi bật hơn nhưng vẫn theo màu thương hiệu.

══════════ 5. CÁCH LÀM & KIỂM TRA ══════════
Thứ tự: migration + danh sách loại đích dùng chung → API admin (CRUD, sắp xếp, bật/tắt, giới hạn 3) → trang danh sách → trang thêm/sửa + xem trước → API công khai + PopupHost → thống kê xem/bấm. Mỗi bước một commit; `npm run build` ở backend-node và frontend-app sạch lỗi.
Seed demo 3 pop up: "Vòng quay tháng 11" (đích MINIGAME, nếu có chiến dịch), "Giảm 20% đơn đầu tiên" (đích VOUCHER), "Món mới: Matcha Latte" (đích PRODUCT).
Tự kiểm tra: bật cái thứ 4 bị chặn; đổi thứ tự rồi bấm Lưu thì phía khách đổi theo; từng loại đích bấm vào ra đúng trang; "1 lần mỗi ngày" không hiện lại sau khi tải lại trang; pop up không hiện ở /cart, /order/…, /app; mô tả có thẻ <script> bị lọc bỏ.
Nếu sắp hết hạn mức phiên: dừng ở cuối một bước, commit, ghi tiến độ vào docs/popup-progress.md.

BÁO LẠI: các bảng/API đã thêm, nơi khai báo danh sách loại đích, ảnh chụp trang danh sách, trang thêm pop up, pop up trên điện thoại.
