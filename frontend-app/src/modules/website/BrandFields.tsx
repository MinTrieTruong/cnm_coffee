/**
 * Form dựng tự động từ mô tả trường dùng chung (@shared/brand): màn Câu chuyện thương hiệu + tab "Trang giới thiệu" của chi nhánh.
 * BrandImageField: xem trước đúng tỉ lệ khung, bấm ảnh đặt điểm lấy nét, tải ảnh (nén WebP + bản 800px ngay trên trình duyệt),
 * chọn ảnh đã tải, mô tả ảnh bắt buộc, về ảnh mặc định (ảnh giữ chỗ).
 */
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, GripVertical, ImagePlus, Images, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { cleanFields, STORE_PROFILE_FIELDS, type BrandImage, type FieldDef, type FieldErrors, type StoreProfile } from "@shared/brand";
import { mediaUrl } from "../../lib/api";
import { isSiteImageKey, siteImageSrc } from "../../lib/siteImages";
import { staffApi, staffUploadImage } from "../../lib/staffApi";
import { Alert, Button, Modal, errMsg } from "../../components/erp";
import "../../styles/brand-admin.css";

/* ═══════════ Dữ liệu tham chiếu cho ô chọn món / đánh giá / chi nhánh ═══════════ */

export type Refs = {
  products: { id: number; name: string }[];
  reviews: { id: number; label: string }[];
  stores: { id: number; name: string }[];
};
export function useRefs(need: { reviews?: boolean } = {}) {
  const [refs, setRefs] = useState<Refs>({ products: [], reviews: [], stores: [] });
  useEffect(() => {
    let off = false;
    void (async () => {
      const [menu, stores, reviews] = await Promise.all([
        staffApi<{ products: { id: number; name: string }[] }>("/api/menu").catch(() => ({ products: [] })),
        staffApi<{ id: number; name: string }[]>("/api/admin/stores").catch(() => []),
        need.reviews
          ? staffApi<{ id: number; rating: number; comment: string | null; hidden: boolean; customer: { fullName: string } | null }[]>("/api/admin/reviews").catch(() => [])
          : Promise.resolve([]),
      ]);
      if (off) return;
      setRefs({
        products: menu.products.map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name, "vi")),
        stores: stores.map((s) => ({ id: s.id, name: s.name })),
        reviews: reviews.filter((r) => !r.hidden && r.comment?.trim()).map((r) => ({ id: r.id, label: `${"★".repeat(r.rating)} ${r.customer?.fullName ?? "Khách"}: ${r.comment!.slice(0, 70)}` })),
      });
    })();
    return () => {
      off = true;
    };
  }, [need.reviews]);
  return refs;
}

/* ═══════════ Ảnh ═══════════ */

const MAX_INPUT = 5 * 1024 * 1024;
/** Nén ảnh sang WebP với cạnh dài tối đa `max` px (ảnh nhỏ hơn giữ nguyên cỡ); PNG nền trong vẫn giữ nền trong */
async function toWebp(file: File, max: number): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL("image/webp", 0.84);
}
/** Tải 1 tệp: bản lớn (≤ 1920px) + bản 800px cho srcset */
export async function uploadBrandImage(file: File): Promise<{ url: string; small: string }> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Chỉ nhận ảnh JPG, PNG hoặc WebP.");
  if (file.size > MAX_INPUT) throw new Error("Ảnh tối đa 5MB.");
  const [big, small] = await Promise.all([toWebp(file, 1920), toWebp(file, 800)]);
  const [url, smallUrl] = await Promise.all([staffUploadImage(big), staffUploadImage(small)]);
  return { url, small: smallUrl };
}

const previewSrc = (url: string) => (isSiteImageKey(url) ? siteImageSrc(url).src : mediaUrl(url) ?? url);

