import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { activeStoreId, getStaffInfo, isAdminRole, staffApi, staffSocket } from "../../lib/staffApi";
import { ROLE_LABEL } from "../../lib/roles";
import { Alert, Badge, Button, ControlPanel, Field, Modal, errMsg, type Tone } from "../../components/erp";

type ShiftDef = { code: string; name: string; label: string; startMin: number; endMin: number; hours: number; color: string; isActive: boolean };
type StaffMini = { id: number; fullName: string; role: string };
type Status = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "OPEN_SHIFT";
type WS = {
  id: number;
  workDate: string;
  shiftCode: string;
  startMin: number;
  endMin: number;
  status: Status;
  role: string | null;
  staffId: number | null;
  staff?: StaffMini | null;
  managerNote: string | null;
  actualCheckIn: string | null;
};
type Staffing = { code: string; rules: { role: string; weekdayCount: number; weekendCount: number }[] };
type Board = { days: string[]; schedules: WS[]; staffList: StaffMini[]; shiftDefs: ShiftDef[]; staffing: Staffing[]; roles: string[] };
type AutoResult = { generatedCount: number; openCount: number; shortages: { date: string; code: string; role: string; need: number; filled: number }[] };

const STATUS: Record<Status, { label: string; tone: Tone }> = {
  DRAFT: { label: "Nháp", tone: "neutral" },
  PENDING: { label: "Chờ duyệt", tone: "warning" },
  APPROVED: { label: "Đã công bố", tone: "success" },
  REJECTED: { label: "Từ chối", tone: "danger" },
  OPEN_SHIFT: { label: "Ca trống", tone: "danger" },
};
const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const pad2 = (n: number) => String(n).padStart(2, "0");
const monthKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const dayOf = (s: string) => s.slice(0, 10);
const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const isWeekend = (day: string) => [0, 6].includes(weekdayOf(day));
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
/** "Ca sáng" → "S" */
const short = (name: string) => (name.replace(/^ca\s+/i, "").trim()[0] ?? "?").toUpperCase();
const roleName = (r: string | null | undefined) => (r ? ROLE_LABEL[r] ?? r : "—");

