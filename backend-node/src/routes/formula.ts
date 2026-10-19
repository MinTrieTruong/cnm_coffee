import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { attachStaff, requireRoles, requireStore } from "../middleware/staff.js";
import { mustStoreId } from "../lib/storeScope.js";
import { storeStockOf } from "../lib/inventory.js";

export function formulaRouter(prisma: PrismaClient) {
  const r = Router();
  const auth = attachStaff(prisma);
  const adminOnly = [auth, requireRoles("Admin")];

  // ─── GET /api/admin/formulas ────────────────────────────────────────────────
  // Trả về tất cả định mức, group theo sản phẩm
  r.get("/admin/formulas", ...adminOnly, async (_req, res) => {
    const rows = await prisma.productFormula.findMany({
      include: {
        product: { select: { id: true, name: true, imageUrl: true } },
        item: { select: { id: true, name: true, unit: true } },
      },
      orderBy: [{ productId: "asc" }, { id: "asc" }],
    });
    res.json(rows);
  });

  // ─── POST /api/admin/formulas ───────────────────────────────────────────────
  // Upsert 1 dòng định mức { productId, itemId, qtyPerUnit, note? }
  r.post("/admin/formulas", ...adminOnly, async (req, res) => {
    const { productId, itemId, qtyPerUnit, recipeUnit, conversionFactor, note } = req.body as {
      productId?: number;
      itemId?: number;
      qtyPerUnit?: number;
      recipeUnit?: string;
      conversionFactor?: number;
      note?: string;
    };
    if (!productId || !itemId || typeof qtyPerUnit !== "number" || qtyPerUnit <= 0) {
      return res.status(400).json({ error: "Thiếu thông tin định mức." });
    }
    const cf = typeof conversionFactor === "number" && conversionFactor > 0 ? conversionFactor : 1;
    const row = await prisma.productFormula.upsert({
      where: { productId_itemId: { productId, itemId } },
      create: { productId, itemId, qtyPerUnit, recipeUnit: recipeUnit?.trim() || null, conversionFactor: cf, note: note?.trim() || null },
      update: { qtyPerUnit, recipeUnit: recipeUnit?.trim() || null, conversionFactor: cf, note: note?.trim() || null },
      include: {
        product: { select: { id: true, name: true } },
        item: { select: { id: true, name: true, unit: true } },
      },
    });
    res.status(201).json(row);
  });

  // ─── DELETE /api/admin/formulas/:id ────────────────────────────────────────
  r.delete("/admin/formulas/:id", ...adminOnly, async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID không hợp lệ." });
    await prisma.productFormula.delete({ where: { id } });
    res.status(204).end();
  });

  // ─── GET /api/admin/formula-report?date=YYYY-MM-DD ─────────────────────────
  /**
   * Báo cáo hao hụt nguyên liệu theo ngày.
   * Với mỗi nguyên liệu có định mức:
   *   - ly_thuyet = SUM(orderDetail.qty × qtyPerUnit) trong ngày
   *   - open_qty  = log kiểm kho mở ca cuối cùng trong ngày
   *   - close_qty = log kiểm kho kết ca cuối cùng trong ngày
   *   - thuc_te   = open_qty − close_qty  (nếu có đủ 2 log)
   *   - chenh_lech = thuc_te − ly_thuyet
   */
  // Theo chi nhánh: so lượng bán với log kiểm kho của cùng chi nhánh
  r.get("/admin/formula-report", ...adminOnly, requireStore, async (req, res) => {
    const storeId = mustStoreId(req);
    const dateStr = req.query.date as string | undefined;
    const date = dateStr ? new Date(dateStr) : new Date();
    // Đầu và cuối ngày theo giờ Việt Nam (+7)
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    // 1. Lấy tất cả định mức
    const formulas = await prisma.productFormula.findMany({
      include: {
        product: { select: { id: true, name: true } },
        item: { select: { id: true, name: true, unit: true, storeStocks: storeStockOf(storeId) } },
      },
    });

    if (formulas.length === 0) return res.json([]);

    // 2. Lấy tất cả OrderDetail trong ngày (đơn đã confirmed/paid)
    const orderDetails = await prisma.orderDetail.findMany({
      where: {
        order: {
          storeId,
          createdAt: { gte: dayStart, lte: dayEnd },
          status: { in: ["Confirmed", "Paid", "Waiting_Pay"] },
        },
      },
      select: { productId: true, quantity: true },
    });

    // Map productId → tổng số lượng bán
    const soldMap: Record<number, number> = {};
    for (const d of orderDetails) {
      soldMap[d.productId] = (soldMap[d.productId] ?? 0) + d.quantity;
    }

    // 3. Lấy log kiểm kho trong ngày (mở + kết ca)
    const shiftLogs = await prisma.shiftInventoryLog.findMany({
      where: { storeId, checkedAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { checkedAt: "desc" },
      select: { itemId: true, checkType: true, qty: true, checkedAt: true },
    });

    // Lấy log mới nhất theo itemId + checkType
    const logMap: Record<string, { qty: number; checkedAt: Date }> = {};
    for (const log of shiftLogs) {
      const key = `${log.itemId}_${log.checkType}`;
      if (!logMap[key]) logMap[key] = { qty: log.qty, checkedAt: log.checkedAt };
    }

    // 4. Group theo item
    const itemMap: Record<
      number,
      {
        itemId: number;
        itemName: string;
        unit: string | null;
        stockQty: number;
        lines: { productId: number; productName: string; qtyPerUnit: number; recipeUnit: string | null; conversionFactor: number; soldQty: number; consumed: number }[];
      }
    > = {};

    for (const f of formulas) {
      if (!itemMap[f.itemId]) {
        itemMap[f.itemId] = {
          itemId: f.itemId,
          itemName: f.item.name,
          unit: f.item.unit,
          stockQty: f.item.storeStocks[0]?.stockQty ?? 0,
          lines: [],
        };
      }
      const sold = soldMap[f.productId] ?? 0;
      itemMap[f.itemId].lines.push({
        productId: f.productId,
        productName: f.product.name,
        qtyPerUnit: f.qtyPerUnit,
        recipeUnit: f.recipeUnit ?? null,
        conversionFactor: f.conversionFactor,
        soldQty: sold,
        consumed: sold * f.qtyPerUnit,
      });
    }

    // 5. Build kết quả
    const result = Object.values(itemMap).map((item) => {
      const lyThuyetRecipe = item.lines.reduce((s, l) => s + l.consumed, 0); // trong đơn vị công thức
      // Quy đổi về đơn vị kho (dùng conversionFactor của dòng đầu tiên — các dòng cùng item nên cùng cf)
      const cf = item.lines[0]?.conversionFactor ?? 1;
      const lyThuyetStock = lyThuyetRecipe / cf; // trong đơn vị kho để so với log kiểm kho
      const openLog = logMap[`${item.itemId}_open`];
      const closeLog = logMap[`${item.itemId}_close`];
      const openQty = openLog?.qty ?? null;
      const closeQty = closeLog?.qty ?? null;
      const thucTe = openQty !== null && closeQty !== null ? openQty - closeQty : null;
      const chenhLech = thucTe !== null ? thucTe - lyThuyetStock : null;

      return {
        itemId: item.itemId,
        itemName: item.itemName,
        unit: item.unit,
        stockQty: item.stockQty,
        lyThuyet: Math.round(lyThuyetRecipe * 100) / 100,     // để hiển thị
        lyThuyetStock: Math.round(lyThuyetStock * 100) / 100,  // để so sánh với log kho
        openQty,
        closeQty,
        thucTe,
        chenhLech: chenhLech !== null ? Math.round(chenhLech * 100) / 100 : null,
        recipeUnit: item.lines[0]?.recipeUnit ?? null,
        conversionFactor: cf,
        lines: item.lines,
      };
    });

    res.json(result);
  });

  return r;
}
