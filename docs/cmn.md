


** 


**\


**Kế hoạch chi tiết** 

||||||
| :-: | :-: | :-: | :-: | :- |
||||||
||||||
||||||
||||||
||||||
||||||
||||||
||||||

||||||
| :- | :- | :-: | :-: | :- |
||||||
||||||
||||||

||||||
| :- | :- | :-: | :-: | :- |
||||||
||||||
||||||
||||||

||||||
| :- | :- | :-: | :-: | :- |
||||||
||||||
||||||
||||||
||||||
||||||
||||||
||||||
||||||
||||||
||||||
||||||
||||||
||||||
||||||

||||||
| :- | :- | :-: | :-: | :- |
||||||
||||||
||||||
||||||
||||||
||||||
||||||
||||||
||||||
||||||
||||||
||||||
||||||
||||||
||||||
||||||
** 	 
# **Chương 1:  Phân tích yêu cầu của bài toán** 
## **1. Mục đích** 
Đề tài **"Hệ thống quản lý quán cà phê tối ưu vận hành và cá nhân hóa trải nghiệm khách hàng"** được nghiên cứu và phát triển nhằm giải quyết triệt để những "nỗi đau" (pain points) thực tế trong quá trình vận hành F&B, hướng tới 3 mục tiêu cốt lõi:

- **Tối ưu hóa quy trình vận hành :** Tự động hóa luồng thông tin giữa các bộ phận (Khách hàng – Phục vụ – Thu ngân – Pha chế). Loại bỏ hoàn toàn tình trạng sai sót do ghi chép thủ công . Giảm thiểu thời gian chờ đợi của khách và giảm tải khối lượng công việc lặt vặt cho nhân sự vào những khung giờ cao điểm.
- **Cá nhân hóa trải nghiệm khách hàng :** Xây dựng luồng trải nghiệm "Zero-friction" (không ma sát). Khách hàng có thể quét mã QR tự đặt món không cần cài đặt ứng dụng, vốn là điều mà người dùng luôn quan ngại về những vấn đề như cấp quyền, ảnh hưởng đến dữ liệu của họ. Đặc biệt, hệ thống ứng dụng công nghệ để "ghi nhớ" thói quen gọi món của khách thành viên, hiển thị gợi ý "Món quen" nhằm rút ngắn thời gian ra quyết định, kết hợp cùng hệ thống tích điểm để tăng độ trung thành của khách hàng.
- **Cung cấp công cụ Quản trị toàn diện :** Hỗ trợ Ban quản lý kiểm soát chặt chẽ dòng tiền, theo dõi lượng nguyên liệu tiêu hao, phê duyệt yêu cầu nhập hàng và nắm bắt tình hình kinh doanh thông qua các báo cáo thống kê trực quan, từ đó đưa ra các chiến lược kinh doanh kịp thời.

## **2. Phạm vi** 
Để đảm bảo tính khả thi và tập trung giải quyết đúng trọng tâm yêu cầu đề tài trong thời gian quy định, dự án được giới hạn trong các phạm vi sau:

**2.1. Phạm vi chức năng** Hệ thống được thiết kế dưới dạng Ứng dụng Web , đáp ứng trên đa thiết bị (PC, Tablet, Mobile) với 4 phân hệ chính:

- **Phân hệ Trải nghiệm Khách hàng (Customer Web App):** Quét mã QR tại bàn/mang về, xem thực đơn, tùy chỉnh món, đặt món, hủy món , yêu cầu thanh toán, chat hỗ trợ, xem món quen và lịch sử tích điểm.
- **Phân hệ Vận hành Bán hàng (POS & Staff App):** Quản lý sơ đồ bàn, order hộ khách, gộp bàn, xác nhận thanh toán, in hóa đơn, mở/đóng ca két tiền.
- **Phân hệ Điều phối Pha chế (KDS - Kitchen Display System):** Nhận đơn hàng theo thời gian thực (realtime), cập nhật trạng thái chế biến, kiểm kê kho cuối ngày và tạo phiếu yêu cầu nguyên liệu.
- **Phân hệ Quản trị (Admin Dashboard):** Quản lý danh mục món, quản lý nhân sự và phân quyền, duyệt yêu cầu kho, quản lý mã QR bàn và xem báo cáo doanh thu.

**2.2. Giới hạn của đề tài (Out-of-scope)** *Hệ thống hiện tại tập trung vào quy trình vận hành nội tại của quán cà phê, do đó chưa bao gồm các tính năng sau:*

- **Không đóng gói thành Native App:** Hệ thống hoạt động trên nền tảng trình duyệt Web, không triển khai tải về trên các kho ứng dụng App Store (iOS) hay Google Play (Android).
- **Không tích hợp nền tảng bên thứ ba:** Chưa hỗ trợ đồng bộ đơn hàng với các ứng dụng giao đồ ăn (GrabFood, ShopeeFood, BeFood).
- **Giới hạn cổng thanh toán:** Hệ thống sinh mã QR động để khách hàng chuyển khoản, nhưng việc xác nhận tiền vào tài khoản vẫn do Thu ngân thực hiện thủ công, chưa tích hợp API webhook tự động gạch nợ từ phía Ngân hàng.
- **Giới hạn nghiệp vụ Kế toán:** Hệ thống quản lý thu/chi và tồn kho cơ bản, không đi sâu vào các nghiệp vụ kế toán phức tạp như tính định mức khấu hao tài sản cố định hay kê khai thuế doanh nghiệp.

## **3. Mô tả bài toán** 
1. **Giới thiệu về tổ chức** 

   Mô hình quán cà phê hoạt động trong lĩnh vực dịch vụ ăn uống (F&B), trong đó chất lượng đồ uống và tốc độ phục vụ giữ vai trò trọng tâm. Cơ cấu nhân sự tại quán thường bao gồm: Quản lý (điều hành chung, giám sát nhân sự, duyệt kho và quản lý chất lượng dịch vụ), Thu ngân (quản lý thu chi và hóa đơn), Pha chế (chịu trách nhiệm chế biến, kiểm kê và yêu cầu nguyên liệu) và Nhân viên phục vụ (trực tiếp tiếp xúc và chăm sóc khách hàng). Quy trình vận hành hiện tại chủ yếu theo mô hình truyền thống: Khách hàng tìm bàn, nhân viên phục vụ mang thực đơn giấy tới ghi nhận order, sau đó di chuyển đến quầy để chuyển thông tin cho Thu ngân tính tiền và Bếp pha chế. Khi món hoàn thành, nhân viên phục vụ tiếp tục bưng bê ra bàn và hỗ trợ khách hàng thanh toán khi có yêu cầu.

1. **Các vấn đề trong hệ thống hiện tại** 

Hiện nay, quán cà phê đang gặp phải một số khó khăn nghiêm trọng trong công tác vận hành và chăm sóc khách hàng, bao gồm:

- Quy trình giao tiếp thủ công, đứt gãy: Việc truyền đạt thông tin order (đặc biệt là các ghi chú phức tạp như "ít đường", "không đá") bằng giấy hoặc truyền miệng giữa Phục vụ, Thu ngân và Pha chế dễ dẫn đến sai sót, làm sai món và gây lãng phí nguyên liệu.
- Quá tải nhân sự trong giờ cao điểm: Nhân viên phục vụ tốn quá nhiều thời gian di chuyển qua lại giữa các bàn và quầy pha chế chỉ để chuyển phiếu order hoặc giải quyết các yêu cầu lặt vặt (xin thêm đồ, hỏi pass wifi), dẫn đến phục vụ chậm trễ.
- Thiếu công cụ cá nhân hóa trải nghiệm: Quán không có hệ thống lưu trữ thói quen của khách hàng. Khách quen mỗi ngày đến quán đều phải lặp lại một yêu cầu gọi món duy nhất, hệ thống tích điểm thủ công rườm rà, thiếu tính gắn kết.
- Quản lý dòng tiền và đối soát khó khăn: Việc mở ca, đóng ca và tính toán tiền thừa hoàn toàn dựa vào kinh nghiệm thủ công của thu ngân, dễ dẫn đến thất thoát hoặc nhầm lẫn khi tách/gộp bill cho các nhóm khách đông.
- Khó khăn trong kiểm soát tồn kho và chất lượng dịch vụ: Ban quản lý thiếu các công cụ trực quan để nắm bắt phản hồi (review) của khách hàng. Đồng thời, quy trình báo cáo thiếu hụt nguyên liệu từ ca làm việc chưa được hệ thống hóa, dẫn đến việc duyệt mua hàng bị chậm trễ.

**c. Giới thiệu hệ thống tương lai** 

Để khắc phục những hạn chế hiện tại, quán cà phê mong muốn triển khai "Hệ thống quản lý quán cà phê tối ưu vận hành và cá nhân hóa trải nghiệm khách hàng". Đây là một giải pháp tích hợp (All-in-One), tập trung vào việc tự động hóa toàn bộ luồng công việc từ lúc khách hàng bước vào quán cho đến khi rời đi. Hệ thống sẽ hỗ trợ đồng bộ dữ liệu đa nền tảng, bao gồm: khách hàng tự quét mã QR gọi món tại bàn, luân chuyển đơn hàng tức thời (real-time) đến màn hình KDS của Pha chế và máy POS của Thu ngân. Đồng thời, hệ thống trao quyền chủ động cho bộ phận Pha chế trực tiếp kiểm kê và khởi tạo yêu cầu gọi nguyên liệu ngay trên thiết bị cuối ca.

Hệ thống được thiết kế để đảm bảo dữ liệu chạy xuyên suốt, giảm thiểu sai sót do con người. Bên cạnh đó, khía cạnh trải nghiệm người dùng  được đặc biệt chú trọng thông qua tính năng nhận diện khách hàng thành viên, đề xuất "Món quen hay dùng", "hủy/sửa món trong 1 phút", và hệ thống Chatbox hỗ trợ tự động. Đặc biệt, Ban quản lý được trang bị Dashboard toàn diện để giám sát doanh thu, quản lý danh mục, duyệt yêu cầu nhập kho và quản lý, phản hồi các đánh giá dịch vụ từ khách hàng một cách kịp thời.

Với giải pháp này, quán cà phê không chỉ giải phóng sức lao động cho nhân viên, tối ưu hóa hao hụt nguyên liệu, mà còn xây dựng được một quy trình phục vụ hiện đại, cá nhân hóa, từ đó gia tăng lòng trung thành của khách hàng và năng lực cạnh tranh trên thị trường F&B.

## **4. Phân tích yêu cầu** 
### **a. Xác định các quy trình nghiệp vụ** 
Dựa trên hiện trạng và mục tiêu đã đề ra, hệ thống cần đáp ứng các yêu cầu nghiệp vụ (YCNV) cốt lõi sau đây nhằm đảm bảo quy trình vận hành quán cà phê diễn ra trơn tru, tối ưu hóa thời gian và cá nhân hóa trải nghiệm khách hàng:

**Nhóm nghiệp vụ Phục vụ và Trải nghiệm khách hàng:**

