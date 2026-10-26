import { useEffect, useState } from "react";
import { staffApi } from "./staffApi";

export type TodaySchedule = {
  id: number;
  shiftCode: string;
  shiftName?: string;
  startMin: number;
  endMin: number;
  actualCheckIn: string | null;
  actualCheckOut: string | null;
};

/** in: tới giờ ca mà chưa chấm công vào · out: hết ca mà chưa chấm công ra */
export type Reminder = { kind: "in" | "out"; schedule: TodaySchedule; minutes: number };

/** Nhắc trước giờ vào ca (phút) */
const EARLY_MIN = 10;
/** Thôi nhắc chấm ra sau khi hết ca quá lâu (phút) — quên thì làm giải trình */
const OUT_WINDOW_MIN = 240;

export function reminderOf(schedules: TodaySchedule[], now = new Date()): Reminder | null {
  const m = now.getHours() * 60 + now.getMinutes();
  // Quên chấm ra ưu tiên trước: ca cũ chưa đóng thì không vào ca mới được
  const out = schedules.find((s) => s.actualCheckIn && !s.actualCheckOut && m >= s.endMin && m < s.endMin + OUT_WINDOW_MIN);
  if (out) return { kind: "out", schedule: out, minutes: m - out.endMin };
  const due = schedules.find((s) => !s.actualCheckIn && m >= s.startMin - EARLY_MIN && m < s.endMin);
  if (due) return { kind: "in", schedule: due, minutes: m - due.startMin };
  return null;
}

/**
 * Ca hôm nay của tôi + lời nhắc chấm công (Chủ chuỗi không chấm công → không gọi API).
 * Tải lại mỗi phút; tính lại lời nhắc mỗi 30 giây theo giờ máy.
 */
export function useAttendanceToday(role: string | undefined) {
  const enabled = !!role && role !== "Owner";
  const [schedules, setSchedules] = useState<TodaySchedule[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [, tick] = useState(0);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () =>
      staffApi<{ schedules: TodaySchedule[] }>("/api/attendance/today")
        .then((r) => alive && setSchedules(r.schedules))
        .catch(() => {
          /* nhắc là phụ — lỗi thì giữ dữ liệu cũ */
        })
        .finally(() => alive && setLoading(false));
    void load();
    const poll = window.setInterval(load, 60_000);
    const clock = window.setInterval(() => tick((n) => n + 1), 30_000);
    // Quay lại tab (vd vừa chấm công trên trang khác) → tải lại ngay
    const onFocus = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      alive = false;
      window.clearInterval(poll);
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [enabled, version]);

  return { schedules, loading, reminder: enabled ? reminderOf(schedules) : null, reload: () => setVersion((v) => v + 1) };
}
