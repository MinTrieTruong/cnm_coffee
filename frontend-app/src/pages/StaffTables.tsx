import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getStaffInfo, staffApi } from "../lib/staffApi";

type TableRow = {
  id: number;
  name: string;
  status: string;
  location: string | null;
  orders: { id: number; status: string; totalAmount: number }[];
};

type ProductRow = { id: number; name: string; sellPrice: number; isActive: boolean; outOfStock: boolean };
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
  customer: { id: number; fullName: string; phone: string | null; points: number } | null;
  details: DetailRow[];
};
type TableContext = {
  table: { id: number; name: string; status: string; location: string | null };
  activeOrder: ActiveOrder | null;
};
type BillPreview = {
  orderId: number;
  tableName: string | null;
  customerName: string;
  customerPhone: string | null;
  inAt: string;
  outAt: string;
  subTotal: number;
  vatAmount: number;
  totalAmount: number;
  method: string | null;
  items: { id: number; name: string; quantity: number; unitPrice: number; amount: number }[];
};

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

function tableStatusMeta(status: string) {
  if (status === "Occupied") return { cls: "table-tile-occupied", label: "Có khách" };
  if (status === "Waiting_Pay") return { cls: "table-tile-paying", label: "Đang thanh toán" };
  return { cls: "table-tile-empty", label: "Trống" };
}

