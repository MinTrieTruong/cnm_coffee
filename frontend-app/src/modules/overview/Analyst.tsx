/**
 * Tổng quan › Trợ lý AI — hỏi số liệu bằng tiếng Việt kiểu ChatGPT (Chủ chuỗi / Quản lý chi nhánh).
 *
 * Trái: danh sách hội thoại; phải: khung chat. Điện thoại: một cột, danh sách mở bằng nút ở đầu trang.
 * Câu trả lời: markdown + biểu đồ (dữ liệu do backend lấy từ kết quả công cụ) + dòng "Đã tra" + đánh giá + câu hỏi gợi ý.
 * Trong lúc chờ: socket phòng staff_<id> đẩy "analyst:status" theo từng công cụ đang chạy.
 * Mỗi hội thoại chờ riêng — đang hỏi ở hội thoại này vẫn gõ được ở hội thoại khác.
 * API: /api/analyst/* (backend-node/src/routes/analyst.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Mic,
  MicOff,
  MessagesSquare,
  Plus,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import { getStaffInfo, isOwnerRole, staffApi, staffSocket } from "../../lib/staffApi";
import { refreshAiFeatures } from "../../lib/aiFeatures";
import { errMsg } from "../../components/erp";
import { StoreSwitcher } from "../../components/erp/StoreSwitcher";
import { Bar, BarChart as RBarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart, CHART_COLORS, DonutChart, LineChart, compactVnd, type Series } from "../../components/erp/charts";
import { MiniMarkdown } from "../../components/MiniMarkdown";
import "../../styles/analyst.css";

type ToolCall = { name: string; label: string; args: Record<string, unknown>; rowCount: number; ms: number; error?: string };
type Chart = { type: "bar" | "line" | "pie" | "table"; title: string; x: string; y: string[]; units: Record<string, string>; data: Record<string, unknown>[] };
type Msg = {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  charts?: Chart[] | null;
  toolCalls?: ToolCall[] | null;
  followUps?: string[] | null;
  rating?: number;
  /** Câu hỏi gửi lỗi (hiện nút gửi lại) */
  failed?: string;
};
type Conv = { id: number; title: string; updatedAt: string };
type Pending = { requestId: string; status: string | null };

const MAX_LEN = 500;
const NEW = "new";
const keyOf = (id: number) => `c${id}`;
const idOf = (key: string) => (key.startsWith("c") ? Number(key.slice(1)) : null);
const rid = () => Math.random().toString(36).slice(2, 12);

/* ═══════════ Định dạng ═══════════ */

const num = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
const vnd = (n: number) => `${num.format(Math.round(n))}đ`;

/** Ngày "2026-11-01" → "01/11"; tháng "2026-10" → "10/2026" */
function fmtLabel(v: unknown): string {
  const s = String(v ?? "");
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return `${m[3]}/${m[2]}`;
  m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) return `${m[2]}/${m[1]}`;
  return s;
}

function fmtValue(v: unknown, unit?: string): string {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "Có" : "Không";
  if (typeof v !== "number") return fmtLabel(v);
  if (unit === "đ") return vnd(v);
  if (unit === "%") return `${num.format(v)}%`;
  return unit && !unit.startsWith("theo") ? `${num.format(v)} ${unit}` : num.format(v);
}

/** Tên cột tiếng Việt cho biểu đồ / bảng */
const COL_LABEL: Record<string, string> = {
  label: "Nhóm", name: "Tên", period: "Kỳ", revenue: "Doanh thu", orders: "Số đơn", avgOrder: "Giá trị đơn TB",
  qty: "Số lượng", profit: "Lãi gộp", category: "Danh mục", current: "Kỳ này", previous: "Kỳ trước", diff: "Chênh lệch",
  pct: "% thay đổi", reason: "Lý do", count: "Số lần", cost: "Giá trị", sharePct: "Tỷ trọng", kind: "Loại", unit: "Đơn vị",
  store: "Chi nhánh", item: "Nguyên liệu", stock: "Tồn", min: "Tối thiểu", expiry: "Hạn dùng", daysLeft: "Còn (ngày)",
  stars: "Số sao", rating: "Sao", comment: "Nhận xét", date: "Ngày", product: "Món", total: "Tổng", open: "Đang mở",
  resolved: "Đã xử lý", role: "Vai trò", shifts: "Số ca", lateCount: "Đi muộn (lần)", lateMinutes: "Đi muộn (phút)",
  earlyCount: "Về sớm (lần)", absentCount: "Vắng (ca)", cashier: "Thu ngân", expected: "Dự kiến", actual: "Thực đếm",
  reviewed: "Đã duyệt", code: "Mã phiếu", amount: "Số tiền", term: "Từ khóa", searchers: "Số khách tìm",
  zeroSearchers: "Tìm không ra", zeroRatePct: "Tỷ lệ không ra", status: "Tình trạng", typoOf: "Có thể gõ nhầm", id: "Mã", active: "Đang hoạt động",
};
const colLabel = (k: string) => COL_LABEL[k] ?? k;

