import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle, CheckCircle2, ClipboardList, Coffee, FileText, Image as ImageIcon, LogOut, Package, PackageCheck,
  RefreshCw, Send, Truck, Undo2, Wallet,
} from "lucide-react";
import { apiBase, mediaUrl } from "../lib/api";
import { REJECT_REASON, RESOLUTION_LABEL, SUPPLIER_STATUS } from "../lib/supplierReturns";
import { PasswordInput } from "../components/PasswordInput";
import "../styles/supplierPortal.css";

type Tab = "rfq" | "orders" | "bills" | "returns";
type Me = { id: number; name: string; phone: string | null; email: string | null; address: string | null; paymentTermDays: number };

const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")} đ`;
const dateVi = (d: string) => new Date(d).toLocaleDateString("vi-VN");

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Chào buổi sáng";
  if (h < 14) return "Chào buổi trưa";
  if (h < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

const PO_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: "Chờ giao", tone: "amber" },
  RECEIVING: { label: "Quán đang nhận", tone: "blue" },
  PARTIAL: { label: "Đã giao một phần", tone: "blue" },
  DELIVERED: { label: "Đã giao đủ", tone: "green" },
  CLOSED: { label: "Đã đóng", tone: "gray" },
};
const BILL_STATUS: Record<string, { label: string; tone: string }> = {
  UNPAID: { label: "Chưa thanh toán", tone: "amber" },
  PARTIAL: { label: "Đã trả một phần", tone: "blue" },
  PAID: { label: "Đã tất toán", tone: "green" },
};

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`sp-pill sp-pill-${tone}`}>{children}</span>;
}

function Empty({ icon: Icon, title, hint }: { icon: typeof Package; title: string; hint?: string }) {
  return (
    <div className="sp-empty">
      <div className="sp-empty-icon"><Icon size={28} /></div>
      <strong>{title}</strong>
      {hint && <span>{hint}</span>}
    </div>
  );
}

function Proof({ url, label }: { url: string; label: string }) {
  return (
    <a className="sp-proof" href={mediaUrl(url)} target="_blank" rel="noreferrer" title={label}>
      <img src={mediaUrl(url)} alt={label} />
      <span>{label}</span>
    </a>
  );
}

