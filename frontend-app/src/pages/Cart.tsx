import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { backupCart, cartTotal, clearCart, getCart, updateQty, type CartItem } from "../lib/cart";
import { getTableId, getTakeawaySessionId, getUser, setTableId, setTakeawaySessionId } from "../lib/session";
import { motion } from "framer-motion";
import { ArrowLeft, Trash2, Plus, Minus, Receipt } from "lucide-react";

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
        setMsg("Không xác định được bàn. Vui lòng thử lại.");
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
      if (isTakeaway) {
        nav(`/order/${created.id}/checkout`, { replace: true });
        return;
      }
      if (mode === "later") {
        nav(`/order/${created.id}/grace`, { replace: true });
      } else {
        nav(`/order/${created.id}/checkout`, { replace: true });
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Không gửi được đơn");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.4 }}
      className="site-page"
      style={{ maxWidth: 1000, padding: "1.5rem" }}
    >
      <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "1rem" }}>
        <Link to="/menu" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", color: "var(--muted)", textDecoration: "none", fontSize: "0.95rem", fontWeight: 500, transition: "color 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.color = "var(--text)"} onMouseLeave={(e) => e.currentTarget.style.color = "var(--muted)"}>
          <ArrowLeft size={18} /> Quay lại
        </Link>
        <h1 className="page-title" style={{ margin: 0, fontSize: "1.75rem", color: "var(--accent)" }}>Giỏ hàng</h1>
      </div>

      <p style={{ color: "rgba(245,235,227,0.6)", marginBottom: "2rem", fontSize: "0.95rem" }}>
        {getTakeawaySessionId() ? "Loại đơn: Mang về" : `Bàn hiện tại: ${currentTable ?? "Chưa xác định"}`}
      </p>

      {!getTakeawaySessionId() && !currentTable && (
        <div style={{ background: "rgba(255,255,255,0.03)", padding: "1.25rem", borderRadius: 16, marginBottom: "2rem", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="field" style={{ marginBottom: "1rem" }}>
            <label className="label" htmlFor="manual-table" style={{ fontSize: "0.85rem", color: "var(--text)", marginBottom: "0.5rem", display: "block" }}>
              Bạn chưa có QR? Nhập số bàn của bạn:
            </label>
            <input
              id="manual-table"
              className="input"
              placeholder="Ví dụ: 12"
              value={manualTable}
              onChange={(e) => setManualTable(e.target.value)}
              style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10 }}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ borderRadius: 999, padding: "0.6rem 1.5rem", fontSize: "0.95rem" }}
            onClick={() => {
              const n = Number(manualTable);
              if (!n || Number.isNaN(n) || n <= 0) {
                setMsg("Vui lòng nhập số bàn hợp lệ.");
                return;
              }
              setTakeawaySessionId(null);
              setTableId(n);
              setMsg(`Đã gán bàn ${n}.`);
            }}
          >
            Xác nhận bàn
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem 1rem", background: "rgba(255,255,255,0.02)", borderRadius: 24, border: "1px dashed rgba(255,255,255,0.1)" }}>
          <ShoppingBag size={48} color="rgba(255,255,255,0.1)" style={{ margin: "0 auto 1rem" }} />
          <p style={{ color: "rgba(245,235,227,0.5)", fontSize: "1.1rem", margin: "0 0 1.5rem" }}>Giỏ hàng của bạn đang trống.</p>
          <Link to="/menu" className="btn btn-primary" style={{ borderRadius: 999, padding: "0.75rem 2rem" }}>Khám phá thực đơn</Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "2.5rem", alignItems: "flex-start" }}>
          
          {/* LEFT: ITEM LIST */}
          <div style={{ flex: "1 1 500px", display: "flex", flexDirection: "column", gap: "1rem" }}>
            {items.map((item, idx) => (
              <motion.div 
                whileHover={{ scale: 1.01 }}
                key={`${item.productId}-${idx}`} 
                style={{ 
                  display: "flex", gap: "1rem", alignItems: "center", 
                  background: "rgba(255,255,255,0.03)", 
                  padding: "0.85rem", borderRadius: 20, 
                  boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.03)"
                }}
              >
                {/* Image */}
                <div style={{ width: 84, height: 84, flexShrink: 0, background: "#1a120d", backgroundImage: item.imageUrl ? `url(${item.imageUrl})` : undefined, backgroundSize: "cover", backgroundPosition: "center", borderRadius: 14 }} />
                
                {/* Details */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div style={{ fontWeight: 600, fontSize: "1.05rem", color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "rgba(245,235,227,0.5)", marginTop: "0.2rem", lineHeight: 1.3 }}>
                    {item.notes || "Không có ghi chú"}
                  </div>
                  <div style={{ marginTop: "0.4rem", fontWeight: 700, color: "var(--accent)", fontSize: "1.05rem" }}>
                    {formatVnd(item.unitPrice * item.quantity)}
                  </div>
                </div>

                {/* Qty Controls */}
                <div style={{ display: "flex", alignItems: "center", background: "rgba(0,0,0,0.4)", borderRadius: 999, padding: "0.25rem", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <button
                    type="button" aria-label={item.quantity <= 1 ? "Xóa" : "Giảm"}
                    onClick={() => { updateQty(idx, item.quantity - 1); refresh(); }}
                    style={{ width: 32, height: 32, borderRadius: "50%", background: "transparent", border: "none", color: item.quantity <= 1 ? "#ef4444" : "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "background 0.2s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = item.quantity <= 1 ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.1)" }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
                  >
                    {item.quantity <= 1 ? <Trash2 size={16} /> : <Minus size={16} />}
                  </button>
                  <span style={{ fontWeight: 600, fontSize: "0.95rem", minWidth: 28, textAlign: "center", color: "var(--text)" }}>
                    {item.quantity}
                  </span>
                  <button
                    type="button" aria-label="Tăng"
                    onClick={() => { updateQty(idx, item.quantity + 1); refresh(); }}
                    style={{ width: 32, height: 32, borderRadius: "50%", background: "transparent", border: "none", color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "background 0.2s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)" }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>

          {/* RIGHT: ORDER SUMMARY (Sticky) */}
          <div style={{ flex: "1 1 320px", position: "sticky", top: "80px", background: "linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)", borderRadius: 24, padding: "1.75rem", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 20px 40px rgba(0,0,0,0.3)" }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.35rem", margin: "0 0 1.5rem", color: "var(--text)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Receipt size={22} color="var(--accent)" /> Tóm tắt đơn hàng
            </h2>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(245,235,227,0.7)", fontSize: "0.95rem" }}>
                <span>Tổng món</span>
                <span>{items.reduce((acc, it) => acc + it.quantity, 0)} món</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(245,235,227,0.7)", fontSize: "0.95rem" }}>
                <span>Tạm tính</span>
                <span>{formatVnd(total)}</span>
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "0.5rem 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "1.35rem", color: "var(--text)" }}>
                <span>Tổng cộng</span>
                <span style={{ color: "var(--accent)" }}>{formatVnd(total)}</span>
              </div>
            </div>

            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button" 
              className="btn btn-primary btn-block" 
              style={{ borderRadius: 999, padding: "1rem", fontSize: "1.05rem", background: "linear-gradient(135deg, #e8b84a 0%, var(--accent) 100%)", boxShadow: "0 8px 20px rgba(201,162,39,0.3)" }} 
              onClick={() => setPayOpen(true)}
            >
              Chốt đơn
            </motion.button>
          </div>

        </div>
      )}

      {/* MODAL PAY */}
      {payOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", zIndex: 100 }} role="dialog" aria-modal="true">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="card" 
            style={{ width: "100%", maxWidth: 440, padding: "2rem", borderRadius: 24, background: "linear-gradient(145deg, #2a201a 0%, #1a120d 100%)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 25px 50px rgba(0,0,0,0.5)" }}
          >
            <h2 style={{ fontFamily: "var(--font-display)", margin: "0 0 1rem", fontSize: "1.75rem", color: "var(--accent)" }}>Xác nhận đặt đơn</h2>
            
            {getTakeawaySessionId() ? (
              <p style={{ color: "rgba(245,235,227,0.7)", fontSize: "0.95rem", lineHeight: 1.5, marginBottom: "2rem" }}>Mang về: đơn gửi bếp ngay, bạn xem hóa đơn &amp; chờ thu ngân xác nhận (vẫn tích điểm nếu đã đăng nhập).</p>
            ) : (
              <p style={{ color: "rgba(245,235,227,0.7)", fontSize: "0.95rem", lineHeight: 1.5, marginBottom: "2rem" }}>Tại bàn: thanh toán ngay → trang hóa đơn chờ thu ngân; thanh toán sau → ân hạn chỉnh sửa rồi mới xuống bếp.</p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <button type="button" className="btn btn-primary btn-block" style={{ borderRadius: 999, padding: "1rem", background: "linear-gradient(135deg, #e8b84a 0%, var(--accent) 100%)", boxShadow: "0 8px 20px rgba(201,162,39,0.3)" }} disabled={submitting} onClick={() => void submitOrder("now")}>
                {getTakeawaySessionId() ? "Gửi đơn & xem hóa đơn" : "Thanh toán ngay (ra quầy)"}
              </button>
              
              {!getTakeawaySessionId() && (
                <button type="button" className="btn btn-ghost btn-block" style={{ borderRadius: 999, padding: "1rem", border: "1px solid rgba(255,255,255,0.15)" }} disabled={submitting} onClick={() => void submitOrder("later")}>
                  Thanh toán sau
                </button>
              )}
              
              <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: "0.5rem", color: "rgba(245,235,227,0.5)", border: "none" }} onClick={() => setPayOpen(false)}>
                Hủy bỏ
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {msg && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginTop: "1.5rem", textAlign: "center", color: msg.includes("Không xác định được bàn") ? "var(--danger)" : "var(--success)" }}>
          {msg}
        </motion.p>
      )}

    </motion.div>
  );
}

function ShoppingBag(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.size} height={props.size} viewBox="0 0 24 24" fill="none" stroke={props.color || "currentColor"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={props.style}>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
      <line x1="3" x2="21" y1="6" y2="6"/>
      <path d="M16 10a4 4 0 0 1-8 0"/>
    </svg>
  );
}
