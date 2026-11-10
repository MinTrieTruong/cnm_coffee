import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Bot, Coins, Download, Loader2, MessageSquareText, MessagesSquare, Search, ThumbsDown, ThumbsUp, Timer, X } from "lucide-react";
import { staffApi } from "../../lib/staffApi";
import { Alert, Badge, Button, DateRangePicker, EmptyState, KpiCard, PageHeader, Tabs, downloadCsv, errMsg, fmtDateTime, pctChange, presetRange, type DateRange, type Tone } from "../../components/erp";
import { BarChart } from "../../components/erp/charts";
import { FeedbackForm } from "./Feedback";
import "../../styles/ai.css";

type Totals = {
  messages: number; llmCalls: number; conversations: number; handoffConversations: number; selfResolvedRate: number | null;
  promptTokens: number; outputTokens: number; thinkingTokens: number; tokens: number; costVnd: number; avgLatencyMs: number; p95LatencyMs: number; good: number; bad: number;
};
type Dash = {
  range: { from: string; to: string; days: number };
  totals: Totals;
  previous: Totals;
  agents: { total: number; active: number; online: number };
  daily: { day: string; runs: number; llm: number; tokens: number; costVnd: number }[];
  kinds: { kind: string; count: number; avgLatencyMs: number }[];
  topAgents: { agentId: number; name: string; enabled: boolean; runs: number; tokens: number; costVnd: number }[];
  unanswered: { question: string; count: number; lastAt: string; kinds: string[]; runId: number }[];
  live: {
    pending: { sessionId: number; guestName: string; storeName: string; dueAt: string; lastMessage: string }[];
    handoffs: { sessionId: number; guestName: string; storeName: string; summary: string | null; at: string }[];
  };
  recent: RunRow[];
};
type RunRow = {
  id: number; kind: string; input: string; output: string; latencyMs: number; costVnd: number; createdAt: string; sessionId: number | null;
  errorMessage: string | null; agentName?: string; agent?: { id: number; name: string }; rating?: string | null; storeName?: string | null;
  promptTokens?: number; outputTokens?: number; thinkingTokens?: number; model?: string | null;
};
type RunDetail = RunRow & {
  retrieved: { chunkId: number; title: string; heading: string | null; vectorScore: number | null; keywordScore: number | null; content: string | null }[];
  toolCalls: { name: string; args: unknown; resultSummary: string; ms: number }[] | null;
  correction: string | null; ratedBy: string | null; session: { id: number; guestName: string; status: string } | null;
};

