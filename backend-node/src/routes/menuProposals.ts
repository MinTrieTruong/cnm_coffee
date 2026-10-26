/**
 * routes/menuProposals.ts — Pha chế đề xuất món mới
 *
 * PENDING → (Chủ chuỗi duyệt) APPROVED → (tạo món từ đề xuất) CREATED
 *         ↘ REJECTED
 *
 * GET  /menu-proposals              — Pha chế: của mình · Quản lý: chi nhánh · Chủ chuỗi: tất cả
 * GET  /menu-proposals/:id
 * POST /menu-proposals              — pha chế gửi đề xuất
 * POST /menu-proposals/:id/review   — Chủ chuỗi duyệt / từ chối { status, note? }
 * POST /menu-proposals/:id/created  — gắn món vừa tạo { productId } → CREATED
 */
import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { attachStaff, isOwner, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { mustStoreId, storeWhere, toStore } from "../lib/storeScope.js";
import { audit } from "../lib/audit.js";
import { notify } from "../lib/notify.js";

export function menuProposalsRouter(prisma: PrismaClient, io: Server) {
  const r = Router();
  const anyStaff = [attachStaff(prisma)];
  const proposer = [attachStaff(prisma), requireRoles("Kitchen", "Admin"), requireStore];
  const owner = [attachStaff(prisma), requireRoles("Owner")];

  const include = {
    staff: { select: { id: true, fullName: true } },
    store: { select: { id: true, name: true } },
    category: { select: { id: true, name: true } },
    reviewer: { select: { fullName: true } },
    product: { select: { id: true, name: true } },
  } as const;

  r.get("/menu-proposals", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const where = isOwner(me.role) ? storeWhere(req) : me.role === "Admin" ? storeWhere(req) : { staffId: me.id };
    res.json(await prisma.menuProposal.findMany({ where, include, orderBy: { id: "desc" }, take: 200 }));
  });

  r.get("/menu-proposals/:id", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const row = await prisma.menuProposal.findUnique({ where: { id: Number(req.params.id) }, include });
    if (!row || (!isOwner(me.role) && row.staffId !== me.id && !(me.role === "Admin" && row.storeId === me.storeId))) {
      return res.status(404).json({ error: "Không tìm thấy đề xuất." });
    }
    res.json(row);
  });

  r.post("/menu-proposals", ...proposer, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const storeId = mustStoreId(req);
    const b = req.body as { name?: string; description?: string; recipe?: string; suggestedPrice?: number; categoryId?: number; imageUrl?: string };
    if (!b.name?.trim()) return res.status(400).json({ error: "Đặt tên món." });
    if (!b.recipe?.trim()) return res.status(400).json({ error: "Ghi nguyên liệu & cách làm." });
    if (b.suggestedPrice != null && !(Number.isInteger(b.suggestedPrice) && b.suggestedPrice >= 0)) {
      return res.status(400).json({ error: "Giá đề xuất không hợp lệ." });
    }
    if (b.categoryId != null && !(await prisma.category.findUnique({ where: { id: b.categoryId } }))) {
      return res.status(400).json({ error: "Danh mục không tồn tại." });
    }
    const row = await prisma.menuProposal.create({
      data: {
        storeId, staffId: me.id,
        name: b.name.trim(),
        description: b.description?.trim() || null,
        recipe: b.recipe.trim(),
        suggestedPrice: b.suggestedPrice ?? null,
        categoryId: b.categoryId ?? null,
        imageUrl: b.imageUrl?.trim() || null,
      },
      include,
    });
    audit(me.id, "MENU_PROPOSAL_CREATE", row.name);
    // Chủ chuỗi nhận thông báo qua phòng quản lý của chi nhánh
    toStore(io, "admin_room", storeId).emit("menu-proposal:new", { id: row.id, name: row.name, by: me.fullName });
    void notify({
      type: "MENU_PROPOSAL",
      title: `Đề xuất món mới: ${row.name}`,
      body: `${me.fullName} đề xuất — chờ Chủ chuỗi duyệt.`,
      link: "/app/sales/proposals",
      storeId,
      to: { roles: ["Owner"] },
    });
    res.status(201).json(row);
  });

  r.post("/menu-proposals/:id/review", ...owner, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    const { status, note } = req.body as { status?: string; note?: string };
    if (status !== "APPROVED" && status !== "REJECTED") return res.status(400).json({ error: "Trạng thái không hợp lệ." });
    if (status === "REJECTED" && !note?.trim()) return res.status(400).json({ error: "Ghi lý do từ chối để pha chế biết." });
    const cur = await prisma.menuProposal.findUnique({ where: { id } });
    if (!cur) return res.status(404).json({ error: "Không tìm thấy đề xuất." });
    if (cur.status !== "PENDING") return res.status(400).json({ error: "Đề xuất đã được xử lý." });
    const row = await prisma.menuProposal.update({
      where: { id },
      data: { status, ownerNote: note?.trim() || null, reviewedById: me.id, reviewedAt: new Date() },
      include,
    });
    audit(me.id, status === "APPROVED" ? "MENU_PROPOSAL_APPROVE" : "MENU_PROPOSAL_REJECT", row.name);
    io.to(`staff_${row.staffId}`).emit("menu-proposal:reviewed", { id, status });
    void notify({
      type: "MENU_PROPOSAL",
      title: `Đề xuất "${row.name}" ${status === "APPROVED" ? "đã được duyệt" : "bị từ chối"}`,
      body: note?.trim() || null,
      to: { staffIds: [row.staffId] },
    });
    res.json(row);
  });

  r.post("/menu-proposals/:id/created", ...owner, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    const productId = Number((req.body as { productId?: number }).productId);
    const [cur, product] = await Promise.all([
      prisma.menuProposal.findUnique({ where: { id } }),
      prisma.product.findUnique({ where: { id: productId } }),
    ]);
    if (!cur) return res.status(404).json({ error: "Không tìm thấy đề xuất." });
    if (!product) return res.status(400).json({ error: "Không tìm thấy món." });
    if (cur.status !== "APPROVED") return res.status(400).json({ error: "Đề xuất chưa được duyệt hoặc đã tạo món." });
    const row = await prisma.menuProposal.update({ where: { id }, data: { status: "CREATED", productId }, include });
    audit(me.id, "MENU_PROPOSAL_CREATED", row.name, `Món #${productId}`);
    io.to(`staff_${row.staffId}`).emit("menu-proposal:reviewed", { id, status: "CREATED" });
    void notify({ type: "MENU_PROPOSAL", title: `Món "${row.name}" bạn đề xuất đã lên thực đơn`, to: { staffIds: [row.staffId] } });
    res.json(row);
  });

  return r;
}
