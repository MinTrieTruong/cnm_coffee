import { Router } from "express";
import type { PrismaClient } from "@prisma/client";

const AI_URL = process.env.AI_SERVICE_URL ?? "http://localhost:8000";

export function menuRouter(prisma: PrismaClient) {
  const r = Router();

  r.get("/store-config", async (req, res) => {
    const s = await prisma.storeSettings.findUnique({ where: { id: 1 } });
    res.json({
      storeLat: s?.storeLat ?? null,
      storeLng: s?.storeLng ?? null,
      gpsRadius: s?.allowedRadius ?? 0,
    });
  });

  /** ── Homepage data (Flash Sale + Best Sellers + Category tree) ── */
  r.get("/homepage", async (_req, res) => {
    // Category tree: only root categories (parentId = null) with nested children
    const categories = await prisma.category.findMany({
      where: { parentId: null },
      include: {
        children: {
          include: { children: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    // All leaf categories (those with products)
    const allCategories = await prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });

    // Flash Sale products: have discountPercent
    const flashSale = await prisma.product.findMany({
      where: { isActive: true, outOfStock: false, discountPercent: { not: null, gt: 0 } },
      include: { category: true },
      orderBy: { discountPercent: "desc" },
    });

    // Best Sellers
    const bestSellers = await prisma.product.findMany({
      where: { isActive: true, outOfStock: false, isBestSeller: true },
      include: { category: true },
      orderBy: { id: "asc" },
    });

    // Hot Combos — cho section carousel trên trang chủ
    const hotCombos = await prisma.combo.findMany({
      where: { isActive: true, isHot: true },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sellPrice: true,
                imageUrl: true,
              },
            },
          },
          orderBy: { id: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ categoryTree: categories, categories: allCategories, flashSale, bestSellers, hotCombos });
  });

  r.get("/menu", async (req, res) => {
    const customerId = req.query.customerId ? Number(req.query.customerId) : undefined;
    const search = req.query.search as string;
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
    const minPrice = req.query.minPrice ? Number(req.query.minPrice) : undefined;
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined;
    const tagsParam = req.query.tags as string;

    const categories = await prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    
    let where: any = { isActive: true, outOfStock: false };
    if (search) {
      where.name = { contains: search }; // note: MySQL handles case-insensitivity by default
    }
    if (categoryId && !Number.isNaN(categoryId)) {
      where.categoryId = categoryId;
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.sellPrice = {};
      if (minPrice !== undefined && !Number.isNaN(minPrice)) where.sellPrice.gte = minPrice;
      if (maxPrice !== undefined && !Number.isNaN(maxPrice)) where.sellPrice.lte = maxPrice;
    }

    let products = await prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: [{ categoryId: "asc" }, { id: "asc" }],
    });

    if (tagsParam) {
      const selectedTags = tagsParam.split(",").map(t => t.trim()).filter(Boolean);
      if (selectedTags.length > 0) {
        products = products.filter(p => {
          const pTags = (p as any).tags;
          if (!pTags) return false;
          let parsedTags: string[] = [];
          if (typeof pTags === "string") {
            try { parsedTags = JSON.parse(pTags); } catch { /* ignore */ }
          } else if (Array.isArray(pTags)) {
            parsedTags = pTags;
          }
          return selectedTags.some(t => parsedTags.includes(t));
        });
      }
    }

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

