import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const STAFF_TOKEN = "cmn_staff_token";
const STAFF_INFO = "cmn_staff_info";

export function StaffLogin() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const base = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
      const res = await fetch(`${base}/api/staff/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as { token?: string; staff?: { role: string }; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Đăng nhập thất bại");
      if (data.token && data.staff) {
        localStorage.setItem(STAFF_TOKEN, data.token);
        localStorage.setItem(STAFF_INFO, JSON.stringify(data.staff));
        if (data.staff.role === "Kitchen") nav("/kds", { replace: true });
        else if (data.staff.role === "Admin") nav("/admin", { replace: true });
        else if (data.staff.role === "Cashier") nav("/pos", { replace: true });
        else if (data.staff.role === "Waiter") nav("/staff/tables", { replace: true });
        else nav("/menu", { replace: true });
      }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Lỗi");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="nav-top">
        <Link to="/" className="btn btn-ghost" style={{ padding: "0.5rem 0.85rem", fontSize: "0.9rem" }}>
          ← Khách
        </Link>
      </div>
      <h1 className="page-title">Đăng nhập nhân sự</h1>
      <p className="subtle">Đăng nhập bằng tài khoản nhân sự để vào đúng khu vực làm việc.</p>
      <div className="card" style={{ padding: "1.35rem" }}>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label className="label" htmlFor="u">
              Username
            </label>
            <input id="u" className="input" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="field">
            <label className="label" htmlFor="p">
              Mật khẩu
            </label>
            <input id="p" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "…" : "Đăng nhập"}
          </button>
        </form>
      </div>
    </div>
  );
}
