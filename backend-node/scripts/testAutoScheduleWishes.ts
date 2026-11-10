/**
 * So sánh 3 phương án xếp ca trên cùng dữ liệu (không cần CSDL, không AI):  npx tsx scripts/testAutoScheduleWishes.ts [--md]
 *
 *  (a) tham lam cũ, KHÔNG dùng nguyện vọng (chấm hậu kiểm theo cùng bộ nguyện vọng)
 *  (b) tham lam CÓ nguyện vọng (không tìm kiếm cục bộ)
 *  (c) có nguyện vọng + tìm kiếm cục bộ
 * Hai kịch bản: 12 nhân viên / 3 ca (đề bài) và quy mô chi nhánh thật (37 nhân viên / 2 ca, định biên mặc định),
 * mỗi kịch bản 10 seed, lấy trung bình. --md: ghi docs/qa/auto-schedule-ket-qua.md (đưa vào chương đánh giá).
 */
import { mkdirSync, writeFileSync } from "fs";
import { autoSchedule, evaluateSchedule, type AutoMetrics } from "../src/lib/autoSchedule.js";
import { makeData } from "./fixtures/autoScheduleData.js";

const SEEDS = Array.from({ length: 10 }, (_, i) => i + 1);
type Row = { pref: number; met: number; total: number; hard: number; short: number; sd: number; spread: number; avoid: number; cost: number; ms: number };

const sdOf = (m: AutoMetrics) => {
  const xs = Object.values(m.shiftsStdDevByRole);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
};
const row = (m: AutoMetrics, ms: number): Row => ({
  pref: m.preferTotal ? (m.preferMet / m.preferTotal) * 100 : 0,
  met: m.preferMet,
  total: m.preferTotal,
  hard: m.hardViolations,
  short: m.shortages,
  sd: sdOf(m),
  spread: Math.max(0, ...Object.values(m.shiftsSpreadByRole)),
  avoid: m.avoidViolated,
  cost: m.cost,
  ms,
});
const avg = (rs: Row[]): Row => {
  const keys = Object.keys(rs[0]) as (keyof Row)[];
  return Object.fromEntries(keys.map((k) => [k, rs.reduce((a, r) => a + r[k], 0) / rs.length])) as Row;
};

const lines: string[] = [];
for (const real of [false, true]) {
  const A: Row[] = [], B: Row[] = [], C: Row[] = [];
  for (const seed of SEEDS) {
    const { input } = makeData(seed, { real });
    const { input: plain } = makeData(seed, { real, wishes: false });

    let t = Date.now();
    const a = autoSchedule({ ...plain, options: { seed, improve: false } });
    const aMs = Date.now() - t;
    A.push(row(evaluateSchedule(input, a.slots).metrics, aMs));

    t = Date.now();
    const b = autoSchedule({ ...input, options: { seed, improve: false } });
    B.push(row(b.metrics, Date.now() - t));

    t = Date.now();
    const c = autoSchedule({ ...input, options: { seed } });
    C.push(row(c.metrics, Date.now() - t));
  }
  const title = real ? "Quy mô chi nhánh thật — 37 nhân viên, 2 ca, định biên mặc định" : "Đề bài — 12 nhân viên, 3 ca";
  const fmt = (name: string, r: Row) =>
    `| ${name} | ${r.pref.toFixed(1)}% (${r.met.toFixed(1)}/${r.total.toFixed(1)}) | ${r.hard.toFixed(0)} | ${r.short.toFixed(1)} | ${r.sd.toFixed(2)} | ±${r.spread.toFixed(1)} | ${r.avoid.toFixed(1)} | ${Math.round(r.cost)} | ${Math.round(r.ms)} |`;
  const table = [
    `### ${title}`,
    "",
    `Trung bình ${SEEDS.length} seed, tháng 12/2026, nguyện vọng ngẫu nhiên có mâu thuẫn.`,
    "",
    "| Phương án | Nguyện vọng \"muốn\" được đáp ứng | Vi phạm cứng | Chỗ thiếu người | Độ lệch chuẩn số ca | Chênh lệch số ca | Lần \"hạn chế\" bị xếp | Chi phí | ms |",
    "|---|---|---|---|---|---|---|---|---|",
    fmt("(a) Tham lam cũ, không nguyện vọng", avg(A)),
    fmt("(b) Tham lam có nguyện vọng", avg(B)),
    fmt("(c) Có nguyện vọng + tìm kiếm cục bộ", avg(C)),
    "",
  ];
  console.log(table.join("\n"));
  lines.push(...table);
}

if (process.argv.includes("--md")) {
  mkdirSync("../docs/qa", { recursive: true });
  writeFileSync(
    "../docs/qa/auto-schedule-ket-qua.md",
    [
      "# Kết quả so sánh: xếp ca có nguyện vọng",
      "",
      "Chạy `npx tsx scripts/testAutoScheduleWishes.ts --md` (dữ liệu giả lập: scripts/fixtures/autoScheduleData.ts).",
      "",
      "- **Vi phạm cứng**: xếp vào ô nhân viên báo \"không thể\", ngày nghỉ phép, trùng ca / thiếu giờ nghỉ, quá số ca tối đa — phải bằng 0.",
      "- **Độ lệch chuẩn / chênh lệch số ca**: trong cùng vị trí (trung bình các vị trí / lớn nhất).",
      "- **Chi phí** = phạt nguyện vọng mềm + 300 × độ lệch chuẩn số ca + 60 × độ lệch chuẩn ca cuối tuần + 1000 × chỗ thiếu (lib/autoSchedule.ts → WEIGHTS).",
      "- (a) không biết nguyện vọng nên có thể xếp vào ô \"không thể\" (cột vi phạm cứng của (a) đếm các ô đó).",
      "",
      ...lines,
      `Kiểm thử tính chất (scripts/testAutoSchedule.ts): 50 bộ dữ liệu, 0 vi phạm cứng, chi phí sau tìm kiếm cục bộ không bao giờ tăng, cùng seed ra cùng kết quả.`,
      "",
    ].join("\n"),
  );
  console.log("Đã ghi docs/qa/auto-schedule-ket-qua.md");
}
