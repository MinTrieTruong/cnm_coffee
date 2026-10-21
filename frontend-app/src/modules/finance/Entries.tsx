import { useState } from "react";
import { ReceiptText } from "lucide-react";
import { activeStoreId, getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
import { Alert, Badge, Button, EmptyState, Field, Modal, RecordList, errMsg, fmtDateTime, formatVnd } from "../../components/erp";
import { useResource } from "../shared";
import { Attachment, EntryDialog, FUND_LABEL, KIND_LABEL, STATUS, catLabel, flowLabel, isManager, type CashEntry } from "./shared";

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

/** Tài chính › Phiếu thu chi — sổ quỹ: lập phiếu, duyệt phiếu chi vượt hạn mức, tra cứu */
export function Entries() {
  const [from, setFrom] = useState(() => daysAgo(30));
  const [to, setTo] = useState(today);
  const { data: rows, loading, error, reload } = useResource<CashEntry[]>(`/api/cash/entries?from=${from}&to=${to}`, []);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<CashEntry | null>(null);
  const allStores = isOwnerRole(getStaffInfo()?.role) && activeStoreId() == null;

  return (
    <>
      <RecordList
        crumbs={[{ label: "Phiếu thu chi" }]}
        rows={rows}
        rowKey={(e) => e.id}
        loading={loading}
        error={error}
        onOpen={setOpen}
        onCreate={allStores ? undefined : () => setCreating(true)}
        createLabel="Lập phiếu"
        actions={
          <span className="o-row" style={{ gap: 4 }}>
            <input type="date" className="o-input" style={{ width: 145 }} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Từ ngày" />
            <input type="date" className="o-input" style={{ width: 145 }} value={to} onChange={(e) => setTo(e.target.value)} aria-label="Đến ngày" />
          </span>
        }
        columns={[
          { key: "code", label: "Số phiếu", value: (e) => e.code },
          { key: "time", label: "Thời gian", value: (e) => e.createdAt, render: (e) => fmtDateTime(e.createdAt) },
          ...(allStores ? [{ key: "store", label: "Chi nhánh", value: (e: CashEntry) => e.store?.name ?? "" }] : []),
          { key: "kind", label: "Loại", value: (e) => KIND_LABEL[e.kind] },
          { key: "cat", label: "Danh mục", value: (e) => catLabel(e.category) },
          { key: "desc", label: "Nội dung", value: (e) => e.description ?? "", wrap: true },
          { key: "flow", label: "Quỹ", value: flowLabel, optional: true },
          { key: "by", label: "Người lập", value: (e) => e.createdBy?.fullName ?? "" },
          {
            key: "amt",
            label: "Số tiền",
            value: (e) => e.amount,
            numeric: true,
            render: (e) => <span style={{ color: e.kind === "OUT" ? "var(--o-danger)" : e.kind === "IN" ? "var(--o-success)" : undefined }}>{formatVnd(e.amount)}</span>,
          },
          { key: "st", label: "Trạng thái", value: (e) => STATUS[e.status].label, render: (e) => <Badge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Badge> },
        ]}
        searchText={(e) => `${e.code} ${e.description ?? ""} ${catLabel(e.category)} ${e.createdBy?.fullName ?? ""}`}
        filters={[
          { id: "pending", label: "Chờ duyệt", test: (e) => e.status === "PENDING" },
          { id: "out", label: "Phiếu chi", test: (e) => e.kind === "OUT" },
          { id: "in", label: "Phiếu thu", test: (e) => e.kind === "IN" },
          { id: "transfer", label: "Chuyển quỹ", test: (e) => e.kind === "TRANSFER" },
          { id: "adjust", label: "Điều chỉnh kiểm két", test: (e) => e.kind === "ADJUST" },
          { id: "safe", label: FUND_LABEL.SAFE, test: (e) => e.fromFund === "SAFE" || e.toFund === "SAFE" },
          { id: "drawer", label: FUND_LABEL.DRAWER, test: (e) => e.fromFund === "DRAWER" || e.toFund === "DRAWER" },
          { id: "bank", label: FUND_LABEL.BANK, test: (e) => e.fromFund === "BANK" || e.toFund === "BANK" },
        ]}
        groupBys={[
          { id: "cat", label: "Danh mục", key: (e) => catLabel(e.category) },
          { id: "kind", label: "Loại phiếu", key: (e) => KIND_LABEL[e.kind] },
          { id: "by", label: "Người lập", key: (e) => e.createdBy?.fullName ?? "" },
          { id: "day", label: "Ngày", key: (e) => e.createdAt.slice(0, 10) },
        ]}
        exportName={`thu-chi-${from}-${to}`}
        emptyState={<EmptyState icon={ReceiptText} title="Chưa có phiếu thu chi" hint="Lập phiếu chi khi mua vật dụng, sửa chữa…; phiếu thu khi có khoản thu ngoài bán hàng." />}
      />
      {creating && <EntryDialog onClose={() => setCreating(false)} onDone={() => { setCreating(false); void reload(); }} />}
      {open && <EntryDetail entry={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); void reload(); }} />}
    </>
  );
}

