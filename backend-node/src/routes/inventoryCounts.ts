/**
 * routes/inventoryCounts.ts — Phiếu kiểm kê kho
 *
 * Số tồn không sửa tay được nữa (PATCH /admin/inventory chặn): muốn điều chỉnh thì đếm thực tế và lập phiếu.
 *   Thủ kho lập phiếu → PENDING → Quản lý duyệt → APPLIED (tồn kho cộng/trừ phần chênh lệch)
 *                               → Quản lý từ chối → REJECTED
 *   Quản lý tự lập phiếu → áp dụng luôn.
 * Chênh lệch = số đếm − tồn hệ thống LÚC ĐẾM, nên hàng bán ra trong lúc chờ duyệt vẫn được tính đúng.
 * Kiểm kê thiếu → ghi Sổ hao hụt (lý do STOCKTAKE) theo giá nhập lúc đếm; trừ lô theo hết-hạn-trước-xuất-trước.
 *
 * GET  /inventory-counts              — phiếu của chi nhánh (Chủ chuỗi: chi nhánh đang chọn / tất cả)
 * POST /inventory-counts              — lập phiếu { note?, lines: [{ itemId, countedQty, note? }] }
 * POST /inventory-counts/:id/approve  — Quản lý duyệt & áp dụng
 * POST /inventory-counts/:id/reject   — Quản lý từ chối { note }
 */
