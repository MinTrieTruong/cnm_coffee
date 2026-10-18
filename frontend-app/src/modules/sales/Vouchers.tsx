import { useState } from "react";
import { Lock, Ticket, Unlock } from "lucide-react";
import { staffApi } from "../../lib/staffApi";
import {
  Badge, Button, EmptyState, Field, FormGroup, FormGroups, FormView, RecordList, errMsg, fmtDate, formatVnd, type Tone,
} from "../../components/erp";
import { useRecordNav, useResource } from "../shared";

export type VoucherRow = {
  id: number;
  code: string;
  description: string | null;
  discountValue: number;
  minBillValue: number;
  startDate: string;
  endDate: string;
  quantity: number;
  usedCount: number;
  isActive: boolean;
  voucherType: string;
  goldHourStart: number | null;
  goldHourEnd: number | null;
  _count?: { userVouchers: number };
};

const BASE = "/app/sales/vouchers";

function statusOf(v: VoucherRow): { id: string; label: string; tone: Tone } {
  if (!v.isActive) return { id: "locked", label: "Đã khóa", tone: "danger" };
  if (new Date(v.endDate) < new Date()) return { id: "expired", label: "Hết hạn", tone: "neutral" };
  if (v.quantity !== -1 && v.usedCount >= v.quantity) return { id: "exhausted", label: "Hết lượt", tone: "neutral" };
  return { id: "running", label: "Đang chạy", tone: "success" };
}

export function VoucherList() {
  const { data: rows, loading, error } = useResource<VoucherRow[]>("/api/vouchers/admin", []);
  const go = useRecordNav(BASE);
  return (
    <RecordList
      crumbs={[{ label: "Voucher" }]}
      rows={rows}
      rowKey={(v) => v.id}
      loading={loading}
      error={error}
      onOpen={(v) => go.open(v.id)}
      onCreate={go.create}
      columns={[
        { key: "code", label: "Mã", value: (v) => v.code, render: (v) => <code style={{ fontWeight: 600 }}>{v.code}</code> },
        { key: "desc", label: "Mô tả", value: (v) => v.description ?? "", wrap: true, optional: true },
        { key: "value", label: "Giảm", value: (v) => v.discountValue, numeric: true, render: (v) => formatVnd(v.discountValue) },
        { key: "min", label: "Đơn tối thiểu", value: (v) => v.minBillValue, numeric: true, render: (v) => formatVnd(v.minBillValue) },
        { key: "used", label: "Đã dùng", value: (v) => v.usedCount, numeric: true, render: (v) => `${v.usedCount}/${v.quantity === -1 ? "∞" : v.quantity}` },
        { key: "saved", label: "Đã lưu ví", value: (v) => v._count?.userVouchers ?? 0, numeric: true, optional: true },
        { key: "type", label: "Loại", value: (v) => (v.voucherType === "personal" ? "Cá nhân" : "Công khai") },
        { key: "gold", label: "Giờ vàng", value: (v) => (v.goldHourStart !== null && v.goldHourEnd !== null ? `${v.goldHourStart}h–${v.goldHourEnd}h` : ""), optional: true },
        { key: "end", label: "Hết hạn", value: (v) => v.endDate, render: (v) => fmtDate(v.endDate) },
        { key: "status", label: "Trạng thái", value: (v) => statusOf(v).label, render: (v) => <Badge tone={statusOf(v).tone}>{statusOf(v).label}</Badge> },
      ]}
      searchText={(v) => `${v.code} ${v.description ?? ""}`}
      filters={[
        { id: "running", label: "Đang chạy", test: (v) => statusOf(v).id === "running" },
        { id: "ended", label: "Hết hạn / hết lượt", test: (v) => ["expired", "exhausted"].includes(statusOf(v).id) },
        { id: "locked", label: "Đã khóa", test: (v) => !v.isActive },
      ]}
      groupBys={[
        { id: "status", label: "Trạng thái", key: (v) => statusOf(v).label },
        { id: "type", label: "Loại", key: (v) => (v.voucherType === "personal" ? "Cá nhân" : "Công khai") },
      ]}
      exportName="voucher"
      emptyState={<EmptyState icon={Ticket} title="Chưa có voucher nào" hint="Bấm Tạo mới để tạo voucher đầu tiên." />}
    />
  );
}

const EMPTY_FORM = {
  code: "", description: "", discountValue: "", minBillValue: "0",
  endDate: "", quantity: "100", voucherType: "public",
  goldHourStart: "", goldHourEnd: "", autoGift: false,
};

