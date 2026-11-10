/**
 * lib/productAliases.ts — Tên gọi khác của món (Product.aliases: "bx", "bac siu" → Bạc Xỉu Đá).
 * Dùng cho: form sửa món (Chủ chuỗi), ô tìm kiếm thực đơn của khách, đặt món bằng giọng nói.
 */
import { normalizeTerm } from "./searchInsights.js";

export const MAX_ALIASES = 10;
export const MAX_ALIAS_LEN = 40;

/** Cột JSON → string[] (dữ liệu hỏng thì coi như không có) */
export function parseAliases(raw: unknown): string[] {
  const arr = typeof raw === "string" ? (() => { try { return JSON.parse(raw) as unknown; } catch { return []; } })() : raw;
  return Array.isArray(arr) ? arr.filter((a): a is string => typeof a === "string" && !!a.trim()) : [];
}

/** Kiểm tra dữ liệu form: mảng chuỗi, bỏ trùng (theo dạng bỏ dấu), ≤ 10 tên, mỗi tên ≤ 40 ký tự */
export function cleanAliases(input: unknown): { aliases: string[] } | { error: string } {
  if (input == null) return { aliases: [] };
  if (!Array.isArray(input)) return { error: "Tên gọi khác phải là danh sách." };
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of input) {
    if (typeof a !== "string") return { error: "Tên gọi khác không hợp lệ." };
    const v = a.trim().replace(/\s+/g, " ");
    if (!v) continue;
    if (v.length > MAX_ALIAS_LEN) return { error: `Mỗi tên gọi khác tối đa ${MAX_ALIAS_LEN} ký tự.` };
    const key = normalizeTerm(v);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  if (out.length > MAX_ALIASES) return { error: `Tối đa ${MAX_ALIASES} tên gọi khác.` };
  return { aliases: out };
}

/**
 * Món có khớp từ khóa tìm kiếm không: tên chứa nguyên văn (như trước), hoặc tên / tên gọi khác chứa từ khóa
 * sau khi bỏ dấu ("ca phe" khớp "Cà Phê", "bx" khớp tên gọi khác "bx").
 */
export function matchesSearch(p: { name: string; aliases?: unknown }, raw: string): boolean {
  const q = raw.trim();
  if (!q) return true;
  if (p.name.toLowerCase().includes(q.toLowerCase())) return true;
  const term = normalizeTerm(q);
  if (!term) return false;
  return normalizeTerm(p.name).includes(term) || parseAliases(p.aliases).some((a) => normalizeTerm(a).includes(term));
}
