/**
 * WorkSchedule.tsx — Đăng ký lịch làm việc (v2)
 * Giao diện bảng Ca × Thứ với toggle ô, ghi chú popup, bulk save.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { format, startOfWeek, addWeeks, eachDayOfInterval, addDays, isSameDay, parseISO } from "date-fns";
import { vi } from "date-fns/locale";
import { staffApi, getStaffInfo } from "../lib/staffApi";
import { apiOrigin } from "../lib/api";

/* ─── Ca cố định ─────────────────────────────────────────────────── */
const SHIFTS = [
  { code: "A",   name: "Ca A",   label: "07:00 – 12:00", hours: 5,  color: "#3b82f6" },
  { code: "B",   name: "Ca B",   label: "12:30 – 17:30", hours: 5,  color: "#8b5cf6" },
  { code: "C",   name: "Ca C",   label: "18:00 – 00:00", hours: 6,  color: "#ec4899" },
  { code: "SP1", name: "Ca SP1", label: "08:30 – 11:30", hours: 3,  color: "#ea580c", badge: "Tăng cường" as string | undefined },
  { code: "SP2", name: "Ca SP2", label: "19:00 – 22:00", hours: 3,  color: "#0d9488", badge: "Tăng cường" as string | undefined },
] satisfies Array<{ code: string; name: string; label: string; hours: number; color: string; badge?: string }>;

type WS = {
  id: number;
  workDate: string;
  shiftCode: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  staffNote: string | null;
  managerNote: string | null;
};

/* ─── Helpers ────────────────────────────────────────────────────── */
function pad2(n: number) { return String(n).padStart(2, "0"); }
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function mondayOf(d: Date) {
  return startOfWeek(d, { weekStartsOn: 1 });
}
function nextMonday() {
  const today = new Date();
  return mondayOf(addWeeks(today, 1));
}

/** Thứ Bảy 23:59:59 của tuần hiện tại */
function thisWeekSat23(): Date {
  const mon = mondayOf(new Date());
  const sat = addDays(mon, 5);
  sat.setHours(23, 59, 59, 999);
  return sat;
}

function isEditable(weekMon: Date): boolean {
  const now = new Date();
  const thisMon = mondayOf(now).getTime();
  const nextMon = addWeeks(mondayOf(now), 1).getTime();
  const wt = weekMon.getTime();
  if (wt === thisMon) return now <= thisWeekSat23();
  if (wt === nextMon) return true;
  return false;
}

type CellKey = string; // "YYYY-MM-DD_ShiftCode"
function cellKey(dateStr: string, code: string): CellKey { return `${dateStr}_${code}`; }

