# Kiến trúc mini game

Đã chạy: Vòng quay may mắn (`WHEEL`), Thẻ cào (`SCRATCH`), Hộp quà bí mật (`MYSTERY_BOX`) và Lì xì Tết (`SEASONAL`). Thẻ tích ly, nhiệm vụ tuần, đố vui sẽ dùng lại toàn bộ **tầng chung** và chỉ viết **tầng riêng**.

## Thêm một game mới: đúng 4 việc

Ví dụ (Thẻ cào `SCRATCH` đã làm đúng theo các bước này, xem `handlers/scratch.ts` và `modules/games/scratch/`):

1. **Enum**: `SCRATCH` đã có sẵn trong `enum GameType` (`backend-node/prisma/schema.prisma`). Game hoàn toàn mới thì thêm giá trị vào enum, chạy `npx prisma db push`, rồi thêm khoá đó vào `GAME_LABELS` ở backend và `GAME_UI` ở frontend.
2. **Handler backend**: tạo `backend-node/src/games/handlers/scratch.ts` export một `GameHandler`:
   - `validateConfig(config)`: chuẩn hoá `GameCampaign.config` của game, ném `GameError` khi sai.
   - `play(tx, ctx)`: chọn kết quả, thường chỉ là `pickPrize(tx, ctx.campaign.prizes, ctx)`. Trả về `{ prize, data }`; `data` lưu vào `GamePlay.data` và gửi cho giao diện chơi (vd `{ revealedIndex }`).
   - `publicView(campaign)`: dữ liệu cho khách (cấu hình + danh sách ô/quà). **Không** trả tỉ lệ hay số lượng.
3. **Giao diện**: tạo `frontend-app/src/modules/games/scratch/`:
   - `ScratchConfigPanel.tsx` (props `ConfigPanelProps`): khối cấu hình riêng trong trang chi tiết chiến dịch.
   - `ScratchPlayView.tsx` (props `PlayViewProps`): màn chơi của khách. Gọi `POST /api/games/:id/play`, dùng `data` để diễn hoạt, xong thì gọi `onPlayed()`.
   - `Preview` (tuỳ chọn): xem trước trong trang quản trị.
4. **Đăng ký vào 2 registry**:
   - `backend-node/src/games/registry.ts`: đổi `SCRATCH: comingSoon("Thẻ cào")` thành `SCRATCH: scratchHandler`, thêm `"SCRATCH"` vào `READY_GAMES`.
   - `frontend-app/src/modules/games/registry.tsx`: đặt `ready: true`, `defaultConfig`, `ConfigPanel`, `PlayView` (lazy import), `Preview`.

Những phần sau **không cần sửa** khi thêm game: route, lượt chơi, phát thưởng, mã nhận quà, POS, danh sách trúng thưởng, xuất Excel, Quà của tôi, banner, phân quyền, audit.

## Tầng chung

### CSDL (`schema.prisma`, mục MINI GAME)

| Bảng | Vai trò |
|---|---|
| `GameCampaign` | Chiến dịch: `gameType`, thời gian, Bật/Tắt, phạm vi chi nhánh (`allStores` + `GameCampaignStore`), `config` (Json riêng của game), điều kiện nhận lượt (`minOrderValue`, `maxPlaysPerDay`, `allowPointExchange`, `pointsPerTicket`), `claimDays` |
| `GamePrize` | Giải: `kind` PRODUCT / VOUCHER / POINTS / NONE, `productId` / `giftItemId` / `voucherId` / `points`, `label`, `imageUrl`, `weight` (%), `quantity` (null = không giới hạn), `wonCount`, `dailyLimit`, `sortOrder`, `color`, `isActive` (giải đã có người trúng thì khi xoá chỉ ẩn) |
| `GiftItem`, `GiftStock` | Quà hiện vật và tồn theo chi nhánh (`qty`, `reserved` = đang giữ cho người đã trúng) |
| `GameTicket` | Lượt chơi: `source` ORDER / POINTS / ADMIN, `orderId`, `status` UNUSED / USED / REVOKED, `expiresAt` = ngày kết thúc chiến dịch |
| `GamePlay` | Kết quả 1 lượt: snapshot tên/loại/ảnh/tỉ lệ giải, `data` (Json riêng của game), liên kết `userVoucherId` / `pointTransactionId` / `giftClaim` |
| `GiftClaim` | Mã nhận quà tại quầy: `code` 6 ký tự (bỏ 0/O/1/I/L), `status` WAITING / DELIVERED / EXPIRED / CANCELLED, chi nhánh giữ quà, người trao, thời điểm trao |

