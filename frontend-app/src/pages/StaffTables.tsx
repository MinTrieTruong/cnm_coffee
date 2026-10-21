import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Socket } from "socket.io-client";
import { activeStoreId, getStaffInfo, staffApi, staffSocket as openStaffSocket, isAdminRole } from "../lib/staffApi";
import { TablePanel, type OrderLine } from "../components/TablePanel";

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

type ProductRow = {
  id: number;
  name: string;
  sellPrice: number;
  priceSizeS?: number | null;
  priceSizeL?: number | null;
  discountPercent?: number | null;
  isActive: boolean;
  outOfStock: boolean;
  imageUrl: string | null;
  categoryId: number;
};
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
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  // Bàn đang mở trong khung thông tin
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [ctx, setCtx] = useState<TableContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  type ReadyNotif = { productName: string; quantity: number; tableName: string; orderId: number };
  const [readyNotifs, setReadyNotifs] = useState<ReadyNotif[]>([]);
  const [clearingIds, setClearingIds] = useState<Set<number>>(new Set());

  const flash = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(null), 2400);
  };

  const load = useCallback(async () => {
    try {
      setErr(null);
      setTables(await staffApi<TableRow[]>("/api/pos/tables"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Thực đơn của chi nhánh đang làm (ẩn món chi nhánh tắt / báo hết) */
  const loadMenu = useCallback(async () => {
    const data = await staffApi<{ categories: MenuCategory[]; products: ProductRow[] }>(`/api/menu${activeStoreId() ? `?store=${activeStoreId()}` : ""}`);
    setProducts(data.products.filter((p) => p.isActive && !p.outOfStock));
    setCategories(data.categories);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [, zonesData] = await Promise.all([loadMenu(), staffApi<Zone[]>("/api/pos/zones")]);
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
  }, [loadMenu]);

  const openTable = useCallback(async (tableId: number, quiet = false) => {
    setSelectedTable(tableId);
    if (!quiet) setCtxLoading(true);
    setErr(null);
    try {
      setCtx(await staffApi<TableContext>(`/api/staff/tables/${tableId}/context`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi tải bàn");
    } finally {
      setCtxLoading(false);
    }
  }, []);

  const closeTable = useCallback(() => {
    setSelectedTable(null);
    setCtx(null);
  }, []);

  // Socket: nhận thông báo từ backend
  useEffect(() => {
    const socket: Socket = openStaffSocket();
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

    // Pha chế báo hết / ẩn món → tải lại thực đơn gọi món
    socket.on("menu:availability", () => { void loadMenu().catch(() => {}); });

    return () => {
      socket.disconnect();
    };
  }, [load, loadMenu]);

  /** Chạy thao tác, báo kết quả, làm mới sơ đồ (và khung bàn nếu còn mở) */
  async function act(fn: () => Promise<unknown>, ok: string, fail: string, refreshTable = true): Promise<boolean> {
    try {
      setErr(null);
      await fn();
      flash(ok);
      await load();
      if (refreshTable && selectedTable) await openTable(selectedTable, true);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : fail);
      return false;
    }
  }

  const requestPayment = (orderId: number) =>
    act(() => staffApi("/api/staff/orders/request-payment", { method: "POST", body: JSON.stringify({ orderId }) }), "Đã gửi yêu cầu thanh toán tới quầy.", "Lỗi");

  async function sendOrder(lines: OrderLine[], customerPhone: string) {
    if (!selectedTable) return false;
    // API nhận 1 món/lần
    return act(async () => {
      for (const line of lines) {
        await staffApi(`/api/staff/tables/${selectedTable}/items`, {
          method: "POST",
          body: JSON.stringify({ ...line, customerPhone: customerPhone || undefined }),
        });
      }
    }, `Đã gửi ${lines.reduce((s, l) => s + l.quantity, 0)} món xuống bếp.`, "Lỗi gửi món");
  }

  const cancelItem = (orderId: number, detailId: number) =>
    act(() => staffApi(`/api/staff/orders/${orderId}/items/${detailId}/cancel`, { method: "POST" }), "Đã huỷ món.", "Lỗi huỷ món");

  async function clearTable(tableId: number) {
    setClearingIds((prev) => new Set(prev).add(tableId));
    const ok = await act(() => staffApi(`/api/staff/tables/${tableId}/clear`, { method: "POST" }), "Đã báo trống bàn.", "Lỗi báo trống", false);
    if (ok && selectedTable === tableId) closeTable();
    setClearingIds((prev) => { const s = new Set(prev); s.delete(tableId); return s; });
  }

  const moveTable = (targetId: number) =>
    act(() => staffApi("/api/pos/move-table", { method: "POST", body: JSON.stringify({ sourceTableId: selectedTable, targetTableId: targetId }) }), "Chuyển bàn thành công.", "Lỗi chuyển bàn", false);

  const mergeTable = (targetId: number) =>
    act(() => staffApi("/api/pos/merge-tables", { method: "POST", body: JSON.stringify({ sourceTableId: selectedTable, targetTableId: targetId }) }), "Gộp bàn thành công.", "Lỗi gộp bàn", false);

  const splitOrder = (originalOrderId: number, itemsToMove: { orderItemId: number; quantity: number }[]) =>
    act(() => staffApi("/api/pos/split-order", { method: "POST", body: JSON.stringify({ originalOrderId, itemsToMove }) }), "Tách bill thành công.", "Lỗi tách bill");

  if (!info || !(["Waiter", "Cashier"].includes(info.role) || isAdminRole(info.role))) {
    return (
      <div className="staff-page-inner">
        <p className="subtle">Trang dành cho phục vụ hoặc quản lý.</p>
        <Link to="/staff/login" className="btn btn-primary">
          Đăng nhập
        </Link>
      </div>
    );
  }

  const panelTable = tables?.find((t) => t.id === selectedTable) ?? (ctx ? { ...ctx.table, orders: [] } : null);

  return (
    <div className="staff-page-inner staff-page-wide">
      <div className="staff-page-head">
        <h1 className="page-title" style={{ margin: 0 }}>
          Sơ đồ bàn
        </h1>
        <button type="button" className="btn btn-ghost staff-btn-light" onClick={() => void load()}>
          Làm mới
        </button>
      </div>
      <p className="subtle">Chạm vào bàn để xem món, gọi thêm, chuyển / gộp bàn, tách bill hoặc yêu cầu thanh toán.</p>

      {/* Thông báo thao tác (nổi, không đẩy lưới bàn) */}
      <div className="tp-toast-wrap" aria-live="polite">
        {msg && <div className="tp-toast">{msg}</div>}
        {err && <div className="tp-toast is-error" role="alert">{err}</div>}
      </div>

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
            {tables.filter(t => activeZoneId === "all" || t.zoneId === activeZoneId).map((t) => {
              const o = t.orders[0];
              const meta = tableStatusMeta(t.status);
              return (
                <div
                  key={t.id}
                  className={`table-tile ${meta.cls}`}
                  style={{ outline: selectedTable === t.id ? "3px solid var(--o-primary)" : undefined, outlineOffset: 2 }}
                  onClick={() => void openTable(t.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${t.name}, ${meta.label}`}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); void openTable(t.id); }
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

      {selectedTable && panelTable && (
        <TablePanel
          table={panelTable}
          order={ctx?.table.id === selectedTable ? ctx.activeOrder : null}
          loading={ctxLoading || ctx?.table.id !== selectedTable}
          tables={tables ?? []}
          products={products}
          categories={categories}
          canSplit={info.role !== "Waiter"}
          initialPhone={ctx?.activeOrder?.customer?.phone ?? ""}
          onClose={closeTable}
          onSendOrder={sendOrder}
          onCancelItem={async (orderId, detailId) => { await cancelItem(orderId, detailId); }}
          onRequestPayment={async (orderId) => { await requestPayment(orderId); }}
          onMove={moveTable}
          onMerge={mergeTable}
          onSplit={splitOrder}
          onClear={() => clearTable(selectedTable)}
        />
      )}
    </div>
  );
}
