/**
 * lib/autoSchedule.ts — Thuật toán tự xếp lịch tháng (có nguyện vọng nhân viên).
 *
 * Ràng buộc cứng (vi phạm thì không xếp):
 *  - đúng vị trí (role), không trùng ngày nghỉ đã duyệt
 *  - không trùng giờ với ca khác cùng ngày, tối đa 1 ca / ngày
 *  - nghỉ tối thiểu `minRestHours` giữa 2 ca liên tiếp (VD hết ca tối 22:00 → ca sáng 07:00 hôm sau = 9 tiếng)
 *  - tối đa `maxShiftsPerWeek` ca / tuần (T2–CN)
 *  - nguyện vọng "không thể" (UNAVAILABLE) và "tối đa N ca" (MAX_SHIFTS theo tuần / tháng / khoảng ngày)
 * Mục tiêu (ưu tiên khi chọn người — điểm thấp hơn được chọn trước):
 *  - chia đều số ca trong tháng, chia đều ca cuối tuần giữa những người cùng vị trí
 *  - giữ người ở cùng một loại ca (đỡ đảo sáng / tối)
 *  - nguyện vọng mềm: "muốn" (PREFER), "hạn chế" (AVOID), "ít nhất N ca" (MIN_SHIFTS), "nghỉ cố định" (DAY_OFF_PATTERN)
 *  - công bằng nguyện vọng: người đã được đáp ứng nhiều thì giảm ưu tiên dần
 *
 * Cách làm:
 *  1. Tham lam theo từng ngày; trong ngày xếp ô "khó" trước (ít ứng viên so với số người cần).
 *  2. Tìm kiếm cục bộ: thử ngẫu nhiên (có seed) hoán đổi 2 người giữa 2 ô cùng vị trí, chuyển người sang ô thiếu,
 *     thay người trong ô — chỉ nhận bước không vi phạm ràng buộc cứng và làm GIẢM tổng chi phí:
 *     Σ phạt nguyện vọng mềm + W.BALANCE × độ lệch chuẩn số ca (từng vị trí, chỉ người không tự đặt số ca)
 *     + W.WEEKEND_BALANCE × độ lệch chuẩn ca cuối tuần
 *     + W.SHORT × số chỗ thiếu người.
 *  3. Trên lịch cuối: lý do của từng ô, nguyện vọng chưa đáp ứng kèm nguyên nhân, chỉ số.
 * Cùng seed + cùng dữ liệu → cùng kết quả (dừng theo số bước; giới hạn thời gian chỉ là chốt an toàn).
 */

/** Trọng số — dùng cho cả điểm chọn người (tham lam) lẫn hàm chi phí (tìm kiếm cục bộ) */
export const WEIGHTS = {
  /** × số ca trong tháng của người đó (chia đều ca) */
  MONTH: 100,
  /** × số ca cuối tuần (chỉ khi ô rơi vào T7 / CN) */
  WEEKEND: 10,
  /** − × số ca cùng loại đã làm (giữ cùng loại ca) */
  SAME_CODE: 1,
  /** Ô khớp nguyện vọng "muốn". Cố ý < MONTH: chia đều số ca (thu nhập) quan trọng hơn sở thích —
   *  khi tham lam, nguyện vọng chỉ quyết định giữa những người cùng số ca; phần tăng đáp ứng chủ yếu đến từ bước 2. */
  PREFER: 60,
  /** Ô khớp nguyện vọng "hạn chế" */
  AVOID: 40,
  /** Người còn dưới "ít nhất N ca" (mỗi ca còn thiếu khi tính chi phí) */
  MIN: 30,
  /** Ô rơi vào thứ người đó muốn nghỉ cố định */
  DAYOFF: 25,
  /** × số lần nguyện vọng "muốn" đã được đáp ứng (công bằng nguyện vọng, chỉ dùng khi tham lam) */
  FAIR: 8,
  /** × độ lệch chuẩn số ca tháng trong cùng vị trí (hàm chi phí). Đủ lớn để không đổi 1 nguyện vọng lấy lệch ±1 ca */
  BALANCE: 300,
  /** × độ lệch chuẩn số ca cuối tuần trong cùng vị trí (hàm chi phí) */
  WEEKEND_BALANCE: 60,
  /** × mỗi chỗ thiếu người (hàm chi phí) */
  SHORT: 1000,
};
export type Weights = typeof WEIGHTS;

