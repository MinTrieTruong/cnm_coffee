import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { setSession, type SessionUser } from "../lib/session";

export function Register() {
  const nav = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const data = await api<{ token: string; user: SessionUser }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ phone, password, fullName, email: email || undefined }),
      });
      setSession(data.token, data.user);
      nav("/menu", { replace: true });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Đăng ký thất bại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="nav-top">
        <Link to="/" className="btn btn-ghost" style={{ padding: "0.5rem 0.85rem", fontSize: "0.9rem" }}>
          ← Quay lại
        </Link>
      </div>
      <h1 className="page-title">Đăng ký</h1>
      <p className="subtle">Số điện thoại dùng đăng nhập (theo đặc tả đề tài).</p>

      <div className="card" style={{ padding: "1.35rem" }}>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label className="label" htmlFor="phone">
              Số điện thoại *
            </label>
            <input
              id="phone"
              className="input"
              inputMode="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09xx xxx xxx"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="fn">
              Họ tên
            </label>
            <input
              id="fn"
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nguyễn Văn A"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="em">
              Email (tuỳ chọn)
            </label>
            <input
              id="em"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="pw">
              Mật khẩu (≥ 6 ký tự)
            </label>
            <input
              id="pw"
              className="input"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {err && (
            <p style={{ color: "var(--danger)", fontSize: "0.9rem", marginTop: 0 }}>{err}</p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "Đang tạo…" : "Tạo tài khoản"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: "1rem", color: "var(--muted)" }}>
          Đã có tài khoản? <Link to="/">Đăng nhập</Link>
        </p>
      </div>
    </div>
  );
}
