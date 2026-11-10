import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bot, Check, ChevronDown, ChevronLeft, ChevronRight, FlaskConical, Library, Loader2, Plus, Save, SendHorizontal, Trash2, X } from "lucide-react";
import { getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
import { Alert, Badge, Button, PageHeader, errMsg } from "../../components/erp";
import {
  CHANNEL_LABEL,
  DAY_LABEL,
  LENGTH_LABEL,
  NEW_AGENT,
  REASONING_LABEL,
  TONE_LABEL,
  scheduleLabel,
  waitLabel,
  type Agent,
  type ChannelInfo,
  type QuickReply,
  type ScheduleSlot,
  type TestResult,
} from "../../lib/aiAgents";
import { fmtCount, type KbRow } from "../../lib/knowledge";
import { AGENT_ICONS, AgentIcon, AgentSwitch } from "./Agents";
import { GeminiNotice } from "./KnowledgeBases";
import "../../styles/ai.css";

type Draft = typeof NEW_AGENT & { id?: number; quickReplies: QuickReply[] };
const STEPS = ["Thông tin cơ bản", "Cấu hình AI", "Kênh & giờ hoạt động"];
const fill = (t: string, d: Pick<Draft, "selfPronoun" | "customerPronoun">) =>
  t.replace(/(^|[.!?…]\s+)?\{(self|customer)\}/g, (_, lead: string | undefined, k: string) => {
    const w = k === "self" ? d.selfPronoun : d.customerPronoun;
    return lead !== undefined ? `${lead}${w.charAt(0).toUpperCase()}${w.slice(1)}` : w;
  });

/* ── Khối giao diện nhỏ ── */
function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="o-dcard ag-sec">
      <h2 className="ag-sec-title">{title}</h2>
      {hint && <p className="ag-sec-hint">{hint}</p>}
      {children}
    </section>
  );
}
function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className="ag-toggle">
      <span className="kb-switch"><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /></span>
      <span><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
    </label>
  );
}
function Choice<T extends string>({ value, options, onChange, disabled }: { value: T; options: Record<T, { label: string; hint: string }>; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="ag-choices" role="radiogroup">
      {(Object.keys(options) as T[]).map((k) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} disabled={disabled} className={value === k ? "ag-choice active" : "ag-choice"} onClick={() => onChange(k)}>
          <strong>{options[k].label}</strong>
          <small>{options[k].hint}</small>
        </button>
      ))}
    </div>
  );
}
function Num({ label, value, onChange, min, max, unit, hint, disabled }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; unit: string; hint?: string; disabled?: boolean }) {
  return (
    <label className="ag-num">
      <span>{label}</span>
      <span className="ag-num-row">
        <input className="o-input" type="number" min={min} max={max} value={value} disabled={disabled} onChange={(e) => onChange(Math.max(min, Math.min(max, Math.round(Number(e.target.value) || 0))))} />
        <span className="o-muted">{unit}</span>
      </span>
      {hint && <small className="o-muted">{hint}</small>}
    </label>
  );
}
function Chips({ values, onChange, placeholder, disabled }: { values: string[]; onChange: (v: string[]) => void; placeholder: string; disabled?: boolean }) {
  const [t, setT] = useState("");
  const add = () => {
    const v = t.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setT("");
  };
  return (
    <div className="ag-chips">
      {values.map((v) => (
        <span key={v} className="ag-chip">
          {v}
          {!disabled && <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Bỏ ${v}`}><X size={12} /></button>}
        </span>
      ))}
      {!disabled && (
        <input
          className="ag-chip-input"
          value={t}
          onChange={(e) => setT(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

/** Trí tuệ nhân tạo › AI Agents › (tạo / sửa) — wizard 3 bước */
export function AgentEditor({ recordId }: { recordId?: string }) {
  const nav = useNavigate();
  const isNew = recordId === "new";
  const owner = isOwnerRole(getStaffInfo()?.role);
  const ro = !owner;
  const [d, setD] = useState<Draft | null>(isNew ? { ...NEW_AGENT, quickReplies: [] } : null);
  const [kbs, setKbs] = useState<KbRow[]>([]);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [geminiReady, setGeminiReady] = useState(true);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testOpen, setTestOpen] = useState(false);

  useEffect(() => {
    staffApi<{ items: KbRow[] }>("/api/knowledge-bases").then((r) => setKbs(r.items)).catch(() => setKbs([]));
    staffApi<{ channels: ChannelInfo[] }>("/api/ai/agents/channels").then((r) => setChannels(r.channels)).catch(() => setChannels([]));
    if (!isNew)
      staffApi<Agent>(`/api/ai/agents/${recordId}`)
        .then((a) => {
          setD({ ...a, schedule: a.schedule ?? NEW_AGENT.schedule, memory: a.memory ?? "", extraInstructions: a.extraInstructions ?? "", outOfHoursMessage: a.outOfHoursMessage ?? "" });
          setGeminiReady(a.geminiReady !== false);
        })
        .catch((e) => setErr(errMsg(e)));
  }, [recordId, isNew]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => (x ? { ...x, [k]: v } : x));

  async function save(next?: number) {
    if (!d) return;
    if (!d.name.trim()) {
      setStep(0);
      return setErr("Nhập tên agent.");
    }
    setBusy(true);
    setErr(null);
    try {
      const { id: _id, ...body } = d;
      const payload = JSON.stringify({ ...body, quickReplies: isNew && !d.quickReplies.length ? undefined : d.quickReplies });
      const saved = isNew
        ? await staffApi<Agent>("/api/ai/agents", { method: "POST", body: payload })
        : await staffApi<Agent>(`/api/ai/agents/${d.id}`, { method: "PUT", body: payload });
      setMsg(`Đã lưu "${saved.name}".`);
      staffApi<{ channels: ChannelInfo[] }>("/api/ai/agents/channels").then((r) => setChannels(r.channels)).catch(() => undefined);
      if (isNew) nav(`/app/ai/agents/${saved.id}`, { replace: true });
      else setD((x) => (x ? { ...x, ...saved, memory: saved.memory ?? "", extraInstructions: saved.extraInstructions ?? "", outOfHoursMessage: saved.outOfHoursMessage ?? "", schedule: saved.schedule ?? x.schedule } : x));
      if (next != null) setStep(next);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!d?.id || !confirm(`Xóa agent "${d.name}"? Kênh đang gán sẽ quay về bot cũ / nhân viên.`)) return;
    try {
      await staffApi(`/api/ai/agents/${d.id}`, { method: "DELETE" });
      nav("/app/ai/agents");
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  const back = <Link to="/app/ai/agents" className="o-ph-back"><ChevronLeft size={16} aria-hidden /> AI Agents</Link>;
  if (!d) return <div className="kb-page"><PageHeader title="AI Agent" back={back} />{err ? <Alert>{err}</Alert> : <div className="o-muted">Đang tải…</div>}</div>;

  return (
    <div className="kb-page">
      <PageHeader
        back={back}
        title={isNew ? "Tạo agent mới" : d.name}
        description={isNew ? "Ba bước: thông tin, cấu hình AI, kênh & giờ hoạt động. Lưu được ở mọi bước." : d.description || undefined}
        actions={
          <>
            {!isNew && d.id && <AgentSwitch agent={{ id: d.id, name: d.name, enabled: d.enabled }} disabled={ro} onChange={(a) => set("enabled", a.enabled)} />}
            {!isNew && <Button icon={FlaskConical} onClick={() => setTestOpen(true)}>Thử agent</Button>}
            {owner && <Button variant="primary" icon={busy ? Loader2 : Save} onClick={() => void save()} disabled={busy}>Lưu</Button>}
            {owner && !isNew && <Button variant="danger" icon={Trash2} onClick={() => void remove()} aria-label="Xóa agent" />}
          </>
        }
      />
      {!geminiReady && <GeminiNotice />}
      {err && <Alert>{err}</Alert>}
      {msg && <Alert tone="info">{msg}</Alert>}

      <ol className="ag-steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? "active" : i < step ? "done" : undefined}>
            <button type="button" onClick={() => setStep(i)}>
              <span className="ag-step-n">{i < step ? <Check size={14} /> : i + 1}</span>
              {s}
            </button>
          </li>
        ))}
      </ol>

      <div className="ag-layout">
        <div className="ag-main">
          {step === 0 && <StepBasic d={d} set={set} ro={ro} />}
          {step === 1 && <StepAi d={d} set={set} ro={ro} kbs={kbs} />}
          {step === 2 && <StepChannels d={d} set={set} ro={ro} channels={channels} />}
          <div className="ag-nav">
            {step > 0 && <Button icon={ChevronLeft} onClick={() => setStep(step - 1)}>Quay lại</Button>}
            <span style={{ flex: 1 }} />
            {step < 2 ? (
              owner ? <Button variant="primary" onClick={() => void save(step + 1)} disabled={busy}>Lưu & tiếp tục <ChevronRight size={16} aria-hidden /></Button> : <Button onClick={() => setStep(step + 1)}>Tiếp <ChevronRight size={16} aria-hidden /></Button>
            ) : (
              owner && <Button variant="primary" icon={Check} onClick={() => void save()} disabled={busy}>Hoàn tất</Button>
            )}
          </div>
        </div>
        <Preview d={d} kbs={kbs} />
      </div>

      {testOpen && d.id && <TestDrawer agentId={d.id} botName={d.botName} onClose={() => setTestOpen(false)} />}
    </div>
  );
}

type StepProps = { d: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void; ro: boolean };

/* ═══════════ Bước 1 ═══════════ */
function StepBasic({ d, set, ro }: StepProps) {
  return (
    <>
      <Section title="Hồ sơ Agent">
        <label className="ag-field">
          <span>Tên agent <span className="req">*</span></span>
          <input className="o-input" value={d.name} onChange={(e) => set("name", e.target.value)} maxLength={60} placeholder="VD: Tu van menu" disabled={ro} />
          <small className="o-muted">Chữ, số, khoảng trắng, gạch ngang. Chỉ hiện trong trang quản trị.</small>
        </label>
        <label className="ag-field">
          <span>Mô tả</span>
          <textarea className="o-input" rows={2} value={d.description ?? ""} onChange={(e) => set("description", e.target.value)} maxLength={500} placeholder="Agent này làm gì" disabled={ro} />
        </label>
      </Section>
      <Section title="Biểu tượng">
        <div className="ag-icons" role="radiogroup" aria-label="Biểu tượng">
          {Object.keys(AGENT_ICONS).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={d.icon === k} className={d.icon === k ? "active" : ""} onClick={() => set("icon", k)} disabled={ro} aria-label={k}>
              <AgentIcon icon={k} size={22} />
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}

/* ═══════════ Bước 2 ═══════════ */
function StepAi({ d, set, ro, kbs }: StepProps & { kbs: KbRow[] }) {
  const toggleKb = (id: number) => set("kbIds", d.kbIds.includes(id) ? d.kbIds.filter((x) => x !== id) : [...d.kbIds, id]);
  const setQr = (i: number, patch: Partial<QuickReply>) => set("quickReplies", d.quickReplies.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  return (
    <>
      <Section title="Kho tri thức" hint="AI chỉ trả lời chính sách, thông tin quán từ các kho được chọn. Giá, món, giờ mở cửa, khuyến mãi AI tự tra từ hệ thống.">
        {!kbs.length && <p className="o-muted">Chưa có kho tri thức — tạo ở mục Kho tri thức.</p>}
        <div className="ag-kbs">
          {kbs.map((k) => (
            <button key={k.id} type="button" className={d.kbIds.includes(k.id) ? "ag-kb active" : "ag-kb"} onClick={() => toggleKb(k.id)} disabled={ro} aria-pressed={d.kbIds.includes(k.id)}>
              <Library size={18} aria-hidden />
              <span>
                <strong>{k.name}</strong>
                <small>{k.storeId == null ? "Cả chuỗi" : k.storeName} · {k.docCount} tài liệu · {fmtCount(k.chunkCount)} đoạn</small>
              </span>
              {d.kbIds.includes(k.id) && <Check size={16} className="ag-kb-check" aria-hidden />}
            </button>
          ))}
        </div>
        {!d.kbIds.length && kbs.length > 0 && <p className="ag-warn">Chưa chọn kho nào — AI chỉ trả lời được bằng dữ liệu hệ thống (món, giá, chi nhánh, khuyến mãi).</p>}
      </Section>

      <Section title="Phong cách & lời thoại" hint="Viết {self} / {customer} để tự thay bằng cách xưng hô bên dưới.">
        <Choice value={d.tone} options={TONE_LABEL} onChange={(v) => set("tone", v)} disabled={ro} />
        <div className="ag-grid3">
          <label className="ag-field"><span>Tên bot</span><input className="o-input" value={d.botName} onChange={(e) => set("botName", e.target.value)} maxLength={60} disabled={ro} /></label>
          <label className="ag-field"><span>Bot xưng là</span><input className="o-input" value={d.selfPronoun} onChange={(e) => set("selfPronoun", e.target.value)} maxLength={20} disabled={ro} /></label>
          <label className="ag-field"><span>Gọi khách là</span><input className="o-input" value={d.customerPronoun} onChange={(e) => set("customerPronoun", e.target.value)} maxLength={20} disabled={ro} /></label>
        </div>
        <label className="ag-field"><span>Lời chào (tin đầu tiên khi khách mở chat)</span><textarea className="o-input" rows={2} value={d.greeting} onChange={(e) => set("greeting", e.target.value)} maxLength={1000} disabled={ro} /></label>
        <label className="ag-field"><span>Khi không tìm thấy câu trả lời</span><textarea className="o-input" rows={2} value={d.fallbackMessage} onChange={(e) => set("fallbackMessage", e.target.value)} maxLength={1000} disabled={ro} /></label>
      </Section>

      <Section title="Ghi nhớ cố định" hint="Thông tin luôn đúng, AI luôn nhớ (không cần tìm). VD: Quán không bán đồ có cồn. Wifi hỏi nhân viên tại quầy.">
        <textarea className="o-input ag-full" rows={3} value={d.memory ?? ""} onChange={(e) => set("memory", e.target.value)} maxLength={1000} disabled={ro} />
        <small className="o-muted">{(d.memory ?? "").length}/1000</small>
        <details className="ag-details">
          <summary><ChevronDown size={14} aria-hidden /> Hướng dẫn thêm</summary>
          <textarea className="o-input ag-full" rows={3} value={d.extraInstructions ?? ""} onChange={(e) => set("extraInstructions", e.target.value)} maxLength={2000} placeholder="VD: Luôn gợi ý bánh croissant khi khách gọi cà phê sữa." disabled={ro} />
        </details>
      </Section>

      <Section title="Hành vi phản hồi">
        <div className="ag-toggles">
          <Toggle checked={d.allowWebSearch} onChange={(v) => set("allowWebSearch", v)} disabled={ro} label="Cho phép tìm kiếm bên ngoài (Internet)" hint="Khách hỏi kiến thức chung (cà phê, sức khỏe, tin tức) mà kho không có thì AI tìm Google. Không dùng cho giá / chính sách của quán. Chậm và tốn hơn." />
          <Toggle checked={d.allowGeneralKnowledge} onChange={(v) => set("allowGeneralKnowledge", v)} disabled={ro} label="Cho phép trả lời bằng hiểu biết chung của AI" hint="Tắt: chỉ trả lời từ tài liệu + dữ liệu thật, ít bịa nhất." />
          <Toggle checked={d.handoffEnabled} onChange={(v) => set("handoffEnabled", v)} disabled={ro} label="Chuyển nhân viên khi không chắc" hint="AI dừng ở phiên đó, nhân viên nhận thông báo kèm tóm tắt." />
          <Toggle checked={d.splitLongMessages} onChange={(v) => set("splitLongMessages", v)} disabled={ro} label="Tự chia tin dài" hint="Tách theo đoạn, tối đa 3 bong bóng." />
        </div>
        <div className="ag-grid3">
          <Num label="Gộp tin nhắn: đợi" value={d.mergeWindowSec} onChange={(v) => set("mergeWindowSec", v)} min={0} max={120} unit="giây" hint="Khách gõ nhiều tin liền → AI đợi khách ngừng gõ rồi trả lời 1 lần." disabled={ro} />
          <Num label="Bộ nhớ hội thoại" value={d.historySize} onChange={(v) => set("historySize", v)} min={2} max={50} unit="tin" hint="Số tin gần nhất AI đọc lại." disabled={ro} />
          <label className="ag-num">
            <span>Ngưỡng liên quan của tài liệu</span>
            <span className="ag-num-row">
              <input type="range" min={0.5} max={0.85} step={0.01} value={d.minScore} onChange={(e) => set("minScore", Number(e.target.value))} disabled={ro} />
              <strong>{d.minScore.toFixed(2)}</strong>
            </span>
            <small className="o-muted">Cao hơn = chặt hơn, ít dùng tài liệu lạc đề.</small>
          </label>
        </div>
        <h3 className="ag-sub">Độ dài phản hồi</h3>
        <Choice value={d.responseLength} options={LENGTH_LABEL} onChange={(v) => set("responseLength", v)} disabled={ro} />
        <h3 className="ag-sub">Mức suy luận</h3>
        <Choice value={d.reasoningLevel} options={REASONING_LABEL} onChange={(v) => set("reasoningLevel", v)} disabled={ro} />
      </Section>

      <Section title="Mẫu trả lời nhanh" hint="Khớp câu khách gõ (không phân biệt dấu) thì trả lời ngay, không gọi AI — nhanh và miễn phí.">
        <Toggle checked={d.quickRepliesEnabled} onChange={(v) => set("quickRepliesEnabled", v)} disabled={ro} label="Bật mẫu trả lời nhanh" />
        {!d.quickReplies.length && d.id == null && <p className="o-muted">Agent mới tự có 4 mẫu: chào hỏi, cảm ơn, tạm biệt, gặp nhân viên.</p>}
        <div className="ag-qrs">
          {d.quickReplies.map((q, i) => (
            <div key={q.id ?? `n${i}`} className="ag-qr">
              <div className="ag-qr-head">
                <input className="o-input" value={q.name} onChange={(e) => setQr(i, { name: e.target.value })} placeholder="Tên mẫu" maxLength={60} disabled={ro} />
                <select className="o-input" value={q.matchType} onChange={(e) => setQr(i, { matchType: e.target.value as QuickReply["matchType"] })} disabled={ro}>
                  <option value="EXACT">Khớp cả câu</option>
                  <option value="CONTAINS">Có chứa</option>
                </select>
                <select className="o-input" value={q.action} onChange={(e) => setQr(i, { action: e.target.value as QuickReply["action"] })} disabled={ro}>
                  <option value="NONE">Chỉ trả lời</option>
                  <option value="HANDOFF">Trả lời + chuyển nhân viên</option>
                </select>
                <span className="kb-switch" title="Bật / tắt mẫu"><input type="checkbox" checked={q.enabled} onChange={(e) => setQr(i, { enabled: e.target.checked })} disabled={ro} /></span>
                {!ro && <Button variant="link" size="sm" icon={Trash2} aria-label="Xóa mẫu" onClick={() => set("quickReplies", d.quickReplies.filter((_, j) => j !== i))} />}
              </div>
              <small className="o-muted">Khách gõ (Enter để thêm)</small>
              <Chips values={q.patterns} onChange={(v) => setQr(i, { patterns: v })} placeholder="VD: xin chào" disabled={ro} />
              <small className="o-muted">Câu trả lời (chọn ngẫu nhiên một câu)</small>
              <Chips values={q.replies} onChange={(v) => setQr(i, { replies: v })} placeholder="VD: Dạ {self} chào {customer}!" disabled={ro} />
            </div>
          ))}
        </div>
        {!ro && (
          <Button icon={Plus} size="sm" onClick={() => set("quickReplies", [...d.quickReplies, { name: "", matchType: "CONTAINS", patterns: [], replies: [], action: "NONE", enabled: true }])}>
            Thêm mẫu
          </Button>
        )}
      </Section>
    </>
  );
}

/* ═══════════ Bước 3 ═══════════ */
function StepChannels({ d, set, ro, channels }: StepProps & { channels: ChannelInfo[] }) {
  // Mỗi ngày một khung giờ trên giao diện
  const byDay = useMemo(() => new Map((d.schedule ?? []).map((s) => [s.day, s])), [d.schedule]);
  const setDay = (day: number, patch: Partial<ScheduleSlot> | null) => {
    const cur = byDay.get(day) ?? { day, from: "07:00", to: "22:00" };
    const rest = (d.schedule ?? []).filter((s) => s.day !== day);
    set("schedule", (patch === null ? rest : [...rest, { ...cur, ...patch }]).sort((a, b) => a.day - b.day));
  };
  const bound = (channel: string, storeId: number | null) => d.bindings.some((b) => b.channel === channel && b.storeId === storeId);
  const toggleBind = (channel: string, storeId: number | null) =>
    set("bindings", bound(channel, storeId) ? d.bindings.filter((b) => !(b.channel === channel && b.storeId === storeId)) : [...d.bindings, { channel, storeId }]);

  return (
    <>
      <Section title="Giờ hoạt động" hint="Ngoài giờ, AI không trả lời: khách nhận tin ngoài giờ (tối đa 1 lần / 2 giờ) và nhân viên được báo.">
        <div className="o-seg" role="tablist">
          <button type="button" role="tab" aria-selected={d.scheduleMode === "ALWAYS"} className={d.scheduleMode === "ALWAYS" ? "active" : ""} onClick={() => set("scheduleMode", "ALWAYS")} disabled={ro}>24/7</button>
          <button type="button" role="tab" aria-selected={d.scheduleMode === "SCHEDULE"} className={d.scheduleMode === "SCHEDULE" ? "active" : ""} onClick={() => set("scheduleMode", "SCHEDULE")} disabled={ro}>Theo lịch</button>
        </div>
        {d.scheduleMode === "SCHEDULE" && (
          <table className="ag-sched">
            <tbody>
              {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                const s = byDay.get(day);
                return (
                  <tr key={day} className={s ? undefined : "off"}>
                    <td>
                      <label className="o-check"><input type="checkbox" checked={!!s} onChange={(e) => setDay(day, e.target.checked ? {} : null)} disabled={ro} /> {DAY_LABEL[day]}</label>
                    </td>
                    <td>{s ? <><input className="o-input" type="time" value={s.from} onChange={(e) => setDay(day, { from: e.target.value })} disabled={ro} aria-label={`${DAY_LABEL[day]} từ`} /> – <input className="o-input" type="time" value={s.to} onChange={(e) => setDay(day, { to: e.target.value })} disabled={ro} aria-label={`${DAY_LABEL[day]} đến`} /></> : <span className="o-muted">Nghỉ — nhân viên trả lời</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <label className="ag-field">
          <span>Tin nhắn ngoài giờ</span>
          <textarea className="o-input" rows={2} value={d.outOfHoursMessage ?? ""} onChange={(e) => set("outOfHoursMessage", e.target.value)} maxLength={1000} disabled={ro} />
        </label>
      </Section>

      <Section title="Thời gian đợi trước khi AI trả lời" hint="Để nhân viên trả lời trước trong giờ đông khách; quá thời gian mà chưa ai trả lời thì AI mới trả lời. Nhân viên trả lời thì AI dừng ở phiên đó.">
        <div className="ag-grid3">
          <Num label="Đợi nhân viên" value={d.staffWaitMinutes} onChange={(v) => set("staffWaitMinutes", v)} min={0} max={60} unit="phút" hint="0 = AI trả lời ngay sau khi gộp tin." disabled={ro} />
          <Num label="Gộp tin nhắn" value={d.mergeWindowSec} onChange={(v) => set("mergeWindowSec", v)} min={0} max={120} unit="giây" hint="Đợi khách ngừng gõ rồi trả lời 1 lần." disabled={ro} />
        </div>
        <p className="ag-callout">AI sẽ {waitLabel(d)}.</p>
      </Section>

      <Section title="Kênh" hint="Gán agent cho chat web của cả chuỗi hoặc từng chi nhánh. Chi nhánh gán riêng được ưu tiên hơn bản gán cả chuỗi.">
        {channels.map((c) => (
          <div key={c.channel} className={c.live ? "ag-channel" : "ag-channel soon"}>
            <h3 className="ag-sub">{CHANNEL_LABEL[c.channel] ?? c.channel} {!c.live && <Badge>Sắp có</Badge>}</h3>
            {c.live &&
              c.targets.map((t) => {
                const other = t.agent && t.agent.id !== d.id ? t.agent : null;
                return (
                  <label key={String(t.storeId)} className="o-check ag-target">
                    <input type="checkbox" checked={bound(c.channel, t.storeId)} onChange={() => toggleBind(c.channel, t.storeId)} disabled={ro} />
                    <span>{t.name}</span>
                    {other && !bound(c.channel, t.storeId) && <small className="o-muted">đang gán cho "{other.name}" — chọn để chuyển sang agent này</small>}
                  </label>
                );
              })}
          </div>
        ))}
      </Section>

      <Section title="Giới hạn">
        <label className="ag-num">
          <span>Số lượt gọi AI tối đa mỗi ngày</span>
          <span className="ag-num-row">
            <input className="o-input" type="number" min={1} value={d.dailyRequestLimit ?? ""} placeholder="Không giới hạn" onChange={(e) => set("dailyRequestLimit", e.target.value ? Math.max(1, Math.round(Number(e.target.value))) : null)} disabled={ro} />
            <span className="o-muted">lượt</span>
          </span>
          <small className="o-muted">Hết lượt thì chuyển nhân viên. Mẫu trả lời nhanh không tính lượt.</small>
        </label>
      </Section>
    </>
  );
}

/* ═══════════ Cột xem trước ═══════════ */
function Preview({ d, kbs }: { d: Draft; kbs: KbRow[] }) {
  const names = kbs.filter((k) => d.kbIds.includes(k.id)).map((k) => k.name);
  const ch = d.bindings.map((b) => `${CHANNEL_LABEL[b.channel] ?? b.channel} · ${b.storeId == null ? "cả chuỗi" : b.storeName ?? `chi nhánh #${b.storeId}`}`);
  return (
    <aside className="o-dcard ag-preview" aria-label="Xem trước">
      <div className="ag-preview-label">XEM TRƯỚC</div>
      <div className="ag-preview-head">
        <AgentIcon icon={d.icon} size={24} />
        <div>
          <strong>{d.name || "Agent chưa đặt tên"}</strong>
          <small>{d.description || "Chưa có mô tả"}</small>
        </div>
      </div>
      <div className="ag-bubble">
        <span className="ag-bubble-name"><Bot size={12} aria-hidden /> {d.botName}</span>
        {fill(d.greeting, d)}
      </div>
      <dl className="ag-facts-dl">
        <dt>Trạng thái</dt><dd>{d.enabled ? <Badge tone="success">Đang bật</Badge> : <Badge>Đang tắt</Badge>}</dd>
        <dt>Tông giọng</dt><dd>{TONE_LABEL[d.tone].label} · {LENGTH_LABEL[d.responseLength].label}</dd>
        <dt>Kho tri thức</dt><dd>{names.length ? names.join(", ") : "—"}</dd>
        <dt>Tìm bên ngoài</dt><dd>{d.allowWebSearch ? "Có (Internet)" : "Không"}</dd>
        <dt>Giờ hoạt động</dt><dd>{scheduleLabel(d)}</dd>
        <dt>Trả lời</dt><dd>{waitLabel(d)}</dd>
        <dt>Kênh</dt><dd>{ch.length ? ch.join("; ") : "Chưa gán — AI chưa trả lời khách"}</dd>
      </dl>
    </aside>
  );
}

/* ═══════════ Thử agent ═══════════ */
type TestMsg = { role: "user" | "model"; text: string; result?: TestResult };

function TestDrawer({ agentId, botName, onClose }: { agentId: number; botName: string; onClose: () => void }) {
  const [msgs, setMsgs] = useState<TestMsg[]>([]);
  const [t, setT] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const end = useRef<HTMLDivElement>(null);
  // Ngoặc nhọn: scrollIntoView trên trình duyệt mới trả Promise — không được trả ra khỏi effect
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  async function send() {
    const text = t.trim();
    if (!text || busy) return;
    const next = [...msgs, { role: "user" as const, text }];
    setMsgs(next);
    setT("");
    setBusy(true);
    try {
      const r = await staffApi<TestResult>(`/api/ai/agents/${agentId}/test`, { method: "POST", body: JSON.stringify({ messages: next.map(({ role, text }) => ({ role, text })) }) });
      setMsgs((x) => [...x, { role: "model", text: r.bubbles.join("\n\n") || "(không có câu trả lời)", result: r }]);
    } catch (e) {
      setMsgs((x) => [...x, { role: "model", text: `Lỗi: ${errMsg(e)}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="kb-drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <aside className="kb-drawer" role="dialog" aria-modal="true" aria-label="Thử agent">
        <header className="kb-drawer-head">
          <div>
            <h2>Thử agent</h2>
            <span className="o-muted">Chạy đúng như chat thật nhưng không lưu tin nhắn. Tính lượt AI.</span>
          </div>
          <Button variant="link" icon={X} onClick={onClose} aria-label="Đóng" />
        </header>
        <div className="kb-drawer-body ag-test-body">
          {!msgs.length && <p className="o-muted">Thử: "phí ship 5km bao nhiêu", "bạc xỉu size L giá nhiêu", "quán có bán bia không".</p>}
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "ag-tmsg me" : "ag-tmsg"}>
              {m.role === "model" && <span className="ag-bubble-name"><Bot size={12} aria-hidden /> {botName}</span>}
              <div className="ag-tbubble">{m.text}</div>
              {m.result && (
                <>
                  <button type="button" className="ag-tmeta" onClick={() => setOpen(open === i ? null : i)}>
                    {m.result.kind}{m.result.handoff ? " · chuyển nhân viên" : ""} · {m.result.latencyMs} ms{m.result.costVnd != null ? ` · ~${Math.round(m.result.costVnd)}đ` : ""} · {open === i ? "Ẩn chi tiết" : "Xem chi tiết"}
                  </button>
                  {open === i && <TestDetail r={m.result} />}
                </>
              )}
            </div>
          ))}
          {busy && <div className="ag-tmsg"><div className="ag-tbubble"><Loader2 size={14} className="kb-spin" aria-hidden /> AI đang trả lời…</div></div>}
          <div ref={end} />
        </div>
        <form className="ag-test-form" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <input className="o-input" value={t} onChange={(e) => setT(e.target.value)} placeholder="Nhắn như khách…" disabled={busy} autoFocus />
          <Button variant="primary" type="submit" icon={SendHorizontal} disabled={busy || !t.trim()} aria-label="Gửi" />
          {msgs.length > 0 && <Button onClick={() => setMsgs([])}>Làm lại</Button>}
        </form>
      </aside>
    </div>
  );
}