### Backend (`backend-node/src/games/`)

- `types.ts`: interface `GameHandler`, `PlayContext`, `PlayResult`.
- `errors.ts`: `GameError`, lỗi nghiệp vụ; route trả 400 kèm thông báo tiếng Việt.
- `picker.ts`: `pickPrize`. Khoá mọi giải của chiến dịch theo thứ tự id, rồi chọn theo trọng số bằng `crypto.randomInt`. Giải bị chọn mà không phát được (hết số lượng, chạm giới hạn ngày, hết tồn quà ở chi nhánh, khách đã có voucher đó, voucher hết hạn) thì loại khỏi danh sách và chọn lại theo trọng số còn lại. Hết giải thì rơi về ô NONE.
- `rewards.ts`: `grantReward(tx, play, prize)` phát thưởng cho cả 3 loại:
  - VOUCHER: tạo `UserVoucher`.
  - POINTS: cộng `Customer.points` và ghi `PointTransaction` loại `GAME_REWARD`.
  - PRODUCT: tạo `GiftClaim`, giữ chỗ 1 cái trong `GiftStock`.
- `service.ts`: phần dùng chung còn lại.
  - `playCampaign`: luồng 1 lượt, chạy trong transaction READ COMMITTED: lấy vé bằng `FOR UPDATE SKIP LOCKED` → `handler.play` → tạo `GamePlay` → `grantReward`. Tự thử lại khi MySQL báo deadlock.
  - `issueOrderTickets` / `revokeOrderTickets`: được gọi từ `lib/points.ts` khi đơn chuyển sang Paid (`settlePaidPoints`) và khi đơn hoàn tiền toàn bộ (`refundOrderToPoints`).
  - `exchangePointsForTicket`: đổi điểm lấy lượt.
  - `deliverClaim`: trao quà tại POS.
  - `expireClaims` + `startGiftClaimExpiryJob`: chạy mỗi 10 phút. Mã quá hạn chuyển sang EXPIRED, trả lại số lượng giải và giữ chỗ tồn.
- `registry.ts`: `GAME_HANDLERS: Record<GameType, GameHandler>`, `READY_GAMES`, `GAME_LABELS`.
- `handlers/wheel.ts`: phần riêng của vòng quay (cấu hình màu/ảnh nền, trả `segmentIndex` để giao diện dừng đúng ô).
- `handlers/scratch.ts`: phần riêng của thẻ cào (màu thẻ, màu + chữ lớp phủ, `revealPercent`). Giải được chọn và phát ngay khi khách lấy thẻ; lớp phủ chỉ là diễn hoạt.
- `handlers/pickOne.ts`: `pickOneHandler` dùng chung cho game "chọn 1 trong N" (phần chơi + dữ liệu công khai); game chỉ viết `validateConfig`.
- `handlers/mystery.ts`: Hộp quà bí mật (màu hộp hoặc mỗi hộp một màu, màu ruy băng, số hộp 3/4/6/8/9).
- `handlers/seasonal.ts`: Lì xì Tết (màu bao, màu nhũ, chữ con dấu, số bao 4/6/8/9/12, lời chúc). Bao khách chọn chỉ là diễn hoạt, giải chọn theo tỉ lệ khi mở.

### API (`backend-node/src/routes/games.ts`)

| Phương thức | Đường dẫn | Ai dùng |
|---|---|---|
| GET | `/api/admin/games/options` | Quản trị: món, voucher còn hạn, quà, chi nhánh |
| GET/POST | `/api/admin/games/campaigns` | Danh sách / tạo chiến dịch (`gameType` trong body) |
| GET/PUT/DELETE | `/api/admin/games/campaigns/:id` | Chi tiết / cập nhật (kèm toàn bộ giải) / xoá (chỉ khi chưa có lượt chơi) |
| POST | `/api/admin/games/campaigns/:id/tickets` | Tặng lượt theo SĐT |
| GET | `/api/admin/games/winners` | Danh sách trúng thưởng (`campaignId`, `storeId`, `kind`, `from`, `to`, `onlyWon`) |
| GET/POST/PATCH | `/api/admin/games/gift-items[/:id]` | Quà hiện vật |
| PUT | `/api/admin/games/gift-items/:id/stock` | Đặt tồn quà ở 1 chi nhánh |
| GET/POST | `/api/pos/gift-claims/:code[/deliver]` | Thu ngân tra mã / trao quà |
| GET | `/api/games/active` | Chiến dịch đang chạy (banner) |
| GET | `/api/games/me` | Quà của tôi |
| GET | `/api/games/:id?store=` | Trang chơi: cấu hình công khai và số lượt của khách |
| POST | `/api/games/:id/play` | Chơi 1 lượt (`{ storeId }`) |
| POST | `/api/games/:id/exchange` | Đổi điểm lấy lượt |

