import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ImagePlus, Save, Search, Trash2 } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { getStaffInfo, isOwnerRole, staffApi, staffUploadImage } from "../../lib/staffApi";
import { Alert, Breadcrumb, Button, errMsg } from "../../components/erp";
import { PostEditor } from "../../components/PostEditor";
import { PopupCard } from "../../components/popup/PopupCard";
import { readFileAsDataUrl, useResource } from "../shared";
import { AUDIENCE_LABEL, FREQUENCY_LABEL, POPUPS_BASE, type Audience, type Frequency, type PopupMeta, type PopupRow, type RefOption } from "./types";
import "../../styles/popup.css";

const MAX_BYTES = 2 * 1024 * 1024;

type Form = {
  name: string;
  description: string;
  imageUrl: string;
  targetType: string;
  targetRef: string;
  targetRefLabel: string;
  buttonText: string;
  sortOrder: string;
  isActive: boolean;
  startAt: string;
  endAt: string;
  allStores: boolean;
  storeIds: number[];
  audience: Audience;
  frequency: Frequency;
};

const EMPTY: Form = {
  name: "", description: "", imageUrl: "", targetType: "", targetRef: "", targetRefLabel: "", buttonText: "Xem ngay", sortOrder: "1",
  isActive: false, startAt: "", endAt: "", allStores: true, storeIds: [], audience: "ALL", frequency: "DAILY",
};

