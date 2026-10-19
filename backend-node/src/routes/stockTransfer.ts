import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { attachStaff, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { mustStoreId, reqStoreId } from "../lib/storeScope.js";
import { adjustStoreStock } from "../lib/inventory.js";
import { audit } from "../lib/audit.js";

/**
 * Phiếu chuyển kho giữa hai chi nhánh:
 *   PENDING  — chi nhánh gửi tạo phiếu
 *   SHIPPED  — chi nhánh gửi xuất kho (trừ tồn chi nhánh gửi)
 *   RECEIVED — chi nhánh nhận xác nhận số thực nhận (cộng tồn chi nhánh nhận)
 *   CANCELLED — huỷ khi chưa xuất kho
 */
export function stockTransferRouter(prisma: PrismaClient) {
  const r = Router();
  const admin = [attachStaff(prisma), requireRoles("Admin")];
  const storeAdmin = [...admin, requireStore];

  const include = {
    fromStore: { select: { id: true, name: true } },
    toStore: { select: { id: true, name: true } },
    createdBy: { select: { fullName: true } },
    receivedBy: { select: { fullName: true } },
    items: { include: { item: { select: { id: true, name: true, unit: true } } } },
  } as const;

  r.get("/stock-transfers", ...admin, async (req, res) => {
    const sid = reqStoreId(req);
    const rows = await prisma.stockTransfer.findMany({
      where: sid == null ? {} : { OR: [{ fromStoreId: sid }, { toStoreId: sid }] },
      include,
      orderBy: { id: "desc" },
      take: 200,
    });
    res.json(rows);
  });

  r.post("/stock-transfers", ...storeAdmin, async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const fromStoreId = mustStoreId(req);
    const { toStoreId, items, note } = req.body as {
      toStoreId?: number;
      items?: { itemId: number; qty: number }[];
      note?: string;
    };
    if (!toStoreId || toStoreId === fromStoreId) {
      return res.status(400).json({ error: "Chọn chi nhánh nhận khác chi nhánh gửi." });
    }
    const toStore = await prisma.store.findFirst({ where: { id: toStoreId, isActive: true } });
    if (!toStore) return res.status(400).json({ error: "Chi nhánh nhận không tồn tại hoặc đã ngừng hoạt động." });
    if (!Array.isArray(items) || items.length === 0 || items.some((i) => !i.itemId || !(i.qty > 0))) {
      return res.status(400).json({ error: "Cần ít nhất 1 nguyên liệu, số lượng > 0." });
    }

    const now = new Date();
    const count = await prisma.stockTransfer.count();
    const code = `TRF-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${String(count + 1).padStart(4, "0")}`;
    const row = await prisma.stockTransfer.create({
      data: {
        code,
        fromStoreId,
        toStoreId,
        note: note?.trim() || null,
        createdById: staff.id,
        items: { create: items.map((i) => ({ itemId: i.itemId, qty: Math.round(i.qty) })) },
      },
      include,
    });
    audit(staff.id, "STOCK_TRANSFER_CREATE", code, `→ ${toStore.name}, ${items.length} nguyên liệu`);
    res.status(201).json(row);
  });

  /** Chi nhánh gửi xuất kho */
  r.post("/stock-transfers/:id/ship", ...storeAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const staff = (req as StaffRequest).staffRow!;
    const t = await prisma.stockTransfer.findUnique({ where: { id }, include: { items: true } });
    if (!t || t.fromStoreId !== mustStoreId(req)) return res.status(404).json({ error: "Không tìm thấy phiếu." });
    if (t.status !== "PENDING") return res.status(400).json({ error: "Phiếu không ở trạng thái chờ xuất." });

    const stocks = await prisma.storeInventory.findMany({
      where: { storeId: t.fromStoreId, itemId: { in: t.items.map((i) => i.itemId) } },
    });
    const short = t.items.filter((i) => (stocks.find((s) => s.itemId === i.itemId)?.stockQty ?? 0) < i.qty);
    if (short.length) {
      return res.status(400).json({ error: `Không đủ tồn kho cho ${short.length} nguyên liệu.` });
    }

    const updated = await prisma.$transaction(async (tx) => {
      for (const it of t.items) {
        await adjustStoreStock(tx, {
          storeId: t.fromStoreId,
          itemId: it.itemId,
          qtyChange: -it.qty,
          type: "TRANSFER_OUT",
          referenceId: t.code,
        });
      }
      return tx.stockTransfer.update({ where: { id }, data: { status: "SHIPPED", shippedAt: new Date() }, include });
    });
    audit(staff.id, "STOCK_TRANSFER_SHIP", t.code);
    res.json(updated);
  });

  /** Chi nhánh nhận xác nhận. Body tuỳ chọn: { received: { [itemId]: số thực nhận } } */
  r.post("/stock-transfers/:id/receive", ...storeAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const staff = (req as StaffRequest).staffRow!;
    const received = ((req.body ?? {}) as { received?: Record<string, number> }).received ?? {};
    const t = await prisma.stockTransfer.findUnique({ where: { id }, include: { items: true } });
    if (!t || t.toStoreId !== mustStoreId(req)) return res.status(404).json({ error: "Không tìm thấy phiếu." });
    if (t.status !== "SHIPPED") return res.status(400).json({ error: "Phiếu chưa được chi nhánh gửi xuất kho." });

    const updated = await prisma.$transaction(async (tx) => {
      for (const it of t.items) {
        const raw = received[String(it.itemId)];
        const qty = typeof raw === "number" && raw >= 0 ? Math.min(Math.round(raw), it.qty) : it.qty;
        await tx.stockTransferItem.update({ where: { id: it.id }, data: { receivedQty: qty } });
        if (qty > 0) {
          await adjustStoreStock(tx, {
            storeId: t.toStoreId,
            itemId: it.itemId,
            qtyChange: qty,
            type: "TRANSFER_IN",
            referenceId: t.code,
          });
        }
      }
      return tx.stockTransfer.update({
        where: { id },
        data: { status: "RECEIVED", receivedAt: new Date(), receivedById: staff.id },
        include,
      });
    });
    audit(staff.id, "STOCK_TRANSFER_RECEIVE", t.code);
    res.json(updated);
  });

  r.post("/stock-transfers/:id/cancel", ...storeAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const staff = (req as StaffRequest).staffRow!;
    const t = await prisma.stockTransfer.findUnique({ where: { id } });
    if (!t || t.fromStoreId !== mustStoreId(req)) return res.status(404).json({ error: "Không tìm thấy phiếu." });
    if (t.status !== "PENDING") return res.status(400).json({ error: "Chỉ huỷ được phiếu chưa xuất kho." });
    const updated = await prisma.stockTransfer.update({ where: { id }, data: { status: "CANCELLED" }, include });
    audit(staff.id, "STOCK_TRANSFER_CANCEL", t.code);
    res.json(updated);
  });

  return r;
}
