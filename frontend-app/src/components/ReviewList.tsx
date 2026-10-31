import { useEffect, useMemo, useState } from "react";
import { api, mediaUrl } from "../lib/api";
import { SectionHead } from "./site/parts";

export type PublicReview = {
  id: number;
  rating: number;
  comment: string | null;
  imageUrl: string | null;
  adminReply: string | null;
  createdAt: string;
  customer: { fullName: string };
};

type Sort = "newest" | "oldest" | "high" | "low";

/** Đánh giá chung của quán (trang Thực đơn, Cửa hàng) */
export function ReviewList({ title = "Khách nói gì về quán" }: { title?: string }) {
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<Sort>("newest");

  useEffect(() => {
    api<PublicReview[]>("/api/reviews").then(setReviews).catch(() => setReviews([]));
  }, []);

  const sorted = useMemo(() => {
    const arr = [...reviews];
    const t = (r: PublicReview) => new Date(r.createdAt).getTime();
    if (sort === "newest") arr.sort((a, b) => t(b) - t(a));
    else if (sort === "oldest") arr.sort((a, b) => t(a) - t(b));
    else if (sort === "high") arr.sort((a, b) => b.rating - a.rating);
    else arr.sort((a, b) => a.rating - b.rating);
    return arr;
  }, [reviews, sort]);

  if (reviews.length === 0) return null;
  const shown = showAll ? sorted : sorted.slice(0, 4);
  const avg = (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1);

  return (
    <div>
      <SectionHead title={title} sub={`${avg}/5 từ ${reviews.length} đánh giá`} />
      <label className="c-review-sort">
        Sắp xếp
        <select className="c-input" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="newest">Mới nhất</option>
          <option value="oldest">Cũ nhất</option>
          <option value="high">Điểm cao</option>
          <option value="low">Điểm thấp</option>
        </select>
      </label>
      <ul className="c-reviews">
        {shown.map((r) => (
          <li key={r.id} className="c-review">
            <div className="c-review-head">
              <strong>{r.customer.fullName}</strong>
              <span className="c-review-stars" aria-label={`${r.rating} trên 5 sao`}>{"★".repeat(r.rating)}<span aria-hidden className="is-dim">{"★".repeat(5 - r.rating)}</span></span>
              <time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleDateString("vi-VN")}</time>
            </div>
            {r.comment && <p>{r.comment}</p>}
            {r.imageUrl && <img src={mediaUrl(r.imageUrl)} alt="Ảnh khách gửi" loading="lazy" className="c-review-img" />}
            {r.adminReply && <p className="c-review-reply"><strong>TD Coffee:</strong> {r.adminReply}</p>}
          </li>
        ))}
      </ul>
      {!showAll && reviews.length > 4 && (
        <button type="button" className="c-btn is-outline c-review-more" onClick={() => setShowAll(true)}>Xem thêm đánh giá</button>
      )}
    </div>
  );
}
