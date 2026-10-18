import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Bike, Check, MapPin, Phone, X } from "lucide-react";
import { apiOrigin, mediaUrl } from "../lib/api";
import { staffApi } from "../lib/staffApi";
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
  codAmount: number;
  routeSeq: number | null;
  shipperId: number | null;
  customer: { fullName: string; phone: string | null } | null;
  shipper: { id: number; fullName: string } | null;
  details: { id: number; quantity: number; kdsStatus: string; product: { name: string } }[];
};
type BoardShipper = { id: number; fullName: string; phone: string | null; shipperOnline: boolean; activeOrders: number };

const COLUMNS: { key: string; title: string; statuses: string[] }[] = [
  { key: "new", title: "Chờ xác nhận", statuses: ["Awaiting_Confirm"] },
  { key: "kitchen", title: "Đang pha chế", statuses: ["Preparing"] },
  { key: "dispatch", title: "Chờ / Đã gán tài xế", statuses: ["Ready", "Assigned"] },
  { key: "road", title: "Đang giao", statuses: ["Delivering"] },
  { key: "done", title: "Hoàn tất", statuses: ["Delivered", "Failed"] },
];

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
    const socket: Socket = io(apiOrigin(), { transports: ["websocket", "polling"] });
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

  const counts = Object.fromEntries(COLUMNS.map((c) => [c.key, orders.filter((o) => c.statuses.includes(o.deliveryStatus)).length]));
  const list = orders.filter((o) => COLUMNS.find((c) => c.key === col)!.statuses.includes(o.deliveryStatus));
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
            {counts[c.key] > 0 && <em className={c.key === "new" ? "hot" : ""}>{counts[c.key]}</em>}
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
                  <span>{o.codAmount > 0 ? <>COD <b>{formatVnd(o.codAmount)}</b></> : <span className="pd-paid">Đã trả online</span>}</span>
                  <span className="pd-sub">{new Date(o.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                {o.deliveryStatus === "Preparing" && (
                  <div className="pd-progress"><span style={{ width: `${(ready / Math.max(1, o.details.length)) * 100}%` }} /><em>{ready}/{o.details.length} món xong</em></div>
                )}
                {o.shipper && <div className="pd-line pd-sub">{o.shipper.fullName}{o.routeSeq ? ` · điểm #${o.routeSeq}` : ""}</div>}
                {o.deliveryStatus === "Ready" && <div className="pd-line pd-sub">Đang chờ tài xế rảnh…</div>}
                {o.deliveryStatus === "Failed" && <div className="pd-line" style={{ color: "var(--danger)" }}>{o.deliveryNote}</div>}
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
                    <button
                      type="button"
                      className="btn btn-ghost pd-danger"
                      disabled={busyId === o.id}
                      onClick={() => {
                        const reason = window.prompt("Lý do từ chối đơn:", "Hết món / quá tải");
                        if (reason !== null) void act(o.id, "reject", { reason }, `Đã từ chối đơn #${o.id}`);
                      }}
                    >
                      <X size={16} /> Từ chối
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
