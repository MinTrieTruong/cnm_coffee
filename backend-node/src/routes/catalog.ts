import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

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
    res.json(p);
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
