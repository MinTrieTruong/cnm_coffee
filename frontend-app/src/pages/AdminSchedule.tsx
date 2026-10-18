/**
 * AdminSchedule.tsx — Bảng lịch làm việc tổng hợp cho Quản lý (v2)
 * Layout: Hàng = Nhân viên, Cột = Thứ 2-CN, mỗi ô = danh sách ca
 */
import { Check, Pencil, Trash2 } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, isSameDay, parseISO } from "date-fns";
import { vi } from "date-fns/locale";
import { staffApi, getStaffInfo } from "../lib/staffApi";
import { apiOrigin } from "../lib/api";

const SHIFTS = [
  { code: "A", name: "Ca A", label: "07:00–12:00", hours: 5, color: "#3b82f6" }, // Xanh dương
  { code: "B", name: "Ca B", label: "12:30–17:30", hours: 5, color: "#8b5cf6" }, // Tím
  { code: "C", name: "Ca C", label: "18:00–00:00", hours: 6, color: "#ec4899" }, // Hồng
  { code: "SP1", name: "Ca SP1", label: "08:30–11:30", hours: 3, color: "#ea580c" }, // Cam đậm
  { code: "SP2", name: "Ca SP2", label: "19:00–22:00", hours: 3, color: "#0d9488" }, // Lục lam
];

type StaffMini = { id: number; fullName: string; role: string; phone?: string };
type WS = {
  id: number; workDate: string; shiftCode: string;
  status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "OPEN_SHIFT";
  staffNote: string | null; managerNote: string | null;
  staffId: number | null; staff?: StaffMini;
};
const SC: Record<WS["status"], string> = { DRAFT: "#94a3b8", PENDING: "#b45309", APPROVED: "#15803d", REJECTED: "#b91c1c", OPEN_SHIFT: "#dc2626" };
const SL: Record<WS["status"], string> = { DRAFT: "Nháp", PENDING: "Chờ", APPROVED: "Duyệt", REJECTED: "Từ chối", OPEN_SHIFT: "Thiếu người" };

function pad2(n: number) { return String(n).padStart(2, "0"); }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function weekKey(d: Date) { return toDateStr(startOfWeek(d, { weekStartsOn: 1 })); }

