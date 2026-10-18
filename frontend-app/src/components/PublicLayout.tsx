import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, Coffee, Home, Info, Newspaper, ShoppingBag, Tag, User } from "lucide-react";
import { clearSession, getUser, isGuestMode } from "../lib/session";
import { getCart } from "../lib/cart";
import { LogoMark } from "./LogoMark";
import { BottomNav } from "./BottomNav";
import { customerNav } from "../lib/navConfig";
import { canGoBackInApp } from "../lib/appHistory";

const CONTACT = {
  phone: "0389730362",
  email: "hello@tdcoffee.vn",
  address: "114 Dương Quảng Hàm, Phường 5, Gò Vấp, TP.HCM",
  hours: "7:00 – 22:00 hằng ngày",
};

const MAIN_LINKS = [
  { to: "/", label: "Trang chủ", icon: Home, match: (p: string) => p === "/" },
  { to: "/menu", label: "Menu", icon: Coffee, match: (p: string) => p.startsWith("/menu") || p.startsWith("/product") },
  { to: "/promotions", label: "Khuyến mãi", icon: Tag, match: (p: string) => p === "/promotions" },
  { to: "/blog", label: "Bài viết", icon: Newspaper, match: (p: string) => p.startsWith("/blog") },
  { to: "/about", label: "Về chúng tôi", icon: Info, match: (p: string) => p === "/about" },
];

/** Tiêu đề trang trên header mobile */
function titleOf(p: string): string {
  if (p === "/") return "TD Coffee";
  if (p.startsWith("/order/")) {
    if (p.endsWith("/tracking")) return "Theo dõi đơn";
    if (p.endsWith("/checkout")) return "Thanh toán";
    return "Đơn hàng";
  }
  const map: [string, string][] = [
    ["/menu", "Thực đơn"],
    ["/product/", "Chi tiết món"],
    ["/cart", "Giỏ hàng"],
    ["/account", "Tài khoản"],
    ["/promotions", "Khuyến mãi"],
    ["/blog", "Bài viết"],
    ["/about", "Về chúng tôi"],
    ["/login", "Đăng nhập"],
    ["/register", "Đăng ký"],
    ["/staff/login", "Đăng nhập nhân sự"],
    ["/vnpay-return", "Kết quả thanh toán"],
  ];
  return map.find(([prefix]) => p.startsWith(prefix))?.[1] ?? "TD Coffee";
}
/** Trang cha khi không còn trang trước trong app (mở thẳng URL, sau khi đăng xuất…) */
function parentOf(p: string): string {
  if (p.startsWith("/product/")) return "/menu";
  if (p.startsWith("/blog/")) return "/blog";
  if (p.startsWith("/order/")) return "/account?tab=orders";
  return "/";
}

/** Trang chính (là tab đáy) — các trang khác coi là trang con, có nút quay lại */
const ROOT_PAGES = ["/", "/menu", "/account", "/promotions", "/blog", "/about"];

/** Luồng tập trung có thanh hành động riêng → ẩn thanh điều hướng đáy */
const TABBAR_HIDDEN_PREFIXES = ["/order/", "/staff/login", "/vnpay-return"];

