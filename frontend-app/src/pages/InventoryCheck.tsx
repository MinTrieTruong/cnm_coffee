import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getStaffInfo, staffApi } from "../lib/staffApi";

type InvItem = {
  id: number;
  name: string;
  skuCode: string | null;
  unit: string | null;
  stockQty: number;
  minLevel: number;
  imageUrl: string | null;
};

type CheckEntry = { itemId: number; qty: string; note: string };

type MyRequest = {
  id: number;
  itemId: number;
  requestQty: number;
  type: string;
  status: string;
  note: string | null;
  createdAt: string;
  approvedAt: string | null;
  item: { name: string; unit: string | null };
  approvedBy: { fullName: string } | null;
};

type LogEntry = {
  id: number;
  itemId: number;
  checkType: string;
  qty: number;
  note: string | null;
  checkedAt: string;
  item: { name: string; unit: string | null };
};

type Tab = "check" | "request" | "log";

function statusColor(s: string) {
  if (s === "Pending") return "#f59e0b";
  if (s === "Approved") return "#22c55e";
  return "#ef4444";
}
function statusLabel(s: string) {
  if (s === "Pending") return "Chờ duyệt";
  if (s === "Approved") return "Đã duyệt";
  return "Từ chối";
}
function stockLevel(qty: number, min: number): "ok" | "low" | "out" {
  if (qty <= 0) return "out";
  if (qty < min) return "low";
  return "ok";
}
function stockDot(level: ReturnType<typeof stockLevel>) {
  if (level === "ok") return { color: "#22c55e", label: "Đủ hàng" };
  if (level === "low") return { color: "#f59e0b", label: "Sắp hết" };
  return { color: "#ef4444", label: "Hết hàng" };
}

