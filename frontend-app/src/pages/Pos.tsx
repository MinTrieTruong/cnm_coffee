import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { apiOrigin } from "../lib/api";
import { getStaffInfo, staffApi } from "../lib/staffApi";

type TableRow = {
  id: number;
  name: string;
  status: string;
  location: string | null;
  orders: { id: number; status: string; totalAmount: number }[];
};

type PendingDetail = {
  id: number;
  quantity: number;
  unitPrice: number;
  product: { name: string };
};

type PendingOrder = {
  id: number;
  subTotal: number;
  discountAmt: number;
  table: { id: number; name: string } | null;
  customer: { id: number; fullName: string; phone: string | null; points: number } | null;
  details: PendingDetail[];
};

type StoreSettings = {
  vatRatePercent: number;
  pointPerVnd: number;
  pointValueVnd: number;
  cashRoundTo: number;
  pointEarnEveryVnd: number;
  pointEarnEach: number;
};

function computePointsEarned(paidAmountVnd: number, everyVnd: number, each: number) {
  const block = everyVnd > 0 ? everyVnd : 1000;
  const pts = each > 0 ? each : 100;
  return Math.floor(paidAmountVnd / block) * pts;
}

type ShiftRow = { id: number; startTime: string; startingCash: number } | null;

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

function computeBill(
  subTotal: number,
  discountAmt: number,
  pointsToUse: number,
  pointValueVnd: number,
  vatRatePercent: number,
) {
  const pointsDiscount = pointsToUse * pointValueVnd;
  const taxable = Math.max(0, subTotal - discountAmt - pointsDiscount);
  const vatAmount = Math.floor((taxable * vatRatePercent) / 100);
  const totalAmount = taxable + vatAmount;
  return { taxable, pointsDiscount, vatAmount, totalAmount };
}

function roundCashAmount(amount: number, roundTo: number) {
  if (roundTo <= 1) return amount;
  return Math.round(amount / roundTo) * roundTo;
}

function tableStatusMeta(status: string) {
  if (status === "Occupied") return { cls: "table-tile-occupied", label: "Có khách" };
  if (status === "Waiting_Pay") return { cls: "table-tile-paying", label: "Đang thanh toán" };
  return { cls: "table-tile-empty", label: "Trống" };
}

