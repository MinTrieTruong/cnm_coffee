/**
 * Điều hướng chính trang khách: mega menu (máy tính) + ngăn kéo toàn màn hình (điện thoại).
 * Thực đơn ▾ (danh mục kèm ảnh) · Về TD Coffee ▾ · Cửa hàng · Ưu đãi ▾ · Tin tức · Liên hệ.
 * Trang chưa làm (ready: false) thì ẩn link; mục chỉ còn 1 link con thì thành link thường, không thả xuống.
 * CSS: styles/customer-nav.css.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, ChevronDown, Phone, X } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { useMenuCategories, useSiteInfo } from "../../lib/site";
import { useLang } from "../../lib/i18n";
import type { SessionUser } from "../../lib/session";
import { LogoMark } from "../LogoMark";
import { StorePicker } from "../StorePicker";
import { SiteImg } from "./lux";

type NavChild = { to: string; label: string; desc: string; image: string; ready: boolean };
type NavItem = { id: string; label: string; to: string; match: (p: string) => boolean; children?: NavChild[] | "menu" };

const NAV: NavItem[] = [
  { id: "menu", label: "Thực đơn", to: "/menu", match: (p) => p.startsWith("/menu") || p.startsWith("/product"), children: "menu" },
  {
    id: "about", label: "Về TD Coffee", to: "/about",
    match: (p) => ["/our-coffee", "/careers"].some((x) => p.startsWith(x)),
    children: [
      { to: "/about", label: "Câu chuyện", desc: "Từ một quầy phin nhỏ ở Gò Vấp", image: "story/tro-chuyen", ready: false },
      { to: "/our-coffee", label: "Cà phê của chúng tôi", desc: "Vùng trồng, loại hạt, cách rang và pha", image: "story/vuon-ca-phe", ready: false },
      { to: "/careers", label: "Tuyển dụng", desc: "Pha chế, thu ngân, quản lý ca", image: "careers/barista", ready: false },
    ],
  },
  // Đợt 3 chuyển danh sách cửa hàng sang /stores; hiện vẫn ở /about
  { id: "stores", label: "Cửa hàng", to: "/about", match: (p) => p.startsWith("/about") || p.startsWith("/stores") },
  {
    id: "deals", label: "Ưu đãi", to: "/promotions",
    match: (p) => p.startsWith("/promotions") || p.startsWith("/membership"),
    children: [
      { to: "/promotions", label: "Khuyến mãi", desc: "Mã giảm giá và ưu đãi mua nhiều", image: "menu/croissant", ready: true },
      { to: "/membership", label: "Thành viên", desc: "Tích điểm mỗi ly, lên hạng nhận quà", image: "membership/latte-ban-go", ready: false },
    ],
  },
  { id: "blog", label: "Tin tức", to: "/blog", match: (p) => p.startsWith("/blog") },
  { id: "contact", label: "Liên hệ", to: "/contact", match: (p) => p.startsWith("/contact") },
];

/** Mục đang hiện: bỏ link con chưa có trang; còn 0 → ẩn mục, còn 1 → link thường tới trang đó */
const SITE_NAV: NavItem[] = NAV.flatMap((it) => {
  if (!Array.isArray(it.children)) return [it];
  const kids = it.children.filter((c) => c.ready);
  if (!kids.length) return [];
  if (kids.length === 1) return [{ ...it, to: kids[0].to, children: undefined }];
  return [{ ...it, children: kids }];
});

/* ═══════════ MÁY TÍNH: mega menu ═══════════ */

