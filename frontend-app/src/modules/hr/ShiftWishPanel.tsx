import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, ChevronDown, ChevronUp } from "lucide-react";
import { staffApi } from "../../lib/staffApi";
import { ROLE_LABEL } from "../../lib/roles";
import { Alert, Badge, Button, Modal, errMsg, type Tone } from "../../components/erp";
import { describeRule, dm, hhmm, isWeekendDay, WD_SHORT, weekdayOf, WISH_TYPE_UI, type WishRule, type WishShift, type WishType } from "../../lib/shiftWish";
import "../../styles/shiftWish.css";

type HeatCell = { date: string; code: string; role: string; need: number; available: number; unavailable: number[]; prefer: number[]; onLeave: number[] };
export type WishStaff = {
  id: number;
  fullName: string;
  role: string;
  status: "NONE" | "DRAFT" | "CONFIRMED" | "LATE";
  rawText: string | null;
  submittedAt: string | null;
  counts: Partial<Record<WishType, number>>;
  rules: WishRule[];
};
export type WishSummary = { month: string; deadline: string; pastDeadline: boolean; published: boolean; days: string[]; shifts: WishShift[]; staff: WishStaff[]; heat: HeatCell[] };

const STATUS_UI: Record<WishStaff["status"], { label: string; tone: Tone }> = {
  NONE: { label: "Chưa gửi", tone: "neutral" },
  DRAFT: { label: "Nháp", tone: "warning" },
  CONFIRMED: { label: "Đã gửi", tone: "success" },
  LATE: { label: "Gửi muộn", tone: "warning" },
};
const roleName = (r: string) => ROLE_LABEL[r] ?? r;