/** Chi tiết phiếu + duyệt / từ chối (quản lý) / huỷ (người lập, phiếu chờ duyệt) */
function EntryDetail({ entry: e, onClose, onChanged }: { entry: CashEntry; onClose: () => void; onChanged: () => void }) {
  const manager = isManager();
  const mine = e.createdById === getStaffInfo()?.id;
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function act(path: string, body?: object) {
    setBusy(true);
    try {
      await staffApi(`/api/cash/entries/${e.id}/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) });
      onChanged();
    } catch (ex) {
      setErr(errMsg(ex));
    } finally {
      setBusy(false);
    }
  }
  const pending = e.status === "PENDING";
  return (
    <Modal
      title={`${KIND_LABEL[e.kind]} ${e.code}`}
      onClose={onClose}
      footer={
        pending && (manager || mine) ? (
          <>
            {(mine || manager) && <Button disabled={busy} onClick={() => void act("cancel")}>Huỷ phiếu</Button>}
            {manager && <Button variant="danger" disabled={busy || !reason.trim()} onClick={() => void act("reject", { reason })}>Từ chối</Button>}
            {manager && <Button variant="primary" disabled={busy} onClick={() => void act("approve")}>Duyệt chi</Button>}
          </>
        ) : undefined
      }
    >
      {err && <Alert>{err}</Alert>}
      <div className="o-stack" style={{ gap: 8 }}>
        <Field label="Trạng thái"><Badge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Badge>{e.rejectReason && <span className="o-muted"> — {e.rejectReason}</span>}</Field>
        <Field label="Danh mục">{catLabel(e.category)}</Field>
        <Field label="Số tiền"><b>{formatVnd(e.amount)}</b></Field>
        <Field label="Quỹ">{flowLabel(e)}{e.shiftId ? ` · ca #${e.shiftId}` : ""}{e.safeSessionId ? ` · lần mở két #${e.safeSessionId}` : ""}</Field>
        <Field label="Nội dung">{e.description}</Field>
        {e.supplierBill && <Field label="Công nợ">{e.supplierBill.code} — {e.supplierBill.supplier.name}</Field>}
        <Field label="Người lập">{e.createdBy?.fullName} · {fmtDateTime(e.createdAt)}</Field>
        {e.approvedBy && <Field label={e.status === "REJECTED" ? "Người từ chối" : "Người duyệt"}>{e.approvedBy.fullName} · {fmtDateTime(e.approvedAt)}</Field>}
        <Field label="Chứng từ" full><Attachment url={e.attachmentUrl} /></Field>
        {pending && manager && (
          <Field label="Lý do (nếu từ chối)" full>
            <input className="o-input" value={reason} onChange={(ev) => setReason(ev.target.value)} />
          </Field>
        )}
      </div>
    </Modal>
  );
}
