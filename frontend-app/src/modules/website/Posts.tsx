import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Newspaper, Pin, PinOff, Trash2 } from "lucide-react";
import { staffApi } from "../../lib/staffApi";
import { PostContent, PostEditor } from "../../components/PostEditor";
import { PostViewModal, type PostPreview } from "../../components/PostViewModal";
import { Alert, Badge, Button, EmptyState, Field, FormView, RecordList, errMsg, fmtDateTime } from "../../components/erp";
import { useRecordNav } from "../shared";

type PostRow = {
  id: number;
  title: string;
  body: string;
  imageUrl: string | null;
  pinned: boolean;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};

const BASE = "/app/website/posts";
const FALLBACK_NOTE =
  "Không tải được danh sách quản trị (/api/posts/admin trả lỗi do backend khai báo route /posts/:id trước). Đang hiển thị tạm các bài đã xuất bản; bài đang ẩn không xem được ở đây.";

/** Tải bài đăng: ưu tiên API quản trị, lỗi thì dùng danh sách công khai */
function usePosts() {
  const [rows, setRows] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fallback, setFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await staffApi<PostRow[]>("/api/posts/admin"));
      setFallback(false);
      setError(null);
    } catch {
      try {
        const pub = await staffApi<Omit<PostRow, "isPublished">[]>("/api/posts");
        setRows(pub.map((p) => ({ ...p, isPublished: true })));
        setFallback(true);
        setError(null);
      } catch (e) {
        setError(errMsg(e));
      }
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { rows, loading, fallback, error, reload };
}

const plain = (html: string) => html.replace(/<[^>]*>/g, "").slice(0, 120);

export function PostList() {
  const { rows, loading, fallback, error } = usePosts();
  const go = useRecordNav(BASE);
  return (
    <RecordList
      crumbs={[{ label: "Bài đăng" }]}
      rows={rows}
      rowKey={(p) => p.id}
      loading={loading}
      error={error}
      onOpen={(p) => go.open(p.id)}
      onCreate={go.create}
      top={fallback ? <Alert tone="warning">{FALLBACK_NOTE}</Alert> : undefined}
      columns={[
        { key: "title", label: "Tiêu đề", value: (p) => p.title, render: (p) => <strong style={{ fontWeight: 500 }}>{p.title}</strong> },
        { key: "excerpt", label: "Nội dung", value: (p) => plain(p.body), wrap: true, optional: true },
        { key: "pinned", label: "Ghim", value: (p) => (p.pinned ? "Ghim" : ""), render: (p) => (p.pinned ? <Badge tone="primary">Ghim</Badge> : "") },
        { key: "pub", label: "Trạng thái", value: (p) => (p.isPublished ? "Đã xuất bản" : "Ẩn"), render: (p) => (p.isPublished ? <Badge tone="success">Đã xuất bản</Badge> : <Badge>Ẩn</Badge>) },
        { key: "created", label: "Ngày tạo", value: (p) => p.createdAt, render: (p) => fmtDateTime(p.createdAt) },
      ]}
      searchText={(p) => `${p.title} ${plain(p.body)}`}
      filters={[
        { id: "pub", label: "Đã xuất bản", test: (p) => p.isPublished },
        { id: "hidden", label: "Đang ẩn", test: (p) => !p.isPublished },
        { id: "pinned", label: "Đang ghim", test: (p) => p.pinned },
      ]}
      exportName="bai-dang"
      emptyState={<EmptyState icon={Newspaper} title="Chưa có bài đăng nào" />}
    />
  );
}

const EMPTY = { title: "", body: "", imageUrl: "", pinned: false, isPublished: true };

