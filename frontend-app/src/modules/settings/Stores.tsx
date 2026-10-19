import { useEffect, useState } from "react";
import { Store as StoreIcon } from "lucide-react";
import { getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
import { Badge, EmptyState, Field, FormGroup, FormGroups, FormView, RecordList, errMsg } from "../../components/erp";
import { StoreLocationPicker } from "../../components/StoreLocationPicker";
import { useRecordNav, useResource } from "../shared";

export type StoreRow = {
  id: number;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  allowedRadius: number;
  openTime: string | null;
  closeTime: string | null;
  isActive: boolean;
  _count?: { staff: number; tables: number };
};

const BASE = "/app/settings/stores";

export function StoreList() {
  const { data: rows, loading, error } = useResource<StoreRow[]>("/api/admin/stores", []);
  const go = useRecordNav(BASE);
  const owner = isOwnerRole(getStaffInfo()?.role);
  return (
    <RecordList
      crumbs={[{ label: "Chi nhánh" }]}
      rows={rows}
      rowKey={(s) => s.id}
      loading={loading}
      error={error}
      onOpen={(s) => go.open(s.id)}
      onCreate={owner ? go.create : undefined}
      columns={[
        { key: "code", label: "Mã", value: (s) => s.code, width: 80 },
        { key: "name", label: "Tên chi nhánh", value: (s) => s.name },
        { key: "address", label: "Địa chỉ", value: (s) => s.address ?? "", wrap: true, optional: true },
        { key: "phone", label: "SĐT", value: (s) => s.phone ?? "", optional: true },
        { key: "hours", label: "Giờ mở cửa", value: (s) => (s.openTime && s.closeTime ? `${s.openTime}–${s.closeTime}` : ""), optional: true },
        { key: "staff", label: "Nhân viên", value: (s) => s._count?.staff ?? 0, numeric: true },
        { key: "tables", label: "Bàn", value: (s) => s._count?.tables ?? 0, numeric: true },
        {
          key: "status",
          label: "Trạng thái",
          value: (s) => (s.isActive ? "Hoạt động" : "Ngừng"),
          render: (s) => <Badge tone={s.isActive ? "success" : "neutral"}>{s.isActive ? "Hoạt động" : "Ngừng"}</Badge>,
        },
      ]}
      searchText={(s) => `${s.code} ${s.name} ${s.address ?? ""}`}
      exportName="chi-nhanh"
      emptyState={<EmptyState icon={StoreIcon} title="Chưa có chi nhánh" />}
    />
  );
}

type FormState = {
  code: string;
  name: string;
  address: string;
  phone: string;
  openTime: string;
  closeTime: string;
  isActive: boolean;
  lat: number;
  lng: number;
  radius: number;
};

const EMPTY: FormState = {
  code: "", name: "", address: "", phone: "", openTime: "07:00", closeTime: "22:00",
  isActive: true, lat: 10.7769, lng: 106.7009, radius: 50,
};

export function StoreForm({ recordId }: { recordId?: string }) {
  const isNew = recordId === "new";
  const go = useRecordNav(BASE);
  const owner = isOwnerRole(getStaffInfo()?.role);
  const list = useResource<StoreRow[]>(isNew ? null : "/api/admin/stores", []);
  const s = isNew ? null : list.data.find((x) => String(x.id) === recordId) ?? null;
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = (x: StoreRow) =>
    setForm({
      code: x.code, name: x.name, address: x.address ?? "", phone: x.phone ?? "",
      openTime: x.openTime ?? "", closeTime: x.closeTime ?? "", isActive: x.isActive,
      lat: x.lat, lng: x.lng, radius: x.allowedRadius,
    });
  useEffect(() => {
    if (s) reset(s);
  }, [s]);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const ro = !editing;

  async function save() {
    if (!form.name.trim() || !form.code.trim()) return setErr("Thiếu mã hoặc tên chi nhánh");
    setSaving(true);
    setErr(null);
    const body = JSON.stringify({
      code: form.code, name: form.name, address: form.address, phone: form.phone,
      openTime: form.openTime || null, closeTime: form.closeTime || null, isActive: form.isActive,
      lat: form.lat, lng: form.lng, allowedRadius: form.radius,
    });
    try {
      if (isNew) {
        const created = await staffApi<{ id?: number }>("/api/admin/stores", { method: "POST", body });
        return created?.id ? go.open(created.id) : go.list();
      }
      await staffApi(`/api/admin/stores/${recordId}`, { method: "PATCH", body });
      await list.reload();
      setEditing(false);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  if (!isNew && !s) {
    return (
      <FormView crumbs={[{ label: "Chi nhánh", to: BASE }, { label: "…" }]} editing={false} canEdit={false} error={list.error}>
        <div className="o-muted">{list.loading ? "Đang tải…" : "Không tìm thấy chi nhánh."}</div>
      </FormView>
    );
  }

  return (
    <FormView
      crumbs={[{ label: "Chi nhánh", to: BASE }, { label: isNew ? "Mới" : s!.name }]}
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
    >
      <div className="o-sheet-title">
        <div style={{ flex: 1 }}>
          <div className="o-field-label">Tên chi nhánh <span style={{ color: "var(--o-danger)" }}>*</span></div>
          {ro ? <h1>{form.name}</h1> : <input className="o-input" value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus={isNew} />}
        </div>
      </div>
      <FormGroups>
        <FormGroup title="Thông tin">
          <Field label="Mã chi nhánh">
            {/* Mã và trạng thái hoạt động: chỉ Chủ chuỗi đổi */}
            <input className="o-input" value={form.code} disabled={ro || !owner} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="VD: Q1" />
          </Field>
          <Field label="SĐT"><input className="o-input" type="tel" value={form.phone} disabled={ro} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="Địa chỉ"><input className="o-input" value={form.address} disabled={ro} onChange={(e) => set("address", e.target.value)} /></Field>
        </FormGroup>
        <FormGroup title="Hoạt động">
          <Field label="Mở cửa"><input className="o-input" type="time" value={form.openTime} disabled={ro} onChange={(e) => set("openTime", e.target.value)} /></Field>
          <Field label="Đóng cửa"><input className="o-input" type="time" value={form.closeTime} disabled={ro} onChange={(e) => set("closeTime", e.target.value)} /></Field>
          <Field label="Đang hoạt động">
            <label className="o-check">
              <input type="checkbox" checked={form.isActive} disabled={ro || !owner} onChange={(e) => set("isActive", e.target.checked)} />
              {form.isActive ? "Nhận khách" : "Tạm ngừng"}
            </label>
          </Field>
        </FormGroup>
      </FormGroups>
      <Field label="Vị trí GPS (chấm công, tính phí giao hàng)" full>
        <StoreLocationPicker
          value={{ lat: form.lat, lng: form.lng, radius: form.radius }}
          onChange={(v) => setForm((f) => ({ ...f, lat: v.lat, lng: v.lng, radius: v.radius }))}
          onAddress={(a) => set("address", a)}
          onErr={setErr}
          disabled={ro}
        />
      </Field>
    </FormView>
  );
}
