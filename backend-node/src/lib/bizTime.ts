/**
 * Ngày/giờ theo giờ kinh doanh của quán (mặc định Việt Nam, UTC+7, không có giờ mùa hè).
 *
 * Báo cáo dùng các hàm này thay cho `toISOString().slice(0, 10)` (ngày UTC — lệch 7 giờ)
 * và `setHours()` (phụ thuộc múi giờ của máy chủ; VPS/Docker thường để UTC).
 * Đổi múi giờ: biến môi trường BIZ_TZ_OFFSET_MIN (phút, VD 420 = UTC+7).
 */
const OFFSET_MIN = Number.isFinite(Number(process.env.BIZ_TZ_OFFSET_MIN)) && process.env.BIZ_TZ_OFFSET_MIN !== undefined ? Number(process.env.BIZ_TZ_OFFSET_MIN) : 420;
/** Lệch múi giờ quán so với UTC (phút) — dùng trong SQL: `Created_At + INTERVAL n MINUTE` */
export const BIZ_OFFSET_MIN = OFFSET_MIN;
const OFF = OFFSET_MIN * 60_000;
const DAY = 86_400_000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" theo giờ quán */
export const bizYmd = (d: Date) => new Date(d.getTime() + OFF).toISOString().slice(0, 10);
/** Giờ (0–23) theo giờ quán */
export const bizHour = (d: Date) => new Date(d.getTime() + OFF).getUTCHours();
export const bizToday = () => bizYmd(new Date());
/** 00:00:00.000 giờ quán của ngày `ymd` */
export const bizDayStart = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00Z`) - OFF);
/** 23:59:59.999 giờ quán của ngày `ymd` */
export const bizDayEnd = (ymd: string) => new Date(bizDayStart(ymd).getTime() + DAY - 1);
export const addDaysYmd = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const daysInRange = (fromYmd: string, toYmd: string) => Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / DAY) + 1;

/** "YYYY-MM-DD" có thật trên lịch (loại "2026-13-45", "2026-02-30") — sai thì null */
function validYmd(v: unknown) {
  if (typeof v !== "string") return null;
  const ymd = v.slice(0, 10);
  if (!YMD.test(ymd)) return null;
  const t = Date.parse(`${ymd}T00:00:00Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== ymd ? null : ymd;
}

/**
 * Khoảng ngày của báo cáo từ query ?from=&to= (YYYY-MM-DD, tính trọn ngày theo giờ quán).
 * Thiếu `to` → hôm nay; thiếu `from` → lùi `defaultBack` ngày tính từ `to`.
 */
export function bizRange(fromStr: unknown, toStr: unknown, defaultBack: number) {
  const toYmd = validYmd(toStr) ?? bizToday();
  const fromYmd = validYmd(fromStr) ?? addDaysYmd(toYmd, -defaultBack);
  return { from: bizDayStart(fromYmd), to: bizDayEnd(toYmd), fromYmd, toYmd };
}

/** Phút từ 00:00 theo giờ quán (0–1439) */
export const bizMinute = (d: Date) => {
  const t = new Date(d.getTime() + OFF);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
};
/** Thứ trong tuần theo giờ quán (0 = Chủ nhật … 6 = Thứ bảy) */
export const bizWeekday = (d: Date) => new Date(d.getTime() + OFF).getUTCDay();