/** Nhân sự › Lịch làm việc — bảng lịch cả tháng của chi nhánh */
export function Schedule() {
  const info = getStaffInfo();
  const mgmt = isAdminRole(info?.role);
  const needStore = info?.role === "Owner" && activeStoreId() == null;
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 1); // mặc định: tháng tới (tháng đang xếp)
  });
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cell, setCell] = useState<{ staff: StaffMini; day: string; ws: WS | null } | null>(null);
  const [cover, setCover] = useState<{ day: string; code: string } | null>(null);
  const [shortages, setShortages] = useState<AutoResult["shortages"] | null>(null);

  const key = monthKey(month);
  const load = useCallback(async () => {
    if (needStore) return;
    setLoading(true);
    try {
      setBoard(await staffApi<Board>(`/api/schedule/admin/all?month=${key}`));
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [key, needStore]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const socket = staffSocket();
    socket.emit("join", "admin_room");
    ["schedule:new", "schedule:updated", "schedule:deleted", "schedule:published"].forEach((ev) => socket.on(ev, () => void load()));
    return () => { socket.disconnect(); };
  }, [load]);

  const defs = useMemo(() => new Map((board?.shiftDefs ?? []).map((d) => [d.code, d])), [board]);
  const active = (board?.shiftDefs ?? []).filter((d) => d.isActive);
  const live = (board?.schedules ?? []).filter((s) => s.status !== "REJECTED");
  const byCell = useMemo(() => {
    const m = new Map<string, WS>();
    for (const s of live) if (s.staffId != null) m.set(`${s.staffId}|${dayOf(s.workDate)}`, s);
    return m;
  }, [live]);
  const counts = useMemo(() => {
    const c: Partial<Record<Status, number>> = {};
    for (const s of live) c[s.status] = (c[s.status] ?? 0) + 1;
    return c;
  }, [live]);

  // Nhóm nhân viên theo vị trí (thứ tự theo cấu hình định biên)
  const groups = useMemo(() => {
    const order = [...(board?.roles ?? []), ...new Set((board?.staffList ?? []).map((s) => s.role))];
    return [...new Set(order)]
      .map((role) => ({ role, staff: (board?.staffList ?? []).filter((s) => s.role === role) }))
      .filter((g) => g.staff.length > 0);
  }, [board]);

  const required = (day: string, code: string, role?: string) => {
    const rules = board?.staffing.find((s) => s.code === code)?.rules ?? [];
    return rules.filter((r) => !role || r.role === role).reduce((a, r) => a + (isWeekend(day) ? r.weekendCount : r.weekdayCount), 0);
  };
  const assigned = (day: string, code: string, role?: string) =>
    live.filter((s) => s.staffId != null && dayOf(s.workDate) === day && s.shiftCode === code && (!role || (s.role ?? s.staff?.role) === role));

  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setErr(null);
    try {
      const m = await fn();
      if (m) setNote(m);
      await load();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const autoFill = () => {
    if (!confirm(`Tự xếp lịch tháng ${month.getMonth() + 1}/${month.getFullYear()}?\nBản nháp cũ của tháng sẽ được xếp lại; ca đã công bố giữ nguyên.`)) return;
    void run(async () => {
      const r = await staffApi<AutoResult>("/api/schedule/admin/auto", { method: "POST", body: JSON.stringify({ month: key }) });
      setShortages(r.shortages);
      return `Đã xếp ${r.generatedCount} ca nháp${r.openCount ? `, còn ${r.openCount} chỗ chưa có người` : ""}. Kiểm tra rồi bấm "Công bố" để nhân viên thấy lịch.`;
    });
  };
  const publish = () => {
    if (!confirm(`Công bố lịch tháng ${month.getMonth() + 1}/${month.getFullYear()}? Nhân viên sẽ nhận được lịch và chấm công theo lịch này.`)) return;
    void run(async () => {
      const r = await staffApi<{ count: number; openCount: number }>("/api/schedule/admin/publish", { method: "POST", body: JSON.stringify({ month: key }) });
      setShortages(null);
      return `Đã công bố ${r.count} ca${r.openCount ? ` · ${r.openCount} ca trống cần người nhận` : ""}.`;
    });
  };

  const shiftMonth = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const today = todayStr();

  return (
    <div>
      <ControlPanel
        crumbs={[{ label: "Lịch làm việc" }]}
        actions={
          <span className="o-inline">
            <Button icon={ChevronLeft} onClick={() => shiftMonth(-1)} aria-label="Tháng trước" />
            <strong className="o-sched-month">Tháng {month.getMonth() + 1}/{month.getFullYear()}</strong>
            <Button icon={ChevronRight} onClick={() => shiftMonth(1)} aria-label="Tháng sau" />
            {mgmt && !needStore && (
              <>
                <Button icon={Sparkles} onClick={autoFill} disabled={busy}>Tự xếp lịch</Button>
                <Button variant="primary" icon={CalendarCheck} onClick={publish} disabled={busy || !(counts.DRAFT || counts.PENDING)}>Công bố</Button>
              </>
            )}
          </span>
        }
      />
      <div className="o-content o-stack">
        {needStore && <Alert tone="info">Chọn một chi nhánh ở thanh trên cùng để xem và xếp lịch.</Alert>}
        {err && <Alert>{err}</Alert>}
        {note && <Alert tone="info">{note}</Alert>}

        {board && (
          <>
            <div className="o-sched-legend">
              {active.map((d) => (
                <span key={d.code} className="o-inline">
                  <span className="o-sched-chip" style={{ background: d.color }}>{short(d.name)}</span>
                  {d.name} {d.label}
                </span>
              ))}
              <span className="o-sched-sep" />
              {(Object.keys(STATUS) as Status[]).filter((s) => counts[s]).map((s) => (
                <Badge key={s} tone={STATUS[s].tone}>{STATUS[s].label}: {counts[s]}</Badge>
              ))}
              {loading && <span className="o-muted">Đang tải…</span>}
            </div>

            {shortages && shortages.length > 0 && (
              <Alert tone="warning">
                Thiếu người ở {shortages.length} ô (ví dụ {shortages.slice(0, 3).map((s) => `${s.date.slice(8)}/${s.date.slice(5, 7)} ${defs.get(s.code)?.name ?? s.code} – ${roleName(s.role)} ${s.filled}/${s.need}`).join("; ")}). Thêm nhân viên hoặc giảm định biên ở "Cấu hình ca".
              </Alert>
            )}

            <div className="o-list-wrap o-sched-wrap">
              <table className="o-sched">
                <thead>
                  <tr>
                    <th className="o-sched-name">Nhân viên</th>
                    {board.days.map((d) => (
                      <th key={d} className={`${isWeekend(d) ? "we" : ""} ${d === today ? "today" : ""}`}>
                        <div>{Number(d.slice(8))}</div>
                        <div className="o-sched-wd">{WEEKDAY[weekdayOf(d)]}</div>
                      </th>
                    ))}
                    <th className="num">Ca</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => [
                    <tr key={`g-${g.role}`} className="o-sched-group"><td colSpan={board.days.length + 2}>{roleName(g.role)} ({g.staff.length})</td></tr>,
                    ...g.staff.map((st) => {
                      const total = live.filter((s) => s.staffId === st.id).length;
                      return (
                        <tr key={st.id}>
                          <td className="o-sched-name">{st.fullName}</td>
                          {board.days.map((d) => {
                            const ws = byCell.get(`${st.id}|${d}`) ?? null;
                            const def = ws ? defs.get(ws.shiftCode) : undefined;
                            return (
                              <td
                                key={d}
                                className={`o-sched-cell ${isWeekend(d) ? "we" : ""} ${mgmt ? "clickable" : ""}`}
                                onClick={mgmt ? () => setCell({ staff: st, day: d, ws }) : undefined}
                                title={ws ? `${def?.name ?? ws.shiftCode} · ${STATUS[ws.status].label}` : undefined}
                              >
                                {ws && (
                                  <span className={`o-sched-chip ${ws.status === "DRAFT" || ws.status === "PENDING" ? "draft" : ""}`} style={{ background: def?.color ?? "#6b7280", borderColor: def?.color }}>
                                    {short(def?.name ?? ws.shiftCode)}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="num">{total}</td>
                        </tr>
                      );
                    }),
                  ])}
                </tbody>
                <tfoot>
                  {active.map((def) => (
                    <tr key={def.code}>
                      <td className="o-sched-name">
                        <span className="o-sched-chip" style={{ background: def.color }}>{short(def.name)}</span> Đủ người?
                      </td>
                      {board.days.map((d) => {
                        const need = required(d, def.code);
                        const have = assigned(d, def.code).length;
                        const cls = need === 0 ? "" : have >= need ? "ok" : "short";
                        return (
                          <td key={d} className={`o-sched-cover ${cls} ${mgmt ? "clickable" : ""}`} onClick={mgmt ? () => setCover({ day: d, code: def.code }) : undefined} title={`${have}/${need} người`}>
                            {need > 0 ? `${have}/${need}` : ""}
                          </td>
                        );
                      })}
                      <td />
                    </tr>
                  ))}
                </tfoot>
              </table>
            </div>
            <p className="o-muted">
              Ô viền nét đứt là ca nháp, nhân viên chưa thấy. Hàng "Đủ người?" màu đỏ là ca còn thiếu người. Bấm vào để xếp người hoặc nhận ca trống.
            </p>
          </>
        )}
      </div>

      {cell && board && (
        <CellModal
          {...cell}
          defs={active}
          allDefs={defs}
          onClose={() => setCell(null)}
          onDone={(m) => { setCell(null); void run(async () => m); }}
        />
      )}
      {cover && board && (
        <CoverModal
          day={cover.day}
          def={defs.get(cover.code)!}
          board={board}
          live={live}
          required={required}
          assigned={assigned}
          onClose={() => setCover(null)}
          onDone={() => void load()}
        />
      )}
    </div>
  );
}

const fmtDay = (d: string) => `${WEEKDAY[weekdayOf(d)]} ${d.slice(8)}/${d.slice(5, 7)}`;

/** Bấm vào ô của 1 nhân viên / 1 ngày: gán, đổi hoặc bỏ ca */
function CellModal({ staff, day, ws, defs, allDefs, onClose, onDone }: {
  staff: StaffMini; day: string; ws: WS | null; defs: ShiftDef[]; allDefs: Map<string, ShiftDef>;
  onClose: () => void; onDone: (msg: string) => void;
}) {
  const [code, setCode] = useState(ws?.shiftCode ?? defs[0]?.code ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const locked = !!ws?.actualCheckIn;

  async function act(fn: () => Promise<unknown>, msg: string) {
    setSaving(true);
    setErr(null);
    try {
      await fn();
      onDone(msg);
    } catch (e) {
      setErr(errMsg(e));
      setSaving(false);
    }
  }
  const save = () =>
    ws
      ? act(() => staffApi(`/api/schedule/${ws.id}`, { method: "PUT", body: JSON.stringify({ shiftCode: code }) }), "Đã đổi ca.")
      : act(() => staffApi("/api/schedule/admin", { method: "POST", body: JSON.stringify({ staffId: staff.id, date: day, shiftCode: code }) }), "Đã xếp ca.");

  return (
    <Modal
      title={`${staff.fullName} · ${fmtDay(day)}`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          {ws && !locked && (
            <>
              <Button variant="danger" disabled={saving} onClick={() => act(() => staffApi(`/api/schedule/${ws.id}`, { method: "DELETE" }), "Đã bỏ ca.")}>Bỏ ca</Button>
              {ws.status !== "DRAFT" && (
                <Button disabled={saving} onClick={() => act(() => staffApi(`/api/schedule/${ws.id}`, { method: "PUT", body: JSON.stringify({ staffId: null }) }), "Đã chuyển thành ca trống.")}>
                  Thành ca trống
                </Button>
              )}
            </>
          )}
          <Button variant="primary" disabled={saving || locked || !code || code === ws?.shiftCode} onClick={() => void save()}>{ws ? "Đổi ca" : "Xếp ca"}</Button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      {ws && (
        <p>
          Đang xếp: <strong>{allDefs.get(ws.shiftCode)?.name ?? ws.shiftCode}</strong> <Badge tone={STATUS[ws.status].tone}>{STATUS[ws.status].label}</Badge>
          {locked && <span className="o-muted"> · đã chấm công, không sửa được</span>}
        </p>
      )}
      <Field label="Ca">
        <select className="o-input" value={code} onChange={(e) => setCode(e.target.value)} disabled={locked}>
          {defs.map((d) => <option key={d.code} value={d.code}>{d.name} ({d.label})</option>)}
        </select>
      </Field>
    </Modal>
  );
}

/** Bấm vào ô "Đủ người?": xem ai đang làm, xếp người vào chỗ còn thiếu */
function CoverModal({ day, def, board, live, required, assigned, onClose, onDone }: {
  day: string; def: ShiftDef; board: Board; live: WS[];
  required: (day: string, code: string, role?: string) => number;
  assigned: (day: string, code: string, role?: string) => WS[];
  onClose: () => void; onDone: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const rules = board.staffing.find((s) => s.code === def.code)?.rules ?? [];
  const busyToday = new Set(live.filter((s) => s.staffId != null && dayOf(s.workDate) === day).map((s) => s.staffId!));

  async function add(role: string, staffId: number) {
    const open = live.find((s) => s.staffId == null && dayOf(s.workDate) === day && s.shiftCode === def.code && s.role === role);
    setSaving(true);
    setErr(null);
    try {
      if (open) await staffApi(`/api/schedule/${open.id}`, { method: "PUT", body: JSON.stringify({ staffId }) });
      else await staffApi("/api/schedule/admin", { method: "POST", body: JSON.stringify({ staffId, date: day, shiftCode: def.code }) });
      onDone();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`${def.name} · ${fmtDay(day)}`} onClose={onClose}>
      {err && <Alert>{err}</Alert>}
      <table className="o-list">
        <thead>
          <tr><th>Vị trí</th><th className="num">Cần</th><th>Đang xếp</th><th>Thêm người</th></tr>
        </thead>
        <tbody>
          {rules.map((r) => {
            const need = required(day, def.code, r.role);
            const list = assigned(day, def.code, r.role);
            const free = board.staffList.filter((s) => s.role === r.role && !busyToday.has(s.id));
            return (
              <tr key={r.role}>
                <td>{roleName(r.role)}</td>
                <td className="num" style={{ color: list.length < need ? "var(--o-danger)" : undefined }}>{list.length}/{need}</td>
                <td>{list.map((s) => s.staff?.fullName).join(", ") || <span className="o-muted">—</span>}</td>
                <td>
                  {free.length ? (
                    <select className="o-input" value="" disabled={saving} onChange={(e) => e.target.value && void add(r.role, Number(e.target.value))}>
                      <option value="">Chọn…</option>
                      {free.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                    </select>
                  ) : (
                    <span className="o-muted">Hết người rảnh</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
}
