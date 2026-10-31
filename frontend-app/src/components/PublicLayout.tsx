import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearSession, getUser, isGuestMode } from "../lib/session";
import { CART_EVENT, getCart } from "../lib/cart";
import { BottomNav } from "./BottomNav";
import { customerNav } from "../lib/navConfig";
import { canGoBackInApp } from "../lib/appHistory";
import { PopupHost } from "./popup/PopupHost";
import { FloatingContact } from "./contact/FloatingContact";
import { SiteHeader } from "./site/SiteHeader";
import { SiteFooter } from "./site/SiteFooter";
import "../styles/customer.css";

/** Tiêu đề trang trên header điện thoại */
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
    ["/blog", "Tin tức"],
    ["/about", "Cửa hàng"],
    ["/contact", "Liên hệ"],
    ["/policy/", "Chính sách"],
    ["/game/", "Mini game"],
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
const ROOT_PAGES = ["/", "/menu", "/account", "/promotions", "/blog", "/about", "/contact"];

/** Luồng tập trung có thanh hành động riêng → ẩn thanh điều hướng đáy */
const TABBAR_HIDDEN_PREFIXES = ["/order/", "/staff/login", "/vnpay-return"];

export function PublicLayout() {
  const loc = useLocation();
  const nav = useNavigate();
  const user = getUser();
  const guest = isGuestMode();
  const loggedIn = !guest && !!user;
  const [, bump] = useState(0);
  useEffect(() => {
    const on = () => bump((n) => n + 1);
    window.addEventListener(CART_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(CART_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  const cartCount = getCart().reduce((s, i) => s + i.quantity, 0);
  function handleLogout() {
    clearSession();
    nav("/", { replace: true });
  }

  const p = loc.pathname;
  const showTabBar = !TABBAR_HIDDEN_PREFIXES.some((x) => p.startsWith(x));
  const isSubPage = !ROOT_PAGES.includes(p);
  const goBack = () => (canGoBackInApp() ? nav(-1) : nav(parentOf(p), { replace: true }));

  return (
    <div className="site-root c-site">
      <SiteHeader
        loggedIn={loggedIn}
        userName={user?.fullName ?? null}
        cartCount={cartCount}
        onLogout={handleLogout}
        mobileTitle={titleOf(p)}
        onBack={isSubPage ? goBack : null}
      />

      <main className="site-main c-main">
        <Outlet />
        <PopupHost />
        {/* Nút liên hệ nổi: ẩn ở trang thanh toán và trang đăng nhập nhân sự */}
        {!/^\/order\/[^/]+\/checkout/.test(p) && !p.startsWith("/staff") && <FloatingContact />}
      </main>

      <BottomNav items={customerNav(loggedIn)} badges={{ cart: cartCount }} hidden={!showTabBar} />

      <SiteFooter />
    </div>
  );
}