/** Màn xếp lịch (quản lý): nguyện vọng của tháng — số người đã gửi, nhắc, bản đồ nhiệt ngày × ca, câu gốc từng người */
export function ShiftWishPanel({ month, onData }: { month: string; onData?: (d: WishSummary | null) => void }) {
  const [data, setData] = useState<WishSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("");
  const [pick, setPick] = useState<{ date: string; code: string } | null>(null);
  const [person, setPerson] = useState<WishStaff | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await staffApi<WishSummary>(`/api/shift-wishes?month=${month}`);
      setData(d);
      onData?.(d);
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
      onData?.(null);
    }
  }, [month, onData]);
  useEffect(() => {
    setPick(null);
    setMsg(null);
    void load();
  }, [load]);

  const nameOf = useMemo(() => new Map((data?.staff ?? []).map((s) => [s.id, s.fullName])), [data]);
  const roles = useMemo(() => [...new Set((data?.heat ?? []).map((h) => h.role))], [data]);
  /** Gộp các vị trí (hoặc 1 vị trí đang lọc) theo ô ngày × ca */
  const grid = useMemo(() => {
    // short / tight: có vị trí nào thiếu / vừa đủ người (gộp nhiều vị trí thì không được để tổng che mất)
    const m = new Map<string, { need: number; available: number; prefer: number; short: boolean; tight: boolean }>();
    for (const h of data?.heat ?? []) {
      if (role && h.role !== role) continue;
      const k = `${h.date}|${h.code}`;
      const c = m.get(k) ?? { need: 0, available: 0, prefer: 0, short: false, tight: false };
      c.need += h.need;
      c.available += h.available;
      c.prefer += h.prefer.length;
      c.short ||= h.need > 0 && h.available < h.need;
      c.tight ||= h.need > 0 && h.available === h.need;
      m.set(k, c);
    }
    return m;
  }, [data, role]);

  if (err) return <Alert>{err}</Alert>;
  if (!data) return null;
  const sent = data.staff.filter((s) => s.status === "CONFIRMED" || s.status === "LATE").length;
  const missing = data.staff.length - sent;
  const shortCells = [...grid.values()].filter((c) => c.short).length;
  const RANK = { CONFIRMED: 0, LATE: 0, DRAFT: 1, NONE: 2 } as const;
  const people = [...data.staff].sort((a, b) => RANK[a.status] - RANK[b.status]);

  async function remind() {
    setSending(true);
    setMsg(null);
    try {
      const r = await staffApi<{ missing: number; sent: number }>("/api/shift-wishes/remind", { method: "POST", body: JSON.stringify({ month }) });
      setMsg(r.sent ? `Đã nhắc ${r.sent} nhân viên chưa gửi.` : r.missing ? "Vừa nhắc rồi — đợi vài phút rồi nhắc lại." : "Mọi người đã gửi nguyện vọng.");
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setSending(false);
    }
  }

  const picked = pick ? data.heat.filter((h) => h.date === pick.date && h.code === pick.code && (!role || h.role === role)) : [];
  const names = (ids: number[]) => (ids.length ? ids.map((id) => nameOf.get(id) ?? `#${id}`).join(", ") : "—");

  return (
    <section className="o-card o-stack">
      <div className="o-sw-mgr-head">
        <div>
          <h3 style={{ margin: 0 }}>Nguyện vọng tháng {month.slice(5)}/{month.slice(0, 4)}</h3>
          <span className="o-muted">
            {sent}/{data.staff.length} nhân viên đã gửi · hạn {dm(data.deadline)}{data.pastDeadline ? " (đã qua)" : ""}
            {shortCells > 0 && sent > 0 ? ` · ${shortCells} ô có thể thiếu người` : ""}
          </span>
        </div>
        <span className="o-inline">
          {!data.published && missing > 0 && <Button size="sm" icon={Bell} disabled={sending} onClick={() => void remind()}>Nhắc người chưa gửi</Button>}
          <Button size="sm" variant="link" icon={open ? ChevronUp : ChevronDown} onClick={() => setOpen((x) => !x)}>{open ? "Thu gọn" : "Xem chi tiết"}</Button>
        </span>
      </div>
      {msg && <Alert tone="info">{msg}</Alert>}

      {open && (
        <>
          <div className="o-sw-mgr-filters">
            <select className="o-input" value={role} onChange={(e) => { setRole(e.target.value); setPick(null); }} aria-label="Vị trí">
              <option value="">Mọi vị trí</option>
              {roles.map((r) => <option key={r} value={r}>{roleName(r)}</option>)}
            </select>
            <span className="o-muted" style={{ alignSelf: "center" }}>Mỗi ô: số người có thể làm / định biên, ♥ số người muốn. Đỏ = có vị trí có thể thiếu người, vàng = vừa đủ.</span>
          </div>
          <div className="o-sw-heat-wrap">
            <table className="o-sw-heat">
              <thead>
                <tr>
                  <th />
                  {data.days.map((d) => (
                    <th key={d} className={isWeekendDay(d) ? "is-weekend" : undefined}>{Number(d.slice(8))}<br />{WD_SHORT[weekdayOf(d)]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.shifts.map((s) => (
                  <tr key={s.code}>
                    <th title={`${hhmm(s.startMin)}–${hhmm(s.endMin)}`}>{s.name}</th>
                    {data.days.map((d) => {
                      const c = grid.get(`${d}|${s.code}`);
                      if (!c) return <td key={d} />;
                      const cls = c.short ? " is-short" : c.tight ? " is-tight" : "";
                      const on = pick?.date === d && pick.code === s.code;
                      return (
                        <td key={d}>
                          <button
                            type="button"
                            className={`o-sw-heat-cell${cls}${on ? " is-on" : ""}`}
                            aria-label={`${s.name} ${dm(d)}: ${c.available} người có thể làm / cần ${c.need}, ${c.prefer} người muốn`}
                            onClick={() => setPick(on ? null : { date: d, code: s.code })}
                          >
                            {c.available}/{c.need}
                            {c.prefer > 0 && <small>♥{c.prefer}</small>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pick && (
            <div className="o-card" style={{ padding: 12 }}>
              <strong>{data.shifts.find((s) => s.code === pick.code)?.name} · {WD_SHORT[weekdayOf(pick.date)]} {dm(pick.date)}</strong>
              {picked.map((h) => (
                <div key={h.role} className="o-muted" style={{ marginTop: 6 }}>
                  <strong style={{ color: "var(--o-text)" }}>{roleName(h.role)}</strong> — cần {h.need}, có thể làm {h.available}
                  <div>Không thể: {names(h.unavailable)}</div>
                  <div>Muốn: {names(h.prefer)}</div>
                  {h.onLeave.length > 0 && <div>Nghỉ phép: {names(h.onLeave)}</div>}
                </div>
              ))}
            </div>
          )}

          <ul className="o-sw-people">
            {people.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setPerson(s)} disabled={s.status === "NONE"}>
                  <span>{s.fullName} <span className="o-muted">· {roleName(s.role)}</span></span>
                  <span className="o-sw-counts">
                    {(Object.keys(s.counts) as WishType[]).map((t) => <Badge key={t} tone={WISH_TYPE_UI[t].tone}>{WISH_TYPE_UI[t].label} {s.counts[t]}</Badge>)}
                    <Badge tone={STATUS_UI[s.status].tone}>{STATUS_UI[s.status].label}</Badge>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {person && (
        <Modal title={`Nguyện vọng của ${person.fullName}`} onClose={() => setPerson(null)} footer={<Button onClick={() => setPerson(null)}>Đóng</Button>}>
          <div className="o-stack">
            <div className="o-inline">
              <Badge tone={STATUS_UI[person.status].tone}>{STATUS_UI[person.status].label}</Badge>
              {person.submittedAt && <span className="o-muted">gửi lúc {new Date(person.submittedAt).toLocaleString("vi-VN")}</span>}
            </div>
            {person.status === "DRAFT" && <Alert tone="warning">Nhân viên chưa bấm xác nhận — nguyện vọng nháp không được tính khi xếp lịch.</Alert>}
            {person.rawText && <blockquote className="o-sw-quote" style={{ fontSize: "var(--o-fs-sm)" }}>«{person.rawText}»</blockquote>}
            {person.rules.length === 0 ? (
              <p className="o-muted">Không có ràng buộc.</p>
            ) : (
              <ul className="o-sw-rules">
                {person.rules.map((r, i) => (
                  <li key={i} className={`o-sw-rule is-${r.type.toLowerCase()}`} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
                    <div className="o-sw-rule-main">
                      <strong>{WISH_TYPE_UI[r.type].label}</strong>
                      <div>{describeRule(r, data.shifts, data.days)}</div>
                      {r.quote && <div className="o-sw-quote">«{r.quote}»</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
