import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { ArrowLeft, Check, ChefHat, Clock, MapPin, Phone, Receipt, Store, Truck } from "lucide-react";
import { api, apiOrigin, mediaUrl } from "../lib/api";
import {
  deliveryLabel, fetchRoadRoute, formatVnd, homeIcon, riderIcon, storeIcon, type LatLng,
} from "../lib/delivery";

type Tracking = {
  id: number;
  status: string;
  deliveryStatus: string | null;
  deliveryAddress: string | null;
  deliveryNote: string | null;
  deliveryProofUrl: string | null;
  customer: { lat: number | null; lng: number | null; name: string | null };
  store: LatLng & { address: string | null };
  shipper: { id: number; fullName: string; phone: string | null; lat: number | null; lng: number | null; at: string | null } | null;
  timeline: Record<"createdAt" | "confirmedAt" | "readyAt" | "assignedAt" | "pickedUpAt" | "deliveredAt", string | null>;
  stopsBefore: number;
  etaMinutes: number | null;
  items: { id: number; name: string; quantity: number; unitPrice: number }[];
  subTotal: number;
  shippingFee: number;
  totalAmount: number;
  refundStatus: string | null;
  refundPoints: number;
  /** Còn được tự hủy tới lúc nào (null = không) và số điểm sẽ nhận lại */
  cancelUntil: string | null;
  refundPreview: number | null;
};

const STEPS = [
  { key: "createdAt", label: "Đã đặt", icon: Receipt },
  { key: "confirmedAt", label: "Quán nhận", icon: Store },
  { key: "readyAt", label: "Pha xong", icon: ChefHat },
  { key: "pickedUpAt", label: "Đang giao", icon: Truck },
  { key: "deliveredAt", label: "Đã giao", icon: Check },
] as const;

function stepIndex(t: Tracking) {
  switch (t.deliveryStatus) {
    case "Delivered": return 4;
    case "Delivering": return 3;
    case "Ready":
    case "Assigned": return 2;
    case "Preparing": return 1;
    default: return 0;
  }
}

function headline(t: Tracking) {
  switch (t.deliveryStatus) {
    case null: return "Chờ bạn xác nhận thanh toán";
    case "Awaiting_Confirm": return "Đang chờ quán xác nhận đơn";
    case "Preparing": return "Quán đang pha chế đồ uống của bạn";
    case "Ready": return "Đồ uống đã xong, đang tìm tài xế";
    case "Assigned": return "Tài xế đang đến quán lấy hàng";
    case "Delivering":
      return t.stopsBefore > 0
        ? `Tài xế đang giao ${t.stopsBefore} đơn trước bạn`
        : "Tài xế đang trên đường đến bạn";
    case "Delivered": return "Giao hàng thành công";
    case "Failed": return "Giao hàng không thành công";
    case "Rejected": return "Đơn hàng đã bị hủy";
    default: return deliveryLabel(t.deliveryStatus);
  }
}

function fmtTime(s: string | null) {
  return s ? new Date(s).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "";
}

