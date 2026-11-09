import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { staffApi } from "../../lib/staffApi";
import { ROLE_LABEL } from "../../lib/roles";
import { Alert, Badge, Button, Kpi, Modal, errMsg } from "../../components/erp";
import { BarChart } from "../../components/erp/charts";
import { CAUSE_TEXT, dm, maxSpread, prefPct, type Explanations, type RunMetrics, type UnmetWish } from "../../lib/shiftWish";
import "../../styles/shiftWish.css";

export type RunRow = { id: number; seed: number; useWishes: boolean; includeLate: boolean; createdAt: string; metrics: RunMetrics; unmetCount: number; hasExplain: boolean };
export type RunsData = {
  published: boolean;
  appliedRunId: number | null;
  runs: RunRow[];
  applied: {
    id: number; seed: number; useWishes: boolean; metrics: RunMetrics; unmetWishes: UnmetWish[]; explanations: Explanations | null;
    reasons: { date: string; code: string; staffId: number; reason: string }[];
  } | null;
};

const roleName = (r: string) => ROLE_LABEL[r] ?? r;
const callName = (s: string) => s.trim().split(/\s+/).pop() ?? s;
const UNMET_SHOWN = 12;

/** Hộp "Tự xếp lịch tháng": dùng nguyện vọng (x/y đã gửi), tính cả nguyện vọng gửi muộn */
export function AutoDialog({ monthLabel, wishCount, busy, onClose, onRun }: {
  monthLabel: string;
  wishCount: { sent: number; late: number; total: number } | null;
  busy: boolean;
  onClose: () => void;
  onRun: (o: { useWishes: boolean; includeLate: boolean }) => void;
}) {
  const [useWishes, setUseWishes] = useState(true);
  const [includeLate, setIncludeLate] = useState(false);
  return (
    <Modal
      title={`Tự xếp lịch ${monthLabel}`}
      onClose={onClose}
      size="sm"
      footer={<><Button onClick={onClose}>Huỷ</Button><Button variant="primary" icon={Sparkles} disabled={busy} onClick={() => onRun({ useWishes, includeLate })}>{busy ? "Đang xếp…" : "Xếp lịch"}</Button></>}
    >
      <div className="o-stack">
        <p className="o-muted" style={{ margin: 0 }}>Bản nháp cũ của tháng sẽ được xếp lại; ca đã công bố giữ nguyên. Thuật toán xếp, không phải AI.</p>
        <label className="o-sw-check">
          <input type="checkbox" checked={useWishes} onChange={(e) => setUseWishes(e.target.checked)} />
          <span>Dùng nguyện vọng nhân viên {wishCount ? `(${wishCount.sent}/${wishCount.total} đã gửi)` : ""}</span>
        </label>
        <label className="o-sw-check">
          <input type="checkbox" checked={includeLate} disabled={!useWishes} onChange={(e) => setIncludeLate(e.target.checked)} />
          <span>Tính cả nguyện vọng gửi muộn {wishCount?.late ? `(${wishCount.late} người)` : ""}</span>
        </label>
      </div>
    </Modal>
  );
}

