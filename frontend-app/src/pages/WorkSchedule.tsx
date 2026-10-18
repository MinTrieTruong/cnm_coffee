import { CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { format, startOfWeek, addWeeks, eachDayOfInterval, addDays, isSameDay, parseISO } from "date-fns";
import { vi } from "date-fns/locale";
import { staffApi, getStaffInfo } from "../lib/staffApi";
import { apiOrigin } from "../lib/api";

const SHIFTS = [
  { code: "A",   name: "Ca A",   label: "07:00 – 12:00", hours: 5,  color: "#3b82f6" },
  { code: "B",   name: "Ca B",   label: "12:30 – 17:30", hours: 5,  color: "#8b5cf6" },
  { code: "C",   name: "Ca C",   label: "18:00 – 00:00", hours: 6,  color: "#ec4899" },
  { code: "SP1", name: "Ca SP1", label: "08:30 – 11:30", hours: 3,  color: "#ea580c", badge: "Tăng cường" },
  { code: "SP2", name: "Ca SP2", label: "19:00 – 22:00", hours: 3,  color: "#0d9488", badge: "Tăng cường" },
];

type WS = {
  id: number;
  workDate: string;
  shiftCode: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  staffNote: string | null;
  managerNote: string | null;
};

function pad2(n: number) { return String(n).padStart(2, "0"); }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function mondayOf(d: Date) { return startOfWeek(d, { weekStartsOn: 1 }); }

export function WorkSchedule() {
  const info = getStaffInfo();
  const [weekMon, setWeekMon] = useState<Date>(mondayOf(new Date()));
  const weekDays = eachDayOfInterval({ start: weekMon, end: addDays(weekMon, 6) });
  const [saved, setSaved] = useState<WS[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await staffApi<{ schedules: WS[] }>(`/api/schedule/my?week=${toDateStr(weekMon)}`);
      // Lịch read-only chỉ hiện những ca APPROVED (do Manager xếp)
      setSaved(res.schedules.filter(s => s.status === "APPROVED"));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi tải lịch");
    } finally {
      setLoading(false);
    }
  }, [weekMon]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const socket: Socket = io(apiOrigin(), { transports: ["websocket", "polling"] });
    if (info) socket.emit("join", `staff_${info.id}`);
    const refresh = () => void load();
    socket.on("schedule:updated", refresh);
    socket.on("schedule:published", refresh);
    socket.on("schedule:new", refresh);
    return () => { socket.disconnect(); };
  }, [info, load]);

  function hoursForDay(dateStr: string): number {
    let total = 0;
    SHIFTS.forEach((s) => {
      const ws = saved.find((w) => isSameDay(parseISO(w.workDate), new Date(dateStr)) && w.shiftCode === s.code);
      if (ws) total += s.hours;
    });
    return total;
  }
  const totalHours = weekDays.reduce((sum, d) => sum + hoursForDay(toDateStr(d)), 0);

  return (
    <div style={{ padding: "1rem 0.75rem", maxWidth: 1000, margin: "0 auto", color: "#111827" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap", color: "#111827" }}>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, flex: 1 }}>
          Lịch làm việc của bạn — {info?.fullName}
        </h2>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.9rem", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-ghost" style={{ padding: "0.35rem 0.75rem", fontSize: "0.82rem" }} onClick={() => setWeekMon((w) => addWeeks(w, -1))}>← Tuần trước</button>
        <div style={{ fontWeight: 700, fontSize: "0.9rem", flex: 1, textAlign: "center", color: "#1f2937" }}>
          {format(weekMon, "'Tuần' II/yyyy", { locale: vi })} &nbsp;·&nbsp; {format(weekMon, "dd/MM")} – {format(addDays(weekMon, 6), "dd/MM/yyyy")}
        </div>
        <button type="button" className="btn btn-ghost" style={{ padding: "0.35rem 0.75rem", fontSize: "0.82rem" }} onClick={() => setWeekMon((w) => addWeeks(w, 1))}>Tuần sau →</button>
      </div>

      {err && <p style={{ color: "#b91c1c", marginBottom: "0.75rem", fontSize: "0.85rem" }}>{err}</p>}

      {loading ? (
        <p style={{ textAlign: "center", color: "var(--muted)", padding: "3rem" }}>Đang tải…</p>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <table data-no-cards style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 145, textAlign: "left", borderRight: "1px solid #e5e7eb" }}>Ca làm</th>
                {weekDays.map((day) => {
                  const isToday = toDateStr(day) === toDateStr(new Date());
                  return (
                    <th key={toDateStr(day)} style={{ ...TH, textAlign: "center", minWidth: 75 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.82rem", color: isToday ? "var(--accent)" : "inherit" }}>
                        {format(day, "EEE", { locale: vi })}
                      </div>
                      <div style={{ fontWeight: 400, fontSize: "0.72rem", color: "#6b7280" }}>{format(day, "dd/MM")}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {SHIFTS.map((shift, si) => (
                <tr key={shift.code} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "0.75rem 0.75rem", borderRight: "1px solid #e5e7eb", background: si % 2 === 0 ? "#f9fafb" : "#fff" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: shift.color }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>{shift.name}</div>
                        <div style={{ fontSize: "0.72rem", color: "#6b7280" }}>{shift.label}</div>
                      </div>
                    </div>
                  </td>
                  {weekDays.map((day) => {
                    const ws = saved.find((s) => isSameDay(parseISO(s.workDate), day) && s.shiftCode === shift.code);
                    const isAssigned = !!ws;
                    return (
                      <td key={toDateStr(day)} style={{ padding: "0.45rem", textAlign: "center", background: si % 2 === 0 ? "#f9fafb" : "#fff" }}>
                        <div style={{
                          borderRadius: 6, padding: "0.5rem 0.25rem",
                          background: isAssigned ? "rgba(34,197,94,0.18)" : "transparent",
                          border: isAssigned ? "1.5px solid rgba(34,197,94,0.5)" : "1.5px dashed rgba(0,0,0,0.05)",
                          minHeight: 52, display: "flex", flexDirection: "column",
                          alignItems: "center", justifyContent: "center", gap: "0.3rem",
                        }}>
                          {isAssigned ? (
                            <CheckCircle2 size={16} color="var(--o-success)" aria-label="Có ca" />
                          ) : (
                            <span style={{ color: "#d1d5db", fontSize: "0.75rem" }}>—</span>
                          )}
                          {ws?.managerNote && <div style={{ fontSize: "0.65rem", color: "#ea580c" }}>Có lời nhắn</div>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr style={{ borderTop: "2px solid #e5e7eb", background: "#f3f4f6" }}>
                <td style={{ padding: "0.55rem 0.75rem", fontSize: "0.8rem", fontWeight: 700, color: "var(--accent)", borderRight: "1px solid #e5e7eb" }}>Tổng / ngày</td>
                {weekDays.map((day) => {
                  const h = hoursForDay(toDateStr(day));
                  return (
                    <td key={toDateStr(day)} style={{ padding: "0.55rem", textAlign: "center", fontSize: "0.8rem", fontWeight: h > 0 ? 700 : 400, color: h > 0 ? "var(--accent)" : "#9ca3af" }}>
                      {h > 0 ? `${h}h` : "—"}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "1.5rem" }}>
        <div style={{ background: "rgba(var(--accent-rgb),0.1)", border: "1px solid rgba(var(--accent-rgb),0.25)", borderRadius: 10, padding: "0.55rem 1.1rem", fontWeight: 700, fontSize: "0.95rem", color: "var(--accent)" }}>
          Tổng cộng: {totalHours} giờ / tuần
        </div>
      </div>
    </div>
  );
}

const TH: React.CSSProperties = {
  padding: "0.65rem 0.5rem", background: "#f3f4f6", borderBottom: "1px solid #e5e7eb",
  fontWeight: 700, fontSize: "0.82rem", color: "#374151",
};