function FitAll({ points, trigger }: { points: LatLng[]; trigger: string }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 16);
    else map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [48, 48], maxZoom: 16 });
  }, [trigger, map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function OrderTracking() {
  const { id } = useParams();
  const orderId = Number(id);
  const [t, setT] = useState<Tracking | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rider, setRider] = useState<LatLng | null>(null);
  const [road, setRoad] = useState<[number, number][] | null>(null);
  const [showItems, setShowItems] = useState(false);
  const loadedOnce = useRef(false);
  const [cancelLeft, setCancelLeft] = useState(0);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    if (Number.isNaN(orderId)) return;
    try {
      const d = await api<Tracking>(`/api/orders/${orderId}/tracking`);
      setT(d);
      if (d.shipper?.lat != null && d.shipper.lng != null) setRider({ lat: d.shipper.lat, lng: d.shipper.lng });
      setErr(null);
      loadedOnce.current = true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Không tải được đơn");
    }
  }, [orderId]);

  useEffect(() => {
    void load();
    if (Number.isNaN(orderId)) return;
    const socket: Socket = io(apiOrigin(), { transports: ["websocket", "polling"] });
    const join = () => socket.emit("join", `tracking:${orderId}`);
    join();
    socket.on("connect", join);
    socket.on("delivery:location", (p: { lat: number; lng: number }) => setRider({ lat: p.lat, lng: p.lng }));
    socket.on("delivery:status", () => void load());
    // ETA / thứ tự điểm dừng thay đổi theo vị trí → làm mới định kỳ
    const poll = window.setInterval(() => void load(), 20_000);
    return () => {
      socket.disconnect();
      window.clearInterval(poll);
    };
  }, [orderId, load]);

  const dest: LatLng | null = t?.customer.lat != null && t.customer.lng != null ? { lat: t.customer.lat, lng: t.customer.lng } : null;
  const showRider = !!rider && (t?.deliveryStatus === "Assigned" || t?.deliveryStatus === "Delivering");

  /* Đường đi: tài xế → (quán nếu chưa lấy) → nhà bạn */
  const riderKey = rider ? `${rider.lat.toFixed(3)},${rider.lng.toFixed(3)}` : "";
  useEffect(() => {
    if (!t || !dest) return;
    const pts: LatLng[] = [];
    if (showRider && rider) {
      pts.push(rider);
      if (t.deliveryStatus === "Assigned") pts.push(t.store);
    } else if (["Awaiting_Confirm", "Preparing", "Ready", null].includes(t.deliveryStatus)) {
      pts.push(t.store);
    }
    if (!pts.length) {
      setRoad(null);
      return;
    }
    pts.push(dest);
    let alive = true;
    void fetchRoadRoute(pts).then((r) => alive && setRoad(r.path));
    return () => {
      alive = false;
    };
  }, [t?.deliveryStatus, riderKey, dest?.lat, dest?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const fitPoints = useMemo(() => {
    if (!t) return [];
    const p: LatLng[] = [];
    if (dest) p.push(dest);
    if (showRider && rider) p.push(rider);
    else p.push(t.store);
    return p;
  }, [t, dest, showRider, rider]);

  // Đếm ngược thời gian còn được tự hủy
  const cancelUntil = t?.cancelUntil ?? null;
  useEffect(() => {
    if (!cancelUntil) { setCancelLeft(0); return; }
    const end = new Date(cancelUntil).getTime();
    const tick = () => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setCancelLeft(left);
      return left;
    };
    tick();
    const iv = window.setInterval(() => { if (tick() <= 0) { window.clearInterval(iv); void load(); } }, 1000);
    return () => window.clearInterval(iv);
  }, [cancelUntil, load]);

  async function cancelOrder() {
    if (!t?.refundPreview) return;
    if (!window.confirm(`Hủy đơn #${t.id}? Số tiền đã thanh toán được hoàn 100% thành ${t.refundPreview.toLocaleString("vi-VN")} điểm.`)) return;
    setCancelling(true);
    try {
      await api(`/api/orders/${t.id}/cancel`, { method: "POST", body: "{}" });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Không hủy được đơn");
    } finally {
      setCancelling(false);
    }
  }

  if (err && !t) {
    return (
      <div className="tk-page">
        <div className="tk-error">{err}</div>
        <Link to="/account" className="btn btn-primary">Về tài khoản</Link>
      </div>
    );
  }
  if (!t) return <div className="tk-page"><div className="tk-loading">Đang tải hành trình…</div></div>;

  const step = stepIndex(t);
  const ended = ["Delivered", "Failed", "Rejected"].includes(t.deliveryStatus ?? "");
  const eta = t.etaMinutes != null && !ended ? new Date(Date.now() + t.etaMinutes * 60_000) : null;

  return (
    <div className="tk-page">
      <div className="tk-map">
        {dest || t.store ? (
          <MapContainer center={dest ? [dest.lat, dest.lng] : [t.store.lat, t.store.lng]} zoom={15} zoomControl={false} style={{ height: "100%", width: "100%" }}>
            <TileLayer attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker position={[t.store.lat, t.store.lng]} icon={storeIcon} />
            {dest && <Marker position={[dest.lat, dest.lng]} icon={homeIcon} />}
            {showRider && rider && <Marker position={[rider.lat, rider.lng]} icon={riderIcon} zIndexOffset={1000} />}
            {road && <Polyline positions={road} pathOptions={{ color: "#92400e", weight: 5, opacity: 0.85, dashArray: showRider ? undefined : "8 8" }} />}
            <FitAll points={fitPoints} trigger={`${t.deliveryStatus}-${showRider ? riderKey : ""}`} />
          </MapContainer>
        ) : null}
        <Link to="/account" className="tk-back" aria-label="Quay lại"><ArrowLeft size={20} /></Link>
      </div>

      <div className="tk-sheet">
        <div className="tk-grab" />
        <div className="tk-head">
          <div>
            <div className="tk-kicker">Đơn #{t.id}</div>
            <h1 className="tk-title">{headline(t)}</h1>
          </div>
          {eta && (
            <div className="tk-eta">
              <Clock size={14} />
              <span>Dự kiến</span>
              <b>{eta.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</b>
            </div>
          )}
        </div>

        {t.deliveryStatus !== "Rejected" && t.deliveryStatus !== "Failed" && (
          <ol className="tk-steps">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = i < step || (i === step && t.deliveryStatus === "Delivered");
              const cur = i === step && !done;
              return (
                <li key={s.key} className={done ? "done" : cur ? "current" : ""}>
                  <span className="tk-step-dot"><Icon size={14} /></span>
                  <span className="tk-step-label">{s.label}</span>
                  <span className="tk-step-time">{fmtTime(t.timeline[s.key])}</span>
                </li>
              );
            })}
          </ol>
        )}

        {(t.deliveryStatus === "Failed" || t.deliveryStatus === "Rejected") && t.deliveryNote && (
          <div className="tk-alert">Lý do: {t.deliveryNote}</div>
        )}
        {t.refundStatus === "Refunded" && (
          <div className="tk-note tk-note-ok">Đã hoàn {t.refundPoints.toLocaleString("vi-VN")} điểm vào tài khoản của bạn để dùng cho lần mua sau.</div>
        )}
        {t.refundStatus === "Pending" && <div className="tk-note">Quán đang xem xét hoàn tiền cho đơn này.</div>}
        {t.refundStatus === "Declined" && <div className="tk-note">Đơn này không được hoàn tiền.</div>}
        {t.cancelUntil && t.refundPreview != null && cancelLeft > 0 && (
          <button type="button" className="btn btn-ghost tk-cancel" disabled={cancelling} onClick={() => void cancelOrder()}>
            Hủy đơn, nhận lại {t.refundPreview.toLocaleString("vi-VN")} điểm · còn {Math.floor(cancelLeft / 60)}:{String(cancelLeft % 60).padStart(2, "0")}
          </button>
        )}

        {t.shipper && !["Rejected"].includes(t.deliveryStatus ?? "") && (
          <div className="tk-rider">
            <div className="tk-rider-ava">🛵</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{t.shipper.fullName}</strong>
              <div className="tk-sub">
                Tài xế TD Coffee
                {t.shipper.at && showRider && ` · cập nhật ${fmtTime(t.shipper.at)}`}
              </div>
            </div>
            {t.shipper.phone && !ended && (
              <a className="tk-call" href={`tel:${t.shipper.phone}`} aria-label="Gọi tài xế"><Phone size={18} /></a>
            )}
          </div>
        )}

        {t.deliveryStatus === "Delivered" && t.deliveryProofUrl && (
          <div className="tk-proof">
            <div className="tk-kicker">Ảnh xác nhận giao hàng · {fmtTime(t.timeline.deliveredAt)}</div>
            <a href={mediaUrl(t.deliveryProofUrl)} target="_blank" rel="noreferrer">
              <img src={mediaUrl(t.deliveryProofUrl)} alt="Ảnh xác nhận đã giao" />
            </a>
            {t.deliveryNote && <div className="tk-sub">Ghi chú: {t.deliveryNote}</div>}
          </div>
        )}

        <div className="tk-addr">
          <MapPin size={16} />
          <div>
            <div className="tk-kicker">Giao đến</div>
            <div>{t.deliveryAddress}</div>
          </div>
        </div>

        <button type="button" className="tk-items-toggle" onClick={() => setShowItems((v) => !v)}>
          <span>{t.items.reduce((s, i) => s + i.quantity, 0)} món · {formatVnd(t.totalAmount)}</span>
          <span className="tk-sub">{showItems ? "Ẩn" : "Xem chi tiết"}</span>
        </button>
        {showItems && (
          <div className="tk-items">
            {t.items.map((i) => (
              <div key={i.id}><span>{i.quantity}× {i.name}</span><span>{formatVnd(i.quantity * i.unitPrice)}</span></div>
            ))}
            <div className="tk-sub"><span>Phí giao hàng</span><span>{t.shippingFee ? formatVnd(t.shippingFee) : "Miễn phí"}</span></div>
            <div className="tk-total">
              <span>{t.status === "Paid" ? "Đã thanh toán" : "Chưa thanh toán"}</span>
              <span>{formatVnd(t.totalAmount)}</span>
            </div>
          </div>
        )}

        {t.deliveryStatus === null && (
          <Link to={`/order/${t.id}/checkout`} className="btn btn-primary btn-block" style={{ borderRadius: 999, marginTop: "0.75rem" }}>
            Tiếp tục thanh toán
          </Link>
        )}
      </div>
    </div>
  );
}
