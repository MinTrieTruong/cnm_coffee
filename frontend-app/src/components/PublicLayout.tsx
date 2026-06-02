import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearSession, getUser, isGuestMode } from "../lib/session";
import { getCart } from "../lib/cart";
import { LogoMark } from "./LogoMark";

const CONTACT = {
  phone: "028 1234 5678",
  email: "hello@tdcoffee.vn",
  address: "123 Đường Cà Phê, Q.1, TP.HCM",
  hours: "7:00 – 22:00 hằng ngày",
};

export function PublicLayout() {
  const loc = useLocation();
  const nav = useNavigate();
  const user = getUser();
  const guest = isGuestMode();
  const cartCount = getCart().reduce((s, i) => s + i.quantity, 0);

  function handleLogout() {
    clearSession();
    nav("/", { replace: true });
  }

  return (
    <div className="site-root">
      <header className="site-header">
        <div className="site-header-inner">
          <Link to="/" className="site-brand">
            <LogoMark className="site-logo" width={44} height={44} />
            <span className="site-brand-text">TD Coffee</span>
          </Link>
          <nav className="site-nav" aria-label="Chính">
            <Link
              to="/about"
              className={loc.pathname === "/about" ? "site-nav-link site-nav-active" : "site-nav-link"}
            >
              Quán
            </Link>
            <Link
              to="/menu"
              className={
                loc.pathname.startsWith("/menu") || loc.pathname.startsWith("/product")
                  ? "site-nav-link site-nav-active"
                  : "site-nav-link"
              }
            >
              Menu
            </Link>
            <Link to="/cart" className={loc.pathname === "/cart" ? "site-nav-link site-nav-active" : "site-nav-link"}>
              Giỏ hàng{cartCount > 0 ? ` (${cartCount})` : ""}
            </Link>
            {!guest && user ? (
              <>
                <Link to="/account" className={loc.pathname === "/account" ? "site-nav-link site-nav-active" : "site-nav-link"}>
                  Tài khoản
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="site-nav-link"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--muted)", fontSize: "inherit" }}
                >
                  Đăng xuất
                </button>
              </>
            ) : (
              <>
                <Link to="/" className={loc.pathname === "/" ? "site-nav-link site-nav-active" : "site-nav-link"}>
                  Đăng nhập
                </Link>
                <Link to="/register" className={loc.pathname === "/register" ? "site-nav-link site-nav-active" : "site-nav-link"}>
                  Đăng ký
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="site-main">
        <Outlet />
      </main>

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
