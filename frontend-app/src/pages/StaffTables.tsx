import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { apiBase, apiOrigin } from "../lib/api";
import { mapFetchError } from "../lib/net";
import { getStaffInfo, staffApi } from "../lib/staffApi";

/** Phát âm thanh ding khi món sẵn sàng phục vụ. */
function playReadySound() {
  try {
    const ctx = new AudioContext();
    const playNote = (freq: number, time: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0.5, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
      osc.start(time);
      osc.stop(time + dur);
    };
    const now = ctx.currentTime;
    playNote(784, now, 0.18);        // G5
    playNote(1047, now + 0.22, 0.4); // C6
    setTimeout(() => ctx.close(), 2000);
  } catch { /* */ }
}

type TableRow = {
  id: number;
  name: string;
  status: string;
  location: string | null;
  zoneId?: number;
  paymentStatus?: string;
  orders: { id: number; status: string; totalAmount: number; details?: any[] }[];
};

type ProductRow = { id: number; name: string; sellPrice: number; isActive: boolean; outOfStock: boolean; imageUrl: string | null; categoryId: number; };
type MenuCategory = { id: number; name: string };
type Zone = { id: number; name: string; isActive: boolean };
type DetailRow = {
  id: number;
  quantity: number;
  unitPrice: number;
  customNotes: string | null;
  kdsStatus: string;
  product: { id: number; name: string };
};
type ActiveOrder = {
  id: number;
  createdAt: string;
  subTotal: number;
  status?: string;
  customer: { id: number; fullName: string; phone: string | null; points: number } | null;
  details: DetailRow[];
};
type TableContext = {
  table: { id: number; name: string; status: string; location: string | null };
  activeOrder: ActiveOrder | null;
};
function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

function tableStatusMeta(status: string) {
  if (status === "Occupied")    return { cls: "table-tile-occupied", label: "Có khách" };
  if (status === "Waiting_Pay") return { cls: "table-tile-paying",   label: "Đang thanh toán" };
  if (status === "Cleaning")   return { cls: "table-tile-cleaning",  label: "Vừa thanh toán" };
  return { cls: "table-tile-empty", label: "Trống" };
}

function getDrinkBadge(order: any) {
  if (!order || !order.details || order.details.length === 0) return null;
  const details = order.details;
  const readyItems = details.filter((d: any) => d.kdsStatus === "Ready");
  if (readyItems.length > 0) {
    const qty = readyItems.reduce((acc: number, d: any) => acc + d.quantity, 0);
    return (
      <div style={{
        position: "absolute", top: -8, right: -8,
        background: "var(--danger)", color: "#fff",
        padding: "0.25rem 0.5rem", borderRadius: 12,
        fontSize: "0.75rem", fontWeight: 700,
        boxShadow: "0 4px 12px rgba(220, 38, 38, 0.4)",
        animation: "badge-pulse 1.5s infinite"
      }}>
        {qty} món
      </div>
    );
  }
  const pendingItems = details.filter((d: any) => ["Hold", "Waiting", "Cooking"].includes(d.kdsStatus));
  if (pendingItems.length > 0) {
    return (
      <div style={{
        position: "absolute", top: -6, right: -6,
        background: "rgba(0,0,0,0.6)", color: "#fff",
        padding: "0.2rem 0.45rem", borderRadius: 8,
        fontSize: "0.7rem", fontWeight: 700,
      }}>
        Đang pha
      </div>
    );
  }
  const servedItems = details.filter((d: any) => d.kdsStatus === "Served");
  if (servedItems.length === details.length) {
    return (
      <div style={{
        position: "absolute", top: -6, right: -6,
        background: "#047857", color: "#fff",
        padding: "0.2rem 0.45rem", borderRadius: 8,
        fontSize: "0.7rem", fontWeight: 700,
        boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)",
      }}>
        Đủ món
      </div>
    );
  }
  return null;
}

