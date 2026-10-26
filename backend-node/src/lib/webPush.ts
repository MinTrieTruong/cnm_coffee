/**
 * lib/webPush.ts — Web Push (VAPID): nhận thông báo cả khi đã đóng tab / trình duyệt chạy nền
 *
 * Luồng: trình duyệt đăng ký qua Service Worker (frontend public/sw.js) → POST /api/push/subscribe
 * → notify() gọi sendPush() cho người nhận → dịch vụ push của trình duyệt chuyển tới máy.
 * Khóa ở .env: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (tạo: npx web-push generate-vapid-keys).
 * Thiếu khóa → tắt Web Push, app vẫn chạy (chỉ còn thông báo trong app).
 */
import webpush from "web-push";
import type { PrismaClient } from "@prisma/client";

let prisma: PrismaClient | null = null;
let enabled = false;

export function initWebPush(client: PrismaClient) {
  prisma = client;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    console.warn("[push] Thiếu VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY — tắt Web Push");
    return;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
  enabled = true;
}

export const pushPublicKey = () => (enabled ? process.env.VAPID_PUBLIC_KEY ?? null : null);

export type PushPayload =
  | { id: number; title: string; body: string | null; link: string | null; severity: string; type: string }
  /** Thu hồi: Service Worker đóng thông báo có tag tương ứng, không hiện gì mới */
  | { recall: number; severity?: undefined; id?: undefined };

export const sendRecall = (staffIds: number[], id: number) => sendPush(staffIds, { recall: id });

/** Gửi tới mọi thiết bị của các nhân viên; thiết bị đã hủy đăng ký (404/410) bị xóa */
export async function sendPush(staffIds: number[], payload: PushPayload) {
  if (!enabled || !prisma || !staffIds.length) return;
  const db = prisma;
  const subs = await db.pushSubscription.findMany({ where: { staffId: { in: staffIds } } });
  if (!subs.length) return;
  const body = JSON.stringify(payload);
  const dead: number[] = [];
  const ok: number[] = [];
  await Promise.allSettled(
    subs.map((s) =>
      webpush
        .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          // Máy tắt mạng: giữ tối đa 12 giờ rồi bỏ (thông báo cũ hơn không còn ý nghĩa)
          TTL: 12 * 3600,
          urgency: payload.severity === "IMPORTANT" ? "high" : "normal",
          // Cùng topic: dịch vụ push thay bản cũ đang chờ (máy offline chỉ nhận bản mới nhất)
          topic: "recall" in payload ? `r${payload.recall}` : `n${payload.id}`,
        })
        .then(() => ok.push(s.id))
        .catch((e: { statusCode?: number }) => {
          if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.id);
          else console.warn("[push] gửi lỗi", e.statusCode ?? e);
        }),
    ),
  );
  if (dead.length) await db.pushSubscription.deleteMany({ where: { id: { in: dead } } });
  if (ok.length) await db.pushSubscription.updateMany({ where: { id: { in: ok } }, data: { lastUsedAt: new Date() } });
}
