/**
 * routes/tracking.ts — Hành vi khách trên web
 *
 * POST /track                          — trình duyệt khách gửi gộp sự kiện (lib/track.ts). Luôn trả 204.
 */
import express, { Router, type Request } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import { optionalCustomerAuth } from "../middleware/customer.js";
import { storeFromQuery } from "../lib/storeProducts.js";
import { CART_SOURCES, CLIENT_EVENT_TYPES, trackingSettings } from "../lib/customerEvents.js";

const MAX_BATCH = 30;
const PER_HOUR = 600;
const SCREEN = /^[a-z_]{1,32}$/;

/** Danh sách id món / combo / chi nhánh (kể cả món đã ngừng bán) — đệm 5 phút */
function idCache(load: () => Promise<number[]>) {
  let at = 0;
  let ids = new Set<number>();
  return async () => {
    if (Date.now() - at > 5 * 60_000) {
      ids = new Set(await load());
      at = Date.now();
    }
    return ids;
  };
}

export function trackingRouter(prisma: PrismaClient) {
  const r = Router();
  const productIds = idCache(async () => (await prisma.product.findMany({ select: { id: true } })).map((p) => p.id));
  const comboIds = idCache(async () => (await prisma.combo.findMany({ select: { id: true } })).map((c) => c.id));
  const storeIds = idCache(async () => (await prisma.store.findMany({ select: { id: true } })).map((s) => s.id));

  // Chống spam trong bộ nhớ: ~600 sự kiện / giờ / trình duyệt; xem cùng món trong 5 phút chỉ tính 1
  const rate = new Map<string, { start: number; n: number }>();
  const viewed = new Map<string, number>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of rate) if (now - v.start > 3600_000) rate.delete(k);
    for (const [k, t] of viewed) if (now - t > 5 * 60_000) viewed.delete(k);
  }, 10 * 60_000).unref();

  // sendBeacon gửi text/plain → đọc thô rồi JSON.parse
  r.post("/track", express.text({ type: "text/plain", limit: "64kb" }), optionalCustomerAuth, async (req, res) => {
    res.status(204).end();
    try {
      const raw = typeof req.body === "string" ? (JSON.parse(req.body) as unknown) : req.body;
      const { events, sentAt } = (raw ?? {}) as { events?: unknown; sentAt?: unknown };
      if (!Array.isArray(events) || !events.length) return;
      if (!(await trackingSettings(prisma)).tracking) return;
      const customerId = (req as Request & { customerId?: number }).customerId ?? null;
      const now = Date.now();
      const sent = Number(sentAt);
      const [products, combos, stores] = await Promise.all([productIds(), comboIds(), storeIds()]);
      const rows: Prisma.CustomerEventCreateManyInput[] = [];

      for (const e of events.slice(0, MAX_BATCH) as Record<string, unknown>[]) {
        if (!e || typeof e !== "object") continue;
        const type = String(e.type ?? "");
        if (!(CLIENT_EVENT_TYPES as readonly string[]).includes(type)) continue;
        const sessionKey = String(e.sessionKey ?? "").trim().slice(0, 64);
        const visitId = String(e.visitId ?? "").trim().slice(0, 40);
        if (!sessionKey || !visitId) continue;

        const rl = rate.get(sessionKey);
        if (!rl || now - rl.start > 3600_000) rate.set(sessionKey, { start: now, n: 1 });
        else if (++rl.n > PER_HOUR) continue;

        const pid = Number(e.productId);
        const productId = Number.isInteger(pid) && products.has(pid) ? pid : null;
        const cid = Number(e.comboId);
        const comboId = Number.isInteger(cid) && combos.has(cid) ? cid : null;
        if ((type === "PRODUCT_VIEW" || type === "ADD_TO_CART" || type === "REMOVE_FROM_CART") && !productId && !comboId) continue;
        if (type === "PRODUCT_VIEW") {
          const k = `${sessionKey}|${productId}`;
          if (now - (viewed.get(k) ?? 0) < 5 * 60_000) continue;
          viewed.set(k, now);
        }
        const screen = typeof e.screen === "string" && SCREEN.test(e.screen) ? e.screen : null;
        if (type === "PAGE_VIEW" && !screen) continue;
        const dur = Math.round(Number(e.durationMs));
        const qty = Math.round(Number(e.qty));
        const source = type === "ADD_TO_CART" && (CART_SOURCES as readonly string[]).includes(String(e.source)) ? String(e.source) : null;
        const store = storeFromQuery(e.storeId);
        // Giờ sự kiện theo đồng hồ máy chủ: lùi đúng khoảng đã chờ trong hàng đợi (đồng hồ máy khách có thể lệch)
        const age = Number.isFinite(sent) && Number.isFinite(Number(e.at)) ? Math.min(3600_000, Math.max(0, sent - Number(e.at))) : 0;
        rows.push({
          sessionKey,
          visitId,
          customerId,
          storeId: store && stores.has(store) ? store : null,
          type,
          screen,
          productId,
          comboId,
          qty: Number.isFinite(qty) && qty > 0 ? Math.min(qty, 999) : null,
          durationMs: type === "PAGE_VIEW" && Number.isFinite(dur) ? Math.min(1_800_000, Math.max(1000, dur)) : null,
          source,
          device: e.device === "mobile" || e.device === "desktop" ? e.device : null,
          channel: e.channel === "web" || e.channel === "qr_table" ? e.channel : null,
          createdAt: new Date(now - age),
        });
      }
      if (rows.length) await prisma.customerEvent.createMany({ data: rows });
    } catch (e) {
      if (!(e instanceof SyntaxError)) console.error("[tracking]", e);
    }
  });

  return r;
}
