Bạn đang làm việc trên repo TD Coffee, nhánh `feat/chain-stores` (backend-node: Express + Prisma + MySQL; frontend-app: Vite + React 19 + TypeScript, khung ERP trong `src/components/erp/`, menu trong `src/apps/registry.tsx`). Hệ thống đã có chuỗi chi nhánh (`Store`), khách hàng có điểm (`Customer.points` + `PointTransaction`), voucher (`Voucher`, `UserVoucher`, `VoucherStore`), sản phẩm (`Product`, `StoreProduct`), POS, audit log.

NHIỆM VỤ: Làm module **Vòng quay may mắn** (mini game đầu tiên). Quản lý tạo chiến dịch vòng quay, cấu hình giải thưởng; khách quay trên web/app; thu ngân trao quà tại POS; có danh sách trúng thưởng xuất Excel. Giao diện quản trị làm theo mô tả bên dưới (dựa trên phần mềm mẫu chủ dự án đưa).

══════════ 1. BA LOẠI PHẦN THƯỞNG ══════════
Mỗi giải trong vòng quay thuộc đúng một loại:
- **PRODUCT – Sản phẩm / quà hiện vật:** chọn một món trong thực đơn (`Product`, vd 1 ly Bạc Xỉu) HOẶC một quà tặng hiện vật do quán tự thêm (bảng mới `GiftItem`: tên, ảnh, giá trị ước tính, ghi chú — vd "Nón bảo hiểm TD Coffee"). Khi trúng → sinh **mã nhận quà** (`GiftClaim`), khách nhận tại quầy trong N ngày.
- **VOUCHER – Chương trình khuyến mãi:** chọn một `Voucher` đang hoạt động. Khi trúng → tạo `UserVoucher` cho khách (vào ví voucher, dùng ở checkout/POS như hiện tại). Lưu ý `UserVoucher` có `@@unique([customerId, voucherId])`: nếu khách đã có voucher này chưa dùng thì coi như giải khác (xem mục 4 – quay lại) hoặc cộng điểm thay thế; nếu đã dùng rồi thì cần xử lý hợp lý (vd bỏ ràng buộc unique bằng migration và kiểm tra ở code) — chọn cách an toàn, ghi rõ trong báo cáo.
- **POINTS – Điểm tùy chỉnh:** quản lý nhập số điểm (vd 10.000 điểm). Khi trúng → cộng `Customer.points` và ghi `PointTransaction` type mới `GAME_REWARD`, note "Vòng quay: <tên chiến dịch>".
Thêm một ô đặc biệt **"Chúc bạn may mắn lần sau"** (loại NONE) để vòng quay không phải lúc nào cũng trúng.

══════════ 1b. KIẾN TRÚC MỞ RỘNG CHO CÁC MINI GAME SAU (BẮT BUỘC) ══════════
Vòng quay chỉ là game ĐẦU TIÊN. Sau này sẽ thêm: Thẻ cào / Hộp quà bí mật, Thẻ tích ly (stamp card), Nhiệm vụ tuần, Đố vui, Lì xì theo mùa. Vì vậy KHÔNG thiết kế riêng cho vòng quay, mà tách 2 tầng:

- **Tầng chung (dùng cho mọi game):** chiến dịch, giải thưởng, lượt chơi, kết quả chơi, phát thưởng, quà hiện vật / nhận quà tại POS, danh sách trúng thưởng, xuất Excel, báo cáo, phân quyền, audit log.
- **Tầng riêng của từng game:** chỉ gồm (1) cấu hình riêng (vd màu nền/viền vòng quay), (2) cách chọn kết quả, (3) giao diện chơi của khách, (4) khối cấu hình riêng trong trang quản trị.

