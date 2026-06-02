import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { setSession, type SessionUser } from "../lib/session";
import { ArrowLeft } from "lucide-react";

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
    <div className="auth-page">
      <div className="auth-content">
        <div style={{ marginBottom: "2rem", textAlign: "center", position: "relative" }}>
          <Link to="/" style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", textDecoration: "none" }}>
            <ArrowLeft size={24} />
          </Link>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "2rem", margin: "0 0 0.5rem", color: "#fff", textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>Đăng ký Thành viên</h1>
          <p style={{ color: "rgba(255,255,255,0.7)", margin: 0, fontSize: "0.9rem" }}>Tích điểm và nhận nhiều ưu đãi</p>
        </div>

        <div className="glass-box">
          <form onSubmit={onSubmit}>
            <div className="field">
              <label className="label" style={{ color: "rgba(255,255,255,0.6)" }} htmlFor="phone">Số điện thoại *</label>
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
              <label className="label" style={{ color: "rgba(255,255,255,0.6)" }} htmlFor="fn">Họ tên</label>
              <input
                id="fn"
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nguyễn Văn A"
              />
            </div>
            <div className="field">
              <label className="label" style={{ color: "rgba(255,255,255,0.6)" }} htmlFor="em">Email (tuỳ chọn)</label>
              <input
                id="em"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field" style={{ marginBottom: "1.5rem" }}>
              <label className="label" style={{ color: "rgba(255,255,255,0.6)" }} htmlFor="pw">Mật khẩu (≥ 6 ký tự)</label>
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
            {err && <p style={{ color: "#ef4444", fontSize: "0.9rem", margin: "0 0 1rem" }}>{err}</p>}
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? "Đang tạo…" : "Tạo tài khoản"}
            </button>
          </form>
          <p style={{ textAlign: "center", color: "rgba(255,255,255,0.6)", margin: "1.5rem 0 0", fontSize: "0.9rem" }}>
            Đã có tài khoản? <Link to="/" style={{ color: "var(--accent)", fontWeight: 600 }}>Đăng nhập</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
