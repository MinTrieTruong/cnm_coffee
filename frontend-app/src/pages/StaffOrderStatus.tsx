import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { apiOrigin, mediaUrl } from "../lib/api";
import { getStaffInfo, staffApi } from "../lib/staffApi";

/* ─── Âm thanh ─── */
function playReadySound() {
  try {
    const ctx = new AudioContext();
    const note = (freq: number, t: number, dur: number, vol = 0.45) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t);
      osc.stop(t + dur);
    };
    const t = ctx.currentTime;
    note(783.99, t,        0.18);
    note(1046.5, t + 0.2,  0.22);
    note(1318.5, t + 0.42, 0.35);
    setTimeout(() => ctx.close(), 2500);
  } catch { /* browser blocked */ }
}

/* ─── Types ─── */
type LiveItem = {
  id: number;
  orderId: number;
  quantity: number;
  unitPrice: number;
  customNotes: string | null;
  kdsStatus: "Waiting" | "Cooking" | "Ready";
  priority: boolean;
  product: { id: number; name: string; imageUrl: string | null };
  order: {
    id: number;
    tableId: number | null;
    orderType: string;
    table: { id: number; name: string } | null;
  };
};

type ReadyPopup = {
  id: string;
  productName: string;
  quantity: number;
  tableName: string;
  orderId: number;
  detailId: number;
};

/* ─── Config cột ─── */
const COL_META = {
  Waiting: {
    label: "Chờ làm",
    color: "#f59e0b",
    dimColor: "rgba(245,158,11,0.18)",
    border: "rgba(245,158,11,0.3)",
    headerBg: "rgba(245,158,11,0.08)",
  },
  Cooking: {
    label: "Đang làm",
    color: "#f97316",
    dimColor: "rgba(249,115,22,0.18)",
    border: "rgba(249,115,22,0.35)",
    headerBg: "rgba(249,115,22,0.08)",
  },
  Ready: {
    label: "Sẵn sàng — bê ra",
    color: "#4ade80",
    dimColor: "rgba(74,222,128,0.18)",
    border: "rgba(74,222,128,0.4)",
    headerBg: "rgba(74,222,128,0.08)",
  },
} as const;

