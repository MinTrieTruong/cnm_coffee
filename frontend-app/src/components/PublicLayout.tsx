import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearSession, useSessionUser } from "../lib/session";
import { CustomerAvatar } from "./CustomerAvatar";
import { CART_EVENT, getCart } from "../lib/cart";
import { BottomNav } from "./BottomNav";
import { customerNav } from "../lib/navConfig";
import { canGoBackInApp } from "../lib/appHistory";
import { PopupHost } from "./popup/PopupHost";
import { FloatingContact } from "./contact/FloatingContact";
import { SiteHeader } from "./site/SiteHeader";
import { SiteFooter } from "./site/SiteFooter";
import { useSiteInfo } from "../lib/site";
import { paletteVars, useColorMode } from "../lib/siteTheme";
import { useLang } from "../lib/i18n";
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
    ["/account/profile", "Thông tin cá nhân"],
    ["/account/security", "Bảo mật"],
    ["/account/orders", "Đơn hàng"],
    ["/account/reviews", "Đánh giá đơn"],
    ["/account/points", "Lịch sử điểm"],
    ["/account/vouchers", "Ví voucher"],
    ["/account/gifts", "Quà của tôi"],
    ["/account/feedback", "Nhận xét chung"],
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
  if (p.startsWith("/order/")) return "/account/orders";
  if (p.startsWith("/account/")) return "/account";
  return "/";
}

/** Trang chính (là tab đáy) — các trang khác coi là trang con, có nút quay lại */
const ROOT_PAGES = ["/", "/menu", "/account", "/promotions", "/blog", "/about", "/contact"];

/** Luồng tập trung có thanh hành động riêng → ẩn thanh điều hướng đáy */
const TABBAR_HIDDEN_PREFIXES = ["/order/", "/staff/login", "/vnpay-return"];

export function PublicLayout() {
  const loc = useLocation();
  const nav = useNavigate();
  // Tự cập nhật khi đăng nhập / đăng xuất / đổi ảnh đại diện (lib/session phát sự kiện)
  const user = useSessionUser();
  const loggedIn = !!user;
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
  // Màu do chủ chuỗi chọn (Website › Giao diện) + chế độ sáng/tối của khách
  const info = useSiteInfo();
  const color = useColorMode(info?.theme ?? null);
  const themeStyle = info?.theme ? paletteVars(info.theme, color.mode) : undefined;
  const { t, lang } = useLang();
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const navItems = customerNav(loggedIn).map((it) => ({
    ...it,
    label: t(it.label),
    short: t(it.short),
    // Tab Tài khoản: avatar khách thay icon khi đã đăng nhập
    ...(it.id === "account" && user ? { iconNode: <CustomerAvatar src={user.avatarUrl} name={user.fullName} size={24} className="bn-ava" /> } : {}),
  }));
  function handleLogout() {
    clearSession();
    nav("/", { replace: true });
  }

  const p = loc.pathname;
  const showTabBar = !TABBAR_HIDDEN_PREFIXES.some((x) => p.startsWith(x));
  const isSubPage = !ROOT_PAGES.includes(p);
  const goBack = () => (canGoBackInApp() ? nav(-1) : nav(parentOf(p), { replace: true }));

  return (
    <div className="site-root c-site" style={themeStyle}>
      <SiteHeader
        user={user}
        cartCount={cartCount}
        onLogout={handleLogout}
        mobileTitle={t(titleOf(p))}
        color={color}
        onBack={isSubPage ? goBack : null}
      />

      <main className="site-main c-main">
        <Outlet />
        <PopupHost />
        {/* Nút liên hệ nổi: ẩn ở trang thanh toán và trang đăng nhập nhân sự */}
        {!/^\/order\/[^/]+\/checkout/.test(p) && !p.startsWith("/staff") && <FloatingContact />}
      </main>

      <BottomNav items={navItems} badges={{ cart: cartCount }} hidden={!showTabBar} />

      <SiteFooter color={color} />
    </div>
  );
}
