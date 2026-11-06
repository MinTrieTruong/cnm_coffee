import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { productRatings, publicReview } from "./reviews.js";
import { hiddenProductIds, storeFromQuery, storeMenuState } from "../lib/storeProducts.js";

export function catalogRouter(prisma: PrismaClient) {
  const r = Router();
  const isMissingColumn = (e: unknown, colName: string) =>
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2022" && String(e.meta?.column).includes(colName);

  r.get("/categories", async (_req, res) => {
    const rows = await prisma.category.findMany({
      include: {
        children: {
          include: { children: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    res.json(rows);
  });

  r.get("/products", async (_req, res) => {
    const rows = await prisma.product.findMany({
      where: { isActive: true },
      include: { category: true },
      orderBy: [{ categoryId: "asc" }, { id: "asc" }],
    });
    res.json(rows);
  });

  r.get("/products/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ" });
    const p = await prisma.product.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!p) return res.status(404).json({ error: "Không tìm thấy món" });
    // ?store= → chi nhánh tắt món / báo hết / hết nguyên liệu thì khoá nút thêm ở trang chi tiết
    const { disabled, soldOut } = await storeMenuState(prisma, storeFromQuery(req.query.store));
    res.json({ ...p, soldOut: p.outOfStock || disabled.has(id) || soldOut.has(id) });
  });

  /** Trang chi tiết món: "Ăn kèm ngon hơn" (món đồ ăn hay mua chung đơn, thiếu thì lấy món không size) + đánh giá của đơn có món này */
  r.get("/products/:id/extras", async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ" });
    const orderIds = (
      await prisma.orderDetail.findMany({ where: { productId: id }, select: { orderId: true }, orderBy: { id: "desc" }, take: 500 })
    ).map((d) => d.orderId);
    const together = orderIds.length
      ? await prisma.orderDetail.groupBy({
          by: ["productId"],
          where: { orderId: { in: orderIds }, productId: { not: id } },
          _count: { productId: true },
          orderBy: { _count: { productId: "desc" } },
          take: 30,
        })
      : [];
    const hidden = await hiddenProductIds(prisma, storeFromQuery(req.query.store));
    const food = await prisma.product.findMany({ where: { isActive: true, outOfStock: false, hasSizes: false, id: { notIn: [id, ...hidden] } }, orderBy: { id: "asc" } });
    const rank = new Map(together.map((t, i) => [t.productId, i]));
    const pairings = [...food].sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999)).slice(0, 5);
    // Chỉ đánh giá khách viết cho đúng món này (đánh giá chung của đơn không hiện ở đây)
    const reviews = await prisma.review.findMany({
      where: { hidden: false, productId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, rating: true, comment: true, imageUrl: true, adminReply: true, createdAt: true, anonymous: true, customer: { select: { fullName: true, avatarUrl: true } } },
    });
    const rating = (await productRatings(prisma, [id])).get(id) ?? { avg: 0, count: 0 };
    res.json({ pairings, reviews: reviews.map(publicReview), rating });
  });

  r.get("/inventory", async (_req, res) => {
    try {
      const rows = await prisma.inventoryItem.findMany({ orderBy: { id: "asc" } });
      res.json(rows);
    } catch (e) {
      if (isMissingColumn(e, "Inventory.Image_URL")) {
        return res.status(500).json({
          error: "CSDL kho chưa đồng bộ cột ảnh. Chạy: cd backend-node && npx prisma db push",
        });
      }
      throw e;
    }
  });

  return r;
}