const fmtYmd = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}` : null);

const GROUP_LABEL: Record<string, string> = { day: "ngày", week: "tuần", month: "tháng", store: "chi nhánh", hour: "giờ", weekday: "thứ", channel: "kênh", product: "món" };

/** "Doanh thu theo chi nhánh 01/11–07/11 · Chi nhánh 1" */
function toolSummary(t: ToolCall, stores: Map<number, string>) {
  const from = fmtYmd(t.args.from);
  const to = fmtYmd(t.args.to);
  const range = from && to ? (from === to ? ` ${from}` : ` ${from}–${to}`) : "";
  const group = GROUP_LABEL[String(t.args.groupBy)] ? ` theo ${GROUP_LABEL[String(t.args.groupBy)]}` : "";
  const sid = Number(t.args.storeId);
  const store = Number.isInteger(sid) && sid > 0 ? ` · ${stores.get(sid) ?? `CN #${sid}`}` : "";
  return `${t.label}${group}${range}${store}`;
}

/** Bỏ phần đầu chung của các nhãn ("TD Coffee - Chi nhánh 1", "TD Coffee - Chi nhánh 2" → "Chi nhánh 1", "Chi nhánh 2") */
function stripCommonPrefix(labels: string[]) {
  if (labels.length < 2) return labels;
  let pre = labels[0];
  for (const l of labels) while (!l.startsWith(pre)) pre = pre.slice(0, -1);
  // Chỉ cắt tới dấu ngăn cách ( - , : · ) để không cắt giữa chữ
  const cut = Math.max(pre.lastIndexOf(" - "), pre.lastIndexOf(": "), pre.lastIndexOf(" · "));
  return cut > 0 ? labels.map((l) => l.slice(cut + 3).trim() || l) : labels;
}

/* ═══════════ Biểu đồ ═══════════ */

/** Nhãn là thời gian (ngày, tháng, giờ, thứ) thì vẽ cột đứng; nhãn là tên (món, chi nhánh…) thì cột ngang để đọc đủ chữ */
const TIME_LABEL = /^(\d{2}\/\d{2}(\/\d{4})?|\d{1,2}h|Thứ \d|Chủ nhật)$/;

/** Cột ngang: tên ở trục dọc, mỗi nhóm một hàng */
function HBarChart({ data, series, format, ariaLabel }: { data: Record<string, string | number>[]; series: Series[]; format: (n: number) => string; ariaLabel: string }) {
  const height = Math.max(160, data.length * (series.length > 1 ? 44 : 32) + 40);
  const short = (v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v);
  return (
    <figure className="o-chart" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={height}>
        <RBarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid horizontal={false} stroke="#F3F4F6" />
          <XAxis type="number" tick={{ fill: "#6B7280", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(n: number) => compactVnd(n)} />
          <YAxis type="category" dataKey="_x" tick={{ fill: "#374151", fontSize: 12 }} axisLine={false} tickLine={false} width={150} tickFormatter={short} interval={0} />
          <Tooltip formatter={(v: number, name: string) => [format(v), name]} cursor={{ fill: "#F9FAFB" }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} />
          ))}
        </RBarChart>
      </ResponsiveContainer>
    </figure>
  );
}

function ChartView({ chart }: { chart: Chart }) {
  const unitOf = (k: string) => chart.units[k];
  if (chart.type === "table") {
    const cols = [chart.x, ...chart.y];
    return (
      <div className="an-table-wrap">
        <table className="an-table">
          <thead>
            <tr>{cols.map((c) => <th key={c}>{colLabel(c)}</th>)}</tr>
          </thead>
          <tbody>
            {chart.data.map((r, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c} className={typeof r[c] === "number" ? "num" : undefined}>{fmtValue(r[c], unitOf(c))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const labels = stripCommonPrefix(chart.data.map((r) => fmtLabel(r[chart.x])));
  const data = chart.data.map((r, i) => {
    const row: Record<string, string | number> = { _x: labels[i] };
    for (const k of chart.y) row[k] = typeof r[k] === "number" ? (r[k] as number) : Number(r[k]) || 0;
    return row;
  });
  const money = chart.y.every((k) => unitOf(k) === "đ");
  const format = (n: number) => fmtValue(n, chart.y.length === 1 || money ? unitOf(chart.y[0]) : undefined);
  if (chart.type === "pie") {
    const k = chart.y[0];
    return <DonutChart data={data.map((d) => ({ label: String(d._x), value: Number(d[k]) }))} format={(n) => fmtValue(n, unitOf(k))} centerLabel={colLabel(k)} ariaLabel={chart.title} />;
  }
  const series: Series[] = chart.y.map((k) => ({ key: k, label: colLabel(k) }));
  const yFormat = money ? compactVnd : (n: number) => num.format(n);
  if (chart.type === "bar" && !data.every((d) => TIME_LABEL.test(String(d._x)))) {
    return <HBarChart data={data} series={series} format={format} ariaLabel={chart.title} />;
  }
  return chart.type === "line" ? (
    <LineChart data={data} xKey="_x" series={series} format={format} yFormat={yFormat} ariaLabel={chart.title} />
  ) : (
    <BarChart data={data} xKey="_x" series={series} format={format} yFormat={yFormat} ariaLabel={chart.title} barSize={data.length > 12 ? 8 : 18} />
  );
}

/* ═══════════ Một câu trả lời ═══════════ */

function AnswerMessage({ msg, stores, onRate, onAsk, busy }: { msg: Msg; stores: Map<number, string>; onRate: (m: Msg, r: number) => void; onAsk: (q: string) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const tools = msg.toolCalls ?? [];
  const copy = () => {
    void navigator.clipboard?.writeText(msg.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="an-msg is-ai">
      <div className="an-avatar" aria-hidden><Sparkles size={16} /></div>
      <div className="an-body">
        <MiniMarkdown text={msg.content} className="an-answer" />
        {(msg.charts ?? []).map((c, i) => (
          <figure key={i} className="an-chart">
            {c.title && <figcaption>{c.title}</figcaption>}
            <ChartView chart={c} />
          </figure>
        ))}
        {tools.length > 0 && (
          <div className="an-tools">
            <button type="button" className="an-tools-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
              <span>Đã tra: {tools.map((t) => toolSummary(t, stores)).join(", ")}</span>
            </button>
            {open && (
              <ol className="an-tools-list">
                {tools.map((t, i) => (
                  <li key={i}>
                    <div className="an-tool-head">
                      <strong>{t.label}</strong> <code>{t.name}</code>
                      <span className="an-muted">· {t.error ? "lỗi" : `${t.rowCount} dòng`} · {t.ms} ms</span>
                    </div>
                    {t.error && <div className="an-tool-err">{t.error}</div>}
                    <dl className="an-tool-args">
                      {Object.entries(t.args).map(([k, v]) => (
                        <div key={k}>
                          <dt>{k}</dt>
                          <dd>{k === "storeId" ? `${v} (${stores.get(Number(v)) ?? "?"})` : String(v)}</dd>
                        </div>
                      ))}
                      {!Object.keys(t.args).length && <div><dd className="an-muted">(không tham số)</dd></div>}
                    </dl>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
        <div className="an-actions">
          <button type="button" className="an-icon-btn" onClick={copy} title="Sao chép" aria-label="Sao chép câu trả lời">
            {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
          </button>
          {typeof msg.id === "number" && (
            <>
              <button type="button" className={msg.rating === 1 ? "an-icon-btn is-on" : "an-icon-btn"} onClick={() => onRate(msg, 1)} title="Hữu ích" aria-label="Thích" aria-pressed={msg.rating === 1}>
                <ThumbsUp size={15} aria-hidden />
              </button>
              <button type="button" className={msg.rating === -1 ? "an-icon-btn is-on is-bad" : "an-icon-btn"} onClick={() => onRate(msg, -1)} title="Chưa đúng / chưa hữu ích" aria-label="Không thích" aria-pressed={msg.rating === -1}>
                <ThumbsDown size={15} aria-hidden />
              </button>
            </>
          )}
        </div>
        {!!msg.followUps?.length && (
          <div className="an-followups">
            {msg.followUps.map((f) => (
              <button key={f} type="button" className="an-chip" onClick={() => onAsk(f)} disabled={busy}>{f}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════ Giọng nói (Web Speech API) ═══════════ */

type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
const SpeechCtor = (): (new () => Recognition) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/* ═══════════ Màn hình ═══════════ */

export function Analyst() {
  const info = getStaffInfo();
  const owner = isOwnerRole(info?.role);
  const [params, setParams] = useSearchParams();
  const [convs, setConvs] = useState<Conv[]>([]);
  const [convsLoaded, setConvsLoaded] = useState(false);
  const [active, setActive] = useState<string>(NEW);
  const [messages, setMessages] = useState<Record<string, Msg[]>>({});
  const [pending, setPending] = useState<Record<string, Pending>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /** Hội thoại mới đang chờ câu trả lời đầu tiên (chưa có id) */
  const [newTitles, setNewTitles] = useState<Record<string, string>>({});
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [stores, setStores] = useState<Map<number, string>>(new Map());
  const [listening, setListening] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<Recognition | null>(null);
  const canSpeak = useMemo(() => !!SpeechCtor(), []);

  // Tính năng đang bật không, danh sách hội thoại, tên chi nhánh (cho dòng "Đã tra")
  useEffect(() => {
    staffApi<{ features: { feature: string; available: boolean; enabled: boolean }[]; hasKey: boolean }>("/api/ai/settings")
      .then((r) => {
        const f = r.features.find((x) => x.feature === "ANALYST");
        if (!f?.available) setUnavailable(!r.hasKey ? "Chưa cấu hình khóa Gemini." : "Trợ lý AI đang tạm tắt.");
      })
      .catch(() => {});
    staffApi<Conv[]>("/api/analyst/conversations")
      .then(setConvs)
      .catch((e) => (e as { status?: number }).status === 503 && setUnavailable(errMsg(e)))
      .finally(() => setConvsLoaded(true));
    if (owner) staffApi<{ id: number; name: string }[]>("/api/admin/stores").then((l) => setStores(new Map(l.map((s) => [s.id, s.name])))).catch(() => {});
    else if (info?.storeId) setStores(new Map([[info.storeId, info.storeName ?? `CN #${info.storeId}`]]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trạng thái từng công cụ đang chạy ("Đang tra doanh thu…")
  useEffect(() => {
    if (!info?.id) return;
    const s = staffSocket();
    const join = () => s.emit("join", `staff_${info.id}`);
    s.on("connect", join);
    s.on("analyst:status", (e: { requestId?: string; text?: string }) => {
      setPending((p) => {
        const key = Object.keys(p).find((k) => p[k].requestId === e.requestId);
        return key ? { ...p, [key]: { ...p[key], status: e.text ?? null } } : p;
      });
    });
    return () => {
      s.close();
    };
  }, [info?.id]);

  const openConv = useCallback(async (key: string) => {
    setActive(key);
    setListOpen(false);
    const id = idOf(key);
    if (id == null) return;
    setMessages((m) => (m[key] ? m : { ...m, [key]: [] }));
    try {
      const c = await staffApi<{ messages: Msg[] }>(`/api/analyst/conversations/${id}`);
      setMessages((m) => ({ ...m, [key]: c.messages }));
    } catch (e) {
      setErrors((x) => ({ ...x, [key]: errMsg(e, "Không tải được hội thoại.") }));
    }
  }, []);

  const send = useCallback(
    async (question: string, fromKey: string) => {
      const q = question.trim().slice(0, MAX_LEN);
      if (!q) return;
      const requestId = rid();
      // Hội thoại mới: giữ chỗ bằng khóa tạm tới khi server trả id
      const key = fromKey === NEW ? `t${requestId}` : fromKey;
      const convId = idOf(key);
      const userMsg: Msg = { id: `u${requestId}`, role: "user", content: q };
      setMessages((m) => ({ ...m, [key]: [...(fromKey === NEW ? [] : m[key] ?? []).filter((x) => !x.failed), userMsg] }));
      setPending((p) => ({ ...p, [key]: { requestId, status: null } }));
      setErrors((x) => ({ ...x, [key]: "" }));
      setDrafts((d) => ({ ...d, [fromKey]: "" }));
      if (fromKey === NEW) {
        setNewTitles((t) => ({ ...t, [key]: q.slice(0, 80) }));
        if (activeRef.current === NEW) setActive(key);
      }
      try {
        const res = await staffApi<{ conversationId: number; title: string; message: Msg }>("/api/analyst/ask", {
          method: "POST",
          body: JSON.stringify({ conversationId: convId ?? undefined, question: q, requestId }),
        });
        const real = keyOf(res.conversationId);
        setMessages((m) => {
          const next = { ...m, [real]: [...(m[key] ?? [userMsg]), res.message] };
          if (real !== key) delete next[key];
          return next;
        });
        setConvs((list) => [{ id: res.conversationId, title: res.title, updatedAt: new Date().toISOString() }, ...list.filter((c) => c.id !== res.conversationId)]);
        if (real !== key) {
          setNewTitles((t) => {
            const { [key]: _, ...rest } = t;
            return rest;
          });
          if (activeRef.current === key) setActive(real);
        }
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status === 503) {
          setUnavailable(errMsg(e, "Trợ lý AI đang tạm tắt."));
          refreshAiFeatures();
        }
        setMessages((m) => ({ ...m, [key]: (m[key] ?? []).map((x) => (x.id === userMsg.id ? { ...x, failed: q } : x)) }));
        setErrors((x) => ({ ...x, [key]: errMsg(e, "Không gửi được câu hỏi.") }));
      } finally {
        setPending((p) => {
          const { [key]: _, ...rest } = p;
          return rest;
        });
      }
    },
    [],
  );

  // Lối tắt từ Bảng điều khiển: /app/overview/assistant?q=…
  const sentQ = useRef(false);
  useEffect(() => {
    const q = params.get("q");
    if (!q || sentQ.current) return;
    sentQ.current = true;
    setParams({}, { replace: true });
    void send(q, NEW);
  }, [params, setParams, send]);

  const msgs = messages[active] ?? [];
  const busy = !!pending[active];
  const draft = drafts[active] ?? "";

  // Cuộn xuống cuối khi có tin mới / đang chờ (màn trống thì giữ ở đầu)
  const showWelcome = active === NEW || (!msgs.length && !busy);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = showWelcome ? 0 : el.scrollHeight;
  }, [msgs.length, busy, pending[active]?.status, active, showWelcome]);

  useEffect(() => {
    if (!unavailable) inputRef.current?.focus();
  }, [active, unavailable]);

  const submit = () => {
    if (!busy && draft.trim()) void send(draft, active);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const rate = async (m: Msg, r: number) => {
    const next = m.rating === r ? 0 : r;
    const upd = (rating: number | undefined) => setMessages((all) => ({ ...all, [active]: (all[active] ?? []).map((x) => (x.id === m.id ? { ...x, rating } : x)) }));
    upd(next);
    try {
      await staffApi(`/api/analyst/messages/${m.id}/rate`, { method: "POST", body: JSON.stringify({ rating: next }) });
    } catch {
      upd(m.rating);
    }
  };

  const remove = async (c: Conv) => {
    if (!window.confirm(`Xóa hội thoại "${c.title}"?`)) return;
    try {
      await staffApi(`/api/analyst/conversations/${c.id}`, { method: "DELETE" });
      setConvs((l) => l.filter((x) => x.id !== c.id));
      if (active === keyOf(c.id)) setActive(NEW);
    } catch (e) {
      window.alert(errMsg(e, "Không xóa được."));
    }
  };

  const toggleMic = () => {
    const Ctor = SpeechCtor();
    if (!Ctor) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = "vi-VN";
    rec.interimResults = false;
    rec.continuous = false;
    const key = active;
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      setDrafts((d) => ({ ...d, [key]: `${d[key] ? `${d[key]} ` : ""}${text}`.slice(0, MAX_LEN) }));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const samples = owner
    ? [
        "Tóm tắt tình hình hôm nay của cả chuỗi.",
        "Tuần này chi nhánh nào doanh thu giảm nhiều nhất so với tuần trước? Món nào kéo xuống?",
        "Top 5 món bán chạy tháng này, vẽ biểu đồ.",
        "Giờ nào vắng khách nhất trong 30 ngày qua?",
        "Tháng này hao hụt bao nhiêu tiền, nguyên nhân chính là gì?",
        "Khách chê gì nhiều nhất tuần qua?",
      ]
    : [
        "Tóm tắt tình hình hôm nay của chi nhánh.",
        "Doanh thu tuần này so với tuần trước thế nào? Món nào kéo xuống?",
        "Top 5 món bán chạy tháng này, vẽ biểu đồ.",
        "Nguyên liệu nào sắp hết hoặc sắp hết hạn?",
        "Tháng này hao hụt bao nhiêu tiền, nguyên nhân chính là gì?",
        "Ai đi trễ nhiều nhất tháng này?",
      ];

  if (unavailable) {
    return (
      <div className="an-off">
        <div className="an-off-icon" aria-hidden><Bot size={28} /></div>
        <h2>Trợ lý AI đang tạm tắt</h2>
        <p className="an-muted">{unavailable === "Trợ lý AI đang tạm tắt." ? "Bạn vẫn xem được số liệu ở các màn báo cáo thường:" : `${unavailable} Bạn vẫn xem được số liệu ở các màn báo cáo thường:`}</p>
        <div className="an-off-links">
          <Link to="/app/overview/home" className="o-btn o-btn-secondary">Bảng điều khiển</Link>
          <Link to="/app/overview/revenue" className="o-btn o-btn-secondary">Doanh thu</Link>
          <Link to="/app/overview/profit" className="o-btn o-btn-secondary">Lợi nhuận</Link>
          <Link to="/app/finance/pnl" className="o-btn o-btn-secondary">Lãi lỗ</Link>
          {owner && <Link to="/app/overview/compare" className="o-btn o-btn-secondary">So sánh chi nhánh</Link>}
        </div>
      </div>
    );
  }

  const pendingNew = Object.keys(newTitles).filter((k) => pending[k]);
  const list = (
    <aside className={listOpen ? "an-list is-open" : "an-list"} aria-label="Hội thoại">
      <div className="an-list-head">
        <button type="button" className="o-btn o-btn-primary an-new" onClick={() => { setActive(NEW); setListOpen(false); }}>
          <Plus size={16} aria-hidden /> Cuộc trò chuyện mới
        </button>
        <button type="button" className="an-icon-btn an-list-close" onClick={() => setListOpen(false)} aria-label="Đóng danh sách"><X size={18} aria-hidden /></button>
      </div>
      <nav className="an-list-items">
        {pendingNew.map((k) => (
          <button key={k} type="button" className={active === k ? "an-conv is-active" : "an-conv"} onClick={() => { setActive(k); setListOpen(false); }}>
            <span className="an-conv-title">{newTitles[k]}</span>
            <span className="an-dots" aria-label="Đang trả lời"><i /><i /><i /></span>
          </button>
        ))}
        {convs.map((c) => {
          const k = keyOf(c.id);
          return (
            <div key={c.id} className={active === k ? "an-conv is-active" : "an-conv"}>
              <button type="button" className="an-conv-open" onClick={() => void openConv(k)} title={c.title}>
                <span className="an-conv-title">{c.title}</span>
                {pending[k] && <span className="an-dots" aria-label="Đang trả lời"><i /><i /><i /></span>}
              </button>
              <button type="button" className="an-icon-btn an-conv-del" onClick={() => void remove(c)} aria-label={`Xóa hội thoại ${c.title}`} title="Xóa">
                <Trash2 size={14} aria-hidden />
              </button>
            </div>
          );
        })}
        {convsLoaded && !convs.length && !pendingNew.length && <p className="an-list-empty">Chưa có hội thoại nào.</p>}
      </nav>
    </aside>
  );

  const title = active === NEW ? "Cuộc trò chuyện mới" : convs.find((c) => keyOf(c.id) === active)?.title ?? newTitles[active] ?? "Trợ lý AI";

  return (
    <div className="an-page">
      {list}
      {listOpen && <div className="an-backdrop" onClick={() => setListOpen(false)} aria-hidden />}
      <section className="an-chat" aria-label="Trò chuyện với trợ lý AI">
        <header className="an-chat-head">
          <button type="button" className="an-icon-btn an-list-btn" onClick={() => setListOpen(true)} aria-label="Danh sách hội thoại">
            <MessagesSquare size={18} aria-hidden />
          </button>
          <Sparkles size={16} className="an-head-icon" aria-hidden />
          <h1 className="an-chat-title" title={title}>{title}</h1>
          {active !== NEW && (
            <button type="button" className="an-icon-btn" onClick={() => setActive(NEW)} aria-label="Cuộc trò chuyện mới" title="Cuộc trò chuyện mới">
              <Plus size={18} aria-hidden />
            </button>
          )}
        </header>

        <div className="an-scroll" ref={scrollRef}>
          {showWelcome ? (
            <div className="an-welcome">
              <div className="an-welcome-icon" aria-hidden><Sparkles size={26} /></div>
              <h2>Hỏi gì về số liệu của quán?</h2>
              <p className="an-muted">Trợ lý tự tra doanh thu, món bán, hao hụt, kho, đánh giá, chấm công… theo quyền của bạn, rồi tóm tắt và vẽ biểu đồ.</p>
              {owner && (
                <div className="an-scope">
                  <span className="an-muted">Phạm vi mặc định:</span>
                  <StoreSwitcher variant="side" />
                </div>
              )}
              <div className="an-samples">
                {samples.map((s) => (
                  <button key={s} type="button" className="an-sample" onClick={() => void send(s, active)} disabled={busy}>{s}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="an-msgs">
              {msgs.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className={m.failed ? "an-msg is-user is-failed" : "an-msg is-user"}>
                    <div className="an-bubble">{m.content}</div>
                    {m.failed && (
                      <button type="button" className="an-retry" onClick={() => void send(m.failed!, active)} disabled={busy}>Gửi lại</button>
                    )}
                  </div>
                ) : (
                  <AnswerMessage key={m.id} msg={m} stores={stores} onRate={rate} onAsk={(q) => void send(q, active)} busy={busy} />
                ),
              )}
              {busy && (
                <div className="an-msg is-ai">
                  <div className="an-avatar" aria-hidden><Sparkles size={16} /></div>
                  <div className="an-thinking" role="status">
                    <span>{pending[active]?.status ?? "Đang suy nghĩ"}</span>
                    <span className="an-dots" aria-hidden><i /><i /><i /></span>
                  </div>
                </div>
              )}
              {errors[active] && <div className="an-error" role="alert">{errors[active]}</div>}
            </div>
          )}
        </div>

        <form className="an-input" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDrafts((d) => ({ ...d, [active]: e.target.value.slice(0, MAX_LEN) }))}
            onKeyDown={onKey}
            placeholder={listening ? "Đang nghe…" : "Hỏi về doanh thu, món bán, kho, nhân sự…"}
            title="Enter để gửi, Shift+Enter để xuống dòng"
            rows={1}
            maxLength={MAX_LEN}
            aria-label="Câu hỏi cho trợ lý AI"
          />
          <div className="an-input-bar">
            {draft.length > MAX_LEN - 100 && <span className="an-count">{draft.length}/{MAX_LEN}</span>}
            {canSpeak && (
              <button type="button" className={listening ? "an-icon-btn is-rec" : "an-icon-btn"} onClick={toggleMic} aria-label={listening ? "Dừng nghe" : "Hỏi bằng giọng nói"} title={listening ? "Dừng nghe" : "Hỏi bằng giọng nói"}>
                {listening ? <MicOff size={18} aria-hidden /> : <Mic size={18} aria-hidden />}
              </button>
            )}
            <button type="submit" className="an-send" disabled={busy || !draft.trim()} aria-label="Gửi">
              <ArrowUp size={18} aria-hidden />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