- **YCNV-01 (Quản lý đặt món):** Hệ thống phải cho phép khách hàng tự đặt món thông qua việc quét mã QR tại bàn (hoặc mã QR dành riêng cho khách mua mang về) mà không bắt buộc phải tải ứng dụng.
- **YCNV-02 (Hỗ trợ nghiệp vụ phục vụ):** Cho phép nhân viên phục vụ tạo đơn hàng thay cho khách (đối với khách không rành công nghệ), thực hiện thao tác gộp bàn, tách bàn khi có yêu cầu.
- **YCNV-03 (Tối ưu hóa thao tác đặt hàng):** Cung cấp cơ chế cho phép khách hàng hoặc nhân viên thao tác hủy/sửa đổi món ăn trong vòng 01 phút sau khi chốt đơn nhằm giảm thiểu hao hụt do đặt nhầm.
- **YCNV-04 (Cá nhân hóa trải nghiệm):** Hệ thống phải có khả năng lưu trữ lịch sử gọi món của khách hàng thành viên, từ đó tự động đề xuất "Món quen hay dùng" lên đầu thực đơn để rút ngắn thời gian gọi món.
- **YCNV-05 (Chăm sóc khách hàng tự động):** Tích hợp tính năng Chatbox tại bàn với khả năng phản hồi tự động các thông tin cơ bản (Wifi, vị trí tiện ích) và chuyển tiếp các yêu cầu hỗ trợ trực tiếp đến thiết bị của nhân viên.
- **YCNV-06 (Chương trình khách hàng thân thiết):** Quản lý điểm tích lũy của khách hàng sau mỗi lần thanh toán và hỗ trợ khách hàng sử dụng điểm để quy đổi hoặc trừ vào hóa đơn. Hệ thống cho phép khách hàng gửi đánh giá (Rating) chất lượng dịch vụ.

**Nhóm nghiệp vụ Thu ngân và Dòng tiền:**

- **YCNV-07 (Quản lý thanh toán):** Tính toán chính xác tổng tiền hóa đơn, bao gồm việc áp dụng thuế VAT, phí phụ thu (nếu có) và trừ điểm tích lũy. Hỗ trợ đa dạng phương thức thanh toán (Tiền mặt, Chuyển khoản QR code).
- **YCNV-08 (Quản lý két tiền và Ca làm việc):** Yêu cầu thu ngân thực hiện nghiệp vụ khai báo tiền mặt khi "Mở ca" và đối soát doanh thu thực tế khi "Đóng ca" nhằm minh bạch hóa dòng tiền.

**Nhóm nghiệp vụ Pha chế (KDS):**

- **YCNV-09 (Điều phối chế biến):** Tiếp nhận đơn hàng theo thời gian thực (Real-time) từ khách hàng và nhân viên. Hiển thị danh sách món chờ theo thứ tự ưu tiên và cho phép cập nhật trạng thái (Đang chờ -> Đã xong) để thông báo ngược lại cho bộ phận phục vụ.

**Nhóm nghiệp vụ Quản trị và Kho hàng:**

- **YCNV-10 (Quản lý Kho và Cung ứng):** Hỗ trợ bộ phận pha chế kiểm kê nguyên vật liệu cuối ngày và tạo phiếu "Yêu cầu gọi nguyên liệu". Hệ thống cho phép Quản lý kiểm duyệt các phiếu yêu cầu này.
- **YCNV-11 (Quản lý hệ thống và Nhân sự):** Phân quyền truy cập theo vai trò (Quản lý, Thu ngân, Phục vụ, Pha chế). Hỗ trợ thiết lập danh mục thực đơn, sơ đồ bàn và tạo mã QR cho từng bàn.
- **YCNV-12 (Báo cáo và Thống kê):** Trích xuất các báo cáo doanh thu theo mốc thời gian (ngày, tuần, tháng) và thống kê danh sách các món ăn/thức uống bán chạy nhất để phục vụ công tác ra quyết định kinh doanh.

### **b. Xác định yêu cầu chức năng** 
Dựa trên sơ đồ Use Case tổng quát, hệ thống phần mềm được chia thành 5 phân hệ chính với các yêu cầu chức năng chi tiết như sau:

**1. Phân hệ Khách hàng (Customer Web App)** Phân hệ này hoạt động trên trình duyệt web của thiết bị di động, không yêu cầu tải ứng dụng, phục vụ luồng thao tác tự động của khách hàng.

- **YCCN-KH01 (Quản lý tài khoản):** Cho phép khách hàng đăng ký, đăng nhập tài khoản bằng số điện thoại hoặc email.
- **YCCN-KH02 (Quét mã QR & Xem Menu):** Khách hàng quét mã QR tại bàn (hoặc mã mang về) để truy cập thực đơn điện tử. Hệ thống tự động nhận diện số bàn.
- **YCCN-KH03 (Đặt món & Tùy chỉnh):** Cho phép khách hàng thêm món vào giỏ, chọn số lượng và ghi chú tùy chỉnh (nhiều/ít đá, đường, topping...).
- **YCCN-KH04 (Hủy/Sửa món ân hạn):** Cung cấp bộ đếm ngược 60 giây sau khi chốt đơn để khách hàng có thể tự do hủy hoặc chỉnh sửa món trước khi hệ thống đẩy lệnh xuống bếp.
- **YCCN-KH05 (Thanh toán):** Cho phép khách hàng gửi yêu cầu thanh toán, xem trước hóa đơn chi tiết (gồm VAT, phụ thu).
- **YCCN-KH06 (Chat hỗ trợ):** Cung cấp khung chat để khách hàng giao tiếp với quán. Tích hợp Bot trả lời tự động cho các câu hỏi thường gặp (Wifi, nhà vệ sinh).
- **YCCN-KH07 (Tính năng Thành viên - VIP):** \* Hiển thị đề xuất "Món quen hay dùng" lên đầu Menu dựa trên lịch sử tài khoản.
  - Tích điểm tự động sau mỗi hóa đơn và cho phép xem lại lịch sử giao dịch.
  - Cho phép khách hàng gửi đánh giá (Rating) và nhận xét về chất lượng dịch vụ.

**2. Phân hệ Nhân viên Phục vụ (Staff App)** Phân hệ dành cho nhân viên bưng bê, hoạt động trên thiết bị Tablet hoặc Smartphone của quán.

- **YCCN-PV01 (Xem sơ đồ bàn):** Hiển thị sơ đồ các bàn theo thời gian thực (Bàn trống, Bàn đang có khách, Bàn chờ dọn).
- **YCCN-PV02 (Order hộ khách):** Cho phép nhân viên chọn bàn và nhập order thay cho khách hàng, lưu vết thông tin nhân viên thực hiện.
- **YCCN-PV03 (Gộp bàn / Tách bàn):** Xử lý nghiệp vụ chuyển bàn hoặc gộp nhiều bàn lại với nhau để tính tiền chung theo yêu cầu của khách.
- **YCCN-PV04 (Hỗ trợ thanh toán):** Cho phép nhân viên gửi yêu cầu thanh toán giúp khách, hiển thị mã QR thanh toán trên thiết bị của nhân viên để khách quét.
- **YCCN-PV05 (Phản hồi Chat):** Tiếp nhận tiếng "ting ting" và tin nhắn từ khách hàng (những câu hỏi Bot không tự trả lời được) để kịp thời hỗ trợ.

**3. Phân hệ Thu ngân (POS)** Phân hệ hoạt động trên máy tính/máy POS tại quầy thu ngân.

- **YCCN-TN01 (Quản lý Két tiền):** Bắt buộc thu ngân nhập số dư tiền mặt đầu ca (Mở ca) và khai báo số tiền mặt thực tế cuối ca (Đóng ca) để hệ thống tính toán chênh lệch.
- **YCCN-TN02 (Xác nhận thanh toán):** Nhận yêu cầu thanh toán từ bàn. Xử lý tính toán tổng tiền, áp dụng trừ điểm thành viên (nếu có).
- **YCCN-TN03 (Tính tiền thừa):** Khi khách trả tiền mặt, hệ thống hỗ trợ tính toán chính xác số tiền cần thối lại.
- **YCCN-TN04 (In Bill):** Tự động gửi lệnh in hóa đơn giấy khi giao dịch hoàn tất hoặc khi có yêu cầu từ khách/nhân viên.

**4. Phân hệ Pha chế (Kitchen Display System - KDS)** Phân hệ hoạt động trên màn hình cảm ứng hoặc máy tính bảng đặt tại khu vực bếp/quầy pha chế.

- **YCCN-PC01 (Xem phiếu Order Realtime):** Hiển thị danh sách món cần làm dưới dạng thẻ (Card). Món mới nhất sẽ hiện lên ngay lập tức mà không cần F5 tải lại trang. Hiển thị chi tiết số bàn và ghi chú (ít đường...).
- **YCCN-PC02 (Cập nhật trạng thái món):** Cho phép Pha chế chạm vào món để đổi trạng thái sang "Đang làm" hoặc "Đã xong".
- **YCCN-PC03 (Báo phục vụ):** Khi món được đánh dấu "Đã xong", hệ thống đẩy thông báo về app của Nhân viên phục vụ để bưng bê.
- **YCCN-PC04 (Kiểm kê kho & Gọi nguyên liệu):** Cuối ca làm việc, Pha chế tổng kho nguyên vật liệu và chọn tạo phiếu "Yêu cầu gọi nguyên liệu" trực tiếp gửi lên Quản lý.

**5. Phân hệ Quản trị (Admin Dashboard)** Phân hệ dành riêng cho Chủ quán/Quản lý, hoạt động trên máy tính PC/Laptop.

- **YCCN-QL01 (Quản lý Nhân sự & Phân quyền):** Cấp tài khoản mới cho nhân viên, thiết lập mật khẩu, khóa tài khoản khi nghỉ việc và phân quyền truy cập theo vai trò.
- **YCCN-QL02 (Quản lý Thực đơn):** Thêm mới món ăn, chỉnh sửa giá cả, tạm ẩn món khi hết nguyên liệu và cài đặt VAT.
- **YCCN-QL03 (Quản lý Sơ đồ bàn):** Thêm, sửa, xóa số lượng bàn trong quán và xuất file ảnh mã QR để in dán lên bàn.
- **YCCN-QL04 (Quản lý Kho & Duyệt nguyên liệu):** Theo dõi số lượng nguyên liệu trong kho. Tiếp nhận và phê duyệt (hoặc từ chối) các yêu cầu nhập hàng từ Pha chế.
- **YCCN-QL05 (Quản lý Đánh giá dịch vụ):** Xem danh sách tất cả các đánh giá của khách hàng (Rating sao và bình luận). Cung cấp chức năng "Phản hồi" để Quản lý nhắn gửi lại khách hàng.
- **YCCN-QL06 (Xem Báo cáo thống kê):** Khai thác biểu đồ doanh thu theo ngày/tháng/năm và bảng xếp hạng những món bán chạy nhất để ra chiến lược kinh doanh.

### **c. Xác định yêu cầu phi chức năng** 
Để đảm bảo "Hệ thống quản lý quán cà phê tối ưu vận hành và cá nhân hóa trải nghiệm" hoạt động ổn định, mượt mà và an toàn trong môi trường F&B thực tế (đặc biệt là các khung giờ cao điểm), hệ thống phải đáp ứng các nhóm yêu cầu phi chức năng (YCPCN) sau:

**1. Hiệu năng và Tốc độ phản hồi (Performance & Response Time)**

- **YCPCN-01 (Thời gian tải trang):** Giao diện Web App dành cho khách hàng phải được tải hoàn tất trong vòng tối đa **2 - 3 giây** ở điều kiện mạng 4G,5G/Wifi tiêu chuẩn, tránh làm khách hàng mất kiên nhẫn khi quét mã QR.
- **YCPCN-02 (Độ trễ Real-time):** Quá trình truyền tải dữ liệu giữa các phân hệ (Khách chốt đơn -> POS Thu ngân báo chuông -> KDS Bếp hiện món) phải diễn ra gần như tức thời (thời gian trễ tối đa **< 1 giây**) thông qua công nghệ WebSockets.
- **YCPCN-03 (Sức tải đồng thời - Concurrency):** Server phải chịu tải được ít nhất 100 - 200 lượt truy cập và thao tác đồng thời (Concurrent Users) trong các khung giờ cao điểm (sáng sớm, nghỉ trưa) mà không bị treo hay giật lag.

**2. Tính khả dụng và Trải nghiệm người dùng (Usability & UX/UI)**

