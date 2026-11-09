/**
 * lib/shiftWish/normalize.ts — Quy đổi & kiểm tra ràng buộc nguyện vọng xếp ca (code thuần, không AI).
 *
 * Dùng chung cho: kết quả AI đọc câu (parse.ts), ràng buộc nhân viên thêm / sửa tay (PUT), bản đồ nhiệt
 * của quản lý, và thuật toán xếp ca có nguyện vọng (prompt B).
 *
 * Đơn vị đếm: mỗi rule quy về các "lần" (ngày, tập mã ca) — expandRule().
 *  - Rule có ngày / thứ / khoảng ngày → mỗi ngày trong tháng thỏa phạm vi là một lần.
 *  - Rule không có phạm vi ngày → dates = null: UNAVAILABLE hiểu là mọi ngày; PREFER / AVOID là "theo loại ca"
 *    (mỗi ca được xếp cho người đó là một lần).
 *  - Ca: shiftCodes, hoặc khung giờ timeFrom–timeTo quy ra các ca có giờ giao nhau; không có = mọi ca.
 */

export const WISH_TYPES = ["UNAVAILABLE", "PREFER", "AVOID", "MAX_SHIFTS", "MIN_SHIFTS", "DAY_OFF_PATTERN"] as const;
export type WishType = (typeof WISH_TYPES)[number];
export const WISH_PERIODS = ["WEEK", "MONTH", "RANGE"] as const;
export type WishPeriod = (typeof WISH_PERIODS)[number];

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

export type WishTemplate = { code: string; name: string; startMin: number; endMin: number };
export type WishContext = {
  month: string;
  /** Các ngày của tháng (YYYY-MM-DD) */
  days: string[];
  /** Ca đang dùng */
  templates: WishTemplate[];
  maxRules: number;
};

