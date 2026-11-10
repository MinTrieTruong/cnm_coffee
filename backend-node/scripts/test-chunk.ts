/**
 * Kiểm thử hàm cắt đoạn + tìm từ khóa của kho tri thức (không cần CSDL / Gemini).
 * Chạy: npx tsx scripts/test-chunk.ts
 */
import assert from "node:assert/strict";
import { chunkText, headingOf, splitSentences } from "../src/ai/knowledge/chunk.js";
import { cleanText, docxHtmlToText } from "../src/ai/knowledge/extract.js";
import { foldVi, tokenize } from "../src/ai/knowledge/text.js";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("chunkText");

test("nhận diện tiêu đề Markdown / IN HOA / Điều / đánh số", () => {
  assert.deepEqual(headingOf("## Chính sách giao hàng"), { level: 2, text: "Chính sách giao hàng" });
  assert.equal(headingOf("CHÍNH SÁCH ĐỔI TRẢ")?.level, 1);
  assert.equal(headingOf("Điều 3. Phí giao hàng")?.level, 1);
  assert.equal(headingOf("2.1 Phí giao hàng")?.level, 2);
  assert.equal(headingOf("Quán mở cửa từ 7 giờ sáng."), null);
  assert.equal(headingOf("1. Cho đá vào ly", false), null);
});

test("tách câu tiếng Việt, không tách ở số thập phân", () => {
  assert.deepEqual(splitSentences("Phí ship 15.000đ. Đơn trên 200k miễn phí! Áp dụng 3km."), ["Phí ship 15.000đ.", "Đơn trên 200k miễn phí!", "Áp dụng 3km."]);
});

test("mỗi mục thành đoạn riêng, giữ tiêu đề lồng nhau", () => {
  const text = "# Chính sách\n\n## Giao hàng\n\nPhí giao 15.000đ trong 3km.\n\n## Đổi trả\n\nĐổi trong 30 phút nếu pha sai.";
  const c = chunkText(text);
  assert.equal(c.length, 2);
  assert.equal(c[0].heading, "Chính sách › Giao hàng");
  assert.equal(c[1].heading, "Chính sách › Đổi trả");
  assert.match(c[1].content, /30 phút/);
});

test("danh sách đánh số không bị coi là tiêu đề (không mất nội dung)", () => {
  const text = "## Cách pha cà phê sữa đá\n\n1. Cho 2 muỗng sữa đặc vào ly\n2. Pha phin 25g cà phê\n3. Khuấy đều rồi cho đá";
  const c = chunkText(text);
  assert.equal(c.length, 1);
  assert.match(c[0].content, /1\. Cho 2 muỗng/);
  assert.match(c[0].content, /3\. Khuấy đều/);
});

test("văn bản dài: đoạn ≤ max, không cắt giữa câu, có chồng lấn", () => {
  const sentence = (i: number) => `Câu số ${i} nói về hạt cà phê Robusta trồng ở Buôn Ma Thuột, rang mộc vừa tới.`;
  const para = Array.from({ length: 60 }, (_, i) => sentence(i)).join(" ");
  const c = chunkText(`# Hạt cà phê\n\n${para}`, { target: 1000, max: 1400, overlap: 150 });
  assert.ok(c.length >= 3, `cần ≥ 3 đoạn, có ${c.length}`);
  for (const x of c) {
    assert.ok(x.content.length <= 1400, `đoạn dài ${x.content.length}`);
    assert.match(x.content, /\.$/, "đoạn phải kết thúc trọn câu");
  }
  // Câu cuối của đoạn trước xuất hiện lại ở đầu đoạn sau
  const lastOfFirst = splitSentences(c[0].content).pop()!;
  assert.ok(c[1].content.startsWith(lastOfFirst), "thiếu phần chồng lấn");
});

test("đoạn văn ngắn liền nhau được gom tới ~target", () => {
  const paras = Array.from({ length: 30 }, (_, i) => `Đoạn ${i}: quán phục vụ đồ uống từ 7 giờ đến 22 giờ mỗi ngày.`).join("\n\n");
  const c = chunkText(paras);
  assert.ok(c.length < 30 && c.length >= 2, `gom chưa đúng: ${c.length} đoạn`);
  assert.ok(c.every((x) => x.content.length <= 1400));
});

console.log("cleanText / tìm từ khóa");

test("chuẩn hoá dấu tổ hợp (NFD từ PDF) về NFC, bỏ dòng số trang", () => {
  const nfd = "Cà phê sữa".normalize("NFD");
  assert.equal(cleanText(`${nfd}\n\n12\n\nTrang 3/10\nHết`), "Cà phê sữa\n\nHết");
});

test("DOCX: tiêu đề Word thành #, danh sách thành -, giải mã ký tự HTML", () => {
  const t = cleanText(docxHtmlToText("<h1>Giao hàng</h1><p>Phí &amp; thời gian</p><h2>Nội thành</h2><ul><li>Dưới 3km</li><li>Trên 3km</li></ul>"));
  assert.equal(t, "# Giao hàng\n\nPhí & thời gian\n\n## Nội thành\n\n- Dưới 3km\n- Trên 3km");
  assert.deepEqual(chunkText(t).map((c) => c.heading), ["Giao hàng", "Giao hàng › Nội thành"]);
});

test("bỏ dấu + cặp âm tiết cho BM25", () => {
  assert.equal(foldVi("Phí Ship Đơn Hàng"), "phi ship don hang");
  const t = tokenize("phí ship bao nhiêu");
  assert.ok(t.includes("phi_ship") && t.includes("ship"));
  assert.ok(!tokenize("là của").some((x) => x === "la" || x === "cua"));
});

console.log(`\n${passed} kiểm thử đạt.`);