/** Tìm kiếm cục bộ dừng khi `NO_IMPROVE_ROUNDS` vòng liền (mỗi vòng `MOVES_PER_ROUND` bước thử) không giảm được chi phí */
const NO_IMPROVE_ROUNDS = 200;
const MOVES_PER_ROUND = 25;
const MAX_MOVES = 60_000;

export type AutoTemplate = {
  code: string;
  startMin: number;
  endMin: number;
  staffing: { role: string; weekdayCount: number; weekendCount: number }[];
};
export type AutoStaff = { id: number; role: string };
/** Ca đã có (đã duyệt / đang chờ) — giữ nguyên, tính vào định biên & ràng buộc */
export type AutoExisting = { staffId: number | null; date: string; code: string; role: string | null; startMin: number; endMin: number };
export type AutoRules = { minRestHours: number; maxShiftsPerWeek: number };
export type SlotReason = "PREFER_MET" | "ONLY_CANDIDATE" | "BALANCE" | "SAME_SHIFT_TYPE" | "FILLED_SHORTAGE";
export type AutoSlot = { date: string; code: string; role: string; staffId: number | null; startMin: number; endMin: number; reason?: SlotReason };
export type AutoShortage = { date: string; code: string; role: string; need: number; filled: number };

export type WishPeriod = "WEEK" | "MONTH" | "RANGE";
/** Nguyện vọng đã quy đổi (xem lib/shiftWish/normalize.ts → toAutoWish) */
export type AutoWish = {
  ruleId: number;
  type: "UNAVAILABLE" | "PREFER" | "AVOID" | "MAX_SHIFTS" | "MIN_SHIFTS" | "DAY_OFF_PATTERN";
  /** Ngày áp dụng; null = mọi ngày (UNAVAILABLE) / "theo loại ca" (PREFER, AVOID) */
  dates: Set<string> | null;
  /** Mã ca áp dụng (đã quy "mọi ca") */
  codes: Set<string>;
  count: number | null;
  period: WishPeriod | null;
  rangeFrom: string | null;
  rangeTo: string | null;
  /** Thứ (DAY_OFF_PATTERN) */
  weekdays: Set<number> | null;
};
/** SELF_UNAVAILABLE: chính người đó báo "không thể" đúng ô này (nguyện vọng tự mâu thuẫn) */
export type UnmetCause = "FULL_BY_OTHERS" | "MAX_WEEK_REACHED" | "REST_RULE" | "NO_SLOT_FOR_ROLE" | "ON_LEAVE" | "SELF_UNAVAILABLE" | "BALANCE_TRADEOFF";
export type UnmetWish = { staffId: number; ruleId: number; date: string; code: string; cause: UnmetCause; detail: string };
export type AutoMetrics = {
  preferMet: number;
  preferTotal: number;
  avoidViolated: number;
  minShort: number;
  dayOffViolated: number;
  /** Vi phạm ràng buộc cứng ở ca MỚI xếp — phải = 0 */
  hardViolations: number;
  /** Ca cũ (giữ nguyên) trái nguyện vọng "không thể" */
  existingConflicts: number;
  shortages: number;
  shiftsStdDevByRole: Record<string, number>;
  /** Chênh lệch số ca lớn nhất − nhỏ nhất trong cùng vị trí */
  shiftsSpreadByRole: Record<string, number>;
  cost: number;
  perStaff: { staffId: number; shifts: number; weekendShifts: number; preferMet: number; preferTotal: number }[];
  iterations: number;
  improved: number;
  ms: number;
};
export type AutoOptions = { seed?: number; timeBudgetMs?: number; weights?: Partial<Weights>; improve?: boolean };
export type AutoInput = {
  days: string[];
  templates: AutoTemplate[];
  staff: AutoStaff[];
  existing: AutoExisting[];
  /** staffId → các ngày nghỉ (YYYY-MM-DD) */
  leaves: Map<number, Set<string>>;
  rules: AutoRules;
  /** staffId → nguyện vọng đã xác nhận (không truyền = xếp như trước đây) */
  wishes?: Map<number, AutoWish[]>;
  options?: AutoOptions;
};

const DAY_MS = 86_400_000;
const dayIndex = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
/** Thứ trong tuần: 0 = CN … 6 = T7 */
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
export const isWeekend = (date: string) => [0, 6].includes(weekday(date));
/** Khóa tuần (T2 đầu tuần) */
const weekKey = (date: string) => dayIndex(date) - ((weekday(date) + 6) % 7);
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Bộ sinh số ngẫu nhiên có seed (mulberry32) — chạy lại cùng seed ra cùng kết quả */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const stdDev = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
};

