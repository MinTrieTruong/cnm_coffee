import { useEffect, useMemo, useState } from "react";
import { Coins, KeyRound, MessageSquare, Ticket, UserRound } from "lucide-react";
import { getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
import {
  Badge, Button, Chatter, EmptyState, Field, FormGroup, FormGroups, FormView, Modal, RecordList, Alert, Tabs,
  errMsg, fmtDate, fmtDateTime, formatVnd,
} from "../../components/erp";
import { CareModal, HabitsTab, LIFE, OrdersTab, OverviewKpis, PerksTab, PointsTab, type CareKind, type Insights, type LifeStatus } from "./CustomerInsights";
import { useRecordNav, useResource } from "../shared";
import { PasswordInput } from "../../components/PasswordInput";
import { CustomerAvatar } from "../../components/CustomerAvatar";

type CustomerRow = {
  id: number;
  fullName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  dob: string | null;
  points: number;
  rankTier: string;
  createdAt: string;
  lastLogin: string | null;
  avatarUrl?: string | null;
};

/** Số liệu mua hàng theo phạm vi chi nhánh (GET /api/admin/customers/summary) */
type Summary = Record<number, { orderCount: number; totalSpent: number; lastOrderAt: string; status: LifeStatus }>;

const BASE = "/app/sales/customers";
/** Sinh nhật trong tháng hiện tại */
const birthdayThisMonth = (dob: string | null) => !!dob && Number(dob.slice(5, 7)) === new Date().getMonth() + 1;
const RANK: Record<string, string> = { Dong: "Đồng", Bac: "Bạc", Vang: "Vàng", KimCuong: "Kim cương" };

export function CustomerList() {
  const { data: base, loading, error } = useResource<CustomerRow[]>("/api/admin/customers", []);
  const { data: summary } = useResource<Summary>("/api/admin/customers/summary", {});
  const rows = useMemo(() => base.map((c) => ({ ...c, s: summary[c.id] ?? null })), [base, summary]);
  type Row = (typeof rows)[number];
  const st = (c: Row): LifeStatus => c.s?.status ?? "NONE";
  const go = useRecordNav(BASE);
  return (
    <RecordList
      crumbs={[{ label: "Khách hàng" }]}
      rows={rows}
      rowKey={(c) => c.id}
      loading={loading}
      error={error}
      onOpen={(c) => go.open(c.id)}
      columns={[
        { key: "id", label: "Mã", value: (c) => c.id, numeric: true, width: 70 },
        {
          key: "name",
          label: "Họ tên",
          value: (c) => c.fullName,
          render: (c) => (
            <span className="o-inline" style={{ flexWrap: "nowrap", gap: 8 }}>
              <CustomerAvatar src={c.avatarUrl} name={c.fullName} size={28} />
              <span>{c.fullName}</span>
            </span>
          ),
        },
        { key: "phone", label: "SĐT", value: (c) => c.phone ?? "" },
        { key: "email", label: "Email", value: (c) => c.email ?? "", optional: true },
        { key: "points", label: "Điểm", value: (c) => c.points, numeric: true, sum: true },
        { key: "rank", label: "Hạng", value: (c) => RANK[c.rankTier] ?? c.rankTier, render: (c) => <Badge tone="primary">{RANK[c.rankTier] ?? c.rankTier}</Badge> },
        { key: "orders", label: "Số đơn", value: (c) => c.s?.orderCount ?? 0, numeric: true },
        { key: "spent", label: "Tổng chi", value: (c) => c.s?.totalSpent ?? 0, numeric: true, render: (c) => (c.s ? formatVnd(c.s.totalSpent) : ""), sum: true },
        { key: "last", label: "Mua gần nhất", value: (c) => c.s?.lastOrderAt ?? "", render: (c) => (c.s ? fmtDate(c.s.lastOrderAt) : "") },
        { key: "status", label: "Trạng thái", value: (c) => LIFE[st(c)].label, render: (c) => <span title={LIFE[st(c)].hint}><Badge tone={LIFE[st(c)].tone}>{LIFE[st(c)].label}</Badge></span> },
        { key: "created", label: "Ngày tạo", value: (c) => c.createdAt, render: (c) => fmtDate(c.createdAt), optional: true },
        { key: "login", label: "Đăng nhập gần nhất", value: (c) => c.lastLogin ?? "", render: (c) => fmtDateTime(c.lastLogin), optional: true },
      ]}
      searchText={(c) => `${c.fullName} ${c.phone ?? ""} ${c.email ?? ""}`}
      filters={[
        { id: "loyal", label: "Thân thiết", test: (c: Row) => st(c) === "LOYAL" },
        { id: "risk", label: "Sắp rời", test: (c: Row) => st(c) === "AT_RISK" },
        { id: "lost", label: "Đã rời", test: (c: Row) => st(c) === "LOST" },
        { id: "bday", label: "Sinh nhật tháng này", test: (c: Row) => birthdayThisMonth(c.dob) },
        ...Object.entries(RANK).map(([id, label]) => ({ id, label: `Hạng ${label}`, test: (c: Row) => c.rankTier === id })),
      ]}
      groupBys={[
        { id: "status", label: "Trạng thái", key: (c) => LIFE[st(c)].label },
        { id: "rank", label: "Hạng", key: (c) => RANK[c.rankTier] ?? c.rankTier },
      ]}
      exportName="khach-hang"
      emptyState={<EmptyState icon={UserRound} title="Chưa có khách hàng" />}
    />
  );
}

export function CustomerForm({ recordId }: { recordId?: string }) {
  const list = useResource<CustomerRow[]>("/api/admin/customers", []);
  const c = list.data.find((x) => String(x.id) === recordId) ?? null;
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", address: "", dob: "", points: "0", rankTier: "Dong" });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<"overview" | "habits" | "orders" | "points" | "perks">("overview");
  // Sửa thông tin / đặt lại mật khẩu khách: chỉ Chủ chuỗi (quản lý chi nhánh xem hồ sơ)
  const owner = isOwnerRole(getStaffInfo()?.role);
  /** Thao tác chăm sóc đang mở */
  const [care, setCare] = useState<CareKind | null>(null);
  const [ins, setIns] = useState<Insights | null>(null);
  const [insErr, setInsErr] = useState<string | null>(null);
  useEffect(() => {
    if (!recordId) return;
    setIns(null);
    staffApi<Insights>(`/api/admin/customers/${recordId}/insights`).then(setIns).catch((e) => setInsErr(errMsg(e)));
  }, [recordId, reloadKey]);

  const reset = (x: CustomerRow) =>
    setForm({ fullName: x.fullName, phone: x.phone ?? "", email: x.email ?? "", address: x.address ?? "", dob: x.dob ? x.dob.slice(0, 10) : "", points: String(x.points), rankTier: x.rankTier });
  useEffect(() => {
    if (c) reset(c);
  }, [c]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!c) return;
    setSaving(true);
    setErr(null);
    try {
      await staffApi(`/api/admin/customers/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullName: form.fullName,
          phone: form.phone,
          email: form.email,
          address: form.address,
          dob: form.dob || null,
          points: Number(form.points) || 0,
          rankTier: form.rankTier,
        }),
      });
      await list.reload();
      setEditing(false);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  if (!c) {
    return (
      <FormView crumbs={[{ label: "Khách hàng", to: BASE }, { label: "…" }]} editing={false} canEdit={false} error={list.error}>
        <div className="o-muted">{list.loading ? "Đang tải…" : "Không tìm thấy khách hàng."}</div>
      </FormView>
    );
  }
  const ro = !editing;
  return (
    <FormView
      crumbs={[{ label: "Khách hàng", to: BASE }, { label: c.fullName }]}
      editing={editing}
      canEdit={owner}
      onEdit={() => setEditing(true)}
      onSave={() => void save()}
      onDiscard={() => {
        reset(c);
        setEditing(false);
        setErr(null);
      }}
      saving={saving}
      error={err}
      info={info}
      actions={
        !editing ? (
          <>
            <Button icon={Ticket} onClick={() => setCare("voucher")}>Tặng voucher</Button>
            <Button icon={Coins} onClick={() => setCare("points")}>Điều chỉnh điểm</Button>
            <Button icon={MessageSquare} onClick={() => setCare("message")}>Nhắn khách</Button>
            {owner && <Button icon={KeyRound} onClick={() => setPwOpen(true)}>Đặt lại mật khẩu</Button>}
          </>
        ) : undefined
      }
      chatter={<Chatter target={`Customer #${c.id}`} action="CUSTOMER" reloadKey={reloadKey} />}
    >
      <div className="o-sheet-title">
        {/* Ảnh đại diện khách tự đặt (chưa có thì hiện chữ cái đầu) */}
        <CustomerAvatar src={ins?.customer.avatarUrl} name={c.fullName} size={64} />
        <div style={{ flex: 1 }}>
          <div className="o-field-label">Họ tên</div>
          {ro ? <h1>{c.fullName}</h1> : <input className="o-input" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />}
          <div className="o-sheet-sub">Mã KH #{c.id} · Hạng {RANK[c.rankTier] ?? c.rankTier}</div>
        </div>
      </div>
      <Tabs
        tabs={[
          { id: "overview", label: "Tổng quan" },
          { id: "habits", label: "Thói quen" },
          { id: "orders", label: "Lịch sử mua" },
          { id: "points", label: "Điểm" },
          { id: "perks", label: "Ưu đãi & quà" },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="o-tab-panel">
      {insErr && <Alert>{insErr}</Alert>}
      {tab === "overview" && ins && <OverviewKpis d={ins} rankLabel={RANK[c.rankTier] ?? c.rankTier} />}
      {tab !== "overview" && tab !== "orders" && tab !== "points" && !ins && !insErr && <p className="o-muted">Đang tải…</p>}
      {tab === "habits" && ins && <HabitsTab d={ins} />}
      {tab === "orders" && <OrdersTab customerId={c.id} />}
      {tab === "points" && <PointsTab key={reloadKey} customerId={c.id} />}
      {tab === "perks" && ins && <PerksTab d={ins} />}
      {tab === "overview" && (
      <FormGroups>
        <FormGroup title="Liên hệ">
          <Field label="SĐT"><input className="o-input" value={form.phone} disabled={ro} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="Email"><input className="o-input" value={form.email} disabled={ro} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Địa chỉ"><input className="o-input" value={form.address} disabled={ro} onChange={(e) => set("address", e.target.value)} /></Field>
          <Field label="Ngày sinh"><input className="o-input" type="date" value={form.dob} disabled={ro} onChange={(e) => set("dob", e.target.value)} /></Field>
        </FormGroup>
        <FormGroup title="Thành viên">
          <Field label="Điểm"><input className="o-input" value={form.points} disabled={ro} onChange={(e) => set("points", e.target.value)} /></Field>
          <Field label="Hạng">{RANK[c.rankTier] ?? c.rankTier}</Field>
          <Field label="Ngày tạo">{fmtDate(c.createdAt)}</Field>
          <Field label="Đăng nhập gần nhất">{fmtDateTime(c.lastLogin) || <span className="o-muted">—</span>}</Field>
        </FormGroup>
      </FormGroups>
      )}
      </div>
      {care && (
        <CareModal
          kind={care}
          customerId={c.id}
          name={c.fullName}
          points={c.points}
          onClose={() => setCare(null)}
          onDone={(m) => {
            setCare(null);
            setInfo(m);
            setReloadKey((k) => k + 1);
            void list.reload();
          }}
        />
      )}
      {pwOpen && (
        <ResetPasswordDialog
          customerId={c.id}
          onClose={() => setPwOpen(false)}
          onDone={() => {
            setPwOpen(false);
            setInfo("Đã reset mật khẩu khách hàng.");
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </FormView>
  );
}

function ResetPasswordDialog({ customerId, onClose, onDone }: { customerId: number; onClose: () => void; onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (pw.length < 6) return setErr("Mật khẩu mới tối thiểu 6 ký tự.");
    setBusy(true);
    try {
      await staffApi(`/api/admin/customers/${customerId}/reset-password`, { method: "POST", body: JSON.stringify({ newPassword: pw }) });
      onDone();
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Đặt lại mật khẩu khách"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} disabled={busy}>Đặt lại</Button>
          <Button onClick={onClose}>Hủy</Button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      <Field label="Mật khẩu mới">
        <PasswordInput className="o-input" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Tối thiểu 6 ký tự" autoFocus />
      </Field>
    </Modal>
  );
}
