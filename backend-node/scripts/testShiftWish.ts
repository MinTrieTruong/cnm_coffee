/**
 * Kiểm thử nguyện vọng xếp ca:  npx tsx scripts/testShiftWish.ts [--no-ai] [--md]
 *
 * Kiểm tra bằng code (không AI, luôn chạy): validateRules loại mã ca bịa, ngày ngoài tháng, count sai, gộp rule trùng,
 * quy khung giờ ra ca (kể cả chỉ có giờ bắt đầu), cảnh báo quá hẹp và mâu thuẫn.
 * AI (cần GEMINI_API_KEY): 12 câu mẫu cho tháng 12/2026 (ca Sáng 07:00–15:00, Tối 14:00–22:00), so với đáp án viết tay.
 * Chấm sau khi quy đổi (không so chữ): rule khớp khi cùng loại và cùng tập lần (ngày, ca) — với MAX/MIN_SHIFTS so
 * count / period (nếu đáp án có ghi), DAY_OFF_PATTERN so thứ. Báo: câu đúng hoàn toàn / 12, precision và recall theo rule.
 * --md: ghi docs/qa/shift-wish-ket-qua.md
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "fs";
import { expandRule, monthDays, validateRules, type WishContext, type WishRule } from "../src/lib/shiftWish/normalize.js";
import { parseWish } from "../src/lib/shiftWish/parse.js";

const MONTH = "2026-12";
const ctx: WishContext = {
  month: MONTH,
  days: monthDays(MONTH)!,
  templates: [
    { code: "SANG", name: "Ca sáng", startMin: 7 * 60, endMin: 15 * 60 },
    { code: "TOI", name: "Ca tối", startMin: 14 * 60, endMin: 22 * 60 },
  ],
  maxRules: 15,
};

let failed = 0;
const check = (cond: boolean, name: string, extra = "") => {
  if (!cond) failed++;
  console.log(`${cond ? "✓" : "✗"} ${name}${extra ? ` — ${extra}` : ""}`);
};

/* ═══════════ 1. Kiểm tra bằng code ═══════════ */
{
  const v = validateRules(
    [
      { type: "UNAVAILABLE", dates: ["2026-12-05", "2027-01-03"], shiftCodes: ["SANG"] },
      { type: "UNAVAILABLE", dates: ["2026-12-05"], shiftCodes: ["SANG"] },
      { type: "PREFER", weekdays: [6], shiftCodes: ["CA_BIA"] },
      { type: "PREFER", weekdays: [1, 3], timeFrom: 18 * 60 },
      { type: "MAX_SHIFTS", count: 40, period: "WEEK" },
      { type: "MIN_SHIFTS", count: 20 },
      { type: "AVOID", fromDate: "2027-02-01", toDate: "2027-02-10" },
      { type: "HACK" },
    ],
    ctx,
  );
  check(v.rules.length === 3, "Còn 3 rule hợp lệ", v.rules.map((r) => r.type).join(", "));
  check(v.rules[0].dates?.join() === "2026-12-05", "Ngày ngoài tháng bị loại khỏi rule");
  check(v.warnings.some((w) => w.includes("CA_BIA")), "Mã ca bịa bị loại kèm cảnh báo");
  check(v.rules[1].shiftCodes?.join() === "TOI" && v.rules[1].timeTo === 1440, '"Sau 18:00" quy ra Ca tối');
  check(v.rules[2].type === "MIN_SHIFTS" && v.rules[2].period === "MONTH", "MIN_SHIFTS thiếu period → MONTH");
  check(v.warnings.some((w) => w.includes("1 đến 31")), "count ngoài 1–31 bị loại");
  check(v.warnings.some((w) => w.includes("ngoài tháng")), "Khoảng ngày ngoài tháng bị loại");

  const lastWeek = validateRules([{ type: "MAX_SHIFTS", count: 3, period: "WEEK", fromDate: "2026-12-28", toDate: "2026-12-31" }], ctx);
  check(lastWeek.rules[0]?.period === "RANGE" && lastWeek.rules[0]?.fromDate === "2026-12-28", '"Tuần cuối tháng" ghi WEEK + khoảng ngày → RANGE');

  const narrow = validateRules([{ type: "UNAVAILABLE", weekdays: [1, 2, 3, 4, 5, 6] }], ctx);
  check(narrow.narrow, "Cảnh báo nguyện vọng quá hẹp");
  const clash = validateRules([{ type: "PREFER", weekdays: [1], shiftCodes: ["SANG"] }, { type: "UNAVAILABLE", weekdays: [1] }], ctx);
  check(clash.warnings.some((w) => w.startsWith("Mâu thuẫn")), "Cảnh báo mâu thuẫn muốn / không thể");
  const night = validateRules([{ type: "UNAVAILABLE", weekdays: [5], timeFrom: 21 * 60, timeTo: 2 * 60 }], { ...ctx, templates: [...ctx.templates, { code: "DEM", name: "Ca đêm", startMin: 22 * 60, endMin: 6 * 60 }] });
  check(night.rules[0]?.shiftCodes?.sort().join() === "DEM,TOI", "Khung giờ qua đêm giao đúng ca", night.rules[0]?.shiftCodes?.join());
}

