# Prompt: Món mới từ nhu cầu tìm kiếm, AI đề xuất công thức + giá vốn (#7)

Tính năng #7 trong `plan/de-xuat-ai-gemini.md`. Làm trên nhánh `feat/chain-stores`, **một phiên Claude Code** (prompt ở cuối file).

## Câu chuyện khi demo

1. Màn **Khách tìm kiếm** cho thấy: 37 khách tìm "matcha dừa" trong 30 ngày, quán chưa có món nào khớp.
2. Bấm **"AI phác thảo món"** → vài giây sau có **2–3 phương án**: "Matcha Kem Dừa", "Matcha Latte Dừa Đá"… mỗi phương án có định mức nguyên liệu S/M/L **chọn từ kho thật của quán**, cách pha, nhiệt độ phục vụ.
3. Mỗi phương án hiện ngay **giá vốn S/M/L** (code tính bằng đúng công thức giá vốn hệ thống đang dùng), **giá bán gợi ý** theo biên lợi nhuận các món cùng danh mục, **% lãi gộp**, và nguyên liệu nào **chưa có trong kho** (phải mua thêm, giá ước tính).
4. Chọn một phương án, sửa nếu cần → **gửi đề xuất** cho Chủ chuỗi như luồng hiện có. Chủ chuỗi duyệt → pha chế thử → **"Tạo món"** thì form tạo món đã điền sẵn tên, mô tả, giá và **định mức** (thành `ProductFormula` luôn).

Dữ liệu khách tìm → AI sáng tạo → số liệu giá vốn thật → quy trình duyệt có sẵn. Đây là một vòng khép kín đẹp để trình bày.

## Thiết kế (đọc trước khi dán prompt)

- **AI chỉ phác thảo, người quyết định.** Không phương án nào tự lên thực đơn. Luồng duyệt `PENDING → APPROVED → CREATED` của `MenuProposal` giữ nguyên.
- **Giá vốn do code tính, không lấy từ AI.** AI trả định mức (nguyên liệu + lượng theo size). Code nhân với `InventoryItem.unitCostPrice` bằng `stockPerCup()` giống hệt `lib/productCost.ts`, nên số khớp với màn Công thức & giá vốn. Nguyên liệu chưa có trong kho thì AI ước giá (đánh dấu "ước tính"), người dùng sửa được.
- **Giá bán gợi ý do code tính:** lấy tỉ lệ giá vốn / giá bán **trung vị** của các món đang bán cùng danh mục (VD trà sữa đang ở mức 28%), giá gợi ý = giá vốn ÷ tỉ lệ đó, làm tròn lên 1.000đ, kèm khoảng giá các món cùng danh mục để so. Nếu % lãi gộp thấp hơn mức tối thiểu (mặc định 60%) thì cảnh báo.
- **AI chọn nguyên liệu trong kho thật:** gửi kèm danh sách nguyên liệu (id, tên, đơn vị công thức, giá, còn hàng ở chi nhánh không) và **2–3 công thức món tương tự đang bán** làm mẫu định lượng (để AI không cho 200 ml sữa đặc vào một ly).
- **Kiểm tra bằng code:** itemId phải có thật; lượng không âm; S ≤ M ≤ L; tổng thể tích lỏng mỗi size không vượt dung tích ly (hằng số, mặc định S 350 ml, M 450 ml, L 600 ml) và không quá ít; tên không trùng món đang có; thiếu nguyên liệu nền (VD món "matcha" mà không có matcha) → cảnh báo.
- **Tắt được:** thêm `MENU_DRAFT` vào `AI_FEATURES` (`backend-node/src/ai/settings.ts`). Tắt thì nút "AI phác thảo" ẩn, đề xuất món nhập tay như hiện nay.

## Code có sẵn (đã kiểm tra trên `feat/chain-stores`)