export function VoucherForm({ recordId }: { recordId?: string }) {
  const isNew = recordId === "new";
  const go = useRecordNav(BASE);
  const list = useResource<VoucherRow[]>(isNew ? null : "/api/vouchers/admin", []);
  const v = isNew ? null : list.data.find((x) => String(x.id) === recordId) ?? null;
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof typeof EMPTY_FORM>(k: K, val: (typeof EMPTY_FORM)[K]) => setForm((f) => ({ ...f, [k]: val }));

  async function create() {
    setSaving(true);
    setErr(null);
    try {
      await staffApi("/api/vouchers/admin", {
        method: "POST",
        body: JSON.stringify({
          code: form.code,
          description: form.description || null,
          discountValue: Number(form.discountValue),
          minBillValue: Number(form.minBillValue),
          endDate: form.endDate,
          quantity: Number(form.quantity),
          voucherType: form.voucherType,
          goldHourStart: form.goldHourStart ? Number(form.goldHourStart) : null,
          goldHourEnd: form.goldHourEnd ? Number(form.goldHourEnd) : null,
          autoGift: form.autoGift,
        }),
      });
      go.list();
    } catch (e) {
      setErr(errMsg(e, "Lỗi tạo voucher"));
      setSaving(false);
    }
  }

  async function toggleLock() {
    if (!v) return;
    try {
      await staffApi(`/api/vouchers/admin/${v.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !v.isActive }) });
      await list.reload();
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  if (isNew) {
    return (
      <FormView
        crumbs={[{ label: "Voucher", to: BASE }, { label: "Mới" }]}
        editing
        onSave={() => void create()}
        onDiscard={go.list}
        saving={saving}
        error={err}
      >
        <div className="o-sheet-title">
          <div style={{ flex: 1 }}>
            <div className="o-field-label">Mã voucher <span style={{ color: "var(--o-danger)" }}>*</span></div>
            <input className="o-input" placeholder="VD: COFFEE2026" value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} autoFocus />
          </div>
        </div>
        <FormGroups>
          <FormGroup title="Giá trị">
            <Field label="Giảm giá (VND)" required>
              <input className="o-input" type="number" min={1000} placeholder="20000" value={form.discountValue} onChange={(e) => set("discountValue", e.target.value)} />
            </Field>
            <Field label="Hóa đơn tối thiểu">
              <input className="o-input" type="number" min={0} value={form.minBillValue} onChange={(e) => set("minBillValue", e.target.value)} />
            </Field>
            <Field label="Số lượng" required>
              <input className="o-input" type="number" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} title="-1 = không giới hạn" />
            </Field>
          </FormGroup>
          <FormGroup title="Áp dụng">
            <Field label="Hết hạn" required>
              <input className="o-input" type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
            </Field>
            <Field label="Loại">
              <select className="o-input" value={form.voucherType} onChange={(e) => set("voucherType", e.target.value)}>
                <option value="public">Công khai — ai cũng dùng được</option>
                <option value="personal">Cá nhân — phải lưu vào ví</option>
              </select>
            </Field>
            <Field label="Giờ vàng">
              <span className="o-row" style={{ flexWrap: "nowrap" }}>
                <input className="o-input" type="number" min={0} max={23} placeholder="Từ (0–23)" value={form.goldHourStart} onChange={(e) => set("goldHourStart", e.target.value)} />
                <span className="o-muted">–</span>
                <input className="o-input" type="number" min={0} max={23} placeholder="Đến" value={form.goldHourEnd} onChange={(e) => set("goldHourEnd", e.target.value)} />
              </span>
            </Field>
          </FormGroup>
        </FormGroups>
        <Field label="Mô tả" full>
          <input className="o-input" placeholder="Chương trình tri ân khách hàng…" value={form.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <p className="o-muted" style={{ margin: "4px 0 8px" }}>Số lượng -1 = không giới hạn. Để trống giờ vàng = áp dụng cả ngày.</p>
        <label className="o-check">
          <input type="checkbox" checked={form.autoGift} onChange={(e) => set("autoGift", e.target.checked)} />
          Tự động tặng cho tất cả khách hiện tại
        </label>
      </FormView>
    );
  }

  if (!v) {
    return (
      <FormView crumbs={[{ label: "Voucher", to: BASE }, { label: "…" }]} editing={false} canEdit={false} error={list.error}>
        <div className="o-muted">{list.loading ? "Đang tải…" : "Không tìm thấy voucher."}</div>
      </FormView>
    );
  }
  const st = statusOf(v);
  return (
    <FormView
      crumbs={[{ label: "Voucher", to: BASE }, { label: v.code }]}
      editing={false}
      canEdit={false}
      error={err}
      actions={
        <Button variant={v.isActive ? "secondary" : "primary"} icon={v.isActive ? Lock : Unlock} onClick={() => void toggleLock()}>
          {v.isActive ? "Khóa" : "Mở khóa"}
        </Button>
      }
    >
      <div className="o-sheet-title">
        <div style={{ flex: 1 }}>
          <h1><code>{v.code}</code></h1>
          {v.description && <div className="o-sheet-sub">{v.description}</div>}
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <FormGroups>
        <FormGroup title="Giá trị">
          <Field label="Giảm giá">{formatVnd(v.discountValue)}</Field>
          <Field label="Hóa đơn tối thiểu">{formatVnd(v.minBillValue)}</Field>
          <Field label="Đã dùng">{v.usedCount}/{v.quantity === -1 ? "∞" : v.quantity}</Field>
          <Field label="Đã lưu ví">{v._count?.userVouchers ?? 0}</Field>
        </FormGroup>
        <FormGroup title="Áp dụng">
          <Field label="Loại">{v.voucherType === "personal" ? "Cá nhân" : "Công khai"}</Field>
          <Field label="Bắt đầu">{fmtDate(v.startDate)}</Field>
          <Field label="Hết hạn">{fmtDate(v.endDate)}</Field>
          <Field label="Giờ vàng">{v.goldHourStart !== null && v.goldHourEnd !== null ? `${v.goldHourStart}h–${v.goldHourEnd}h` : "Cả ngày"}</Field>
        </FormGroup>
      </FormGroups>
    </FormView>
  );
}
