import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, mediaUrl } from "../lib/api";
import { BookOpen, Calendar, Pin, ChevronRight } from "lucide-react";

type Post = {
  id: number;
  title: string;
  body: string;
  imageUrl: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("vi-VN", { day: "2-digit", month: "long", year: "numeric" });
}

/** Lấy text thuần từ HTML body */
function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent ?? div.innerText ?? "";
}

function PostCard({ post, featured }: { post: Post; featured?: boolean }) {
  const excerpt = stripHtml(post.body).slice(0, featured ? 220 : 120) + "…";

  return (
    <Link
      to={`/blog/${post.id}`}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: featured ? 24 : 16,
        overflow: "hidden",
        display: "flex",
        flexDirection: featured ? "row" : "column",
        transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.3s ease",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-6px)"; (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-lg)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(146,64,14,0.5)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 32px rgba(0,0,0,.15)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
    >
      {/* Image */}
      {post.imageUrl && (
        <div style={{
          flexShrink: 0,
          width: featured ? "45%" : "100%",
          height: featured ? "auto" : 200,
          minHeight: featured ? 260 : undefined,
          overflow: "hidden",
          background: "var(--border)",
        }}>
          <img
            src={mediaUrl(post.imageUrl) || post.imageUrl}
            alt={post.title}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", transition: "transform .4s" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLImageElement).style.transform = "scale(1.04)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLImageElement).style.transform = ""; }}
          />
        </div>
      )}
      {!post.imageUrl && !featured && (
        <div style={{ height: 8, background: "var(--accent)" }} />
      )}

      {/* Content */}
      <div style={{ padding: featured ? "2rem" : "1.25rem", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {post.pinned && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(146,64,14,.15)", color: "var(--accent)", border: "1px solid rgba(146,64,14,.3)", borderRadius: 99, padding: "2px 10px", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>
              <Pin size={10} /> Ghim
            </span>
          )}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--muted)", fontSize: "0.78rem" }}>
            <Calendar size={12} />
            {formatDate(post.createdAt)}
          </span>
        </div>

        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: featured ? "1.5rem" : "1.05rem", color: "var(--text)", lineHeight: 1.35 }}>
          {post.title}
        </h2>

        <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.88rem", lineHeight: 1.65, flex: 1 }}>
          {excerpt}
        </p>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--accent)", fontSize: "0.85rem", fontWeight: 600, marginTop: 4 }}>
          Đọc thêm <ChevronRight size={14} />
        </div>
      </div>
    </Link>
  );
}

export function Blog() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Post[]>("/api/posts")
      .then(setPosts)
      .catch((e) => setErr(e instanceof Error ? e.message : "Không tải được bài viết"))
      .finally(() => setLoading(false));
  }, []);

  const pinned = posts.filter((p) => p.pinned);
  const regular = posts.filter((p) => !p.pinned);

  return (
    <div style={{ width: "100%" }}>
      {/* Hero */}
      <div style={{
        position: "relative",
        padding: "6rem 1.5rem 5.5rem",
        textAlign: "center",
        marginBottom: "3.5rem",
        borderBottom: "1px solid var(--border)",
        backgroundImage: "url('https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=1920')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(28,25,23,0.55) 0%, rgba(28,25,23,0.75) 100%)", zIndex: 0 }} />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 800, margin: "0 auto" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.95)", borderRadius: 99, padding: "6px 20px", marginBottom: 20 }}>
            <BookOpen size={16} color="var(--accent)" />
            <span style={{ color: "var(--accent)", fontSize: "0.85rem", fontWeight: 700, letterSpacing: "0.08em" }}>TIN TỨC & CÂU CHUYỆN</span>
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.5rem, 6vw, 4rem)", color: "#fff", margin: "0 0 1rem", lineHeight: 1.2 }}>
            Bài viết từ TD Coffee
          </h1>
          <p style={{ color: "rgba(255,255,255,0.92)", fontSize: "1.1rem", margin: "0 auto", lineHeight: 1.6 }}>
            Cập nhật tin tức, ưu đãi, câu chuyện cà phê và những điều thú vị từ đội ngũ TD Coffee.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 1.5rem 4rem" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "4rem 0" }}>
            <div className="hp-loader" />
            <p className="subtle" style={{ marginTop: 12 }}>Đang tải bài viết…</p>
          </div>
        )}

        {err && (
          <div style={{ textAlign: "center", padding: "4rem 0", color: "var(--danger)" }}>
            <p>{err}</p>
          </div>
        )}

        {!loading && !err && posts.length === 0 && (
          <div style={{ textAlign: "center", padding: "5rem 0" }}>
            <BookOpen size={48} color="var(--muted)" style={{ marginBottom: 16, opacity: .4 }} />
            <p style={{ color: "var(--muted)", fontSize: "1.05rem" }}>Chưa có bài viết nào được đăng.</p>
            <Link to="/" style={{ color: "var(--accent)", marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
              Về trang chủ <ChevronRight size={16} />
            </Link>
          </div>
        )}

        {/* Pinned / featured */}
        {pinned.length > 0 && (
          <div style={{ marginBottom: "2.5rem" }}>
            <h2 style={{ fontSize: "1rem", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted)", marginBottom: "1rem", fontWeight: 700 }}>
              📌 Bài viết nổi bật
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {pinned.map((p) => <PostCard key={p.id} post={p} featured />)}
            </div>
          </div>
        )}

        {/* Regular posts */}
        {regular.length > 0 && (
          <div>
            {pinned.length > 0 && (
              <h2 style={{ fontSize: "1rem", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted)", marginBottom: "1rem", fontWeight: 700 }}>
                📰 Tất cả bài viết
              </h2>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.5rem" }}>
              {regular.map((p) => <PostCard key={p.id} post={p} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
