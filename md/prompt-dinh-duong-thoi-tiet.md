# Prompt: Thông tin dinh dưỡng, lọc dị ứng / ăn kiêng + gợi ý món theo thời tiết

Gộp #14 và #16 trong `plan/de-xuat-ai-gemini.md`. Làm trên nhánh `feat/chain-stores`, **2 phiên Claude Code**: prompt A (dinh dưỡng + lọc), prompt B (thời tiết trên trang chủ). Prompt B dùng kết quả của A (biết món nào ít caffeine, món nào mát) nên làm A trước.

## Mục tiêu

Khách nhìn vào là biết **món nào nhiều caffeine, nhiều béo, nhiều đường, bao nhiêu calo, có sữa / hạt / gluten không**, để tự cân nhắc. Ví dụ:

- Thẻ món có nhãn: **Caffeine cao** · **Nhiều béo** · **Có sữa** · **Thuần chay**.
- Trang chi tiết món: bảng "Dinh dưỡng ước tính" theo size, đổi size S/M/L hoặc đường 50% là số tự đổi; gợi ý "Chọn size S, đường 50% giảm 120 kcal".
- Trang Thực đơn: bộ lọc "Không caffeine", "Ít caffeine", "Không lactose", "Ít đường", "Ít béo", "Thuần chay", "Không hạt".
- Tài khoản khách: lưu "Tôi hạn chế caffeine / không uống được sữa" → thực đơn tự cảnh báo những món không hợp.
- Trang chủ: khối **"Hợp thời tiết hôm nay"**: "34°C nắng ở Gò Vấp, thử Trà Đào Cam Sả size L cho mát", buổi tối thì ưu tiên món ít caffeine.

## Thiết kế (đọc trước khi dán prompt)

**Số liệu do code tính từ công thức, AI chỉ hỗ trợ nhập liệu.** Hệ thống đã có công thức từng món (`ProductFormula`: nguyên liệu × định mức theo size S/M/L). Chỉ cần biết **dinh dưỡng của từng nguyên liệu** (khoảng 30–60 nguyên liệu, nhập một lần), code tự cộng ra dinh dưỡng từng món, từng size. AI dùng ở chỗ: bấm "AI gợi ý" để điền sẵn dinh dưỡng nguyên liệu theo tên (VD "Sữa đặc" → 321 kcal, 8,7 g béo / 100 g, có sữa), **quản lý kiểm tra rồi duyệt**. Chưa duyệt thì không hiện cho khách.

Lý do làm vậy: số liệu nhất quán (đổi công thức là số đổi theo), giải thích được với hội đồng ("cộng từ công thức"), và AI không bịa số dinh dưỡng trực tiếp cho từng món.

**Ngưỡng nhãn (hằng số, ghi nguồn trong code để trình bày):**

| Nhãn | Ngưỡng mỗi ly / phần | Căn cứ |
|---|---|---|
| Không caffeine | 0 mg | |
| Ít caffeine | < 50 mg | |
| Caffeine cao | ≥ 150 mg | FDA khuyến nghị người lớn ≤ 400 mg / ngày |
| Nhiều đường | ≥ 25 g | WHO khuyến nghị đường tự do ≤ 25 g / ngày là tốt |
| Ít đường | ≤ 5 g | |
| Nhiều béo | ≥ 15 g | |
| Ít béo | ≤ 3 g | |
| Có sữa / hạt / đậu phộng / gluten / trứng / đậu nành | có ít nhất 1 nguyên liệu mang cờ đó | |
| Thuần chay | mọi nguyên liệu đều đánh dấu thuần chay | |

**Luôn ghi rõ:** "Giá trị ước tính theo công thức chuẩn, có thể chênh lệch khi pha. Nếu dị ứng nặng, vui lòng báo nhân viên (quầy có dùng chung dụng cụ)."

**Thời tiết:** API **Open-Meteo** (miễn phí, không cần khóa) theo tọa độ chi nhánh (`Store.lat/lng` đã có). Code chọn món theo luật (nóng → món đá `temps` ICED/BOTH; mưa / mát → món nóng; sau 17h → ưu tiên ít caffeine; sáng → cà phê), kết hợp món bán chạy và món đang bán ở chi nhánh. Gemini (model `liteModel`, rẻ) chỉ viết **một câu dẫn ngắn** cho khối gợi ý, lưu cache theo chi nhánh + khung giờ + kiểu thời tiết nên mỗi chi nhánh chỉ vài lần gọi / ngày. AI tắt → câu dẫn theo mẫu, khối vẫn hiện.

