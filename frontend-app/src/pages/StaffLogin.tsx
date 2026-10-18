import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { apiBase } from "../lib/api";
import { mapFetchError } from "../lib/net";
import { getStaffInfo, getStaffToken } from "../lib/staffApi";
import { Lock } from "lucide-react";

function defaultRouteForRole(role: string): string {
  if (role === "Admin") return "/admin";
  if (role === "Kitchen") return "/kds";
  if (role === "Cashier") return "/pos";
  if (role === "Waiter") return "/staff/tables";
  if (role === "Shipper") return "/staff/shipper";
  // Role không hợp lệ → giữ ở trang nhân sự, không nhảy ra menu khách
  console.warn("[StaffLogin] Unknown role:", role);
  return "/staff/tables";
}

const STAFF_TOKEN = "cmn_staff_token";
const STAFF_INFO = "cmn_staff_info";

export function StaffLogin() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const existingToken = getStaffToken();
  const existingInfo = getStaffInfo();
  if (existingToken && existingInfo) {
    return <Navigate to={defaultRouteForRole(existingInfo.role)} replace />;
  }

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      setErr("Nhập tên đăng nhập và mật khẩu.");
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      const base = apiBase();
      let res: Response;
      try {
        res = await fetch(`${base}/api/staff/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: cleanUsername, password }),
        });
      } catch (e) {
        throw mapFetchError(e);
      }
      const data = (await res.json()) as {
        token?: string;
        staff?: { role: string };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Đăng nhập thất bại");
      if (data.token && data.staff) {
        localStorage.setItem(STAFF_TOKEN, data.token);
        localStorage.setItem(STAFF_INFO, JSON.stringify(data.staff));
        nav(defaultRouteForRole(data.staff.role), { replace: true });
      }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Lỗi");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page staff-bg">
      <div className="auth-content">
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 64, height: 64, borderRadius: "50%", background: "rgba(146,64,14,0.15)", border: "1px solid rgba(146,64,14,0.4)", marginBottom: "1rem" }}>
            <Lock size={32} color="var(--accent)" />
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "2rem", margin: "0 0 0.5rem", color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Hệ thống Nội bộ</h1>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: "0.95rem" }}>Đăng nhập bằng tài khoản được cấp</p>
        </div>

        <div className="glass-box" style={{ background: "var(--surface)" }}>
          <form onSubmit={(e) => void onLogin(e)}>
            <div className="field">
              <label className="label" style={{ color: "var(--muted)" }} htmlFor="u">Tên đăng nhập</label>
              <input
                id="u"
                type="text"
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                placeholder="VD: TN_tram"
                style={{ fontSize: "1.05rem", fontWeight: 500 }}
              />
            </div>
            <div className="field" style={{ marginBottom: "2rem" }}>
              <label className="label" style={{ color: "var(--muted)" }} htmlFor="p">Mật khẩu</label>
              <input
                id="p"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{ fontSize: "1.05rem", fontWeight: 500, letterSpacing: "0.1em" }}
              />
            </div>
            {err && <p style={{ color: "#b91c1c", fontSize: "0.9rem", margin: "0 0 1rem", textAlign: "center" }}>{err}</p>}
            <button type="submit" className="auth-btn" style={{ borderRadius: 6, textTransform: "uppercase", letterSpacing: "0.05em" }} disabled={loading}>
              {loading ? "Đang xác thực…" : "Đăng nhập"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
