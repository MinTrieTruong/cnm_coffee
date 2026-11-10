/**
 * routes/schedule.ts — Lịch làm việc (WorkSchedule) v3 — xếp theo tháng
 * Mẫu ca & định biên lấy từ DB (Chủ chuỗi cấu hình ở /hr/config), không cố định trong code.
 *
 * GET    /schedule/my                 — NV xem lịch cá nhân (?week=YYYY-MM-DD hoặc ?month=YYYY-MM)
 * GET    /schedule/admin/all          — Bảng lịch tổng của chi nhánh (?week= hoặc ?month=)
 * POST   /schedule/admin              — Quản lý gán ca
 * PUT    /schedule/:id                — Quản lý sửa / duyệt / gán người cho ca trống
 * DELETE /schedule/:id                — Xoá ca
 * POST   /schedule/admin/auto         — Tự xếp lịch tháng (tạo bản Nháp) — có nguyện vọng nhân viên, lưu lần chạy (ScheduleRun)
 * GET    /schedule/admin/runs         — Các lần chạy tự xếp của tháng (so sánh chỉ số)
 * POST   /schedule/admin/runs/:id/apply   — Dùng lại phương án của một lần chạy làm bản nháp
 * POST   /schedule/admin/runs/:id/explain — Lời giải thích (AI hoặc mẫu câu theo mã)
 * POST   /schedule/admin/publish      — Công bố: Nháp/Chờ → Đã duyệt, Nháp chưa có người → Ca trống; gửi mỗi người câu giải thích
 * GET    /schedule/open               — Ca trống tôi nhận được (cùng vị trí, ngày đó chưa có ca)
 * POST   /schedule/open/:id/claim     — Nhận ca trống (ai bấm trước được ca)
 */
