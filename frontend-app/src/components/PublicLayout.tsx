import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Coffee,
  Home,
  Info,
  LogIn,
  LogOut,
  Menu,
  Newspaper,
  ShoppingBag,
  Tag,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { clearSession, getUser, isGuestMode } from "../lib/session";
import { getCart } from "../lib/cart";
import { LogoMark } from "./LogoMark";

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

const TABBAR_HIDDEN_PREFIXES = ["/product/", "/cart", "/order/", "/login", "/register", "/staff/login", "/vnpay-return"];

export function PublicLayout() {
  const loc = useLocation();
  const nav = useNavigate();
  const user = getUser();
  const guest = isGuestMode();
  const loggedIn = !guest && !!user;
  const cartCount = getCart().reduce((s, i) => s + i.quantity, 0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Đóng drawer khi đổi trang
  useEffect(() => {
    setDrawerOpen(false);
  }, [loc.pathname]);

  // Khóa cuộn nền khi drawer mở
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  function handleLogout() {
    clearSession();
    setDrawerOpen(false);
    nav("/", { replace: true });
  }

  // Ẩn tab bar ở các luồng tập trung (chi tiết món, giỏ, thanh toán, đăng nhập) vì đã có thanh hành động riêng
  const p = loc.pathname;
  const showTabBar = !TABBAR_HIDDEN_PREFIXES.some((x) => p.startsWith(x));
  const tabBarItems = [
    { to: "/", label: "Trang chủ", icon: Home, active: p === "/", badge: 0 },
    { to: "/menu", label: "Menu", icon: Coffee, active: p.startsWith("/menu"), badge: 0 },
    { to: "/promotions", label: "Ưu đãi", icon: Tag, active: p === "/promotions", badge: 0 },
    { to: "/cart", label: "Giỏ hàng", icon: ShoppingBag, active: false, badge: cartCount },
    loggedIn
      ? { to: "/account", label: "Tài khoản", icon: User, active: p === "/account", badge: 0 }
      : { to: "/login", label: "Đăng nhập", icon: LogIn, active: false, badge: 0 },
  ];

  const linkCls = (active: boolean) => (active ? "site-nav-link site-nav-active" : "site-nav-link");
  const drawerCls = (active: boolean) => (active ? "site-drawer-link site-drawer-link-active" : "site-drawer-link");

  return (
    <div className={showTabBar ? "site-root site-root-tabbar" : "site-root"}>
      <header className="site-header">
        <div className="site-header-inner">
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

            <button
              type="button"
              className="site-icon-btn site-menu-btn"
              onClick={() => setDrawerOpen(true)}
              aria-label="Mở menu"
              aria-expanded={drawerOpen}
              aria-controls="site-drawer"
            >
              <Menu size={24} aria-hidden />
            </button>
          </div>
        </div>
      </header>

      {/* Drawer (mobile/tablet) */}
      {drawerOpen && <div className="site-drawer-overlay" onClick={() => setDrawerOpen(false)} role="presentation" />}
      <aside
        id="site-drawer"
        className={drawerOpen ? "site-drawer site-drawer-open" : "site-drawer"}
        aria-label="Menu"
        aria-hidden={!drawerOpen}
      >
        <div className="site-drawer-head">
          <Link to="/" className="site-brand">
            <LogoMark className="site-logo" width={36} height={36} />
            <span className="site-brand-text">TD Coffee</span>
          </Link>
          <button type="button" className="site-icon-btn" onClick={() => setDrawerOpen(false)} aria-label="Đóng menu">
            <X size={22} aria-hidden />
          </button>
        </div>
        <nav className="site-drawer-nav">
          {MAIN_LINKS.map(({ to, label, icon: Icon, match }) => (
            <Link key={to} to={to} className={drawerCls(match(loc.pathname))}>
              <Icon size={20} aria-hidden /> {label}
            </Link>
          ))}
          <Link to="/cart" className={drawerCls(loc.pathname === "/cart")}>
            <ShoppingBag size={20} aria-hidden /> Giỏ hàng{cartCount > 0 ? ` (${cartCount})` : ""}
          </Link>
          <div className="site-drawer-sep" />
          {loggedIn ? (
            <>
              <Link to="/account" className={drawerCls(loc.pathname === "/account")}>
                <User size={20} aria-hidden /> Tài khoản
              </Link>
              <button type="button" onClick={handleLogout} className="site-drawer-link site-drawer-danger">
                <LogOut size={20} aria-hidden /> Đăng xuất
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className={drawerCls(loc.pathname === "/login")}>
                <LogIn size={20} aria-hidden /> Đăng nhập
              </Link>
              <Link to="/register" className={drawerCls(loc.pathname === "/register")}>
                <UserPlus size={20} aria-hidden /> Đăng ký
              </Link>
            </>
          )}
        </nav>
      </aside>

      <main className="site-main">
        <Outlet />
      </main>

      {/* Tab bar (mobile): các tác vụ khách dùng nhiều nhất, trong tầm ngón cái */}
      {showTabBar && (
        <nav className="site-tabbar" aria-label="Điều hướng nhanh">
          {tabBarItems.map(({ to, label, icon: Icon, active, badge }) => (
            <Link
              key={to}
              to={to}
              className={active ? "site-tabbar-item site-tabbar-active" : "site-tabbar-item"}
              aria-current={active ? "page" : undefined}
            >
              <span className="site-tabbar-icon">
                <Icon size={21} aria-hidden />
                {badge ? <span className="site-tabbar-badge">{badge > 99 ? "99+" : badge}</span> : null}
              </span>
              <span className="site-tabbar-label">{label}</span>
            </Link>
          ))}
        </nav>
      )}

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
