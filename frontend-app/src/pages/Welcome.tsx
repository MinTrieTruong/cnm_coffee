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
  const [demoTable, setDemoTable] = useState("");

  useEffect(() => {
    const t = searchParams.get("table");
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

  function setDemoTableAndGoMenu() {
    const n = Number(demoTable);
    if (!n || Number.isNaN(n) || n <= 0) {
      setErr("Nhập số bàn hợp lệ để demo.");
      return;
    }
    setTableId(n);
    setTakeawaySessionId(null);
    setErr(null);
    nav("/menu", { replace: true });
  }

  return (
    <div className="app-shell">
      <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
        <div className="badge" style={{ marginBottom: "0.75rem" }}>
          Quét mã QR — Đặt món tại bàn
        </div>
        <h1 className="page-title" style={{ fontSize: "2rem" }}>
          CMN Coffee
        </h1>
        <p className="subtle" style={{ marginBottom: 0 }}>
          Đăng nhập (SĐT hoặc email) để tích điểm & món quen. Hoặc tiếp tục không đăng nhập.
        </p>
      </div>

      <div className="card" style={{ padding: "1.35rem" }}>
        <form onSubmit={onLogin}>
          <div className="field">
            <label className="label" htmlFor="login">
              Số điện thoại hoặc Email
            </label>
            <input
              id="login"
              className="input"
              type="text"
              autoComplete="username"
              placeholder="0900000000 hoặc email"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="password">
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
          {err && (
            <p style={{ color: "var(--danger)", fontSize: "0.9rem", marginTop: 0 }}>{err}</p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "Đang đăng nhập…" : "Đăng nhập"}
          </button>
        </form>

        <p style={{ textAlign: "center", margin: "1rem 0 0", color: "var(--muted)", fontSize: "0.95rem" }}>
          Chưa có tài khoản?{" "}
          <Link to="/register">Đăng ký</Link>
        </p>
      </div>

      <div style={{ marginTop: "1.25rem" }}>
        <div className="card" style={{ padding: "0.9rem", marginBottom: "0.7rem" }}>
          <div className="field" style={{ marginBottom: "0.55rem" }}>
            <label className="label" htmlFor="demo-table">
              Demo nhanh chưa có QR: nhập số bàn
            </label>
            <input
              id="demo-table"
              className="input"
              placeholder="Ví dụ: 12"
              value={demoTable}
              onChange={(e) => setDemoTable(e.target.value)}
            />
          </div>
          <button type="button" className="btn btn-primary btn-block" onClick={setDemoTableAndGoMenu}>
            Vào menu theo bàn này
          </button>
        </div>
        <button type="button" className="btn btn-ghost btn-block" onClick={onGuest}>
          Tiếp tục không đăng nhập
        </button>
        <p className="subtle" style={{ textAlign: "center", marginTop: "0.65rem", fontSize: "0.82rem" }}>
          Nếu truy cập bằng QR của từng bàn, hệ thống sẽ tự nhận biết số bàn từ mã QR.
        </p>
      </div>

      <footer style={{ marginTop: "2.5rem", textAlign: "center", fontSize: "0.8rem", color: "var(--muted)" }}>
        <Link to="/staff/login">Nhân sự</Link>
      </footer>
    </div>
  );
}
