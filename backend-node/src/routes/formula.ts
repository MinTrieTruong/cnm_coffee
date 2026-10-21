import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { attachStaff, requireRoles, type StaffRequest } from "../middleware/staff.js";
import { audit } from "../lib/audit.js";
import { productCosts, recalcProductCost } from "../lib/productCost.js";

type LineInput = { itemId: number; qtyS?: number | null; qtyM: number; qtyL?: number | null; note?: string | null };

export function formulaRouter(prisma: PrismaClient) {
  const r = Router();
  const auth = attachStaff(prisma);
  const adminOnly = [auth, requireRoles("Admin")];
  // Định mức dùng chung cả chuỗi — chỉ Chủ chuỗi sửa
  const owner = [auth, requireRoles("Owner")];

  const include = {
    product: { select: { id: true, name: true, imageUrl: true } },
    item: { select: { id: true, name: true, unit: true, unitCostPrice: true, recipeUnit: true, recipePerUnit: true } },
  } as const;

  // ─── GET /api/admin/formulas ────────────────────────────────────────────────
  r.get("/admin/formulas", ...adminOnly, async (_req, res) => {
    res.json(await prisma.productFormula.findMany({ include, orderBy: [{ productId: "asc" }, { id: "asc" }] }));
  });

  // ─── GET /api/admin/product-costs ───────────────────────────────────────────
  // Giá vốn S/M/L từng món (tính từ định mức × giá nhập) + giá bán để xem % giá vốn
  r.get("/admin/product-costs", ...adminOnly, async (_req, res) => {
    const [products, costs] = await Promise.all([
      prisma.product.findMany({
        select: { id: true, name: true, imageUrl: true, sellPrice: true, priceSizeS: true, priceSizeL: true, costPrice: true, isActive: true, category: { select: { name: true } } },
        orderBy: [{ categoryId: "asc" }, { id: "asc" }],
      }),
      productCosts(prisma),
    ]);
    res.json(products.map((p) => {
      const c = costs.get(p.id);
      return { ...p, hasFormula: !!c, cost: c ? { S: Math.round(c.S), M: Math.round(c.M), L: Math.round(c.L) } : null };
    }));
  });

  // ─── PUT /api/admin/formulas/product/:productId ─────────────────────────────
  // Lưu cả công thức của 1 món (thay thế toàn bộ). Quy đổi đơn vị lấy theo nguyên liệu.
  r.put("/admin/formulas/product/:productId", ...owner, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const productId = Number(req.params.productId);
    const { lines } = req.body as { lines?: LineInput[] };
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ error: "Không tìm thấy món." });
    if (!Array.isArray(lines)) return res.status(400).json({ error: "Thiếu danh sách nguyên liệu." });

    const ok = (v: unknown) => v == null || (typeof v === "number" && v >= 0 && v <= 100_000);
    for (const l of lines) {
      if (!l.itemId || typeof l.qtyM !== "number" || !(l.qtyM > 0) || !ok(l.qtyS) || !ok(l.qtyL)) {
        return res.status(400).json({ error: "Mỗi nguyên liệu cần lượng size M > 0; S, L không âm." });
      }
    }
    if (new Set(lines.map((l) => l.itemId)).size !== lines.length) return res.status(400).json({ error: "Một nguyên liệu bị chọn 2 lần." });
    const items = await prisma.inventoryItem.findMany({ where: { id: { in: lines.map((l) => l.itemId) } } });
    if (items.length !== lines.length) return res.status(400).json({ error: "Có nguyên liệu không tồn tại." });

    const cost = await prisma.$transaction(async (tx) => {
      await tx.productFormula.deleteMany({ where: { productId } });
      if (lines.length) {
        await tx.productFormula.createMany({
          data: lines.map((l) => {
            const it = items.find((i) => i.id === l.itemId)!;
            return {
              productId, itemId: l.itemId,
              qtyPerUnit: l.qtyM, qtySizeM: l.qtyM, qtySizeS: l.qtyS ?? null, qtySizeL: l.qtyL ?? null,
              recipeUnit: it.recipeUnit ?? it.unit, conversionFactor: it.recipePerUnit > 0 ? it.recipePerUnit : 1,
              note: l.note?.trim() || null,
            };
          }),
        });
      }
      const costs = await recalcProductCost(tx, [productId]);
      if (!lines.length) await tx.product.update({ where: { id: productId }, data: { costPrice: 0 } });
      return costs.get(productId) ?? { S: 0, M: 0, L: 0 };
    });
    audit(me.id, "FORMULA_SAVE", product.name, `${lines.length} nguyên liệu · giá vốn M ${Math.round(cost.M)}đ`);
    res.json({
      formulas: await prisma.productFormula.findMany({ where: { productId }, include, orderBy: { id: "asc" } }),
      cost: { S: Math.round(cost.S), M: Math.round(cost.M), L: Math.round(cost.L) },
    });
  });

  return r;
}