export function MegaNav() {
  const { t } = useLang();
  const loc = useLocation();
  const [open, setOpen] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const nav = useRef<HTMLElement>(null);
  const cats = useMenuCategories();
  const baseId = useId();

  useEffect(() => setOpen(null), [loc.pathname, loc.search]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => nav.current && !nav.current.contains(e.target as Node) && setOpen(null);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Rê chuột: mở sau 120ms, đóng sau 200ms (lướt ngang qua không bật menu, kéo xuống panel không bị tắt)
  const hoverOpen = (id: string | null) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(id), open ? 0 : 120);
  };
  const hoverClose = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(null), 200);
  };
  const panelLinks = (id: string) => Array.from(document.getElementById(`${baseId}-${id}`)?.querySelectorAll<HTMLElement>("a, select, button") ?? []);

  function onTriggerKey(e: ReactKeyboardEvent, id: string) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(id);
      requestAnimationFrame(() => panelLinks(id)[0]?.focus());
    } else if (e.key === "Escape") {
      setOpen(null);
    }
  }
  function onPanelKey(e: ReactKeyboardEvent, id: string) {
    const list = panelLinks(id);
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(null);
      document.getElementById(`${baseId}-${id}-btn`)?.focus();
    } else if ((e.target as HTMLElement).tagName === "SELECT") {
      return;
    } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    }
  }

  function panel(it: NavItem): ReactNode {
    if (it.children === "menu") {
      return (
        <div className="c-wrap c-mega-in is-menu">
          <div className="c-mega-feature">
            <SiteImg src="menu/phin-sua" alt="" sizes="280px" />
            <div className="c-mega-feature-txt">
              <strong>{t("Phin pha mới mỗi ly")}</strong>
              <span>{t("Robusta Buôn Ma Thuột, sữa đặc, đá viên to")}</span>
            </div>
          </div>
          <div className="c-mega-main">
            <ul className="c-mega-cats">
              {cats.map((c) => (
                <li key={c.id}>
                  <Link to={`/menu?category=${c.id}`}>
                    <span className="c-mega-cat-img">{c.image ? <img src={mediaUrl(c.image)} alt="" loading="lazy" /> : <span className="c-noimg" />}</span>
                    <span className="c-mega-cat-txt"><strong>{c.name}</strong><span>{t("{n} món", { n: c.count })}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="c-mega-foot">
              <Link to="/menu" className="c-sec-more">{t("Xem tất cả thực đơn")} <ArrowRight size={15} aria-hidden /></Link>
              <div className="c-mega-store"><StorePicker compact /></div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="c-wrap c-mega-in">
        <ul className="c-mega-cards">
          {(it.children as NavChild[]).map((c) => (
            <li key={c.to}>
              <Link to={c.to}>
                <span className="c-mega-card-img"><SiteImg src={c.image} alt="" sizes="260px" /></span>
                <strong>{t(c.label)}</strong>
                <span>{t(c.desc)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <nav className="c-mega" aria-label={t("Chính")} ref={nav} onMouseLeave={hoverClose}>
      <ul className="c-mega-list">
        {SITE_NAV.map((it) => {
          const on = it.match(loc.pathname);
          if (!it.children) {
            return (
              <li key={it.id} onMouseEnter={() => open && hoverOpen(null)}>
                <Link to={it.to} className={`c-nav-link${on ? " is-on" : ""}`} aria-current={on ? "page" : undefined}>{t(it.label)}</Link>
              </li>
            );
          }
          const isOpen = open === it.id;
          return (
            <li key={it.id} onMouseEnter={() => hoverOpen(it.id)}>
              <button
                id={`${baseId}-${it.id}-btn`}
                type="button"
                className={`c-nav-link${on ? " is-on" : ""}`}
                aria-expanded={isOpen}
                aria-controls={`${baseId}-${it.id}`}
                onClick={() => setOpen(isOpen ? null : it.id)}
                onKeyDown={(e) => onTriggerKey(e, it.id)}
              >
                {t(it.label)} <ChevronDown size={14} aria-hidden className="c-nav-chev" />
              </button>
              <div id={`${baseId}-${it.id}`} className="c-mega-panel" hidden={!isOpen} onKeyDown={(e) => onPanelKey(e, it.id)}>
                {isOpen && panel(it)}
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ═══════════ ĐIỆN THOẠI: ngăn kéo toàn màn hình ═══════════ */

export function MobileDrawer({ open, onClose, user, onLogout, toggles }: { open: boolean; onClose: () => void; user: SessionUser | null; onLogout: () => void; toggles: ReactNode }) {
  const { t } = useLang();
  const loc = useLocation();
  const info = useSiteInfo();
  const cats = useMenuCategories();
  const [sub, setSub] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  // Đổi trang → đóng ngăn kéo
  useEffect(() => {
    if (openRef.current) onClose();
  }, [loc.pathname, loc.search, onClose]);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>(".c-drawer-close")?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "Tab" && box.current) {
        // Giữ focus trong ngăn kéo
        const f = [...box.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), select, input")].filter((x) => x.offsetParent !== null);
        const i = f.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1]?.focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0]?.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const childrenOf = (it: NavItem): { to: string; label: string }[] =>
    it.children === "menu"
      ? [...cats.map((c) => ({ to: `/menu?category=${c.id}`, label: c.name })), { to: "/menu", label: t("Xem tất cả thực đơn") }]
      : (it.children ?? []).map((c) => ({ to: c.to, label: t(c.label) }));

  return (
    <div className="c-drawer" role="dialog" aria-modal="true" aria-label={t("Menu")} ref={box}>
      <div className="c-drawer-bg" aria-hidden><SiteImg src="home/hero-khong-gian" alt="" sizes="100vw" /></div>
      <div className="c-drawer-top">
        <button type="button" className="c-icon-btn c-drawer-close" onClick={onClose} aria-label={t("Đóng menu")}><X size={24} aria-hidden /></button>
        <Link to="/" aria-label={t("Trang chủ")} className="c-drawer-logo"><LogoMark width={40} height={40} /></Link>
        <span className="c-drawer-gap" />
      </div>
      <nav className="c-drawer-nav" aria-label={t("Chính")}>
        <ul>
          <li><Link to="/" className="c-drawer-link">{t("Trang chủ")}</Link></li>
          {SITE_NAV.map((it) => {
            if (!it.children) return <li key={it.id}><Link to={it.to} className="c-drawer-link">{t(it.label)}</Link></li>;
            const isOpen = sub === it.id;
            return (
              <li key={it.id}>
                <button type="button" className="c-drawer-link" aria-expanded={isOpen} onClick={() => setSub(isOpen ? null : it.id)}>
                  {t(it.label)} <ChevronDown size={20} aria-hidden className="c-nav-chev" />
                </button>
                {isOpen && (
                  <ul className="c-drawer-sub">
                    {childrenOf(it).map((c) => <li key={c.to}><Link to={c.to}>{c.label}</Link></li>)}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="c-drawer-foot">
        <div className="c-drawer-store"><StorePicker compact /></div>
        <div className="c-drawer-acc">
          {user ? (
            <>
              <Link to="/account">{t("Tài khoản")}</Link>
              <Link to="/account/orders">{t("Đơn hàng")}</Link>
              <button type="button" onClick={onLogout}>{t("Đăng xuất")}</button>
            </>
          ) : (
            <>
              <Link to="/login">{t("Đăng nhập")}</Link>
              <Link to="/register">{t("Đăng ký")}</Link>
            </>
          )}
        </div>
        <div className="c-drawer-row">
          {toggles}
          {info && <a className="c-drawer-hotline" href={info.hotline.href}><Phone size={16} aria-hidden /> {info.hotline.display}</a>}
        </div>
      </div>
    </div>
  );
}
