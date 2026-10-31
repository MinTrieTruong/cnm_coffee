import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, Search, ShoppingBag, User, X } from "lucide-react";
import { useSiteInfo } from "../../lib/site";
import { LogoMark } from "../LogoMark";
import { StorePicker } from "../StorePicker";
import { useLang } from "../../lib/i18n";
import type { ColorMode } from "../../lib/siteTheme";
import { Toggles } from "./Toggles";

export const SITE_LINKS = [
  { to: "/menu", label: "Thực đơn", match: (p: string) => p.startsWith("/menu") || p.startsWith("/product") },
  { to: "/promotions", label: "Khuyến mãi", match: (p: string) => p === "/promotions" },
  { to: "/blog", label: "Tin tức", match: (p: string) => p.startsWith("/blog") },
  { to: "/about", label: "Cửa hàng", match: (p: string) => p === "/about" },
  { to: "/contact", label: "Liên hệ", match: (p: string) => p === "/contact" },
];

/**
 * Header trang khách: hàng 1 nền giấy (logo · tìm kiếm · hotline · tài khoản · giỏ),
 * hàng 2 thanh màu chủ đạo (liên kết). Chỉ thanh hàng 2 dính đầu trang — chiều cao header không đổi khi cuộn
 * (đổi chiều cao làm nội dung nhảy lên xuống, trang bị giật).
 */
export function SiteHeader({
  loggedIn,
  userName,
  cartCount,
  onLogout,
  mobileTitle,
  onBack,
  color,
}: {
  loggedIn: boolean;
  userName: string | null;
  cartCount: number;
  onLogout: () => void;
  mobileTitle: string;
  /** Trang con: nút quay lại trên điện thoại */
  onBack: (() => void) | null;
  color: { mode: ColorMode; setMode: (m: ColorMode) => void; canToggle: boolean };
}) {
  const { t } = useLang();
  const loc = useLocation();
  const nav = useNavigate();
  const info = useSiteInfo();
  const [q, setQ] = useState("");
  const [stuck, setStuck] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  // Hàng 1 khuất khỏi màn hình → hiện logo nhỏ + giỏ trong thanh dính (không đổi chiều cao, không lắng nghe scroll)
  useEffect(() => {
    const el = topRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    setSearchOpen(false);
  }, [loc.pathname, loc.search]);

  function search(e: FormEvent) {
    e.preventDefault();
    const s = q.trim();
    nav(s ? `/menu?q=${encodeURIComponent(s)}` : "/menu");
  }

  const searchForm = (
    <form className="c-search" role="search" onSubmit={search}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Hôm nay bạn muốn uống gì?")} aria-label={t("Tìm món")} />
      <button type="submit" aria-label={t("Tìm")}><Search size={18} aria-hidden /></button>
    </form>
  );

  return (
    <header className="c-header">
      {/* Điện thoại: logo/quay lại · tiêu đề · tìm · giỏ */}
      <div className="c-head-mobile">
        {onBack ? (
          <button type="button" className="c-icon-btn" onClick={onBack} aria-label={t("Quay lại")}><ChevronLeft size={22} aria-hidden /></button>
        ) : (
          <Link to="/" aria-label={t("Trang chủ")}><LogoMark width={34} height={34} /></Link>
        )}
        <span className="c-head-mobile-title">{mobileTitle}</span>
        <button type="button" className="c-icon-btn" onClick={() => setSearchOpen((v) => !v)} aria-label={t("Tìm món")} aria-expanded={searchOpen}>
          {searchOpen ? <X size={20} aria-hidden /> : <Search size={20} aria-hidden />}
        </button>
        <Link to="/cart" className="c-icon-btn c-cart" aria-label={cartCount ? t("Giỏ hàng, {n} món", { n: cartCount }) : t("Giỏ hàng")}>
          <ShoppingBag size={21} aria-hidden />
          {cartCount > 0 && <span className="c-cart-count">{cartCount > 99 ? "99+" : cartCount}</span>}
        </Link>
      </div>
      {searchOpen && <div className="c-head-mobile-search">{searchForm}</div>}

      {/* Máy tính — hàng 1 */}
      <div className="c-head-top" ref={topRef}>
        <div className="c-wrap c-head-top-in">
          <div className="c-brand-col">
            <Link to="/" className="c-brand" aria-label={t("TD Coffee — trang chủ")}>
              <LogoMark width={52} height={52} />
              <span className="c-brand-text">
                <span className="c-brand-name">{info?.company.name ?? "TD Coffee"}</span>
                <span className="c-brand-tag">{t("cà phê Sài Gòn")}</span>
              </span>
            </Link>
            <div className="c-head-store"><StorePicker compact /></div>
          </div>
          {searchForm}
          <div className="c-head-actions">
            {info && (
              <a className="c-hotline" href={info.hotline.href}>
                <span className="c-hotline-k">{t("Đường dây đặt hàng")}</span>
                <span className="c-hotline-v">{info.hotline.display}</span>
              </a>
            )}
            <div className="c-account">
              <User size={20} aria-hidden />
              {loggedIn ? (
                <span className="c-account-txt">
                  <Link to="/account" className="c-account-name">{userName ?? t("Tài khoản")}</Link>
                  <button type="button" className="c-linkish" onClick={onLogout}>{t("Đăng xuất")}</button>
                </span>
              ) : (
                <span className="c-account-txt">
                  <Link to="/login">{t("Đăng nhập")}</Link>
                  <Link to="/register" className="c-muted-link">{t("Đăng ký")}</Link>
                </span>
              )}
            </div>
            <Link to="/cart" className="c-icon-btn c-cart" aria-label={cartCount ? t("Giỏ hàng, {n} món", { n: cartCount }) : t("Giỏ hàng")}>
              <ShoppingBag size={24} aria-hidden />
              {cartCount > 0 && <span className="c-cart-count">{cartCount > 99 ? "99+" : cartCount}</span>}
            </Link>
          </div>
        </div>
      </div>

      {/* Máy tính — hàng 2: thanh màu chủ đạo, dính đầu trang */}
      <nav className={`c-head-bar${stuck ? " is-stuck" : ""}`} aria-label={t("Chính")}>
        <div className="c-wrap c-head-bar-in">
          <Link to="/" className="c-bar-logo" aria-label={t("Trang chủ")}><LogoMark width={30} height={30} /></Link>
          {SITE_LINKS.map((l) => (
            <Link key={l.to} to={l.to} className={`c-bar-link${l.match(loc.pathname) ? " is-on" : ""}`}>{t(l.label)}</Link>
          ))}
          <span className="c-bar-spacer" />
          <Toggles {...color} />
          <Link to="/cart" className="c-bar-cart" aria-label={cartCount ? t("Giỏ hàng, {n} món", { n: cartCount }) : t("Giỏ hàng")}>
            <ShoppingBag size={18} aria-hidden />
            {cartCount > 0 && <span className="c-cart-count">{cartCount > 99 ? "99+" : cartCount}</span>}
          </Link>
        </div>
      </nav>
    </header>
  );
}
