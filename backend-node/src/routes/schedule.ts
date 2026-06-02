/**
 * routes/schedule.ts — Lịch làm việc (WorkSchedule) v2
 * Ca cố định: A | B | C | SP1 | SP2
 *
 * POST   /schedule/bulk           — NV gửi đăng ký cả tuần (upsert)
 * GET    /schedule/my             — NV xem lịch cá nhân theo tuần
 * GET    /schedule/admin/all      — Admin/Cashier xem toàn bộ lịch
 * PUT    /schedule/:id            — Admin duyệt / sửa / từ chối
 * DELETE /schedule/:id            — Xoá ca
 * POST   /schedule/admin/publish  — Chốt PENDING → APPROVED trong tuần
 */
import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { attachStaff, requireRoles, type StaffRequest } from "../middleware/staff.js";

/* ── Ca cố định ─────────────────────────────────────────────────── */
export const SHIFT_DEFS = {
  A:   { code: "A",   name: "Ca A",   label: "07:00 – 12:00", startMin: 420,  endMin: 720,  hours: 5 },
  B:   { code: "B",   name: "Ca B",   label: "12:30 – 17:30", startMin: 750,  endMin: 1050, hours: 5 },
  C:   { code: "C",   name: "Ca C",   label: "18:00 – 00:00", startMin: 1080, endMin: 1440, hours: 6 },
  SP1: { code: "SP1", name: "Ca SP1", label: "08:30 – 11:30", startMin: 510,  endMin: 690,  hours: 3 },
  SP2: { code: "SP2", name: "Ca SP2", label: "19:00 – 22:00", startMin: 1140, endMin: 1320, hours: 3 },
} as const;

type ShiftCode = keyof typeof SHIFT_DEFS;
const VALID_CODES = Object.keys(SHIFT_DEFS) as ShiftCode[];

