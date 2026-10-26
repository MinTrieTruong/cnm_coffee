/**
 * routes/branchProposals.ts — Quản lý chi nhánh đề xuất lên Chủ chuỗi
 *
 * Thiếu nhân sự cần tuyển, hư hỏng bàn ghế / thiết bị, cần cấp thêm đồ dùng…
 * Chỉ là luồng đề xuất – duyệt: mua sắm / tuyển dụng làm ngoài hệ thống (không vào kho, sổ quỹ hay công nợ),
 * xong thì Chủ chuỗi bấm "Đã xử lý" kèm ghi chú.
 *
 *   PENDING ─(duyệt)→ APPROVED ─(đã xử lý)→ DONE
 *           ─(từ chối)→ REJECTED
 *           ─(cần bổ sung)→ NEED_INFO ─(quản lý sửa & gửi lại)→ PENDING
 *   PENDING / NEED_INFO ─(quản lý huỷ)→ CANCELLED
 *
 * GET  /branch-proposals             — Quản lý: chi nhánh mình · Chủ chuỗi: chi nhánh đang chọn / tất cả
 * POST /branch-proposals             — Quản lý gửi đề xuất { category, title, description, priority?, quantity?, staffRole?, estimatedCost?, photoDataUrl? }
 * PUT  /branch-proposals/:id         — Quản lý sửa (khi Chờ duyệt / Cần bổ sung → gửi lại thành Chờ duyệt) { …, removePhoto? }
 * POST /branch-proposals/:id/cancel  — Quản lý huỷ
 * POST /branch-proposals/:id/review  — Chủ chuỗi { status: APPROVED | REJECTED | NEED_INFO, note? }
 * POST /branch-proposals/:id/done    — Chủ chuỗi đánh dấu đã xử lý { note? }
 */
