# Kết quả so sánh: xếp ca có nguyện vọng

Chạy `npx tsx scripts/testAutoScheduleWishes.ts --md` (dữ liệu giả lập: scripts/fixtures/autoScheduleData.ts).

- **Vi phạm cứng**: xếp vào ô nhân viên báo "không thể", ngày nghỉ phép, trùng ca / thiếu giờ nghỉ, quá số ca tối đa — phải bằng 0.
- **Độ lệch chuẩn / chênh lệch số ca**: trong cùng vị trí (trung bình các vị trí / lớn nhất).
- **Chi phí** = phạt nguyện vọng mềm + 300 × độ lệch chuẩn số ca + 60 × độ lệch chuẩn ca cuối tuần + 1000 × chỗ thiếu (lib/autoSchedule.ts → WEIGHTS).
- (a) không biết nguyện vọng nên có thể xếp vào ô "không thể" (cột vi phạm cứng của (a) đếm các ô đó).

### Đề bài — 12 nhân viên, 3 ca

Trung bình 10 seed, tháng 12/2026, nguyện vọng ngẫu nhiên có mâu thuẫn.

| Phương án | Nguyện vọng "muốn" được đáp ứng | Vi phạm cứng | Chỗ thiếu người | Độ lệch chuẩn số ca | Chênh lệch số ca | Lần "hạn chế" bị xếp | Chi phí | ms |
|---|---|---|---|---|---|---|---|---|
| (a) Tham lam cũ, không nguyện vọng | 35.2% (64.0/181.1) | 16 | 0.8 | 0.28 | ±1.0 | 4.1 | 8523 | 11 |
| (b) Tham lam có nguyện vọng | 52.1% (91.0/176.8) | 0 | 8.9 | 0.31 | ±1.2 | 2.1 | 14703 | 10 |
| (c) Có nguyện vọng + tìm kiếm cục bộ | 70.3% (123.2/177.5) | 0 | 6.0 | 0.05 | ±0.3 | 1.6 | 9594 | 193 |

### Quy mô chi nhánh thật — 37 nhân viên, 2 ca, định biên mặc định

Trung bình 10 seed, tháng 12/2026, nguyện vọng ngẫu nhiên có mâu thuẫn.

| Phương án | Nguyện vọng "muốn" được đáp ứng | Vi phạm cứng | Chỗ thiếu người | Độ lệch chuẩn số ca | Chênh lệch số ca | Lần "hạn chế" bị xếp | Chi phí | ms |
|---|---|---|---|---|---|---|---|---|
| (a) Tham lam cũ, không nguyện vọng | 43.6% (218.2/502.8) | 54 | 0.0 | 0.29 | ±1.0 | 23.8 | 19555 | 47 |
| (b) Tham lam có nguyện vọng | 71.8% (358.0/498.8) | 0 | 1.9 | 0.35 | ±1.5 | 10.4 | 12194 | 42 |
| (c) Có nguyện vọng + tìm kiếm cục bộ | 83.1% (414.4/499.2) | 0 | 1.3 | 0.09 | ±0.7 | 7.7 | 7413 | 652 |

Kiểm thử tính chất (scripts/testAutoSchedule.ts): 50 bộ dữ liệu, 0 vi phạm cứng, chi phí sau tìm kiếm cục bộ không bao giờ tăng, cùng seed ra cùng kết quả.
