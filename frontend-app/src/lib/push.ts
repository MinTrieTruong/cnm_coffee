/**
 * Web Push phía trình duyệt: Service Worker (public/sw.js) + đăng ký với máy chủ (backend lib/webPush.ts).
 *
 * Điều kiện: HTTPS hoặc localhost. iPhone/iPad (iOS 16.4+) chỉ nhận khi đã "Thêm vào MH chính"
 * — vì vậy khu nhân sự chèn /staff.webmanifest để cài được như ứng dụng.
 */
import { staffApi } from "./staffApi";

const SW_URL = "/sw.js";

export const pushSupported = () =>
  typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** iPhone/iPad chưa cài app lên màn hình chính → không có Web Push */
export const needsInstallForPush = () => {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
};

/** Chèn manifest của khu nhân sự (để cài lên màn hình chính) */
export function ensureStaffManifest() {
  if (document.querySelector('link[rel="manifest"]')) return;
  const l = document.createElement("link");
  l.rel = "manifest";
  l.href = "/staff.webmanifest";
  document.head.appendChild(l);
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    if (!(await navigator.serviceWorker.getRegistration(SW_URL))) await navigator.serviceWorker.register(SW_URL);
    // Lần đầu đăng ký: SW chưa "active" thì pushManager.subscribe báo lỗi → chờ sẵn sàng
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

function urlB64ToUint8Array(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

let inflight: Promise<boolean> | null = null;

/** Đăng ký push cho thiết bị này và gắn với người đang đăng nhập. Trả false nếu không làm được. */
export function subscribePush(): Promise<boolean> {
  // Gọi trùng lúc (StrictMode / bấm 2 lần) → dùng chung một lần đăng ký, tránh tạo 2 endpoint
  inflight ??= doSubscribe().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doSubscribe(): Promise<boolean> {
  if (Notification.permission !== "granted") return false;
  const reg = await registration();
  if (!reg) return false;
  try {
    const { publicKey } = await staffApi<{ publicKey: string | null }>("/api/push/public-key");
    if (!publicKey) return false;
    let sub = await reg.pushManager.getSubscription();
    // Máy chủ đổi khóa VAPID → đăng ký cũ không dùng được nữa
    const current = sub?.options.applicationServerKey;
    if (sub && current && btoa(String.fromCharCode(...new Uint8Array(current))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") !== publicKey) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(publicKey) });
    await staffApi("/api/push/subscribe", { method: "POST", body: JSON.stringify(sub.toJSON()) });
    return true;
  } catch {
    return false;
  }
}

/** Đăng xuất / tắt: gỡ thiết bị khỏi tài khoản (máy dùng chung không nhận thông báo của người trước) */
export async function unsubscribePush() {
  const reg = pushSupported() ? await navigator.serviceWorker.getRegistration(SW_URL) : null;
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  try {
    await staffApi("/api/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint: sub.endpoint }) });
  } catch {
    /* mất mạng: đăng ký phía trình duyệt vẫn bị hủy bên dưới, máy chủ tự xóa khi gửi lỗi 410 */
  }
  await sub.unsubscribe().catch(() => {});
}