- **YCPCN-04 (Giao diện Mobile-First):** Phân hệ Khách hàng và Phục vụ phải được thiết kế chuẩn Responsive, ưu tiên hiển thị tối ưu trên thiết bị di động (Smartphone/Tablet). Nút bấm phải đủ lớn, dễ chạm, phông chữ rõ ràng, hạn chế tối đa thao tác cuộn ngang.
- **YCPCN-05 (Tiêu chuẩn KDS Bếp):** Giao diện phân hệ Pha chế (KDS) phải có độ tương phản cao, sử dụng màu sắc cảnh báo rõ rệt (Mới: Đỏ, Đang làm: Vàng, Hoàn thành: Xanh) để nhân viên dễ dàng quan sát từ xa trong môi trường ánh sáng phức tạp của khu vực bếp.
- **YCPCN-06 (Tính thân thiện):** Các thông báo lỗi (hết món, điền thiếu thông tin, nhập sai mã) phải được hiển thị bằng tiếng Việt rõ ràng, kèm theo hướng dẫn khắc phục cụ thể, không hiển thị mã lỗi code (ví dụ: không hiện *Error 500* hay *Null Reference*).

**3. Tính tương thích (Compatibility)**

- **YCPCN-07 (Trình duyệt nội bộ App):** Phân hệ Khách hàng phải hoạt động trơn tru trên các trình duyệt nội bộ (In-app Browser) của các ứng dụng phổ biến tại Việt Nam như **Zalo, Facebook Messenger, Camera mặc định của iOS/Android** (vì khách hàng thường dùng các app này để quét mã QR).
- **YCPCN-08 (Đa trình duyệt):** Phân hệ Quản trị và Thu ngân (Dashboard/POS) phải tương thích tốt với các trình duyệt web hiện đại trên PC/Laptop như Google Chrome, Safari, Microsoft Edge.

**4. Bảo mật và An toàn dữ liệu (Security)**

- **YCPCN-09 (Bảo vệ mật khẩu):** Mật khẩu của Quản lý, Nhân viên và Khách hàng phải được mã hóa một chiều (hashing - ví dụ: bcrypt) trước khi lưu vào Cơ sở dữ liệu. Tuyệt đối không lưu mật khẩu dưới dạng văn bản thô (plain-text).
- **YCPCN-10 (Bảo mật API):** Các endpoint API (Node.js) phải được bảo vệ bằng cơ chế xác thực Token (JWT - JSON Web Token). Chỉ những tài khoản có thẩm quyền (Role-based) mới được phép gọi các API thêm/sửa/xóa dữ liệu.
- **YCPCN-11 (Bảo mật thông tin Khách hàng):** Dữ liệu cá nhân của khách hàng (Lịch sử đặt món, Điểm tích lũy) không được phép rò rỉ hoặc truy cập trái phép bởi các tài khoản nhân viên không có thẩm quyền.

**5. Khả năng bảo trì và Mở rộng (Maintainability & Scalability)**

- **YCPCN-12 (Kiến trúc mã nguồn):** Hệ thống phải được thiết kế theo kiến trúc module hóa (tách biệt rõ ràng giữa Frontend và Backend). Cơ sở dữ liệu được chuẩn hóa để dễ dàng nâng cấp, thêm bảng (Table) mà không làm sập cấu trúc cũ.
- **YCPCN-13 (Sẵn sàng tích hợp):** Hệ thống Backend phải được thiết kế mở (RESTful API), sẵn sàng để tích hợp thêm với các đối tác thứ ba trong tương lai (ví dụ: cổng thanh toán VNPay, MoMo, hoặc các app giao hàng).

### **d. Quy tắc nghiệp vụ** 
#### Để hệ thống hoạt động chính xác, minh bạch và đảm bảo lợi ích cho cả khách hàng lẫn nhà hàng, phần mềm phải tuân thủ nghiêm ngặt các quy tắc nghiệp vụ (QTNV) sau đây:
#### **1. Nhóm quy tắc Đặt hàng và Định danh (Ordering & Identity)**
- #### **QTNV-01 (Thời gian ân hạn hủy món):** Khách hàng (hoặc nhân viên order hộ) chỉ được phép thao tác Hủy món hoặc Sửa ghi chú tối đa trong vòng **60 giây** kể từ lúc bấm "Chốt đơn". Sau 60 giây, hệ thống khóa thao tác này và dữ liệu chính thức đẩy xuống bộ phận Pha chế. Mọi thay đổi sau đó phải thông qua Quản lý.
- #### **QTNV-02 (Quy tắc sinh mã QR định danh):** \* Đối với khách dùng tại bàn: Mã QR dán trên bàn là mã tĩnh, chứa tham số ID của bàn (Ví dụ: ?table=12). Khi quét, món ăn tự động cộng dồn vào hóa đơn của bàn đó.
- #### Đối với khách mua mang về (Take-away): Mã QR đặt tại quầy là mã động. Mỗi lần khách quét, hệ thống phải sinh ra một Session\_ID (phiên giao dịch) riêng biệt để đảm bảo các khách đứng cạnh nhau quét mã không bị gộp chung vào một hóa đơn.
#### **2. Nhóm quy tắc Tính toán tài chính (Billing & Payment)**
- #### **QTNV-03 (Công thức tính Tổng hóa đơn):** Hệ thống phải tính toán tự động theo công thức chuẩn: *Tổng tiền thanh toán = [(Giá món cơ bản + Giá topping đi kèm) x Số lượng] + Phụ thu (nếu có) + Thuế VAT (nếu có) - Khuyến mãi/Điểm trừ.*
- #### **QTNV-04 (Quy tắc làm tròn tiền mặt):** Khi khách hàng thanh toán bằng tiền mặt, nếu tổng tiền lẻ đến hàng trăm đồng (ví dụ: 45.200đ), hệ thống làm tròn theo quy tắc kế toán chuẩn của quán (ví dụ: làm tròn xuống 45.000đ hoặc giữ nguyên tùy cấu hình của Quản lý). Đối với chuyển khoản, giữ nguyên chính xác đến từng đồng.
- #### **QTNV-05 (Ràng buộc ca làm việc của Thu ngân):** Thu ngân **bắt buộc phải thực hiện thao tác "Mở ca"** (nhập số tiền lẻ ban đầu) thì mới được phép truy cập vào màn hình POS để thực hiện chức năng "Xác nhận thanh toán".
#### **3. Nhóm quy tắc Khách hàng Thành viên (Membership & Loyalty)**
- #### **QTNV-06 (Quy tắc tích điểm):** Chỉ những hóa đơn được thanh toán thành công và khách hàng đã Đăng nhập tài khoản mới được ghi nhận tích điểm. Tỷ lệ quy đổi điểm do Quản lý cấu hình (Ví dụ: 10.000 VNĐ = 1 điểm).
- #### **QTNV-07 (Quy tắc Đánh giá - Rating):** Khách hàng chỉ được phép gửi đánh giá (Rating từ 1-5 sao và bình luận) cho những đơn hàng đã chuyển sang trạng thái "Hoàn tất thanh toán". Không cho phép đánh giá spam khi chưa sử dụng dịch vụ.
- #### **QTNV-08 (Thuật toán Gợi ý Món quen):** Món ăn được xếp vào danh mục "⭐ Món quen hay dùng" phải đáp ứng điều kiện: Nằm trong Top 3 món có tần suất được gọi nhiều nhất của tài khoản đó trong vòng 30 ngày gần nhất.
#### **4. Nhóm quy tắc Vận hành Bếp và Kho (Kitchen & Inventory)**
- #### **QTNV-09 (Thứ tự ưu tiên chế biến - KDS):** Màn hình bếp KDS phải sắp xếp thẻ món ăn tuân thủ nguyên tắc **FIFO** (First In, First Out - Đơn vào trước làm trước). Các món bị khách phàn nàn phải làm lại sẽ được gắn cờ (Flag) Ưu tiên cao nhất.
- #### <a name="_1qz1u8xzfbec"></a>**QTNV-10 (Ràng buộc duyệt nguyên liệu):** Phiếu "Yêu cầu gọi nguyên liệu" do Pha chế lập chỉ có giá trị khi được Quản lý chuyển trạng thái sang "Đã phê duyệt".
####

\* 	 


### **e. Mô tả một số chức năng phức tạp** 
Trong quá trình xây dựng "Hệ thống quản lý quán cà phê tối ưu vận hành và cá nhân hóa", nhóm phát triển đã tập trung xử lý một số bài toán có độ phức tạp cao về mặt logic dữ liệu và đồng bộ hệ thống, cụ thể như sau:

**1. Thuật toán phân tích và đề xuất "Món quen hay dùng" (Cá nhân hóa)**

- **Mục đích:** Rút ngắn thời gian gọi món cho khách hàng thành viên bằng cách tự động đưa ra các gợi ý đồ uống sát với sở thích cá nhân nhất, bao gồm cả các ghi chú tùy chỉnh (ít đường, không đá).
- **Logic xử lý (Thuật toán):**
  - Khi một khách hàng (đã đăng nhập) tiến hành quét mã QR tại bàn, hệ thống kích hoạt hàm truy vấn lịch sử đặt hàng (OrderHistory) của User\_ID đó.
  - Hệ thống áp dụng bộ lọc thời gian (Time-bound Filter): Chỉ lấy dữ liệu các hóa đơn trong vòng **30 ngày gần nhất** để đảm bảo tính thời sự của khẩu vị.
  - Áp dụng thuật toán Gom nhóm và Đếm tần suất (Grouping & Frequency Counting): Hệ thống nhóm các món ăn lại dựa trên 2 tiêu chí là Mã món (Item\_ID) và Ghi chú tùy chỉnh (Custom\_Notes).
  - Thuật toán sẽ đếm số lần xuất hiện của từng nhóm, sắp xếp giảm dần (Descending) và chỉ trích xuất **Top 3** kết quả có tần suất gọi cao nhất.
  - Kết quả được trả về Frontend và hiển thị nổi bật ở khu vực "⭐ Món quen của bạn". Khách hàng bấm thêm vào giỏ thì toàn bộ Custom\_Notes cũ sẽ được tự động điền vào.

**2. Cơ chế khóa trạng thái "Ân hạn 60 giây" (Grace Period Logic)**

- **Mục đích:** Cho phép khách hàng thay đổi quyết định hoặc sửa sai sót ngay sau khi chốt đơn mà không làm ảnh hưởng đến quy trình chế biến của bếp, giảm hao hụt nguyên liệu.
- **Logic xử lý:**
  - Ngay khi khách hàng bấm "Chốt đơn", hóa đơn được ghi vào Cơ sở dữ liệu với trạng thái đặc biệt là PENDING\_GRACE (Đang chờ ân hạn). Lúc này, đơn hàng **tuyệt đối không** được đẩy xuống màn hình Bếp (KDS).
  - Tại Frontend (app của khách), một bộ đếm ngược (Countdown Timer) 60 giây được kích hoạt.
  - **Nhánh 1 (Khách hủy/sửa):** Nếu trong 60 giây, khách bấm nút "Hủy đơn", Frontend gửi API gọi lệnh hủy. Backend cập nhật trạng thái hóa đơn thành CANCELLED\_BY\_USER và khôi phục giỏ hàng cho khách.
  - **Nhánh 2 (Hết thời gian):** Khi đồng hồ đếm ngược về 0 (hoặc thông qua một Background Job/Cronjob chạy ngầm dưới Backend kiểm tra các đơn quá 60s), hệ thống tự động khóa quyền chỉnh sửa, đổi trạng thái hóa đơn thành CONFIRMED (Đã xác nhận). Chỉ lúc này, lệnh báo động mới được đẩy xuống Bếp.

**3. Cơ chế đồng bộ dữ liệu Thời gian thực (Real-time Synchronization)**

