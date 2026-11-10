/**
 * Nguyện vọng xếp ca — kiểu dữ liệu, câu mô tả tiếng Việt và cách quy rule ra ô (ngày × ca).
 * Logic quy đổi giống backend-node/src/lib/shiftWish/normalize.ts (bản đồ nhiệt / lịch xem trước).
 */

export type WishType = "UNAVAILABLE" | "PREFER" | "AVOID" | "MAX_SHIFTS" | "MIN_SHIFTS" | "DAY_OFF_PATTERN";
export type WishPeriod = "WEEK" | "MONTH" | "RANGE";
export type WishRule = {
  type: WishType;
  dates: string[] | null;
  weekdays: number[] | null;
  fromDate: string | null;
  toDate: string | null;
  shiftCodes: string[] | null;
  timeFrom: number | null;
  timeTo: number | null;
  count: number | null;
  period: WishPeriod | null;
  quote: string | null;
  source: "AI" | "MANUAL";
  confidence: number | null;
};
export type WishShift = { code: string; name: string; startMin: number; endMin: number; color: string | null };

export const WISH_TYPE_UI: Record<WishType, { label: string; tone: "danger" | "success" | "warning" | "neutral" }> = {
  UNAVAILABLE: { label: "Không thể", tone: "danger" },
  PREFER: { label: "Muốn", tone: "success" },
  AVOID: { label: "Hạn chế", tone: "warning" },
  MAX_SHIFTS: { label: "Tối đa số ca", tone: "neutral" },
  MIN_SHIFTS: { label: "Tối thiểu số ca", tone: "neutral" },
  DAY_OFF_PATTERN: { label: "Nghỉ cố định", tone: "neutral" },
};

/** AI không chắc dưới mức này → viền vàng */
export const LOW_CONFIDENCE = 0.7;

export const WD_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const WD_LONG = ["chủ nhật", "thứ 2", "thứ 3", "thứ 4", "thứ 5", "thứ 6", "thứ 7"];
const pad2 = (n: number) => String(n).padStart(2, "0");
export const hhmm = (m: number) => `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
export const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
export const isWeekendDay = (date: string) => [0, 6].includes(weekdayOf(date));

export const emptyRule = (type: WishType): WishRule => ({
  type, dates: null, weekdays: null, fromDate: null, toDate: null, shiftCodes: null, timeFrom: null, timeTo: null,
  count: type === "MAX_SHIFTS" || type === "MIN_SHIFTS" ? 3 : null, period: type === "MAX_SHIFTS" || type === "MIN_SHIFTS" ? "WEEK" : null,
  quote: null, source: "MANUAL", confidence: null,
});

const span = (s: number, e: number): [number, number] => [s, e > s ? e : e + 1440];
function codesForTime(from: number, to: number, shifts: WishShift[]) {
  const [a, b] = span(from, to);
  return shifts.filter((t) => {
    const [s, e] = span(t.startMin, t.endMin);
    return [-1440, 0, 1440].some((d) => s + d < b && a < e + d);
  }).map((t) => t.code);
}

export function ruleCodes(r: WishRule, shifts: WishShift[]): string[] {
  if (r.shiftCodes?.length) return r.shiftCodes;
  if (r.timeFrom != null && r.timeTo != null) return codesForTime(r.timeFrom, r.timeTo, shifts);
  return shifts.map((s) => s.code);
}

export function ruleDates(r: WishRule, days: string[]): string[] | null {
  if (r.dates?.length) {
    const set = new Set(r.dates);
    return days.filter((d) => set.has(d));
  }
  if (!r.weekdays?.length && !r.fromDate && !r.toDate) return null;
  const from = r.fromDate ?? days[0];
  const to = r.toDate ?? days[days.length - 1];
  const wd = r.weekdays?.length ? new Set(r.weekdays) : null;
  return days.filter((d) => d >= from && d <= to && (!wd || wd.has(weekdayOf(d))));
}

/** Ô "ngày|mã ca" theo loại (PREFER / AVOID không có ngày → mọi ngày) */
export function wishCells(rules: WishRule[], days: string[], shifts: WishShift[]) {
  const out = { unavailable: new Set<string>(), prefer: new Set<string>(), avoid: new Set<string>() };
  for (const r of rules) {
    const target = r.type === "UNAVAILABLE" ? out.unavailable : r.type === "PREFER" ? out.prefer : r.type === "AVOID" ? out.avoid : null;
    if (!target) continue;
    const codes = ruleCodes(r, shifts);
    for (const d of ruleDates(r, days) ?? days) for (const c of codes) target.add(`${d}|${c}`);
  }
  return out;
}

function joinVi(parts: string[]) {
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} và ${parts[parts.length - 1]}`;
}