/** Kết quả lần tự xếp đang áp dụng: chỉ số, số ca / người, nguyện vọng chưa đáp ứng, tóm tắt, so sánh các lần chạy */
export function AutoRunPanel({ data, staff, shiftName, busy, onRerun, onApply, onExplained }: {
  data: RunsData;
  staff: { id: number; fullName: string; role: string }[];
  shiftName: (code: string) => string;
  busy: boolean;
  onRerun: () => void;
  onApply: (runId: number) => void;
  onExplained: (ex: Explanations) => void;
}) {
  const run = data.applied;
  const [role, setRole] = useState("");
  const [allUnmet, setAllUnmet] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const byId = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  // Lời giải thích: lần chạy chưa có thì nhờ viết (AI nếu bật, không thì mẫu câu) — lưu lại ở máy chủ, lần sau không gọi lại
  useEffect(() => {
    if (!run || run.explanations || !run.useWishes) return;
    let alive = true;
    setExplaining(true);
    setNote(null);
    staffApi<{ explanations: Explanations; note: string | null }>(`/api/schedule/admin/runs/${run.id}/explain`, { method: "POST", body: "{}" })
      .then((r) => {
        if (!alive) return;
        onExplained(r.explanations);
        setNote(r.note);
      })
      .catch((e) => alive && setNote(errMsg(e)))
      .finally(() => alive && setExplaining(false));
    return () => {
      alive = false;
    };
  }, [run, onExplained]);

  if (!run) return null;
  const m = run.metrics;
  const roles = [...new Set(m.perStaff.map((p) => byId.get(p.staffId)?.role).filter((r): r is string => !!r))];
  const bars = m.perStaff
    .map((p) => ({ p, s: byId.get(p.staffId) }))
    .filter((x) => x.s && (!role || x.s.role === role))
    .sort((a, b) => a.s!.role.localeCompare(b.s!.role) || a.s!.fullName.localeCompare(b.s!.fullName))
    .map(({ p, s }) => ({ name: callName(s!.fullName), "Số ca": p.shifts }));
  const unmet = allUnmet ? run.unmetWishes : run.unmetWishes.slice(0, UNMET_SHOWN);
  const spread = maxSpread(m);

  return (
    <section className="o-card o-stack">
      <div className="o-sw-mgr-head">
        <div>
          <h3 style={{ margin: 0 }}>Kết quả tự xếp lịch</h3>
          <span className="o-muted">
            Lần #{run.id} · seed {run.seed}{run.useWishes ? "" : " · không dùng nguyện vọng"} · {m.iterations.toLocaleString("vi-VN")} bước cải thiện trong {m.ms} ms
          </span>
        </div>
        {!data.published && <Button size="sm" icon={RefreshCw} disabled={busy} onClick={onRerun}>Chạy lại (phương án khác)</Button>}
      </div>

      <div className="o-sw-kpis">
        <Kpi label='Nguyện vọng "muốn" được đáp ứng' value={m.preferTotal ? `${prefPct(m)}% (${m.preferMet}/${m.preferTotal})` : "—"} tone={m.preferTotal ? "success" : undefined} />
        <Kpi label='Vi phạm "không thể"' value={m.hardViolations} tone={m.hardViolations ? "danger" : "success"} />
        <Kpi label="Ca thiếu người" value={m.shortages} tone={m.shortages ? "warning" : "success"} />
        <Kpi label="Chênh lệch số ca" value={`±${spread}`} tone={spread > 1 ? "warning" : undefined} />
      </div>
      {m.existingConflicts > 0 && (
        <Alert tone="warning">{m.existingConflicts} ca đã duyệt từ trước rơi vào ngày nhân viên báo "không thể" — thuật toán không tự đổi ca đã duyệt, hãy xem lại.</Alert>
      )}

      {run.useWishes && (
        <div className="o-sw-summary">
          <div className="o-sw-summary-head">
            {run.explanations?.source === "AI" ? <Badge tone="primary"><Sparkles size={12} aria-hidden /> AI tóm tắt</Badge> : <Badge>Tóm tắt</Badge>}
          </div>
          {explaining ? <p className="o-muted">Đang viết tóm tắt…</p> : <p>{run.explanations?.summary ?? "—"}</p>}
          {note && <p className="o-muted o-sw-hint">{note}</p>}
        </div>
      )}

      <div>
        <div className="o-sw-mgr-head">
          <h4 className="o-sw-h4">Số ca mỗi người trong tháng</h4>
          <select className="o-input o-sw-month" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Vị trí">
            <option value="">Mọi vị trí</option>
            {roles.map((r) => <option key={r} value={r}>{roleName(r)}</option>)}
          </select>
        </div>
        <div className="o-sw-heat-wrap">
          <div style={{ minWidth: Math.max(320, bars.length * 26) }}>
            <BarChart data={bars} xKey="name" series={[{ key: "Số ca", label: "Số ca" }]} height={200} barSize={12} ariaLabel="Số ca mỗi nhân viên trong tháng" />
          </div>
        </div>
      </div>

      {run.useWishes && (
        <div>
          <h4 className="o-sw-h4">Nguyện vọng chưa đáp ứng ({run.unmetWishes.length})</h4>
          {run.unmetWishes.length === 0 ? (
            <p className="o-muted">Mọi nguyện vọng "muốn" đều được đáp ứng.</p>
          ) : (
            <ul className="o-sw-unmet">
              {unmet.map((u, i) => (
                <li key={i}>
                  <strong>{byId.get(u.staffId)?.fullName ?? `#${u.staffId}`}</strong> — {shiftName(u.code)} {dm(u.date)}: <span className="o-muted">{CAUSE_TEXT[u.cause]}</span>
                </li>
              ))}
            </ul>
          )}
          {run.unmetWishes.length > UNMET_SHOWN && (
            <Button size="sm" variant="link" onClick={() => setAllUnmet((x) => !x)}>{allUnmet ? "Thu gọn" : `Xem cả ${run.unmetWishes.length}`}</Button>
          )}
        </div>
      )}

      {data.runs.length > 1 && (
        <div>
          <h4 className="o-sw-h4">So sánh các lần chạy</h4>
          <div className="o-sw-heat-wrap">
            <table className="o-sw-runs">
              <thead>
                <tr><th>Lần</th><th>Lúc</th><th>Đáp ứng</th><th>Vi phạm</th><th>Thiếu</th><th>Chênh lệch</th><th>Chi phí</th><th /></tr>
              </thead>
              <tbody>
                {data.runs.map((r) => (
                  <tr key={r.id} className={r.id === data.appliedRunId ? "is-on" : undefined}>
                    <td>#{r.id}{r.useWishes ? "" : " (không NV)"}</td>
                    <td>{new Date(r.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</td>
                    <td>{r.metrics.preferTotal ? `${prefPct(r.metrics)}%` : "—"}</td>
                    <td>{r.metrics.hardViolations}</td>
                    <td>{r.metrics.shortages}</td>
                    <td>±{maxSpread(r.metrics)}</td>
                    <td>{r.metrics.cost.toLocaleString("vi-VN")}</td>
                    <td>
                      {r.id === data.appliedRunId ? <Badge tone="success">Đang dùng</Badge>
                        : !data.published && <Button size="sm" disabled={busy} onClick={() => onApply(r.id)}>Dùng phương án này</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="o-muted o-sw-hint">Chi phí thấp hơn = tốt hơn (phạt nguyện vọng không đáp ứng + lệch số ca + thiếu người).</p>
        </div>
      )}
    </section>
  );
}
