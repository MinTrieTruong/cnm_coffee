import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { apiOrigin } from "../lib/api";
import { getStaffInfo, staffApi } from "../lib/staffApi";

type KdsRow = {
  id: number;
  orderId: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  customNotes: string | null;
  kdsStatus: string;
  product: { id: number; name: string; imageUrl: string | null };
  order: { id: number; tableId: number | null; orderType: string; table: { name: string } | null };
};

export function Kds() {
  const info = getStaffInfo();
  const [rows, setRows] = useState<KdsRow[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await staffApi<KdsRow[]>("/api/kds/queue");
      setRows(data);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi tải KDS");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const socket: Socket = io(apiOrigin(), { transports: ["websocket", "polling"] });
    socket.emit("join", "kds");
    socket.on("order:new", () => {
      void load();
    });
    return () => {
      socket.disconnect();
    };
  }, [load]);

  async function setStatus(id: number, kdsStatus: string) {
    try {
      await staffApi(`/api/kds/details/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ kdsStatus }),
      });
      if (kdsStatus === "Ready") {
        setToast("Đã cập nhật món hoàn thành.");
        setTimeout(() => setToast(null), 3200);
      }
      void load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi cập nhật");
    }
  }

  const waiting = rows.filter((r) => r.kdsStatus === "Waiting");
  const doing = rows.filter((r) => r.kdsStatus === "Cooking");

  if (!info || (info.role !== "Kitchen" && info.role !== "Admin")) {
    return (
      <div className="app-shell" style={{ maxWidth: 700 }}>
        <h1 className="page-title">Khu bếp</h1>
        <p className="subtle">Bạn cần đăng nhập tài khoản bếp hoặc quản lý để vào màn hình này.</p>
        <Link to="/staff/login" className="btn btn-primary">
          Đăng nhập nhân sự
        </Link>
      </div>
    );
  }

  return (
    <div className="app-shell" style={{ maxWidth: 960 }}>
      <div className="nav-top">
        <h1 className="page-title" style={{ margin: 0 }}>
          KDS Bếp
        </h1>
        <Link to="/" className="btn btn-ghost" style={{ padding: "0.5rem 0.85rem", fontSize: "0.9rem" }}>
          Khách
        </Link>
      </div>
      <p className="subtle">Chạm thẻ: Chờ làm → Đang làm → Hoàn thành</p>
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "1.25rem",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--surface2)",
            border: "1px solid rgba(255,255,255,0.12)",
            padding: "0.85rem 1.2rem",
            borderRadius: 12,
            zIndex: 40,
            maxWidth: "90%",
            textAlign: "center",
          }}
        >
          {toast}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.75rem",
          alignItems: "start",
        }}
      >
        <section>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1rem", color: "var(--muted)" }}>
            Chờ làm
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            {waiting.map((r) => (
              <button
                key={r.id}
                type="button"
                className="card"
                onClick={() => void setStatus(r.id, "Cooking")}
                style={{
                  textAlign: "left",
                  padding: 0,
                  border: "2px solid rgba(255,255,255,0.08)",
                  cursor: "pointer",
                  background: "linear-gradient(145deg, var(--surface) 0%, #231a15 100%)",
                }}
              >
                <div style={{ display: "flex", gap: "0.65rem" }}>
                  <div
                    style={{
                      width: 72,
                      flexShrink: 0,
                      minHeight: 80,
                      background: "#1a120d",
                      backgroundImage: r.product.imageUrl ? `url(${r.product.imageUrl})` : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                  <div style={{ padding: "0.65rem 0.65rem 0.65rem 0" }}>
                    <div style={{ fontWeight: 700 }}>{r.product.name}</div>
                    <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                      {r.customNotes}
                    </div>
                    <div style={{ fontSize: "0.8rem", marginTop: "0.35rem", color: "var(--accent)" }}>
                      {r.order.table?.name ?? "Mang đi"} · x{r.quantity}
                    </div>
                  </div>
                </div>
              </button>
            ))}
            {waiting.length === 0 && <p className="subtle">Trống</p>}
          </div>
        </section>

        <section>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1rem", color: "#e4bc3c" }}>
            Đang làm
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            {doing.map((r) => (
              <button
                key={r.id}
                type="button"
                className="card"
                onClick={() => void setStatus(r.id, "Ready")}
                style={{
                  textAlign: "left",
                  padding: 0,
                  border: "2px solid #c9a227",
                  cursor: "pointer",
                  background: "linear-gradient(145deg, #3a3025 0%, #2a2118 100%)",
                }}
              >
                <div style={{ display: "flex", gap: "0.65rem" }}>
                  <div
                    style={{
                      width: 72,
                      flexShrink: 0,
                      minHeight: 80,
                      background: "#1a120d",
                      backgroundImage: r.product.imageUrl ? `url(${r.product.imageUrl})` : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                  <div style={{ padding: "0.65rem 0.65rem 0.65rem 0" }}>
                    <div style={{ fontWeight: 700 }}>{r.product.name}</div>
                    <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                      {r.customNotes}
                    </div>
                    <div style={{ fontSize: "0.8rem", marginTop: "0.35rem" }}>Chạm khi xong →</div>
                  </div>
                </div>
              </button>
            ))}
            {doing.length === 0 && <p className="subtle">Trống</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