function ShiftTag({ ws, onApprove, onEdit, onDelete, readOnly }: {
  ws: WS; onApprove: () => void; onEdit: () => void; onDelete: () => void; readOnly?: boolean;
}) {
  const shift = SHIFTS.find((s) => s.code === ws.shiftCode);
  const color = SC[ws.status];

  // Dùng text thay cho icon (Ca A, B, C...) + Badge trạng thái
  return (
    <div style={{ borderRadius: 6, padding: "0.4rem 0.5rem", marginBottom: "0.4rem", background: "#fff", border: `1px solid #e5e7eb`, borderLeft: `3px solid ${shift?.color ?? color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.2rem" }}>
        <span style={{ fontWeight: 700, fontSize: "0.78rem", color: shift?.color ?? color }}>
          {shift?.name ?? ws.shiftCode}
        </span>
        <span style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem", borderRadius: 4, background: `${color}15`, color, fontWeight: 600 }}>
          {SL[ws.status]}
        </span>
      </div>
      <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginBottom: "0.35rem" }}>
        {shift?.label}
      </div>
      {!readOnly && (
        <div style={{ display: "flex", gap: "0.2rem", flexWrap: "wrap" }}>
          {ws.status === "PENDING" && (
            <AB color="#15803d" onClick={onApprove}>Duyệt</AB>
          )}
          <AB color="#1d4ed8" onClick={onEdit}>Sửa</AB>
          <AB color="#b91c1c" onClick={onDelete}>Xóa</AB>
        </div>
      )}
    </div>
  );
}

function AB({ children, color, onClick }: { children: React.ReactNode; color: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ padding: "0.15rem 0.4rem", fontSize: "0.65rem", fontWeight: 600, background: "transparent", border: `1px solid ${color}60`, borderRadius: 4, color, cursor: "pointer", transition: "all 0.15s" }}
      onMouseOver={(e) => { e.currentTarget.style.background = `${color}15`; }}
      onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; }}>
      {children}
    </button>
  );
}

function EditModal({ ws, staffList, onSave, onClose }: {
  ws: WS; staffList: StaffMini[];
  onSave: (id: number, data: object) => Promise<void>;
  onClose: () => void;
}) {
  const [shiftCode, setShiftCode] = useState(ws.shiftCode);
  const [staffId, setStaffId] = useState(ws.staffId);
  const [status, setStatus] = useState<WS["status"]>(ws.status);
  const [note, setNote] = useState(ws.managerNote ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  async function save() {
    setSaving(true); setErr(null);
    try { await onSave(ws.id, { shiftCode, staffId, status, managerNote: note || null }); onClose(); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : "Lỗi"); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 800, background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog">
      <div style={{ background: "#fff", border: "1px solid var(--panel-border)", borderRadius: 14, padding: "1.4rem", width: "100%", maxWidth: 420, boxShadow: "0 10px 30px var(--panel-border)" }}>
        <h3 style={{ margin: "0 0 1rem", fontSize: "0.98rem", fontWeight: 700, color: "var(--text)" }}>Chỉnh sửa ca — {ws.staff?.fullName ?? "Chưa phân công"}</h3>

        <label style={{ fontSize: "0.8rem", color: "#4b5563", display: "block", marginBottom: 4 }}>Nhân viên</label>
        <select className="input" value={staffId ?? ""} onChange={(e) => setStaffId(Number(e.target.value))} style={{ width: "100%", marginBottom: "0.75rem" }}>
          {staffList.map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.role})</option>)}
        </select>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem", marginBottom: "0.75rem" }}>
          <div>
            <label style={{ fontSize: "0.8rem", color: "#4b5563", display: "block", marginBottom: 4 }}>Ca làm</label>
            <select className="input" value={shiftCode} onChange={(e) => setShiftCode(e.target.value)} style={{ width: "100%" }}>
              {SHIFTS.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.label})</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: "0.8rem", color: "#4b5563", display: "block", marginBottom: 4 }}>Trạng thái</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as WS["status"])} style={{ width: "100%" }}>
              <option value="PENDING">Chờ duyệt</option>
              <option value="APPROVED">Đã duyệt</option>
              <option value="REJECTED">Từ chối</option>
            </select>
          </div>
        </div>

        <label style={{ fontSize: "0.8rem", color: "#4b5563", display: "block", marginBottom: 4 }}>Ghi chú quản lý</label>
        <textarea className="input" rows={2} placeholder="Lý do sửa / từ chối…" value={note}
          onChange={(e) => setNote(e.target.value)} style={{ width: "100%", resize: "vertical", marginBottom: "0.85rem" }} />

        {err && <p style={{ color: "#b91c1c", margin: "0 0 0.65rem", fontSize: "0.85rem" }}>{err}</p>}
        <div style={{ display: "flex", gap: "0.65rem", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Huỷ</button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminSchedule({ embedded = false }: { embedded?: boolean } = {}) {
  const info = getStaffInfo();
  const isMgmt = info?.role === "Admin";

  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [schedules, setSchedules] = useState<WS[]>([]);
  const [staffList, setStaffList] = useState<StaffMini[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editWs, setEditWs] = useState<WS | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"ALL" | WS["status"]>("ALL");
  const [filterStaff, setFilterStaff] = useState<number | "ALL">("ALL");
  const socketRef = useRef<Socket | null>(null);

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await staffApi<{ schedules: WS[]; staffList: StaffMini[] }>(
        `/api/schedule/admin/all?week=${weekKey(currentWeek)}`,
      );
      setSchedules(res.schedules); setStaffList(res.staffList); setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi tải"); }
    finally { setLoading(false); }
  }, [currentWeek]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  useEffect(() => {
    const socket: Socket = io(apiOrigin(), { transports: ["websocket", "polling"] });
    socket.emit("join", "admin_room");
    const refresh = () => void loadAll();
    ["schedule:new", "schedule:updated", "schedule:deleted", "schedule:published"].forEach((ev) => socket.on(ev, refresh));
    socketRef.current = socket;
    return () => { socket.disconnect(); };
  }, [loadAll]);

  async function quickApprove(id: number) {
    try { await staffApi(`/api/schedule/${id}`, { method: "PUT", body: JSON.stringify({ status: "APPROVED" }) }); showToast("Đã duyệt ca"); }
    catch (e) { setErr(e instanceof Error ? e.message : "Lỗi"); }
  }
  async function saveEdit(id: number, data: object) {
    await staffApi(`/api/schedule/${id}`, { method: "PUT", body: JSON.stringify(data) });
    showToast("Đã lưu");
  }
  async function deleteShift(id: number) {
    if (!confirm("Xoá ca này?")) return;
    try { await staffApi(`/api/schedule/${id}`, { method: "DELETE" }); showToast("Đã xoá"); }
    catch (e) { setErr(e instanceof Error ? e.message : "Lỗi"); }
  }
  async function publishWeek() {
    if (!confirm(`Chốt tất cả ca ĐANG CHỜ tuần ${format(weekStart, "dd/MM")}–${format(weekEnd, "dd/MM")}?`)) return;
    setPublishing(true);
    try {
      const res = await staffApi<{ count: number }>("/api/schedule/admin/publish", { method: "POST", body: JSON.stringify({ week: weekKey(currentWeek) }) });
      showToast(`Đã chốt ${res.count} ca`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi chốt lịch"); }
    finally { setPublishing(false); }
  }

  async function autoSchedule() {
    if (!confirm(`Tự động sắp lịch nháp cho tuần ${format(weekStart, "dd/MM")}–${format(weekEnd, "dd/MM")}?\n(Lưu ý: Các ca nháp hiện tại của tuần này sẽ bị xoá và ghi đè)`)) return;
    setLoading(true);
    try {
      const res = await staffApi<{ generatedCount: number }>("/api/schedule/admin/auto", { method: "POST", body: JSON.stringify({ week: weekKey(currentWeek) }) });
      showToast(`Đã tự động tạo ${res.generatedCount} ca nháp`);
      await loadAll();
    } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi xếp lịch"); }
    finally { setLoading(false); }
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  const filtered = schedules.filter((s) => {
    if (filterStatus !== "ALL" && s.status !== filterStatus) return false;
    if (filterStaff !== "ALL" && s.staffId !== filterStaff) return false;
    return true;
  });
  const pendingCount = schedules.filter((s) => s.status === "PENDING").length;

  // Tổng giờ mỗi nhân viên trong tuần
  function staffTotalHours(sid: number) {
    return filtered.filter((s) => s.staffId === sid).reduce((sum, s) => {
      const sh = SHIFTS.find((x) => x.code === s.shiftCode);
      return sum + (sh?.hours ?? 0);
    }, 0);
  }

  // Lấy tổng số lượng nhân sự theo ngày, role và buổi
  function getStaffCount(day: Date, roleGroup: string, timeOfDay: "Sáng" | "Chiều" | "Tối") {
    return schedules.filter(ws => {
      if (ws.status !== "APPROVED") return false;
      if (!isSameDay(parseISO(ws.workDate), day)) return false;
      if (ws.staff?.role !== roleGroup) return false;
      if (timeOfDay === "Sáng" && (ws.shiftCode === "A" || ws.shiftCode === "SP1")) return true;
      if (timeOfDay === "Chiều" && ws.shiftCode === "B") return true;
      if (timeOfDay === "Tối" && (ws.shiftCode === "C" || ws.shiftCode === "SP2")) return true;
      return false;
    }).length;
  }

  const TH: React.CSSProperties = { padding: "0.6rem 0.5rem", background: "#f3f4f6", borderBottom: "1px solid #e5e7eb", fontWeight: 700, fontSize: "0.8rem", color: "#111827" };
  const TD: React.CSSProperties = { padding: "0.4rem 0.45rem", borderBottom: "1px solid #f0f0f0", verticalAlign: "top", color: "#1f2937" };

  return (
    <div style={embedded ? { width: "100%" } : { background: "#f9fafb", minHeight: "100vh", width: "100%" }}>
    <div style={{ padding: embedded ? 0 : "1rem 0.75rem", maxWidth: 1200, margin: "0 auto", color: "#111827" }}>
      {toast && (
        <div style={{ position: "fixed", top: "1rem", right: "1rem", zIndex: 999, background: "#0f172a", border: "1px solid var(--border)", borderRadius: 10, padding: "0.65rem 1rem", fontSize: "0.88rem", fontWeight: 600, color: "#f8fafc", boxShadow: "var(--shadow-lg)" }}>
          {toast}
        </div>
      )}

      {editWs && (
        <EditModal ws={editWs} staffList={staffList} onSave={saveEdit}
          onClose={() => { setEditWs(null); void loadAll(); }} />
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap", color: "#111827" }}>
        {!embedded && isMgmt && <Link to="/admin?tab=schedule" className="btn btn-ghost" style={{ padding: "0.35rem 0.75rem", fontSize: "0.85rem", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff" }}>← Quản trị</Link>}
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, flex: 1, color: "#111827" }}>
          {isMgmt ? "Quản lý lịch làm việc" : "Bảng lịch tổng"}
          {pendingCount > 0 && (
            <span style={{ marginLeft: "0.65rem", fontSize: "0.7rem", fontWeight: 700, background: "#b45309", color: "#fff", borderRadius: 999, padding: "0.12rem 0.5rem" }}>
              {pendingCount} chờ duyệt
            </span>
          )}
        </h2>
        {isMgmt && (
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="btn" disabled={loading}
              onClick={() => void autoSchedule()} style={{ fontSize: "0.85rem", padding: "0.45rem 1rem", background: "#8b5cf6", color: "white" }}>
              Tự động xếp lịch
            </button>
            <button type="button" className="btn btn-primary" disabled={publishing || pendingCount === 0}
              onClick={() => void publishWeek()} style={{ fontSize: "0.85rem", padding: "0.45rem 1rem" }}>
              {publishing ? "Đang chốt…" : `Chốt lịch (${pendingCount})`}
            </button>
          </div>
        )}
      </div>

      {/* Nav tuần */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.9rem", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-ghost" style={{ padding: "0.35rem 0.75rem", color: "#374151", background: "#fff", border: "1px solid #d1d5db" }} onClick={() => setCurrentWeek((w) => subWeeks(w, 1))}>← Trước</button>
        <span style={{ fontWeight: 600, fontSize: "0.9rem", flex: 1, textAlign: "center", color: "#111827" }}>
          {format(weekStart, "dd/MM", { locale: vi })} – {format(weekEnd, "dd/MM/yyyy", { locale: vi })}
        </span>
        <button type="button" className="btn btn-ghost" style={{ padding: "0.35rem 0.75rem", color: "#374151", background: "#fff", border: "1px solid #d1d5db" }} onClick={() => setCurrentWeek((w) => addWeeks(w, 1))}>Sau →</button>
        <button type="button" className="btn btn-ghost" style={{ padding: "0.35rem 0.75rem", fontSize: "0.78rem", color: "#374151", background: "#fff", border: "1px solid #d1d5db" }} onClick={() => setCurrentWeek(new Date())}>Hôm nay</button>
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: "0.6rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <select style={{ minWidth: 140, fontSize: "0.83rem", padding: "0.4rem 0.75rem", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", color: "#111827" }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}>
          <option value="ALL">Tất cả</option>
          <option value="PENDING">Chờ duyệt</option>
          <option value="APPROVED">Đã duyệt</option>
          <option value="REJECTED">Từ chối</option>
        </select>
        <select style={{ minWidth: 160, fontSize: "0.83rem", padding: "0.4rem 0.75rem", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", color: "#111827" }} value={filterStaff}
          onChange={(e) => setFilterStaff(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}>
          <option value="ALL">Tất cả nhân viên</option>
          {staffList.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
        </select>
      </div>

      {err && <p style={{ color: "#b91c1c", marginBottom: "0.75rem", fontSize: "0.85rem" }}>{err}</p>}
      {loading && <p style={{ textAlign: "center", color: "#6b7280", padding: "2rem" }}>Đang tải…</p>}

      {/* Desktop table */}
      {!loading && (
        <div className="schedule-desktop-table" style={{ borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", overflow: "hidden" }}>
          <table data-no-cards style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr>
                <th style={{ ...TH, textAlign: "center", width: 40 }}>STT</th>
                <th style={{ ...TH, textAlign: "left", minWidth: 140 }}>Tên</th>
                <th style={{ ...TH, textAlign: "left", width: 100 }}>Chức vụ</th>
                <th style={{ ...TH, textAlign: "center", width: 110 }}>SĐT</th>
                {weekDays.map((day) => (
                  <th key={toDateStr(day)} style={{ ...TH, textAlign: "center", minWidth: 80, borderLeft: "1px solid var(--panel-border)" }}>
                    <div style={{ color: "#111827", fontSize: "0.85rem", fontWeight: 600 }}>{format(day, "EEE", { locale: vi })}</div>
                    <div style={{ fontWeight: 400, color: "#6b7280", fontSize: "0.75rem" }}>{format(day, "dd/MM")}</div>
                  </th>
                ))}
                <th style={{ ...TH, textAlign: "center", width: 70, borderLeft: "1px solid var(--panel-border)" }}>Tổng</th>
              </tr>
            </thead>
            <tbody>
              {["Admin", "Cashier", "Kitchen", "Waiter"].map((roleGroup) => {
                const groupStaff = staffList
                  .filter((s) => s.role === roleGroup)
                  .filter((s) => filterStaff === "ALL" || s.id === filterStaff);

                if (groupStaff.length === 0) return null;

                const roleNameVN = roleGroup === "Admin" ? "Quản lý"
                  : roleGroup === "Cashier" ? "Thu Ngân"
                    : roleGroup === "Kitchen" ? "Pha chế (Bar)"
                      : "Nhân viên Bàn";

                return (
                  <React.Fragment key={roleGroup}>
                    {/* Hàng phân cách nhóm chức vụ */}
                    <tr>
                      <td colSpan={12} style={{ background: "rgba(249,115,22,0.15)", borderBottom: "2px solid #ea580c", padding: "0.4rem 0.75rem", fontWeight: 700, color: "#c2410c", fontSize: "0.85rem" }}>
                        {roleNameVN}
                      </td>
                    </tr>
                    {/* Danh sách nhân viên trong nhóm */}
                    {groupStaff.map((s, index) => (
                      <tr key={s.id} style={{ borderBottom: "1px solid #f0f0f0", background: index % 2 === 0 ? "#f9fafb" : "#fff" }}>
                        <td style={{ ...TD, textAlign: "center", color: "#6b7280" }}>{index + 1}</td>
                        <td style={{ ...TD, fontWeight: 600, color: "#111827" }}>{s.fullName}</td>
                        <td style={{ ...TD, fontStyle: "italic", color: "#6b7280", fontSize: "0.8rem" }}>{roleNameVN}</td>
                        <td style={{ ...TD, textAlign: "center", color: "#6b7280", fontSize: "0.8rem" }}>{s.phone || "—"}</td>
                        {weekDays.map((day) => {
                          const dayWs = filtered.filter((ws) => ws.staffId === s.id && isSameDay(parseISO(ws.workDate), day));
                          return (
                            <td key={toDateStr(day)} style={{ ...TD, borderLeft: "1px solid var(--panel-border)", textAlign: "center", padding: "0.25rem" }}>
                              {dayWs.map((ws) => (
                                <ShiftTag key={ws.id} ws={ws}
                                  readOnly={!isMgmt}
                                  onApprove={() => void quickApprove(ws.id)}
                                  onEdit={() => setEditWs(ws)}
                                  onDelete={() => void deleteShift(ws.id)}
                                />
                              ))}
                              {dayWs.length === 0 && <span style={{ fontSize: "0.68rem", color: "#d1d5db" }}>—</span>}
                            </td>
                          );
                        })}
                        <td style={{ ...TD, borderLeft: "1px solid var(--panel-border)", textAlign: "center", fontWeight: 700, color: "var(--accent)", fontSize: "0.82rem" }}>
                          {staffTotalHours(s.id)}h
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
              
              {/* Ca trống chưa phân công */}
              {(() => {
                const openShifts = filtered.filter(ws => !ws.staffId);
                if (openShifts.length === 0) return null;
                return (
                  <React.Fragment>
                    <tr>
                      <td colSpan={12} style={{ background: "rgba(239, 68, 68, 0.15)", borderBottom: "2px solid #b91c1c", padding: "0.4rem 0.75rem", fontWeight: 700, color: "#b91c1c", fontSize: "0.85rem" }}>
                        Ca Thiếu Người (Cần Phân Công)
                      </td>
                    </tr>
                    <tr style={{ background: "#fef2f2" }}>
                      <td colSpan={4} style={{ ...TD, textAlign: "center", color: "#b91c1c", fontWeight: 600 }}>Chưa rõ nhân sự</td>
                      {weekDays.map((day) => {
                        const dayWs = openShifts.filter((ws) => isSameDay(parseISO(ws.workDate), day));
                        return (
                          <td key={toDateStr(day)} style={{ ...TD, borderLeft: "1px solid var(--panel-border)", textAlign: "center", padding: "0.25rem" }}>
                            {dayWs.map((ws) => (
                              <ShiftTag key={ws.id} ws={ws} readOnly={!isMgmt} onApprove={() => void quickApprove(ws.id)} onEdit={() => setEditWs(ws)} onDelete={() => void deleteShift(ws.id)} />
                            ))}
                          </td>
                        );
                      })}
                      <td style={{ ...TD, borderLeft: "1px solid var(--panel-border)" }}></td>
                    </tr>
                  </React.Fragment>
                );
              })()}

              {staffList.filter((s) => filterStaff === "ALL" || s.id === filterStaff).length === 0 && (
                <tr><td colSpan={12} style={{ textAlign: "center", color: "#6b7280", padding: "2rem" }}>Chưa có nhân viên nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile list */}
      {!loading && (
        <div className="schedule-mobile-list">
          {weekDays.map((day) => {
            const dayWs = filtered.filter((ws) => isSameDay(parseISO(ws.workDate), day));
            return (
              <div key={toDateStr(day)} style={{ marginBottom: "1rem" }}>
                <div style={{ fontWeight: 700, fontSize: "0.88rem", padding: "0.45rem 0.65rem", background: "#f3f4f6", borderRadius: "8px 8px 0 0", borderBottom: "1px solid #e5e7eb", color: "#111827" }}>
                  {format(day, "EEEE dd/MM", { locale: vi })}
                </div>
                {dayWs.length === 0
                  ? <div style={{ padding: "0.55rem 0.65rem", color: "#6b7280", fontSize: "0.8rem" }}>Không có ca</div>
                  : dayWs.map((ws) => {
                    const sh = SHIFTS.find((x) => x.code === ws.shiftCode);
                    return (
                      <div key={ws.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "0.55rem 0.65rem", borderBottom: "1px solid #e5e7eb", background: "#f9fafb", gap: "0.5rem", flexWrap: "wrap" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#111827" }}>{ws.staff?.fullName || "Cần phân công"}</div>
                          <div style={{ fontSize: "0.75rem", color: sh?.color }}>{sh?.name} · {sh?.label}</div>
                          <div style={{ fontSize: "0.72rem", color: SC[ws.status] }}>{SL[ws.status]}</div>
                          {ws.managerNote && <div style={{ fontSize: "0.7rem", color: "#fb923c" }}>{ws.managerNote}</div>}
                        </div>
                        <div style={{ display: "flex", gap: "0.3rem" }}>
                          {isMgmt && ws.status === "PENDING" && <AB color="#15803d" onClick={() => void quickApprove(ws.id)}><Check size={14} aria-label="Duyệt" /></AB>}
                          {isMgmt && <AB color="#1d4ed8" onClick={() => setEditWs(ws)}><Pencil size={14} aria-label="Sửa" /></AB>}
                          {isMgmt && <AB color="#b91c1c" onClick={() => void deleteShift(ws.id)}><Trash2 size={14} aria-label="Xóa" /></AB>}
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      )}

      {/* Thống kê nhân sự theo ca */}
      {!loading && (
        <div style={{ marginTop: "2rem", background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden", marginBottom: "2rem" }}>
          <div style={{ padding: "0.75rem 1rem", background: "#f3f4f6", borderBottom: "1px solid #e5e7eb", fontWeight: 700, color: "#111827" }}>
            Tổng nhân sự làm việc (Chỉ tính ca đã Duyệt)
          </div>
          <div style={{ overflowX: "auto" }}>
            <table data-no-cards style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", minWidth: 600 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: "left", width: 120 }}>Buổi</th>
                  <th style={{ ...TH, textAlign: "left", width: 140 }}>Chức vụ</th>
                  {weekDays.map(day => <th key={toDateStr(day)} style={{ ...TH, textAlign: "center" }}>{format(day, "EEE dd/MM", { locale: vi })}</th>)}
                </tr>
              </thead>
              <tbody>
                {(["Sáng", "Chiều", "Tối"] as const).map((timeOfDay) => {
                  const roles = ["Waiter", "Kitchen", "Cashier"];
                  return roles.map((roleGroup, rIndex) => {
                    const isFirstInTime = rIndex === 0;
                    const roleName = roleGroup === "Waiter" ? "Nhân viên Bàn" : roleGroup === "Kitchen" ? "Pha chế (Bar)" : "Thu Ngân";
                    return (
                      <tr key={`${timeOfDay}-${roleGroup}`} style={{ borderTop: isFirstInTime ? "2px solid #e5e7eb" : "1px solid #f0f0f0" }}>
                        {isFirstInTime && (
                          <td rowSpan={roles.length} style={{ ...TD, fontWeight: 700, verticalAlign: "middle", background: "#f9fafb", borderRight: "1px solid #e5e7eb" }}>
                            {timeOfDay}<br />
                            <span style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 400 }}>
                              {timeOfDay === "Sáng" ? "(Ca A, SP1)" : timeOfDay === "Chiều" ? "(Ca B)" : "(Ca C, SP2)"}
                            </span>
                          </td>
                        )}
                        <td style={{ ...TD, color: "#374151" }}>{roleName}</td>
                        {weekDays.map(day => {
                          const count = getStaffCount(day, roleGroup, timeOfDay);
                          return (
                            <td key={toDateStr(day)} style={{ ...TD, textAlign: "center", fontWeight: count > 0 ? 700 : 400, color: count > 0 ? "#15803d" : "#9ca3af" }}>
                              {count > 0 ? `${count} ng.` : "-"}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
