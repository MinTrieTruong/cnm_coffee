/**
 * Ảnh bằng chứng (giao hàng xong / báo xong việc): ảnh chụp trực tiếp bằng camera trong app,
 * kèm vị trí GPS và thời điểm chụp. Máy chủ kiểm tra và lưu lại để quản lý đối chiếu
 * (không chỉ dựa vào chữ đóng dấu trên ảnh).
 */
import { haversineKm, type LatLng } from "./delivery.js";

/** Ảnh phải gửi lên trong vòng chừng này phút kể từ lúc chụp */
const MAX_AGE_MIN = 10;
/** Cho phép đồng hồ điện thoại lệch nhanh chừng này phút */
const MAX_SKEW_MIN = 2;

export type ProofMeta = { lat: number; lng: number; accuracy: number | null; takenAt: Date };

/** Đọc & kiểm tra `proof` gửi kèm ảnh; trả lỗi (tiếng Việt) nếu thiếu hoặc không hợp lệ */
export function parseProof(raw: unknown, now = Date.now()): { ok: true; meta: ProofMeta } | { ok: false; error: string } {
  const p = (raw ?? {}) as { lat?: unknown; lng?: unknown; accuracy?: unknown; takenAt?: unknown };
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) {
    return { ok: false, error: "Thiếu vị trí GPS lúc chụp — bật định vị rồi chụp lại." };
  }
  const takenAt = new Date(String(p.takenAt ?? ""));
  if (Number.isNaN(takenAt.getTime())) return { ok: false, error: "Thiếu thời điểm chụp — chụp lại ảnh." };
  if (takenAt.getTime() > now + MAX_SKEW_MIN * 60_000) return { ok: false, error: "Giờ trên điện thoại không đúng — chỉnh giờ tự động rồi chụp lại." };
  if (takenAt.getTime() < now - MAX_AGE_MIN * 60_000) return { ok: false, error: `Ảnh chụp quá ${MAX_AGE_MIN} phút trước — chụp lại ảnh mới.` };
  const acc = Number(p.accuracy);
  return { ok: true, meta: { lat, lng, accuracy: Number.isFinite(acc) && acc >= 0 ? Math.round(acc) : null, takenAt } };
}

/** Khoảng cách (mét) từ chỗ chụp tới điểm cần có mặt (địa chỉ khách / chi nhánh); null nếu không biết điểm đích */
export function distanceM(meta: ProofMeta, target: Partial<LatLng> | null | undefined) {
  if (target?.lat == null || target?.lng == null) return null;
  return Math.round(haversineKm({ lat: meta.lat, lng: meta.lng }, { lat: target.lat, lng: target.lng }) * 1000);
}
