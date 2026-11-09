/**
 * Kiểm thử thuật toán xếp ca (không cần CSDL, không AI):  npx tsx scripts/testAutoSchedule.ts
 *
 * Trên 50 bộ dữ liệu ngẫu nhiên (scripts/fixtures/autoScheduleData.ts):
 *  - lịch cuối KHÔNG vi phạm: nghỉ phép, "không thể", trùng ngày / giờ nghỉ tối thiểu, số ca tối đa / tuần, "tối đa N ca"
 *    (kiểm tra bằng bộ kiểm độc lập trong file này, không dùng lại code của thuật toán)
 *  - chi phí sau tìm kiếm cục bộ ≤ chi phí chỉ tham lam (không khẳng định % "muốn" luôn tăng — có thể đổi lấy chia đều)
 *  - cùng seed → cùng kết quả
 *  - không có nguyện vọng → lịch vẫn hợp lệ như trước
 */
import { autoSchedule, type AutoInput, type AutoSlot } from "../src/lib/autoSchedule.js";
import { makeData } from "./fixtures/autoScheduleData.js";

let failed = 0;
const fail = (msg: string) => {
  failed++;
  if (failed <= 15) console.log(`✗ ${msg}`);
};

const DAY = 86_400_000;
const dayIdx = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY);
const wd = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const weekOf = (d: string) => dayIdx(d) - ((wd(d) + 6) % 7);

/** Bộ kiểm độc lập: số vi phạm cứng của các ca mới */
function violations(input: AutoInput, slots: AutoSlot[]) {
  const out: string[] = [];
  const all = new Map<number, { date: string; code: string; s: number; e: number; isNew: boolean }[]>();
  const add = (id: number, date: string, code: string, sm: number, em: number, isNew: boolean) => {
    const b = dayIdx(date) * 1440;
    (all.get(id) ?? all.set(id, []).get(id)!).push({ date, code, s: b + sm, e: b + (em > sm ? em : em + 1440), isNew });
  };
  for (const e of input.existing) if (e.staffId != null) add(e.staffId, e.date, e.code, e.startMin, e.endMin, false);
  for (const s of slots) if (s.staffId != null) add(s.staffId, s.date, s.code, s.startMin, s.endMin, true);
  for (const s of slots) {
    if (s.staffId == null) continue;
    const role = input.staff.find((x) => x.id === s.staffId)?.role;
    if (role !== s.role) out.push(`sai vị trí #${s.staffId} ${s.date}`);
    if (input.leaves.get(s.staffId)?.has(s.date)) out.push(`nghỉ phép #${s.staffId} ${s.date}`);
    for (const w of input.wishes?.get(s.staffId) ?? []) {
      if (w.type === "UNAVAILABLE" && (!w.dates || w.dates.has(s.date)) && w.codes.has(s.code)) out.push(`không thể #${s.staffId} ${s.date} ${s.code}`);
    }
  }
  for (const [id, list] of all) {
    list.sort((a, b) => a.s - b.s);
    for (let i = 1; i < list.length; i++) {
      const [a, b] = [list[i - 1], list[i]];
      if ((a.isNew || b.isNew) && (a.date === b.date || b.s < a.e + input.rules.minRestHours * 60)) out.push(`giờ nghỉ #${id} ${a.date}→${b.date}`);
    }
    const weeks = new Map<number, { n: number; isNew: boolean }>();
    for (const b of list) {
      const w = weeks.get(weekOf(b.date)) ?? { n: 0, isNew: false };
      w.n++;
      w.isNew ||= b.isNew;
      weeks.set(weekOf(b.date), w);
    }
    for (const [k, w] of weeks) if (w.isNew && w.n > input.rules.maxShiftsPerWeek) out.push(`quá ${input.rules.maxShiftsPerWeek} ca/tuần #${id} tuần ${k}`);
    for (const w of input.wishes?.get(id) ?? []) {
      if (w.type !== "MAX_SHIFTS") continue;
      if (w.period === "WEEK") {
        for (const [k, v] of weeks) if (v.isNew && v.n > w.count!) out.push(`quá "tối đa ${w.count} ca/tuần" #${id} tuần ${k}`);
      } else {
        const inside = list.filter((b) => (w.period === "RANGE" ? b.date >= w.rangeFrom! && b.date <= w.rangeTo! : b.date.startsWith(input.days[0].slice(0, 7))));
        if (inside.some((b) => b.isNew) && inside.length > w.count!) out.push(`quá "tối đa ${w.count} ca" #${id}`);
      }
    }
  }
  return out;
}

const N = 50;
let costBetter = 0, preferUp = 0, preferDown = 0, msMax = 0;
for (let seed = 1; seed <= N; seed++) {
  const { input } = makeData(seed);
  const greedy = autoSchedule({ ...input, options: { seed, improve: false } });
  const full = autoSchedule({ ...input, options: { seed, timeBudgetMs: 20_000 } });
  msMax = Math.max(msMax, full.metrics.ms);

  const v = violations(input, full.slots);
  if (v.length) fail(`seed ${seed}: ${v.length} vi phạm cứng (${v.slice(0, 3).join("; ")})`);
  if (full.metrics.hardViolations !== 0) fail(`seed ${seed}: metrics.hardViolations = ${full.metrics.hardViolations}`);
  if (violations(input, greedy.slots).length) fail(`seed ${seed}: bản tham lam có vi phạm`);
  if (full.metrics.cost > greedy.metrics.cost) fail(`seed ${seed}: chi phí tăng ${greedy.metrics.cost} → ${full.metrics.cost}`);
  if (full.metrics.cost < greedy.metrics.cost) costBetter++;
  if (full.metrics.preferMet > greedy.metrics.preferMet) preferUp++;
  if (full.metrics.preferMet < greedy.metrics.preferMet) preferDown++;

  if (seed <= 10) {
    const again = autoSchedule({ ...input, options: { seed, timeBudgetMs: 20_000 } });
    if (JSON.stringify(again.slots) !== JSON.stringify(full.slots)) fail(`seed ${seed}: chạy lại cùng seed ra kết quả khác`);
  }

  const { input: plain } = makeData(seed, { wishes: false });
  const old = autoSchedule({ ...plain, options: { seed } });
  const vp = violations(plain, old.slots);
  if (vp.length) fail(`seed ${seed} (không nguyện vọng): ${vp.slice(0, 3).join("; ")}`);
  if (old.metrics.preferTotal !== 0) fail(`seed ${seed} (không nguyện vọng): preferTotal = ${old.metrics.preferTotal}`);
}

console.log(`${N} bộ dữ liệu: 0 vi phạm cứng ${failed ? "✗" : "✓"} · chi phí giảm ở ${costBetter}/${N} bộ (không bộ nào tăng) · % "muốn" tăng ${preferUp}, giảm ${preferDown} · chạy lâu nhất ${msMax} ms`);
if (failed) {
  console.log(`\n${failed} kiểm tra KHÔNG đạt`);
  process.exit(1);
}
console.log("Tất cả kiểm tra đạt.");