- **Mục đích:** Loại bỏ hoàn toàn độ trễ trong giao tiếp giữa Khách hàng – Thu ngân – Pha chế, đảm bảo các màn hình POS và KDS luôn hiển thị thông tin mới nhất mà không cần người dùng tải lại trang (F5).
- **Logic xử lý (Ứng dụng WebSockets):**
  - Hệ thống không sử dụng phương pháp HTTP Polling truyền thống (gọi API liên tục mỗi vài giây gây nghẽn server) mà sử dụng giao thức kết nối hai chiều **WebSockets (Socket.io)**.
  - Hệ thống chia làm các "Phòng" (Rooms) riêng biệt: Room\_Bếp, Room\_ThuNgân, Room\_KháchHàng\_ID.
  - Khi đơn hàng chuyển trạng thái CONFIRMED (qua 60 giây), Backend sẽ phát ra một sự kiện emit('NEW\_ORDER', payload) chỉ gửi thẳng vào Room\_Bếp. Màn hình Tablet của Bếp lập tức render thêm 1 thẻ món ăn mới kèm âm báo.
  - Khi Pha chế chạm nút "Đã xong", màn hình Bếp gửi tín hiệu lên Backend. Backend lập tức emit('ORDER\_READY') đồng thời vào Room\_ThuNgân (để nhân viên biết đường đi bưng) và Room\_KháchHàng\_ID (để máy khách rung lên báo món đã xong).



# **Chương 2: Mô hình hóa chức năng và cấu trúc của hệ thống** 

## **1. Phân tích và mô hình hóa chức năng của bài toán** 
1\.1 Sơ đồ use case tổng quát

![](Aspose.Words.14e19912-5703-4233-ae09-3c8f5efd861f.001.png)
#### 1\.2 Đặc tả use case 
##### **UC01: Quét mã QR và Đặt món**
Quét mã QR và Đặt món

|**Tiền điều kiện** |Khách hàng có thiết bị kết nối Internet và quét mã QR hợp lệ tại bàn.|
| :- | :- |
|**Hậu điều kiện** |Đơn hàng được hệ thống phân loại chính xác (Tại bàn/Mang về), sinh đúng mã định danh và đẩy xuống Bếp, bàn cập nhật trạng thái "Có khách".|
|**Actor chính** |Khách hàng vãng lai, Khách hàng thành viên|
|**Actor phụ** |Cổng thanh toán (Momo/VNPay/Bank API).|
|**Basic flow** ||
|**Khách hàng**|**Hệ thống** |
|<p>**Nhánh 1:Khách tại bàn**</p><p>1\. Quét QR tĩnh, hệ thống nhận diện số bàn và hiện Menu.</p><p></p>|2\. Hệ thống xác thực mã, nhận diện số bàn và hiển thị menu.|
|3\. Khách hàng lướt xem và chọn món muốn đặt.|` `4. Hệ thống hiển thị màn hình "Tùy chỉnh món".|
|<p>5\.Khách hàng chọn các tùy chọn (size, đá, đường, topping) và nhấn "Thêm vào giỏ hàng".</p><p></p>||
|<p></p><p>6\.Khách hàng mở Giỏ hàng, kiểm tra lại danh sách và nhấn "Gọi món".</p><p></p>|<p>7\.Hiển thị pop-up yêu cầu chọn: **"Thanh toán ngay"** hoặc **"Thanh toán sau"**.</p><p></p><p></p>|
|<p>8\.Lựa chọn hình thức thanh toán:</p><p>8\.1 (Thanh toán ngay): **[Hệ thống]** Hiển thị mã QR thanh toán -> **[Khách hàng]** quét mã chuyển khoản -> **[Hệ thống]** Xác nhận đã thu tiền, chuyển trạng thái bill "Đã thanh toán".</p><p>8\.2 (Thanh toán sau): **[Hệ thống]** Ghi nhận công nợ cho bàn này, trạng thái "Chờ thanh toán".</p>|9\.Lưu món vào giỏ hàng tạm thời, tính tổng tiền. và đếm ngược 60 giây.|
||10\. Hết 60 giây, hệ thống đẩy lệnh xuống màn hình KDS pha chế và POS Thu ngân.|
|<p>**Nhánh 2:Khách mua mang về:**</p><p>1\.Quét mã QR động hiển thị tại quầy thu ngân.</p><p></p>|2\.Tự động sinh ra một Session\_ID (phiên giao dịch) độc lập cho thiết bị quét và hiển thị Menu.|
|3\.Chọn món, tùy chỉnh và thêm vào giỏ.|4\.Lưu món tạm thời, tính tổng tiền.|
|5\.Nhấn "Gọi món".|6\.Khóa đơn hàng và **bắt buộc điều hướng sang màn hình Thanh toán**.|
|7\. Quét mã thanh toán và hoàn tất thanh toán ngay lập tức.|8\.Sinh mã số thứ tự nhận nước (hoặc lưu tên khách), sau 60s, đẩy lệnh xuống pha chế.|

|**Alternative flow** |
| :- |
|<p>1\. **Hủy/Sửa món:** Tại bước 6 (Tại bàn) hoặc bước 8 (Mang về), trong vòng 60s, **[Khách hàng]** nhấn "Hủy/Sửa đơn". **[Hệ thống]** lập tức thu hồi lệnh, đưa món trở lại giỏ hàng.</p><p>2\.**Bàn có người:** Tại bước 2 (Tại bàn), nếu mã QR thuộc về bàn đã có khách check-in, **[Hệ thống]** báo lỗi "Bàn đang bận".</p>|
|<p>**Exception** </p><p></p>|
##### **UC02: Đăng nhập / Đăng ký Khách hàng**

|<h5><a name="_eqdp6r9u4r1p"></a>**Đăng nhập / Đăng ký Khách hàng**</h5>||
| :- | :- |
|**Tiền điều kiện** |Khách hàng đang truy cập Web App.|
|**Hậu điều kiện** |Phiên đăng nhập được tạo, giao diện cập nhật hiển thị dữ liệu thành viên.|
|**Actor chính** |Khách hàng (Customer)|
|**Actor phụ** |Cổng thanh toán (Momo/VNPay/Bank API)|
|**Basic flow** ||
|1 Chọn "Đăng nhập/Đăng ký".|2 2. Hiển thị form nhập SĐT.|
|3 Nhập Số điện thoại.|4\.Kiểm tra: Nếu có SĐT -> Yêu cầu Mật khẩu/OTP. Nếu chưa có -> Mở form Tạo tài khoản.|
|5\. Nhập thông tin xác thực.|6\.Đối chiếu CSDL, báo "Đăng nhập thành công" và chuyển hướng về Menu chọn món.|
|**Alternative flow (Luồng thay thế)**||
|<p>6\.1Sai thông tin: [Hệ thống] báo lỗi chữ đỏ yêu cầu [Khách hàng] nhập lại.</p><p>**5.1Quên mật khẩu:** **[Khách hàng]** bấm Quên mật khẩu, **[Hệ thống]** gửi mã OTP qua SMS/Zalo để đổi mật khẩu. |</p>||
|**Exception (Ngoại lệ)**||
|||
##### **UC03: Xem món quen hay dùng**

|**Xem món quen hay dùng**||
| :- | :- |
|**Tiền điều kiện** |Khách đã Đăng nhập và có lịch sử order trong 30 ngày qua.|
|**Hậu điều kiện** |` `Món được thêm nhanh vào giỏ hàng.|
|**Actor chính** |Khách hàng thành viên|
|**Actor phụ** ||
|**Basic flow** ||
|**Khách hàng**|**Hệ thống** |
||1\.Tự động truy xuất lịch sử tài khoản, lọc Top 3 món gọi nhiều nhất.|
||2\.Hiển thị mục "⭐ Món quen của bạn" lên đầu Menu.|
|3\.Nhấn nút "Thêm nhanh" tại món ăn.|4\. Đẩy món vào giỏ kèm toàn bộ ghi chú tùy chỉnh cũ (ít đá, nhiều đường). |
|5\. Khách hàng tủy chỉnh hoặc giữ nguyên ghi chú và nhấn “Gọi món”||

|**Alternative flow** |
| :- |
|<p>**1. Chưa đủ dữ liệu:** **[Hệ thống]** tự động ẩn mục Món quen.</p><p>**2. Hết nguyên liệu:** **[Hệ thống]** làm mờ món và gắn nhãn "Tạm hết hàng", khóa nút Thêm nhanh.</p>|
|**Exception** |
|**4a. Lỗi kết nối máy chủ chat:** Hệ thống chat bị gián đoạn, tin nhắn không gửi đi được. Hệ thống hiện biểu tượng chấm than đỏ cạnh tin nhắn và báo "Chưa gửi được tin nhắn".|
##### **UC04:  Chat hỗ trợ**

|**Phân công ca làm** ||
| :- | :- |
|**Tiền điều kiện** |- Khách đang ở giao diện Web App|
|**Hậu điều kiện** |- Yêu cầu được giải đáp, lưu lịch sử chat.|
|**Actor chính** |Khách hàng (Vãng lai & Thành viên)|
|**Actor phụ** |Không |
|**Basic flow** ||
|**Khách hàng**|**Hệ thống** |
|<p>1 Nhấn biểu tượng Chatbox và nhập tin nhắn.</p><p>.</p>|2 Phân tích từ khóa trong tin nhắn.|
||3\.Phát hiện từ khóa "wifi", Bot tự động phản hồi ngay: "Pass wifi là caphe1234".|
|**Alternative flow (Luồng thay thế)**||
|**1. Cần nhân viên:** **[Hệ thống]** không tìm thấy từ khóa tự động -> Đẩy tin nhắn kèm số bàn lên màn hình POS cho Nhân viên. ||
|**Exception (Ngoại lệ)**||
|||



##### **UC05: Yêu cầu Thanh toán**

|<h5><a name="_207glgkwrqsb"></a>**Yêu cầu Thanh toán**</h5>||
| :- | :- |
|**Tiền điều kiện** |` `Bàn đang có ít nhất 1 món ở trạng thái đã phục vụ.|
|**Hậu điều kiện** |Bàn đổi trạng thái "Chờ thanh toán", thông báo gửi lên POS. |
|Actor chính|Khách hàng (Vãng lai & Thành viên)|
|**Actor phụ** |Hệ thống |
|**Basic flow** ||
|**Khách hàng**|**Hệ thống** |
|1. Nhấn nút "Thanh toán".|2. Tính toán VAT, phụ thu và hiển thị chi tiết Hóa đơn.|
|3. Chọn phương thức "Chuyển khoản".|4. Sinh mã VietQR động chứa sẵn số tiền.|
|5. Quét QR chuyển khoản.|6. Gửi chuông báo "Yêu cầu thanh toán" của bàn đó về máy POS Thu ngân. |
|**Alternative flow** ||
|<p>**1.Dùng điểm:** **[Khách hàng]** nhập điểm, **[Hệ thống]** trừ thẳng tiền vào Tổng hóa đơn.</p><p>**A2. Trả tiền mặt:** **[Khách hàng]** chọn Tiền mặt, **[Hệ thống]** báo "Vui lòng chờ nhân viên đến thu tiền".</p>||
|**Exception** ||
|**Món vừa hết hàng trong kho:** Nhân viên bấm chọn món nhưng hệ thống đối chiếu kho phát hiện nguyên liệu không đủ hoặc Quản lý vừa báo hết. Hệ thống cảnh báo đỏ "Món đã hết nguyên liệu" và không cho phép thêm vào bill.||


##### **UC06: Xem lịch sử dùng & Tích điểm**

