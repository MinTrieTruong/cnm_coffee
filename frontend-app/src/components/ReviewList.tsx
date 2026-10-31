import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { SectionHead } from "./site/parts";
import { ReviewItem, type PublicReviewRow } from "./site/ReviewItem";
import { useLang } from "../lib/i18n";

export type PublicReview = PublicReviewRow;

type Sort = "newest" | "oldest" | "high" | "low";

/** Đánh giá chung của quán (trang Thực đơn, Cửa hàng) */
export function ReviewList({ title = "Khách nói gì về quán" }: { title?: string }) {
  const { t } = useLang();
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
      <SectionHead title={title} sub={t("{avg}/5 từ {n} đánh giá", { avg, n: reviews.length })} />
      <label className="c-review-sort">
        {t("Sắp xếp")}
        <select className="c-input" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="newest">{t("Mới nhất")}</option>
          <option value="oldest">{t("Cũ nhất")}</option>
          <option value="high">{t("Điểm cao")}</option>
          <option value="low">{t("Điểm thấp")}</option>
        </select>
      </label>
      <ul className="c-reviews">
        {shown.map((r) => <ReviewItem key={r.id} r={r} />)}
      </ul>
      {!showAll && reviews.length > 4 && (
        <button type="button" className="c-btn is-outline c-review-more" onClick={() => setShowAll(true)}>{t("Xem thêm đánh giá")}</button>
      )}
    </div>
  );
}