export function StaffTables() {
  const info = getStaffInfo();
  const [zones, setZones] = useState<Zone[]>([]);
  const [activeZoneId, setActiveZoneId] = useState<number | "all">("all");
  const [tables, setTables] = useState<TableRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [mergeFrom, setMergeFrom] = useState("");
  const [mergeTo, setMergeTo] = useState("");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [ctx, setCtx] = useState<TableContext | null>(null);
  const [activeCat, setActiveCat] = useState<number | null>(null);
  type LineState = { qty: number; note: string; showNote: boolean };
  const [menuLines, setMenuLines] = useState<Record<number, LineState>>({});
  const [customerPhone, setCustomerPhone] = useState("");
  type ReadyNotif = { productName: string; quantity: number; tableName: string; orderId: number };
  const [readyNotifs, setReadyNotifs] = useState<ReadyNotif[]>([]);
  const [clearingIds, setClearingIds] = useState<Set<number>>(new Set());
  
  const [menuTableId, setMenuTableId] = useState<number | null>(null);
  const [moveSourceId, setMoveSourceId] = useState<number | null>(null);
  const [mergeSourceId, setMergeSourceId] = useState<number | null>(null);
  const [splitSourceId, setSplitSourceId] = useState<number | null>(null);
  const [splitItems, setSplitItems] = useState<{orderItemId: number; quantity: number}[]>([]);
  async function mergeOrders() {
    const fromOrderId = Number(mergeFrom.replace(/D/g, ""));
    const toOrderId = Number(mergeTo.replace(/D/g, ""));
    if (!fromOrderId || !toOrderId) return setErr("Nhập mã đơn nguồn và đơn đích.");
    try {
      setErr(null);
      await staffApi("/api/staff/orders/merge", { method: "POST", body: JSON.stringify({ fromOrderId, toOrderId }) });
      setMergeFrom("");
      setMergeTo("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi gộp đơn");
    }
  }

  const load = useCallback(async () => {
    try {
      setErr(null);
      const base = apiBase();
      let res: Response;
      try {
        res = await fetch(`${base}/api/pos/tables`);
      } catch (e) {
        throw mapFetchError(e);
      }
      if (!res.ok) throw new Error("Không tải được bàn");
      setTables((await res.json()) as TableRow[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const [data, zonesData] = await Promise.all([
          staffApi<{ categories: MenuCategory[]; products: ProductRow[] }>("/api/menu"),
          staffApi<Zone[]>("/api/pos/zones")
        ]);
        setProducts(data.products.filter((p) => p.isActive && !p.outOfStock));
        setCategories(data.categories);
        if (data.categories.length > 0) setActiveCat(data.categories[0].id);
        setZones(zonesData);
        
        const savedZone = localStorage.getItem("staff_selected_zone");
        if (savedZone && savedZone !== "all") {
          setActiveZoneId(Number(savedZone));
        }
      } catch {
        setProducts([]);
        setZones([]);
      }
    })();
  }, []);

  // Socket: nhận thông báo từ backend
  useEffect(() => {
    const socket: Socket = io(apiOrigin(), { transports: ["websocket", "polling"] });
    socket.emit("join", "staff");
    socket.emit("join", "pos"); // nhận luôn payment:done để refresh sơ đồ bàn

    // Món sẵn sàng phục vụ
    socket.on("kds:ready", (data: { productName: string; quantity: number; tableName: string; orderId: number }) => {
      playReadySound();
      setReadyNotifs((prev) => [...prev, data]);
      setTimeout(() => {
        setReadyNotifs((prev) => prev.filter((n) => n !== data));
      }, 12000);
    });

    // POS xác nhận thanh toán xong → refresh sơ đồ bàn
    socket.on("payment:done", () => { void load(); });

    // Ai đó yêu cầu thanh toán → refresh sơ đồ bàn
    socket.on("payment:request", () => { void load(); });

    // Nhân viên báo trống → refresh sơ đồ bàn
    socket.on("table:cleared", () => { void load(); });

    return () => {
      socket.disconnect();
    };
  }, [load]);

  const openTable = useCallback(async (tableId: number) => {
    setSelectedTable(tableId);
    setErr(null);
    try {
      const data = await staffApi<TableContext>(`/api/staff/tables/${tableId}/context`);
      setCtx(data);
      setCustomerPhone(data.activeOrder?.customer?.phone ?? "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi tải bàn");
    }
  }, []);

  async function requestPayment(orderId: number) {
    try {
      setErr(null);
      await staffApi("/api/staff/orders/request-payment", {
        method: "POST",
        body: JSON.stringify({ orderId }),
      });
      setMsg("Đã gửi yêu cầu thanh toán tới quầy.");
      setTimeout(() => setMsg(null), 2400);
      await load();
      if (selectedTable) await openTable(selectedTable);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi");
    }
  }

  async function sendOrder() {
    if (!selectedTable) return;
    const lines = Object.entries(menuLines)
      .filter(([, v]) => v.qty > 0)
      .map(([k, v]) => ({ productId: Number(k), quantity: v.qty, customNotes: v.note.trim() || undefined }));
    if (lines.length === 0) { setErr("Chưa chọn món nào."); return; }
    try {
      setErr(null);
      // Gửi từng món (API hiện tại nhận 1 món/lần)
      for (const line of lines) {
        await staffApi(`/api/staff/tables/${selectedTable}/items`, {
          method: "POST",
          body: JSON.stringify({ ...line, customerPhone: customerPhone.trim() || undefined }),
        });
      }
      setMenuLines({});
      setMsg(`Đã gửi ${lines.length} món cho bàn.`);
      setTimeout(() => setMsg(null), 2200);
      await load();
      await openTable(selectedTable);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi gửi món");
    }
  }

  async function cancelItem(orderId: number, detailId: number) {
    try {
      setErr(null);
      await staffApi(`/api/staff/orders/${orderId}/items/${detailId}/cancel`, { method: "POST" });
      setMsg("Đã hủy món.");
      setTimeout(() => setMsg(null), 2000);
      await load();
      if (selectedTable) await openTable(selectedTable);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi hủy món");
    }
  }

  async function clearTable(tableId: number) {
    setClearingIds((prev) => new Set(prev).add(tableId));
    try {
      setErr(null);
      await staffApi(`/api/staff/tables/${tableId}/clear`, { method: "POST" });
      setMsg("Đã báo trống bàn.");
      setTimeout(() => setMsg(null), 2000);
      await load();
      if (selectedTable === tableId) setSelectedTable(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi báo trống");
    } finally {
      setClearingIds((prev) => { const s = new Set(prev); s.delete(tableId); return s; });
    }
  }

  async function executeMove(targetId: number) {
    if (!moveSourceId) return;
    try {
      setErr(null);
      await staffApi("/api/pos/move-table", {
        method: "POST",
        body: JSON.stringify({ sourceTableId: moveSourceId, targetTableId: targetId }),
      });
      setMoveSourceId(null);
      setMsg("Chuyển bàn thành công");
      setTimeout(() => setMsg(null), 3000);
      void load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi chuyển bàn");
    }
  }

  async function executeMerge(targetId: number) {
    if (!mergeSourceId) return;
    try {
      setErr(null);
      await staffApi("/api/pos/merge-tables", {
        method: "POST",
        body: JSON.stringify({ sourceTableId: mergeSourceId, targetTableId: targetId }),
      });
      setMergeSourceId(null);
      setMsg("Gộp bàn thành công");
      setTimeout(() => setMsg(null), 3000);
      void load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi gộp bàn");
    }
  }

  async function executeSplit(originalOrderId: number) {
    const toMove = splitItems.filter(x => x.quantity > 0);
    if (toMove.length === 0) return setErr("Vui lòng chọn món để tách");
    try {
      setErr(null);
      await staffApi("/api/pos/split-order", {
        method: "POST",
        body: JSON.stringify({ originalOrderId, itemsToMove: toMove }),
      });
      setSplitSourceId(null);
      setSplitItems([]);
      setMsg("Tách bill thành công");
      setTimeout(() => setMsg(null), 3000);
      void load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi tách bill");
    }
  }

  if (!info || !["Waiter", "Admin", "Cashier"].includes(info.role)) {
    return (
      <div className="staff-page-inner">
        <p className="subtle">Trang dành cho phục vụ hoặc quản lý.</p>
        <Link to="/staff/login" className="btn btn-primary">
          Đăng nhập
        </Link>
      </div>
    );
  }

  return (
    <div className="staff-page-inner staff-page-wide">
      <div className="staff-page-head">
        <h1 className="page-title" style={{ margin: 0 }}>
          Sơ đồ bàn (phục vụ)
        </h1>
        <button type="button" className="btn btn-ghost staff-btn-light" onClick={() => void load()}>
          Làm mới
        </button>
      </div>
      <p className="subtle">Yêu cầu thanh toán (bàn chuyển sang chờ thu) và gộp đơn chưa thanh toán.</p>
      {msg && <p style={{ color: "var(--accent)" }}>{msg}</p>}

      {/* Popup stack thông báo món sẵn sàng */}
      {readyNotifs.length > 0 && (
        <div
          style={{
            position: "fixed",
            top: "1rem",
            right: "1rem",
            zIndex: 60,
            display: "flex",
            flexDirection: "column",
            gap: "0.6rem",
            maxWidth: 320,
          }}
        >
          {readyNotifs.map((n, i) => (
            <div
              key={i}
              style={{
                background: "var(--o-success-bg)",
                border: "1px solid var(--o-success)",
                borderRadius: 4,
                padding: "0.75rem 1rem",
                boxShadow: "var(--o-shadow-pop)",
                display: "flex",
                flexDirection: "column",
                gap: "0.35rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                <div style={{ fontWeight: 800, fontSize: "0.88rem", color: "#15803d", letterSpacing: "0.05em" }}>
                  MÓN SẴN SÀNG
                </div>
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "#15803d", cursor: "pointer", fontSize: "1.1rem", lineHeight: 1, padding: 0 }}
                  onClick={() => setReadyNotifs((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="Đóng"
                >
                  ×
                </button>
              </div>
              <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--o-text)" }}>
                {n.productName} <span style={{ color: "#15803d" }}>× {n.quantity}</span>
              </div>
              <div style={{ fontSize: "0.88rem", color: "#15803d" }}>
                {n.tableName} · Đơn #{n.orderId}
              </div>
              <div style={{ fontSize: "0.8rem", color: "#15803d", marginTop: "0.2rem" }}>
                Vui lòng ra bê nước cho khách!
              </div>
            </div>
          ))}
        </div>
      )}

      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

      <section className="card" style={{ padding: "1rem", marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.65rem" }}>Gộp đơn</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor="mf">
              Từ đơn #
            </label>
            <input id="mf" className="input" value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)} style={{ width: 120 }} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor="mt">
              Vào đơn #
            </label>
            <input id="mt" className="input" value={mergeTo} onChange={(e) => setMergeTo(e.target.value)} style={{ width: 120 }} />
          </div>
          <button type="button" className="btn btn-primary" onClick={() => void mergeOrders()}>
            Gộp
          </button>
        </div>
      </section>

      {tables && (
        <>
          <div className="table-legend" style={{ marginBottom: "0.65rem", flexWrap: "wrap", rowGap: "0.5rem" }}>
            <span className="table-legend-item">
              <span className="table-status-dot table-tile-empty" /> Trống
            </span>
            <span className="table-legend-item">
              <span className="table-status-dot table-tile-occupied" /> Chưa thanh toán
            </span>
            <span className="table-legend-item">
              <span className="table-status-dot table-tile-paying" /> Gọi tính tiền
            </span>
            <span className="table-legend-item">
              <span className="table-status-dot table-tile-cleaning" /> Đã thanh toán
            </span>
            <span style={{ margin: "0 0.5rem", color: "var(--muted)" }}>|</span>
            <span className="table-legend-item" style={{ fontSize: "0.8rem" }}>
              Chờ bưng
            </span>
            <span className="table-legend-item" style={{ fontSize: "0.8rem" }}>
              Đang pha
            </span>
            <span className="table-legend-item" style={{ fontSize: "0.8rem" }}>
              Đủ món
            </span>
          </div>

          {/* THAY ĐỔI ZONE */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <button 
              className={activeZoneId === "all" ? "btn btn-primary" : "btn btn-ghost staff-btn-light"}
              onClick={() => { setActiveZoneId("all"); localStorage.setItem("staff_selected_zone", "all"); }}
            >
              Tất cả Khu vực
            </button>
            {zones.map(z => (
              <button 
                key={z.id}
                className={activeZoneId === z.id ? "btn btn-primary" : "btn btn-ghost staff-btn-light"}
                onClick={() => { setActiveZoneId(z.id); localStorage.setItem("staff_selected_zone", String(z.id)); }}
              >
                {z.name}
              </button>
            ))}
          </div>

          <div className="table-grid">
            {tables.filter(t => activeZoneId === "all" || (t as any).zoneId === activeZoneId).map((t) => {
              const o = t.orders[0];
              const meta = tableStatusMeta(t.status);
              return (
                <div
                  key={t.id}
                  className={`table-tile ${meta.cls}`}
                  style={{ border: selectedTable === t.id ? "2px solid #fff" : undefined }}
                  onClick={() => setMenuTableId(t.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") setMenuTableId(t.id);
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "1.05rem", lineHeight: 1 }}>{t.name.replace("Bàn ", "")}</div>
                  {activeZoneId === "all" && (
                    <div style={{ fontSize: "0.72rem", opacity: 0.95, marginTop: "0.25rem" }}>{t.location ?? "Tại quán"}</div>
                  )}
                  {getDrinkBadge(o)}
                  <div style={{ fontSize: "0.74rem", marginTop: "0.35rem", fontWeight: 600 }}>{meta.label}</div>
                  {o && (
                    <div style={{ fontSize: "0.7rem", marginTop: "0.18rem" }}>
                      #{o.id} · {formatVnd(o.totalAmount)}
                    </div>
                  )}
                  {o && o.status === "Confirmed" && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ marginTop: "0.4rem", width: "100%", padding: "0.3rem 0.5rem", fontSize: "0.74rem" }}
                      onClick={(ev) => { ev.stopPropagation(); void requestPayment(o.id); }}
                    >
                      Thanh toán
                    </button>
                  )}
                  {/* Nút Báo trống khi khách đã thanh toán nhưng còn ngồi */}
                  {t.status === "Cleaning" && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={clearingIds.has(t.id)}
                      style={{
                        marginTop: "0.4rem", width: "100%",
                        padding: "0.3rem 0.5rem", fontSize: "0.74rem",
                        background: "#7c3aed", borderColor: "#7c3aed",
                        opacity: clearingIds.has(t.id) ? 0.6 : 1,
                      }}
                      onClick={(ev) => { ev.stopPropagation(); void clearTable(t.id); }}
                    >
                      {clearingIds.has(t.id) ? "Đang xử lý..." : "Báo trống"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Modal chi tiết bàn ── */}
      {selectedTable && ctx && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(3px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "1rem",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) { setSelectedTable(null); setMenuLines({}); } }}
        >
          <div style={{
            background: "#fff",
            borderRadius: 16,
            width: "100%",
            maxWidth: 520,
            maxHeight: "90dvh",
            overflowY: "auto",
            boxShadow: "var(--shadow-lg)",
            display: "flex",
            flexDirection: "column",
          }}>
            {/* Modal header */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "1rem 1.25rem",
              borderBottom: "1px solid #e5ddd5",
              position: "sticky", top: 0, background: "#fff", zIndex: 1,
              borderRadius: "16px 16px 0 0",
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.05rem", color: "var(--text)", fontWeight: 700 }}>
                  {ctx.table.name}{ctx.table.location ? ` · ${ctx.table.location}` : ""}
                </h2>
                {ctx.activeOrder ? (
                  <div style={{ fontSize: "0.82rem", color: "#6b5e55", marginTop: "0.1rem" }}>
                    Khách: <strong style={{ color: "var(--text)" }}>{ctx.activeOrder.customer?.fullName ?? "Vãng lai"}</strong>
                    {ctx.activeOrder.customer?.phone ? ` · ${ctx.activeOrder.customer.phone}` : ""}
                    &nbsp;·&nbsp;Đơn #{ctx.activeOrder.id} · {new Date(ctx.activeOrder.createdAt).toLocaleTimeString("vi-VN")}
                  </div>
                ) : (
                  <div style={{ fontSize: "0.82rem", color: "#6b5e55", marginTop: "0.1rem" }}>Bàn chưa có đơn mở.</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setSelectedTable(null); setMenuLines({}); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.4rem", color: "#6b5e55", lineHeight: 1, padding: "0.2rem 0.4rem" }}
                aria-label="Đóng"
              >×</button>
            </div>

            {/* Modal body */}
            <div style={{ padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>

              {/* SĐT khách */}
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="label" htmlFor="cp" style={{ color: "#6b5e55" }}>SĐT khách (nếu có)</label>
                <input id="cp" className="input" value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Để trống nếu vãng lai"
                  style={{ maxWidth: 220 }} />
              </div>

              {/* Tab danh mục */}
              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                {categories.map((cat) => (
                  <button key={cat.id} type="button"
                    className={activeCat === cat.id ? "btn btn-primary" : "btn btn-ghost staff-btn-light"}
                    style={{ padding: "0.3rem 0.85rem", fontSize: "0.85rem" }}
                    onClick={() => setActiveCat(cat.id)}>
                    {cat.name}
                  </button>
                ))}
              </div>

              {/* Danh sách món */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", maxHeight: 280, overflowY: "auto" }}>
                {products.filter((p) => activeCat === null || p.categoryId === activeCat).map((p) => {
                  const line = menuLines[p.id];
                  const qty = line?.qty ?? 0;
                  const imgUrl = p.imageUrl ? (p.imageUrl.startsWith("http") ? p.imageUrl : `http://localhost:4000${p.imageUrl}`) : null;
                  return (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.5rem 0.6rem", background: qty > 0 ? "#f0faf4" : "#faf8f5", borderRadius: 10, border: qty > 0 ? "1px solid #15803d" : "1px solid #e5ddd5", transition: "all 0.15s" }}>
                      <div style={{ width: 48, height: 48, borderRadius: 8, flexShrink: 0, background: "#f5f0eb", overflow: "hidden" }}>
                        {imgUrl
                          ? <img src={imgUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: "0.7rem" }}>—</div>
                        }
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                        <div style={{ fontSize: "0.8rem", color: "#6b5e55" }}>{formatVnd(p.sellPrice)}</div>
                        {line?.showNote && (
                          <input type="text" className="input" placeholder="Ít đá, ít ngọt..." value={line.note}
                            onChange={(e) => setMenuLines((prev) => ({ ...prev, [p.id]: { ...prev[p.id], note: e.target.value } }))}
                            style={{ marginTop: "0.3rem", padding: "0.25rem 0.5rem", fontSize: "0.82rem" }}
                            autoFocus />
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", flexShrink: 0 }}>
                        {qty > 0 && (
                          <button type="button" className="btn btn-ghost staff-btn-light" style={{ padding: "0.2rem 0.55rem", fontSize: "1rem", lineHeight: 1 }}
                            onClick={() => setMenuLines((prev) => { const next = { ...prev }; if ((next[p.id]?.qty ?? 0) <= 1) { delete next[p.id]; } else { next[p.id] = { ...next[p.id], qty: next[p.id].qty - 1 }; } return next; })}>−</button>
                        )}
                        {qty > 0 && <span style={{ minWidth: 22, textAlign: "center", fontWeight: 700, color: "var(--text)", fontSize: "0.95rem" }}>{qty}</span>}
                        <button type="button" className="btn btn-ghost staff-btn-light" style={{ padding: "0.2rem 0.55rem", fontSize: "1rem", lineHeight: 1 }}
                          onClick={() => setMenuLines((prev) => ({ ...prev, [p.id]: { qty: (prev[p.id]?.qty ?? 0) + 1, note: prev[p.id]?.note ?? "", showNote: prev[p.id]?.showNote ?? false } }))}>+</button>
                        <button type="button" title="Ghi chú" className="btn btn-ghost staff-btn-light" style={{ padding: "0.2rem 0.5rem", fontSize: "0.9rem", lineHeight: 1 }}
                          onClick={() => setMenuLines((prev) => ({ ...prev, [p.id]: { qty: prev[p.id]?.qty ?? 0, note: prev[p.id]?.note ?? "", showNote: !(prev[p.id]?.showNote) } }))}>
                          ···
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tóm tắt giỏ */}
              {Object.values(menuLines).some((l) => l.qty > 0) && (
                <div style={{ background: "#f9f6f2", borderRadius: 10, padding: "0.75rem", border: "1px solid #e5ddd5" }}>
                  <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--text)", marginBottom: "0.4rem" }}>Món sắp gửi:</div>
                  {Object.entries(menuLines).filter(([, v]) => v.qty > 0).map(([pid, v]) => {
                    const pr = products.find((x) => x.id === Number(pid));
                    return (
                      <div key={pid} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--text)", padding: "0.15rem 0" }}>
                        <span>{pr?.name} x{v.qty}{v.note ? ` (${v.note})` : ""}</span>
                        <span style={{ fontWeight: 600 }}>{formatVnd((pr?.sellPrice ?? 0) * v.qty)}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Buttons hành động */}
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-primary"
                  disabled={!Object.values(menuLines).some((l) => l.qty > 0)}
                  onClick={() => void sendOrder()}>
                  Gửi món cho bàn
                </button>
                {ctx.activeOrder && ctx.activeOrder.status !== "Paid" && (
                  <button type="button" className="btn btn-ghost staff-btn-light"
                    onClick={() => void requestPayment(ctx.activeOrder!.id)}>
                    Yêu cầu thanh toán
                  </button>
                )}
              </div>

              {/* Món đã gọi */}
              {ctx.activeOrder && ctx.activeOrder.details.length > 0 && (
                <>
                  <hr style={{ borderColor: "#e5ddd5", margin: "0.25rem 0" }} />
                  <h3 style={{ margin: 0, fontSize: "0.95rem", color: "var(--text)" }}>
                    Món đã gọi {ctx.activeOrder.status === "Paid" && <span style={{ color: "#d7aa2d", fontSize: "0.8rem", marginLeft: "0.4rem", fontWeight: 600 }}>(Đã thanh toán)</span>}
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {ctx.activeOrder.details.map((d) => (
                      <div key={d.id} style={{ display: "flex", justifyContent: "space-between", gap: "0.6rem", alignItems: "center", padding: "0.45rem 0.6rem", background: "#faf8f5", borderRadius: 8, border: "1px solid #e5ddd5" }}>
                        <div>
                          <span style={{ fontWeight: 600, color: "var(--text)" }}>{d.product.name}</span>
                          <span style={{ color: "#6b5e55", fontSize: "0.85rem" }}> x{d.quantity}</span>
                          {d.customNotes && <div style={{ fontSize: "0.8rem", color: "#6b5e55", fontStyle: "italic" }}>{d.customNotes}</div>}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontWeight: 600, color: "var(--text)" }}>{formatVnd(d.unitPrice * d.quantity)}</div>
                          {ctx.activeOrder!.status !== "Paid" && (
                            <button type="button" className="btn btn-ghost staff-btn-light"
                              style={{ marginTop: "0.2rem", padding: "0.2rem 0.5rem", fontSize: "0.72rem", color: "#c94c4c" }}
                              onClick={() => void cancelItem(ctx.activeOrder!.id, d.id)}>
                              Hủy
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontWeight: 700, color: "var(--text)" }}>Tạm tính: {formatVnd(ctx.activeOrder.subTotal)}</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {menuTableId !== null && (() => {
        const t = tables?.find(x => x.id === menuTableId);
        if (!t) return null;
        return (
          <div className="modal-overlay" onClick={() => setMenuTableId(null)}>
            <div className="modal" style={{ maxWidth: 320, width: "90%", padding: "1.5rem" }} onClick={e => e.stopPropagation()}>
              <h2 style={{ margin: "0 0 1.25rem", fontSize: "1.2rem", textAlign: "center" }}>Thao tác: Bàn {t.name.replace("Bàn ", "")}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                <button className="btn btn-primary" style={{ padding: "0.75rem", fontSize: "1rem" }} onClick={() => { setMenuTableId(null); void openTable(t.id); }}>Mở bàn</button>
                <button className="btn btn-outline" style={{ padding: "0.75rem", fontSize: "1rem", color: "var(--text)", borderColor: "#d5c9bc" }} onClick={() => { setMenuTableId(null); setMoveSourceId(t.id); }}>Chuyển Bàn</button>
                <button className="btn btn-outline" style={{ padding: "0.75rem", fontSize: "1rem", color: "var(--text)", borderColor: "#d5c9bc" }} onClick={() => { setMenuTableId(null); setMergeSourceId(t.id); }}>Gộp Bàn</button>
                {info?.role !== "Waiter" && (
                  <button className="btn btn-outline" style={{ padding: "0.75rem", fontSize: "1rem", color: "var(--text)", borderColor: "#d5c9bc" }} onClick={() => { setMenuTableId(null); setSplitSourceId(t.id); }}>Tách Bill</button>
                )}
                <button className="btn btn-ghost" style={{ padding: "0.75rem", fontSize: "1rem", marginTop: "0.5rem" }} onClick={() => setMenuTableId(null)}>Đóng</button>
              </div>
            </div>
          </div>
        );
      })()}

      {moveSourceId && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <h2 style={{ margin: "0 0 1rem" }}>Chọn bàn để chuyển đến</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {tables?.filter(t => t.status === "Empty").map(t => (
                <button key={t.id} className="btn btn-outline staff-btn-light" onClick={() => void executeMove(t.id)}>{t.name}</button>
              ))}
            </div>
            <button className="btn btn-ghost" style={{ marginTop: "1rem", width: "100%" }} onClick={() => setMoveSourceId(null)}>Hủy</button>
          </div>
        </div>
      )}

      {mergeSourceId && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <h2 style={{ margin: "0 0 1rem" }}>Chọn bàn đích để gộp vào</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {tables?.filter(t => t.status !== "Empty" && t.id !== mergeSourceId).map(t => (
                <button key={t.id} className="btn btn-outline staff-btn-light" onClick={() => void executeMerge(t.id)}>{t.name}</button>
              ))}
            </div>
            <button className="btn btn-ghost" style={{ marginTop: "1rem", width: "100%" }} onClick={() => setMergeSourceId(null)}>Hủy</button>
          </div>
        </div>
      )}

      {splitSourceId && (() => {
        const t = tables?.find(x => x.id === splitSourceId);
        const order = t?.orders[0];
        if (!order) return null;
        return (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: 700, width: "100%" }}>
              <h2 style={{ margin: "0 0 1rem" }}>Tách Bill - {t.name}</h2>
              <div style={{ display: "flex", gap: "1rem" }}>
                <div style={{ flex: 1, border: "1px solid #e5ddd5", padding: "1rem", borderRadius: 8, background: "#faf8f5" }}>
                  <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Đơn gốc</h3>
                  {order.details?.map(d => {
                    const moved = splitItems.find(x => x.orderItemId === d.id)?.quantity || 0;
                    const remain = d.quantity - moved;
                    return remain > 0 ? (
                      <div key={d.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", alignItems: "center" }}>
                        <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{d.product?.name ?? "Món"} <span style={{ color: "var(--primary)" }}>x{remain}</span></div>
                        <button className="btn btn-outline" style={{ padding: "0.2rem 0.5rem", fontSize: "0.8rem" }} onClick={() => {
                          setSplitItems(prev => {
                            const clone = [...prev];
                            const idx = clone.findIndex(x => x.orderItemId === d.id);
                            if (idx >= 0) clone[idx].quantity++; else clone.push({ orderItemId: d.id, quantity: 1 });
                            return clone;
                          });
                        }}>{">"}</button>
                      </div>
                    ) : null;
                  })}
                </div>
                <div style={{ flex: 1, border: "1px solid #e5ddd5", padding: "1rem", borderRadius: 8, background: "#faf8f5" }}>
                  <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Đơn tách ra</h3>
                  {splitItems.filter(x => x.quantity > 0).map(item => {
                    const d = order.details?.find(x => x.id === item.orderItemId);
                    return (
                      <div key={item.orderItemId} style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", alignItems: "center" }}>
                        <button className="btn btn-outline" style={{ padding: "0.2rem 0.5rem", fontSize: "0.8rem" }} onClick={() => {
                          setSplitItems(prev => {
                            const clone = [...prev];
                            const idx = clone.findIndex(x => x.orderItemId === item.orderItemId);
                            if (idx >= 0) { clone[idx].quantity--; }
                            return clone;
                          });
                        }}>{"<"}</button>
                        <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{d?.product?.name ?? "Món"} <span style={{ color: "var(--primary)" }}>x{item.quantity}</span></div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => void executeSplit(order.id)}>Xác nhận tách</button>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setSplitSourceId(null); setSplitItems([]); }}>Hủy</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