|Xem lịch sử dùng & Tích điểm||
| :- | :- |
|**Tiền điều kiện** |` `Đã đăng nhập Web App|
|**Hậu điều kiện** |Dữ liệu hiển thị thành công, không làm thay đổi CSDL.|
|**Actor chính** |Khách hàng thành viên|
|**Actor phụ** |Không có|
|**Basic flow** ||
|**Tổ trường** |**Hệ thống** |
|1. ` `Nhấn vào trang Cá nhân.|2. ` `Hiển thị Hạng thành viên và Điểm tích lũy.|
|3. Chọn "Lịch sử đặt món"|4. ` `Hiển thị danh sách các bill cũ.|
|5. Nhấn vào 1 bill để xem chi tiết.||
|**Alternative flow** ||
|**A1. Chưa có bill:** **[Hệ thống]** hiển thị thông báo "Bạn chưa có đơn hàng nào". ||
|**Exception** ||
|||
##### **UC07: Gửi đánh giá dịch vụ**

|**Trả lời tin nhắn Chatbox**||
| :- | :- |
|**Tiền điều kiện**|Đơn hàng vừa chuyển sang "Đã thanh toán". |
|**Hậu điều kiện** |` `Đánh giá được ghi nhận cho luồng Quản lý.|
|**Actor chính** |Khách hàng thành viên|
|**Actor phụ** ||
|**Basic flow** ||
|**Khách hàng**|**Hệ thống** |
||1\.Tự động pop-up form "Đánh giá dịch vụ" trên App khách.|
|3\.Chọn số Sao (1-5 sao), nhập bình luận và nhấn "Gửi".|3\.Lưu đánh giá vào CSDL và đẩy thông báo về Dashboard Quản lý. |
|**Alternative flow** ||
|<p>**A1. Bỏ qua:** **[Khách hàng]** nhấn X, **[Hệ thống]** đóng form.</p><p>**A2. Chỉ rate sao:** **[Khách hàng]** không nhập chữ, **[Hệ thống]** vẫn lưu số sao.</p>||
|**Exception** ||
|||
##### **UC08: Xem sơ đồ bàn**

|<h5><a name="_t3tuw8e7uzzm"></a>**Xem sơ đồ bàn**</h5>||
| :- | :- |
|**Tiền điều kiện** |Đã đăng nhập App Phục vụ. |
|**Hậu điều kiện** |**Hậu điều kiện** | Trạng thái bàn được đồng bộ.|
|**Actor chính** |Nhân viên phục vụ|
|**Actor phụ** ||
|**Basic flow** ||
|**Nhân viên phục vụ**|**Hệ thống** |
|1. Mở tính năng Sơ đồ bàn.|2. Tải dữ liệu Real-time và hiển thị trạng thái bàn bằng màu sắc (Xám, Xanh, Cam).|
|3. Nhấp vào bàn màu Xanh.|4. Hiển thị danh sách các món khách đang dùng tại bàn đó.|
|` `**Alternative flow** ||
|**A1. Dọn bàn:** Khách về (bàn màu vàng), **[Nhân viên]** dọn xong bấm "Đã dọn". **[Hệ thống]** chuyển bàn về màu Xám (Trống). ||
|**Exception** ||
|||
##### **UC09: Order hộ khách & Gộp bàn**

|<h5><a name="_mr9xw6fnkizp"></a>**Order hộ khách & Gộp bàn**</h5>||
| :- | :- |
|**Tiền điều kiện** |Đang mở sơ đồ bàn trên App.|
|**Hậu điều kiện** |` `Đơn hàng đẩy xuống pha chế, lưu vết người tạo.|
|**Actor chính** |Quản lý (Admin)|
|**Actor phụ** |Không |
|**Basic flow** ||
|**Nhân viên phục vụ**|**Hệ thống** |
|1. Chọn bàn cần order.|2. Hiển thị Menu.|
|<p>3. Chọn món, tùy chỉnh và nhấn “Gọi món”</p><p>&emsp;</p>|4. Lưu đơn, gắn thẻ tên nhân viên và bắt đầu đếm ngược 60s.|
|**Alternative flow** ||
|<p>**A1. Gộp bàn:** **[Nhân viên]** chọn bàn A, bấm "Gộp bàn", chọn đích là bàn B. **[Hệ thống]** gộp 2 bàn lại với nhau, hệ thống hiển thị bàn A,B.</p><p>**A2. Hủy món hộ:** **[Nhân viên]** bấm hủy trong 60s, **[Hệ thống]** thu hồi lệnh.</p><p>**A3:Chuyển bàn:[Nhân viên]** chọn bàn A, bấm “chuyển bàn”, chọn đích là bàn B**[Hệ thống]** chuyển toàn bộ bill bàn A sang B, A chuyển trạng thái thành trống</p>||
|**Exception** ||
|||
|<p></p><p></p><p></p><p></p><p></p><p></p>||
##### **UC10: Hỗ trợ Thanh toán**

|<h5><a name="_5zmfidz4dfjb"></a> **Hỗ trợ Thanh toán**</h5>||
| :- | :- |
|**Tiền điều kiện** |Khách gọi thanh toán tại bàn.|
|**Hậu điều kiện** |Hóa đơn được xử lý thanh toán. |
|**Actor chính** |Nhân viên Phục vụ|
|**Actor phụ** |Không |
|**Basic flow** ||
|**Nhân viên Phục vụ**|**Hệ thống** |
|1\.Chọn bàn trên App, bấm "Yêu cầu thanh toán"|2\. Hiển thị tổng tiền, sinh QR thanh toán|
|3\.Báo tiền cho khách, đưa QR trên máy nhân viên cho khách quét.|4\. Khách quét xong, **[Hệ thống]** báo POS in Bill.|
|5\.Lấy bill giao cho khách||
|**Alternative flow** ||
|**A1. Trả tiền mặt:** **[Nhân viên]** nhận tiền mặt, mang về POS Thu ngân lấy tiền thối và Bill trả lại bàn. |||
|**Exception** ||
|||
|<p></p><p></p><p></p><p></p><p></p>||
##### **UC11: Phản hồi Chat**

|<h5><a name="_x97rtgqeb2y0"></a>**Phản hồi Chat**</h5>||
| :- | :- |
|Tiền điều kiện|Khách nhắn tin không chứa từ khóa tự động.|
|**Hậu điều kiện** |- Khách hàng được hỗ trợ tận bàn|
|**Actor chính** |Quản lý (Admin)|
|**Actor phụ** |Không|
|**Basic flow** ||
|**Nhân viên kiểm định chất lượng** |**Hệ thống** |
||1\. Đẩy tin nhắn và số bàn lên thiết bị của Nhân viên kèm chuông báo|
|2\. Đọc tin nhắn (VD: "Cho xin thêm đá"), bấm “Xác nhận đang xử lý”||
|3\. Nhân viên hỗ trợ khách hàng|4\. Lưu lịch sử tháo tác đã hoàn thành|
|**Alternative flow** ||
|**A1. Phản hồi text:** **[Nhân viên]** gõ tin nhắn phản hồi trực tiếp trên máy gửi lại cho khách. ||
|**Exception** ||
|||
##### **UC12:Mở ca / Đóng ca (Quản lý két tiền)**

|**Xác thực giao dịch (Giao tiếp qua API)**||
| :- | :- |
|**Tiền điều kiện** |Đăng nhập phần mềm POS|
|**Hậu điều kiện** |Dòng tiền được lưu trữ đối soát cho Quản lý.|
|**Actor chính** |Thu ngân|
|**Actor phụ** ||
|**Basic flow** ||
|**Thu ngân**|**Hệ thống** |
|**Nhánh 1: Mở ca**|` `1.Khóa POS, bật form Mở ca.|
|2\.Nhập tiền lẻ đầu ca và Xác nhận.|4\. Mở khóa giao diện bán hàng.|
|<p>**Nhánh 2 đóng ca:**</p><p>1\.Bấm "Đóng ca".</p>|2\.Báo tổng doanh thu tiền mặt mong đợi.|
|<p>3\.Nhập số tiền thực tế đếm được.</p><p></p>|4\.Đối soát thừa/thiếu, in phiếu bàn giao và tự động đăng xuất.|
|**Alternative flow** ||
|**A1. Chưa mở ca:** **[Thu ngân]** tắt pop-up, **[Hệ thống]** chặn mọi nút thanh toán. ||
|**Exception** ||
|<p></p><p></p>||
##### <a name="_5f61ezyr1buq"></a>**UC12:Mở ca / Đóng ca (Quản lý két tiền)**

|**Xác thực giao dịch (Giao tiếp qua API)**||
| :- | :- |
|**Tiền điều kiện** |Đăng nhập phần mềm POS|
|**Hậu điều kiện** |Dòng tiền được lưu trữ đối soát cho Quản lý.|
|**Actor chính** |Thu ngân|
|**Actor phụ** ||
|**Basic flow** ||
|**Thu ngân**|**Hệ thống** |
|**Nhánh 1: Mở ca**|` `1.Khóa POS, bật form Mở ca.|
|2\.Nhập tiền lẻ đầu ca và Xác nhận.|4\. Mở khóa giao diện bán hàng.|
|<p>**Nhánh 2 đóng ca:**</p><p>1\.Bấm "Đóng ca".</p>|2\.Báo tổng doanh thu tiền mặt mong đợi.|
|<p>3\.Nhập số tiền thực tế đếm được.</p><p></p>|4\.Đối soát thừa/thiếu, in phiếu bàn giao và tự động đăng xuất.|
|**Alternative flow** ||
|**A1. Chưa mở ca:** **[Thu ngân]** tắt pop-up, **[Hệ thống]** chặn mọi nút thanh toán. ||
|**Exception** ||
|||
##
##### <a name="_6syfoq8f8dka"></a><a name="_l5mv1hl9799w"></a>**UC12:Mở ca / Đóng ca (Quản lý két tiền)**

|**Xác thực giao dịch (Giao tiếp qua API)**||
| :- | :- |
|**Tiền điều kiện** |Đăng nhập phần mềm POS|
|**Hậu điều kiện** |Dòng tiền được lưu trữ đối soát cho Quản lý.|
|**Actor chính** |Thu ngân|
|**Actor phụ** ||
|**Basic flow** ||
|**Thu ngân**|**Hệ thống** |
|**Nhánh 1: Mở ca**|` `1.Khóa POS, bật form Mở ca.|
|2\.Nhập tiền lẻ đầu ca và Xác nhận.|4\. Mở khóa giao diện bán hàng.|
|<p>**Nhánh 2 đóng ca:**</p><p>1\.Bấm "Đóng ca".</p>|2\.Báo tổng doanh thu tiền mặt mong đợi.|
|<p>3\.Nhập số tiền thực tế đếm được.</p><p></p>|4\.Đối soát thừa/thiếu, in phiếu bàn giao và tự động đăng xuất.|
|**Alternative flow** ||
|**A1. Chưa mở ca:** **[Thu ngân]** tắt pop-up, **[Hệ thống]** chặn mọi nút thanh toán. ||
|**Exception** ||
|||
##
##### <a name="_4r9ztx87afnr"></a><a name="_3495a7ob2foc"></a>**UC12:Mở ca / Đóng ca (Quản lý két tiền)**

|**Xác thực giao dịch (Giao tiếp qua API)**||
| :- | :- |
|**Tiền điều kiện** |Đăng nhập phần mềm POS|
|**Hậu điều kiện** |Dòng tiền được lưu trữ đối soát cho Quản lý.|
|**Actor chính** |Thu ngân|
|**Actor phụ** ||
|**Basic flow** ||
|**Thu ngân**|**Hệ thống** |
|**Nhánh 1: Mở ca**|` `1.Khóa POS, bật form Mở ca.|
|2\.Nhập tiền lẻ đầu ca và Xác nhận.|4\. Mở khóa giao diện bán hàng.|
|<p>**Nhánh 2 đóng ca:**</p><p>1\.Bấm "Đóng ca".</p>|2\.Báo tổng doanh thu tiền mặt mong đợi.|
|<p>3\.Nhập số tiền thực tế đếm được.</p><p></p>|4\.Đối soát thừa/thiếu, in phiếu bàn giao và tự động đăng xuất.|
|**Alternative flow** ||
|**A1. Chưa mở ca:** **[Thu ngân]** tắt pop-up, **[Hệ thống]** chặn mọi nút thanh toán. ||
|**Exception** ||
|||
##
##### <a name="_cpyencigblbb"></a><a name="_1zgkrd939mr7"></a>**UC12:Mở ca / Đóng ca (Quản lý két tiền)**

