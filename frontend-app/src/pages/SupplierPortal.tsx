import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { LogOut, Package, FileText, Send, CheckCircle } from "lucide-react";
import { apiBase, mediaUrl } from "../lib/api";
import { REJECT_REASON, RESOLUTION_LABEL, SUPPLIER_STATUS } from "../lib/supplierReturns";
import { PasswordInput } from "../components/PasswordInput";

export function SupplierPortal() {
  const [token, setToken] = useState(localStorage.getItem("supplierToken"));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"rfq" | "orders" | "bills" | "returns">("rfq");
  
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [returns, setReturns] = useState<any[]>([]);
  
  const [quotingRfqId, setQuotingRfqId] = useState<number | null>(null);
  const [quotePrices, setQuotePrices] = useState<Record<number, string>>({});
  

  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [token, tab]);

  async function loadData() {
    try {
      if (tab === "rfq") {
        const res = await fetch(`${apiBase()}/api/supplier/rfqs`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Unauthorized");
        setRfqs(await res.json());
      } else if (tab === "bills") {
        const res = await fetch(`${apiBase()}/api/supplier/bills`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Unauthorized");
        setBills(await res.json());
      } else if (tab === "returns") {
        const res = await fetch(`${apiBase()}/api/supplier/returns`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Unauthorized");
        setReturns(await res.json());
      } else {
        const res = await fetch(`${apiBase()}/api/supplier/orders`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Unauthorized");
        setOrders(await res.json());
      }
    } catch (e) {
      logout();
    }
  }

  async function respondReturn(t: any, action: "CONFIRM" | "DISPUTE") {
    let note = "";
    if (action === "DISPUTE") {
      const v = window.prompt(`Lý do khiếu nại phiếu ${t.code}:`);
      if (!v?.trim()) return;
      note = v;
    } else if (!window.confirm(`Xác nhận đã nhận lại hàng theo phiếu ${t.code}?`)) return;
    const res = await fetch(`${apiBase()}/api/supplier/returns/${t.id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, note }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Không gửi được phản hồi");
      return;
    }
    void loadData();
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch(`${apiBase()}/api/supplier/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      localStorage.setItem("supplierToken", data.token);
      setToken(data.token);
    } catch (e: any) {
      setError(e.message);
    }
  }

  function logout() {
    localStorage.removeItem("supplierToken");
    setToken(null);
  }

  async function submitQuote(rfqId: number, items: any[]) {
    try {
      const payloadItems = items.map(i => ({
        itemId: i.itemId,
        unitPrice: Number(quotePrices[i.itemId]) || 0
      }));
      
      const res = await fetch(`${apiBase()}/api/supplier/rfqs/${rfqId}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items: payloadItems })
      });
      if (!res.ok) throw new Error("Gửi báo giá thất bại");
      setQuotingRfqId(null);
      setQuotePrices({});
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  }

  if (!token) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "var(--bg)", color: "var(--text)" }}>
        <form onSubmit={login} style={{ width: 350, padding: "2rem", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, display: "flex", flexDirection: "column", gap: "1rem" }}>
          <h2 style={{ textAlign: "center", margin: 0, color: "var(--accent)" }}>Supplier Portal</h2>
          <p style={{ textAlign: "center", color: "var(--muted)", margin: "0 0 1rem 0", fontSize: "0.9rem" }}>Dành cho Nhà cung cấp báo giá</p>
          {error && <div style={{ color: "#b91c1c", fontSize: "0.9rem", textAlign: "center" }}>{error}</div>}
          <input className="input-field" placeholder="Tên đăng nhập" value={username} onChange={e => setUsername(e.target.value)} required />
          <PasswordInput className="input-field" placeholder="Mật khẩu" value={password} onChange={e => setPassword(e.target.value)} required />
          <button className="primary-btn" type="submit">Đăng nhập</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <header style={{ padding: "1rem 2rem", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, color: "var(--accent)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Package /> Supplier Portal
        </h2>
        <button className="icon-btn" onClick={logout} title="Đăng xuất"><LogOut size={20}/></button>
      </header>
      
      <div style={{ padding: "2rem", maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem" }}>
          <button className={tab === "rfq" ? "primary-btn" : "secondary-btn"} onClick={() => setTab("rfq")}>
            <FileText size={18} /> Yêu cầu Báo giá
          </button>
          <button className={tab === "orders" ? "primary-btn" : "secondary-btn"} onClick={() => setTab("orders")}>
            <CheckCircle size={18} /> Đơn đặt hàng (PO)
          </button>
          <button className={tab === "bills" ? "primary-btn" : "secondary-btn"} onClick={() => setTab("bills")}>
            <FileText size={18} /> Công nợ & thanh toán
          </button>
          <button className={tab === "returns" ? "primary-btn" : "secondary-btn"} onClick={() => setTab("returns")}>
            <Package size={18} /> Hàng trả lại
          </button>
        </div>

        {tab === "rfq" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {rfqs.length === 0 ? <p style={{ color: "var(--muted)" }}>Không có yêu cầu báo giá nào mới.</p> : rfqs.map(rfq => (
              <motion.div key={rfq.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ background: "var(--surface2)", padding: "1.5rem", borderRadius: 8, border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
                  <h3 style={{ margin: 0 }}>{rfq.code} (Từ PR: {rfq.requisition.code})</h3>
                  <span style={{ color: rfq.hasQuoted ? "#047857" : "#b45309", fontWeight: "bold" }}>
                    {rfq.hasQuoted ? "Đã Báo Giá" : "Chờ Báo Giá"}
                  </span>
                </div>
                
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                      <th style={{ padding: "0.5rem" }}>Mặt hàng</th>
                      <th style={{ padding: "0.5rem" }}>Số lượng</th>
                      <th style={{ padding: "0.5rem", width: 200 }}>Đơn giá (VNĐ)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rfq.requisition.items.map((i: any) => (
                      <tr key={i.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.5rem" }}>{i.item.name}</td>
                        <td style={{ padding: "0.5rem" }}>{i.qty} {i.item.unit}</td>
                        <td style={{ padding: "0.5rem" }}>
                          {quotingRfqId === rfq.id ? (
                            <input 
                              type="number" 
                              className="input-field" 
                              style={{ padding: "0.25rem 0.5rem" }}
                              value={quotePrices[i.itemId] || ""}
                              onChange={e => setQuotePrices(p => ({ ...p, [i.itemId]: e.target.value }))}
                              placeholder="VD: 120000"
                            />
                          ) : (
                            <span>{rfq.hasQuoted && rfq.myQuote?.items ? (rfq.myQuote.items.find((qi:any) => qi.itemId === i.itemId)?.unitPrice?.toLocaleString() + " đ") : "---"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  {quotingRfqId === rfq.id ? (
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button className="secondary-btn" onClick={() => setQuotingRfqId(null)}>Hủy</button>
                      <button className="primary-btn" onClick={() => submitQuote(rfq.id, rfq.requisition.items)}><Send size={16}/> Gửi Báo Giá</button>
                    </div>
                  ) : (
                    <button className="secondary-btn" onClick={() => setQuotingRfqId(rfq.id)}>
                      {rfq.hasQuoted ? "Cập nhật Báo Giá" : "Nhập Báo Giá"}
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {tab === "orders" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {orders.length === 0 ? <p style={{ color: "var(--muted)" }}>Không có đơn đặt hàng nào.</p> : orders.map(po => (
              <motion.div key={po.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ background: "var(--surface2)", padding: "1.5rem", borderRadius: 8, border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
                  <h3 style={{ margin: 0, color: "var(--accent)" }}>{po.code}</h3>
                  <span style={{ color: po.status === "DELIVERED" ? "#047857" : "#b45309", fontWeight: "bold" }}>
                    {po.status === "DELIVERED" ? "Đã Giao" : po.status === "PARTIAL" ? "Đã giao một phần" : po.status === "CLOSED" ? "Đã đóng" : "Đang Chờ Giao"}
                  </span>
                </div>
                <p style={{ margin: "0 0 1rem 0", color: "var(--muted)" }}>Tổng tiền: <strong style={{ color: "var(--text)" }}>{po.totalAmount.toLocaleString()} đ</strong></p>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--muted)" }}>
                      <th style={{ padding: "0.5rem" }}>Mặt hàng</th>
                      <th style={{ padding: "0.5rem" }}>Đặt</th>
                      <th style={{ padding: "0.5rem" }}>Đơn giá</th>
                      <th style={{ padding: "0.5rem" }}>Quán đã nhận</th>
                      <th style={{ padding: "0.5rem" }}>Bị trả lại</th>
                      <th style={{ padding: "0.5rem" }}>Còn phải giao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {po.lines.map((l: any) => (
                      <tr key={l.itemId} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.5rem" }}>{l.name}</td>
                        <td style={{ padding: "0.5rem" }}>{l.ordered} {l.unit}</td>
                        <td style={{ padding: "0.5rem" }}>{l.unitPrice.toLocaleString()} đ</td>
                        <td style={{ padding: "0.5rem" }}>{l.received}</td>
                        <td style={{ padding: "0.5rem", color: l.rejected ? "var(--danger)" : undefined }}>{l.rejected || "—"}</td>
                        <td style={{ padding: "0.5rem", color: l.remaining > 0 ? "#b45309" : undefined }}>
                          {l.remaining || "—"}
                          {l.remaining > 0 && l.backorderDate && <div style={{ fontSize: "0.8rem" }}>Hẹn giao bù {new Date(l.backorderDate).toLocaleDateString("vi-VN")}</div>}
                          {l.cancelled > 0 && <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Quán đã hủy {l.cancelled}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {po.receipts.length > 0 && (
                  <div style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "var(--muted)", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    {po.receipts.map((g: any) => (
                      <div key={g.id}>
                        {g.code} · {new Date(g.createdAt).toLocaleDateString("vi-VN")}: {g.items.filter((x: any) => x.receivedQty || x.rejectedQty).map((x: any) => `${x.item.name} nhận ${x.receivedQty}${x.rejectedQty ? `, trả lại ${x.rejectedQty} (${REJECT_REASON[x.rejectReason] ?? x.rejectReason})` : ""}`).join("; ")}
                        {g.items.filter((x: any) => x.rejectPhoto).map((x: any) => <a key={x.id} href={mediaUrl(x.rejectPhoto)} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>ảnh {x.item.name}</a>)}
                        {g.note ? ` · ${g.note}` : ""}
                      </div>
                    ))}
                  </div>
                )}
                {po.status === "CLOSED" && po.closeNote && <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--muted)" }}>Quán đã đóng đơn: {po.closeNote}</div>}
              </motion.div>
            ))}
          </div>
        )}
        {tab === "returns" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <p style={{ margin: 0, color: "var(--muted)" }}>Hàng quán trả lại sau khi đã nhập kho. Vui lòng xác nhận, hoặc khiếu nại kèm lý do.</p>
            {returns.length === 0 ? <p style={{ color: "var(--muted)" }}>Không có phiếu trả hàng nào.</p> : returns.map((t) => (
              <div key={t.id} style={{ background: "var(--surface2)", padding: "1.25rem", borderRadius: 8, border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                  <div>
                    <h3 style={{ margin: "0 0 0.25rem", color: "var(--accent)" }}>{t.code}</h3>
                    <div style={{ fontSize: "0.9rem", color: "var(--muted)" }}>{t.store.name}{t.po ? ` · ${t.po.code}` : ""} · {new Date(t.approvedAt ?? t.createdAt).toLocaleDateString("vi-VN")}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700 }}>{t.amount.toLocaleString()} đ</div>
                    <div style={{ fontSize: "0.85rem" }}>{RESOLUTION_LABEL[t.resolution] ?? t.resolution}</div>
                    {t.supplierStatus && <div style={{ fontSize: "0.85rem", color: t.supplierStatus === "DISPUTED" ? "var(--danger)" : "#047857" }}>{SUPPLIER_STATUS[t.supplierStatus]}</div>}
                  </div>
                </div>
                <ul style={{ margin: "0.75rem 0 0", paddingLeft: "1.1rem", fontSize: "0.9rem" }}>
                  {t.items.map((i: any) => (
                    <li key={i.id}>
                      {i.qty} {i.item.unit ?? ""} {i.item.name} — {REJECT_REASON[i.reason] ?? i.reason}
                      {i.photoUrl && <> · <a href={mediaUrl(i.photoUrl)} target="_blank" rel="noreferrer">ảnh</a></>}
                    </li>
                  ))}
                </ul>
                {t.note && <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.5rem" }}>Ghi chú của quán: {t.note}</div>}
                {t.supplierNote && <div style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>Phản hồi của bạn: {t.supplierNote}</div>}
                {!t.supplierStatus && (
                  <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "1rem" }}>
                    <button className="secondary-btn" onClick={() => void respondReturn(t, "DISPUTE")}>Khiếu nại</button>
                    <button className="primary-btn" onClick={() => void respondReturn(t, "CONFIRM")}>Xác nhận</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {tab === "bills" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              Tổng quán còn nợ: <strong style={{ color: "var(--text)" }}>{bills.reduce((s, b) => s + (b.status === "PAID" ? 0 : b.remaining), 0).toLocaleString()} đ</strong>
            </p>
            {bills.length === 0 ? <p style={{ color: "var(--muted)" }}>Chưa có công nợ.</p> : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--muted)" }}>
                    <th style={{ padding: "0.5rem" }}>Mã</th>
                    <th style={{ padding: "0.5rem" }}>Chi nhánh</th>
                    <th style={{ padding: "0.5rem" }}>Chứng từ</th>
                    <th style={{ padding: "0.5rem" }}>Hạn trả</th>
                    <th style={{ padding: "0.5rem", textAlign: "right" }}>Số tiền</th>
                    <th style={{ padding: "0.5rem", textAlign: "right" }}>Đã thanh toán</th>
                    <th style={{ padding: "0.5rem", textAlign: "right" }}>Trừ hàng trả</th>
                    <th style={{ padding: "0.5rem", textAlign: "right" }}>Còn lại</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((b) => (
                    <tr key={b.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.5rem" }}>{b.code}</td>
                      <td style={{ padding: "0.5rem" }}>{b.store.name}</td>
                      <td style={{ padding: "0.5rem" }}>{b.grn ? `${b.grn.po.code} / ${b.grn.code}` : (b.note ?? "Hoá đơn")}</td>
                      <td style={{ padding: "0.5rem" }}>{new Date(b.dueDate).toLocaleDateString("vi-VN")}</td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>{b.amount.toLocaleString()} đ</td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>{b.paidAmount.toLocaleString()} đ</td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>{b.creditApplied ? `${b.creditApplied.toLocaleString()} đ` : "—"}</td>
                      <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: 600, color: b.status === "PAID" ? "#047857" : "var(--text)" }}>{b.status === "PAID" ? "Đã tất toán" : `${b.remaining.toLocaleString()} đ`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
