/**
 * routes/schedule.ts — Lịch làm việc (WorkSchedule) v3 — xếp theo tháng
 * Mẫu ca & định biên lấy từ DB (Chủ chuỗi cấu hình ở /hr/config), không cố định trong code.
 *
 * GET    /schedule/my                 — NV xem lịch cá nhân (?week=YYYY-MM-DD hoặc ?month=YYYY-MM)
 * GET    /schedule/admin/all          — Bảng lịch tổng của chi nhánh (?week= hoặc ?month=)
 * POST   /schedule/admin              — Quản lý gán ca
 * PUT    /schedule/:id                — Quản lý sửa / duyệt / gán người cho ca trống
 * DELETE /schedule/:id                — Xoá ca
 * POST   /schedule/admin/auto         — Tự xếp lịch tháng (tạo bản Nháp)
 * POST   /schedule/admin/publish      — Công bố: Nháp/Chờ → Đã duyệt, Nháp chưa có người → Ca trống
 */
import { Router } from "express";
import type { Request } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { attachStaff, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { inStore, mustStoreId, storeWhere, toStore } from "../lib/storeScope.js";
import { getHrConfig, getShiftTemplates, shiftDefsOf, SHIFT_ROLES } from "../lib/hrConfig.js";
import { autoSchedule } from "../lib/autoSchedule.js";

function pad2(n: number) { return String(n).padStart(2, "0"); }
const ymd = (d: Date) => d.toISOString().slice(0, 10);
/** "YYYY-MM-DD" → Date 00:00 UTC (đúng cách Prisma lưu cột @db.Date) */
const dateOnly = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);

/** Thứ 2 của tuần chứa ngày d */
function weekMonday(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const mon = new Date(d);
  mon.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  mon.setHours(0, 0, 0, 0);
  return mon;
}

