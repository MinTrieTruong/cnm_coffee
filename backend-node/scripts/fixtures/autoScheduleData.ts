/**
 * Dữ liệu giả lập cho kiểm thử thuật toán xếp ca (không cần CSDL): 1 chi nhánh, 12 nhân viên, 3 ca, tháng 12/2026,
 * nguyện vọng ngẫu nhiên (có seed) — có cả mâu thuẫn "muốn" trùng "không thể", nghỉ phép, ca đã duyệt sẵn.
 * Tỉ lệ mỗi người: 40% bận 1 ca cố định mỗi tuần, 25% bận 2 ngày lẻ, 80% muốn 1 ca ở 2 thứ, 20% muốn đúng ô đã báo bận
 * (mâu thuẫn), 30% thích 1 loại ca, 40% hạn chế 1 ca, 15% tối đa 4–5 ca / tuần, 10% tối đa 3 ca 24–31/12,
 * 15% ít nhất 20 ca / tháng, 30% nghỉ cố định 1 thứ; 3 ngày nghỉ phép và 4 ca đã duyệt sẵn.
 */
import { mulberry32, type AutoExisting, type AutoInput, type AutoStaff, type AutoTemplate, type AutoWish } from "../../src/lib/autoSchedule.js";
import { monthDays, toAutoWish, type WishRule } from "../../src/lib/shiftWish/normalize.js";

export const MONTH = "2026-12";
export const DAYS = monthDays(MONTH)!;
export const TEMPLATES: AutoTemplate[] = [
  { code: "SANG", startMin: 7 * 60, endMin: 12 * 60, staffing: [{ role: "Cashier", weekdayCount: 1, weekendCount: 1 }, { role: "Waiter", weekdayCount: 1, weekendCount: 2 }, { role: "Kitchen", weekdayCount: 1, weekendCount: 1 }] },
  { code: "CHIEU", startMin: 12 * 60, endMin: 17 * 60, staffing: [{ role: "Cashier", weekdayCount: 0, weekendCount: 1 }, { role: "Waiter", weekdayCount: 1, weekendCount: 2 }, { role: "Kitchen", weekdayCount: 0, weekendCount: 1 }] },
  { code: "TOI", startMin: 17 * 60, endMin: 22 * 60, staffing: [{ role: "Cashier", weekdayCount: 1, weekendCount: 1 }, { role: "Waiter", weekdayCount: 1, weekendCount: 2 }, { role: "Kitchen", weekdayCount: 1, weekendCount: 1 }] },
];
export const STAFF: AutoStaff[] = [
  ...[1, 2, 3].map((id) => ({ id, role: "Cashier" })),
  ...[4, 5, 6, 7, 8, 9].map((id) => ({ id, role: "Waiter" })),
  ...[10, 11, 12].map((id) => ({ id, role: "Kitchen" })),
];
/** Quy mô chi nhánh thật: 37 nhân viên, 2 ca và định biên mặc định của hệ thống (lib/hrConfig.ts) */
export const TEMPLATES_REAL: AutoTemplate[] = [
  { code: "SANG", startMin: 7 * 60, endMin: 15 * 60, staffing: [["Cashier", 1, 1], ["Waiter", 5, 6], ["Kitchen", 1, 2], ["Shipper", 1, 2], ["Warehouse", 1, 1]].map(([role, weekdayCount, weekendCount]) => ({ role: role as string, weekdayCount: weekdayCount as number, weekendCount: weekendCount as number })) },
  { code: "TOI", startMin: 14 * 60, endMin: 22 * 60, staffing: [["Cashier", 1, 1], ["Waiter", 8, 9], ["Kitchen", 2, 3], ["Shipper", 2, 2], ["Warehouse", 1, 1]].map(([role, weekdayCount, weekendCount]) => ({ role: role as string, weekdayCount: weekdayCount as number, weekendCount: weekendCount as number })) },
];
let nextId = 100;
export const STAFF_REAL: AutoStaff[] = ([["Cashier", 4], ["Waiter", 19], ["Kitchen", 6], ["Shipper", 5], ["Warehouse", 3]] as const).flatMap(([role, n]) => Array.from({ length: n }, () => ({ id: nextId++, role })));

