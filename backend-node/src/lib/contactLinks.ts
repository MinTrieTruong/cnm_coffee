/**
 * Nút liên hệ nổi: loại nút, icon có sẵn, nhận diện & chuẩn hoá SĐT / link khi quản lý dán vào.
 * Không có link nào ghi cứng ở đây — chỉ quy tắc chuẩn hoá.
 */

export const CONTACT_TYPES = ["PHONE", "ZALO", "MESSENGER", "CUSTOM"] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];
export const isContactType = (t: unknown): t is ContactType => CONTACT_TYPES.includes(t as ContactType);

/** Nhãn + màu mặc định theo loại */
export const CONTACT_DEFAULTS: Record<ContactType, { label: string; color: string }> = {
  PHONE: { label: "Gọi ngay", color: "#16A34A" },
  ZALO: { label: "Chat Zalo", color: "#0068FF" },
  MESSENGER: { label: "Nhắn Messenger", color: "#0084FF" },
  CUSTOM: { label: "Liên kết", color: "#57534E" },
};

/** Icon có sẵn cho nút CUSTOM (frontend vẽ SVG theo khoá) + màu thương hiệu mặc định */
export const CUSTOM_ICONS: Record<string, { label: string; color: string }> = {
  facebook: { label: "Facebook", color: "#1877F2" },
  instagram: { label: "Instagram", color: "#E1306C" },
  tiktok: { label: "TikTok", color: "#111111" },
  youtube: { label: "YouTube", color: "#FF0000" },
  maps: { label: "Google Maps", color: "#EA4335" },
  shopee: { label: "ShopeeFood", color: "#EE4D2D" },
  grabfood: { label: "GrabFood", color: "#00B14F" },
  website: { label: "Website", color: "#92400E" },
};

const HEX = /^#[0-9a-f]{6}$/i;
export const normalizeColor = (c: unknown): string | null => (typeof c === "string" && HEX.test(c.trim()) ? c.trim().toUpperCase() : null);

/** Icon CUSTOM: khoá có sẵn, hoặc ảnh đã tải lên (/uploads/…) / https */
export function normalizeIcon(i: unknown): string | null {
  if (typeof i !== "string" || !i.trim()) return null;
  const s = i.trim();
  if (s in CUSTOM_ICONS) return s;
  if (/^\/uploads\/[\w./-]+$/.test(s) || /^https:\/\/\S+$/i.test(s)) return s.slice(0, 500);
  return null;
}

/** SĐT Việt Nam: bỏ khoảng trắng / dấu chấm / gạch, +84 hoặc 84 → 0. Nhận di động/cố định (10–11 số) và tổng đài 1800/1900. */
export function normalizeVnPhone(raw: string): string | null {
  let s = raw.replace(/[\s.\-()]/g, "");
  if (s.startsWith("+84")) s = "0" + s.slice(3);
  else if (/^84\d{9,10}$/.test(s)) s = "0" + s.slice(2);
  if (/^0\d{9,10}$/.test(s)) return s;
  if (/^1[89]00\d{4,6}$/.test(s)) return s;
  return null;
}

/** "0901234567" → "0901 234 567" (hiển thị) */
export function formatVnPhone(p: string) {
  if (/^0\d{9}$/.test(p)) return `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}`;
  if (/^1[89]00\d+$/.test(p)) return `${p.slice(0, 4)} ${p.slice(4)}`;
  return p;
}

const withScheme = (s: string) => (/^https?:\/\//i.test(s) ? s : `https://${s}`);

/**
 * Chuẩn hoá giá trị quản lý dán vào. Trả về { value } (giá trị lưu) hoặc { error } (báo dưới ô).
 * Rỗng → value "" (nút chưa khai báo: chi nhánh dùng nút mặc định của chuỗi).
 */
export function normalizeContact(type: ContactType, raw: unknown): { value: string } | { error: string } {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return { value: "" };

  if (type === "PHONE") {
    const p = normalizeVnPhone(s.replace(/^tel:/i, ""));
    return p ? { value: p } : { error: "Số điện thoại chưa đúng. VD: 0901 234 567, +84 901 234 567 hoặc 1900 1234." };
  }

  if (type === "ZALO") {
    const p = normalizeVnPhone(s);
    if (p) return { value: `https://zalo.me/${p}` };
    try {
      const u = new URL(withScheme(s));
      if (/^(www\.)?zalo\.me$/i.test(u.hostname) && u.pathname.length > 1) return { value: `https://zalo.me${u.pathname.replace(/\/+$/, "")}` };
    } catch {
      /* rơi xuống lỗi */
    }
    return { error: "Dán số điện thoại Zalo hoặc link dạng https://zalo.me/…" };
  }

  if (type === "MESSENGER") {
    try {
      const u = new URL(withScheme(s));
      const host = u.hostname.toLowerCase().replace(/^(www|m|web)\./, "");
      const parts = u.pathname.split("/").filter(Boolean);
      if (host === "m.me" && parts[0]) return { value: `https://m.me/${parts[0]}` };
      if (host === "facebook.com" || host === "fb.com" || host === "messenger.com") {
        // facebook.com/profile.php?id=123 → m.me/123
        if (parts[0] === "profile.php" && u.searchParams.get("id")) return { value: `https://m.me/${u.searchParams.get("id")}` };
        // facebook.com/pages/Ten-trang/123 hoặc messenger.com/t/<page>
        const page = parts[0] === "pages" ? parts[2] ?? parts[1] : parts[0] === "t" ? parts[1] : parts[0];
        if (page && !["groups", "events", "watch", "share", "sharer.php"].includes(page)) return { value: `https://m.me/${page}` };
      }
    } catch {
      /* rơi xuống lỗi */
    }
    return { error: "Dán link https://m.me/<trang>, https://www.facebook.com/<trang> hoặc fb.com/<trang>." };
  }

  // CUSTOM: chỉ nhận https://
  if (/^https:\/\/[^\s/]+\.[^\s]+$/i.test(s)) {
    try {
      return { value: new URL(s).toString().slice(0, 500) };
    } catch {
      /* rơi xuống lỗi */
    }
  }
  return { error: "Liên kết phải bắt đầu bằng https://" };
}

/** Link khách bấm vào */
export const contactHref = (type: ContactType, value: string) => (type === "PHONE" ? `tel:${value}` : value);
