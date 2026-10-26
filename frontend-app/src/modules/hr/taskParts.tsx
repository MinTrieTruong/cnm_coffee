import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Clock, Flag, MapPin, Camera } from "lucide-react";
import { acquireSocket } from "../../lib/sharedSocket";
import { dayLabel, isOverdue, minToTime, shiftDay, todayYmd, type WorkTask } from "../../lib/tasks";

/** Chuyển ngày: ‹ Hôm nay › + ô chọn ngày */
export function DayNav({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  return (
    <div className="o-daynav" role="group" aria-label="Chọn ngày">
      <button type="button" className="o-btn o-btn-secondary o-btn-icon" onClick={() => onChange(shiftDay(value, -1))} aria-label="Ngày trước">
        <ChevronLeft size={16} aria-hidden />
      </button>
      <label className="o-daynav-pick">
        <span className="o-daynav-label">{dayLabel(value)}</span>
        <input type="date" className="o-input" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Ngày" />
      </label>
      <button type="button" className="o-btn o-btn-secondary o-btn-icon" onClick={() => onChange(shiftDay(value, 1))} aria-label="Ngày sau">
        <ChevronRight size={16} aria-hidden />
      </button>
      {value !== todayYmd() && (
        <button type="button" className="o-btn o-btn-link" onClick={() => onChange(todayYmd())}>Về hôm nay</button>
      )}
    </div>
  );
}

/** Khu vực · hạn · ưu tiên · cần ảnh */
export function TaskMeta({ task }: { task: WorkTask }) {
  const late = isOverdue(task);
  return (
    <div className="o-task-meta">
      {task.priority === "HIGH" && (
        <span className="o-task-chip is-high"><Flag size={12} aria-hidden /> Ưu tiên</span>
      )}
      {task.area && (
        <span className="o-task-chip"><MapPin size={12} aria-hidden /> {task.area}</span>
      )}
      <span className={late ? "o-task-chip is-late" : "o-task-chip"}>
        <Clock size={12} aria-hidden /> {task.dueMin != null ? `Hạn ${minToTime(task.dueMin)}` : "Trong ngày"}
        {late && " · quá hạn"}
      </span>
      {task.requirePhoto && (
        <span className="o-task-chip"><Camera size={12} aria-hidden /> Cần ảnh</span>
      )}
    </div>
  );
}

/** Tải lại khi có việc mới / thay đổi (socket) */
export function useTaskSocket(rooms: string[], onChange: () => void) {
  const key = rooms.join(",");
  // Luôn gọi bản onChange mới nhất (đang xem ngày nào thì tải ngày đó)
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    const shared = acquireSocket();
    for (const r of rooms) shared.join(r);
    const h = () => cb.current();
    const events = ["task:assigned", "task:update", "task:redo", "connect"];
    for (const ev of events) shared.socket.on(ev, h);
    return () => {
      for (const ev of events) shared.socket.off(ev, h);
      shared.release();
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

export const doneTime = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
