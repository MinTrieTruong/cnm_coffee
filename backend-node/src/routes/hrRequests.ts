/**
 * routes/hrRequests.ts — Đơn từ nhân sự
 *
 * Xin nghỉ   /hr/leave       — nghỉ 1 hoặc nhiều ngày; duyệt → các ca trong khoảng thành ca trống
 * Đổi ca     /hr/swap        — nhường ca cho đồng nghiệp cùng vị trí: người nhận đồng ý → quản lý duyệt
 * Theo ca    /hr/work        — phiếu làm thêm giờ (duyệt + check-out khớp giờ → tính lương làm thêm);
 *                               xin về sớm / đi muộn (duyệt → không tính cảnh báo); đề xuất khác
 * Giải trình /hr/attendance  — quên check-in/out, sửa giờ chấm công
 */
import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import type { Request } from "express";
import { attachStaff, isAdminLike, requireRoles, type StaffRequest } from "../middleware/staff.js";
import { inStore, storeWhere, toStore } from "../lib/storeScope.js";
import { getHrConfig } from "../lib/hrConfig.js";
import { syncOvertime } from "../lib/overtime.js";

const DAY_MS = 86_400_000;
const dateOnly = (s: string) => new Date(`${String(s).slice(0, 10)}T00:00:00Z`);
const isDateStr = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(dateOnly(s).getTime());
const todayUtc = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};
const scheduleSelect = { id: true, workDate: true, shiftCode: true, startMin: true, endMin: true, status: true } as const;

