# Dinh dưỡng ước tính các món (tính từ công thức)

Chạy: `npx tsx scripts/recomputeNutrition.ts --md` · 15:45:25 7/11/2026

Món = Σ định mức nguyên liệu theo size × dinh dưỡng nguyên liệu đã duyệt. Đường / kcal ở mức đường 100%.

| Món | Size | kcal | Caffeine (mg) | Đường (g) | Béo (g) | Nhãn |
|---|:-:|--:|--:|--:|--:|---|
| Cà Phê Đen Đá | S | 44 | 165 | 10 | 0 | Caffeine cao, Ít béo, Thuần chay |
| Cà Phê Đen Đá | M | 65 | 220 | 15 | 0 | Caffeine cao, Ít béo, Thuần chay |
| Cà Phê Đen Đá | L | 87 | 308 | 20 | 0.1 | Caffeine cao, Ít béo, Thuần chay |
| Bạc Xỉu Đá | S | 101 | 88 | 14.3 | 3.7 | Có sữa |
| Bạc Xỉu Đá | M | 136 | 110 | 19.4 | 4.9 | Có sữa |
| Bạc Xỉu Đá | L | 182 | 154 | 25.8 | 6.6 | Caffeine cao, Nhiều đường, Có sữa |
| Americano (Đá) | S | 3 | 112 | 0 | 0 | Ít đường, Ít béo, Thuần chay |
| Americano (Đá) | M | 4 | 144 | 0 | 0.1 | Ít đường, Ít béo, Thuần chay |
| Americano (Đá) | L | 5 | 192 | 0 | 0.1 | Caffeine cao, Ít đường, Ít béo, Thuần chay |
| Latte (Đá/Nóng) | S | 71 | 112 | 5.3 | 3.6 | Có sữa |
| Latte (Đá/Nóng) | M | 97 | 144 | 7.2 | 4.9 | Có sữa |
| Latte (Đá/Nóng) | L | 129 | 192 | 9.6 | 6.5 | Caffeine cao, Có sữa |
| Trà Sữa Truyền Thống | S | 235 | 72 | 26.2 | 5.5 | Nhiều đường, Có sữa, Có đậu nành |
| Trà Sữa Truyền Thống | M | 316 | 96 | 35.5 | 7.6 | Nhiều đường, Có sữa, Có đậu nành |
| Trà Sữa Truyền Thống | L | 418 | 132 | 46.8 | 10.1 | Nhiều đường, Có sữa, Có đậu nành |
| Trà Sữa Oolong Nướng | S | 235 | 60 | 26.2 | 5.5 | Nhiều đường, Có sữa, Có đậu nành |
| Trà Sữa Oolong Nướng | M | 316 | 80 | 35.5 | 7.6 | Nhiều đường, Có sữa, Có đậu nành |
| Trà Sữa Oolong Nướng | L | 418 | 110 | 46.8 | 10.1 | Nhiều đường, Có sữa, Có đậu nành |
| Trà Sữa Trân Châu Đường Đen | S | 238 | 72 | 25.5 | 5.5 | Nhiều đường, Có sữa, Có đậu nành |
| Trà Sữa Trân Châu Đường Đen | M | 322 | 96 | 34.5 | 7.6 | Nhiều đường, Có sữa, Có đậu nành |
| Trà Sữa Trân Châu Đường Đen | L | 430 | 132 | 46 | 10.1 | Nhiều đường, Có sữa, Có đậu nành |
| Trà Đen Macchiato | S | 161 | 72 | 20.4 | 8.4 | Có sữa, Có đậu nành |
| Trà Đen Macchiato | M | 215 | 96 | 27.2 | 11.2 | Nhiều đường, Có sữa, Có đậu nành |
| Trà Đen Macchiato | L | 273 | 132 | 35 | 14 | Nhiều đường, Có sữa, Có đậu nành |
| Sữa Tươi Trân Châu Đường Đen | S | 220 | 0 | 32.5 | 4.2 | Không caffeine, Nhiều đường, Có sữa |
| Sữa Tươi Trân Châu Đường Đen | M | 298 | 0 | 43.9 | 5.8 | Không caffeine, Nhiều đường, Có sữa |
| Sữa Tươi Trân Châu Đường Đen | L | 392 | 0 | 57.3 | 7.8 | Không caffeine, Nhiều đường, Có sữa |
| Matcha Latte (Nóng/Đá) | S | 124 | 90 | 15.8 | 4 | Có sữa |
| Matcha Latte (Nóng/Đá) | M | 172 | 120 | 22.7 | 5.3 | Có sữa |
| Matcha Latte (Nóng/Đá) | L | 226 | 150 | 30.1 | 6.9 | Caffeine cao, Nhiều đường, Có sữa |
| Matcha Đá Xay (Frappe) | S | 283 | 120 | 27.4 | 12.4 | Nhiều đường, Có sữa, Có đậu nành |
| Matcha Đá Xay (Frappe) | M | 391 | 150 | 38.2 | 17.4 | Caffeine cao, Nhiều đường, Nhiều béo, Có sữa, Có đậu nành |
| Matcha Đá Xay (Frappe) | L | 518 | 210 | 50.5 | 23.1 | Caffeine cao, Nhiều đường, Nhiều béo, Có sữa, Có đậu nành |
| Sữa Tươi Matcha Trân Châu | S | 182 | 90 | 22.2 | 4.3 | Có sữa |
| Sữa Tươi Matcha Trân Châu | M | 243 | 120 | 30.7 | 5.7 | Nhiều đường, Có sữa |
| Sữa Tươi Matcha Trân Châu | L | 317 | 150 | 40.3 | 7.3 | Caffeine cao, Nhiều đường, Có sữa |
| Cà Phê Sữa Đá | S | 87 | 165 | 14.3 | 2.6 | Caffeine cao, Ít béo, Có sữa |
| Cà Phê Sữa Đá | M | 117 | 220 | 19.3 | 3.5 | Caffeine cao, Có sữa |
| Cà Phê Sữa Đá | L | 151 | 308 | 24.8 | 4.6 | Caffeine cao, Có sữa |
| Cà Phê Muối | S | 175 | 165 | 17.5 | 10.6 | Caffeine cao, Có sữa, Có đậu nành |
| Cà Phê Muối | M | 235 | 220 | 23.7 | 14.2 | Caffeine cao, Có sữa, Có đậu nành |
| Cà Phê Muối | L | 303 | 308 | 31 | 18.1 | Caffeine cao, Nhiều đường, Nhiều béo, Có sữa, Có đậu nành |
| Cà Phê Cốt Dừa | S | 145 | 165 | 11 | 9.9 | Caffeine cao, Có sữa |
| Cà Phê Cốt Dừa | M | 196 | 220 | 15.3 | 13.3 | Caffeine cao, Có sữa |
| Cà Phê Cốt Dừa | L | 261 | 308 | 20.2 | 17.8 | Caffeine cao, Nhiều béo, Có sữa |
| Cappuccino (Nóng/Đá) | S | 59 | 112 | 4.3 | 2.9 | Ít đường, Ít béo, Có sữa |
| Cappuccino (Nóng/Đá) | M | 78 | 144 | 5.8 | 3.9 | Có sữa |
| Cappuccino (Nóng/Đá) | L | 104 | 192 | 7.7 | 5.2 | Caffeine cao, Có sữa |
| Caramel Macchiato | S | 119 | 112 | 17 | 3.6 | Có sữa |
| Caramel Macchiato | M | 161 | 144 | 22.8 | 4.9 | Có sữa |
| Caramel Macchiato | L | 215 | 192 | 30.7 | 6.5 | Caffeine cao, Nhiều đường, Có sữa |
| Trà Đào Cam Sả | S | 102 | 60 | 23.6 | 0.1 | Ít béo, Thuần chay |
| Trà Đào Cam Sả | M | 143 | 72 | 33.2 | 0.1 | Nhiều đường, Ít béo, Thuần chay |
| Trà Đào Cam Sả | L | 190 | 96 | 44.1 | 0.2 | Nhiều đường, Ít béo, Thuần chay |
| Trà Vải Lài | S | 106 | 45 | 25.2 | 0.1 | Ít caffeine, Nhiều đường, Ít béo, Thuần chay |
| Trà Vải Lài | M | 151 | 54 | 36 | 0.1 | Nhiều đường, Ít béo, Thuần chay |
| Trà Vải Lài | L | 200 | 72 | 47.7 | 0.1 | Nhiều đường, Ít béo, Thuần chay |
| Trà Oolong Bưởi Hồng | S | 108 | 50 | 26 | 0 | Nhiều đường, Ít béo, Thuần chay |
| Trà Oolong Bưởi Hồng | M | 141 | 60 | 34 | 0 | Nhiều đường, Ít béo, Thuần chay |
| Trà Oolong Bưởi Hồng | L | 187 | 80 | 45.2 | 0.1 | Nhiều đường, Ít béo, Thuần chay |
| Bánh Sừng Trâu (Croissant) | - | 231 | 0 | 5 | 12 | Không caffeine, Ít đường, Có sữa, Có gluten, Có trứng |
| Bánh Mì Que Pâté | - | 220 | 0 | 2 | 8 | Không caffeine, Ít đường, Có sữa, Có gluten, Có trứng, Có đậu nành |
| Bánh Tiramisu | - | 350 | 25 | 22 | 18 | Ít caffeine, Nhiều béo, Có sữa, Có gluten, Có trứng |
