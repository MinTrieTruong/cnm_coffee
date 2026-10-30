import { useMemo } from "react";
import { X } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { safeHtml } from "../../lib/safeHtml";
import "../../styles/popup.css";

export type PopupView = {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string;
  buttonText: string;
};

/**
 * Nội dung 1 pop up — dùng cho cả PopupHost (khách) và khung xem trước ở trang quản trị,
 * để quản lý thấy đúng như khách sẽ thấy.
 */
export function PopupCard({
  p,
  onGo,
  onClose,
  footer,
}: {
  p: PopupView;
  onGo?: () => void;
  onClose?: () => void;
  /** Chấm chỉ số, mũi tên, "Không hiện lại hôm nay" */
  footer?: React.ReactNode;
}) {
  const html = useMemo(() => safeHtml(p.description), [p.description]);
  const img = mediaUrl(p.imageUrl);
  return (
    <div className="pu-card" role="document">
      {onClose && (
        <button type="button" className="pu-close" onClick={onClose} aria-label="Đóng">
          <X size={20} aria-hidden />
        </button>
      )}
      {img ? (
        <button type="button" className="pu-img" onClick={onGo} aria-label={p.name} tabIndex={onGo ? 0 : -1}>
          <img src={img} alt="" />
        </button>
      ) : (
        <div className="pu-img pu-img-empty">Ảnh pop up</div>
      )}
      <div className="pu-body">
        <h2 className="pu-title">{p.name || "Tên pop up"}</h2>
        {html && <div className="pu-desc" dangerouslySetInnerHTML={{ __html: html }} />}
        <button type="button" className="pu-cta" onClick={onGo}>{p.buttonText || "Xem ngay"}</button>
        {footer}
      </div>
    </div>
  );
}
