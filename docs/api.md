# Danh mục API (backend-node)

Sinh tự động bằng `node docs/scripts/gen-api.mjs` (chạy ở thư mục gốc) từ mã nguồn (tiền tố mount trong `backend-node/src/index.ts` + các route trong `backend-node/src/routes/*.ts`): **484 endpoint, 60 file route**. Cột "Middleware" là middleware gắn trên từng route (`—` = không gắn; route có thể vẫn tự kiểm tra trong thân hàm hoặc dùng middleware gắn chung cho router bằng `r.use(...)`).

Middleware thường gặp: `attachStaff`, `anyStaff` = JWT nhân sự; `requireRoles(...)`, `mgmtOnly`, `adminOnly`, `owner`, `managers`, `stock` = giới hạn vai trò; `requireStore` = phải chọn 1 chi nhánh (Chủ chuỗi gửi header `X-Store-Id`); `customerAuth`, `optionalCustomerAuth` = JWT khách; `authSupp` = JWT nhà cung cấp.

## Mục lục

- [addresses.ts](#addressests) (2)
- [admin.ts](#admints) (40)
- [aiAgents.ts](#aiagentsts) (8)
- [aiDashboard.ts](#aidashboardts) (4)
- [analyst.ts](#analystts) (7)
- [attendance.ts](#attendancets) (9)
- [auditLog.ts](#auditlogts) (1)
- [auth.ts](#authts) (3)
- [branchProposals.ts](#branchproposalsts) (6)
- [brand.ts](#brandts) (10)
- [cash.ts](#cashts) (20)
- [catalog.ts](#catalogts) (5)
- [chat.ts](#chatts) (15)
- [combo.ts](#combots) (10)
- [contactButtons.ts](#contactbuttonsts) (6)
- [customer.ts](#customerts) (12)
- [customerInsights.ts](#customerinsightsts) (8)
- [delivery.ts](#deliveryts) (12)
- [formula.ts](#formulats) (3)
- [games.ts](#gamests) (19)
- [home.ts](#homets) (1)
- [hrConfig.ts](#hrconfigts) (2)
- [hrRequests.ts](#hrrequeststs) (17)
- [inventoryCounts.ts](#inventorycountsts) (4)
- [invoiceOcr.ts](#invoiceocrts) (3)
- [kitchen.ts](#kitchents) (5)
- [knowledge.ts](#knowledgets) (17)
- [menu.ts](#menuts) (3)
- [menuProposals.ts](#menuproposalsts) (8)
- [momo.ts](#momots) (2)
- [myStats.ts](#mystatsts) (2)
- [notifications.ts](#notificationsts) (11)
- [nutrition.ts](#nutritionts) (8)
- [orders.ts](#ordersts) (8)
- [payroll.ts](#payrollts) (7)
- [popups.ts](#popupsts) (12)
- [pos.ts](#posts) (12)
- [posts.ts](#poststs) (7)
- [procurement.ts](#procurementts) (23)
- [promotions.ts](#promotionsts) (8)
- [reports.ts](#reportsts) (7)
- [reviews.ts](#reviewsts) (5)
- [schedule.ts](#schedulets) (14)
- [searchInsights.ts](#searchinsightsts) (3)
- [sepay.ts](#sepayts) (4)
- [shiftWishes.ts](#shiftwishests) (5)
- [shifts.ts](#shiftsts) (3)
- [site.ts](#sitets) (12)
- [socialAuth.ts](#socialauthts) (8)
- [staffAuth.ts](#staffauthts) (6)
- [staffOps.ts](#staffopsts) (10)
- [stockRequests.ts](#stockrequeststs) (4)
- [stockTransfer.ts](#stocktransferts) (5)
- [stores.ts](#storests) (5)
- [supplier.ts](#supplierts) (5)
- [tasks.ts](#tasksts) (10)
- [tracking.ts](#trackingts) (3)
- [vnpay.ts](#vnpayts) (3)
- [voiceOrder.ts](#voiceorderts) (2)
- [vouchers.ts](#vouchersts) (10)

## addresses.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/customer-addresses` | — |
| POST | `/api/customer-addresses` | — |

## admin.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/admin/categories` | admin |
| POST | `/api/admin/categories` | owner |
| DELETE | `/api/admin/categories/:id` | owner |
| PATCH | `/api/admin/categories/:id` | owner |
| GET | `/api/admin/customers` | admin |
| PATCH | `/api/admin/customers/:id` | owner |
| POST | `/api/admin/customers/:id/reset-password` | owner |
| GET | `/api/admin/export/revenue.csv` | admin |
| GET | `/api/admin/inventory` | stock |
| POST | `/api/admin/inventory` | owner |
| DELETE | `/api/admin/inventory/:id` | owner |
| PATCH | `/api/admin/inventory/:id` | stock |
| POST | `/api/admin/inventory/:id/receive` | stockStore |
| GET | `/api/admin/inventory/expiring` | stock |
| POST | `/api/admin/inventory/receipts/:id/discard` | stock |
| GET | `/api/admin/products` | admin |
| POST | `/api/admin/products` | owner |
| PATCH | `/api/admin/products/:id` | owner |
| PATCH | `/api/admin/products/:id/availability` | storeAdmin |
| GET | `/api/admin/receipts` | stock |
| GET | `/api/admin/reports/top-products` | admin |
| GET | `/api/admin/reviews` | admin |
| PATCH | `/api/admin/reviews/:id` | admin |
| GET | `/api/admin/settings` | admin |
| PATCH | `/api/admin/settings` | auth, requireRoles("Owner") |
| GET | `/api/admin/staff` | admin |
| POST | `/api/admin/staff` | admin |
| DELETE | `/api/admin/staff/:id` | admin |
| PATCH | `/api/admin/staff/:id` | admin |
| GET | `/api/admin/staff/:id/face-photo` | admin |
| PATCH | `/api/admin/staff/:id/reset-face` | admin |
| GET | `/api/admin/stats` | stock |
| GET | `/api/admin/tables` | admin |
| POST | `/api/admin/tables` | storeAdmin |
| PATCH | `/api/admin/tables/:id` | admin |
| POST | `/api/admin/upload-image` | admin |
| GET | `/api/admin/zones` | admin |
| POST | `/api/admin/zones` | storeAdmin |
| DELETE | `/api/admin/zones/:id` | admin |
| PATCH | `/api/admin/zones/:id` | admin |

## aiAgents.ts

Quản lý AI Agent tư vấn. Bộ máy trả lời: ai/agent/engine.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/ai/agents` | viewers |
| POST | `/api/ai/agents` | owner |
| DELETE | `/api/ai/agents/:id` | owner |
| GET | `/api/ai/agents/:id` | viewers |
| PUT | `/api/ai/agents/:id` | owner |
| PATCH | `/api/ai/agents/:id/enabled` | owner |
| POST | `/api/ai/agents/:id/test` | viewers |
| GET | `/api/ai/agents/channels` | viewers |

## aiDashboard.ts

Bảng điều khiển AI, lịch sử thực thi, đánh giá câu trả lời.

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/ai/dashboard` | owner |
| GET | `/api/ai/runs` | owner |
| GET | `/api/ai/runs/:id` | owner |
| POST | `/api/ai/runs/:id/feedback` | chatStaff |

## analyst.ts

Trợ lý AI hỏi số liệu (Chủ chuỗi + Quản lý chi nhánh) và cài đặt bật / tắt tính năng AI.

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/ai/settings` | managers |
| PUT | `/api/ai/settings/:feature` | auth, requireRoles("Owner") |
| POST | `/api/analyst/ask` | managers, enabled |
| GET | `/api/analyst/conversations` | managers |
| DELETE | `/api/analyst/conversations/:id` | managers |
| GET | `/api/analyst/conversations/:id` | managers |
| POST | `/api/analyst/messages/:id/rate` | managers |

## attendance.ts

Chấm công GPS + FaceID & Tăng ca

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| POST | `/api/attendance/clock` | atStore |
| GET | `/api/attendance/face-descriptor` | anyStaff |
| GET | `/api/attendance/my-month` | anyStaff |
| POST | `/api/attendance/register-face` | anyStaff |
| POST | `/api/attendance/request-overtime` | anyStaff |
| GET | `/api/attendance/store-location` | atStore |
| GET | `/api/attendance/today` | anyStaff |
| GET | `/api/attendance/today-store` | mgmtOnly, requireStore |
| GET | `/api/attendance/warnings` | mgmtOnly |

## auditLog.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/admin/audit-logs` | admin |

## auth.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| POST | `/api/auth/login` | — |
| GET | `/api/auth/me` | customerAuth |
| POST | `/api/auth/register` | — |

## branchProposals.ts

Quản lý chi nhánh đề xuất lên Chủ chuỗi

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/branch-proposals` | viewers |
| POST | `/api/branch-proposals` | manager |
| PUT | `/api/branch-proposals/:id` | manager |
| POST | `/api/branch-proposals/:id/cancel` | manager |
| POST | `/api/branch-proposals/:id/done` | owner |
| POST | `/api/branch-proposals/:id/review` | owner |

## brand.ts

Trang câu chuyện thương hiệu (/about) + hồ sơ giới thiệu chi nhánh (/stores/:id)

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/admin/brand/images` | manager |
| PATCH | `/api/admin/brand/order` | owner |
| GET | `/api/admin/brand/sections` | owner |
| GET | `/api/admin/brand/sections/:key` | owner |
| PUT | `/api/admin/brand/sections/:key` | owner |
| GET | `/api/admin/stores/:id/profile` | manager |
| PUT | `/api/admin/stores/:id/profile` | manager |
| GET | `/api/site/brand` | — |
| GET | `/api/site/brand/stats` | — |
| GET | `/api/stores/:id/public` | — |

## cash.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/cash/daily` | managerStore |
| GET | `/api/cash/entries` | cashier |
| POST | `/api/cash/entries` | cashierStore |
| POST | `/api/cash/entries/:id/approve` | manager |
| POST | `/api/cash/entries/:id/cancel` | cashier |
| POST | `/api/cash/entries/:id/reject` | manager |
| GET | `/api/cash/overview` | cashier |
| GET | `/api/cash/payables` | manager |
| POST | `/api/cash/payables` | managerStore |
| POST | `/api/cash/payables/:id/cancel` | managerStore |
| POST | `/api/cash/payables/:id/pay` | managerStore |
| GET | `/api/cash/pnl` | manager |
| GET | `/api/cash/safe` | cashierStore |
| POST | `/api/cash/safe/close` | cashierStore |
| POST | `/api/cash/safe/open` | cashierStore |
| GET | `/api/cash/safe/sessions/:id` | cashier |
| GET | `/api/cash/shifts` | cashier |
| GET | `/api/cash/shifts/:id/report` | cashier |
| POST | `/api/cash/shifts/:id/review` | manager |
| GET | `/api/cash/supplier-credits` | manager |

## catalog.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/categories` | — |
| GET | `/api/inventory` | — |
| GET | `/api/products` | — |
| GET | `/api/products/:id` | — |
| GET | `/api/products/:id/extras` | — |

## chat.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| POST | `/api/chat` | optionalCustomerAuth |
| GET | `/api/chat/assistant` | — |
| POST | `/api/chat/messages/:id/react` | — |
| GET | `/api/chat/session/:id` | — |
| POST | `/api/staff/chat/messages/:id/react` | attachStaff(prisma), requireRoles("Admin", "Cashier", "Waiter", "Kitchen") |
| GET | `/api/staff/chat/sessions` | staffAuth |
| GET | `/api/staff/chat/sessions/:id` | attachStaff(prisma), requireRoles("Admin", "Cashier", "Waiter", "Kitchen") |
| PATCH | `/api/staff/chat/sessions/:id/ai` | staffAuth |
| PATCH | `/api/staff/chat/sessions/:id/close` | staffAuth |
| POST | `/api/staff/chat/sessions/:id/read` | staffAuth |
| POST | `/api/staff/chat/sessions/:id/reply` | attachStaff(prisma), requireRoles("Admin", "Cashier", "Waiter", "Kitchen") |
| GET | `/api/staff/chat/sessions/all` | staffAuth |
| GET | `/api/staff/chat/unread` | staffAuth |
| GET | `/api/staff/complaints` | managers |
| PATCH | `/api/staff/complaints/:id` | managers |

## combo.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/admin/combos` | admin |
| POST | `/api/admin/combos` | owner |
| DELETE | `/api/admin/combos/:id` | owner |
| PUT | `/api/admin/combos/:id` | owner |
| PATCH | `/api/admin/combos/:id/toggle-active` | owner |
| PATCH | `/api/admin/combos/:id/toggle-hot` | owner |
| GET | `/api/admin/combos/stats` | admin |
| GET | `/api/combos` | — |
| GET | `/api/combos/:id` | — |
| GET | `/api/combos/hot` | — |

## contactButtons.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/admin/contact-buttons` | manager |
| PUT | `/api/admin/contact-buttons` | manager |
| GET | `/api/admin/contact-buttons/meta` | manager |
| POST | `/api/admin/contact-buttons/normalize` | manager |
| GET | `/api/contact-buttons` | — |
| POST | `/api/contact-clicks` | — |

## customer.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/customer/default-note` | customerAuth |
| PUT | `/api/customer/default-note` | customerAuth |
| GET | `/api/customer/messages` | customerAuth |
| POST | `/api/customer/messages/read` | customerAuth |
| GET | `/api/customer/orders` | customerAuth |
| GET | `/api/customer/orders/:id/reorder` | customerAuth |
| PATCH | `/api/customer/password` | customerAuth |
| GET | `/api/customer/points-history` | customerAuth |
| PATCH | `/api/customer/profile` | customerAuth |
| GET | `/api/customer/summary` | customerAuth |
| GET | `/api/customer/usual` | customerAuth |
| GET | `/api/customer/usual/:productId` | customerAuth |

## customerInsights.ts

Hồ sơ khách hàng cho quản lý: thói quen (món hay uống, khung giờ, kênh), tần suất quay lại,

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| POST | `/api/admin/customers/:id/care/message` | admin |
| POST | `/api/admin/customers/:id/care/points` | admin |
| POST | `/api/admin/customers/:id/care/voucher` | admin |
| GET | `/api/admin/customers/:id/care/vouchers` | admin |
| GET | `/api/admin/customers/:id/insights` | admin |
| GET | `/api/admin/customers/:id/orders` | admin |
| GET | `/api/admin/customers/:id/points` | admin |
| GET | `/api/admin/customers/summary` | admin |

## delivery.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| POST | `/api/delivery/:id/assign` | cashier |
| POST | `/api/delivery/:id/confirm` | cashier |
| POST | `/api/delivery/:id/refund-decision` | auth, requireRoles("Admin") |
| POST | `/api/delivery/:id/reject` | cashier |
| GET | `/api/delivery/board` | cashier |
| GET | `/api/orders/:id/tracking` | — |
| POST | `/api/shipper/location` | shipperOnly |
| GET | `/api/shipper/me` | shipperOnly |
| POST | `/api/shipper/online` | shipperOnly |
| POST | `/api/shipper/orders/:id/deliver` | shipperOnly |
| POST | `/api/shipper/orders/:id/fail` | shipperOnly |
| POST | `/api/shipper/pickup` | shipperOnly |

## formula.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/admin/formulas` | adminOnly |
| PUT | `/api/admin/formulas/product/:productId` | owner |
| GET | `/api/admin/product-costs` | adminOnly |

## games.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/admin/games/campaigns` | manager |
| POST | `/api/admin/games/campaigns` | manager |
| DELETE | `/api/admin/games/campaigns/:id` | manager |
| GET | `/api/admin/games/campaigns/:id` | manager |
| PUT | `/api/admin/games/campaigns/:id` | manager |
| POST | `/api/admin/games/campaigns/:id/tickets` | manager |
| GET | `/api/admin/games/gift-items` | manager |
| POST | `/api/admin/games/gift-items` | manager |
| PATCH | `/api/admin/games/gift-items/:id` | manager |
| PUT | `/api/admin/games/gift-items/:id/stock` | manager |
| GET | `/api/admin/games/options` | manager |
| GET | `/api/admin/games/winners` | manager |
| GET | `/api/games/:id` | optionalCustomerAuth |
| POST | `/api/games/:id/exchange` | customerAuth |
| POST | `/api/games/:id/play` | customerAuth |
| GET | `/api/games/active` | optionalCustomerAuth |
| GET | `/api/games/me` | customerAuth |
| GET | `/api/pos/gift-claims/:code` | cashier |
| POST | `/api/pos/gift-claims/:code/deliver` | cashier |

## home.ts

Trang chủ khách › "Hợp thời tiết hôm nay" (công khai).

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/home/weather-picks` | — |

## hrConfig.ts

Cấu hình ca làm, định biên, quy tắc chấm công (toàn chuỗi)

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/hr/config` | anyStaff |
| PUT | `/api/hr/config` | owner |

## hrRequests.ts

Đơn từ nhân sự

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/hr/attendance` | anyStaff |
| POST | `/api/hr/attendance` | anyStaff |
| DELETE | `/api/hr/attendance/:id` | anyStaff |
| PUT | `/api/hr/attendance/:id/review` | mgmtOnly |
| GET | `/api/hr/leave` | anyStaff |
| POST | `/api/hr/leave` | anyStaff |
| DELETE | `/api/hr/leave/:id` | anyStaff |
| PUT | `/api/hr/leave/:id/review` | mgmtOnly |
| GET | `/api/hr/swap` | anyStaff |
| POST | `/api/hr/swap` | anyStaff |
| DELETE | `/api/hr/swap/:id` | anyStaff |
| PUT | `/api/hr/swap/:id/review` | mgmtOnly |
| PUT | `/api/hr/swap/:id/target-review` | anyStaff |
| GET | `/api/hr/work` | anyStaff |
| POST | `/api/hr/work` | anyStaff |
| DELETE | `/api/hr/work/:id` | anyStaff |
| PUT | `/api/hr/work/:id/review` | mgmtOnly |

## inventoryCounts.ts

Phiếu kiểm kê kho

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/inventory-counts` | stock |
| POST | `/api/inventory-counts` | stockStore |
| POST | `/api/inventory-counts/:id/approve` | manager |
| POST | `/api/inventory-counts/:id/reject` | manager |

## invoiceOcr.ts

Đọc hoá đơn nhà cung cấp bằng AI khi nhận hàng theo đơn mua.

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/ai/invoice-ocr/stats` | auth, requireRoles("Owner") |
| GET | `/api/ai/invoice-ocr/status` | auth, requireRoles("Admin", "Warehouse") |
| POST | `/api/purchasing/orders/:id/read-invoice` | purchasingStore |

## kitchen.ts

Thao tác nhanh ở quầy pha chế (màn KDS)

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/kitchen/items` | kitchen |
| GET | `/api/kitchen/products` | kitchen |
| PATCH | `/api/kitchen/products/:id` | kitchen |
| GET | `/api/kitchen/waste` | viewers |
| POST | `/api/kitchen/waste` | kitchen |

## knowledge.ts

Kho tri thức cho AI tư vấn (RAG). Xử lý tài liệu: ai/knowledge/ingest.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/knowledge-bases` | managers |
| POST | `/api/knowledge-bases` | managers |
| DELETE | `/api/knowledge-bases/:id` | managers |
| GET | `/api/knowledge-bases/:id` | managers |
| PATCH | `/api/knowledge-bases/:id` | managers |
| GET | `/api/knowledge-bases/:id/documents` | managers |
| POST | `/api/knowledge-bases/:id/documents/faq` | managers |
| POST | `/api/knowledge-bases/:id/documents/faq/import` | managers |
| POST | `/api/knowledge-bases/:id/documents/text` | managers |
| POST | `/api/knowledge-bases/:id/documents/upload` | managers |
| POST | `/api/knowledge-bases/search-test` | managers |
| DELETE | `/api/knowledge-documents/:id` | managers |
| GET | `/api/knowledge-documents/:id` | managers |
| PATCH | `/api/knowledge-documents/:id` | managers |
| GET | `/api/knowledge-documents/:id/chunks` | managers |
| GET | `/api/knowledge-documents/:id/file` | managers |
| POST | `/api/knowledge-documents/:id/reindex` | managers |

## menu.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/homepage` | — |
| GET | `/api/menu` | optionalCustomerAuth |
| GET | `/api/store-config` | — |

## menuProposals.ts

Pha chế đề xuất món mới

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/menu-proposals` | anyStaff |
| POST | `/api/menu-proposals` | proposer |
| GET | `/api/menu-proposals/:id` | anyStaff |
| POST | `/api/menu-proposals/:id/created` | owner |
| POST | `/api/menu-proposals/:id/review` | owner |
| POST | `/api/menu-proposals/ai-draft` | proposer |
| GET | `/api/menu-proposals/ai-draft/status` | proposer |
| POST | `/api/menu-proposals/evaluate` | proposer |

## momo.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| POST | `/api/momo/ipn` | — |
| POST | `/api/orders/:id/momo/create` | — |

## myStats.ts

Số liệu hôm nay của chính nhân viên (Bảng điều khiển)

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/staff/kitchen/stats` | attachStaff(prisma), requireRoles("Kitchen", "Admin"), requireStore |
| GET | `/api/staff/me/today` | attachStaff(prisma), requireStore |

## notifications.ts

Trung tâm thông báo

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/notifications` | auth |
| POST | `/api/notifications/:id/read` | auth |
| POST | `/api/notifications/:id/recall` | manager |
| GET | `/api/notifications/audience` | manager |
| POST | `/api/notifications/broadcast` | manager |
| POST | `/api/notifications/read-all` | auth |
| GET | `/api/notifications/sent` | manager |
| GET | `/api/notifications/unread` | auth |
| GET | `/api/push/public-key` | auth |
| POST | `/api/push/subscribe` | auth |
| POST | `/api/push/unsubscribe` | auth |

## nutrition.ts

Dinh dưỡng nguyên liệu (quản lý), dinh dưỡng món (khách), sở thích ăn uống của khách.

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/customer/diet-prefs` | customerAuth |
| PUT | `/api/customer/diet-prefs` | customerAuth |
| GET | `/api/menu/:id/nutrition` | — |
| GET | `/api/nutrition/ingredients` | viewers |
| PUT | `/api/nutrition/ingredients/:itemId` | owner |
| POST | `/api/nutrition/ingredients/approve` | owner |
| POST | `/api/nutrition/ingredients/suggest` | owner |
| GET | `/api/nutrition/products/:id` | viewers |

## orders.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| PATCH | `/api/kds/details/:id` | kitchenAuth |
| GET | `/api/kds/queue` | kitchenAuth |
| POST | `/api/orders` | optionalCustomerAuth |
| GET | `/api/orders/:id` | — |
| GET | `/api/orders/:id/bill` | — |
| POST | `/api/orders/:id/cancel` | optionalCustomerAuth |
| POST | `/api/orders/:id/redeem-points` | optionalCustomerAuth |
| POST | `/api/orders/:id/request-payment` | optionalCustomerAuth |

## payroll.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/payroll/calculate` | auth, requireRoles("Admin") |
| GET | `/api/payroll/config` | auth, requireRoles("Admin") |
| POST | `/api/payroll/config` | auth, requireRoles("Admin") |
| GET | `/api/payroll/export` | auth, requireRoles("Admin") |
| POST | `/api/payroll/finalize` | auth, requireRoles("Admin") |
| GET | `/api/payroll/my-payslips` | auth |
| POST | `/api/payroll/update-bonus` | auth, requireRoles("Admin") |

## popups.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/admin/popups` | manager |
| PATCH | `/api/admin/popups` | manager |
| POST | `/api/admin/popups` | manager |
| DELETE | `/api/admin/popups/:id` | manager |
| GET | `/api/admin/popups/:id` | manager |
| PUT | `/api/admin/popups/:id` | manager |
| GET | `/api/admin/popups/meta` | manager |
| GET | `/api/admin/popups/ref-options` | manager |
| POST | `/api/popups/:id/click` | — |
| POST | `/api/popups/:id/view` | — |
| GET | `/api/popups/active` | optionalCustomerAuth |
| GET | `/api/popups/voucher/:id` | — |

## pos.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| POST | `/api/pos/ack-online` | cashier |
| GET | `/api/pos/bills` | cashier |
| GET | `/api/pos/bills/:id` | cashier |
| GET | `/api/pos/customer-habits` | cashier |
| POST | `/api/pos/merge-tables` | floor |
| POST | `/api/pos/move-table` | floor |
| POST | `/api/pos/pay` | cashier |
| GET | `/api/pos/pending-orders` | cashier |
| POST | `/api/pos/split-order` | auth, requireRoles("Cashier", "Admin"), requireStore |
| GET | `/api/pos/store-settings` | cashier |
| GET | `/api/pos/tables` | auth |
| GET | `/api/pos/zones` | auth |

## posts.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/posts` | — |
| POST | `/api/posts` | owner |
| DELETE | `/api/posts/:id` | owner |
| GET | `/api/posts/:id` | — |
| PATCH | `/api/posts/:id` | owner |
| GET | `/api/posts/admin` | adminOnly |
| GET | `/api/posts/gallery` | — |

## procurement.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/purchasing/documents` | purchasing |
| GET | `/api/purchasing/my-requisitions` | authStaff |
| GET | `/api/purchasing/orders` | purchasing |
| POST | `/api/purchasing/orders/:id/close` | approver |
| POST | `/api/purchasing/orders/:id/receive` | purchasingStore |
| GET | `/api/purchasing/requisitions` | purchasing |
| POST | `/api/purchasing/requisitions` | purchasingStore |
| POST | `/api/purchasing/requisitions/:id/approve` | approver |
| GET | `/api/purchasing/returnable-lots` | purchasingStore |
| GET | `/api/purchasing/returns` | purchasing |
| POST | `/api/purchasing/returns` | purchasingStore |
| POST | `/api/purchasing/returns/:id/approve` | approver |
| POST | `/api/purchasing/returns/:id/reject` | approver |
| GET | `/api/purchasing/rfqs` | purchasing |
| POST | `/api/purchasing/rfqs/:id/select-quote` | approver |
| GET | `/api/supplier/bills` | authSupp |
| POST | `/api/supplier/login` | — |
| GET | `/api/supplier/me` | authSupp |
| GET | `/api/supplier/orders` | authSupp |
| GET | `/api/supplier/returns` | authSupp |
| POST | `/api/supplier/returns/:id/respond` | authSupp |
| GET | `/api/supplier/rfqs` | authSupp |
| POST | `/api/supplier/rfqs/:id/quote` | authSupp |

## promotions.ts

Ưu đãi số lượng (đợt sales)

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/admin/promotions` | owner |
| POST | `/api/admin/promotions` | owner |
| DELETE | `/api/admin/promotions/:id` | owner |
| PUT | `/api/admin/promotions/:id` | owner |
| PATCH | `/api/admin/promotions/:id/toggle` | owner |
| GET | `/api/admin/promotions/stats` | owner |
| GET | `/api/promotions/active` | — |
| POST | `/api/promotions/preview` | — |

## reports.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/admin/reports/dashboard` | admin |
| GET | `/api/admin/reports/orders` | admin |
| GET | `/api/admin/reports/orders/export` | admin |
| GET | `/api/admin/reports/profit` | admin |
| GET | `/api/admin/reports/revenue` | admin |
| GET | `/api/admin/reports/stores-compare` | auth, requireRoles("Owner") |
| GET | `/api/admin/reports/top-products` | admin |

## reviews.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/reviews` | — |
| POST | `/api/reviews` | customerAuth |
| GET | `/api/reviews/eligible-orders` | customerAuth |
| GET | `/api/reviews/product-eligible/:productId` | customerAuth |
| POST | `/api/reviews/upload-image` | customerAuth |

## schedule.ts

Lịch làm việc (WorkSchedule) v3 — xếp theo tháng

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| DELETE | `/api/schedule/:id` | mgmtOnly |
| PUT | `/api/schedule/:id` | mgmtOnly |
| POST | `/api/schedule/admin` | mgmtOnly |
| GET | `/api/schedule/admin/all` | anyStaff |
| POST | `/api/schedule/admin/auto` | mgmtOnly |
| POST | `/api/schedule/admin/extra` | mgmtOnly |
| DELETE | `/api/schedule/admin/extra-group/:group` | mgmtOnly |
| POST | `/api/schedule/admin/publish` | mgmtOnly |
| GET | `/api/schedule/admin/runs` | mgmtOnly |
| POST | `/api/schedule/admin/runs/:id/apply` | mgmtOnly |
| POST | `/api/schedule/admin/runs/:id/explain` | mgmtOnly |
| GET | `/api/schedule/my` | anyStaff |
| GET | `/api/schedule/open` | anyStaff |
| POST | `/api/schedule/open/:id/claim` | anyStaff |

## searchInsights.ts

Khách tìm món gì, món nào quán chưa có

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/search-insights` | manager |
| POST | `/api/search-insights/dismiss` | manager |
| POST | `/api/search-log` | optionalCustomerAuth |

## sepay.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| POST | `/api/orders/:id/sepay/confirm` | — |
| POST | `/api/orders/:id/sepay/create` | — |
| GET | `/api/orders/:id/vietqr` | — |
| POST | `/api/sepay/ipn` | — |

## shiftWishes.ts

Nguyện vọng xếp ca viết tự nhiên.

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/shift-wishes` | mgmtOnly |
| GET | `/api/shift-wishes/my` | staffOnly |
| PUT | `/api/shift-wishes/my` | staffOnly |
| POST | `/api/shift-wishes/parse` | staffOnly |
| POST | `/api/shift-wishes/remind` | mgmtOnly |

## shifts.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| POST | `/api/shifts/close` | staffAuth |
| GET | `/api/shifts/open` | staffAuth |
| POST | `/api/shifts/open` | staffAuth |

## site.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/admin/banners` | manager |
| POST | `/api/admin/banners` | manager |
| DELETE | `/api/admin/banners/:id` | manager |
| PUT | `/api/admin/banners/:id` | manager |
| GET | `/api/admin/contact-messages` | manager |
| PATCH | `/api/admin/contact-messages/:id` | manager |
| PATCH | `/api/admin/site-info` | auth, requireRoles("Owner") |
| PATCH | `/api/admin/site-theme` | auth, requireRoles("Owner") |
| GET | `/api/banners` | — |
| POST | `/api/contact-messages` | — |
| GET | `/api/site-info` | — |
| GET | `/api/site/stats` | — |

## socialAuth.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| POST | `/api/auth/facebook` | — |
| POST | `/api/auth/google` | — |
| GET | `/api/auth/identities` | customerAuth |
| DELETE | `/api/auth/identities/:provider` | customerAuth |
| POST | `/api/auth/identities/:provider` | customerAuth |
| POST | `/api/auth/phone` | customerAuth |
| GET | `/api/auth/providers` | — |
| POST | `/api/auth/social/link` | — |

## staffAuth.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| POST | `/api/staff/login` | — |
| PATCH | `/api/staff/me` | auth |
| POST | `/api/staff/me/change-password` | auth |
| GET | `/api/staff/me/face-photo` | auth |
| GET | `/api/staff/me/profile` | auth |
| GET | `/api/staff/members` | auth |

## staffOps.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| POST | `/api/staff/order-items/:id/served` | auth, requireRoles("Waiter", "Admin", "Cashier"), requireStore |
| GET | `/api/staff/order-items/live` | auth, requireRoles("Waiter", "Admin", "Cashier", "Kitchen"), requireStore |
| POST | `/api/staff/orders/:orderId/items/:detailId/cancel` | waiterOps |
| POST | `/api/staff/orders/merge` | auth, requireRoles("Waiter", "Admin"), requireStore |
| POST | `/api/staff/orders/request-payment` | waiterOps |
| POST | `/api/staff/tables/:id/clean` | waiterOps |
| POST | `/api/staff/tables/:id/clear` | waiterOps |
| GET | `/api/staff/tables/:id/context` | waiterOps |
| POST | `/api/staff/tables/:id/items` | waiterOps |
| GET | `/api/takeaway/new` | — |

## stockRequests.ts

Cần hàng gấp giữa các chi nhánh

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/stock-requests` | stock |
| POST | `/api/stock-requests` | stockStore |
| POST | `/api/stock-requests/:id/accept` | stockStore |
| POST | `/api/stock-requests/:id/cancel` | stockStore |

## stockTransfer.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/admin/stock-transfers` | admin |
| POST | `/api/admin/stock-transfers` | storeAdmin |
| POST | `/api/admin/stock-transfers/:id/cancel` | storeAdmin |
| POST | `/api/admin/stock-transfers/:id/receive` | storeAdmin |
| POST | `/api/admin/stock-transfers/:id/ship` | storeAdmin |

## stores.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/admin/stores` | admin |
| POST | `/api/admin/stores` | owner |
| PATCH | `/api/admin/stores/:id` | admin |
| GET | `/api/stores` | — |
| GET | `/api/tables/:id/store` | — |

## supplier.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/admin/suppliers` | admin |
| POST | `/api/admin/suppliers` | owner |
| DELETE | `/api/admin/suppliers/:id` | owner |
| PATCH | `/api/admin/suppliers/:id` | owner |
| GET | `/api/admin/suppliers/:id/receipts` | admin |

## tasks.ts

Giao việc trong ngày (vệ sinh khu vực, kiểm kê, chuẩn bị…)

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/tasks` | manager |
| POST | `/api/tasks` | manager |
| DELETE | `/api/tasks/:id` | manager |
| PUT | `/api/tasks/:id` | manager |
| POST | `/api/tasks/:id/done` | staffStore |
| POST | `/api/tasks/:id/redo` | manager |
| POST | `/api/tasks/:id/undo` | staffStore |
| GET | `/api/tasks/assignees` | manager |
| POST | `/api/tasks/copy` | manager |
| GET | `/api/tasks/my` | staffStore |

## tracking.ts

Hành vi khách trên web

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/behavior-insights` | manager |
| GET | `/api/behavior-insights/product/:id` | manager |
| POST | `/api/track` | express.text({ type: "text/plain", limit: "64kb" }), optionalCustomerAuth |

## vnpay.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| POST | `/api/orders/:id/vnpay/client-confirm` | — |
| POST | `/api/orders/:id/vnpay/create` | — |
| GET | `/api/vnpay/ipn` | — |

## voiceOrder.ts

Đặt món bằng giọng nói / câu tự nhiên.

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| POST | `/api/voice-order/parse` | receive |
| GET | `/api/voice-order/status` | — |

## vouchers.ts

| Phương thức | Đường dẫn | Middleware |
|---|---|---|
| GET | `/api/vouchers/admin` | adminOnly |
| POST | `/api/vouchers/admin` | adminOnly |
| PATCH | `/api/vouchers/admin/:id` | adminOnly |
| GET | `/api/vouchers/admin/stats` | adminOnly |
| POST | `/api/vouchers/apply` | cashierAuth |
| POST | `/api/vouchers/claim` | customerAuth |
| GET | `/api/vouchers/my` | customerAuth |
| GET | `/api/vouchers/public` | — |
| POST | `/api/vouchers/validate` | cashierAuth |
| POST | `/api/vouchers/validate-public` | — |