| Cần | Có sẵn |
|---|---|
| Từ khóa khách tìm, số khách, trạng thái MISSING | `lib/searchInsights.ts` (`computeSearchInsights`, `normalizeTerm`), màn `modules/sales/SearchInsights.tsx` (đã có nút gửi đề xuất, gọi `POST /api/menu-proposals` với `searchTerm`) |
| Đề xuất món | bảng `MenuProposal` (name, description, recipe text, suggestedPrice, categoryId, source STAFF/SEARCH, searchTerm, status), `routes/menuProposals.ts`, màn `modules/sales/Proposals.tsx` |
| Tạo món từ đề xuất | `modules/sales/ProductForm.tsx` mở bằng `?proposal=<id>`, sau khi tạo gọi `/menu-proposals/:id/created` |
| Định mức | `ProductFormula` (qtyPerUnit, qtySizeS/M/L, recipeUnit, conversionFactor), trang `pages/IngredientFormula.tsx`, `routes/formula.ts` |
| Giá vốn | `lib/productCost.ts` (`productCosts`, `recalcProductCost`), `lib/inventory.ts` → `stockPerCup()` |
| Nguyên liệu & tồn | `InventoryItem` (unitCostPrice, recipeUnit, recipePerUnit), `StoreInventory` |
| Nóng / đá | `Product.temps` |
| Gemini, bật / tắt | `backend-node/src/ai/gemini.ts` (`gemini()`, `withRetry`, `AI_CONFIG.chatModel`), `ai/settings.ts`, frontend `lib/aiFeatures.ts` |
| Dinh dưỡng (nếu đã làm prompt dinh dưỡng) | `lib/nutrition/compute.ts` → hiện luôn kcal / caffeine ước tính của phương án |

---

## Prompt (dán vào Claude Code)

