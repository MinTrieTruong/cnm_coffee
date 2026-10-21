/**
 * lib/overtime.ts — Phiếu làm thêm giờ (WorkRequest type OVERTIME).
 * Số phút được tính lương luôn tính lại từ phiếu đã duyệt + giờ check-out,
 * rồi ghi vào WorkSchedule.overtimeMinutes để màn chấm công hiển thị.
 */
import type { PrismaClient } from "@prisma/client";
import { paidOvertimeMinutes } from "./attendanceRules.js";

/** Tổng phút làm thêm đã duyệt của từng ca */
export async function approvedOvertimeBySchedule(prisma: PrismaClient, scheduleIds: number[]) {
  const rows = await prisma.workRequest.groupBy({
    by: ["scheduleId"],
    where: { type: "OVERTIME", status: "APPROVED", scheduleId: { in: scheduleIds } },
    _sum: { minutes: true },
  });
  return new Map(rows.map((r) => [r.scheduleId!, r._sum.minutes ?? 0]));
}

/** Cập nhật lại trạng thái làm thêm của 1 ca; trả về { approved, paid } (phút) */
export async function syncOvertime(prisma: PrismaClient, scheduleId: number) {
  const w = await prisma.workSchedule.findUnique({ where: { id: scheduleId } });
  if (!w) return { approved: 0, paid: 0 };
  const approved = (await approvedOvertimeBySchedule(prisma, [scheduleId])).get(scheduleId) ?? 0;
  const paid = paidOvertimeMinutes(w, approved);
  await prisma.workSchedule.update({
    where: { id: scheduleId },
    data: { isOvertime: approved > 0, overtimeMinutes: w.actualCheckOut && approved > 0 ? paid : null },
  });
  return { approved, paid };
}
