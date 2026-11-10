import { useEffect, useState } from "react";
import { Check, ExternalLink, RotateCcw, Save, Trash2 } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
import { Alert, Badge, Button, Field, FormGroup, FormGroups, Modal, RecordList, errMsg, fmtDateTime } from "../../components/erp";
import { ImageField, useResource } from "../shared";

/* ═══════════ Website › Banner trang chủ ═══════════ */

type BannerRow = {
  id: number; imageUrl: string; title: string | null; subtitle: string | null; link: string | null;
  sortOrder: number; isActive: boolean; storeId: number | null; store: { id: number; name: string } | null; editable: boolean;
};
type BannerDraft = { id?: number; imageUrl: string; title: string; subtitle: string; link: string; sortOrder: number; isActive: boolean; storeId: number | null; editable: boolean };
const NEW_BANNER: BannerDraft = { imageUrl: "", title: "", subtitle: "", link: "", sortOrder: 0, isActive: true, storeId: null, editable: true };

function BannerModal({ draft, stores, onClose, onSaved }: { draft: BannerDraft; stores: { id: number; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const owner = isOwnerRole(getStaffInfo()?.role);
  const [f, setF] = useState(draft);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof BannerDraft>(k: K, v: BannerDraft[K]) => setF((x) => ({ ...x, [k]: v }));
  const ro = !f.editable;

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const body = JSON.stringify({ ...f, title: f.title, subtitle: f.subtitle, link: f.link });
      if (f.id) await staffApi(`/api/admin/banners/${f.id}`, { method: "PUT", body });
      else await staffApi("/api/admin/banners", { method: "POST", body });
      onSaved();
    } catch (e) {
      setErrs((e as { fields?: Record<string, string> }).fields ?? {});
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!f.id || !window.confirm("Xóa banner này?")) return;
    setBusy(true);
    try {
      await staffApi(`/api/admin/banners/${f.id}`, { method: "DELETE" });
      onSaved();
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={f.id ? "Sửa banner" : "Thêm banner"}
      size="lg"
      onClose={onClose}
      footer={
        <>
          {f.id && !ro && <Button variant="danger" icon={Trash2} onClick={() => void remove()} disabled={busy}>Xóa</Button>}
          <span style={{ flex: 1 }} />
          <Button onClick={onClose}>Đóng</Button>
          {!ro && <Button variant="primary" icon={Save} onClick={() => void save()} disabled={busy || uploading}>{busy ? "Đang lưu…" : "Lưu"}</Button>}
        </>
      }
    >
      {ro && <Alert tone="info">Banner cả chuỗi do Chủ chuỗi quản lý — bạn chỉ xem được.</Alert>}
      {err && <Alert>{err}</Alert>}
      <FormGroups>
        <FormGroup title="Ảnh">
          <Field label="Ảnh banner" required full>
            <ImageField value={f.imageUrl} onChange={(v) => set("imageUrl", v)} disabled={ro} onBusy={setUploading} />
            <div className="o-hint">Ảnh ngang tỉ lệ khoảng 16:7 (vd 1600×700). Trên điện thoại ảnh được cắt về 4:3 — để chủ thể ở giữa.</div>
            {errs.imageUrl && <div className="o-error">{errs.imageUrl}</div>}
          </Field>
          {mediaUrl(f.imageUrl) && <img src={mediaUrl(f.imageUrl)} alt="" style={{ width: "100%", aspectRatio: "16 / 7", objectFit: "cover", borderRadius: 4 }} />}
        </FormGroup>
        <FormGroup title="Chữ trên ảnh">
          <Field label="Tiêu đề">
            <input className="o-input" value={f.title} maxLength={120} onChange={(e) => set("title", e.target.value)} disabled={ro} placeholder="Để trống nếu ảnh đã có chữ" />
          </Field>
          <Field label="Dòng phụ">
            <input className="o-input" value={f.subtitle} maxLength={200} onChange={(e) => set("subtitle", e.target.value)} disabled={ro} />
          </Field>
          <Field label="Đường dẫn khi bấm">
            <input className="o-input" value={f.link} maxLength={500} onChange={(e) => set("link", e.target.value)} disabled={ro} placeholder="/menu?category=1 hoặc https://…" />
            {errs.link && <div className="o-error">{errs.link}</div>}
          </Field>
        </FormGroup>
        <FormGroup title="Hiển thị">
          {owner && (
            <Field label="Phạm vi">
              <select className="o-input" value={f.storeId ?? ""} onChange={(e) => set("storeId", e.target.value ? Number(e.target.value) : null)} disabled={ro}>
                <option value="">Cả chuỗi</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Thứ tự">
            <input className="o-input" type="number" value={f.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value) || 0)} disabled={ro} style={{ maxWidth: 120 }} />
          </Field>
          <Field label="Đang bật">
            <input type="checkbox" checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} disabled={ro} />
          </Field>
        </FormGroup>
      </FormGroups>
    </Modal>
  );
}

