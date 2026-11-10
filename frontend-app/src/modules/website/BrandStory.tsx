/**
 * Website › Câu chuyện thương hiệu (chỉ Chủ chuỗi) — sửa trang /about không cần sửa code.
 * Trái: 15 mục — kéo thả / nút lên xuống đổi thứ tự, công tắc bật tắt (lưu ngay), chấm báo mục còn ảnh mặc định.
 * Phải: form của mục đang chọn (dựng từ @shared/brand), tab Tiếng Việt / English, Lưu từng mục, Xem trước (bản chưa lưu).
 * ?section=<key>&field=<đường dẫn ô>: mở đúng mục, đúng ô (từ nút bút chì trên trang khách).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, ExternalLink, Eye, GripVertical, Save } from "lucide-react";
import { sectionDef, type BrandKey, type FieldErrors } from "@shared/brand";
import { staffApi } from "../../lib/staffApi";
import { PREVIEW_KEY, type PreviewDraft } from "../../lib/brand";
import { Alert, Button, Tabs, errMsg } from "../../components/erp";
import { FieldsEditor, useFocusField, useRefs } from "./BrandFields";

type Obj = Record<string, unknown>;
type Row = { key: BrandKey; sortOrder: number; isVisible: boolean; exists: boolean; data: Obj; dataEn: Obj | null; updatedAt: string | null; defaultImages: number };
type Draft = { data: Obj; dataEn: Obj };

const snap = (d: Draft) => JSON.stringify(d);

export function BrandStoryAdmin() {
  const [params, setParams] = useSearchParams();
  const refs = useRefs({ reviews: true });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<BrandKey, Draft>>>({});
  const [saved, setSaved] = useState<Partial<Record<BrandKey, string>>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [msg, setMsg] = useState<{ tone: "danger" | "info"; text: string } | null>(null);
  const [lang, setLang] = useState<"vi" | "en">("vi");
  const [busy, setBusy] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);
  const drag = useRef<number | null>(null);
  const active = (params.get("section") as BrandKey | null) ?? rows?.[0]?.key ?? "hero";
  const field = params.get("field");

  useEffect(() => {
    staffApi<Row[]>("/api/admin/brand/sections")
      .then((list) => {
        setRows(list);
        const d: Partial<Record<BrandKey, Draft>> = {};
        const s: Partial<Record<BrandKey, string>> = {};
        for (const r of list) {
          d[r.key] = { data: r.data, dataEn: r.dataEn ?? {} };
          s[r.key] = snap(d[r.key]!);
        }
        setDrafts(d);
        setSaved(s);
      })
      .catch((e) => setMsg({ tone: "danger", text: errMsg(e) }));
  }, []);

  const isDirty = useCallback((k: BrandKey) => !!drafts[k] && snap(drafts[k]!) !== saved[k], [drafts, saved]);
  const anyDirty = useMemo(() => (rows ?? []).some((r) => isDirty(r.key)), [rows, isDirty]);
  useEffect(() => {
    if (!anyDirty) return;
    const on = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", on);
    return () => window.removeEventListener("beforeunload", on);
  }, [anyDirty]);
  useEffect(() => {
    if (field?.startsWith("en.")) setLang("en");
  }, [field]);
  useFocusField(field?.replace(/^en\./, "") ?? null, !!rows);

  const select = (k: BrandKey) => {
    setErrors({});
    setMsg(null);
    setParams({ section: k }, { replace: true });
  };

  /** Thứ tự + bật/tắt lưu ngay */
  async function saveOrder(next: Row[]) {
    const prev = rows;
    setRows(next);
    setOrderBusy(true);
    try {
      await staffApi("/api/admin/brand/order", { method: "PATCH", body: JSON.stringify({ items: next.map((r) => ({ key: r.key, isVisible: r.isVisible })) }) });
    } catch (e) {
      setRows(prev);
      setMsg({ tone: "danger", text: errMsg(e) });
    } finally {
      setOrderBusy(false);
    }
  }
  const move = (from: number, to: number) => {
    if (!rows || to < 0 || to >= rows.length || from === to) return;
    const next = [...rows];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    void saveOrder(next);
  };

  async function save() {
    const d = drafts[active];
    if (!d) return;
    setBusy(true);
    setMsg(null);
    setErrors({});
    try {
      const hasEn = JSON.stringify(d.dataEn) !== "{}";
      const r = await staffApi<{ data: Obj; dataEn: Obj | null; updatedAt: string; defaultImages: number }>(`/api/admin/brand/sections/${active}`, {
        method: "PUT",
        body: JSON.stringify({ data: d.data, dataEn: hasEn ? d.dataEn : null }),
      });
      const nd = { data: r.data, dataEn: r.dataEn ?? {} };
      setDrafts((x) => ({ ...x, [active]: nd }));
      setSaved((x) => ({ ...x, [active]: snap(nd) }));
      setRows((x) => x?.map((row) => (row.key === active ? { ...row, exists: true, updatedAt: r.updatedAt, defaultImages: r.defaultImages } : row)) ?? null);
      setMsg({ tone: "info", text: "Đã lưu — trang /about cập nhật ngay." });
    } catch (e) {
      const f = (e as { fields?: FieldErrors }).fields ?? {};
      setErrors(f);
      setMsg({ tone: "danger", text: errMsg(e) });
      // Lỗi nằm ở tab kia → chuyển tab cho người sửa thấy
      const keys = Object.keys(f);
      if (keys.length && keys.every((k) => k.startsWith("en."))) setLang("en");
      else if (keys.length) setLang("vi");
    } finally {
      setBusy(false);
    }
  }

  /** Xem trước: gửi bản nháp (kể cả mục chưa lưu) sang tab /about?preview=1 */
  function preview() {
    if (!rows) return;
    const draft: PreviewDraft = { at: Date.now(), sections: rows.map((r) => ({ key: r.key, isVisible: r.isVisible, data: drafts[r.key]?.data ?? r.data, dataEn: drafts[r.key]?.dataEn ?? null })) };
    try {
      localStorage.setItem(PREVIEW_KEY, JSON.stringify(draft));
      window.open("/about?preview=1", "_blank");
    } catch {
      setMsg({ tone: "danger", text: "Không mở được xem trước (trình duyệt chặn lưu tạm)." });
    }
  }

  const def = sectionDef(active);
  const d = drafts[active];
  const enErrors = useMemo(() => Object.fromEntries(Object.entries(errors).filter(([k]) => k.startsWith("en.")).map(([k, v]) => [k.slice(3), v])), [errors]);

  return (
    <div className="ba-page">
      <div className="ba-top">
        <div>
          <h1 className="o-h1" style={{ margin: 0 }}>Câu chuyện thương hiệu</h1>
          <p className="o-muted" style={{ margin: "4px 0 0" }}>Mọi ảnh và chữ trên trang <a href="/about" target="_blank" rel="noopener">/about <ExternalLink size={12} /></a>. Thứ tự và bật/tắt lưu ngay; nội dung lưu theo từng mục.</p>
        </div>
        <Button icon={Eye} onClick={preview} disabled={!rows}>Xem trước</Button>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {!rows ? (
        !msg && <p className="o-muted">Đang tải…</p>
      ) : (
        <div className="ba-layout">
          <nav className="ba-nav" aria-label="Các mục">
            <ol>
              {rows.map((r, i) => {
                const sd = sectionDef(r.key)!;
                return (
                  <li
                    key={r.key}
                    className={`${r.key === active ? "is-on" : ""}${r.isVisible ? "" : " is-off"}`}
                    draggable
                    onDragStart={() => { drag.current = i; }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { if (drag.current != null) move(drag.current, i); drag.current = null; }}
                  >
                    <GripVertical size={15} className="ba-grip" aria-hidden />
                    <button type="button" className="ba-nav-name" onClick={() => select(r.key)} aria-current={r.key === active}>
                      <span>{sd.label}</span>
                      <span className="ba-nav-flags">
                        {isDirty(r.key) && <span className="ba-dirty">chưa lưu</span>}
                        {r.defaultImages > 0 && <span className="ba-dot" title={`${r.defaultImages} ô còn ảnh mặc định`}>{r.defaultImages}</span>}
                      </span>
                    </button>
                    <span className="ba-nav-tools">
                      <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0 || orderBusy} aria-label={`Đưa "${sd.label}" lên`}><ArrowUp size={14} /></button>
                      <button type="button" onClick={() => move(i, i + 1)} disabled={i === rows.length - 1 || orderBusy} aria-label={`Đưa "${sd.label}" xuống`}><ArrowDown size={14} /></button>
                      <label className="ba-switch" title={r.isVisible ? "Đang hiện — bấm để ẩn" : "Đang ẩn — bấm để hiện"}>
                        <input type="checkbox" checked={r.isVisible} disabled={orderBusy} onChange={(e) => void saveOrder(rows.map((x) => (x.key === r.key ? { ...x, isVisible: e.target.checked } : x)))} aria-label={`Hiện mục "${sd.label}"`} />
                        <span aria-hidden />
                      </label>
                    </span>
                  </li>
                );
              })}
            </ol>
          </nav>

          <section className="ba-editor" aria-label={def?.label}>
            {def && d && (
              <>
                <div className="ba-bar">
                  <div>
                    <h2 className="ba-h2">{def.label}</h2>
                    <p className="o-muted" style={{ margin: 0 }}>{def.hint}</p>
                  </div>
                  <span className="o-row" style={{ gap: 8 }}>
                    {isDirty(active) && <span className="ba-dirty">Chưa lưu</span>}
                    <Button variant="primary" icon={Save} onClick={() => void save()} disabled={busy || !isDirty(active)}>{busy ? "Đang lưu…" : "Lưu mục này"}</Button>
                  </span>
                </div>
                <Tabs tabs={[{ id: "vi", label: "Tiếng Việt" }, { id: "en", label: "English" }]} active={lang} onChange={setLang} />
                {lang === "en" && <p className="o-hint">Ô bỏ trống sẽ hiện tiếng Việt trên trang tiếng Anh. Ảnh, số và lựa chọn dùng chung với tab Tiếng Việt.</p>}
                <div className="ba-form" key={`${active}-${lang}`}>
                  {lang === "vi" ? (
                    <FieldsEditor fields={def.fields} value={d.data} onChange={(v) => setDrafts((x) => ({ ...x, [active]: { ...d, data: v } }))} errors={errors} refs={refs} />
                  ) : (
                    <FieldsEditor fields={def.fields} value={d.dataEn} onChange={(v) => setDrafts((x) => ({ ...x, [active]: { ...d, dataEn: v } }))} errors={enErrors} mode="en" vi={d.data} refs={refs} />
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
