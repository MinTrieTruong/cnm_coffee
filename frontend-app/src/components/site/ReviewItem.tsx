import { Link } from "react-router-dom";
import { mediaUrl } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { CustomerAvatar } from "../CustomerAvatar";
import { LogoMark } from "../LogoMark";

export type PublicReviewRow = {
  id: number;
  rating: number;
  comment: string | null;
  imageUrl: string | null;
  adminReply: string | null;
  createdAt: string;
  /** null = đánh giá ẩn danh */
  customer: { fullName: string; avatarUrl?: string | null } | null;
  /** Đánh giá món (danh sách chung hiện tên món); không có = đánh giá chung cho quán */
  product?: { id: number; name: string } | null;
  /** Chi nhánh của đơn được đánh giá (GET /api/reviews) */
  storeName?: string;
};

/** Một đánh giá: avatar trái · tên + sao + ngày · nội dung · ảnh · phản hồi của quán (logo + "TD Coffee phản hồi") */
export function ReviewItem({ r }: { r: PublicReviewRow }) {
  const { t, date } = useLang();
  const name = r.customer?.fullName ?? t("Khách hàng");
  return (
    <li className="c-review">
      <CustomerAvatar src={r.customer?.avatarUrl} name={name} anonymous={!r.customer} size={40} className="c-review-ava" />
      <div className="c-review-main">
        <div className="c-review-head">
          <strong>{name}</strong>
          <span className="c-review-stars" aria-label={t("{n} trên 5 sao", { n: r.rating })}>{"★".repeat(r.rating)}<span aria-hidden className="is-dim">{"★".repeat(5 - r.rating)}</span></span>
          <time dateTime={r.createdAt}>{date(r.createdAt)}</time>
        </div>
        {r.product && <Link to={`/product/${r.product.id}`} className="c-review-prod">{t("Món")}: {r.product.name}</Link>}
        {r.comment && <p>{r.comment}</p>}
        {r.imageUrl && <img src={mediaUrl(r.imageUrl)} alt={t("Ảnh khách gửi")} loading="lazy" className="c-review-img" />}
        {r.adminReply && (
          <div className="c-review-reply">
            <span className="c-review-reply-h"><LogoMark width={24} height={24} /> {t("TD Coffee phản hồi")}</span>
            <p>{r.adminReply}</p>
          </div>
        )}
      </div>
    </li>
  );
}
