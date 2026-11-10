import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, Menu as MenuIcon, Search, ShoppingBag, User, X } from "lucide-react";
import { useSiteInfo } from "../../lib/site";
import { LogoMark } from "../LogoMark";
import { useLang } from "../../lib/i18n";
import type { ColorMode } from "../../lib/siteTheme";
import { Toggles } from "./Toggles";
import { AccountMenu } from "./AccountMenu";
import type { SessionUser } from "../../lib/session";
import { QuickOrderMic, openQuickOrder, useQuickOrder } from "./QuickOrder";
import { looksLikeOrder } from "../../lib/voiceOrder";
import { MegaNav, MobileDrawer } from "./MegaMenu";

/**
 * Header trang khách: một hàng (logo · mega menu · tìm · tài khoản · giỏ · Đặt món).
 * Dính đầu trang. Trang có ảnh hero sát đầu (lux.tsx › useHeroHeader) thì header trong suốt đè lên ảnh;
 * cuộn xuống chuyển nền kem mờ + bóng nhẹ, thanh thu từ 88px còn 64px.
 * Khung ngoài luôn cao 88px (chỉ thanh bên trong co lại) → nội dung không nhảy khi cuộn.
 * Điện thoại: menu (ngăn kéo toàn màn hình) trái · logo giữa · tìm + giỏ phải; trang con thêm nút quay lại.
 */
export function SiteHeader({
  user,
  cartCount,
  onLogout,
  onBack,
  color,
}: {
  /** Khách đang đăng nhập (null = chưa đăng nhập) */
  user: SessionUser | null;
  cartCount: number;
  onLogout: () => void;
  /** Trang con: nút quay lại trên điện thoại */
  onBack: (() => void) | null;
  color: { mode: ColorMode; setMode: (m: ColorMode) => void; canToggle: boolean };
}) {
  const { t } = useLang();
  const loc = useLocation();
  const nav = useNavigate();
  const info = useSiteInfo();
  const [q, setQ] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const closeDrawer = useCallback(() => setDrawer(false), []);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    setSearchOpen(false);
  }, [loc.pathname, loc.search]);

  const quick = useQuickOrder();
  const orderLike = quick.enabled && looksLikeOrder(q);

  function search(e: FormEvent) {
    e.preventDefault();
    const s = q.trim();
    // Câu gọi món ("2 bạc xỉu ít đá…") → Đặt nhanh; tên món → tìm kiếm như cũ
    if (orderLike) {
      openQuickOrder({ text: s });
      setQ("");
      return;
    }
    nav(s ? `/menu?q=${encodeURIComponent(s)}` : "/menu");
  }

  const cartLabel = cartCount ? t("Giỏ hàng, {n} món", { n: cartCount }) : t("Giỏ hàng");
  const cartBadge = cartCount > 0 && <span className="c-cart-count">{cartCount > 99 ? "99+" : cartCount}</span>;
  const brand = info?.company.name ?? "TD Coffee";

  return (
    <header className={`c-header${scrolled || searchOpen ? " is-scrolled" : ""}`}>
      <div className="c-head-bar">
        <div className="c-wrap c-head-in">
          {/* Điện thoại: menu + quay lại */}
          <div className="c-head-left">
            <button type="button" className="c-icon-btn" onClick={() => setDrawer(true)} aria-label={t("Mở menu")} aria-expanded={drawer}>
              <MenuIcon size={23} aria-hidden />
            </button>
            {onBack && (
              <button type="button" className="c-icon-btn" onClick={onBack} aria-label={t("Quay lại")}><ChevronLeft size={23} aria-hidden /></button>
            )}
          </div>

          <Link to="/" className="c-brand" aria-label={t("{name} — trang chủ", { name: brand })}>
            <LogoMark width={44} height={44} />
            <span className="c-brand-name">{brand}</span>
          </Link>

          <MegaNav />

          <div className="c-head-actions">
            <button type="button" className="c-icon-btn" onClick={() => setSearchOpen((v) => !v)} aria-label={t("Tìm món")} aria-expanded={searchOpen} aria-controls="c-head-search">
              {searchOpen ? <X size={21} aria-hidden /> : <Search size={21} aria-hidden />}
            </button>
            <div className="c-head-toggles"><Toggles {...color} /></div>
            <div className="c-head-acc">
              {user ? (
                <AccountMenu user={user} onLogout={onLogout} />
              ) : (
                <Link to="/login" className="c-icon-btn" aria-label={t("Đăng nhập")} title={t("Đăng nhập")}><User size={21} aria-hidden /></Link>
              )}
            </div>
            <Link to="/cart" className="c-icon-btn c-cart" aria-label={cartLabel}>
              <ShoppingBag size={21} aria-hidden />
              {cartBadge}
            </Link>
            <Link to="/menu" className="c-btn is-sm c-head-cta">{t("Đặt món")}</Link>
          </div>
        </div>
      </div>

      {searchOpen && (
        <div className="c-head-search" id="c-head-search">
          <div className="c-wrap">
          <form className="c-search" role="search" onSubmit={search}>
            <Search size={20} aria-hidden className="c-search-ico" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Hôm nay bạn muốn uống gì?")} aria-label={t("Tìm món")} />
            <QuickOrderMic />
            <button type="submit" className="c-btn is-sm">{orderLike ? t("Đặt nhanh") : t("Tìm")}</button>
          </form>
          </div>
        </div>
      )}

      <MobileDrawer open={drawer} onClose={closeDrawer} user={user} onLogout={onLogout} toggles={<Toggles {...color} />} />
    </header>
  );
}
