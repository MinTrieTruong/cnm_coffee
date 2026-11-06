import { Router } from "express";
import type { Request } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";
import { customerAuth } from "../middleware/customer.js";
import { saveDataUrlImage } from "../lib/uploadImage.js";

/** Đánh giá ẩn danh: bỏ tên + ảnh khỏi danh sách công khai (customer = null) */
export function publicReview<T extends { anonymous: boolean; customer: unknown }>({ anonymous, customer, ...rest }: T) {
  return { ...rest, customer: anonymous ? null : customer };
}

/** Điểm sao theo món (chỉ đánh giá theo món, không tính đánh giá đã ẩn): productId → { avg, count } */
export async function productRatings(prisma: PrismaClient, productIds?: number[]) {
  const rows = await prisma.review.groupBy({
    by: ["productId"],
    where: { hidden: false, productId: productIds ? { in: productIds } : { not: null } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.productId!, { avg: Math.round((r._avg.rating ?? 0) * 10) / 10, count: r._count._all }]));
}

export function reviewsRouter(prisma: PrismaClient) {
  const r = Router();

  r.post("/reviews", customerAuth, async (req, res) => {
    const customerId = (req as Request & { customerId?: number }).customerId!;
    const { orderId, productId, rating, comment, imageUrl, anonymous } = req.body as {
      orderId?: number;
      /** Có = đánh giá món này trong đơn; không có = đánh giá chung cho quán */
      productId?: number | null;
      rating?: number;
      comment?: string;
      imageUrl?: string;
      anonymous?: boolean;
    };
    if (!orderId || typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Thiếu orderId hoặc rating 1–5." });
    }
    if (productId != null && !Number.isInteger(productId)) return res.status(400).json({ error: "Món không hợp lệ." });
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.customerId !== customerId) {
      return res.status(403).json({ error: "Đơn không thuộc tài khoản này." });
    }
    if (order.status !== "Paid") {
      return res.status(400).json({ error: "Chỉ đánh giá sau khi thanh toán hoàn tất." });
    }
    if (productId != null && !(await prisma.orderDetail.findFirst({ where: { orderId, productId }, select: { id: true } }))) {
      return res.status(400).json({ error: "Món này không có trong đơn." });
    }
    // Ảnh chỉ nhận đường dẫn do /reviews/upload-image cấp (không nhận URL ngoài / javascript:)
    if (imageUrl && !/^\/uploads\/[0-9a-f-]{36}\.(png|jpe?g|webp|gif)$/i.test(imageUrl)) {
      return res.status(400).json({ error: "Ảnh đánh giá không hợp lệ." });
    }
    if (await prisma.review.findFirst({ where: { orderId, productId: productId ?? null }, select: { id: true } })) {
      return res.status(409).json({ error: productId != null ? "Bạn đã đánh giá món này trong đơn." : "Đơn này đã được đánh giá." });
    }
    try {
      const rev = await prisma.review.create({
        data: {
          orderId,
          productId: productId ?? null,
          customerId,
          rating,
          comment: comment?.trim() || null,
          imageUrl: imageUrl ?? null,
          anonymous: anonymous === true,
        },
      });
      res.status(201).json(rev);
    } catch (e) {
      // Hai lần gửi cùng lúc: khoá (đơn, món) chặn bản thứ hai
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return res.status(409).json({ error: "Bạn đã đánh giá món này trong đơn." });
      throw e;
    }
  });

  /** Đơn đã thanh toán còn thứ chưa đánh giá: đánh giá chung (overallDone) và các món chưa đánh giá (items) */
  r.get("/reviews/eligible-orders", customerAuth, async (req, res) => {
    const customerId = (req as Request & { customerId?: number }).customerId!;
    const orders = await prisma.order.findMany({
      where: { customerId, status: "Paid" },
      orderBy: { id: "desc" },
      take: 30,
      select: {
        id: true,
        totalAmount: true,
        createdAt: true,
        table: { select: { name: true } },
        details: { select: { productId: true, product: { select: { id: true, name: true, imageUrl: true } } } },
        reviews: { select: { productId: true } },
      },
    });
    const out = orders
      .map(({ details, reviews, ...o }) => {
        const done = new Set(reviews.map((r) => r.productId));
        const items = [...new Map(details.filter((d) => !done.has(d.productId)).map((d) => [d.productId, d.product])).values()];
        return { ...o, overallDone: done.has(null), items };
      })
      .filter((o) => !o.overallDone || o.items.length);
    res.json(out);
  });

  /** Trang chi tiết món: đơn đã thanh toán gần nhất có món này mà khách chưa đánh giá món (null = không có) */
  r.get("/reviews/product-eligible/:productId", customerAuth, async (req, res) => {
    const customerId = (req as Request & { customerId?: number }).customerId!;
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId)) return res.status(400).json({ error: "Món không hợp lệ." });
    const order = await prisma.order.findFirst({
      where: { customerId, status: "Paid", details: { some: { productId } }, reviews: { none: { productId } } },
      orderBy: { id: "desc" },
      select: { id: true, createdAt: true },
    });
    res.json(order ? { orderId: order.id, createdAt: order.createdAt } : null);
  });

  r.get("/reviews", async (_req, res) => {
    const rows = await prisma.review.findMany({
      where: { hidden: false },
      orderBy: { createdAt: "desc" },
      take: 50,
      // Danh sách công khai: chỉ trường hiển thị + tên, ảnh đại diện — không trả SĐT/email hay mã nội bộ của khách khác
      select: {
        id: true, rating: true, comment: true, imageUrl: true, adminReply: true, createdAt: true, anonymous: true,
        customer: { select: { fullName: true, avatarUrl: true } },
        product: { select: { id: true, name: true } },
      },
    });
    res.json(rows.map(publicReview));
  });

  r.post("/reviews/upload-image", customerAuth, async (req, res) => {
    try {
      const { dataUrl } = req.body as { dataUrl?: string };
      if (!dataUrl?.startsWith("data:")) {
        return res.status(400).json({ error: "Thiếu dataUrl (ảnh base64)." });
      }
      const url = await saveDataUrlImage(dataUrl);
      res.json({ url });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Không lưu được ảnh." });
    }
  });

  return r;
}
