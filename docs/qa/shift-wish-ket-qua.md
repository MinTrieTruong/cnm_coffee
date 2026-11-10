# Kết quả kiểm thử: AI hiểu nguyện vọng xếp ca

Chạy `npx tsx scripts/testShiftWish.ts --md` (model gemini-3.5-flash), tháng 12/2026, ca Sáng 07:00–15:00 và Tối 14:00–22:00.
Chấm sau khi quy đổi ra các lần (ngày, ca), không so chữ. Câu "đúng hoàn toàn": đủ và không thừa rule, có "chưa hiểu" / gợi ý đơn nghỉ khi đáp án yêu cầu.

**Câu đúng hoàn toàn: 12/12 · Precision theo rule: 100% (14/14) · Recall: 100% (14/14) · Thời gian TB: 3415 ms / câu**

| Tình huống | Câu nhân viên viết | AI trả về | Rule khớp | Kết quả |
|---|---|---|---|---|
| Đi học theo thứ | Tháng 12 em đi học sáng thứ 3 và thứ 5, mấy hôm đó em không làm ca sáng được ạ. | UNAVAILABLE thứ[2,4] SANG | 1/1 | Đúng |
| Xin nghỉ ngày lẻ | Ngày 15/12 em xin nghỉ đi đám cưới chị gái. | UNAVAILABLE 15<br>gợi ý đơn nghỉ | 1/1 | Đúng |
| Khoảng ngày | Từ 20/12 đến 23/12 em về quê, không đi làm được. | UNAVAILABLE 20+21+22+23<br>gợi ý đơn nghỉ | 1/1 | Đúng |
| "Chỉ làm tối" | Em chỉ làm ca tối thôi ạ. | PREFER TOI | 1/1 | Đúng |
| Tối đa / tuần | Mỗi tuần em làm tối đa 4 ca thôi. | MAX_SHIFTS 4/WEEK | 1/1 | Đúng |
| Cần nhiều ca | Tháng này em cần nhiều ca để kiếm thêm tiền, xếp cho em càng nhiều càng tốt. | MIN_SHIFTS 6/WEEK | 1/1 | Đúng |
| Ngày ngoài tháng | Em nghỉ ngày 3/1, còn ngày 10/12 em không làm ca sáng được. | UNAVAILABLE 10 SANG<br>chưa hiểu: Em nghỉ ngày 3/1 | 1/1 | Đúng |
| Mơ hồ | Tuần sau nữa em bận vài hôm. | (không)<br>chưa hiểu: Tuần sau nữa em bận vài hôm. | 0/0 | Đúng |
| Viết tắt không dấu | t7 cn e ko lam ca sang dc, may ngay do e thich ca toi | UNAVAILABLE thứ[0,6] SANG; PREFER thứ[0,6] TOI | 2/2 | Đúng |
| Giờ cụ thể | Thứ 2 và thứ 4 em muốn làm ca sau 6h chiều. | PREFER thứ[1,3] TOI | 1/1 | Đúng |
| Mâu thuẫn | Em muốn làm ca sáng thứ 2. À mà thứ 2 em không làm được đâu. | PREFER thứ[1] SANG; UNAVAILABLE thứ[1] | 2/2 | Đúng |
| Nghỉ cố định + hạn chế | Em muốn nghỉ cố định chủ nhật hằng tuần, và hạn chế ca tối thứ 6 giúp em. | DAY_OFF_PATTERN thứ[0]; AVOID thứ[5] TOI | 2/2 | Đúng |
