import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { staffApi } from "../../lib/staffApi";
import { Badge, Button, EmptyState, Field, FormGroup, FormGroups, FormView, Kpi, RecordList, StatusBar, errMsg, fmtDateTime, type Tone } from "../../components/erp";
import { useRecordNav, useResource } from "../shared";

type RequestRow = {
  id: number;
  type: string;
  status: string;
  requestQty: number;
  note: string | null;
  createdAt: string;
  approvedAt: string | null;
  item: { name: string; unit: string | null };
  staff: { fullName: string };
  approvedBy: { fullName: string } | null;
};

const BASE = "/app/inventory/requests";
const STATUS: Record<string, { label: string; tone: Tone }> = {
  Pending: { label: "Chờ duyệt", tone: "warning" },
  Approved: { label: "Đã duyệt", tone: "success" },
  Rejected: { label: "Từ chối", tone: "danger" },
};
const typeLabel = (t: string) => (t === "Restock" ? "Nhập hàng" : "Xin NL pha chế");

export function RequestList() {
  const { data: rows, loading, error } = useResource<RequestRow[]>("/api/admin/requests", []);
  const go = useRecordNav(BASE);
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  return (
    <RecordList
      crumbs={[{ label: "Phiếu xin nguyên liệu" }]}
      rows={rows}
      rowKey={(r) => r.id}
      loading={loading}
      error={error}
      onOpen={(r) => go.open(r.id)}
      top={
        <div className="o-kpis">
          <Kpi label="Tổng phiếu" value={rows.length} />
          <Kpi label="Chờ duyệt" value={count("Pending")} tone={count("Pending") ? "warning" : undefined} />
          <Kpi label="Đã duyệt" value={count("Approved")} tone="success" />
          <Kpi label="Từ chối" value={count("Rejected")} tone={count("Rejected") ? "danger" : undefined} />
        </div>
      }
      columns={[
        { key: "id", label: "Phiếu", value: (r) => r.id, render: (r) => `#${r.id}` },
        { key: "date", label: "Ngày tạo", value: (r) => r.createdAt, render: (r) => fmtDateTime(r.createdAt) },
        { key: "type", label: "Loại", value: (r) => typeLabel(r.type) },
        { key: "item", label: "Nguyên liệu", value: (r) => r.item.name },
        { key: "qty", label: "Số lượng", value: (r) => r.requestQty, numeric: true, render: (r) => `${r.requestQty}${r.item.unit ? ` ${r.item.unit}` : ""}` },
        { key: "staff", label: "Người yêu cầu", value: (r) => r.staff.fullName },
        { key: "note", label: "Ghi chú", value: (r) => r.note ?? "", optional: true, wrap: true },
        { key: "status", label: "Trạng thái", value: (r) => STATUS[r.status]?.label ?? r.status, render: (r) => <Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label ?? r.status}</Badge> },
      ]}
      searchText={(r) => `${r.item.name} ${r.staff.fullName} ${r.note ?? ""}`}
      filters={Object.entries(STATUS).map(([id, s]) => ({ id, label: s.label, test: (r: RequestRow) => r.status === id }))}
      groupBys={[
        { id: "status", label: "Trạng thái", key: (r) => STATUS[r.status]?.label ?? r.status },
        { id: "type", label: "Loại", key: (r) => typeLabel(r.type) },
      ]}
      kanban={{
        columns: Object.entries(STATUS).map(([id, s]) => ({ id, label: s.label })),
        columnOf: (r) => r.status,
        card: (r) => (
          <div>
            <div style={{ fontWeight: 500 }}>{r.item.name}</div>
            <div className="o-muted">#{r.id} · {typeLabel(r.type)} · {r.requestQty}{r.item.unit ? ` ${r.item.unit}` : ""}</div>
            <div className="o-muted">{r.staff.fullName}</div>
          </div>
        ),
      }}
      exportName="phieu-xin-nl"
      emptyState={<EmptyState icon={ClipboardList} title="Chưa có phiếu xin nguyên liệu nào" />}
    />
  );
}

export function RequestForm({ recordId }: { recordId?: string }) {
  const list = useResource<RequestRow[]>("/api/admin/requests", []);
  const r = list.data.find((x) => String(x.id) === recordId) ?? null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function decide(status: "Approved" | "Rejected") {
    if (!r) return;
    setBusy(true);
    try {
      await staffApi(`/api/admin/requests/${r.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await list.reload();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  if (!r) {
    return (
      <FormView crumbs={[{ label: "Phiếu xin nguyên liệu", to: BASE }, { label: "…" }]} editing={false} canEdit={false} error={list.error}>
        <div className="o-muted">{list.loading ? "Đang tải…" : "Không tìm thấy phiếu."}</div>
      </FormView>
    );
  }
  const current = r.status === "Rejected" ? "Rejected" : r.status;
  return (
    <FormView
      crumbs={[{ label: "Phiếu xin nguyên liệu", to: BASE }, { label: `Phiếu #${r.id}` }]}
      editing={false}
      canEdit={false}
      error={err}
      actions={
        r.status === "Pending" ? (
          <>
            <Button variant="primary" onClick={() => void decide("Approved")} disabled={busy}>Duyệt</Button>
            <Button variant="danger" onClick={() => void decide("Rejected")} disabled={busy}>Từ chối</Button>
          </>
        ) : undefined
      }
      statusBar={
        <StatusBar
          steps={r.status === "Rejected" ? [{ id: "Pending", label: "Chờ duyệt" }, { id: "Rejected", label: "Từ chối" }] : [{ id: "Pending", label: "Chờ duyệt" }, { id: "Approved", label: "Đã duyệt" }]}
          current={current}
        />
      }
    >
      <div className="o-sheet-title">
        <div style={{ flex: 1 }}>
          <h1>{r.item.name}</h1>
          <div className="o-sheet-sub">Phiếu #{r.id} · {typeLabel(r.type)}</div>
        </div>
      </div>
      <FormGroups>
        <FormGroup>
          <Field label="Số lượng">{r.requestQty}{r.item.unit ? ` ${r.item.unit}` : ""}</Field>
          <Field label="Người yêu cầu">{r.staff.fullName}</Field>
          <Field label="Ngày tạo">{fmtDateTime(r.createdAt)}</Field>
        </FormGroup>
        <FormGroup>
          <Field label={r.status === "Rejected" ? "Từ chối bởi" : "Duyệt bởi"}>{r.status !== "Pending" && r.approvedBy ? r.approvedBy.fullName : <span className="o-muted">—</span>}</Field>
          <Field label="Thời điểm">{fmtDateTime(r.approvedAt) || <span className="o-muted">—</span>}</Field>
        </FormGroup>
      </FormGroups>
      <Field label="Ghi chú" full>{r.note ?? <span className="o-muted">—</span>}</Field>
    </FormView>
  );
}