|**Xác thực giao dịch (Giao tiếp qua API)**||
| :- | :- |
|**Tiền điều kiện** |Đăng nhập phần mềm POS|
|**Hậu điều kiện** |Dòng tiền được lưu trữ đối soát cho Quản lý.|
|**Actor chính** |Thu ngân|
|**Actor phụ** ||
|**Basic flow** ||
|**Thu ngân**|**Hệ thống** |
|**Nhánh 1: Mở ca**|` `1.Khóa POS, bật form Mở ca.|
|2\.Nhập tiền lẻ đầu ca và Xác nhận.|4\. Mở khóa giao diện bán hàng.|
|<p>**Nhánh 2 đóng ca:**</p><p>1\.Bấm "Đóng ca".</p>|2\.Báo tổng doanh thu tiền mặt mong đợi.|
|<p>3\.Nhập số tiền thực tế đếm được.</p><p></p>|4\.Đối soát thừa/thiếu, in phiếu bàn giao và tự động đăng xuất.|
|**Alternative flow** ||
|**A1. Chưa mở ca:** **[Thu ngân]** tắt pop-up, **[Hệ thống]** chặn mọi nút thanh toán. ||
|**Exception** ||
|||
##
##### <a name="_7iypqb3ss2kb"></a><a name="_abx89b6mpjk1"></a>**UC12:Mở ca / Đóng ca (Quản lý két tiền)**

|**Xác thực giao dịch (Giao tiếp qua API)**||
| :- | :- |
|**Tiền điều kiện** |Đăng nhập phần mềm POS|
|**Hậu điều kiện** |Dòng tiền được lưu trữ đối soát cho Quản lý.|
|**Actor chính** |Thu ngân|
|**Actor phụ** ||
|**Basic flow** ||
|**Thu ngân**|**Hệ thống** |
|**Nhánh 1: Mở ca**|` `1.Khóa POS, bật form Mở ca.|
|2\.Nhập tiền lẻ đầu ca và Xác nhận.|4\. Mở khóa giao diện bán hàng.|
|<p>**Nhánh 2 đóng ca:**</p><p>1\.Bấm "Đóng ca".</p>|2\.Báo tổng doanh thu tiền mặt mong đợi.|
|<p>3\.Nhập số tiền thực tế đếm được.</p><p></p>|4\.Đối soát thừa/thiếu, in phiếu bàn giao và tự động đăng xuất.|
|**Alternative flow** ||
|**A1. Chưa mở ca:** **[Thu ngân]** tắt pop-up, **[Hệ thống]** chặn mọi nút thanh toán. ||
|**Exception** ||
|||
##
##### <a name="_48wwhwokg150"></a><a name="_it7ijcdd1xww"></a>**UC12:Mở ca / Đóng ca (Quản lý két tiền)**

|**Xác thực giao dịch (Giao tiếp qua API)**||
| :- | :- |
|**Tiền điều kiện** |Đăng nhập phần mềm POS|
|**Hậu điều kiện** |Dòng tiền được lưu trữ đối soát cho Quản lý.|
|**Actor chính** |Thu ngân|
|**Actor phụ** ||
|**Basic flow** ||
|**Thu ngân**|**Hệ thống** |
|**Nhánh 1: Mở ca**|` `1.Khóa POS, bật form Mở ca.|
|2\.Nhập tiền lẻ đầu ca và Xác nhận.|4\. Mở khóa giao diện bán hàng.|
|<p>**Nhánh 2 đóng ca:**</p><p>1\.Bấm "Đóng ca".</p>|2\.Báo tổng doanh thu tiền mặt mong đợi.|
|<p>3\.Nhập số tiền thực tế đếm được.</p><p></p>|4\.Đối soát thừa/thiếu, in phiếu bàn giao và tự động đăng xuất.|
|**Alternative flow** ||
|**A1. Chưa mở ca:** **[Thu ngân]** tắt pop-up, **[Hệ thống]** chặn mọi nút thanh toán. ||
|**Exception** ||
|||
##
##### <a name="_gmvbi1luk8w"></a><a name="_nzbgj1xylw4r"></a>**UC12:Mở ca / Đóng ca (Quản lý két tiền)**

|**Xác thực giao dịch (Giao tiếp qua API)**||
| :- | :- |
|**Tiền điều kiện** |Đăng nhập phần mềm POS|
|**Hậu điều kiện** |Dòng tiền được lưu trữ đối soát cho Quản lý.|
|**Actor chính** |Thu ngân|
|**Actor phụ** ||
|**Basic flow** ||
|**Thu ngân**|**Hệ thống** |
|**Nhánh 1: Mở ca**|` `1.Khóa POS, bật form Mở ca.|
|2\.Nhập tiền lẻ đầu ca và Xác nhận.|4\. Mở khóa giao diện bán hàng.|
|<p>**Nhánh 2 đóng ca:**</p><p>1\.Bấm "Đóng ca".</p>|2\.Báo tổng doanh thu tiền mặt mong đợi.|
|<p>3\.Nhập số tiền thực tế đếm được.</p><p></p>|4\.Đối soát thừa/thiếu, in phiếu bàn giao và tự động đăng xuất.|
|**Alternative flow** ||
|**A1. Chưa mở ca:** **[Thu ngân]** tắt pop-up, **[Hệ thống]** chặn mọi nút thanh toán. ||
|**Exception** ||
|||
##
##### <a name="_rnf39e8pp8xc"></a><a name="_3axmac2mkun6"></a>**UC12:Mở ca / Đóng ca (Quản lý két tiền)**

|**Xác thực giao dịch (Giao tiếp qua API)**||
| :- | :- |
|**Tiền điều kiện** |Đăng nhập phần mềm POS|
|**Hậu điều kiện** |Dòng tiền được lưu trữ đối soát cho Quản lý.|
|**Actor chính** |Thu ngân|
|**Actor phụ** ||
|**Basic flow** ||
|**Thu ngân**|**Hệ thống** |
|**Nhánh 1: Mở ca**|` `1.Khóa POS, bật form Mở ca.|
|2\.Nhập tiền lẻ đầu ca và Xác nhận.|4\. Mở khóa giao diện bán hàng.|
|<p>**Nhánh 2 đóng ca:**</p><p>1\.Bấm "Đóng ca".</p>|2\.Báo tổng doanh thu tiền mặt mong đợi.|
|<p>3\.Nhập số tiền thực tế đếm được.</p><p></p>|4\.Đối soát thừa/thiếu, in phiếu bàn giao và tự động đăng xuất.|
|**Alternative flow** ||
|**A1. Chưa mở ca:** **[Thu ngân]** tắt pop-up, **[Hệ thống]** chặn mọi nút thanh toán. ||
|**Exception** ||
|||
##
##### <a name="_wqpzgx8qpml3"></a><a name="_8j4aglxue2i"></a>**UC12:Mở ca / Đóng ca (Quản lý két tiền)**

|**Xác thực giao dịch (Giao tiếp qua API)**||
| :- | :- |
|**Tiền điều kiện** |Đăng nhập phần mềm POS|
|**Hậu điều kiện** |Dòng tiền được lưu trữ đối soát cho Quản lý.|
|**Actor chính** |Thu ngân|
|**Actor phụ** ||
|**Basic flow** ||
|**Thu ngân**|**Hệ thống** |
|**Nhánh 1: Mở ca**|` `1.Khóa POS, bật form Mở ca.|
|2\.Nhập tiền lẻ đầu ca và Xác nhận.|4\. Mở khóa giao diện bán hàng.|
|<p>**Nhánh 2 đóng ca:**</p><p>1\.Bấm "Đóng ca".</p>|2\.Báo tổng doanh thu tiền mặt mong đợi.|
|<p>3\.Nhập số tiền thực tế đếm được.</p><p></p>|4\.Đối soát thừa/thiếu, in phiếu bàn giao và tự động đăng xuất.|
|**Alternative flow** ||
|**A1. Chưa mở ca:** **[Thu ngân]** tắt pop-up, **[Hệ thống]** chặn mọi nút thanh toán. ||
|**Exception** ||
|||
##
##### <a name="_ltof9wduvuiz"></a><a name="_dw5psimm3mvg"></a>**UC13:Xác nhận thanh toán & In Bill**

|**Xác nhận thanh toán & In Bill**||
| :- | :- |
|**Tiền điều kiện** |Đã mở ca và có yêu cầu thanh toán.|
|**Hậu điều kiện** |Hóa đơn đóng, bàn dọn trống, két cập nhật.|
|**Actor chính** |Thu ngân|
|**Actor phụ** ||
|**Basic flow** ||
|**Thu ngân**|**Hệ thống** |
||1\.Phát chuông và hiện thẻ "Yêu cầu thanh toán bàn X".|
|2\.Mở chi tiết bill.||
|3\.Khách trả tiền mặt, nhập số tiền khách đưa.|4\. Tính Tiền thừa.|
|<p>5\.Thối tiền và nhấn "Hoàn tất".</p><p></p>|6\.Lưu doanh thu ca và tự động in Bill giấy.|
|**Alternative flow** ||
|<p>**A1. Trả QR:** **[Thu ngân]** chờ tiền vào tài khoản rồi nhấn Hoàn tất. **[Hệ thống]** không cộng vào két tiền mặt.</p><p>**A2. Tách Bill:** **[Thu ngân]** chọn Tách bill, **[Hệ thống]** chia thành 2 bill riêng biệt để tính tiền lần lượt. |</p>||
|**Exception** ||
|||
##
##### <a name="_p35v5opqjlqi"></a><a name="_j1vt1lx08d4g"></a>**UC14:Cập nhật trạng thái món (Realtime)**

|<h5><a name="_kfrppkltez1s"></a>**Cập nhật trạng thái món (Realtime)**</h5>||
| :- | :- |
|**Tiền điều kiện** |Đơn hàng đẩy xuống Bếp thành công. |
|**Hậu điều kiện** |Trạng thái món cập nhật xuyên suốt các phân hệ|
|**Actor chính** |Pha chế|
|**Actor phụ** ||
|**Basic flow** ||
|**Pha chế**|**Hệ thống** |
||<p>` `1.Hiện thẻ món mới lên KDS kèm ghi chú và phát chuông.</p><p></p>|
|2\.Chạm vào thẻ 1 lần.|3\. Đổi thẻ sang màu Vàng (Đang làm).|
|4\.Làm xong, chạm lần 2.|5\.Đổi thẻ sang màu Xanh (Đã xong), ẩn khỏi KDS và gửi thông báo về App Phục vụ.|
|**Alternative flow** ||
|**A1. Đơn ưu tiên:** **[Hệ thống]** tự động gắn cờ đỏ và đẩy món cần làm lại lên đầu danh sách (Phá vỡ quy tắc FIFO). ||
|**Exception** ||
|||
##
##### <a name="_83xpqju48hzb"></a><a name="_mybhehmhcg7v"></a>**UC15:Kiểm kê & Gọi nguyên liệu**

