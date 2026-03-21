import { Router } from "express";
import type { PrismaClient } from "@prisma/client";

const AI_URL = process.env.AI_SERVICE_URL ?? "http://localhost:8000";

export function menuRouter(prisma: PrismaClient) {
  const r = Router();

  r.get("/menu", async (req, res) => {
    const customerId = req.query.customerId ? Number(req.query.customerId) : undefined;
    const categories = await prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    const products = await prisma.product.findMany({
      where: { isActive: true, outOfStock: false },
      include: { category: true },
      orderBy: [{ categoryId: "asc" }, { id: "asc" }],
    });

    let favorites: typeof products = [];

    if (customerId && !Number.isNaN(customerId)) {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const details = await prisma.orderDetail.findMany({
        where: {
          order: {
            customerId,
            status: "Paid",
            createdAt: { gte: since },
          },
        },
      });
      const freq = new Map<string, number>();
      for (const d of details) {
        const k = `${d.productId}||${d.customNotes ?? ""}`;
        freq.set(k, (freq.get(k) ?? 0) + d.quantity);
      }
      const topKeys = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      const pmap = new Map(products.map((p) => [p.id, p]));
      favorites = topKeys
        .map(([k]) => {
          const pid = Number(String(k).split("||")[0]);
          return pmap.get(pid);
        })
        .filter(Boolean) as typeof products;

      if (favorites.length === 0) {
        try {
          const resp = await fetch(`${AI_URL}/recommendations?customer_id=${customerId}`, {
            signal: AbortSignal.timeout(2500),
          });
          if (resp.ok) {
            const data = (await resp.json()) as { product_ids?: number[] };
            const ids = data.product_ids ?? [];
            favorites = ids.map((id) => pmap.get(id)).filter(Boolean) as typeof products;
          }
        } catch {
          /* optional AI */
        }
      }
    }

    if (favorites.length === 0) {
      favorites = products.filter((p) => [7, 9, 11].includes(p.id)).slice(0, 3);
    }

    res.json({ categories, products, favorites });
  });

  return r;
}