type Busy = { start: number; end: number; date: string; code: string; isNew: boolean };
type WishGroups = { unav: AutoWish[]; prefer: AutoWish[]; avoid: AutoWish[]; min: AutoWish[]; max: AutoWish[]; dayOff: Set<number> };
const NO_WISH: WishGroups = { unav: [], prefer: [], avoid: [], min: [], max: [], dayOff: new Set() };
const matches = (w: AutoWish, date: string, code: string) => (!w.dates || w.dates.has(date)) && w.codes.has(code);

/** Trạng thái lịch (ca của từng người + bộ đếm) và các phép kiểm tra / tính điểm / chi phí trên trạng thái đó */
function createEngine(input: AutoInput, W: Weights) {
  const { days, staff, leaves, rules } = input;
  const minRest = rules.minRestHours * 60;
  const inMonth = new Set(days);
  const monthFirst = days.length ? `${days[0].slice(0, 8)}01` : "";
  const monthLast = days.length ? days[days.length - 1] : "";
  /** Tuần trọn vẹn trong các ngày được xếp (MIN_SHIFTS theo tuần chỉ xét tuần trọn) */
  const fullWeeks = [...new Set(days.map(weekKey))].filter((k) => days.filter((d) => weekKey(d) === k).length === 7);

  const busy = new Map<number, Busy[]>();
  const monthCount = new Map<number, number>();
  const weekendCount = new Map<number, number>();
  const codeCount = new Map<string, number>(); // `${staffId}|${code}`
  const weekCount = new Map<string, number>(); // `${staffId}|${week}`

  const groups = new Map<number, WishGroups>();
  for (const [id, list] of input.wishes ?? []) {
    const g: WishGroups = { unav: [], prefer: [], avoid: [], min: [], max: [], dayOff: new Set() };
    for (const w of list) {
      if (w.type === "UNAVAILABLE") g.unav.push(w);
      else if (w.type === "PREFER") g.prefer.push(w);
      else if (w.type === "AVOID") g.avoid.push(w);
      else if (w.type === "MIN_SHIFTS") g.min.push(w);
      else if (w.type === "MAX_SHIFTS") g.max.push(w);
      else if (w.type === "DAY_OFF_PATTERN") for (const d of w.weekdays ?? []) g.dayOff.add(d);
    }
    groups.set(id, g);
  }
  const G = (id: number) => groups.get(id) ?? NO_WISH;

  const inc = (m: Map<string | number, number>, k: string | number, n: number) => m.set(k, (m.get(k) ?? 0) + n);
  const count = (id: number, date: string, code: string, n: number) => {
    inc(weekCount as Map<string, number>, `${id}|${weekKey(date)}`, n);
    if (!inMonth.has(date)) return;
    inc(monthCount as Map<number, number>, id, n);
    if (isWeekend(date)) inc(weekendCount as Map<number, number>, id, n);
    inc(codeCount as Map<string, number>, `${id}|${code}`, n);
  };
  const take = (id: number, date: string, code: string, startMin: number, endMin: number, isNew: boolean) => {
    const base = dayIndex(date) * 1440;
    const end = endMin > startMin ? endMin : endMin + 1440; // ca qua đêm
    (busy.get(id) ?? busy.set(id, []).get(id)!).push({ start: base + startMin, end: base + end, date, code, isNew });
    count(id, date, code, 1);
  };
  const untake = (id: number, date: string, code: string) => {
    const list = busy.get(id)!;
    list.splice(list.findIndex((b) => b.date === date && b.code === code && b.isNew), 1);
    count(id, date, code, -1);
  };

  const rangeCount = (id: number, from: string, to: string) => (busy.get(id) ?? []).filter((b) => b.date >= from && b.date <= to).length;
  /** Số ca của người đó trong kỳ của nguyện vọng số ca, kỳ chứa ngày `date` */
  const periodCount = (id: number, w: AutoWish, date: string) =>
    w.period === "WEEK" ? weekCount.get(`${id}|${weekKey(date)}`) ?? 0
    : w.period === "RANGE" ? rangeCount(id, w.rangeFrom ?? monthFirst, w.rangeTo ?? monthLast)
    : rangeCount(id, monthFirst, monthLast);
  const inPeriod = (w: AutoWish, date: string) => w.period !== "RANGE" || (date >= (w.rangeFrom ?? monthFirst) && date <= (w.rangeTo ?? monthLast));

  /** Lý do không làm được (null = làm được) */
  const blockOf = (s: AutoStaff, date: string, t: { code: string; startMin: number; endMin: number }): "LEAVE" | "UNAVAILABLE" | "MAX_WEEK" | "REST" | null => {
    if (leaves.get(s.id)?.has(date)) return "LEAVE";
    const g = G(s.id);
    if (g.unav.some((w) => matches(w, date, t.code))) return "UNAVAILABLE";
    if ((weekCount.get(`${s.id}|${weekKey(date)}`) ?? 0) >= rules.maxShiftsPerWeek) return "MAX_WEEK";
    if (g.max.some((w) => inPeriod(w, date) && periodCount(s.id, w, date) >= (w.count ?? Infinity))) return "MAX_WEEK";
    const base = dayIndex(date) * 1440;
    const start = base + t.startMin;
    const end = base + (t.endMin > t.startMin ? t.endMin : t.endMin + 1440);
    for (const b of busy.get(s.id) ?? []) {
      if (b.date === date) return "REST"; // tối đa 1 ca / ngày
      if (start < b.end + minRest && b.start < end + minRest) return "REST"; // trùng giờ hoặc nghỉ chưa đủ
    }
    return null;
  };
  const canWork = (s: AutoStaff, date: string, t: { code: string; startMin: number; endMin: number }) => blockOf(s, date, t) === null;

  /** Điểm chọn người cho ô (thấp hơn = ưu tiên) */
  const pickScore = (s: AutoStaff, date: string, code: string, fair: number) => {
    const g = G(s.id);
    let score = (monthCount.get(s.id) ?? 0) * W.MONTH + (isWeekend(date) ? (weekendCount.get(s.id) ?? 0) * W.WEEKEND : 0) - (codeCount.get(`${s.id}|${code}`) ?? 0) * W.SAME_CODE;
    if (g.prefer.some((w) => matches(w, date, code))) score -= W.PREFER;
    if (g.avoid.some((w) => matches(w, date, code))) score += W.AVOID;
    if (g.min.some((w) => inPeriod(w, date) && periodCount(s.id, w, date) < (w.count ?? 0))) score -= W.MIN;
    if (g.dayOff.has(weekday(date))) score += W.DAYOFF;
    return score + fair * W.FAIR;
  };

  /** Ca của người đó trong các ngày được xếp */
  const entries = (id: number) => (busy.get(id) ?? []).filter((b) => inMonth.has(b.date));

  /** Phạt nguyện vọng mềm của 1 người + chi tiết đếm */
  const wishStats = (id: number) => {
    const g = G(id);
    const es = entries(id);
    let preferMet = 0, preferTotal = 0, avoid = 0, minShort = 0, dayOff = 0;
    for (const w of g.prefer) {
      if (w.dates) {
        for (const d of w.dates) {
          if (!inMonth.has(d)) continue;
          preferTotal++;
          if (es.some((e) => e.date === d && w.codes.has(e.code))) preferMet++;
        }
      } else {
        for (const e of es) {
          preferTotal++;
          if (w.codes.has(e.code)) preferMet++;
        }
      }
    }
    for (const w of g.avoid) for (const e of es) if (matches(w, e.date, e.code)) avoid++;
    for (const w of g.min) {
      const need = w.count ?? 0;
      if (w.period === "WEEK") for (const k of fullWeeks) minShort += Math.max(0, need - (weekCount.get(`${id}|${k}`) ?? 0));
      else minShort += Math.max(0, need - periodCount(id, w, days[0] ?? monthFirst));
    }
    for (const e of es) if (g.dayOff.has(weekday(e.date))) dayOff++;
    const penalty = (preferTotal - preferMet) * W.PREFER + avoid * W.AVOID + minShort * W.MIN + dayOff * W.DAYOFF;
    return { preferMet, preferTotal, avoid, minShort, dayOff, penalty };
  };

  const roles = [...new Set(staff.map((s) => s.role))];
  const byRole = new Map(roles.map((r) => [r, staff.filter((s) => s.role === r)]));
  /** Người không tự đặt số ca (MAX / MIN_SHIFTS) — chỉ những người này mới cần chia đều với nhau */
  const balanceByRole = new Map(roles.map((r) => [r, byRole.get(r)!.filter((s) => !G(s.id).max.length && !G(s.id).min.length)]));
  const balanceCost = () => {
    let c = 0;
    for (const list of balanceByRole.values()) {
      c += W.BALANCE * stdDev(list.map((s) => monthCount.get(s.id) ?? 0));
      c += W.WEEKEND_BALANCE * stdDev(list.map((s) => weekendCount.get(s.id) ?? 0));
    }
    return c;
  };

  return { busy, monthCount, weekendCount, codeCount, weekCount, G, take, untake, blockOf, canWork, pickScore, wishStats, balanceCost, byRole, balanceByRole, entries, inMonth };
}