Phân quyền: Chủ chuỗi sửa mọi chiến dịch. Quản lý chi nhánh chỉ tạo và sửa chiến dịch riêng của chi nhánh mình, chiến dịch cả chuỗi thì chỉ xem. Sửa tỉ lệ, số lượng, trạng thái đều ghi `AuditLog`.

### Frontend (`frontend-app/src/modules/games/`)

- `registry.tsx`: `GAME_UI[gameType]` gồm `label`, `icon`, `ready`, `defaultConfig`, `ConfigPanel`, `Preview`, `PlayView`.
- `GamesHub.tsx`: CRM › Mini game. Mỗi loại game một thẻ (chưa sẵn sàng thì hiện "Sắp ra mắt"), bên dưới là danh sách chiến dịch của loại đang chọn.
- `GameCampaignDetail.tsx`: trang chi tiết dùng chung, gồm cấu hình chung + `GAME_UI[type].ConfigPanel` + nút Bật/Tắt + in QR, `PrizeTable`, xem trước, ước tính chi phí 1.000 lượt, và `WinnerList`.
- `PrizeTable.tsx`, `WinnerList.tsx`, `GiftItems.tsx`, `MyGifts.tsx` (Quà của tôi + `GameBanner`): dùng chung.
- `PlayParts.tsx`: phần dùng chung của màn chơi: `GameHero`, `PlayGate` (chưa chạy / sai chi nhánh / đăng nhập / hết lượt / đổi điểm), `ResultPopup`, `PrizeChips`.
- `ConfigFields.tsx`: `ColorBox`, `BackgroundBox` cho khối cấu hình riêng.
- `wheel/`: `WheelSvg` (vẽ vòng, `stopAngle`), `WheelConfigPanel`, `WheelPlayView` (quay bằng requestAnimationFrame, tiếng tích `wheelTick.ts`).
- `PickOneGame.tsx`: khung màn chơi "chọn 1 trong N" (chọn → lắc trong lúc gọi máy chủ → mở → popup → bày lại). Game chỉ truyền `renderItem`, `board`, câu chữ.
- `mystery/`: `GiftBox` (hộp quà SVG: nảy / lắc / bung nắp + tia sáng + thẻ quà / mờ), `MysteryConfigPanel`, `MysteryPlayView`.
- `seasonal/`: `Envelope` (bao lì xì SVG: chờ / lắc / mở nắp + thiệp / mờ), `LixiConfigPanel`, `LixiPlayView`.
- `scratch/`: `ScratchCard` (canvas lớp phủ, cào bằng chuột / ngón tay, đo % đã cào), `ScratchConfigPanel`, `ScratchPlayView`.
- Trang khách: `pages/GamePlay.tsx`, route `/game/:campaignId?store=<id>`, render `GAME_UI[gameType].PlayView`.
- POS: `components/PosGiftClaim.tsx` (nút "Nhận quà" ở màn Thu ngân).

## Quyết định đáng chú ý

- **`UserVoucher` unique (khách, voucher)**: giữ nguyên ràng buộc, vì cả hệ thống voucher đang dựa vào luật "mỗi khách dùng 1 lần". Picker loại các giải voucher mà khách **đã có** (dùng rồi hay chưa đều tính) rồi chọn lại theo trọng số còn lại. Nhờ vậy không cần migration và không phát trùng. Khi tạo voucher cho vòng quay, nên chọn loại **Cá nhân** để chỉ người trúng dùng được.
- **Chống vượt số lượng khi nhiều người chơi cùng lúc**: khoá dòng giải (`FOR UPDATE`), đếm giới hạn ngày bằng đọc có khoá, tồn quà khoá `FOR UPDATE`. Script `npm run games:sim` quay 200 lượt (10 lượt song song mỗi đợt) để kiểm tra.
- **Quà là món thực đơn** (vd 1 ly Bạc Xỉu) không trừ tồn khi trao. Thu ngân pha món như bình thường; giới hạn bằng `quantity` của giải.

## Lệnh

```bash
cd backend-node
npx prisma db push      # tạo bảng
npm run db:games        # seed "Vòng quay tháng 11" + 12 khách demo (mật khẩu 123456) + ~40 lượt quay
npm run games:sim       # quay thử 200 lượt trên chiến dịch tạm, in bảng tỉ lệ, tự dọn
```