|<h5><a name="_uvi4b7wirqq2"></a>**Kiểm kê & Gọi nguyên liệu**</h5>||
| :- | :- |
|**Tiền điều kiện** |Cuối ca làm việc.|
|**Hậu điều kiện** |Phiếu yêu cầu chờ phê duyệt|
|**Actor chính** |Pha chế|
|**Actor phụ** ||
|**Basic flow** ||
|**Pha chế**|**Hệ thống** |
|1\.Mở form Kiểm kê trên KDS.|` `2.Hệ thống hiển thị form kiểm kê|
|3\.Nhập số lượng tồn thực tế của nguyên liệu.|4\. Hệ thống lưu lại số lượng, ngày giờ kiểm kê, người gửi.|
|5\.Nhấn "Tạo phiếu yêu cầu".|6\.Hệ thống hiển thị phiếu yêu cầu gọi nguyên liệu|
|<p>7\.Nhập số lượng cần mua thêm và Gửi duyệt.</p><p></p>|8\.Tạo phiếu "Chờ xử lý" đẩy lên Dashboard Quản lý. |
|**Alternative flow** ||
|**A1. Thu hồi phiếu:** **[Pha chế]** bấm Hủy phiếu khi gõ sai, **[Hệ thống]** thu hồi nếu Quản lý chưa duyệt. ||
|**Exception** ||
|||
##
##### <a name="_7pzreayhlk3a"></a><a name="_xk7b8y4ieow9"></a>**UC16:Đăng nhập Nhân sự**

|<h5><a name="_6dd6yz15pcx7"></a>**Đăng nhập Nhân sự**</h5>||
| :- | :- |
|**Tiền điều kiện** |Được cấp tài khoản nội bộ|
|**Hậu điều kiện** |Phiên làm việc nhân sự khởi tạo|
|**Actor chính** |Tất cả nhân viên, Quản lý|
|**Actor phụ** ||
|**Basic flow** ||
|**Nhân viên**|**Hệ thống** |
|1\.Mở link nội bộ, nhập ID và Mật khẩu.|2\.Đối chiếu CSDL.|
|<p>3\.Phân tích trường Vai trò (Role).</p><p></p>|4\. Điều hướng chính xác vào màn hình (Admin, POS, KDS, Phục vụ). |
|**Alternative flow** ||
|- **A1. Khóa tài khoản:** **[Hệ thống]** báo lỗi "Tài khoản ngưng hoạt động" và chặn đăng nhập. ||
|**Exception** ||
|||
##
##### <a name="_86oetobrd79n"></a><a name="_iok2say9zd9p"></a>**UC17:Quản lý Nhân sự & Phân quyền**

|<h5><a name="_yws1tz88vwcu"></a>**Quản lý Nhân sự & Phân quyền**</h5>||
| :- | :- |
|**Tiền điều kiện** |Đăng nhập quyền Admin.|
|**Hậu điều kiện** |Danh sách nhân sự được cập nhật an toàn.|
|**Actor chính** |Quản lý|
|**Actor phụ** ||
|**Basic flow** ||
|**Quản lý**|**Hệ thống** |
|1\.Vào "Quản lý Nhân sự" -> "Thêm mới"**.**|2\. Hiển thị form thêm nhân sự|
|3\.Nhập thông tin, tạo mật khẩu và chọn Vai trò.||
|4\. Nhấn lưu thông tin, .|5\.Mã hóa mật khẩu, lưu CSDL và cấp quyền tương ứng.|
|**Alternative flow** ||
|<p>**A1. Nghỉ việc:** **[Quản lý]** gạt trạng thái "Ngưng hoạt động", **[Hệ thống]** thu hồi toàn bộ quyền truy cập của nhân viên đó. </p><p>A2:Quản lý có thể sửa lại thông tin cá nhân của tất cả tài khoản.</p>||
|**Exception** ||
|||
##
##### <a name="_xu1v57u6s8cs"></a><a name="_ogx4hz249yh5"></a>**UC18:Quản lý Thực đơn & Sơ đồ bàn**

|<h5><a name="_664ukl80kyoo"></a>**Quản lý Thực đơn & Sơ đồ bàn**</h5>||
| :- | :- |
|**Tiền điều kiện** |Đăng nhập quyền Admin.|
|**Hậu điều kiện** |` `Dữ liệu Menu/Bàn đồng bộ toàn hệ thống.|
|**Actor chính** |Quản lý|
|**Actor phụ** ||
|**Basic flow** ||
|**Quản lý**|**Hệ thống** |
|1\.Vào "Danh mục Món", nhấn Thêm mới, nhập thông tin và Lưu.|2\. Cập nhật món lên App Khách hàng Real-time.|
|||
|||
|**Alternative flow** ||
|- **A1. Tạm ẩn món:** **[Quản lý]** gạt nút tạm ẩn, **[Hệ thống]** xóa hiển thị món đó trên App khách.||
|**Exception** ||
|<p></p><p></p>||
##
##### <a name="_1kzihxggmk4f"></a><a name="_jw66en9023qs"></a>**UC19:Duyệt yêu cầu & Quản lý Kho**

|<h5><a name="_4ohjrrulja59"></a>**Duyệt yêu cầu & Quản lý Kho**</h5>||
| :- | :- |
|**Tiền điều kiện** |Đăng nhập quyền Admin.|
|**Hậu điều kiện** |Kho được kiểm soát chặt chẽ.|
|**Actor chính** |Quản lý|
|**Actor phụ** ||
|**Basic flow** ||
|**Quản lý**|**Hệ thống** |
|1\.Xem thông báo "Yêu cầu Kho" từ Pha chế.|2\. Hiện thị yêu cầu, thông tin chi tiết phiếu yêu cầu|
|3\.Nhấn "Phê duyệt".|<p>4\.Đổi trạng thái phiếu, báo lại cho Pha chế.</p><p></p>|
|5\.Hàng giao tới, vào "Nhập kho"|6\. Hiển thị form nhập kho|
|7\. Nhập số lượng và giá vốn, nhấn lưu|8\.Hệ thống cộng dồn kho, tính lại giá trị nhập cho đợt này, tính trung bình giá nguyên liệu từng loại.|
|**Alternative flow** ||
|**A1. Từ chối duyệt:** **[Quản lý]** nhấn Từ chối, **[Hệ thống]** bắt buộc nhập lý do hủy phiếu.||
|**Exception** ||
|||
##
##### <a name="_yajvnk3kwyl"></a><a name="_i16z9bxbepzc"></a>**UC20:Xem báo cáo thống kê**

|<h5><a name="_yzd0tvjmwxi6"></a>**Xem báo cáo thống kê**</h5>||
| :- | :- |
|**Tiền điều kiện** |Đăng nhập quyền Admin, Có dữ liệu bán hàng. |
|**Hậu điều kiện** |Báo cáo trích xuất thành công. |
|**Actor chính** |Quản lý|
|**Actor phụ** ||
|**Basic flow** ||
|**Quản lý**|**Hệ thống** |
|1\.Vào "Báo cáo Tổng quan", chọn mốc thời gian.|2\. Truy xuất CSDL, vẽ Biểu đồ đường (Doanh thu) và Biểu đồ tròn (Top món bán chạy).|
|3\.Nhấn "Xuất Excel".|4\.Tải file báo cáo về máy tính.|
|||
|**Alternative flow** ||
|<p>**A1. Trống dữ liệu:** **[Hệ thống]** báo lỗi "Không có giao dịch" nếu chọn ngày nghỉ.</p><p>A2:Quản lý chọn báo cáo tài chính, xem lại tổng doanh thu, tốn vốn nhập kho, lãi của tháng này, quản lý chọn xuất excel, hệ thống tải file về máy tính</p>||
|**Exception** ||
|||
##
##### <a name="_ior2j7ywmn7k"></a><a name="_tzmwa1cegusv"></a>**UC21:Quản lý Đánh giá dịch vụ**

|<h5><a name="_v3w39jouk6k"></a>**Quản lý Nhân sự & Phân quyền**</h5>||
| :- | :- |
|**Tiền điều kiện** |Có đánh giá mới từ khách. |
|**Hậu điều kiện** |Đánh giá chuyển trạng thái "Đã phản hồi"|
|**Actor chính** |Quản lý|
|**Actor phụ** ||
|**Basic flow** ||
|**Quản lý**|**Hệ thống** |
|1\.Mở "Đánh giá dịch vụ", chọn đọc bình luận 1-3 sao.|2\. Hiển thị thông tin chi tiết đánh giá và phần nhập phản hồi bên dưới|
|3\.Nhấn "Phản hồi", nhập lời xin lỗi và Gửi.|4\.Đẩy thông báo phản hồi của Quản lý về App khách hàng.|
|**Alternative flow** ||
|**A1. Ẩn bình luận:** **[Quản lý]** thấy từ ngữ thô tục, bấm "Ẩn". **[Hệ thống]** không cho hiển thị công khai bình luận này nữa. ||
|**Exception** ||
|||
##
#####

|<h5></h5>||
| :- | :- |
|||
|||
|||
|||
|||
|||
|||
|||
|||
|||
|||
|||
|||
##
## <a name="_mgtrokfw5i5z"></a><a name="_yyl6541u1y8i"></a><a name="_nnpjri6q01th"></a><a name="_y60gng8eksv7"></a>**2. Mô hình hóa yêu cầu cấu trúc của hệ thống** 
#### 2\.1 Xác định các khái niệm trong hệ thống
#### <a name="_d2d5pavxhsiw"></a>**3.1. Phân hệ Người dùng & Nhân sự (Users & HR)**
**Bảng 1: KHÁCH HÀNG (Customers)**

Quản lý chi tiết hồ sơ khách hàng để phục vụ Marketing, gửi mã sinh nhật và tích điểm.

|**Tên trường (Field)**|**Kiểu (Type)**|**Ràng buộc (Key)**|**Mô tả chi tiết**|
| :- | :- | :- | :- |
|**Customer\_ID**|INT|**PK**, Auto|Mã khách hàng|
|Phone|VARCHAR(15)|Unique, Not Null|Số điện thoại (Dùng đăng nhập)|
|Password|VARCHAR(255)|Not Null|Mật khẩu mã hóa (Hash)|
|FullName|NVARCHAR(100)|Not Null|Họ và tên|
|Email|VARCHAR(100)|Null|Địa chỉ Email (Gửi hóa đơn/khuyến mãi)|
|DOB|DATE|Null|Ngày sinh (Phục vụ tặng quà sinh nhật)|
|Gender|VARCHAR(10)|Null|Giới tính (Nam, Nữ, Khác)|
|Avatar\_URL|VARCHAR(255)|Null|Link ảnh đại diện của khách|
|Points|INT|Default 0|Điểm tích lũy hiện tại|
|Rank\_Tier|VARCHAR(20)|Default 'Dong'|Hạng thành viên (Đồng, Bạc, Vàng, Kim Cương)|
|Created\_At|DATETIME|Default Now()|Ngày đăng ký tài khoản|
|Last\_Login|DATETIME|Null|Lần đăng nhập cuối cùng|

**Bảng 2: NHÂN VIÊN (Staffs)**

Lưu trữ hồ sơ nhân sự chi tiết để chấm công, tính lương và phân quyền hệ thống.

|**Tên trường (Field)**|**Kiểu (Type)**|**Ràng buộc (Key)**|**Mô tả chi tiết**|
| :- | :- | :- | :- |
|**Staff\_ID**|INT|**PK**, Auto|Mã nhân viên|
|Username|VARCHAR(50)|Unique, Not Null|Tên đăng nhập|
|Password|VARCHAR(255)|Not Null|Mật khẩu mã hóa|
|FullName|NVARCHAR(100)|Not Null|Họ và tên nhân viên|
|Phone|VARCHAR(15)|Unique, Not Null|Số điện thoại liên hệ|
|CCCD|VARCHAR(20)|Unique, Not Null|Số Căn cước công dân|
|Address|NVARCHAR(255)|Null|Địa chỉ thường trú|
|DOB|DATE|Null|Ngày tháng năm sinh|
|Role|VARCHAR(20)|Not Null|Vai trò (Admin, Cashier, Kitchen, Waiter)|
|Base\_Salary|DECIMAL(10,2)|Not Null|Mức lương cơ bản (Theo ca hoặc tháng)|
|Hire\_Date|DATE|Not Null|Ngày bắt đầu vào làm|
|Status|VARCHAR(20)|Default 'Active'|Trạng thái (Active - Đang làm, Inactive - Nghỉ việc)|