/** UNAVAILABLE phủ quá tỉ lệ này (ngày × ca của tháng) → cảnh báo nguyện vọng quá hẹp */
export const NARROW_RATIO = 0.6;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Các ngày (YYYY-MM-DD) của tháng "YYYY-MM"; null nếu sai định dạng */
export function monthDays(month: string): string[] | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const n = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${m[1]}-${m[2]}-${pad2(i + 1)}`);
}

/** Thứ trong tuần: 0 = CN … 6 = T7 */
export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Khung giờ của ca trên trục 0–2880 phút (ca qua đêm kéo sang ngày sau) */
const span = (startMin: number, endMin: number): [number, number] => [startMin, endMin > startMin ? endMin : endMin + 1440];

/** Các ca có giờ giao với khung timeFrom–timeTo (khung qua đêm khi timeTo ≤ timeFrom) */
export function codesForTime(timeFrom: number, timeTo: number, templates: WishTemplate[]): string[] {
  const [a, b] = span(timeFrom, timeTo);
  return templates
    .filter((t) => {
      const [s, e] = span(t.startMin, t.endMin);
      // so cả khung lùi / tiến 1 ngày để bắt ca qua đêm
      return [-1440, 0, 1440].some((d) => s + d < b && a < e + d);
    })
    .map((t) => t.code);
}

/** Tập mã ca của rule (đã quy khung giờ); null = mọi ca */
export function ruleCodes(rule: Pick<WishRule, "shiftCodes" | "timeFrom" | "timeTo">, templates: WishTemplate[]): string[] | null {
  if (rule.shiftCodes?.length) return rule.shiftCodes;
  if (rule.timeFrom != null && rule.timeTo != null) return codesForTime(rule.timeFrom, rule.timeTo, templates);
  return null;
}

/** Các ngày trong tháng thỏa phạm vi của rule; null = rule không giới hạn theo ngày */
export function ruleDates(rule: Pick<WishRule, "dates" | "weekdays" | "fromDate" | "toDate">, days: string[]): string[] | null {
  if (rule.dates?.length) {
    const set = new Set(rule.dates);
    return days.filter((d) => set.has(d));
  }
  const ranged = rule.fromDate != null || rule.toDate != null;
  if (!rule.weekdays?.length && !ranged) return null;
  const from = rule.fromDate ?? days[0];
  const to = rule.toDate ?? days[days.length - 1];
  const wd = rule.weekdays?.length ? new Set(rule.weekdays) : null;
  return days.filter((d) => d >= from && d <= to && (!wd || wd.has(weekdayOf(d))));
}

export type ExpandedRule = {
  /** Các ngày áp dụng; null = không giới hạn ngày (xem chú thích đầu file) */
  dates: string[] | null;
  /** Mã ca áp dụng (đã quy "mọi ca" thành danh sách ca đang dùng) */
  codes: string[];
};

export function expandRule(rule: WishRule, ctx: Pick<WishContext, "days" | "templates">): ExpandedRule {
  return {
    dates: ruleDates(rule, ctx.days),
    codes: ruleCodes(rule, ctx.templates) ?? ctx.templates.map((t) => t.code),
  };
}

const cellKey = (date: string, code: string) => `${date}|${code}`;

/**
 * Các ô (ngày|mã ca) theo loại nguyện vọng — cho bản đồ nhiệt / lịch xem trước.
 * PREFER / AVOID không có ngày → tính cho mọi ngày (người đó thích / ngại loại ca này).
 */
export function wishCells(rules: WishRule[], ctx: Pick<WishContext, "days" | "templates">) {
  const out = { unavailable: new Set<string>(), prefer: new Set<string>(), avoid: new Set<string>() };
  for (const r of rules) {
    const target = r.type === "UNAVAILABLE" ? out.unavailable : r.type === "PREFER" ? out.prefer : r.type === "AVOID" ? out.avoid : null;
    if (!target) continue;
    const { dates, codes } = expandRule(r, ctx);
    for (const d of dates ?? ctx.days) for (const c of codes) target.add(cellKey(d, c));
  }
  return out;
}

/* ═══════════ Kiểm tra (kết quả AI lẫn dữ liệu người dùng gửi lên) ═══════════ */

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : typeof v === "string" && /^-?\d+$/.test(v.trim()) ? Number(v) : null);
const arr = (v: unknown): unknown[] | null => (Array.isArray(v) ? v : null);
const TYPE_LABEL: Record<WishType, string> = {
  UNAVAILABLE: "Không thể",
  PREFER: "Muốn",
  AVOID: "Hạn chế",
  MAX_SHIFTS: "Tối đa số ca",
  MIN_SHIFTS: "Tối thiểu số ca",
  DAY_OFF_PATTERN: "Nghỉ cố định",
};

export type ValidateResult = {
  rules: WishRule[];
  warnings: string[];
  /** UNAVAILABLE phủ quá NARROW_RATIO số ô ngày × ca */
  narrow: boolean;
};

/** Chuẩn hóa + kiểm tra danh sách rule; rule hỏng bị loại kèm cảnh báo (không âm thầm bỏ) */
export function validateRules(raw: unknown, ctx: WishContext): ValidateResult {
  const warnings: string[] = [];
  const daySet = new Set(ctx.days);
  const codeSet = new Set(ctx.templates.map((t) => t.code));
  const first = ctx.days[0];
  const last = ctx.days[ctx.days.length - 1];
  const out: WishRule[] = [];
  const seen = new Set<string>();

  for (const item of arr(raw) ?? []) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const type = WISH_TYPES.find((t) => t === r.type);
    const quote = typeof r.quote === "string" && r.quote.trim() ? r.quote.replace(/\s+/g, " ").trim().slice(0, 255) : null;
    const where = quote ? ` («${quote.length > 60 ? `${quote.slice(0, 60)}…` : quote}»)` : "";
    if (!type) {
      warnings.push(`Bỏ một ràng buộc không rõ loại${where}.`);
      continue;
    }
    const label = TYPE_LABEL[type];

    // Ngày cụ thể: chỉ giữ ngày trong tháng
    let dates: string[] | null = null;
    const rawDates = arr(r.dates);
    if (rawDates?.length) {
      const valid = [...new Set(rawDates.filter((d): d is string => typeof d === "string" && YMD.test(d)))].sort();
      const outside = valid.filter((d) => !daySet.has(d));
      dates = valid.filter((d) => daySet.has(d));
      if (outside.length) warnings.push(`${label}: bỏ ngày ngoài tháng ${ctx.month} (${outside.map(fmt).join(", ")})${where}.`);
      if (!dates.length) {
        warnings.push(`Bỏ ràng buộc "${label}" vì không còn ngày nào trong tháng${where}.`);
        continue;
      }
    }

    const rawWd = arr(r.weekdays);
    const weekdays = rawWd?.length ? [...new Set(rawWd.map(int).filter((w): w is number => w != null && w >= 0 && w <= 6))].sort() : null;

    // Khoảng ngày: cắt vào trong tháng
    let fromDate = typeof r.fromDate === "string" && YMD.test(r.fromDate.slice(0, 10)) ? r.fromDate.slice(0, 10) : null;
    let toDate = typeof r.toDate === "string" && YMD.test(r.toDate.slice(0, 10)) ? r.toDate.slice(0, 10) : null;
    if (fromDate && toDate && fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];
    if ((fromDate && fromDate > last) || (toDate && toDate < first)) {
      warnings.push(`Bỏ ràng buộc "${label}" vì khoảng ngày nằm ngoài tháng ${ctx.month}${where}.`);
      continue;
    }
    if (fromDate && fromDate < first) fromDate = first;
    if (toDate && toDate > last) toDate = last;
    if ((fromDate ?? first) === first && (toDate ?? last) === last) fromDate = toDate = null; // cả tháng = không giới hạn
    if (dates) fromDate = toDate = null;

    // Ca: mã ca có thật, hoặc khung giờ quy ra ca giao nhau
    let shiftCodes: string[] | null = null;
    const rawCodes = arr(r.shiftCodes);
    if (rawCodes?.length) {
      const codes = [...new Set(rawCodes.filter((c): c is string => typeof c === "string").map((c) => c.trim().toUpperCase()))];
      const unknown = codes.filter((c) => !codeSet.has(c));
      if (unknown.length) warnings.push(`${label}: bỏ mã ca không có (${unknown.join(", ")})${where}.`);
      shiftCodes = codes.filter((c) => codeSet.has(c));
      if (!shiftCodes.length) shiftCodes = null;
    }
    let timeFrom = int(r.timeFrom);
    let timeTo = int(r.timeTo);
    // Chỉ có một đầu: "sau 18:00" = 18:00–24:00, "trước 12:00" = 00:00–12:00
    if (timeFrom != null && timeTo == null) timeTo = 1440;
    else if (timeTo != null && timeFrom == null) timeFrom = 0;
    if (timeFrom == null || timeTo == null || timeFrom < 0 || timeFrom > 1440 || timeTo < 0 || timeTo > 1440 || timeFrom % 1440 === timeTo % 1440) {
      if (timeFrom != null || timeTo != null) warnings.push(`${label}: bỏ khung giờ không hợp lệ${where}.`);
      timeFrom = timeTo = null;
    }
    if (timeFrom != null && timeTo != null) {
      const byTime = codesForTime(timeFrom, timeTo, ctx.templates);
      if (!byTime.length) {
        warnings.push(`Bỏ ràng buộc "${label}" vì không có ca nào trong khung giờ đó${where}.`);
        continue;
      }
      shiftCodes = shiftCodes ? shiftCodes.filter((c) => byTime.includes(c)) : byTime;
      if (!shiftCodes.length) shiftCodes = byTime;
    }
    if (rawCodes?.length && !shiftCodes && timeFrom == null) {
      warnings.push(`Bỏ ràng buộc "${label}" vì không còn ca hợp lệ${where}.`);
      continue;
    }

    // Số ca
    let count = int(r.count);
    let period = WISH_PERIODS.find((p) => p === r.period) ?? null;
    if (type === "MAX_SHIFTS" || type === "MIN_SHIFTS") {
      if (count == null || count < 1 || count > 31) {
        warnings.push(`Bỏ ràng buộc "${label}" vì số ca phải từ 1 đến 31${where}.`);
        continue;
      }
      if (period === "RANGE" && !fromDate && !toDate) period = "MONTH";
      // Có khoảng ngày thật (VD "tuần cuối tháng 28–31", AI ghi WEEK) → đếm trong khoảng đó
      if (fromDate || toDate) period = "RANGE";
      period ??= "MONTH";
      if (period !== "RANGE") fromDate = toDate = null;
      dates = null;
      shiftCodes = null;
      timeFrom = timeTo = null;
    } else {
      count = null;
      period = null;
    }

    const hasDateScope = !!dates?.length || !!weekdays?.length || !!fromDate || !!toDate;
    if (type === "DAY_OFF_PATTERN" && !weekdays?.length) {
      warnings.push(`Bỏ ràng buộc "${label}" vì chưa chọn thứ muốn nghỉ${where}.`);
      continue;
    }
    if ((type === "UNAVAILABLE" || type === "PREFER" || type === "AVOID") && !hasDateScope && !shiftCodes) {
      warnings.push(`Bỏ ràng buộc "${label}" vì chưa rõ ngày hay ca nào${where}.`);
      continue;
    }

    const confidence = typeof r.confidence === "number" && Number.isFinite(r.confidence) ? Math.min(1, Math.max(0, r.confidence)) : null;
    const rule: WishRule = {
      type, dates, weekdays: weekdays?.length ? weekdays : null, fromDate, toDate, shiftCodes, timeFrom, timeTo, count, period,
      quote, source: r.source === "AI" ? "AI" : "MANUAL", confidence,
    };
    const key = JSON.stringify([rule.type, rule.dates, rule.weekdays, rule.fromDate, rule.toDate, rule.shiftCodes, rule.count, rule.period]);
    if (seen.has(key)) continue; // gộp rule trùng
    seen.add(key);
    out.push(rule);
  }

  if (out.length > ctx.maxRules) {
    warnings.push(`Tối đa ${ctx.maxRules} ràng buộc — bỏ ${out.length - ctx.maxRules} ràng buộc cuối.`);
    out.length = ctx.maxRules;
  }

  const cells = wishCells(out, ctx);
  const total = ctx.days.length * ctx.templates.length;
  const narrow = total > 0 && cells.unavailable.size / total > NARROW_RATIO;
  if (narrow) {
    warnings.push(`Nguyện vọng quá hẹp: bạn báo không thể làm ${Math.round((cells.unavailable.size / total) * 100)}% số ca trong tháng, có thể không xếp được lịch cho bạn.`);
  }
  const clash = [...cells.prefer].filter((k) => cells.unavailable.has(k));
  if (clash.length) {
    const sample = clash.slice(0, 3).map((k) => {
      const [d, c] = k.split("|");
      return `${ctx.templates.find((t) => t.code === c)?.name ?? c} ${fmt(d)}`;
    });
    warnings.push(`Mâu thuẫn: vừa muốn vừa không thể ở ${clash.length} ca (${sample.join(", ")}${clash.length > 3 ? "…" : ""}) — "không thể" sẽ được ưu tiên.`);
  }
  return { rules: out, warnings, narrow };
}

/** Rule đọc từ DB (cột JSON / Date) → WishRule */
export function ruleFromRow(row: {
  type: string; dates: unknown; weekdays: unknown; fromDate: Date | null; toDate: Date | null; shiftCodes: unknown;
  timeFrom: number | null; timeTo: number | null; count: number | null; period: string | null; quote: string | null; source: string; confidence: number | null;
}): WishRule {
  const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  return {
    type: row.type as WishType,
    dates: Array.isArray(row.dates) ? (row.dates as string[]) : null,
    weekdays: Array.isArray(row.weekdays) ? (row.weekdays as number[]) : null,
    fromDate: ymd(row.fromDate),
    toDate: ymd(row.toDate),
    shiftCodes: Array.isArray(row.shiftCodes) ? (row.shiftCodes as string[]) : null,
    timeFrom: row.timeFrom,
    timeTo: row.timeTo,
    count: row.count,
    period: (row.period as WishPeriod | null) ?? null,
    quote: row.quote,
    source: row.source === "AI" ? "AI" : "MANUAL",
    confidence: row.confidence,
  };
}