const rule = (p: Partial<WishRule> & Pick<WishRule, "type">): WishRule => ({
  dates: null, weekdays: null, fromDate: null, toDate: null, shiftCodes: null, timeFrom: null, timeTo: null, count: null, period: null, quote: null, source: "MANUAL", confidence: null, ...p,
});

/** Bộ dữ liệu theo seed: nguyện vọng (dạng rule + dạng thuật toán), nghỉ phép, ca đã duyệt */
export function makeData(seed: number, opts: { wishes?: boolean; real?: boolean } = {}) {
  const TEMPLATES_ = opts.real ? TEMPLATES_REAL : TEMPLATES;
  const STAFF_ = opts.real ? STAFF_REAL : STAFF;
  const CTX = { days: DAYS, templates: TEMPLATES_.map((t) => ({ code: t.code, name: t.code, startMin: t.startMin, endMin: t.endMin })) };
  const CODES = TEMPLATES_.map((t) => t.code);
  const rand = mulberry32(seed * 7919 + 13);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const day = () => pick(DAYS);
  const rules = new Map<number, WishRule[]>();
  for (const s of STAFF_) {
    const list: WishRule[] = [];
    const wd = Math.floor(rand() * 7);
    if (rand() < 0.4) list.push(rule({ type: "UNAVAILABLE", weekdays: [wd], shiftCodes: [pick(CODES)] }));
    if (rand() < 0.25) list.push(rule({ type: "UNAVAILABLE", dates: [day(), day()] }));
    if (rand() < 0.8) list.push(rule({ type: "PREFER", weekdays: [Math.floor(rand() * 7), Math.floor(rand() * 7)], shiftCodes: [pick(CODES)] }));
    // Mâu thuẫn: muốn đúng ô đã báo không thể
    if (rand() < 0.2) list.push(rule({ type: "PREFER", weekdays: [wd], shiftCodes: [...CODES] }));
    if (rand() < 0.3) list.push(rule({ type: "PREFER", shiftCodes: [pick(CODES)] }));
    if (rand() < 0.4) list.push(rule({ type: "AVOID", weekdays: [Math.floor(rand() * 7)], shiftCodes: [pick(CODES)] }));
    if (rand() < 0.15) list.push(rule({ type: "MAX_SHIFTS", count: 4 + Math.floor(rand() * 2), period: "WEEK" }));
    if (rand() < 0.1) list.push(rule({ type: "MAX_SHIFTS", count: 3, period: "RANGE", fromDate: "2026-12-24", toDate: "2026-12-31" }));
    if (rand() < 0.15) list.push(rule({ type: "MIN_SHIFTS", count: 20, period: "MONTH" }));
    if (rand() < 0.3) list.push(rule({ type: "DAY_OFF_PATTERN", weekdays: [Math.floor(rand() * 7)] }));
    rules.set(s.id, list);
  }
  const wishes = new Map<number, AutoWish[]>();
  let ruleId = 1;
  for (const [id, list] of rules) wishes.set(id, list.map((r) => toAutoWish(ruleId++, r, CTX)));

  const leaves = new Map<number, Set<string>>();
  for (let i = 0; i < 3; i++) {
    const s = pick(STAFF_);
    const set = leaves.get(s.id) ?? leaves.set(s.id, new Set()).get(s.id)!;
    set.add(day());
  }
  // Vài ca đã duyệt sẵn (giữ nguyên khi xếp)
  const existing: AutoExisting[] = [];
  for (let i = 0; i < 4; i++) {
    const s = pick(STAFF_);
    const t = pick(TEMPLATES_);
    const d = day();
    if (existing.some((e) => e.staffId === s.id && e.date === d)) continue;
    existing.push({ staffId: s.id, date: d, code: t.code, role: s.role, startMin: t.startMin, endMin: t.endMin });
  }

  const input: AutoInput = {
    days: DAYS, templates: TEMPLATES_, staff: STAFF_, existing, leaves,
    rules: { minRestHours: 8, maxShiftsPerWeek: 6 },
    ...(opts.wishes === false ? {} : { wishes }),
  };
  return { input, wishes, rules };
}