type Engine = ReturnType<typeof createEngine>;

/** Chỉ số + nguyện vọng chưa đáp ứng trên một lịch (engine đã chứa ca cũ + ca mới) */
function measure(E: Engine, input: AutoInput, slots: AutoSlot[], W: Weights, extra: { iterations: number; improved: number; ms: number }) {
  const { staff, leaves, templates, rules, existing } = input;
  const tpl = new Map(templates.map((t) => [t.code, t]));
  const minRest = rules.minRestHours * 60;
  const needOf = (date: string, code: string, role: string) => {
    const r = tpl.get(code)?.staffing.find((x) => x.role === role);
    return r ? (isWeekend(date) ? r.weekendCount : r.weekdayCount) : 0;
  };
  /** Ô (ngày, ca, vị trí) còn chỗ trống không */
  const openCell = new Set(slots.filter((s) => s.staffId == null).map((s) => `${s.date}|${s.code}|${s.role}`));

  let preferMet = 0, preferTotal = 0, avoidViolated = 0, minShort = 0, dayOffViolated = 0, penalty = 0;
  const perStaff: AutoMetrics["perStaff"] = [];
  const unmetWishes: UnmetWish[] = [];
  for (const s of staff) {
    const st = E.wishStats(s.id);
    preferMet += st.preferMet;
    preferTotal += st.preferTotal;
    avoidViolated += st.avoid;
    minShort += st.minShort;
    dayOffViolated += st.dayOff;
    penalty += st.penalty;
    perStaff.push({ staffId: s.id, shifts: E.monthCount.get(s.id) ?? 0, weekendShifts: E.weekendCount.get(s.id) ?? 0, preferMet: st.preferMet, preferTotal: st.preferTotal });

    // Nguyên nhân từng lần "muốn" không được đáp ứng (tính trên lịch cuối)
    const es = E.entries(s.id);
    const cause = (date: string, codes: Set<string>, ruleId: number) => {
      const code = [...codes].find((c) => needOf(date, c, s.role) > 0);
      const push = (c: UnmetCause, detail: string) => unmetWishes.push({ staffId: s.id, ruleId, date, code: code ?? [...codes][0], cause: c, detail });
      if (leaves.get(s.id)?.has(date)) return push("ON_LEAVE", `Nghỉ phép ngày ${dm(date)}`);
      if (E.G(s.id).unav.some((w) => matches(w, date, code ?? [...codes][0]))) return push("SELF_UNAVAILABLE", `Chính nhân viên báo không thể làm ca này ngày ${dm(date)}`);
      if (!code || !E.inMonth.has(date)) return push("NO_SLOT_FOR_ROLE", `Ngày ${dm(date)} không có ca này cho vị trí ${s.role}`);
      const need = needOf(date, code, s.role);
      if (!openCell.has(`${date}|${code}|${s.role}`)) return push("FULL_BY_OTHERS", `Ca ${code} ${dm(date)} đã đủ ${need} người`);
      const block = E.blockOf(s, date, tpl.get(code)!);
      if (block === "MAX_WEEK") return push("MAX_WEEK_REACHED", `Đã đủ số ca tối đa trong tuần`);
      if (block === "REST") return push("REST_RULE", `Vướng ca khác / giờ nghỉ tối thiểu ngày ${dm(date)}`);
      return push("BALANCE_TRADEOFF", `Nhường để chia đều số ca`);
    };
    for (const w of E.G(s.id).prefer) {
      if (w.dates) {
        for (const d of w.dates) if (E.inMonth.has(d) && !es.some((e) => e.date === d && w.codes.has(e.code))) cause(d, w.codes, w.ruleId);
      } else {
        for (const e of es) if (!w.codes.has(e.code)) cause(e.date, w.codes, w.ruleId);
      }
    }
  }

  // Vi phạm ràng buộc cứng ở ca mới (kiểm tra lại độc lập với lúc xếp)
  let hardViolations = 0;
  for (const s of staff) {
    const all = [...(E.busy.get(s.id) ?? [])].sort((a, b) => a.start - b.start);
    const g = E.G(s.id);
    for (const b of all) {
      if (!b.isNew) continue;
      if (leaves.get(s.id)?.has(b.date)) hardViolations++;
      if (g.unav.some((w) => matches(w, b.date, b.code))) hardViolations++;
    }
    for (let i = 1; i < all.length; i++) {
      const [a, b] = [all[i - 1], all[i]];
      if (!a.isNew && !b.isNew) continue;
      if (a.date === b.date || b.start < a.end + minRest) hardViolations++;
    }
    const weeks = new Map<number, { n: number; isNew: boolean }>();
    for (const b of all) {
      const w = weeks.get(weekKey(b.date)) ?? { n: 0, isNew: false };
      w.n++;
      w.isNew ||= b.isNew;
      weeks.set(weekKey(b.date), w);
    }
    for (const w of weeks.values()) if (w.isNew && w.n > rules.maxShiftsPerWeek) hardViolations += w.n - rules.maxShiftsPerWeek;
    for (const w of g.max) {
      const inP = (d: string) => (w.period === "WEEK" ? true : w.period === "RANGE" ? d >= (w.rangeFrom ?? "") && d <= (w.rangeTo ?? "9") : d.slice(0, 7) === (input.days[0] ?? "").slice(0, 7));
      if (w.period === "WEEK") {
        for (const [k, v] of weeks) {
          const n = all.filter((b) => weekKey(b.date) === k).length;
          if (v.isNew && n > (w.count ?? Infinity)) hardViolations += n - (w.count ?? 0);
        }
      } else {
        const inside = all.filter((b) => inP(b.date));
        if (inside.some((b) => b.isNew) && inside.length > (w.count ?? Infinity)) hardViolations += inside.length - (w.count ?? 0);
      }
    }
  }
  let existingConflicts = 0;
  for (const e of existing) {
    if (e.staffId == null || !E.inMonth.has(e.date)) continue;
    if (E.G(e.staffId).unav.some((w) => matches(w, e.date, e.code))) existingConflicts++;
  }

  const shiftsStdDevByRole: Record<string, number> = {};
  const shiftsSpreadByRole: Record<string, number> = {};
  // Độ lệch số ca chỉ tính trên người không tự đặt số ca (người ghi "tối đa / ít nhất N ca" cố ý khác người khác)
  for (const [role, list] of E.balanceByRole) {
    const xs = list.map((s) => E.monthCount.get(s.id) ?? 0);
    shiftsStdDevByRole[role] = Math.round(stdDev(xs) * 100) / 100;
    shiftsSpreadByRole[role] = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  }
  const shortages = slots.filter((s) => s.staffId == null).length;
  const metrics: AutoMetrics = {
    preferMet, preferTotal, avoidViolated, minShort, dayOffViolated, hardViolations, existingConflicts, shortages,
    shiftsStdDevByRole, shiftsSpreadByRole,
    cost: Math.round(penalty + E.balanceCost() + shortages * W.SHORT),
    perStaff,
    ...extra,
  };
  return { metrics, unmetWishes };
}

