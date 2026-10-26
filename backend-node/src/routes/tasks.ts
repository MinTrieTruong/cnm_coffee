/**
 * routes/tasks.ts — Giao việc trong ngày (vệ sinh khu vực, kiểm kê, chuẩn bị…)
 *
 * Quản lý chi nhánh (Chủ chuỗi khi đang chọn 1 chi nhánh):
 *   GET    /tasks?date=YYYY-MM-DD        — việc của chi nhánh trong ngày + gợi ý khu vực
 *   GET    /tasks/assignees?date=        — nhân viên có thể giao (kèm ca làm ngày đó)
 *   POST   /tasks                        — giao việc { title, description?, area?, dueMin?, priority?, requirePhoto?, staffIds, dateFrom, dateTo? }
 *   PUT    /tasks/:id                    — sửa việc / đổi người làm
 *   DELETE /tasks/:id
 *   POST   /tasks/:id/redo               — yêu cầu làm lại { staffId, note }
 *   POST   /tasks/copy                   — chép việc của ngày `from` sang ngày `to`
 * Nhân viên:
 *   GET    /tasks/my?date=               — việc được giao cho tôi
 *   POST   /tasks/:id/done               — báo xong { note?, photoDataUrl? }
 *   POST   /tasks/:id/undo               — bỏ đánh dấu xong
 *
 * Socket: "task:assigned" / "task:redo" tới phòng staff_<id>; "task:update" tới admin_room của chi nhánh.
 */
