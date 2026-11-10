import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Download,
  FileText,
  FileUp,
  Layers,
  ListPlus,
  Loader2,
  MessageSquareText,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { staffApi, staffDownloadBlob } from "../../lib/staffApi";
import { acquireSocket } from "../../lib/sharedSocket";
import { Alert, Badge, Button, Dropdown, EmptyState, Field, Modal, PageHeader, errMsg, fmtDateTime } from "../../components/erp";
import {
  DOC_STATUS,
  SOURCE_LABEL,
  faqCsvTemplate,
  fmtCount,
  saveBlob,
  type FaqItem,
  type KbChunk,
  type KbDoc,
  type KbRow,
  type SearchOut,
} from "../../lib/knowledge";
import { GeminiNotice, KbFormModal, SourceChips, deleteKb } from "./KnowledgeBases";
import "../../styles/ai.css";

const ACCEPT = ".pdf,.docx,.txt,.md";
const MAX_FILE = 10 * 1024 * 1024;

/** Trí tuệ nhân tạo › Kho tri thức › (một kho) */
export function KnowledgeBaseDetail({ recordId }: { recordId?: string }) {
  const nav = useNavigate();
  const id = Number(recordId);
  const [kb, setKb] = useState<KbRow | null>(null);
  const [docs, setDocs] = useState<KbDoc[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editingKb, setEditingKb] = useState(false);
  const [textDoc, setTextDoc] = useState<KbDoc | "new" | null>(null);
  const [faqDoc, setFaqDoc] = useState<KbDoc | "new" | null>(null);
  const [chunksOf, setChunksOf] = useState<KbDoc | null>(null);

  const load = useCallback(async () => {
    try {
      const [k, d] = await Promise.all([staffApi<KbRow>(`/api/knowledge-bases/${id}`), staffApi<KbDoc[]>(`/api/knowledge-bases/${id}/documents`)]);
      setKb(k);
      setDocs(d);
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [id]);
  useEffect(() => void load(), [load]);

  // Trạng thái xử lý cập nhật trực tiếp; xong / lỗi thì tải lại để số liệu kho đúng
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const shared = acquireSocket();
    shared.join("admin_room");
    const onStatus = (p: { documentId: number; knowledgeBaseId: number; status: KbDoc["status"]; chunkCount: number; error: string | null }) => {
      if (p.knowledgeBaseId !== id) return;
      setDocs((x) => x.map((d) => (d.id === p.documentId ? { ...d, status: p.status, chunkCount: p.chunkCount, errorMessage: p.error } : d)));
      if (p.status === "READY" || p.status === "ERROR") void loadRef.current();
    };
    shared.socket.on("kb:doc_status", onStatus);
    return () => {
      shared.socket.off("kb:doc_status", onStatus);
      shared.release();
    };
  }, [id]);

  const upsertDoc = (d: KbDoc) => setDocs((x) => (x.some((y) => y.id === d.id) ? x.map((y) => (y.id === d.id ? d : y)) : [d, ...x]));

  async function act(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  const toggleDoc = (d: KbDoc) =>
    act(async () => {
      upsertDoc(await staffApi<KbDoc>(`/api/knowledge-documents/${d.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !d.enabled }) }));
      void load();
    });
  const reindex = (d: KbDoc) => act(async () => upsertDoc(await staffApi<KbDoc>(`/api/knowledge-documents/${d.id}/reindex`, { method: "POST" })));
  const removeDoc = (d: KbDoc) =>
    act(async () => {
      if (!confirm(`Xóa tài liệu "${d.title}"?`)) return;
      await staffApi(`/api/knowledge-documents/${d.id}`, { method: "DELETE" });
      setDocs((x) => x.filter((y) => y.id !== d.id));
      void load();
    });
  const download = (d: KbDoc) => act(async () => saveBlob(await staffDownloadBlob(`/api/knowledge-documents/${d.id}/file`), d.fileName ?? d.title));

  if (!kb) {
    return (
      <div className="kb-page">
        <PageHeader title="Kho tri thức" back={<BackLink />} />
        {err ? <Alert>{err}</Alert> : <div className="o-muted">Đang tải…</div>}
      </div>
    );
  }

  const embedded = docs.reduce((s, d) => s + (d.enabled && d.status === "READY" ? d.embeddedCount : 0), 0);
  const scope = kb.storeId == null ? "Dùng chung cả chuỗi" : `Riêng ${kb.storeName ?? "chi nhánh"}`;

  return (
    <div className="kb-page">
      <PageHeader
        back={<BackLink />}
        title={kb.name}
        description={[scope, kb.description].filter(Boolean).join(" · ")}
        actions={
          kb.canEdit && (
            <>
              <Button icon={Pencil} onClick={() => setEditingKb(true)}>Sửa thông tin</Button>
              <Button
                variant="danger"
                icon={Trash2}
                onClick={() =>
                  void act(async () => {
                    if (await deleteKb(kb)) nav("/app/ai/knowledge");
                  })
                }
              >
                Xóa kho
              </Button>
            </>
          )
        }
      />
      {kb.geminiReady === false && <GeminiNotice />}
      {err && <Alert>{err}</Alert>}
      {msg && <Alert tone="info">{msg}</Alert>}

      <div className="kb-stats">
        <div><span>Tài liệu</span><strong>{kb.docCount}</strong></div>
        <div><span>Tổng ký tự</span><strong>{fmtCount(kb.charCount)}</strong></div>
        <div><span>Tổng đoạn</span><strong>{fmtCount(kb.chunkCount)}</strong></div>
        <div>
          <span>Đoạn có vector</span>
          <strong className={kb.chunkCount && embedded < kb.chunkCount ? "is-warn" : undefined}>{fmtCount(embedded)}/{fmtCount(kb.chunkCount)}</strong>
        </div>
        <div><span>Loại nguồn</span><SourceChips types={kb.sourceTypes} /></div>
      </div>

      {kb.canEdit && (
        <section className="o-dcard kb-add">
          <Dropzone kbId={kb.id} onDone={(created, errors) => {
            created.forEach(upsertDoc);
            setMsg(created.length ? `Đã tải ${created.length} tệp — đang xử lý.` : null);
            setErr(errors.length ? errors.map((e) => `${e.fileName}: ${e.error}`).join(" · ") : null);
          }} />
          <div className="kb-add-actions">
            <Button icon={FileText} onClick={() => setTextDoc("new")}>Thêm văn bản</Button>
            <Button icon={ListPlus} onClick={() => setFaqDoc("new")}>Thêm Hỏi–Đáp</Button>
          </div>
        </section>
      )}

      <section className="o-dcard kb-docs">
        <h2 className="o-dcard-title">Tài liệu ({docs.length})</h2>
        {!docs.length ? (
          <EmptyState icon={FileUp} title="Kho chưa có tài liệu" hint="Kéo thả tệp PDF, Word, TXT, Markdown vào ô phía trên, hoặc thêm văn bản / bảng Hỏi–Đáp." />
        ) : (
          <div className="kb-table-wrap">
            <table className="o-list kb-table">
              <thead>
                <tr>
                  <th>Tên</th>
                  <th>Loại</th>
                  <th className="num">Ký tự</th>
                  <th className="num">Đoạn</th>
                  <th>Trạng thái</th>
                  <th>Bật</th>
                  <th>Cập nhật</th>
                  <th aria-label="Thao tác" />
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => {
                  const st = DOC_STATUS[d.status];
                  // Chưa có khóa Gemini thì mọi đoạn đều chưa có vector — cảnh báo chung ở đầu trang đã nói
                  const partial = kb.geminiReady !== false && d.status === "READY" && d.embeddedCount < d.chunkCount;
                  return (
                    <tr key={d.id} className={d.enabled ? undefined : "kb-off"}>
                      <td className="wrap">
                        <button type="button" className="kb-doc-title" onClick={() => setChunksOf(d)}>{d.title}</button>
                        {d.fileName && d.fileName !== d.title && <div className="kb-desc">{d.fileName}</div>}
                        {d.status === "ERROR" && d.errorMessage && <div className="kb-doc-err">{d.errorMessage}</div>}
                      </td>
                      <td><span className={`kb-src is-${d.fileType.toLowerCase()}`}>{SOURCE_LABEL[d.fileType] ?? d.fileType}</span></td>
                      <td className="num">{fmtCount(d.charCount)}</td>
                      <td className="num">
                        {fmtCount(d.chunkCount)}
                        {partial && <div className="kb-desc" title="Chưa tạo vector cho mọi đoạn — chỉ tìm được theo từ khóa">{d.embeddedCount} có vector</div>}
                      </td>
                      <td>
                        <Badge tone={st.tone}>
                          {d.status === "PROCESSING" && <Loader2 size={12} className="kb-spin" aria-hidden />} {st.label}
                        </Badge>
                      </td>
                      <td>
                        <label className="kb-switch" title={d.enabled ? "Đang dùng — bấm để tắt" : "Đang tắt — bấm để bật"}>
                          <input type="checkbox" checked={d.enabled} disabled={!kb.canEdit} onChange={() => void toggleDoc(d)} aria-label={`Bật / tắt ${d.title}`} />
                        </label>
                      </td>
                      <td className="o-muted">{fmtDateTime(d.updatedAt)}</td>
                      <td>
                        <Dropdown align="right" button={({ toggle }) => <Button variant="link" size="sm" icon={MoreVertical} aria-label={`Thao tác với ${d.title}`} onClick={toggle} />}>
                          {(close) => (
                            <>
                              <button type="button" className="o-dropdown-item" onClick={() => { close(); setChunksOf(d); }}>
                                <Layers size={14} aria-hidden /> Xem các đoạn
                              </button>
                              {kb.canEdit && d.sourceType !== "FILE" && (
                                <button type="button" className="o-dropdown-item" onClick={() => { close(); (d.sourceType === "FAQ" ? setFaqDoc : setTextDoc)(d); }}>
                                  <Pencil size={14} aria-hidden /> Sửa nội dung
                                </button>
                              )}
                              {d.sourceType === "FILE" && (
                                <button type="button" className="o-dropdown-item" onClick={() => { close(); void download(d); }}>
                                  <Download size={14} aria-hidden /> Tải tệp gốc
                                </button>
                              )}
                              {kb.canEdit && (
                                <>
                                  <button type="button" className="o-dropdown-item" onClick={() => { close(); void reindex(d); }}>
                                    <RefreshCw size={14} aria-hidden /> Xử lý lại
                                  </button>
                                  <button type="button" className="o-dropdown-item is-danger" onClick={() => { close(); void removeDoc(d); }}>
                                    <Trash2 size={14} aria-hidden /> Xóa
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </Dropdown>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <SearchTest kbId={kb.id} />

      {editingKb && (
        <KbFormModal
          kb={kb}
          onClose={() => setEditingKb(false)}
          onSaved={(k) => {
            setEditingKb(false);
            setKb((old) => ({ ...k, geminiReady: old?.geminiReady }));
          }}
        />
      )}
      {textDoc && <TextDocModal kbId={kb.id} doc={textDoc === "new" ? null : textDoc} onClose={() => setTextDoc(null)} onSaved={(d) => { setTextDoc(null); upsertDoc(d); }} />}
      {faqDoc && <FaqDocModal kbId={kb.id} doc={faqDoc === "new" ? null : faqDoc} onClose={() => setFaqDoc(null)} onSaved={(d) => { setFaqDoc(null); upsertDoc(d); }} />}
      {chunksOf && <ChunkDrawer doc={chunksOf} onClose={() => setChunksOf(null)} />}
    </div>
  );
}

const BackLink = () => (
  <Link to="/app/ai/knowledge" className="o-ph-back"><ChevronLeft size={16} aria-hidden /> Kho tri thức</Link>
);

/* ═══════════ Kéo thả tải tệp ═══════════ */
function Dropzone({ kbId, onDone }: { kbId: number; onDone: (created: KbDoc[], errors: { fileName: string; error: string }[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send(list: FileList | File[]) {
    const files = [...list];
    if (!files.length) return;
    const tooBig = files.filter((f) => f.size > MAX_FILE).map((f) => ({ fileName: f.name, error: "Tệp quá lớn (tối đa 10 MB)." }));
    const ok = files.filter((f) => f.size <= MAX_FILE);
    if (!ok.length) return onDone([], tooBig);
    const form = new FormData();
    ok.forEach((f) => form.append("files", f));
    setBusy(true);
    try {
      const r = await staffApi<{ created: KbDoc[]; errors: { fileName: string; error: string }[] }>(`/api/knowledge-bases/${kbId}/documents/upload`, { method: "POST", body: form });
      onDone(r.created, [...tooBig, ...r.errors]);
    } catch (e) {
      onDone([], [...tooBig, { fileName: ok.length === 1 ? ok[0].name : `${ok.length} tệp`, error: errMsg(e) }]);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void send(e.dataTransfer.files);
  };

  return (
    <div
      className={over ? "kb-drop is-over" : "kb-drop"}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      onClick={() => !busy && input.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      aria-label="Tải tài liệu lên"
    >
      <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => e.target.files && void send(e.target.files)} />
      {busy ? <Loader2 size={28} className="kb-spin" aria-hidden /> : <Upload size={28} aria-hidden />}
      <strong>{busy ? "Đang tải lên…" : "Kéo thả tệp vào đây hoặc bấm để chọn"}</strong>
      <span className="o-muted">PDF, Word (.docx), TXT, Markdown · tối đa 10 MB mỗi tệp · chọn được nhiều tệp</span>
    </div>
  );
}

/* ═══════════ Văn bản nhập tay ═══════════ */
function TextDocModal({ kbId, doc, onClose, onSaved }: { kbId: number; doc: KbDoc | null; onClose: () => void; onSaved: (d: KbDoc) => void }) {
  const [title, setTitle] = useState(doc?.title ?? "");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(!!doc);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!doc) return;
    staffApi<{ text: string | null }>(`/api/knowledge-documents/${doc.id}`)
      .then((r) => setText(r.text ?? ""))
      .catch((e) => setErr(errMsg(e)))
      .finally(() => setLoading(false));
  }, [doc]);

  async function save() {
    if (!title.trim()) return setErr("Nhập tiêu đề.");
    if (!text.trim()) return setErr("Nhập nội dung.");
    setBusy(true);
    try {
      const body = JSON.stringify({ title, text });
      onSaved(
        doc
          ? await staffApi<KbDoc>(`/api/knowledge-documents/${doc.id}`, { method: "PATCH", body })
          : await staffApi<KbDoc>(`/api/knowledge-bases/${kbId}/documents/text`, { method: "POST", body }),
      );
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={doc ? "Sửa văn bản" : "Thêm văn bản"}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={() => void save()} disabled={busy || loading}>{doc ? "Lưu & xử lý lại" : "Thêm"}</Button>
          <Button onClick={onClose}>Hủy</Button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      <div className="kb-form">
        <Field label="Tiêu đề" required full>
          <input className="o-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="VD: Chính sách đặt bàn" autoFocus={!doc} />
        </Field>
        <Field label="Nội dung" required full>
          <textarea
            className="o-input kb-textarea"
            rows={16}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={loading}
            placeholder={"Dán nội dung tài liệu. Dùng tiêu đề kiểu Markdown để AI tìm chính xác hơn, ví dụ:\n\n## Đặt bàn\nNhóm từ 10 người đặt trước 1 ngày…"}
          />
          <small className="o-muted">{fmtCount(text.length)} ký tự · tiêu đề (#, ##) giúp chia đoạn theo mục</small>
        </Field>
      </div>
    </Modal>
  );
}

/* ═══════════ Bảng Hỏi–Đáp ═══════════ */
function FaqDocModal({ kbId, doc, onClose, onSaved }: { kbId: number; doc: KbDoc | null; onClose: () => void; onSaved: (d: KbDoc) => void }) {
  const [title, setTitle] = useState(doc?.title ?? "Câu hỏi thường gặp");
  const [items, setItems] = useState<FaqItem[]>([{ q: "", a: "" }]);
  const [loading, setLoading] = useState(!!doc);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const csv = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!doc) return;
    staffApi<{ items: FaqItem[] | null }>(`/api/knowledge-documents/${doc.id}`)
      .then((r) => setItems(r.items?.length ? r.items : [{ q: "", a: "" }]))
      .catch((e) => setErr(errMsg(e)))
      .finally(() => setLoading(false));
  }, [doc]);

  const set = (i: number, k: keyof FaqItem, v: string) => setItems((x) => x.map((it, j) => (j === i ? { ...it, [k]: v } : it)));

  async function save() {
    if (!title.trim()) return setErr("Nhập tiêu đề.");
    const rows = items.filter((it) => it.q.trim() || it.a.trim());
    setBusy(true);
    try {
      const body = JSON.stringify({ title, items: rows });
      onSaved(
        doc
          ? await staffApi<KbDoc>(`/api/knowledge-documents/${doc.id}`, { method: "PATCH", body })
          : await staffApi<KbDoc>(`/api/knowledge-bases/${kbId}/documents/faq`, { method: "POST", body }),
      );
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function importCsv(f: File | undefined) {
    if (!f) return;
    const form = new FormData();
    form.append("file", f);
    form.append("title", title.trim());
    setBusy(true);
    try {
      onSaved(await staffApi<KbDoc>(`/api/knowledge-bases/${kbId}/documents/faq/import`, { method: "POST", body: form }));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
      if (csv.current) csv.current.value = "";
    }
  }

  return (
    <Modal
      title={doc ? "Sửa bảng Hỏi–Đáp" : "Thêm Hỏi–Đáp"}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={() => void save()} disabled={busy || loading}>{doc ? "Lưu & xử lý lại" : "Thêm"}</Button>
          <Button onClick={onClose}>Hủy</Button>
          {!doc && (
            <span className="kb-faq-csv">
              <input ref={csv} type="file" accept=".csv,text/csv" hidden onChange={(e) => void importCsv(e.target.files?.[0])} />
              <Button variant="link" icon={FileUp} onClick={() => csv.current?.click()} disabled={busy}>Nhập từ CSV</Button>
              <Button variant="link" icon={Download} onClick={() => saveBlob(faqCsvTemplate(), "hoi-dap-mau.csv")}>Tải CSV mẫu</Button>
            </span>
          )}
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      <Field label="Tiêu đề" required full>
        <input className="o-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </Field>
      <p className="o-muted kb-faq-hint">Mỗi cặp Hỏi–Đáp là một đoạn riêng. Viết câu hỏi theo cách khách hay hỏi để AI tìm đúng.</p>
      {loading ? (
        <div className="o-muted">Đang tải…</div>
      ) : (
        <ol className="kb-faq">
          {items.map((it, i) => (
            <li key={i}>
              <span className="kb-faq-n">{i + 1}</span>
              <div className="kb-faq-fields">
                <input className="o-input" value={it.q} onChange={(e) => set(i, "q", e.target.value)} placeholder="Câu hỏi" maxLength={500} aria-label={`Câu hỏi ${i + 1}`} />
                <textarea className="o-input" rows={2} value={it.a} onChange={(e) => set(i, "a", e.target.value)} placeholder="Câu trả lời" maxLength={5000} aria-label={`Câu trả lời ${i + 1}`} />
              </div>
              <Button variant="link" size="sm" icon={X} aria-label={`Xóa dòng ${i + 1}`} onClick={() => setItems((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : [{ q: "", a: "" }]))} />
            </li>
          ))}
        </ol>
      )}
      <Button icon={Plus} size="sm" onClick={() => setItems((x) => [...x, { q: "", a: "" }])} disabled={loading}>Thêm dòng</Button>
    </Modal>
  );
}

/* ═══════════ Ngăn kéo: các đoạn đã cắt ═══════════ */
function ChunkDrawer({ doc, onClose }: { doc: KbDoc; onClose: () => void }) {
  const [chunks, setChunks] = useState<KbChunk[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    staffApi<KbChunk[]>(`/api/knowledge-documents/${doc.id}/chunks`).then(setChunks).catch((e) => setErr(errMsg(e)));
  }, [doc.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="kb-drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <aside className="kb-drawer" role="dialog" aria-modal="true" aria-label={`Các đoạn của ${doc.title}`}>
        <header className="kb-drawer-head">
          <div>
            <h2>{doc.title}</h2>
            <span className="o-muted">{chunks ? `${chunks.length} đoạn` : "Đang tải…"} · {fmtCount(doc.charCount)} ký tự</span>
          </div>
          <Button variant="link" icon={X} onClick={onClose} aria-label="Đóng" />
        </header>
        <div className="kb-drawer-body">
          {err && <Alert>{err}</Alert>}
          {chunks && !chunks.length && <p className="o-muted">{doc.status === "ERROR" ? doc.errorMessage : "Chưa có đoạn nào — tài liệu đang chờ xử lý."}</p>}
          {chunks?.map((c) => (
            <article key={c.id} className="kb-chunk">
              <header>
                <span className="kb-chunk-n">#{c.ordinal + 1}</span>
                {c.heading && <strong>{c.heading}</strong>}
                <span className="o-muted">{fmtCount(c.charCount)} ký tự{c.embedded ? "" : " · chưa có vector"}</span>
              </header>
              <p>{c.content}</p>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}

/* ═══════════ Thử tìm kiếm (minh hoạ RAG) ═══════════ */
function SearchTest({ kbId }: { kbId: number }) {
  const [q, setQ] = useState("");
  const [k, setK] = useState(5);
  const [out, setOut] = useState<SearchOut | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!q.trim()) return;
    setBusy(true);
    try {
      setOut(await staffApi<SearchOut>("/api/knowledge-bases/search-test", { method: "POST", body: JSON.stringify({ kbIds: [kbId], query: q, k }) }));
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const maxKw = Math.max(0, ...(out?.results.map((r) => r.keywordScore ?? 0) ?? []));
  return (
    <section className="o-dcard kb-test">
      <h2 className="o-dcard-title"><Search size={18} aria-hidden /> Thử tìm kiếm</h2>
      <p className="o-muted kb-test-sub">Gõ câu hỏi như khách hỏi để xem AI sẽ lấy những đoạn nào: tìm theo nghĩa (vector) và theo từ khóa, rồi gộp thứ hạng (RRF).</p>
      <form
        className="kb-test-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <input className="o-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="VD: phi ship bao nhieu, đơn đã trả tiền có hủy được không" aria-label="Câu hỏi thử" />
        <select className="o-input" value={k} onChange={(e) => setK(Number(e.target.value))} aria-label="Số đoạn">
          {[3, 5, 8, 10].map((n) => (
            <option key={n} value={n}>{n} đoạn</option>
          ))}
        </select>
        <Button variant="primary" type="submit" icon={busy ? Loader2 : Search} disabled={busy || !q.trim()}>Tìm</Button>
      </form>
      {err && <Alert>{err}</Alert>}
      {out && (
        <>
          <div className="kb-test-meta">
            <span>{out.ms} ms</span>
            <span>{out.mode === "hybrid" ? "Tìm lai: vector + từ khóa" : "Chỉ tìm theo từ khóa"}</span>
            {out.bestVectorScore != null && <span>Độ tương đồng cao nhất: {out.bestVectorScore.toFixed(3)}</span>}
            {out.vectorError && <span className="is-warn">{out.vectorError}</span>}
          </div>
          {!out.results.length ? (
            <EmptyState icon={MessageSquareText} title="Không tìm thấy đoạn nào liên quan" hint="AI sẽ trả lời bằng câu mặc định khi không tìm thấy tài liệu, hoặc chuyển nhân viên." />
          ) : (
            <ol className="kb-results">
              {out.results.map((r, i) => (
                <li key={r.chunkId}>
                  <header>
                    <span className="kb-chunk-n">{i + 1}</span>
                    <strong>{r.title}</strong>
                    {r.heading && <span className="o-muted">› {r.heading}</span>}
                  </header>
                  <div className="kb-scores">
                    <ScoreBar label="Vector" value={r.vectorScore} max={1} text={r.vectorScore?.toFixed(3)} />
                    <ScoreBar label="Từ khóa" value={r.keywordScore} max={maxKw || 1} text={r.keywordScore?.toFixed(2)} />
                    <span className="kb-rrf">RRF {r.rrfScore.toFixed(4)}</span>
                  </div>
                  <p>{r.content}</p>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

function ScoreBar({ label, value, max, text }: { label: string; value: number | null; max: number; text?: string }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <span className="kb-score">
      <span className="kb-score-label">{label}</span>
      <span className="kb-score-track" aria-hidden><span style={{ width: `${pct}%` }} /></span>
      <span className="kb-score-val">{value == null ? "—" : text}</span>
    </span>
  );
}
