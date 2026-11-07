/**
 * lib/analytics/attendance.ts — Đi muộn / về sớm / vắng theo nhân viên (tách từ GET /attendance/warnings).
 */
import type { PrismaClient } from "@prisma/client";
import { getHrConfig, getShiftTemplates } from "../hrConfig.js";
import { evaluateShift } from "../attendanceRules.js";
import { EXTRA_SHIFT_NAME } from "../openShifts.js";
import type { StoreFilter } from "./scope.js";

export type Incident = { scheduleId: number; date: string; shiftCode: string; shiftName: string; kind: "late" | "early" | "absent"; minutes: number };

/** `from` / `to`: ngày làm việc (UTC 00:00, như cột workDate), tính cả hai đầu */
export async function attendanceReport(db: PrismaClient, sw: StoreFilter, from: Date, to: Date, now = new Date()) {
  const [cfg, templates, staff, schedules] = await Promise.all([
    getHrConfig(db),
    getShiftTemplates(db),
    db.staff.findMany({
      where: { ...sw, status: "Active", role: { notIn: ["Owner"] } },
      select: { id: true, fullName: true, role: true, storeId: true, store: { select: { name: true } } },
      orderBy: { fullName: "asc" },
    }),
    db.workSchedule.findMany({
      where: { ...sw, workDate: { gte: from, lte: to }, status: "APPROVED", staffId: { not: null } },
      orderBy: [{ workDate: "asc" }, { startMin: "asc" }],
    }),
  ]);

  const names = new Map(templates.map((t) => [t.code, t.name]));
  const byStaff = new Map<number, Incident[]>();
  const shifts = new Map<number, number>();
  for (const w of schedules) {
    shifts.set(w.staffId!, (shifts.get(w.staffId!) ?? 0) + 1);
    const v = evaluateShift(w, cfg, now);
    const list = byStaff.get(w.staffId!) ?? byStaff.set(w.staffId!, []).get(w.staffId!)!;
    const base = { scheduleId: w.id, date: w.workDate.toISOString().slice(0, 10), shiftCode: w.shiftCode, shiftName: (w.isExtra ? EXTRA_SHIFT_NAME : names.get(w.shiftCode) ?? w.shiftCode) };
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
  return { cfg, rows };
}
