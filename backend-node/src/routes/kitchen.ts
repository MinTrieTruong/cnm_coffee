/**
 * routes/kitchen.ts — Thao tác nhanh ở quầy pha chế (màn KDS)
 *
 * GET   /kitchen/products        — món của chi nhánh + trạng thái hết / ẩn
 * PATCH /kitchen/products/:id    — báo hết món / ẩn món tại chi nhánh
 * GET   /kitchen/items           — nguyên liệu + tồn kho chi nhánh + món đang dùng nguyên liệu đó
 * POST  /kitchen/waste           — báo hao hụt (đổ bể, hư, làm lại món…) → trừ kho
 * GET   /kitchen/waste           — sổ hao hụt (?date=YYYY-MM-DD hoặc ?month=YYYY-MM)
 * (Xin nguyên liệu gấp dùng POST /kitchen/requests ở staffOps.ts)
 */
import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { attachStaff, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { mustStoreId, storeWhere, toStore } from "../lib/storeScope.js";
import { adjustStoreStock, deductForCups, roundQty } from "../lib/inventory.js";
import { emitLowStock, type LowStockAlert } from "../lib/realtime.js";
import { audit } from "../lib/audit.js";
import { announceMenuChange } from "../lib/menuEvents.js";

export const WASTE_REASONS = ["SPILL", "BROKEN", "EXPIRED", "REMAKE", "OTHER"] as const;
const REASON_LABEL: Record<string, string> = { SPILL: "Đổ", BROKEN: "Bể / vỡ", EXPIRED: "Hư / hết hạn", REMAKE: "Làm lại món", OTHER: "Khác", STOCKTAKE: "Kiểm kê thiếu" };

export function kitchenRouter(prisma: PrismaClient, io: Server) {
  const r = Router();
  const kitchen = [attachStaff(prisma), requireRoles("Kitchen", "Admin"), requireStore];
  const viewers = [attachStaff(prisma), requireRoles("Kitchen", "Admin", "Warehouse")];

  r.get("/kitchen/products", ...kitchen, async (req, res) => {
    const storeId = mustStoreId(req);
    const rows = await prisma.product.findMany({
      where: { isActive: true },
      include: {
        category: { select: { name: true } },
        storeProducts: { where: { storeId } },
        formulas: { select: { itemId: true, qtySizeS: true, qtySizeL: true } },
      },
      orderBy: [{ categoryId: "asc" }, { name: "asc" }],
    });
    res.json(
      rows.map((p) => ({
        id: p.id,
        name: p.name,
        imageUrl: p.imageUrl,
        category: p.category.name,
        // Món nước bán theo size (giá S/L ngầm định) — có định mức S/L thì cho chọn size khi báo hao hụt
        hasSizes: p.priceSizeS != null || p.priceSizeL != null || p.formulas.some((f) => f.qtySizeS != null || f.qtySizeL != null),
        outOfStock: p.outOfStock || !!p.storeProducts[0]?.outOfStock,
        isAvailable: p.storeProducts[0]?.isAvailable ?? true,
        itemIds: p.formulas.map((f) => f.itemId),
      })),
    );
  });

  r.patch("/kitchen/products/:id", ...kitchen, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const storeId = mustStoreId(req);
    const productId = Number(req.params.id);
    const { outOfStock, isAvailable } = req.body as { outOfStock?: boolean; isAvailable?: boolean };
    if (typeof outOfStock !== "boolean" && typeof isAvailable !== "boolean") return res.status(400).json({ error: "Thiếu trạng thái." });

    const product = await prisma.product.findUnique({ where: { id: productId }, select: { name: true } });
    if (!product) return res.status(404).json({ error: "Không tìm thấy món." });
    const data = {
      ...(typeof outOfStock === "boolean" ? { outOfStock } : {}),
      ...(typeof isAvailable === "boolean" ? { isAvailable } : {}),
    };
    const row = await prisma.storeProduct.upsert({
      where: { storeId_productId: { storeId, productId } },
      update: data,
      create: { storeId, productId, ...data },
    });
    const what = typeof outOfStock === "boolean" ? (outOfStock ? "Báo hết món" : "Mở bán lại") : isAvailable ? "Hiện món" : "Ẩn món";
    audit(me.id, "KITCHEN_MENU", product.name, what);
    // Socket cho POS / Sơ đồ bàn / KDS + thông báo cho thu ngân, phục vụ, quản lý
    announceMenuChange({ storeIds: [storeId], productId, name: product.name, outOfStock: row.outOfStock, isAvailable: row.isAvailable, actor: me });
    res.json({ productId, outOfStock: row.outOfStock, isAvailable: row.isAvailable });
  });

  r.get("/kitchen/items", ...kitchen, async (req, res) => {
    const storeId = mustStoreId(req);
    const items = await prisma.inventoryItem.findMany({
      include: {
        storeStocks: { where: { storeId } },
        formulas: { select: { product: { select: { id: true, name: true } } } },
      },
      orderBy: { name: "asc" },
    });
    res.json(
      items.map((i) => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
        category: i.category,
        stockQty: i.storeStocks[0]?.stockQty ?? 0,
        minLevel: i.storeStocks[0]?.minLevel ?? 0,
        products: i.formulas.map((f) => f.product),
      })),
    );
  });

  r.post("/kitchen/waste", ...kitchen, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const storeId = mustStoreId(req);
    const { itemId, productId, size, qty, reason, note } = req.body as {
      itemId?: number; productId?: number; size?: string; qty?: number; reason?: string; note?: string;
    };
    // Hỏng món: số ly nguyên; hao hụt nguyên liệu: theo đơn vị kho, được lẻ (VD 0.5 hộp)
    if (typeof qty !== "number" || !(qty > 0) || qty > 1000 || (productId && !Number.isInteger(qty))) {
      return res.status(400).json({ error: productId ? "Số ly phải là số nguyên lớn hơn 0." : "Số lượng phải lớn hơn 0." });
    }
    if (!(WASTE_REASONS as readonly string[]).includes(reason ?? "")) return res.status(400).json({ error: "Chọn lý do hao hụt." });
    if (!itemId === !productId) return res.status(400).json({ error: "Chọn 1 nguyên liệu hoặc 1 món." });
    if (reason === "OTHER" && !note?.trim()) return res.status(400).json({ error: "Ghi rõ lý do." });

    const result = await prisma.$transaction(async (tx) => {
      let costValue = 0;
      let label = "";
      let deducted = 0;
      let alerts: LowStockAlert[] = [];
      const log = await tx.wasteLog.create({
        data: {
          storeId, staffId: me.id, itemId: itemId ?? null, productId: productId ?? null, size: productId ? size ?? null : null,
          qty: roundQty(qty!), reason: reason!, note: note?.trim() || null,
        },
      });
      if (itemId) {
        const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
        if (!item) throw new Error("Không tìm thấy nguyên liệu.");
        const row = await adjustStoreStock(tx, { storeId, itemId, qtyChange: -qty!, type: "WASTE", referenceId: `WASTE-${log.id}` });
        deducted = 1;
        costValue = Math.round(item.unitCostPrice * qty!);
        label = `${roundQty(qty!)} ${item.unit ?? ""} ${item.name}`.replace(/\s+/g, " ");
        if (row.stockQty <= Math.max(0, row.minLevel)) {
          const usedBy = await tx.productFormula.findMany({ where: { itemId }, include: { product: { select: { id: true, name: true } } } });
          alerts = [{ id: itemId, name: item.name, unit: item.unit, stockQty: roundQty(row.stockQty), minLevel: row.minLevel, products: usedBy.map((f) => f.product) }];
          emitLowStock(storeId, alerts);
        }
      } else {
        const product = await tx.product.findUnique({ where: { id: productId } });
        if (!product) throw new Error("Không tìm thấy món.");
        const r = await deductForCups(tx, { storeId, cups: [{ productId: product.id, size, quantity: qty! }], type: "WASTE", referenceId: `WASTE-${log.id}` });
        deducted = r.deducted;
        alerts = r.alerts;
        costValue = product.costPrice * qty!;
        label = `${qty} ly ${product.name}${size ? ` (${size})` : ""}`;
      }
      await tx.wasteLog.update({ where: { id: log.id }, data: { costValue } });
      return { log: { ...log, costValue }, label, deducted, alerts };
    }).catch((e: Error) => ({ error: e.message }));
    if ("error" in result) return res.status(400).json({ error: result.error });

    audit(me.id, "KITCHEN_WASTE", result.label, `${REASON_LABEL[reason!]}${note?.trim() ? ` — ${note.trim()}` : ""}`);
    toStore(io, "admin_room", storeId).emit("kitchen:waste", { id: result.log.id, label: result.label });
    res.status(201).json({
      ok: true,
      log: result.log,
      deducted: result.deducted,
      lowStock: result.alerts,
    });
  });

  r.get("/kitchen/waste", ...viewers, async (req, res) => {
    const q = req.query as { date?: string; month?: string };
    let from: Date;
    let to: Date;
    if (q.month && /^\d{4}-\d{2}$/.test(q.month)) {
      const [y, m] = q.month.split("-").map(Number);
      from = new Date(y, m - 1, 1);
      to = new Date(y, m, 1);
    } else {
      const d = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? new Date(`${q.date}T00:00:00`) : new Date();
      from = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      to = new Date(from.getTime() + 86_400_000);
    }
    const rows = await prisma.wasteLog.findMany({
      where: { ...storeWhere(req), createdAt: { gte: from, lt: to } },
      include: {
        staff: { select: { fullName: true } },
        product: { select: { name: true } },
        item: { select: { name: true, unit: true } },
        store: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(rows);
  });

  return r;
}
