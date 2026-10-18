import { useEffect, useState, useMemo } from "react";
import { api } from "../lib/api";

export type PublicReview = {
  id: number;
  rating: number;
  comment: string | null;
  imageUrl: string | null;
  adminReply: string | null;
  createdAt: string;
  customer: { fullName: string };
};

export function ReviewList({
  title = "⭐ Đánh giá từ khách hàng",
  titleSize = "1.15rem",
}: {
  title?: string;
  titleSize?: string;
}) {
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState<"newest" | "oldest" | "high" | "low">("newest");
  const [selectedReview, setSelectedReview] = useState<PublicReview | null>(null);

  useEffect(() => {
    api<PublicReview[]>("/api/reviews")
      .then((r) => setReviews(r))
      .catch(() => {});
  }, []);

  const sortedReviews = useMemo(() => {
    const arr = [...reviews];
    if (filter === "newest") arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    else if (filter === "oldest") arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    else if (filter === "high") arr.sort((a, b) => b.rating - a.rating);
    else if (filter === "low") arr.sort((a, b) => a.rating - b.rating);
    return arr;
  }, [reviews, filter]);

  if (reviews.length === 0) return null;

  const displayed = showAll ? sortedReviews : sortedReviews.slice(0, 2);
  const avgRating = (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: titleSize, margin: 0 }}>
          {title}
          <span style={{ marginLeft: "0.75rem", fontSize: "1rem", color: "#b45309", fontFamily: "inherit" }}>
            ★ {avgRating}
          </span>
        </h2>
        
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          style={{
            background: "var(--surface2)", border: "1px solid var(--border)",
            color: "var(--fg)", borderRadius: 6, padding: "0.4rem 0.6rem", fontSize: "0.85rem",
            outline: "none", cursor: "pointer"
          }}
        >
          <option value="newest" style={{ color: "#000" }}>Mới nhất</option>
          <option value="oldest" style={{ color: "#000" }}>Cũ nhất</option>
          <option value="high" style={{ color: "#000" }}>Đánh giá cao</option>
          <option value="low" style={{ color: "#000" }}>Đánh giá thấp</option>
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {displayed.map((r) => (
          <div key={r.id} className="card" style={{ padding: "0.9rem 1rem", cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s" }} 
               onClick={() => setSelectedReview(r)}
               onMouseEnter={(e) => {
                 (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                 (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-lg)";
               }}
               onMouseLeave={(e) => {
                 (e.currentTarget as HTMLElement).style.transform = "";
                 (e.currentTarget as HTMLElement).style.boxShadow = "";
               }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: (r.comment || r.imageUrl) ? "0.5rem" : 0 }}>
              <div style={{ display: "flex" }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <span key={s} style={{ color: s <= r.rating ? "#b45309" : "#d6d3d1", fontSize: "0.95rem" }}>★</span>
                ))}
              </div>
              <strong style={{ fontSize: "0.9rem" }}>{r.customer.fullName}</strong>
              <span className="subtle" style={{ fontSize: "0.78rem", marginLeft: "auto" }}>
                {new Date(r.createdAt).toLocaleDateString("vi-VN")}
              </span>
            </div>
            {r.comment && <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.55, color: "var(--fg)" }}>{r.comment}</p>}
            {r.imageUrl && (
              <img src={r.imageUrl} alt="Review" style={{ marginTop: "0.6rem", width: 80, height: 80, objectFit: "cover", borderRadius: 8 }} />
            )}
            {r.adminReply && (
              <div style={{
                marginTop: "0.65rem", padding: "0.5rem 0.75rem",
                background: "rgba(212,167,95,0.08)", borderLeft: "3px solid var(--accent)",
                borderRadius: 6, fontSize: "0.85rem",
              }}>
                <span className="subtle" style={{ fontSize: "0.78rem" }}>TD Coffee: </span>
                {r.adminReply}
              </div>
            )}
          </div>
        ))}
        
        {!showAll && reviews.length > 2 && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ alignSelf: "center", marginTop: "0.5rem", padding: "0.5rem 1.5rem" }}
            onClick={() => setShowAll(true)}
          >
            Xem thêm đánh giá ↓
          </button>
        )}
      </div>

      {selectedReview && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", backdropFilter: "blur(4px)" }} onClick={() => setSelectedReview(null)}>
          <div className="card" style={{ maxWidth: 500, width: "100%", padding: "1.5rem", position: "relative", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <button style={{ position: "absolute", top: "1rem", right: "1rem", background: "var(--surface2)", border: "none", borderRadius: "50%", width: 32, height: 32, color: "var(--fg)", fontSize: "1.2rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setSelectedReview(null)}>✕</button>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem", marginTop: "0.5rem" }}>
              <div style={{ display: "flex" }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <span key={s} style={{ color: s <= selectedReview.rating ? "#b45309" : "#d6d3d1", fontSize: "1.2rem" }}>★</span>
                ))}
              </div>
              <strong style={{ fontSize: "1.05rem" }}>{selectedReview.customer.fullName}</strong>
              <span className="subtle" style={{ fontSize: "0.85rem", marginLeft: "auto", marginRight: "2rem" }}>
                {new Date(selectedReview.createdAt).toLocaleDateString("vi-VN")}
              </span>
            </div>
            {selectedReview.comment && <p style={{ margin: "0 0 1rem", fontSize: "0.98rem", lineHeight: 1.6, color: "var(--fg)" }}>{selectedReview.comment}</p>}
            {selectedReview.imageUrl && (
              <img src={selectedReview.imageUrl} alt="Review" style={{ width: "100%", maxHeight: "60vh", objectFit: "contain", borderRadius: 8, marginBottom: selectedReview.adminReply ? "1rem" : 0 }} />
            )}
            {selectedReview.adminReply && (
              <div style={{
                padding: "0.75rem 1rem", marginTop: selectedReview.imageUrl || selectedReview.comment ? "0.5rem" : 0,
                background: "rgba(212,167,95,0.08)", borderLeft: "3px solid var(--accent)",
                borderRadius: 6, fontSize: "0.95rem",
              }}>
                <span className="subtle" style={{ fontSize: "0.85rem", display: "block", marginBottom: "0.2rem" }}>Phản hồi từ quán: </span>
                {selectedReview.adminReply}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
