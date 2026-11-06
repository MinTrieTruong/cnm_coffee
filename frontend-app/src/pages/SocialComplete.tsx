import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { safeNext, useSessionUser } from "../lib/session";
import { useSiteInfo } from "../lib/site";
import { PasswordInput } from "../components/PasswordInput";
import { isLinkRequired, useFinishSignIn, type LinkRequired, type SignInResult } from "../components/site/SocialLogin";
import { useLang } from "../lib/i18n";

const PROVIDER_LABEL = { GOOGLE: "Google", FACEBOOK: "Facebook" } as const;

/** Trùng tài khoản có sẵn: nhập mật khẩu tài khoản cũ để gắn Google / Facebook vào (giữ điểm, hạng, lịch sử đơn) */
function LinkForm({ link, next }: { link: LinkRequired; next: string }) {
  const { t } = useLang();
  const info = useSiteInfo();
  const finish = useFinishSignIn(next);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { account } = link;
  const provider = PROVIDER_LABEL[link.provider];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      finish(await api<SignInResult>("/api/auth/social/link", { method: "POST", body: JSON.stringify({ ticket: link.ticket, password }) }));
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : t("Liên kết thất bại"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="c-link-acc">
        <strong>{account.fullName}</strong>
        {account.phone && <span>{account.phone}</span>}
        {account.email && <span>{account.email}</span>}
      </div>
      {account.hasPassword ? (
        <form onSubmit={onSubmit}>
          <p className="c-auth-hint">
            {t("Nhập mật khẩu của tài khoản này để liên kết với {p}. Điểm, hạng thành viên và lịch sử đơn được giữ nguyên.", { p: provider })}
          </p>
          <div className="field" style={{ marginBottom: "1rem" }}>
            <label className="label" style={{ color: "var(--muted)" }} htmlFor="link-pw">{t("Mật khẩu")}</label>
            <PasswordInput id="link-pw" className="input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
          </div>
          {err && <p className="c-social-err" role="alert">{err}</p>}
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? t("Đang liên kết…") : t("Liên kết và đăng nhập")}
          </button>
        </form>
      ) : (
        <p className="c-auth-hint">
          {t("Tài khoản này chưa đặt mật khẩu nên chưa liên kết tự động được. Vui lòng liên hệ quán để được hỗ trợ")}
          {info?.hotline.value && <> — <a href={info.hotline.href}>{info.hotline.display}</a></>}.
        </p>
      )}
      <Link to={`/login?next=${encodeURIComponent(next)}`} className="ghost-btn">{t("Dùng cách đăng nhập khác")}</Link>
    </>
  );
}

/** /login/link — đến từ nút Google / Facebook khi email trùng tài khoản có sẵn */
export function LinkAccount() {
  const { t } = useLang();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const link = useLocation().state as LinkRequired | null;
  if (!link?.ticket) return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  return (
    <div className="auth-page">
      <div className="auth-content">
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <h1 className="c-auth-title">{t("Tài khoản đã tồn tại")}</h1>
          <p style={{ color: "var(--text)", margin: 0, fontSize: "0.95rem" }}>
            {t("Email {p} của bạn trùng với một tài khoản thành viên có sẵn.", { p: PROVIDER_LABEL[link.provider] })}
          </p>
        </div>
        <div className="glass-box">
          <LinkForm link={link} next={next} />
        </div>
      </div>
    </div>
  );
}

/** /login/phone — bổ sung SĐT cho tài khoản tạo bằng Google / Facebook (đơn hàng, điểm, giao hàng dùng SĐT) */
export function CompletePhone() {
  const { t } = useLang();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const user = useSessionUser();
  const finish = useFinishSignIn(next);
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<LinkRequired | null>(null);

  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(`/login/phone?next=${next}`)}`} replace />;
  if (user.phone && !link) return <Navigate to={next} replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const p = phone.replace(/[\s.-]/g, "");
    if (!/^0\d{9}$/.test(p)) return setErr(t("Số điện thoại gồm 10 số, bắt đầu bằng 0."));
    setLoading(true);
    try {
      finish(await api<SignInResult>("/api/auth/phone", { method: "POST", body: JSON.stringify({ phone: p }) }));
    } catch (e2) {
      if (isLinkRequired(e2)) setLink(e2.data);
      else setErr(e2 instanceof Error ? e2.message : t("Lưu số điện thoại thất bại"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-content">
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <h1 className="c-auth-title">{link ? t("Tài khoản đã tồn tại") : t("Bổ sung số điện thoại")}</h1>
          <p style={{ color: "var(--text)", margin: 0, fontSize: "0.95rem" }}>
            {link
              ? t("Số điện thoại này đã thuộc một tài khoản thành viên có sẵn.")
              : t("Số điện thoại dùng để tích điểm, nhận đơn giao hàng và để quán liên hệ khi cần.")}
          </p>
        </div>
        <div className="glass-box">
          {link ? (
            <LinkForm link={link} next={next} />
          ) : (
            <form onSubmit={onSubmit}>
              <div className="field" style={{ marginBottom: "1rem" }}>
                <label className="label" style={{ color: "var(--muted)" }} htmlFor="cp-phone">{t("Số điện thoại *")}</label>
                <input
                  id="cp-phone"
                  className="input"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="09xx xxx xxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              {err && <p className="c-social-err" role="alert">{err}</p>}
              <button type="submit" className="auth-btn" disabled={loading}>
                {loading ? t("Đang lưu…") : t("Lưu số điện thoại")}
              </button>
              <button type="button" className="ghost-btn" onClick={() => nav(next, { replace: true })}>
                {t("Để sau")}
              </button>
              <p className="c-auth-hint" style={{ marginTop: "1rem" }}>
                {t("Chưa có số điện thoại thì chưa đặt giao hàng và chưa tích điểm được.")}
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/** Nhắc bổ sung SĐT cho khách đăng nhập bằng Google / Facebook mà bấm "Để sau" */
export function PhoneReminder({ next }: { next: string }) {
  const { t } = useLang();
  const user = useSessionUser();
  if (!user || user.phone) return null;
  return (
    <div className="c-phone-reminder" role="status">
      <span>{t("Bổ sung số điện thoại để đặt giao hàng và tích điểm.")}</span>
      <Link to={`/login/phone?next=${encodeURIComponent(next)}`} className="c-btn is-outline">{t("Bổ sung")}</Link>
    </div>
  );
}
