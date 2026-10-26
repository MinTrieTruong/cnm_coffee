import { useState } from "react";
import { Link } from "react-router-dom";
import { AlarmClock, X } from "lucide-react";
import type { Reminder } from "../../lib/attendanceReminder";

const SNOOZE_KEY = "td.attendance.snooze";
const SNOOZE_MIN = 10;

const pad = (n: number) => String(n).padStart(2, "0");
const hm = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

function snoozedUntil(key: string): number {
  try {
    const raw = sessionStorage.getItem(SNOOZE_KEY);
    if (!raw) return 0;
    const [k, until] = raw.split("|");
    return k === key ? Number(until) || 0 : 0;
  } catch {
    return 0;
  }
}

/** Thẻ nổi nhắc chấm công (góc phải dưới; trên điện thoại nằm trên thanh đáy) */
export function AttendanceReminder({ reminder }: { reminder: Reminder | null }) {
  const [, setNow] = useState(0);
  if (!reminder) return null;
  const s = reminder.schedule;
  const key = `${s.id}:${reminder.kind}`;
  if (snoozedUntil(key) > Date.now()) return null;

  const shift = `${s.shiftName ?? `Ca ${s.shiftCode}`} · ${hm(s.startMin)}–${hm(s.endMin)}`;
  const late = reminder.minutes;
  const title =
    reminder.kind === "out"
      ? "Bạn chưa chấm công ra"
      : late > 0
        ? `Bạn chưa chấm công — trễ ${late} phút`
        : late === 0
          ? "Đã tới giờ vào ca"
          : `Sắp vào ca — còn ${-late} phút`;
  const hint = reminder.kind === "out" ? `${shift} đã kết thúc. Chấm công ra để tính đủ giờ làm.` : `${shift}. Chấm công để không bị tính đi muộn.`;

  const snooze = () => {
    try {
      sessionStorage.setItem(SNOOZE_KEY, `${key}|${Date.now() + SNOOZE_MIN * 60_000}`);
    } catch {
      /* bỏ qua */
    }
    setNow(Date.now());
  };

  const urgent = reminder.kind === "out" || late > 0;
  return (
    <aside className={urgent ? "o-att-remind is-urgent" : "o-att-remind"} role="status" aria-live="polite">
      <span className="o-att-remind-icon"><AlarmClock size={20} strokeWidth={1.75} aria-hidden /></span>
      <div className="o-att-remind-text">
        <strong>{title}</strong>
        <span>{hint}</span>
        <div className="o-att-remind-actions">
          <Link to="/app/hr/attendance" className="o-btn o-btn-primary">{reminder.kind === "out" ? "Chấm công ra" : "Chấm công ngay"}</Link>
          <button type="button" className="o-btn o-btn-secondary" onClick={snooze}>Nhắc lại sau {SNOOZE_MIN} phút</button>
        </div>
      </div>
      <button type="button" className="o-att-remind-close" onClick={snooze} aria-label={`Ẩn nhắc nhở ${SNOOZE_MIN} phút`}>
        <X size={16} aria-hidden />
      </button>
    </aside>
  );
}
