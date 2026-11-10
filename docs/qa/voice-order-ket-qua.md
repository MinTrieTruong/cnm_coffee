# Đặt món bằng câu tự nhiên — kết quả bộ câu mẫu

Chạy: `npx tsx scripts/testVoiceOrder.ts 1` · 10:34:59 7/11/2026 · chi nhánh #1 · nhập bằng chữ (Gemini thật)

- Đúng món: 16/16 (100%)
- Đúng số lượng: 16/16 (100%)
- Đúng size: 16/16 (100%)
- Đúng nóng/đá, đá, đường: 16/16 (100%)
- Nhận ra món chưa có / đang hết: 16/16 (100%)
- Giá do backend tính: 16/16 (100%)
- Độ trễ trung bình: 1949 ms · Token trung bình: 2147 / lần

| # | Ca | Câu | Kết quả | Món | SL | Size | Tùy chọn | Chưa có | ms |
|---|---|---|---|:-:|:-:|:-:|:-:|:-:|--:|
| 1 | Câu demo POS | hai bạc xỉu ít đá, một trà đào size lớn ít ngọt, một croissant | 2× Bạc Xỉu Đá đá 50%; 1× Trà Đào Cam Sả L đường 50%; 1× Bánh Sừng Trâu (Croissant) | ✓ | ✓ | ✓ | ✓ | ✓ | 1987 |
| 2 | Viết tắt (web) | cf sữa đá ít ngọt vs 1 bánh mì que | 1× Cà Phê Sữa Đá đường 50%; 1× Bánh Mì Que Pâté | ✓ | ✓ | ✓ | ✓ | ✓ | 1902 |
| 3 | Không dấu | 3 ca phe den da khong duong | 3× Cà Phê Đen Đá đường 0% | ✓ | ✓ | ✓ | ✓ | ✓ | 1705 |
| 4 | Số bằng chữ (chục) | một chục trà sữa trân châu đường đen size nhỏ | 10× Trà Sữa Trân Châu Đường Đen S | ✓ | ✓ | ✓ | ✓ | ✓ | 1371 |
| 5 | Nóng / đá | cho mình 2 latte nóng với 1 cappuccino đá | 2× Latte (Đá/Nóng) nóng; 1× Cappuccino (Nóng/Đá) | ✓ | ✓ | ✓ | ✓ | ✓ | 1462 |
| 6 | Món chưa có | matcha dừa | chưa có: matcha dừa → Matcha Latte (Nóng/Đá), Matcha Đá Xay (Frappe), Cà Phê Cốt Dừa / hỏi lại: Quán không có món matcha dừa. Bạn có muốn đổi sang Matcha Latte hoặc Cà Phê Cốt Dừa không? | ✓ | ✓ | ✓ | ✓ | ✓ | 1393 |
| 7 | Tên gọi khác | 1 bx size L, 1 tiramisu | 1× Bạc Xỉu Đá L; 1× Bánh Tiramisu | ✓ | ✓ | ✓ | ✓ | ✓ | 2182 |
| 8 | Một cặp | một cặp cà phê sữa ít đá | 2× Cà Phê Sữa Đá đá 50% | ✓ | ✓ | ✓ | ✓ | ✓ | 2526 |
| 9 | Hai món, không đá | trà vải lài không đá, trà oolong bưởi hồng size vừa | 1× Trà Vải Lài đá 0%; 1× Trà Oolong Bưởi Hồng | ✓ | ✓ | ✓ | ✓ | ✓ | 1261 |
| 10 | Món đang hết | cho một ly cà phê muối | chưa có: Cà Phê Muối (hết) → Cà Phê Đen Đá, Cà Phê Sữa Đá, Cà Phê Cốt Dừa | ✓ | ✓ | ✓ | ✓ | ✓ | 1245 |
| 11 | Món chưa có (2) | hai sinh tố bơ với một trà đào | 1× Trà Đào Cam Sả / chưa có: sinh tố bơ → Cà Phê Cốt Dừa, Matcha Đá Xay (Frappe), Latte (Đá/Nóng) / hỏi lại: Quán không có sinh tố bơ, bạn có muốn đổi sang Cà Phê Cốt Dừa hoặc Matcha Đá Xay không? | ✓ | ✓ | ✓ | ✓ | ✓ | 4045 |
| 12 | Sửa size | à đổi bạc xỉu thành size L | 2× Bạc Xỉu Đá L; 1× Bánh Sừng Trâu (Croissant) | ✓ | ✓ | ✓ | ✓ | ✓ | 1689 |
| 13 | Bỏ món | bỏ croissant | 2× Bạc Xỉu Đá | ✓ | ✓ | ✓ | ✓ | ✓ | 1604 |
| 14 | Thêm một nữa | thêm một bạc xỉu nữa | 3× Bạc Xỉu Đá | ✓ | ✓ | ✓ | ✓ | ✓ | 1593 |
| 15 | % đá đường (web) | ts truyen thong 50% duong 50% da | 1× Trà Sữa Truyền Thống đá 50% đường 50% | ✓ | ✓ | ✓ | ✓ | ✓ | 1721 |
| 16 | productId bịa bị loại | thêm 1 cà phê đen | 1× Cà Phê Đen Đá | ✓ | ✓ | ✓ | ✓ | ✓ | 3495 |
