/**
 * routes/stockRequests.ts — Cần hàng gấp giữa các chi nhánh
 *
 * Kho chi nhánh A sắp hết mà chưa kịp đặt nhà cung cấp → đăng yêu cầu.
 * Kho chi nhánh khác còn hàng bấm "Chuyển giúp" → hệ thống tạo phiếu chuyển kho
 * đã XUẤT (trừ tồn chi nhánh chuyển). Chi nhánh A xác nhận nhận hàng ở "Chuyển kho".
 *
 * GET  /stock-requests             — yêu cầu của chi nhánh mình + chi nhánh khác đang cần (kèm tồn của mình)
 * POST /stock-requests             — đăng yêu cầu { itemId, qty, note? }
 * POST /stock-requests/:id/accept  — chuyển giúp { qty? } (mặc định đủ số cần, tối đa tồn hiện có)
 * POST /stock-requests/:id/cancel  — chi nhánh cần hàng huỷ yêu cầu còn mở
 */
import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { attachStaff, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { mustStoreId, reqStoreId, toStore } from "../lib/storeScope.js";
import { adjustStoreStock } from "../lib/inventory.js";
import { audit } from "../lib/audit.js";
import { nextTransferCode } from "./stockTransfer.js";

export function stockRequestsRouter(prisma: PrismaClient, io: Server) {
  const r = Router();
  const stock = [attachStaff(prisma), requireRoles("Admin", "Warehouse")];
  const stockStore = [...stock, requireStore];

  const include = {
    store: { select: { id: true, name: true } },
    acceptedStore: { select: { id: true, name: true } },
    item: { select: { id: true, name: true, unit: true } },
    createdBy: { select: { fullName: true } },
    acceptedBy: { select: { fullName: true } },
    transfer: { select: { id: true, code: true, status: true } },
  } as const;

  /** Báo kho các chi nhánh (trừ chi nhánh `except`) */
  const notifyStores = async (event: string, payload: unknown, except?: number) => {
    const stores = await prisma.store.findMany({ where: { isActive: true }, select: { id: true } });
    for (const s of stores) if (s.id !== except) toStore(io, "admin_room", s.id).emit(event, payload);
  };

  r.get("/stock-requests", ...stock, async (req, res) => {
    const sid = reqStoreId(req);
    const since = new Date(Date.now() - 30 * 86_400_000);
    const rows = await prisma.stockRequest.findMany({
      where: { OR: [{ status: "OPEN" }, { createdAt: { gte: since } }] },
      include,
      orderBy: { id: "desc" },
      take: 200,
    });
    // Tồn của chi nhánh mình cho các nguyên liệu đang được hỏi
    const myStock = sid == null
      ? []
      : await prisma.storeInventory.findMany({ where: { storeId: sid, itemId: { in: [...new Set(rows.map((x) => x.itemId))] } } });
    res.json(
      rows.map((x) => ({
        ...x,
        mine: sid != null && x.storeId === sid,
        myStockQty: sid == null ? null : myStock.find((s) => s.itemId === x.itemId)?.stockQty ?? 0,
      })),
    );
  });

  r.post("/stock-requests", ...stockStore, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const storeId = mustStoreId(req);
    const { itemId, qty, note } = req.body as { itemId?: number; qty?: number; note?: string };
    if (!itemId || !Number.isInteger(qty) || qty! <= 0) return res.status(400).json({ error: "Chọn nguyên liệu và số lượng (số nguyên > 0)." });
    const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) return res.status(400).json({ error: "Không tìm thấy nguyên liệu." });
    const dup = await prisma.stockRequest.count({ where: { storeId, itemId, status: "OPEN" } });
    if (dup) return res.status(400).json({ error: "Chi nhánh đã có yêu cầu gấp cho nguyên liệu này đang chờ." });

    const row = await prisma.stockRequest.create({
      data: { storeId, itemId, qty: qty!, note: note?.trim() || null, createdById: me.id },
      include,
    });
    audit(me.id, "STOCK_REQUEST_CREATE", item.name, `Cần gấp ${qty} ${item.unit ?? ""}`);
    await notifyStores("stock-request:new", { id: row.id, storeName: row.store.name, itemName: item.name, qty }, storeId);
    res.status(201).json(row);
  });

  r.post("/stock-requests/:id/accept", ...stockStore, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const fromStoreId = mustStoreId(req);
    const id = Number(req.params.id);
    const cur = await prisma.stockRequest.findUnique({ where: { id }, include: { item: true, store: true } });
    if (!cur) return res.status(404).json({ error: "Không tìm thấy yêu cầu." });
    if (cur.status !== "OPEN") return res.status(400).json({ error: "Yêu cầu đã có chi nhánh khác nhận hoặc đã huỷ." });
    if (cur.storeId === fromStoreId) return res.status(400).json({ error: "Không tự chuyển cho chi nhánh mình." });

    const have = (await prisma.storeInventory.findUnique({ where: { storeId_itemId: { storeId: fromStoreId, itemId: cur.itemId } } }))?.stockQty ?? 0;
    const body = req.body as { qty?: number };
    const qty = body.qty ?? Math.min(cur.qty, Math.floor(have));
    if (!Number.isInteger(qty) || qty <= 0) return res.status(400).json({ error: "Chi nhánh không còn đủ hàng để chuyển." });
    if (qty > have) return res.status(400).json({ error: `Chỉ còn ${have} ${cur.item.unit ?? ""} trong kho.` });

    const code = await nextTransferCode(prisma);
    const result = await prisma.$transaction(async (tx) => {
      // Khoá yêu cầu trước để 2 chi nhánh không cùng nhận
      const lock = await tx.stockRequest.updateMany({ where: { id, status: "OPEN" }, data: { status: "ACCEPTED" } });
      if (lock.count === 0) return null;
      const transfer = await tx.stockTransfer.create({
        data: {
          code,
          fromStoreId,
          toStoreId: cur.storeId,
          status: "SHIPPED",
          shippedAt: new Date(),
          note: `Hàng gấp cho ${cur.store.name}${cur.note ? ` — ${cur.note}` : ""}`,
          createdById: me.id,
          items: { create: [{ itemId: cur.itemId, qty }] },
        },
      });
      await adjustStoreStock(tx, { storeId: fromStoreId, itemId: cur.itemId, qtyChange: -qty, type: "TRANSFER_OUT", referenceId: code });
      return tx.stockRequest.update({
        where: { id },
        data: { acceptedStoreId: fromStoreId, acceptedById: me.id, acceptedAt: new Date(), transferId: transfer.id },
        include,
      });
    });
    if (!result) return res.status(400).json({ error: "Yêu cầu vừa được chi nhánh khác nhận." });

    audit(me.id, "STOCK_REQUEST_ACCEPT", cur.item.name, `Chuyển ${qty} ${cur.item.unit ?? ""} → ${cur.store.name} (${code})`);
    toStore(io, "admin_room", cur.storeId).emit("stock-request:accepted", { id, fromStore: result.acceptedStore?.name, itemName: cur.item.name, qty, code });
    await notifyStores("stock-request:closed", { id }, cur.storeId);
    res.json(result);
  });

  r.post("/stock-requests/:id/cancel", ...stockStore, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    const cur = await prisma.stockRequest.findUnique({ where: { id } });
    if (!cur || cur.storeId !== mustStoreId(req)) return res.status(404).json({ error: "Không tìm thấy yêu cầu." });
    if (cur.status !== "OPEN") return res.status(400).json({ error: "Chỉ huỷ được yêu cầu đang chờ." });
    const row = await prisma.stockRequest.update({ where: { id }, data: { status: "CANCELLED" }, include });
    audit(me.id, "STOCK_REQUEST_CANCEL", `Yêu cầu #${id}`);
    await notifyStores("stock-request:closed", { id }, cur.storeId);
    res.json(row);
  });

  return r;
}
