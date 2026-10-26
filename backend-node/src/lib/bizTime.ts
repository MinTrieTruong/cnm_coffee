/**
 * Ngày/giờ theo giờ kinh doanh của quán (mặc định Việt Nam, UTC+7, không có giờ mùa hè).
 *
 * Báo cáo dùng các hàm này thay cho `toISOString().slice(0, 10)` (ngày UTC — lệch 7 giờ)
 * và `setHours()` (phụ thuộc múi giờ của máy chủ; VPS/Docker thường để UTC).
 * Đổi múi giờ: biến môi trường BIZ_TZ_OFFSET_MIN (phút, VD 420 = UTC+7).
 */
const OFFSET_MIN = Number.isFinite(Number(process.env.BIZ_TZ_OFFSET_MIN)) && process.env.BIZ_TZ_OFFSET_MIN !== undefined ? Number(process.env.BIZ_TZ_OFFSET_MIN) : 420;
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

/**
 * Khoảng ngày của báo cáo từ query ?from=&to= (YYYY-MM-DD, tính trọn ngày theo giờ quán).
 * Thiếu `to` → hôm nay; thiếu `from` → lùi `defaultBack` ngày tính từ `to`.
 */
export function bizRange(fromStr: unknown, toStr: unknown, defaultBack: number) {
  const toYmd = typeof toStr === "string" && YMD.test(toStr.slice(0, 10)) ? toStr.slice(0, 10) : bizToday();
  const fromYmd = typeof fromStr === "string" && YMD.test(fromStr.slice(0, 10)) ? fromStr.slice(0, 10) : addDaysYmd(toYmd, -defaultBack);
  return { from: bizDayStart(fromYmd), to: bizDayEnd(toYmd), fromYmd, toYmd };
}