export function PublicLayout() {
  const loc = useLocation();
  const nav = useNavigate();
  const user = getUser();
  const guest = isGuestMode();
  const loggedIn = !guest && !!user;
  const cartCount = getCart().reduce((s, i) => s + i.quantity, 0);
  function handleLogout() {
    clearSession();
    nav("/", { replace: true });
  }

  // Ẩn thanh đáy ở luồng thanh toán / theo dõi đơn và trang đăng nhập nhân sự
  const p = loc.pathname;
  const showTabBar = !TABBAR_HIDDEN_PREFIXES.some((x) => p.startsWith(x));
  const linkCls = (active: boolean) => (active ? "site-nav-link site-nav-active" : "site-nav-link");
  const title = titleOf(p);
  const isSubPage = !ROOT_PAGES.includes(p);
  const goBack = () => (canGoBackInApp() ? nav(-1) : nav(parentOf(p), { replace: true }));

  return (
    <div className="site-root">
      <header className="site-header">
        <div className="site-header-inner">
          {/* Mobile: chỉ tiêu đề trang (+ nút quay lại ở trang con) */}
          <div className="site-mobile-head">
            {isSubPage ? (
              <button type="button" className="site-icon-btn" onClick={goBack} aria-label="Quay lại">
                <ChevronLeft size={22} aria-hidden />
              </button>
            ) : (
              <LogoMark className="site-logo" width={32} height={32} />
            )}
            <span className="site-mobile-title">{title}</span>
          </div>
          <Link to="/" className="site-brand">
            <LogoMark className="site-logo" width={40} height={40} />
            <span className="site-brand-text">TD Coffee</span>
          </Link>

          {/* Desktop nav */}
          <nav className="site-nav" aria-label="Chính">
            {MAIN_LINKS.map((l) => (
              <Link key={l.to} to={l.to} className={linkCls(l.match(loc.pathname))}>
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="site-header-actions">
            {/* Tài khoản (desktop) */}
            <nav className="site-nav" aria-label="Tài khoản">
              {loggedIn ? (
                <>
                  <Link to="/account" className={linkCls(loc.pathname === "/account")}>
                    <User size={16} aria-hidden /> Tài khoản
                  </Link>
                  <button type="button" onClick={handleLogout} className="site-nav-link">
                    Đăng xuất
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className={linkCls(loc.pathname === "/login")}>
                    Đăng nhập
                  </Link>
                  <Link to="/register" className="btn btn-primary" style={{ minHeight: 40, padding: "0.45rem 1rem", borderRadius: 999 }}>
                    Đăng ký
                  </Link>
                </>
              )}
            </nav>

            <Link
              to="/cart"
              className="site-icon-btn"
              aria-label={cartCount > 0 ? `Giỏ hàng, ${cartCount} món` : "Giỏ hàng"}
            >
              <ShoppingBag size={22} aria-hidden />
              {cartCount > 0 && <span className="site-cart-count">{cartCount > 99 ? "99+" : cartCount}</span>}
            </Link>

          </div>
        </div>
      </header>

      <main className="site-main">
        <Outlet />
      </main>

      <BottomNav items={customerNav(loggedIn)} badges={{ cart: cartCount }} hidden={!showTabBar} />

      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="site-footer-col">
            <strong className="site-footer-brand">TD Coffee</strong>
            <p className="site-footer-desc">Cà phê tươi, phục vụ tận tâm — đặt món tại bàn hoặc mang về.</p>
          </div>
          <div className="site-footer-col">
            <h3 className="site-footer-heading">Liên hệ</h3>
            <p>
              Điện thoại: <a href={`tel:${CONTACT.phone.replace(/\s/g, "")}`}>{CONTACT.phone}</a>
            </p>
            <p>
              Email: <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
            </p>
            <p>{CONTACT.address}</p>
          </div>
          <div className="site-footer-col">
            <h3 className="site-footer-heading">Khám phá</h3>
            {MAIN_LINKS.map((l) => (
              <p key={l.to}><Link to={l.to}>{l.label}</Link></p>
            ))}
          </div>
          <div className="site-footer-col">
            <h3 className="site-footer-heading">Giờ mở cửa</h3>
            <p>{CONTACT.hours}</p>
            <p className="site-footer-note">Dữ liệu demo — chỉnh trong mã nguồn khi triển khai thật.</p>
          </div>
        </div>
        <div className="site-footer-bottom">
          <span>© {new Date().getFullYear()} TD Coffee</span>
          <Link to="/staff/login" className="site-footer-staff">
            Khu vực nhân sự
          </Link>
        </div>
      </footer>
    </div>
  );
}