const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Dropdown có tìm kiếm cho đối tượng đích (voucher / chiến dịch / danh mục / món / bài tin) */
function RefPicker({ type, value, label, onPick }: { type: string; value: string; label: string; onPick: (v: string, label: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<RefOption[]>([]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      staffApi<RefOption[]>(`/api/admin/popups/ref-options?type=${type}&q=${encodeURIComponent(q)}`).then(setOpts).catch(() => setOpts([]));
    }, 200);
    return () => window.clearTimeout(t);
  }, [open, q, type]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div className="pu-picker" ref={box}>
      <button type="button" className="o-input pu-picker-btn" onClick={() => setOpen((v) => !v)}>
        {value ? label || `#${value}` : <span className="o-muted">— Chọn —</span>}
      </button>
      {open && (
        <div className="pu-picker-pop">
          <div className="pu-search">
            <Search size={14} aria-hidden />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm…" aria-label="Tìm" />
          </div>
          <div className="pu-picker-list">
            {opts.map((o) => (
              <button key={o.value} type="button" className={`pu-picker-item${o.value === value ? " on" : ""}`} onClick={() => { onPick(o.value, o.label); setOpen(false); }}>
                {o.image ? <img src={mediaUrl(o.image)} alt="" /> : null}
                <span><strong>{o.label}</strong>{o.sub && <span className="o-muted"> · {o.sub}</span>}</span>
              </button>
            ))}
            {!opts.length && <div className="o-muted" style={{ padding: 8 }}>Không có kết quả.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function FieldBox({ label, required, error, children, hint }: { label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className={`pu-field${error ? " has-err" : ""}`}>
      <label className="pu-label">{label}{required && <span className="req">*</span>}</label>
      {children}
      {hint && !error && <div className="o-muted pu-sub">{hint}</div>}
      {error && <div className="pu-err">{error}</div>}
    </div>
  );
}

/** Thêm / sửa pop up */
export function PopupForm({ recordId }: { recordId?: string }) {
  const isNew = recordId === "new";
  const nav = useNavigate();
  const owner = isOwnerRole(getStaffInfo()?.role);
  const meta = useResource<PopupMeta | null>("/api/admin/popups/meta", null);
  const rec = useResource<PopupRow | null>(isNew ? null : `/api/admin/popups/${recordId}`, null);
  const [f, setF] = useState<Form>(EMPTY);
  const [editorKey, setEditorKey] = useState(0);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    const p = rec.data;
    if (!p) return;
    const sep = p.targetLabel.indexOf(": ");
    setF({
      name: p.name, description: p.description ?? "", imageUrl: p.imageUrl, targetType: p.targetType, targetRef: p.targetRef ?? "",
      targetRefLabel: sep > 0 ? p.targetLabel.slice(sep + 2) : "", buttonText: p.buttonText, sortOrder: String(p.sortOrder), isActive: p.isActive,
      startAt: toLocal(p.startAt), endAt: toLocal(p.endAt), allStores: p.allStores, storeIds: p.stores.map((s) => s.storeId),
      audience: p.audience, frequency: p.frequency,
    });
    setEditorKey((k) => k + 1);
  }, [rec.data]);

  const editable = isNew || !!rec.data?.editable;
  const target = meta.data?.targets.find((t) => t.type === f.targetType) ?? null;

  async function upload(file: File) {
    setErrs((e) => ({ ...e, imageUrl: "" }));
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return setErrs((e) => ({ ...e, imageUrl: "Chỉ nhận ảnh JPG, PNG, WEBP hoặc GIF." }));
    if (file.size > MAX_BYTES) return setErrs((e) => ({ ...e, imageUrl: "Ảnh tối đa 2MB." }));
    setUploading(true);
    try {
      set("imageUrl", await staffUploadImage(await readFileAsDataUrl(file)));
    } catch (e) {
      setErrs((x) => ({ ...x, imageUrl: errMsg(e, "Lỗi tải ảnh") }));
    } finally {
      setUploading(false);
    }
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = "Nhập tên pop up.";
    if (!f.imageUrl) e.imageUrl = "Tải ảnh pop up.";
    if (!f.targetType) e.target = "Chọn đường dẫn đến trang.";
    else if (target?.ref === "url" && !/^(\/(?!\/)\S*|https:\/\/\S+)$/i.test(f.targetRef.trim())) e.target = "Nhập đường dẫn bắt đầu bằng / hoặc https://";
    else if (target?.ref && target.ref !== "url" && !f.targetRef) e.target = `Chọn ${target.refLabel?.toLowerCase()}.`;
    if (f.startAt && f.endAt && f.endAt <= f.startAt) e.time = "Thời gian kết thúc phải sau thời gian bắt đầu.";
    if (owner && !f.allStores && !f.storeIds.length) e.stores = "Chọn ít nhất 1 chi nhánh.";
    setErrs(e);
    return !Object.keys(e).length;
  }

  async function save() {
    setErr(null);
    if (!validate()) return;
    setSaving(true);
    const body = {
      name: f.name, description: f.description, imageUrl: f.imageUrl, targetType: f.targetType, targetRef: f.targetRef || null,
      buttonText: f.buttonText, sortOrder: Number(f.sortOrder || 0), isActive: f.isActive,
      startAt: f.startAt ? new Date(f.startAt).toISOString() : null, endAt: f.endAt ? new Date(f.endAt).toISOString() : null,
      allStores: f.allStores, storeIds: f.storeIds, audience: f.audience, frequency: f.frequency,
    };
    try {
      await staffApi(isNew ? "/api/admin/popups" : `/api/admin/popups/${recordId}`, { method: isNew ? "POST" : "PUT", body: JSON.stringify(body) });
      nav(POPUPS_BASE);
    } catch (e) {
      const fields = (e as Error & { fields?: Record<string, string> }).fields;
      if (fields) setErrs(fields);
      setErr(errMsg(e, "Không lưu được"));
      setSaving(false);
    }
  }

  if (!isNew && rec.loading && !rec.data) return <div className="o-muted" style={{ padding: 24 }}>Đang tải…</div>;
  if (!isNew && !rec.data) return <Alert>{rec.error ?? "Không tìm thấy pop up."}</Alert>;
  const img = mediaUrl(f.imageUrl);

  return (
    <div className="pu-admin">
      <div className="o-cp" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
        <div className="o-cp-left">
          <Breadcrumb items={[{ label: "Chiến dịch" }, { label: "Pop up", to: POPUPS_BASE }, { label: isNew ? "Thêm pop-up" : f.name || "Sửa pop-up" }]} />
        </div>
        <div className="o-cp-right" />
      </div>
      {err && <Alert>{err}</Alert>}
      {!editable && <Alert tone="info">Pop up cả chuỗi do Chủ chuỗi quản lý — bạn chỉ xem được.</Alert>}

      <fieldset className="pu-grid" disabled={!editable}>
        <section className="o-card pu-col">
          <h3 className="pu-card-title">Thông tin</h3>
          <FieldBox label="Tên pop up" required error={errs.name}>
            <input className="o-input" value={f.name} maxLength={150} onChange={(e) => set("name", e.target.value)} placeholder="Nhập tên pop up" />
          </FieldBox>
          <FieldBox label="Mô tả pop up">
            <PostEditor key={editorKey} content={f.description} onChange={(h) => set("description", h)} height="140px" theme="light" rich />
          </FieldBox>
          <FieldBox label="Đường dẫn đến trang" required error={errs.target}>
            <div className="pu-target">
              <select className="o-input" value={f.targetType} onChange={(e) => setF((x) => ({ ...x, targetType: e.target.value, targetRef: "", targetRefLabel: "" }))}>
                <option value="">— Chọn trang đích —</option>
                {meta.data?.targets.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
              </select>
              {target?.ref === "url" && (
                <input className="o-input" value={f.targetRef} onChange={(e) => set("targetRef", e.target.value)} placeholder="/menu hoặc https://…" />
              )}
              {target?.ref && target.ref !== "url" && (
                <RefPicker type={target.type} value={f.targetRef} label={f.targetRefLabel} onPick={(v, l) => setF((x) => ({ ...x, targetRef: v, targetRefLabel: l }))} />
              )}
            </div>
            {target?.path && <div className="o-muted pu-sub">Dẫn tới {target.path}</div>}
          </FieldBox>
          <div className="pu-two">
            <FieldBox label="Chữ trên nút"><input className="o-input" value={f.buttonText} maxLength={50} onChange={(e) => set("buttonText", e.target.value)} placeholder="Xem ngay" /></FieldBox>
            <FieldBox label="Thứ tự hiển thị"><input className="o-input" inputMode="numeric" value={f.sortOrder} onChange={(e) => set("sortOrder", e.target.value.replace(/[^\d-]/g, ""))} /></FieldBox>
          </div>
          <FieldBox label="Thời gian chạy" error={errs.time} hint="Để trống = chạy ngay và không giới hạn.">
            <div className="pu-two">
              <input type="datetime-local" className="o-input" value={f.startAt} onChange={(e) => set("startAt", e.target.value)} aria-label="Bắt đầu" />
              <input type="datetime-local" className="o-input" value={f.endAt} onChange={(e) => set("endAt", e.target.value)} aria-label="Kết thúc" />
            </div>
          </FieldBox>
          <FieldBox label="Chi nhánh áp dụng" error={errs.stores}>
            {owner ? (
              <div className="o-stack" style={{ gap: 6 }}>
                <div className="o-row">
                  <label className="o-row" style={{ gap: 4 }}><input type="radio" checked={f.allStores} onChange={() => set("allStores", true)} /> Cả chuỗi</label>
                  <label className="o-row" style={{ gap: 4 }}><input type="radio" checked={!f.allStores} onChange={() => set("allStores", false)} /> Chọn chi nhánh</label>
                </div>
                {!f.allStores && (
                  <div className="o-row">
                    {meta.data?.stores.map((s) => (
                      <label key={s.id} className="o-row" style={{ gap: 4 }}>
                        <input type="checkbox" checked={f.storeIds.includes(s.id)} onChange={(e) => set("storeIds", e.target.checked ? [...f.storeIds, s.id] : f.storeIds.filter((x) => x !== s.id))} />
                        {s.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <span>{getStaffInfo()?.storeName ?? "Chi nhánh của bạn"}</span>
            )}
          </FieldBox>
          <div className="pu-two">
            <FieldBox label="Đối tượng">
              <select className="o-input" value={f.audience} onChange={(e) => set("audience", e.target.value as Audience)}>
                {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((k) => <option key={k} value={k}>{AUDIENCE_LABEL[k]}</option>)}
              </select>
            </FieldBox>
            <FieldBox label="Tần suất">
              <select className="o-input" value={f.frequency} onChange={(e) => set("frequency", e.target.value as Frequency)}>
                {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((k) => <option key={k} value={k}>{FREQUENCY_LABEL[k]}</option>)}
              </select>
            </FieldBox>
          </div>
          <FieldBox label="Trạng thái" hint={`Tối đa ${meta.data?.maxActive ?? 3} pop up được bật cùng lúc.`}>
            <div className="pu-seg" role="radiogroup" aria-label="Trạng thái">
              <button type="button" role="radio" aria-checked={f.isActive} className={f.isActive ? "on" : ""} onClick={() => set("isActive", true)}>Bật</button>
              <button type="button" role="radio" aria-checked={!f.isActive} className={!f.isActive ? "off" : ""} onClick={() => set("isActive", false)}>Tắt</button>
            </div>
          </FieldBox>
        </section>

        <section className="o-card pu-col">
          <h3 className="pu-card-title">Hình ảnh pop up <span className="req">*</span></h3>
          <div
            className={`pu-drop${drag ? " over" : ""}${errs.imageUrl ? " has-err" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const file = e.dataTransfer.files?.[0]; if (file && editable) void upload(file); }}
          >
            {img ? (
              <img src={img} alt="Ảnh pop up" />
            ) : (
              <button type="button" className="pu-drop-empty" onClick={() => fileRef.current?.click()}>
                <ImagePlus size={28} aria-hidden />
                <strong>{uploading ? "Đang tải…" : "Tải ảnh lên từ thiết bị"}</strong>
                <span className="o-muted">Kéo thả hoặc bấm để chọn · tỉ lệ 4:5 hoặc 1:1 · tối đa 2MB</span>
              </button>
            )}
          </div>
          {img && editable && (
            <div className="o-row" style={{ marginTop: 8 }}>
              <Button size="sm" icon={ImagePlus} onClick={() => fileRef.current?.click()} disabled={uploading}>Đổi ảnh</Button>
              <Button size="sm" variant="link" icon={Trash2} onClick={() => set("imageUrl", "")}>Xóa ảnh</Button>
            </div>
          )}
          {errs.imageUrl && <div className="pu-err">{errs.imageUrl}</div>}
          <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file); }} />

          <div className="pu-label" style={{ marginTop: 16 }}>Xem trước trên điện thoại</div>
          <div className="pu-phone">
            <div className="pu-phone-screen">
              <div className="pu-overlay pu-overlay-preview">
                <PopupCard p={{ id: 0, name: f.name, description: f.description, imageUrl: f.imageUrl, buttonText: f.buttonText }} onClose={() => undefined} />
              </div>
            </div>
          </div>
        </section>
      </fieldset>

      {editable && (
        <div className="pu-actions">
          <Button onClick={() => nav(POPUPS_BASE)}>Hủy</Button>
          <Button variant="primary" icon={Save} onClick={() => void save()} disabled={saving || uploading}>{saving ? "Đang lưu…" : isNew ? "Tạo mới" : "Cập nhật"}</Button>
        </div>
      )}
    </div>
  );
}