/* ═══════════════════════════════════════════════════════════════════ */
export function WorkSchedule() {
  const info = getStaffInfo();

  // Mặc định là tuần tới
  const [weekMon, setWeekMon] = useState<Date>(nextMonday());
  const weekDays = eachDayOfInterval({ start: weekMon, end: addDays(weekMon, 6) });

  // Trạng thái từ DB
  const [saved, setSaved] = useState<WS[]>([]);
  const [loading, setLoading] = useState(false);

  // Selections hiện tại (key → note)
  const [selected, setSelected] = useState<Map<CellKey, string>>(new Map());

  // Note popup
  const [notePopup, setNotePopup] = useState<{ key: CellKey; x: number; y: number } | null>(null);
  const [noteValue, setNoteValue] = useState("");
  const popupRef = useRef<HTMLDivElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const editable = isEditable(weekMon);

  /* ── Load lịch ── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await staffApi<{ schedules: WS[] }>(
        `/api/schedule/my?week=${toDateStr(weekMon)}`,
      );
      setSaved(res.schedules);

      // Khởi tạo selection từ dữ liệu PENDING
      const initSel = new Map<CellKey, string>();
      res.schedules.filter((s) => s.status === "PENDING").forEach((s) => {
        initSel.set(cellKey(toDateStr(parseISO(s.workDate)), s.shiftCode), s.staffNote ?? "");
      });
      setSelected(initSel);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi tải lịch");
    } finally {
      setLoading(false);
    }
  }, [weekMon]);

  useEffect(() => { void load(); }, [load]);

  /* ── Real-time ── */
  useEffect(() => {
    const socket: Socket = io(apiOrigin(), { transports: ["websocket", "polling"] });
    if (info) socket.emit("join", `staff_${info.id}`);
    const refresh = () => void load();
    socket.on("schedule:updated", refresh);
    socket.on("schedule:published", refresh);
    return () => { socket.disconnect(); };
  }, [info, load]);

  /* ── Đóng popup khi click ngoài ── */
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setNotePopup(null);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* ── Toggle ô ── */
  function toggleCell(dateStr: string, code: string, e: React.MouseEvent) {
    if (!editable) return;
    const key = cellKey(dateStr, code);

    // Nếu ca APPROVED thì khoá
    const ws = saved.find((s) =>
      isSameDay(parseISO(s.workDate), new Date(dateStr)) && s.shiftCode === code,
    );
    if (ws?.status === "APPROVED") return;

    // Ràng buộc trùng ca:
    // A và SP1 không đi chung
    if (code === "SP1" && (selected.has(cellKey(dateStr, "A")) || saved.some((s) => s.workDate.startsWith(dateStr) && s.shiftCode === "A"))) {
      setErr("Không thể chọn Ca SP1 vì đã có Ca A trong ngày.");
      return;
    }
    if (code === "A" && (selected.has(cellKey(dateStr, "SP1")) || saved.some((s) => s.workDate.startsWith(dateStr) && s.shiftCode === "SP1"))) {
      setErr("Không thể chọn Ca A vì đã có Ca SP1 trong ngày.");
      return;
    }
    // C và SP2 không đi chung
    if (code === "SP2" && (selected.has(cellKey(dateStr, "C")) || saved.some((s) => s.workDate.startsWith(dateStr) && s.shiftCode === "C"))) {
      setErr("Không thể chọn Ca SP2 vì đã có Ca C trong ngày.");
      return;
    }
    if (code === "C" && (selected.has(cellKey(dateStr, "SP2")) || saved.some((s) => s.workDate.startsWith(dateStr) && s.shiftCode === "SP2"))) {
      setErr("Không thể chọn Ca C vì đã có Ca SP2 trong ngày.");
      return;
    }

    setErr(null);

    if (selected.has(key)) {
      // Bỏ chọn
      const next = new Map(selected);
      next.delete(key);
      setSelected(next);
      setNotePopup(null);
    } else {
      // Chọn và hiện popup ghi chú
      const next = new Map(selected);
      next.set(key, "");
      setSelected(next);
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setNotePopup({ key, x: rect.left, y: rect.bottom + window.scrollY + 6 });
      setNoteValue("");
    }
  }

  /* ── Lưu note ── */
  function saveNote() {
    if (!notePopup) return;
    const next = new Map(selected);
    next.set(notePopup.key, noteValue);
    setSelected(next);
    setNotePopup(null);
  }

  /* ── Bulk submit ── */
  async function submit() {
    setSubmitting(true); setErr(null);
    try {
      const registrations = Array.from(selected.entries()).map(([k, note]) => {
        const [date, shiftCode] = k.split("_");
        return { date, shiftCode, note: note || undefined };
      });
      await staffApi<{ ok: boolean; count: number }>("/api/schedule/bulk", {
        method: "POST",
        body: JSON.stringify({ week: toDateStr(weekMon), registrations }),
      });
      showToast(`✅ Đã gửi ${registrations.length} ca đăng ký!`);
      await load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Lỗi gửi đăng ký");
    } finally {
      setSubmitting(false);
    }
  }

  function showToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(null), 3000);
  }

  /* ── Tổng giờ theo ngày & toàn tuần ── */
  function hoursForDay(dateStr: string): number {
    let total = 0;
    SHIFTS.forEach((s) => {
      const key = cellKey(dateStr, s.code);
      const ws  = saved.find((w) => isSameDay(parseISO(w.workDate), new Date(dateStr)) && w.shiftCode === s.code);
      if (selected.has(key) || ws?.status === "APPROVED") total += s.hours;
    });
    return total;
  }
  const totalHours = weekDays.reduce((sum, d) => sum + hoursForDay(toDateStr(d)), 0);

  /* ── Cell status ── */
  function getCellStatus(dateStr: string, code: string): "approved" | "pending" | "selected" | "none" {
    const ws = saved.find((s) =>
      isSameDay(parseISO(s.workDate), new Date(dateStr)) && s.shiftCode === code,
    );
    if (ws?.status === "APPROVED") return "approved";
    if (ws?.status === "PENDING")  return "pending";
    if (selected.has(cellKey(dateStr, code))) return "selected";
    return "none";
  }

  /* ── Render ── */
  const pendingCount = Array.from(selected.keys()).filter((k) => {
    const [dateStr, code] = k.split("_");
    return getCellStatus(dateStr, code) !== "approved";
  }).length;

  return (
    <div style={{ padding: "1rem 0.75rem", maxWidth: 1000, margin: "0 auto", color: "#111827" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: "1rem", right: "1rem", zIndex: 999,
          background: "#1e293b", border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 10, padding: "0.65rem 1.1rem", fontSize: "0.88rem", fontWeight: 600,
          color: "#f8fafc", boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          animation: "slideUp 0.18s ease",
        }}>
          {toast}
        </div>
      )}

      {/* Note popup */}
      {notePopup && (
        <div
          ref={popupRef}
          style={{
            position: "absolute", top: notePopup.y, left: Math.min(notePopup.x, window.innerWidth - 280),
            zIndex: 500, background: "#fff", border: "1px solid rgba(0,0,0,0.15)",
            borderRadius: 10, padding: "0.75rem", width: 270,
            boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
          }}
        >
          <p style={{ margin: "0 0 0.45rem", fontSize: "0.8rem", color: "#4b5563", fontWeight: 600 }}>
            Ghi chú (tuỳ chọn)
          </p>
          <input
            autoFocus
            className="input"
            style={{ width: "100%", marginBottom: "0.5rem", fontSize: "0.85rem" }}
            placeholder="VD: Em bận học ca đầu..."
            value={noteValue}
            onChange={(e) => setNoteValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveNote(); if (e.key === "Escape") setNotePopup(null); }}
          />
          <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost" style={{ fontSize: "0.78rem", padding: "0.3rem 0.65rem" }}
              onClick={() => setNotePopup(null)}>Bỏ qua</button>
            <button type="button" className="btn btn-primary" style={{ fontSize: "0.78rem", padding: "0.3rem 0.65rem" }}
              onClick={saveNote}>Lưu</button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap", color: "#111827" }}>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, flex: 1 }}>
          📅 Đăng ký lịch làm việc — {info?.fullName}
        </h2>
        {editable && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting || pendingCount === 0}
            onClick={() => void submit()}
            style={{ fontSize: "0.85rem", padding: "0.5rem 1.1rem" }}
          >
            {submitting ? "Đang gửi…" : `📤 Gửi đăng ký tuần (${pendingCount} ca)`}
          </button>
        )}
      </div>

      {/* ── Chọn tuần ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.9rem", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-ghost" style={{ padding: "0.35rem 0.75rem", fontSize: "0.82rem" }}
          onClick={() => setWeekMon((w) => addWeeks(w, -1))}>← Tuần trước</button>
        <div style={{ fontWeight: 700, fontSize: "0.9rem", flex: 1, textAlign: "center", color: "#1f2937" }}>
          {format(weekMon, "'Tuần' II/yyyy", { locale: vi })}
          &nbsp;·&nbsp;
          {format(weekMon, "dd/MM")} – {format(addDays(weekMon, 6), "dd/MM/yyyy")}
          {!editable && (
            <span style={{ marginLeft: "0.5rem", fontSize: "0.72rem", color: "#f59e0b", fontWeight: 400 }}>
              🔒 Đã khoá
            </span>
          )}
        </div>
        <button type="button" className="btn btn-ghost" style={{ padding: "0.35rem 0.75rem", fontSize: "0.82rem" }}
          onClick={() => setWeekMon((w) => addWeeks(w, 1))}>Tuần sau →</button>
        <button type="button" className="btn btn-ghost" style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem" }}
          onClick={() => setWeekMon(nextMonday())}>Tuần tới</button>
      </div>

      {err && <p style={{ color: "#ef4444", marginBottom: "0.75rem", fontSize: "0.85rem" }}>{err}</p>}

      {/* ── Legend ── */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "0.85rem", flexWrap: "wrap", fontSize: "0.75rem" }}>
        {[
          { color: "#22c55e", label: "Đã duyệt (khoá)" },
          { color: "#f59e0b", label: "Đang chờ duyệt" },
          { color: "#3b82f6", label: "Đã chọn (chưa gửi)" },
        ].map((l) => (
          <span key={l.label} style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: "#4b5563" }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: l.color, display: "inline-block" }} />
            {l.label}
          </span>
        ))}
      </div>

      {/* ── Bảng lịch (cuộn ngang trên mobile) ── */}
      {loading ? (
        <p style={{ textAlign: "center", color: "var(--muted)", padding: "3rem" }}>Đang tải…</p>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
            <thead>
              <tr>
                {/* Ca header */}
                <th style={{ ...TH, width: 145, textAlign: "left", borderRight: "1px solid #e5e7eb", color: "#111827" }}>
                  Ca làm
                </th>
                {weekDays.map((day) => {
                  const isToday = toDateStr(day) === toDateStr(new Date());
                  return (
                    <th key={toDateStr(day)} style={{ ...TH, textAlign: "center", minWidth: 75 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.82rem", color: isToday ? "var(--accent)" : "inherit" }}>
                        {format(day, "EEE", { locale: vi })}
                      </div>
                      <div style={{ fontWeight: 400, fontSize: "0.72rem", color: "#6b7280" }}>
                        {format(day, "dd/MM")}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {SHIFTS.map((shift, si) => (
                <tr key={shift.code} style={{ borderTop: "1px solid #e5e7eb" }}>
                  {/* Ca info */}
                  <td style={{
                    padding: "0.75rem 0.75rem",
                    borderRight: "1px solid #e5e7eb",
                    verticalAlign: "middle",
                    background: si % 2 === 0 ? "#f9fafb" : "#fff",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: shift.color, flexShrink: 0,
                        boxShadow: `0 0 6px ${shift.color}88`,
                      }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#111827" }}>{shift.name}</div>
                        <div style={{ fontSize: "0.72rem", color: "#6b7280" }}>{shift.label}</div>
                        {shift.badge && (
                          <div style={{
                            fontSize: "0.62rem", fontWeight: 700, color: shift.color,
                            textTransform: "uppercase", letterSpacing: "0.04em",
                          }}>{shift.badge}</div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Các ô theo ngày */}
                  {weekDays.map((day) => {
                    const dateStr  = toDateStr(day);
                    const key      = cellKey(dateStr, shift.code);
                    const status   = getCellStatus(dateStr, shift.code);
                    const locked   = status === "approved" || !editable;
                    const note     = selected.get(key) ?? "";
                    const ws       = saved.find((s) =>
                      isSameDay(parseISO(s.workDate), day) && s.shiftCode === shift.code,
                    );

                    const bg = status === "approved" ? "rgba(34,197,94,0.18)"
                      : status === "pending"  ? "rgba(245,158,11,0.18)"
                      : status === "selected" ? `${shift.color}22`
                      : "transparent";
                    const border = status === "approved" ? "1.5px solid rgba(34,197,94,0.5)"
                      : status === "pending"  ? "1.5px solid rgba(245,158,11,0.4)"
                      : status === "selected" ? `1.5px solid ${shift.color}66`
                      : "1.5px solid rgba(0,0,0,0.1)";

                    return (
                      <td key={dateStr} style={{
                        padding: "0.45rem",
                        textAlign: "center",
                        verticalAlign: "middle",
                        background: si % 2 === 0 ? "#f9fafb" : "#fff",
                      }}>
                        <div
                          role="button"
                          tabIndex={locked ? -1 : 0}
                          aria-label={`${shift.name} ${format(day, "EEEE", { locale: vi })}`}
                          aria-pressed={status !== "none"}
                          onClick={(e) => toggleCell(dateStr, shift.code, e)}
                          onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") e.currentTarget.click(); }}
                          style={{
                            borderRadius: 6, padding: "0.5rem 0.25rem",
                            cursor: locked ? "default" : "pointer",
                            background: bg, border, transition: "all 0.15s",
                            position: "relative", userSelect: "none",
                            minHeight: 52, display: "flex", flexDirection: "column",
                            alignItems: "center", justifyContent: "center", gap: "0.3rem",
                          }}
                        >
                          <div style={{
                            width: 16, height: 16, borderRadius: 4,
                            border: `2px solid ${status === "none" ? "rgba(0,0,0,0.2)" : (status === "approved" ? "#22c55e" : (status === "pending" ? "#f59e0b" : shift.color))}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: status !== "none" ? (status === "approved" ? "#22c55e" : (status === "pending" ? "#f59e0b" : shift.color)) : "#fff",
                          }}>
                            {status !== "none" && <svg width="10" height="8" viewBox="0 0 10 8" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 4.5L3.5 7L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                          {(note || ws?.staffNote || ws?.managerNote) && (
                            <div style={{ fontSize: "0.65rem", color: ws?.managerNote ? "#ea580c" : "#6b7280", fontWeight: 600 }}>
                              Có ghi chú
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Tổng giờ theo ngày */}
              <tr style={{ borderTop: "2px solid #e5e7eb", background: "#f3f4f6" }}>
                <td style={{ padding: "0.55rem 0.75rem", fontSize: "0.8rem", fontWeight: 700, color: "var(--accent)", borderRight: "1px solid #e5e7eb" }}>
                  ⏱ Tổng / ngày
                </td>
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

      {/* ── Tổng giờ tuần ── */}
      <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
        <div style={{ fontSize: "0.88rem", color: "#4b5563" }}>
          Đã chọn: <strong style={{ color: "#111827" }}>{pendingCount} ca</strong>
        </div>
        <div style={{
          background: "rgba(var(--accent-rgb),0.1)", border: "1px solid rgba(var(--accent-rgb),0.25)",
          borderRadius: 10, padding: "0.55rem 1.1rem", fontWeight: 700, fontSize: "0.95rem",
          color: "var(--accent)",
        }}>
          ⏱ Tổng cộng: {totalHours} giờ / tuần
        </div>
      </div>

      {/* ── Ghi chú ca ── */}
      {editable && (
        <div style={{ marginTop: "1.1rem", padding: "0.8rem 1rem", borderRadius: 10, background: "#fffbeb", border: "1px solid #fde68a", fontSize: "0.8rem", color: "#78350f", lineHeight: 1.7 }}>
          💡 <strong>Hướng dẫn:</strong> Nhấn vào ô để chọn ca · Nhấn lại để bỏ chọn · Sau khi chọn xong toàn tuần, nhấn <strong>"Gửi đăng ký tuần"</strong>.<br/>
          Khung viền ô: <strong style={{ color: "#22c55e" }}>Xanh lá</strong> = đã duyệt (khoá) · <strong style={{ color: "#f59e0b" }}>Vàng</strong> = đang chờ · <strong>Màu theo ca</strong> = đã chọn (chưa gửi).
        </div>
      )}
    </div>
  );
}

const TH: React.CSSProperties = {
  padding: "0.65rem 0.5rem",
  background: "#f3f4f6",
  borderBottom: "1px solid #e5e7eb",
  fontWeight: 700,
  fontSize: "0.82rem",
  color: "#374151",
};