**Tắt được:** thêm 2 tính năng vào `AI_FEATURES` trong `backend-node/src/ai/settings.ts`: `NUTRITION_ASSIST` (nút AI gợi ý dinh dưỡng nguyên liệu) và `WEATHER_PICKS` (câu dẫn AI). Ngoài ra trong **Website › Giao diện** có công tắc riêng: hiện / ẩn thông tin dinh dưỡng, hiện / ẩn khối thời tiết trên trang chủ (tắt AI không làm mất dinh dưỡng vì dinh dưỡng do code tính).

## Code có sẵn (đã kiểm tra trên `feat/chain-stores`, sau commit AI 0ba422f)

| Cần | Có sẵn |
|---|---|
| Gọi Gemini, JSON schema | `backend-node/src/ai/gemini.ts` (`gemini()`, `withRetry`, `AI_CONFIG.liteModel`) |
| Bật / tắt tính năng AI | `backend-node/src/ai/settings.ts` (`AI_FEATURES`, `isAiEnabled`), frontend `lib/aiFeatures.ts` |
| Công thức món | `ProductFormula` (`qtyPerUnit`, `qtySizeS/M/L`, `recipeUnit`, `conversionFactor`), `lib/inventory.ts` → `stockPerCup()` |
| Nguyên liệu | `InventoryItem` (`name`, `category`, `unit`, `recipeUnit`, `recipePerUnit`) |
| Nóng / đá | `Product.temps` = BOTH / ICED / HOT / NONE |
| Đá, đường khách chọn | `CartItem.icePct`, `sugar` (`lib/cart.ts`, `pages/ProductDetail.tsx`) |
| Lọc thực đơn | `GET /api/menu?tags=` (`routes/menu.ts`), `pages/Menu.tsx` (FilterState.tags) |
| Trang chủ | `pages/HomePage.tsx` (các section dùng `SectionHead`, `ProductCard` trong `components/site/parts.tsx`) |
| Cài đặt website | `modules/website/SiteTheme.tsx`, `StoreSettings.siteTheme` |
| Chatbot tư vấn | `backend-node/src/ai/agent/tools.ts` (thêm công cụ tra dinh dưỡng để chatbot trả lời "món nào ít caffeine?") |
| Migration | `backend-node/prisma/sql/` (mới nhất 017) |

---

## Prompt A: dinh dưỡng, nhãn, bộ lọc