```
Làm trên nhánh feat/chain-stores. Đọc plan/prompt-mon-moi-tu-tim-kiem.md và plan/de-xuat-ai-gemini.md (mục #7 và mục 3 "Bật / tắt AI").

Mục tiêu: từ một từ khóa khách tìm mà quán chưa có (hoặc một ý tưởng nhân viên gõ), AI phác thảo 2–3 phương án món mới với định mức chọn từ kho thật; code tính giá vốn S/M/L, giá bán gợi ý, % lãi gộp; người dùng chọn / sửa rồi gửi vào luồng đề xuất món hiện có. AI không tự tạo món.

## 0. Bật / tắt
Thêm MENU_DRAFT vào AI_FEATURES (backend-node/src/ai/settings.ts): label "AI phác thảo món mới", mặc định bật, dailyLimit 50, hourlyPerUser 10. API trả 503 { unavailable } khi tắt / thiếu khóa / Gemini lỗi.

## 1. Ngữ cảnh gửi cho AI: backend-node/src/lib/menuDraft/context.ts
buildDraftContext({ storeId, term?, idea?, categoryId? }):
- Nhu cầu: từ khóa, các cách gõ phổ biến, số khách tìm, số ngày (lấy từ computeSearchInsights nếu có term).
- Danh mục đang có (id, tên) để AI chọn.
- Nguyên liệu: mọi InventoryItem còn dùng: { id, name, category, recipeUnit, costPerRecipeUnit (= unitCostPrice / recipePerUnit hoặc conversionFactor tương ứng), inStockAtStore (StoreInventory.stockQty > 0) }. Giới hạn gọn (bỏ nguyên liệu không dùng cho đồ uống / bánh nếu quá dài).
- 3 món mẫu gần nhất (theo danh mục gợi ý và độ giống tên với từ khóa bằng normalizeTerm / levenshtein): tên, temps, định mức S/M/L theo đơn vị công thức, giá vốn, giá bán. Dùng làm mẫu định lượng.
- Món đang có tên gần giống (để AI tránh trùng).

## 2. Gọi AI: backend-node/src/lib/menuDraft/generate.ts
Gemini AI_CONFIG.chatModel, responseSchema:
{
  understood: string,   // AI hiểu khách muốn gì, 1 câu
  options: [{           // 2–3 phương án khác nhau rõ rệt (VD latte / đá xay / kem muối)
    name: string, description: string (≤ 160 ký tự, giọng menu), categoryId: integer,
    temps: "BOTH"|"ICED"|"HOT"|"NONE", hasSizes: boolean,
    lines: [{ itemId: integer|null, newIngredient: { name, recipeUnit, estCostPerRecipeUnit, note } | null,
              qtyS: number|null, qtyM: number, qtyL: number|null, recipeUnit: string, role: "base"|"milk"|"sweetener"|"topping"|"other" }],
    steps: string[] (3–6 bước pha),
    whyFits: string (vì sao hợp với nhu cầu khách),
    risk: string|null (VD "bột dừa dễ vón khi pha nóng")
  }]
}
System prompt tiếng Việt: chuyên viên R&D đồ uống của chuỗi cà phê Việt Nam; ưu tiên nguyên liệu SẴN CÓ trong danh sách (itemId), chỉ đề xuất newIngredient khi thật cần và tối đa 2 nguyên liệu mới mỗi phương án; định lượng theo đơn vị công thức của nguyên liệu, tham khảo các món mẫu để định lượng hợp lý; S/M/L tăng dần; không dùng nguyên liệu có cồn; tên món tiếng Việt ngắn, không trùng món đang có; KHÔNG ghi giá bán, giá vốn (hệ thống tự tính).

## 3. Kiểm tra và tính tiền: backend-node/src/lib/menuDraft/evaluate.ts
Cho từng phương án:
- Bỏ / cảnh báo dòng có itemId không tồn tại; lượng âm hoặc 0; S > M hoặc M > L (tự sắp lại + cảnh báo).
- Thể tích lỏng (dòng có recipeUnit ml, và g của nguyên liệu dạng lỏng nếu có cờ) so với dung tích ly: hằng số CUP_ML = { S: 350, M: 450, L: 600 } (đưa vào StoreSettings nếu tiện); vượt hoặc < 50% → cảnh báo.
- Món nhắc tên nguyên liệu chính trong tên (matcha, dừa, đào, cacao…) mà không có dòng nào khớp → cảnh báo.
- Giá vốn S/M/L: với itemId dùng đúng stockPerCup() × unitCostPrice như lib/productCost.ts (tách hàm tính cho "định mức nháp" chưa lưu DB, dùng chung với productCosts để không lệch). newIngredient: qty × estCostPerRecipeUnit, gắn cờ estimated.
- Giá bán gợi ý: ratio = trung vị (costPrice / sellPrice) các món isActive cùng categoryId (ít hơn 3 món thì dùng toàn bộ đồ uống); price = ceil(cost / ratio / 1000) × 1000 cho từng size (món hasSizes=false chỉ 1 giá); kèm min / max giá bán cùng danh mục. grossMargin = 1 − cost / price; < MIN_MARGIN (60%) → cảnh báo.
- Nguyên liệu thiếu ở chi nhánh (inStockAtStore=false) và nguyên liệu mới → danh sách "Cần mua thêm".
- Nếu có lib/nutrition: kèm kcal, caffeine, đường ước tính size M.
Trả { understood, options: [{ ...option, lines (kèm tên nguyên liệu, cost từng dòng), costs {S,M,L}, estimated: boolean, suggestedPrice {S,M,L}, categoryPriceRange, margin {S,M,L}, toBuy: [...], warnings: [{ level, text }], nutrition? }] }.

## 4. Lưu nháp vào đề xuất
Migration 018_menu_draft.sql (hoặc số tiếp theo; theo cách backend-node/prisma/sql đang làm), bảng MenuProposal thêm:
- formulaDraft JSON (các dòng định mức đã chọn: itemId | newIngredient, qtyS/M/L, recipeUnit)
- estCostS, estCostM, estCostL Int null; temps VarChar(10) null; hasSizes Boolean null; priceS, priceL Int null (priceM dùng suggestedPrice có sẵn)
- aiDraft JSON null (toàn bộ kết quả AI + evaluate, để đối chiếu / trình bày)
- aiGenerated Boolean default false
recipe (text có sẵn) điền bằng "Nguyên liệu: … / Cách pha: 1. … 2. …" để màn cũ vẫn đọc được.

## 5. API
- POST /api/menu-proposals/ai-draft { term?, idea?, categoryId?, storeId? } (quyền giống POST /menu-proposals; Owner xem toàn chuỗi cần storeId như luồng hiện có) → kết quả mục 3. Không lưu DB.
- POST /api/menu-proposals/evaluate { option } → tính lại giá vốn / giá gợi ý / cảnh báo sau khi người dùng sửa định mức (không gọi AI).
- POST /api/menu-proposals mở rộng: nhận thêm formulaDraft, temps, hasSizes, priceS, priceL, aiDraft; khi có formulaDraft thì cho phép thiếu recipe text (tự sinh). Tính lại estCost bằng evaluate ở server, không tin số client gửi.
- GET /api/menu-proposals/:id trả thêm các trường mới, kèm giá vốn TÍNH LẠI theo giá nhập hiện tại (giá nhập có thể đổi từ lúc đề xuất).

## 6. Giao diện
- SearchInsights.tsx: ở mỗi từ khóa MISSING, cạnh nút "Đề xuất món" hiện tại thêm nút "AI phác thảo" (icon Sparkles), ẩn khi MENU_DRAFT tắt.
- Proposals.tsx: nút "Đề xuất món mới" có thêm lựa chọn "Nhờ AI phác thảo" (gõ ý tưởng tự do, VD "món đá xay vị sầu riêng cho mùa hè").
- Màn / hộp thoại phác thảo:
  - Dòng "AI hiểu: …" và số khách tìm.
  - 2–3 thẻ phương án cạnh nhau (điện thoại: vuốt ngang). Mỗi thẻ: tên, mô tả, nhiệt độ, bảng định mức (nguyên liệu | S | M | L | tiền / ly M), giá vốn S/M/L, giá gợi ý S/M/L, % lãi gộp (màu theo ngưỡng), khoảng giá cùng danh mục, "Cần mua thêm", cảnh báo (vàng / đỏ), cách pha (thu gọn), lý do hợp nhu cầu, rủi ro.
  - Nhãn "AI phác thảo · giá vốn do hệ thống tính" và nhãn "ước tính" cạnh số có nguyên liệu mới.
  - Chọn một thẻ → chế độ sửa: đổi nguyên liệu (ô chọn từ kho), sửa lượng, thêm / bỏ dòng, sửa tên, mô tả, giá; mỗi lần sửa gọi /evaluate (debounce) để cập nhật giá vốn và cảnh báo.
  - Nút "Phác thảo lại" (gửi kèm ghi chú, VD "ít ngọt hơn, không dùng kem") và "Gửi đề xuất" → POST /menu-proposals.
- Proposals.tsx (Chủ chuỗi duyệt): đề xuất aiGenerated có nhãn AI; hiện bảng định mức, giá vốn tính lại theo giá hiện tại, giá gợi ý, lãi gộp.
- ProductForm.tsx khi mở bằng ?proposal=<id>: điền sẵn tên, mô tả, danh mục, temps, hasSizes, giá S/M/L; sau khi tạo món, tạo ProductFormula từ formulaDraft (chỉ dòng có itemId; nguyên liệu mới thì nhắc "tạo nguyên liệu X trong Kho trước" kèm đường dẫn, rồi thêm định mức sau ở IngredientFormula) và gọi recalcProductCost.

## 7. Kiểm thử
- backend-node/scripts/testMenuDraft.ts: chạy 4 đầu vào (term "matcha dua", term "cold brew cam", idea "đá xay sầu riêng", idea "bánh ăn kèm cà phê sáng"), in phương án, định mức, giá vốn, giá gợi ý, cảnh báo. Đối chiếu giá vốn của 1 phương án bằng tay với bảng giá nguyên liệu.
- Kiểm tra: itemId bịa bị loại; giá vốn tính lại khi sửa giá nhập; Owner duyệt và tạo món → ProductFormula đúng, costPrice của món mới khớp giá vốn phương án; MENU_DRAFT tắt → nút ẩn, đề xuất tay vẫn chạy; từ khóa đã có món (AVAILABLE) không hiện nút.
- tsc backend và frontend; kiểm tra khung 390px.
Báo lại: kết quả 4 đầu vào mẫu, ảnh chụp hộp thoại phác thảo và màn duyệt của Chủ chuỗi, token mỗi lần.
```

## Câu trả lời sẵn khi hội đồng hỏi

- **"AI có tự đặt giá không?"** Không. AI chỉ đề xuất nguyên liệu và định lượng; giá vốn tính từ giá nhập thật bằng cùng công thức hệ thống đang dùng; giá bán gợi ý theo biên lợi nhuận các món cùng danh mục.
- **"Lỡ AI cho định lượng vô lý?"** Có món mẫu làm chuẩn định lượng, code kiểm tra thể tích ly, thứ tự S/M/L, nguyên liệu chính; và pha chế vẫn phải thử trước khi Chủ chuỗi tạo món.
- **"Giá trị cho chuỗi?"** Biến nhu cầu khách (tìm mà không có) thành món mới có sẵn công thức và bài toán lãi lỗ, rút ngắn thời gian R&D; mọi bước vẫn qua duyệt.
