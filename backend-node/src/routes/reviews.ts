import { Router } from "express";
import type { Request } from "express";
import type { PrismaClient } from "@prisma/client";
import { customerAuth } from "../middleware/customer.js";

export function reviewsRouter(prisma: PrismaClient) {
  const r = Router();

  r.post("/reviews", customerAuth, async (req, res) => {
    const customerId = (req as Request & { customerId?: number }).customerId!;
    const { orderId, rating, comment } = req.body as {
      orderId?: number;
      rating?: number;
      comment?: string;
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

  return r;
}
