import { useEffect } from "react";
import { PostContent } from "./PostEditor";

export type PostPreview = {
  id: number;
  title: string;
  body: string;
  imageUrl: string | null;
  pinned: boolean;
  createdAt: string;
};

export function PostViewModal({
  post,
  onClose,
}: {
  post: PostPreview;
  onClose: () => void;
}) {
  // Đóng bằng Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="post-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={post.title}
    >
      <div className="post-modal-box" style={{ position: "relative" }}>
        {/* Nút đóng */}
        <button
          type="button"
          className="post-modal-close"
          onClick={onClose}
          aria-label="Đóng"
          style={{ zIndex: 10 }}
        >
          ✕
        </button>

        {/* Ảnh bìa nếu có */}
        {post.imageUrl && (
          <img
            src={post.imageUrl}
            alt={post.title}
            className="post-modal-hero"
          />
        )}

        <div className="post-modal-body">
          {/* Badge ghim */}
          {post.pinned && (
            <span
              style={{
                display: "inline-block",
                fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.06em", background: "rgba(212,167,95,0.15)",
                color: "var(--accent)", borderRadius: 999, padding: "0.15rem 0.55rem",
                border: "1px solid rgba(212,167,95,0.3)", marginBottom: "0.75rem",
              }}
            >
              📌 Nổi bật
            </span>
          )}

          {/* Tiêu đề */}
          <h2
            style={{
              margin: "0 0 0.35rem",
              fontSize: "1.55rem",
              fontWeight: 800,
              lineHeight: 1.3,
              color: "var(--fg)",
            }}
          >
            {post.title}
          </h2>

          {/* Ngày đăng */}
          <p style={{ margin: "0 0 1.35rem", fontSize: "0.82rem", color: "var(--muted)" }}>
            {new Date(post.createdAt).toLocaleString("vi-VN", {
              weekday: "long", year: "numeric", month: "long", day: "numeric",
            })}
          </p>

          {/* Nội dung HTML đầy đủ */}
          <PostContent html={post.body} />
        </div>
      </div>
    </div>
  );
}
