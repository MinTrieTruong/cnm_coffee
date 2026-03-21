import { Router } from "express";
import type { PrismaClient } from "@prisma/client";

export function catalogRouter(prisma: PrismaClient) {
  const r = Router();

  r.get("/categories", async (_req, res) => {
    const rows = await prisma.category.findMany({ orderBy: { id: "asc" } });
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
    res.json(p);
  });

  r.get("/inventory", async (_req, res) => {
    const rows = await prisma.inventoryItem.findMany({ orderBy: { id: "asc" } });
    res.json(rows);
  });

  return r;
}
