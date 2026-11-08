import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { api } from "../../lib/api";
import { getStoreId } from "../../lib/customerStore";
import { useSiteInfo } from "../../lib/site";
import { ContactIcon } from "../contact/ContactStack";
import { LogoMark } from "../LogoMark";
import { useLang } from "../../lib/i18n";
import type { ColorMode } from "../../lib/siteTheme";
import { Toggles } from "./Toggles";
import { SiteImg } from "./lux";

export const POLICIES = [
  { slug: "dat-hang", label: "Chính sách đặt hàng" },
  { slug: "privacy", label: "Chính sách quyền riêng tư" },
  { slug: "thanh-toan", label: "Chính sách thanh toán" },
  { slug: "doi-tra", label: "Chính sách đổi trả" },
  { slug: "data-deletion", label: "Xoá dữ liệu người dùng" },
];
/** /privacy và /data-deletion có URL riêng (khai báo với Meta / Google), các chính sách khác ở /policy/… */
export const policyHref = (slug: string) => (slug === "privacy" || slug === "data-deletion" ? `/${slug}` : `/policy/${slug}`);

/** Màu thương hiệu cho nét bên trong biểu tượng (Messenger); nút là vòng tròn viền */
const SOCIAL_COLOR: Record<string, string> = { ZALO: "#0068FF", MESSENGER: "#0084FF", CUSTOM: "#6F4E37" };

/** Dải ảnh đầu footer (ảnh mặc định public/site, thay bằng thư viện ảnh ở đợt 3) */
const STRIP = ["space/ben-cua-so", "menu/phin-sua", "space/quay-bar", "menu/croissant", "story/hat-rang", "space/san-vuon"];

/**
 * Footer: dải 6 ảnh vuông · logo + 1 câu + liên hệ + mạng xã hội + đăng ký nhận tin · 4 cột (Khám phá, Hỗ trợ, Chính sách, Ghé quán).
 * Nền --c-footer (siteTheme tính từ màu chủ đạo, mặc định espresso đậm) có hạt nhiễu.
 */
export function SiteFooter({ color }: { color: { mode: ColorMode; setMode: (m: ColorMode) => void; canToggle: boolean } }) {
  const info = useSiteInfo();
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");

  async function subscribe(e: FormEvent) {
    e.preventDefault();
    setState("busy");
    try {
      const r = await api<{ already?: boolean }>("/api/contact-messages", { method: "POST", body: JSON.stringify({ kind: "NEWSLETTER", email, storeId: getStoreId() }) });
      setState("ok");
      setMsg(r.already ? t("Email này đã đăng ký rồi.") : t("Đã đăng ký. Quán sẽ gửi ưu đãi mới vào email của bạn."));
      setEmail("");
    } catch (ex) {
      setState("err");
      setMsg(ex instanceof Error ? ex.message : t("Chưa gửi được, thử lại sau."));
    }
  }

  const c = info?.company;
  const name = c?.name ?? "TD Coffee";
  return (
    <footer className="c-footer c-grain">
      <div className="c-wrap">
        <ul className="c-footer-strip" aria-label={t("Ảnh ở quán")}>
          {STRIP.map((k) => (
            <li key={k}><Link to="/about" tabIndex={-1} aria-hidden><SiteImg src={k} sizes="(max-width: 768px) 33vw, 200px" /></Link></li>
          ))}
        </ul>

        <div className="c-footer-grid">
          <div className="c-footer-brand">
            <Link to="/" className="c-footer-logo"><LogoMark width={52} height={52} /><span>{name}</span></Link>
            <p className="c-footer-intro">{c?.intro ?? t("Cà phê phin pha mới mỗi ly, bánh nướng mỗi sáng. Ngồi lại quán hoặc đặt mang về.")}</p>
            {!!info?.socials.length && (
              <div className="c-footer-social">
                {info.socials.map((s) => (
                  <a key={s.id} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} title={s.label}>
                    <ContactIcon b={{ type: s.type, icon: s.icon, color: SOCIAL_COLOR[s.type] }} />
                  </a>
                ))}
              </div>
            )}
            <form className="c-news" onSubmit={subscribe}>
              <label htmlFor="c-news-email" className="c-news-k">{t("Nhận ưu đãi qua email — tối đa 2 thư mỗi tháng")}</label>
              <div className="c-news-row">
                <input id="c-news-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("Email của bạn")} />
                <button type="submit" disabled={state === "busy"}>{state === "busy" ? t("Đang gửi…") : t("Đăng ký")}</button>
              </div>
            </form>
            {msg && <p className={`c-news-msg${state === "err" ? " is-err" : ""}`} role="status">{msg}</p>}
          </div>

          <nav className="c-footer-col" aria-label={t("Khám phá")}>
            <h2 className="c-footer-h">{t("Khám phá")}</h2>
            <ul className="c-footer-links">
              <li><Link to="/menu">{t("Thực đơn")}</Link></li>
              <li><Link to="/promotions">{t("Khuyến mãi")}</Link></li>
              <li><Link to="/about">{t("Cửa hàng")}</Link></li>
              <li><Link to="/blog">{t("Tin tức")}</Link></li>
            </ul>
          </nav>

          <nav className="c-footer-col" aria-label={t("Hỗ trợ")}>
            <h2 className="c-footer-h">{t("Hỗ trợ")}</h2>
            <ul className="c-footer-links">
              <li><Link to="/contact">{t("Liên hệ")}</Link></li>
              <li><Link to="/cart">{t("Giỏ hàng")}</Link></li>
              <li><Link to="/account/orders">{t("Đơn hàng của tôi")}</Link></li>
              <li><Link to="/login">{t("Đăng nhập")}</Link></li>
            </ul>
          </nav>

          <nav className="c-footer-col" aria-label={t("Chính sách")}>
            <h2 className="c-footer-h">{t("Chính sách")}</h2>
            <ul className="c-footer-links">
              {POLICIES.map((p) => <li key={p.slug}><Link to={policyHref(p.slug)}>{t(p.label)}</Link></li>)}
            </ul>
          </nav>

          <div className="c-footer-col">
            <h2 className="c-footer-h">{t("Ghé quán")}</h2>
            {c && (
              <ul className="c-footer-contact">
                <li><MapPin size={15} aria-hidden /><span>{c.address}</span></li>
                <li><Clock size={15} aria-hidden /><span>{c.hours}</span></li>
                <li><Phone size={15} aria-hidden /><a href={info!.hotline.href}>{info!.hotline.display}</a></li>
                <li><Mail size={15} aria-hidden /><a href={`mailto:${c.email}`}>{c.email}</a></li>
              </ul>
            )}
          </div>
        </div>
      </div>
      <div className="c-footer-bottom">
        <div className="c-wrap c-footer-bottom-in">
          <span>© {new Date().getFullYear()} {name}. {t("Bảo lưu mọi quyền.")}</span>
          <Toggles {...color} />
          <Link to="/staff/login">{t("Khu vực nhân sự")}</Link>
        </div>
      </div>
    </footer>
  );
}