/** Các ngày (YYYY-MM-DD) của tháng "YYYY-MM"; null nếu sai định dạng */
function monthDays(month: string): string[] | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const n = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${m[1]}-${m[2]}-${pad2(i + 1)}`);
}

/** Khoảng ngày theo ?month= (ưu tiên) hoặc ?week= */
function rangeOf(q: { month?: unknown; week?: unknown }) {
  if (typeof q.month === "string") {
    const days = monthDays(q.month);
    if (days) return { from: dateOnly(days[0]), to: dateOnly(days[days.length - 1]), days };
  }
  const mon = weekMonday(typeof q.week === "string" ? new Date(q.week) : new Date());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  });
  return { from: dateOnly(days[0]), to: dateOnly(days[6]), days };
}

export function scheduleRouter(prisma: PrismaClient, io: Server) {
  const r = Router();
  const anyStaff = [attachStaff(prisma)];
  const mgmtOnly = [attachStaff(prisma), requireRoles("Admin"), requireStore];

  const templateOf = async (code: string) => prisma.shiftTemplate.findUnique({ where: { code } });

  /** Người đó đã có ca trùng giờ trong ngày chưa (trừ ca `exceptId`) */
  async function overlapping(staffId: number, workDate: Date, startMin: number, endMin: number, exceptId?: number) {
    const sameDay = await prisma.workSchedule.findMany({
      where: { staffId, workDate, status: { not: "REJECTED" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
    return sameDay.find((w) => w.startMin < endMin && startMin < w.endMin) ?? null;
  }

  const notify = (storeId: number, staffIds: (number | null)[], event: string, payload: unknown) => {
    for (const id of new Set(staffIds)) if (id != null) io.to(`staff_${id}`).emit(event, payload);
    toStore(io, "admin_room", storeId).emit(event, payload);
  };

  /* ── POST /schedule/admin — Quản lý gán ca ── */
  r.post("/schedule/admin", ...mgmtOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const { staffId, date, shiftCode, managerNote } = req.body as {
      staffId: number; date: string; shiftCode: string; managerNote?: string;
    };
    if (!staffId || !date || !shiftCode) return res.status(400).json({ error: "Thiếu staffId, date hoặc shiftCode." });

    const tpl = await templateOf(shiftCode);
    if (!tpl) return res.status(400).json({ error: "Mã ca không hợp lệ." });

    const storeId = mustStoreId(req);
    const target = await prisma.staff.findUnique({ where: { id: staffId }, select: { storeId: true, role: true } });
    if (!target || target.storeId !== storeId) return res.status(400).json({ error: "Nhân viên không thuộc chi nhánh này." });

    const workDate = dateOnly(date);
    if (await overlapping(staffId, workDate, tpl.startMin, tpl.endMin)) {
      return res.status(400).json({ error: "Nhân viên đã có ca trùng giờ trong ngày này." });
    }

    try {
      const created = await prisma.workSchedule.create({
        data: {
          storeId, staffId, workDate, shiftCode: tpl.code, role: target.role,
          startMin: tpl.startMin, endMin: tpl.endMin,
          status: "APPROVED", managerNote: managerNote || null, reviewedBy: me.id,
        },
        include: { staff: { select: { id: true, fullName: true, role: true } } },
      });
      notify(storeId, [staffId], "schedule:new", { staffId, date });
      res.json({ ok: true, schedule: created });
    } catch (e: any) {
      if (e.code === "P2002") return res.status(400).json({ error: "Nhân viên đã được gán ca này trong ngày." });
      res.status(500).json({ error: "Lỗi máy chủ." });
    }
  });

  /* ── GET /schedule/my — Lịch cá nhân ── */
  r.get("/schedule/my", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const { from, to } = rangeOf(req.query);
    const [schedules, templates] = await Promise.all([
      prisma.workSchedule.findMany({
        where: { staffId: me.id, workDate: { gte: from, lte: to } },
        orderBy: [{ workDate: "asc" }, { startMin: "asc" }],
      }),
      getShiftTemplates(prisma),
    ]);
    res.json({ weekStart: from, weekEnd: to, schedules, shiftDefs: shiftDefsOf(templates) });
  });

  /* ── GET /schedule/admin/all — Bảng lịch tổng chi nhánh ── */
  r.get("/schedule/admin/all", ...anyStaff, async (req, res) => {
    const { from, to, days } = rangeOf(req.query);
    const [schedules, staffList, templates] = await Promise.all([
      prisma.workSchedule.findMany({
        where: { ...storeWhere(req), workDate: { gte: from, lte: to } },
        include: { staff: { select: { id: true, fullName: true, role: true } } },
        orderBy: [{ workDate: "asc" }, { startMin: "asc" }],
      }),
      prisma.staff.findMany({
        where: { ...storeWhere(req), status: "Active", role: { notIn: ["Owner", "Admin"] } },
        select: { id: true, fullName: true, role: true, phone: true },
        orderBy: [{ role: "asc" }, { fullName: "asc" }],
      }),
      getShiftTemplates(prisma),
    ]);
    res.json({
      weekStart: from, weekEnd: to, days,
      schedules, staffList,
      shiftDefs: shiftDefsOf(templates),
      staffing: templates.map((t) => ({ code: t.code, rules: t.staffing.map(({ role, weekdayCount, weekendCount }) => ({ role, weekdayCount, weekendCount })) })),
      roles: SHIFT_ROLES,
    });
  });

  /* ── PUT /schedule/:id — sửa / duyệt / gán người cho ca trống ── */
  r.put("/schedule/:id", ...mgmtOnly, async (req, res) => {
    const id = Number(req.params.id);
    const me = (req as StaffRequest).staffRow!;
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ." });

    const existing = await prisma.workSchedule.findUnique({ where: { id } });
    if (!existing || !inStore(req, existing)) return res.status(404).json({ error: "Không tìm thấy ca." });

    const { status, shiftCode, managerNote, staffId: newStaffId } = req.body as {
      status?: "APPROVED" | "REJECTED" | "PENDING" | "DRAFT";
      shiftCode?: string; managerNote?: string; staffId?: number | null;
    };

    const tpl = shiftCode && shiftCode !== existing.shiftCode ? await templateOf(shiftCode) : null;
    if (shiftCode && shiftCode !== existing.shiftCode && !tpl) return res.status(400).json({ error: "Mã ca không hợp lệ." });
    const startMin = tpl?.startMin ?? existing.startMin;
    const endMin = tpl?.endMin ?? existing.endMin;
    const staffId = newStaffId !== undefined ? newStaffId : existing.staffId;

    let role = existing.role;
    if (staffId != null) {
      const target = await prisma.staff.findUnique({ where: { id: staffId }, select: { storeId: true, role: true } });
      if (!target || target.storeId !== existing.storeId) return res.status(400).json({ error: "Nhân viên không thuộc chi nhánh này." });
      if (await overlapping(staffId, existing.workDate, startMin, endMin, id)) {
        return res.status(400).json({ error: "Nhân viên đã có ca trùng giờ trong ngày này." });
      }
      role = existing.role ?? target.role;
    }

    // Gán người cho ca trống → ca có hiệu lực luôn; bỏ người khỏi ca → thành ca trống
    let nextStatus = status ?? existing.status;
    if (staffId == null && nextStatus !== "DRAFT") nextStatus = "OPEN_SHIFT";
    else if (staffId != null && existing.status === "OPEN_SHIFT" && !status) nextStatus = "APPROVED";

    try {
      const updated = await prisma.workSchedule.update({
        where: { id },
        data: {
          status: nextStatus,
          shiftCode: tpl?.code ?? existing.shiftCode,
          startMin, endMin, staffId, role,
          managerNote: managerNote !== undefined ? managerNote : existing.managerNote,
          reviewedBy: me.id,
        },
        include: { staff: { select: { id: true, fullName: true } } },
      });
      notify(updated.storeId, [existing.staffId, updated.staffId], "schedule:updated", updated);
      res.json(updated);
    } catch (e: any) {
      if (e.code === "P2002") return res.status(400).json({ error: "Nhân viên đã được gán ca này trong ngày." });
      res.status(500).json({ error: "Lỗi máy chủ." });
    }
  });

  /* ── DELETE /schedule/:id ── */
  r.delete("/schedule/:id", ...mgmtOnly, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ." });

    const existing = await prisma.workSchedule.findUnique({ where: { id } });
    if (!existing || !inStore(req, existing)) return res.status(404).json({ error: "Không tìm thấy ca." });
    if (existing.actualCheckIn) return res.status(400).json({ error: "Ca đã chấm công, không xoá được." });

    await prisma.workSchedule.delete({ where: { id } });
    notify(existing.storeId, [existing.staffId], "schedule:deleted", { id });
    res.json({ ok: true });
  });

  /* ── POST /schedule/admin/publish — Công bố lịch (tháng hoặc tuần) ── */
  r.post("/schedule/admin/publish", ...mgmtOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const { from, to } = rangeOf(req.body ?? {});
    const storeId = mustStoreId(req);
    const where = { storeId, workDate: { gte: from, lte: to } };

    const [approved, open] = await prisma.$transaction([
      prisma.workSchedule.updateMany({
        where: { ...where, status: { in: ["DRAFT", "PENDING"] }, staffId: { not: null } },
        data: { status: "APPROVED", reviewedBy: me.id },
      }),
      prisma.workSchedule.updateMany({
        where: { ...where, status: "DRAFT", staffId: null },
        data: { status: "OPEN_SHIFT", reviewedBy: me.id },
      }),
    ]);

    const affected = await prisma.workSchedule.findMany({
      where: { ...where, status: "APPROVED" }, select: { staffId: true }, distinct: ["staffId"],
    });
    notify(storeId, affected.map((a) => a.staffId), "schedule:published", { weekStart: from, weekEnd: to });
    res.json({ ok: true, count: approved.count, openCount: open.count });
  });

  /* ── POST /schedule/admin/auto — Tự xếp lịch tháng ── */
  r.post("/schedule/admin/auto", ...mgmtOnly, async (req: Request, res) => {
    const { month } = req.body as { month?: string };
    const days = month ? monthDays(month) : null;
    if (!days) return res.status(400).json({ error: "Thiếu tháng (YYYY-MM)." });

    const storeId = mustStoreId(req);
    const from = dateOnly(days[0]);
    const to = dateOnly(days[days.length - 1]);
    // Lấy thêm 6 ngày trước/sau để xét giờ nghỉ & số ca/tuần ở 2 đầu tháng
    const padFrom = new Date(from.getTime() - 6 * 86_400_000);
    const padTo = new Date(to.getTime() + 6 * 86_400_000);
    const todayStr = ymd(new Date());

    try {
      const [templates, config, staff] = await Promise.all([
        getShiftTemplates(prisma, true),
        getHrConfig(prisma),
        prisma.staff.findMany({
          where: { storeId, status: "Active", role: { in: [...SHIFT_ROLES] } },
          select: { id: true, role: true },
        }),
      ]);
      if (templates.length === 0) return res.status(400).json({ error: "Chưa có ca làm nào đang dùng. Chủ chuỗi cần cấu hình ca trước." });

      // Xoá bản nháp cũ của tháng, giữ ca đã duyệt / đã chấm công
      await prisma.workSchedule.deleteMany({ where: { storeId, workDate: { gte: from, lte: to }, status: "DRAFT", actualCheckIn: null } });

      const staffIds = staff.map((s) => s.id);
      const [existingRows, leaves] = await Promise.all([
        prisma.workSchedule.findMany({
          where: { storeId, workDate: { gte: padFrom, lte: padTo }, status: { in: ["APPROVED", "PENDING", "OPEN_SHIFT", "DRAFT"] } },
        }),
        prisma.leaveRequest.findMany({
          where: { userId: { in: staffIds }, status: "APPROVED", date: { lte: to }, OR: [{ toDate: null }, { toDate: { gte: from } }] },
        }),
      ]);

      const leaveMap = new Map<number, Set<string>>();
      for (const l of leaves) {
        const set = leaveMap.get(l.userId) ?? leaveMap.set(l.userId, new Set()).get(l.userId)!;
        for (let t = l.date.getTime(); t <= (l.toDate ?? l.date).getTime(); t += 86_400_000) set.add(ymd(new Date(t)));
      }

      // Không xếp lại những ngày đã qua
      const futureDays = days.filter((d) => d >= todayStr);
      const roleOf = new Map(staff.map((s) => [s.id, s.role]));
      const { slots, shortages } = autoSchedule({
        days: futureDays,
        templates: templates.map((t) => ({ code: t.code, startMin: t.startMin, endMin: t.endMin, staffing: t.staffing })),
        staff,
        existing: existingRows.map((w) => ({
          staffId: w.staffId, date: ymd(w.workDate), code: w.shiftCode,
          role: w.role ?? (w.staffId ? roleOf.get(w.staffId) ?? null : null),
          startMin: w.startMin, endMin: w.endMin,
        })),
        leaves: leaveMap,
        rules: { minRestHours: config.minRestHours, maxShiftsPerWeek: config.maxShiftsPerWeek },
      });

      if (slots.length > 0) {
        await prisma.workSchedule.createMany({
          data: slots.map((s) => ({
            storeId, staffId: s.staffId, workDate: dateOnly(s.date), shiftCode: s.code, role: s.role,
            startMin: s.startMin, endMin: s.endMin, status: "DRAFT" as const,
          })),
        });
      }

      toStore(io, "admin_room", storeId).emit("schedule:updated", { month });
      res.json({
        ok: true,
        generatedCount: slots.filter((s) => s.staffId != null).length,
        openCount: slots.filter((s) => s.staffId == null).length,
        shortages,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Lỗi xếp lịch tự động." });
    }
  });

  return r;
}
