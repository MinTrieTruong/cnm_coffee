/**
 * Lọc HTML từ trình soạn thảo trước khi lưu (lớp phòng thủ đầu; trang khách lọc lại bằng DOM theo danh sách trắng).
 * Bỏ thẻ chạy được mã / nhúng trang, thuộc tính sự kiện on*, liên kết javascript:/vbscript:/data: (trừ ảnh data:image).
 */
const DANGEROUS_BLOCKS = /<\s*(script|style|iframe|object|embed|frame|frameset|applet|noscript|template|svg|math|form|meta|link|base)\b[\s\S]*?(<\s*\/\s*\1\s*>|$)/gi;
const DANGEROUS_SINGLE = /<\s*\/?\s*(script|style|iframe|object|embed|frame|frameset|applet|noscript|template|svg|math|form|input|button|textarea|select|meta|link|base)\b[^>]*>/gi;
const EVENT_ATTR = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const BAD_URL_ATTR = /\s+(href|src|xlink:href|action|formaction)\s*=\s*("|')?\s*(javascript|vbscript|data(?!:image\/(png|jpe?g|gif|webp);))\s*:[^"'>\s]*("|')?/gi;
const STYLE_EXPR = /\s+style\s*=\s*("[^"]*(expression|url\s*\(|javascript:)[^"]*"|'[^']*(expression|url\s*\(|javascript:)[^']*')/gi;

export function sanitizeHtml(html: string | null | undefined, maxLen = 20_000): string | null {
  if (!html) return null;
  let s = html.slice(0, maxLen * 2);
  // Lặp đến khi ổn định để chặn kiểu lồng "<scr<script>ipt>"
  for (let i = 0; i < 5; i++) {
    const before = s;
    s = s.replace(DANGEROUS_BLOCKS, "").replace(DANGEROUS_SINGLE, "").replace(EVENT_ATTR, "").replace(BAD_URL_ATTR, "").replace(STYLE_EXPR, "");
    if (s === before) break;
  }
  s = s.trim();
  // Trình soạn thảo rỗng trả "<p></p>"
  if (!s || /^<p>\s*<\/p>$/i.test(s)) return null;
  return s.slice(0, maxLen);
}
