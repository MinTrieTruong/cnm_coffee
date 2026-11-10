/**
 * routes/home.ts — Trang chủ khách › "Hợp thời tiết hôm nay" (công khai).
 * GET /api/home/weather-picks?storeId= → { store, weather | null, headline {vi,en}, source AI|TEMPLATE, products[] }
 * Món = thẻ ProductCard (như /api/menu) + reason {vi,en} + suggestTemp. Cache 10 phút / chi nhánh.
 * Website › Giao diện tắt "Gợi ý theo thời tiết" → { hidden: true }. Open-Meteo lỗi → weather null, vẫn gợi ý theo giờ.
 */
import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { storeFromQuery } from "../lib/storeProducts.js";
import { getWeather } from "../lib/weather.js";
import { headline, pickProducts } from "../lib/weatherPicks.js";
import { productRatings } from "./reviews.js";
import { publicNutrition } from "./menu.js";
import { siteFlags } from "./site.js";

const TTL_MS = 10 * 60_000;
const cache = new Map<number, { at: number; body: unknown }>();

export function homeRouter(prisma: PrismaClient) {
  const r = Router();

  r.get("/home/weather-picks", async (req, res) => {
    try {
      const flags = await siteFlags(prisma);
      if (!flags.showWeatherPicks) return res.json({ hidden: true });
      const fromQuery = storeFromQuery(req.query.storeId ?? req.query.store);
      const store = fromQuery
        ? await prisma.store.findFirst({ where: { id: fromQuery, isActive: true }, select: { id: true, name: true } })
        : await prisma.store.findFirst({ where: { isActive: true }, orderBy: { id: "asc" }, select: { id: true, name: true } });
      if (!store) return res.status(404).json({ error: "Không tìm thấy chi nhánh" });
      const hit = cache.get(store.id);
      if (hit && Date.now() - hit.at < TTL_MS) return res.json(hit.body);

      const now = new Date();
      const weather = await getWeather(store.id);
      const picks = await pickProducts(store.id, now, weather);
      const [head, rows, ratings] = await Promise.all([
        headline(store.id, store.name, weather, picks, now),
        prisma.product.findMany({ where: { id: { in: picks.map((p) => p.productId) } }, include: { category: true, nutrition: true } }),
        productRatings(prisma),
      ]);
      const byId = new Map(rows.map((p) => [p.id, p]));
      const products = picks.flatMap((pk) => {
        const p = byId.get(pk.productId);
        if (!p) return [];
        const { nutrition, ...rest } = p;
        return [{
          ...rest,
          soldOut: false,
          rating: ratings.get(p.id) ?? null,
          nutrition: flags.showNutrition ? publicNutrition(nutrition) : null,
          reason: pk.reason,
          suggestTemp: pk.suggestTemp,
        }];
      });
      const body = { store, weather, headline: head.headline, source: head.source, products, generatedAt: now.toISOString() };
      // Câu mẫu (AI chưa xong / lỗi) chỉ cache 1 phút để lần tải sau lấy câu AI
      cache.set(store.id, { at: head.source === "AI" ? Date.now() : Date.now() - TTL_MS + 60_000, body });
      res.json(body);
    } catch (e) {
      console.error("weather-picks", e);
      res.status(500).json({ error: "Không tải được gợi ý" });
    }
  });

  return r;
}
