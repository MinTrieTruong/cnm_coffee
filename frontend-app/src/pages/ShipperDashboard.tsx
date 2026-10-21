import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Socket } from "socket.io-client";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Camera, CheckCircle2, ChevronDown, ChevronUp, Crosshair, MapPin, Navigation, Package, Phone, Power, RefreshCw, Store, X, XCircle, Bike } from "lucide-react";
import { mediaUrl } from "../lib/api";
import { getStaffInfo, staffApi, staffSocket as openStaffSocket, isAdminRole } from "../lib/staffApi";
import {
  compressImage, fetchRoadRoute, formatKm, formatVnd, googleMapsDir, haversineKm,
  meIcon, stopIcon, storeIcon, type LatLng,
} from "../lib/delivery";

type Detail = { id: number; quantity: number; customNotes: string | null; product: { name: string } };
type ShipOrder = {
  id: number;
  status: string;
  deliveryStatus: "Assigned" | "Delivering" | "Delivered" | "Failed";
  deliveryAddress: string | null;
  customerLat: number | null;
  customerLng: number | null;
  shippingFee: number;
  totalAmount: number;
  routeSeq: number | null;
  etaMinutes?: number;
  deliveredAt: string | null;
  deliveryProofUrl: string | null;
  deliveryNote: string | null;
  customer: { fullName: string; phone: string | null } | null;
  details: Detail[];
};
type MeData = {
  me: { id: number; fullName: string; phone: string | null; online: boolean; lastLat: number | null; lastLng: number | null };
  store: LatLng & { address: string | null };
  orders: ShipOrder[];
  history: ShipOrder[];
  stats: { deliveredToday: number; failedToday: number; shippingFeeToday: number; shippingFeeMonth: number };
};

const FAIL_REASONS = [
  "Không liên lạc được khách",
  "Khách từ chối nhận hàng",
  "Sai địa chỉ / không tìm thấy",
  "Hàng bị đổ vỡ",
];

function beep() {
  try {
    const ctx = new AudioContext();
    [880, 1175, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.start(t);
      o.stop(t + 0.17);
    });
  } catch {
    /* trình duyệt chặn âm thanh */
  }
}

function FitTo({ points, trigger }: { points: LatLng[]; trigger: string }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 16);
    else map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, map]);
  return null;
}

