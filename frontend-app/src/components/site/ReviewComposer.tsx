import { useState, type FormEvent } from "react";
import { ImagePlus, X } from "lucide-react";
import { api, mediaUrl } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { readImage } from "../../pages/account/shared";

/**
 * Form viết đánh giá: sao · cảm nhận · ảnh · ẩn danh. Gửi POST /api/reviews cho một đơn,
 * kèm productId khi đánh giá món (không có = đánh giá chung cho quán).
 */
export function ReviewComposer({
  orderId,
  productId,
  placeholder,
  onDone,
  onCancel,
}: {
  orderId: number;
  productId?: number | null;
  placeholder?: string;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const { t } = useLang();
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pickImage(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setErr(null);
    try {
      const res = await api<{ url: string }>("/api/reviews/upload-image", { method: "POST", body: JSON.stringify({ dataUrl: await readImage(file) }) });
      setImage(res.url);
    } catch (ex) {
      setErr(ex instanceof Error ? t(ex.message) : t("Lỗi tải ảnh"));
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      await api("/api/reviews", {
        method: "POST",
        body: JSON.stringify({ orderId, productId: productId ?? null, rating: stars, comment: comment.trim() || undefined, imageUrl: image || undefined, anonymous }),
      });
      onDone();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : t("Lỗi"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="c-acc-form c-rv-form" onSubmit={(e) => void submit(e)}>
      <fieldset className="c-field c-stars-field">
        <legend className="c-field-label">{t("Chấm điểm")}</legend>
        <div className="c-stars" role="radiogroup" aria-label={t("Chấm điểm")}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={t("{n} trên 5 sao", { n })} className={n <= stars ? "is-on" : undefined} onClick={() => setStars(n)}>★</button>
          ))}
        </div>
      </fieldset>
      <label className="c-field">
        <span className="c-field-label">{t("Cảm nhận")}</span>
        <textarea className="c-input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={placeholder ?? t("Không gian, hương vị, phục vụ…")} maxLength={500} />
      </label>
      <div className="c-field">
        <span className="c-field-label">{t("Hình ảnh")}</span>
        {image ? (
          <span className="c-review-thumb">
            <img src={mediaUrl(image)} alt={t("Ảnh đính kèm")} />
            <button type="button" onClick={() => setImage(null)} aria-label={t("Bỏ ảnh")}><X size={14} aria-hidden /></button>
          </span>
        ) : (
          <label className="c-btn is-outline c-upload">
            <ImagePlus size={16} aria-hidden /> {uploading ? t("Đang tải…") : t("Thêm ảnh")}
            <input type="file" accept="image/*" hidden onChange={(e) => void pickImage(e.target.files?.[0])} />
          </label>
        )}
      </div>
      <label className="c-check">
        <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
        <span>{t("Đánh giá ẩn danh")} <span className="c-muted-txt">— {t("không hiện tên và ảnh của bạn trong danh sách đánh giá")}</span></span>
      </label>
      {err && <p className="c-err" role="alert">{err}</p>}
      <div className="c-rv-actions">
        <button type="submit" className="c-btn" disabled={saving || uploading}>{saving ? t("Đang gửi…") : t("Gửi đánh giá")}</button>
        {onCancel && <button type="button" className="c-linkish" onClick={onCancel}>{t("Huỷ")}</button>}
      </div>
    </form>
  );
}
