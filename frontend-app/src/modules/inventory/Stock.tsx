import { useEffect, useState } from "react";
import { AlertTriangle, PackagePlus, Trash2, Warehouse } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { staffApi } from "../../lib/staffApi";
import {
  Alert, Badge, Button, EmptyState, Field, FormGroup, FormGroups, FormView, Kpi, Modal, RecordList, errMsg, fmtDate,
} from "../../components/erp";
import { ImageField, digits, useRecordNav, useResource } from "../shared";

export type InvRow = {
  id: number;
  name: string;
  skuCode: string | null;
  unit: string | null;
  stockQty: number;
  minLevel: number;
  supplier: string | null;
  imageUrl: string | null;
};
type ExpiringLot = { id: number; expiryDate: string; remainingQty: number; item: { name: string; unit: string | null } };

const BASE = "/app/inventory/stock";
const isLow = (i: InvRow) => i.stockQty <= i.minLevel;

export function StockList() {
  const { data: rows, loading, error, setError, reload } = useResource<InvRow[]>("/api/admin/inventory", []);
  const lots = useResource<ExpiringLot[]>("/api/admin/inventory/expiring", []);
  const go = useRecordNav(BASE);

  async function discard(id: number) {
    if (!window.confirm("Bạn có chắc chắn muốn hủy lô hàng này không? Sẽ bị trừ khỏi tồn kho!")) return;
    try {
      await staffApi(`/api/admin/inventory/receipts/${id}/discard`, { method: "POST" });
      await Promise.all([lots.reload(), reload()]);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <RecordList
      crumbs={[{ label: "Tồn kho" }]}
      rows={rows}
      rowKey={(i) => i.id}
      loading={loading}
      error={error}
      onOpen={(i) => go.open(i.id)}
      onCreate={go.create}
      top={
        <div className="o-stack">
          <div className="o-kpis">
            <Kpi label="Tổng loại nguyên liệu" value={rows.length} />
            <Kpi label="Sắp hết / dưới mức tối thiểu" value={rows.filter(isLow).length} tone={rows.some(isLow) ? "danger" : undefined} />
            <Kpi label="Lô sắp / đã hết hạn" value={lots.data.length} tone={lots.data.length ? "warning" : undefined} />
          </div>
          {lots.data.length > 0 && (
            <div className="o-panel">
              <div className="o-panel-head"><span className="o-row" style={{ gap: 6 }}><AlertTriangle size={16} aria-hidden /> Lô hàng sắp / đã hết hạn</span></div>
              <table className="o-list">
                <thead>
                  <tr><th>Nguyên liệu</th><th>Lô</th><th>Hết hạn</th><th className="num">Còn lại</th><th /></tr>
                </thead>
                <tbody>
                  {lots.data.map((r) => {
                    const overdue = new Date(r.expiryDate).getTime() < Date.now();
                    return (
                      <tr key={r.id}>
                        <td>{r.item.name}{r.item.unit ? ` (${r.item.unit})` : ""}</td>
                        <td>#{r.id}</td>
                        <td>{fmtDate(r.expiryDate)} {overdue ? <Badge tone="danger">Đã quá hạn</Badge> : <Badge tone="warning">Sắp hết hạn</Badge>}</td>
                        <td className="num">{r.remainingQty}</td>
                        <td style={{ textAlign: "right" }}><Button size="sm" variant="danger" onClick={() => void discard(r.id)}>Hủy lô</Button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      }
      columns={[
        { key: "img", label: "", width: 40, sortable: false, render: (i) => (mediaUrl(i.imageUrl) ? <img className="o-thumb" src={mediaUrl(i.imageUrl)} alt="" /> : <span className="o-thumb" />) },
        { key: "name", label: "Nguyên liệu", value: (i) => i.name },
        { key: "sku", label: "SKU", value: (i) => i.skuCode ?? "", optional: true },
        { key: "unit", label: "Đơn vị", value: (i) => i.unit ?? "" },
        { key: "stock", label: "Tồn kho", value: (i) => i.stockQty, numeric: true, render: (i) => <span style={isLow(i) ? { color: "var(--o-danger)", fontWeight: 600 } : undefined}>{i.stockQty.toLocaleString("vi-VN")}</span> },
        { key: "min", label: "Tối thiểu", value: (i) => i.minLevel, numeric: true },
        { key: "supplier", label: "Nhà cung cấp", value: (i) => i.supplier ?? "", optional: true },
        { key: "state", label: "Tình trạng", value: (i) => (isLow(i) ? "Sắp hết" : "Đủ"), render: (i) => (isLow(i) ? <Badge tone="danger">Sắp hết</Badge> : <Badge tone="success">Đủ</Badge>) },
      ]}
      searchText={(i) => `${i.name} ${i.skuCode ?? ""} ${i.supplier ?? ""}`}
      filters={[
        { id: "low", label: "Sắp hết / dưới mức tối thiểu", test: isLow },
        { id: "ok", label: "Đủ hàng", test: (i) => !isLow(i) },
      ]}
      groupBys={[
        { id: "supplier", label: "Nhà cung cấp", key: (i) => i.supplier ?? "" },
        { id: "unit", label: "Đơn vị", key: (i) => i.unit ?? "" },
      ]}
      exportName="ton-kho"
      emptyState={<EmptyState icon={Warehouse} title="Chưa có nguyên liệu" />}
    />
  );
}

const EMPTY = { name: "", skuCode: "", unit: "", stockQty: "", minLevel: "", supplier: "", imageUrl: "" };

export function StockForm({ recordId }: { recordId?: string }) {
  const isNew = recordId === "new";
  const go = useRecordNav(BASE);
  const list = useResource<InvRow[]>(isNew ? null : "/api/admin/inventory", []);
  const item = isNew ? null : list.data.find((x) => String(x.id) === recordId) ?? null;
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recvOpen, setRecvOpen] = useState(false);

  const reset = (x: InvRow) =>
    setForm({ name: x.name, skuCode: x.skuCode ?? "", unit: x.unit ?? "", stockQty: String(x.stockQty), minLevel: String(x.minLevel), supplier: x.supplier ?? "", imageUrl: x.imageUrl ?? "" });
  useEffect(() => {
    if (item) reset(item);
  }, [item]);
  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const ro = !editing;

  async function save() {
    if (!form.name.trim()) return setErr("Nhập tên nguyên liệu.");
    setSaving(true);
    setErr(null);
    const body = JSON.stringify({
      name: form.name.trim(),
      skuCode: form.skuCode.trim() || null,
      unit: form.unit.trim() || null,
      stockQty: digits(form.stockQty) || 0,
      minLevel: digits(form.minLevel) || 0,
      supplier: form.supplier.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
    });
    try {
      if (isNew) {
        const created = await staffApi<{ id?: number }>("/api/admin/inventory", { method: "POST", body });
        return created?.id ? go.open(created.id) : go.list();
      }
      await staffApi(`/api/admin/inventory/${recordId}`, { method: "PATCH", body });
      await list.reload();
      setEditing(false);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!item || !window.confirm(`Xóa hẳn nguyên liệu "${item.name}"? Các phiếu xin liên quan cũng bị xóa.`)) return;
    try {
      await staffApi(`/api/admin/inventory/${item.id}`, { method: "DELETE" });
      go.list();
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  if (!isNew && !item) {
    return (
      <FormView crumbs={[{ label: "Tồn kho", to: BASE }, { label: "…" }]} editing={false} canEdit={false} error={list.error}>
        <div className="o-muted">{list.loading ? "Đang tải…" : "Không tìm thấy nguyên liệu."}</div>
      </FormView>
    );
  }

  return (
    <FormView
      crumbs={[{ label: "Tồn kho", to: BASE }, { label: isNew ? "Mới" : item!.name }]}
      editing={editing}
      onEdit={() => setEditing(true)}
      onSave={() => void save()}
      onDiscard={() => {
        if (isNew) return go.list();
        reset(item!);
        setEditing(false);
        setErr(null);
      }}
      saving={saving}
      error={err}
      actions={
        item && !editing ? (
          <>
            <Button variant="primary" icon={PackagePlus} onClick={() => setRecvOpen(true)}>Nhập kho</Button>
            <Button variant="danger" icon={Trash2} onClick={() => void remove()}>Xóa</Button>
          </>
        ) : undefined
      }
    >
      <div className="o-sheet-title">
        <div style={{ flex: 1 }}>
          <div className="o-field-label">Tên nguyên liệu <span style={{ color: "var(--o-danger)" }}>*</span></div>
          {ro ? <h1>{form.name}</h1> : <input className="o-input" value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus={isNew} />}
          {item && isLow(item) && <div style={{ marginTop: 6 }}><Badge tone="danger">Dưới mức tối thiểu</Badge></div>}
        </div>
        {mediaUrl(form.imageUrl) ? <img className="o-sheet-avatar" src={mediaUrl(form.imageUrl)} alt="" /> : <div className="o-sheet-avatar" />}
      </div>
      <FormGroups>
        <FormGroup title="Thông tin">
          <Field label="SKU"><input className="o-input" value={form.skuCode} disabled={ro} onChange={(e) => set("skuCode", e.target.value)} /></Field>
          <Field label="Đơn vị"><input className="o-input" value={form.unit} disabled={ro} onChange={(e) => set("unit", e.target.value)} placeholder={ro ? "" : "kg, hộp…"} /></Field>
          <Field label="Nhà cung cấp"><input className="o-input" value={form.supplier} disabled={ro} onChange={(e) => set("supplier", e.target.value)} /></Field>
        </FormGroup>
        <FormGroup title="Tồn kho">
          <Field label={isNew ? "Tồn ban đầu" : "Tồn kho"}><input className="o-input" value={form.stockQty} disabled={ro} onChange={(e) => set("stockQty", e.target.value)} /></Field>
          <Field label="Mức tối thiểu"><input className="o-input" value={form.minLevel} disabled={ro} onChange={(e) => set("minLevel", e.target.value)} /></Field>
        </FormGroup>
      </FormGroups>
      <Field label="Ảnh minh họa" full>
        <ImageField value={form.imageUrl} onChange={(u) => set("imageUrl", u)} disabled={ro} onBusy={setSaving} />
      </Field>
      {recvOpen && item && (
        <ReceiveDialog
          item={item}
          onClose={() => setRecvOpen(false)}
          onDone={async () => {
            setRecvOpen(false);
            await list.reload();
          }}
        />
      )}
    </FormView>
  );
}

function ReceiveDialog({ item, onClose, onDone }: { item: InvRow; onClose: () => void; onDone: () => Promise<void> }) {
  const [qty, setQty] = useState("");
  const [expiry, setExpiry] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    const n = digits(qty);
    if (Number.isNaN(n) || n <= 0) return setErr("Số lượng nhập không hợp lệ");
    setBusy(true);
    try {
      await staffApi(`/api/admin/inventory/${item.id}/receive`, { method: "POST", body: JSON.stringify({ qty: n, expiryDate: expiry || undefined }) });
      await onDone();
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`Nhập kho: ${item.name}`}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} disabled={busy}>Nhập kho</Button>
          <Button onClick={onClose}>Hủy</Button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      <Field label={`Số lượng${item.unit ? ` (${item.unit})` : ""}`} required>
        <input className="o-input" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
      </Field>
      <Field label="Hạn sử dụng">
        <input className="o-input" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
      </Field>
    </Modal>
  );
}