Cụ thể:
- CSDL: dùng tên chung `GameCampaign`, `GamePrize`, `GameTicket`, `GamePlay`, `GiftItem`, `GiftStock`, `GiftClaim`. `GameCampaign` có trường `gameType` (enum: WHEEL, SCRATCH, MYSTERY_BOX, STAMP, MISSION, QUIZ, SEASONAL — hiện chỉ cài WHEEL) và trường `config` kiểu Json chứa cấu hình riêng của từng game (WHEEL: backgroundUrl, wheelColor, borderColor, …). Không tạo bảng mang tên "LuckyWheel…".
- Backend: thư mục `src/games/` gồm
  • `rewards.ts` — `grantReward(tx, play, prize)` phát thưởng cho 3 loại PRODUCT / VOUCHER / POINTS (+ NONE), dùng chung cho mọi game;
  • `picker.ts` — chọn giải theo trọng số + kiểm tra số lượng / giới hạn ngày / tồn quà (dùng lại cho thẻ cào, hộp quà…);
  • `registry.ts` — `GAME_HANDLERS: Record<GameType, GameHandler>` với interface `GameHandler { validateConfig(config); play(tx, ctx): Promise<PlayResult>; publicView(campaign) }`;
  • `handlers/wheel.ts` — chỉ chứa phần riêng của vòng quay.
  Route chung: `POST /api/games/:campaignId/play` → tra `gameType` → gọi handler. Admin CRUD chung `/api/admin/games/...`.
- Frontend: `src/modules/games/` gồm
  • trang hub **"Mini game"** (menu CRM): thẻ cho từng loại game; WHEEL bấm vào được, các loại khác hiện "Sắp ra mắt";
  • `GameCampaignList`, `GameCampaignDetail` dùng chung; trong trang chi tiết, khối cấu hình riêng lấy từ `GAME_UI[gameType].ConfigPanel`, bảng giải và danh sách trúng thưởng là component chung (`PrizeTable`, `WinnerList`);
  • phía khách: route `/game/:campaignId` render `GAME_UI[gameType].PlayView` (WHEEL → `WheelPlayView`); "Quà của tôi" dùng chung.
- Ghi file `docs/minigame-architecture.md` mô tả: muốn thêm một game mới cần làm đúng 4 việc (thêm giá trị enum, viết handler backend, viết ConfigPanel + PlayView, đăng ký vào 2 registry) — để phiên Claude Code sau làm thẻ cào chỉ cần đọc file này.

Ở các mục dưới, "chiến dịch / giải / lượt / kết quả" nghĩa là các bảng chung ở trên.

══════════ 2. CSDL (prisma migrate, đặt tên migration rõ ràng) ══════════
- `GameCampaign` (chiến dịch, gameType = WHEEL cho vòng quay): tên, mô tả, thời gian bắt đầu/kết thúc, trạng thái Bật/Tắt, phạm vi chi nhánh (cả chuỗi hoặc danh sách `Store`), `config` Json (với WHEEL: ảnh nền trước khi quay, màu nền vòng quay, màu viền vòng quay), điều kiện nhận lượt (giá trị đơn tối thiểu, số lượt tối đa / khách / ngày, cho phép đổi điểm lấy lượt + số điểm mỗi lượt), số ngày hạn nhận quà hiện vật, người tạo, thời điểm tạo/sửa.
- `GamePrize`: campaignId, loại (PRODUCT / VOUCHER / POINTS / NONE), productId?, giftItemId?, voucherId?, points?, nội dung hiển thị, ảnh, **tỉ lệ (trọng số %)**, **số lượng** (tổng), số đã trúng, giới hạn mỗi ngày (tùy chọn), thứ tự trên vòng, màu ô (tùy chọn).
- `GiftItem` (+ `GiftStock` theo chi nhánh: tồn, đang giữ chỗ).
- `GameTicket` (lượt chơi): khách, campaignId, nguồn (ORDER / POINTS / ADMIN), orderId?, trạng thái (UNUSED / USED / REVOKED), hết hạn.
- `GamePlay` (kết quả một lượt chơi): ticketId, khách, campaignId, prizeId, storeId, thời điểm chơi, dữ liệu riêng của game (Json, vd chỉ số ô dừng), snapshot tên/loại/ảnh/tỉ lệ giải lúc trúng, liên kết kết quả (userVoucherId? / pointTransactionId? / giftClaimId?).
- `GiftClaim`: khách, playId, quà (product hoặc giftItem), chi nhánh nhận, mã nhận (ngắn, dễ đọc) + QR, hạn, trạng thái (WAITING / DELIVERED / EXPIRED / CANCELLED), nhân viên trao, thời điểm trao.

══════════ 3. QUẢN TRỊ (frontend, menu CRM → "Mini game" → chiến dịch loại Vòng quay, quyền Chủ chuỗi + Quản lý chi nhánh) ══════════
a) **Danh sách chiến dịch** (ListView): tên, thời gian, chi nhánh, trạng thái, số lượt quay, số giải đã phát; nút Tạo mới.

