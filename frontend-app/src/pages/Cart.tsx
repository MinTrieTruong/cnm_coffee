import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { backupCart, cartTotal, clearCart, getCart, updateQty, type CartItem } from "../lib/cart";
import { getTableId, getTakeawaySessionId, getUser, setTableId, setTakeawaySessionId } from "../lib/session";
import { motion } from "framer-motion";
import { ArrowLeft, Trash2, Plus, Minus, Receipt } from "lucide-react";
import { LocationPicker } from "../components/LocationPicker";
import { formatKm, haversineKm, shippingFeeForDistance, type LatLng } from "../lib/delivery";

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
  
  // Delivery State
  const [orderTypeSelection, setOrderTypeSelection] = useState<"dine-in" | "takeaway" | "delivery">(
    getTakeawaySessionId() ? "takeaway" : "dine-in"
  );
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [customerLocation, setCustomerLocation] = useState<{lat: number, lng: number} | null>(null);
  const [shippingFee, setShippingFee] = useState(0);
  const [storeLoc, setStoreLoc] = useState<LatLng | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | "new">("new");

  useEffect(() => {
    if (user) {
      api("/api/customer-addresses").then((res: any) => {
        setSavedAddresses(res);
        if (res.length > 0) {
          setSelectedAddressId(res[0].id);
          setDeliveryAddress(res[0].address);
          if (res[0].lat && res[0].lng) {
            setCustomerLocation({ lat: res[0].lat, lng: res[0].lng });
          }
        }
      }).catch(console.error);
    }
  }, [user]);

  useEffect(() => {
    setItems(getCart());
  }, [loc.key, loc.pathname]);

  useEffect(() => {
    api<{ storeLat: number | null; storeLng: number | null }>("/api/store-config")
      .then((c) => c.storeLat != null && c.storeLng != null && setStoreLoc({ lat: c.storeLat, lng: c.storeLng }))
      .catch(() => undefined);
  }, []);

  // Phí ship theo khoảng cách từ quán (cùng công thức với backend)
  const distanceKm = storeLoc && customerLocation ? haversineKm(storeLoc, customerLocation) : null;
  useEffect(() => {
    setShippingFee(distanceKm != null ? shippingFeeForDistance(distanceKm) : 0);
  }, [distanceKm]);

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
      
      let finalOrderType = "Dine-in";
      let sessionId = null;
      
      if (orderTypeSelection === "takeaway") {
        if (!user) {
          setMsg("Vui lòng đăng nhập để đặt mang về.");
          setSubmitting(false); return;
        }
        finalOrderType = "Takeaway";
        sessionId = takeawaySessionId || `ta-${Date.now()}`;
      } else if (orderTypeSelection === "delivery") {
        if (!user) {
          setMsg("Vui lòng đăng nhập để đặt giao hàng.");
          setSubmitting(false); return;
        }
        if (!deliveryAddress.trim()) {
           setMsg("Vui lòng nhập địa chỉ giao hàng.");
           setSubmitting(false); return;
        }
        if (!customerLocation) {
           setMsg("Vui lòng ghim vị trí giao hàng trên bản đồ để tài xế tìm đúng nhà bạn.");
           setSubmitting(false); return;
        }
        finalOrderType = "Delivery";
        sessionId = `del-${Date.now()}`;
        
        // Save new address if "new" is selected
        if (selectedAddressId === "new" && deliveryAddress.trim()) {
          try {
            await api("/api/customer-addresses", {
              method: "POST",
              body: JSON.stringify({
                address: deliveryAddress.trim(),
                lat: customerLocation?.lat,
                lng: customerLocation?.lng,
                isDefault: savedAddresses.length === 0
              })
            });
          } catch(e) { console.error("Lỗi lưu địa chỉ mới", e); }
        }
      } else {
        if (!tableId) {
          setMsg("Không xác định được bàn. Vui lòng thử lại.");
          setSubmitting(false); return;
        }
      }

      const created = await api<{ id: number; status: string }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          tableId: finalOrderType === "Dine-in" ? tableId : null,
          customerId: user?.customerId ?? null,
          orderType: finalOrderType,
          sessionId,
          payMode: mode,
          deliveryAddress: finalOrderType === "Delivery" ? deliveryAddress : undefined,
          customerLat: customerLocation?.lat,
          customerLng: customerLocation?.lng,
          shippingFee: finalOrderType === "Delivery" ? shippingFee : 0,
          lines: items.map((i: CartItem) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            size: i.size,
            customNotes: i.notes,
            comboId: i.comboId ?? null,
          })),
        }),
      });
      clearCart();
      setPayOpen(false);
      refresh();
      if (finalOrderType === "Takeaway" || finalOrderType === "Delivery") {
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

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
        <button 
          className={`btn ${orderTypeSelection === "dine-in" ? "btn-primary" : "btn-ghost"}`} 
          onClick={() => { setOrderTypeSelection("dine-in"); setTakeawaySessionId(null); }}
        >Ăn tại quán</button>
        <button 
          className={`btn ${orderTypeSelection === "takeaway" ? "btn-primary" : "btn-ghost"}`} 
          onClick={() => { setOrderTypeSelection("takeaway"); setTakeawaySessionId(`ta-${Date.now()}`); }}
        >Mang về</button>
        <button 
          className={`btn ${orderTypeSelection === "delivery" ? "btn-primary" : "btn-ghost"}`} 
          onClick={() => setOrderTypeSelection("delivery")}
        >Giao hàng</button>
      </div>

      <p style={{ color: "var(--muted)", marginBottom: "2rem", fontSize: "0.95rem" }}>
        {orderTypeSelection === "takeaway" ? "Loại đơn: Mang về" : orderTypeSelection === "delivery" ? "Loại đơn: Giao tận nơi" : `Bàn hiện tại: ${currentTable ?? "Chưa xác định"}`}
      </p>

      {orderTypeSelection === "delivery" && (
        <div style={{ background: "var(--surface2)", padding: "1.25rem", borderRadius: 16, marginBottom: "2rem", border: "1px solid var(--border)" }}>
          {!user ? (
            <div style={{ textAlign: "center", padding: "1rem" }}>
              <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>Bạn cần đăng nhập để sử dụng tính năng Giao hàng tận nơi.</p>
              <Link to="/login" className="btn btn-primary" style={{ padding: "0.5rem 1.5rem", borderRadius: 8 }}>Đăng nhập ngay</Link>
            </div>
          ) : (
            <>
              <div className="field" style={{ marginBottom: "1rem" }}>
                <label className="label">Chọn địa chỉ giao hàng:</label>
                {savedAddresses.length > 0 && (
                  <select 
                    className="input" 
                    value={selectedAddressId} 
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "new") {
                        setSelectedAddressId("new");
                        setDeliveryAddress("");
                        setCustomerLocation(null);
                      } else {
                        const id = Number(val);
                        setSelectedAddressId(id);
                        const addr = savedAddresses.find(a => a.id === id);
                        if (addr) {
                          setDeliveryAddress(addr.address);
                          if (addr.lat && addr.lng) {
                            setCustomerLocation({ lat: addr.lat, lng: addr.lng });
                          } else {
                            setCustomerLocation(null);
                          }
                        }
                      }
                    }}
                    style={{ background: "var(--surface)", marginBottom: "0.5rem" }}
                  >
                    {savedAddresses.map(a => (
                      <option key={a.id} value={a.id}>{a.address}</option>
                    ))}
                    <option value="new">+ Thêm địa chỉ mới</option>
                  </select>
                )}
                
                {selectedAddressId === "new" && (
                  <input
                    className="input"
                    placeholder="Nhập địa chỉ mới của bạn..."
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    style={{ background: "var(--surface)" }}
                  />
                )}
              </div>
              <label className="label">Ghim vị trí giao hàng</label>
              <LocationPicker
                value={customerLocation}
                onChange={setCustomerLocation}
                store={storeLoc}
                address={deliveryAddress}
                onAddressFound={(addr) => selectedAddressId === "new" && setDeliveryAddress(addr)}
              />
              {distanceKm != null && (
                <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.5rem" }}>
                  Cách quán {formatKm(distanceKm)} · {shippingFee === 0 ? "Miễn phí giao hàng (≤ 3 km)" : `Phí giao ${formatVnd(shippingFee)}`}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {orderTypeSelection === "takeaway" && !user && (
        <div style={{ background: "var(--surface2)", padding: "1.25rem", borderRadius: 16, marginBottom: "2rem", border: "1px solid var(--border)", textAlign: "center" }}>
          <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>Bạn cần đăng nhập để lưu trữ thông tin đơn Mang về dễ dàng hơn.</p>
          <Link to="/login" className="btn btn-primary" style={{ padding: "0.5rem 1.5rem", borderRadius: 8 }}>Đăng nhập ngay</Link>
        </div>
      )}

      {orderTypeSelection === "dine-in" && !currentTable && (
        <div style={{ background: "var(--surface2)", padding: "1.25rem", borderRadius: 16, marginBottom: "2rem", border: "1px solid var(--border)" }}>
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
              style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}
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
        <div style={{ textAlign: "center", padding: "4rem 1rem", background: "var(--surface2)", borderRadius: 24, border: "1px dashed var(--border)" }}>
          <ShoppingBag size={48} color="#d6d3d1" style={{ margin: "0 auto 1rem" }} />
          <p style={{ color: "var(--muted)", fontSize: "1.1rem", margin: "0 0 1.5rem" }}>Giỏ hàng của bạn đang trống.</p>
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
                  background: "var(--surface2)",
                  padding: "0.85rem", borderRadius: 20,
                  boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05)",
                  border: "1px solid var(--border)"
                }}
              >
                {/* Image */}
                <div style={{ width: 84, height: 84, flexShrink: 0, background: "var(--surface)", backgroundImage: item.imageUrl ? `url(${item.imageUrl})` : undefined, backgroundSize: "cover", backgroundPosition: "center", borderRadius: 14 }} />

                {/* Details */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div style={{ fontWeight: 600, fontSize: "1.05rem", color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.2rem", lineHeight: 1.3 }}>
                    {item.notes || "Không có ghi chú"}
                  </div>
                  <div style={{ marginTop: "0.4rem", fontWeight: 700, color: "var(--accent)", fontSize: "1.05rem" }}>
                    {formatVnd(item.unitPrice * item.quantity)}
                  </div>
                </div>

                {/* Qty Controls */}
                <div style={{ display: "flex", alignItems: "center", background: "var(--surface)", borderRadius: 999, padding: "0.25rem", border: "1px solid var(--border)" }}>
                  <button
                    type="button" aria-label={item.quantity <= 1 ? "Xóa" : "Giảm"}
                    onClick={() => { updateQty(idx, item.quantity - 1); refresh(); }}
                    style={{ width: 32, height: 32, borderRadius: "50%", background: "transparent", border: "none", color: item.quantity <= 1 ? "#b91c1c" : "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "background 0.2s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = item.quantity <= 1 ? "rgba(239,68,68,0.15)" : "#f5f5f4" }}
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
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#f5f5f4" }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>

          {/* RIGHT: ORDER SUMMARY (Sticky) */}
          <div style={{ flex: "1 1 320px", position: "sticky", top: "80px", background: "var(--surface)", borderRadius: 24, padding: "1.75rem", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.35rem", margin: "0 0 1.5rem", color: "var(--text)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Receipt size={22} color="var(--accent)" /> Tóm tắt đơn hàng
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text)", fontSize: "0.95rem" }}>
                <span>Tổng món</span>
                <span>{items.reduce((acc, it) => acc + it.quantity, 0)} món</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text)", fontSize: "0.95rem" }}>
                <span>Tạm tính</span>
                <span>{formatVnd(total)}</span>
              </div>
              {orderTypeSelection === "delivery" && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text)", fontSize: "0.95rem" }}>
                  <span>Phí giao hàng</span>
                  <span>{formatVnd(shippingFee)}</span>
                </div>
              )}
              <div style={{ height: 1, background: "var(--surface2)", margin: "0.5rem 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "1.35rem", color: "var(--text)" }}>
                <span>Tổng cộng</span>
                <span style={{ color: "var(--accent)" }}>{formatVnd(total + (orderTypeSelection === "delivery" ? shippingFee : 0))}</span>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              className="btn btn-primary btn-block"
              style={{ borderRadius: 999, padding: "1rem", fontSize: "1.05rem", background: "var(--accent)", boxShadow: "0 8px 20px rgba(146,64,14,0.3)" }}
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
            style={{ width: "100%", maxWidth: 440, padding: "2rem", borderRadius: 24, background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}
          >
            <h2 style={{ fontFamily: "var(--font-display)", margin: "0 0 1rem", fontSize: "1.75rem", color: "var(--accent)" }}>Xác nhận đặt đơn</h2>

            {orderTypeSelection === "takeaway" || orderTypeSelection === "delivery" ? (
              <p style={{ color: "var(--text)", fontSize: "0.95rem", lineHeight: 1.5, marginBottom: "2rem" }}>Đơn sẽ được gửi đi, bạn có thể thanh toán trực tuyến hoặc chờ xác nhận.</p>
            ) : (
              <p style={{ color: "var(--text)", fontSize: "0.95rem", lineHeight: 1.5, marginBottom: "2rem" }}>Tại bàn: thanh toán ngay → trang hóa đơn chờ thu ngân; thanh toán sau → ân hạn chỉnh sửa rồi mới xuống bếp.</p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <button type="button" className="btn btn-primary btn-block" style={{ borderRadius: 999, padding: "1rem", background: "var(--accent)", boxShadow: "0 8px 20px rgba(146,64,14,0.3)" }} disabled={submitting} onClick={() => void submitOrder("now")}>
                {orderTypeSelection !== "dine-in" ? "Gửi đơn & xem hóa đơn" : "Thanh toán ngay (ra quầy)"}
              </button>

              {orderTypeSelection === "dine-in" && (
                <button type="button" className="btn btn-ghost btn-block" style={{ borderRadius: 999, padding: "1rem", border: "1px solid var(--border)" }} disabled={submitting} onClick={() => void submitOrder("later")}>
                  Thanh toán sau
                </button>
              )}

              <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: "0.5rem", color: "var(--muted)", border: "none" }} onClick={() => setPayOpen(false)}>
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
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <line x1="3" x2="21" y1="6" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}
