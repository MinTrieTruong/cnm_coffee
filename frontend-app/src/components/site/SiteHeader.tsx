import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronLeft, Menu as MenuIcon, Search, ShoppingBag, User, X } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { useMenuData, useSiteInfo } from "../../lib/site";
import { LogoMark } from "../LogoMark";
import { StorePicker } from "../StorePicker";

export const SITE_LINKS = [
  { to: "/menu", label: "Thực đơn", match: (p: string) => p.startsWith("/menu") || p.startsWith("/product") },
  { to: "/promotions", label: "Khuyến mãi", match: (p: string) => p === "/promotions" },
  { to: "/blog", label: "Tin tức", match: (p: string) => p.startsWith("/blog") },
  { to: "/about", label: "Cửa hàng", match: (p: string) => p === "/about" },
  { to: "/contact", label: "Liên hệ", match: (p: string) => p === "/contact" },
];

/**
 * Header trang khách: hàng 1 nền giấy (logo · tìm kiếm · hotline · tài khoản · giỏ),
 * hàng 2 thanh đỏ gạch (danh mục sản phẩm + liên kết). Dính đầu trang, cuộn xuống thì chỉ còn hàng 2.
 */
export function SiteHeader({
  loggedIn,
  userName,
  cartCount,
  onLogout,
  mobileTitle,
  onBack,
}: {
  loggedIn: boolean;
  userName: string | null;
  cartCount: number;
  onLogout: () => void;
  mobileTitle: string;
  /** Trang con: nút quay lại trên điện thoại */
  onBack: (() => void) | null;
}) {
  const loc = useLocation();
  const nav = useNavigate();
  const info = useSiteInfo();
  const menu = useMenuData();
  const [q, setQ] = useState("");
  const [compact, setCompact] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const catsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 140);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    setCatsOpen(false);
    setSearchOpen(false);
  }, [loc.pathname, loc.search]);
  useEffect(() => {
    if (!catsOpen) return;
    const onDoc = (e: MouseEvent) => catsRef.current && !catsRef.current.contains(e.target as Node) && setCatsOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCatsOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [catsOpen]);

  function search(e: FormEvent) {
    e.preventDefault();
    const s = q.trim();
    nav(s ? `/menu?q=${encodeURIComponent(s)}` : "/menu");
  }

  // Danh mục gốc kèm ảnh 1 món tiêu biểu
  const cats = (menu?.categories ?? []).filter((c) => !c.parentId).map((c) => ({
    ...c,
    image: menu?.products.find((p) => p.categoryId === c.id && p.imageUrl)?.imageUrl ?? null,
  }));

  const searchForm = (
    <form className="c-search" role="search" onSubmit={search}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hôm nay bạn muốn uống gì?" aria-label="Tìm món" />
      <button type="submit" aria-label="Tìm"><Search size={18} aria-hidden /></button>
    </form>
  );

  return (
    <header className={`c-header${compact ? " is-compact" : ""}`}>
      {/* Điện thoại: logo/quay lại · tiêu đề · tìm · giỏ */}
      <div className="c-head-mobile">
        {onBack ? (
          <button type="button" className="c-icon-btn" onClick={onBack} aria-label="Quay lại"><ChevronLeft size={22} aria-hidden /></button>
        ) : (
          <Link to="/" aria-label="Trang chủ"><LogoMark width={34} height={34} /></Link>
        )}
        <span className="c-head-mobile-title">{mobileTitle}</span>
        <button type="button" className="c-icon-btn" onClick={() => setSearchOpen((v) => !v)} aria-label="Tìm món" aria-expanded={searchOpen}>
          {searchOpen ? <X size={20} aria-hidden /> : <Search size={20} aria-hidden />}
        </button>
        <Link to="/cart" className="c-icon-btn c-cart" aria-label={cartCount ? `Giỏ hàng, ${cartCount} món` : "Giỏ hàng"}>
          <ShoppingBag size={21} aria-hidden />
          {cartCount > 0 && <span className="c-cart-count">{cartCount > 99 ? "99+" : cartCount}</span>}
        </Link>
      </div>
      {searchOpen && <div className="c-head-mobile-search">{searchForm}</div>}

      {/* Máy tính — hàng 1 */}
      <div className="c-head-top">
        <div className="c-wrap c-head-top-in">
          <div className="c-brand-col">
            <Link to="/" className="c-brand" aria-label="TD Coffee — trang chủ">
              <LogoMark width={52} height={52} />
              <span className="c-brand-text">
                <span className="c-brand-name">{info?.company.name ?? "TD Coffee"}</span>
                <span className="c-brand-tag">cà phê Sài Gòn</span>
              </span>
            </Link>
            <div className="c-head-store"><StorePicker compact /></div>
          </div>
          {searchForm}
          <div className="c-head-actions">
            {info && (
              <a className="c-hotline" href={info.hotline.href}>
                <span className="c-hotline-k">Đặt hàng</span>
                <span className="c-hotline-v">{info.hotline.display}</span>
              </a>
            )}
            <div className="c-account">
              <User size={20} aria-hidden />
              {loggedIn ? (
                <span className="c-account-txt">
                  <Link to="/account" className="c-account-name">{userName ?? "Tài khoản"}</Link>
                  <button type="button" className="c-linkish" onClick={onLogout}>Đăng xuất</button>
                </span>
              ) : (
                <span className="c-account-txt">
                  <Link to="/login">Đăng nhập</Link>
                  <Link to="/register" className="c-muted-link">Đăng ký</Link>
                </span>
              )}
            </div>
            <Link to="/cart" className="c-icon-btn c-cart" aria-label={cartCount ? `Giỏ hàng, ${cartCount} món` : "Giỏ hàng"}>
              <ShoppingBag size={24} aria-hidden />
              {cartCount > 0 && <span className="c-cart-count">{cartCount > 99 ? "99+" : cartCount}</span>}
            </Link>
          </div>
        </div>
      </div>

      {/* Máy tính — hàng 2: thanh đỏ gạch */}
      <nav className="c-head-bar" aria-label="Chính">
        <div className="c-wrap c-head-bar-in">
          <Link to="/" className="c-bar-logo" aria-label="Trang chủ"><LogoMark width={30} height={30} /></Link>
          <div className="c-cats" ref={catsRef}>
            <button type="button" className="c-cats-btn" onClick={() => setCatsOpen((v) => !v)} aria-expanded={catsOpen} aria-haspopup="true">
              <MenuIcon size={18} aria-hidden /> Danh mục sản phẩm <ChevronDown size={16} aria-hidden />
            </button>
            {catsOpen && (
              <div className="c-cats-pop">
                {cats.map((c) => (
                  <Link key={c.id} to={`/menu?category=${c.id}`} className="c-cats-item">
                    {c.image ? <img src={mediaUrl(c.image)} alt="" loading="lazy" /> : <span className="c-cats-ph" aria-hidden />}
                    <span>{c.name}</span>
                  </Link>
                ))}
                {!cats.length && <span className="c-cats-empty">Đang tải danh mục…</span>}
              </div>
            )}
          </div>
          {SITE_LINKS.map((l) => (
            <Link key={l.to} to={l.to} className={`c-bar-link${l.match(loc.pathname) ? " is-on" : ""}`}>{l.label}</Link>
          ))}
          <span className="c-bar-spacer" />
          <Link to="/cart" className="c-bar-cart" aria-label={cartCount ? `Giỏ hàng, ${cartCount} món` : "Giỏ hàng"}>
            <ShoppingBag size={18} aria-hidden />
            {cartCount > 0 && <span className="c-cart-count">{cartCount > 99 ? "99+" : cartCount}</span>}
          </Link>
        </div>
      </nav>
    </header>
  );
}