import { Router } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { attachStaff, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { inStore, mustStoreId, storeWhere, toStore } from "../lib/storeScope.js";
import { adjustStoreStock, roundQty } from "../lib/inventory.js";
import { audit } from "../lib/audit.js";
import { notify } from "../lib/notify.js";

const LINK = "/app/inventory/counts";
const EPS = 0.0001;

export function inventoryCountsRouter(prisma: PrismaClient, io: Server) {
  const r = Router();
  const stock = [attachStaff(prisma), requireRoles("Admin", "Warehouse")];
  const stockStore = [...stock, requireStore];
  const manager = [attachStaff(prisma), requireRoles("Admin"), requireStore];

  const include = {
    store: { select: { id: true, name: true } },
    createdBy: { select: { id: true, fullName: true } },
    approvedBy: { select: { fullName: true } },
    lines: { include: { item: { select: { id: true, name: true, unit: true } } }, orderBy: { id: "asc" } },
  } as const;

  /** Cộng/trừ tồn theo phiếu; kiểm kê thiếu ghi Sổ hao hụt. Trả giá trị thiếu / thừa. */
  async function apply(tx: Prisma.TransactionClient, countId: number, staffId: number) {
    const c = await tx.inventoryCount.findUniqueOrThrow({ where: { id: countId }, include: { lines: { include: { item: { select: { name: true } } } } } });
    let shortValue = 0;
    let surplusValue = 0;
    for (const l of c.lines) {
      const delta = roundQty(l.countedQty - l.systemQty);
      if (Math.abs(delta) < EPS) continue;
      let ref = c.code ?? `KK-${c.id}`;
      if (delta < 0) {
        const value = Math.round(l.unitCost * -delta);
        shortValue += value;
        const log = await tx.wasteLog.create({
          data: { storeId: c.storeId, staffId, itemId: l.itemId, qty: -delta, reason: "STOCKTAKE", note: `Kiểm kê thiếu theo phiếu ${ref}${l.note ? ` — ${l.note}` : ""}`, costValue: value },
        });
        ref = `${ref} · WASTE-${log.id}`;
      } else surplusValue += Math.round(l.unitCost * delta);
      await adjustStoreStock(tx, { storeId: c.storeId, itemId: l.itemId, qtyChange: delta, type: "STOCKTAKE", referenceId: ref.slice(0, 100) });
    }
    await tx.inventoryCount.update({ where: { id: countId }, data: { status: "APPLIED", approvedById: staffId, approvedAt: new Date() } });
    return { shortValue, surplusValue };
  }

  r.get("/inventory-counts", ...stock, async (req, res) => {
    res.json(await prisma.inventoryCount.findMany({ where: storeWhere(req), include, orderBy: { id: "desc" }, take: 200 }));
  });

  r.post("/inventory-counts", ...stockStore, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const storeId = mustStoreId(req);
    const b = req.body as { note?: string; lines?: { itemId?: number; countedQty?: number; note?: string }[] };
    const lines = (b.lines ?? []).filter((l) => l && l.itemId);
    if (!lines.length) return res.status(400).json({ error: "Nhập số đếm thực tế cho ít nhất 1 nguyên liệu." });
    if (new Set(lines.map((l) => l.itemId)).size !== lines.length) return res.status(400).json({ error: "Một nguyên liệu bị nhập 2 lần." });
    if (lines.some((l) => typeof l.countedQty !== "number" || !Number.isFinite(l.countedQty) || l.countedQty < 0)) {
      return res.status(400).json({ error: "Số đếm phải là số từ 0 trở lên." });
    }
    const ids = lines.map((l) => l.itemId!);
    const [items, stocks] = await Promise.all([
      prisma.inventoryItem.findMany({ where: { id: { in: ids } }, select: { id: true, unitCostPrice: true } }),
      prisma.storeInventory.findMany({ where: { storeId, itemId: { in: ids } }, select: { itemId: true, stockQty: true } }),
    ]);
    if (items.length !== ids.length) return res.status(400).json({ error: "Có nguyên liệu không tồn tại." });
    const cost = new Map(items.map((i) => [i.id, i.unitCostPrice]));
    const sys = new Map(stocks.map((s) => [s.itemId, s.stockQty]));
    // Quản lý (hoặc Chủ chuỗi đang chọn chi nhánh) lập phiếu → áp dụng luôn
    const selfApprove = me.role !== "Warehouse";

    const result = await prisma.$transaction(async (tx) => {
      const c = await tx.inventoryCount.create({
        data: {
          storeId, createdById: me.id, note: b.note?.trim().slice(0, 500) || null,
          lines: {
            create: lines.map((l) => ({
              itemId: l.itemId!,
              systemQty: roundQty(sys.get(l.itemId!) ?? 0),
              countedQty: roundQty(l.countedQty!),
              unitCost: cost.get(l.itemId!) ?? 0,
              note: l.note?.trim().slice(0, 255) || null,
            })),
          },
        },
      });
      const d = c.createdAt;
      await tx.inventoryCount.update({ where: { id: c.id }, data: { code: `KK-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}-${String(c.id).padStart(4, "0")}` } });
      const applied = selfApprove ? await apply(tx, c.id, me.id) : null;
      return { id: c.id, applied };
    });
    const row = await prisma.inventoryCount.findUniqueOrThrow({ where: { id: result.id }, include });
    audit(me.id, "INVENTORY_COUNT_CREATE", row.code ?? `#${row.id}`, `${row.lines.length} nguyên liệu${result.applied ? " · áp dụng ngay" : ""}`);
    toStore(io, "admin_room", storeId).emit("inventory-count:update", { id: row.id });
    if (!result.applied) {
      void notify({
        type: "INVENTORY_COUNT",
        title: `Phiếu kiểm kê ${row.code} chờ duyệt`,
        body: `${me.fullName} đếm ${row.lines.length} nguyên liệu — duyệt để cập nhật tồn kho.`,
        link: LINK,
        storeId,
        to: { storeId, roles: ["Admin"] },
      });
    }
    res.status(201).json({ ...row, ...result.applied });
  });

  r.post("/inventory-counts/:id/approve", ...manager, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const cur = await prisma.inventoryCount.findUnique({ where: { id: Number(req.params.id) } });
    if (!cur || !inStore(req, cur)) return res.status(404).json({ error: "Không tìm thấy phiếu kiểm kê." });
    // Chỉ chuyển trạng thái khi phiếu còn chờ — 2 người bấm duyệt cùng lúc không áp dụng 2 lần
    const out = await prisma.$transaction(async (tx) => {
      const lock = await tx.inventoryCount.updateMany({ where: { id: cur.id, status: "PENDING" }, data: { status: "APPLYING" } });
      if (!lock.count) return null;
      return apply(tx, cur.id, me.id);
    });
    if (!out) return res.status(400).json({ error: "Phiếu đã được xử lý." });
    const row = await prisma.inventoryCount.findUniqueOrThrow({ where: { id: cur.id }, include });
    audit(me.id, "INVENTORY_COUNT_APPLY", row.code ?? `#${row.id}`);
    toStore(io, "admin_room", row.storeId).emit("inventory-count:update", { id: row.id });
    void notify({ type: "INVENTORY_COUNT", title: `Phiếu kiểm kê ${row.code} đã được duyệt`, body: "Tồn kho đã cập nhật theo số đếm.", link: LINK, storeId: row.storeId, to: { staffIds: [row.createdById] } });
    res.json({ ...row, ...out });
  });

  r.post("/inventory-counts/:id/reject", ...manager, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const note = (req.body as { note?: string }).note?.trim();
    if (!note) return res.status(400).json({ error: "Ghi lý do từ chối (VD: cần đếm lại)." });
    const cur = await prisma.inventoryCount.findUnique({ where: { id: Number(req.params.id) } });
    if (!cur || !inStore(req, cur)) return res.status(404).json({ error: "Không tìm thấy phiếu kiểm kê." });
    const done = await prisma.inventoryCount.updateMany({
      where: { id: cur.id, status: "PENDING" },
      data: { status: "REJECTED", rejectNote: note.slice(0, 500), approvedById: me.id, approvedAt: new Date() },
    });
    if (!done.count) return res.status(400).json({ error: "Phiếu đã được xử lý." });
    const row = await prisma.inventoryCount.findUniqueOrThrow({ where: { id: cur.id }, include });
    audit(me.id, "INVENTORY_COUNT_REJECT", row.code ?? `#${row.id}`, note);
    toStore(io, "admin_room", row.storeId).emit("inventory-count:update", { id: row.id });
    void notify({ type: "INVENTORY_COUNT", title: `Phiếu kiểm kê ${row.code} bị từ chối`, body: note, link: LINK, storeId: row.storeId, to: { staffIds: [row.createdById] } });
    res.json(row);
  });

  return r;
}