export function BannerList() {
  const list = useResource<BannerRow[]>("/api/admin/banners", []);
  const stores = useResource<{ id: number; name: string }[]>("/api/stores", []);
  const [edit, setEdit] = useState<BannerDraft | null>(null);
  const open = (b: BannerRow) =>
    setEdit({ id: b.id, imageUrl: b.imageUrl, title: b.title ?? "", subtitle: b.subtitle ?? "", link: b.link ?? "", sortOrder: b.sortOrder, isActive: b.isActive, storeId: b.storeId, editable: b.editable });
  return (
    <>
      <RecordList
        crumbs={[{ label: "Banner trang chủ" }]}
        rows={list.data}
        rowKey={(b) => b.id}
        loading={list.loading}
        error={list.error}
        onOpen={open}
        onCreate={() => setEdit(NEW_BANNER)}
        top={<Alert tone="info">Banner chạy ở khối đầu trang chủ, theo thứ tự tăng dần. Khách đang chọn chi nhánh nào thấy banner cả chuỗi + banner của chi nhánh đó (tối đa 8).</Alert>}
        columns={[
          { key: "img", label: "Ảnh", value: (b) => b.imageUrl, render: (b) => <img src={mediaUrl(b.imageUrl)} alt="" style={{ width: 96, aspectRatio: "16 / 7", objectFit: "cover", borderRadius: 3, display: "block" }} /> },
          { key: "title", label: "Tiêu đề", value: (b) => b.title ?? "", render: (b) => b.title ? <strong style={{ fontWeight: 500 }}>{b.title}</strong> : <span className="o-muted">(không chữ)</span> },
          { key: "link", label: "Đường dẫn", value: (b) => b.link ?? "", optional: true },
          { key: "scope", label: "Phạm vi", value: (b) => b.store?.name ?? "Cả chuỗi" },
          { key: "order", label: "Thứ tự", value: (b) => b.sortOrder },
          { key: "on", label: "Trạng thái", value: (b) => (b.isActive ? "Bật" : "Tắt"), render: (b) => (b.isActive ? <Badge tone="success">Bật</Badge> : <Badge>Tắt</Badge>) },
        ]}
        searchText={(b) => `${b.title ?? ""} ${b.subtitle ?? ""} ${b.link ?? ""}`}
        filters={[
          { id: "on", label: "Đang bật", test: (b) => b.isActive },
          { id: "off", label: "Đang tắt", test: (b) => !b.isActive },
        ]}
      />
      {edit && (
        <BannerModal
          draft={edit}
          stores={stores.data}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            void list.reload();
          }}
        />
      )}
    </>
  );
}

/* ═══════════ CRM › Liên hệ từ khách ═══════════ */

type Msg = {
  id: number; kind: "CONTACT" | "NEWSLETTER"; name: string | null; email: string | null; phone: string | null; message: string | null;
  status: "NEW" | "HANDLED"; createdAt: string; handledAt: string | null; store: { id: number; name: string } | null;
};

export function ContactMessages() {
  const list = useResource<Msg[]>("/api/admin/contact-messages", []);
  const [view, setView] = useState<Msg | null>(null);
  const [busy, setBusy] = useState(false);
  async function mark(m: Msg, handled: boolean) {
    setBusy(true);
    try {
      await staffApi(`/api/admin/contact-messages/${m.id}`, { method: "PATCH", body: JSON.stringify({ handled }) });
      await list.reload();
      setView(null);
    } catch (e) {
      alert(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <RecordList
        crumbs={[{ label: "Liên hệ từ khách" }]}
        rows={list.data}
        rowKey={(m) => m.id}
        loading={list.loading}
        error={list.error}
        onOpen={setView}
        exportName="lien-he-tu-khach"
        defaultFilters={["new", "contact"]}
        columns={[
          { key: "at", label: "Thời gian", value: (m) => m.createdAt, render: (m) => fmtDateTime(m.createdAt) },
          { key: "kind", label: "Loại", value: (m) => (m.kind === "CONTACT" ? "Form liên hệ" : "Đăng ký nhận tin") },
          { key: "name", label: "Họ tên", value: (m) => m.name ?? "", render: (m) => <strong style={{ fontWeight: 500 }}>{m.name ?? "—"}</strong> },
          { key: "email", label: "Email", value: (m) => m.email ?? "" },
          { key: "phone", label: "SĐT", value: (m) => m.phone ?? "", optional: true },
          { key: "msg", label: "Nội dung", value: (m) => m.message ?? "", wrap: true, optional: true },
          { key: "store", label: "Chi nhánh khách chọn", value: (m) => m.store?.name ?? "", optional: true },
          { key: "st", label: "Trạng thái", value: (m) => (m.status === "NEW" ? "Mới" : "Đã xử lý"), render: (m) => (m.status === "NEW" ? <Badge tone="warning">Mới</Badge> : <Badge tone="success">Đã xử lý</Badge>) },
        ]}
        searchText={(m) => `${m.name ?? ""} ${m.email ?? ""} ${m.phone ?? ""} ${m.message ?? ""}`}
        filters={[
          { id: "new", label: "Chưa xử lý", test: (m) => m.status === "NEW" },
          { id: "contact", label: "Form liên hệ", test: (m) => m.kind === "CONTACT" },
          { id: "news", label: "Đăng ký nhận tin", test: (m) => m.kind === "NEWSLETTER" },
        ]}
        bulkActions={[{ label: "Đánh dấu đã xử lý", onClick: async (rows) => { for (const m of rows) await staffApi(`/api/admin/contact-messages/${m.id}`, { method: "PATCH", body: JSON.stringify({ handled: true }) }); await list.reload(); } }]}
        selectable
      />
      {view && (
        <Modal
          title={view.kind === "CONTACT" ? `Liên hệ từ ${view.name ?? "khách"}` : "Đăng ký nhận tin"}
          onClose={() => setView(null)}
          footer={
            <>
              {view.email && <Button icon={ExternalLink} onClick={() => window.open(`mailto:${view.email}`)}>Trả lời qua email</Button>}
              <span style={{ flex: 1 }} />
              {view.status === "NEW" ? (
                <Button variant="primary" icon={Check} onClick={() => void mark(view, true)} disabled={busy}>Đã xử lý</Button>
              ) : (
                <Button icon={RotateCcw} onClick={() => void mark(view, false)} disabled={busy}>Chuyển về chưa xử lý</Button>
              )}
            </>
          }
        >
          <FormGroups>
            <FormGroup>
              <Field label="Thời gian">{fmtDateTime(view.createdAt)}</Field>
              <Field label="Email">{view.email ?? "—"}</Field>
              <Field label="SĐT">{view.phone ? <a href={`tel:${view.phone}`}>{view.phone}</a> : "—"}</Field>
              <Field label="Chi nhánh">{view.store?.name ?? "—"}</Field>
              {view.handledAt && <Field label="Xử lý lúc">{fmtDateTime(view.handledAt)}</Field>}
            </FormGroup>
          </FormGroups>
          {view.message && <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, marginTop: 12 }}>{view.message}</p>}
        </Modal>
      )}
    </>
  );
}

