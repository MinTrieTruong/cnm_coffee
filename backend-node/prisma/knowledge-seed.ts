/**
 * Kho tri thức mẫu "TD Coffee – Chung" (dùng chung cả chuỗi) cho AI tư vấn:
 * 3 tài liệu văn bản (thương hiệu, giao hàng & đổi trả, thành viên tích điểm) + 1 bảng Hỏi–Đáp 15 câu.
 * Phí ship, điểm thưởng, hạng thành viên viết theo cấu hình đang có (lib/delivery.ts, StoreSettings, lib/rank.ts).
 * Giá món, món còn / hết, giờ mở cửa từng chi nhánh KHÔNG nằm ở đây — AI tra từ CSDL.
 *
 * Chạy: npm run db:knowledge   (có GEMINI_API_KEY thì tạo luôn embedding; chạy lại không tạo trùng)
 */
import "dotenv/config";
import { prisma } from "../src/db.js";
import { hasGeminiKey } from "../src/ai/gemini.js";
import { processDocument } from "../src/ai/knowledge/ingest.js";
import { MAX_DELIVERY_KM } from "../src/lib/delivery.js";

const KB_NAME = "TD Coffee – Chung";
const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

async function main() {
  const owner = await prisma.staff.findFirst({ where: { role: "Owner", status: "Active" }, select: { id: true } });
  if (!owner) throw new Error("Chưa có tài khoản Chủ chuỗi (Owner) — chạy npm run db:owner trước.");
  const s = await prisma.storeSettings.findUnique({ where: { id: 1 } });
  const earnEvery = s?.pointEarnEveryVnd ?? 1000;
  const earnEach = s?.pointEarnEach ?? 100;
  const pointValue = s?.pointValueVnd ?? 1;
  const cancelMin = s?.cancelWindowMinutes ?? 5;
  const company = s?.companyName ?? "TD Coffee";

  const docs: { title: string; sourceType: "TEXT" | "FAQ"; rawText: string }[] = [
    {
      title: "Giới thiệu thương hiệu",
      sourceType: "TEXT",
      rawText: `# Câu chuyện ${company}

${company} bắt đầu từ một quầy cà phê phin nhỏ, với mong muốn giữ lại hương vị cà phê Việt pha chậm, đậm và thơm. Đến nay ${company} là chuỗi quán phục vụ cà phê, trà, đá xay và bánh nướng mỗi sáng, có chỗ ngồi tại quán và nhận đặt mang về, giao hàng tận nơi.

## Hạt cà phê

Quán dùng hạt Robusta trồng ở Buôn Ma Thuột (Đắk Lắk) phối với Arabica Cầu Đất (Lâm Đồng). Robusta cho vị đậm, hậu đắng và nhiều caffeine; Arabica cho mùi thơm trái cây và vị chua nhẹ. Hạt được rang mộc, không tẩm bơ hay hương liệu, rang theo mẻ nhỏ mỗi tuần để giữ độ tươi.

## Cách pha

Cà phê phin pha bằng phin nhôm với khoảng 25g cà phê, ủ 30 giây rồi châm nước sôi 92–96°C, nhỏ giọt trong 4–5 phút. Cà phê máy (espresso, latte, cappuccino) dùng máy pha áp suất 9 bar. Cold brew ủ lạnh 16–18 giờ nên vị êm, ít đắng và ít chua.

## Cam kết

Đồ uống pha theo công thức chuẩn ở mọi chi nhánh. Sữa tươi dùng loại thanh trùng, trà ủ mới mỗi ngày, bánh nướng trong ngày và không bán qua đêm. Khách có thể dặn thêm hoặc bớt đường, đá ở từng món khi gọi.`,
    },
    {
      title: "Chính sách giao hàng và đổi trả",
      sourceType: "TEXT",
      rawText: `# Chính sách giao hàng

## Phí giao hàng

Phí giao hàng tính theo khoảng cách từ chi nhánh tới địa chỉ nhận. Trong bán kính 3 km: miễn phí giao hàng. Xa hơn 3 km: ${vnd(15000)} cộng thêm ${vnd(5000)} cho mỗi km vượt quá 3 km (phần lẻ làm tròn lên 1 km). Ví dụ giao 5 km: ${vnd(15000)} + 2 × ${vnd(5000)} = ${vnd(25000)}.

Quán nhận giao trong bán kính tối đa ${MAX_DELIVERY_KM} km tính từ chi nhánh. Một số chương trình khuyến mãi có ưu đãi miễn phí giao hàng; điều kiện ghi rõ trên từng chương trình.

## Thanh toán đơn giao

Đơn giao hàng thanh toán online trước khi quán làm món (chuyển khoản / ví điện tử). Shipper không thu thêm tiền khi giao.

## Huỷ đơn

Sau khi thanh toán, khách tự huỷ đơn giao trong vòng ${cancelMin} phút khi quán chưa nhận đơn; tiền được hoàn 100% vào tài khoản điểm thành viên. Quán đã nhận đơn và bắt đầu làm món thì không huỷ được, khách liên hệ nhân viên qua khung chat để được hỗ trợ.

## Đổi trả và khiếu nại

Món pha sai yêu cầu (sai món, sai size, sai lượng đường / đá đã dặn) hoặc có vấn đề về chất lượng: quán làm lại miễn phí. Khách báo trong vòng 30 phút sau khi nhận món, kèm ảnh món và mã đơn qua nút Khiếu nại trong khung chat trên web. Đơn giao bị đổ, vỡ trên đường: quán giao lại món mới hoặc hoàn tiền phần món bị hỏng.

Quán không đổi trả với lý do đổi ý sau khi món đã pha xong.`,
    },
    {
      title: "Chương trình thành viên tích điểm",
      sourceType: "TEXT",
      rawText: `# Chương trình thành viên

Khách đăng ký tài khoản trên web (bằng số điện thoại, hoặc đăng nhập Google / Facebook) để tích điểm và nhận ưu đãi.

## Tích điểm

Cứ mỗi ${vnd(earnEvery)} thanh toán, khách được cộng ${earnEach} điểm. Phí giao hàng không được tính điểm. Điểm được cộng khi đơn đã thanh toán xong.

## Dùng điểm

1 điểm có giá trị ${vnd(pointValue)} khi trừ vào hoá đơn. Khách chọn dùng điểm khi thanh toán trên web hoặc báo thu ngân tại quầy.

## Hạng thành viên

Hạng tính theo tổng chi tiêu tích luỹ:
- Đồng: mới đăng ký.
- Bạc: từ ${vnd(5_000_000)}.
- Vàng: từ ${vnd(20_000_000)}.
- Kim cương: từ ${vnd(50_000_000)}.

Hạng càng cao càng có nhiều voucher và quà tặng riêng trong các dịp lễ và sinh nhật.`,
    },
    {
      title: "Câu hỏi thường gặp",
      sourceType: "FAQ",
      rawText: JSON.stringify([
        { q: "Quán có wifi không?", a: "Có, mọi chi nhánh đều có wifi miễn phí. Khách hỏi nhân viên tại quầy để lấy mật khẩu." },
        { q: "Có chỗ đậu xe máy không?", a: "Có, các chi nhánh đều có chỗ giữ xe máy miễn phí cho khách." },
        { q: "Có thể đặt bàn trước không?", a: "Có, khách nhắn trong khung chat trên web hoặc gọi điện chi nhánh, báo số người và giờ đến. Nhóm từ 10 người nên đặt trước ít nhất 1 ngày." },
        { q: "Quán có nhận tổ chức tiệc, sự kiện không?", a: "Có nhận tiệc sinh nhật nhỏ và họp nhóm. Khách nhắn trong khung chat để nhân viên tư vấn chỗ ngồi và thực đơn." },
        { q: "Cold brew khác cà phê phin thế nào?", a: "Cold brew ủ lạnh 16–18 giờ nên vị êm, ít đắng và ít chua hơn; cà phê phin pha nóng nhỏ giọt nên đậm và thơm mùi rang hơn." },
        { q: "Món nào ít caffeine?", a: "Các món trà trái cây, sữa chua và đá xay không có cà phê chứa ít hoặc không có caffeine. Arabica cũng ít caffeine hơn Robusta." },
        { q: "Có thể chọn ít đường, ít đá không?", a: "Được, khách chọn lượng đường và đá khi gọi món trên web hoặc dặn nhân viên tại quầy." },
        { q: "Quán có đồ uống cho người ăn chay không?", a: "Có, khách có thể đổi sữa bò sang sữa hạt ở các món có hỗ trợ; trà trái cây không dùng sữa." },
        { q: "Thanh toán bằng những cách nào?", a: "Tại quầy: tiền mặt, chuyển khoản, ví điện tử. Đặt online: thanh toán chuyển khoản hoặc ví điện tử trước khi quán làm món." },
        { q: "Có xuất hoá đơn VAT không?", a: "Có, khách báo thông tin công ty khi thanh toán tại quầy hoặc nhắn nhân viên trong khung chat kèm mã đơn." },
        { q: "Giao hàng mất bao lâu?", a: "Thường 20–40 phút tuỳ khoảng cách và giờ cao điểm; khách theo dõi vị trí shipper ngay trên trang đơn hàng." },
        { q: "Làm sao đổi điểm thưởng?", a: "Khi thanh toán trên web, bật dùng điểm để trừ vào hoá đơn; tại quầy, báo số điện thoại thành viên cho thu ngân." },
        { q: "Mua mang về có được tích điểm không?", a: "Được, mọi đơn đã thanh toán của khách có tài khoản đều được tích điểm, kể cả mang về và giao hàng." },
        { q: "Quán có mang thú cưng vào được không?", a: "Được ở khu vực ngoài trời của các chi nhánh có sân; khu máy lạnh không nhận thú cưng." },
        { q: "Có bán hạt cà phê để pha ở nhà không?", a: "Có, quán bán hạt rang xay và hạt nguyên gói 250g, 500g; khách hỏi nhân viên tại quầy hoặc trong khung chat." },
      ]),
    },
  ];

  let kb = await prisma.knowledgeBase.findFirst({ where: { name: KB_NAME, storeId: null } });
  kb ??= await prisma.knowledgeBase.create({
    data: { name: KB_NAME, description: "Thương hiệu, chính sách giao hàng / đổi trả, thành viên tích điểm, câu hỏi thường gặp", createdById: owner.id },
  });

  const ids: number[] = [];
  for (const d of docs) {
    const exists = await prisma.knowledgeDocument.findFirst({ where: { knowledgeBaseId: kb.id, title: d.title }, select: { id: true } });
    if (exists) {
      console.log(`- Bỏ qua (đã có): ${d.title}`);
      continue;
    }
    const doc = await prisma.knowledgeDocument.create({ data: { ...d, knowledgeBaseId: kb.id, createdById: owner.id, status: "PENDING" } });
    ids.push(doc.id);
  }

  console.log(hasGeminiKey() ? "Đang cắt đoạn + tạo embedding…" : "Chưa có GEMINI_API_KEY — chỉ cắt đoạn (tìm được theo từ khóa).");
  for (const id of ids) {
    const t0 = Date.now();
    await processDocument(id);
    const d = await prisma.knowledgeDocument.findUniqueOrThrow({ where: { id } });
    console.log(`- ${d.title}: ${d.status}, ${d.chunkCount} đoạn, ${d.charCount} ký tự, ${Date.now() - t0} ms${d.errorMessage ? ` — ${d.errorMessage}` : ""}`);
  }
  console.log(`Xong: kho #${kb.id} "${KB_NAME}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
