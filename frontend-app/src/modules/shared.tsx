import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, X } from "lucide-react";
import { mediaUrl } from "../lib/api";
import { staffApi, staffUploadImage } from "../lib/staffApi";
import { Button, errMsg } from "../components/erp";

/** Tải dữ liệu từ API nhân sự, có reload */
export function useResource<T>(path: string | null, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);
  const initialRef = useRef(initial);

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await staffApi<T>(path));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
      setData(initialRef.current);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, setData, loading, error, setError, reload };
}

/** Điều hướng trong app: list ↔ form */
export function useRecordNav(base: string) {
  const nav = useNavigate();
  return {
    list: () => nav(base),
    open: (id: number | string) => nav(`${base}/${id}`),
    create: () => nav(`${base}/new`),
  };
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Không đọc được file."));
    r.readAsDataURL(file);
  });
}

/** Ảnh: URL hoặc tải file lên /api/admin/upload-image (giữ logic cũ) */
export function ImageField({
  value,
  onChange,
  disabled,
  onBusy,
}: {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  onBusy?: (b: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const img = mediaUrl(value || undefined);
  return (
    <div className="o-row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
      {img ? <img src={img} alt="" className="o-thumb" style={{ width: 56, height: 56 }} /> : <span className="o-thumb" style={{ width: 56, height: 56 }} />}
      {!disabled && (
        <div className="o-stack" style={{ gap: 6, flex: 1, minWidth: 0 }}>
          <input className="o-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder="URL ảnh hoặc tải file" />
          <div className="o-row">
            <input
              ref={inputRef}
              type="file"
              hidden
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                onBusy?.(true);
                try {
                  onChange(await staffUploadImage(await readFileAsDataUrl(f)));
                } catch (ex) {
                  alert(errMsg(ex, "Lỗi tải ảnh"));
                } finally {
                  onBusy?.(false);
                }
              }}
            />
            <Button size="sm" icon={Upload} onClick={() => inputRef.current?.click()}>Tải ảnh</Button>
            {value && <Button size="sm" variant="link" onClick={() => onChange("")}>Xóa ảnh</Button>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Nhãn món — giữ nguyên các giá trị đang lưu trong CSDL */
export const PREDEFINED_TAGS = ["🔥 Best Seller", "☕ Nóng", "🧊 Đá", "🆕 Món Mới", "⭐ Đề cử"];
/** Hiển thị nhãn trong khu nhân sự không kèm emoji */
export const tagLabel = (t: string) => t.replace(/^[^\p{L}\p{N}]+/u, "").trim() || t;

export function TagsInput({ tags, onChange, disabled }: { tags: string[]; onChange: (t: string[]) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState("");
  const toggle = (t: string) => onChange(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]);
  const add = () => {
    const t = draft.trim();
    if (t && !tags.includes(t)) toggle(t);
    setDraft("");
  };
  if (disabled) {
    return tags.length ? (
      <span className="o-row" style={{ gap: 4 }}>
        {tags.map((t) => <span key={t} className="o-badge o-badge-primary">{tagLabel(t)}</span>)}
      </span>
    ) : (
      <span className="o-muted">—</span>
    );
  }
  return (
    <div className="o-stack" style={{ gap: 6 }}>
      <div className="o-row" style={{ gap: 4 }}>
        {PREDEFINED_TAGS.map((t) => (
          <label key={t} className="o-check" style={{ marginRight: 8 }}>
            <input type="checkbox" checked={tags.includes(t)} onChange={() => toggle(t)} /> {tagLabel(t)}
          </label>
        ))}
      </div>
      <div className="o-row" style={{ gap: 4 }}>
        {tags.filter((t) => !PREDEFINED_TAGS.includes(t)).map((t) => (
          <span key={t} className="o-badge o-badge-primary">
            {t}
            <button type="button" onClick={() => toggle(t)} aria-label={`Bỏ ${t}`} style={{ border: 0, background: "none", padding: 0, cursor: "pointer", display: "flex", color: "inherit" }}>
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="o-row" style={{ flexWrap: "nowrap" }}>
        <input
          className="o-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Nhãn khác…"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button onClick={add}>Thêm</Button>
      </div>
    </div>
  );
}

export function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Chỉ giữ chữ số (giống logic cũ: replace(/\D/g, "")) */
export const digits = (s: string) => Number(s.replace(/\D/g, ""));