/* ─── Item Card ─── */
function ItemCard({
  item,
  onServed,
  serving,
}: {
  item: LiveItem;
  onServed?: (id: number) => void;
  serving?: boolean;
}) {
  const meta = COL_META[item.kdsStatus];
  const tableName = item.order.table?.name ?? "Mang về";
  const img = mediaUrl(item.product.imageUrl);
  const isReady = item.kdsStatus === "Ready";

  return (
    <div
      style={{
        background: "var(--surface)",
        border: `1.5px solid ${meta.border}`,
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: isReady ? `0 4px 20px ${meta.dimColor}` : "none",
        transition: "opacity 0.2s",
        opacity: serving ? 0.45 : 1,
      }}
    >
      {/* Ảnh thumbnail nếu có */}
      {img && (
        <div style={{ height: 72, flexShrink: 0, overflow: "hidden" }}>
          <img
            src={img}
            alt={item.product.name}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
      )}

      {/* Nội dung */}
      <div style={{ padding: "0.7rem 0.85rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {/* Mang về badge */}
        {item.priority && (
          <span style={{
            display: "inline-block", alignSelf: "flex-start",
            background: "rgba(201,162,39,0.18)",
            border: "1px solid rgba(201,162,39,0.45)",
            color: "#e8b84a",
            fontSize: "0.68rem", fontWeight: 700,
            letterSpacing: "0.06em",
            padding: "0.15rem 0.5rem", borderRadius: 5,
          }}>
            MANG VỀ
          </span>
        )}

        {/* Tên món + số lượng */}
        <div style={{ fontWeight: 700, fontSize: "0.93rem", color: "#fff", lineHeight: 1.35 }}>
          {item.product.name}
          <span style={{ color: meta.color, marginLeft: "0.45rem", fontWeight: 800 }}>
            x{item.quantity}
          </span>
        </div>

        {/* Ghi chú */}
        {item.customNotes && (
          <div style={{ fontSize: "0.76rem", color: "rgba(255,255,255,0.45)", fontStyle: "italic" }}>
            {item.customNotes}
          </div>
        )}

        {/* Tags bàn + bill */}
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.1rem" }}>
          <span style={{
            background: meta.dimColor,
            border: `1px solid ${meta.border}`,
            borderRadius: 6, padding: "0.18rem 0.55rem",
            fontSize: "0.75rem", fontWeight: 700, color: meta.color,
          }}>
            {tableName}
          </span>
          <span style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6, padding: "0.18rem 0.55rem",
            fontSize: "0.75rem", color: "rgba(255,255,255,0.45)",
          }}>
            Bill #{item.orderId}
          </span>
        </div>

        {/* Nút xác nhận đã bê — chỉ hiện ở cột Ready */}
        {isReady && onServed && (
          <button
            type="button"
            id={`btn-served-${item.id}`}
            disabled={serving}
            onClick={() => onServed(item.id)}
            style={{
              marginTop: "0.45rem",
              background: serving ? "rgba(74,222,128,0.1)" : "rgba(74,222,128,0.18)",
              border: "1.5px solid rgba(74,222,128,0.5)",
              borderRadius: 8,
              color: "#4ade80",
              fontWeight: 700,
              fontSize: "0.82rem",
              padding: "0.45rem 0.8rem",
              cursor: serving ? "not-allowed" : "pointer",
              textAlign: "center",
              letterSpacing: "0.03em",
              transition: "background 0.15s",
            }}
          >
            {serving ? "Đang xác nhận..." : "Da be ra cho khach"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Cột trạng thái ─── */
function StatusColumn({
  status,
  items,
  onServed,
  servingIds,
}: {
  status: "Waiting" | "Cooking" | "Ready";
  items: LiveItem[];
  onServed?: (id: number) => void;
  servingIds?: Set<number>;
}) {
  const meta = COL_META[status];
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: "0.6rem",
        padding: "0.5rem 0.75rem",
        background: meta.headerBg,
        border: `1px solid ${meta.border}`,
        borderRadius: 10,
        marginBottom: "0.1rem",
      }}>
        <span style={{ fontWeight: 800, fontSize: "0.88rem", color: meta.color, letterSpacing: "0.04em" }}>
          {meta.label}
        </span>
        <span style={{
          marginLeft: "auto",
          background: meta.color,
          color: "#0a0a0a",
          fontWeight: 800, fontSize: "0.78rem",
          minWidth: 22, height: 22,
          borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {items.length}
        </span>
      </div>

      {/* Cards */}
      {items.length === 0 ? (
        <div style={{
          textAlign: "center",
          color: "rgba(255,255,255,0.2)",
          fontSize: "0.82rem",
          padding: "1.75rem 1rem",
          border: "1px dashed rgba(255,255,255,0.08)",
          borderRadius: 10,
        }}>
          Trống
        </div>
      ) : (
        items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            onServed={onServed}
            serving={servingIds?.has(item.id)}
          />
        ))
      )}
    </section>
  );
}

/* ─── Trang chính ─── */
export function StaffOrderStatus() {
  const info = getStaffInfo();
  const [items, setItems] = useState<LiveItem[]>([]);
  const [popups, setPopups] = useState<ReadyPopup[]>([]);
  const [servingIds, setServingIds] = useState<Set<number>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const audioUnlocked = useRef(false);
  const prevReadyIds = useRef<Set<number>>(new Set());

  /* Load */
  const load = useCallback(async () => {
    try {
      const data = await staffApi<LiveItem[]>("/api/staff/order-items/live");
      setItems(data);
      setErr(null);
      setLastUpdated(new Date());

      // Phát hiện món mới chuyển Ready
      const readyNow = data.filter((d) => d.kdsStatus === "Ready");
      const newlyReady = readyNow.filter((d) => !prevReadyIds.current.has(d.id));
      if (newlyReady.length > 0) {
        playReadySound();
        setPopups((prev) => [
          ...prev,
          ...newlyReady
            .filter((d) => !prev.some((p) => p.detailId === d.id))
            .map((d) => ({
              id: `${d.id}-${Date.now()}`,
              productName: d.product.name,
              quantity: d.quantity,
              tableName: d.order.table?.name ?? "Mang ve",
              orderId: d.orderId,
              detailId: d.id,
            })),
        ]);
        newlyReady.forEach((d) => {
          setTimeout(() => {
            setPopups((prev) => prev.filter((p) => p.detailId !== d.id));
          }, 14000);
        });
      }
      prevReadyIds.current = new Set(readyNow.map((d) => d.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Loi tai du lieu");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /* Unlock audio */
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

  /* Socket */
  useEffect(() => {
    const socket: Socket = io(apiOrigin(), { transports: ["websocket", "polling"] });
    socket.emit("join", "staff");
    socket.emit("join", "kds");

    socket.on("kds:update", () => { void load(); });
    socket.on("kds:served", () => { void load(); });
    socket.on("order:new", () => { void load(); });

    socket.on("kds:ready", (data: { detailId: number; productName: string; quantity: number; tableName: string; orderId: number }) => {
      void load();
      setPopups((prev) => {
        if (prev.some((p) => p.detailId === data.detailId)) return prev;
        playReadySound();
        const popup: ReadyPopup = {
          id: `kds-${data.detailId}-${Date.now()}`,
          productName: data.productName,
          quantity: data.quantity,
          tableName: data.tableName,
          orderId: data.orderId,
          detailId: data.detailId,
        };
        setTimeout(() => {
          setPopups((p) => p.filter((x) => x.id !== popup.id));
        }, 14000);
        return [...prev, popup];
      });
    });

    return () => { socket.disconnect(); };
  }, [load]);

  /* Auto-refresh 30s */
  useEffect(() => {
    const t = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  /* Xác nhận đã bê */
  async function handleServed(detailId: number) {
    setServingIds((prev) => new Set(prev).add(detailId));
    try {
      await staffApi(`/api/staff/order-items/${detailId}/served`, { method: "POST" });
      // Xóa khỏi local state ngay lập tức (không chờ reload)
      setItems((prev) => prev.filter((i) => i.id !== detailId));
      setPopups((prev) => prev.filter((p) => p.detailId !== detailId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Loi xac nhan");
    } finally {
      setServingIds((prev) => { const s = new Set(prev); s.delete(detailId); return s; });
    }
  }

  /* Auth guard */
  if (!info || !["Waiter", "Admin"].includes(info.role)) {
    return (
      <div className="staff-page-inner">
        <h1 className="page-title">Trang thai mon</h1>
        <p className="subtle">Ban can dang nhap nhan su de xem trang nay.</p>
        <Link to="/staff/login" className="btn btn-primary">Dang nhap</Link>
      </div>
    );
  }

  const waiting = items.filter((i) => i.kdsStatus === "Waiting");
  const cooking = items.filter((i) => i.kdsStatus === "Cooking");
  const ready   = items.filter((i) => i.kdsStatus === "Ready");

  return (
    <div className="staff-page-inner staff-page-wide">

      {/* ── Popup nổi góc phải ── */}
      {popups.length > 0 && (
        <div style={{
          position: "fixed", top: "1rem", right: "1rem",
          zIndex: 9999,
          display: "flex", flexDirection: "column", gap: "0.6rem",
          maxWidth: 330, pointerEvents: "auto",
        }}>
          {popups.map((p) => (
            <div
              key={p.id}
              style={{
                background: "#051a0d",
                border: "2px solid #4ade80",
                borderRadius: 14,
                padding: "0.85rem 1rem",
                boxShadow: "0 8px 36px rgba(74,222,128,0.35)",
                animation: "sos-slide-in 0.32s cubic-bezier(.22,1,.36,1)",
                display: "flex", flexDirection: "column", gap: "0.4rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 900, fontSize: "0.78rem", color: "#4ade80", letterSpacing: "0.07em" }}>
                  MON SAN SANG — BE RA NGAY
                </span>
                <button
                  type="button"
                  onClick={() => setPopups((prev) => prev.filter((x) => x.id !== p.id))}
                  style={{
                    background: "rgba(74,222,128,0.12)", border: "none",
                    color: "#4ade80", cursor: "pointer",
                    fontSize: "0.95rem", lineHeight: 1,
                    padding: "0.2rem 0.4rem", borderRadius: 5,
                  }}
                  aria-label="Dong"
                >x</button>
              </div>

              <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#fff" }}>
                {p.productName}
                <span style={{ color: "#86efac", fontWeight: 700, marginLeft: "0.4rem" }}>x {p.quantity}</span>
              </div>

              <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                <span style={{
                  background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.35)",
                  borderRadius: 6, padding: "0.18rem 0.5rem",
                  fontSize: "0.78rem", fontWeight: 700, color: "#4ade80",
                }}>{p.tableName}</span>
                <span style={{
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 6, padding: "0.18rem 0.5rem",
                  fontSize: "0.78rem", color: "rgba(255,255,255,0.5)",
                }}>Bill #{p.orderId}</span>
              </div>

              {/* Nút xác nhận ngay từ popup */}
              <button
                type="button"
                id={`popup-served-${p.detailId}`}
                onClick={() => { void handleServed(p.detailId); }}
                style={{
                  marginTop: "0.3rem",
                  background: "rgba(74,222,128,0.15)",
                  border: "1.5px solid rgba(74,222,128,0.5)",
                  borderRadius: 8, color: "#4ade80",
                  fontWeight: 700, fontSize: "0.82rem",
                  padding: "0.4rem 0.75rem",
                  cursor: "pointer", textAlign: "center",
                  letterSpacing: "0.02em",
                }}
              >
                Da be ra cho khach
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Header ── */}
      <div className="staff-page-head">
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Trang thai mon</h1>
          {lastUpdated && (
            <span style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.32)", display: "block", marginTop: "0.1rem" }}>
              Cap nhat luc {lastUpdated.toLocaleTimeString("vi-VN")}
            </span>
          )}
        </div>
        <button
          type="button"
          id="refresh-order-status"
          className="btn btn-ghost staff-btn-light"
          onClick={() => void load()}
        >
          Lam moi
        </button>
      </div>

      <p className="subtle" style={{ marginBottom: "0.85rem" }}>
        Cot <strong style={{ color: "#4ade80" }}>San sang</strong> — bam "Da be ra cho khach" de xoa mon khoi danh sach.
      </p>

      {err && <p style={{ color: "var(--danger)", marginBottom: "0.75rem" }}>{err}</p>}

      {/* Tong quan nhanh */}
      <div style={{ display: "flex", gap: "0.6rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        {(["Waiting", "Cooking", "Ready"] as const).map((s) => {
          const meta = COL_META[s];
          const count = s === "Waiting" ? waiting.length : s === "Cooking" ? cooking.length : ready.length;
          return (
            <div key={s} style={{
              background: meta.headerBg,
              border: `1px solid ${meta.border}`,
              borderRadius: 10, padding: "0.55rem 0.9rem",
              display: "flex", alignItems: "center", gap: "0.55rem",
              flex: "1 1 110px",
            }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: "1.3rem", color: meta.color, lineHeight: 1 }}>{count}</div>
                <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.38)", marginTop: "0.12rem" }}>{meta.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Board 3 cot */}
      <div
        className="order-status-board"
        style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.85rem", alignItems: "start" }}
      >
        <StatusColumn status="Waiting" items={waiting} />
        <StatusColumn status="Cooking" items={cooking} />
        <StatusColumn status="Ready"   items={ready}   onServed={(id) => void handleServed(id)} servingIds={servingIds} />
      </div>

      <style>{`
        @keyframes sos-slide-in {
          from { opacity: 0; transform: translateX(55px) scale(0.95); }
          to   { opacity: 1; transform: translateX(0)    scale(1);    }
        }
        @media (max-width: 680px) {
          .order-status-board { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 681px) and (max-width: 960px) {
          .order-status-board { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </div>
  );
}
