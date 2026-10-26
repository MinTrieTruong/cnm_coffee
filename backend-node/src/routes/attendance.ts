/**
 * routes/attendance.ts — Chấm công GPS + FaceID & Tăng ca
 *
 * POST /attendance/clock            — Check-in / Check-out (GPS + Face)
 * POST /attendance/request-overtime  — NV làm phiếu làm thêm sau khi check-out (quản lý duyệt ở Đơn từ)
 * POST /attendance/register-face     — Đăng ký khuôn mặt cho NV
 * GET  /attendance/face-descriptor   — Lấy face descriptor của NV
 * GET  /attendance/store-location    — Lấy tọa độ quán
 * GET  /attendance/today             — Lấy trạng thái chấm công hôm nay
 * GET  /attendance/today-store       — Ca hôm nay của cả chi nhánh: ai chưa chấm công (quản lý)
 * GET  /attendance/warnings          — Cảnh báo chấm công theo tháng (quản lý)
 */
import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { attachStaff, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { inStore, mustStoreId, storeWhere } from "../lib/storeScope.js";
import { getStoreSettings } from "../lib/pricing.js";
import { getHrConfig, getShiftTemplates } from "../lib/hrConfig.js";
import { evaluateShift, shiftWindow } from "../lib/attendanceRules.js";
import { syncOvertime } from "../lib/overtime.js";

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
    const names = new Map((await getShiftTemplates(prisma)).map((t) => [t.code, t.name]));
    res.json({ schedules: schedules.map((s) => ({ ...s, shiftName: names.get(s.shiftCode) ?? s.shiftCode })) });
  });

  /* ══════════════════════════════════════════════════════════════════
     GET /attendance/today-store — Ca hôm nay của cả chi nhánh (quản lý nhắc chấm công)
     state: upcoming (chưa tới giờ) | missing (đã tới giờ, chưa vào) | working | missing_out (hết ca chưa ra) | done
  ══════════════════════════════════════════════════════════════════ */
  r.get("/attendance/today-store", ...mgmtOnly, requireStore, async (req, res) => {
    const [cfg, templates, schedules] = await Promise.all([
      getHrConfig(prisma),
      getShiftTemplates(prisma),
      prisma.workSchedule.findMany({
        where: { storeId: mustStoreId(req), workDate: { gte: todayStart(), lte: todayEnd() }, status: "APPROVED", staffId: { not: null } },
        include: { staff: { select: { id: true, fullName: true, role: true } } },
        orderBy: [{ startMin: "asc" }, { id: "asc" }],
      }),
    ]);
    const names = new Map(templates.map((t) => [t.code, t.name]));
    const nowMin = dateToMinutes(new Date());
    const stateOf = (s: (typeof schedules)[number]) => {
      if (s.actualCheckIn && s.actualCheckOut) return "done";
      if (s.actualCheckIn) return nowMin > s.endMin ? "missing_out" : "working";
      return nowMin >= s.startMin + cfg.lateGraceMin ? "missing" : "upcoming";
    };
    res.json({
      lateGraceMin: cfg.lateGraceMin,
      rows: schedules.map((s) => ({
        id: s.id,
        staffId: s.staffId,
        fullName: s.staff?.fullName ?? "",
        role: s.staff?.role ?? s.role,
        shiftCode: s.shiftCode,
        shiftName: names.get(s.shiftCode) ?? s.shiftCode,
        startMin: s.startMin,
        endMin: s.endMin,
        actualCheckIn: s.actualCheckIn,
        actualCheckOut: s.actualCheckOut,
        state: stateOf(s),
      })),
    });
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
    const cfg = await getHrConfig(prisma);
    res.json({ schedules: schedules.map((s) => ({ ...s, verdict: evaluateShift(s, cfg) })) });
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

      // Chỉ cho phép check-in sớm tối đa N phút (Chủ chuỗi cấu hình)
      const { earlyCheckInMin } = await getHrConfig(prisma);
      const earliestAllowed = schedule.startMin - earlyCheckInMin;
      if (nowMin < earliestAllowed) {
        const startH = Math.floor(schedule.startMin / 60);
        const startM = schedule.startMin % 60;
        return res.status(400).json({
          error: `Chưa đến giờ check-in. Ca bắt đầu lúc ${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}. Chỉ được check-in sớm tối đa ${earlyCheckInMin} phút.`,
        });
      }

      const updated = await prisma.workSchedule.update({
        where: { id: schedule.id },
        data: { actualCheckIn: now },
      });

      const verdict = evaluateShift(updated, await getHrConfig(prisma));
      return res.json({
        ok: true,
        message: verdict.late ? `Check-in thành công — bạn vào trễ ${verdict.lateMin} phút.` : "Check-in thành công!",
        lateMinutes: verdict.late ? verdict.lateMin : 0,
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
        // Tính cả ca hôm qua (ca qua đêm check-out sau 00:00)
        const yesterday = todayStart();
        yesterday.setDate(yesterday.getDate() - 1);
        schedule = await prisma.workSchedule.findFirst({
          where: {
            staffId: me.id,
            workDate: { gte: yesterday, lte: todayEnd() },
            status: "APPROVED",
            actualCheckIn: { not: null },
            actualCheckOut: null,
          },
          orderBy: [{ workDate: "desc" }, { startMin: "asc" }],
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

      // Có phiếu làm thêm đã duyệt → khớp giờ check-out, xác nhận số phút được tính lương luôn
      const ot = await syncOvertime(prisma, schedule.id);
      const extraMinutes = Math.max(0, Math.floor((now.getTime() - shiftWindow(schedule).end) / 60_000));
      const message = ot.approved > 0
        ? `Check-out thành công — ghi nhận ${ot.paid} phút làm thêm (phiếu duyệt ${ot.approved} phút).`
        : "Check-out thành công!";

      return res.json({
        ok: true,
        message,
        schedule: { ...updated, isOvertime: ot.approved > 0, overtimeMinutes: ot.approved > 0 ? ot.paid : null },
        distance: Math.round(distance),
        extraMinutes,
        overtimeMinutes: ot.paid,
        // Ở lại quá 30 phút mà chưa có phiếu → gợi ý làm phiếu bổ sung
        promptOvertime: ot.approved === 0 && extraMinutes > 30,
      });
    }
  });

  /* ══════════════════════════════════════════════════════════════════
     POST /attendance/request-overtime — Phiếu làm thêm bổ sung sau check-out
     Body: { scheduleId, staffNote } — tạo phiếu OVERTIME bằng số phút ở lại sau giờ hết ca
  ══════════════════════════════════════════════════════════════════ */
  r.post("/attendance/request-overtime", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const { scheduleId, staffNote } = req.body as { scheduleId: number; staffNote: string };
    if (!scheduleId || !staffNote?.trim()) return res.status(400).json({ error: "Thiếu ca hoặc lý do." });

    const schedule = await prisma.workSchedule.findFirst({ where: { id: scheduleId, staffId: me.id, actualCheckOut: { not: null } } });
    if (!schedule) return res.status(404).json({ error: "Không tìm thấy ca đã check-out." });
    const dup = await prisma.workRequest.count({ where: { scheduleId, type: "OVERTIME", status: { in: ["PENDING", "APPROVED"] } } });
    if (dup) return res.status(400).json({ error: "Ca này đã có phiếu làm thêm giờ." });

    const { maxOvertimeMinutes } = await getHrConfig(prisma);
    const extra = Math.floor((schedule.actualCheckOut!.getTime() - shiftWindow(schedule).end) / 60_000);
    if (extra <= 0) return res.status(400).json({ error: "Bạn check-out trước giờ hết ca, không có giờ làm thêm." });

    await prisma.workRequest.create({
      data: { userId: me.id, scheduleId, type: "OVERTIME", minutes: Math.min(extra, maxOvertimeMinutes), reason: staffNote.trim() },
    });
    await prisma.workSchedule.update({ where: { id: scheduleId }, data: { overtimeNote: staffNote.trim() } });
    res.json({ ok: true, message: "Đã gửi phiếu làm thêm giờ, chờ quản lý duyệt." });
  });

  /* ══════════════════════════════════════════════════════════════════
     GET /attendance/warnings?month=YYYY-MM — Cảnh báo chấm công
     Đếm số lần đi muộn / về sớm / vắng của từng nhân viên trong tháng;
     đi muộn từ `lateWarnThreshold` lần trở lên → bị cảnh báo.
  ══════════════════════════════════════════════════════════════════ */
  r.get("/attendance/warnings", ...mgmtOnly, async (req, res) => {
    const m = /^(\d{4})-(\d{2})$/.exec(String(req.query.month ?? ""));
    const now = new Date();
    const y = m ? Number(m[1]) : now.getFullYear();
    const mo = m ? Number(m[2]) : now.getMonth() + 1;
    const from = new Date(Date.UTC(y, mo - 1, 1));
    const to = new Date(Date.UTC(y, mo, 0));

    const [cfg, templates, staff, schedules] = await Promise.all([
      getHrConfig(prisma),
      getShiftTemplates(prisma),
      prisma.staff.findMany({
        where: { ...storeWhere(req), status: "Active", role: { notIn: ["Owner"] } },
        select: { id: true, fullName: true, role: true, storeId: true, store: { select: { name: true } } },
        orderBy: { fullName: "asc" },
      }),
      prisma.workSchedule.findMany({
        where: { ...storeWhere(req), workDate: { gte: from, lte: to }, status: "APPROVED", staffId: { not: null } },
        orderBy: [{ workDate: "asc" }, { startMin: "asc" }],
      }),
    ]);

    const names = new Map(templates.map((t) => [t.code, t.name]));
    type Incident = { scheduleId: number; date: string; shiftCode: string; shiftName: string; kind: "late" | "early" | "absent"; minutes: number };
    const byStaff = new Map<number, Incident[]>();
    const shifts = new Map<number, number>();
    for (const w of schedules) {
      shifts.set(w.staffId!, (shifts.get(w.staffId!) ?? 0) + 1);
      const v = evaluateShift(w, cfg, now);
      const list = byStaff.get(w.staffId!) ?? byStaff.set(w.staffId!, []).get(w.staffId!)!;
      const base = { scheduleId: w.id, date: w.workDate.toISOString().slice(0, 10), shiftCode: w.shiftCode, shiftName: names.get(w.shiftCode) ?? w.shiftCode };
      if (v.absent) list.push({ ...base, kind: "absent", minutes: 0 });
      if (v.late) list.push({ ...base, kind: "late", minutes: v.lateMin });
      if (v.early) list.push({ ...base, kind: "early", minutes: v.earlyMin });
    }

    const rows = staff.map((s) => {
      const incidents = byStaff.get(s.id) ?? [];
      const lateCount = incidents.filter((i) => i.kind === "late").length;
      return {
        staffId: s.id,
        fullName: s.fullName,
        role: s.role,
        storeName: s.store?.name ?? null,
        shiftCount: shifts.get(s.id) ?? 0,
        lateCount,
        lateMinutes: incidents.filter((i) => i.kind === "late").reduce((a, i) => a + i.minutes, 0),
        earlyCount: incidents.filter((i) => i.kind === "early").length,
        absentCount: incidents.filter((i) => i.kind === "absent").length,
        warned: lateCount >= cfg.lateWarnThreshold,
        incidents,
      };
    });
    res.json({
      month: `${y}-${String(mo).padStart(2, "0")}`,
      threshold: cfg.lateWarnThreshold,
      lateGraceMin: cfg.lateGraceMin,
      rows,
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