b) **Trang chi tiết chiến dịch** gồm 3 khối từ trên xuống:
   - **Khối cấu hình chung:** tên, thời gian, chi nhánh áp dụng, điều kiện nhận lượt; hàng ngang gồm: *Background trước khi quay* (ô ảnh xem trước, bấm để tải ảnh — dùng `uploadImage` có sẵn), *Màu nền vòng quay* (ô màu + mã hex, color picker), *Màu viền vòng quay* (ô màu + mã hex), *Trạng thái* (nút bật/tắt dạng segmented: Bật màu chủ đạo / Tắt viền). Góc phải: nút **"In mã QR"** (in QR dẫn tới trang chơi của chiến dịch, theo chi nhánh, khổ A5/A6 để dán quầy — dùng thư viện `qrcode` đã có).
   - **Khối bảng giải thưởng** (bảng sửa trực tiếp): cột *Hình ảnh* (thumbnail, bấm đổi ảnh; mặc định lấy ảnh món/quà/voucher), *Nội dung phần thưởng \** (textarea, bắt buộc), *Tỉ lệ* (input số %), *Số lượng* (input số; POINTS và NONE cho phép để trống = không giới hạn), *Loại khuyến mãi* (badge màu: "Sản phẩm" xanh lá, "Voucher" xanh dương, "Điểm" cam, "Không trúng" xám), *Hành động* (nút Xóa viền). Dòng loại VOUCHER hiển thị nội dung từ voucher (chỉ đọc).
     Cuối bảng: nút tròn **(+)** mở popover 3 lựa chọn: **"Thêm sản phẩm"** (mở modal chọn món thực đơn hoặc quà hiện vật, có tab "Quà tặng" để tạo nhanh quà mới), **"Thêm chương trình khuyến mãi"** (modal chọn voucher đang hoạt động), **"Thêm điểm"** (modal nhập số điểm). Có nút thêm ô "Chúc may mắn lần sau".
     Dưới bảng: dòng tổng tỉ lệ (phải = 100%, nếu khác hiện cảnh báo đỏ và chặn lưu), **xem trước vòng quay** (render đúng màu nền/viền, các ô theo thứ tự) và ước tính chi phí cho 1.000 lượt quay.
     Nút cuối khối: **"Cập nhật"** (màu chủ đạo) và **"Xóa chiến dịch này"** (đỏ, có hộp xác nhận; chiến dịch đã có lượt quay thì chỉ cho Tắt, không cho xóa).
   - **Khối "Danh sách trúng thưởng"** (cũng có trang riêng): tiêu đề + nút **"Xuất Excel"** (viền) ở góc phải; ô Tìm kiếm (tên/SĐT/tên giải); góc phải bảng: nút làm mới, nút chọn cột hiển thị, nút cài đặt. Cột: ô chọn, *Người chơi* (avatar tròn hoặc chữ viết tắt + tên đậm + SĐT bên dưới), *Liên hệ* (icon gọi điện / nhắn tin mở `tel:`), *Thời điểm quay* (giờ trên, ngày dưới), *Tên phần thưởng*, *Tỉ lệ trúng thưởng*, *Số lượng còn lại*, *Loại phần thưởng* (badge), *Trạng thái nhận* (với quà hiện vật: Chờ nhận / Đã trao / Quá hạn), *Chi nhánh*, *Hình ảnh phần thưởng* (thumbnail). Lọc theo chi nhánh, loại giải, khoảng ngày; phân trang "1-6 trên 6 mặt hàng", chọn 10/20/50 dòng một trang. Xuất Excel đủ tất cả cột (dùng cách export đang có trong dự án hoặc thêm `xlsx`).

══════════ 4. PHÍA KHÁCH ══════════
- Trang chơi `/game/:campaignId` (WheelPlayView) (vào từ QR in tại quầy, banner trang chủ, hoặc màn "Đặt hàng thành công"): trước khi quay hiện background của chiến dịch + số lượt còn lại; vòng quay vẽ bằng SVG/canvas theo màu nền/viền và các ô (ảnh + chữ ngắn); nút QUAY; hiệu ứng quay 4–6 giây dừng đúng ô kết quả; popup kết quả: voucher (nút "Dùng ngay"), điểm (+10.000 điểm), quà hiện vật (mã nhận + QR + hạn + chi nhánh nhận), "Chúc may mắn lần sau".
- Khách vãng lai: bắt đăng nhập/đăng ký bằng SĐT trước khi quay.
- Mục **"Quà của tôi"** trong trang Tài khoản: lượt quay còn lại, lịch sử quay, mã nhận quà đang chờ.
- Nhận lượt: tự cấp `GameTicket` cho các chiến dịch đang chạy khi đơn chuyển sang Paid và đạt giá trị tối thiểu (hook vào chỗ đơn được thanh toán hiện có); đổi điểm lấy lượt nếu chiến dịch cho phép; đơn bị hủy/hoàn → thu hồi lượt chưa dùng.
- Trên mobile dùng chung BottomNav hiện có.

