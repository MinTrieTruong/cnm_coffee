import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Clock, Crown, Cpu, Headphones, LifeBuoy, MessageCircle, Plus, Radio, Search, ShoppingBag, Sparkles } from "lucide-react";
import { getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
import { Alert, Badge, Button, EmptyState, PageHeader, errMsg, fmtDateTime } from "../../components/erp";
import { scheduleLabel, waitLabel, type Agent } from "../../lib/aiAgents";
import { GeminiNotice } from "./KnowledgeBases";
import "../../styles/ai.css";

export const AGENT_ICONS: Record<string, typeof Bot> = {
  DEFAULT: Bot, CHAT: MessageCircle, CREATIVE: Sparkles, TECH: Cpu, CSKH: Headphones, SALES: ShoppingBag, SUPPORT: LifeBuoy, VIP: Crown,
};
export const AgentIcon = ({ icon, size = 20 }: { icon: string; size?: number }) => {
  const I = AGENT_ICONS[icon] ?? Bot;
  return <span className="ag-icon"><I size={size} aria-hidden /></span>;
};

type Filter = "all" | "on" | "off";
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

/** Công tắc bật / tắt agent (dùng ở danh sách và trang sửa) */
export function AgentSwitch({ agent, onChange, disabled }: { agent: Pick<Agent, "id" | "enabled" | "name">; onChange: (a: Agent) => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="kb-switch" title={agent.enabled ? "Đang bật — bấm để tắt" : "Đang tắt — bấm để bật"} onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={agent.enabled}
        disabled={disabled || busy}
        aria-label={`Bật / tắt ${agent.name}`}
        onChange={async () => {
          setBusy(true);
          try {
            onChange(await staffApi<Agent>(`/api/ai/agents/${agent.id}/enabled`, { method: "PATCH", body: JSON.stringify({ enabled: !agent.enabled }) }));
          } catch (e) {
            alert(errMsg(e));
          } finally {
            setBusy(false);
          }
        }}
      />
    </label>
  );
}

/** Trí tuệ nhân tạo › AI Agents */
export function AgentList() {
  const nav = useNavigate();
  const owner = isOwnerRole(getStaffInfo()?.role);
  const [rows, setRows] = useState<Agent[]>([]);
  const [geminiReady, setGeminiReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    try {
      const r = await staffApi<{ items: Agent[]; geminiReady: boolean }>("/api/ai/agents");
      setRows(r.items);
      setGeminiReady(r.geminiReady);
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const shown = useMemo(() => {
    const nq = fold(q.trim());
    return rows.filter((a) => (filter === "all" || a.enabled === (filter === "on")) && (!nq || fold(`${a.name} ${a.description ?? ""}`).includes(nq)));
  }, [rows, q, filter]);
  const counts = { all: rows.length, on: rows.filter((a) => a.enabled).length, off: rows.filter((a) => !a.enabled).length };

  return (
    <div className="kb-page">
      <PageHeader
        title="AI Agents"
        description="Quản lý Agent. Gán vào kênh để bật trả lời tự động."
        actions={owner && <Button variant="primary" icon={Plus} onClick={() => nav("/app/ai/agents/new")}>Tạo agent mới</Button>}
      />
      {!geminiReady && <GeminiNotice />}
      {err && <Alert>{err}</Alert>}
      {!owner && <Alert tone="info">Chủ chuỗi tạo và cấu hình agent. Quản lý chi nhánh xem cấu hình và thử agent.</Alert>}

      <div className="kb-toolbar">
        <label className="kb-search">
          <Search size={16} aria-hidden />
          <input className="o-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm agent" aria-label="Tìm agent" />
        </label>
        <div className="o-task-filter" role="tablist" aria-label="Lọc agent">
          {([["all", "Tất cả"], ["on", "Đang bật"], ["off", "Đang tắt"]] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} className={`o-task-filter-btn${filter === k ? " active" : ""}`} onClick={() => setFilter(k)}>
              {label} <span className="o-task-filter-n">{counts[k]}</span>
            </button>
          ))}
        </div>
      </div>

      {loading && !rows.length ? (
        <div className="o-muted">Đang tải…</div>
      ) : !rows.length ? (
        <EmptyState
          icon={Bot}
          title="Chưa có agent nào"
          hint="Tạo agent, chọn kho tri thức, chỉnh giọng điệu và giờ hoạt động, rồi gán vào chat web để AI tự trả lời khách."
          action={owner && <Button variant="primary" icon={Plus} onClick={() => nav("/app/ai/agents/new")}>Tạo agent mới</Button>}
        />
      ) : !shown.length ? (
        <EmptyState icon={Search} title="Không có agent nào khớp" />
      ) : (
        <div className="kb-grid">
          {shown.map((a) => (
            <article key={a.id} className="o-dcard kb-card ag-card" onClick={() => nav(`/app/ai/agents/${a.id}`)} role="link" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && nav(`/app/ai/agents/${a.id}`)}>
              <header className="kb-card-head">
                <AgentIcon icon={a.icon} />
                <h3>{a.name}</h3>
                <AgentSwitch agent={a} disabled={!owner} onChange={(x) => setRows((r) => r.map((y) => (y.id === x.id ? { ...y, ...x } : y)))} />
              </header>
              <p className="kb-desc">{a.description || <span className="o-muted">Chưa có mô tả</span>}</p>
              <div className="ag-badges">
                {a.enabled ? <Badge tone={a.online ? "success" : "warning"}>{a.online ? "Đang bật" : "Ngoài giờ"}</Badge> : <Badge>Đang tắt</Badge>}
                <Badge tone={a.bindings.length ? "info" : "neutral"}><Radio size={12} aria-hidden /> {a.bindings.length} kênh</Badge>
                <Badge>{a.kbIds.length} kho tri thức</Badge>
              </div>
              <ul className="ag-facts">
                <li><Clock size={14} aria-hidden /> {scheduleLabel(a)} · {waitLabel(a)}</li>
                <li>{a.allowWebSearch ? "Được tìm trên Internet" : "Không tìm trên Internet"} · {a.runsToday ?? 0} lượt hôm nay</li>
              </ul>
              <footer className="kb-card-foot"><span className="o-muted">Cập nhật {fmtDateTime(a.updatedAt)}</span></footer>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
