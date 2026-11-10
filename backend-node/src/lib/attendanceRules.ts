/**
 * lib/attendanceRules.ts — Đánh giá một ca đã chấm công: đi muộn / về sớm / vắng.
 * Tính lúc đọc (không lưu cứng) để khi Chủ chuỗi đổi số phút cho phép thì số liệu tự cập nhật.
 */
import type { HrConfig, WorkSchedule } from "@prisma/client";

export type ShiftVerdict = {
  /** Số phút vào trễ so với giờ bắt đầu ca */
  lateMin: number;
  /** Số phút ra sớm so với giờ kết thúc ca */
  earlyMin: number;
  /** Tính là đi muộn (quá số phút cho phép, chưa có đơn được duyệt) */
  late: boolean;
  early: boolean;
  /** Ca đã qua mà không check-in */
  absent: boolean;
};

const DAY_MS = 86_400_000;

/** Mốc thời gian (ms) của "phút thứ m" trong ngày làm việc, theo giờ địa phương của server */
function at(workDate: Date, m: number) {
  const d = new Date(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate());
  return d.getTime() + m * 60_000;
}

/** Giờ bắt đầu / kết thúc ca (ms), ca qua đêm thì kết thúc sang hôm sau */
export function shiftWindow(w: Pick<WorkSchedule, "workDate" | "startMin" | "endMin">) {
  const start = at(w.workDate, w.startMin);
  const end = w.endMin > w.startMin ? at(w.workDate, w.endMin) : at(w.workDate, w.endMin) + DAY_MS;
  return { start, end };
}

/** Số phút làm trong khung ca (vào sớm / ra muộn không tính) */
export function regularMinutes(w: Pick<WorkSchedule, "workDate" | "startMin" | "endMin" | "actualCheckIn" | "actualCheckOut">) {
  if (!w.actualCheckIn || !w.actualCheckOut) return 0;
  const { start, end } = shiftWindow(w);
  return Math.max(0, Math.floor((Math.min(w.actualCheckOut.getTime(), end) - Math.max(w.actualCheckIn.getTime(), start)) / 60_000));
}

/**
 * Số phút làm thêm được tính lương = min(số phút phiếu đã duyệt, số phút check-out sau giờ hết ca).
 * Ra về đúng giờ đã xin → tính đủ; về sớm hơn → tính theo thực tế; ở lại quá phiếu → chỉ tính theo phiếu.
 */
export function paidOvertimeMinutes(w: Pick<WorkSchedule, "workDate" | "startMin" | "endMin" | "actualCheckOut">, approvedMin: number) {
  if (!w.actualCheckOut || approvedMin <= 0) return 0;
  const { end } = shiftWindow(w);
  return Math.max(0, Math.min(approvedMin, Math.floor((w.actualCheckOut.getTime() - end) / 60_000)));
}

export function evaluateShift(
  w: Pick<WorkSchedule, "workDate" | "startMin" | "endMin" | "actualCheckIn" | "actualCheckOut" | "lateExcused" | "earlyExcused">,
  cfg: Pick<HrConfig, "lateGraceMin" | "earlyLeaveGraceMin">,
  now = new Date(),
): ShiftVerdict {
  const { start, end } = shiftWindow(w);
  const lateMin = w.actualCheckIn ? Math.max(0, Math.floor((w.actualCheckIn.getTime() - start) / 60_000)) : 0;
  const earlyMin = w.actualCheckOut ? Math.max(0, Math.floor((end - w.actualCheckOut.getTime()) / 60_000)) : 0;
  return {
    lateMin,
    earlyMin,
    late: lateMin > cfg.lateGraceMin && !w.lateExcused,
    early: earlyMin > cfg.earlyLeaveGraceMin && !w.earlyExcused,
    absent: !w.actualCheckIn && end < now.getTime(),
  };
}