/** Câu mô tả dễ hiểu, VD "Không làm Ca sáng (07:00–15:00) các thứ 3, thứ 5 từ 01/12 đến 31/12" */
export function describeRule(r: WishRule, shifts: WishShift[], days: string[]): string {
  const byCode = new Map(shifts.map((s) => [s.code, s]));
  const shiftText = () => {
    if (r.shiftCodes?.length) return joinVi(r.shiftCodes.map((c) => { const s = byCode.get(c); return s ? `${s.name} (${hhmm(s.startMin)}–${hhmm(s.endMin)})` : c; }));
    if (r.timeFrom != null && r.timeTo != null) return `các ca trong khung ${hhmm(r.timeFrom)}–${hhmm(r.timeTo)}`;
    return "";
  };
  const first = days[0];
  const last = days[days.length - 1];
  const range = () => (r.fromDate || r.toDate ? ` từ ${dm(r.fromDate ?? first)} đến ${dm(r.toDate ?? last)}` : "");
  const when = () => {
    if (r.dates?.length) return `ngày ${joinVi(r.dates.map(dm))}`;
    if (r.weekdays?.length) return `các ${joinVi(r.weekdays.map((w) => WD_LONG[w]))}${range() || " trong tháng"}`;
    if (r.fromDate || r.toDate) return range().trim();
    return "";
  };
  const shift = shiftText();
  const w = when();
  switch (r.type) {
    case "UNAVAILABLE":
      return shift ? `Không làm ${shift}${w ? ` ${w}` : " cả tháng"}` : `Không làm ${w} (cả ngày)`;
    case "PREFER":
      return shift ? `Muốn làm ${shift}${w ? ` ${w}` : ""}` : `Muốn được xếp ca ${w}`;
    case "AVOID":
      return shift ? `Hạn chế ${shift}${w ? ` ${w}` : ""}` : `Hạn chế đi làm ${w}`;
    case "MAX_SHIFTS":
    case "MIN_SHIFTS": {
      const per = r.period === "WEEK" ? " mỗi tuần" : r.period === "RANGE" ? range() : " trong tháng";
      return `${r.type === "MAX_SHIFTS" ? "Tối đa" : "Ít nhất"} ${r.count ?? "?"} ca${per}`;
    }
    case "DAY_OFF_PATTERN":
      return `Muốn nghỉ cố định ${joinVi((r.weekdays ?? []).map((x) => WD_LONG[x]))} hằng tuần`;
  }
}

/* ═══════════ Kết quả tự xếp lịch (lib/autoSchedule.ts ở backend) ═══════════ */

export type UnmetCause = "FULL_BY_OTHERS" | "MAX_WEEK_REACHED" | "REST_RULE" | "NO_SLOT_FOR_ROLE" | "ON_LEAVE" | "SELF_UNAVAILABLE" | "BALANCE_TRADEOFF";
export type SlotReason = "PREFER_MET" | "ONLY_CANDIDATE" | "BALANCE" | "SAME_SHIFT_TYPE" | "FILLED_SHORTAGE";
export type UnmetWish = { staffId: number; ruleId: number; date: string; code: string; cause: UnmetCause; detail: string };
export type RunMetrics = {
  preferMet: number;
  preferTotal: number;
  avoidViolated: number;
  hardViolations: number;
  existingConflicts: number;
  shortages: number;
  shiftsStdDevByRole: Record<string, number>;
  shiftsSpreadByRole: Record<string, number>;
  cost: number;
  perStaff: { staffId: number; shifts: number; weekendShifts: number; preferMet: number; preferTotal: number }[];
  iterations: number;
  ms: number;
};
export type Explanations = { summary: string; perStaff: Record<string, string>; source: "AI" | "TEMPLATE" };

/** Giống CAUSE_TEXT ở backend (lib/shiftWish/explain.ts) */
export const CAUSE_TEXT: Record<UnmetCause, string> = {
  FULL_BY_OTHERS: "ca đó đã đủ người",
  MAX_WEEK_REACHED: "tuần đó đã đủ số ca tối đa",
  REST_RULE: "vướng ca khác hoặc chưa đủ giờ nghỉ giữa 2 ca",
  NO_SLOT_FOR_ROLE: "ngày đó không cần thêm người ở vị trí này",
  ON_LEAVE: "đang nghỉ phép ngày đó",
  SELF_UNAVAILABLE: "trùng ngày đã báo không thể làm",
  BALANCE_TRADEOFF: "để chia đều số ca giữa mọi người",
};
export const REASON_TEXT: Record<SlotReason, string> = {
  PREFER_MET: "Đúng nguyện vọng của nhân viên",
  ONLY_CANDIDATE: "Chỉ người này làm được ô này",
  BALANCE: "Chia đều số ca trong tháng",
  SAME_SHIFT_TYPE: "Giữ cùng loại ca người này hay làm",
  FILLED_SHORTAGE: "Điền vào chỗ đang thiếu người",
};
export const prefPct = (m: Pick<RunMetrics, "preferMet" | "preferTotal">) => (m.preferTotal ? Math.round((m.preferMet / m.preferTotal) * 100) : 100);
export const maxSpread = (m: Pick<RunMetrics, "shiftsSpreadByRole">) => Math.max(0, ...Object.values(m.shiftsSpreadByRole ?? {}));
