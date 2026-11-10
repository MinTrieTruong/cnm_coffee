import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import type { SessionUser } from "../../lib/session";
import { useLang } from "../../lib/i18n";
import { CustomerAvatar } from "../CustomerAvatar";
import { rankLabel } from "../../pages/account/shared";

const ITEMS = [
  { to: "/account", label: "Tài khoản" },
  { to: "/account/inbox", label: "Hộp thư" },
  { to: "/account/orders", label: "Đơn hàng" },
  { to: "/account/vouchers", label: "Ví voucher" },
  { to: "/account/gifts", label: "Quà của tôi" },
];

/** Header: avatar + tên + hạng/điểm → menu thả xuống (Tài khoản · Đơn hàng · Ví voucher · Quà của tôi · Đăng xuất) */
export function AccountMenu({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const { t, lang } = useLang();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    items()[0]?.focus();
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function onMenuKey(e: KeyboardEvent) {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      btn.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className="c-accmenu" ref={box}>
      <button
        ref={btn}
        type="button"
        className="c-accmenu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <CustomerAvatar src={user.avatarUrl} name={user.fullName} size={32} />
        <span className="c-accmenu-txt">
          <strong>{user.fullName}</strong>
          <span>{t("Hạng {r} · {n} điểm", { r: t(rankLabel(user.rankTier)), n: user.points.toLocaleString(lang === "en" ? "en-US" : "vi-VN") })}</span>
        </span>
        <ChevronDown size={16} aria-hidden />
      </button>
      {open && (
        <div className="c-accmenu-pop" role="menu" ref={menu} onKeyDown={onMenuKey} aria-label={t("Tài khoản")}>
          {ITEMS.map((i) => (
            <Link key={i.to} to={i.to} role="menuitem" tabIndex={-1}>{t(i.label)}</Link>
          ))}
          <button type="button" role="menuitem" tabIndex={-1} className="is-danger" onClick={onLogout}>{t("Đăng xuất")}</button>
        </div>
      )}
    </div>
  );
}
