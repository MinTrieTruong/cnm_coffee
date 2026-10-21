import { useState } from "react";
import { HandCoins } from "lucide-react";
import { activeStoreId, getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
import { Alert, Badge, Button, EmptyState, Field, Kpi, ListView, Modal, RecordList, errMsg, fmtDate, fmtDateTime, formatVnd, type Tone } from "../../components/erp";
import { useResource } from "../shared";
import { PhotoInput, SafeOpenDialog, useSafe, type CashEntry } from "./shared";

type Bill = {
  id: number;
  code: string;
  source: "GRN" | "MANUAL";
  amount: number;
  paidAmount: number;
  remaining: number;
  billDate: string;
  dueDate: string;
  status: "UNPAID" | "PARTIAL" | "PAID" | "CANCELLED";
  overdue: boolean;
  note: string | null;
  supplier: { id: number; name: string; phone: string | null; paymentTermDays: number };
  store: { id: number; name: string };
  grn: { code: string; po: { code: string } } | null;
  createdBy: { fullName: string } | null;
  payments: (CashEntry & { createdBy: { fullName: string } })[];
};

const BILL_STATUS: Record<Bill["status"], { label: string; tone: Tone }> = {
  UNPAID: { label: "Chưa trả", tone: "warning" },
  PARTIAL: { label: "Trả một phần", tone: "info" },
  PAID: { label: "Đã trả", tone: "success" },
  CANCELLED: { label: "Đã huỷ", tone: "neutral" },
};
const statusOf = (b: Bill) => (b.overdue ? { label: "Quá hạn", tone: "danger" as Tone } : BILL_STATUS[b.status]);
const in7days = (b: Bill) => b.status !== "PAID" && !b.overdue && new Date(b.dueDate).getTime() - Date.now() < 7 * 86400_000;

/** Tài chính › Công nợ NCC — phát sinh khi nhận hàng; trả một phần / toàn bộ, tự lập phiếu chi */
export function Payables() {
  const { data: rows, loading, error, reload } = useResource<Bill[]>("/api/cash/payables", []);
  const [open, setOpen] = useState<Bill | null>(null);
  const [creating, setCreating] = useState(false);
  const allStores = isOwnerRole(getStaffInfo()?.role) && activeStoreId() == null;
  const unpaid = rows.filter((b) => b.status !== "PAID");

  return (
    <>
      <RecordList
        crumbs={[{ label: "Công nợ nhà cung cấp" }]}
        rows={rows}
        rowKey={(b) => b.id}
        loading={loading}
        error={error}
        onOpen={setOpen}
        onCreate={allStores ? undefined : () => setCreating(true)}
        createLabel="Ghi hoá đơn NCC"
        top={
          <div className="o-kpis">
            <Kpi label="Tổng còn nợ" value={formatVnd(unpaid.reduce((s, b) => s + b.remaining, 0))} tone="warning" />
            <Kpi label="Quá hạn" value={formatVnd(unpaid.filter((b) => b.overdue).reduce((s, b) => s + b.remaining, 0))} tone="danger" />
            <Kpi label="Đến hạn trong 7 ngày" value={formatVnd(unpaid.filter(in7days).reduce((s, b) => s + b.remaining, 0))} />
            <Kpi label="Số nhà cung cấp đang nợ" value={new Set(unpaid.map((b) => b.supplier.id)).size} />
          </div>
        }
        columns={[
          { key: "code", label: "Mã", value: (b) => b.code },
          { key: "supplier", label: "Nhà cung cấp", value: (b) => b.supplier.name },
          ...(allStores ? [{ key: "store", label: "Chi nhánh", value: (b: Bill) => b.store.name }] : []),
          { key: "src", label: "Chứng từ", value: (b) => (b.grn ? `${b.grn.code} · ${b.grn.po.code}` : "Hoá đơn nhập tay"), optional: true },
          { key: "date", label: "Ngày phát sinh", value: (b) => b.billDate, render: (b) => fmtDate(b.billDate) },
          { key: "due", label: "Hạn trả", value: (b) => b.dueDate, render: (b) => fmtDate(b.dueDate) },
          { key: "amt", label: "Số tiền", value: (b) => b.amount, numeric: true, sum: true, formatSum: formatVnd, render: (b) => formatVnd(b.amount) },
          { key: "paid", label: "Đã trả", value: (b) => b.paidAmount, numeric: true, sum: true, formatSum: formatVnd, render: (b) => formatVnd(b.paidAmount) },
          { key: "rem", label: "Còn nợ", value: (b) => b.remaining, numeric: true, sum: true, formatSum: formatVnd, render: (b) => <b>{formatVnd(b.remaining)}</b> },
          { key: "st", label: "Trạng thái", value: (b) => statusOf(b).label, render: (b) => <Badge tone={statusOf(b).tone}>{statusOf(b).label}</Badge> },
        ]}
        searchText={(b) => `${b.code} ${b.supplier.name} ${b.grn?.code ?? ""} ${b.grn?.po.code ?? ""} ${b.note ?? ""}`}
        filters={[
          { id: "unpaid", label: "Còn nợ", test: (b) => b.status !== "PAID" },
          { id: "overdue", label: "Quá hạn", test: (b) => b.overdue },
          { id: "soon", label: "Đến hạn 7 ngày", test: in7days },
          { id: "paid", label: "Đã trả", test: (b) => b.status === "PAID" },
        ]}
        defaultFilters={["unpaid"]}
        groupBys={[
          { id: "supplier", label: "Nhà cung cấp", key: (b) => b.supplier.name },
          { id: "status", label: "Trạng thái", key: (b) => statusOf(b).label },
        ]}
        exportName="cong-no-ncc"
        emptyState={<EmptyState icon={HandCoins} title="Không có công nợ" hint="Công nợ tự phát sinh khi kho nhận hàng theo đơn đặt hàng; hoặc ghi hoá đơn mua ngoài." />}
      />
      {open && <BillDetail bill={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); void reload(); }} />}
      {creating && <BillCreate onClose={() => setCreating(false)} onDone={() => { setCreating(false); void reload(); }} />}
    </>
  );
}