-----
#### <a name="_8mhsgsbf0hfw"></a>**3.2. Phân hệ Không gian & Thực đơn (Facilities & Menu)**
**Bảng 3: BÀN (Tables)**

|**Tên trường (Field)**|**Kiểu (Type)**|**Ràng buộc (Key)**|**Mô tả chi tiết**|
| :- | :- | :- | :- |
|**Table\_ID**|INT|**PK**, Auto|Mã bàn|
|Table\_Name|NVARCHAR(50)|Not Null|Tên bàn (VD: T1-01, T2-05)|
|Location|NVARCHAR(50)|Null|Khu vực (Tầng 1, Tầng 2, Ban công, Sân vườn)|
|Capacity|INT|Default 2|Sức chứa (Số ghế tối đa của bàn)|
|QR\_Code|VARCHAR(255)|Unique|Link URL mã hóa ra ảnh QR tĩnh|
|Status|VARCHAR(20)|Default 'Empty'|Trạng thái (Empty, Occupied, Waiting\_Pay, Cleaning)|

**Bảng 4: DANH MỤC (Categories) & Bảng 5: MÓN ĂN (Products)**

|**Tên bảng**|**Tên trường**|**Kiểu dữ liệu**|**Ràng buộc**|**Mô tả chi tiết**|
| :- | :- | :- | :- | :- |
|**Categories**|**Category\_ID**|INT|**PK**, Auto|Mã danh mục|
||Category\_Name|NVARCHAR(100)|Not Null|Tên danh mục (Cà phê, Trà sữa...)|
||Sort\_Order|INT|Default 1|Thứ tự hiển thị trên Menu (1,2,3...)|
|**Products**|**Product\_ID**|INT|**PK**, Auto|Mã món ăn/thức uống|
||Category\_ID|INT|**FK**|Thuộc Danh mục nào|
||SKU|VARCHAR(20)|Unique|Mã vạch/Mã định danh nội bộ món|
||Product\_Name|NVARCHAR(100)|Not Null|Tên món|
||Cost\_Price|DECIMAL(10,2)|Null|Giá vốn (Để tính lợi nhuận gộp)|
||Sell\_Price|DECIMAL(10,2)|Not Null|Giá bán niêm yết|
||Image\_URL|VARCHAR(255)|Null|Link ảnh hiển thị trên Menu|
||Is\_Active|BOOLEAN|Default True|True: Đang bán, False: Tạm ẩn|
||Out\_Of\_Stock|BOOLEAN|Default False|True: Hết nguyên liệu làm món này|

-----
#### <a name="_7g55rbu010k5"></a>**3.3. Phân hệ Giao dịch & Bếp KDS (Core System)**
**Bảng 6: CA LÀM VIỆC (Shifts)**

|**Tên trường (Field)**|**Kiểu dữ liệu**|**Ràng buộc (Key)**|**Mô tả chi tiết**|
| :- | :- | :- | :- |
|**Shift\_ID**|INT|**PK**, Auto|Mã ca làm việc|
|Staff\_ID|INT|**FK**|Thu ngân trực ca (Staff\_ID)|
|Start\_Time|DATETIME|Not Null|Giờ mở ca|
|End\_Time|DATETIME|Null|Giờ đóng ca|
|Starting\_Cash|DECIMAL(10,2)|Not Null|Tiền lẻ ban đầu trong két|
|Expected\_Cash|DECIMAL(10,2)|Null|Tiền mong đợi (Máy tự tính: Đầu ca + Tiền mặt thu được)|
|Actual\_Cash|DECIMAL(10,2)|Null|Tiền mặt đếm thực tế khi đóng ca|
|Difference|DECIMAL(10,2)|Null|Độ chênh lệch (Actual - Expected). Âm là thụt két.|
|Note|NVARCHAR(255)|Null|Ghi chú giải trình chênh lệch|

**Bảng 7: HÓA ĐƠN TỔNG (Orders)**

Lưu trữ dữ liệu siêu chi tiết để kế toán dễ dàng đối soát.

|**Tên trường (Field)**|**Kiểu dữ liệu**|**Ràng buộc (Key)**|**Mô tả chi tiết**|
| :- | :- | :- | :- |
|**Order\_ID**|INT|**PK**, Auto|Mã hóa đơn tổng|
|Table\_ID|INT|**FK**, Null|Bàn gọi (Null nếu là Takeaway)|
|Customer\_ID|INT|**FK**, Null|Khách hàng thành viên (Null nếu vãng lai)|
|Staff\_ID|INT|**FK**, Null|NV nào order hộ (Null nếu khách tự quét)|
|Session\_ID|VARCHAR(50)|Null|Mã phiên (Xử lý tách bill Takeaway)|
|Order\_Type|VARCHAR(20)|Not Null|Dine\_in (Tại bàn) hoặc Takeaway (Mang về)|
|Sub\_Total|DECIMAL(10,2)|Not Null|Tổng tiền hàng (Chưa giảm giá)|
|Discount\_Amt|DECIMAL(10,2)|Default 0|Số tiền được giảm (Do dùng điểm/Voucher)|
|Total\_Amount|DECIMAL(10,2)|Not Null|Tổng tiền cuối cùng phải trả|
|Status|VARCHAR(20)|Default 'Pending'|Trạng thái (Pending\_Grace, Confirmed, Paid, Cancelled)|
|Cancel\_Reason|NVARCHAR(255)|Null|Lý do hủy đơn (nếu trạng thái là Cancelled)|
|Created\_At|DATETIME|Default Now()|Giờ chốt đơn|

**Bảng 8: CHI TIẾT MÓN (Order\_Details)**

Gắn cứng giá bán tại thời điểm mua (Unit\_Price) để sau này lỡ quán tăng giá món thì báo cáo doanh thu cũ không bị sai.

|**Tên trường (Field)**|**Kiểu dữ liệu**|**Ràng buộc (Key)**|**Mô tả chi tiết**|
| :- | :- | :- | :- |
|**Detail\_ID**|INT|**PK**, Auto|Mã chi tiết|
|Order\_ID|INT|**FK**|Thuộc hóa đơn nào|
|Product\_ID|INT|**FK**|Mã món uống|
|Quantity|INT|Default 1|Số lượng|
|Unit\_Price|DECIMAL(10,2)|Not Null|Giá bán tại thời điểm đặt (Chốt cứng)|
|Custom\_Notes|NVARCHAR(255)|Null|Ghi chú (Ít đá, 50% đường...)|
|KDS\_Status|VARCHAR(20)|Default 'Waiting'|Trạng thái Bếp (Waiting, Cooking, Ready)|

**Bảng 9: THANH TOÁN (Payments)**

|**Tên trường (Field)**|**Kiểu dữ liệu**|**Ràng buộc (Key)**|**Mô tả chi tiết**|
| :- | :- | :- | :- |
|**Payment\_ID**|INT|**PK**, Auto|Mã giao dịch thanh toán|
|Order\_ID|INT|**FK**|Thanh toán cho Hóa đơn nào|
|Shift\_ID|INT|**FK**, Null|Thuộc Ca làm việc nào|
|Method|VARCHAR(20)|Not Null|Phương thức (Cash, Transfer\_QR, Points)|
|Amount|DECIMAL(10,2)|Not Null|Số tiền giao dịch|
|Trans\_Code|VARCHAR(100)|Null|Mã giao dịch ngân hàng (Nếu chuyển khoản)|
|Payment\_Time|DATETIME|Default Now()|Thời gian thanh toán thành công|

-----
#### <a name="_o3b0iqrw2sdm"></a>**3.4. Phân hệ CSKH & Kho bãi (Inventory & Reviews)**
**Bảng 10: ĐÁNH GIÁ (Reviews)**

|**Tên trường**|**Kiểu dữ liệu**|**Ràng buộc**|**Mô tả chi tiết**|
| :- | :- | :- | :- |
|**Review\_ID**|INT|**PK**, Auto|Mã đánh giá|
|Order\_ID|INT|**FK**|Đánh giá bill nào|
|Customer\_ID|INT|**FK**|Ai đánh giá|
|Rating|INT|Ckeck (1-5)|Điểm sao|
|Comment|NVARCHAR(500)|Null|Lời bình luận của khách|
|Admin\_Reply|NVARCHAR(500)|Null|Lời phản hồi của Quản lý|
|Reply\_By|INT|**FK**, Null|Quản lý nào đã trả lời (Staff\_ID)|
|Created\_At|DATETIME|Default Now()|Ngày gửi đánh giá|

**Bảng 11: KHO NGUYÊN VẬT LIỆU (Inventory) & Bảng 12: PHIẾU YÊU CẦU (Requests)**

|**Tên bảng**|**Tên trường**|**Kiểu dữ liệu**|**Ràng buộc**|**Mô tả chi tiết**|
| :- | :- | :- | :- | :- |
|**Inventory**|**Item\_ID**|INT|**PK**, Auto|Mã nguyên liệu (Cà phê, Sữa...)|
||Item\_Name|NVARCHAR(100)|Not Null|Tên nguyên liệu|
||SKU\_Code|VARCHAR(50)|Unique|Mã vạch hàng hóa|
||Unit|NVARCHAR(20)|Not Null|Đơn vị tính (Kg, Lít, Cái)|
||Stock\_Qty|DECIMAL(10,2)|Default 0|Số lượng tồn kho hiện tại|
||Min\_Level|DECIMAL(10,2)|Not Null|Mức tồn kho tối thiểu (Để cảnh báo đỏ)|
||Supplier|NVARCHAR(100)|Null|Tên nhà cung cấp|
|**Requests**|**Request\_ID**|INT|**PK**, Auto|Mã phiếu yêu cầu|
||Staff\_ID|INT|**FK**|NV Pha chế lập phiếu|
||Item\_ID|INT|**FK**|Xin mua nguyên liệu nào|
||Request\_Qty|DECIMAL(10,2)|Not Null|Số lượng xin mua|
||Status|VARCHAR(20)|Default 'Pending'|Trạng thái (Pending, Approved, Rejected)|
||Approved\_By|INT|**FK**, Null|Quản lý nào đã duyệt (Staff\_ID)|
||Note|NVARCHAR(255)|Null|<p></p><p></p>|
![](Aspose.Words.14e19912-5703-4233-ae09-3c8f5efd861f.002.png)
#### 
#### 2\.2 Vẽ sơ đồ domain** 

#### 2\.3 Vẽ sequence diagram** 

# **Chương 3: Thiết kế hệ thống** 
## **1. Giao diện** 




#####







## **2. CSDL*** 

##### **Bảng 1:** 
##### **Bảng 2: Bảng 3: requests – Quản lý yêu cầu nghỉ phép hoặc tăng ca** 

|**Tên cột** |**Kiểu dữ liệu** |<p>**Ràng** </p><p>**buộc** </p>|<p>**Giá trị** </p><p>**mặc định** </p>|<p>**Cho phép** </p><p>**NULL** </p>|<p>**Diễn giải ý** </p><p>**nghĩa/giá trị** </p>|
| :- | :- | :- | :- | :- | :- |
|||<p></p><p></p>| || |
| ||<p></p><p></p>| |||
|||| |||
|||||||
|||||||
|||||||
|||||||
|||||||
|||||||
|||||||
|||||||
|||||||
|||||||
|||||||
|||||||
|||||||
|||||||
##### **Bảng 4: Chương 4: Hiện thực bài toán** 
## **1. Công cụ sử dụng** 
## **2. Cài đặt hệ thống** 
# **Chương 5: Đánh giá hệ thống** 

||||||||
| :- | :- | :- | :- | :- | :- | :- |
||||||||
||||||||