import { Router } from "express";
import type { Request } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { attachStaff, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { inStore, mustStoreId, storeWhere, toStore } from "../lib/storeScope.js";
import { SHIFT_ROLES } from "../lib/hrConfig.js";
import { saveDataUrlImage } from "../lib/uploadImage.js";
import { audit } from "../lib/audit.js";
import { notify } from "../lib/notify.js";

export const PROPOSAL_CATEGORIES = { STAFFING: "Thiếu nhân sự", FACILITY: "Hư hỏng / sửa chữa", SUPPLY: "Cần cấp thêm", OTHER: "Khác" } as const;
const LINK = "/app/overview/branch-proposals";

type Body = {
  category?: string;
  title?: string;
  description?: string;
  priority?: string;
  quantity?: number | null;
  staffRole?: string | null;
  estimatedCost?: number | null;
  photoDataUrl?: string;
  removePhoto?: boolean;
};

export function branchProposalsRouter(prisma: PrismaClient, io: Server) {
  const r = Router();
  const viewers = [attachStaff(prisma), requireRoles("Admin")];
  const manager = [attachStaff(prisma), requireRoles("Admin"), requireStore];
  const owner = [attachStaff(prisma), requireRoles("Owner")];

  const include = {
    staff: { select: { id: true, fullName: true } },
    store: { select: { id: true, name: true } },
    reviewer: { select: { fullName: true } },
  } as const;

  const emit = (storeId: number, id: number) => toStore(io, "admin_room", storeId).emit("branch-proposal:update", { id });

  /** Kiểm tra & chuẩn hoá nội dung đề xuất; trả chuỗi lỗi nếu sai */
  async function parse(b: Body) {
    if (!b.category || !(b.category in PROPOSAL_CATEGORIES)) return "Chọn loại đề xuất.";
    if (!b.title?.trim()) return "Nhập tiêu đề đề xuất.";
    if (!b.description?.trim()) return "Mô tả rõ vấn đề để Chủ chuỗi nắm.";
    const int = (v: unknown, max: number) => v == null || v === "" ? null : Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : NaN;
    const quantity = int(b.quantity, 10_000);
    const estimatedCost = int(b.estimatedCost, 10_000_000_000);
    if (Number.isNaN(quantity)) return "Số lượng không hợp lệ.";
    if (Number.isNaN(estimatedCost)) return "Chi phí ước tính không hợp lệ.";
    const staffRole = b.category === "STAFFING" ? b.staffRole || null : null;
    if (staffRole && !(SHIFT_ROLES as readonly string[]).includes(staffRole)) return "Vị trí cần tuyển không hợp lệ.";
    if (b.category === "STAFFING" && !staffRole) return "Chọn vị trí cần tuyển.";
    if (b.category === "STAFFING" && !quantity) return "Nhập số người cần tuyển.";
    let imageUrl: string | undefined;
    if (b.photoDataUrl) {
      try {
        imageUrl = await saveDataUrlImage(b.photoDataUrl);
      } catch (e) {
        return (e as Error).message;
      }
    }
    return {
      category: b.category,
      title: b.title.trim().slice(0, 200),
      description: b.description.trim().slice(0, 5000),
      priority: b.priority === "URGENT" ? "URGENT" : "NORMAL",
      quantity,
      staffRole,
      estimatedCost,
      ...(imageUrl ? { imageUrl } : b.removePhoto ? { imageUrl: null } : {}),
    };
  }

  const pingOwner = (row: { id: number; storeId: number; title: string; priority: string; store: { name: string } }, by: string, resent = false) =>
    void notify({
      type: "BRANCH_PROPOSAL",
      severity: row.priority === "URGENT" ? "IMPORTANT" : "NORMAL",
      title: `${row.priority === "URGENT" ? "[Gấp] " : ""}${resent ? "Đề xuất đã bổ sung" : "Đề xuất mới"}: ${row.title}`,
      body: `${by} · ${row.store.name} — chờ bạn duyệt.`,
      link: LINK,
      storeId: row.storeId,
      to: { roles: ["Owner"] },
    });

  /** Báo các quản lý của chi nhánh (người gửi + quản lý khác) */
  const pingStore = (row: { storeId: number }, title: string, body?: string | null) =>
    void notify({ type: "BRANCH_PROPOSAL", title, body: body ?? null, link: LINK, storeId: row.storeId, to: { storeId: row.storeId, roles: ["Admin"] } });

  async function findInScope(req: Request) {
    const row = await prisma.branchProposal.findUnique({ where: { id: Number(req.params.id) }, include });
    return row && inStore(req, row) ? row : null;
  }

  r.get("/branch-proposals", ...viewers, async (req, res) => {
    res.json(await prisma.branchProposal.findMany({ where: storeWhere(req), include, orderBy: { id: "desc" }, take: 500 }));
  });

  r.post("/branch-proposals", ...manager, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    if (me.role !== "Admin") return res.status(403).json({ error: "Chỉ quản lý chi nhánh gửi đề xuất." });
    const data = await parse(req.body as Body);
    if (typeof data === "string") return res.status(400).json({ error: data });
    const row = await prisma.branchProposal.create({ data: { ...data, storeId: mustStoreId(req), staffId: me.id }, include });
    audit(me.id, "BRANCH_PROPOSAL_CREATE", row.title, PROPOSAL_CATEGORIES[row.category as keyof typeof PROPOSAL_CATEGORIES]);
    pingOwner(row, me.fullName);
    emit(row.storeId, row.id);
    res.status(201).json(row);
  });

  r.put("/branch-proposals/:id", ...manager, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    if (me.role !== "Admin") return res.status(403).json({ error: "Chỉ quản lý chi nhánh sửa đề xuất." });
    const cur = await findInScope(req);
    if (!cur) return res.status(404).json({ error: "Không tìm thấy đề xuất." });
    if (cur.status !== "PENDING" && cur.status !== "NEED_INFO") return res.status(400).json({ error: "Đề xuất đã được xử lý, không sửa được nữa." });
    const data = await parse(req.body as Body);
    if (typeof data === "string") return res.status(400).json({ error: data });
    const resent = cur.status === "NEED_INFO";
    const row = await prisma.branchProposal.update({ where: { id: cur.id }, data: { ...data, status: "PENDING" }, include });
    audit(me.id, "BRANCH_PROPOSAL_UPDATE", row.title, resent ? "Bổ sung & gửi lại" : undefined);
    if (resent) pingOwner(row, me.fullName, true);
    emit(row.storeId, row.id);
    res.json(row);
  });

  r.post("/branch-proposals/:id/cancel", ...manager, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    if (me.role !== "Admin") return res.status(403).json({ error: "Chỉ quản lý chi nhánh huỷ đề xuất." });
    const cur = await findInScope(req);
    if (!cur) return res.status(404).json({ error: "Không tìm thấy đề xuất." });
    if (cur.status !== "PENDING" && cur.status !== "NEED_INFO") return res.status(400).json({ error: "Đề xuất đã được xử lý, không huỷ được." });
    const row = await prisma.branchProposal.update({ where: { id: cur.id }, data: { status: "CANCELLED" }, include });
    audit(me.id, "BRANCH_PROPOSAL_CANCEL", row.title);
    emit(row.storeId, row.id);
    res.json(row);
  });

  r.post("/branch-proposals/:id/review", ...owner, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const { status, note } = req.body as { status?: string; note?: string };
    if (status !== "APPROVED" && status !== "REJECTED" && status !== "NEED_INFO") return res.status(400).json({ error: "Trạng thái không hợp lệ." });
    if (status !== "APPROVED" && !note?.trim()) {
      return res.status(400).json({ error: status === "REJECTED" ? "Ghi lý do từ chối để quản lý biết." : "Ghi rõ cần bổ sung thông tin gì." });
    }
    const cur = await findInScope(req);
    if (!cur) return res.status(404).json({ error: "Không tìm thấy đề xuất." });
    if (cur.status !== "PENDING") return res.status(400).json({ error: "Đề xuất không còn ở trạng thái chờ duyệt." });
    const row = await prisma.branchProposal.update({
      where: { id: cur.id },
      data: { status, ownerNote: note?.trim().slice(0, 1000) || null, reviewedById: me.id, reviewedAt: new Date() },
      include,
    });
    audit(me.id, `BRANCH_PROPOSAL_${status}`, row.title, note?.trim());
    const verb = status === "APPROVED" ? "đã được duyệt" : status === "REJECTED" ? "không được duyệt" : "cần bổ sung thông tin";
    pingStore(row, `Đề xuất "${row.title}" ${verb}`, note?.trim());
    emit(row.storeId, row.id);
    res.json(row);
  });

  r.post("/branch-proposals/:id/done", ...owner, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const { note } = req.body as { note?: string };
    const cur = await findInScope(req);
    if (!cur) return res.status(404).json({ error: "Không tìm thấy đề xuất." });
    if (cur.status !== "APPROVED") return res.status(400).json({ error: "Chỉ đánh dấu xử lý xong cho đề xuất đã duyệt." });
    const row = await prisma.branchProposal.update({ where: { id: cur.id }, data: { status: "DONE", doneNote: note?.trim().slice(0, 1000) || null, doneAt: new Date() }, include });
    audit(me.id, "BRANCH_PROPOSAL_DONE", row.title, note?.trim());
    pingStore(row, `Đề xuất "${row.title}" đã được xử lý`, note?.trim());
    emit(row.storeId, row.id);
    res.json(row);
  });

  return r;
}
