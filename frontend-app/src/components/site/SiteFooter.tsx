import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Mail, MapPin, Phone } from "lucide-react";
import { api } from "../../lib/api";
import { getStoreId } from "../../lib/customerStore";
import { useSiteInfo } from "../../lib/site";
import { ContactIcon } from "../contact/ContactStack";
import { LogoMark } from "../LogoMark";

export const POLICIES = [
  { slug: "dat-hang", label: "Chính sách đặt hàng" },
  { slug: "bao-mat", label: "Chính sách bảo mật" },
  { slug: "thanh-toan", label: "Chính sách thanh toán" },
  { slug: "doi-tra", label: "Chính sách đổi trả" },
];

const SOCIAL_COLOR: Record<string, string> = { ZALO: "#0068FF", MESSENGER: "#0084FF", CUSTOM: "#6F4E37" };

/** Footer nâu mực 4 cột: công ty · chính sách · hỗ trợ · đăng ký nhận tin */
export function SiteFooter() {
  const info = useSiteInfo();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");

  async function subscribe(e: FormEvent) {
    e.preventDefault();
    setState("busy");
    try {
      const r = await api<{ already?: boolean }>("/api/contact-messages", { method: "POST", body: JSON.stringify({ kind: "NEWSLETTER", email, storeId: getStoreId() }) });
      setState("ok");
      setMsg(r.already ? "Email này đã đăng ký rồi." : "Đã đăng ký. Quán sẽ gửi ưu đãi mới vào email của bạn.");
      setEmail("");
    } catch (ex) {
      setState("err");
      setMsg(ex instanceof Error ? ex.message : "Chưa gửi được, thử lại sau.");
    }
  }

  const c = info?.company;
  return (
    <footer className="c-footer">
      <div className="c-wrap c-footer-grid">
        <div className="c-footer-col c-footer-brand">
          <div className="c-footer-logo">
            <LogoMark width={44} height={44} />
            <span>{c?.name ?? "TD Coffee"}</span>
          </div>
          {c && <p className="c-footer-intro">{c.intro}</p>}
          {c && (
            <ul className="c-footer-contact">
              <li><MapPin size={15} aria-hidden /><span>{c.address}</span></li>
              <li><Phone size={15} aria-hidden /><a href={info!.hotline.href}>{info!.hotline.display}</a></li>
              <li><Mail size={15} aria-hidden /><a href={`mailto:${c.email}`}>{c.email}</a></li>
            </ul>
          )}
          {!!info?.socials.length && (
            <div className="c-footer-social">
              {info.socials.map((s) => (
                <a key={s.id} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} title={s.label} style={{ background: SOCIAL_COLOR[s.type] }}>
                  <ContactIcon b={{ type: s.type, icon: s.icon, color: SOCIAL_COLOR[s.type] }} />
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="c-footer-col">
          <h2 className="c-footer-h">Chính sách</h2>
          <ul className="c-footer-links">
            {POLICIES.map((p) => <li key={p.slug}><Link to={`/policy/${p.slug}`}>{p.label}</Link></li>)}
          </ul>
        </div>

        <div className="c-footer-col">
          <h2 className="c-footer-h">Hỗ trợ</h2>
          <ul className="c-footer-links">
            <li><Link to="/menu">Tìm kiếm món</Link></li>
            <li><Link to="/login">Đăng nhập</Link></li>
            <li><Link to="/register">Đăng ký</Link></li>
            <li><Link to="/cart">Giỏ hàng</Link></li>
            <li><Link to="/contact">Liên hệ</Link></li>
          </ul>
        </div>

        <div className="c-footer-col">
          <h2 className="c-footer-h">Đăng ký nhận tin</h2>
          <p className="c-footer-intro">Nhận mã giảm giá và món mới mỗi tháng. Không gửi quá 2 email một tháng.</p>
          <form className="c-news" onSubmit={subscribe}>
            <label htmlFor="c-news-email" className="c-sr">Email</label>
            <input id="c-news-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email của bạn" />
            <button type="submit" disabled={state === "busy"}>{state === "busy" ? "Đang gửi…" : "Đăng ký"}</button>
          </form>
          {msg && <p className={`c-news-msg${state === "err" ? " is-err" : ""}`} role="status">{msg}</p>}
          {c && <p className="c-footer-hours">Mở cửa {c.hours}</p>}
        </div>
      </div>
      <div className="c-footer-bottom">
        <div className="c-wrap c-footer-bottom-in">
          <span>© {new Date().getFullYear()} {c?.name ?? "TD Coffee"}. Bảo lưu mọi quyền.</span>
          <Link to="/staff/login">Khu vực nhân sự</Link>
        </div>
      </div>
    </footer>
  );
}
