import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { api, apiOrigin } from "../lib/api";
import { getTakeawaySessionId, getTableId, getUser, mergeSessionUser } from "../lib/session";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle, Receipt, Ticket, Star, CreditCard, Banknote } from "lucide-react";

type BillPayload = {
  storeName: string;
  orderId: number;
  status: string;
  orderType: string;
  createdAt: string;
  tableName: string | null;
  tableId: number | null;
  customerName: string | null;
  customerPhone: string | null;
  customerPoints: number;
  maxPointsCanUse: number;
  pointValueVnd: number;
  items: Array<{ id: number; name: string; quantity: number; unitPrice: number; lineTotal: number }>;
  subTotal: number;
  discountAmt: number;
  pointsUsed: number;
  pointsRedeemAmt: number;
  vatRatePercent: number;
  vatAmount: number;
  totalAmount: number;
  pointsEarnedPreview: number;
  payments: Array<{ method: string; amount: number; paymentTime: string }>;
  paidAt: string | null;
};

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

export function OrderCheckout() {
  const { id } = useParams();
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = getUser();
  const [bill, setBill] = useState<BillPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [payMethod, setPayMethod] = useState<"counter" | "vnpay" | "sepay">("counter");
  const [sepayLoading, setSepayLoading] = useState(false);
  const [sepayForm, setSepayForm] = useState<{ checkoutUrl: string; fields: Record<string, string | number> } | null>(null);
  const [sepayResult, setSepayResult] = useState<"success" | "cancel" | "error" | null>(null);
  const vnpConfirmSentRef = useRef(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherApplied, setVoucherApplied] = useState<{ id: number; code: string; description: string | null; discountValue: number; voucherType: string; } | null>(null);
  const [voucherMsg, setVoucherMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [showVoucherDrop, setShowVoucherDrop] = useState(false);
  const [pointsInput, setPointsInput] = useState("");
  const [_pointsApplied, setPointsApplied] = useState(false);
  const [pointsLoading, setPointsLoading] = useState(false);
  const [pointsMsg, setPointsMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [availableVouchers, setAvailableVouchers] = useState<Array<{ id: number; code: string; description: string | null; discountValue: number; minBillValue: number; voucherType: string; isPersonal?: boolean; }>>([]);

  const orderId = id ? Number(id) : NaN;

  useEffect(() => {
    const vnpCode = searchParams.get("vnp_ResponseCode");
    const vnpTxnRef = searchParams.get("vnp_TxnRef") ?? undefined;
    if (vnpCode !== null) {
      const result = vnpCode === "00" ? "success" : "error";
      setSepayResult(result as "success" | "error");
      setPayMethod("vnpay");
      setSearchParams({}, { replace: true });
      if (result === "success" && !Number.isNaN(orderId)) {
        if (vnpConfirmSentRef.current) return;
        vnpConfirmSentRef.current = true;
        void (async () => {
          try {
            await api(`/api/orders/${orderId}/vnpay/client-confirm`, { method: "POST", body: JSON.stringify({ vnp_ResponseCode: vnpCode, vnp_TxnRef: vnpTxnRef }) });
            const b = await api<BillPayload>(`/api/orders/${orderId}/bill`);
            setBill(b);
          } catch { }
        })();
      }
    }

    const sepayStatus = searchParams.get("sepay");
    if (sepayStatus !== null) {
      setSepayResult(sepayStatus as "success" | "error" | "cancel");
      setPayMethod("sepay");
      setSearchParams({}, { replace: true });
      if (sepayStatus === "success" && !Number.isNaN(orderId)) {
        void (async () => {
          try {
            await api(`/api/orders/${orderId}/sepay/confirm`, { method: "POST" });
            const b = await api<BillPayload>(`/api/orders/${orderId}/bill`);
            setBill(b);
          } catch { }
        })();
      }
    }
  }, [orderId, searchParams, setSearchParams]);

  const loadBill = useCallback(async () => {
    if (Number.isNaN(orderId)) return;
    const b = await api<BillPayload>(`/api/orders/${orderId}/bill`);
    setBill(b);
  }, [orderId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setErr(null); await loadBill();
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Lỗi");
      }
    })();
    return () => { cancelled = true; };
  }, [loadBill]);

  useEffect(() => {
    if (!bill || bill.status === "Paid") return;
    const interval = sepayResult === "success" ? 1500 : 4000;
    const t = setInterval(() => {
      void (async () => {
        try {
          const b = await api<BillPayload>(`/api/orders/${orderId}/bill`);
          setBill(b);
          if (b.status === "Paid") {
            try { const me = await api<{ user: import("../lib/session").SessionUser }>("/api/auth/me"); mergeSessionUser(me.user); } catch { }
          }
        } catch { }
      })();
    }, interval);
    return () => clearInterval(t);
  }, [bill, orderId, sepayResult]);

  useEffect(() => {
    if (Number.isNaN(orderId)) return;
    const socket: Socket = io(apiOrigin(), { transports: ["websocket", "polling"] });
    socket.emit("join", `order:${orderId}`);
    socket.on("payment:success", (p: { orderId?: number }) => {
      if (p.orderId !== orderId) return;
      void (async () => {
        try {
          const b = await api<BillPayload>(`/api/orders/${orderId}/bill`);
          setBill(b);
          if (user) { const me = await api<{ user: import("../lib/session").SessionUser }>("/api/auth/me"); mergeSessionUser(me.user); }
        } catch { }
      })();
    });
    return () => { socket.disconnect(); };
  }, [orderId, user]);

  useEffect(() => {
    (async () => {
      try {
        const pub = await api<Array<any>>("/api/vouchers/public");
        const pubMapped = pub.map((v) => ({ ...v, voucherType: "public", isPersonal: false }));
        if (user) {
          try {
            const myRaw = await api<Array<any>>("/api/vouchers/my");
            const myActive = myRaw.filter((uv) => !uv.isUsed && uv.voucher.isActive && new Date(uv.voucher.endDate) >= new Date()).map((uv) => ({ ...uv.voucher, voucherType: "personal", isPersonal: true }));
            const allCodes = new Set(myActive.map((v) => v.code));
            const merged = [...myActive, ...pubMapped.filter((v) => !allCodes.has(v.code))];
            setAvailableVouchers(merged);
          } catch { setAvailableVouchers(pubMapped); }
        } else { setAvailableVouchers(pubMapped); }
      } catch { }
    })();
  }, [user]);

  async function requestPayment() {
    if (Number.isNaN(orderId)) return;
    setRequesting(true); setMsg(null);
    try {
      const res = await api<{ isDelivery?: boolean }>(`/api/orders/${orderId}/request-payment`, { 
        method: "POST", 
        body: JSON.stringify({ 
          sessionId: getTakeawaySessionId(), 
          tableId: getTableId(),
          discountVoucherAmt: voucherApplied?.discountValue ?? 0,
          voucherCode: voucherApplied?.code ?? null
        }) 
      });
      if (res.isDelivery) {
        nav(`/order/${orderId}/tracking`, { replace: true });
        return;
      } else {
        setMsg("Đã gửi yêu cầu tới thu ngân.");
      }
    } catch (e) { setMsg(e instanceof Error ? e.message : "Không gửi được yêu cầu"); }
    finally { setRequesting(false); }
  }

  async function createVnpay() {
    if (Number.isNaN(orderId) || sepayLoading) return;
    setSepayLoading(true); setMsg(null);
    try {
      const origin = window.location.origin;
      const res = await api<{ payUrl: string }>(`/api/orders/${orderId}/vnpay/create`, { 
        method: "POST", 
        body: JSON.stringify({ 
          returnOrigin: origin, 
          discountVoucherAmt: voucherApplied?.discountValue ?? 0, 
          voucherCode: voucherApplied?.code ?? null 
        }) 
      });
      window.location.href = res.payUrl;
    } catch (e) { setMsg(e instanceof Error ? e.message : "Không tạo được link VNPay"); setSepayLoading(false); }
  }

  async function createSepay() {
    if (Number.isNaN(orderId) || sepayForm || sepayLoading) return;
    setSepayLoading(true); setMsg(null);
    try {
      const res = await api<{ checkoutUrl: string; fields: Record<string, string | number> }>(`/api/orders/${orderId}/sepay/create`, { method: "POST", body: JSON.stringify({ discountVoucherAmt: voucherApplied?.discountValue ?? 0, voucherCode: voucherApplied?.code ?? null }) });
      setSepayForm(res);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Không tạo được link SePay"); }
    finally { setSepayLoading(false); }
  }

  async function applyVoucher() {
    if (!voucherCode.trim() || !bill) return;
    setVoucherLoading(true); setVoucherMsg(null);
    try {
      const res = await api<{ ok: boolean; voucher: any }>("/api/vouchers/validate-public", { method: "POST", body: JSON.stringify({ code: voucherCode.trim(), subTotal: bill.subTotal, customerId: user?.customerId ?? null }) });
      setVoucherApplied(res.voucher);
      setVoucherMsg({ text: `✅ Áp dụng thành công! Giảm ${formatVnd(res.voucher.discountValue)}`, ok: true });
      setSepayResult(null);
    } catch (e) { setVoucherMsg({ text: e instanceof Error ? e.message : "Lỗi kiểm tra voucher", ok: false }); }
    finally { setVoucherLoading(false); }
  }

  function removeVoucher() {
    setVoucherApplied(null); setVoucherCode(""); setVoucherMsg(null); setSepayResult(null);
  }

  async function applyPoints() {
    if (!bill || !user) return;
    const pts = Number(pointsInput);
    if (!pts || pts <= 0) { setPointsMsg({ text: "Nhập số điểm hợp lệ.", ok: false }); return; }
    const toUse = Math.min(pts, bill.maxPointsCanUse);
    if (toUse <= 0) { setPointsMsg({ text: "Không đủ điểm.", ok: false }); return; }
    setPointsLoading(true); setPointsMsg(null);
    try {
      const res = await api<{ ok: boolean; pointsUsed: number; pointsRedeemAmt: number; newTotal: number }>(`/api/orders/${orderId}/redeem-points`, { method: "POST", body: JSON.stringify({ pointsToUse: toUse }) });
      setPointsApplied(true);
      setPointsMsg({ text: `✅ Đã áp dụng ${res.pointsUsed} điểm = −${formatVnd(res.pointsRedeemAmt)}`, ok: true });
      setSepayResult(null); await loadBill();
    } catch (e) { setPointsMsg({ text: e instanceof Error ? e.message : "Lỗi áp dụng điểm", ok: false }); }
    finally { setPointsLoading(false); }
  }

  async function removePoints() {
    if (!bill) return;
    setPointsLoading(true); setPointsMsg(null);
    try {
      await api(`/api/orders/${orderId}/redeem-points`, { method: "POST", body: JSON.stringify({ remove: true }) });
      setPointsApplied(false); setPointsInput(""); setPointsMsg(null); setSepayResult(null); await loadBill();
    } catch (e) { setPointsMsg({ text: e instanceof Error ? e.message : "Lỗi xóa điểm", ok: false }); }
    finally { setPointsLoading(false); }
  }

  if (err && !bill) {
    return (
      <div className="site-page">
        <p style={{ color: "var(--danger)" }}>{err}</p>
        <Link to="/menu">Menu</Link>
      </div>
    );
  }

  if (!bill) return <div className="site-page"><p className="subtle">Đang tải hóa đơn…</p></div>;

  if (bill.status === "Paid") {
    const cashPaid = bill.payments.filter(p => p.method !== "Points").reduce((s, p) => s + p.amount, 0);
    const ptsPaid = bill.payments.find(p => p.method === "Points");
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="site-page" style={{ textAlign: "center", maxWidth: 440, margin: "0 auto", paddingTop: "2rem" }}>
        <CheckCircle size={64} color="#15803d" style={{ margin: "0 auto 1rem" }} />
        <h1 className="page-title" style={{ color: "var(--text)" }}>Thanh toán thành công</h1>
        <p className="subtle" style={{ marginBottom: "2rem" }}>Cảm ơn bạn đã ghé {bill.storeName}.</p>

        <div style={{ background: "var(--surface2)", border: "1px dashed var(--border)", borderRadius: 20, padding: "1.5rem", textAlign: "left", fontSize: "0.95rem" }}>
          <div style={{ textAlign: "center", fontWeight: 700, fontSize: "1.1rem", marginBottom: "1rem", color: "var(--text)" }}>
            Hóa đơn #{bill.orderId}
          </div>
          {bill.items.map(it => (
            <div key={it.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", color: "var(--text)" }}>
              <span>{it.name} <span style={{ color: "var(--muted)" }}>× {it.quantity}</span></span>
              <span>{formatVnd(it.lineTotal)}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid var(--border)", margin: "1rem 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <span className="subtle">Tạm tính</span><span>{formatVnd(bill.subTotal)}</span>
          </div>
          {bill.discountAmt > 0 && bill.discountAmt !== bill.pointsRedeemAmt && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", color: "#15803d" }}>
              <span>Giảm giá</span><span>−{formatVnd(bill.discountAmt - bill.pointsRedeemAmt)}</span>
            </div>
          )}
          {bill.pointsRedeemAmt > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", color: "#b45309" }}>
              <span>Đổi điểm ({bill.pointsUsed} pts)</span><span>−{formatVnd(bill.pointsRedeemAmt)}</span>
            </div>
          )}
          <div style={{ borderTop: "1px solid var(--border)", margin: "1rem 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: "1.25rem" }}>
            <span>Đã thanh toán</span>
            <span style={{ color: "var(--accent)" }}>{formatVnd(cashPaid)}</span>
          </div>
        </div>

        {user && bill.pointsEarnedPreview > 0 && (
          <div style={{ marginTop: "1.5rem", background: "rgba(245,158,11,0.1)", padding: "1rem", borderRadius: 12, border: "1px solid rgba(245,158,11,0.2)" }}>
            <span style={{ color: "#b45309", fontWeight: 600 }}>⭐ Bạn được cộng thêm +{bill.pointsEarnedPreview} điểm</span>
          </div>
        )}
        {bill.orderType === "Delivery" && (
          <Link to={`/order/${orderId}/tracking`} className="btn btn-block" style={{ marginTop: "1rem", borderRadius: 999, background: "var(--surface2)", color: "#fff", textDecoration: "none", textAlign: "center", padding: "1rem" }}>
            📍 Theo dõi giao hàng (Map)
          </Link>
        )}
        <Link to="/menu" className="btn btn-primary btn-block" style={{ marginTop: "1rem", borderRadius: 999 }}>Tiếp tục khám phá</Link>
      </motion.div>
    );
  }

  const isDineIn = !bill.orderType.toLowerCase().includes("take");
  const showRequestBtn = bill.status === "Confirmed";

  // Recalculate VAT dynamically because voucher reduces taxable amount
  const taxable = Math.max(0, bill.subTotal - bill.discountAmt - bill.pointsRedeemAmt - (voucherApplied?.discountValue ?? 0));
  const expectedVat = Math.floor((taxable * bill.vatRatePercent) / 100);
  const effectiveTotal = taxable + expectedVat;

  function handleSelectMethod(m: "counter" | "vnpay" | "sepay") {
    setPayMethod(m);
    if (m === "sepay" && !sepayForm && !sepayLoading) void createSepay();
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="site-page" style={{ maxWidth: 800 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <Link to="/cart" style={{ color: "var(--muted)", textDecoration: "none" }}><ArrowLeft size={20} /></Link>
        <h1 className="page-title" style={{ margin: 0, fontSize: "1.75rem", color: "var(--text)" }}>{isDineIn ? "Đơn hàng của bạn" : "Thanh toán"}</h1>
      </div>
      
      <p style={{ color: "var(--muted)", marginBottom: "2rem" }}>
        {bill.orderType === "Delivery" ? "Đơn giao tận nơi" : isDineIn ? `Tại bàn${bill.tableName ? ` — ${bill.tableName}` : ""}` : "Đơn mang về"}
      </p>
      
      {bill.orderType === "Delivery" && (
        <Link to={`/order/${orderId}/tracking`} className="btn btn-block" style={{ marginBottom: "2rem", borderRadius: 999, background: "var(--surface2)", color: "#fff", textDecoration: "none", textAlign: "center", padding: "1rem" }}>
          📍 Xem hành trình giao hàng (Map)
        </Link>
      )}

      {/* SECTION 1: ORDER SUMMARY */}
      <div className="checkout-section">
        <h2 style={{ fontSize: "1.1rem", fontFamily: "var(--font-display)", color: "var(--accent)", display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}><Receipt size={18} /> Thông tin đơn hàng</h2>
        <div style={{ padding: "0 0.5rem" }}>
          {bill.items.map((it) => (
            <div key={it.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", color: "var(--text)" }}>
              <span>{it.name} <span style={{ color: "var(--muted)" }}>× {it.quantity}</span></span>
              <span style={{ fontWeight: 500 }}>{formatVnd(it.lineTotal)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
            <span className="subtle">Tạm tính</span>
            <span>{formatVnd(bill.subTotal)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem" }}>
            <span className="subtle">VAT ({bill.vatRatePercent}%)</span>
            <span>{formatVnd(expectedVat)}</span>
          </div>
        </div>
      </div>

      {showRequestBtn && (
        <>
          {/* SECTION 2: LOYALTY POINTS */}
          {user && (bill.customerPoints > 0 || bill.pointsRedeemAmt > 0) && (
            <div className="checkout-section">
              <h2 style={{ fontSize: "1.1rem", fontFamily: "var(--font-display)", color: "#b45309", display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}><Star size={18} /> Điểm tích lũy</h2>
              <div style={{ padding: "0 0.5rem" }}>
                {bill.pointsRedeemAmt > 0 ? (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#b45309", fontWeight: 600 }}>Đã dùng {bill.pointsUsed} điểm</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                      <span style={{ color: "#b45309", fontWeight: 600 }}>−{formatVnd(bill.pointsRedeemAmt)}</span>
                      <button type="button" disabled={pointsLoading} onClick={() => void removePoints()} style={{ background: "transparent", color: "var(--danger)", border: "none", textDecoration: "underline", cursor: "pointer" }}>Xóa</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: "0.9rem", color: "var(--muted)", marginBottom: "0.75rem" }}>Bạn có {bill.customerPoints} điểm. Tối đa áp dụng: {bill.maxPointsCanUse}.</p>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <input type="number" min={1} max={bill.maxPointsCanUse} className="input" placeholder="Số điểm muốn dùng..." value={pointsInput} onChange={e => setPointsInput(e.target.value)} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "0.75rem" }} />
                      <button type="button" className="btn btn-primary" disabled={pointsLoading || !pointsInput} onClick={() => void applyPoints()} style={{ borderRadius: 8, padding: "0 1.5rem" }}>Áp dụng</button>
                    </div>
                    {pointsMsg && <p style={{ color: pointsMsg.ok ? "#b45309" : "var(--danger)", fontSize: "0.85rem", marginTop: "0.5rem" }}>{pointsMsg.text}</p>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 3: VOUCHERS */}
          <div className="checkout-section">
            <h2 style={{ fontSize: "1.1rem", fontFamily: "var(--font-display)", color: "#15803d", display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}><Ticket size={18} /> Mã giảm giá</h2>
            <div style={{ padding: "0 0.5rem" }}>
              {voucherApplied ? (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ color: "#15803d", fontWeight: 600, display: "block" }}>{voucherApplied.code}</span>
                    <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{voucherApplied.description}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <span style={{ color: "#15803d", fontWeight: 600 }}>−{formatVnd(voucherApplied.discountValue)}</span>
                    <button type="button" onClick={removeVoucher} style={{ background: "transparent", color: "var(--danger)", border: "none", textDecoration: "underline", cursor: "pointer" }}>Xóa</button>
                  </div>
                </div>
              ) : (
                <div style={{ position: "relative" }}>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <input type="text" className="input" placeholder="Nhập hoặc chọn mã..." value={voucherCode} onChange={(e) => { setVoucherCode(e.target.value.toUpperCase()); setShowVoucherDrop(true); }} onFocus={() => setShowVoucherDrop(true)} onBlur={() => setTimeout(() => setShowVoucherDrop(false), 200)} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "0.75rem", textTransform: "uppercase" }} />
                    <button type="button" className="btn btn-primary" disabled={voucherLoading || !voucherCode.trim()} onClick={() => void applyVoucher()} style={{ borderRadius: 8, padding: "0 1.5rem" }}>Áp dụng</button>
                  </div>
                  {showVoucherDrop && availableVouchers.length > 0 && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: "0.5rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", zIndex: 10, boxShadow: "var(--shadow-lg)" }}>
                      {availableVouchers.filter((v) => !voucherCode || v.code.includes(voucherCode)).map((v) => (
                        <button key={v.id} type="button" onMouseDown={() => { setVoucherCode(v.code); setShowVoucherDrop(false); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "1rem", background: "transparent", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", textAlign: "left", color: "var(--text)" }}>
                          <div>
                            <div style={{ fontWeight: 700, color: "var(--accent)" }}>{v.code}</div>
                            <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.2rem" }}>{v.description}</div>
                          </div>
                          <span style={{ color: "#15803d", fontWeight: 600 }}>−{formatVnd(v.discountValue)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {voucherMsg && <p style={{ color: voucherMsg.ok ? "#15803d" : "var(--danger)", fontSize: "0.85rem", marginTop: "0.5rem" }}>{voucherMsg.text}</p>}
                </div>
              )}
            </div>
          </div>

          {/* SECTION 4: PAYMENT */}
          <div className="checkout-section">
            <h2 style={{ fontSize: "1.1rem", fontFamily: "var(--font-display)", color: "var(--text)", display: "flex", alignItems: "center", gap: "0.5rem", margin: "1rem 0" }}><CreditCard size={18} /> {isDineIn ? "Thanh toán khi dùng xong" : "Chọn phương thức"}</h2>
            
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", padding: "0 0.5rem", marginBottom: "2rem" }}>
              {(["counter", "vnpay", "sepay"] as const).map((m) => (
                <button
                  key={m} type="button" onClick={() => handleSelectMethod(m)}
                  style={{
                    flex: 1, minWidth: 120, padding: "1.25rem", borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem",
                    background: payMethod === m ? "rgba(146,64,14,0.15)" : "#f5f5f4",
                    border: `1px solid ${payMethod === m ? "var(--accent)" : "#e7e5e4"}`,
                    color: payMethod === m ? "var(--accent)" : "#57534e",
                    transition: "all 0.2s ease", cursor: "pointer"
                  }}
                >
                  {m === "counter" && <Banknote size={24} />}
                  {m === "vnpay" && <CreditCard size={24} />}
                  {m === "sepay" && <div style={{ fontWeight: 800, fontSize: "1.2rem", letterSpacing: "-1px" }}>SePay</div>}
                  <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{m === "counter" ? (bill.orderType === "Delivery" ? "Tiền mặt (COD)" : "Tại quầy") : m === "vnpay" ? "Ví VNPay" : "Chuyển khoản"}</span>
                </button>
              ))}
            </div>

            {/* TOTAL COMPONENT */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "0 0.5rem", marginBottom: "2rem" }}>
              <span style={{ fontSize: "1.1rem", color: "var(--muted)" }}>Tổng thanh toán</span>
              <div style={{ textAlign: "right" }}>
                {voucherApplied && (
                  <div style={{ textDecoration: "line-through", color: "var(--muted)", fontSize: "1rem", marginBottom: "0.2rem" }}>
                    {formatVnd(bill.totalAmount)}
                  </div>
                )}
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--accent)", lineHeight: 1 }}>
                  {formatVnd(effectiveTotal)}
                </div>
              </div>
            </div>

            {/* ACTION BUTTON */}
            <div style={{ padding: "0 0.5rem" }}>
              {payMethod === "counter" && (
                <button type="button" className="btn btn-primary btn-block" disabled={requesting} onClick={() => void requestPayment()} style={{ padding: "1rem", borderRadius: 999, fontSize: "1.1rem", background: "var(--accent)", color: "#fff", boxShadow: "0 8px 20px rgba(146,64,14,0.3)" }}>
                  {requesting ? "Đang gửi…" : (bill.orderType === "Delivery" ? "Xác nhận đặt hàng (COD)" : "Yêu cầu thanh toán tại quầy")}
                </button>
              )}
              {payMethod === "vnpay" && (
                <button type="button" className="btn btn-block" disabled={sepayLoading} onClick={() => void createVnpay()} style={{ padding: "1rem", borderRadius: 999, fontSize: "1.1rem", background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)", color: "#fff", border: "none", boxShadow: "0 8px 20px rgba(37,99,235,0.3)" }}>
                  {sepayLoading ? "Đang xử lý…" : "Thanh toán qua VNPay"}
                </button>
              )}
              {payMethod === "sepay" && sepayForm && (
                <form action={sepayForm.checkoutUrl} method="POST">
                  {Object.entries(sepayForm.fields).map(([k, v]) => (
                    <input key={k} type="hidden" name={k} value={String(v)} />
                  ))}
                  <button type="submit" className="btn btn-block" style={{ padding: "1rem", borderRadius: 999, fontSize: "1.1rem", background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)", color: "#fff", border: "none", boxShadow: "0 8px 20px rgba(22,163,74,0.3)" }}>
                    Quét QR chuyển khoản (SePay)
                  </button>
                </form>
              )}
              {payMethod === "sepay" && !sepayForm && !sepayLoading && (
                <button type="button" className="btn btn-block" style={{ padding: "1rem", borderRadius: 999, fontSize: "1.1rem", background: "var(--surface2)", color: "#fff", border: "none" }}>
                  Đang tải SePay...
                </button>
              )}
              
              {msg && <p style={{ textAlign: "center", color: "var(--success)", marginTop: "1rem" }}>{msg}</p>}
            </div>
          </div>
        </>
      )}

      {bill.status === "Pending_Grace" && (
        <div style={{ background: "var(--surface2)", padding: "1.5rem", borderRadius: 16, textAlign: "center" }}>
          <p style={{ color: "var(--muted)", margin: 0 }}>Đơn đang chờ xác nhận từ bếp. Bạn có thể thanh toán sau khi bếp chốt đơn.</p>
        </div>
      )}
    </motion.div>
  );
}