function BillDetail({ bill: b, onClose, onChanged }: { bill: Bill; onClose: () => void; onChanged: () => void }) {
  const [amount, setAmount] = useState(String(b.remaining));
  const [fund, setFund] = useState<"BANK" | "SAFE">("BANK");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openingSafe, setOpeningSafe] = useState(false);
  const { safe, reload: reloadSafe } = useSafe();
  const canPay = b.status !== "PAID" && b.status !== "CANCELLED";

  async function pay() {
    setBusy(true);
    try {
      await staffApi(`/api/cash/payables/${b.id}/pay`, {
        method: "POST",
        body: JSON.stringify({ amount: Number(amount.replace(/\D/g, "")), fund, description, photo }),
      });
      onChanged();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!window.confirm(`Huỷ công nợ ${b.code}?`)) return;
    try {
      await staffApi(`/api/cash/payables/${b.id}/cancel`, { method: "POST" });
      onChanged();
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  const safeClosed = fund === "SAFE" && safe != null && !safe.session;

  return (
    <Modal
      title={`Công nợ ${b.code} — ${b.supplier.name}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          {b.paidAmount === 0 && b.status !== "CANCELLED" && <Button variant="danger" onClick={() => void cancel()}>Huỷ công nợ</Button>}
          {canPay && <Button variant="primary" disabled={busy || safeClosed} onClick={() => void pay()}>Thanh toán</Button>}
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      <div className="o-stack" style={{ gap: 12 }}>
        <div className="o-kpis">
          <Kpi label="Số tiền" value={formatVnd(b.amount)} />
          <Kpi label="Đã trả" value={formatVnd(b.paidAmount)} tone="success" />
          <Kpi label="Còn nợ" value={formatVnd(b.remaining)} tone={b.overdue ? "danger" : "warning"} />
        </div>
        <div>
          Phát sinh {fmtDate(b.billDate)} · Hạn trả <b>{fmtDate(b.dueDate)}</b> (kỳ hạn {b.supplier.paymentTermDays} ngày) · <Badge tone={statusOf(b).tone}>{statusOf(b).label}</Badge>
          <br />
          {b.grn ? `Nhận hàng ${b.grn.code} theo đơn ${b.grn.po.code}` : "Hoá đơn nhập tay"}{b.note ? ` — ${b.note}` : ""}
        </div>

        <div>
          <div className="o-section-title" style={{ margin: "0 0 6px" }}>Lịch sử thanh toán</div>
          <ListView
            rows={b.payments}
            rowKey={(p) => p.id}
            emptyState={<span className="o-muted">Chưa thanh toán lần nào.</span>}
            columns={[
              { key: "code", label: "Phiếu chi", value: (p) => p.code },
              { key: "time", label: "Thời gian", value: (p) => p.createdAt, render: (p) => fmtDateTime(p.createdAt) },
              { key: "fund", label: "Hình thức", value: (p) => (p.fromFund === "BANK" ? "Chuyển khoản" : "Tiền mặt (két)") },
              { key: "by", label: "Người trả", value: (p) => p.createdBy.fullName },
              { key: "amt", label: "Số tiền", value: (p) => p.amount, numeric: true, sum: true, formatSum: formatVnd, render: (p) => formatVnd(p.amount) },
            ]}
          />
        </div>

        {canPay && (
          <div className="o-stack" style={{ gap: 8 }}>
            <div className="o-section-title" style={{ margin: 0 }}>Thanh toán</div>
            <Field label="Số tiền trả" required full>
              <input className="o-input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Hình thức" required full>
              <select className="o-input" value={fund} onChange={(e) => setFund(e.target.value as "BANK" | "SAFE")}>
                <option value="BANK">Chuyển khoản (quỹ ngân hàng)</option>
                <option value="SAFE">Tiền mặt (lấy từ két)</option>
              </select>
            </Field>
            <Field label="Ghi chú" full>
              <input className="o-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="VD: CK Vietcombank, mã GD 123456" />
            </Field>
            <Field label="Ảnh uỷ nhiệm chi / biên nhận" full><PhotoInput value={photo} onChange={setPhoto} /></Field>
            {safeClosed && <Alert tone="warning">Két đang đóng. <Button size="sm" variant="primary" onClick={() => setOpeningSafe(true)}>Mở két</Button></Alert>}
          </div>
        )}
      </div>
      {openingSafe && <SafeOpenDialog defaultReason={`Trả nhà cung cấp ${b.supplier.name}`} onClose={() => setOpeningSafe(false)} onDone={() => { setOpeningSafe(false); void reloadSafe(); }} />}
    </Modal>
  );
}

/** Ghi hoá đơn mua ngoài quy trình đặt hàng (mua chợ, NCC giao trực tiếp…) */
function BillCreate({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { data: suppliers } = useResource<{ id: number; name: string; paymentTermDays: number; isActive: boolean }[]>("/api/admin/suppliers", []);
  const [supplierId, setSupplierId] = useState("");
  const [amount, setAmount] = useState("");
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sup = suppliers.find((s) => String(s.id) === supplierId);
  async function submit() {
    setBusy(true);
    try {
      await staffApi("/api/cash/payables", {
        method: "POST",
        body: JSON.stringify({ supplierId: Number(supplierId), amount: Number(amount.replace(/\D/g, "")), billDate, dueDate: dueDate || undefined, note }),
      });
      onDone();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Ghi hoá đơn nhà cung cấp"
      onClose={onClose}
      footer={<><Button onClick={onClose}>Huỷ</Button><Button variant="primary" disabled={busy || !supplierId || !amount} onClick={() => void submit()}>Ghi công nợ</Button></>}
    >
      {err && <Alert>{err}</Alert>}
      <div className="o-stack" style={{ gap: 10 }}>
        <Field label="Nhà cung cấp" required full>
          <select className="o-input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— Chọn —</option>
            {suppliers.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Số tiền" required full><input className="o-input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Ngày hoá đơn" full><input type="date" className="o-input" value={billDate} onChange={(e) => setBillDate(e.target.value)} /></Field>
        <Field label="Hạn trả" full>
          <input type="date" className="o-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          {!dueDate && sup && <span className="o-muted"> Mặc định: sau {sup.paymentTermDays} ngày</span>}
        </Field>
        <Field label="Ghi chú" full><input className="o-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Số hoá đơn, nội dung hàng…" /></Field>
      </div>
    </Modal>
  );
}
