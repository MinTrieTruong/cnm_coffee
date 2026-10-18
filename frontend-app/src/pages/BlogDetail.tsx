import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, mediaUrl } from "../lib/api";
import { ChevronLeft, Calendar } from "lucide-react";
import { motion } from "framer-motion";

type Post = {
  id: number;
  title: string;
  body: string;
  imageUrl: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export function BlogDetail() {
  const { id } = useParams();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api<Post>(`/api/posts/${id}`)
      .then(setPost)
      .catch((e) => setErr(e instanceof Error ? e.message : "Không tải được bài viết"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="site-page" style={{ padding: "4rem 1.5rem", textAlign: "center" }}>
        <div className="hp-loader" />
        <p className="subtle" style={{ marginTop: 12 }}>Đang tải...</p>
      </div>
    );
  }

  if (err || !post) {
    return (
      <div className="site-page" style={{ padding: "4rem 1.5rem", textAlign: "center", color: "var(--danger)" }}>
        <p>{err || "Không tìm thấy bài viết"}</p>
        <Link to="/blog" style={{ color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 4, marginTop: 16 }}>
          <ChevronLeft size={16} /> Quay lại danh sách
        </Link>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="site-page" style={{ maxWidth: 800, margin: "0 auto", padding: "2rem 1.5rem 6rem" }}>
      <Link to="/blog" style={{ color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: "2rem", textDecoration: "none", fontSize: "0.9rem" }}>
        <ChevronLeft size={16} /> Quay lại danh sách
      </Link>
      
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: "0.9rem", marginBottom: "1rem" }}>
        <Calendar size={14} />
        {new Date(post.createdAt).toLocaleDateString("vi-VN", { day: "2-digit", month: "long", year: "numeric" })}
      </div>
      
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem, 4vw, 2.5rem)", color: "var(--text)", marginBottom: "2rem", lineHeight: 1.3 }}>
        {post.title}
      </h1>
      
      {post.imageUrl && (
        <div style={{ width: "100%", borderRadius: 16, overflow: "hidden", marginBottom: "2.5rem", boxShadow: "var(--shadow-lg)" }}>
          <img src={mediaUrl(post.imageUrl)} alt={post.title} style={{ width: "100%", height: "auto", display: "block" }} />
        </div>
      )}
      
      <div 
        className="post-content"
        style={{ color: "var(--text)", fontSize: "1.05rem", lineHeight: 1.8 }}
        dangerouslySetInnerHTML={{ __html: post.body }}
      />
    </motion.div>
  );
}