/* ═══════════ 2. AI đọc 12 câu mẫu ═══════════ */
type Expect = { type: WishRule["type"]; dates?: string[]; weekdays?: number[]; fromDate?: string; toDate?: string; shiftCodes?: string[]; count?: number; period?: WishRule["period"] };
type Sample = { name: string; text: string; rules: Expect[]; unclear?: boolean; leave?: boolean };
const SAMPLES: Sample[] = [
  { name: "Đi học theo thứ", text: "Tháng 12 em đi học sáng thứ 3 và thứ 5, mấy hôm đó em không làm ca sáng được ạ.", rules: [{ type: "UNAVAILABLE", weekdays: [2, 4], shiftCodes: ["SANG"] }] },
  { name: "Xin nghỉ ngày lẻ", text: "Ngày 15/12 em xin nghỉ đi đám cưới chị gái.", rules: [{ type: "UNAVAILABLE", dates: ["2026-12-15"] }], leave: true },
  { name: "Khoảng ngày", text: "Từ 20/12 đến 23/12 em về quê, không đi làm được.", rules: [{ type: "UNAVAILABLE", fromDate: "2026-12-20", toDate: "2026-12-23" }] },
  { name: '"Chỉ làm tối"', text: "Em chỉ làm ca tối thôi ạ.", rules: [{ type: "PREFER", shiftCodes: ["TOI"] }] },
  { name: "Tối đa / tuần", text: "Mỗi tuần em làm tối đa 4 ca thôi.", rules: [{ type: "MAX_SHIFTS", count: 4, period: "WEEK" }] },
  { name: "Cần nhiều ca", text: "Tháng này em cần nhiều ca để kiếm thêm tiền, xếp cho em càng nhiều càng tốt.", rules: [{ type: "MIN_SHIFTS" }] },
  { name: "Ngày ngoài tháng", text: "Em nghỉ ngày 3/1, còn ngày 10/12 em không làm ca sáng được.", rules: [{ type: "UNAVAILABLE", dates: ["2026-12-10"], shiftCodes: ["SANG"] }], unclear: true },
  { name: "Mơ hồ", text: "Tuần sau nữa em bận vài hôm.", rules: [], unclear: true },
  { name: "Viết tắt không dấu", text: "t7 cn e ko lam ca sang dc, may ngay do e thich ca toi", rules: [{ type: "UNAVAILABLE", weekdays: [0, 6], shiftCodes: ["SANG"] }, { type: "PREFER", weekdays: [0, 6], shiftCodes: ["TOI"] }] },
  { name: "Giờ cụ thể", text: "Thứ 2 và thứ 4 em muốn làm ca sau 6h chiều.", rules: [{ type: "PREFER", weekdays: [1, 3], shiftCodes: ["TOI"] }] },
  { name: "Mâu thuẫn", text: "Em muốn làm ca sáng thứ 2. À mà thứ 2 em không làm được đâu.", rules: [{ type: "PREFER", weekdays: [1], shiftCodes: ["SANG"] }, { type: "UNAVAILABLE", weekdays: [1] }] },
  { name: "Nghỉ cố định + hạn chế", text: "Em muốn nghỉ cố định chủ nhật hằng tuần, và hạn chế ca tối thứ 6 giúp em.", rules: [{ type: "DAY_OFF_PATTERN", weekdays: [0] }, { type: "AVOID", weekdays: [5], shiftCodes: ["TOI"] }] },
];

const toRule = (e: Expect): WishRule => ({
  type: e.type, dates: e.dates ?? null, weekdays: e.weekdays ?? null, fromDate: e.fromDate ?? null, toDate: e.toDate ?? null,
  shiftCodes: e.shiftCodes ?? null, timeFrom: null, timeTo: null, count: e.count ?? null, period: e.period ?? null, quote: null, source: "MANUAL", confidence: null,
});
/** Chữ ký so sánh của rule sau khi quy đổi */
function sig(r: WishRule, spec?: Expect) {
  if (r.type === "MAX_SHIFTS" || r.type === "MIN_SHIFTS") {
    return [r.type, spec && spec.count == null ? "*" : r.count, spec && spec.period == null ? "*" : r.period].join("|");
  }
  if (r.type === "DAY_OFF_PATTERN") return `${r.type}|${[...(r.weekdays ?? [])].sort().join(",")}`;
  const { dates, codes } = expandRule(r, ctx);
  const ds = dates ?? (r.type === "UNAVAILABLE" ? ctx.days : ["*"]);
  return `${r.type}|${ds.flatMap((d) => codes.map((c) => `${d}/${c}`)).sort().join(",")}`;
}
/** Số rule khớp giữa đáp án và kết quả AI (ghép 1–1) */
function matchCount(expected: Expect[], got: WishRule[]) {
  const left = [...got];
  let n = 0;
  for (const e of expected) {
    const i = left.findIndex((g) => sig(g, e) === sig(toRule(e), e));
    if (i >= 0) {
      n++;
      left.splice(i, 1);
    }
  }
  return n;
}

