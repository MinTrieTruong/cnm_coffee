import { useState, useEffect } from "react";
import { staffApi } from "../lib/staffApi";

type CalendarSchedule = {
  id: number;
  workDate: string;
  actualCheckIn: string | null;
  actualCheckOut: string | null;
};

export function AttendanceCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules, setSchedules] = useState<CalendarSchedule[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadMonthData(currentDate.getFullYear(), currentDate.getMonth() + 1);
  }, [currentDate]);

  const loadMonthData = async (year: number, month: number) => {
    setLoading(true);
    try {
      const data = await staffApi<{ schedules: CalendarSchedule[] }>(`/api/attendance/my-month?year=${year}&month=${month}`);
      setSchedules(data.schedules);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Calendar logic
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0, Sunday = 6

  const days = [];
  // Empty slots for previous month
  for (let i = 0; i < firstDayIndex; i++) {
    days.push(null);
  }
  // Days of current month
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(d);
  }

  // Helper to find schedule for a specific day
  const getScheduleForDay = (day: number) => {
    // Dùng local time để format ra YYYY-MM-DD tránh lỗi lệch múi giờ (UTC) của toISOString()
    const targetDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return schedules.find(s => s.workDate.startsWith(targetDateStr));
  };

  return (
    <div style={{ background: "var(--surface2)", borderRadius: "10px", padding: "1.5rem", border: "1px solid var(--border)", marginTop: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--accent)" }}>Lịch Chấm Công</h3>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <button onClick={prevMonth} className="btn btn-ghost" style={{ padding: "0.4rem 0.8rem" }}>&lt;</button>
          <span style={{ fontWeight: 600 }}>Tháng {month + 1} / {year}</span>
          <button onClick={nextMonth} className="btn btn-ghost" style={{ padding: "0.4rem 0.8rem" }}>&gt;</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--muted)" }}>Đang tải dữ liệu lịch...</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "0.5rem" }}>
          {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map(day => (
            <div key={day} style={{ textAlign: "center", fontWeight: "bold", paddingBottom: "0.5rem", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>
              {day}
            </div>
          ))}

          {days.map((day, index) => {
            if (!day) return <div key={`empty-${index}`} style={{ minHeight: "60px" }}></div>;

            const schedule = getScheduleForDay(day);
            let dotColor = null;

            if (schedule) {
              if (schedule.actualCheckIn && schedule.actualCheckOut) {
                dotColor = "#22c55e"; // Green
              } else if (schedule.actualCheckIn || schedule.actualCheckOut) {
                dotColor = "#f97316"; // Orange
              }
            }

            const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();

            return (
              <div key={day} style={{ 
                minHeight: "75px", 
                background: "rgba(255, 255, 255, 0.95)",
                borderRadius: "8px", 
                padding: "0.3rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                border: isToday ? "2px solid var(--accent)" : "1px solid transparent",
                boxShadow: "0 2px 5px rgba(0,0,0,0.2)"
              }}>
                <span style={{ fontSize: "1.1rem", fontWeight: isToday ? "bold" : "600", color: "#333333", marginBottom: "0.15rem" }}>
                  {day}
                </span>
                
                {schedule && (schedule.actualCheckIn || schedule.actualCheckOut) ? (
                  <div style={{ marginTop: "auto", width: "100%", fontSize: "0.75rem", textAlign: "center", display: "flex", flexDirection: "column", gap: "2px" }}>
                    {schedule.actualCheckIn && (
                      <div style={{ background: "#dcfce3", color: "#166534", borderRadius: "4px", padding: "2px 0", fontWeight: "600" }}>
                        Vào: {new Date(schedule.actualCheckIn).toLocaleTimeString("vi-VN", {hour: '2-digit', minute: '2-digit'})}
                      </div>
                    )}
                    {schedule.actualCheckOut && (
                      <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: "4px", padding: "2px 0", fontWeight: "600" }}>
                        Ra: {new Date(schedule.actualCheckOut).toLocaleTimeString("vi-VN", {hour: '2-digit', minute: '2-digit'})}
                      </div>
                    )}
                  </div>
                ) : dotColor ? (
                  <div style={{ 
                    marginTop: "auto",
                    marginBottom: "0.25rem",
                    width: "10px", 
                    height: "10px", 
                    borderRadius: "50%", 
                    backgroundColor: dotColor,
                  }} title="Thiếu Check-in hoặc Check-out" />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      
      <div style={{ display: "flex", gap: "1.5rem", marginTop: "1.5rem", fontSize: "0.85rem", color: "var(--muted)", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#22c55e" }}></div>
          <span>Đủ Check-in & Check-out</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#f97316" }}></div>
          <span>Thiếu Check-in hoặc Check-out</span>
        </div>
      </div>
    </div>
  );
}
