import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, LayoutGrid, List, MoreVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
import { Alert, Badge, Button, Dropdown, EmptyState, Field, Modal, PageHeader, errMsg, fmtDateTime } from "../../components/erp";
import { KB_HEALTH_LABEL, SOURCE_LABEL, fmtCount, kbHealth, type KbRow } from "../../lib/knowledge";
import "../../styles/ai.css";

const VIEW_KEY = "td.kb.view";
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

/** Cảnh báo thiếu khóa Gemini (dùng ở danh sách và chi tiết kho) */
export function GeminiNotice() {
  return (
    <Alert tone="warning">
      Chưa cấu hình <code>GEMINI_API_KEY</code>: tài liệu vẫn được cắt đoạn và tìm theo từ khóa, nhưng chưa có tìm kiếm theo nghĩa (vector).
      Thêm khóa vào <code>backend-node/.env</code> rồi khởi động lại backend: tài liệu sẽ tự được tạo embedding.
    </Alert>
  );
}

export function SourceChips({ types }: { types: string[] }) {
  if (!types.length) return <span className="o-muted">—</span>;
  return (
    <span className="kb-sources">
      {types.map((t) => (
        <span key={t} className={`kb-src is-${t.toLowerCase()}`}>{SOURCE_LABEL[t] ?? t}</span>
      ))}
    </span>
  );
}

const scopeLabel = (kb: KbRow) => (kb.storeId == null ? "Cả chuỗi" : kb.storeName ?? `Chi nhánh #${kb.storeId}`);

/** Thêm / sửa thông tin kho */
export function KbFormModal({ kb, onClose, onSaved }: { kb: KbRow | null; onClose: () => void; onSaved: (kb: KbRow) => void }) {
  const owner = isOwnerRole(getStaffInfo()?.role);
  const [name, setName] = useState(kb?.name ?? "");
  const [description, setDescription] = useState(kb?.description ?? "");
  const [storeId, setStoreId] = useState<string>(kb?.storeId != null ? String(kb.storeId) : "");
  const [stores, setStores] = useState<{ id: number; name: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (owner) staffApi<{ id: number; name: string }[]>("/api/admin/stores").then(setStores).catch(() => setStores([]));
  }, [owner]);

  async function save() {
    if (!name.trim()) return setErr("Nhập tên kho tri thức.");
    setBusy(true);
    try {
      const body = JSON.stringify({ name, description, ...(owner ? { storeId: storeId ? Number(storeId) : null } : {}) });
      onSaved(kb ? await staffApi<KbRow>(`/api/knowledge-bases/${kb.id}`, { method: "PATCH", body }) : await staffApi<KbRow>("/api/knowledge-bases", { method: "POST", body }));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={kb ? "Sửa kho tri thức" : "Thêm kho tri thức"}
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>{kb ? "Lưu" : "Tạo kho"}</Button>
          <Button onClick={onClose}>Hủy</Button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      <div className="kb-form">
        <Field label="Tên kho" required full>
          <input className="o-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} placeholder="VD: Chính sách & FAQ" autoFocus />
        </Field>
        <Field label="Mô tả" full>
          <textarea className="o-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} placeholder="Kho này chứa gì, AI dùng để trả lời câu hỏi nào" />
        </Field>
        <Field label="Phạm vi" full>
          {owner ? (
            <select className="o-input" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">Cả chuỗi (mọi chi nhánh)</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>Chỉ {s.name}</option>
              ))}
            </select>
          ) : (
            <span className="o-muted">{kb ? scopeLabel(kb) : getStaffInfo()?.storeName ?? "Chi nhánh của bạn"} — kho riêng của chi nhánh</span>
          )}
        </Field>
      </div>
    </Modal>
  );
}

export async function deleteKb(kb: KbRow): Promise<boolean> {
  if (!confirm(`Xóa kho "${kb.name}" và toàn bộ ${kb.docCount} tài liệu trong kho? Không hoàn tác được.`)) return false;
  await staffApi(`/api/knowledge-bases/${kb.id}`, { method: "DELETE" });
  return true;
}