══════════ 5. BACKEND & AN TOÀN ══════════
- API `POST /api/games/:campaignId/play` (handler WHEEL): kiểm tra chiến dịch đang bật, đúng thời gian, đúng chi nhánh, khách có lượt hợp lệ; **chọn giải ở server** bằng `crypto.randomInt` theo trọng số, chỉ trong các giải còn số lượng / chưa chạm giới hạn ngày / còn tồn quà ở chi nhánh; nếu giải bị chọn đã hết → loại khỏi danh sách và chọn lại theo trọng số còn lại; nếu không còn giải nào → NONE. Toàn bộ trong **transaction** (khóa dòng giải, trừ số lượng, đánh dấu ticket USED, tạo GamePlay, gọi `grantReward`) để hai người quay cùng lúc không vượt số lượng. Trả về chỉ số ô để frontend dừng đúng chỗ.
- Admin API CRUD chiến dịch/giải/quà (Owner: mọi chi nhánh; Admin: chi nhánh của mình), validate tổng tỉ lệ = 100, ghi `AuditLog` khi sửa tỉ lệ/số lượng/trạng thái.
- POS: ô "Nhận quà" — nhập/quét mã → hiện tên khách, SĐT, quà, hạn → nút "Đã trao" (trừ tồn GiftStock, ghi nhân viên, thời gian). Job định kỳ chuyển GiftClaim quá hạn sang EXPIRED và trả lại số lượng giải + tồn giữ chỗ.
- Seed demo: 1 chiến dịch "Vòng quay tháng 11" cho cả chuỗi với 8 ô (1 ly Bạc Xỉu, Nón bảo hiểm TD Coffee 30 cái, Voucher 20%, Voucher 15.000đ, 10.000 điểm, 2.000 điểm, Nâng size miễn phí, Chúc may mắn lần sau) và ~40 lượt quay mẫu để danh sách trúng thưởng có dữ liệu.

══════════ 6. GIAO DIỆN ══════════
Theo design system hiện có của nhánh (styles/tokens.css, components/erp): thẻ trắng viền mảnh, bảng dày đặc chữ 13px, nút chính màu chủ đạo, badge màu nhạt. Không emoji, không gradient trên trang quản trị (trang chơi của khách được phép sinh động hơn nhưng vẫn theo màu chiến dịch).

══════════ CÁCH LÀM & KIỂM TRA ══════════
Thứ tự: migration + seed → API admin → trang quản trị (cấu hình, bảng giải, xem trước) → API quay + phát thưởng → trang chơi của khách + Quà của tôi → POS nhận quà → Danh sách trúng thưởng + Xuất Excel. Mỗi bước một commit; `npm run build` ở backend-node và frontend-app sạch lỗi.
Tự kiểm tra: tạo chiến dịch, tổng tỉ lệ ≠ 100 bị chặn; quay 200 lần bằng script → tỉ lệ thực tế gần cấu hình và không giải nào vượt số lượng; trúng voucher thấy trong ví và dùng được ở checkout; trúng điểm thấy điểm tăng và có PointTransaction; trúng nón → mã nhận → POS bấm Đã trao → tồn giảm; xuất Excel mở được.
Nếu sắp hết hạn mức phiên: dừng ở cuối một bước, commit, ghi tiến độ vào docs/minigame-progress.md. Thứ tự làm bắt đầu bằng tầng chung (mục 1b) trước rồi mới tới phần riêng của vòng quay.

BÁO LẠI: các bảng/API đã thêm, nội dung docs/minigame-architecture.md, cách xử lý ràng buộc unique của UserVoucher, ảnh chụp trang cấu hình, bảng giải, trang quay của khách trên điện thoại, danh sách trúng thưởng.
