/**
 * Khối dùng chung trang câu chuyện thương hiệu + trang chi nhánh:
 * BrandImg (ảnh theo điểm lấy nét, srcset, ảnh giữ chỗ SVG khi chưa có ảnh), EditPen / OwnerBar (sửa nhanh cho Chủ chuỗi).
 * CSS: styles/customer-brand.css.
 */
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Pencil } from "lucide-react";
import type { BrandImage } from "@shared/brand";
import { mediaUrl } from "../../lib/api";
import { isSiteImageKey, siteImageSrc } from "../../lib/siteImages";
import { useLang } from "../../lib/i18n";

export type Placeholder = "cup" | "bean" | "branch" | "awning" | "person";

/**
 * Ảnh do chủ chuỗi chọn: { url, small, alt, focus }. url là ảnh tải lên (/uploads/…) hoặc khóa ảnh mặc định (public/site).
 * Chưa có ảnh → khối kem nét vẽ một màu theo token (đúng tỉ lệ khung, không ô xám / ảnh vỡ).
 */
export function BrandImg({ img, ratio, className, sizes = "100vw", priority, placeholder = "cup", style }: {
  img: BrandImage | null | undefined; ratio?: string; className?: string; sizes?: string; priority?: boolean; placeholder?: Placeholder; style?: CSSProperties;
}) {
  const box: CSSProperties = { ...(ratio ? { aspectRatio: ratio } : {}), ...style };
  const url = img?.url ?? "";
  if (!url) {
    return <span className={`c-bimg is-empty ${className ?? ""}`} style={{ ...box, ["--sk" as string]: `url(/site/${placeholder}.svg)` }} role="img" aria-label={img?.alt || undefined} aria-hidden={!img?.alt} />;
  }
  const pos = { objectPosition: `${img?.focus?.x ?? 50}% ${img?.focus?.y ?? 50}%` };
  const common = {
    alt: img?.alt ?? "", sizes, decoding: "async" as const, style: pos,
    loading: priority ? ("eager" as const) : ("lazy" as const), ...(priority ? { fetchPriority: "high" as const } : {}),
  };
  let src: string, srcSet: string | undefined;
  if (isSiteImageKey(url)) {
    const s = siteImageSrc(url);
    src = s.src;
    srcSet = s.srcSet;
  } else {
    src = mediaUrl(url) ?? url;
    srcSet = img?.small ? `${mediaUrl(img.small)} 800w, ${src} 1920w` : undefined;
  }
  return (
    <span className={`c-bimg ${className ?? ""}`} style={box}>
      <img {...common} src={src} srcSet={srcSet} />
    </span>
  );
}

/** Nút bút chì mở đúng mục / đúng ô trong màn quản trị — chỉ hiện khi Chủ chuỗi đang xem */
export function EditPen({ to, label, show, className }: { to: string; label: string; show: boolean; className?: string }) {
  const { t } = useLang();
  if (!show) return null;
  return (
    <a href={to} target="_blank" rel="noopener" className={`c-edit-pen ${className ?? ""}`} title={t("Sửa: {x}", { x: label })} aria-label={t("Sửa: {x}", { x: label })}>
      <Pencil size={15} aria-hidden />
    </a>
  );
}

/** Thanh dính đáy cho Chủ chuỗi: "Bạn đang xem với quyền chủ chuỗi · Sửa trang" */
export function OwnerBar({ show, editHref, preview, extra }: { show: boolean; editHref: string; preview?: boolean; extra?: ReactNode }) {
  const { t } = useLang();
  if (!show && !preview) return null;
  return (
    <div className="c-owner-bar" role="region" aria-label={t("Chế độ chủ chuỗi")}>
      <span>{preview ? t("Đang xem trước bản chưa lưu") : t("Bạn đang xem với quyền chủ chuỗi")}</span>
      {extra}
      {show && <a href={editHref} target="_blank" rel="noopener" className="c-btn c-btn--solid is-sm"><Pencil size={14} aria-hidden /> {t("Sửa trang")}</a>}
      {preview && <Link to="/about" className="c-btn c-btn--ghost is-sm">{t("Thoát xem trước")}</Link>}
    </div>
  );
}