/** Trí tuệ nhân tạo › Kho tri thức */
export function KnowledgeBaseList() {
  const nav = useNavigate();
  const [rows, setRows] = useState<KbRow[]>([]);
  const [geminiReady, setGeminiReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"list" | "grid">(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "list";
    } catch {
      return "list";
    }
  });
  const [editing, setEditing] = useState<KbRow | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await staffApi<{ items: KbRow[]; geminiReady: boolean }>("/api/knowledge-bases");
      setRows(r.items);
      setGeminiReady(r.geminiReady);
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const switchView = (v: "list" | "grid") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* chỉ mất phần ghi nhớ */
    }
  };

  const shown = useMemo(() => {
    const nq = fold(q.trim());
    return nq ? rows.filter((r) => fold(`${r.name} ${r.description ?? ""}`).includes(nq)) : rows;
  }, [rows, q]);

  const open = (kb: KbRow) => nav(`/app/ai/knowledge/${kb.id}`);
  async function remove(kb: KbRow) {
    try {
      if (await deleteKb(kb)) setRows((x) => x.filter((y) => y.id !== kb.id));
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  const menu = (kb: KbRow) =>
    kb.canEdit && (
      <Dropdown
        align="right"
        button={({ toggle }) => (
          <Button
            variant="link"
            size="sm"
            icon={MoreVertical}
            aria-label={`Thao tác với ${kb.name}`}
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
          />
        )}
      >
        {(close) => (
          <div onClick={(e) => e.stopPropagation()}>
            <button type="button" className="o-dropdown-item" onClick={() => { close(); setEditing(kb); }}>
              <Pencil size={14} aria-hidden /> Sửa
            </button>
            <button type="button" className="o-dropdown-item is-danger" onClick={() => { close(); void remove(kb); }}>
              <Trash2 size={14} aria-hidden /> Xóa
            </button>
          </div>
        )}
      </Dropdown>
    );

  const dot = (kb: KbRow) => {
    const h = kbHealth(kb);
    return <span className={`kb-dot is-${h}`} title={KB_HEALTH_LABEL[h]} aria-label={KB_HEALTH_LABEL[h]} />;
  };

  return (
    <div className="kb-page">
      <PageHeader
        title="Kho tri thức"
        description="Lưu trữ và cập nhật tài liệu để AI tra cứu khi tư vấn"
        actions={<Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>Thêm mới</Button>}
      />
      {!geminiReady && <GeminiNotice />}
      {err && <Alert>{err}</Alert>}

      <div className="kb-toolbar">
        <label className="kb-search">
          <Search size={16} aria-hidden />
          <input className="o-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên kho" aria-label="Tìm theo tên kho" />
        </label>
        <div className="o-view-switch" role="group" aria-label="Kiểu xem">
          <button type="button" className={view === "list" ? "active" : ""} onClick={() => switchView("list")} aria-label="Danh sách" aria-pressed={view === "list"}>
            <List size={16} />
          </button>
          <button type="button" className={view === "grid" ? "active" : ""} onClick={() => switchView("grid")} aria-label="Lưới" aria-pressed={view === "grid"}>
            <LayoutGrid size={16} />
          </button>
        </div>
      </div>

      {loading && !rows.length ? (
        <div className="o-muted">Đang tải…</div>
      ) : !rows.length ? (
        <EmptyState
          icon={BookOpen}
          title="Chưa có kho tri thức nào"
          hint="Tạo kho rồi tải tài liệu của quán lên: giới thiệu thương hiệu, chính sách giao hàng, đổi trả, câu hỏi thường gặp…"
          action={<Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>Thêm mới</Button>}
        />
      ) : !shown.length ? (
        <EmptyState icon={Search} title="Không có kho nào khớp tìm kiếm" />
      ) : view === "list" ? (
        <div className="o-dcard kb-table-wrap">
          <table className="o-list kb-table">
            <thead>
              <tr>
                <th aria-label="Trạng thái" />
                <th>Tên</th>
                <th>Phạm vi</th>
                <th className="num">Agent đang dùng</th>
                <th className="num">Tổng ký tự</th>
                <th className="num">Tổng đoạn</th>
                <th>Loại nguồn</th>
                <th aria-label="Thao tác" />
              </tr>
            </thead>
            <tbody>
              {shown.map((kb) => (
                <tr key={kb.id} className="clickable" onClick={() => open(kb)}>
                  <td>{dot(kb)}</td>
                  <td className="wrap">
                    <strong>{kb.name}</strong>
                    {!kb.enabled && <> <Badge>Đang tắt</Badge></>}
                    {kb.description && <div className="kb-desc">{kb.description}</div>}
                  </td>
                  <td>{scopeLabel(kb)}</td>
                  <td className="num">{kb.agentCount}</td>
                  <td className="num">{fmtCount(kb.charCount)}</td>
                  <td className="num">{fmtCount(kb.chunkCount)}</td>
                  <td><SourceChips types={kb.sourceTypes} /></td>
                  <td>{menu(kb)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="kb-grid">
          {shown.map((kb) => (
            <article key={kb.id} className="o-dcard kb-card" onClick={() => open(kb)} role="link" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && open(kb)}>
              <header className="kb-card-head">
                {dot(kb)}
                <h3>{kb.name}</h3>
                {menu(kb)}
              </header>
              <p className="kb-desc">{kb.description || <span className="o-muted">Chưa có mô tả</span>}</p>
              <dl className="kb-card-stats">
                <div><dt>Tài liệu</dt><dd>{kb.docCount}</dd></div>
                <div><dt>Ký tự</dt><dd>{fmtCount(kb.charCount)}</dd></div>
                <div><dt>Đoạn</dt><dd>{fmtCount(kb.chunkCount)}</dd></div>
              </dl>
              <footer className="kb-card-foot">
                <SourceChips types={kb.sourceTypes} />
                <span className="o-muted">{scopeLabel(kb)} · {fmtDateTime(kb.updatedAt)}</span>
              </footer>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <KbFormModal
          kb={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(kb) => {
            const isNew = editing === "new";
            setEditing(null);
            if (isNew) open(kb);
            else setRows((x) => x.map((y) => (y.id === kb.id ? kb : y)));
          }}
        />
      )}
    </div>
  );
}
