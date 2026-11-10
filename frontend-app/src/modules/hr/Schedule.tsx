import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck, CalendarPlus, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { activeStoreId, getStaffInfo, isAdminRole, staffApi, staffSocket } from "../../lib/staffApi";
import { ROLE_LABEL } from "../../lib/roles";
import { Alert, Badge, Button, ControlPanel, Field, Modal, errMsg, type Tone } from "../../components/erp";
import { ShiftWishPanel, type WishSummary } from "./ShiftWishPanel";
import { AutoDialog, AutoRunPanel, type RunsData } from "./AutoRunPanel";
import { REASON_TEXT, wishCells, type Explanations, type SlotReason } from "../../lib/shiftWish";

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
  /** Ca bổ sung: giờ tự chọn, tính lương như làm thêm */
  isExtra?: boolean;
  /** Ca bổ sung đăng cho nhiều người: các chỗ chung mã nhóm */
  extraGroup?: string | null;
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
const hm = (m: number) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
const EXTRA_COLOR = "#d97706";

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
  /** Form ca bổ sung (có thể điền sẵn người / ngày khi mở từ ô lịch) */
  const [extra, setExtra] = useState<{ staffId?: number; day?: string } | null>(null);
  const [shortages, setShortages] = useState<AutoResult["shortages"] | null>(null);
  /** Nguyện vọng của tháng (từ ShiftWishPanel) và các lần tự xếp */
  const [wishData, setWishData] = useState<WishSummary | null>(null);
  const [runs, setRuns] = useState<RunsData | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);
  const [lastAuto, setLastAuto] = useState<{ useWishes: boolean; includeLate: boolean }>({ useWishes: true, includeLate: false });

  const key = monthKey(month);
  const loadRuns = useCallback(async () => {
    if (needStore || !mgmt) return;
    try {
      setRuns(await staffApi<RunsData>(`/api/schedule/admin/runs?month=${key}`));
    } catch {
      setRuns(null);
    }
  }, [key, needStore, mgmt]);
  useEffect(() => {
    setRuns(null);
    void loadRuns();
  }, [loadRuns]);
  const onExplained = useCallback((ex: Explanations) => setRuns((r) => (r?.applied ? { ...r, applied: { ...r.applied, explanations: ex } } : r)), []);
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
  // Ô lịch: ca chính (theo mẫu) + các ca bổ sung của người đó trong ngày
  const byCell = useMemo(() => {
    const m = new Map<string, WS>();
    for (const s of live) if (s.staffId != null && !s.isExtra) m.set(`${s.staffId}|${dayOf(s.workDate)}`, s);
    return m;
  }, [live]);
  const extrasByCell = useMemo(() => {
    const m = new Map<string, WS[]>();
    for (const s of live) if (s.staffId != null && s.isExtra) {
      const k = `${s.staffId}|${dayOf(s.workDate)}`;
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return m;
  }, [live]);
  const extrasOfMonth = live.filter((s) => s.isExtra);
  // Chấm xanh: ca khớp nguyện vọng "muốn" (đã xác nhận) của người đó; tooltip: lý do thuật toán chọn
  const preferOf = useMemo(() => {
    const m = new Map<number, Set<string>>();
    for (const p of wishData?.staff ?? []) {
      if (p.status !== "CONFIRMED" && p.status !== "LATE") continue;
      m.set(p.id, wishCells(p.rules, wishData!.days, wishData!.shifts).prefer);
    }
    return m;
  }, [wishData]);
  const reasonOf = useMemo(() => new Map((runs?.applied?.reasons ?? []).map((r) => [`${r.staffId}|${r.date}|${r.code}`, r.reason as SlotReason])), [runs]);
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

  const autoFill = () => setAutoOpen(true);
  /** Chạy tự xếp (không truyền seed → máy chủ bốc seed mới = phương án khác) */
  const runAuto = (o: { useWishes: boolean; includeLate: boolean }) => {
    setLastAuto(o);
    void run(async () => {
      const r = await staffApi<AutoResult>("/api/schedule/admin/auto", { method: "POST", body: JSON.stringify({ month: key, ...o }) });
      setShortages(r.shortages);
      setAutoOpen(false);
      await loadRuns();
      return `Đã xếp ${r.generatedCount} ca nháp${r.openCount ? `, còn ${r.openCount} chỗ chưa có người` : ""}. Kiểm tra rồi bấm "Công bố" để nhân viên thấy lịch.`;
    });
  };
  const applyRun = (id: number) =>
    void run(async () => {
      const r = await staffApi<{ generatedCount: number; openCount: number }>(`/api/schedule/admin/runs/${id}/apply`, { method: "POST" });
      setShortages(null);
      await loadRuns();
      return `Đã dùng phương án lần #${id}: ${r.generatedCount} ca nháp${r.openCount ? `, ${r.openCount} chỗ chưa có người` : ""}.`;
    });
  const publish = () => {
    if (!confirm(`Công bố lịch tháng ${month.getMonth() + 1}/${month.getFullYear()}? Nhân viên sẽ nhận được lịch và chấm công theo lịch này.`)) return;
    void run(async () => {
      const r = await staffApi<{ count: number; openCount: number }>("/api/schedule/admin/publish", { method: "POST", body: JSON.stringify({ month: key }) });
      setShortages(null);
      await loadRuns();
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
                <Button icon={CalendarPlus} onClick={() => setExtra({})} disabled={busy}>Ca bổ sung</Button>
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
        {mgmt && !needStore && <ShiftWishPanel month={key} onData={setWishData} />}
        {mgmt && !needStore && runs?.applied && board && (
          <AutoRunPanel
            data={runs}
            staff={board.staffList}
            shiftName={(c) => defs.get(c)?.name ?? c}
            busy={busy}
            onRerun={() => runAuto(lastAuto)}
            onApply={applyRun}
            onExplained={onExplained}
          />
        )}

        {board && (
          <>
            <div className="o-sched-legend">
              {active.map((d) => (
                <span key={d.code} className="o-inline">
                  <span className="o-sched-chip" style={{ background: d.color }}>{short(d.name)}</span>
                  {d.name} {d.label}
                </span>
              ))}
              <span className="o-inline">
                <span className="o-sched-chip" style={{ background: EXTRA_COLOR }}>+</span>
                Ca bổ sung (tính như làm thêm)
              </span>
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
                            const extras = extrasByCell.get(`${st.id}|${d}`) ?? [];
                            const wish = !!ws && !!preferOf.get(st.id)?.has(`${d}|${ws.shiftCode}`);
                            const why = ws ? reasonOf.get(`${st.id}|${d}|${ws.shiftCode}`) : undefined;
                            return (
                              <td
                                key={d}
                                className={`o-sched-cell ${isWeekend(d) ? "we" : ""} ${mgmt ? "clickable" : ""}`}
                                onClick={mgmt ? () => setCell({ staff: st, day: d, ws }) : undefined}
                                title={[
                                  ws ? `${def?.name ?? ws.shiftCode} · ${STATUS[ws.status].label}` : "",
                                  wish ? "Đúng nguyện vọng của nhân viên" : why ? `Lý do xếp: ${REASON_TEXT[why]}` : "",
                                  ...extras.map((x) => `Ca bổ sung ${hm(x.startMin)}–${hm(x.endMin)}`),
                                ].filter(Boolean).join("\n") || undefined}
                              >
                                {wish && <span className="o-sched-wish" aria-label="Đúng nguyện vọng" />}
                                {ws && (
                                  <span className={`o-sched-chip ${ws.status === "DRAFT" || ws.status === "PENDING" ? "draft" : ""}`} style={{ background: def?.color ?? "#6b7280", borderColor: def?.color }}>
                                    {short(def?.name ?? ws.shiftCode)}
                                  </span>
                                )}
                                {extras.map((x) => (
                                  <span key={x.id} className="o-sched-chip o-sched-extra" style={{ background: EXTRA_COLOR, borderColor: EXTRA_COLOR }}>+</span>
                                ))}
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
              Ô viền nét đứt là ca nháp, nhân viên chưa thấy. Chấm xanh: ca đúng nguyện vọng của nhân viên. Hàng "Đủ người?" màu đỏ là ca còn thiếu người. Bấm vào để xếp người hoặc nhận ca trống.
            </p>

            {extrasOfMonth.length > 0 && (
              <ExtraList list={extrasOfMonth} mgmt={mgmt} onChanged={(m) => void run(async () => m)} onError={setErr} />
            )}
          </>
        )}
      </div>

      {autoOpen && (
        <AutoDialog
          monthLabel={`tháng ${month.getMonth() + 1}/${month.getFullYear()}`}
          wishCount={wishData ? {
            sent: wishData.staff.filter((s) => s.status === "CONFIRMED" || s.status === "LATE").length,
            late: wishData.staff.filter((s) => s.status === "LATE").length,
            total: wishData.staff.length,
          } : null}
          busy={busy}
          onClose={() => setAutoOpen(false)}
          onRun={runAuto}
        />
      )}
      {cell && board && (
        <CellModal
          {...cell}
          extras={extrasByCell.get(`${cell.staff.id}|${cell.day}`) ?? []}
          defs={active}
          allDefs={defs}
          onClose={() => setCell(null)}
          onDone={(m) => { setCell(null); void run(async () => m); }}
          onAddExtra={() => { setExtra({ staffId: cell.staff.id, day: cell.day }); setCell(null); }}
        />
      )}
      {extra && board && (
        <ExtraModal
          board={board}
          initial={extra}
          onClose={() => setExtra(null)}
          onDone={(m) => { setExtra(null); void run(async () => m); }}
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
function CellModal({ staff, day, ws, extras, defs, allDefs, onClose, onDone, onAddExtra }: {
  staff: StaffMini; day: string; ws: WS | null; extras: WS[]; defs: ShiftDef[]; allDefs: Map<string, ShiftDef>;
  onClose: () => void; onDone: (msg: string) => void; onAddExtra: () => void;
}) {
  const [code, setCode] = useState(ws?.shiftCode ?? defs[0]?.code ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const locked = !!ws?.actualCheckIn;

  async function act(fn: () => Promise<unknown>, msg: string) {
    setSaving(true);
    setErr(null);
    try {
      // Gán / đổi ca trái nguyện vọng "không thể" của người đó: vẫn lưu, báo ngay
      const r = (await fn()) as { wishWarning?: string | null } | undefined;
      onDone(r?.wishWarning ? `${msg} Lưu ý: ${r.wishWarning}` : msg);
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
      <div className="o-group-title" style={{ marginTop: 16 }}>Ca bổ sung</div>
      {extras.map((x) => (
        <div key={x.id} className="o-row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
          <span>
            <strong>{hm(x.startMin)}–{hm(x.endMin)}</strong> <span className="o-muted">{x.managerNote}</span>
          </span>
          {x.actualCheckIn ? (
            <Badge tone="info">Đã chấm công</Badge>
          ) : (
            <Button size="sm" variant="link" disabled={saving} onClick={() => act(() => staffApi(`/api/schedule/${x.id}`, { method: "DELETE" }), "Đã xoá ca bổ sung.")}>Xoá</Button>
          )}
        </div>
      ))}
      <Button size="sm" icon={CalendarPlus} onClick={onAddExtra}>Thêm ca bổ sung cho {staff.fullName}</Button>
    </Modal>
  );
}

/**
 * Ca bổ sung: cần thêm người vài tiếng (VD sáng đông khách cần phụ 10:00–13:00).
 * Giao thẳng cho 1 người (không trùng giờ ca chính) hoặc đăng ca trống cho cả vị trí — ai bấm nhận trước được ca.
 * Giờ làm trong ca bổ sung tính lương như làm thêm.
 */
function ExtraModal({ board, initial, onClose, onDone }: {
  board: Board; initial: { staffId?: number; day?: string }; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [mode, setMode] = useState<"assign" | "open">("assign");
  const [day, setDay] = useState(initial.day && initial.day >= todayStr() ? initial.day : todayStr());
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("13:00");
  const [staffId, setStaffId] = useState(initial.staffId ? String(initial.staffId) : "");
  const [role, setRole] = useState(board.roles[0] ?? "Waiter");
  const [count, setCount] = useState("1");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const len = toMin(end) - toMin(start);
  const staffByRole = useMemo(() => {
    const m = new Map<string, StaffMini[]>();
    for (const st of board.staffList) m.set(st.role, [...(m.get(st.role) ?? []), st]);
    return [...m.entries()];
  }, [board]);

  async function save() {
    setErr(null);
    if (len < 30 || len > 480) return setErr("Ca bổ sung dài từ 30 phút đến 8 tiếng, giờ kết thúc sau giờ bắt đầu.");
    if (mode === "assign" && !staffId) return setErr("Chọn nhân viên.");
    const n = Number(count);
    if (mode === "open" && !(Number.isInteger(n) && n >= 1 && n <= 20)) return setErr("Số người cần từ 1 đến 20.");
    if (reason.trim().length < 3) return setErr("Nhập lý do cần thêm người.");
    setSaving(true);
    try {
      await staffApi("/api/schedule/admin/extra", {
        method: "POST",
        body: JSON.stringify({ date: day, start, end, reason: reason.trim(), ...(mode === "assign" ? { staffId: Number(staffId) } : { role, count: n }) }),
      });
      onDone(mode === "assign" ? "Đã xếp ca bổ sung và báo cho nhân viên." : `Đã đăng ca bổ sung cần ${n} người — đang mời nhân viên rảnh nhận, đủ người thì tự ngưng.`);
    } catch (e) {
      setErr(errMsg(e));
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Ca bổ sung"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" disabled={saving} onClick={() => void save()}>{mode === "assign" ? "Xếp ca bổ sung" : `Đăng ${Number(count) > 1 ? `${count} chỗ` : "ca trống"}`}</Button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      <p className="o-muted" style={{ marginTop: 0 }}>Cần thêm người vài tiếng. Giờ làm trong ca bổ sung được tính lương như làm thêm; nhân viên chấm công vào/ra như ca thường.</p>
      <Field label="Ngày"><input className="o-input" type="date" min={todayStr()} value={day} onChange={(e) => setDay(e.target.value)} /></Field>
      <Field label="Giờ">
        <span className="o-inline" style={{ flexWrap: "nowrap" }}>
          <input className="o-input" type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} style={{ width: 96, minWidth: 0 }} />
          –
          <input className="o-input" type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} style={{ width: 96, minWidth: 0 }} />
          {len > 0 && <span className="o-muted">{Math.floor(len / 60)}h{len % 60 ? pad2(len % 60) : ""}</span>}
        </span>
      </Field>
      <Field label="Người làm">
        <select className="o-input" value={mode} onChange={(e) => setMode(e.target.value as "assign" | "open")}>
          <option value="assign">Giao cho một nhân viên</option>
          <option value="open">Đăng ca trống — ai rảnh nhận trước</option>
        </select>
      </Field>
      {mode === "assign" ? (
        <Field label="Nhân viên">
          <select className="o-input" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">Chọn…</option>
            {staffByRole.map(([r, list]) => (
              <optgroup key={r} label={roleName(r)}>
                {list.map((st) => <option key={st.id} value={st.id}>{st.fullName}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
      ) : (
        <>
          <Field label="Vị trí">
            <select className="o-input" value={role} onChange={(e) => setRole(e.target.value)}>
              {board.roles.map((r) => <option key={r} value={r}>{roleName(r)}</option>)}
            </select>
          </Field>
          <Field label="Cần bao nhiêu người">
            <span className="o-inline" style={{ flexWrap: "nowrap" }}>
              <input className="o-input" type="number" min={1} max={20} value={count} onChange={(e) => setCount(e.target.value)} style={{ width: 80 }} />
              <span className="o-muted">người — đủ người thì ngưng nhận</span>
            </span>
          </Field>
        </>
      )}
      <Field label="Lý do"><input className="o-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: sáng đông khách, cần phụ quầy" maxLength={300} /></Field>
    </Modal>
  );
}

/** Danh sách ca bổ sung trong tháng (cả ca trống chưa có người nhận) */
function ExtraList({ list, mgmt, onChanged, onError }: { list: WS[]; mgmt: boolean; onChanged: (msg: string) => void; onError: (e: string) => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  // Ca bổ sung nhiều người: gộp các chỗ chung nhóm thành 1 dòng (đã nhận / tổng)
  const rows = useMemo(() => {
    const out: { key: string; head: WS; slots: WS[] }[] = [];
    const byGroup = new Map<string, { key: string; head: WS; slots: WS[] }>();
    for (const x of [...list].sort((a, b) => a.workDate.localeCompare(b.workDate) || a.startMin - b.startMin || a.id - b.id)) {
      if (x.extraGroup && byGroup.has(x.extraGroup)) {
        byGroup.get(x.extraGroup)!.slots.push(x);
        continue;
      }
      const row = { key: x.extraGroup ?? String(x.id), head: x, slots: [x] };
      if (x.extraGroup) byGroup.set(x.extraGroup, row);
      out.push(row);
    }
    return out;
  }, [list]);
  async function remove(x: WS) {
    if (!confirm(`Xoá ca bổ sung ${fmtDay(dayOf(x.workDate))} ${hm(x.startMin)}–${hm(x.endMin)}?`)) return;
    setBusy(x.id);
    try {
      await staffApi(`/api/schedule/${x.id}`, { method: "DELETE" });
      onChanged("Đã xoá ca bổ sung.");
    } catch (e) {
      onError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }
  async function stopGroup(x: WS, open: number) {
    if (!confirm(`Ngưng nhận thêm người? ${open} chỗ còn trống sẽ bị xoá, những người đã nhận giữ nguyên.`)) return;
    setBusy(x.id);
    try {
      await staffApi(`/api/schedule/admin/extra-group/${x.extraGroup}`, { method: "DELETE" });
      onChanged("Đã ngưng nhận thêm người.");
    } catch (e) {
      onError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="o-card">
      <div className="o-card-head"><h3>Ca bổ sung trong tháng ({list.length})</h3></div>
      <div className="o-list-wrap" style={{ border: 0 }}>
        <table className="o-list">
          <thead>
            <tr><th>Ngày</th><th>Giờ</th><th>Người làm</th><th>Lý do</th><th>Trạng thái</th>{mgmt && <th />}</tr>
          </thead>
          <tbody>
            {rows.map(({ key, head: x, slots }) => {
              if (slots.length > 1 || x.extraGroup) {
                const taken = slots.filter((s) => s.staffId != null);
                const open = slots.length - taken.length;
                return (
                  <tr key={key}>
                    <td>{fmtDay(dayOf(x.workDate))}</td>
                    <td>{hm(x.startMin)}–{hm(x.endMin)}</td>
                    <td>
                      <strong>{taken.length}/{slots.length}</strong> {roleName(x.role)}
                      {taken.length > 0 && <span className="o-muted"> · {taken.map((s) => s.staff?.fullName).join(", ")}</span>}
                    </td>
                    <td className="o-muted">{x.managerNote ?? "—"}</td>
                    <td>{open > 0 ? <Badge tone="danger">Còn {open} chỗ</Badge> : <Badge tone="success">Đủ người</Badge>}</td>
                    {mgmt && <td>{open > 0 && <Button size="sm" variant="link" disabled={busy === x.id} onClick={() => void stopGroup(x, open)}>Ngưng nhận</Button>}</td>}
                  </tr>
                );
              }
              return (
                <tr key={key}>
                  <td>{fmtDay(dayOf(x.workDate))}</td>
                  <td>{hm(x.startMin)}–{hm(x.endMin)}</td>
                  <td>{x.staff?.fullName ?? <span className="o-muted">Chưa có người · {roleName(x.role)}</span>}</td>
                  <td className="o-muted">{x.managerNote ?? "—"}</td>
                  <td>
                    {x.actualCheckIn ? <Badge tone="info">Đã chấm công</Badge> : x.status === "OPEN_SHIFT" ? <Badge tone="danger">Chờ người nhận</Badge> : <Badge tone="success">Đã xếp</Badge>}
                  </td>
                  {mgmt && <td>{!x.actualCheckIn && <Button size="sm" variant="link" disabled={busy === x.id} onClick={() => void remove(x)}>Xoá</Button>}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
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