function Recenter({ to, nonce }: { to: LatLng | null; nonce: number }) {
  const map = useMap();
  useEffect(() => {
    if (to && nonce) map.flyTo([to.lat, to.lng], 16, { duration: 0.6 });
  }, [nonce, map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function ShipperDashboard() {
  const info = getStaffInfo();
  const allowed = !!info && (info.role === "Shipper" || isAdminRole(info.role));

  const [data, setData] = useState<MeData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Tab theo ?view= để khớp thanh điều hướng đáy (Đơn giao / Bản đồ tuyến / Lịch sử giao)
  const [params, setParams] = useSearchParams();
  const view = params.get("view");
  const tab: "now" | "history" = view === "history" ? "history" : "now";
  const setTab = (t: "now" | "history") => setParams(t === "history" ? { view: "history" } : {}, { replace: true });
  const [busy, setBusy] = useState(false);
  const [gps, setGps] = useState<(LatLng & { acc: number }) | null>(null);
  const [gpsErr, setGpsErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [alertOrder, setAlertOrder] = useState<number | null>(null);
  const [proofFor, setProofFor] = useState<ShipOrder | null>(null);
  const [failFor, setFailFor] = useState<ShipOrder | null>(null);
  const [road, setRoad] = useState<{ path: [number, number][]; km: number; minutes: number; approx?: boolean } | null>(null);
  const [recenterNonce, setRecenterNonce] = useState(0);
  const lastSent = useRef<{ t: number; p: LatLng } | null>(null);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    try {
      setData(await staffApi<MeData>("/api/shipper/me"));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Không tải được dữ liệu");
    }
  }, []);

  /* Socket: nhận đơn mới / cập nhật */
  useEffect(() => {
    if (!allowed || !info) return;
    void load();
    const socket: Socket = openStaffSocket();
    socket.emit("join", `staff_${info.id}`);
    socket.on("shipper:new_order", (p: { orderId: number }) => {
      setAlertOrder(p.orderId);
      beep();
      navigator.vibrate?.([300, 120, 300, 120, 300]);
      void load();
    });
    socket.on("shipper:refresh", () => void load());
    const poll = window.setInterval(() => void load(), 30_000);
    return () => {
      socket.disconnect();
      window.clearInterval(poll);
    };
  }, [allowed, info?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const online = data?.me.online ?? false;

  /* GPS: theo dõi khi đang online, gửi lên server (tối đa 5s/lần, hoặc khi di chuyển > 15m) */
  useEffect(() => {
    if (!online) return;
    if (!navigator.geolocation) {
      setGpsErr("Thiết bị không hỗ trợ GPS");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
        setGps(p);
        setGpsErr(null);
        const now = Date.now();
        const prev = lastSent.current;
        const moved = prev ? haversineKm(prev.p, p) * 1000 : Infinity;
        if (!prev || (now - prev.t > 5000 && moved > 15) || now - prev.t > 20000) {
          lastSent.current = { t: now, p };
          staffApi("/api/shipper/location", {
            method: "POST",
            body: JSON.stringify({ lat: p.lat, lng: p.lng, heading: pos.coords.heading }),
          }).catch(() => undefined);
        }
      },
      (e) => setGpsErr(e.code === 1 ? "Bạn chưa cấp quyền vị trí cho trình duyệt" : `Lỗi GPS: ${e.message}`),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [online]);

  const orders = useMemo(() => data?.orders ?? [], [data]);
  const toPickup = orders.filter((o) => o.deliveryStatus === "Assigned");
  const delivering = orders.filter((o) => o.deliveryStatus === "Delivering");
  const store = data?.store ?? null;
  const here: LatLng | null = gps ?? (data?.me.lastLat != null ? { lat: data.me.lastLat, lng: data.me.lastLng! } : null);

  /* Đường đi thực tế theo tuyến tối ưu: (vị trí) → [quán nếu chưa lấy] → các điểm giao */
  const routeKey = orders.map((o) => `${o.id}:${o.deliveryStatus}:${o.routeSeq}`).join("|");
  const hereRounded = here ? `${here.lat.toFixed(3)},${here.lng.toFixed(3)}` : "";
  useEffect(() => {
    if (!store || !orders.length) {
      setRoad(null);
      return;
    }
    const pts: LatLng[] = [];
    if (here) pts.push(here);
    if (toPickup.length) pts.push(store);
    for (const o of orders) if (o.customerLat != null && o.customerLng != null) pts.push({ lat: o.customerLat, lng: o.customerLng });
    let alive = true;
    void fetchRoadRoute(pts).then((r) => alive && setRoad(r));
    return () => {
      alive = false;
    };
  }, [routeKey, hereRounded, store?.lat]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleOnline() {
    setBusy(true);
    try {
      await staffApi("/api/shipper/online", { method: "POST", body: JSON.stringify({ online: !online }) });
      await load();
      flash(!online ? "Đã bật nhận đơn" : "Đã tạm nghỉ");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  async function pickupAll() {
    setBusy(true);
    try {
      await staffApi("/api/shipper/pickup", { method: "POST", body: JSON.stringify({}) });
      await load();
      flash("Bắt đầu giao — tuyến đã được tối ưu");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) {
    return (
      <div className="sp-denied">
        <h2>Truy cập bị từ chối</h2>
        <p>Trang này chỉ dành cho nhân viên giao hàng.</p>
        <Link to="/staff/login" className="btn btn-primary">Đăng nhập nhân sự</Link>
      </div>
    );
  }

  const mapPoints: LatLng[] = [
    ...(here ? [here] : []),
    ...(store && (toPickup.length || !orders.length) ? [store] : []),
    ...orders.filter((o) => o.customerLat != null).map((o) => ({ lat: o.customerLat!, lng: o.customerLng! })),
  ];
  const nextStop = delivering[0];

  return (
    <div className="sp-app">
      {/* ── Thanh trạng thái ── */}
      <div className="sp-topbar">
        <div className="sp-avatar">{(data?.me.fullName ?? info!.fullName ?? "S").slice(0, 1)}</div>
        <div className="sp-who">
          <strong>{data?.me.fullName ?? info!.fullName}</strong>
          <span className={online ? "sp-dot sp-dot-on" : "sp-dot"}>{online ? "Đang nhận đơn" : "Tạm nghỉ"}</span>
        </div>
        <button
          type="button"
          className={online ? "sp-switch sp-switch-on" : "sp-switch"}
          onClick={toggleOnline}
          disabled={busy || !data}
          aria-pressed={online}
          aria-label={online ? "Tắt nhận đơn" : "Bật nhận đơn"}
        >
          <span className="sp-switch-knob"><Power size={14} /></span>
        </button>
      </div>

      {/* ── Bản đồ ── */}
      <div className={view === "map" ? "sp-map sp-map-tall" : "sp-map"}>
        {store && (
          <MapContainer center={[store.lat, store.lng]} zoom={15} zoomControl={false} style={{ height: "100%", width: "100%" }}>
            <TileLayer attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker position={[store.lat, store.lng]} icon={storeIcon} />
            {orders.map((o, i) =>
              o.customerLat != null && o.customerLng != null ? (
                <Marker
                  key={o.id}
                  position={[o.customerLat, o.customerLng]}
                  icon={stopIcon(i + 1, nextStop?.id === o.id)}
                  eventHandlers={{ click: () => setExpanded(o.id) }}
                />
              ) : null,
            )}
            {here && <Marker position={[here.lat, here.lng]} icon={meIcon} />}
            {road && <Polyline positions={road.path} pathOptions={{ color: "#1d4ed8", weight: 5, opacity: 0.8 }} />}
            <FitTo points={mapPoints} trigger={routeKey || "empty"} />
            <Recenter to={here} nonce={recenterNonce} />
          </MapContainer>
        )}
        <button type="button" className="sp-map-btn" onClick={() => setRecenterNonce((n) => n + 1)} aria-label="Về vị trí của tôi">
          <Crosshair size={20} />
        </button>
        {road && orders.length > 0 && (
          <div className="sp-map-chip">
            <Navigation size={14} /> {formatKm(road.km)} · ~{Math.max(1, Math.round(road.minutes))} phút
            {road.approx ? " (ước tính)" : ""}
          </div>
        )}
        {gpsErr && online && <div className="sp-map-warn">{gpsErr}</div>}
      </div>

      {/* ── Bottom sheet ── */}
      <div className="sp-sheet">
        <div className="sp-stats">
          <div><b>{data?.stats.deliveredToday ?? 0}</b><span>Đơn đã giao</span></div>
          <div><b>{formatVnd(data?.stats.shippingFeeToday ?? 0)}</b><span>Phí ship hôm nay</span></div>
          <div><b>{formatVnd(data?.stats.shippingFeeMonth ?? 0)}</b><span>Phí ship tháng (cộng lương)</span></div>
        </div>

        <div className="sp-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "now"} className={tab === "now" ? "active" : ""} onClick={() => setTab("now")}>
            Đơn hiện tại {orders.length > 0 && <em>{orders.length}</em>}
          </button>
          <button type="button" role="tab" aria-selected={tab === "history"} className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
            Lịch sử hôm nay
          </button>
          <button type="button" className="sp-refresh" onClick={() => void load()} aria-label="Làm mới"><RefreshCw size={16} /></button>
        </div>

        {err && <div className="sp-error">{err}</div>}

        {tab === "now" && (
          <>
            {!data ? (
              <div className="sp-empty">Đang tải…</div>
            ) : !online && orders.length === 0 ? (
              <div className="sp-empty">
                <div className="sp-empty-icon"><Power size={28} /></div>
                <strong>Bạn đang tạm nghỉ</strong>
                <p>Bật nhận đơn để hệ thống tự động gán đơn giao hàng cho bạn.</p>
                <button type="button" className="sp-btn sp-btn-primary" onClick={toggleOnline} disabled={busy}>Bật nhận đơn</button>
              </div>
            ) : orders.length === 0 ? (
              <div className="sp-empty">
                <div className="sp-radar"><span /><span /><Package size={26} /></div>
                <strong>Đang chờ đơn mới…</strong>
                <p>Đơn sẽ được gán tự động khi quán pha chế xong. Giữ ứng dụng mở để nhận thông báo.</p>
              </div>
            ) : (
              <div className="sp-list">
                {toPickup.length > 0 && store && (
                  <div className="sp-card sp-card-pickup">
                    <div className="sp-card-head">
                      <span className="sp-step"><Store size={16} /></span>
                      <div>
                        <div className="sp-kicker">Bước 1 · Đến quán lấy hàng</div>
                        <strong>TD Coffee</strong>
                        <div className="sp-sub">{store.address ?? `${store.lat.toFixed(5)}, ${store.lng.toFixed(5)}`}</div>
                        {here && <div className="sp-sub">Cách bạn {formatKm(haversineKm(here, store))}</div>}
                      </div>
                    </div>
                    <ul className="sp-pick-list">
                      {toPickup.map((o) => (
                        <li key={o.id}>
                          <span>#{o.id}</span>
                          <span>{o.details.reduce((s, d) => s + d.quantity, 0)} món</span>
                          <span>Phí ship {o.shippingFee > 0 ? formatVnd(o.shippingFee) : "0 đ"}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="sp-actions">
                      <a className="sp-btn sp-btn-ghost" href={googleMapsDir(store, here)} target="_blank" rel="noreferrer">
                        <Navigation size={16} /> Chỉ đường
                      </a>
                      <button type="button" className="sp-btn sp-btn-primary" onClick={pickupAll} disabled={busy}>
                        <Package size={16} /> Đã lấy {toPickup.length} đơn
                      </button>
                    </div>
                  </div>
                )}

                {orders.map((o, i) => {
                  const dest = o.customerLat != null ? { lat: o.customerLat, lng: o.customerLng! } : null;
                  const isNext = nextStop?.id === o.id;
                  const open = expanded === o.id || isNext;
                  const pending = o.deliveryStatus === "Assigned";
                  return (
                    <div key={o.id} className={`sp-card${isNext ? " sp-card-next" : ""}${pending ? " sp-card-muted" : ""}`}>
                      <button type="button" className="sp-card-head sp-card-toggle" onClick={() => setExpanded(open && !isNext ? null : o.id)}>
                        <span className={`sp-seq${isNext ? " active" : ""}`}>{i + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="sp-kicker">
                            {isNext ? "Điểm giao tiếp theo" : pending ? "Chờ lấy hàng" : "Điểm giao"} · #{o.id}
                            {o.etaMinutes != null && ` · ~${o.etaMinutes} phút`}
                          </div>
                          <strong className="sp-name">{o.customer?.fullName ?? "Khách hàng"}</strong>
                          <div className="sp-sub sp-addr"><MapPin size={13} /> {o.deliveryAddress}</div>
                        </div>
                        <div className="sp-right">
                          <span className="sp-pill sp-pill-paid">Đã trả</span>
                          {here && dest && <span className="sp-sub">{formatKm(haversineKm(here, dest))}</span>}
                          {!isNext && (open ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                        </div>
                      </button>

                      {open && (
                        <div className="sp-card-body">
                          <ul className="sp-items">
                            {o.details.map((d) => (
                              <li key={d.id}>
                                <span>{d.quantity}×</span> {d.product.name}
                                {d.customNotes && <em> — {d.customNotes}</em>}
                              </li>
                            ))}
                          </ul>
                          <div className="sp-actions">
                            {o.customer?.phone && (
                              <a className="sp-btn sp-btn-ghost sp-btn-icon" href={`tel:${o.customer.phone}`} aria-label="Gọi khách">
                                <Phone size={18} />
                              </a>
                            )}
                            {dest && (
                              <a className="sp-btn sp-btn-ghost" href={googleMapsDir(dest, here)} target="_blank" rel="noreferrer">
                                <Navigation size={16} /> Chỉ đường
                              </a>
                            )}
                            {o.deliveryStatus === "Delivering" && (
                              <>
                                <button type="button" className="sp-btn sp-btn-danger-ghost sp-btn-icon" onClick={() => setFailFor(o)} aria-label="Giao thất bại">
                                  <XCircle size={18} />
                                </button>
                                <button type="button" className="sp-btn sp-btn-success" onClick={() => setProofFor(o)}>
                                  <Camera size={16} /> Đã giao
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === "history" && (
          <div className="sp-list">
            {!data?.history.length ? (
              <div className="sp-empty">Chưa có đơn nào hôm nay.</div>
            ) : (
              data.history.map((o) => (
                <div key={o.id} className="sp-card sp-hist">
                  {o.deliveryProofUrl ? (
                    <a href={mediaUrl(o.deliveryProofUrl)} target="_blank" rel="noreferrer">
                      <img src={mediaUrl(o.deliveryProofUrl)} alt={`Ảnh giao đơn #${o.id}`} />
                    </a>
                  ) : (
                    <div className="sp-hist-noimg"><Package size={20} /></div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="sp-kicker">
                      #{o.id} · {o.deliveredAt ? new Date(o.deliveredAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : ""}
                    </div>
                    <strong className="sp-name">{o.customer?.fullName ?? "Khách hàng"}</strong>
                    <div className="sp-sub sp-addr">{o.deliveryAddress}</div>
                    {o.deliveryStatus === "Failed" && <div className="sp-sub" style={{ color: "var(--danger)" }}>{o.deliveryNote}</div>}
                  </div>
                  <span className={o.deliveryStatus === "Delivered" ? "sp-pill sp-pill-paid" : "sp-pill sp-pill-fail"}>
                    {o.deliveryStatus === "Delivered" ? "Đã giao" : "Thất bại"}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Thông báo đơn mới ── */}
      {alertOrder && (
        <div className="sp-overlay" role="alertdialog" aria-label="Đơn mới">
          <div className="sp-alert">
            <div className="sp-alert-icon"><Bike size={40} aria-hidden /></div>
            <h3>Bạn có đơn mới #{alertOrder}</h3>
            <p>Hệ thống đã gán đơn cho bạn. Hãy đến quán lấy hàng.</p>
            <button type="button" className="sp-btn sp-btn-primary sp-btn-block" onClick={() => setAlertOrder(null)}>Đã hiểu</button>
          </div>
        </div>
      )}

      {proofFor && (
        <ProofSheet
          order={proofFor}
          onClose={() => setProofFor(null)}
          onDone={async (fee) => {
            setProofFor(null);
            flash(fee > 0 ? `Giao thành công · +${formatVnd(fee)} phí ship` : "Giao thành công!");
            await load();
          }}
        />
      )}
      {failFor && (
        <FailSheet
          order={failFor}
          onClose={() => setFailFor(null)}
          onDone={async () => {
            setFailFor(null);
            flash("Đã báo giao thất bại");
            await load();
          }}
        />
      )}

      {toast && <div className="sp-toast">{toast}</div>}
    </div>
  );
}

/* ═══════════ Bottom sheet: chụp ảnh xác nhận đã giao ═══════════ */
function ProofSheet({ order, onClose, onDone }: { order: ShipOrder; onClose: () => void; onDone: (shippingFee: number) => void }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      setPhoto(await compressImage(f));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Không đọc được ảnh");
    }
  }

  async function submit() {
    if (!photo) return setErr("Vui lòng chụp ảnh xác nhận");
    setBusy(true);
    try {
      const r = await staffApi<{ shippingFeeEarned: number }>(`/api/shipper/orders/${order.id}/deliver`, {
        method: "POST",
        body: JSON.stringify({ photo, note }),
      });
      onDone(r.shippingFeeEarned);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi");
      setBusy(false);
    }
  }

  return (
    <div className="sp-overlay" onClick={(e) => e.target === e.currentTarget && !busy && onClose()} role="presentation">
      <div className="sp-bottom" role="dialog" aria-label="Xác nhận đã giao">
        <div className="sp-bottom-head">
          <strong>Xác nhận giao đơn #{order.id}</strong>
          <button type="button" className="sp-x" onClick={onClose} disabled={busy} aria-label="Đóng"><X size={20} /></button>
        </div>
        <div className="sp-paid-big">Khách đã thanh toán online — không thu tiền</div>
        <input ref={inputRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
        {photo ? (
          <div className="sp-photo">
            <img src={photo} alt="Ảnh xác nhận" />
            <button type="button" className="sp-btn sp-btn-ghost" onClick={() => inputRef.current?.click()} disabled={busy}>
              <Camera size={16} /> Chụp lại
            </button>
          </div>
        ) : (
          <button type="button" className="sp-photo-empty" onClick={() => inputRef.current?.click()}>
            <Camera size={32} />
            <span>Chụp ảnh hàng đã giao / giao cho khách</span>
          </button>
        )}
        <input className="input" placeholder="Ghi chú (tuỳ chọn): để ở bảo vệ, giao tận tay…" value={note} onChange={(e) => setNote(e.target.value)} />
        {err && <div className="sp-error">{err}</div>}
        <button type="button" className="sp-btn sp-btn-success sp-btn-block" onClick={submit} disabled={busy || !photo}>
          <CheckCircle2 size={18} /> {busy ? "Đang gửi…" : "Hoàn tất giao hàng"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════ Bottom sheet: giao thất bại ═══════════ */
function FailSheet({ order, onClose, onDone }: { order: ShipOrder; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(FAIL_REASONS[0]);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const r = reason === "other" ? custom.trim() : reason;
    if (!r) return setErr("Nhập lý do");
    setBusy(true);
    try {
      await staffApi(`/api/shipper/orders/${order.id}/fail`, { method: "POST", body: JSON.stringify({ reason: r }) });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi");
      setBusy(false);
    }
  }

  return (
    <div className="sp-overlay" onClick={(e) => e.target === e.currentTarget && !busy && onClose()} role="presentation">
      <div className="sp-bottom" role="dialog" aria-label="Giao thất bại">
        <div className="sp-bottom-head">
          <strong>Giao thất bại · #{order.id}</strong>
          <button type="button" className="sp-x" onClick={onClose} disabled={busy} aria-label="Đóng"><X size={20} /></button>
        </div>
        <p className="sp-sub" style={{ margin: 0 }}>Hãy gọi cho khách ít nhất 2 lần trước khi báo thất bại.</p>
        <div className="sp-reasons">
          {[...FAIL_REASONS, "other"].map((r) => (
            <button key={r} type="button" className={reason === r ? "active" : ""} onClick={() => setReason(r)}>
              {r === "other" ? "Lý do khác" : r}
            </button>
          ))}
        </div>
        {reason === "other" && <input className="input" placeholder="Nhập lý do…" value={custom} onChange={(e) => setCustom(e.target.value)} />}
        {err && <div className="sp-error">{err}</div>}
        <button type="button" className="sp-btn sp-btn-danger sp-btn-block" onClick={submit} disabled={busy}>
          {busy ? "Đang gửi…" : "Xác nhận giao thất bại"}
        </button>
      </div>
    </div>
  );
}