import { Router } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { attachStaff, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { inStore, mustStoreId, toStore } from "../lib/storeScope.js";
import { audit } from "../lib/audit.js";
import { saveDataUrlImage } from "../lib/uploadImage.js";
import { bizToday } from "../lib/bizTime.js";
import { notify } from "../lib/notify.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Ngày lưu 00:00 UTC — cùng quy ước với Work_Schedules */
const dateOnly = (s: string) => new Date(`${s}T00:00:00Z`);
const ymdUtc = (d: Date) => d.toISOString().slice(0, 10);
/** Hôm nay theo giờ quán (không phụ thuộc múi giờ máy chủ) */
const localToday = bizToday;
const dateParam = (v: unknown) => (typeof v === "string" && DATE_RE.test(v) ? v : localToday());
const MAX_DAYS = 31;

const include = {
  createdBy: { select: { id: true, fullName: true } },
  assignees: {
    include: { staff: { select: { id: true, fullName: true, role: true } } },
    orderBy: { id: "asc" },
  },
} satisfies Prisma.WorkTaskInclude;

type TaskRow = Prisma.WorkTaskGetPayload<{ include: typeof include }>;
const shape = (t: TaskRow) => ({ ...t, workDate: ymdUtc(t.workDate) });

type TaskBody = {
  title?: string;
  description?: string | null;
  area?: string | null;
  dueMin?: number | null;
  priority?: string;
  requirePhoto?: boolean;
  staffIds?: number[];
  dateFrom?: string;
  dateTo?: string;
};

export function tasksRouter(prisma: PrismaClient, io: Server) {
  const r = Router();
  const auth = attachStaff(prisma);
  const staffStore = [auth, requireStore];
  const manager = [auth, requireRoles("Admin"), requireStore];

  const notifyStaff = (ids: number[], event: string, payload: unknown) => {
    for (const id of new Set(ids)) io.to(`staff_${id}`).emit(event, payload);
  };
  /** Ghi vào Trung tâm thông báo cho việc mới / yêu cầu làm lại */
  const inbox = (ids: number[], storeId: number, title: string, body?: string | null) =>
    ids.length && void notify({ type: "TASK", title, body, link: "/app/hr/my-tasks", storeId, to: { staffIds: [...new Set(ids)] } });
  const notifyManagers = (storeId: number, payload: unknown) => toStore(io, "admin_room", storeId).emit("task:update", payload);

  /** Kiểm tra trường chung; trả lỗi (chuỗi) hoặc dữ liệu đã chuẩn hóa */
  async function parseBody(b: TaskBody, storeId: number, partial: boolean) {
    const title = b.title?.trim();
    if (!partial || b.title !== undefined) {
      if (!title) return "Nhập tên công việc.";
      if (title.length > 150) return "Tên công việc tối đa 150 ký tự.";
    }
    if (b.dueMin != null && (!Number.isInteger(b.dueMin) || b.dueMin < 0 || b.dueMin > 1439)) return "Giờ hạn không hợp lệ.";
    if (b.priority !== undefined && !["NORMAL", "HIGH"].includes(b.priority)) return "Mức ưu tiên không hợp lệ.";
    let staffIds: number[] | undefined;
    if (!partial || b.staffIds !== undefined) {
      staffIds = [...new Set((b.staffIds ?? []).filter((x) => Number.isInteger(x)))];
      if (!staffIds.length) return "Chọn ít nhất một nhân viên.";
      const ok = await prisma.staff.count({ where: { id: { in: staffIds }, storeId, status: "Active" } });
      if (ok !== staffIds.length) return "Có nhân viên không thuộc chi nhánh hoặc đã nghỉ.";
    }
    return {
      data: {
        ...(title !== undefined && { title }),
        ...(b.description !== undefined && { description: b.description?.trim().slice(0, 1000) || null }),
        ...(b.area !== undefined && { area: b.area?.trim().slice(0, 100) || null }),
        ...(b.dueMin !== undefined && { dueMin: b.dueMin }),
        ...(b.priority !== undefined && { priority: b.priority }),
        ...(b.requirePhoto !== undefined && { requirePhoto: !!b.requirePhoto }),
      },
      staffIds,
    };
  }

  /* ─────────── Quản lý ─────────── */

  r.get("/tasks", ...manager, async (req, res) => {
    const storeId = mustStoreId(req);
    const date = dateParam(req.query.date);
    const since = new Date(Date.now() - 60 * 86_400_000);
    const [tasks, zones, recent] = await Promise.all([
      prisma.workTask.findMany({ where: { storeId, workDate: dateOnly(date) }, include, orderBy: [{ dueMin: "asc" }, { id: "asc" }] }),
      prisma.zone.findMany({ where: { storeId, isActive: true }, select: { name: true } }),
      prisma.workTask.findMany({ where: { storeId, createdAt: { gte: since }, area: { not: null } }, select: { area: true }, distinct: ["area"], take: 50 }),
    ]);
    const areas = [...new Set([...zones.map((z) => z.name), ...recent.map((x) => x.area!)])].sort((a, b) => a.localeCompare(b, "vi"));
    res.json({ date, tasks: tasks.map(shape), areas });
  });

  r.get("/tasks/assignees", ...manager, async (req, res) => {
    const storeId = mustStoreId(req);
    const date = dateParam(req.query.date);
    const [staff, schedules] = await Promise.all([
      prisma.staff.findMany({
        where: { storeId, status: "Active", role: { notIn: ["Owner"] } },
        select: { id: true, fullName: true, role: true },
        orderBy: { fullName: "asc" },
      }),
      prisma.workSchedule.findMany({
        where: { storeId, workDate: dateOnly(date), status: "APPROVED", staffId: { not: null } },
        select: { staffId: true, shiftCode: true, startMin: true, endMin: true },
        orderBy: { startMin: "asc" },
      }),
    ]);
    res.json(
      staff.map((s) => ({
        ...s,
        shifts: schedules.filter((w) => w.staffId === s.id).map(({ shiftCode, startMin, endMin }) => ({ shiftCode, startMin, endMin })),
      })),
    );
  });

  r.post("/tasks", ...manager, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const storeId = mustStoreId(req);
    const b = req.body as TaskBody;
    const parsed = await parseBody(b, storeId, false);
    if (typeof parsed === "string") return res.status(400).json({ error: parsed });

    const from = b.dateFrom && DATE_RE.test(b.dateFrom) ? b.dateFrom : localToday();
    const to = b.dateTo && DATE_RE.test(b.dateTo) ? b.dateTo : from;
    const days = Math.round((dateOnly(to).getTime() - dateOnly(from).getTime()) / 86_400_000) + 1;
    if (days < 1) return res.status(400).json({ error: "Ngày kết thúc phải sau ngày bắt đầu." });
    if (days > MAX_DAYS) return res.status(400).json({ error: `Giao lặp tối đa ${MAX_DAYS} ngày một lần.` });

    const staffIds = parsed.staffIds!;
    const created = await prisma.$transaction(
      Array.from({ length: days }, (_, i) =>
        prisma.workTask.create({
          data: {
            ...(parsed.data as { title: string }),
            storeId,
            createdById: me.id,
            workDate: new Date(dateOnly(from).getTime() + i * 86_400_000),
            assignees: { create: staffIds.map((staffId) => ({ staffId })) },
          },
          include,
        }),
      ),
    );
    const first = created[0];
    audit(me.id, "TASK_CREATE", first.title, `${staffIds.length} người · ${days > 1 ? `${from} → ${to}` : from}`);
    notifyStaff(staffIds, "task:assigned", { ids: created.map((t) => t.id), title: first.title, date: from });
    inbox(
      staffIds,
      storeId,
      `Việc mới: ${first.title}`,
      [first.area, first.dueMin != null ? `hạn ${String(Math.floor(first.dueMin / 60)).padStart(2, "0")}:${String(first.dueMin % 60).padStart(2, "0")}` : null, days > 1 ? `${days} ngày từ ${from}` : from]
        .filter(Boolean)
        .join(" · "),
    );
    notifyManagers(storeId, { ids: created.map((t) => t.id) });
    res.status(201).json(created.map(shape));
  });

  r.put("/tasks/:id", ...manager, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const storeId = mustStoreId(req);
    const id = Number(req.params.id);
    const task = await prisma.workTask.findUnique({ where: { id }, include: { assignees: true } });
    if (!task || !inStore(req, task)) return res.status(404).json({ error: "Không tìm thấy công việc." });
    const parsed = await parseBody(req.body as TaskBody, storeId, true);
    if (typeof parsed === "string") return res.status(400).json({ error: parsed });

    const before = task.assignees.map((a) => a.staffId);
    const next = parsed.staffIds;
    const added = next ? next.filter((x) => !before.includes(x)) : [];
    const removed = next ? before.filter((x) => !next.includes(x)) : [];
    const row = await prisma.$transaction(async (tx) => {
      if (removed.length) await tx.workTaskAssignee.deleteMany({ where: { taskId: id, staffId: { in: removed } } });
      if (added.length) await tx.workTaskAssignee.createMany({ data: added.map((staffId) => ({ taskId: id, staffId })) });
      return tx.workTask.update({ where: { id }, data: parsed.data, include });
    });
    audit(me.id, "TASK_UPDATE", row.title);
    if (added.length) {
      notifyStaff(added, "task:assigned", { ids: [id], title: row.title, date: ymdUtc(row.workDate) });
      inbox(added, storeId, `Việc mới: ${row.title}`, [row.area, ymdUtc(row.workDate)].filter(Boolean).join(" · "));
    }
    notifyStaff([...before.filter((x) => !removed.includes(x)), ...removed], "task:update", { ids: [id] });
    notifyManagers(storeId, { ids: [id] });
    res.json(shape(row));
  });

  r.delete("/tasks/:id", ...manager, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    const task = await prisma.workTask.findUnique({ where: { id }, include: { assignees: true } });
    if (!task || !inStore(req, task)) return res.status(404).json({ error: "Không tìm thấy công việc." });
    await prisma.workTask.delete({ where: { id } });
    audit(me.id, "TASK_DELETE", task.title);
    notifyStaff(task.assignees.map((a) => a.staffId), "task:update", { ids: [id] });
    notifyManagers(task.storeId, { ids: [id] });
    res.json({ ok: true });
  });

  r.post("/tasks/:id/redo", ...manager, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    const { staffId, note } = req.body as { staffId?: number; note?: string };
    const task = await prisma.workTask.findUnique({ where: { id } });
    if (!task || !inStore(req, task)) return res.status(404).json({ error: "Không tìm thấy công việc." });
    const a = await prisma.workTaskAssignee.findUnique({ where: { taskId_staffId: { taskId: id, staffId: Number(staffId) } } });
    if (!a) return res.status(404).json({ error: "Nhân viên không được giao việc này." });
    await prisma.workTaskAssignee.update({
      where: { id: a.id },
      data: { status: "TODO", doneAt: null, redoNote: note?.trim().slice(0, 500) || "Quản lý yêu cầu làm lại." },
    });
    audit(me.id, "TASK_REDO", task.title, note?.trim());
    notifyStaff([a.staffId], "task:redo", { ids: [id], title: task.title, note: note?.trim() ?? "" });
    inbox([a.staffId], task.storeId, `Cần làm lại: ${task.title}`, note?.trim() || "Quản lý yêu cầu làm lại.");
    notifyManagers(task.storeId, { ids: [id] });
    res.json(shape(await prisma.workTask.findUniqueOrThrow({ where: { id }, include })));
  });

  r.post("/tasks/copy", ...manager, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const storeId = mustStoreId(req);
    const { from, to } = req.body as { from?: string; to?: string };
    if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to) || from === to) return res.status(400).json({ error: "Chọn ngày nguồn và ngày đích khác nhau." });
    const [src, active] = await Promise.all([
      prisma.workTask.findMany({ where: { storeId, workDate: dateOnly(from) }, include: { assignees: true } }),
      prisma.staff.findMany({ where: { storeId, status: "Active" }, select: { id: true } }),
    ]);
    const alive = new Set(active.map((s) => s.id));
    const copies = src
      .map((t) => ({ t, staffIds: t.assignees.map((a) => a.staffId).filter((x) => alive.has(x)) }))
      .filter((x) => x.staffIds.length > 0);
    if (!copies.length) return res.status(400).json({ error: "Ngày nguồn không có việc nào để chép." });
    const created = await prisma.$transaction(
      copies.map(({ t, staffIds }) =>
        prisma.workTask.create({
          data: {
            storeId,
            workDate: dateOnly(to),
            title: t.title,
            description: t.description,
            area: t.area,
            dueMin: t.dueMin,
            priority: t.priority,
            requirePhoto: t.requirePhoto,
            createdById: me.id,
            assignees: { create: staffIds.map((staffId) => ({ staffId })) },
          },
          select: { id: true, assignees: { select: { staffId: true } } },
        }),
      ),
    );
    audit(me.id, "TASK_COPY", `${from} → ${to}`, `${created.length} việc`);
    notifyStaff(created.flatMap((t) => t.assignees.map((a) => a.staffId)), "task:assigned", { ids: created.map((t) => t.id), date: to });
    notifyManagers(storeId, { ids: created.map((t) => t.id) });
    res.status(201).json({ count: created.length });
  });

  /* ─────────── Nhân viên ─────────── */

  r.get("/tasks/my", ...staffStore, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const date = dateParam(req.query.date);
    const rows = await prisma.workTask.findMany({
      where: { storeId: mustStoreId(req), workDate: dateOnly(date), assignees: { some: { staffId: me.id } } },
      include,
      orderBy: [{ dueMin: "asc" }, { id: "asc" }],
    });
    res.json({ date, tasks: rows.map(shape) });
  });

  /** Dòng giao việc của chính tôi */
  async function myAssignment(req: StaffRequest, id: number) {
    const a = await prisma.workTaskAssignee.findUnique({ where: { taskId_staffId: { taskId: id, staffId: req.staffRow!.id } }, include: { task: true } });
    return a && inStore(req, a.task) ? a : null;
  }

  r.post("/tasks/:id/done", ...staffStore, async (req, res) => {
    const id = Number(req.params.id);
    const a = await myAssignment(req as StaffRequest, id);
    if (!a) return res.status(404).json({ error: "Việc này không được giao cho bạn." });
    const { note, photoDataUrl } = req.body as { note?: string; photoDataUrl?: string };
    let photoUrl = a.photoUrl;
    if (photoDataUrl) {
      if (!photoDataUrl.startsWith("data:image/")) return res.status(400).json({ error: "Ảnh không hợp lệ." });
      try {
        photoUrl = await saveDataUrlImage(photoDataUrl);
      } catch (e) {
        return res.status(400).json({ error: e instanceof Error ? e.message : "Không lưu được ảnh." });
      }
    }
    if (a.task.requirePhoto && !photoUrl) return res.status(400).json({ error: "Việc này cần chụp ảnh xác nhận." });
    await prisma.workTaskAssignee.update({
      where: { id: a.id },
      data: { status: "DONE", doneAt: new Date(), note: note?.trim().slice(0, 500) || null, photoUrl },
    });
    notifyManagers(a.task.storeId, { ids: [id] });
    res.json(shape(await prisma.workTask.findUniqueOrThrow({ where: { id }, include })));
  });

  r.post("/tasks/:id/undo", ...staffStore, async (req, res) => {
    const id = Number(req.params.id);
    const a = await myAssignment(req as StaffRequest, id);
    if (!a) return res.status(404).json({ error: "Việc này không được giao cho bạn." });
    await prisma.workTaskAssignee.update({ where: { id: a.id }, data: { status: "TODO", doneAt: null } });
    notifyManagers(a.task.storeId, { ids: [id] });
    res.json(shape(await prisma.workTask.findUniqueOrThrow({ where: { id }, include })));
  });

  return r;
}