export function InventoryCheck() {
  // Dùng useState để tránh tạo object mới mỗi render (gây infinite loop)
  const [info] = useState(() => getStaffInfo());
  const [tab, setTab] = useState<Tab>("check");
  const [items, setItems] = useState<InvItem[]>([]);
  const [checks, setChecks] = useState<CheckEntry[]>([]);
  const [checkType, setCheckType] = useState<"open" | "close">("open");
  const [myRequests, setMyRequests] = useState<MyRequest[]>([]);
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [receipts, setReceipts] = useState<{
    id: number; qty: number; source: string; note: string | null;
    receivedAt: string; receivedById: number;
    item: { name: string; unit: string | null };
    receivedBy: { fullName: string };
    request: { id: number; type: string } | null;
  }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Form tạo phiếu nhập hàng — giỏ nhiều món
  type CartLine = { itemId: number; qty: string; note: string };
  const [cart, setCart] = useState<CartLine[]>([]);
  const [reqNote, setReqNote] = useState("");
  const [addItemId, setAddItemId] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const loadItems = useCallback(async () => {
    const data = await staffApi<InvItem[]>("/api/shifts/inventory");
    setItems(data);
    setChecks(data.map((it) => ({ itemId: it.id, qty: "", note: "" })));
  }, []);

  const loadMyRequests = useCallback(async () => {
    const data = await staffApi<MyRequest[]>("/api/staff/inventory/requests");
    setMyRequests(data);
  }, []);

  const loadLogs = useCallback(async (date: string) => {
    const data = await staffApi<{ date: string; logs: LogEntry[] }>(`/api/shifts/inventory/log?date=${date}`);
    setLogs(data.logs);
    // Load receipts cùng ngày (chỉ admin mới thấy)
    try {
      const recs = await staffApi<typeof receipts>(`/api/admin/receipts?date=${date}`);
      setReceipts(recs);
    } catch { setReceipts([]); }
  }, []);

  useEffect(() => {
    if (!info) return;
    (async () => {
      try {
        setErr(null);
        if (tab === "check") await loadItems();
        if (tab === "request") { await loadItems(); await loadMyRequests(); }
        if (tab === "log") await loadLogs(logDate);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]); // chỉ re-fetch khi đổi tab, không phụ thuộc info (tảnh mõi render)

  if (!info) {
    return (
      <div className="staff-page-inner">
        <p style={{ color: "#5c534c" }}>Cần đăng nhập nhân sự.</p>
        <Link to="/staff/login" className="btn btn-primary">Đăng nhập</Link>
      </div>
    );
  }

  if (info.role !== "Kitchen" && info.role !== "Admin") {
    return (
      <div className="staff-page-inner">
        <h1 className="page-title">Kiểm kho</h1>
        <p style={{ color: "#5c534c" }}>Trang này chỉ dành cho pha chế và quản lý.</p>
        <Link to="/staff/login" className="btn btn-ghost staff-btn-light">← Quay lại</Link>
      </div>
    );
  }

  const backLink = info.role === "Kitchen" ? "/kds" : "/admin";
  const backLabel = info.role === "Kitchen" ? "← Pha chế" : "← Quản trị";

  async function submitCheck() {
    const filled = checks.filter((c) => c.qty !== "" && !isNaN(Number(c.qty)));
    if (filled.length === 0) {
      setErr("Nhập số lượng thực tế cho ít nhất 1 nguyên liệu.");
      return;
    }
    setBusy(true);
    try {
      await staffApi("/api/shifts/inventory/check", {
        method: "POST",
        body: JSON.stringify({
          checkType,
          items: filled.map((c) => ({
            itemId: c.itemId,
            qty: Number(c.qty),
            note: c.note.trim() || undefined,
          })),
        }),
      });
      showToast(`✓ Đã lưu kiểm kho ${checkType === "open" ? "mở ca" : "kết ca"} (${filled.length} nguyên liệu)`);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi lưu kiểm kho");
    } finally {
      setBusy(false);
    }
  }

  function addToCart() {
    const id = Number(addItemId);
    if (!id) { setErr("Chọn nguyên liệu trước."); return; }
    if (cart.find((c) => c.itemId === id)) { setErr("Nguyên liệu đã có trong phiếu."); return; }
    setCart((prev) => [...prev, { itemId: id, qty: "1", note: "" }]);
    setAddItemId("");
    setErr(null);
  }

  async function submitRequest() {
    const valid = cart.filter((c) => Number(c.qty) > 0);
    if (valid.length === 0) { setErr("Thêm ít nhất 1 nguyên liệu vào phiếu."); return; }
    setBusy(true);
    try {
      await staffApi("/api/staff/inventory/requests", {
        method: "POST",
        body: JSON.stringify({
          items: valid.map((c) => ({ itemId: c.itemId, requestQty: Number(c.qty), note: c.note.trim() || undefined })),
          note: reqNote.trim() || undefined,
        }),
      });
      setCart([]); setReqNote("");
      showToast("Phếu nhập hàng đã gửi. Chờ admin duyệt.");
      setErr(null);
      await loadMyRequests();
    } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi gửi phiếu"); }
    finally { setBusy(false); }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "check", label: "Kiểm kho" },
    { id: "request", label: "Phiếu nhập hàng" },
    { id: "log", label: "Lịch sử ca" },
  ];

  return (
    <div className="staff-page-inner staff-page-wide">
      {/* Header */}
      <div className="staff-page-head">
        <h1 className="page-title" style={{ margin: 0 }}>Kiểm kho</h1>
        <Link to={backLink} className="btn btn-ghost staff-btn-light">{backLabel}</Link>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: "1.25rem", right: "1.25rem",
          background: "var(--card)", border: "1px solid var(--border)",
          padding: "0.75rem 1rem", borderRadius: "12px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.35)", zIndex: 50,
          maxWidth: 360, fontSize: "0.92rem",
        }}>
          {toast}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1.25rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? "btn btn-primary" : "btn btn-ghost"}
            style={{ padding: "0.4rem 1rem", fontSize: "0.9rem" }}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {err && <p style={{ color: "var(--danger)", marginBottom: "0.75rem" }}>{err}</p>}

      {/* ── Tab 1: Kiểm kho ── */}
      {tab === "check" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Chọn loại kiểm kho */}
          <div className="card" style={{ padding: "1rem", display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600 }}>Loại kiểm kho:</span>
            {(["open", "close"] as const).map((ct) => (
              <label key={ct} style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="checkType"
                  value={ct}
                  checked={checkType === ct}
                  onChange={() => setCheckType(ct)}
                />
                <span style={{ fontWeight: checkType === ct ? 700 : 400, color: checkType === ct ? "var(--accent)" : undefined }}>
                  {ct === "open" ? "Mở ca" : "Kết ca"}
                </span>
              </label>
            ))}
            <span className="subtle" style={{ fontSize: "0.83rem", marginLeft: "auto" }}>
              {items.length} nguyên liệu
            </span>
          </div>

          {/* Bảng kiểm kho */}
          {items.length === 0 && <p className="subtle">Không có nguyên liệu nào trong kho.</p>}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: "0.5rem 0.6rem" }}>Nguyên liệu</th>
                  <th style={{ padding: "0.5rem 0.6rem", textAlign: "right" }}>Tồn kho (hệ thống)</th>
                  <th style={{ padding: "0.5rem 0.6rem", textAlign: "right" }}>Mức tối thiểu</th>
                  <th style={{ padding: "0.5rem 0.6rem" }}>Trạng thái</th>
                  <th style={{ padding: "0.5rem 0.6rem", minWidth: 130 }}>Thực tế đếm được</th>
                  <th style={{ padding: "0.5rem 0.6rem", minWidth: 160 }}>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const level = stockLevel(item.stockQty, item.minLevel);
                  const dot = stockDot(level);
                  const check = checks[idx] ?? { itemId: item.id, qty: "", note: "" };
                  const actualQty = check.qty !== "" ? Number(check.qty) : null;
                  const diff = actualQty !== null ? actualQty - item.stockQty : null;
                  return (
                    <tr key={item.id} style={{ borderBottom: "1px solid var(--border)", transition: "background 0.15s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                      <td style={{ padding: "0.5rem 0.6rem", fontWeight: 600 }}>
                        {item.name}
                        {item.unit && <span className="subtle" style={{ fontWeight: 400, marginLeft: "0.3rem" }}>({item.unit})</span>}
                      </td>
                      <td style={{ padding: "0.5rem 0.6rem", textAlign: "right", fontWeight: 700 }}>
                        {item.stockQty.toLocaleString("vi-VN")}
                      </td>
                      <td style={{ padding: "0.5rem 0.6rem", textAlign: "right", color: "var(--muted)" }}>
                        {item.minLevel.toLocaleString("vi-VN")}
                      </td>
                      <td style={{ padding: "0.5rem 0.6rem" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: "0.35rem",
                          padding: "0.2rem 0.6rem", borderRadius: 99,
                          fontSize: "0.8rem", fontWeight: 600,
                          background: dot.color + "22", color: dot.color,
                          border: `1px solid ${dot.color}44`,
                        }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot.color, display: "inline-block" }} />
                          {dot.label}
                        </span>
                      </td>
                      <td style={{ padding: "0.5rem 0.6rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <input
                            type="number"
                            min={0}
                            className="input"
                            placeholder="Nhập SL..."
                            value={check.qty}
                            onChange={(e) => setChecks((prev) => prev.map((c, i) => i === idx ? { ...c, qty: e.target.value } : c))}
                            style={{ width: 90, padding: "0.3rem 0.5rem", fontSize: "0.88rem" }}
                          />
                          {diff !== null && (
                            <span style={{
                              fontSize: "0.8rem", fontWeight: 700,
                              color: diff === 0 ? "#22c55e" : diff > 0 ? "#3b82f6" : "#ef4444",
                            }}>
                              {diff > 0 ? `+${diff}` : diff}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "0.5rem 0.6rem" }}>
                        <input
                          type="text"
                          className="input"
                          placeholder="Ghi chú..."
                          value={check.note}
                          onChange={(e) => setChecks((prev) => prev.map((c, i) => i === idx ? { ...c, note: e.target.value } : c))}
                          style={{ width: "100%", padding: "0.3rem 0.5rem", fontSize: "0.88rem" }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void submitCheck()}
              style={{ padding: "0.6rem 1.5rem" }}
            >
              {busy ? "Đang lưu..." : checkType === "open" ? "Lưu kiểm kho mở ca" : "Lưu kiểm kho kết ca"}
            </button>
            <span className="subtle" style={{ fontSize: "0.83rem" }}>
              Chỉ ghi nhận nhật ký — không tự động thay đổi tồn kho hệ thống.
            </span>
          </div>
        </div>
      )}

      {/* ── Tab 2: Phiếu nhập hàng ── */}
      {tab === "request" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div className="card" style={{ padding: "1.25rem" }}>
            <h2 style={{ fontSize: "1rem", margin: "0 0 1rem" }}>Tạo phiếu nhập hàng</h2>

            {/* Thêm dòng */}
            <div style={{ display: "flex", gap: "0.6rem", marginBottom: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <label className="label">Chọn nguyên liệu</label>
                <select className="input" value={addItemId} onChange={(e) => setAddItemId(e.target.value)}>
                  <option value="">-- Chọn --</option>
                  {items.filter((it) => !cart.find((c) => c.itemId === it.id)).map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}{it.unit ? ` (${it.unit})` : ""} — tồn: {it.stockQty}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="btn btn-ghost staff-btn-light" onClick={addToCart} style={{ padding: "0.5rem 1rem" }}>
                Thêm vào phiếu
              </button>
            </div>

            {/* Giỏ các dòng */}
            {cart.length === 0 && (
              <p style={{ color: "#6b5e55", fontSize: "0.88rem", textAlign: "center", padding: "1rem 0" }}>Chưa có nguyên liệu nào trong phiếu.</p>
            )}
            {cart.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.75rem" }}>
                {cart.map((line, idx) => {
                  const it = items.find((x) => x.id === line.itemId);
                  return (
                    <div key={line.itemId} style={{ display: "flex", gap: "0.5rem", alignItems: "center", padding: "0.6rem 0.75rem", background: "#f9f6f2", borderRadius: 10, border: "1px solid #e5ddd5" }}>
                      <div style={{ flex: 2, fontWeight: 600, fontSize: "0.9rem", color: "#1a120d" }}>
                        {it?.name}
                        {it?.unit && <span style={{ fontWeight: 400, color: "#6b5e55", marginLeft: 4 }}>({it.unit})</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        <button type="button" className="btn btn-ghost staff-btn-light" style={{ padding: "0.2rem 0.6rem", fontSize: "1rem", lineHeight: 1 }}
                          onClick={() => setCart((prev) => prev.map((c, i) => i === idx ? { ...c, qty: String(Math.max(1, Number(c.qty) - 1)) } : c))}>
                          −
                        </button>
                        <input type="number" min={1} className="input" value={line.qty}
                          onChange={(e) => setCart((prev) => prev.map((c, i) => i === idx ? { ...c, qty: e.target.value } : c))}
                          style={{ width: 70, textAlign: "center", padding: "0.3rem 0.4rem", fontSize: "0.9rem" }} />
                        <button type="button" className="btn btn-ghost staff-btn-light" style={{ padding: "0.2rem 0.6rem", fontSize: "1rem", lineHeight: 1 }}
                          onClick={() => setCart((prev) => prev.map((c, i) => i === idx ? { ...c, qty: String(Number(c.qty) + 1) } : c))}>
                          +
                        </button>
                      </div>
                      <input type="text" className="input" placeholder="Ghi chú..." value={line.note}
                        onChange={(e) => setCart((prev) => prev.map((c, i) => i === idx ? { ...c, note: e.target.value } : c))}
                        style={{ flex: 2, padding: "0.3rem 0.5rem", fontSize: "0.85rem" }} />
                      <button type="button" className="btn btn-ghost staff-btn-light" style={{ padding: "0.25rem 0.6rem", color: "#c94c4c", fontSize: "0.85rem" }}
                        onClick={() => setCart((prev) => prev.filter((_, i) => i !== idx))}>
                        X
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="field" style={{ marginBottom: "0.75rem" }}>
              <label className="label" htmlFor="req-note">Ghi chú chung (tuỳ chọn)</label>
              <input id="req-note" type="text" className="input" placeholder="Lý do nhập, nhà cung cấp,..." value={reqNote} onChange={(e) => setReqNote(e.target.value)} />
            </div>

            <button type="button" className="btn btn-primary" disabled={busy || cart.length === 0} onClick={() => void submitRequest()} style={{ padding: "0.55rem 1.5rem" }}>
              {busy ? "Đang gửi..." : `Gửi phiếu (${cart.length} nguyên liệu)`}
            </button>
          </div>

          {/* Danh sách phiếu của mình */}
          <div>
            <h2 style={{ fontSize: "1rem", margin: "0 0 0.75rem" }}>Phếu đã tạo của tôi</h2>
            {myRequests.length === 0 && (
              <div className="card" style={{ padding: "2rem", textAlign: "center", color: "#6b5e55" }}>Chưa có phiếu nào.</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {myRequests.map((r) => (
                <div key={r.id} className="card" style={{ padding: "0.85rem 1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", alignItems: "flex-start" }}>
                    <div>
                      <span style={{ color: "#6b5e55", fontSize: "0.8rem" }}>Phiếu #{r.id} · {new Date(r.createdAt).toLocaleString("vi-VN")}</span>
                      <div style={{ fontWeight: 700, fontSize: "1rem", marginTop: "0.15rem" }}>{r.item.name}</div>
                      <div style={{ fontSize: "0.88rem", marginTop: "0.2rem" }}>Số lượng: <strong>{r.requestQty}</strong>{r.item.unit ? ` ${r.item.unit}` : ""}</div>
                      {r.note && <div style={{ fontSize: "0.85rem", color: "#6b5e55", fontStyle: "italic", marginTop: "0.15rem" }}>{r.note}</div>}
                      {r.approvedBy && r.status !== "Pending" && (
                        <div style={{ fontSize: "0.8rem", color: "#6b5e55", marginTop: "0.2rem" }}>
                          {r.status === "Approved" ? "Duyệt bởi" : "Từ chối bởi"}: {r.approvedBy.fullName}
                          {r.approvedAt && ` lúc ${new Date(r.approvedAt).toLocaleString("vi-VN")}`}
                        </div>
                      )}
                    </div>
                    <span style={{ padding: "0.25rem 0.75rem", borderRadius: 99, fontSize: "0.82rem", fontWeight: 600,
                      background: statusColor(r.status) + "22", color: statusColor(r.status), border: `1px solid ${statusColor(r.status)}44`, whiteSpace: "nowrap" }}>
                      {statusLabel(r.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab 3: Lịch sử ca ── */}
      {tab === "log" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* Date picker */}
          <div className="card" style={{ padding: "0.85rem 1rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <label className="label" htmlFor="log-date" style={{ margin: 0 }}>Ngày:</label>
            <input id="log-date" type="date" className="input" value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              style={{ width: 180 }} />
            <button type="button" className="btn btn-primary"
              onClick={() => void loadLogs(logDate)}
              style={{ padding: "0.4rem 1.1rem" }}>Xem</button>
            <button type="button" className="btn btn-ghost staff-btn-light"
              onClick={() => { const t = new Date().toISOString().slice(0,10); setLogDate(t); void loadLogs(t); }}
              style={{ padding: "0.4rem 1.1rem" }}>Hôm nay</button>
          </div>

          {/* Bảng tiêu thụ: mở ca - kết ca = đã dùng */}
          {(() => {
            const openLogs  = logs.filter(l => l.checkType === "open");
            const closeLogs = logs.filter(l => l.checkType === "close");
            const openMap: Record<number, LogEntry>  = {};
            const closeMap: Record<number, LogEntry> = {};
            openLogs.forEach(l  => { if (!openMap[l.itemId])  openMap[l.itemId]  = l; });
            closeLogs.forEach(l => { if (!closeMap[l.itemId]) closeMap[l.itemId] = l; });
            const allItemIds = [...new Set([...openLogs, ...closeLogs].map(l => l.itemId))];
            if (allItemIds.length === 0) return (
              <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
                Không có dữ liệu kiểm kho ngày {logDate}.
              </div>
            );
            return (
              <div>
                <h2 style={{ fontSize: "1rem", margin: "0 0 0.65rem" }}>Tổng hợp nguyên liệu đã dùng</h2>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                        {["Nguyên liệu", "ĐVT", "Mở ca", "Kết ca", "Đã dùng", "Thời gian mở", "Thời gian kết"].map(h => (
                          <th key={h} style={{ padding: "0.45rem 0.6rem", whiteSpace: "nowrap", color: "var(--muted)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allItemIds.map(id => {
                        const open  = openMap[id];
                        const close = closeMap[id];
                        const used  = (open && close) ? open.qty - close.qty : null;
                        return (
                          <tr key={id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "0.45rem 0.6rem", fontWeight: 600 }}>
                              {(open ?? close)!.item.name}
                            </td>
                            <td style={{ padding: "0.45rem 0.6rem", color: "var(--muted)" }}>
                              {(open ?? close)!.item.unit ?? "—"}
                            </td>
                            <td style={{ padding: "0.45rem 0.6rem", fontWeight: 700, color: "#f59e0b" }}>
                              {open ? open.qty : "—"}
                            </td>
                            <td style={{ padding: "0.45rem 0.6rem", fontWeight: 700, color: "#818cf8" }}>
                              {close ? close.qty : <span style={{ color: "#ef4444", fontStyle: "italic", fontWeight: 400 }}>Chưa kết ca</span>}
                            </td>
                            <td style={{ padding: "0.45rem 0.6rem", fontWeight: 700,
                              color: used === null ? "var(--muted)" : used > 0 ? "#22c55e" : used < 0 ? "#ef4444" : "var(--muted)" }}>
                              {used === null ? "—" : used > 0 ? `−${used}` : used < 0 ? `+${Math.abs(used)} (lạ)` : "0"}
                            </td>
                            <td style={{ padding: "0.45rem 0.6rem", fontSize: "0.8rem", color: "var(--muted)" }}>
                              {open ? new Date(open.checkedAt).toLocaleTimeString("vi-VN") : "—"}
                            </td>
                            <td style={{ padding: "0.45rem 0.6rem", fontSize: "0.8rem", color: "var(--muted)" }}>
                              {close ? new Date(close.checkedAt).toLocaleTimeString("vi-VN") : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Chi tiết log thô */}
          {logs.length > 0 && (
            <div>
              <h2 style={{ fontSize: "1rem", margin: "0 0 0.65rem" }}>Chi tiết log kiểm kho</h2>
              {(["open", "close"] as const).map((ct) => {
                const group = logs.filter(l => l.checkType === ct);
                if (group.length === 0) return null;
                return (
                  <div key={ct} style={{ marginBottom: "1rem" }}>
                    <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "0 0 0.4rem",
                      color: ct === "open" ? "#f59e0b" : "#818cf8" }}>
                      {ct === "open" ? "Mở ca" : "Kết ca"} — {new Date(group[0].checkedAt).toLocaleString("vi-VN")}
                    </h3>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                            <th style={{ padding: "0.35rem 0.5rem" }}>Nguyên liệu</th>
                            <th style={{ padding: "0.35rem 0.5rem", textAlign: "right" }}>Số lượng</th>
                            <th style={{ padding: "0.35rem 0.5rem" }}>Ghi chú</th>
                            <th style={{ padding: "0.35rem 0.5rem" }}>Thời gian</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.map(l => (
                            <tr key={l.id} style={{ borderBottom: "1px solid var(--border)" }}>
                              <td style={{ padding: "0.35rem 0.5rem" }}>{l.item.name}{l.item.unit && <span style={{ color: "var(--muted)", marginLeft: 4 }}>({l.item.unit})</span>}</td>
                              <td style={{ padding: "0.35rem 0.5rem", textAlign: "right", fontWeight: 700 }}>{l.qty}</td>
                              <td style={{ padding: "0.35rem 0.5rem", color: "var(--muted)", fontStyle: l.note ? "normal" : "italic" }}>{l.note ?? "—"}</td>
                              <td style={{ padding: "0.35rem 0.5rem", color: "var(--muted)", fontSize: "0.8rem" }}>{new Date(l.checkedAt).toLocaleTimeString("vi-VN")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Lịch sử nhập kho trong ngày */}
          {receipts.length > 0 && (
            <div>
              <h2 style={{ fontSize: "1rem", margin: "0 0 0.65rem" }}>Nhập kho trong ngày</h2>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                      {["#", "Nguyên liệu", "SL nhập", "ĐVT", "Nguồn", "Người duyệt", "Thời gian"].map(h => (
                        <th key={h} style={{ padding: "0.4rem 0.6rem", color: "var(--muted)", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.map(rc => (
                      <tr key={rc.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.4rem 0.6rem", color: "var(--muted)", fontSize: "0.8rem" }}>#{rc.id}</td>
                        <td style={{ padding: "0.4rem 0.6rem", fontWeight: 600 }}>{rc.item.name}</td>
                        <td style={{ padding: "0.4rem 0.6rem", fontWeight: 700, color: "#22c55e" }}>+{rc.qty}</td>
                        <td style={{ padding: "0.4rem 0.6rem", color: "var(--muted)" }}>{rc.item.unit ?? "—"}</td>
                        <td style={{ padding: "0.4rem 0.6rem" }}>
                          <span style={{ padding: "0.15rem 0.55rem", borderRadius: 99, fontSize: "0.78rem", fontWeight: 600,
                            background: rc.source === "Request" ? "#f0faf4" : "#fffbea",
                            color: rc.source === "Request" ? "#2d7a3e" : "#b07000",
                            border: `1px solid ${rc.source === "Request" ? "#86efac" : "#fde68a"}` }}>
                            {rc.source === "Request" ? `Phiếu #${rc.request?.id ?? ""}` : "Nhập tay"}
                          </span>
                        </td>
                        <td style={{ padding: "0.4rem 0.6rem", color: "var(--muted)" }}>{rc.receivedBy.fullName}</td>
                        <td style={{ padding: "0.4rem 0.6rem", color: "var(--muted)", fontSize: "0.82rem" }}>
                          {new Date(rc.receivedAt).toLocaleString("vi-VN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
