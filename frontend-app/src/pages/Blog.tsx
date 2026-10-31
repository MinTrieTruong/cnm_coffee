import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, mediaUrl } from "../lib/api";
import { Crumbs, SectionHead } from "../components/site/parts";

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
  return new Date(s).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Lấy text thuần từ HTML body */
function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent ?? div.innerText ?? "";
}

function PostCard({ post, featured }: { post: Post; featured?: boolean }) {
  const excerpt = stripHtml(post.body).slice(0, featured ? 260 : 130).trim() + "…";
  return (
    <Link to={`/blog/${post.id}`} className={`c-post${featured ? " is-featured" : ""}`}>
      <span className="c-post-img">
        {post.imageUrl ? <img src={mediaUrl(post.imageUrl)} alt="" loading="lazy" /> : <span className="c-noimg">{post.title}</span>}
      </span>
      <span className="c-post-body">
        <span className="c-post-meta">
          {post.pinned && <span className="c-stamp">Nổi bật</span>}
          <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
        </span>
        <span className="c-post-title">{post.title}</span>
        <span className="c-post-ex">{excerpt}</span>
        <span className="c-sec-more">Đọc tiếp →</span>
      </span>
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
    <div className="c-wrap c-blog">
      <Crumbs items={[{ label: "Tin tức" }]} />
      <SectionHead as="h1" title="Tin tức" sub="chuyện ở quán, món mới, ưu đãi" />
      {loading && <p className="c-muted-txt">Đang tải bài viết…</p>}
      {err && <p className="c-err">{err}</p>}
      {!loading && !err && posts.length === 0 && (
        <p className="c-muted-txt">Chưa có bài viết nào. <Link to="/" className="c-sec-more">Về trang chủ →</Link></p>
      )}
      {pinned.length > 0 && <div className="c-blog-featured">{pinned.map((p) => <PostCard key={p.id} post={p} featured />)}</div>}
      {regular.length > 0 && <div className="c-news-grid c-blog-grid">{regular.map((p) => <PostCard key={p.id} post={p} />)}</div>}
    </div>
  );
}
