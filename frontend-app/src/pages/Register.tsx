import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { safeNext, setSession, type SessionUser } from "../lib/session";
import { Crumbs } from "../components/site/parts";
import { PasswordInput } from "../components/PasswordInput";

export function Register() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
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
      nav(next, { replace: true });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Đăng ký thất bại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-content">
        <Crumbs items={[{ to: "/login", label: "Đăng nhập" }, { label: "Đăng ký" }]} />
        <div style={{ marginBottom: "1.5rem", textAlign: "center" }}>
          <h1 className="c-auth-title">Đăng ký thành viên</h1>
          <p style={{ color: "var(--text)", margin: 0, fontSize: "0.9rem" }}>Tích điểm mỗi đơn và nhận voucher riêng</p>
        </div>

        <div className="glass-box">
          <form onSubmit={onSubmit}>
            <div className="field">
              <label className="label" style={{ color: "var(--muted)" }} htmlFor="phone">Số điện thoại *</label>
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
              <label className="label" style={{ color: "var(--muted)" }} htmlFor="fn">Họ tên</label>
              <input
                id="fn"
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nguyễn Văn A"
              />
            </div>
            <div className="field">
              <label className="label" style={{ color: "var(--muted)" }} htmlFor="em">Email (tuỳ chọn)</label>
              <input
                id="em"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field" style={{ marginBottom: "1.5rem" }}>
              <label className="label" style={{ color: "var(--muted)" }} htmlFor="pw">Mật khẩu (≥ 6 ký tự)</label>
              <PasswordInput
                id="pw"
                className="input"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {err && <p style={{ color: "#b91c1c", fontSize: "0.9rem", margin: "0 0 1rem" }}>{err}</p>}
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? "Đang tạo…" : "Tạo tài khoản"}
            </button>
          </form>
          <p style={{ textAlign: "center", color: "var(--muted)", margin: "1.5rem 0 0", fontSize: "0.9rem" }}>
            Đã có tài khoản? <Link to="/" style={{ color: "var(--accent)", fontWeight: 600 }}>Đăng nhập</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