import { Router } from "express";
import { randomUUID } from "crypto";
import type { Request } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { attachStaff, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { inStore, mustStoreId, storeWhere, toStore } from "../lib/storeScope.js";
import { getHrConfig, getShiftTemplates, shiftDefsOf, SHIFT_ROLES } from "../lib/hrConfig.js";
import { autoSchedule, type AutoMetrics, type AutoWish, type UnmetWish } from "../lib/autoSchedule.js";
import { announceOpenShifts, claimOpenShift, closeOpenShift, EXTRA_SHIFT_NAME, openShiftsFor, shiftStart } from "../lib/openShifts.js";
import { notify as notifyStaff, recallNotification } from "../lib/notify.js";
import { bizDayStart, bizToday } from "../lib/bizTime.js";
import { aiErrorMessage } from "../ai/gemini.js";
import { getAiSetting, isAiEnabled } from "../ai/settings.js";
import { expandRule, ruleFromRow, toAutoWish, wishCells } from "../lib/shiftWish/normalize.js";
import { wishContext } from "../lib/shiftWish/context.js";
import { aiExplain, templateExplain, type Explanations } from "../lib/shiftWish/explain.js";

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

  /** Nguyện vọng đã xác nhận của tháng (kèm gửi muộn nếu `includeLate`) → dạng thuật toán */
  async function loadWishes(month: string, staffIds: number[], includeLate: boolean) {
    const w = await wishContext(prisma, month);
    const rows = await prisma.shiftWish.findMany({
      where: { month, staffId: { in: staffIds }, status: "CONFIRMED", ...(includeLate ? {} : { late: false }) },
      include: { rules: true },
    });
    const map = new Map<number, AutoWish[]>();
    if (w) for (const x of rows) map.set(x.staffId, x.rules.map((r) => toAutoWish(r.id, ruleFromRow(r), w.ctx)));
    return map;
  }

  /** Người được gán có báo "không thể" đúng ô này không → câu cảnh báo (vẫn cho lưu) */
  async function wishWarning(staffId: number, date: string, code: string) {
    const month = date.slice(0, 7);
    const [wish, w] = await Promise.all([
      prisma.shiftWish.findUnique({ where: { staffId_month: { staffId, month } }, include: { rules: true } }),
      wishContext(prisma, month),
    ]);
    if (!wish || wish.status !== "CONFIRMED" || !w) return null;
    const hit = wish.rules.map(ruleFromRow).find((r) => {
      if (r.type !== "UNAVAILABLE") return false;
      const { dates, codes } = expandRule(r, w.ctx);
      return (!dates || dates.includes(date)) && codes.includes(code);
    });
    if (!hit) return null;
    const who = await prisma.staff.findUnique({ where: { id: staffId }, select: { fullName: true } });
    return `${who?.fullName ?? "Nhân viên"} đã báo không thể làm ca này${hit.quote ? `: «${hit.quote}»` : ""}.`;
  }

  /** Lời giải thích của lần chạy: đã lưu → dùng lại; chưa có → mẫu câu theo mã */
  async function explanationsOf(run: { id: number; metrics: unknown; unmetWishes: unknown; explanations: unknown; storeId: number }) {
    if (run.explanations) return run.explanations as Explanations;
    const m = run.metrics as AutoMetrics;
    const [staff, templates] = await Promise.all([
      prisma.staff.findMany({ where: { id: { in: m.perStaff.map((p) => p.staffId) } }, select: { id: true, fullName: true } }),
      getShiftTemplates(prisma),
    ]);
    return templateExplain(m, run.unmetWishes as UnmetWish[], staff, templates);
  }

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
      res.json({ ok: true, schedule: created, wishWarning: await wishWarning(staffId, date.slice(0, 10), tpl.code) });
    } catch (e: any) {
      if (e.code === "P2002") return res.status(400).json({ error: "Nhân viên đã được gán ca này trong ngày." });
      res.status(500).json({ error: "Lỗi máy chủ." });
    }
  });

  /* ── POST /schedule/admin/extra — Ca bổ sung: cần thêm người vài tiếng (giờ tự chọn, tính lương như làm thêm) ──
     Body: { date, start: "HH:MM", end: "HH:MM", reason, staffId? } — có staffId: giao thẳng; không có: đăng ca trống
     cho vị trí `role` để nhân viên rảnh bấm nhận (không trùng giờ ca chính vẫn nhận được). */
  r.post("/schedule/admin/extra", ...mgmtOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const b = req.body as { date?: string; start?: string; end?: string; reason?: string; staffId?: number | null; role?: string; count?: number };
    const toMin = (s?: string) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? "");
      return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
    };
    const startMin = toMin(b.start);
    const endMin = toMin(b.end);
    const reason = (b.reason ?? "").trim().slice(0, 300);
    if (!b.date || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return res.status(400).json({ error: "Chọn ngày." });
    if (startMin == null || endMin == null) return res.status(400).json({ error: "Giờ bắt đầu / kết thúc không hợp lệ." });
    if (endMin <= startMin) return res.status(400).json({ error: "Giờ kết thúc phải sau giờ bắt đầu (ca bổ sung không qua đêm)." });
    if (endMin - startMin < 30 || endMin - startMin > 8 * 60) return res.status(400).json({ error: "Ca bổ sung dài từ 30 phút đến 8 tiếng." });
    if (reason.length < 3) return res.status(400).json({ error: "Nhập lý do cần thêm người." });

    const storeId = mustStoreId(req);
    const workDate = dateOnly(b.date);
    const endAt = shiftStart({ workDate, startMin: endMin }).getTime();
    if (endAt <= Date.now()) return res.status(400).json({ error: "Ca bổ sung đã qua giờ kết thúc." });

    let staffId: number | null = null;
    let role: string;
    // Đăng ca trống: cần bao nhiêu người (mỗi người 1 chỗ, đủ thì ngưng nhận)
    const count = b.staffId != null ? 1 : Math.floor(Number(b.count ?? 1));
    if (!(count >= 1 && count <= 20)) return res.status(400).json({ error: "Số người cần từ 1 đến 20." });
    if (b.staffId != null) {
      const target = await prisma.staff.findUnique({ where: { id: Number(b.staffId) }, select: { id: true, storeId: true, role: true, status: true } });
      if (!target || target.storeId !== storeId || target.status !== "Active") return res.status(400).json({ error: "Nhân viên không thuộc chi nhánh này." });
      if (await overlapping(target.id, workDate, startMin, endMin)) return res.status(400).json({ error: "Nhân viên đã có ca trùng giờ trong khung này." });
      staffId = target.id;
      role = target.role;
    } else {
      if (!b.role || !(SHIFT_ROLES as readonly string[]).includes(b.role)) return res.status(400).json({ error: "Chọn vị trí cần người." });
      role = b.role;
    }

    try {
      const group = count > 1 ? randomUUID() : null;
      const rows = await prisma.$transaction(
        Array.from({ length: count }, () =>
          prisma.workSchedule.create({
            data: {
              storeId, staffId, workDate, shiftCode: "EXTRA", isExtra: true, extraGroup: group, role, startMin, endMin,
              status: staffId != null ? "APPROVED" : "OPEN_SHIFT", managerNote: reason, reviewedBy: me.id,
            },
            include: { staff: { select: { id: true, fullName: true, role: true } } },
          }),
        ),
      );
      const created = rows[0];
      notify(storeId, [staffId], "schedule:new", { staffId, date: b.date });
      const label = `${EXTRA_SHIFT_NAME} ${b.date.slice(8, 10)}/${b.date.slice(5, 7)} (${b.start}–${b.end})`;
      if (staffId != null) {
        void notifyStaff({
          type: "SHIFT_OPEN",
          title: `Bạn được xếp ${label}`,
          body: `${reason}. Giờ làm trong ca bổ sung được tính lương như làm thêm. Nhớ chấm công vào/ra như ca thường.`,
          link: "/app/hr/my-schedule",
          storeId,
          to: { staffIds: [staffId] },
        });
      } else {
        void announceOpenShifts(rows.map((r) => r.id), reason);
      }
      res.json({ ok: true, schedule: created, count: rows.length });
    } catch (e: any) {
      if (e.code === "P2002") return res.status(400).json({ error: "Nhân viên đã có một ca bổ sung trong ngày này." });
      res.status(500).json({ error: "Lỗi máy chủ." });
    }
  });

  /* ── DELETE /schedule/admin/extra-group/:group — Ngưng nhận thêm: xoá các chỗ còn trống của ca bổ sung nhiều người ── */
  r.delete("/schedule/admin/extra-group/:group", ...mgmtOnly, async (req, res) => {
    const group = String(req.params.group);
    const open = await prisma.workSchedule.findMany({ where: { extraGroup: group, status: "OPEN_SHIFT", staffId: null } });
    if (!open.length || !open.every((w) => inStore(req, w))) return res.status(404).json({ error: "Không còn chỗ trống nào." });
    // Xoá cả nhóm chỗ trống nên thu hồi thẳng lời mời (không chuyển sang chỗ khác như khi có người nhận)
    for (const w of open) if (w.openNotifId) await recallNotification(w.openNotifId).catch(() => {});
    await prisma.workSchedule.deleteMany({ where: { id: { in: open.map((w) => w.id) }, status: "OPEN_SHIFT", staffId: null } });
    notify(open[0].storeId, [], "schedule:deleted", { group });
    res.json({ ok: true, removed: open.length });
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

    // Xem theo tháng đã công bố: ca nào khớp nguyện vọng "muốn" + "đáp ứng a/b" và câu giải thích của lần xếp đã áp dụng
    let wishSummary: { preferMet: number; preferTotal: number; text: string | null } | null = null;
    let preferCells = new Set<string>();
    const month = typeof req.query.month === "string" ? req.query.month : null;
    if (month && me.storeId) {
      const [sm, wish, w] = await Promise.all([
        prisma.scheduleMonth.findUnique({ where: { storeId_month: { storeId: me.storeId, month } } }),
        prisma.shiftWish.findUnique({ where: { staffId_month: { staffId: me.id, month } }, include: { rules: true } }),
        wishContext(prisma, month),
      ]);
      if (wish?.status === "CONFIRMED" && w) preferCells = wishCells(wish.rules.map(ruleFromRow), w.ctx).prefer;
      const run = sm?.publishedAt && sm.appliedRunId ? await prisma.scheduleRun.findUnique({ where: { id: sm.appliedRunId } }) : null;
      const mine = run ? (run.metrics as AutoMetrics).perStaff.find((p) => p.staffId === me.id) : null;
      if (run && mine && wish?.status === "CONFIRMED") {
        const ex = await explanationsOf(run);
        wishSummary = { preferMet: mine.preferMet, preferTotal: mine.preferTotal, text: ex.perStaff[String(me.id)] ?? null };
      }
    }
    res.json({
      weekStart: from, weekEnd: to,
      schedules: schedules.map((s) => ({ ...s, wishMet: preferCells.has(`${ymd(s.workDate)}|${s.shiftCode}`) })),
      shiftDefs: shiftDefsOf(templates),
      wishSummary,
    });
  });

  /* ── GET /schedule/open — Ca trống tôi nhận được ── */
  r.get("/schedule/open", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    res.json({ shifts: await openShiftsFor(me.id) });
  });

  /* ── POST /schedule/open/:id/claim — Nhận ca trống ── */
  r.post("/schedule/open/:id/claim", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ." });
    const result = await claimOpenShift(me.id, id);
    if (!result.ok) return res.status(409).json({ error: result.error });
    res.json({ ok: true, schedule: result.schedule });
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

    // Ca bổ sung giữ nguyên giờ đã chọn (muốn đổi giờ thì xoá rồi tạo lại)
    if (existing.isExtra && shiftCode && shiftCode !== existing.shiftCode) return res.status(400).json({ error: "Ca bổ sung không đổi sang ca mẫu được — xoá rồi tạo lại." });
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
      // Quản lý tự xếp người cho ca trống → thu hồi lời mời; bỏ người khỏi ca → mời người khác nhận
      if (existing.status === "OPEN_SHIFT" && updated.status !== "OPEN_SHIFT") void closeOpenShift(id);
      else if (updated.status === "OPEN_SHIFT" && existing.staffId != null) void announceOpenShifts([id], "Ca vừa trống người");
      // Gán / đổi người hoặc đổi ca: cảnh báo nếu trái nguyện vọng "không thể" của người đó (vẫn lưu)
      const changed = updated.staffId != null && (updated.staffId !== existing.staffId || updated.shiftCode !== existing.shiftCode);
      res.json({ ...updated, wishWarning: changed ? await wishWarning(updated.staffId!, ymd(updated.workDate), updated.shiftCode) : null });
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

    if (existing.openNotifId) await closeOpenShift(id);
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

    // Công bố theo tháng: ghi dấu "đã công bố" (khóa sửa nguyện vọng xếp ca của tháng đó)
    const month = typeof req.body?.month === "string" && monthDays(req.body.month) ? (req.body.month as string) : null;
    if (month) {
      await prisma.scheduleMonth.upsert({
        where: { storeId_month: { storeId, month } },
        create: { storeId, month, publishedAt: new Date(), publishedById: me.id },
        update: { publishedAt: new Date(), publishedById: me.id },
      });
    }

    const affected = await prisma.workSchedule.findMany({
      where: { ...where, status: "APPROVED" }, select: { staffId: true }, distinct: ["staffId"],
    });
    notify(storeId, affected.map((a) => a.staffId), "schedule:published", { weekStart: from, weekEnd: to });
    // Công bố tháng có ca mới: báo từng người, kèm câu giải thích nguyện vọng của họ (lần tự xếp đang áp dụng)
    if (month && approved.count > 0) {
      void (async () => {
        const sm = await prisma.scheduleMonth.findUnique({ where: { storeId_month: { storeId, month } } });
        const run = sm?.appliedRunId ? await prisma.scheduleRun.findUnique({ where: { id: sm.appliedRunId } }) : null;
        const ex = run ? await explanationsOf(run) : null;
        const label = `${month.slice(5)}/${month.slice(0, 4)}`;
        for (const { staffId } of affected) {
          if (staffId == null) continue;
          await notifyStaff({
            type: "SCHEDULE_PUBLISHED",
            title: `Lịch tháng ${label} đã công bố`,
            body: ex?.perStaff[String(staffId)] ?? "Xem ca của bạn trong Lịch cá nhân.",
            link: "/app/hr/my-schedule",
            storeId,
            to: { staffIds: [staffId] },
            dedupeKey: `schedule-published:${storeId}:${month}:${staffId}`,
            dedupeMinutes: 10,
          });
        }
      })().catch((e) => console.error("[schedule] gửi thông báo công bố lỗi:", e));
    }
    // Ca trống trong 3 ngày tới: mời nhận ngay (ca xa hơn do tác vụ nền mời dần — lib/openShifts)
    const soon = new Date(Date.now() + 3 * 86_400_000);
    const openIds = await prisma.workSchedule.findMany({
      where: { ...where, status: "OPEN_SHIFT", staffId: null, openedAt: null, workDate: { gte: from, lte: soon < to ? soon : to } },
      select: { id: true },
    });
    void announceOpenShifts(openIds.map((w) => w.id));
    res.json({ ok: true, count: approved.count, openCount: open.count });
  });

  /** Dữ liệu đầu vào thuật toán của tháng: ca mẫu, nhân viên, ca đã có (± 6 ngày), nghỉ phép */
  async function autoInput(storeId: number, days: string[]) {
    const from = dateOnly(days[0]);
    const to = dateOnly(days[days.length - 1]);
    // Lấy thêm 6 ngày trước/sau để xét giờ nghỉ & số ca/tuần ở 2 đầu tháng
    const padFrom = new Date(from.getTime() - 6 * 86_400_000);
    const padTo = new Date(to.getTime() + 6 * 86_400_000);
    const [templates, config, staff] = await Promise.all([
      getShiftTemplates(prisma, true),
      getHrConfig(prisma),
      prisma.staff.findMany({
        where: { storeId, status: "Active", role: { in: [...SHIFT_ROLES] } },
        select: { id: true, role: true },
        orderBy: { id: "asc" }, // thứ tự cố định để cùng seed ra cùng kết quả
      }),
    ]);
    const staffIds = staff.map((s) => s.id);
    const [existingRows, leaves] = await Promise.all([
      prisma.workSchedule.findMany({
        where: { storeId, workDate: { gte: padFrom, lte: padTo }, status: { in: ["APPROVED", "PENDING", "OPEN_SHIFT", "DRAFT"] } },
        orderBy: { id: "asc" },
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
    const roleOf = new Map(staff.map((s) => [s.id, s.role]));
    return {
      templates, config, staff, staffIds, leaveMap, from, to,
      existing: existingRows.map((w) => ({
        staffId: w.staffId, date: ymd(w.workDate), code: w.shiftCode,
        role: w.role ?? (w.staffId ? roleOf.get(w.staffId) ?? null : null),
        startMin: w.startMin, endMin: w.endMin,
      })),
    };
  }

  /** Xoá bản nháp của tháng, giữ ca đã duyệt / đã chấm công */
  const clearDrafts = (storeId: number, from: Date, to: Date) =>
    prisma.workSchedule.deleteMany({ where: { storeId, workDate: { gte: from, lte: to }, status: "DRAFT", actualCheckIn: null } });

  type Assignment = { date: string; code: string; role: string; staffId: number | null; startMin: number; endMin: number; reason?: string };
  /** Ghi bản nháp từ phương án đã lưu (bỏ ngày đã qua, người đã có ca khác trong ngày, chỗ trống ở ô nay đã đủ người) */
  async function writeDrafts(storeId: number, from: Date, to: Date, list: Assignment[]) {
    await clearDrafts(storeId, from, to);
    const today = ymd(new Date());
    const kept = await prisma.workSchedule.findMany({ where: { storeId, workDate: { gte: from, lte: to }, status: { not: "REJECTED" } } });
    const busyDay = new Set(kept.filter((w) => w.staffId != null).map((w) => `${w.staffId}|${ymd(w.workDate)}`));
    // Ca có sau lần chạy (VD gán tay) chiếm chỗ của ô → bỏ bớt chỗ trống tương ứng
    const taken = new Map<string, number>();
    for (const w of kept) taken.set(`${ymd(w.workDate)}|${w.shiftCode}|${w.role}`, (taken.get(`${ymd(w.workDate)}|${w.shiftCode}|${w.role}`) ?? 0) + 1);
    const data = [];
    for (const a of list) {
      const k = `${a.date}|${a.code}|${a.role}`;
      if (a.date < today) continue;
      if (a.staffId != null && busyDay.has(`${a.staffId}|${a.date}`)) continue;
      if (a.staffId == null && (taken.get(k) ?? 0) > 0) {
        taken.set(k, taken.get(k)! - 1);
        continue;
      }
      if (a.staffId != null) busyDay.add(`${a.staffId}|${a.date}`);
      data.push({ storeId, staffId: a.staffId, workDate: dateOnly(a.date), shiftCode: a.code, role: a.role, startMin: a.startMin, endMin: a.endMin, status: "DRAFT" as const });
    }
    if (data.length) await prisma.workSchedule.createMany({ data });
    return data;
  }

  const setApplied = (storeId: number, month: string, runId: number) =>
    prisma.scheduleMonth.upsert({ where: { storeId_month: { storeId, month } }, create: { storeId, month, appliedRunId: runId }, update: { appliedRunId: runId } });

  /* ── POST /schedule/admin/auto — Tự xếp lịch tháng ──
     Body: { month, useWishes? (mặc định true), includeLate? (mặc định false), seed? (không có thì bốc ngẫu nhiên, trả lại trong kết quả) } */
  r.post("/schedule/admin/auto", ...mgmtOnly, async (req: Request, res) => {
    const me = (req as StaffRequest).staffRow!;
    const b = req.body as { month?: string; useWishes?: boolean; includeLate?: boolean; seed?: number };
    const month = b.month;
    const days = month ? monthDays(month) : null;
    if (!month || !days) return res.status(400).json({ error: "Thiếu tháng (YYYY-MM)." });
    const useWishes = b.useWishes !== false;
    const includeLate = b.includeLate === true;
    const seed = Number.isInteger(b.seed) && b.seed! > 0 && b.seed! < 2 ** 31 ? b.seed! : Math.floor(Math.random() * 1_000_000) + 1;

    const storeId = mustStoreId(req);
    try {
      // Xoá bản nháp cũ trước khi đọc "ca đã có" (nháp cũ không được giữ lại)
      await clearDrafts(storeId, dateOnly(days[0]), dateOnly(days[days.length - 1]));
      const inp = await autoInput(storeId, days);
      if (inp.templates.length === 0) return res.status(400).json({ error: "Chưa có ca làm nào đang dùng. Chủ chuỗi cần cấu hình ca trước." });

      // Không xếp lại những ngày đã qua
      const todayStr = ymd(new Date());
      const futureDays = days.filter((d) => d >= todayStr);
      const wishes = useWishes ? await loadWishes(month, inp.staffIds, includeLate) : undefined;
      const { slots, shortages, metrics, unmetWishes } = autoSchedule({
        days: futureDays,
        templates: inp.templates.map((t) => ({ code: t.code, startMin: t.startMin, endMin: t.endMin, staffing: t.staffing })),
        staff: inp.staff,
        existing: inp.existing,
        leaves: inp.leaveMap,
        rules: { minRestHours: inp.config.minRestHours, maxShiftsPerWeek: inp.config.maxShiftsPerWeek },
        wishes,
        options: { seed },
      });

      const run = await prisma.scheduleRun.create({
        data: {
          storeId, month, seed, useWishes, includeLate, createdById: me.id,
          metrics: metrics as object, unmetWishes: unmetWishes as object[], assignments: slots as object[],
        },
      });
      if (slots.length > 0) {
        await prisma.workSchedule.createMany({
          data: slots.map((s) => ({
            storeId, staffId: s.staffId, workDate: dateOnly(s.date), shiftCode: s.code, role: s.role,
            startMin: s.startMin, endMin: s.endMin, status: "DRAFT" as const,
          })),
        });
      }
      await setApplied(storeId, month, run.id);

      toStore(io, "admin_room", storeId).emit("schedule:updated", { month });
      res.json({
        ok: true,
        generatedCount: slots.filter((s) => s.staffId != null).length,
        openCount: slots.filter((s) => s.staffId == null).length,
        shortages,
        runId: run.id,
        seed,
        wishesUsed: wishes?.size ?? 0,
        metrics,
        unmetWishes,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Lỗi xếp lịch tự động." });
    }
  });

  /* ── GET /schedule/admin/runs?month= — Các lần chạy tự xếp gần nhất (so sánh chỉ số) ── */
  r.get("/schedule/admin/runs", ...mgmtOnly, async (req, res) => {
    const storeId = mustStoreId(req);
    const month = typeof req.query.month === "string" ? req.query.month : "";
    if (!monthDays(month)) return res.status(400).json({ error: "Thiếu tháng (YYYY-MM)." });
    const [runs, sm] = await Promise.all([
      prisma.scheduleRun.findMany({ where: { storeId, month }, orderBy: { id: "desc" }, take: 10 }),
      prisma.scheduleMonth.findUnique({ where: { storeId_month: { storeId, month } } }),
    ]);
    const applied = runs.find((x) => x.id === sm?.appliedRunId) ?? (sm?.appliedRunId ? await prisma.scheduleRun.findUnique({ where: { id: sm.appliedRunId } }) : null);
    res.json({
      published: !!sm?.publishedAt,
      appliedRunId: sm?.appliedRunId ?? null,
      runs: runs.map((x) => ({
        id: x.id, seed: x.seed, useWishes: x.useWishes, includeLate: x.includeLate, createdAt: x.createdAt,
        metrics: x.metrics, unmetCount: (x.unmetWishes as unknown[]).length, hasExplain: !!x.explanations,
      })),
      // Lần đang áp dụng: đủ chi tiết cho thẻ chỉ số, danh sách chưa đáp ứng, lý do từng ô
      applied: applied
        ? {
            id: applied.id, seed: applied.seed, useWishes: applied.useWishes, metrics: applied.metrics, unmetWishes: applied.unmetWishes, explanations: applied.explanations,
            reasons: (applied.assignments as Assignment[])
              .filter((a) => a.staffId != null && a.reason)
              .map((a) => ({ date: a.date, code: a.code, staffId: a.staffId, reason: a.reason })),
          }
        : null,
    });
  });

  /** Lần chạy thuộc chi nhánh của request */
  const runOf = async (req: Request) => {
    const id = Number(req.params.id);
    const run = Number.isInteger(id) ? await prisma.scheduleRun.findUnique({ where: { id } }) : null;
    return run && inStore(req, run) ? run : null;
  };

  /* ── POST /schedule/admin/runs/:id/apply — Dùng phương án của lần chạy này làm bản nháp ── */
  r.post("/schedule/admin/runs/:id/apply", ...mgmtOnly, async (req, res) => {
    const run = await runOf(req);
    if (!run) return res.status(404).json({ error: "Không tìm thấy lần chạy." });
    const sm = await prisma.scheduleMonth.findUnique({ where: { storeId_month: { storeId: run.storeId, month: run.month } } });
    if (sm?.publishedAt) return res.status(409).json({ error: "Lịch tháng này đã công bố — muốn đổi thì sửa từng ca." });
    const days = monthDays(run.month)!;
    const written = await writeDrafts(run.storeId, dateOnly(days[0]), dateOnly(days[days.length - 1]), run.assignments as Assignment[]);
    await setApplied(run.storeId, run.month, run.id);
    toStore(io, "admin_room", run.storeId).emit("schedule:updated", { month: run.month });
    res.json({ ok: true, generatedCount: written.filter((d) => d.staffId != null).length, openCount: written.filter((d) => d.staffId == null).length });
  });

  /* ── POST /schedule/admin/runs/:id/explain { staffId? } — Lời giải thích (AI nếu bật, không thì mẫu câu theo mã) ── */
  r.post("/schedule/admin/runs/:id/explain", ...mgmtOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const run = await runOf(req);
    if (!run) return res.status(404).json({ error: "Không tìm thấy lần chạy." });
    const staffId = Number((req.body as { staffId?: number }).staffId) || null;
    const pick = (ex: Explanations) => (staffId ? { ...ex, perStaff: { [String(staffId)]: ex.perStaff[String(staffId)] ?? "" } } : ex);
    if ((run.explanations as Explanations | null)?.source === "AI") return res.json({ explanations: pick(run.explanations as Explanations), note: null });

    const FEATURE = "SHIFT_EXPLAIN_AI";
    const m = run.metrics as AutoMetrics;
    const unmet = run.unmetWishes as UnmetWish[];
    const [staff, templates] = await Promise.all([
      prisma.staff.findMany({ where: { id: { in: m.perStaff.map((p) => p.staffId) } }, select: { id: true, fullName: true } }),
      getShiftTemplates(prisma),
    ]);
    let ex: Explanations = templateExplain(m, unmet, staff, templates);
    let note: string | null = null;
    if (await isAiEnabled(FEATURE)) {
      const setting = await getAiSetting(FEATURE);
      const today = setting.dailyLimit ? await prisma.aiCallLog.count({ where: { feature: FEATURE, createdAt: { gte: bizDayStart(bizToday()) } } }) : 0;
      if (setting.dailyLimit && today >= setting.dailyLimit) note = "Hôm nay AI đã hết lượt viết giải thích — dùng mẫu câu.";
      else {
        const t0 = Date.now();
        const log = (data: { status: "OK" | "ERROR"; model?: string; tokensIn?: number; tokensOut?: number; error?: string; summary?: string }) =>
          prisma.aiCallLog.create({ data: { feature: FEATURE, storeId: run.storeId, staffId: me.id, inputKind: "text", latencyMs: Date.now() - t0, ...data } }).catch(() => {});
        try {
          const out = await aiExplain(m, unmet, staff, templates, run.month);
          ex = out.explanations;
          if (out.rejected) note = `${out.rejected} câu AI viết sai số liệu đã được thay bằng mẫu câu.`;
          await log({ status: "OK", model: out.model, tokensIn: out.tokensIn, tokensOut: out.tokensOut, summary: `lần chạy ${run.id}; thay ${out.rejected} câu bằng mẫu` });
        } catch (e) {
          const reason = aiErrorMessage(e);
          note = `AI lỗi (${reason}) — dùng mẫu câu.`;
          await log({ status: "ERROR", error: reason.slice(0, 500) });
        }
      }
    }
    await prisma.scheduleRun.update({ where: { id: run.id }, data: { explanations: ex as object } });
    res.json({ explanations: pick(ex), note });
  });

  return r;
}