```
Làm trên nhánh feat/chain-stores. Đọc plan/prompt-dinh-duong-thoi-tiet.md (phần Thiết kế và bảng ngưỡng) và plan/de-xuat-ai-gemini.md mục 3 "Bật / tắt AI".

Mục tiêu: tính dinh dưỡng từng món / từng size từ công thức + dinh dưỡng nguyên liệu; hiện nhãn (caffeine, béo, đường, dị ứng) cho khách; bộ lọc ăn kiêng; AI hỗ trợ điền dinh dưỡng nguyên liệu, quản lý duyệt.

## 1. Dữ liệu (migration 018_nutrition.sql, theo cách các file trong backend-node/prisma/sql đang làm)
- Bảng IngredientNutrition (1–1 với InventoryItem): itemId (PK), basis "PER_100" | "PER_UNIT" (PER_100 = trên 100 g/ml đơn vị công thức; PER_UNIT = trên 1 cái, VD 1 bánh croissant), kcal, fatG, satFatG, sugarG, proteinG, carbG, caffeineMg (Float, null = chưa biết), allergens JSON mảng trong ["milk","nuts","peanut","gluten","egg","soy"], isVegan Boolean, isSugarSource Boolean (nguyên liệu tạo ngọt: đường, siro, sữa đặc… → co giãn theo mức đường khách chọn), source "AI" | "MANUAL", approved Boolean, approvedById, updatedAt.
- Bảng ProductNutrition (cache): productId, size ("S"|"M"|"L"|"-"), kcal, fatG, satFatG, sugarG, proteinG, caffeineMg, sugarFromSourcesG, allergens JSON, isVegan, complete Boolean (mọi nguyên liệu trong công thức đã có dinh dưỡng được duyệt), labels JSON, computedAt. PK (productId, size).
- Cột Customer.dietPrefs JSON (VD ["low_caffeine","no_milk","low_sugar","vegan","no_nuts"]).

## 2. Tính toán: backend-node/src/lib/nutrition/
- compute.ts → computeProductNutrition(productId): với mỗi size của món (hasSizes=false thì "-"), lấy định mức từng nguyên liệu theo size (dùng logic stockPerCup / qtySizeX hiện có, quy về đơn vị công thức), nhân với IngredientNutrition đã approved (PER_100: × qty/100; PER_UNIT: × qty). Thiếu nguyên liệu nào chưa duyệt → complete=false.
- labels.ts → ngưỡng là hằng số ở đầu file kèm chú thích nguồn (FDA 400 mg caffeine / ngày, WHO 25 g đường), sinh labels: caffeine "none"|"low"|"high", sugar "low"|"high", fat "low"|"high", allergens, vegan. Chỉ sinh nhãn khi complete=true (riêng nhãn dị ứng: chỉ hiện "Có X" khi chắc chắn có; không bao giờ hiện "Không có X" nếu complete=false).
- adjust.ts → adjustForOptions(nutrition, { sugarPct }): mức đường 0/50/100 co giãn phần sugarFromSourcesG và kcal tương ứng (dùng cho trang chi tiết món và giỏ hàng). Đá không đổi dinh dưỡng.
- recompute: gọi lại khi lưu công thức (routes/formula.ts), khi duyệt / sửa dinh dưỡng nguyên liệu (mọi món dùng nguyên liệu đó), và script backend-node/scripts/recomputeNutrition.ts tính lại toàn bộ.

## 3. AI gợi ý dinh dưỡng nguyên liệu
- Thêm NUTRITION_ASSIST vào AI_FEATURES (ai/settings.ts): label "Gợi ý dinh dưỡng nguyên liệu", mặc định bật, dailyLimit 100.
- lib/nutrition/suggest.ts → suggestNutrition(itemIds ≤ 20): gửi tên, nhóm, đơn vị công thức của từng nguyên liệu cho Gemini (AI_CONFIG.liteModel, JSON schema đúng các cột IngredientNutrition + confidence + note). System prompt: dùng giá trị trung bình phổ biến của sản phẩm cùng loại bán ở Việt Nam (VD sữa đặc, sữa tươi không đường, cà phê phin rang xay, bột matcha, trân châu đen…); caffeine tính trên lượng nguyên liệu (VD 100 g cà phê bột ~ 1.000–1.200 mg khi chiết, ghi rõ giả định trong note); không chắc thì để null và confidence thấp; đánh dấu allergens thận trọng (có khả năng chứa thì đánh dấu).
- Kiểm tra bằng code: số không âm, kcal ≈ 9×béo + 4×(đường hoặc carb) + 4×đạm (lệch > 25% → cảnh báo), caffeine của nguyên liệu không phải cà phê / trà / matcha / cacao mà > 0 → cảnh báo.
- Kết quả lưu với source "AI", approved=false. KHÔNG hiện cho khách cho tới khi quản lý duyệt.

## 4. API
- Owner / Admin: GET /api/nutrition/ingredients (danh sách nguyên liệu kèm dinh dưỡng, trạng thái duyệt, số món dùng), PUT /api/nutrition/ingredients/:itemId (sửa tay → source MANUAL), POST /api/nutrition/ingredients/suggest { itemIds } (503 khi AI tắt), POST /api/nutrition/ingredients/approve { itemIds }.
- Công khai: GET /api/menu trả thêm cho mỗi món nutrition: { size M (hoặc "-"): kcal, caffeineMg, sugarG, fatG, labels } khi cài đặt website bật hiện dinh dưỡng; GET /api/menu/:id/nutrition trả đủ các size. Thêm query diet=no_caffeine,low_caffeine,no_milk,low_sugar,low_fat,vegan,no_nuts (lọc server-side, chỉ món complete=true mới lọt bộ lọc loại trừ).
- Khách đăng nhập: GET/PUT /api/customer/diet-prefs.
- Thêm công cụ get_nutrition / find_products_by_diet cho AI Agent tư vấn (backend-node/src/ai/agent/tools.ts) để chatbot trả lời "món nào không caffeine?", kèm câu lưu ý dị ứng.

## 5. Giao diện quản lý
- Trong nhóm Kho (hoặc cạnh Công thức & giá vốn): màn "Dinh dưỡng nguyên liệu": bảng nguyên liệu, cột kcal / béo / đường / caffeine / dị ứng / thuần chay / nguồn / trạng thái. Nút "AI gợi ý cho các dòng trống" (ẩn khi NUTRITION_ASSIST tắt), dòng do AI điền tô tím + ghi chú giả định + độ tin; dòng có cảnh báo tô vàng. Chọn nhiều dòng → "Duyệt". Sửa tay được từng ô.
- Màn sửa món: thẻ "Dinh dưỡng ước tính" (theo size) + nhãn; complete=false thì liệt kê nguyên liệu còn thiếu kèm đường dẫn.
- Website › Giao diện: công tắc "Hiện thông tin dinh dưỡng cho khách" (lưu trong siteTheme hoặc StoreSettings).

## 6. Giao diện khách (theo style trang khách, sáng / tối, VI / EN)
- ProductCard: tối đa 2 nhãn nhỏ ưu tiên: Caffeine cao, Không caffeine, Nhiều đường, Thuần chay, Có sữa. Nếu khách có dietPrefs mà món không hợp → viền nhắc nhẹ "Có sữa" màu cảnh báo (không ẩn món).
- ProductDetail: khối "Dinh dưỡng ước tính" (kcal, caffeine, đường, béo, đạm) đổi theo size và mức đường đang chọn; thanh so sánh với khuyến nghị ngày (VD caffeine 180/400 mg); dòng gợi ý "Chọn size S, đường 50% giảm X kcal / Y g đường" khi giảm được ≥ 15%; danh sách dị ứng; câu lưu ý dị ứng / ước tính.
- Menu.tsx: thêm nhóm bộ lọc "Ăn kiêng" (chip) với các lựa chọn trên; khách đăng nhập có dietPrefs → chip được bật sẵn lần đầu, có nút bỏ.
- Tài khoản: mục "Sở thích ăn uống" chọn dietPrefs.
- Giỏ hàng: dòng nhỏ tổng caffeine của giỏ nếu ≥ 300 mg ("Giỏ hàng có khoảng 320 mg caffeine").

## 7. Kiểm thử
- Nhập dinh dưỡng (AI gợi ý + duyệt) cho mọi nguyên liệu trong seed, chạy recomputeNutrition, in bảng món × size: kcal, caffeine, đường, béo, nhãn. Kiểm tra vài món bằng tay (VD cà phê đen > bạc xỉu về caffeine; trà sữa nhiều đường; bánh croissant có gluten, sữa).
- Kiểm tra: nguyên liệu chưa duyệt không làm hiện nhãn; đổi công thức → số đổi; lọc "Không lactose" không trả món có nguyên liệu mang cờ milk; AI tắt → nút gợi ý ẩn, dinh dưỡng đã duyệt vẫn hiện.
- tsc backend và frontend.
Báo lại: bảng dinh dưỡng các món, ảnh chụp thẻ món + trang chi tiết + bộ lọc.
```