export function Pos() {
  const info = getStaffInfo();
  const [tables, setTables] = useState<TableRow[] | null>(null);
  const [pending, setPending] = useState<PendingOrder[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [shift, setShift] = useState<ShiftRow | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [startingCash, setStartingCash] = useState("500000");
  const [actualCash, setActualCash] = useState("");
  const [payOrder, setPayOrder] = useState<PendingOrder | null>(null);
  const [payMethod, setPayMethod] = useState("Cash");
  const [cashGiven, setCashGiven] = useState("");
  const [pointsToUse, setPointsToUse] = useState(0);

  const loadTables = useCallback(async () => {
    const base = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
    const res = await fetch(`${base}/api/pos/tables`);
    if (!res.ok) throw new Error("Không tải được bàn");
    const data = (await res.json()) as TableRow[];
    setTables(data);
  }, []);

  const loadPending = useCallback(async () => {
    try {
      const data = await staffApi<PendingOrder[]>("/api/pos/pending-orders");
      setPending(data);
    } catch {
      setPending([]);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const s = await staffApi<StoreSettings>("/api/pos/store-settings");
      setSettings({
        ...s,
        pointEarnEveryVnd: s.pointEarnEveryVnd ?? 1000,
        pointEarnEach: s.pointEarnEach ?? 100,
      });
    } catch {
      setSettings(null);
    }
  }, []);

  const loadShift = useCallback(async () => {
    try {
      const data = await staffApi<{ shift: ShiftRow }>("/api/shifts/open");
      setShift(data.shift);
    } catch {
      setShift(null);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      setErr(null);
      await loadTables();
      await loadShift();
      await loadPending();
      await loadSettings();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi");
    }
  }, [loadTables, loadShift, loadPending, loadSettings]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const socket: Socket = io(apiOrigin(), { transports: ["websocket", "polling"] });
    socket.emit("join", "pos");
    socket.emit("join", "staff");
    socket.on("payment:done", () => {
      setToast("Đã thanh toán xong.");
      setTimeout(() => setToast(null), 2800);
      void refreshAll();
    });
    socket.on("payment:request", (payload: { orderId?: number }) => {
      setToast(`Phục vụ yêu cầu thanh toán đơn #${payload.orderId ?? "?"}`);
      setTimeout(() => setToast(null), 4200);
      void loadPending();
    });
    socket.on("order:pending_grace", (p: { orderId?: number; tableId?: number | null; payMode?: "now" | "later" }) => {
      const tableLabel = p.tableId ? `bàn #${p.tableId}` : "đơn mang về";
      const modeLabel = p.payMode === "now" ? " (khách chọn thanh toán ngay)" : "";
      setToast(`Đơn #${p.orderId ?? "?"} mới từ ${tableLabel}${modeLabel}`);
      setTimeout(() => setToast(null), 4200);
      void loadTables();
    });
    socket.on("order:confirmed", (p: { orderId?: number }) => {
      setToast(`Đơn #${p.orderId ?? "?"} đã qua ân hạn, sẵn sàng thanh toán.`);
      setTimeout(() => setToast(null), 4200);
      void refreshAll();
    });
    socket.on("chat:escalate", (p: { message?: string; tableId?: number | null }) => {
      const t = p.tableId ? `Bàn liên quan #${p.tableId}` : "Khách";
      setToast(`${t}: ${(p.message ?? "").slice(0, 80)}`);
      setTimeout(() => setToast(null), 5200);
    });
    socket.on("inventory:request", () => {
      setToast("Có phiếu xin nguyên liệu từ bếp.");
      setTimeout(() => setToast(null), 3200);
    });
    return () => {
      socket.disconnect();
    };
  }, [refreshAll, loadPending, loadTables]);

  async function openShift() {
    const n = Number(startingCash.replace(/\D/g, "")) || 0;
    try {
      await staffApi("/api/shifts/open", {
        method: "POST",
        body: JSON.stringify({ startingCash: n }),
      });
      await loadShift();
      setToast("Đã mở ca.");
      setTimeout(() => setToast(null), 2200);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi mở ca");
    }
  }

  async function closeShift() {
    const n = Number(actualCash.replace(/\D/g, ""));
    if (Number.isNaN(n)) {
      setErr("Nhập số tiền mặt thực tế khi đóng ca.");
      return;
    }
    try {
      await staffApi("/api/shifts/close", {
        method: "POST",
        body: JSON.stringify({ actualCash: n }),
      });
      setActualCash("");
      await loadShift();
      setToast("Đã đóng ca.");
      setTimeout(() => setToast(null), 2200);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi đóng ca");
    }
  }

  const preview = useMemo(() => {
    if (!payOrder || !settings) return null;
    const maxPts = payOrder.customer
      ? Math.min(
          payOrder.customer.points,
          Math.floor(Math.max(0, payOrder.subTotal - payOrder.discountAmt) / settings.pointValueVnd),
        )
      : 0;
    const pts = Math.min(pointsToUse, maxPts);
    const { vatAmount, totalAmount, pointsDiscount } = computeBill(
      payOrder.subTotal,
      payOrder.discountAmt,
      pts,
      settings.pointValueVnd,
      settings.vatRatePercent,
    );
    const display =
      payMethod === "Cash" ? roundCashAmount(totalAmount, settings.cashRoundTo) : totalAmount;
    const cashNum = Number(cashGiven.replace(/\D/g, ""));
    const change = payMethod === "Cash" && !Number.isNaN(cashNum) ? cashNum - display : null;
    const pointsEarned = payOrder.customer
      ? computePointsEarned(display, settings.pointEarnEveryVnd, settings.pointEarnEach)
      : 0;
    return { vatAmount, totalAmount, pointsDiscount, display, change, maxPts, pts, pointsEarned };
  }, [payOrder, settings, payMethod, cashGiven, pointsToUse]);

  async function submitPay() {
    if (!payOrder || !preview) return;
    const body: Record<string, unknown> = {
      orderId: payOrder.id,
      method: payMethod,
      pointsToUse: preview.pts,
    };
    if (payMethod === "Cash") {
      const cg = Number(cashGiven.replace(/\D/g, ""));
      if (Number.isNaN(cg)) {
        setErr("Nhập tiền khách đưa.");
        return;
      }
      body.cashGiven = cg;
    }
    try {
      setErr(null);
      await staffApi("/api/pos/pay", { method: "POST", body: JSON.stringify(body) });
      setPayOrder(null);
      setCashGiven("");
      setPointsToUse(0);
      setPayMethod("Cash");
      await refreshAll();
      setToast("Thanh toán thành công.");
      setTimeout(() => setToast(null), 2400);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi thanh toán");
    }
  }

  useEffect(() => {
    if (payOrder && settings) {
      const maxPts = payOrder.customer
        ? Math.min(
            payOrder.customer.points,
            Math.floor(Math.max(0, payOrder.subTotal - payOrder.discountAmt) / settings.pointValueVnd),
          )
        : 0;
      setPointsToUse((p) => Math.min(p, maxPts));
    }
  }, [payOrder, settings]);

  if (!info || (info.role !== "Cashier" && info.role !== "Admin")) {
    return (
      <div className="app-shell" style={{ maxWidth: 720 }}>
        <p className="subtle">Cần đăng nhập thu ngân hoặc quản lý.</p>
        <Link to="/staff/login" className="btn btn-primary">
          Đăng nhập nhân sự
        </Link>
      </div>
    );
  }

  return (
    <div className="app-shell" style={{ maxWidth: 900 }}>
      <div className="nav-top">
        <h1 className="page-title" style={{ margin: 0 }}>
          Thu ngân (POS)
        </h1>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {info.role === "Admin" && (
            <Link to="/admin" className="btn btn-ghost" style={{ padding: "0.5rem 0.85rem", fontSize: "0.9rem" }}>
              Quản trị
            </Link>
          )}
          <button type="button" className="btn btn-ghost" style={{ padding: "0.5rem 0.85rem", fontSize: "0.9rem" }} onClick={() => void refreshAll()}>
            Làm mới
          </button>
          <Link to="/staff/login" className="btn btn-ghost" style={{ padding: "0.5rem 0.85rem", fontSize: "0.9rem" }}>
            Nhân sự
          </Link>
        </div>
      </div>

      <p className="subtle">Quản lý ca làm việc và xử lý thanh toán tại quầy.</p>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "1.25rem",
            right: "1.25rem",
            background: "var(--card)",
            border: "1px solid var(--border)",
            padding: "0.75rem 1rem",
            borderRadius: "12px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
            zIndex: 50,
            maxWidth: 360,
            fontSize: "0.92rem",
          }}
        >
          {toast}
        </div>
      )}

      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

      <section className="card" style={{ padding: "1rem 1.15rem", marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.65rem" }}>Ca làm việc</h2>
        {shift === undefined ? (
          <p className="subtle">Đang kiểm tra ca…</p>
        ) : shift ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
            <div>
              <span className="subtle">Ca #{shift.id}</span> — mở lúc {new Date(shift.startTime).toLocaleString("vi-VN")}
              <br />
              <span className="subtle">Tiền mặt đầu ca:</span> {formatVnd(shift.startingCash)}
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="label" htmlFor="ac">
                Tiền mặt đếm thực tế khi đóng ca
              </label>
              <input
                id="ac"
                className="input"
                placeholder="VD: 1250000"
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value)}
                style={{ maxWidth: 200 }}
              />
            </div>
            <button type="button" className="btn btn-primary" onClick={() => void closeShift()}>
              Đóng ca
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="label" htmlFor="sc">
                Tiền mặt đầu ca
              </label>
              <input
                id="sc"
                className="input"
                value={startingCash}
                onChange={(e) => setStartingCash(e.target.value)}
                style={{ maxWidth: 200 }}
              />
            </div>
            <button type="button" className="btn btn-primary" onClick={() => void openShift()}>
              Mở ca
            </button>
          </div>
        )}
      </section>

      <section style={{ marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.65rem" }}>Đơn chờ thanh toán</h2>
        {shift === undefined && <p className="subtle">Đang kiểm tra ca…</p>}
        {shift === null && <p className="subtle">Mở ca trước khi thanh toán.</p>}
        {pending.length === 0 && shift != null ? <p className="subtle">Không có đơn Confirmed chưa thu tiền.</p> : null}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {pending.map((o) => (
            <div key={o.id} className="card" style={{ padding: "0.85rem 1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <strong>Đơn #{o.id}</strong>
                  {o.table && (
                    <span style={{ color: "var(--muted)", marginLeft: "0.5rem" }}>
                      {o.table.name}
                    </span>
                  )}
                  <div style={{ fontSize: "0.88rem", marginTop: "0.25rem" }}>
                    {o.customer ? (
                      <>
                        {o.customer.fullName} — {o.customer.points} điểm
                      </>
                    ) : (
                      "Khách vãng lai"
                    )}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                    Tạm tính: {formatVnd(o.subTotal)} (chưa gồm VAT / điểm)
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={shift == null}
                  onClick={() => {
                    setPayOrder(o);
                    setCashGiven("");
                    setPointsToUse(0);
                    setPayMethod("Cash");
                  }}
                >
                  Thu tiền
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {tables && (
        <section>
          <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.65rem" }}>Sơ đồ bàn</h2>
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
              const meta = tableStatusMeta(t.status);
              const o = t.orders[0];
              return (
                <div key={t.id} className={`table-tile ${meta.cls}`}>
                  <div style={{ fontWeight: 700, fontSize: "1.05rem", lineHeight: 1 }}>{t.name.replace("Bàn ", "")}</div>
                  <div style={{ fontSize: "0.72rem", opacity: 0.95, marginTop: "0.25rem" }}>{t.location ?? "Tại quán"}</div>
                  <div style={{ fontSize: "0.74rem", marginTop: "0.35rem", fontWeight: 600 }}>{meta.label}</div>
                  {o && (
                    <div style={{ fontSize: "0.7rem", marginTop: "0.18rem" }}>
                      #{o.id} · {formatVnd(o.totalAmount)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {payOrder && settings && preview && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 40,
            padding: "1rem",
          }}
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && setPayOrder(null)}
        >
          <div className="card" style={{ padding: "1.25rem", maxWidth: 440, width: "100%" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Thanh toán đơn #{payOrder.id}</h3>
            <ul style={{ fontSize: "0.9rem", margin: "0 0 0.75rem", paddingLeft: "1.1rem" }}>
              {payOrder.details.map((d) => (
                <li key={d.id}>
                  {d.product.name} × {d.quantity} — {formatVnd(d.unitPrice * d.quantity)}
                </li>
              ))}
            </ul>
            <div className="field">
              <label className="label">Đổi điểm (tối đa {preview.maxPts})</label>
              <input
                type="range"
                min={0}
                max={preview.maxPts}
                value={preview.pts}
                onChange={(e) => setPointsToUse(Number(e.target.value))}
              />
              <span className="subtle" style={{ fontSize: "0.85rem" }}>
                Dùng {preview.pts} điểm → giảm {formatVnd(preview.pointsDiscount)}
              </span>
            </div>
            <div style={{ margin: "0.65rem 0", fontSize: "0.92rem" }}>
              VAT ({settings.vatRatePercent}%): {formatVnd(preview.vatAmount)}
              <br />
              <strong>Tổng phải thu: {formatVnd(preview.display)}</strong>
              {payOrder.customer && preview.pointsEarned > 0 && (
                <span className="subtle" style={{ display: "block", marginTop: "0.35rem" }}>
                  Dự kiến cộng cho khách: <strong>{preview.pointsEarned}</strong> điểm (theo số tiền thu)
                </span>
              )}
              {payMethod === "Cash" && (
                <span className="subtle" style={{ display: "block", marginTop: "0.25rem" }}>
                  (Tiền mặt làm tròn bội số {formatVnd(settings.cashRoundTo)})
                </span>
              )}
            </div>
            <div className="field">
              <label className="label" htmlFor="pm">
                Phương thức
              </label>
              <select id="pm" className="input" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                <option value="Cash">Tiền mặt</option>
                <option value="Transfer_QR">Chuyển khoản / QR</option>
                <option value="Card">Thẻ</option>
                <option value="MoMo">Ví MoMo</option>
              </select>
            </div>
            {payMethod === "Cash" && (
              <div className="field">
                <label className="label" htmlFor="cg">
                  Khách đưa
                </label>
                <input id="cg" className="input" value={cashGiven} onChange={(e) => setCashGiven(e.target.value)} placeholder="VD: 100000" />
                {preview.change !== null && (
                  <span style={{ fontSize: "0.9rem" }}>Tiền thừa: {formatVnd(Math.max(0, preview.change))}</span>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.75rem" }}>
              <button type="button" className="btn btn-primary btn-block" onClick={() => void submitPay()}>
                Xác nhận thanh toán
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setPayOrder(null)}>
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
