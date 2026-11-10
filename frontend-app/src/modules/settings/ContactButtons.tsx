import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, GripVertical, Plus, Save, Trash2 } from "lucide-react";
import { staffApi, staffUploadImage } from "../../lib/staffApi";
import { Alert, Badge, Button, Dropdown, errMsg } from "../../components/erp";
import { ContactIcon, ContactStack, type ContactType, type PublicContact } from "../../components/contact/ContactStack";
import { readFileAsDataUrl, useResource } from "../shared";
import "../../styles/contact.css";

type Meta = {
  types: { type: ContactType; label: string; color: string }[];
  icons: { key: string; label: string; color: string }[];
  stores: { id: number; name: string }[];
  canEditChain: boolean;
};
type Row = {
  id: number; type: ContactType; label: string; value: string; color: string | null; icon: string | null;
  isActive: boolean; sortOrder: number; storeId: number | null; clicks30d: number;
};
type Draft = Omit<Row, "sortOrder" | "storeId" | "clicks30d" | "id"> & { id?: number; key: string; clicks30d: number; error?: string; checking?: boolean };

let seq = 0;
const key = () => `k${Date.now()}-${seq++}`;
const PLACEHOLDER: Record<ContactType, string> = {
  PHONE: "VD: 0901 234 567 hoặc +84 901 234 567",
  ZALO: "Số Zalo hoặc https://zalo.me/…",
  MESSENGER: "https://m.me/… hoặc https://www.facebook.com/<trang>",
  CUSTOM: "https://…",
};
const fmtPhone = (p: string) => (/^0\d{9}$/.test(p) ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : p);