/** Loại xử lý: nhãn + tông (chỉ dùng nhãn chữ, không phân biệt bằng màu) */
export const KIND: Record<string, { label: string; tone: Tone }> = {
  RAG: { label: "AI trả lời", tone: "success" },
  QUICK_REPLY: { label: "Mẫu trả lời nhanh", tone: "info" },
  FALLBACK: { label: "Không có căn cứ", tone: "warning" },
  HANDOFF: { label: "Chuyển nhân viên", tone: "warning" },
  OUT_OF_HOURS: { label: "Ngoài giờ", tone: "neutral" },
  LIMIT: { label: "Hết lượt", tone: "danger" },
  ERROR: { label: "Lỗi", tone: "danger" },
  TEST: { label: "Thử agent", tone: "neutral" },
};
const vi = new Intl.NumberFormat("vi-VN");
const vnd = (n: number) => `${vi.format(Math.round(n))}đ`;
const tok = (n: number) => (n >= 1e6 ? `${(n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr` : n >= 1e3 ? `${(n / 1e3).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}k` : vi.format(n));
const sec = (ms: number) => `${(ms / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} giây`;
const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Trí tuệ nhân tạo › Bảng điều khiển AI (Chủ chuỗi) */
export function AiDashboard() {
  const [range, setRange] = useState<DateRange>(() => presetRange("7d"));
  const [agentId, setAgentId] = useState("");
  const [tab, setTab] = useState<"overview" | "runs">("overview");
  const [data, setData] = useState<Dash | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openRun, setOpenRun] = useState<number | null>(null);
  const [answering, setAnswering] = useState<Dash["unanswered"][number] | null>(null);

  const qs = `from=${range.from}&to=${range.to}${agentId ? `&agentId=${agentId}` : ""}`;
  const load = useCallback(async () => {
    try {
      setData(await staffApi<Dash>(`/api/ai/dashboard?${qs}`));
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [qs]);
  useEffect(() => {
    void load();
    // Khối "Đang xử lý" cập nhật mỗi 15 giây
    const t = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(t);
  }, [load]);

  return (
    <div className="kb-page">
      <PageHeader
        title="Bảng điều khiển AI"
        description="AI đang xử lý gì, trả lời được bao nhiêu, dùng bao nhiêu token và chi phí"
        actions={
          <>
            <select className="o-input" value={agentId} onChange={(e) => setAgentId(e.target.value)} aria-label="Lọc theo agent" style={{ width: "auto" }}>
              <option value="">Tất cả agent</option>
              {data?.topAgents.map((a) => <option key={a.agentId} value={a.agentId}>{a.name}</option>)}
            </select>
            <DateRangePicker value={range} onChange={setRange} />
          </>
        }
      />
      {err && <Alert>{err}</Alert>}
      <Tabs tabs={[{ id: "overview", label: "Tổng quan" }, { id: "runs", label: "Lịch sử thực thi" }]} active={tab} onChange={setTab} />
      {tab === "overview" ? (
        data ? <Overview d={data} onOpenRun={setOpenRun} onAnswer={setAnswering} /> : <div className="o-muted">Đang tải…</div>
      ) : (
        <RunHistory from={range.from} to={range.to} agentId={agentId} onOpen={setOpenRun} />
      )}
      {openRun != null && <RunDrawer id={openRun} onClose={() => setOpenRun(null)} onChanged={() => void load()} />}
      {answering && <AnswerModal item={answering} onClose={() => setAnswering(null)} onDone={() => { setAnswering(null); void load(); }} />}
    </div>
  );
}

/* ═══════════ Tổng quan ═══════════ */
function Overview({ d, onOpenRun, onAnswer }: { d: Dash; onOpenRun: (id: number) => void; onAnswer: (u: Dash["unanswered"][number]) => void }) {
  const [metric, setMetric] = useState<"runs" | "tokens" | "costVnd">("runs");
  const t = d.totals;
  const p = d.previous;
  const rate = (x: Totals) => (x.selfResolvedRate == null ? null : x.selfResolvedRate * 100);
  const chartData = useMemo(() => d.daily.map((x) => ({ day: `${x.day.slice(8, 10)}/${x.day.slice(5, 7)}`, runs: x.runs, tokens: x.tokens, costVnd: Math.round(x.costVnd) })), [d.daily]);
  const METRIC = { runs: { label: "Tin AI xử lý", fmt: (n: number) => vi.format(n) }, tokens: { label: "Token", fmt: tok }, costVnd: { label: "Chi phí (đ)", fmt: vnd } } as const;
  const maxKind = Math.max(1, ...d.kinds.map((k) => k.count));
  const rated = t.good + t.bad;

  return (
    <>
      <div className="o-dash-kpis ai-kpis">
        <KpiCard icon={Bot} tone="primary" label="Agent đang hoạt động" value={`${d.agents.online}/${d.agents.total}`} sub={`${d.agents.active} agent đang bật và đã gán kênh`} />
        <KpiCard icon={MessageSquareText} tone="blue" label="Tin nhắn AI đã xử lý" value={vi.format(t.messages)} change={pctChange(t.messages, p.messages)} sub={`${vi.format(t.llmCalls)} lượt gọi AI, còn lại là mẫu nhanh / ngoài giờ`} />
        <KpiCard icon={MessagesSquare} tone="orange" label="Hội thoại có AI" value={vi.format(t.conversations)} change={pctChange(t.conversations, p.conversations)} sub={`${t.handoffConversations} hội thoại phải chuyển nhân viên`} />
        <KpiCard icon={Activity} tone="green" label="Tỉ lệ tự giải quyết" value={t.selfResolvedRate == null ? "—" : `${Math.round(t.selfResolvedRate * 100)}%`} change={pctChange(rate(t) ?? 0, rate(p))} sub="Hội thoại AI xử lý xong, không cần nhân viên" />
        <KpiCard icon={Coins} tone="red" invert label="Token & chi phí ước tính" value={tok(t.tokens)} change={pctChange(t.costVnd, p.costVnd)} sub={`${vnd(t.costVnd)} · vào ${tok(t.promptTokens)} · ra ${tok(t.outputTokens)} · suy luận ${tok(t.thinkingTokens)}`} />
      </div>

      <section className="o-dcard ai-live">
        <div className="o-dcard-head">
          <div>
            <h2 className="o-dcard-title">Đang xử lý</h2>
            <p className="o-dcard-desc">Cập nhật mỗi 15 giây</p>
          </div>
        </div>
        <div className="ai-live-cols">
          <div>
            <h3 className="ag-sub">AI sắp trả lời ({d.live.pending.length})</h3>
            {!d.live.pending.length ? <p className="o-muted">Không có câu hỏi nào đang chờ AI.</p> : (
              <ul className="ai-list">
                {d.live.pending.map((s) => (
                  <li key={s.sessionId}>
                    <strong>{s.guestName}</strong> <span className="o-muted">· {s.storeName} · trả lời lúc {new Date(s.dueAt).toLocaleTimeString("vi-VN")}</span>
                    <div>{short(s.lastMessage || "—", 140)}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="ag-sub">Đã chuyển, chờ nhân viên ({d.live.handoffs.length})</h3>
            {!d.live.handoffs.length ? <p className="o-muted">Không có phiên nào chờ nhân viên.</p> : (
              <ul className="ai-list">
                {d.live.handoffs.map((s) => (
                  <li key={s.sessionId}>
                    <strong>{s.guestName}</strong> <span className="o-muted">· {s.storeName} · {fmtDateTime(s.at)}</span>
                    {s.summary && <div>{short(s.summary, 220)}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <div className="ai-grid2">
        <section className="o-dcard">
          <div className="o-dcard-head">
            <div>
              <h2 className="o-dcard-title">{METRIC[metric].label} theo ngày</h2>
              <p className="o-dcard-desc">Tổng kỳ: {METRIC[metric].fmt(metric === "runs" ? t.messages : metric === "tokens" ? t.tokens : t.costVnd)}</p>
            </div>
            <div className="o-seg" role="tablist" aria-label="Số liệu biểu đồ">
              {(Object.keys(METRIC) as (keyof typeof METRIC)[]).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={metric === k} className={metric === k ? "active" : ""} onClick={() => setMetric(k)}>
                  {k === "runs" ? "Tin nhắn" : k === "tokens" ? "Token" : "Chi phí"}
                </button>
              ))}
            </div>
          </div>
          {chartData.length ? (
            <BarChart data={chartData} xKey="day" series={[{ key: metric, label: METRIC[metric].label }]} format={METRIC[metric].fmt} yFormat={metric === "runs" ? (n) => vi.format(n) : tok} ariaLabel={`${METRIC[metric].label} theo ngày`} />
          ) : (
            <EmptyState title="Chưa có dữ liệu trong kỳ" />
          )}
        </section>

        <section className="o-dcard">
          <div className="o-dcard-head">
            <div>
              <h2 className="o-dcard-title">Cách xử lý</h2>
              <p className="o-dcard-desc">Độ trễ khi gọi AI: trung bình {sec(t.avgLatencyMs)} · 95% lượt dưới {sec(t.p95LatencyMs)}</p>
            </div>
          </div>
          {!d.kinds.length ? <EmptyState title="Chưa có dữ liệu" /> : (
            <ul className="ai-bars">
              {d.kinds.map((k) => (
                <li key={k.kind}>
                  <span className="ai-bars-label">{KIND[k.kind]?.label ?? k.kind}</span>
                  <span className="ai-bars-track"><span style={{ width: `${(k.count / maxKind) * 100}%` }} /></span>
                  <span className="ai-bars-val">{vi.format(k.count)}{k.avgLatencyMs > 0 ? <small> · {sec(k.avgLatencyMs)}</small> : null}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="ai-rating">
            <span><ThumbsUp size={14} aria-hidden /> Đúng {t.good}</span>
            <span><ThumbsDown size={14} aria-hidden /> Sai {t.bad}</span>
            <span className="o-muted">{rated ? `Nhân viên đánh giá đúng ${Math.round((t.good / rated) * 100)}%` : "Chưa có đánh giá"}</span>
          </div>
        </section>
      </div>

      <div className="ai-grid2">
        <section className="o-dcard">
          <h2 className="o-dcard-title">Câu hỏi AI chưa trả lời được</h2>
          <p className="o-dcard-desc">Khách hỏi mà AI không có căn cứ, phải chuyển nhân viên hoặc lỗi — gom câu gần giống. Bổ sung câu trả lời để lần sau AI trả lời được.</p>
          {!d.unanswered.length ? <EmptyState icon={ThumbsUp} title="Không có câu hỏi nào bị bỏ lỡ trong kỳ" /> : (
            <ol className="ai-unanswered">
              {d.unanswered.map((u) => (
                <li key={u.runId}>
                  <div>
                    <strong>{u.question}</strong>
                    <span className="o-muted">{u.count} lần · {u.kinds.map((k) => KIND[k]?.label ?? k).join(", ")} · gần nhất {fmtDateTime(u.lastAt)}</span>
                  </div>
                  <Button size="sm" onClick={() => onAnswer(u)}>Thêm câu trả lời</Button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="o-dcard">
          <h2 className="o-dcard-title">Agent theo số tin xử lý</h2>
          {!d.topAgents.length ? <EmptyState title="Chưa có dữ liệu" /> : (
            <div className="ai-table-scroll">
            <table className="o-list">
              <thead><tr><th>Agent</th><th className="num">Tin</th><th className="num">Token</th><th className="num">Chi phí</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {d.topAgents.map((a) => (
                  <tr key={a.agentId}>
                    <td><Link to={`/app/ai/agents/${a.agentId}`}>{a.name}</Link></td>
                    <td className="num">{vi.format(a.runs)}</td>
                    <td className="num">{tok(a.tokens)}</td>
                    <td className="num">{vnd(a.costVnd)}</td>
                    <td>{a.enabled ? <Badge tone="success">Bật</Badge> : <Badge>Tắt</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
          <h3 className="ag-sub" style={{ marginTop: 16 }}>Mới nhất</h3>
          <ul className="ai-list">
            {d.recent.map((r) => (
              <li key={r.id} className="is-click" onClick={() => onOpenRun(r.id)}>
                <Badge tone={KIND[r.kind]?.tone ?? "neutral"}>{KIND[r.kind]?.label ?? r.kind}</Badge> <span className="o-muted">{fmtDateTime(r.createdAt)} · {r.agentName}</span>
                <div>{short(r.input.split("\n").pop() ?? r.input)}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <p className="o-muted ai-note">Chi phí là ước tính theo giá token cấu hình ở backend (AI_PRICE_INPUT_USD_PER_M, AI_PRICE_OUTPUT_USD_PER_M, AI_USD_VND). Không tính lượt "Thử agent".</p>
    </>
  );
}

/* ═══════════ Lịch sử thực thi ═══════════ */
function RunHistory({ from, to, agentId, onOpen }: { from: string; to: string; agentId: string; onOpen: (id: number) => void }) {
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [rated, setRated] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [res, setRes] = useState<{ total: number; pageSize: number; items: RunRow[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setPage(1), [from, to, agentId, kind, status, rated, query]);
  useEffect(() => {
    const p = new URLSearchParams({ from, to, page: String(page) });
    if (agentId) p.set("agentId", agentId);
    if (kind) p.set("kind", kind);
    if (status) p.set("status", status);
    if (rated) p.set("rated", rated);
    if (query) p.set("q", query);
    staffApi<{ total: number; pageSize: number; items: RunRow[] }>(`/api/ai/runs?${p}`).then(setRes).catch((e) => setErr(errMsg(e)));
  }, [from, to, agentId, kind, status, rated, query, page]);

  const pages = res ? Math.max(1, Math.ceil(res.total / res.pageSize)) : 1;
  return (
    <section className="o-dcard ai-runs">
      <div className="ai-filters">
        <form onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }} className="kb-search">
          <Search size={16} aria-hidden />
          <input className="o-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm trong câu hỏi của khách" aria-label="Tìm câu hỏi" />
        </form>
        <select className="o-input" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Loại xử lý">
          <option value="">Mọi loại</option>
          {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="o-input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Trạng thái">
          <option value="">Mọi trạng thái</option>
          <option value="ok">Thành công</option>
          <option value="error">Lỗi</option>
        </select>
        <select className="o-input" value={rated} onChange={(e) => setRated(e.target.value)} aria-label="Đánh giá">
          <option value="">Mọi đánh giá</option>
          <option value="yes">Đã đánh giá</option>
          <option value="bad">Bị đánh giá Sai</option>
          <option value="no">Chưa đánh giá</option>
        </select>
        {res && res.items.length > 0 && (
          <Button
            icon={Download}
            onClick={() =>
              downloadCsv(
                `ai-lich-su-${from}_${to}.csv`,
                ["Thời điểm", "Agent", "Chi nhánh", "Loại", "Câu hỏi", "Trả lời", "Token vào", "Token ra", "Suy luận", "Chi phí (đ)", "Độ trễ (ms)", "Đánh giá", "Lỗi"],
                res.items.map((r) => [fmtDateTime(r.createdAt), r.agent?.name ?? "", r.storeName ?? "", KIND[r.kind]?.label ?? r.kind, r.input, r.output, r.promptTokens ?? 0, r.outputTokens ?? 0, r.thinkingTokens ?? 0, Math.round(r.costVnd), r.latencyMs, r.rating ?? "", r.errorMessage ?? ""]),
              )
            }
          >
            Xuất CSV
          </Button>
        )}
      </div>
      {err && <Alert>{err}</Alert>}
      {!res ? <div className="o-muted">Đang tải…</div> : !res.items.length ? <EmptyState icon={Search} title="Không có lượt xử lý nào khớp" /> : (
        <div className="kb-table-wrap">
          <table className="o-list ai-run-table">
            <thead>
              <tr><th>Thời điểm</th><th>Loại</th><th>Câu hỏi</th><th>Trả lời</th><th>Agent · chi nhánh</th><th className="num">Token</th><th className="num">Chi phí</th><th className="num">Độ trễ</th><th>Đánh giá</th></tr>
            </thead>
            <tbody>
              {res.items.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => onOpen(r.id)}>
                  <td>{fmtDateTime(r.createdAt)}</td>
                  <td><Badge tone={r.errorMessage ? "danger" : KIND[r.kind]?.tone ?? "neutral"}>{KIND[r.kind]?.label ?? r.kind}</Badge></td>
                  <td className="wrap">{short(r.input.split("\n").pop() ?? r.input, 80)}</td>
                  <td className="wrap o-muted">{short(r.output, 80)}</td>
                  <td>{r.agent?.name}{r.storeName ? <div className="kb-desc">{r.storeName}</div> : null}</td>
                  <td className="num">{tok((r.promptTokens ?? 0) + (r.outputTokens ?? 0) + (r.thinkingTokens ?? 0))}</td>
                  <td className="num">{vnd(r.costVnd)}</td>
                  <td className="num">{r.latencyMs ? sec(r.latencyMs) : "—"}</td>
                  <td>{r.rating === "GOOD" ? <Badge tone="success">Đúng</Badge> : r.rating === "BAD" ? <Badge tone="danger">Sai</Badge> : <span className="o-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {res && res.total > res.pageSize && (
        <div className="ai-pager">
          <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</Button>
          <span className="o-muted">Trang {page}/{pages} · {vi.format(res.total)} lượt</span>
          <Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Sau</Button>
        </div>
      )}
    </section>
  );
}

function AnswerModal({ item, onClose, onDone }: { item: Dash["unanswered"][number]; onClose: () => void; onDone: () => void }) {
  return (
    <div className="kb-drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <aside className="kb-drawer" role="dialog" aria-modal="true" aria-label="Thêm câu trả lời">
        <header className="kb-drawer-head">
          <div>
            <h2>Thêm câu trả lời vào kho</h2>
            <span className="o-muted">Lưu thành cặp Hỏi–Đáp trong tài liệu "Câu trả lời đã sửa" của kho được chọn.</span>
          </div>
          <Button variant="link" icon={X} onClick={onClose} aria-label="Đóng" />
        </header>
        <div className="kb-drawer-body">
          <p><strong>Khách hỏi:</strong> {item.question}</p>
          <p className="o-muted">{item.count} lần trong kỳ</p>
          <FeedbackForm runId={item.runId} initial={{ rating: "BAD" }} onDone={onDone} />
        </div>
      </aside>
    </div>
  );
}

/* ═══════════ Chi tiết một lượt ═══════════ */
function RunDrawer({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const [r, setR] = useState<RunDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    staffApi<RunDetail>(`/api/ai/runs/${id}`).then(setR).catch((e) => setErr(errMsg(e)));
  }, [id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="kb-drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <aside className="kb-drawer ai-run-drawer" role="dialog" aria-modal="true" aria-label={`Lượt xử lý #${id}`}>
        <header className="kb-drawer-head">
          <div>
            <h2>Lượt xử lý #{id}</h2>
            {r && <span className="o-muted">{fmtDateTime(r.createdAt)} · {r.agent?.name}{r.storeName ? ` · ${r.storeName}` : ""}{r.session ? ` · khách ${r.session.guestName} (phiên #${r.session.id})` : ""}</span>}
          </div>
          <Button variant="link" icon={X} onClick={onClose} aria-label="Đóng" />
        </header>
        <div className="kb-drawer-body">
          {err && <Alert>{err}</Alert>}
          {!r ? <Loader2 className="kb-spin" aria-hidden /> : (
            <>
              <div className="ag-badges">
                <Badge tone={KIND[r.kind]?.tone ?? "neutral"}>{KIND[r.kind]?.label ?? r.kind}</Badge>
                {r.model && <Badge>{r.model}</Badge>}
                <Badge><Timer size={12} aria-hidden /> {r.latencyMs ? sec(r.latencyMs) : "—"}</Badge>
                <Badge>{tok(r.promptTokens ?? 0)} vào · {tok(r.outputTokens ?? 0)} ra · {tok(r.thinkingTokens ?? 0)} suy luận</Badge>
                <Badge>{vnd(r.costVnd)}</Badge>
              </div>
              {r.errorMessage && <Alert>{r.errorMessage}</Alert>}
              <h4 className="ai-h">Khách hỏi</h4>
              <p className="ai-pre">{r.input || "—"}</p>
              <h4 className="ai-h">AI trả lời</h4>
              <p className="ai-pre">{r.output || "—"}</p>
              <h4 className="ai-h">Đoạn tài liệu đã đưa vào ({r.retrieved.length})</h4>
              {!r.retrieved.length ? <p className="o-muted">Không dùng tài liệu.</p> : r.retrieved.map((c, i) => (
                <details key={c.chunkId} className="kb-chunk">
                  <summary>
                    <span className="kb-chunk-n">{i + 1}</span> {c.title}{c.heading ? ` › ${c.heading}` : ""} <span className="o-muted">· vector {c.vectorScore?.toFixed(3) ?? "—"} · từ khóa {c.keywordScore?.toFixed(2) ?? "—"}</span>
                  </summary>
                  <p>{c.content ?? "(đoạn đã bị xoá hoặc xử lý lại)"}</p>
                </details>
              ))}
              <h4 className="ai-h">Công cụ đã gọi ({r.toolCalls?.length ?? 0})</h4>
              {!r.toolCalls?.length ? <p className="o-muted">Không gọi công cụ.</p> : (
                <ol className="ai-tools">
                  {r.toolCalls.map((c, i) => (
                    <li key={i}><code>{c.name}({JSON.stringify(c.args)})</code> <span className="o-muted">{c.ms} ms</span><div className="ag-tool-res">{c.resultSummary}</div></li>
                  ))}
                </ol>
              )}
              <h4 className="ai-h">Đánh giá{r.ratedBy ? ` (${r.ratedBy})` : ""}</h4>
              <FeedbackForm runId={r.id} initial={{ rating: r.rating, correction: r.correction }} onDone={() => onChanged()} />
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