## Prompt B: gợi ý món theo thời tiết trên trang chủ

```
Làm trên nhánh feat/chain-stores, sau prompt A (đã có ProductNutrition và nhãn caffeine). Đọc plan/prompt-dinh-duong-thoi-tiet.md.

Mục tiêu: khối "Hợp thời tiết hôm nay" trên trang chủ khách: thời tiết hiện tại ở chi nhánh khách đang chọn + 4 món gợi ý + một câu dẫn ngắn.

## 1. Thời tiết: backend-node/src/lib/weather.ts
- getWeather(storeId): gọi Open-Meteo https://api.open-meteo.com/v1/forecast?latitude=&longitude=&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,is_day&timezone=Asia%2FHo_Chi_Minh theo Store.lat/lng. Timeout 4 giây. Cache 30 phút theo storeId (bộ nhớ là đủ). Lỗi → trả null (khối vẫn hiện theo giờ trong ngày, không có thời tiết).
- Chuẩn hóa thành { tempC, feelsC, humidity, raining, condition: "hot"|"warm"|"cool"|"rain", label tiếng Việt / tiếng Anh (map weather_code: nắng, nhiều mây, mưa, mưa rào, dông…), isDay }.
  hot: feels ≥ 32 · warm: 26–32 · cool: < 26 · rain: precipitation > 0.2 hoặc weather_code mưa / dông.

## 2. Chọn món: backend-node/src/lib/weatherPicks.ts
- pickProducts(storeId, now, weather): ứng viên = món đang bán ở chi nhánh, chưa hết hàng (dùng logic /api/menu). Chấm điểm:
  - hot / warm: món temps ICED hoặc BOTH +3 (gợi ý bản đá), trà trái cây / đá xay +2, nhãn "Nhiều béo" −1.
  - cool / rain: món temps HOT hoặc BOTH +3 (gợi ý bản nóng), bánh +1.
  - Giờ quán 5–10h: cà phê +2; 14–17h: thêm bánh / đồ ăn nhẹ +1; sau 17h: caffeine "high" −3, "none"/"low" +2.
  - Bán chạy 14 ngày gần nhất ở chi nhánh: + điểm theo thứ hạng (tối đa +2). Món đang giảm giá +1.
  - Chọn 4 món điểm cao nhất, không quá 2 món cùng danh mục. Trả kèm lý do ngắn theo luật (VD "mát, ít béo", "ít caffeine cho buổi tối") và tùy chọn gợi ý (temp "ICED"|"HOT", size).
- Thêm WEATHER_PICKS vào AI_FEATURES (label "Câu gợi ý món theo thời tiết", mặc định bật, dailyLimit 300).
- headline(storeId, weather, picks): nếu isAiEnabled("WEATHER_PICKS") → Gemini AI_CONFIG.liteModel viết JSON { vi: string ≤ 90 ký tự, en: string ≤ 90 ký tự }, giọng thân thiện của quán, nhắc thời tiết + 1 món, không dùng emoji, không hứa lợi ích sức khỏe. Cache theo (storeId, ngày, khung giờ 3 tiếng, condition). Lỗi / tắt → mẫu câu theo condition + giờ (VD "Trời {temp}°C nắng ở {chi nhánh}, một ly {món} đá cho mát nhé").

## 3. API
GET /api/home/weather-picks?storeId= (công khai) → { store: { id, name }, weather | null, headline: { vi, en }, source: "AI"|"TEMPLATE", products: [... dạng ProductCard đang dùng + reason + suggestTemp] }. Cache response 10 phút theo storeId. Khi cài đặt website tắt khối → { hidden: true }.

## 4. Giao diện
- HomePage.tsx: khối mới ngay dưới hero (trên "Mã giảm giá"), style giống các section hiện có:
  - Dòng thời tiết: icon (lucide: Sun, CloudSun, CloudRain, Moon…) + "34°C · Nắng · Gò Vấp", headline lớn.
  - 4 ProductCard (cuộn ngang trên điện thoại), dưới tên món là lý do ngắn và nhãn gợi ý "Bản đá" / "Bản nóng"; bấm vào mở trang món với nhiệt độ được chọn sẵn.
  - Đổi chi nhánh ở header → tải lại khối.
  - Thời tiết null → chỉ hiện "Gợi ý buổi sáng / chiều / tối" theo giờ.
- Website › Giao diện: công tắc "Hiện gợi ý theo thời tiết trên trang chủ".
- VI / EN theo i18n hiện có.

## 5. Kiểm thử
- Script backend-node/scripts/testWeatherPicks.ts giả lập 4 tình huống (11h 35°C nắng, 15h mưa 24°C, 7h sáng 27°C, 20h tối 28°C) cho một chi nhánh, in món được chọn + lý do + headline (AI và mẫu). Kiểm tra buổi tối không có món caffeine cao, trời nóng ưu tiên món đá.
- Open-Meteo lỗi / không có mạng → trang chủ không lỗi.
- tsc backend và frontend; kiểm tra trên khung 390px, sáng / tối.
```

## Câu trả lời sẵn khi hội đồng hỏi

- **"Số calo, caffeine lấy ở đâu?"** Cộng từ công thức chuẩn của quán × dinh dưỡng từng nguyên liệu. AI chỉ gợi ý dinh dưỡng nguyên liệu, quản lý duyệt rồi mới dùng; đổi công thức là số tự cập nhật.
- **"Ngưỡng 'caffeine cao' dựa vào đâu?"** Khuyến nghị FDA (≤ 400 mg / ngày cho người lớn) và WHO (đường tự do ≤ 25 g / ngày là tốt), ghi trong code.
- **"Có an toàn cho người dị ứng không?"** Chỉ hiện "Có sữa / hạt…" khi chắc chắn; không bao giờ khẳng định "không có" khi dữ liệu chưa đủ; luôn kèm lưu ý nhiễm chéo và đề nghị báo nhân viên.
- **"Gợi ý thời tiết có phải AI không?"** Chọn món bằng luật có giải thích được (thời tiết, giờ, caffeine, bán chạy); AI chỉ viết câu dẫn. Tắt AI vẫn có gợi ý.