/** Thư viện ảnh đã tải (ảnh đang dùng ở trang câu chuyện, chi nhánh, banner, bài đăng) */
function ImageLibrary({ onPick, onClose }: { onPick: (img: BrandImage) => void; onClose: () => void }) {
  const [list, setList] = useState<BrandImage[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    staffApi<BrandImage[]>("/api/admin/brand/images").then(setList).catch((e) => setErr(errMsg(e)));
  }, []);
  return (
    <Modal title="Chọn ảnh đã tải" onClose={onClose} size="lg">
      {err && <Alert>{err}</Alert>}
      {!list && !err && <p className="o-muted">Đang tải…</p>}
      {list && !list.length && <p className="o-muted">Chưa có ảnh nào được tải lên.</p>}
      {list && list.length > 0 && (
        <ul className="ba-lib">
          {list.map((im) => (
            <li key={im.url}>
              <button type="button" onClick={() => onPick(im)} title={im.alt || im.url}>
                <img src={mediaUrl(im.small || im.url)} alt={im.alt} loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export function BrandImageField({ id, label, value, onChange, ratio, recommend, errors, base, altOnly, viAlt }: {
  id: string; label: string; value: BrandImage; onChange: (v: BrandImage) => void; ratio: string; recommend: string;
  errors: FieldErrors; base: string; altOnly?: boolean; viAlt?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [lib, setLib] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const v = value ?? { url: "", alt: "" };
  const focus = v.focus ?? { x: 50, y: 50 };
  const isDefault = !v.url.startsWith("/uploads/");

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const up = await uploadBrandImage(file);
      onChange({ ...v, ...up, focus: { x: 50, y: 50 } });
    } catch (e) {
      setErr(errMsg(e, "Tải ảnh không được"));
    } finally {
      setBusy(false);
    }
  }
  function setFocus(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    onChange({ ...v, focus: { x: Math.round(((e.clientX - r.left) / r.width) * 100), y: Math.round(((e.clientY - r.top) / r.height) * 100) } });
  }
  const altErr = errors[`${base}.alt`];

  if (altOnly) {
    return (
      <div className="ba-field" id={id}>
        <label className="ba-label">{label} — mô tả ảnh (EN)</label>
        <input className="o-input" value={v.alt} maxLength={200} placeholder={viAlt} onChange={(e) => onChange({ ...v, alt: e.target.value })} />
        {altErr && <div className="o-error">{altErr}</div>}
      </div>
    );
  }
  return (
    <div className="ba-field ba-img" id={id}>
      <div className="ba-label">{label} {isDefault && <span className="ba-dot" title="Đang dùng ảnh mặc định — nên thay ảnh thật">ảnh mặc định</span>}</div>
      <div className="ba-img-row">
        <button type="button" className="ba-img-frame" style={{ aspectRatio: ratio }} onClick={v.url ? setFocus : () => input.current?.click()} title={v.url ? "Bấm vào chủ thể để đặt điểm lấy nét" : "Tải ảnh"}>
          {v.url ? (
            <>
              <img src={previewSrc(v.url)} alt="" style={{ objectPosition: `${focus.x}% ${focus.y}%` }} />
              <span className="ba-focus" style={{ left: `${focus.x}%`, top: `${focus.y}%` }} aria-hidden />
            </>
          ) : (
            <span className="ba-img-empty"><ImagePlus size={22} aria-hidden /> Chưa có ảnh</span>
          )}
        </button>
        <div className="ba-img-side">
          <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
          <div className="o-row" style={{ gap: 6, flexWrap: "wrap" }}>
            <Button size="sm" icon={Upload} onClick={() => input.current?.click()} disabled={busy}>{busy ? "Đang tải…" : "Tải ảnh"}</Button>
            <Button size="sm" icon={Images} onClick={() => setLib(true)}>Chọn ảnh đã tải</Button>
            {v.url && <Button size="sm" variant="link" icon={RotateCcw} onClick={() => onChange({ url: "", alt: "" })}>Về ảnh mặc định</Button>}
          </div>
          <div className="o-hint">{recommend}. JPG/PNG/WebP ≤ 5MB, tự nén WebP.{v.url ? " Bấm lên ảnh để chọn điểm lấy nét." : ""}</div>
          <label className="ba-sub">Mô tả ảnh (alt){v.url && <span className="ba-req"> *</span>}</label>
          <input className="o-input" value={v.alt} maxLength={200} placeholder="VD: Quầy pha buổi sáng, nắng chiếu qua cửa" onChange={(e) => onChange({ ...v, alt: e.target.value })} />
          {(altErr || errors[`${base}.url`] || err) && <div className="o-error">{altErr || errors[`${base}.url`] || err}</div>}
        </div>
      </div>
      {lib && <ImageLibrary onClose={() => setLib(false)} onPick={(im) => { onChange({ ...v, url: im.url, small: im.small, alt: v.alt || im.alt, focus: { x: 50, y: 50 } }); setLib(false); }} />}
    </div>
  );
}

/* ═══════════ Form dựng từ mô tả trường ═══════════ */

type Obj = Record<string, unknown>;
const fid = (path: string) => `bf-${path.replace(/\./g, "-")}`;
const Count = ({ n, max }: { n: number; max: number }) => <span className={`ba-count${n > max ? " is-over" : ""}`}>{n}/{max}</span>;

/**
 * mode "vi": sửa đủ; mode "en": chỉ ô chữ + mô tả ảnh, danh sách theo đúng số mục của bản tiếng Việt (vi = bản tiếng Việt làm gợi ý).
 */
export function FieldsEditor({ fields, value, onChange, errors, base = "", mode = "vi", vi, refs }: {
  fields: FieldDef[]; value: Obj; onChange: (v: Obj) => void; errors: FieldErrors; base?: string; mode?: "vi" | "en"; vi?: Obj; refs: Refs;
}) {
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });
  const p = (k: string) => (base ? `${base}.${k}` : k);
  const en = mode === "en";
  return (
    <div className="ba-fields">
      {fields.map((f) => {
        const v = value[f.k];
        const err = errors[p(f.k)];
        const hintVi = en && vi && typeof vi[f.k] === "string" ? (vi[f.k] as string) : undefined;
        let body: ReactNode = null;
        switch (f.type) {
          case "text":
          case "textarea": {
            const s = typeof v === "string" ? v : "";
            body = (
              <div className="ba-field" id={fid(p(f.k))}>
                <label className="ba-label" htmlFor={`${fid(p(f.k))}-i`}>{f.label}{f.required && !en && <span className="ba-req"> *</span>} <Count n={s.length} max={f.max} /></label>
                {f.type === "text" ? (
                  <input id={`${fid(p(f.k))}-i`} className="o-input" value={s} placeholder={hintVi} onChange={(e) => set(f.k, e.target.value)} />
                ) : (
                  <textarea id={`${fid(p(f.k))}-i`} className="o-input" rows={f.rows ?? 4} value={s} placeholder={hintVi} onChange={(e) => set(f.k, e.target.value)} />
                )}
                {f.hint && !en && <div className="o-hint">{f.hint}</div>}
                {err && <div className="o-error">{err}</div>}
              </div>
            );
            break;
          }
          case "paragraphs": {
            const viArr = (vi?.[f.k] as string[] | undefined) ?? [];
            const arr = en ? viArr.map((_, i) => ((v as string[] | undefined)?.[i] ?? "")) : ((v as string[] | undefined) ?? []);
            body = (
              <div className="ba-field" id={fid(p(f.k))}>
                <div className="ba-label">{f.label}{!en && ` (tối đa ${f.maxItems})`}</div>
                {arr.map((s, i) => (
                  <div key={i} className="ba-para">
                    <textarea className="o-input" rows={4} value={s} placeholder={en ? viArr[i] : `Đoạn ${i + 1}`} onChange={(e) => set(f.k, arr.map((x, j) => (j === i ? e.target.value : x)))} />
                    <div className="ba-para-foot">
                      <Count n={s.length} max={f.max} />
                      {!en && <Button size="sm" variant="link" icon={Trash2} onClick={() => set(f.k, arr.filter((_, j) => j !== i))}>Xoá đoạn</Button>}
                    </div>
                    {errors[p(`${f.k}.${i}`)] && <div className="o-error">{errors[p(`${f.k}.${i}`)]}</div>}
                  </div>
                ))}
                {!en && arr.length < f.maxItems && <Button size="sm" icon={Plus} onClick={() => set(f.k, [...arr, ""])}>Thêm đoạn</Button>}
                {err && <div className="o-error">{err}</div>}
              </div>
            );
            break;
          }
          case "image":
            body = <BrandImageField id={fid(p(f.k))} label={f.label} value={(v as BrandImage) ?? { url: "", alt: "" }} onChange={(x) => set(f.k, x)} ratio={f.ratio} recommend={f.recommend} errors={errors} base={p(f.k)} altOnly={en} viAlt={(vi?.[f.k] as BrandImage | undefined)?.alt} />;
            break;
          case "images": {
            const viArr = (vi?.[f.k] as BrandImage[] | undefined) ?? [];
            const arr = en ? viArr.map((_, i) => ((v as BrandImage[] | undefined)?.[i] ?? { url: "", alt: "" })) : ((v as BrandImage[] | undefined) ?? []);
            body = (
              <div className="ba-field" id={fid(p(f.k))}>
                <div className="ba-label">{f.label}</div>
                {arr.map((im, i) => (
                  <div key={i} className="ba-imgs-item">
                    <BrandImageField id={fid(p(`${f.k}.${i}`))} label={`Ảnh ${i + 1}`} value={im} onChange={(x) => set(f.k, arr.map((y, j) => (j === i ? x : y)))} ratio={f.ratio} recommend={f.recommend} errors={errors} base={p(`${f.k}.${i}`)} altOnly={en} viAlt={viArr[i]?.alt} />
                    {!en && <Button size="sm" variant="link" icon={Trash2} onClick={() => set(f.k, arr.filter((_, j) => j !== i))}>Bỏ ảnh</Button>}
                  </div>
                ))}
                {!en && arr.length < f.maxItems && <Button size="sm" icon={Plus} onClick={() => set(f.k, [...arr, { url: "", alt: "" }])}>Thêm ảnh</Button>}
              </div>
            );
            break;
          }
          case "list":
            body = <ListEditor f={f} value={(v as Obj[] | undefined) ?? []} onChange={(x) => set(f.k, x)} errors={errors} base={p(f.k)} mode={mode} vi={(vi?.[f.k] as Obj[] | undefined) ?? []} refs={refs} />;
            break;
          default: {
            if (en) break;
            let input: ReactNode;
            if (f.type === "number") {
              input = <input className="o-input" type="number" min={f.min} max={f.max} value={v == null ? "" : String(v)} onChange={(e) => set(f.k, e.target.value === "" ? null : Number(e.target.value))} />;
            } else if (f.type === "select") {
              input = <select className="o-input" value={String(v ?? f.options[0].value)} onChange={(e) => set(f.k, e.target.value)}>{f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
            } else if (f.type === "multi") {
              const cur = (v as string[] | undefined) ?? [];
              input = (
                <div className="ba-multi">
                  {f.options.map((o) => (
                    <label key={o.value} className="o-check">
                      <input type="checkbox" checked={cur.includes(o.value)} onChange={(e) => set(f.k, e.target.checked ? [...cur, o.value] : cur.filter((x) => x !== o.value))} /> {o.label}
                    </label>
                  ))}
                </div>
              );
            } else {
              const opts = f.type === "product" ? refs.products.map((x) => ({ id: x.id, label: x.name })) : f.type === "store" ? refs.stores.map((x) => ({ id: x.id, label: x.name })) : refs.reviews.map((x) => ({ id: x.id, label: x.label }));
              input = (
                <select className="o-input" value={v == null ? "" : String(v)} onChange={(e) => set(f.k, e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Không chọn —</option>
                  {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  {v != null && !opts.some((o) => o.id === v) && <option value={String(v)}>#{String(v)} (không còn trong danh sách)</option>}
                </select>
              );
            }
            body = (
              <div className="ba-field" id={fid(p(f.k))}>
                <label className="ba-label">{f.label}</label>
                {input}
                {"hint" in f && f.hint && <div className="o-hint">{f.hint}</div>}
                {err && <div className="o-error">{err}</div>}
              </div>
            );
          }
        }
        return body ? <div key={f.k}>{body}</div> : null;
      })}
    </div>
  );
}

/** Danh sách (mốc, người, giá trị, ảnh…): thu gọn / mở, thêm, xoá, kéo thả hoặc nút lên / xuống để đổi thứ tự */
function ListEditor({ f, value, onChange, errors, base, mode, vi, refs }: {
  f: Extract<FieldDef, { type: "list" }>; value: Obj[]; onChange: (v: Obj[]) => void; errors: FieldErrors; base: string; mode: "vi" | "en"; vi: Obj[]; refs: Refs;
}) {
  const en = mode === "en";
  const items = en ? vi.map((_, i) => value[i] ?? {}) : value;
  const [open, setOpen] = useState<number | null>(items.length ? 0 : null);
  const drag = useRef<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
    setOpen(to);
  };
  const title = (it: Obj, i: number) => {
    const src = en ? vi[i] : it;
    const t = src?.[f.titleKey];
    if (typeof t === "string" && t.trim()) return t.length > 60 ? `${t.slice(0, 60)}…` : t;
    if (typeof t === "number") return `${f.itemLabel} #${t}`;
    return `${f.itemLabel} ${i + 1}`;
  };
  const hasErr = (i: number) => Object.keys(errors).some((k) => k.startsWith(`${base}.${i}.`) || k.startsWith(`en.${base}.${i}.`));
  return (
    <div className="ba-field ba-list" id={fid(base)}>
      <div className="ba-label">{f.label} <span className="o-muted">({items.length}/{f.maxItems})</span></div>
      <ol className="ba-list-items">
        {items.map((it, i) => (
          <li
            key={i}
            className={`ba-item${open === i ? " is-open" : ""}${hasErr(i) ? " has-err" : ""}`}
            draggable={!en}
            onDragStart={() => { drag.current = i; }}
            onDragOver={(e: DragEvent) => e.preventDefault()}
            onDrop={() => { if (drag.current != null) move(drag.current, i); drag.current = null; }}
          >
            <div className="ba-item-head">
              {!en && <GripVertical size={16} className="ba-grip" aria-hidden />}
              <button type="button" className="ba-item-title" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                {open === i ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />} {title(it, i)}
              </button>
              {!en && (
                <span className="ba-item-tools">
                  <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Lên trên"><ArrowUp size={15} /></button>
                  <button type="button" onClick={() => move(i, i + 1)} disabled={i === items.length - 1} aria-label="Xuống dưới"><ArrowDown size={15} /></button>
                  <button type="button" onClick={() => { if (confirm(`Xoá ${f.itemLabel.toLowerCase()} "${title(it, i)}"?`)) { onChange(items.filter((_, j) => j !== i)); setOpen(null); } }} aria-label="Xoá"><Trash2 size={15} /></button>
                </span>
              )}
            </div>
            {open === i && (
              <div className="ba-item-body">
                <FieldsEditor fields={f.fields} value={it} onChange={(x) => onChange(items.map((y, j) => (j === i ? x : y)))} errors={errors} base={`${base}.${i}`} mode={mode} vi={vi[i]} refs={refs} />
              </div>
            )}
          </li>
        ))}
      </ol>
      {!en && items.length < f.maxItems && (
        <Button size="sm" icon={Plus} onClick={() => { onChange([...items, cleanFields(f.fields, {}).data]); setOpen(items.length); }}>Thêm {f.itemLabel.toLowerCase()}</Button>
      )}
      {en && !items.length && <p className="o-muted">Thêm mục ở tab Tiếng Việt trước.</p>}
    </div>
  );
}

/** Mở đúng ô khi vào từ nút bút chì trên trang khách (?field=items.2.title): cuộn tới + nháy viền */
export function useFocusField(field: string | null, ready: boolean) {
  useEffect(() => {
    if (!field || !ready) return;
    const tm = window.setTimeout(() => {
      // Ô nằm trong mục danh sách đang thu gọn → tìm ô cha gần nhất có trên trang
      const parts = field.split(".");
      for (let n = parts.length; n > 0; n--) {
        const el = document.getElementById(fid(parts.slice(0, n).join(".")));
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("is-flash");
          el.querySelector<HTMLElement>("input, textarea, select, button")?.focus({ preventScroll: true });
          window.setTimeout(() => el.classList.remove("is-flash"), 2000);
          break;
        }
      }
    }, 250);
    return () => window.clearTimeout(tm);
  }, [field, ready]);
}

/* ═══════════ Tab "Trang giới thiệu" của chi nhánh ═══════════ */

export function StoreProfileEditor({ storeId, field }: { storeId: number; field: string | null }) {
  const refs = useRefs();
  const [saved, setSaved] = useState<StoreProfile | null>(null);
  const [draft, setDraft] = useState<StoreProfile | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [msg, setMsg] = useState<{ tone: "danger" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    staffApi<{ profile: StoreProfile }>(`/api/admin/stores/${storeId}/profile`)
      .then((r) => { setSaved(r.profile); setDraft(r.profile); })
      .catch((e) => setMsg({ tone: "danger", text: errMsg(e) }));
  }, [storeId]);
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => {
    if (!dirty) return;
    const on = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", on);
    return () => window.removeEventListener("beforeunload", on);
  }, [dirty]);
  useFocusField(field, !!draft);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setMsg(null);
    setErrors({});
    try {
      const r = await staffApi<{ profile: StoreProfile }>(`/api/admin/stores/${storeId}/profile`, { method: "PUT", body: JSON.stringify(draft) });
      setSaved(r.profile);
      setDraft(r.profile);
      setMsg({ tone: "info", text: "Đã lưu trang giới thiệu của chi nhánh." });
    } catch (e) {
      setErrors((e as { fields?: FieldErrors }).fields ?? {});
      setMsg({ tone: "danger", text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }
  if (!draft) return msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : <p className="o-muted">Đang tải…</p>;
  return (
    <div className="ba-store">
      <div className="ba-bar">
        <span className="o-muted">Hiện ở trang <a href={`/stores/${storeId}`} target="_blank" rel="noopener">/stores/{storeId}</a> và thẻ chi nhánh trên trang Câu chuyện.</span>
        <span className="o-row" style={{ gap: 8 }}>
          {dirty && <span className="ba-dirty">Chưa lưu</span>}
          <Button variant="primary" onClick={() => void save()} disabled={busy || !dirty}>{busy ? "Đang lưu…" : "Lưu"}</Button>
        </span>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <FieldsEditor fields={STORE_PROFILE_FIELDS} value={draft as unknown as Obj} onChange={(v) => setDraft(v as unknown as StoreProfile)} errors={errors} refs={refs} />
    </div>
  );
}
