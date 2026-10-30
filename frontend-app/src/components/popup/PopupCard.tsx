import { useMemo } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { safeHtml } from "../../lib/safeHtml";
import "../../styles/popup.css";

export type PopupView = {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string;
  buttonText: string;
  /** Nhãn ngắn của loại đích ("Mini game", "Voucher"…) — khai báo ở backend lib/popupTargets.ts */
  tag?: string | null;
};

export type PopupPager = { index: number; total: number; prev: () => void; next: () => void };

/**
 * Nội dung 1 pop up dạng "phiếu" của quán: ảnh, nhãn loại đích, tên, mô tả, cuống phiếu chứa nút hành động.
 * Dùng chung cho PopupHost (khách) và khung xem trước trang quản trị để quản lý thấy đúng như khách.
 */
export function PopupCard({
  p,
  onGo,
  onClose,
  onSnooze,
  pager,
}: {
  p: PopupView;
  onGo?: () => void;
  onClose?: () => void;
  /** "Ẩn đến hết hôm nay" */
  onSnooze?: () => void;
  pager?: PopupPager;
}) {
  const html = useMemo(() => safeHtml(p.description), [p.description]);
  const img = mediaUrl(p.imageUrl);
  return (
    <article className="pu-card" aria-labelledby={`pu-t-${p.id}`}>
      <button type="button" className="pu-media" onClick={onGo} tabIndex={-1} aria-hidden="true">
        {img ? <img src={img} alt="" /> : <span className="pu-media-empty">Ảnh pop up</span>}
      </button>

      <div className="pu-main">
        <div className="pu-top">
          <span className="pu-tag">{p.tag || "TD Coffee"}</span>
          {onClose && (
            <button type="button" className="pu-x" onClick={onClose} aria-label="Đóng">
              <X size={18} aria-hidden />
            </button>
          )}
        </div>

        <div className="pu-copy">
          <h2 id={`pu-t-${p.id}`} className="pu-title">{p.name || "Tên pop up"}</h2>
          {html && <div className="pu-desc" dangerouslySetInnerHTML={{ __html: html }} />}
        </div>

        <div className="pu-stub">
          <div className="pu-stub-row">
            {pager && pager.total > 1 && (
              <div className="pu-pager" aria-label={`Pop up ${pager.index + 1} trên ${pager.total}`}>
                <button type="button" onClick={pager.prev} disabled={pager.index === 0} aria-label="Pop up trước"><ChevronLeft size={16} aria-hidden /></button>
                <span className="pu-count">{pager.index + 1}<span>/{pager.total}</span></span>
                <button type="button" onClick={pager.next} disabled={pager.index === pager.total - 1} aria-label="Pop up sau"><ChevronRight size={16} aria-hidden /></button>
              </div>
            )}
            <button type="button" className="pu-cta" onClick={onGo}>
              {p.buttonText || "Xem ngay"}
              <ArrowRight size={17} aria-hidden />
            </button>
          </div>
          {onSnooze && (
            <button type="button" className="pu-quiet" onClick={onSnooze}>Ẩn đến hết hôm nay</button>
          )}
        </div>
      </div>
    </article>
  );
}
