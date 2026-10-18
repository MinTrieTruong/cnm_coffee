import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { setSession, setGuestMode, setTableId, setTakeawaySessionId } from "../lib/session";

export function Welcome() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = searchParams.get("idtable") || searchParams.get("table");
    const sid = searchParams.get("sid");
    const qrType = searchParams.get("type");

    if (qrType === "takeaway" && !sid) {
      setTakeawaySessionId(crypto.randomUUID());
      setTableId(null);
      return;
    }

    if (sid?.trim()) {
      setTakeawaySessionId(sid.trim());
      setTableId(null);
      return;
    }

    if (t) {
      const n = Number(t);
      if (!Number.isNaN(n)) {
        setTableId(n);
        setTakeawaySessionId(null);
      }
    }
  }, [searchParams]);

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
      nav("/menu", { replace: true });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Đăng nhập thất bại");
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
          <div className="badge" style={{ marginBottom: "1rem", background: "rgba(146,64,14,0.2)", border: "1px solid rgba(146,64,14,0.4)" }}>
            Quét mã QR — Đặt món tại bàn
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "2.5rem", margin: "0 0 0.5rem", color: "var(--text)" }}>
            TD Coffee
          </h1>
          <p style={{ color: "var(--text)", margin: 0, fontSize: "0.95rem" }}>
            Đăng nhập để tích điểm & lưu món quen
          </p>
        </div>

        <div className="glass-box">
          <form onSubmit={onLogin}>
            <div className="field">
              <label className="label" style={{ color: "var(--muted)" }} htmlFor="login">
                Số điện thoại hoặc Email
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
                Mật khẩu
              </label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {err && <p style={{ color: "#b91c1c", fontSize: "0.9rem", margin: "0 0 1rem" }}>{err}</p>}
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? "Đang đăng nhập…" : "Đăng nhập"}
            </button>
          </form>

          <p style={{ textAlign: "center", color: "var(--muted)", margin: "1.5rem 0 1rem", fontSize: "0.9rem" }}>
            Chưa có tài khoản?{" "}
            <Link to="/register" style={{ color: "var(--accent)", fontWeight: 600 }}>Đăng ký</Link>
          </p>

          <div style={{ position: "relative", textAlign: "center", margin: "1.5rem 0" }}>
            <div style={{ position: "absolute", top: "50%", left: 0, right: 0, borderTop: "1px dashed var(--border)" }} />
            <span style={{ background: "var(--surface2)", padding: "0 10px", position: "relative", fontSize: "0.8rem", color: "var(--muted)", textTransform: "uppercase" }}>Hoặc</span>
          </div>

          <button type="button" className="ghost-btn" onClick={onGuest}>
            Tiếp tục không đăng nhập
          </button>
        </div>

        <footer style={{ textAlign: "center", marginTop: "2rem" }}>
          <Link to="/staff/login" style={{ color: "var(--muted)", fontSize: "0.85rem", textDecoration: "none" }}>
            Dành cho Nhân sự
          </Link>
        </footer>
      </div>
    </div>
  );
}
