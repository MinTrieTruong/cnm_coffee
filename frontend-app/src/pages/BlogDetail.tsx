import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, mediaUrl } from "../lib/api";
import { Crumbs } from "../components/site/parts";
import { useLang } from "../lib/i18n";

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
  const { t, date } = useLang();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api<Post>(`/api/posts/${id}`)
      .then(setPost)
      .catch((e) => setErr(e instanceof Error ? e.message : t("Không tải được bài viết")))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading || err || !post) {
    return (
      <div className="c-wrap c-article">
        <Crumbs items={[{ to: "/blog", label: "Tin tức" }, { label: loading ? "Đang tải…" : "Không tìm thấy" }]} />
        {loading ? <p className="c-muted-txt">{t("Đang tải…")}</p> : <p className="c-err">{err || t("Không tìm thấy bài viết")}</p>}
        {!loading && <Link to="/blog" className="c-btn is-outline">{t("Về danh sách tin")}</Link>}
      </div>
    );
  }

  return (
    <article className="c-wrap c-article">
      <Crumbs items={[{ to: "/blog", label: "Tin tức" }, { label: post.title }]} />
      <header className="c-article-head">
        <time dateTime={post.createdAt}>{date(post.createdAt, { day: "2-digit", month: "long", year: "numeric" })}</time>
        <h1>{post.title}</h1>
      </header>
      {post.imageUrl && <img className="c-article-img" src={mediaUrl(post.imageUrl)} alt={post.title} />}
      <div className="post-content c-article-body" dangerouslySetInnerHTML={{ __html: post.body }} />
      <p><Link to="/blog" className="c-sec-more">{t("← Tin khác")}</Link></p>
    </article>
  );
}
