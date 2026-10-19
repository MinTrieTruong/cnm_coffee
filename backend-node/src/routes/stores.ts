import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { haversineKm } from "../lib/delivery.js";

const publicSelect = {
  id: true,
  code: true,
  name: true,
  address: true,
  phone: true,
  lat: true,
  lng: true,
  openTime: true,
  closeTime: true,
} as const;

export function storesRouter(prisma: PrismaClient) {
  const r = Router();

  /** Public — chi nhánh đang hoạt động. Gửi `?lat=&lng=` để sắp theo khoảng cách (kèm `distanceKm`). */
  r.get("/stores", async (req, res) => {
    const stores = await prisma.store.findMany({
      where: { isActive: true },
      select: publicSelect,
      orderBy: { id: "asc" },
    });
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || req.query.lat === undefined || req.query.lng === undefined) {
      return res.json(stores);
    }
    const withDist = stores
      .map((s) => ({ ...s, distanceKm: Math.round(haversineKm({ lat, lng }, s) * 10) / 10 }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
    res.json(withDist);
  });

  return r;
}
