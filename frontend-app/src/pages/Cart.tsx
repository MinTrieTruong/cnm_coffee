import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { backupCart, cartTotal, clearCart, getCart, removeLine, type CartItem } from "../lib/cart";
import { getTableId, getTakeawaySessionId, getUser, setTableId, setTakeawaySessionId } from "../lib/session";

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

export function Cart() {
  const loc = useLocation();
  const [items, setItems] = useState(() => getCart());
  const nav = useNavigate();
  const user = getUser();
  const [payOpen, setPayOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [manualTable, setManualTable] = useState("");

  useEffect(() => {
    setItems(getCart());
  }, [loc.key, loc.pathname]);

  const total = cartTotal(items);
  const currentTable = getTableId();

  function refresh() {
    setItems(getCart());
  }

  async function submitOrder(mode: "now" | "later") {
    setSubmitting(true);
    setMsg(null);
    try {
      backupCart();
      const takeawaySessionId = getTakeawaySessionId();
      const tableId = getTableId();
      const isTakeaway = Boolean(takeawaySessionId);
      if (!isTakeaway && !tableId) {
        setMsg("Không xác định được bàn. Vui lòng quét lại QR tại bàn rồi thử lại.");
        setSubmitting(false);
        return;
      }
      const created = await api<{ id: number; status: string }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          tableId: isTakeaway ? null : tableId,
          customerId: user?.customerId ?? null,
          orderType: isTakeaway ? "Takeaway" : "Dine-in",
          sessionId: isTakeaway ? takeawaySessionId : null,
          payMode: mode,
          lines: items.map((i: CartItem) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            customNotes: i.notes,
          })),
        }),
      });
      clearCart();
      setPayOpen(false);
      refresh();
      if (mode === "later") {
        nav(`/order/${created.id}/grace`, { replace: true });
      } else {
        setMsg("Đã gửi đơn — thanh toán tại quầy. Đang chuyển tới ân hạn 60s…");
        setTimeout(() => nav(`/order/${created.id}/grace`, { replace: true }), 600);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Không gửi được đơn");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="nav-top">
        <Link to="/menu" className="btn btn-ghost" style={{ padding: "0.5rem 0.85rem", fontSize: "0.9rem" }}>
          ← Menu
        </Link>
      </div>
      <h1 className="page-title">Giỏ hàng</h1>
      <p className="subtle" style={{ marginBottom: "0.45rem" }}>
        {getTakeawaySessionId() ? "Loại đơn: Mang về" : `Bàn hiện tại: ${currentTable ?? "Chưa xác định"}`}
      </p>
      {!getTakeawaySessionId() && !currentTable && (
        <div className="card" style={{ padding: "0.8rem", marginBottom: "0.8rem" }}>
          <div className="field" style={{ marginBottom: "0.5rem" }}>
            <label className="label" htmlFor="manual-table">
              Chưa có QR: nhập số bàn để tiếp tục demo
            </label>
            <input
              id="manual-table"
              className="input"
              placeholder="Ví dụ: 12"
              value={manualTable}
              onChange={(e) => setManualTable(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const n = Number(manualTable);
              if (!n || Number.isNaN(n) || n <= 0) {
                setMsg("Nhập số bàn hợp lệ.");
                return;
              }
              setTakeawaySessionId(null);
              setTableId(n);
              setMsg(`Đã gán bàn ${n}.`);
            }}
          >
            Gán bàn
          </button>
        </div>
      )}
      <p className="subtle">Kiểm tra món trước khi chốt đơn.</p>

      {items.length === 0 ? (
        <p className="subtle">Giỏ đang trống.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {items.map((item, idx) => (
            <div key={`${item.productId}-${idx}`} className="card" style={{ display: "flex", gap: "0.75rem" }}>
              <div
                style={{
                  width: "72px",
                  flexShrink: 0,
                  background: "#1a120d",
                  backgroundImage: item.imageUrl ? `url(${item.imageUrl})` : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
              <div style={{ padding: "0.65rem 0.65rem 0.65rem 0", flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{item.name}</div>
                <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                  {item.notes}
                </div>
                <div style={{ marginTop: "0.35rem", fontWeight: 700, color: "var(--accent)" }}>
                  {formatVnd(item.unitPrice * item.quantity)}
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ marginTop: "0.5rem", padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                  onClick={() => {
                    removeLine(idx);
                    refresh();
                  }}
                >
                  Xóa
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <>
          <div
            style={{
              marginTop: "1.25rem",
              padding: "1rem",
              borderRadius: "var(--radius)",
              background: "rgba(0,0,0,0.25)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
              <span>Tạm tính</span>
              <span style={{ color: "var(--accent)" }}>{formatVnd(total)}</span>
            </div>
          </div>

          <button type="button" className="btn btn-primary btn-block" style={{ marginTop: "1rem" }} onClick={() => setPayOpen(true)}>
            Chốt đơn
          </button>
        </>
      )}

      {payOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: "1rem",
            zIndex: 50,
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: 420,
              padding: "1.25rem",
              borderRadius: "18px 18px 12px 12px",
            }}
          >
            <h2 style={{ fontFamily: "var(--font-display)", marginTop: 0 }}>Thanh toán</h2>
            <p className="subtle">Chọn thời điểm thanh toán.</p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={submitting}
              onClick={() => void submitOrder("now")}
            >
              Thanh toán ngay
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              style={{ marginTop: "0.6rem" }}
              disabled={submitting}
              onClick={() => void submitOrder("later")}
            >
              Thanh toán sau
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              style={{ marginTop: "0.75rem", color: "var(--muted)" }}
              onClick={() => setPayOpen(false)}
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p
          style={{
            marginTop: "1rem",
            color: msg.includes("Không xác định được bàn") ? "var(--danger)" : "var(--success)",
            textAlign: "center",
          }}
        >
          {msg}
        </p>
      )}
    </div>
  );
}
