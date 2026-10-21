import { useState } from "react";
import { Clock } from "lucide-react";
import { activeStoreId, getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
import { Alert, Badge, Button, EmptyState, Field, Modal, RecordList, errMsg, fmtDateTime, formatVnd } from "../../components/erp";
import { useResource } from "../shared";
import { Money, PrintButton, ShiftReportView, isManager, type ShiftReport } from "./shared";

type ShiftRow = {
  id: number;
  startTime: string;
  endTime: string | null;
  startingCash: number;
  cashSales: number | null;
  expectedCash: number | null;
  actualCash: number | null;
  differenceAmt: number | null;
  note: string | null;
  reviewedAt: string | null;
  staff: { fullName: string };
  reviewedBy: { fullName: string } | null;
  store: { name: string };
};

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

/** Tài chính › Báo cáo ca — mỗi ca: tiền theo phương thức, tiền mặt dự kiến vs đếm được, chênh lệch */
export function Shifts() {
  const [from, setFrom] = useState(() => daysAgo(14));
  const [to, setTo] = useState(today);
  const { data: rows, loading, error, reload } = useResource<ShiftRow[]>(`/api/cash/shifts?from=${from}&to=${to}`, []);
  const [open, setOpen] = useState<number | null>(null);
  const allStores = isOwnerRole(getStaffInfo()?.role) && activeStoreId() == null;

  return (
    <>
      <RecordList
        crumbs={[{ label: "Báo cáo ca" }]}
        rows={rows}
        rowKey={(s) => s.id}
        loading={loading}
        error={error}
        onOpen={(s) => setOpen(s.id)}
        actions={
          <span className="o-row" style={{ gap: 4 }}>
            <input type="date" className="o-input" style={{ width: 145 }} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Từ ngày" />
            <input type="date" className="o-input" style={{ width: 145 }} value={to} onChange={(e) => setTo(e.target.value)} aria-label="Đến ngày" />
          </span>
        }
        columns={[
          { key: "id", label: "Ca", value: (s) => s.id, render: (s) => `#${s.id}` },
          ...(allStores ? [{ key: "store", label: "Chi nhánh", value: (s: ShiftRow) => s.store.name }] : []),
          { key: "staff", label: "Thu ngân", value: (s) => s.staff.fullName },
          { key: "start", label: "Mở", value: (s) => s.startTime, render: (s) => fmtDateTime(s.startTime) },
          { key: "end", label: "Đóng", value: (s) => s.endTime ?? "", render: (s) => (s.endTime ? fmtDateTime(s.endTime) : <Badge tone="info">Đang mở</Badge>) },
          { key: "float", label: "Đầu ca", value: (s) => s.startingCash, numeric: true, render: (s) => formatVnd(s.startingCash) },
          { key: "sales", label: "TM bán hàng", value: (s) => s.cashSales ?? 0, numeric: true, sum: true, formatSum: formatVnd, render: (s) => (s.cashSales != null ? formatVnd(s.cashSales) : "") },
          { key: "exp", label: "TM dự kiến", value: (s) => s.expectedCash ?? 0, numeric: true, render: (s) => (s.expectedCash != null ? formatVnd(s.expectedCash) : "") },
          { key: "act", label: "TM đếm được", value: (s) => s.actualCash ?? 0, numeric: true, sum: true, formatSum: formatVnd, render: (s) => (s.actualCash != null ? formatVnd(s.actualCash) : "") },
          {
            key: "diff",
            label: "Chênh lệch",
            value: (s) => s.differenceAmt ?? 0,
            numeric: true,
            sum: true,
            formatSum: (n) => <Money value={n} signed />,
            render: (s) => (s.endTime ? (s.differenceAmt ? <Money value={s.differenceAmt} signed /> : <Badge tone="success">Khớp</Badge>) : ""),
          },
          { key: "note", label: "Lý do lệch", value: (s) => s.note ?? "", wrap: true, optional: true },
          { key: "rev", label: "Quản lý", value: (s) => (s.reviewedAt ? "Đã xác nhận" : ""), render: (s) => (s.reviewedAt ? <Badge tone="success">Đã xác nhận</Badge> : s.endTime && s.differenceAmt ? <Badge tone="warning">Cần kiểm tra</Badge> : "") },
        ]}
        searchText={(s) => `${s.id} ${s.staff.fullName} ${s.note ?? ""}`}
        filters={[
          { id: "diff", label: "Có chênh lệch", test: (s) => !!s.differenceAmt },
          { id: "unreviewed", label: "Chưa xác nhận", test: (s) => !!s.endTime && !s.reviewedAt },
          { id: "open", label: "Đang mở", test: (s) => !s.endTime },
        ]}
        groupBys={[
          { id: "staff", label: "Thu ngân", key: (s) => s.staff.fullName },
          { id: "day", label: "Ngày", key: (s) => s.startTime.slice(0, 10) },
        ]}
        exportName={`bao-cao-ca-${from}-${to}`}
        emptyState={<EmptyState icon={Clock} title="Chưa có ca nào trong khoảng này" />}
      />
      {open != null && <ShiftReportModal id={open} onClose={() => setOpen(null)} onChanged={() => void reload()} />}
    </>
  );
}

export function ShiftReportModal({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged?: () => void }) {
  const { data: r, error, reload } = useResource<ShiftReport | null>(`/api/cash/shifts/${id}/report`, null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const canReview = isManager() && r?.shift.endTime && !r.shift.reviewedAt;
  async function review() {
    try {
      await staffApi(`/api/cash/shifts/${id}/review`, { method: "POST", body: JSON.stringify({ note }) });
      await reload();
      onChanged?.();
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  return (
    <Modal
      title={`Báo cáo ca #${id}`}
      size="lg"
      onClose={onClose}
      footer={<><PrintButton />{canReview && <Button variant="primary" onClick={() => void review()}>Xác nhận đã kiểm tra</Button>}</>}
    >
      {(error || err) && <Alert>{error ?? err}</Alert>}
      {r ? <ShiftReportView r={r} /> : <div className="o-muted">Đang tải…</div>}
      {canReview && (
        <Field label="Ghi chú của quản lý" full>
          <input className="o-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: đã trừ lương phần thiếu" />
        </Field>
      )}
    </Modal>
  );
}
