import L from "leaflet";

export type LatLng = { lat: number; lng: number };

export type DeliveryStatus =
  | "Awaiting_Confirm"
  | "Preparing"
  | "Ready"
  | "Assigned"
  | "Delivering"
  | "Delivered"
  | "Failed"
  | "Rejected";

export const DELIVERY_LABEL: Record<DeliveryStatus, string> = {
  Awaiting_Confirm: "Chờ quán xác nhận",
  Preparing: "Đang pha chế",
  Ready: "Đang tìm tài xế",
  Assigned: "Tài xế đang tới quán",
  Delivering: "Đang giao hàng",
  Delivered: "Đã giao",
  Failed: "Giao thất bại",
  Rejected: "Đã hủy",
};

export function deliveryLabel(s: string | null | undefined) {
  if (!s) return "Chờ thanh toán";
  return DELIVERY_LABEL[s as DeliveryStatus] ?? s;
}

export function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + "đ";
}

export function haversineKm(a: LatLng, b: LatLng) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function formatKm(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/** Phí ship — khớp với backend (lib/delivery.ts) */
export function shippingFeeForDistance(km: number) {
  if (km <= 3) return 0;
  return 15000 + Math.ceil(km - 3) * 5000;
}

/**
 * Lấy hình dạng đường đi thật (theo đường phố) từ OSRM cho chuỗi điểm.
 * Lỗi mạng → trả về đường thẳng nối các điểm.
 */
const routeCache = new Map<string, { path: [number, number][]; km: number; minutes: number }>();
export async function fetchRoadRoute(points: LatLng[]) {
  const straight = {
    path: points.map((p) => [p.lat, p.lng] as [number, number]),
    km: points.slice(1).reduce((s, p, i) => s + haversineKm(points[i], p), 0) * 1.35,
    minutes: 0,
    approx: true,
  };
  straight.minutes = (straight.km / 22) * 60;
  if (points.length < 2) return straight;
  const key = points.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
  const hit = routeCache.get(key);
  if (hit) return { ...hit, approx: false };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${key}?overview=full&geometries=geojson`,
      { signal: ctrl.signal },
    );
    clearTimeout(t);
    const j = (await res.json()) as {
      routes?: { geometry: { coordinates: [number, number][] }; distance: number; duration: number }[];
    };
    const r = j.routes?.[0];
    if (!r) return straight;
    const out = {
      path: r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
      km: r.distance / 1000,
      minutes: r.duration / 60,
    };
    if (routeCache.size > 50) routeCache.clear();
    routeCache.set(key, out);
    return { ...out, approx: false };
  } catch {
    return straight;
  }
}

/** Nén ảnh chụp từ camera về JPEG ≤ 1280px để upload nhanh trên 4G */
export function compressImage(file: File, maxSize = 1280, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Không xử lý được ảnh"));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Không đọc được ảnh"));
    };
    img.src = url;
  });
}

/* ─────────────── Marker icons (divIcon, không phụ thuộc ảnh ngoài) ─────────────── */

export const storeIcon = L.divIcon({
  className: "dl-marker",
  html: `<div class="dl-pin dl-pin-store"><span>☕</span></div>`,
  iconSize: [36, 44],
  iconAnchor: [18, 42],
});

export const homeIcon = L.divIcon({
  className: "dl-marker",
  html: `<div class="dl-pin dl-pin-home"><span>🏠</span></div>`,
  iconSize: [36, 44],
  iconAnchor: [18, 42],
});

export function stopIcon(n: number, active = false) {
  return L.divIcon({
    className: "dl-marker",
    html: `<div class="dl-pin dl-pin-stop${active ? " dl-pin-active" : ""}"><span>${n}</span></div>`,
    iconSize: [34, 42],
    iconAnchor: [17, 40],
  });
}

export const riderIcon = L.divIcon({
  className: "dl-marker",
  html: `<div class="dl-rider"><span class="dl-rider-pulse"></span><span class="dl-rider-dot">🛵</span></div>`,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

export const meIcon = L.divIcon({
  className: "dl-marker",
  html: `<div class="dl-me"><span class="dl-rider-pulse"></span><span class="dl-me-dot"></span></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export function googleMapsDir(dest: LatLng, origin?: LatLng | null) {
  const o = origin ? `&origin=${origin.lat},${origin.lng}` : "";
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving${o}&destination=${dest.lat},${dest.lng}`;
}