export function hrRequestsRouter(prisma: PrismaClient, io: Server) {
  const r = Router();
  const anyStaff = [attachStaff(prisma)];
  const mgmtOnly = [attachStaff(prisma), requireRoles("Admin")];

  /** Đơn từ không có cột chi nhánh — xét theo chi nhánh của nhân viên làm đơn */
  const sameStore = async (req: Request, staffId: number) =>
    inStore(req, await prisma.staff.findUnique({ where: { id: staffId }, select: { storeId: true } }));

  /** Báo quản lý chi nhánh có đơn mới / báo nhân viên đơn đã được xử lý */
  const pingManagers = (storeId: number | null | undefined) => {
    if (storeId != null) toStore(io, "admin_room", storeId).emit("hr:request", {});
  };
  const pingStaff = (staffId: number, payload: unknown) => io.to(`staff_${staffId}`).emit("hr:reviewed", payload);

  /** Có ca khác trùng giờ trong ngày không */
  async function busyAt(staffId: number, workDate: Date, startMin: number, endMin: number) {
    const rows = await prisma.workSchedule.findMany({ where: { staffId, workDate, status: { notIn: ["REJECTED"] } } });
    return rows.some((w) => w.startMin < endMin && startMin < w.endMin);
  }

  /** Nghỉ phép đã duyệt trùng ngày */
  async function onLeave(staffId: number, day: Date) {
    const n = await prisma.leaveRequest.count({
      where: { userId: staffId, status: "APPROVED", date: { lte: day }, OR: [{ toDate: null, date: day }, { toDate: { gte: day } }] },
    });
    return n > 0;
  }

  // ══════════════════════════════════════════════════════════════
  // Xin nghỉ
  // ══════════════════════════════════════════════════════════════
  r.post("/hr/leave", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const { date, toDate, leaveType, reason } = req.body as { date?: string; toDate?: string; leaveType?: string; reason?: string };
    if (!isDateStr(date)) return res.status(400).json({ error: "Chọn ngày bắt đầu nghỉ." });
    if (toDate && !isDateStr(toDate)) return res.status(400).json({ error: "Ngày kết thúc không hợp lệ." });
    if (!reason?.trim()) return res.status(400).json({ error: "Nhập lý do xin nghỉ." });
    const from = dateOnly(date!);
    const to = toDate ? dateOnly(toDate) : null;
    if (to && to < from) return res.status(400).json({ error: "Ngày kết thúc phải sau ngày bắt đầu." });
    if (to && (to.getTime() - from.getTime()) / DAY_MS > 60) return res.status(400).json({ error: "Mỗi đơn nghỉ tối đa 60 ngày." });

    const request = await prisma.leaveRequest.create({
      data: {
        userId: me.id,
        date: from,
        toDate: to && to.getTime() !== from.getTime() ? to : null,
        leaveType: leaveType === "HALF_DAY" ? "HALF_DAY" : "FULL_DAY",
        reason: reason.trim(),
      },
    });
    pingManagers(me.storeId);
    res.json({ ok: true, request });
  });

  r.get("/hr/leave", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const where = isAdminLike(me.role) ? { user: storeWhere(req) } : { userId: me.id };
    const requests = await prisma.leaveRequest.findMany({
      where,
      include: { user: { select: { fullName: true, role: true } }, manager: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(requests);
  });

  r.delete("/hr/leave/:id", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const cur = await prisma.leaveRequest.findUnique({ where: { id: Number(req.params.id) } });
    if (!cur || cur.userId !== me.id) return res.status(404).json({ error: "Không tìm thấy đơn." });
    if (cur.status !== "PENDING") return res.status(400).json({ error: "Chỉ huỷ được đơn đang chờ duyệt." });
    await prisma.leaveRequest.delete({ where: { id: cur.id } });
    res.json({ ok: true });
  });

  r.put("/hr/leave/:id/review", ...mgmtOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    const { status } = req.body as { status?: string };
    if (status !== "APPROVED" && status !== "REJECTED") return res.status(400).json({ error: "Trạng thái không hợp lệ." });

    const cur = await prisma.leaveRequest.findUnique({ where: { id }, include: { user: { select: { fullName: true, role: true, storeId: true } } } });
    if (!cur || !(await sameStore(req, cur.userId))) return res.status(404).json({ error: "Không tìm thấy đơn." });
    if (cur.status !== "PENDING") return res.status(400).json({ error: "Đơn đã được xử lý." });

    const request = await prisma.leaveRequest.update({ where: { id }, data: { status, managerId: me.id } });

    // Duyệt → các ca chưa chấm công trong khoảng nghỉ thành ca trống (giữ vị trí để xếp người thay)
    let opened = 0;
    if (status === "APPROVED") {
      const result = await prisma.workSchedule.updateMany({
        where: {
          staffId: cur.userId,
          workDate: { gte: cur.date, lte: cur.toDate ?? cur.date },
          actualCheckIn: null,
          status: { in: ["APPROVED", "PENDING", "DRAFT"] },
        },
        data: { status: "OPEN_SHIFT", staffId: null, role: cur.user.role, managerNote: `Ca trống do ${cur.user.fullName} nghỉ phép` },
      });
      opened = result.count;
      if (cur.user.storeId != null) toStore(io, "admin_room", cur.user.storeId).emit("schedule:updated", {});
    }
    pingStaff(cur.userId, { type: "LEAVE", id, status });
    res.json({ ok: true, request, openedShifts: opened });
  });

  // ══════════════════════════════════════════════════════════════
  // Đổi ca (nhường ca cho đồng nghiệp)
  // ══════════════════════════════════════════════════════════════
  r.post("/hr/swap", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const targetUserId = Number(req.body.targetUserId);
    const scheduleId = Number(req.body.scheduleId);
    const reason = String(req.body.reason ?? "").trim();
    if (!reason) return res.status(400).json({ error: "Nhập lý do đổi ca." });

    const [target, schedule] = await Promise.all([
      prisma.staff.findUnique({ where: { id: targetUserId }, select: { id: true, storeId: true, role: true, status: true } }),
      prisma.workSchedule.findUnique({ where: { id: scheduleId } }),
    ]);
    if (!schedule || schedule.staffId !== me.id || schedule.status !== "APPROVED") return res.status(400).json({ error: "Ca không hợp lệ." });
    if (schedule.workDate < todayUtc() || schedule.actualCheckIn) return res.status(400).json({ error: "Ca đã qua hoặc đã chấm công." });
    if (!target || target.id === me.id || target.status !== "Active" || target.storeId !== me.storeId) {
      return res.status(400).json({ error: "Chỉ đổi ca được với nhân viên cùng chi nhánh." });
    }
    if (target.role !== (schedule.role ?? me.role)) return res.status(400).json({ error: "Chỉ đổi ca được với người cùng vị trí." });
    if (await busyAt(target.id, schedule.workDate, schedule.startMin, schedule.endMin)) {
      return res.status(400).json({ error: "Đồng nghiệp đã có ca trùng giờ ngày đó." });
    }
    if (await onLeave(target.id, schedule.workDate)) return res.status(400).json({ error: "Đồng nghiệp đang nghỉ phép ngày đó." });
    const dup = await prisma.shiftSwapRequest.count({ where: { scheduleId, status: "PENDING" } });
    if (dup) return res.status(400).json({ error: "Ca này đang có đơn đổi chờ xử lý." });

    const request = await prisma.shiftSwapRequest.create({ data: { requesterId: me.id, targetUserId, scheduleId, reason } });
    pingStaff(targetUserId, { type: "SWAP_INCOMING", id: request.id });
    res.json({ ok: true, request });
  });

  r.get("/hr/swap", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const where = isAdminLike(me.role) ? { requester: storeWhere(req) } : { OR: [{ requesterId: me.id }, { targetUserId: me.id }] };
    const requests = await prisma.shiftSwapRequest.findMany({
      where,
      include: {
        requester: { select: { fullName: true } },
        targetUser: { select: { fullName: true } },
        manager: { select: { fullName: true } },
        schedule: { select: scheduleSelect },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(requests);
  });

  r.delete("/hr/swap/:id", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const cur = await prisma.shiftSwapRequest.findUnique({ where: { id: Number(req.params.id) } });
    if (!cur || cur.requesterId !== me.id) return res.status(404).json({ error: "Không tìm thấy đơn." });
    if (cur.status !== "PENDING") return res.status(400).json({ error: "Chỉ huỷ được đơn đang chờ duyệt." });
    await prisma.shiftSwapRequest.delete({ where: { id: cur.id } });
    res.json({ ok: true });
  });

  /** Người nhận ca đồng ý / từ chối */
  r.put("/hr/swap/:id/target-review", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    const { status } = req.body as { status?: string };
    if (status !== "ACCEPTED" && status !== "REJECTED") return res.status(400).json({ error: "Trạng thái không hợp lệ." });

    const cur = await prisma.shiftSwapRequest.findUnique({ where: { id } });
    if (!cur || cur.targetUserId !== me.id) return res.status(403).json({ error: "Không có quyền." });
    if (cur.status !== "PENDING" || cur.targetUserStatus !== "PENDING") return res.status(400).json({ error: "Đơn đã được phản hồi." });

    const request = await prisma.shiftSwapRequest.update({
      where: { id },
      data: { targetUserStatus: status, ...(status === "REJECTED" ? { status: "REJECTED" } : {}) },
    });
    pingStaff(cur.requesterId, { type: "SWAP", id, targetUserStatus: status });
    if (status === "ACCEPTED") pingManagers(me.storeId);
    res.json({ ok: true, request });
  });

  r.put("/hr/swap/:id/review", ...mgmtOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    const { status } = req.body as { status?: string };
    if (status !== "APPROVED" && status !== "REJECTED") return res.status(400).json({ error: "Trạng thái không hợp lệ." });

    const cur = await prisma.shiftSwapRequest.findUnique({ where: { id }, include: { schedule: true } });
    if (!cur || !(await sameStore(req, cur.requesterId))) return res.status(404).json({ error: "Không tìm thấy đơn." });
    if (cur.status !== "PENDING") return res.status(400).json({ error: "Đơn đã được xử lý." });

    if (status === "APPROVED") {
      if (cur.targetUserStatus !== "ACCEPTED") return res.status(400).json({ error: "Người nhận ca chưa đồng ý." });
      const s = cur.schedule;
      if (s.staffId !== cur.requesterId || s.actualCheckIn) return res.status(400).json({ error: "Ca đã thay đổi, không đổi được nữa." });
      if (await busyAt(cur.targetUserId, s.workDate, s.startMin, s.endMin)) {
        return res.status(400).json({ error: "Người nhận đã có ca trùng giờ ngày đó." });
      }
    }

    const [request] = await prisma.$transaction([
      prisma.shiftSwapRequest.update({ where: { id }, data: { status, managerId: me.id } }),
      ...(status === "APPROVED"
        ? [prisma.workSchedule.update({ where: { id: cur.scheduleId }, data: { staffId: cur.targetUserId, reviewedBy: me.id } })]
        : []),
    ]);
    if (status === "APPROVED") toStore(io, "admin_room", cur.schedule.storeId).emit("schedule:updated", {});
    pingStaff(cur.requesterId, { type: "SWAP", id, status });
    pingStaff(cur.targetUserId, { type: "SWAP", id, status });
    res.json({ ok: true, request });
  });

  // ══════════════════════════════════════════════════════════════
  // Làm thêm giờ / xin về sớm / đi muộn / khác (gắn với 1 ca)
  // ══════════════════════════════════════════════════════════════
  r.post("/hr/work", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const { scheduleId, type, minutes, reason } = req.body as { scheduleId?: number; type?: string; minutes?: number; reason?: string };
    if (!["OVERTIME", "EARLY_LEAVE", "LATE_ARRIVAL", "OTHER"].includes(type ?? "")) return res.status(400).json({ error: "Loại đơn không hợp lệ." });
    if (!reason?.trim()) return res.status(400).json({ error: "Nhập lý do." });
    const needMinutes = type !== "OTHER";
    const maxMinutes = type === "OVERTIME" ? (await getHrConfig(prisma)).maxOvertimeMinutes : 600;
    if (needMinutes && !(Number.isInteger(minutes) && minutes! > 0 && minutes! <= maxMinutes)) {
      return res.status(400).json({ error: `Nhập số phút (1 – ${maxMinutes}).` });
    }

    let schedule = null;
    if (scheduleId != null) {
      schedule = await prisma.workSchedule.findUnique({ where: { id: Number(scheduleId) } });
      if (!schedule || schedule.staffId !== me.id || schedule.status !== "APPROVED") return res.status(400).json({ error: "Ca không hợp lệ." });
      if (type === "OVERTIME") {
        // Làm phiếu trước hoặc ngay sau ca (tối đa 2 ngày sau)
        if (schedule.workDate.getTime() < todayUtc().getTime() - 2 * DAY_MS) return res.status(400).json({ error: "Ca đã qua quá lâu, không làm phiếu được nữa." });
        const dup = await prisma.workRequest.count({ where: { scheduleId: schedule.id, type: "OVERTIME", status: { in: ["PENDING", "APPROVED"] } } });
        if (dup) return res.status(400).json({ error: "Ca này đã có phiếu làm thêm giờ." });
      }
    } else if (needMinutes) {
      return res.status(400).json({ error: "Chọn ca làm." });
    }

    const request = await prisma.workRequest.create({
      data: {
        userId: me.id,
        scheduleId: schedule?.id ?? null,
        type: type as "OVERTIME" | "EARLY_LEAVE" | "LATE_ARRIVAL" | "OTHER",
        minutes: needMinutes ? minutes! : null,
        reason: reason.trim(),
      },
    });
    pingManagers(me.storeId);
    res.json({ ok: true, request });
  });

  r.get("/hr/work", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const where = isAdminLike(me.role) ? { user: storeWhere(req) } : { userId: me.id };
    const requests = await prisma.workRequest.findMany({
      where,
      include: {
        user: { select: { fullName: true, role: true } },
        manager: { select: { fullName: true } },
        schedule: { select: scheduleSelect },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(requests);
  });

  r.delete("/hr/work/:id", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const cur = await prisma.workRequest.findUnique({ where: { id: Number(req.params.id) } });
    if (!cur || cur.userId !== me.id) return res.status(404).json({ error: "Không tìm thấy đơn." });
    if (cur.status !== "PENDING") return res.status(400).json({ error: "Chỉ huỷ được đơn đang chờ duyệt." });
    await prisma.workRequest.delete({ where: { id: cur.id } });
    res.json({ ok: true });
  });

  r.put("/hr/work/:id/review", ...mgmtOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    const { status, managerNote, approvedMinutes } = req.body as { status?: string; managerNote?: string; approvedMinutes?: number };
    if (status !== "APPROVED" && status !== "REJECTED") return res.status(400).json({ error: "Trạng thái không hợp lệ." });

    const cur = await prisma.workRequest.findUnique({ where: { id } });
    if (!cur || !(await sameStore(req, cur.userId))) return res.status(404).json({ error: "Không tìm thấy đơn." });
    if (cur.status !== "PENDING") return res.status(400).json({ error: "Đơn đã được xử lý." });
    // Làm thêm: quản lý có thể duyệt ít phút hơn số xin
    if (approvedMinutes !== undefined && !(Number.isInteger(approvedMinutes) && approvedMinutes > 0 && approvedMinutes <= (cur.minutes ?? 0))) {
      return res.status(400).json({ error: `Số phút duyệt phải từ 1 đến ${cur.minutes}.` });
    }

    const [request] = await prisma.$transaction([
      prisma.workRequest.update({
        where: { id },
        data: {
          status, managerId: me.id, managerNote: managerNote?.trim() || null,
          ...(status === "APPROVED" && approvedMinutes !== undefined ? { minutes: approvedMinutes } : {}),
        },
      }),
      // Được duyệt → lần đi muộn / về sớm đó không tính vào cảnh báo chấm công
      ...(status === "APPROVED" && cur.scheduleId && (cur.type === "LATE_ARRIVAL" || cur.type === "EARLY_LEAVE")
        ? [prisma.workSchedule.update({
            where: { id: cur.scheduleId },
            data: cur.type === "LATE_ARRIVAL" ? { lateExcused: true } : { earlyExcused: true },
          })]
        : []),
    ]);
    // Làm thêm: nếu đã check-out thì tính luôn số phút được trả lương
    if (cur.type === "OVERTIME" && cur.scheduleId) await syncOvertime(prisma, cur.scheduleId);
    pingStaff(cur.userId, { type: "WORK", id, status });
    res.json({ ok: true, request });
  });

  // ══════════════════════════════════════════════════════════════
  // Giải trình chấm công
  // ══════════════════════════════════════════════════════════════
  r.post("/hr/attendance", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const { date, adjustmentType, proposedTime, reason } = req.body as Record<string, string | undefined>;
    if (!isDateStr(date)) return res.status(400).json({ error: "Chọn ngày." });
    if (!["FORGET_CHECKIN", "FORGET_CHECKOUT", "LATE_IN", "EARLY_OUT"].includes(adjustmentType ?? "")) {
      return res.status(400).json({ error: "Loại giải trình không hợp lệ." });
    }
    const proposed = new Date(proposedTime ?? "");
    if (Number.isNaN(proposed.getTime())) return res.status(400).json({ error: "Giờ đề xuất không hợp lệ." });
    if (!reason?.trim()) return res.status(400).json({ error: "Nhập lý do." });

    const request = await prisma.attendanceAdjustment.create({
      data: {
        userId: me.id,
        date: dateOnly(date!),
        adjustmentType: adjustmentType as "FORGET_CHECKIN" | "FORGET_CHECKOUT" | "LATE_IN" | "EARLY_OUT",
        proposedTime: proposed,
        reason: reason.trim(),
      },
    });
    pingManagers(me.storeId);
    res.json({ ok: true, request });
  });

  r.get("/hr/attendance", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const where = isAdminLike(me.role) ? { user: storeWhere(req) } : { userId: me.id };
    const requests = await prisma.attendanceAdjustment.findMany({
      where,
      include: { user: { select: { fullName: true, role: true } }, manager: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(requests);
  });

  r.delete("/hr/attendance/:id", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const cur = await prisma.attendanceAdjustment.findUnique({ where: { id: Number(req.params.id) } });
    if (!cur || cur.userId !== me.id) return res.status(404).json({ error: "Không tìm thấy đơn." });
    if (cur.status !== "PENDING") return res.status(400).json({ error: "Chỉ huỷ được đơn đang chờ duyệt." });
    await prisma.attendanceAdjustment.delete({ where: { id: cur.id } });
    res.json({ ok: true });
  });

  r.put("/hr/attendance/:id/review", ...mgmtOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    const { status } = req.body as { status?: string };
    if (status !== "APPROVED" && status !== "REJECTED") return res.status(400).json({ error: "Trạng thái không hợp lệ." });

    const cur = await prisma.attendanceAdjustment.findUnique({ where: { id } });
    if (!cur || !(await sameStore(req, cur.userId))) return res.status(404).json({ error: "Không tìm thấy đơn." });
    if (cur.status !== "PENDING") return res.status(400).json({ error: "Đơn đã được xử lý." });

    const request = await prisma.attendanceAdjustment.update({ where: { id }, data: { status, managerId: me.id } });

    // Duyệt → ghi đè giờ chấm công của ca ngày đó
    if (status === "APPROVED") {
      const schedule = await prisma.workSchedule.findFirst({
        where: { staffId: cur.userId, workDate: cur.date, status: "APPROVED" },
        orderBy: { startMin: "asc" },
      });
      if (schedule) {
        const checkIn = ["FORGET_CHECKIN", "LATE_IN"].includes(cur.adjustmentType);
        await prisma.workSchedule.update({
          where: { id: schedule.id },
          data: checkIn ? { actualCheckIn: cur.proposedTime } : { actualCheckOut: cur.proposedTime },
        });
        if (!checkIn) await syncOvertime(prisma, schedule.id);
      }
    }
    pingStaff(cur.userId, { type: "ATTENDANCE", id, status });
    res.json({ ok: true, request });
  });

  return r;
}
