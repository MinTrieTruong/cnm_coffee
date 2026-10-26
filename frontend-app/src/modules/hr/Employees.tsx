import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Lock, ScanFace, Users } from "lucide-react";
import { activeStoreId, getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
import { BRANCH_STAFF_ROLES, ROLE_LABEL } from "../../lib/roles";
import {
  Alert, Badge, Button, Chatter, EmptyState, Field, FormGroup, FormGroups, FormView, RecordList, StatusBar, Tabs,
  errMsg, fmtDate, formatVnd, ymd } from "../../components/erp";
import { useRecordNav, useResource } from "../shared";
import { PasswordInput } from "../../components/PasswordInput";
import { useAttendanceWarnings } from "./AttendanceWarnings";

type StaffRow = {
  id: number;
  username: string | null;
  fullName: string;
  role: string;
  status: string;
  phone: string | null;
  address: string | null;
  dob: string | null;
  hireDate: string;
  baseSalary: number;
  allowance?: number;
  hasFaceData?: boolean;
  storeId?: number | null;
  store?: { name: string } | null;
};
type StoreOpt = { id: number; name: string };

const BASE = "/app/hr/employees";
const ROLES = ["Admin", ...BRANCH_STAFF_ROLES];
/** Quản lý chi nhánh chỉ tạo nhân viên chi nhánh; Chủ chuỗi tạo thêm Quản lý và Chủ chuỗi */
const rolesFor = (owner: boolean) => (owner ? ["Owner", ...ROLES] : BRANCH_STAFF_ROLES);

export function EmployeeList() {
  const { data: rows, loading, error } = useResource<StaffRow[]>("/api/admin/staff", []);
  const go = useRecordNav(BASE);
  // Owner xem tất cả chi nhánh → thêm cột/nhóm theo chi nhánh
  const allStores = isOwnerRole(getStaffInfo()?.role) && activeStoreId() == null;
  const storeName = (s: StaffRow) => s.store?.name ?? (s.role === "Owner" ? "Toàn chuỗi" : "");
  const now = new Date();
  const { data: warn } = useAttendanceWarnings(now.getMonth() + 1, now.getFullYear());
  const warned = warn?.rows.filter((r) => r.warned) ?? [];
  return (
    <RecordList
      top={
        warned.length > 0 && (
          <Alert tone="warning">
            {warned.length} nhân viên bị cảnh báo chấm công tháng này (đi muộn từ {warn!.threshold} lần):{" "}
            {warned.map((r) => `${r.fullName} (${r.lateCount})`).join(", ")}. <Link to="/app/hr/warnings">Xem chi tiết</Link>
          </Alert>
        )
      }
      crumbs={[{ label: "Nhân viên" }]}
      rows={rows}
      rowKey={(s) => s.id}
      loading={loading}
      error={error}
      onOpen={(s) => go.open(s.id)}
      onCreate={go.create}
      defaultFilters={["active"]}
      columns={[
        { key: "id", label: "Mã", value: (s) => s.id, numeric: true, width: 60 },
        { key: "name", label: "Họ tên", value: (s) => s.fullName },
        { key: "user", label: "Tên đăng nhập", value: (s) => s.username ?? "" },
        { key: "role", label: "Vai trò", value: (s) => ROLE_LABEL[s.role] ?? s.role },
        ...(allStores ? [{ key: "store", label: "Chi nhánh", value: storeName }] : []),
        { key: "phone", label: "SĐT", value: (s) => s.phone ?? "" },
        { key: "hire", label: "Ngày vào làm", value: (s) => s.hireDate, render: (s) => fmtDate(s.hireDate), optional: true },
        { key: "dob", label: "Ngày sinh", value: (s) => s.dob ?? "", render: (s) => fmtDate(s.dob), optional: true, defaultHidden: true },
        { key: "address", label: "Địa chỉ", value: (s) => s.address ?? "", optional: true, defaultHidden: true },
        { key: "salary", label: "Lương cơ bản", value: (s) => s.baseSalary, numeric: true, optional: true, defaultHidden: true, render: (s) => formatVnd(s.baseSalary) },
        { key: "face", label: "FaceID", value: (s) => (s.hasFaceData ? "Đã đăng ký" : ""), render: (s) => (s.hasFaceData ? <Badge tone="info">Đã đăng ký</Badge> : ""), optional: true },
        { key: "status", label: "Trạng thái", value: (s) => s.status, render: (s) => <Badge tone={s.status === "Active" ? "success" : "danger"}>{s.status === "Active" ? "Đang làm" : "Đã khóa"}</Badge> },
      ]}
      searchText={(s) => `${s.fullName} ${s.username ?? ""} ${s.phone ?? ""}`}
      filters={[
        { id: "active", label: "Đang làm", test: (s) => s.status === "Active" },
        { id: "locked", label: "Đã khóa", test: (s) => s.status !== "Active" },
      ]}
      groupBys={[
        { id: "role", label: "Vai trò", key: (s) => ROLE_LABEL[s.role] ?? s.role },
        ...(allStores ? [{ id: "store", label: "Chi nhánh", key: storeName }] : []),
      ]}
      kanban={{
        columns: ROLES.map((r) => ({ id: r, label: ROLE_LABEL[r] })),
        columnOf: (s) => s.role,
        card: (s) => (
          <div>
            <div style={{ fontWeight: 500 }}>{s.fullName}</div>
            <div className="o-muted">{s.username ?? "—"} · {s.phone ?? "—"}</div>
            {s.status !== "Active" && <Badge tone="danger">Đã khóa</Badge>}
          </div>
        ),
      }}
      exportName="nhan-vien"
      emptyState={<EmptyState icon={Users} title="Chưa có nhân viên" />}
    />
  );
}

const EMPTY = {
  username: "", password: "", fullName: "", role: "Cashier", status: "Active", phone: "", address: "",
  dob: "", hireDate: ymd(new Date()), baseSalary: "0", allowance: "0", storeId: "",
};

export function EmployeeForm({ recordId }: { recordId?: string }) {
  const isNew = recordId === "new";
  const go = useRecordNav(BASE);
  const list = useResource<StaffRow[]>(isNew ? null : "/api/admin/staff", []);
  const s = isNew ? null : list.data.find((x) => String(x.id) === recordId) ?? null;
  const owner = isOwnerRole(getStaffInfo()?.role);
  // Chủ chuỗi chọn chi nhánh cho nhân viên; quản lý chi nhánh luôn tạo cho chi nhánh mình
  const stores = useResource<StoreOpt[]>(owner ? "/api/stores" : null, []);
  const [form, setForm] = useState(() => ({ ...EMPTY, storeId: String(activeStoreId() ?? "") }));
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [tab, setTab] = useState<"work" | "personal">("work");
  const [reloadKey, setReloadKey] = useState(0);

  const reset = (x: StaffRow) =>
    setForm({
      username: x.username ?? "", password: "", fullName: x.fullName, role: x.role, status: x.status,
      phone: x.phone ?? "", address: x.address ?? "", dob: x.dob ? x.dob.slice(0, 10) : "",
      hireDate: x.hireDate.slice(0, 10), baseSalary: String(x.baseSalary ?? 0), allowance: x.allowance != null ? String(x.allowance) : "",
      storeId: x.storeId != null ? String(x.storeId) : "",
    });
  useEffect(() => {
    if (s) reset(s);
  }, [s]);
  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const ro = !editing;

  async function save() {
    if (!form.fullName.trim()) return setErr("Thiếu họ tên nhân viên.");
    if (isNew && form.password.length < 4) return setErr("Mật khẩu tối thiểu 4 ký tự.");
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        username: form.username.trim() || undefined,
        password: form.password || undefined,
        fullName: form.fullName.trim(),
        role: form.role,
        status: form.status,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        dob: form.dob || null,
        hireDate: form.hireDate || undefined,
        baseSalary: Number(form.baseSalary),
        // API danh sách không trả allowance → chỉ gửi khi người dùng có nhập
        allowance: form.allowance === "" ? undefined : Number(form.allowance),
        ...(owner && form.role !== "Owner" && form.storeId ? { storeId: Number(form.storeId) } : {}),
      };
      if (owner && form.role !== "Owner" && !form.storeId) {
        setSaving(false);
        return setErr("Chọn chi nhánh cho nhân viên.");
      }
      if (isNew) {
        const created = await staffApi<{ id: number }>("/api/admin/staff", { method: "POST", body: JSON.stringify(payload) });
        if (created?.id) return go.open(created.id);
        return go.list();
      }
      await staffApi(`/api/admin/staff/${recordId}`, { method: "PATCH", body: JSON.stringify(payload) });
      await list.reload();
      setEditing(false);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function deactivate() {
    if (!s || !window.confirm("Khóa nhân viên này?")) return;
    try {
      await staffApi(`/api/admin/staff/${s.id}`, { method: "DELETE" });
      await list.reload();
      setReloadKey((k) => k + 1);
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  async function resetFace() {
    if (!s || !window.confirm(`Bạn chắc chắn muốn xóa dữ liệu khuôn mặt của [${s.fullName}]? Nhân viên sẽ phải đăng ký lại.`)) return;
    try {
      await staffApi(`/api/admin/staff/${s.id}/reset-face`, { method: "PATCH" });
      setInfo("Đã xóa dữ liệu khuôn mặt thành công!");
      await list.reload();
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  if (!isNew && !s) {
    return (
      <FormView crumbs={[{ label: "Nhân viên", to: BASE }, { label: "…" }]} editing={false} canEdit={false} error={list.error}>
        <div className="o-muted">{list.loading ? "Đang tải…" : "Không tìm thấy nhân viên."}</div>
      </FormView>
    );
  }

  return (
    <FormView
      crumbs={[{ label: "Nhân viên", to: BASE }, { label: isNew ? "Mới" : s!.fullName }]}
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
      info={info}
      actions={
        s && !editing ? (
          <>
            {s.status === "Active" && <Button icon={Lock} onClick={() => void deactivate()}>Khóa nhân viên</Button>}
            <Button icon={ScanFace} onClick={() => void resetFace()} disabled={!s.hasFaceData} title="Xóa dữ liệu FaceID">Reset FaceID</Button>
          </>
        ) : undefined
      }
      statusBar={
        s ? (
          <StatusBar steps={[{ id: "Active", label: "Đang làm" }, { id: "Inactive", label: "Đã khóa" }]} current={s.status === "Active" ? "Active" : "Inactive"} />
        ) : undefined
      }
      chatter={s ? <Chatter target={`Staff #${s.id}`} action="STAFF" reloadKey={reloadKey} /> : undefined}
    >
      <div className="o-sheet-title">
        <div style={{ flex: 1 }}>
          <div className="o-field-label">Họ tên <span style={{ color: "var(--o-danger)" }}>*</span></div>
          {ro ? <h1>{form.fullName}</h1> : <input className="o-input" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} autoFocus={isNew} />}
          {s && <div className="o-sheet-sub">{ROLE_LABEL[s.role] ?? s.role} · Mã NV #{s.id}</div>}
        </div>
      </div>
      <FormGroups>
        <FormGroup title="Tài khoản">
          <Field label="Tên đăng nhập">
            <input className="o-input" value={form.username} disabled={ro} onChange={(e) => set("username", e.target.value)} placeholder={ro ? "" : "Để trống để tự sinh"} />
          </Field>
          {editing && (
            <Field label={isNew ? "Mật khẩu" : "Mật khẩu mới"} required={isNew}>
              <PasswordInput className="o-input" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder={isNew ? "" : "Để trống nếu không đổi"} />
            </Field>
          )}
          <Field label="Vai trò">
            <select className="o-input" value={form.role} disabled={ro || (!owner && !BRANCH_STAFF_ROLES.includes(form.role))} onChange={(e) => set("role", e.target.value)}>
              {[...rolesFor(owner), ...(rolesFor(owner).includes(form.role) ? [] : [form.role])].map((r) => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
            </select>
          </Field>
          {owner && form.role !== "Owner" && (
            <Field label="Chi nhánh" required>
              <select className="o-input" value={form.storeId} disabled={ro} onChange={(e) => set("storeId", e.target.value)}>
                <option value="">Chọn chi nhánh…</option>
                {stores.data.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            </Field>
          )}
          {!owner && s?.store && <Field label="Chi nhánh"><span>{s.store.name}</span></Field>}
        </FormGroup>
        <FormGroup title="Liên hệ">
          <Field label="SĐT"><input className="o-input" value={form.phone} disabled={ro} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="Địa chỉ"><input className="o-input" value={form.address} disabled={ro} onChange={(e) => set("address", e.target.value)} /></Field>
        </FormGroup>
      </FormGroups>
      <Tabs tabs={[{ id: "work", label: "Công việc & lương" }, { id: "personal", label: "Cá nhân" }]} active={tab} onChange={setTab} />
      <div className="o-tab-panel">
        {tab === "work" && (
          <FormGroups>
            <FormGroup>
              <Field label="Ngày vào làm"><input className="o-input" type="date" value={form.hireDate} disabled={ro} onChange={(e) => set("hireDate", e.target.value)} /></Field>
            </FormGroup>
            <FormGroup>
              <Field label="Lương cơ bản / tháng">
                {ro ? formatVnd(Number(form.baseSalary)) : <input className="o-input" type="number" value={form.baseSalary} onChange={(e) => set("baseSalary", e.target.value)} />}
              </Field>
              <Field label="Phụ cấp cố định">
                {ro ? (form.allowance === "" ? <span className="o-muted">—</span> : formatVnd(Number(form.allowance))) : <input className="o-input" type="number" value={form.allowance} onChange={(e) => set("allowance", e.target.value)} />}
              </Field>
            </FormGroup>
          </FormGroups>
        )}
        {tab === "personal" && (
          <FormGroups>
            <FormGroup>
              <Field label="Ngày sinh"><input className="o-input" type="date" value={form.dob} disabled={ro} onChange={(e) => set("dob", e.target.value)} /></Field>
            </FormGroup>
            <FormGroup>
              <Field label="FaceID">{s?.hasFaceData ? <Badge tone="info">Đã đăng ký</Badge> : <span className="o-muted">Chưa đăng ký</span>}</Field>
            </FormGroup>
          </FormGroups>
        )}
      </div>
    </FormView>
  );
}