/** Thứ 2 của tuần chứa ngày d */
function weekMonday(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

/** Thứ 7 kết thúc tuần (23:59:59) */
function weekSaturday23(d: Date): Date {
  const mon = weekMonday(d);
  const sat = new Date(mon);
  sat.setDate(mon.getDate() + 5);
  sat.setHours(23, 59, 59, 999);
  return sat;
}

function pad2(n: number) { return String(n).padStart(2, "0"); }
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Chỉ cho phép đăng ký tuần tới (hoặc tuần này nếu chưa qua T7 23:59) */
function isWeekEditable(weekStr: string): boolean {
  const now = new Date();
  const thisWeekMon = weekMonday(now);
  const nextWeekMon = new Date(thisWeekMon);
  nextWeekMon.setDate(thisWeekMon.getDate() + 7);

  const requestedMon = weekMonday(new Date(weekStr));

  // Cho phép tuần này + tuần tới
  const thisWeekSat = weekSaturday23(now);
  if (requestedMon.getTime() === thisWeekMon.getTime()) {
    return now <= thisWeekSat; // Tuần này: chỉ trước T7 23:59
  }
  if (requestedMon.getTime() === nextWeekMon.getTime()) {
    return true; // Tuần tới: luôn được
  }
  return false;
}

export function scheduleRouter(prisma: PrismaClient, io: Server) {
  const r = Router();
  const anyStaff = [attachStaff(prisma)];
  const mgmtOnly = [attachStaff(prisma), requireRoles("Admin")];

  /* ══════════════════════════════════════════════════════════════
     POST /schedule/bulk — NV gửi đăng ký cả tuần (upsert)
     Body: { week: "YYYY-MM-DD", registrations: [{date, shiftCode, note?}] }
  ══════════════════════════════════════════════════════════════ */
  r.post("/schedule/bulk", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const { week, registrations } = req.body as {
      week?: string;
      registrations?: { date: string; shiftCode: string; note?: string }[];
    };

    if (!week) return res.status(400).json({ error: "Thiếu tham số week." });
    if (!isWeekEditable(week)) {
      return res.status(400).json({
        error: "Chỉ có thể đăng ký tuần này (trước Thứ 7 23:59) hoặc tuần tới.",
      });
    }

    const mon = weekMonday(new Date(week));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999);

    // Validate shift codes
    const regs = (registrations ?? []).filter((r2) => VALID_CODES.includes(r2.shiftCode as ShiftCode));

    // Validate rules: không được vừa chọn A vừa SP1, không vừa C vừa SP2 trong cùng ngày.
    const regsByDate = new Map<string, Set<string>>();
    for (const r2 of regs) {
      if (!regsByDate.has(r2.date)) regsByDate.set(r2.date, new Set());
      regsByDate.get(r2.date)!.add(r2.shiftCode);
    }
    for (const [date, codes] of regsByDate.entries()) {
      if (codes.has("A") && codes.has("SP1")) {
        return res.status(400).json({ error: `Ngày ${date} không thể chọn cùng lúc Ca A (07:00-12:00) và Ca SP1 (08:30-11:30).` });
      }
      if (codes.has("C") && codes.has("SP2")) {
        return res.status(400).json({ error: `Ngày ${date} không thể chọn cùng lúc Ca C (18:00-00:00) và Ca SP2 (19:00-22:00).` });
      }
    }

    // Xoá toàn bộ PENDING trong tuần đó của nhân viên này
    await prisma.workSchedule.deleteMany({
      where: {
        staffId: me.id,
        workDate: { gte: mon, lte: sun },
        status: "PENDING",
      },
    });

    // Tạo mới (bỏ qua nếu đã có APPROVED cùng ngày + ca)
    if (regs.length > 0) {
      const existing = await prisma.workSchedule.findMany({
        where: {
          staffId: me.id,
          workDate: { gte: mon, lte: sun },
          status: "APPROVED",
        },
        select: { workDate: true, shiftCode: true },
      });
      const approvedKeys = new Set(existing.map((e) => `${toDateStr(e.workDate)}_${e.shiftCode}`));

      const toCreate = regs.filter((r2) => {
        const key = `${r2.date}_${r2.shiftCode}`;
        return !approvedKeys.has(key);
      });

      if (toCreate.length > 0) {
        const def = (code: string) => SHIFT_DEFS[code as ShiftCode];
        await prisma.workSchedule.createMany({
          data: toCreate.map((r2) => ({
            staffId: me.id,
            workDate: new Date(r2.date),
            shiftCode: r2.shiftCode,
            startMin: def(r2.shiftCode).startMin,
            endMin: def(r2.shiftCode).endMin,
            staffNote: r2.note ?? null,
            status: "PENDING",
          })),
          skipDuplicates: true,
        });
      }
    }

    io.to("admin_room").emit("schedule:new", { staffId: me.id, week });

    const updated = await prisma.workSchedule.findMany({
      where: { staffId: me.id, workDate: { gte: mon, lte: sun } },
      orderBy: [{ workDate: "asc" }, { shiftCode: "asc" }],
    });
    res.json({ ok: true, count: regs.length, schedules: updated });
  });

  /* ══════════════════════════════════════════════════════════════
     GET /schedule/my — Lịch cá nhân theo tuần
  ══════════════════════════════════════════════════════════════ */
  r.get("/schedule/my", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const week = req.query.week as string | undefined;
    const mon = weekMonday(week ? new Date(week) : new Date());
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999);

    const schedules = await prisma.workSchedule.findMany({
      where: { staffId: me.id, workDate: { gte: mon, lte: sun } },
      orderBy: [{ workDate: "asc" }, { shiftCode: "asc" }],
    });
    res.json({
      weekStart: mon, weekEnd: sun,
      schedules,
      shiftDefs: Object.values(SHIFT_DEFS),
    });
  });

  /* ══════════════════════════════════════════════════════════════
     GET /schedule/admin/all — Master schedule
  ══════════════════════════════════════════════════════════════ */
  r.get("/schedule/admin/all", ...anyStaff, async (req, res) => {
    const week = req.query.week as string | undefined;
    const mon = weekMonday(week ? new Date(week) : new Date());
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999);

    const [schedules, staffList] = await Promise.all([
      prisma.workSchedule.findMany({
        where: { workDate: { gte: mon, lte: sun } },
        include: { staff: { select: { id: true, fullName: true, role: true } } },
        orderBy: [{ workDate: "asc" }, { shiftCode: "asc" }],
      }),
      prisma.staff.findMany({
        where: { status: "Active" },
        select: { id: true, fullName: true, role: true, phone: true },
        orderBy: { fullName: "asc" },
      }),
    ]);

    res.json({
      weekStart: mon, weekEnd: sun,
      schedules, staffList,
      shiftDefs: Object.values(SHIFT_DEFS),
    });
  });

  /* ══════════════════════════════════════════════════════════════
     PUT /schedule/:id — Admin duyệt / sửa / từ chối
  ══════════════════════════════════════════════════════════════ */
  r.put("/schedule/:id", ...mgmtOnly, async (req, res) => {
    const id = Number(req.params.id);
    const me = (req as StaffRequest).staffRow!;
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ." });

    const existing = await prisma.workSchedule.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Không tìm thấy ca." });

    const { status, shiftCode, managerNote, staffId: newStaffId } = req.body as {
      status?: "APPROVED" | "REJECTED" | "PENDING";
      shiftCode?: string;
      managerNote?: string;
      staffId?: number;
    };

    const newCode = (shiftCode && VALID_CODES.includes(shiftCode as ShiftCode))
      ? shiftCode : existing.shiftCode;
    const def = SHIFT_DEFS[newCode as ShiftCode];

    const updated = await prisma.workSchedule.update({
      where: { id },
      data: {
        status: status ?? existing.status,
        shiftCode: newCode,
        startMin: def.startMin,
        endMin: def.endMin,
        staffId: newStaffId ?? existing.staffId,
        managerNote: managerNote !== undefined ? managerNote : existing.managerNote,
        reviewedBy: me.id,
      },
      include: { staff: { select: { id: true, fullName: true } } },
    });

    io.to(`staff_${updated.staffId}`).emit("schedule:updated", updated);
    io.to("admin_room").emit("schedule:updated", updated);
    res.json(updated);
  });

  /* ══════════════════════════════════════════════════════════════
     DELETE /schedule/:id
  ══════════════════════════════════════════════════════════════ */
  r.delete("/schedule/:id", ...anyStaff, async (req, res) => {
    const id = Number(req.params.id);
    const me = (req as StaffRequest).staffRow!;
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ." });

    const existing = await prisma.workSchedule.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Không tìm thấy ca." });

    if (me.role !== "Admin") {
      if (existing.staffId !== me.id)    return res.status(403).json({ error: "Không có quyền." });
      if (existing.status !== "PENDING") return res.status(400).json({ error: "Chỉ huỷ được ca đang chờ duyệt." });
    }

    await prisma.workSchedule.delete({ where: { id } });
    io.to("admin_room").emit("schedule:deleted", { id });
    io.to(`staff_${existing.staffId}`).emit("schedule:deleted", { id });
    res.json({ ok: true });
  });

  /* ══════════════════════════════════════════════════════════════
     POST /schedule/admin/publish — Chốt PENDING → APPROVED
  ══════════════════════════════════════════════════════════════ */
  r.post("/schedule/admin/publish", ...mgmtOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const { week } = req.body as { week?: string };
    const mon = weekMonday(week ? new Date(week) : new Date());
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999);

    const result = await prisma.workSchedule.updateMany({
      where: { workDate: { gte: mon, lte: sun }, status: "PENDING" },
      data: { status: "APPROVED", reviewedBy: me.id },
    });

    const affected = await prisma.workSchedule.findMany({
      where: { workDate: { gte: mon, lte: sun }, status: "APPROVED" },
      select: { staffId: true }, distinct: ["staffId"],
    });
    affected.forEach(({ staffId }) => {
      io.to(`staff_${staffId}`).emit("schedule:published", { weekStart: mon, weekEnd: sun });
    });
    io.to("admin_room").emit("schedule:published", { weekStart: mon, weekEnd: sun, count: result.count });
    res.json({ ok: true, count: result.count });
  });

  return r;
}
