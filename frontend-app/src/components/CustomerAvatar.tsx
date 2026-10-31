import { useEffect, useState } from "react";
import { mediaUrl } from "../lib/api";

export type AvatarSize = 24 | 28 | 32 | 40 | 48 | 64;

/** 6 màu ấm cho avatar chữ — chữ trắng trên nền đều ≥ 6:1 */
const PALETTE = ["#9a4a2b", "#6b4e33", "#7d5a14", "#2f5d5a", "#8c3b4e", "#4f5d2a"];
const ANON = "#7a7068";

/** "Nguyễn Hoàng Lâm" → "HL" (chữ đầu tên đệm cuối + tên); một chữ → 1 ký tự */
export function initialsOf(name: string) {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "?";
  const first = (s: string) => Array.from(s)[0]?.toUpperCase() ?? "";
  return w.length === 1 ? first(w[0]) : first(w[w.length - 2]) + first(w[w.length - 1]);
}
/** Màu cố định theo tên / mã khách — cùng một khách luôn cùng màu ở mọi chỗ */
export function colorOf(seed: string | number) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/**
 * Ảnh đại diện khách: có ảnh → ảnh tròn; không có / ảnh lỗi → chữ viết tắt trên nền màu theo tên.
 * `anonymous`: đánh giá ẩn danh → "?" nền xám.
 */
export function CustomerAvatar({
  src, name, size = 40, seed, anonymous, className,
}: { src?: string | null; name: string; size?: AvatarSize; seed?: string | number; anonymous?: boolean; className?: string }) {
  const url = anonymous ? undefined : mediaUrl(src ?? undefined);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  const cls = `c-cavatar${className ? ` ${className}` : ""}`;
  if (url && !broken) {
    return <img className={cls} style={style} src={url} alt={name} loading="lazy" decoding="async" onError={() => setBroken(true)} />;
  }
  return (
    <span className={`${cls} is-text`} style={{ ...style, background: anonymous ? ANON : colorOf(seed ?? name) }} role="img" aria-label={name}>
      {anonymous ? "?" : initialsOf(name)}
    </span>
  );
}