export function PostForm({ recordId }: { recordId?: string }) {
  const isNew = recordId === "new";
  const go = useRecordNav(BASE);
  const { rows, loading, fallback, error, reload } = usePosts();
  const post = isNew ? null : rows.find((p) => String(p.id) === recordId) ?? null;
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<PostPreview | null>(null);

  const reset = (p: PostRow) => setForm({ title: p.title, body: p.body, imageUrl: p.imageUrl ?? "", pinned: p.pinned, isPublished: p.isPublished });
  useEffect(() => {
    if (post) reset(post);
  }, [post]);

  async function save() {
    if (!form.title.trim() || !form.body.trim()) return setErr("Nhập tiêu đề và nội dung.");
    setSaving(true);
    setErr(null);
    try {
      if (isNew) {
        const created = await staffApi<{ id?: number }>("/api/posts", { method: "POST", body: JSON.stringify(form) });
        return created?.id ? go.open(created.id) : go.list();
      }
      await staffApi(`/api/posts/${recordId}`, { method: "PATCH", body: JSON.stringify(form) });
      await reload();
      setEditing(false);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function patch(body: Partial<PostRow>) {
    if (!post) return;
    try {
      await staffApi(`/api/posts/${post.id}`, { method: "PATCH", body: JSON.stringify(body) });
      await reload();
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  async function remove() {
    if (!post || !window.confirm("Xóa bài này?")) return;
    try {
      await staffApi(`/api/posts/${post.id}`, { method: "DELETE" });
      go.list();
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  if (!isNew && !post) {
    return (
      <FormView crumbs={[{ label: "Bài đăng", to: BASE }, { label: "…" }]} editing={false} canEdit={false} error={error}>
        <div className="o-muted">{loading ? "Đang tải…" : fallback ? "Bài này đang ẩn hoặc không tồn tại. " + FALLBACK_NOTE : "Không tìm thấy bài đăng."}</div>
      </FormView>
    );
  }

  return (
    <FormView
      crumbs={[{ label: "Bài đăng", to: BASE }, { label: isNew ? "Mới" : post!.title }]}
      editing={editing}
      onEdit={() => setEditing(true)}
      onSave={() => void save()}
      onDiscard={() => {
        if (isNew) return go.list();
        reset(post!);
        setEditing(false);
        setErr(null);
      }}
      saving={saving}
      error={err}
      actions={
        post && !editing ? (
          <>
            <Button icon={Eye} onClick={() => setPreview(post)}>Xem trước</Button>
            <Button icon={post.pinned ? PinOff : Pin} onClick={() => void patch({ pinned: !post.pinned })}>{post.pinned ? "Bỏ ghim" : "Ghim"}</Button>
            <Button icon={post.isPublished ? EyeOff : Eye} onClick={() => void patch({ isPublished: !post.isPublished })}>{post.isPublished ? "Ẩn" : "Xuất bản"}</Button>
            <Button variant="danger" icon={Trash2} onClick={() => void remove()}>Xóa</Button>
          </>
        ) : undefined
      }
    >
      <div className="o-sheet-title">
        <div style={{ flex: 1 }}>
          <div className="o-field-label">Tiêu đề <span style={{ color: "var(--o-danger)" }}>*</span></div>
          {editing ? (
            <input className="o-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="VD: Khuyến mãi mùa hè 2026" autoFocus={isNew} />
          ) : (
            <h1>{form.title}</h1>
          )}
          {post && (
            <div className="o-sheet-sub o-row" style={{ gap: 6 }}>
              {post.pinned && <Badge tone="primary">Ghim</Badge>}
              {post.isPublished ? <Badge tone="success">Đã xuất bản</Badge> : <Badge>Ẩn</Badge>}
              <span>Tạo {fmtDateTime(post.createdAt)}</span>
            </div>
          )}
        </div>
      </div>
      {editing && (
        <div className="o-row" style={{ marginBottom: 10 }}>
          <label className="o-check"><input type="checkbox" checked={form.pinned} onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))} /> Ghim nổi bật</label>
          <label className="o-check"><input type="checkbox" checked={form.isPublished} onChange={(e) => setForm((f) => ({ ...f, isPublished: e.target.checked }))} /> Đã xuất bản</label>
        </div>
      )}
      <Field label="Nội dung" full>
        {editing ? (
          <PostEditor key={recordId} content={form.body} onChange={(html) => setForm((f) => ({ ...f, body: html }))} height="380px" theme="light" />
        ) : (
          <div className="o-panel o-panel-body" style={{ maxHeight: 480, overflow: "auto" }}><PostContent html={form.body} /></div>
        )}
      </Field>
      {preview && <PostViewModal post={preview} onClose={() => setPreview(null)} />}
    </FormView>
  );
}
