/**
 * routes/attendance.ts — Chấm công GPS + FaceID & Tăng ca
 *
 * POST /attendance/clock            — Check-in / Check-out (GPS + Face)
 * POST /attendance/request-overtime  — NV xin tăng ca
 * PUT  /attendance/approve-overtime  — Quản lý duyệt tăng ca
 * POST /attendance/register-face     — Đăng ký khuôn mặt cho NV
 * GET  /attendance/face-descriptor   — Lấy face descriptor của NV
 * GET  /attendance/store-location    — Lấy tọa độ quán
 * GET  /attendance/today             — Lấy trạng thái chấm công hôm nay
 */
import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { attachStaff, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { inStore, mustStoreId } from "../lib/storeScope.js";
import { getStoreSettings } from "../lib/pricing.js";

/* ── Haversine formula ──────────────────────────────────────────── */
function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000; // Bán kính Trái đất (mét)
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // mét
}

/** Đổi Date sang số phút từ 00:00 (theo local timezone) */
function dateToMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Đầu ngày hôm nay (00:00:00) */
function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Cuối ngày hôm nay (23:59:59.999) */
function todayEnd(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export function attendanceRouter(prisma: PrismaClient) {
  const r = Router();
  const anyStaff = [attachStaff(prisma)];
  const mgmtOnly = [attachStaff(prisma), requireRoles("Admin")];
  /** Chấm công tại chi nhánh của nhân viên (Owner: chi nhánh đang chọn) */
  const atStore = [attachStaff(prisma), requireStore];

  /* ══════════════════════════════════════════════════════════════════
     GET /attendance/store-location — Lấy tọa độ quán + bán kính
  ══════════════════════════════════════════════════════════════════ */
  r.get("/attendance/store-location", ...atStore, async (req, res) => {
    const [store, settings] = await Promise.all([
      prisma.store.findUniqueOrThrow({ where: { id: mustStoreId(req) } }),
      getStoreSettings(prisma),
    ]);
    res.json({
      storeId: store.id,
      storeName: store.name,
      lat: store.lat,
      lng: store.lng,
      radius: store.allowedRadius,
      faceMatchThreshold: settings.faceMatchThreshold,
    });
  });

  /* ══════════════════════════════════════════════════════════════════
     GET /attendance/today — Trạng thái chấm công hôm nay
  ══════════════════════════════════════════════════════════════════ */
  r.get("/attendance/today", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const schedules = await prisma.workSchedule.findMany({
      where: {
        staffId: me.id,
        workDate: { gte: todayStart(), lte: todayEnd() },
        status: "APPROVED",
      },
      orderBy: { startMin: "asc" },
    });
    res.json({ schedules });
  });

  /* ══════════════════════════════════════════════════════════════════
     GET /attendance/my-month — Trạng thái chấm công theo tháng
  ══════════════════════════════════════════════════════════════════ */
  r.get("/attendance/my-month", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: "Thiếu year/month" });

    const y = parseInt(year as string, 10);
    const m = parseInt(month as string, 10);

    const startOfMonth = new Date(y, m - 1, 1);
    const endOfMonth = new Date(y, m, 0, 23, 59, 59, 999);

    const schedules = await prisma.workSchedule.findMany({
      where: {
        staffId: me.id,
        workDate: { gte: startOfMonth, lte: endOfMonth },
        status: "APPROVED",
      },
      orderBy: { workDate: "asc" },
    });
    res.json({ schedules });
  });

  /* ══════════════════════════════════════════════════════════════════
     POST /attendance/clock — Check-in / Check-out
     Body: { lat, lng, type: "in" | "out", scheduleId? }
  ══════════════════════════════════════════════════════════════════ */
  r.post("/attendance/clock", ...atStore, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const { lat, lng, type, scheduleId } = req.body as {
      lat: number;
      lng: number;
      type: "in" | "out";
      scheduleId?: number;
    };

    if (!lat || !lng || !type) {
      return res.status(400).json({ error: "Thiếu tham số lat, lng hoặc type." });
    }
    if (type !== "in" && type !== "out") {
      return res.status(400).json({ error: "type phải là 'in' hoặc 'out'." });
    }

    // Toạ độ + bán kính của chi nhánh nhân viên làm việc
    const store = await prisma.store.findUniqueOrThrow({ where: { id: mustStoreId(req) } });
    const storeLat = store.lat;
    const storeLng = store.lng;
    const allowedRadius = store.allowedRadius;

    // Kiểm tra khoảng cách GPS
    const distance = haversineDistance(lat, lng, storeLat, storeLng);
    if (distance > allowedRadius) {
      return res.status(400).json({
        error: `Bạn đang ở ngoài phạm vi cho phép. Khoảng cách: ${Math.round(distance)}m (tối đa ${allowedRadius}m).`,
        distance: Math.round(distance),
        allowedRadius,
      });
    }

    const now = new Date();
    const nowMin = dateToMinutes(now);

    if (type === "in") {
      // ── CHECK-IN ────────────────────────────────────────────────
      // Tìm ca làm hôm nay (APPROVED, chưa check-in)
      let schedule;
      if (scheduleId) {
        schedule = await prisma.workSchedule.findFirst({
          where: {
            id: scheduleId,
            staffId: me.id,
            status: "APPROVED",
            actualCheckIn: null,
          },
        });
      } else {
        // Tìm ca gần nhất chưa check-in
        schedule = await prisma.workSchedule.findFirst({
          where: {
            staffId: me.id,
            workDate: { gte: todayStart(), lte: todayEnd() },
            status: "APPROVED",
            actualCheckIn: null,
          },
          orderBy: { startMin: "asc" },
        });
      }

      if (!schedule) {
        return res.status(400).json({
          error: "Không tìm thấy ca làm hôm nay (đã duyệt, chưa check-in).",
        });
      }

      // Chỉ cho phép check-in sớm tối đa 30 phút
      const earliestAllowed = schedule.startMin - 30;
      if (nowMin < earliestAllowed) {
        const startH = Math.floor(schedule.startMin / 60);
        const startM = schedule.startMin % 60;
        return res.status(400).json({
          error: `Chưa đến giờ check-in. Ca bắt đầu lúc ${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}. Chỉ được check-in sớm tối đa 30 phút.`,
        });
      }

      const updated = await prisma.workSchedule.update({
        where: { id: schedule.id },
        data: { actualCheckIn: now },
      });

      return res.json({
        ok: true,
        message: "Check-in thành công!",
        schedule: updated,
        distance: Math.round(distance),
      });
    } else {
      // ── CHECK-OUT ───────────────────────────────────────────────
      // Tìm ca đã check-in nhưng chưa check-out
      let schedule;
      if (scheduleId) {
        schedule = await prisma.workSchedule.findFirst({
          where: {
            id: scheduleId,
            staffId: me.id,
            status: "APPROVED",
            actualCheckIn: { not: null },
            actualCheckOut: null,
          },
        });
      } else {
        schedule = await prisma.workSchedule.findFirst({
          where: {
            staffId: me.id,
            workDate: { gte: todayStart(), lte: todayEnd() },
            status: "APPROVED",
            actualCheckIn: { not: null },
            actualCheckOut: null,
          },
          orderBy: { startMin: "asc" },
        });
      }

      if (!schedule) {
        return res.status(400).json({
          error: "Không tìm thấy ca đang làm (đã check-in, chưa check-out).",
        });
      }

      const updated = await prisma.workSchedule.update({
        where: { id: schedule.id },
        data: { actualCheckOut: now },
      });

      // Tính thời gian dư so với endMin
      const extraMinutes = nowMin - schedule.endMin;
      const promptOvertime = extraMinutes > 30;

      return res.json({
        ok: true,
        message: "Check-out thành công!",
        schedule: updated,
        distance: Math.round(distance),
        extraMinutes: Math.max(0, extraMinutes),
        promptOvertime,
      });
    }
  });

  /* ══════════════════════════════════════════════════════════════════
     POST /attendance/request-overtime — NV xin tăng ca
     Body: { scheduleId, staffNote }
  ══════════════════════════════════════════════════════════════════ */
  r.post("/attendance/request-overtime", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const { scheduleId, staffNote } = req.body as {
      scheduleId: number;
      staffNote: string;
    };

    if (!scheduleId || !staffNote) {
      return res.status(400).json({ error: "Thiếu scheduleId hoặc staffNote." });
    }

    const schedule = await prisma.workSchedule.findFirst({
      where: {
        id: scheduleId,
        staffId: me.id,
        actualCheckOut: { not: null },
      },
    });

    if (!schedule) {
      return res.status(404).json({ error: "Không tìm thấy ca đã check-out." });
    }

    const updated = await prisma.workSchedule.update({
      where: { id: scheduleId },
      data: {
        isOvertime: true,
        overtimeNote: staffNote,
      },
    });

    res.json({
      ok: true,
      message: "Đã gửi yêu cầu tăng ca thành công!",
      schedule: updated,
    });
  });

  /* ══════════════════════════════════════════════════════════════════
     PUT /attendance/approve-overtime — Quản lý duyệt tăng ca
     Body: { scheduleId, managerNote, approvedMinutes, managerId }
  ══════════════════════════════════════════════════════════════════ */
  r.put("/attendance/approve-overtime", ...mgmtOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const { scheduleId, managerNote, approvedMinutes } = req.body as {
      scheduleId: number;
      managerNote?: string;
      approvedMinutes: number;
    };

    if (!scheduleId || approvedMinutes == null) {
      return res.status(400).json({ error: "Thiếu scheduleId hoặc approvedMinutes." });
    }

    const schedule = await prisma.workSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule || !inStore(req, schedule)) {
      return res.status(404).json({ error: "Không tìm thấy ca." });
    }

    if (!schedule.isOvertime) {
      return res.status(400).json({ error: "Ca này chưa có yêu cầu tăng ca." });
    }

    const updated = await prisma.workSchedule.update({
      where: { id: scheduleId },
      data: {
        overtimeMinutes: approvedMinutes,
        managerNote: managerNote ?? null,
        reviewedBy: me.id,
      },
    });

    res.json({
      ok: true,
      message: "Đã duyệt tăng ca.",
      schedule: updated,
    });
  });

  /* ══════════════════════════════════════════════════════════════════
     POST /attendance/register-face — Đăng ký khuôn mặt
     Body: { faceDescriptor: number[] }
  ══════════════════════════════════════════════════════════════════ */
  r.post("/attendance/register-face", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const { faceDescriptor } = req.body as { faceDescriptor: number[] };

    if (!faceDescriptor || !Array.isArray(faceDescriptor)) {
      return res.status(400).json({ error: "Thiếu faceDescriptor." });
    }

    await prisma.staff.update({
      where: { id: me.id },
      data: { faceDescriptor: JSON.stringify(faceDescriptor) },
    });

    res.json({ ok: true, message: "Đã lưu dữ liệu khuôn mặt." });
  });

  /* ══════════════════════════════════════════════════════════════════
     GET /attendance/face-descriptor — Lấy face descriptor
  ══════════════════════════════════════════════════════════════════ */
  r.get("/attendance/face-descriptor", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const staff = await prisma.staff.findUnique({
      where: { id: me.id },
      select: { faceDescriptor: true },
    });

    if (!staff?.faceDescriptor) {
      return res.json({ registered: false, descriptor: null });
    }

    res.json({
      registered: true,
      descriptor: JSON.parse(staff.faceDescriptor),
    });
  });

  return r;
}