/* ═══════════ Website › Thông tin công ty ═══════════ */

type Company = { name: string; intro: string; address: string; email: string; phone: string; hours: string };
const FIELDS: { k: keyof Company; api: string; label: string; max: number; long?: boolean; hint?: string }[] = [
  { k: "name", api: "companyName", label: "Tên công ty / thương hiệu", max: 150 },
  { k: "intro", api: "companyIntro", label: "Giới thiệu ngắn", max: 500, long: true, hint: "Hiện ở chân trang và khối \"Câu chuyện TD Coffee\" trên trang chủ." },
  { k: "address", api: "companyAddress", label: "Địa chỉ", max: 255 },
  { k: "phone", api: "companyPhone", label: "Số điện thoại", max: 20, hint: "Hotline mặc định khi chi nhánh chưa có nút Gọi ngay." },
  { k: "email", api: "companyEmail", label: "Email", max: 150 },
  { k: "hours", api: "companyHours", label: "Giờ mở cửa", max: 100, hint: "VD: 7:00 – 22:00 hằng ngày" },
];

export function SiteInfoSettings() {
  const info = useResource<{ company: Company } | null>("/api/site-info", null);
  const [f, setF] = useState<Company | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "danger" | "info"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (info.data) setF(info.data.company);
  }, [info.data]);

  async function save() {
    if (!f) return;
    setSaving(true);
    setMsg(null);
    setErrs({});
    try {
      await staffApi("/api/admin/site-info", { method: "PATCH", body: JSON.stringify(Object.fromEntries(FIELDS.map((x) => [x.api, f[x.k]]))) });
      setMsg({ tone: "info", text: "Đã lưu — trang khách cập nhật khi tải lại." });
    } catch (e) {
      setErrs((e as { fields?: Record<string, string> }).fields ?? {});
      setMsg({ tone: "danger", text: errMsg(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="o-stack" style={{ maxWidth: 760, gap: 16 }}>
      <div className="o-row" style={{ justifyContent: "space-between" }}>
        <h1 className="o-h1" style={{ margin: 0 }}>Thông tin công ty</h1>
        <Button variant="primary" icon={Save} onClick={() => void save()} disabled={!f || saving}>{saving ? "Đang lưu…" : "Lưu"}</Button>
      </div>
      {info.error && <Alert>{info.error}</Alert>}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {f && (
        <FormGroups>
          <FormGroup title="Hiện ở chân trang, trang Liên hệ và trang chủ">
            {FIELDS.map((x) => (
              <Field key={x.k} label={x.label} required full={x.long}>
                {x.long ? (
                  <textarea className="o-input" rows={4} maxLength={x.max} value={f[x.k]} onChange={(e) => setF({ ...f, [x.k]: e.target.value })} />
                ) : (
                  <input className="o-input" maxLength={x.max} value={f[x.k]} onChange={(e) => setF({ ...f, [x.k]: e.target.value })} />
                )}
                {x.hint && <div className="o-hint">{x.hint}</div>}
                {errs[x.api] && <div className="o-error">{errs[x.api]}</div>}
              </Field>
            ))}
          </FormGroup>
        </FormGroups>
      )}
    </div>
  );
}
