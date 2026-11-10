import { useEffect, useState } from "react";
import { Trash2, Truck } from "lucide-react";
import { staffApi } from "../../lib/staffApi";
import { Button, Chatter, EmptyState, Field, FormGroup, FormGroups, FormView, RecordList, errMsg } from "../../components/erp";
import { useRecordNav, useResource } from "../shared";
import { PasswordInput } from "../../components/PasswordInput";

type SupplierRow = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  email: string | null;
  note: string | null;
  isActive: boolean;
  createdAt: string;
  username?: string | null;
  paymentTermDays?: number;
};

const BASE = "/app/purchase/suppliers";

export function SupplierList() {
  const { data: rows, loading, error } = useResource<SupplierRow[]>("/api/admin/suppliers", []);
  const go = useRecordNav(BASE);
  return (
    <RecordList
      crumbs={[{ label: "Nhà cung cấp" }]}
      // Giữ như cũ: chỉ hiển thị nhà cung cấp còn hoạt động
      rows={rows.filter((s) => s.isActive)}
      rowKey={(s) => s.id}
      loading={loading}
      error={error}
      onOpen={(s) => go.open(s.id)}
      onCreate={go.create}
      columns={[
        { key: "id", label: "Mã", value: (s) => s.id, numeric: true, width: 60 },
        { key: "name", label: "Tên", value: (s) => s.name },
        { key: "phone", label: "SĐT", value: (s) => s.phone ?? "" },
        { key: "email", label: "Email", value: (s) => s.email ?? "" },
        { key: "address", label: "Địa chỉ", value: (s) => s.address ?? "", wrap: true, optional: true },
        { key: "user", label: "Tài khoản portal", value: (s) => s.username ?? "", optional: true },
        { key: "note", label: "Ghi chú", value: (s) => s.note ?? "", wrap: true, optional: true },
      ]}
      searchText={(s) => `${s.name} ${s.phone ?? ""} ${s.email ?? ""}`}
      exportName="nha-cung-cap"
      emptyState={<EmptyState icon={Truck} title="Chưa có nhà cung cấp" />}
    />
  );
}

const EMPTY = { name: "", phone: "", address: "", email: "", note: "", username: "", password: "", paymentTermDays: "30" };

export function SupplierForm({ recordId }: { recordId?: string }) {
  const isNew = recordId === "new";
  const go = useRecordNav(BASE);
  const list = useResource<SupplierRow[]>(isNew ? null : "/api/admin/suppliers", []);
  const s = isNew ? null : list.data.find((x) => String(x.id) === recordId) ?? null;
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reset = (x: SupplierRow) =>
    setForm({ name: x.name, phone: x.phone ?? "", address: x.address ?? "", email: x.email ?? "", note: x.note ?? "", username: x.username ?? "", password: "", paymentTermDays: String(x.paymentTermDays ?? 30) });
  useEffect(() => {
    if (s) reset(s);
  }, [s]);
  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const ro = !editing;
  const payload = () => ({ ...form, paymentTermDays: Number(form.paymentTermDays) || 0 });

  async function save() {
    if (!form.name.trim()) return setErr("Thiếu tên nhà cung cấp");
    setSaving(true);
    setErr(null);
    try {
      if (isNew) {
        const created = await staffApi<{ id?: number }>("/api/admin/suppliers", { method: "POST", body: JSON.stringify(payload()) });
        return created?.id ? go.open(created.id) : go.list();
      }
      await staffApi(`/api/admin/suppliers/${recordId}`, { method: "PATCH", body: JSON.stringify(payload()) });
      await list.reload();
      setEditing(false);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!s || !window.confirm("Xóa nhà cung cấp này?")) return;
    try {
      await staffApi(`/api/admin/suppliers/${s.id}`, { method: "DELETE" });
      go.list();
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  if (!isNew && !s) {
    return (
      <FormView crumbs={[{ label: "Nhà cung cấp", to: BASE }, { label: "…" }]} editing={false} canEdit={false} error={list.error}>
        <div className="o-muted">{list.loading ? "Đang tải…" : "Không tìm thấy nhà cung cấp."}</div>
      </FormView>
    );
  }

  return (
    <FormView
      crumbs={[{ label: "Nhà cung cấp", to: BASE }, { label: isNew ? "Mới" : s!.name }]}
      editing={editing}
      onEdit={() => setEditing(true)}
      onSave={() => void save()}
      onDiscard={() => {
        if (isNew) return go.list();
        reset(s!);
        setEditing(false);
        setErr(null);
      }}
      saving={saving}
      error={err}
      actions={s && !editing ? <Button variant="danger" icon={Trash2} onClick={() => void remove()}>Xóa</Button> : undefined}
      chatter={s ? <Chatter target={`NCC #${s.id}`} action="SUPPLIER" reloadKey={reloadKey} /> : undefined}
    >
      <div className="o-sheet-title">
        <div style={{ flex: 1 }}>
          <div className="o-field-label">Tên nhà cung cấp <span style={{ color: "var(--o-danger)" }}>*</span></div>
          {ro ? <h1>{form.name}</h1> : <input className="o-input" value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus={isNew} />}
        </div>
      </div>
      <FormGroups>
        <FormGroup title="Liên hệ">
          <Field label="SĐT"><input className="o-input" type="tel" value={form.phone} disabled={ro} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="Email"><input className="o-input" type="email" value={form.email} disabled={ro} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Địa chỉ"><input className="o-input" value={form.address} disabled={ro} onChange={(e) => set("address", e.target.value)} /></Field>
        </FormGroup>
        <FormGroup title="Cổng nhà cung cấp">
          <Field label="Tên đăng nhập"><input className="o-input" value={form.username} disabled={ro} onChange={(e) => set("username", e.target.value)} /></Field>
          {editing && (
            <Field label="Mật khẩu">
              <PasswordInput className="o-input" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder={isNew ? "" : "Để trống nếu không đổi"} />
            </Field>
          )}
        </FormGroup>
      </FormGroups>
      <Field label="Kỳ hạn thanh toán (ngày)">
        <input className="o-input" inputMode="numeric" value={form.paymentTermDays} disabled={ro} onChange={(e) => set("paymentTermDays", e.target.value)} />
      </Field>
      <Field label="Ghi chú" full>
        <input className="o-input" value={form.note} disabled={ro} onChange={(e) => set("note", e.target.value)} />
      </Field>
    </FormView>
  );
}
