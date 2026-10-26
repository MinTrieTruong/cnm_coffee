import { useCallback, useEffect, useRef, useState } from "react";
import { Socket } from "socket.io-client";
import { Bike, Check, MapPin, Phone, X } from "lucide-react";
import { mediaUrl } from "../lib/api";
import { getStaffInfo, isAdminRole, staffApi, staffSocket as openStaffSocket } from "../lib/staffApi";
import { deliveryLabel, formatVnd } from "../lib/delivery";

type BoardOrder = {
  id: number;
  status: string;
  deliveryStatus: string;
  deliveryAddress: string | null;
  deliveryNote: string | null;
  deliveryProofUrl: string | null;
  createdAt: string;
  shippingFee: number;
  totalAmount: number;
  routeSeq: number | null;
  shipperId: number | null;
  customer: { fullName: string; phone: string | null } | null;
  shipper: { id: number; fullName: string } | null;
  details: { id: number; quantity: number; kdsStatus: string; product: { name: string } }[];
  payments: { method: string; amount: number }[];
  /** Pending = giao thất bại do phía khách, chờ quản lý quyết định hoàn · Refunded · Declined */
  refundStatus: string | null;
  refundPoints: number;
};
type BoardShipper = { id: number; fullName: string; phone: string | null; shipperOnline: boolean; activeOrders: number };

const COLUMNS: { key: string; title: string; match: (o: BoardOrder) => boolean }[] = [
  { key: "new", title: "Chờ xác nhận", match: (o) => o.deliveryStatus === "Awaiting_Confirm" },
  { key: "kitchen", title: "Đang pha chế", match: (o) => o.deliveryStatus === "Preparing" },
  { key: "dispatch", title: "Chờ / Đã gán tài xế", match: (o) => ["Ready", "Assigned"].includes(o.deliveryStatus) },
  { key: "road", title: "Đang giao", match: (o) => o.deliveryStatus === "Delivering" },
  { key: "refund", title: "Chờ xử lý hoàn", match: (o) => o.refundStatus === "Pending" },
  { key: "done", title: "Hoàn tất / Hủy", match: (o) => ["Delivered", "Failed", "Rejected"].includes(o.deliveryStatus) && o.refundStatus !== "Pending" },
];

/** Quán còn hủy được tới trước khi shipper lấy hàng */
const STORE_CANCELLABLE = ["Awaiting_Confirm", "Preparing", "Ready", "Assigned"];
const paidMoney = (o: BoardOrder) => o.payments.filter((p) => p.method !== "Points").reduce((s, p) => s + p.amount, 0);

