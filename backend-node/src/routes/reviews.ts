import { Router } from "express";
import type { Request } from "express";
import type { PrismaClient } from "@prisma/client";
import { customerAuth } from "../middleware/customer.js";
import { saveDataUrlImage } from "../lib/uploadImage.js";

export function reviewsRouter(prisma: PrismaClient) {
  const r = Router();

  r.post("/reviews", customerAuth, async (req, res) => {
    const customerId = (req as Request & { customerId?: number }).customerId!;
    const { orderId, rating, comment, imageUrl } = req.body as {
      orderId?: number;
      rating?: number;
      comment?: string;
      imageUrl?: string;
    };
    if (!orderId || typeof rating !== "number" || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Thiếu orderId hoặc rating 1–5." });
    }
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.customerId !== customerId) {
      return res.status(403).json({ error: "Đơn không thuộc tài khoản này." });
    }
    if (order.status !== "Paid") {
      return res.status(400).json({ error: "Chỉ đánh giá sau khi thanh toán hoàn tất." });
    }
    const rev = await prisma.review.create({
      data: {
        orderId,
        customerId,
        rating,
        comment: comment?.trim() || null,
        imageUrl: imageUrl ?? null,
      },
    });
    res.status(201).json(rev);
  });

  r.get("/reviews/eligible-orders", customerAuth, async (req, res) => {
    const customerId = (req as Request & { customerId?: number }).customerId!;
    const reviewed = await prisma.review.findMany({
      where: { customerId },
      select: { orderId: true },
    });
    const reviewedIds = reviewed.map((r) => r.orderId);
    const orders = await prisma.order.findMany({
      where: {
        customerId,
        status: "Paid",
        ...(reviewedIds.length ? { id: { notIn: reviewedIds } } : {}),
      },
      orderBy: { id: "desc" },
      take: 30,
      select: {
        id: true,
        totalAmount: true,
        createdAt: true,
        table: { select: { name: true } },
      },
    });
    res.json(orders);
  });

  r.get("/reviews", async (_req, res) => {
    const rows = await prisma.review.findMany({
      where: { hidden: false },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { customer: { select: { fullName: true } } },
    });
    res.json(rows);
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