const noAi = process.argv.includes("--no-ai");
const md = process.argv.includes("--md");
const rows: string[] = [];
if (!noAi && process.env.GEMINI_API_KEY) {
  let exact = 0, tp = 0, nGot = 0, nExp = 0, ms = 0;
  for (const s of SAMPLES) {
    try {
      const out = await parseWish({ text: s.text, ctx, role: "Waiter", maxShiftsPerWeek: 6, minRestHours: 8, today: "2026-11-09" });
      const m = matchCount(s.rules, out.rules);
      const unclearOk = s.unclear ? out.unclear.length > 0 : true;
      const leaveOk = s.leave ? out.leaveSuggestions.length > 0 : true;
      const ok = m === s.rules.length && out.rules.length === s.rules.length && unclearOk && leaveOk;
      exact += ok ? 1 : 0;
      tp += m;
      nGot += out.rules.length;
      nExp += s.rules.length;
      ms += out.latencyMs;
      const desc = out.rules.map((r) => `${r.type}${r.weekdays ? ` thứ[${r.weekdays}]` : ""}${r.dates ? ` ${r.dates.map((d) => d.slice(8)).join("+")}` : ""}${r.fromDate || r.toDate ? ` ${r.fromDate?.slice(8) ?? ""}–${r.toDate?.slice(8) ?? ""}` : ""}${r.shiftCodes ? ` ${r.shiftCodes}` : ""}${r.count != null ? ` ${r.count}/${r.period}` : ""}`).join("; ") || "(không)";
      console.log(`${ok ? "✓" : "✗"} ${s.name}: ${desc}${out.unclear.length ? ` | chưa hiểu: ${out.unclear.join("; ")}` : ""}${out.leaveSuggestions.length ? " | gợi ý đơn nghỉ" : ""} (${out.latencyMs}ms)`);
      rows.push(`| ${s.name} | ${s.text} | ${desc.replace(/\|/g, "/")}${out.unclear.length ? `<br>chưa hiểu: ${out.unclear.join("; ")}` : ""}${out.leaveSuggestions.length ? "<br>gợi ý đơn nghỉ" : ""} | ${m}/${s.rules.length} | ${ok ? "Đúng" : "Sai"} |`);
    } catch (e) {
      console.log(`✗ ${s.name}: lỗi ${e instanceof Error ? e.message : e}`);
      rows.push(`| ${s.name} | ${s.text} | lỗi gọi AI | 0/${s.rules.length} | Sai |`);
      nExp += s.rules.length;
    }
  }
  const precision = nGot ? tp / nGot : 0;
  const recall = nExp ? tp / nExp : 0;
  const summary = `Câu đúng hoàn toàn: ${exact}/${SAMPLES.length} · Precision theo rule: ${(precision * 100).toFixed(0)}% (${tp}/${nGot}) · Recall: ${(recall * 100).toFixed(0)}% (${tp}/${nExp}) · Thời gian TB: ${Math.round(ms / SAMPLES.length)} ms / câu`;
  console.log(`\n${summary}`);
  if (md) {
    mkdirSync("../docs/qa", { recursive: true });
    writeFileSync(
      "../docs/qa/shift-wish-ket-qua.md",
      [
        "# Kết quả kiểm thử: AI hiểu nguyện vọng xếp ca",
        "",
        `Chạy \`npx tsx scripts/testShiftWish.ts --md\` (model ${process.env.GEMINI_CHAT_MODEL || "gemini-3.5-flash"}), tháng 12/2026, ca Sáng 07:00–15:00 và Tối 14:00–22:00.`,
        "Chấm sau khi quy đổi ra các lần (ngày, ca), không so chữ. Câu \"đúng hoàn toàn\": đủ và không thừa rule, có \"chưa hiểu\" / gợi ý đơn nghỉ khi đáp án yêu cầu.",
        "",
        `**${summary}**`,
        "",
        "| Tình huống | Câu nhân viên viết | AI trả về | Rule khớp | Kết quả |",
        "|---|---|---|---|---|",
        ...rows,
        "",
      ].join("\n"),
    );
    console.log("Đã ghi docs/qa/shift-wish-ket-qua.md");
  }
} else {
  console.log("(bỏ qua phần AI: --no-ai hoặc thiếu GEMINI_API_KEY)");
}

if (failed) {
  console.log(`\n${failed} kiểm tra bằng code KHÔNG đạt`);
  process.exit(1);
}
