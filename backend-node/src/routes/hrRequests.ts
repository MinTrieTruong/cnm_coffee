import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import type { Request } from "express";
import { attachStaff, isAdminLike, requireRoles, type StaffRequest } from "../middleware/staff.js";
import { inStore, storeWhere } from "../lib/storeScope.js";

export function hrRequestsRouter(prisma: PrismaClient, io: Server) {
  const r = Router();
  const anyStaff = [attachStaff(prisma)];
  const mgmtOnly = [attachStaff(prisma), requireRoles("Admin")];

  /** Đơn từ không có cột chi nhánh — xét theo chi nhánh của nhân viên làm đơn */
  const sameStore = async (req: Request, staffId: number) =>
    inStore(req, await prisma.staff.findUnique({ where: { id: staffId }, select: { storeId: true } }));

  // ══════════════════════════════════════════════════════════════
  // Leave Requests (Xin nghỉ)
  // ══════════════════════════════════════════════════════════════
  
  r.post("/hr/leave", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const { date, leaveType, reason } = req.body;
    try {
      const request = await prisma.leaveRequest.create({
        data: {
          userId: me.id,
          date: new Date(date),
          leaveType,
          reason,
        }
      });
      res.json({ ok: true, request });
    } catch (e) {
      res.status(500).json({ error: "Lỗi tạo đơn xin nghỉ." });
    }
  });

  r.get("/hr/leave", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const where = isAdminLike(me.role) ? { user: storeWhere(req) } : { userId: me.id };
    const requests = await prisma.leaveRequest.findMany({
      where,
      include: { user: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" }
    });
    res.json(requests);
  });

  r.put("/hr/leave/:id/review", ...mgmtOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    const { status } = req.body; // APPROVED or REJECTED

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({ error: "Trạng thái không hợp lệ." });
    }

    const cur = await prisma.leaveRequest.findUnique({ where: { id } });
    if (!cur || !(await sameStore(req, cur.userId))) {
      return res.status(404).json({ error: "Không tìm thấy đơn." });
    }

    try {
      const request = await prisma.leaveRequest.update({
        where: { id },
        data: { status, managerId: me.id }
      });

      // TRIGGER: If APPROVED, mark work schedule as OPEN_SHIFT
      if (status === "APPROVED") {
        await prisma.workSchedule.updateMany({
          where: {
            staffId: request.userId,
            workDate: request.date,
          },
          data: {
            status: "OPEN_SHIFT" as any,
            staffId: null,
            managerNote: "Ca trống do nhân viên xin nghỉ",
          }
        });
      }

      res.json({ ok: true, request });
    } catch (e) {
      res.status(500).json({ error: "Lỗi duyệt đơn." });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // Shift Swap Requests (Đổi ca)
  // ══════════════════════════════════════════════════════════════
  
  r.post("/hr/swap", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const { targetUserId, scheduleId, reason } = req.body;
    const [target, schedule] = await Promise.all([
      prisma.staff.findUnique({ where: { id: Number(targetUserId) }, select: { storeId: true } }),
      prisma.workSchedule.findUnique({ where: { id: Number(scheduleId) }, select: { staffId: true } }),
    ]);
    if (!target || target.storeId !== me.storeId) {
      return res.status(400).json({ error: "Chỉ đổi ca được với nhân viên cùng chi nhánh." });
    }
    if (!schedule || schedule.staffId !== me.id) {
      return res.status(400).json({ error: "Ca không hợp lệ." });
    }
    try {
      const request = await prisma.shiftSwapRequest.create({
        data: {
          requesterId: me.id,
          targetUserId,
          scheduleId,
          reason,
        }
      });
      res.json({ ok: true, request });
    } catch (e) {
      res.status(500).json({ error: "Lỗi tạo đơn đổi ca." });
    }
  });

  r.get("/hr/swap", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const where = isAdminLike(me.role) ? { requester: storeWhere(req) } : {
      OR: [{ requesterId: me.id }, { targetUserId: me.id }]
    };
    const requests = await prisma.shiftSwapRequest.findMany({
      where,
      include: { 
        requester: { select: { fullName: true } },
        targetUser: { select: { fullName: true } },
        schedule: true
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(requests);
  });

  r.put("/hr/swap/:id/target-review", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    const { status } = req.body; // ACCEPTED or REJECTED

    if (!["ACCEPTED", "REJECTED"].includes(status)) {
      return res.status(400).json({ error: "Trạng thái không hợp lệ." });
    }

    try {
      const reqCheck = await prisma.shiftSwapRequest.findUnique({ where: { id }});
      if (!reqCheck || reqCheck.targetUserId !== me.id) {
        return res.status(403).json({ error: "Không có quyền." });
      }

      const request = await prisma.shiftSwapRequest.update({
        where: { id },
        data: { targetUserStatus: status, ...(status === "REJECTED" ? { status: "REJECTED" } : {}) }
      });

      res.json({ ok: true, request });
    } catch (e) {
      res.status(500).json({ error: "Lỗi phản hồi đơn." });
    }
  });

  r.put("/hr/swap/:id/review", ...mgmtOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    const { status } = req.body;

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({ error: "Trạng thái không hợp lệ." });
    }

    const cur = await prisma.shiftSwapRequest.findUnique({ where: { id } });
    if (!cur || !(await sameStore(req, cur.requesterId))) {
      return res.status(404).json({ error: "Không tìm thấy đơn." });
    }

    try {
      const request = await prisma.shiftSwapRequest.update({
        where: { id },
        data: { status, managerId: me.id }
      });

      // TRIGGER: If APPROVED, swap user in schedule
      if (status === "APPROVED") {
        await prisma.workSchedule.update({
          where: { id: request.scheduleId },
          data: { staffId: request.targetUserId }
        });
      }

      res.json({ ok: true, request });
    } catch (e) {
      res.status(500).json({ error: "Lỗi duyệt đơn." });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // Attendance Adjustment (Giải trình chấm công)
  // ══════════════════════════════════════════════════════════════
  
  r.post("/hr/attendance", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const { date, adjustmentType, proposedTime, reason } = req.body;
    try {
      const request = await prisma.attendanceAdjustment.create({
        data: {
          userId: me.id,
          date: new Date(date),
          adjustmentType,
          proposedTime: new Date(proposedTime),
          reason,
        }
      });
      res.json({ ok: true, request });
    } catch (e) {
      res.status(500).json({ error: "Lỗi tạo giải trình." });
    }
  });

  r.get("/hr/attendance", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const where = isAdminLike(me.role) ? { user: storeWhere(req) } : { userId: me.id };
    const requests = await prisma.attendanceAdjustment.findMany({
      where,
      include: { user: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" }
    });
    res.json(requests);
  });

  r.put("/hr/attendance/:id/review", ...mgmtOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    const { status } = req.body;

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({ error: "Trạng thái không hợp lệ." });
    }

    const cur = await prisma.attendanceAdjustment.findUnique({ where: { id } });
    if (!cur || !(await sameStore(req, cur.userId))) {
      return res.status(404).json({ error: "Không tìm thấy đơn." });
    }

    try {
      const request = await prisma.attendanceAdjustment.update({
        where: { id },
        data: { status, managerId: me.id }
      });

      // TRIGGER: If APPROVED, find attendance record and overwrite
      if (status === "APPROVED") {
        // Find workschedule on that date
        const schedule = await prisma.workSchedule.findFirst({
          where: { staffId: request.userId, workDate: request.date }
        });

        if (schedule) {
          const updateData: any = {};
          if (["FORGET_CHECKIN", "LATE_IN"].includes(request.adjustmentType)) {
            updateData.actualCheckIn = request.proposedTime;
          } else {
            updateData.actualCheckOut = request.proposedTime;
          }
          await prisma.workSchedule.update({
            where: { id: schedule.id },
            data: updateData
          });
        }
      }

      res.json({ ok: true, request });
    } catch (e) {
      res.status(500).json({ error: "Lỗi duyệt giải trình." });
    }
  });

  return r;
}
