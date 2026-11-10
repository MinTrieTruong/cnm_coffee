import { useEffect, useState } from "react";
import { Filter, ScrollText, X } from "lucide-react";
import { staffApi } from "../../lib/staffApi";
import { Alert, Badge, Button, ControlPanel, EmptyState, ListView, errMsg, fmtDateTime, type Tone } from "../../components/erp";

type AuditRow = {
  id: number;
  action: string;
  target: string | null;
  detail: string | null;
  createdAt: string;
  staff: { fullName: string; username: string | null; role: string } | null;
};

const LIMIT = 50;
const toneOf = (a: string): Tone =>
  /DELETE|DEACTIVATE|LOW_STOCK|DISCARD/.test(a) ? "danger" : /CREATE|OPEN|RECEIVE/.test(a) ? "success" : /UPDATE|RESET|CHANGE/.test(a) ? "warning" : "info";

/** Cấu hình › Nhật ký hệ thống — phân trang phía server như cũ (50 dòng/trang) */
export function AuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [date, setDate] = useState("");
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async (p = 1, d = date, a = action) => {
    setBusy(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (d) params.set("date", d);
      if (a) params.set("action", a);
      const data = await staffApi<{ total: number; rows: AuditRow[] }>(`/api/admin/audit-logs?${params}`);
      setRows(data.rows);
      setTotal(data.total);
      setPage(p);
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load(1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <ControlPanel
        crumbs={[{ label: "Nhật ký hệ thống" }]}
        actions={
          <span className="o-row">
            <input type="date" className="o-input" style={{ width: 150 }} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Lọc theo ngày" />
            <input className="o-input" style={{ width: 200 }} value={action} onChange={(e) => setAction(e.target.value)} placeholder="Hành động (VD: SHIFT)" onKeyDown={(e) => e.key === "Enter" && void load(1)} />
            <Button variant="primary" icon={Filter} onClick={() => void load(1)} disabled={busy}>Lọc</Button>
            {(date || action) && (
              <Button
                icon={X}
                onClick={() => {
                  setDate("");
                  setAction("");
                  void load(1, "", "");
                }}
              >
                Xóa lọc
              </Button>
            )}
          </span>
        }
        pager={{ offset: (page - 1) * LIMIT, limit: LIMIT, total, onChange: (off) => void load(off / LIMIT + 1) }}
      />
      {err && <div style={{ padding: "8px 16px" }}><Alert>{err}</Alert></div>}
      <ListView
        rows={rows}
        rowKey={(r) => r.id}
        loading={busy}
        exportName="nhat-ky"
        emptyState={<EmptyState icon={ScrollText} title="Không có log" />}
        columns={[
          { key: "time", label: "Thời gian", value: (r) => r.createdAt, render: (r) => fmtDateTime(r.createdAt) },
          {
            key: "staff",
            label: "Nhân viên",
            value: (r) => r.staff?.fullName ?? "Hệ thống",
            render: (r) => (r.staff ? <span>{r.staff.fullName} <span className="o-muted">{r.staff.username ?? ""}</span></span> : <span className="o-muted">Hệ thống</span>),
          },
          { key: "action", label: "Hành động", value: (r) => r.action, render: (r) => <Badge tone={toneOf(r.action)}>{r.action}</Badge> },
          { key: "target", label: "Đối tượng", value: (r) => r.target ?? "" },
          { key: "detail", label: "Chi tiết", value: (r) => r.detail ?? "", wrap: true },
        ]}
      />
    </div>
  );
}