export function StaffTables() {
  const info = getStaffInfo();
  const [tables, setTables] = useState<TableRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [mergeFrom, setMergeFrom] = useState("");
  const [mergeTo, setMergeTo] = useState("");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [ctx, setCtx] = useState<TableContext | null>(null);
  const [addingProductId, setAddingProductId] = useState<number | "">("");
  const [addingQty, setAddingQty] = useState("1");
  const [addingNotes, setAddingNotes] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [bill, setBill] = useState<BillPreview | null>(null);

  const load = useCallback(async () => {
    try {
      setErr(null);
      const base = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
      const res = await fetch(`${base}/api/pos/tables`);
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
        const rows = await staffApi<ProductRow[]>("/api/products");
        setProducts(rows.filter((p) => p.isActive && !p.outOfStock));
      } catch {
        setProducts([]);
      }
    })();
  }, []);

  const openTable = useCallback(async (tableId: number) => {
    setSelectedTable(tableId);
    setBill(null);
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
      setMsg("Đã gửi yêu cầu thanh tới quầy.");
      setTimeout(() => setMsg(null), 2400);
      void load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi");
    }
  }

  async function requestPaymentWithMethod(orderId: number, method: "Cash" | "Transfer_QR") {
    try {
      setErr(null);
      const resp = await staffApi<{ ok: boolean; bill: BillPreview }>("/api/staff/orders/request-payment", {
        method: "POST",
        body: JSON.stringify({ orderId, method }),
      });
      setBill(resp.bill);
      setMsg("Đã gửi yêu cầu thanh toán tới thu ngân.");
      setTimeout(() => setMsg(null), 2600);
      await load();
      if (selectedTable) await openTable(selectedTable);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi");
    }
  }

  async function addItemToTable() {
    if (!selectedTable || addingProductId === "") {
      setErr("Chọn món trước khi thêm.");
      return;
    }
    const quantity = Number(addingQty);
    if (!quantity || quantity <= 0) {
      setErr("Số lượng không hợp lệ.");
      return;
    }
    try {
      setErr(null);
      await staffApi(`/api/staff/tables/${selectedTable}/items`, {
        method: "POST",
        body: JSON.stringify({
          productId: addingProductId,
          quantity,
          customNotes: addingNotes,
          customerPhone: customerPhone.trim() || undefined,
        }),
      });
      setAddingNotes("");
      setAddingQty("1");
      setMsg("Đã thêm món cho bàn.");
      setTimeout(() => setMsg(null), 2000);
      await load();
      await openTable(selectedTable);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi thêm món");
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

  async function markTableCleaned(tableId: number) {
    try {
      setErr(null);
      await staffApi(`/api/staff/tables/${tableId}/clean`, { method: "POST" });
      setMsg("Đã dọn xong, bàn chuyển về trống.");
      setTimeout(() => setMsg(null), 2400);
      await load();
      if (selectedTable === tableId) {
        setSelectedTable(null);
        setCtx(null);
        setBill(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi dọn bàn");
    }
  }

  const selectedProductPrice = useMemo(() => {
    if (addingProductId === "") return 0;
    return products.find((p) => p.id === addingProductId)?.sellPrice ?? 0;
  }, [addingProductId, products]);

  async function mergeOrders() {
    const a = Number(mergeFrom);
    const b = Number(mergeTo);
    if (!a || !b || a === b) {
      setErr("Nhập hai mã đơn khác nhau.");
      return;
    }
    try {
      setErr(null);
      await staffApi("/api/staff/orders/merge", {
        method: "POST",
        body: JSON.stringify({ fromOrderId: a, toOrderId: b }),
      });
      setMsg(`Đã gộp đơn #${a} vào #${b}.`);
      setMergeFrom("");
      setMergeTo("");
      setTimeout(() => setMsg(null), 2800);
      void load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi gộp đơn");
    }
  }

  if (!info || (info.role !== "Waiter" && info.role !== "Admin")) {
    return (
      <div className="app-shell" style={{ maxWidth: 720 }}>
        <p className="subtle">Trang dành cho phục vụ hoặc quản lý.</p>
        <Link to="/staff/login" className="btn btn-primary">
          Đăng nhập
        </Link>
      </div>
    );
  }

  return (
    <div className="app-shell" style={{ maxWidth: 800 }}>
      <div className="nav-top">
        <h1 className="page-title" style={{ margin: 0 }}>
          Sơ đồ bàn (phục vụ)
        </h1>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" className="btn btn-ghost" style={{ padding: "0.5rem 0.85rem", fontSize: "0.9rem" }} onClick={() => void load()}>
            Làm mới
          </button>
          <Link to="/staff/login" className="btn btn-ghost" style={{ padding: "0.5rem 0.85rem", fontSize: "0.9rem" }}>
            Nhân sự
          </Link>
        </div>
      </div>
      <p className="subtle">Yêu cầu thanh toán (bàn chuyển sang chờ thu) và gộp đơn chưa thanh toán.</p>
      {msg && <p style={{ color: "var(--accent)" }}>{msg}</p>}
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
          <div className="table-legend" style={{ marginBottom: "0.65rem" }}>
            <span className="table-legend-item">
              <span className="table-status-dot table-tile-empty" /> Trống
            </span>
            <span className="table-legend-item">
              <span className="table-status-dot table-tile-occupied" /> Có khách
            </span>
            <span className="table-legend-item">
              <span className="table-status-dot table-tile-paying" /> Đang thanh toán
            </span>
          </div>
          <div className="table-grid">
            {tables.map((t) => {
              const o = t.orders[0];
              const meta = tableStatusMeta(t.status);
              return (
                <div
                  key={t.id}
                  className={`table-tile ${meta.cls}`}
                  style={{ border: selectedTable === t.id ? "2px solid #fff" : undefined }}
                  onClick={() => void openTable(t.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") void openTable(t.id);
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "1.05rem", lineHeight: 1 }}>{t.name.replace("Bàn ", "")}</div>
                  <div style={{ fontSize: "0.72rem", opacity: 0.95, marginTop: "0.25rem" }}>{t.location ?? "Tại quán"}</div>
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
                      onClick={(ev) => {
                        ev.stopPropagation();
                        void requestPayment(o.id);
                      }}
                    >
                      Thanh toán
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {selectedTable && ctx && (
        <section className="card" style={{ padding: "1rem", marginTop: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: "1.03rem" }}>
              {ctx.table.name} {ctx.table.location ? `· ${ctx.table.location}` : ""}
            </h2>
            <button type="button" className="btn btn-ghost" style={{ padding: "0.35rem 0.75rem", fontSize: "0.82rem" }} onClick={() => setSelectedTable(null)}>
              Đóng
            </button>
          </div>

          <div style={{ marginTop: "0.65rem", fontSize: "0.9rem" }}>
            {ctx.activeOrder ? (
              <>
                <div>
                  Khách: <strong>{ctx.activeOrder.customer?.fullName ?? "Vãng lai"}</strong>
                  {ctx.activeOrder.customer?.phone ? ` · ${ctx.activeOrder.customer.phone}` : ""}
                </div>
                <div className="subtle" style={{ marginBottom: "0.45rem" }}>
                  Mã đơn #{ctx.activeOrder.id} · Giờ vào {new Date(ctx.activeOrder.createdAt).toLocaleTimeString("vi-VN")}
                </div>
              </>
            ) : (
              <div className="subtle" style={{ marginBottom: "0.45rem" }}>
                Bàn chưa có đơn mở.
              </div>
            )}
          </div>

          <div className="field">
            <label className="label" htmlFor="cp">
              SĐT khách (nếu có)
            </label>
            <input id="cp" className="input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Để trống nếu vãng lai" />
          </div>

          <div className="field">
            <label className="label">Order món cho khách</label>
            <select
              className="input"
              value={addingProductId === "" ? "" : String(addingProductId)}
              onChange={(e) => setAddingProductId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Chọn món</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {formatVnd(p.sellPrice)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: "0.55rem", alignItems: "flex-end", marginBottom: "0.6rem" }}>
            <div className="field" style={{ margin: 0, flex: 1 }}>
              <label className="label">Số lượng</label>
              <input className="input" value={addingQty} onChange={(e) => setAddingQty(e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0, flex: 2 }}>
              <label className="label">Ghi chú</label>
              <input className="input" value={addingNotes} onChange={(e) => setAddingNotes(e.target.value)} placeholder="Ít đá, ít ngọt..." />
            </div>
          </div>
          <div className="subtle" style={{ marginBottom: "0.5rem" }}>
            Tạm tính món thêm: {formatVnd((Number(addingQty) || 0) * selectedProductPrice)}
          </div>
          <button type="button" className="btn btn-primary" onClick={() => void addItemToTable()}>
            Thêm món
          </button>

          {ctx.activeOrder && (
            <>
              <hr style={{ borderColor: "rgba(255,255,255,0.08)", margin: "1rem 0" }} />
              <h3 style={{ margin: "0 0 0.55rem", fontSize: "0.95rem" }}>Món đã gọi</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                {ctx.activeOrder.details.map((d) => (
                  <div key={d.id} className="card" style={{ padding: "0.55rem 0.75rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.6rem", alignItems: "center" }}>
                      <div>
                        <strong>{d.product.name}</strong> · x{d.quantity}
                        <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{d.customNotes ?? ""}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div>{formatVnd(d.unitPrice * d.quantity)}</div>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ marginTop: "0.25rem", padding: "0.25rem 0.55rem", fontSize: "0.74rem" }}
                          onClick={() => void cancelItem(ctx.activeOrder!.id, d.id)}
                        >
                          Hủy món (&lt;1 phút)
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "0.65rem", fontWeight: 700 }}>Tạm tính: {formatVnd(ctx.activeOrder.subTotal)}</div>

              <div style={{ marginTop: "0.9rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-primary" onClick={() => void requestPaymentWithMethod(ctx.activeOrder!.id, "Cash")}>
                  Yêu cầu thanh toán · Tiền mặt
                </button>
                <button type="button" className="btn btn-primary" onClick={() => void requestPaymentWithMethod(ctx.activeOrder!.id, "Transfer_QR")}>
                  Yêu cầu thanh toán · Chuyển khoản
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => void markTableCleaned(ctx.table.id)}>
                  Dọn xong
                </button>
              </div>
            </>
          )}

          {bill && (
            <div className="card" style={{ marginTop: "1rem", padding: "0.85rem 1rem" }}>
              <h3 style={{ marginTop: 0 }}>Bill tạm tính #{bill.orderId}</h3>
              <div style={{ fontSize: "0.88rem" }}>
                Khách: <strong>{bill.customerName}</strong>
                {bill.customerPhone ? ` · ${bill.customerPhone}` : ""}
                <br />
                Giờ vào: {new Date(bill.inAt).toLocaleTimeString("vi-VN")} · Giờ ra: {new Date(bill.outAt).toLocaleTimeString("vi-VN")}
              </div>
              <ul style={{ margin: "0.55rem 0", paddingLeft: "1rem", fontSize: "0.88rem" }}>
                {bill.items.map((i) => (
                  <li key={i.id}>
                    {i.name} x{i.quantity} = {formatVnd(i.amount)}
                  </li>
                ))}
              </ul>
              <div style={{ fontSize: "0.9rem" }}>
                Tạm tính: {formatVnd(bill.subTotal)}
                <br />
                Thuế VAT: {formatVnd(bill.vatAmount)}
                <br />
                <strong>Tổng tiền: {formatVnd(bill.totalAmount)}</strong>
              </div>
              {bill.method === "Transfer_QR" && (
                <div style={{ marginTop: "0.65rem" }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                      `CMN|ORDER:${bill.orderId}|AMOUNT:${bill.totalAmount}`,
                    )}`}
                    alt="QR thanh toán"
                    style={{ width: 180, height: 180, borderRadius: 8 }}
                  />
                  <p className="subtle" style={{ marginTop: "0.35rem", marginBottom: 0 }}>
                    Khách quét mã để chuyển đúng {formatVnd(bill.totalAmount)}, sau đó thu ngân xác nhận thanh toán.
                  </p>
                </div>
              )}
              {bill.method === "Cash" && (
                <p className="subtle" style={{ marginTop: "0.35rem", marginBottom: 0 }}>
                  Đã gửi yêu cầu thu ngân chuẩn bị bill tiền mặt.
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
