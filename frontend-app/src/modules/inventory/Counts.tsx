import { useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { getStaffInfo, staffApi } from "../../lib/staffApi";
import { refreshBadges } from "../../lib/navBadges";
import { Alert, Badge, Button, EmptyState, Field, Modal, RecordList, errMsg, fmtDateTime, fmtQty, formatVnd, type Tone } from "../../components/erp";
import { useResource } from "../shared";
import type { InvRow } from "./Stock";

type Line = { id: number; itemId: number; systemQty: number; countedQty: number; unitCost: number; note: string | null; item: { id: number; name: string; unit: string | null } };
type Status = "PENDING" | "APPLIED" | "REJECTED";
export type InventoryCount = {
  id: number;
  code: string | null;
  status: Status;
  note: string | null;
  rejectNote: string | null;
  createdAt: string;
  approvedAt: string | null;
  store: { id: number; name: string };
  createdBy: { id: number; fullName: string };
  approvedBy: { fullName: string } | null;
  lines: Line[];
};

const STATUS: Record<Status, { label: string; tone: Tone }> = {
  PENDING: { label: "Chờ quản lý duyệt", tone: "warning" },
  APPLIED: { label: "Đã cập nhật tồn", tone: "success" },
  REJECTED: { label: "Từ chối", tone: "danger" },
};
const EPS = 0.0001;
const diffOf = (l: Pick<Line, "countedQty" | "systemQty">) => Math.round((l.countedQty - l.systemQty) * 10_000) / 10_000;
/** Giá trị thiếu (âm) / thừa (dương) của phiếu */
function totals(lines: Line[]) {
  let short = 0;
  let surplus = 0;
  for (const l of lines) {
    const v = Math.round(diffOf(l) * l.unitCost);
    if (v < 0) short += -v;
    else surplus += v;
  }
  return { short, surplus, changed: lines.filter((l) => Math.abs(diffOf(l)) > EPS).length };
}
const parseQty = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
const signed = (n: number) => (n > 0 ? `+${fmtQty(n)}` : fmtQty(n));

/** Kho › Kiểm kê: đếm thực tế → quản lý duyệt → tồn kho cập nhật theo chênh lệch */
export function InventoryCounts() {
  const role = getStaffInfo()?.role;
  const manager = role === "Admin" || role === "Owner";
  const { data: rows, loading, error, reload } = useResource<InventoryCount[]>("/api/inventory-counts", []);
  const [open, setOpen] = useState<InventoryCount | null>(null);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const changed = (text?: string) => { setOpen(null); setCreating(false); setMsg(text ?? null); refreshBadges(); void reload(); };

  return (
    <>
      <RecordList
        crumbs={[{ label: "Kiểm kê" }]}
        rows={rows}
        rowKey={(c) => c.id}
        loading={loading}
        error={error}
        onOpen={setOpen}
        onCreate={() => setCreating(true)}
        createLabel="Lập phiếu kiểm kê"
        top={
          <div className="o-stack">
            {msg && <Alert tone="info">{msg}</Alert>}
            <div className="o-muted">
              Số tồn không sửa tay được. Đếm thực tế, nhập vào phiếu; {manager ? "phiếu bạn lập được áp dụng ngay" : "quản lý duyệt xong tồn kho mới cập nhật"}. Phần thiếu được ghi vào Sổ hao hụt.
            </div>
          </div>
        }
        columns={[
          { key: "code", label: "Mã phiếu", value: (c) => c.code ?? `#${c.id}`, render: (c) => <strong style={{ fontWeight: 500 }}>{c.code ?? `#${c.id}`}</strong> },
          { key: "date", label: "Ngày đếm", value: (c) => c.createdAt, render: (c) => fmtDateTime(c.createdAt) },
          { key: "by", label: "Người đếm", value: (c) => c.createdBy.fullName },
          { key: "store", label: "Chi nhánh", value: (c) => c.store.name, optional: true },
          { key: "lines", label: "Nguyên liệu", value: (c) => c.lines.length, numeric: true, render: (c) => `${c.lines.length} (${totals(c.lines).changed} lệch)` },
          { key: "short", label: "Thiếu", value: (c) => totals(c.lines).short, numeric: true, render: (c) => (totals(c.lines).short ? <span style={{ color: "var(--o-danger)" }}>−{formatVnd(totals(c.lines).short)}</span> : "") },
          { key: "surplus", label: "Thừa", value: (c) => totals(c.lines).surplus, numeric: true, optional: true, render: (c) => (totals(c.lines).surplus ? `+${formatVnd(totals(c.lines).surplus)}` : "") },
          { key: "status", label: "Trạng thái", value: (c) => STATUS[c.status].label, render: (c) => <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge> },
        ]}
        searchText={(c) => `${c.code ?? ""} ${c.createdBy.fullName} ${c.note ?? ""} ${c.lines.map((l) => l.item.name).join(" ")}`}
        filters={(Object.keys(STATUS) as Status[]).map((id) => ({ id, label: STATUS[id].label, test: (c: InventoryCount) => c.status === id }))}
        groupBys={[{ id: "store", label: "Chi nhánh", key: (c) => c.store.name }]}
        emptyState={<EmptyState icon={ClipboardList} title="Chưa có phiếu kiểm kê" hint="Đếm hàng trong kho định kỳ (cuối ngày / cuối tuần) rồi lập phiếu để tồn kho khớp thực tế." />}
      />
      {open && <CountModal c={open} manager={manager} onClose={() => setOpen(null)} onChanged={changed} />}
      {creating && <CountForm manager={manager} onClose={() => setCreating(false)} onSaved={changed} />}
    </>
  );
}

function LinesTable({ lines }: { lines: Line[] }) {
  return (
    <table className="o-list">
      <thead>
        <tr><th>Nguyên liệu</th><th className="num">Hệ thống</th><th className="num">Đếm được</th><th className="num">Chênh lệch</th><th className="num">Giá trị</th></tr>
      </thead>
      <tbody>
        {lines.map((l) => {
          const d = diffOf(l);
          const v = Math.round(d * l.unitCost);
          return (
            <tr key={l.id}>
              <td>{l.item.name}{l.item.unit ? ` (${l.item.unit})` : ""}{l.note && <div className="o-muted" style={{ fontSize: 12 }}>{l.note}</div>}</td>
              <td className="num">{fmtQty(l.systemQty)}</td>
              <td className="num">{fmtQty(l.countedQty)}</td>
              <td className="num" style={Math.abs(d) > EPS ? { color: d < 0 ? "var(--o-danger)" : "var(--o-success)", fontWeight: 600 } : undefined}>{Math.abs(d) > EPS ? signed(d) : "Khớp"}</td>
              <td className="num">{v ? `${v > 0 ? "+" : "−"}${formatVnd(Math.abs(v))}` : ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CountModal({ c, manager, onClose, onChanged }: { c: InventoryCount; manager: boolean; onClose: () => void; onChanged: (msg?: string) => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const t = totals(c.lines);

  async function call(path: "approve" | "reject") {
    setBusy(true);
    setErr(null);
    try {
      await staffApi(`/api/inventory-counts/${c.id}/${path}`, { method: "POST", body: JSON.stringify({ note }) });
      onChanged(path === "approve" ? `Đã duyệt ${c.code}: tồn kho đã cập nhật theo số đếm.` : `Đã từ chối ${c.code}.`);
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  }

  const footer = manager && c.status === "PENDING" ? (
    rejecting ? (
      <>
        <Button onClick={() => setRejecting(false)} disabled={busy}>Quay lại</Button>
        <Button variant="danger" onClick={() => void call("reject")} disabled={busy || !note.trim()}>Xác nhận từ chối</Button>
      </>
    ) : (
      <>
        <Button variant="danger" onClick={() => setRejecting(true)}>Từ chối</Button>
        <Button variant="primary" onClick={() => void call("approve")} disabled={busy}>Duyệt & cập nhật tồn</Button>
      </>
    )
  ) : undefined;

  return (
    <Modal title={`Phiếu kiểm kê ${c.code ?? `#${c.id}`}`} size="lg" onClose={onClose} footer={footer}>
      <div className="o-stack">
        {err && <Alert>{err}</Alert>}
        <div className="o-inline">
          <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
          <span className="o-muted">{c.createdBy.fullName} · {c.store.name} · {fmtDateTime(c.createdAt)}</span>
        </div>
        {c.note && <div style={{ whiteSpace: "pre-line" }}>{c.note}</div>}
        <div className="o-inline">
          <span>{t.changed}/{c.lines.length} nguyên liệu lệch</span>
          {t.short > 0 && <span>· Thiếu <strong style={{ color: "var(--o-danger)" }}>{formatVnd(t.short)}</strong> (ghi vào Sổ hao hụt)</span>}
          {t.surplus > 0 && <span>· Thừa <strong>{formatVnd(t.surplus)}</strong></span>}
        </div>
        <LinesTable lines={c.lines} />
        {c.status === "PENDING" && <div className="o-muted">Khi duyệt, tồn kho cộng/trừ đúng phần chênh lệch lúc đếm — hàng bán ra trong lúc chờ duyệt vẫn được tính.</div>}
        {c.status === "APPLIED" && c.approvedBy && <Alert tone="info">Duyệt bởi {c.approvedBy.fullName} {c.approvedAt ? fmtDateTime(c.approvedAt) : ""}</Alert>}
        {c.status === "REJECTED" && <Alert>Từ chối{c.approvedBy ? ` bởi ${c.approvedBy.fullName}` : ""}: {c.rejectNote}</Alert>}
        {rejecting && (
          <Field label="Lý do từ chối (người đếm sẽ thấy)" required>
            <textarea className="o-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} autoFocus placeholder="VD: Đếm lại sữa tươi, số lệch quá nhiều" />
          </Field>
        )}
      </div>
    </Modal>
  );
}

function CountForm({ manager, onClose, onSaved }: { manager: boolean; onClose: () => void; onSaved: (msg?: string) => void }) {
  const inv = useResource<InvRow[]>("/api/admin/inventory", []);
  const [counted, setCounted] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const items = useMemo(() => {
    const k = q.trim().toLowerCase();
    return inv.data.filter((i) => !k || `${i.name} ${i.skuCode ?? ""}`.toLowerCase().includes(k));
  }, [inv.data, q]);
  const entered = inv.data.filter((i) => parseQty(counted[i.id] ?? "") != null);
  const invalid = entered.filter((i) => { const n = parseQty(counted[i.id])!; return !Number.isFinite(n) || n < 0; });

  async function save() {
    if (!entered.length) return setErr("Nhập số đếm cho ít nhất 1 nguyên liệu.");
    if (invalid.length) return setErr(`Số đếm không hợp lệ: ${invalid.map((i) => i.name).join(", ")}`);
    setBusy(true);
    setErr(null);
    try {
      const r = await staffApi<InventoryCount>("/api/inventory-counts", {
        method: "POST",
        body: JSON.stringify({ note, lines: entered.map((i) => ({ itemId: i.id, countedQty: parseQty(counted[i.id]), note: notes[i.id] })) }),
      });
      onSaved(manager ? `Đã lập ${r.code} và cập nhật tồn kho.` : `Đã gửi ${r.code}, chờ quản lý duyệt.`);
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Lập phiếu kiểm kê"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Huỷ</Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy || !entered.length}>
            {manager ? `Lưu & cập nhật tồn (${entered.length})` : `Gửi quản lý duyệt (${entered.length})`}
          </Button>
        </>
      }
    >
      <div className="o-stack">
        {(err || inv.error) && <Alert>{err ?? inv.error}</Alert>}
        <div className="o-muted">Chỉ nhập những nguyên liệu đã đếm; ô để trống được bỏ qua. Nhập số lẻ được (VD 2,5).</div>
        <div className="o-row">
          <input className="o-input" style={{ flex: 1, minWidth: 180 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm nguyên liệu…" aria-label="Tìm nguyên liệu" />
          <Button onClick={() => setCounted(Object.fromEntries(items.map((i) => [i.id, counted[i.id] ?? String(i.stockQty)])))} disabled={!items.length}>
            Điền số hệ thống cho các dòng đang hiện
          </Button>
        </div>
        {inv.loading ? (
          <div className="o-muted">Đang tải…</div>
        ) : (
          <div style={{ maxHeight: "50vh", overflow: "auto" }}>
            <table className="o-list">
              <thead>
                <tr><th>Nguyên liệu</th><th className="num">Hệ thống</th><th className="num">Đếm được</th><th className="num">Lệch</th><th>Ghi chú</th></tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const n = parseQty(counted[i.id] ?? "");
                  const d = n != null && Number.isFinite(n) ? Math.round((n - i.stockQty) * 10_000) / 10_000 : null;
                  return (
                    <tr key={i.id}>
                      <td>{i.name}{i.unit ? ` (${i.unit})` : ""}</td>
                      <td className="num">{fmtQty(i.stockQty)}</td>
                      <td className="num">
                        <input className="o-input o-input-num" style={{ width: 100 }} inputMode="decimal" value={counted[i.id] ?? ""} onChange={(e) => setCounted((c) => ({ ...c, [i.id]: e.target.value }))} aria-label={`Số đếm ${i.name}`} />
                      </td>
                      <td className="num" style={d != null && Math.abs(d) > EPS ? { color: d < 0 ? "var(--o-danger)" : "var(--o-success)", fontWeight: 600 } : undefined}>
                        {d == null ? "" : Math.abs(d) > EPS ? signed(d) : "Khớp"}
                      </td>
                      <td>
                        {d != null && Math.abs(d) > EPS && (
                          <input className="o-input" style={{ minWidth: 140 }} value={notes[i.id] ?? ""} onChange={(e) => setNotes((x) => ({ ...x, [i.id]: e.target.value }))} placeholder="Lý do lệch" maxLength={255} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Field label="Ghi chú phiếu">
          <input className="o-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="VD: Kiểm kê cuối tuần, kho lạnh + kệ khô" />
        </Field>
      </div>
    </Modal>
  );
}
