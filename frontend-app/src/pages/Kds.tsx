import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { apiOrigin, mediaUrl } from "../lib/api";
import { getStaffInfo, staffApi } from "../lib/staffApi";

/** Phát âm thanh ting ting bằng Web Audio API (không cần file âm thanh). */
function playNewOrderSound() {
  try {
    const ctx = new AudioContext();
    const playTing = (time: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(1047, time);   // C6
      osc.frequency.exponentialRampToValueAtTime(880, time + 0.12); // A5
      gain.gain.setValueAtTime(0.55, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.55);
      osc.start(time);
      osc.stop(time + 0.6);
    };
    const now = ctx.currentTime;
    playTing(now);
    playTing(now + 0.28);
    setTimeout(() => ctx.close(), 2000);
  } catch {
    /* nếu trình duyệt block AudioContext thì bỏ qua */
  }
}

type KdsRow = {
  id: number;
  orderId: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  customNotes: string | null;
  kdsStatus: string;
  priority: boolean;
  product: { id: number; name: string; imageUrl: string | null };
  order: { id: number; tableId: number | null; orderType: string; table: { name: string } | null };
};

export function Kds() {
  const info = getStaffInfo();
  const [rows, setRows] = useState<KdsRow[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [newOrderFlash, setNewOrderFlash] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const audioUnlocked = useRef(false);

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
      playNewOrderSound();
      setNewOrderFlash(true);
      setTimeout(() => setNewOrderFlash(false), 3000);
      void load();
    });
    return () => {
      socket.disconnect();
    };
  }, [load]);

  // Unlock AudioContext sau tương tác đầu tiên
  useEffect(() => {
    const unlock = () => {
      if (!audioUnlocked.current) {
        audioUnlocked.current = true;
        try { const c = new AudioContext(); void c.resume().then(() => c.close()); } catch { /* */ }
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

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

  const waiting = rows
    .filter((r) => r.kdsStatus === "Waiting")
    .sort((a, b) => Number(b.priority) - Number(a.priority));
  const doing = rows
    .filter((r) => r.kdsStatus === "Cooking")
    .sort((a, b) => Number(b.priority) - Number(a.priority));

  if (!info || (info.role !== "Kitchen" && info.role !== "Admin")) {
    return (
      <div className="staff-page-inner">
        <h1 className="page-title">Pha chế</h1>
        <p className="subtle">Bạn cần đăng nhập tài khoản pha chế hoặc quản lý để vào màn hình này.</p>
        <Link to="/staff/login" className="btn btn-primary">
          Đăng nhập nhân sự
        </Link>
      </div>
    );
  }

  return (
    <div className="staff-page-inner staff-page-wide">
      <div className="staff-page-head">
        <h1 className="page-title" style={{ margin: 0 }}>
          Pha chế
        </h1>
        <Link to="/staff/inventory" className="btn btn-ghost staff-btn-light">
          Kiểm kho
        </Link>
      </div>
      <p className="subtle">Chạm thẻ: Chờ làm → Đang làm → Hoàn thành</p>
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

      {/* Flash banner khi có đơn mới */}
      {newOrderFlash && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            background: "var(--accent)",
            color: "#fff",
            fontWeight: 800,
            fontSize: "1.15rem",
            textAlign: "center",
            padding: "0.85rem 1rem",
            letterSpacing: "0.04em",
            animation: "kds-flash 0.5s ease-in-out 3",
            boxShadow: "0 4px 24px rgba(146,64,14,0.45)",
          }}
        >
          ĐƠN MỚI — CẦN PHA CHẾ!
        </div>
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "1.25rem",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--surface2)",
            border: "1px solid var(--border)",
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
                  border: "2px solid var(--border)",
                  cursor: "pointer",
                  background: "var(--surface)",
                }}
              >
                <div style={{ display: "flex", gap: "0.65rem" }}>
                  <div
                    style={{
                      width: 72,
                      flexShrink: 0,
                      minHeight: 80,
                      background: "var(--surface)",
                      backgroundImage: mediaUrl(r.product.imageUrl) ? `url(${mediaUrl(r.product.imageUrl)})` : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                  <div style={{ padding: "0.65rem 0.65rem 0.65rem 0" }}>
                    {(r.priority || r.order.orderType === "Takeaway" || r.order.orderType === "Delivery") && (
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: "0.68rem",
                          fontWeight: 800,
                          letterSpacing: "0.06em",
                          color: "#fff",
                          background: "var(--accent)",
                          padding: "0.2rem 0.45rem",
                          borderRadius: 6,
                          marginBottom: "0.35rem",
                        }}
                      >
                        {r.order.orderType === "Delivery" ? `GIAO HÀNG #${r.order.id}` : "MANG VỀ"}
                      </span>
                    )}
                    <div style={{ fontWeight: 700 }}>{r.product.name}</div>
                    <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                      {r.customNotes}
                    </div>
                    <div style={{ fontSize: "0.8rem", marginTop: "0.35rem", color: "var(--accent)" }}>
                      {r.order.table?.name ?? (r.order.orderType === "Delivery" ? "Giao hàng" : "Mang đi")} · x{r.quantity}
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
                  border: "1px solid var(--o-warning)",
                  cursor: "pointer",
                  background: "var(--o-warning-bg)",
                }}
              >
                <div style={{ display: "flex", gap: "0.65rem" }}>
                  <div
                    style={{
                      width: 72,
                      flexShrink: 0,
                      minHeight: 80,
                      background: "var(--surface)",
                      backgroundImage: mediaUrl(r.product.imageUrl) ? `url(${mediaUrl(r.product.imageUrl)})` : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                  <div style={{ padding: "0.65rem 0.65rem 0.65rem 0" }}>
                    {(r.priority || r.order.orderType === "Takeaway" || r.order.orderType === "Delivery") && (
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: "0.68rem",
                          fontWeight: 800,
                          letterSpacing: "0.06em",
                          color: "#fff",
                          background: "var(--accent)",
                          padding: "0.2rem 0.45rem",
                          borderRadius: 6,
                          marginBottom: "0.35rem",
                        }}
                      >
                        {r.order.orderType === "Delivery" ? `GIAO HÀNG #${r.order.id}` : "MANG VỀ"}
                      </span>
                    )}
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