/** Chấm một lịch có sẵn (VD bản tham lam cũ) theo cùng bộ nguyện vọng — để so sánh phương án */
export function evaluateSchedule(input: AutoInput, slots: AutoSlot[]) {
  const W = { ...WEIGHTS, ...input.options?.weights };
  const E = createEngine(input, W);
  for (const e of input.existing) if (e.staffId != null) E.take(e.staffId, e.date, e.code, e.startMin, e.endMin, false);
  for (const s of slots) if (s.staffId != null) E.take(s.staffId, s.date, s.code, s.startMin, s.endMin, true);
  return measure(E, input, slots, W, { iterations: 0, improved: 0, ms: 0 });
}

export function autoSchedule(input: AutoInput) {
  const t0 = Date.now();
  const { days, templates, staff, existing } = input;
  const opt = { seed: 1, timeBudgetMs: 2000, improve: true, ...input.options };
  const W = { ...WEIGHTS, ...opt.weights };
  const rand = mulberry32(opt.seed);
  const E = createEngine(input, W);
  for (const e of existing) if (e.staffId != null) E.take(e.staffId, e.date, e.code, e.startMin, e.endMin, false);

  /** Số lần nguyện vọng "muốn" đã đáp ứng (công bằng nguyện vọng khi tham lam) */
  const fair = new Map<number, number>();
  const slots: AutoSlot[] = [];

  // 1. Tham lam
  for (const date of days) {
    const weekend = isWeekend(date);
    // Các ô cần xếp trong ngày: (ca, vị trí, số người còn thiếu)
    const cells = templates.flatMap((t) =>
      t.staffing.map((r) => {
        const need = weekend ? r.weekendCount : r.weekdayCount;
        const have = existing.filter((e) => e.date === date && e.code === t.code && e.role === r.role).length;
        return { t, role: r.role, need, remaining: Math.max(0, need - have) };
      }),
    ).filter((c) => c.remaining > 0);

    const pool = (c: (typeof cells)[number]) => staff.filter((s) => s.role === c.role && E.canWork(s, date, c.t));
    cells.sort((a, b) => pool(a).length - a.remaining - (pool(b).length - b.remaining));

    for (const c of cells) {
      const picked = pool(c)
        .map((s) => ({ s, score: E.pickScore(s, date, c.t.code, fair.get(s.id) ?? 0) + rand() })) // hòa điểm thì bốc ngẫu nhiên (có seed)
        .sort((a, b) => a.score - b.score)
        .slice(0, c.remaining)
        .map((x) => x.s);

      for (const s of picked) {
        E.take(s.id, date, c.t.code, c.t.startMin, c.t.endMin, true);
        if (E.G(s.id).prefer.some((w) => matches(w, date, c.t.code))) fair.set(s.id, (fair.get(s.id) ?? 0) + 1);
      }
      for (let i = 0; i < c.remaining; i++) {
        slots.push({ date, code: c.t.code, role: c.role, staffId: picked[i]?.id ?? null, startMin: c.t.startMin, endMin: c.t.endMin });
      }
    }
  }

  // 2. Tìm kiếm cục bộ
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const filledByLs = new Set<number>(); // ô trống được bước 2 điền người
  let iterations = 0, improved = 0;
  if (opt.improve && slots.length) {
    const cache = new Map(staff.map((s) => [s.id, E.wishStats(s.id).penalty]));
    let shortCount = slots.filter((s) => s.staffId == null).length;
    let wishSum = [...cache.values()].reduce((a, b) => a + b, 0);
    let cost = wishSum + E.balanceCost() + shortCount * W.SHORT;
    const slotsByRole = new Map<string, number[]>();
    slots.forEach((s, i) => (slotsByRole.get(s.role) ?? slotsByRole.set(s.role, []).get(s.role)!).push(i));

    type Op = { i: number; prev: number | null };
    let log: Op[] = [];
    const assign = (i: number, id: number | null) => {
      const s = slots[i];
      log.push({ i, prev: s.staffId });
      if (s.staffId != null) E.untake(s.staffId, s.date, s.code);
      if (id != null) E.take(id, s.date, s.code, s.startMin, s.endMin, true);
      s.staffId = id;
    };
    const rollback = () => {
      for (const op of log.reverse()) {
        const s = slots[op.i];
        if (s.staffId != null) E.untake(s.staffId, s.date, s.code);
        if (op.prev != null) E.take(op.prev, s.date, s.code, s.startMin, s.endMin, true);
        s.staffId = op.prev;
      }
      log = [];
    };
    const ok = (id: number, i: number) => E.canWork(staffById.get(id)!, slots[i].date, slots[i]);
    const pickIn = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

    let noImprove = 0;
    while (iterations < MAX_MOVES && noImprove < NO_IMPROVE_ROUNDS * MOVES_PER_ROUND && Date.now() - t0 < opt.timeBudgetMs) {
      iterations++;
      noImprove++;
      log = [];
      const i = Math.floor(rand() * slots.length);
      const si = slots[i];
      const same = slotsByRole.get(si.role)!;
      const r = rand();
      const touched = new Set<number>();
      let valid = false;
      if (r < 0.5) {
        // (a) hoán đổi người giữa 2 ô cùng vị trí khác ngày / khác ca
        const j = pickIn(same);
        const sj = slots[j];
        const a = si.staffId, b = sj.staffId;
        if (a != null && b != null && a !== b && (si.date !== sj.date || si.code !== sj.code)) {
          assign(i, null);
          assign(j, null);
          if (ok(a, j)) {
            assign(j, a);
            if (ok(b, i)) {
              assign(i, b);
              valid = true;
              touched.add(a).add(b);
            }
          }
        }
      } else if (r < 0.75) {
        // (b) chuyển người từ ô đang có người sang ô thiếu cùng vị trí / (điền ô thiếu bằng người cùng vị trí)
        const empties = same.filter((k) => slots[k].staffId == null);
        if (empties.length) {
          const j = pickIn(empties);
          if (si.staffId != null && i !== j) {
            const a = si.staffId;
            assign(i, null);
            if (ok(a, j)) {
              assign(j, a);
              valid = true;
              touched.add(a);
            }
          } else {
            const cand = E.byRole.get(slots[j].role) ?? [];
            const b = cand.length ? pickIn(cand).id : null;
            if (b != null && ok(b, j)) {
              assign(j, b);
              valid = true;
              touched.add(b);
            }
          }
          if (valid) filledByLs.add(j);
        }
      } else {
        // (c) thay người trong ô bằng người khác cùng vị trí
        const cand = E.byRole.get(si.role) ?? [];
        const b = cand.length ? pickIn(cand).id : null;
        if (b != null && b !== si.staffId) {
          const a = si.staffId;
          assign(i, null);
          if (ok(b, i)) {
            assign(i, b);
            valid = true;
            touched.add(b);
            if (a != null) touched.add(a);
            if (a == null) filledByLs.add(i);
          }
        }
      }
      if (!valid) {
        rollback();
        continue;
      }
      const prevPen = new Map([...touched].map((id) => [id, cache.get(id) ?? 0]));
      let nextWish = wishSum;
      for (const id of touched) {
        const p = E.wishStats(id).penalty;
        nextWish += p - prevPen.get(id)!;
        cache.set(id, p);
      }
      const nextShort = slots.filter((s) => s.staffId == null).length;
      const next = nextWish + E.balanceCost() + nextShort * W.SHORT;
      if (next < cost - 1e-9) {
        cost = next;
        wishSum = nextWish;
        shortCount = nextShort;
        improved++;
        noImprove = 0;
      } else {
        for (const [id, p] of prevPen) cache.set(id, p);
        rollback();
      }
    }
  }

  // 3. Lý do từng ô (trên lịch cuối)
  for (const [i, s] of slots.entries()) {
    if (s.staffId == null) continue;
    const id = s.staffId;
    if (E.G(id).prefer.some((w) => matches(w, s.date, s.code))) {
      s.reason = "PREFER_MET";
      continue;
    }
    E.untake(id, s.date, s.code);
    const others = staff.filter((x) => x.role === s.role && x.id !== id && E.canWork(x, s.date, s)).length;
    E.take(id, s.date, s.code, s.startMin, s.endMin, true);
    if (others === 0) s.reason = "ONLY_CANDIDATE";
    else if (filledByLs.has(i)) s.reason = "FILLED_SHORTAGE";
    else {
      const counts = templates.map((t) => E.codeCount.get(`${id}|${t.code}`) ?? 0);
      s.reason = (E.codeCount.get(`${id}|${s.code}`) ?? 0) >= Math.max(...counts) && counts.filter((n) => n > 0).length > 1 ? "SAME_SHIFT_TYPE" : "BALANCE";
    }
  }

  // Ô thiếu người (giữ dạng cũ: need / filled theo ô)
  const shortages: AutoShortage[] = [];
  const cellMap = new Map<string, { date: string; code: string; role: string; slots: number; empty: number }>();
  for (const s of slots) {
    const k = `${s.date}|${s.code}|${s.role}`;
    const c = cellMap.get(k) ?? cellMap.set(k, { date: s.date, code: s.code, role: s.role, slots: 0, empty: 0 }).get(k)!;
    c.slots++;
    if (s.staffId == null) c.empty++;
  }
  for (const c of cellMap.values()) {
    if (!c.empty) continue;
    const t = templates.find((x) => x.code === c.code)!;
    const r = t.staffing.find((x) => x.role === c.role)!;
    const need = isWeekend(c.date) ? r.weekendCount : r.weekdayCount;
    shortages.push({ date: c.date, code: c.code, role: c.role, need, filled: need - c.empty });
  }

  const { metrics, unmetWishes } = measure(E, input, slots, W, { iterations, improved, ms: Date.now() - t0 });
  return { slots, shortages, metrics, unmetWishes, seed: opt.seed };
}
