import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { hiddenProductIds, storeFromQuery, storeMenuState } from "../lib/storeProducts.js";
import { productRatings } from "./reviews.js";
import { matchesSearch } from "../lib/productAliases.js";
import { fitsDiet, isDiet, type NutritionValues } from "../lib/nutrition/labels.js";
import { parseAllergens } from "../lib/nutrition/compute.js";
import { siteFlags } from "./site.js";

type NutritionRow = { size: string; kcal: number; fatG: number; sugarG: number; caffeineMg: number; proteinG: number; allergens: unknown; isVegan: boolean; complete: boolean; labels: unknown };
/** Size mặc định của món: M (hoặc "-" với món 1 loại) */
function defaultNutrition(rows: NutritionRow[]): NutritionValues | null {
  const n = rows.find((r) => r.size === "M") ?? rows.find((r) => r.size === "-");
  return n ? { kcal: n.kcal, fatG: n.fatG, sugarG: n.sugarG, caffeineMg: n.caffeineMg, allergens: parseAllergens(n.allergens), isVegan: n.isVegan, complete: n.complete } : null;
}
function publicNutrition(rows: NutritionRow[]) {
  const n = rows.find((r) => r.size === "M") ?? rows.find((r) => r.size === "-");
  return n ? { size: n.size, kcal: n.kcal, caffeineMg: n.caffeineMg, sugarG: n.sugarG, fatG: n.fatG, proteinG: n.proteinG, complete: n.complete, labels: n.labels } : null;
}

const AI_URL = process.env.AI_SERVICE_URL ?? "http://localhost:8000";

export function menuRouter(prisma: PrismaClient) {
  const r = Router();

  /** Toạ độ chi nhánh `?store=` (mặc định chi nhánh đầu tiên) + danh sách chi nhánh đang hoạt động */
  r.get("/store-config", async (req, res) => {
    const stores = await prisma.store.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, code: true, name: true, address: true, lat: true, lng: true, allowedRadius: true },
    });
    const wanted = storeFromQuery(req.query.store);
    const s = stores.find((x) => x.id === wanted) ?? stores[0];
    res.json({
      storeId: s?.id ?? null,
      storeLat: s?.lat ?? null,
      storeLng: s?.lng ?? null,
      gpsRadius: s?.allowedRadius ?? 0,
      stores,
    });
  });

  /** ── Homepage data (Flash Sale + Best Sellers + Category tree) ── */
  r.get("/homepage", async (req, res) => {
    const hidden = await hiddenProductIds(prisma, storeFromQuery(req.query.store));
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
      where: { isActive: true, outOfStock: false, discountPercent: { not: null, gt: 0 }, id: { notIn: [...hidden] } },
      include: { category: true },
      orderBy: { discountPercent: "desc" },
    });

    // Best Sellers
    const bestSellers = await prisma.product.findMany({
      where: { isActive: true, outOfStock: false, isBestSeller: true, id: { notIn: [...hidden] } },
      include: { category: true },
      orderBy: { id: "asc" },
    });

    // Hot Combos — cho section carousel trên trang chủ
    // Combo có món chi nhánh không bán thì ẩn cả combo
    const hotCombos = await prisma.combo.findMany({
      where: { isActive: true, isHot: true, items: { none: { productId: { in: [...hidden] } } } },
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
    // Lọc ăn kiêng: diet=no_caffeine,low_caffeine,no_milk,low_sugar,low_fat,vegan,no_nuts
    const diets = String(req.query.diet ?? "").split(",").filter(isDiet);
    const { showNutrition } = await siteFlags(prisma);

    const categories = await prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    
    // Món chi nhánh tắt → ẩn; món hết hàng (báo hết / hết nguyên liệu) → vẫn trả về với soldOut để khách thấy mờ
    const { disabled, soldOut } = await storeMenuState(prisma, storeFromQuery(req.query.store));
    let where: any = { isActive: true, id: { notIn: [...disabled] } };
    if (categoryId && !Number.isNaN(categoryId)) {
      // Chọn danh mục cha → gồm cả món của danh mục con
      where.categoryId = { in: [categoryId, ...categories.filter((c) => c.parentId === categoryId).map((c) => c.id)] };
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.sellPrice = {};
      if (minPrice !== undefined && !Number.isNaN(minPrice)) where.sellPrice.gte = minPrice;
      if (maxPrice !== undefined && !Number.isNaN(maxPrice)) where.sellPrice.lte = maxPrice;
    }

    const ratings = await productRatings(prisma);
    let products = (
      await prisma.product.findMany({
        where,
        include: { category: true, nutrition: true },
        orderBy: [{ categoryId: "asc" }, { id: "asc" }],
      })
    )
      // Tìm theo tên hoặc tên gọi khác, bỏ dấu ("bx", "ca phe sua")
      .filter((p) => !search || matchesSearch(p, search))
      // Ăn kiêng: theo size mặc định (M, món 1 loại "-"); chỉ món đủ dữ liệu mới lọt bộ lọc loại trừ
      .filter((p) => !diets.length || (showNutrition && diets.every((d) => { const n = defaultNutrition(p.nutrition); return !!n && fitsDiet(n, d); })))
      .map(({ nutrition, ...p }) => ({
        ...p,
        soldOut: p.outOfStock || soldOut.has(p.id),
        rating: ratings.get(p.id) ?? null,
        // Dinh dưỡng ước tính (size mặc định) — ẩn khi Website › Giao diện tắt
        nutrition: showNutrition ? publicNutrition(nutrition) : null,
      }))
      // Món hết hàng xuống cuối danh mục (sort ổn định giữ thứ tự còn lại)
      .sort((a, b) => a.categoryId - b.categoryId || Number(a.soldOut) - Number(b.soldOut));

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
      // Đếm theo món (không tách theo ghi chú size/đá/đường) — tách ra thì cùng một món hiện nhiều lần
      const freq = new Map<number, number>();
      for (const d of details) freq.set(d.productId, (freq.get(d.productId) ?? 0) + d.quantity);
      const pmap = new Map(products.filter((p) => !p.soldOut).map((p) => [p.id, p]));
      favorites = [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([pid]) => pmap.get(pid))
        .filter(Boolean)
        .slice(0, 3) as typeof products;

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
      favorites = products.filter((p) => !p.soldOut && [7, 9, 11].includes(p.id)).slice(0, 3);
    }

    res.json({ categories, products, favorites });
  });

  return r;
}

