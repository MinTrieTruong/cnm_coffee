/**
 * lib/autoSchedule.ts — Thuật toán tự xếp lịch tháng.
 *
 * Ràng buộc cứng (vi phạm thì không xếp):
 *  - đúng vị trí (role), không trùng ngày nghỉ đã duyệt
 *  - không trùng giờ với ca khác cùng ngày
 *  - nghỉ tối thiểu `minRestHours` giữa 2 ca liên tiếp (VD hết ca tối 22:00 → ca sáng 07:00 hôm sau = 9 tiếng)
 *  - tối đa `maxShiftsPerWeek` ca / tuần (T2–CN)
 * Mục tiêu (ưu tiên khi chọn người):
 *  - chia đều số ca trong tháng giữa những người cùng vị trí
 *  - chia đều ca cuối tuần
 *  - ưu tiên giữ người ở cùng một loại ca (đỡ đảo sáng/tối)
 *
 * Cách làm: tham lam theo từng ngày; trong ngày xếp ô "khó" trước
 * (ít ứng viên so với số người cần) để không bị hết người ở ô khó.
 */

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
export type AutoSlot = { date: string; code: string; role: string; staffId: number | null; startMin: number; endMin: number };
export type AutoShortage = { date: string; code: string; role: string; need: number; filled: number };

const DAY_MS = 86_400_000;
const dayIndex = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
/** Thứ trong tuần: 0 = CN … 6 = T7 */
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
export const isWeekend = (date: string) => [0, 6].includes(weekday(date));
/** Khóa tuần (T2 đầu tuần) */
const weekKey = (date: string) => dayIndex(date) - ((weekday(date) + 6) % 7);

export function autoSchedule(input: {
  days: string[];
  templates: AutoTemplate[];
  staff: AutoStaff[];
  existing: AutoExisting[];
  /** staffId → các ngày nghỉ (YYYY-MM-DD) */
  leaves: Map<number, Set<string>>;
  rules: AutoRules;
}) {
  const { days, templates, staff, existing, leaves, rules } = input;
  const minRest = rules.minRestHours * 60;

  // Ca của từng người, theo mốc phút tuyệt đối (để xét giờ nghỉ qua ngày)
  type Busy = { start: number; end: number; date: string; code: string };
  const busy = new Map<number, Busy[]>();
  const monthCount = new Map<number, number>();
  const weekendCount = new Map<number, number>();
  const codeCount = new Map<string, number>(); // `${staffId}|${code}`
  const weekCount = new Map<string, number>(); // `${staffId}|${week}`
  const inMonth = new Set(days);

  const take = (id: number, date: string, code: string, startMin: number, endMin: number) => {
    const base = dayIndex(date) * 1440;
    const end = endMin > startMin ? endMin : endMin + 1440; // ca qua đêm
    (busy.get(id) ?? busy.set(id, []).get(id)!).push({ start: base + startMin, end: base + end, date, code });
    weekCount.set(`${id}|${weekKey(date)}`, (weekCount.get(`${id}|${weekKey(date)}`) ?? 0) + 1);
    if (!inMonth.has(date)) return;
    monthCount.set(id, (monthCount.get(id) ?? 0) + 1);
    if (isWeekend(date)) weekendCount.set(id, (weekendCount.get(id) ?? 0) + 1);
    codeCount.set(`${id}|${code}`, (codeCount.get(`${id}|${code}`) ?? 0) + 1);
  };
  for (const e of existing) if (e.staffId != null) take(e.staffId, e.date, e.code, e.startMin, e.endMin);

  const canWork = (s: AutoStaff, date: string, t: AutoTemplate) => {
    if (leaves.get(s.id)?.has(date)) return false;
    if ((weekCount.get(`${s.id}|${weekKey(date)}`) ?? 0) >= rules.maxShiftsPerWeek) return false;
    const base = dayIndex(date) * 1440;
    const start = base + t.startMin;
    const end = base + (t.endMin > t.startMin ? t.endMin : t.endMin + 1440);
    for (const b of busy.get(s.id) ?? []) {
      if (b.date === date) return false; // tối đa 1 ca / ngày
      if (start < b.end + minRest && b.start < end + minRest) return false; // trùng giờ hoặc nghỉ chưa đủ
    }
    return true;
  };

  const slots: AutoSlot[] = [];
  const shortages: AutoShortage[] = [];

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

    const pool = (c: (typeof cells)[number]) => staff.filter((s) => s.role === c.role && canWork(s, date, c.t));
    cells.sort((a, b) => pool(a).length - a.remaining - (pool(b).length - b.remaining));

    for (const c of cells) {
      const picked = pool(c)
        .map((s) => ({
          s,
          score:
            (monthCount.get(s.id) ?? 0) * 100 +
            (weekend ? (weekendCount.get(s.id) ?? 0) * 10 : 0) -
            (codeCount.get(`${s.id}|${c.t.code}`) ?? 0) +
            Math.random(), // hòa điểm thì bốc ngẫu nhiên
        }))
        .sort((a, b) => a.score - b.score)
        .slice(0, c.remaining)
        .map((x) => x.s);

      for (const s of picked) take(s.id, date, c.t.code, c.t.startMin, c.t.endMin);
      for (let i = 0; i < c.remaining; i++) {
        slots.push({ date, code: c.t.code, role: c.role, staffId: picked[i]?.id ?? null, startMin: c.t.startMin, endMin: c.t.endMin });
      }
      if (picked.length < c.remaining) {
        shortages.push({ date, code: c.t.code, role: c.role, need: c.need, filled: c.need - c.remaining + picked.length });
      }
    }
  }
  return { slots, shortages };
}
