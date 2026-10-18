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
     POST /schedule/admin — Quản lý gán ca mới
  ══════════════════════════════════════════════════════════════ */
  r.post("/schedule/admin", ...mgmtOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const { staffId, date, shiftCode, managerNote } = req.body as {
      staffId: number;
      date: string;
      shiftCode: string;
      managerNote?: string;
    };

    if (!staffId || !date || !shiftCode) {
      return res.status(400).json({ error: "Thiếu staffId, date hoặc shiftCode." });
    }

    if (!VALID_CODES.includes(shiftCode as ShiftCode)) {
      return res.status(400).json({ error: "Mã ca không hợp lệ." });
    }

    const workDate = new Date(date);
    const def = SHIFT_DEFS[shiftCode as ShiftCode];

    try {
      const created = await prisma.workSchedule.create({
        data: {
          staffId,
          workDate,
          shiftCode,
          startMin: def.startMin,
          endMin: def.endMin,
          status: "APPROVED",
          managerNote: managerNote || null,
          reviewedBy: me.id,
        },
        include: { staff: { select: { id: true, fullName: true, role: true } } },
      });

      io.to(`staff_${staffId}`).emit("schedule:new", { staffId, date });
      io.to("admin_room").emit("schedule:new", { staffId, date });
      res.json({ ok: true, schedule: created });
    } catch (e: any) {
      if (e.code === "P2002") {
        return res.status(400).json({ error: "Nhân viên đã được gán ca này trong ngày." });
      }
      res.status(500).json({ error: "Lỗi máy chủ." });
    }
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
  r.delete("/schedule/:id", ...mgmtOnly, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ." });

    const existing = await prisma.workSchedule.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Không tìm thấy ca." });

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

  /* ══════════════════════════════════════════════════════════════
     POST /schedule/admin/auto — Tự động xếp lịch
  ══════════════════════════════════════════════════════════════ */
  r.post("/schedule/admin/auto", ...mgmtOnly, async (req, res) => {
    const { week } = req.body as { week?: string };
    const mon = weekMonday(week ? new Date(week) : new Date());
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999);

    try {
      // Bypass Prisma client validation for DRAFT because client is not regenerated yet
      await prisma.$executeRawUnsafe(`DELETE FROM Work_Schedules WHERE Work_Date >= ? AND Work_Date <= ? AND Status = 'DRAFT'`, mon, sun);

      const staffs = await prisma.staff.findMany({ where: { role: { not: "Admin" } } });
      const leaves = await prisma.leaveRequest.findMany({
        where: { date: { gte: mon, lte: sun }, status: "APPROVED" }
      });

      const shiftsToCreate = [];
      const shiftDefs = [
        { code: "A", start: 7*60, end: 12*60, reqs: 2 },
        { code: "B", start: 12*60, end: 17*60, reqs: 2 },
        { code: "C", start: 17*60, end: 22*60, reqs: 2 },
      ];

      for (let i = 0; i < 7; i++) {
        const currentDate = new Date(mon);
        currentDate.setDate(mon.getDate() + i);
        const dateString = currentDate.toISOString().split("T")[0];

        const leavesToday = leaves.filter(l => l.date.toISOString().split("T")[0] === dateString);
        const leaveStaffIds = leavesToday.map(l => l.userId);
        
        // Shuffle for random fair assignment
        let availableStaffs = staffs.filter(s => !leaveStaffIds.includes(s.id)).sort(() => Math.random() - 0.5);

        for (const def of shiftDefs) {
          for (let j = 0; j < def.reqs; j++) {
            const assignedStaff = availableStaffs.pop();
            shiftsToCreate.push({
              workDate: dateString,
              shiftCode: def.code,
              startMin: def.start,
              endMin: def.end,
              status: "DRAFT",
              staffId: assignedStaff ? assignedStaff.id : null,
            });
          }
        }
      }

      if (shiftsToCreate.length > 0) {
        const values = shiftsToCreate.map(s => `(${s.staffId || 'NULL'}, '${s.workDate}', '${s.shiftCode}', ${s.startMin}, ${s.endMin}, 'DRAFT', NOW(), NOW())`).join(", ");
        await prisma.$executeRawUnsafe(`INSERT INTO Work_Schedules (Staff_ID, Work_Date, Shift_Code, Start_Min, End_Min, Status, Created_At, Updated_At) VALUES ${values}`);
      }

      io.to("admin_room").emit("schedule:updated", { weekStart: mon });
      res.json({ ok: true, generatedCount: shiftsToCreate.length });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Lỗi xếp lịch tự động." });
    }
  });

  return r;
}
/* TEST */