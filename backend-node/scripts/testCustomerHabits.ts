/**
 * Kiểm thử thói quen khách (không cần CSDL):  npx tsx scripts/testCustomerHabits.ts
 *
 * splitNotes: chuỗi web ("Size M · Đá 50% · Đường 50% · không ống hút"), chuỗi POS ("Size M, Đá, ít ngọt"),
 * món nóng, món ăn, ghi chú có dấu phẩy. computeUsual (dữ liệu giả): xếp hạng theo số ly × độ gần,
 * bộ tuỳ chọn quen + độ tin cậy, ghi chú quen chỉ khi lặp ≥ 2 lần, món ăn không có size/đường.
 */
import { computeUsual, recencyWeight, splitNotes, usualLabel, type HabitLine } from "../src/lib/customerHabits.js";

let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
};
/** So sánh không phụ thuộc thứ tự khoá */
const canon = (v: unknown) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
const same = (a: unknown, b: unknown) => canon(a) === canon(b);

console.log("\n▸ splitNotes");
const cases: [string | null, ReturnType<typeof splitNotes>][] = [
  ["Size M · Đá 50% · Đường 50% · không ống hút", { size: "M", temp: "ICED", icePct: 50, sugar: "50", free: "không ống hút" }],
  ["Size L · Nóng · Đường 0%", { size: "L", temp: "HOT", sugar: "0", free: "" }],
  ["Size M · Đường 100%", { size: "M", sugar: "100", free: "" }],
  ["Size S · Đá 100% · Đường 100% · không ống hút, thêm kem", { size: "S", temp: "ICED", icePct: 100, sugar: "100", free: "không ống hút, thêm kem" }],
  ["Size M, Đá, ít ngọt", { size: "M", temp: "ICED", free: "ít ngọt" }],
  ["Size L, Nóng", { size: "L", temp: "HOT", free: "" }],
  // POS gọi bằng giọng nói / thẻ thói quen: mức đá, đường bằng chữ
  ["Size M, Đá, Ít đá · Ít đường · không ống hút", { size: "M", temp: "ICED", icePct: 50, sugar: "50", free: "không ống hút" }],
  ["Size L, Nóng, Không đường", { size: "L", temp: "HOT", sugar: "0", free: "" }],
  ["hâm nóng giúp em", { free: "hâm nóng giúp em" }],
  ["[MANG VỀ — ưu tiên] Size M · Đá 100% · Đường 100%", { size: "M", temp: "ICED", icePct: 100, sugar: "100", free: "" }],
  ["Đá bào riêng · Size M", { size: "M", free: "Đá bào riêng" }],
  [null, { free: "" }],
  ["", { free: "" }],
];
for (const [input, want] of cases) {
  const got = splitNotes(input);
  check(JSON.stringify(input), same(got, want), same(got, want) ? "" : `nhận ${JSON.stringify(got)}`);
}

console.log("\n▸ computeUsual");
const now = new Date("2026-11-08T10:00:00+07:00");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
const drink = (productId: number, days: number, notes: string, extra: Partial<HabitLine> = {}): HabitLine => {
  const n = splitNotes(notes);
  return { productId, quantity: 1, size: n.size ?? "M", temperature: n.temp ?? null, customNotes: notes, at: ago(days), food: false, temps: "BOTH", ...extra };
};
const lines: HabitLine[] = [
  // Bạc xỉu (7): 3 lần ít đường đá 50% + không ống hút, 1 lần mặc định cách đây lâu
  drink(7, 2, "Size M · Đá 50% · Đường 50% · không ống hút"),
  drink(7, 9, "Size M · Đá 50% · Đường 50% · Không ống hút"),
  drink(7, 16, "Size M · Đá 50% · Đường 50%"),
  drink(7, 80, "Size M · Đá 100% · Đường 100%"),
  // Cà phê đen (9): 4 ly nhưng đã 70 ngày → xếp sau bạc xỉu
  drink(9, 70, "Size L · Nóng · Đường 0%", { quantity: 4 }),
  // Bánh (20): món ăn, ghi chú tự do 1 lần → không thành ghi chú quen
  { productId: 20, quantity: 2, size: null, temperature: null, customNotes: "hâm nóng", at: ago(5), food: true },
  // Trà đào (11): POS "Đá" không %, món nay chỉ phục vụ nóng → bản quen chuyển sang nóng
  drink(11, 30, "Size M, Đá", { temps: "HOT", temperature: "ICED" }),
];
const got = computeUsual(lines, now, 5);
console.log(got.map((u) => `   #${u.productId} × ${u.timesOrdered}  điểm ${u.score}  ${usualLabel(u.usual) || "(món ăn)"}  tin cậy ${u.confidence}${u.usualNote ? `  · "${u.usualNote}"` : ""}`).join("\n"));
const bx = got.find((u) => u.productId === 7)!;
check("bạc xỉu đứng đầu", got[0]?.productId === 7, got.map((u) => u.productId).join(","));
check("cà phê 4 ly cũ xếp sau món gần đây", got.findIndex((u) => u.productId === 9) > got.findIndex((u) => u.productId === 20));
check("bộ quen bạc xỉu = M · Đá 50% · Đường 50%", same(bx.usual, { size: "M", temperature: "ICED", icePct: 50, sugar: "50" }), JSON.stringify(bx.usual));
check("độ tin cậy > 0,8 (lần mặc định đã cũ)", bx.confidence > 0.8, String(bx.confidence));
check("ghi chú quen 'không ống hút' (lặp 2 lần, lấy bản gần nhất)", bx.usualNote === "không ống hút", String(bx.usualNote));
check("timesOrdered bạc xỉu = 4", bx.timesOrdered === 4);
check("lastOrderedAt = đơn gần nhất", bx.lastOrderedAt.getTime() === ago(2).getTime());
const cake = got.find((u) => u.productId === 20)!;
check("món ăn không size/đường", same(cake.usual, { size: null, temperature: null, icePct: null, sugar: null }));
check("ghi chú 1 lần không thành ghi chú quen", cake.usualNote === null);
const tea = got.find((u) => u.productId === 11)!;
check("món đổi sang chỉ nóng → bản quen nóng, không lượng đá", tea.usual.temperature === "HOT" && tea.usual.icePct === null, JSON.stringify(tea.usual));
check("POS 'Đá' không % → đá 100% khi còn bán đá", same(computeUsual([drink(11, 1, "Size M, Đá", { temperature: "ICED" })], now)[0].usual, { size: "M", temperature: "ICED", icePct: 100, sugar: "100" }));
check("giới hạn số món", computeUsual(lines, now, 2).length === 2);
check("không có dữ liệu → rỗng", computeUsual([], now).length === 0);
check("trọng số giảm một nửa sau 4 tuần", Math.abs(recencyWeight(ago(28), now) - 0.5) < 1e-9);

console.log(failed ? `\n✗ ${failed} kiểm tra lỗi` : "\n✓ Tất cả kiểm tra đạt");
process.exit(failed ? 1 : 0);
