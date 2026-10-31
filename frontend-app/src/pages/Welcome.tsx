import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { safeNext, setSession, setGuestMode } from "../lib/session";
import { PasswordInput } from "../components/PasswordInput";
import { useLang } from "../lib/i18n";

export function Welcome() {
  const { t } = useLang();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const data = await api<{ token: string; user: import("../lib/session").SessionUser }>(
        "/api/auth/login",
        { method: "POST", body: JSON.stringify({ login, password }) },
      );
      setSession(data.token, data.user);
      nav(next, { replace: true });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : t("Đăng nhập thất bại"));
    } finally {
      setLoading(false);
    }
  }

  function onGuest() {
    setGuestMode();
    nav("/menu", { replace: true });
  }

  return (
    <div className="auth-page">
      <div className="auth-content">
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1 className="c-auth-title">{t("Đăng nhập")}</h1>
          <p style={{ color: "var(--text)", margin: 0, fontSize: "0.95rem" }}>
            {t("Tích điểm mỗi đơn, lưu món quen, nhận voucher riêng")}
          </p>
        </div>

        <div className="glass-box">
          <form onSubmit={onLogin}>
            <div className="field">
              <label className="label" style={{ color: "var(--muted)" }} htmlFor="login">
                {t("Số điện thoại hoặc Email")}
              </label>
              <input
                id="login"
                className="input"
                type="text"
                autoComplete="username"
                placeholder="0900000000"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                required
              />
            </div>
            <div className="field" style={{ marginBottom: "1.5rem" }}>
              <label className="label" style={{ color: "var(--muted)" }} htmlFor="password">
                {t("Mật khẩu")}
              </label>
              <PasswordInput
                id="password"
                className="input"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {err && <p style={{ color: "#b91c1c", fontSize: "0.9rem", margin: "0 0 1rem" }}>{err}</p>}
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? t("Đang đăng nhập…") : t("Đăng nhập")}
            </button>
          </form>

          <p style={{ textAlign: "center", color: "var(--muted)", margin: "1.5rem 0 1rem", fontSize: "0.9rem" }}>
            {t("Chưa có tài khoản?")}{" "}
            <Link to={params.get("next") ? `/register?next=${encodeURIComponent(next)}` : "/register"} style={{ color: "var(--accent)", fontWeight: 600 }}>{t("Đăng ký")}</Link>
          </p>

          <div style={{ position: "relative", textAlign: "center", margin: "1.5rem 0" }}>
            <div style={{ position: "absolute", top: "50%", left: 0, right: 0, borderTop: "1px dashed var(--border)" }} />
            <span style={{ background: "var(--surface2)", padding: "0 10px", position: "relative", fontSize: "0.8rem", color: "var(--muted)", textTransform: "uppercase" }}>{t("Hoặc")}</span>
          </div>

          <button type="button" className="ghost-btn" onClick={onGuest}>
            {t("Tiếp tục không đăng nhập")}
          </button>
        </div>

        <footer style={{ textAlign: "center", marginTop: "2rem" }}>
          <Link to="/staff/login" style={{ color: "var(--muted)", fontSize: "0.85rem", textDecoration: "none" }}>
            {t("Dành cho Nhân sự")}
          </Link>
        </footer>
      </div>
    </div>
  );
}
