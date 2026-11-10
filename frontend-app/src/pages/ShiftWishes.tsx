import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Ban, CalendarOff, Hash, Heart, Pencil, Plus, Sparkles, ThumbsDown, Trash2 } from "lucide-react";
import { staffApi } from "../lib/staffApi";
import { Alert, Badge, Button, ControlPanel, EmptyState, Field, Modal, errMsg } from "../components/erp";
import {
  describeRule, dm, emptyRule, hhmm, LOW_CONFIDENCE, WD_SHORT, weekdayOf, WISH_TYPE_UI, wishCells,
  type WishPeriod, type WishRule, type WishShift, type WishType,
} from "../lib/shiftWish";
import "../styles/shiftWish.css";

type MyWish = {
  month: string;
  role: string;
  deadline: string;
  pastDeadline: boolean;
  published: boolean;
  aiAvailable: boolean;
  maxRules: number;
  maxText: number;
  days: string[];
  shifts: WishShift[];
  rules: { maxShiftsPerWeek: number; minRestHours: number };
  wish: { id: number; status: "DRAFT" | "CONFIRMED"; late: boolean; rawText: string; submittedAt: string | null; updatedAt: string } | null;
  wishRules: WishRule[];
};
type ParseOut = { rules: WishRule[]; leaveSuggestions: { from: string; to: string; reason: string }[]; unclear: string[]; warnings: string[]; narrow: boolean };

const TYPE_ICON = { UNAVAILABLE: Ban, PREFER: Heart, AVOID: ThumbsDown, MAX_SHIFTS: Hash, MIN_SHIFTS: Hash, DAY_OFF_PATTERN: CalendarOff };
const EXAMPLE =
  "VD: Tháng 12 em đi học sáng thứ 3, thứ 5 nên không làm ca sáng được. Muốn làm tối cuối tuần. 24/12 em xin nghỉ. Tuần cuối tháng em muốn làm ít thôi, tầm 3 ca.";
const pad2 = (n: number) => String(n).padStart(2, "0");
const monthOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const monthLabel = (m: string) => `Tháng ${Number(m.slice(5))}/${m.slice(0, 4)}`;
const NARROW_RATIO = 0.6;