/** Bảng điều phối đơn giao hàng trên POS (thu ngân xác nhận / từ chối / đổi tài xế). */
export function PosDeliveryPanel({ onToast }: { onToast: (m: string) => void }) {
  const [orders, setOrders] = useState<BoardOrder[]>([]);
  const [shippers, setShippers] = useState<BoardShipper[]>([]);
  const [col, setCol] = useState("new");
  const [busyId, setBusyId] = useState<number | null>(null);
  const toastRef = useRef(onToast);
  toastRef.current = onToast;

  const load = useCallback(async () => {
    try {
      const r = await staffApi<{ orders: BoardOrder[]; shippers: BoardShipper[] }>("/api/delivery/board");
      setOrders(r.orders);
      setShippers(r.shippers);
    } catch {
      /* POS vẫn chạy nếu lỗi */
    }
  }, []);

  useEffect(() => {
    void load();
    const socket: Socket = openStaffSocket();
    socket.emit("join", "pos");
    socket.emit("join", "staff");
    socket.on("delivery:new", (p: { orderId: number }) => {
      toastRef.current(`Đơn giao hàng mới #${p.orderId} — cần xác nhận`);
      setCol("new");
      void load();
    });
    socket.on("delivery:update", () => void load());
    socket.on("kds:update", () => void load());
    return () => {
      socket.disconnect();
    };
  }, [load]);

  async function act(id: number, path: string, body?: object, msg?: string) {
    setBusyId(id);
    try {
      await staffApi(`/api/delivery/${id}/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) });
      if (msg) toastRef.current(msg);
      await load();
    } catch (e) {
      toastRef.current(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setBusyId(null);
    }
  }

  const counts = Object.fromEntries(COLUMNS.map((c) => [c.key, orders.filter(c.match).length]));
  const list = orders.filter(COLUMNS.find((c) => c.key === col)!.match);
  const canDecideRefund = isAdminRole(getStaffInfo()?.role);

  function cancelByStore(o: BoardOrder) {
    const isNew = o.deliveryStatus === "Awaiting_Confirm";
    const refundNote = o.status === "Paid" ? `

Khách đã trả ${formatVnd(paidMoney(o))} — sẽ được hoàn 100% thành điểm.` : "";
    const reason = window.prompt(`Lý do ${isNew ? "từ chối" : "hủy"} đơn #${o.id}:${refundNote}`, isNew ? "Hết món / quá tải" : "");
    if (reason !== null) void act(o.id, "reject", { reason }, `Đã ${isNew ? "từ chối" : "hủy"} đơn #${o.id}${o.status === "Paid" ? " — đã hoàn điểm cho khách" : ""}`);
  }

  function decideRefund(o: BoardOrder, decision: "full" | "partial" | "none") {
    const money = paidMoney(o);
    if (decision === "full") {
      if (window.confirm(`Hoàn 100% (${formatVnd(money)}) thành điểm cho khách đơn #${o.id}?`)) void act(o.id, "refund-decision", { decision }, `Đã hoàn điểm đơn #${o.id}`);
    } else if (decision === "partial") {
      const v = window.prompt(`Số điểm hoàn cho đơn #${o.id} (tối đa ~${money.toLocaleString("vi-VN")}):`, String(Math.round(money / 2)));
      if (v !== null) void act(o.id, "refund-decision", { decision, points: Number(v.replace(/D/g, "")) }, `Đã hoàn một phần đơn #${o.id}`);
    } else {
      const note = window.prompt(`Không hoàn tiền đơn #${o.id}. Ghi chú lý do:`, "Lỗi phía khách");
      if (note !== null) void act(o.id, "refund-decision", { decision, note }, `Đã đánh dấu không hoàn đơn #${o.id}`);
    }
  }
  const onlineCount = shippers.filter((s) => s.shipperOnline).length;

  return (
    <section className="pd-panel">
      <div className="pd-head">
        <h2><Bike size={18} /> Đơn giao hàng</h2>
        <div className="pd-shippers">
          <span className="pd-sub">{onlineCount}/{shippers.length} tài xế online</span>
          {shippers.map((s) => (
            <span key={s.id} className={`pd-chip${s.shipperOnline ? (s.activeOrders ? " busy" : " free") : ""}`} title={s.phone ?? ""}>
              {s.fullName}
              {s.shipperOnline ? (s.activeOrders ? ` · ${s.activeOrders} đơn` : " · rảnh") : " · nghỉ"}
            </span>
          ))}
        </div>
      </div>

      <div className="pd-tabs" role="tablist">
        {COLUMNS.map((c) => (
          <button key={c.key} type="button" role="tab" aria-selected={col === c.key} className={col === c.key ? "active" : ""} onClick={() => setCol(c.key)}>
            {c.title}
            {counts[c.key] > 0 && <em className={c.key === "new" || c.key === "refund" ? "hot" : ""}>{counts[c.key]}</em>}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="pd-empty">Không có đơn.</div>
      ) : (
        <div className="pd-grid">
          {list.map((o) => {
            const ready = o.details.filter((d) => ["Ready", "Served"].includes(d.kdsStatus)).length;
            return (
              <div key={o.id} className={`pd-card pd-${o.deliveryStatus}`}>
                <div className="pd-card-top">
                  <strong>#{o.id}</strong>
                  <span className="pd-badge">{deliveryLabel(o.deliveryStatus)}</span>
                </div>
                <div className="pd-line"><b>{o.customer?.fullName ?? "Khách"}</b>{o.customer?.phone && <a href={`tel:${o.customer.phone}`}><Phone size={12} /> {o.customer.phone}</a>}</div>
                <div className="pd-line pd-sub"><MapPin size={12} /> {o.deliveryAddress}</div>
                <div className="pd-items">{o.details.map((d) => `${d.quantity}× ${d.product.name}`).join(", ")}</div>
                <div className="pd-line">
                  <span>{o.status === "Paid" ? <span className="pd-paid">Đã trả online</span> : <b>Chưa thanh toán</b>}{o.shippingFee > 0 && <> · ship {formatVnd(o.shippingFee)}</>}</span>
                  <span className="pd-sub">{new Date(o.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                {o.deliveryStatus === "Preparing" && (
                  <div className="pd-progress"><span style={{ width: `${(ready / Math.max(1, o.details.length)) * 100}%` }} /><em>{ready}/{o.details.length} món xong</em></div>
                )}
                {o.shipper && <div className="pd-line pd-sub">{o.shipper.fullName}{o.routeSeq ? ` · điểm #${o.routeSeq}` : ""}</div>}
                {o.deliveryStatus === "Ready" && <div className="pd-line pd-sub">Đang chờ tài xế rảnh…</div>}
                {(o.deliveryStatus === "Failed" || o.deliveryStatus === "Rejected") && <div className="pd-line" style={{ color: "var(--danger)" }}>{o.deliveryNote}</div>}
                {o.refundStatus === "Refunded" && <div className="pd-line pd-paid">Đã hoàn {o.refundPoints.toLocaleString("vi-VN")} điểm cho khách</div>}
                {o.refundStatus === "Declined" && <div className="pd-line pd-sub">Không hoàn tiền</div>}
                {o.refundStatus === "Pending" && (
                  canDecideRefund ? (
                    <div className="pd-actions">
                      <button type="button" className="btn btn-primary" disabled={busyId === o.id} onClick={() => decideRefund(o, "full")}>Hoàn 100%</button>
                      <button type="button" className="btn btn-ghost" disabled={busyId === o.id} onClick={() => decideRefund(o, "partial")}>Một phần</button>
                      <button type="button" className="btn btn-ghost pd-danger" disabled={busyId === o.id} onClick={() => decideRefund(o, "none")}>Không hoàn</button>
                    </div>
                  ) : (
                    <div className="pd-line pd-sub">Chờ quản lý quyết định hoàn tiền</div>
                  )
                )}
                {o.deliveryProofUrl && (
                  <a href={mediaUrl(o.deliveryProofUrl)} target="_blank" rel="noreferrer" className="pd-proof">
                    <img src={mediaUrl(o.deliveryProofUrl)} alt={`Ảnh giao #${o.id}`} />
                  </a>
                )}

                {o.deliveryStatus === "Awaiting_Confirm" && (
                  <div className="pd-actions">
                    <button type="button" className="btn btn-primary" disabled={busyId === o.id} onClick={() => act(o.id, "confirm", undefined, `Đã xác nhận đơn #${o.id} — chuyển bếp`)}>
                      <Check size={16} /> Xác nhận
                    </button>
                    <button type="button" className="btn btn-ghost pd-danger" disabled={busyId === o.id} onClick={() => cancelByStore(o)}>
                      <X size={16} /> Từ chối
                    </button>
                  </div>
                )}
                {STORE_CANCELLABLE.includes(o.deliveryStatus) && o.deliveryStatus !== "Awaiting_Confirm" && (
                  <div className="pd-actions">
                    <button type="button" className="btn btn-ghost pd-danger" disabled={busyId === o.id} onClick={() => cancelByStore(o)}>
                      <X size={16} /> Hủy đơn{o.status === "Paid" ? " · hoàn điểm" : ""}
                    </button>
                  </div>
                )}
                {(o.deliveryStatus === "Ready" || o.deliveryStatus === "Assigned") && (
                  <select
                    className="input pd-select"
                    value=""
                    disabled={busyId === o.id}
                    onChange={(e) => e.target.value && void act(o.id, "assign", { shipperId: Number(e.target.value) }, `Đã gán đơn #${o.id}`)}
                  >
                    <option value="">{o.shipper ? "Đổi tài xế…" : "Gán tài xế thủ công…"}</option>
                    {shippers.filter((s) => s.id !== o.shipperId).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName} {s.shipperOnline ? `(${s.activeOrders} đơn)` : "(đang nghỉ)"}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