function TestDetail({ r }: { r: TestResult }) {
  return (
    <div className="ag-tdetail">
      {r.error && <p className="kb-doc-err">Lỗi: {r.error}</p>}
      {r.quickReply && <p>Mẫu trả lời nhanh: <strong>{r.quickReply}</strong></p>}
      {r.handoff && <p>Chuyển nhân viên: {r.handoff.reason}</p>}
      <h4>Đoạn tài liệu ({r.retrieved.length})</h4>
      {r.retrieved.length ? (
        <ol>{r.retrieved.map((x) => <li key={x.chunkId}>{x.title}{x.heading ? ` › ${x.heading}` : ""} <span className="o-muted">· vector {x.vectorScore?.toFixed(3) ?? "—"} · từ khóa {x.keywordScore?.toFixed(2) ?? "—"}</span></li>)}</ol>
      ) : <p className="o-muted">Không dùng tài liệu.</p>}
      <h4>Công cụ đã gọi ({r.toolCalls.length})</h4>
      {r.toolCalls.length ? (
        <ol>{r.toolCalls.map((c, i) => <li key={i}><code>{c.name}({JSON.stringify(c.args)})</code> <span className="o-muted">{c.ms} ms</span><div className="ag-tool-res">{c.resultSummary}</div></li>)}</ol>
      ) : <p className="o-muted">Không gọi công cụ.</p>}
      {r.model && <p className="o-muted">{r.model} · token vào {r.promptTokens ?? 0} · ra {r.outputTokens ?? 0} · suy luận {r.thinkingTokens ?? 0}</p>}
    </div>
  );
}