/** Nhân sự › Nguyện vọng xếp ca (nhân viên làm theo ca) */
export function ShiftWishes() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const months = useMemo(() => [0, 1, 2].map((n) => { const d = new Date(); return monthOf(new Date(d.getFullYear(), d.getMonth() + n, 1)); }), []);
  const month = months.includes(params.get("month") ?? "") ? params.get("month")! : months[1];

  const [data, setData] = useState<MyWish | null>(null);
  const [text, setText] = useState("");
  const [rules, setRules] = useState<WishRule[]>([]);
  const [parsed, setParsed] = useState<Omit<ParseOut, "rules"> | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"" | "parse" | "save" | "confirm">("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ index: number | null; rule: WishRule } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await staffApi<MyWish>(`/api/shift-wishes/my?month=${month}`);
      setData(r);
      setText(r.wish?.rawText ?? "");
      setRules(r.wishRules);
      setParsed(null);
      setWarnings([]);
      setDirty(false);
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [month]);
  useEffect(() => { void load(); }, [load]);

  const locked = !!data?.published;
  const cells = useMemo(() => (data ? wishCells(rules, data.days, data.shifts) : null), [rules, data]);
  const narrow = !!data && !!cells && data.days.length * data.shifts.length > 0 && cells.unavailable.size / (data.days.length * data.shifts.length) > NARROW_RATIO;

  const changeRules = (next: WishRule[]) => { setRules(next); setDirty(true); setOk(null); };

  async function parse() {
    if (!data) return;
    setBusy("parse");
    setErr(null);
    setOk(null);
    try {
      const r = await staffApi<ParseOut>("/api/shift-wishes/parse", { method: "POST", body: JSON.stringify({ month, text }) });
      changeRules(r.rules);
      setParsed({ leaveSuggestions: r.leaveSuggestions, unclear: r.unclear, warnings: r.warnings, narrow: r.narrow });
      setWarnings([]);
    } catch (e) {
      // AI vừa bị tắt / hết lượt: ẩn nút, vẫn nhập tay được
      if ((e as { status?: number }).status === 503) setData((d) => (d ? { ...d, aiAvailable: false } : d));
      setErr(errMsg(e));
    } finally {
      setBusy("");
    }
  }

  async function save(confirmSend: boolean) {
    if (!data) return;
    if (confirmSend && narrow && !confirm("Bạn báo không thể làm quá nhiều ca trong tháng, có thể không xếp được lịch cho bạn. Vẫn gửi?")) return;
    setBusy(confirmSend ? "confirm" : "save");
    setErr(null);
    try {
      const r = await staffApi<{ wish: MyWish["wish"]; wishRules: WishRule[]; warnings: string[] }>("/api/shift-wishes/my", {
        method: "PUT",
        body: JSON.stringify({ month, text, rules, confirm: confirmSend }),
      });
      setData((d) => (d ? { ...d, wish: r.wish } : d));
      setRules(r.wishRules);
      setWarnings(r.warnings);
      setDirty(false);
      setOk(confirmSend ? (r.wish?.late ? "Đã gửi nguyện vọng (sau hạn chót — quản lý sẽ quyết định có xếp lại không)." : "Đã gửi nguyện vọng cho quản lý.") : "Đã lưu nháp.");
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy("");
    }
  }

  const status = !data?.wish ? <Badge>Chưa gửi</Badge>
    : data.wish.status === "DRAFT" ? <Badge tone="warning">Nháp</Badge>
    : data.wish.late ? <Badge tone="warning">Đã gửi (muộn)</Badge>
    : <Badge tone="success">Đã gửi</Badge>;

  return (
    <div>
      <ControlPanel
        crumbs={[{ label: "Nguyện vọng xếp ca" }]}
        actions={
          <select className="o-input o-sw-month" value={month} onChange={(e) => setParams({ month: e.target.value })} aria-label="Tháng">
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        }
      />
      <div className="o-content o-stack" style={{ maxWidth: 900, margin: "0 auto" }}>
        {err && <Alert>{err}</Alert>}
        {!data && !err && <p className="o-muted">Đang tải…</p>}
        {data && (
          <>
            <div className="o-sw-status">
              {status}
              <span className="o-muted">
                Hạn gửi {dm(data.deadline)}/{data.deadline.slice(0, 4)}{data.pastDeadline && !locked ? " — đã qua hạn, vẫn gửi được nhưng sẽ ghi \"gửi muộn\"" : ""}
              </span>
            </div>
            {locked && <Alert tone="info">Lịch {monthLabel(month).toLowerCase()} đã công bố nên không sửa nguyện vọng được nữa. Cần đổi ca, hãy dùng "Đổi ca" hoặc gửi đơn từ.</Alert>}

            <section className="o-card o-stack">
              <div className="o-card-head"><h3>Bạn muốn làm thế nào {monthLabel(month).toLowerCase()}?</h3></div>
              <p className="o-muted o-sw-hint">
                Gõ như nhắn tin: ngày / buổi bận, ca muốn làm, ngày xin nghỉ, số ca mong muốn. Quy định chung: tối đa {data.rules.maxShiftsPerWeek} ca / tuần, nghỉ ít nhất {data.rules.minRestHours} tiếng giữa 2 ca.
              </p>
              <textarea
                className="o-input o-sw-text"
                rows={5}
                maxLength={data.maxText}
                placeholder={EXAMPLE}
                value={text}
                disabled={locked}
                onChange={(e) => { setText(e.target.value); setDirty(true); setOk(null); }}
              />
              <div className="o-sw-row">
                <span className="o-muted o-sw-count">{text.length}/{data.maxText}</span>
                {data.aiAvailable && !locked && (
                  <Button variant="primary" icon={Sparkles} disabled={busy !== "" || text.trim().length < 5} onClick={() => void parse()}>
                    {busy === "parse" ? "AI đang đọc…" : "AI đọc giúp"}
                  </Button>
                )}
              </div>
              {!data.aiAvailable && !locked && <p className="o-muted o-sw-hint">AI đọc câu đang tắt — bạn thêm từng ràng buộc bằng nút "Thêm ràng buộc" bên dưới.</p>}
            </section>

            {parsed && parsed.unclear.length > 0 && (
              <Alert tone="warning">
                {parsed.unclear.map((u) => <div key={u}>AI chưa hiểu: «{u}» — bạn viết rõ ngày hơn hoặc thêm ràng buộc bằng tay giúp nhé.</div>)}
              </Alert>
            )}
            {parsed?.leaveSuggestions.map((s) => (
              <div key={`${s.from}-${s.to}`} className="o-card o-sw-leave">
                <span>Bạn có muốn tạo đơn nghỉ phép {s.from === s.to ? `ngày ${dm(s.from)}` : `${dm(s.from)} → ${dm(s.to)}`}? Nguyện vọng chỉ dùng khi xếp lịch, không thay đơn nghỉ.</span>
                <Button size="sm" onClick={() => navigate(`/app/hr/requests?tab=LEAVE&date=${s.from}${s.to !== s.from ? `&toDate=${s.to}` : ""}`)}>Tạo đơn nghỉ</Button>
              </div>
            ))}
            {[...(parsed?.warnings ?? []), ...warnings].length > 0 && (
              <Alert tone="warning">{[...new Set([...(parsed?.warnings ?? []), ...warnings])].map((w) => <div key={w}>{w}</div>)}</Alert>
            )}

            <section className="o-card">
              <div className="o-card-head">
                <h3>Ràng buộc ({rules.length}/{data.maxRules})</h3>
                {!locked && (
                  <Button size="sm" icon={Plus} disabled={rules.length >= data.maxRules} onClick={() => setEditing({ index: null, rule: emptyRule("UNAVAILABLE") })}>
                    Thêm ràng buộc
                  </Button>
                )}
              </div>
              {rules.length === 0 ? (
                <EmptyState title="Chưa có ràng buộc nào" hint={data.aiAvailable ? 'Viết nguyện vọng rồi bấm "AI đọc giúp", hoặc thêm bằng tay.' : 'Bấm "Thêm ràng buộc" để chọn ngày / ca.'} />
              ) : (
                <ul className="o-sw-rules">
                  {rules.map((r, i) => {
                    const Icon = TYPE_ICON[r.type];
                    const low = r.source === "AI" && r.confidence != null && r.confidence < LOW_CONFIDENCE;
                    return (
                      <li key={i} className={`o-sw-rule is-${r.type.toLowerCase()}${low ? " is-low" : ""}`}>
                        <span className="o-sw-rule-icon"><Icon size={16} aria-hidden /></span>
                        <div className="o-sw-rule-main">
                          <div className="o-sw-rule-title">
                            <strong>{WISH_TYPE_UI[r.type].label}</strong>
                            {low && <Badge tone="warning">AI chưa chắc — kiểm tra lại</Badge>}
                          </div>
                          <div>{describeRule(r, data.shifts, data.days)}</div>
                          {r.quote && <div className="o-sw-quote">«{r.quote}»</div>}
                        </div>
                        {!locked && (
                          <span className="o-sw-rule-act">
                            <Button size="sm" variant="link" icon={Pencil} aria-label="Sửa" onClick={() => setEditing({ index: i, rule: r })} />
                            <Button size="sm" variant="link" icon={Trash2} aria-label="Xóa" onClick={() => changeRules(rules.filter((_, j) => j !== i))} />
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {cells && <WishPreview data={data} cells={cells} />}

            {narrow && <Alert tone="warning">Nguyện vọng quá hẹp: bạn báo không thể làm hơn {Math.round(NARROW_RATIO * 100)}% số ca trong tháng, có thể không xếp được lịch cho bạn.</Alert>}
            {ok && <Alert tone="info">{ok}</Alert>}
            {!locked && (
              <div className="o-sw-actions">
                {dirty && <span className="o-muted">Có thay đổi chưa lưu</span>}
                <Button disabled={busy !== ""} onClick={() => void save(false)}>{busy === "save" ? "Đang lưu…" : "Lưu nháp"}</Button>
                <Button variant="primary" disabled={busy !== "" || (!rules.length && !text.trim())} onClick={() => void save(true)}>
                  {busy === "confirm" ? "Đang gửi…" : data.wish?.status === "CONFIRMED" && !dirty ? "Gửi lại" : "Xác nhận gửi"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      {editing && data && (
        <RuleEditor
          initial={editing.rule}
          isNew={editing.index == null}
          data={data}
          onClose={() => setEditing(null)}
          onSave={(rule) => {
            changeRules(editing.index == null ? [...rules, rule] : rules.map((x, j) => (j === editing.index ? rule : x)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/** Lịch tháng xem trước: mỗi ngày một ô, mỗi ca một vạch màu theo ràng buộc */
function WishPreview({ data, cells }: { data: MyWish; cells: ReturnType<typeof wishCells> }) {
  const lead = (weekdayOf(data.days[0]) + 6) % 7; // T2 đầu tuần
  const stateOf = (date: string, code: string) => {
    const k = `${date}|${code}`;
    return cells.unavailable.has(k) ? "no" : cells.prefer.has(k) ? "want" : cells.avoid.has(k) ? "avoid" : "";
  };
  return (
    <section className="o-card">
      <div className="o-card-head"><h3>Xem trước trên lịch</h3></div>
      <div className="o-sw-legend">
        <span><i className="is-no" />Không thể</span>
        <span><i className="is-want" />Muốn</span>
        <span><i className="is-avoid" />Hạn chế</span>
        <span><i />Chưa nói gì</span>
      </div>
      <p className="o-muted o-sw-hint">Mỗi vạch trong ô là một ca: {data.shifts.map((s) => `${s.name} ${hhmm(s.startMin)}–${hhmm(s.endMin)}`).join(" · ")}.</p>
      <div className="o-sw-cal" role="grid" aria-label="Lịch xem trước">
        {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((w) => <div key={w} className="o-sw-cal-head">{w}</div>)}
        {Array.from({ length: lead }, (_, i) => <div key={`e${i}`} />)}
        {data.days.map((d) => (
          <div key={d} className="o-sw-day" title={data.shifts.map((s) => `${s.name}: ${({ no: "không thể", want: "muốn", avoid: "hạn chế", "": "—" } as const)[stateOf(d, s.code)]}`).join("\n")}>
            <span className="o-sw-day-num">{Number(d.slice(8))}</span>
            {data.shifts.map((s) => <span key={s.code} className={`o-sw-bar is-${stateOf(d, s.code) || "none"}`} />)}
          </div>
        ))}
      </div>
    </section>
  );
}

type Scope = "dates" | "weekdays" | "range" | "all";

/** Thêm / sửa một ràng buộc bằng tay (đường chính khi AI tắt) */
function RuleEditor({ initial, isNew, data, onClose, onSave }: { initial: WishRule; isNew: boolean; data: MyWish; onClose: () => void; onSave: (r: WishRule) => void }) {
  const [r, setR] = useState<WishRule>(initial);
  const [scope, setScope] = useState<Scope>(initial.dates?.length ? "dates" : initial.weekdays?.length ? "weekdays" : initial.fromDate || initial.toDate ? "range" : "all");
  const [pick, setPick] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const first = data.days[0];
  const last = data.days[data.days.length - 1];
  const isCount = r.type === "MAX_SHIFTS" || r.type === "MIN_SHIFTS";
  const set = (patch: Partial<WishRule>) => setR((x) => ({ ...x, ...patch }));

  const changeType = (type: WishType) => {
    const base = { ...r, type };
    if (type === "MAX_SHIFTS" || type === "MIN_SHIFTS") Object.assign(base, { count: r.count ?? 3, period: r.period ?? "WEEK" });
    setR(base);
    if (type === "DAY_OFF_PATTERN") setScope("weekdays");
  };
  const toggleIn = <T,>(list: T[] | null, v: T) => {
    const next = list?.includes(v) ? list.filter((x) => x !== v) : [...(list ?? []), v];
    return next.length ? next : null;
  };

  function submit() {
    // Chỉ giữ phạm vi đang chọn; người dùng sửa tay → không còn là kết quả AI
    const out: WishRule = { ...r, source: "MANUAL", confidence: null, timeFrom: r.shiftCodes ? null : r.timeFrom, timeTo: r.shiftCodes ? null : r.timeTo };
    if (r.type === "DAY_OFF_PATTERN") Object.assign(out, { dates: null, fromDate: null, toDate: null, shiftCodes: null, count: null, period: null });
    else if (isCount) Object.assign(out, { dates: null, weekdays: null, shiftCodes: null, timeFrom: null, timeTo: null, ...(r.period === "RANGE" ? {} : { fromDate: null, toDate: null }) });
    else {
      Object.assign(out, { count: null, period: null });
      if (scope !== "dates") out.dates = null;
      if (scope !== "weekdays") out.weekdays = null;
      if (scope === "dates" || scope === "all") Object.assign(out, { fromDate: null, toDate: null });
    }
    if (r.type === "DAY_OFF_PATTERN" && !out.weekdays?.length) return setErr("Chọn thứ muốn nghỉ.");
    if (!isCount && r.type !== "DAY_OFF_PATTERN") {
      if (scope === "dates" && !out.dates?.length) return setErr("Chọn ít nhất một ngày.");
      if (scope === "weekdays" && !out.weekdays?.length) return setErr("Chọn ít nhất một thứ.");
      if (scope === "range" && !out.fromDate && !out.toDate) return setErr("Chọn khoảng ngày.");
      if (scope === "all" && !out.shiftCodes?.length && out.timeFrom == null) return setErr("Chọn ca (hoặc chọn ngày) để ràng buộc có nghĩa.");
    }
    if (isCount && (!out.count || out.count < 1 || out.count > 31)) return setErr("Số ca từ 1 đến 31.");
    if (isCount && out.period === "RANGE" && !out.fromDate && !out.toDate) return setErr("Chọn khoảng ngày cho số ca.");
    onSave(out);
  }

  return (
    <Modal
      title={isNew ? "Thêm ràng buộc" : "Sửa ràng buộc"}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Huỷ</Button><Button variant="primary" onClick={submit}>Lưu</Button></>}
    >
      {err && <Alert>{err}</Alert>}
      <div className="o-stack">
        <Field label="Loại" required>
          <select className="o-input" value={r.type} onChange={(e) => changeType(e.target.value as WishType)}>
            <option value="UNAVAILABLE">Không thể làm</option>
            <option value="PREFER">Muốn làm</option>
            <option value="AVOID">Hạn chế (làm được nhưng không thích)</option>
            <option value="MAX_SHIFTS">Tối đa số ca</option>
            <option value="MIN_SHIFTS">Ít nhất số ca</option>
            <option value="DAY_OFF_PATTERN">Nghỉ cố định một thứ mỗi tuần</option>
          </select>
        </Field>

        {isCount && (
          <div className="o-sw-inline">
            <Field label="Số ca" required>
              <input className="o-input" type="number" min={1} max={31} value={r.count ?? ""} onChange={(e) => set({ count: e.target.value ? Number(e.target.value) : null })} />
            </Field>
            <Field label="Trong" required>
              <select className="o-input" value={r.period ?? "WEEK"} onChange={(e) => set({ period: e.target.value as WishPeriod })}>
                <option value="WEEK">Mỗi tuần</option>
                <option value="MONTH">Cả tháng</option>
                <option value="RANGE">Khoảng ngày</option>
              </select>
            </Field>
          </div>
        )}

        {!isCount && r.type !== "DAY_OFF_PATTERN" && (
          <Field label="Áp dụng cho">
            <select className="o-input" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
              <option value="dates">Ngày cụ thể</option>
              <option value="weekdays">Theo thứ trong tuần</option>
              <option value="range">Khoảng ngày</option>
              <option value="all">Cả tháng (theo ca)</option>
            </select>
          </Field>
        )}

        {!isCount && r.type !== "DAY_OFF_PATTERN" && scope === "dates" && (
          <Field label="Ngày">
            <div className="o-sw-inline">
              <input className="o-input" type="date" min={first} max={last} value={pick} onChange={(e) => setPick(e.target.value)} />
              <Button size="sm" disabled={!pick} onClick={() => { set({ dates: [...new Set([...(r.dates ?? []), pick])].sort() }); setPick(""); }}>Thêm ngày</Button>
            </div>
            <div className="o-sw-chips">
              {(r.dates ?? []).map((d) => (
                <button key={d} type="button" className="o-sw-chip" onClick={() => set({ dates: toggleIn(r.dates, d) })} aria-label={`Bỏ ngày ${dm(d)}`}>{dm(d)} ×</button>
              ))}
            </div>
          </Field>
        )}

        {(r.type === "DAY_OFF_PATTERN" || (!isCount && scope === "weekdays")) && (
          <Field label="Thứ" required>
            <div className="o-sw-chips">
              {[1, 2, 3, 4, 5, 6, 0].map((w) => (
                <button key={w} type="button" className={`o-sw-chip${r.weekdays?.includes(w) ? " is-on" : ""}`} aria-pressed={!!r.weekdays?.includes(w)} onClick={() => set({ weekdays: toggleIn(r.weekdays, w)?.sort() ?? null })}>
                  {WD_SHORT[w]}
                </button>
              ))}
            </div>
          </Field>
        )}

        {((!isCount && r.type !== "DAY_OFF_PATTERN" && (scope === "weekdays" || scope === "range")) || (isCount && r.period === "RANGE")) && (
          <div className="o-sw-inline">
            <Field label="Từ ngày"><input className="o-input" type="date" min={first} max={last} value={r.fromDate ?? ""} onChange={(e) => set({ fromDate: e.target.value || null })} /></Field>
            <Field label="Đến ngày"><input className="o-input" type="date" min={r.fromDate ?? first} max={last} value={r.toDate ?? ""} onChange={(e) => set({ toDate: e.target.value || null })} /></Field>
          </div>
        )}

        {!isCount && r.type !== "DAY_OFF_PATTERN" && (
          <Field label="Ca (không chọn = cả ngày)">
            <div className="o-sw-chips">
              {data.shifts.map((s) => (
                <button key={s.code} type="button" className={`o-sw-chip${r.shiftCodes?.includes(s.code) ? " is-on" : ""}`} aria-pressed={!!r.shiftCodes?.includes(s.code)} onClick={() => set({ shiftCodes: toggleIn(r.shiftCodes, s.code), timeFrom: null, timeTo: null })}>
                  {s.name} {hhmm(s.startMin)}–{hhmm(s.endMin)}
                </button>
              ))}
            </div>
          </Field>
        )}
        {r.quote && <p className="o-sw-quote">Câu gốc: «{r.quote}»</p>}
      </div>
    </Modal>
  );
}
