/**
 * lib/customerEvents.ts — Ghi hành vi khách trên web (bảng Customer_Events, trang "Hành vi khách")
 *
 * - Trình duyệt gửi gộp qua POST /api/track (routes/tracking.ts): xem màn hình, xem món, thêm / bớt giỏ.
 * - ORDER_PLACED do máy chủ tự ghi sau khi tạo đơn (không tin client) — recordOrderPlaced().
 * - Chủ chuỗi tắt được (StoreSettings.behaviorTracking); xoá sau behaviorRetentionDays ngày.
 * Mọi lỗi đều nuốt — không bao giờ ảnh hưởng đặt món.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

/** Sự kiện trình duyệt được gửi (ORDER_PLACED chỉ máy chủ ghi) */
export const CLIENT_EVENT_TYPES = ["PAGE_VIEW", "PRODUCT_VIEW", "ADD_TO_CART", "REMOVE_FROM_CART", "CART_VIEW", "CHECKOUT_START"] as const;
export const CART_SOURCES = ["card_quick", "product_detail", "voice", "usual", "combo", "reorder"] as const;

let settingsCache: { at: number; tracking: boolean; days: number } | null = null;

/** Công tắc + số ngày lưu (đệm 60 giây; đổi cài đặt thì gọi resetTrackingSettings) */
export async function trackingSettings(prisma: PrismaClient) {
  if (settingsCache && Date.now() - settingsCache.at < 60_000) return settingsCache;
  const s = await prisma.storeSettings.findUnique({ where: { id: 1 }, select: { behaviorTracking: true, behaviorRetentionDays: true } });
  settingsCache = { at: Date.now(), tracking: s?.behaviorTracking ?? true, days: s?.behaviorRetentionDays ?? 90 };
  return settingsCache;
}
export function resetTrackingSettings() {
  settingsCache = null;
}

const clean = (v: unknown, max: number) => {
  const s = typeof v === "string" ? v.trim().slice(0, max) : "";
  return s || null;
};

/**
 * Đơn vừa tạo từ web khách → 1 dòng ORDER_PLACED cho mỗi món (combo: 1 dòng / combo).
 * Chỉ ghi khi trình duyệt có gửi mã ẩn danh (đang bật ghi nhận, không phải máy nhân viên).
 */
export async function recordOrderPlaced(
  prisma: PrismaClient,
  o: {
    orderId: number;
    storeId: number | null;
    customerId: number | null;
    tableId: number | null;
    trackSid: unknown;
    visitId: unknown;
    lines: { productId: number; quantity: number; comboId?: number | null; comboRef?: string | null; comboQty?: number | null }[];
  },
) {
  try {
    const sessionKey = clean(o.trackSid, 64);
    const visitId = clean(o.visitId, 40);
    if (!sessionKey || !visitId || !o.lines.length) return;
    if (!(await trackingSettings(prisma)).tracking) return;
    const base = { sessionKey, visitId, customerId: o.customerId, storeId: o.storeId, type: "ORDER_PLACED", orderId: o.orderId, channel: o.tableId ? "qr_table" : "web" };
    const rows: Prisma.CustomerEventCreateManyInput[] = [];
    const combos = new Set<string>();
    for (const l of o.lines) {
      if (l.comboId) {
        // Các món trong combo cùng comboRef → tính 1 combo
        const key = l.comboRef ?? `${l.comboId}`;
        if (combos.has(key)) continue;
        combos.add(key);
        rows.push({ ...base, comboId: l.comboId, qty: l.comboQty ?? 1 });
      } else {
        rows.push({ ...base, productId: l.productId, qty: l.quantity });
      }
    }
    await prisma.customerEvent.createMany({ data: rows });
  } catch (e) {
    console.error("[tracking] ORDER_PLACED", e);
  }
}

/** Xoá sự kiện cũ hơn behaviorRetentionDays (chạy mỗi ngày, giống startSearchLogCleanup) */
export function startCustomerEventCleanup(prisma: PrismaClient) {
  const run = async () => {
    try {
      resetTrackingSettings();
      const { days } = await trackingSettings(prisma);
      await prisma.customerEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - Math.max(1, days) * 86400_000) } } });
    } catch (e) {
      console.error("[tracking] cleanup", e);
    }
  };
  setTimeout(run, 150_000);
  setInterval(run, 86400_000);
}