export function SupplierPortal() {
  const [token, setToken] = useState(localStorage.getItem("supplierToken"));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [tab, setTab] = useState<Tab>("rfq");

  const [me, setMe] = useState<Me | null>(null);
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [quotingRfqId, setQuotingRfqId] = useState<number | null>(null);
  const [quotePrices, setQuotePrices] = useState<Record<number, string>>({});

  const logout = useCallback(() => {
    localStorage.removeItem("supplierToken");
    setToken(null);
    setMe(null);
  }, []);

  const get = useCallback(async (path: string) => {
    const res = await fetch(`${apiBase()}/api/supplier/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Unauthorized");
    return res.json();
  }, [token]);

  // Tải tất cả một lần → số liệu tổng quan + badge trên tab luôn đúng
  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [m, r, o, b, t] = await Promise.all([get("me"), get("rfqs"), get("orders"), get("bills"), get("returns")]);
      setMe(m); setRfqs(r); setOrders(o); setBills(b); setReturns(t);
    } catch {
      logout();
    } finally {
      setLoading(false);
    }
  }, [token, get, logout]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoggingIn(true);
    try {
      const res = await fetch(`${apiBase()}/api/supplier/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(res.status === 401 ? "Sai tên đăng nhập hoặc mật khẩu." : data.error || "Đăng nhập thất bại");
      localStorage.setItem("supplierToken", data.token);
      setToken(data.token);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoggingIn(false);
    }
  }

  async function submitQuote(rfqId: number, items: any[]) {
    const missing = items.filter((i) => !(Number(quotePrices[i.itemId]) > 0));
    if (missing.length && !window.confirm(`Chưa nhập giá cho: ${missing.map((i) => i.item.name).join(", ")}. Vẫn gửi (các món này tính 0đ)?`)) return;
    try {
      const res = await fetch(`${apiBase()}/api/supplier/rfqs/${rfqId}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items: items.map((i) => ({ itemId: i.itemId, unitPrice: Number(quotePrices[i.itemId]) || 0 })) }),
      });
      if (!res.ok) throw new Error("Gửi báo giá thất bại");
      setQuotingRfqId(null);
      setQuotePrices({});
      void loadAll();
    } catch (e: any) {
      alert(e.message);
    }
  }

  function startQuote(rfq: any) {
    // Cập nhật báo giá: điền sẵn giá đã gửi
    const prev: Record<number, string> = {};
    for (const qi of rfq.myQuote?.items ?? []) prev[qi.itemId] = String(qi.unitPrice);
    setQuotePrices(prev);
    setQuotingRfqId(rfq.id);
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
    void loadAll();
  }

  const stats = useMemo(() => {
    const unpaid = bills.filter((b) => b.status !== "PAID");
    return {
      rfqWaiting: rfqs.filter((r) => !r.hasQuoted).length,
      ordersOpen: orders.filter((o) => o.status === "PENDING" || o.status === "PARTIAL" || o.status === "RECEIVING").length,
      owed: unpaid.reduce((s, b) => s + b.remaining, 0),
      overdue: unpaid.filter((b) => new Date(b.dueDate) < new Date()).length,
      returnsWaiting: returns.filter((t) => !t.supplierStatus).length,
    };
  }, [rfqs, orders, bills, returns]);

  /* ═══════════ Đăng nhập ═══════════ */
  if (!token) {
    return (
      <div className="sp sp-login">
        <div className="sp-login-hero">
          <div className="sp-brand"><Coffee size={22} /> TD Coffee</div>
          <h1>Cổng nhà cung cấp</h1>
          <p>Nơi đối tác nhận yêu cầu báo giá, theo dõi đơn đặt hàng, công nợ và hàng trả lại — minh bạch, có chứng từ đầy đủ.</p>
          <ul>
            <li><FileText size={18} /> Báo giá trực tuyến</li>
            <li><Truck size={18} /> Theo dõi đơn & lịch giao bù</li>
            <li><Wallet size={18} /> Công nợ kèm ảnh biên nhận</li>
          </ul>
          <div className="sp-blob sp-blob-1" />
          <div className="sp-blob sp-blob-2" />
        </div>
        <div className="sp-login-panel">
          <motion.form onSubmit={login} className="sp-login-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <div className="sp-login-icon"><Package size={26} /></div>
            <h2>Xin chào đối tác 👋</h2>
            <p className="sp-muted">Đăng nhập bằng tài khoản quán đã cấp cho bạn.</p>
            {error && <div className="sp-alert"><AlertTriangle size={16} /> {error}</div>}
            <label>
              <span>Tên đăng nhập</span>
              <input className="sp-input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required autoFocus />
            </label>
            <label>
              <span>Mật khẩu</span>
              <PasswordInput className="sp-input" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <button className="sp-btn sp-btn-primary sp-btn-block" type="submit" disabled={loggingIn}>
              {loggingIn ? "Đang đăng nhập…" : "Đăng nhập"}
            </button>
            <p className="sp-muted sp-small">Quên mật khẩu? Liên hệ bộ phận mua hàng của quán để được cấp lại.</p>
            <a href="/staff/login" className="sp-staff-link">Nhân viên quán? Đăng nhập hệ thống nội bộ →</a>
          </motion.form>
        </div>
      </div>
    );
  }

  const TABS: { id: Tab; label: string; icon: typeof Package; badge: number }[] = [
    { id: "rfq", label: "Yêu cầu báo giá", icon: FileText, badge: stats.rfqWaiting },
    { id: "orders", label: "Đơn đặt hàng", icon: Truck, badge: stats.ordersOpen },
    { id: "bills", label: "Công nợ", icon: Wallet, badge: stats.overdue },
    { id: "returns", label: "Hàng trả lại", icon: Undo2, badge: stats.returnsWaiting },
  ];

  /* ═══════════ Trang chính ═══════════ */
  return (
    <div className="sp">
      <header className="sp-top">
        <div className="sp-brand"><Coffee size={20} /> TD Coffee <span className="sp-brand-sub">· Cổng NCC</span></div>
        <div className="sp-top-actions">
          <button className="sp-icon-btn" onClick={() => void loadAll()} title="Tải lại" aria-label="Tải lại">
            <RefreshCw size={18} className={loading ? "sp-spin" : undefined} />
          </button>
          <button className="sp-icon-btn" onClick={logout} title="Đăng xuất" aria-label="Đăng xuất"><LogOut size={18} /></button>
        </div>
      </header>

      <main className="sp-main">
        <motion.section className="sp-hello" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div>
            <div className="sp-hello-kicker">{greeting()},</div>
            <h1>{me?.name ?? "Nhà cung cấp"} 👋</h1>
            <p>
              {stats.rfqWaiting > 0
                ? `Bạn có ${stats.rfqWaiting} yêu cầu báo giá đang chờ phản hồi.`
                : stats.ordersOpen > 0
                  ? `Có ${stats.ordersOpen} đơn đặt hàng đang chờ giao.`
                  : "Mọi việc đã xong — cảm ơn bạn đã đồng hành cùng quán!"}
            </p>
          </div>
          {me && (
            <div className="sp-hello-meta">
              {me.phone && <span>☎ {me.phone}</span>}
              <span>Kỳ hạn thanh toán: {me.paymentTermDays} ngày</span>
            </div>
          )}
        </motion.section>

        <section className="sp-stats">
          <button className="sp-stat sp-stat-amber" onClick={() => setTab("rfq")}>
            <span className="sp-stat-icon"><ClipboardList size={20} /></span>
            <span className="sp-stat-label">Chờ báo giá</span>
            <strong>{stats.rfqWaiting}</strong>
          </button>
          <button className="sp-stat sp-stat-blue" onClick={() => setTab("orders")}>
            <span className="sp-stat-icon"><Truck size={20} /></span>
            <span className="sp-stat-label">Đơn chờ giao</span>
            <strong>{stats.ordersOpen}</strong>
          </button>
          <button className="sp-stat sp-stat-green" onClick={() => setTab("bills")}>
            <span className="sp-stat-icon"><Wallet size={20} /></span>
            <span className="sp-stat-label">Quán còn nợ</span>
            <strong>{vnd(stats.owed)}</strong>
            {stats.overdue > 0 && <em>{stats.overdue} khoản quá hạn</em>}
          </button>
          <button className="sp-stat sp-stat-violet" onClick={() => setTab("returns")}>
            <span className="sp-stat-icon"><Undo2 size={20} /></span>
            <span className="sp-stat-label">Hàng trả chờ xác nhận</span>
            <strong>{stats.returnsWaiting}</strong>
          </button>
        </section>

        <nav className="sp-tabs" role="tablist">
          {TABS.map(({ id, label, icon: Icon, badge }) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`sp-tab${tab === id ? " is-on" : ""}`} onClick={() => setTab(id)}>
              <Icon size={17} /> {label}
              {badge > 0 && <span className="sp-tab-badge">{badge}</span>}
            </button>
          ))}
        </nav>

        {/* ── Yêu cầu báo giá ── */}
        {tab === "rfq" && (
          <div className="sp-list">
            {rfqs.length === 0 ? <Empty icon={FileText} title="Chưa có yêu cầu báo giá mới" hint="Khi quán cần hàng, yêu cầu sẽ hiện ở đây." /> : rfqs.map((rfq) => {
              const quoting = quotingRfqId === rfq.id;
              const items = rfq.requisition.items;
              const total = items.reduce((s: number, i: any) => {
                const price = quoting ? Number(quotePrices[i.itemId]) || 0 : rfq.myQuote?.items?.find((q: any) => q.itemId === i.itemId)?.unitPrice ?? 0;
                return s + price * i.qty;
              }, 0);
              return (
                <motion.article key={rfq.id} className={`sp-card${rfq.hasQuoted ? "" : " sp-card-accent-amber"}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="sp-card-head">
                    <div>
                      <h3>{rfq.code}</h3>
                      <div className="sp-muted sp-small">
                        {rfq.requisition.store?.name ?? ""}{rfq.requisition.store?.name ? " · " : ""}Đề xuất {rfq.requisition.code} · {dateVi(rfq.createdAt)}
                      </div>
                    </div>
                    {rfq.hasQuoted ? <Pill tone="green"><CheckCircle2 size={14} /> Đã báo giá</Pill> : <Pill tone="amber">Chờ báo giá</Pill>}
                  </div>
                  <div className="sp-table-wrap">
                    <table className="sp-table">
                      <thead><tr><th>Mặt hàng</th><th className="num">Số lượng</th><th className="num">Đơn giá</th><th className="num">Thành tiền</th></tr></thead>
                      <tbody>
                        {items.map((i: any) => {
                          const sent = rfq.myQuote?.items?.find((q: any) => q.itemId === i.itemId)?.unitPrice;
                          const price = quoting ? Number(quotePrices[i.itemId]) || 0 : sent ?? 0;
                          return (
                            <tr key={i.id}>
                              <td data-label="Mặt hàng"><strong>{i.item.name}</strong></td>
                              <td data-label="Số lượng" className="num">{i.qty} {i.item.unit}</td>
                              <td data-label="Đơn giá" className="num">
                                {quoting ? (
                                  <input type="number" inputMode="numeric" min={0} className="sp-input sp-input-sm" value={quotePrices[i.itemId] ?? ""}
                                    onChange={(e) => setQuotePrices((p) => ({ ...p, [i.itemId]: e.target.value }))} placeholder="VD 120000" />
                                ) : sent != null ? vnd(sent) : "—"}
                              </td>
                              <td data-label="Thành tiền" className="num">{price ? vnd(price * i.qty) : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="sp-card-foot">
                    <div className="sp-total">Tổng báo giá: <strong>{total ? vnd(total) : "—"}</strong></div>
                    {quoting ? (
                      <div className="sp-actions">
                        <button className="sp-btn" onClick={() => setQuotingRfqId(null)}>Hủy</button>
                        <button className="sp-btn sp-btn-primary" onClick={() => void submitQuote(rfq.id, items)}><Send size={16} /> Gửi báo giá</button>
                      </div>
                    ) : (
                      <button className={`sp-btn${rfq.hasQuoted ? "" : " sp-btn-primary"}`} onClick={() => startQuote(rfq)}>
                        {rfq.hasQuoted ? "Cập nhật báo giá" : "Nhập báo giá"}
                      </button>
                    )}
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}

        {/* ── Đơn đặt hàng ── */}
        {tab === "orders" && (
          <div className="sp-list">
            {orders.length === 0 ? <Empty icon={Truck} title="Chưa có đơn đặt hàng" hint="Khi quán chọn báo giá của bạn, đơn sẽ hiện ở đây." /> : orders.map((po) => {
              const st = PO_STATUS[po.status] ?? { label: po.status, tone: "gray" };
              const orderedQty = po.lines.reduce((s: number, l: any) => s + l.ordered, 0);
              const receivedQty = po.lines.reduce((s: number, l: any) => s + l.received, 0);
              const pct = orderedQty ? Math.min(100, Math.round((receivedQty / orderedQty) * 100)) : 0;
              return (
                <motion.article key={po.id} className={`sp-card sp-card-accent-${st.tone}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="sp-card-head">
                    <div>
                      <h3>{po.code}</h3>
                      <div className="sp-muted sp-small">{po.store?.name}{po.store?.address ? ` · ${po.store.address}` : ""} · {dateVi(po.createdAt)}</div>
                    </div>
                    <div className="sp-right">
                      <Pill tone={st.tone}>{st.label}</Pill>
                      <div className="sp-amount">{vnd(po.totalAmount)}</div>
                    </div>
                  </div>
                  <div className="sp-progress" aria-label={`Đã giao ${pct}%`}>
                    <div style={{ width: `${pct}%` }} />
                  </div>
                  <div className="sp-muted sp-small" style={{ marginBottom: "0.6rem" }}>Đã giao {pct}%</div>
                  <div className="sp-table-wrap">
                    <table className="sp-table">
                      <thead><tr><th>Mặt hàng</th><th className="num">Đặt</th><th className="num">Đơn giá</th><th className="num">Đã nhận</th><th className="num">Bị trả</th><th className="num">Còn phải giao</th></tr></thead>
                      <tbody>
                        {po.lines.map((l: any) => (
                          <tr key={l.itemId}>
                            <td data-label="Mặt hàng"><strong>{l.name}</strong></td>
                            <td data-label="Đặt" className="num">{l.ordered} {l.unit}</td>
                            <td data-label="Đơn giá" className="num">{vnd(l.unitPrice)}</td>
                            <td data-label="Đã nhận" className="num">{l.received || "—"}</td>
                            <td data-label="Bị trả" className={`num${l.rejected ? " sp-red" : ""}`}>{l.rejected || "—"}</td>
                            <td data-label="Còn phải giao" className={`num${l.remaining > 0 ? " sp-amber" : ""}`}>
                              {l.remaining || "—"}
                              {l.remaining > 0 && l.backorderDate && <div className="sp-small">Hẹn giao bù {dateVi(l.backorderDate)}</div>}
                              {l.cancelled > 0 && <div className="sp-small sp-muted">Quán đã hủy {l.cancelled}</div>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {po.receipts.length > 0 && (
                    <div className="sp-timeline">
                      {po.receipts.map((g: any) => (
                        <div key={g.id} className="sp-timeline-row">
                          <span className="sp-dot"><PackageCheck size={14} /></span>
                          <div>
                            <div><strong>{g.code}</strong> · {dateVi(g.createdAt)}</div>
                            <div className="sp-small sp-muted">
                              {g.items.filter((x: any) => x.receivedQty || x.rejectedQty).map((x: any) => `${x.item.name} nhận ${x.receivedQty}${x.rejectedQty ? `, trả lại ${x.rejectedQty} (${REJECT_REASON[x.rejectReason] ?? x.rejectReason})` : ""}`).join("; ")}
                              {g.note ? ` · ${g.note}` : ""}
                            </div>
                            {(g.invoicePhoto || g.items.some((x: any) => x.rejectPhoto)) && (
                              <div className="sp-proofs">
                                {g.invoicePhoto && <Proof url={g.invoicePhoto} label="Hoá đơn giao hàng" />}
                                {g.items.filter((x: any) => x.rejectPhoto).map((x: any) => <Proof key={x.id} url={x.rejectPhoto} label={`Hàng lỗi: ${x.item.name}`} />)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {po.status === "CLOSED" && po.closeNote && <div className="sp-note">Quán đã đóng đơn: {po.closeNote}</div>}
                </motion.article>
              );
            })}
          </div>
        )}

        {/* ── Công nợ ── */}
        {tab === "bills" && (
          <div className="sp-list">
            {bills.length === 0 ? <Empty icon={Wallet} title="Chưa có công nợ" /> : bills.map((b) => {
              const overdue = b.status !== "PAID" && new Date(b.dueDate) < new Date();
              const st = overdue ? { label: "Quá hạn", tone: "red" } : BILL_STATUS[b.status] ?? { label: b.status, tone: "gray" };
              const paidPct = b.amount ? Math.min(100, Math.round(((b.paidAmount + b.creditApplied) / b.amount) * 100)) : 0;
              return (
                <motion.article key={b.id} className={`sp-card sp-card-accent-${st.tone}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="sp-card-head">
                    <div>
                      <h3>{b.code}</h3>
                      <div className="sp-muted sp-small">
                        {b.store.name} · {b.grn ? `${b.grn.po.code} / ${b.grn.code}` : b.note ?? "Hoá đơn"} · hạn trả <strong className={overdue ? "sp-red" : undefined}>{dateVi(b.dueDate)}</strong>
                      </div>
                    </div>
                    <div className="sp-right">
                      <Pill tone={st.tone}>{st.label}</Pill>
                      <div className="sp-amount">{b.status === "PAID" ? vnd(b.amount) : vnd(b.remaining)}</div>
                      {b.status !== "PAID" && <div className="sp-small sp-muted">còn lại / {vnd(b.amount)}</div>}
                    </div>
                  </div>
                  <div className="sp-progress sp-progress-green"><div style={{ width: `${paidPct}%` }} /></div>
                  <div className="sp-bill-nums">
                    <span>Đã trả <strong>{vnd(b.paidAmount)}</strong></span>
                    {b.creditApplied > 0 && <span>Trừ hàng trả <strong>{vnd(b.creditApplied)}</strong></span>}
                  </div>
                  {(b.photoUrl || b.payments?.length > 0) && (
                    <div className="sp-proofs">
                      {b.photoUrl && <Proof url={b.photoUrl} label="Hoá đơn" />}
                      {b.payments?.map((p: any) => p.attachmentUrl ? (
                        <Proof key={p.id} url={p.attachmentUrl} label={`${p.fromFund === "BANK" ? "CK" : "Tiền mặt"} ${vnd(p.amount)} · ${dateVi(p.createdAt)}`} />
                      ) : (
                        <span key={p.id} className="sp-proof sp-proof-none"><ImageIcon size={16} /> {vnd(p.amount)} · {dateVi(p.createdAt)}</span>
                      ))}
                    </div>
                  )}
                </motion.article>
              );
            })}
          </div>
        )}

        {/* ── Hàng trả lại ── */}
        {tab === "returns" && (
          <div className="sp-list">
            <p className="sp-muted sp-intro">Hàng quán trả lại sau khi đã nhập kho. Vui lòng xác nhận, hoặc khiếu nại kèm lý do.</p>
            {returns.length === 0 ? <Empty icon={Undo2} title="Không có phiếu trả hàng" /> : returns.map((t) => (
              <motion.article key={t.id} className={`sp-card${t.supplierStatus ? "" : " sp-card-accent-violet"}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div className="sp-card-head">
                  <div>
                    <h3>{t.code}</h3>
                    <div className="sp-muted sp-small">{t.store.name}{t.po ? ` · ${t.po.code}` : ""} · {dateVi(t.approvedAt ?? t.createdAt)}</div>
                  </div>
                  <div className="sp-right">
                    {t.supplierStatus
                      ? <Pill tone={t.supplierStatus === "DISPUTED" ? "red" : "green"}>{SUPPLIER_STATUS[t.supplierStatus]}</Pill>
                      : <Pill tone="violet">Chờ bạn xác nhận</Pill>}
                    <div className="sp-amount">{vnd(t.amount)}</div>
                    <div className="sp-small sp-muted">{RESOLUTION_LABEL[t.resolution] ?? t.resolution}</div>
                  </div>
                </div>
                <ul className="sp-items">
                  {t.items.map((i: any) => (
                    <li key={i.id}>
                      <span><strong>{i.qty} {i.item.unit ?? ""} {i.item.name}</strong> — {REJECT_REASON[i.reason] ?? i.reason}</span>
                      {i.photoUrl && <Proof url={i.photoUrl} label="Ảnh" />}
                    </li>
                  ))}
                </ul>
                {t.note && <div className="sp-note">Ghi chú của quán: {t.note}</div>}
                {t.supplierNote && <div className="sp-note">Phản hồi của bạn: {t.supplierNote}</div>}
                {!t.supplierStatus && (
                  <div className="sp-card-foot sp-card-foot-end">
                    <button className="sp-btn sp-btn-danger" onClick={() => void respondReturn(t, "DISPUTE")}>Khiếu nại</button>
                    <button className="sp-btn sp-btn-primary" onClick={() => void respondReturn(t, "CONFIRM")}><CheckCircle2 size={16} /> Xác nhận</button>
                  </div>
                )}
              </motion.article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
