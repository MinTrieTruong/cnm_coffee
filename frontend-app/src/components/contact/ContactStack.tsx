import type { MouseEvent, ReactNode } from "react";
import { ChevronDown, ChevronUp, Globe, MapPin, Phone, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import "../../styles/contact.css";

export type ContactType = "PHONE" | "ZALO" | "MESSENGER" | "CUSTOM";

/** 1 nút liên hệ đã gộp & chuẩn hoá (GET /api/contact-buttons) */
export type PublicContact = {
  id: number;
  type: ContactType;
  label: string;
  color: string;
  icon: string | null;
  href: string;
  phone: string | null;
  phoneDisplay: string | null;
  fromChain?: boolean;
};

/* ── Icon: SVG nội tuyến (không tải ảnh ngoài) ── */
function ZaloMark() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden>
      <text x="16" y="20.5" textAnchor="middle" fontSize="11.5" fontWeight="800" fontFamily="Arial, Helvetica, sans-serif" fill="#fff" letterSpacing="-0.2">Zalo</text>
    </svg>
  );
}
function MessengerMark({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
      <path fill="#fff" d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.14.26.35.27.57l.05 1.78a.8.8 0 0 0 1.12.71l1.98-.87a.8.8 0 0 1 .53-.04c.91.25 1.87.38 2.91.38 5.64 0 10-4.13 10-9.7S17.64 2 12 2Z" />
      <path fill={color} d="m6 14.54 2.94-4.66a1.5 1.5 0 0 1 2.17-.4l2.34 1.75a.6.6 0 0 0 .72 0l3.16-2.4c.42-.32.97.18.69.63l-2.94 4.66a1.5 1.5 0 0 1-2.17.4l-2.34-1.75a.6.6 0 0 0-.72 0l-3.16 2.4c-.42.32-.97-.18-.69-.63Z" />
    </svg>
  );
}
const PRESET_SVG: Record<string, (color: string) => ReactNode> = {
  facebook: () => (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden><path fill="#fff" d="M14 8h2.2V4.6c-.4-.1-1.6-.2-2.9-.2-2.9 0-4.6 1.8-4.6 4.9V12H5.6v3.6h3.1V24h3.8v-8.4h3l.5-3.6h-3.5V9.6c0-1 .3-1.6 1.5-1.6Z" /></svg>
  ),
  instagram: () => (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden fill="none" stroke="#fff" strokeWidth="2"><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r="1.1" fill="#fff" stroke="none" /></svg>
  ),
  tiktok: () => (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden><path fill="#fff" d="M14 3h3c.2 1.9 1.5 3.3 3.3 3.5v3.1c-1.3 0-2.4-.4-3.3-1V15a6 6 0 1 1-6-6v3.1A2.9 2.9 0 1 0 14 15V3Z" /></svg>
  ),
  youtube: (color) => (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden><rect x="2.5" y="5.5" width="19" height="13" rx="4" fill="#fff" /><path d="m10 9 5 3-5 3V9Z" fill={color} /></svg>
  ),
  maps: () => <MapPin size={24} color="#fff" aria-hidden />,
  website: () => <Globe size={24} color="#fff" aria-hidden />,
  shopee: () => <ShoppingBag size={24} color="#fff" aria-hidden />,
  grabfood: () => <UtensilsCrossed size={23} color="#fff" aria-hidden />,
};

export function ContactIcon({ b }: { b: Pick<PublicContact, "type" | "icon" | "color"> }) {
  if (b.type === "PHONE") return <Phone size={24} color="#fff" fill="#fff" strokeWidth={1.5} aria-hidden />;
  if (b.type === "ZALO") return <ZaloMark />;
  if (b.type === "MESSENGER") return <MessengerMark color={b.color} />;
  if (b.icon && PRESET_SVG[b.icon]) return <>{PRESET_SVG[b.icon](b.color)}</>;
  if (b.icon) return <img className="fc-img" src={mediaUrl(b.icon)} alt="" />;
  return <Globe size={24} color="#fff" aria-hidden />;
}

/** Nhãn hiện bên trái khi rê chuột */
export const hoverLabel = (b: PublicContact) => (b.type === "PHONE" && b.phoneDisplay ? `Gọi ${b.phoneDisplay}` : b.label);

/**
 * Cụm nút xếp dọc: các nút liên hệ → (khe cho nút Chat). `preview`: vẽ tại chỗ trong trang quản trị.
 * Nút gọi là <button> (máy tính không gọi được → FloatingContact hiện hộp số điện thoại); còn lại là link mở tab mới.
 */
export function ContactStack({
  buttons,
  chat,
  collapsed = false,
  hideButtons = false,
  onToggle,
  onPress,
  preview = false,
}: {
  buttons: PublicContact[];
  chat?: ReactNode;
  collapsed?: boolean;
  /** Khung chat đang mở: chỉ còn nút chat */
  hideButtons?: boolean;
  onToggle?: () => void;
  onPress?: (b: PublicContact, e: MouseEvent) => void;
  preview?: boolean;
}) {
  const showButtons = !collapsed && !hideButtons && buttons.length > 0;
  return (
    <div className={`fc${preview ? " fc-preview" : ""}`} role="group" aria-label="Liên hệ với quán">
      {buttons.length > 0 && !hideButtons && onToggle && (
        <button type="button" className="fc-toggle" onClick={onToggle} aria-expanded={!collapsed} aria-label={collapsed ? "Hiện nút liên hệ" : "Thu gọn nút liên hệ"}>
          {collapsed ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        </button>
      )}
      {showButtons &&
        buttons.map((b) => {
          const style = { "--fc-color": b.color } as React.CSSProperties;
          const label = hoverLabel(b);
          return (
            <span key={`${b.type}-${b.id}`} className="fc-item">
              <span className="fc-label" aria-hidden>{label}</span>
              {b.type === "PHONE" ? (
                <button type="button" className="fc-btn fc-phone" style={style} onClick={(e) => onPress?.(b, e)} aria-label={label}>
                  <ContactIcon b={b} />
                </button>
              ) : (
                <a className="fc-btn" style={style} href={preview ? undefined : b.href} target="_blank" rel="noopener noreferrer" onClick={(e) => onPress?.(b, e)} aria-label={label}>
                  <ContactIcon b={b} />
                </a>
              )}
            </span>
          );
        })}
      {chat}
    </div>
  );
}
