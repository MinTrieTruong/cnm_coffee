import type { SiteTheme } from "./siteTheme";

/** Chủ đề dịp lễ: chủ chuỗi bật ở Website › Giao diện trước ngày lễ — đè màu + thêm dải lời chúc, hình trang trí */
export type OccasionId = "tet" | "8-3" | "30-4" | "noel";
export type Occasion = {
  id: OccasionId;
  name: string;
  note: string;
  primary: string;
  accent: string;
  /** Lời chúc trên dải đầu trang (khoá i18n) */
  greeting: string;
  sub: string;
  /** Số ngày sau ngày lễ gợi ý tự tắt */
  keepDays: number;
};

export const OCCASIONS: Occasion[] = [
  { id: "tet", name: "Tết Nguyên Đán", note: "Đỏ son, vàng mai — đèn lồng, cành mai", primary: "#b3261e", accent: "#f2c230", greeting: "Chúc mừng năm mới", sub: "An khang thịnh vượng — vạn sự như ý", keepDays: 7 },
  { id: "8-3", name: "Quốc tế Phụ nữ 8/3", note: "Hồng sen, hồng phấn — hoa tulip", primary: "#b0306a", accent: "#f6a5c0", greeting: "Chúc mừng ngày Quốc tế Phụ nữ 8/3", sub: "Gửi yêu thương đến một nửa thế giới", keepDays: 1 },
  { id: "30-4", name: "Ngày Thống nhất 30/4", note: "Đỏ cờ, vàng sao — cờ, dây cờ", primary: "#a51c24", accent: "#ffcd00", greeting: "Mừng ngày Thống nhất đất nước 30/4", sub: "Nghỉ lễ 30/4 – 1/5 vui vẻ", keepDays: 2 },
  { id: "noel", name: "Giáng sinh", note: "Xanh thông, đỏ quà — cây thông, tuyết", primary: "#1f5f3f", accent: "#e04a4f", greeting: "Giáng sinh an lành", sub: "Merry Christmas & Happy New Year", keepDays: 7 },
];

export const occasionById = (id: string | null | undefined) => OCCASIONS.find((o) => o.id === id) ?? null;

/** Mùng 1 Tết (âm lịch) theo dương lịch */
const TET: Record<number, string> = { 2026: "2026-02-17", 2027: "2027-02-06", 2028: "2028-01-26", 2029: "2029-02-13", 2030: "2030-02-03", 2031: "2031-01-23" };

/** "YYYY-MM-DD" theo giờ máy (không lệch múi giờ như toISOString) */
export function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

function dateIn(id: OccasionId, year: number): string | null {
  if (id === "tet") return TET[year] ?? null;
  if (id === "8-3") return `${year}-03-08`;
  if (id === "30-4") return `${year}-04-30`;
  return `${year}-12-25`;
}

/** Ngày lễ gần nhất chưa qua (kể cả đang trong mấy ngày sau lễ), số ngày còn lại và ngày gợi ý tự tắt */
export function nextOccasionDate(o: Occasion, today = new Date()) {
  const t = ymd(today);
  for (const y of [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1]) {
    const d = dateIn(o.id, y);
    if (!d) continue;
    const end = parse(d);
    end.setDate(end.getDate() + o.keepDays);
    if (ymd(end) >= t) {
      const days = Math.round((parse(d).getTime() - parse(t).getTime()) / 86_400_000);
      return { date: d, days, until: ymd(end) };
    }
  }
  return null;
}

/** Chủ đề lễ đang hiệu lực (đã bật và chưa quá ngày tự tắt) */
export function activeOccasion(theme: SiteTheme | null | undefined, today = new Date()) {
  const oc = theme?.occasion;
  if (!oc) return null;
  if (oc.until && oc.until < ymd(today)) return null;
  const o = occasionById(oc.id);
  return o ? { ...o, effects: oc.effects } : null;
}

/** Màu thực dùng trên trang khách: chủ đề lễ đè lên màu thường */
export function effectiveTheme(theme: SiteTheme, today = new Date()): SiteTheme {
  const o = activeOccasion(theme, today);
  return o ? { ...theme, primary: o.primary, accent: o.accent } : theme;
}