/** Cấu hình › Nút liên hệ: dán link / SĐT, bật tắt, sắp thứ tự — lưu là web khách đổi ngay */
export function ContactButtons() {
  const meta = useResource<Meta | null>("/api/admin/contact-buttons/meta", null);
  const [scope, setScope] = useState<string>("");
  // Chủ chuỗi mặc định sửa "cả chuỗi"; quản lý chi nhánh chỉ có chi nhánh mình
  useEffect(() => {
    if (!meta.data || scope) return;
    setScope(meta.data.canEditChain ? "chain" : String(meta.data.stores[0]?.id ?? ""));
  }, [meta.data, scope]);
  const data = useResource<{ buttons: Row[]; chain: Row[] } | null>(scope ? `/api/admin/contact-buttons?storeId=${scope}` : null, null);
  const [rows, setRows] = useState<Draft[]>([]);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "danger" | "info"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setRows((data.data?.buttons ?? []).map((b) => ({ ...b, key: key() })));
    setDirty(false);
  }, [data.data]);

  const typeColor = (t: ContactType) => meta.data?.types.find((x) => x.type === t)?.color ?? "#57534E";
  const iconColor = (i: string | null) => meta.data?.icons.find((x) => x.key === i)?.color;
  const colorOf = (r: { type: ContactType; color: string | null; icon: string | null }) => r.color ?? (r.type === "CUSTOM" ? iconColor(r.icon) : undefined) ?? typeColor(r.type);
  const hrefOf = (r: { type: ContactType; value: string }) => (r.type === "PHONE" ? `tel:${r.value}` : r.value);

  const set = (k: string, patch: Partial<Draft>) => {
    setRows((list) => list.map((r) => (r.key === k ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  /** Dán / rời ô → server chuẩn hoá (SĐT +84 → 0, facebook.com/<trang> → m.me/<trang>…) */
  async function normalize(r: Draft) {
    if (!r.value.trim()) return set(r.key, { error: undefined });
    set(r.key, { checking: true });
    try {
      const out = await staffApi<{ value?: string; error?: string }>("/api/admin/contact-buttons/normalize", { method: "POST", body: JSON.stringify({ type: r.type, value: r.value }) });
      set(r.key, { checking: false, error: out.error, ...(out.value != null ? { value: out.value } : {}) });
    } catch (e) {
      set(r.key, { checking: false, error: errMsg(e) });
    }
  }

  function add(type: ContactType) {
    const def = meta.data?.types.find((t) => t.type === type);
    setRows((list) => [...list, { key: key(), type, label: def?.label ?? "", value: "", color: null, icon: type === "CUSTOM" ? "website" : null, isActive: true, clicks30d: 0 }]);
    setDirty(true);
  }

  function dropOn(k: string) {
    if (!dragKey || dragKey === k) return;
    const list = [...rows];
    const from = list.findIndex((r) => r.key === dragKey);
    const to = list.findIndex((r) => r.key === k);
    const [m] = list.splice(from, 1);
    list.splice(to, 0, m);
    setRows(list);
    setDragKey(null);
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await staffApi("/api/admin/contact-buttons", {
        method: "PUT",
        body: JSON.stringify({ storeId: scope === "chain" ? null : Number(scope), buttons: rows.map((r) => ({ id: r.id, type: r.type, label: r.label, value: r.value, color: r.color, icon: r.icon, isActive: r.isActive })) }),
      });
      await data.reload();
      setMsg({ tone: "info", text: "Đã lưu. Trang khách hiện nút mới ngay, không cần làm gì thêm." });
    } catch (e) {
      // Lỗi từng dòng: { rows: { [index]: { value: "…" } } }
      const rowsErr = (e as Error & { rows?: Record<number, Record<string, string>> }).rows;
      if (rowsErr) setRows((list) => list.map((r, i) => (rowsErr[i] ? { ...r, error: Object.values(rowsErr[i]).join(" ") } : r)));
      setMsg({ tone: "danger", text: errMsg(e) });
    } finally {
      setSaving(false);
    }
  }

  /** Xem trước: gộp như server — loại chi nhánh đã khai báo dùng nút chi nhánh, còn lại lấy mặc định chuỗi */
  const preview: PublicContact[] = useMemo(() => {
    const own = rows.filter((r) => r.value && !r.error);
    const declared = new Set(own.map((r) => r.type));
    const chain = scope === "chain" ? [] : (data.data?.chain ?? []).filter((c) => c.value && !declared.has(c.type));
    return [...own.map((r, i) => ({ ...r, sortOrder: i + 1, fromChain: false })), ...chain.map((c) => ({ ...c, fromChain: true }))]
      .filter((r) => r.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((r, i) => ({
        id: r.id ?? -i - 1, type: r.type, label: r.label, color: colorOf(r), icon: r.icon, href: hrefOf(r),
        phone: r.type === "PHONE" ? r.value : null, phoneDisplay: r.type === "PHONE" ? fmtPhone(r.value) : null, fromChain: r.fromChain,
      }));
  }, [rows, data.data, scope, meta.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const scopeName = scope === "chain" ? "Mặc định cả chuỗi" : meta.data?.stores.find((s) => String(s.id) === scope)?.name ?? "";

  return (
    <div className="cb-page">
      <div className="cb-scope">
        <label htmlFor="cb-scope" className="cb-label">Phạm vi</label>
        <select id="cb-scope" className="o-input" value={scope} onChange={(e) => { if (dirty && !window.confirm("Bỏ các thay đổi chưa lưu?")) return; setScope(e.target.value); setMsg(null); }}>
          {meta.data?.canEditChain && <option value="chain">Mặc định cả chuỗi</option>}
          {meta.data?.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className="o-muted cb-hint">
          {scope === "chain"
            ? "Áp dụng cho mọi chi nhánh chưa khai báo nút riêng."
            : "Loại nút nào chi nhánh khai báo sẽ thay nút mặc định của chuỗi; loại để trống dùng nút của chuỗi."}
        </span>
      </div>

      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {(meta.error || data.error) && <Alert>{meta.error ?? data.error}</Alert>}

      <div className="cb-grid">
        <section className="o-card cb-card">
          <div className="cb-head">
            <h3>Nút của {scopeName}</h3>
            <Dropdown align="right" button={({ toggle }) => <Button icon={Plus} onClick={toggle}>Thêm nút</Button>}>
              {(close) => meta.data?.types.map((t) => (
                <button key={t.type} type="button" className="o-dropdown-item" onClick={() => { close(); add(t.type); }}>
                  <span className="cb-dot" style={{ background: t.color }} /> {t.type === "CUSTOM" ? "Liên kết khác (TikTok, Maps…)" : t.label}
                </button>
              ))}
            </Dropdown>
          </div>

          <div className="o-list-wrap">
            <table className="o-list cb-table">
              <thead>
                <tr>
                  <th style={{ width: 24 }} aria-label="Kéo để đổi thứ tự" />
                  <th style={{ width: 56 }}>Bật</th>
                  <th style={{ width: 52 }}>Nút</th>
                  <th style={{ width: 150 }}>Nhãn</th>
                  <th>Link / số điện thoại</th>
                  <th style={{ width: 140 }}>Màu · icon</th>
                  <th className="num" style={{ width: 70 }}>Bấm 30 ngày</th>
                  <th style={{ width: 96 }} />
                </tr>
              </thead>
              <tbody>
                {!rows.length && (
                  <tr><td colSpan={8} className="o-muted" style={{ textAlign: "center", padding: 20 }}>
                    {scope === "chain" ? "Chưa có nút nào — bấm Thêm nút." : "Chi nhánh đang dùng toàn bộ nút mặc định của chuỗi. Thêm nút để thay riêng cho chi nhánh."}
                  </td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.key} draggable onDragStart={() => setDragKey(r.key)} onDragOver={(e) => e.preventDefault()} onDrop={() => dropOn(r.key)} onDragEnd={() => setDragKey(null)} className={dragKey === r.key ? "cb-dragging" : undefined}>
                    <td className="cb-grip"><GripVertical size={14} aria-hidden /></td>
                    <td>
                      <button type="button" role="switch" aria-checked={r.isActive} aria-label="Bật nút" className={`cb-switch${r.isActive ? " on" : ""}`} onClick={() => set(r.key, { isActive: !r.isActive })}><span /></button>
                    </td>
                    <td>
                      <span className="cb-swatch" style={{ background: colorOf(r) }}><ContactIcon b={{ type: r.type, icon: r.icon, color: colorOf(r) }} /></span>
                    </td>
                    <td>
                      <input className="o-input" value={r.label} maxLength={60} onChange={(e) => set(r.key, { label: e.target.value })} aria-label="Nhãn" />
                    </td>
                    <td className="cb-value">
                      <input
                        className={`o-input${r.error ? " cb-bad" : ""}`}
                        value={r.value}
                        placeholder={PLACEHOLDER[r.type]}
                        onChange={(e) => set(r.key, { value: e.target.value, error: undefined })}
                        onBlur={() => void normalize(r)}
                        onPaste={(e) => { const v = e.clipboardData.getData("text"); window.setTimeout(() => void normalize({ ...r, value: v }), 0); }}
                        aria-label="Link hoặc số điện thoại"
                        aria-invalid={!!r.error}
                      />
                      {r.error ? <div className="cb-err">{r.error}</div> : r.checking ? <div className="o-muted cb-sub">Đang kiểm tra…</div> : r.type === "MESSENGER" || r.type === "ZALO" ? <div className="o-muted cb-sub">{r.type === "ZALO" ? "Số điện thoại tự đổi sang zalo.me" : "Link facebook tự đổi sang m.me"}</div> : null}
                    </td>
                    <td>
                      <div className="cb-style">
                        <input type="color" value={colorOf(r)} onChange={(e) => set(r.key, { color: e.target.value.toUpperCase() })} aria-label="Màu nền" title="Màu nền" />
                        {r.color && <button type="button" className="cb-link" onClick={() => set(r.key, { color: null })}>Mặc định</button>}
                        {r.type === "CUSTOM" && <IconPicker value={r.icon} icons={meta.data?.icons ?? []} onChange={(icon) => set(r.key, { icon })} />}
                      </div>
                    </td>
                    <td className="num">{r.clicks30d.toLocaleString("vi-VN")}</td>
                    <td>
                      <span className="o-row" style={{ gap: 2, flexWrap: "nowrap" }}>
                        <a className={`o-btn o-btn-link o-btn-sm${!r.value || r.error ? " cb-disabled" : ""}`} href={r.value && !r.error ? hrefOf(r) : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!r.value || !!r.error} title="Mở link ở tab mới để kiểm tra">
                          <ExternalLink size={14} aria-hidden /> Thử
                        </a>
                        <Button variant="link" size="sm" icon={Trash2} onClick={() => { setRows((l) => l.filter((x) => x.key !== r.key)); setDirty(true); }} aria-label="Xóa nút" title="Xóa" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="cb-foot">
            <span className="o-muted">{dirty ? "Có thay đổi chưa lưu" : "Kéo thả dòng để đổi thứ tự trên web"}</span>
            <Button variant="primary" icon={Save} disabled={!dirty || saving || rows.some((r) => r.checking)} onClick={() => void save()}>{saving ? "Đang lưu…" : "Lưu"}</Button>
          </div>
        </section>

        <aside className="o-card cb-card cb-preview">
          <h3>Xem trước</h3>
          <p className="o-muted cb-sub">Khách {scope === "chain" ? "ở chi nhánh chưa có nút riêng" : `chọn ${scopeName}`} sẽ thấy cụm nút này ở góc phải màn hình.</p>
          <div className="cb-stage">
            <ContactStack
              preview
              buttons={preview}
              chat={
                <span className="fc-item">
                  <span className="fc-btn fc-chat" aria-label="Chat với quán (nút có sẵn)"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" strokeWidth="2" aria-hidden><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></svg></span>
                </span>
              }
            />
          </div>
          <ul className="cb-legend">
            {preview.map((b) => (
              <li key={`${b.type}-${b.id}`}>
                <span className="cb-dot" style={{ background: b.color }} />
                <span>{b.label}</span>
                {b.fromChain && scope !== "chain" && <Badge>Mặc định chuỗi</Badge>}
              </li>
            ))}
            <li><span className="cb-dot" style={{ background: "var(--o-primary)" }} /><span>Chat với quán</span><Badge>Luôn có</Badge></li>
          </ul>
        </aside>
      </div>
    </div>
  );
}

/** Icon cho nút "Liên kết khác": chọn icon có sẵn hoặc tải ảnh */
function IconPicker({ value, icons, onChange }: { value: string | null; icons: Meta["icons"]; onChange: (v: string) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const preset = value && icons.some((i) => i.key === value);
  return (
    <>
      <select className="o-input cb-icon" value={preset ? value! : value ? "__upload" : ""} onChange={(e) => (e.target.value === "__pick" ? file.current?.click() : onChange(e.target.value))} aria-label="Icon">
        {icons.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
        {value && !preset && <option value="__upload">Ảnh đã tải</option>}
        <option value="__pick">{busy ? "Đang tải…" : "Tải ảnh icon…"}</option>
      </select>
      <input
        ref={file}
        type="file"
        hidden
        accept="image/png,image/svg+xml,image/webp,image/jpeg"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          try {
            onChange(await staffUploadImage(await readFileAsDataUrl(f)));
          } catch (ex) {
            alert(errMsg(ex, "Lỗi tải ảnh"));
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
