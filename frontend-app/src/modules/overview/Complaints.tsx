import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { MessageSquareWarning } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { getStaffInfo, staffApi, staffSocket } from "../../lib/staffApi";
import { Alert, Badge, Button, ControlPanel, EmptyState, Field, Modal, errMsg, fmtDateTime, type Tone } from "../../components/erp";
import {
  applyReaction, EmojiPicker, ImageAttachButton, MessageImage, MessageReactions, PendingImage,
  type ChatMessage, type ChatReaction,
} from "../../components/chat/ChatParts";
import "../../styles/complaints.css";

type Row = {
  id: number; storeId: number; store: { name: string }; guestName: string; tableName: string | null;
  category: string | null; complaintStatus: "NEW" | "IN_PROGRESS" | "RESOLVED"; resolutionNote: string | null;
  createdAt: string; lastAt: string; firstMessage: string; firstImage: string | null; images: number; awaitingReply: boolean;
};

export const COMPLAINT_CATEGORY: Record<string, string> = {
  HYGIENE: "Vệ sinh", SERVICE: "Thái độ phục vụ", FOOD: "Chất lượng món", WAIT: "Chờ lâu",
  DELIVERY: "Giao hàng", BILLING: "Thanh toán", OTHER: "Khác",
};
const STATUS: Record<Row["complaintStatus"], { label: string; tone: Tone }> = {
  NEW: { label: "Mới", tone: "danger" },
  IN_PROGRESS: { label: "Đang xử lý", tone: "warning" },
  RESOLVED: { label: "Đã xử lý", tone: "success" },
};
const FILTERS = [
  { id: "open", label: "Cần xử lý", test: (r: Row) => r.complaintStatus !== "RESOLVED" },
  { id: "NEW", label: "Mới", test: (r: Row) => r.complaintStatus === "NEW" },
  { id: "RESOLVED", label: "Đã xử lý", test: (r: Row) => r.complaintStatus === "RESOLVED" },
  { id: "all", label: "Tất cả", test: () => true },
];

/** Tổng quan › Khiếu nại — khách gửi từ chatbot (kèm ảnh), quản lý chi nhánh nhận & xử lý */
export function Complaints() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("open");
  const selected = Number(params.get("id")) || null;
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const me = getStaffInfo();
  const myKey = `staff:${me?.id ?? 0}`;

  const load = useCallback(async () => {
    try {
      setRows(await staffApi<Row[]>("/api/staff/complaints"));
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, []);
  const loadThread = useCallback(async (id: number) => {
    try {
      const s = await staffApi<{ messages: ChatMessage[] }>(`/api/staff/chat/sessions/${id}`);
      setThread(s.messages);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (selected) void loadThread(selected); else setThread([]); }, [selected, loadThread]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [thread]);

  // Khiếu nại mới / tin mới / cảm xúc / đổi trạng thái — realtime qua phòng quản lý
  useEffect(() => {
    const sock = staffSocket();
    sock.emit("join", "admin_room");
    const onNew = () => void load();
    const onReply = (d: { sessionId: number; message: ChatMessage }) => {
      if (d.sessionId === selected) setThread((p) => (p.some((m) => m.id === d.message.id) ? p : [...p, d.message]));
      void load();
    };
    const onReaction = (d: { sessionId: number; messageId: number; reactions: ChatReaction[] }) => {
      if (d.sessionId === selected) setThread((p) => applyReaction(p, d.messageId, d.reactions));
    };
    sock.on("complaint:new", onNew);
    sock.on("complaint:update", onNew);
    sock.on("chat:reply", onReply);
    sock.on("chat:reaction", onReaction);
    return () => {
      sock.off("complaint:new", onNew);
      sock.off("complaint:update", onNew);
      sock.off("chat:reply", onReply);
      sock.off("chat:reaction", onReaction);
      sock.disconnect();
    };
  }, [selected, load]);

  const open = (id: number | null) => setParams(id ? { id: String(id) } : {}, { replace: true });
  const row = rows.find((r) => r.id === selected) ?? null;
  const shown = rows.filter(FILTERS.find((f) => f.id === filter)!.test);
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, rows.filter(f.test).length]));

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!selected || (!text.trim() && !image) || sending) return;
    setSending(true);
    try {
      const msg = await staffApi<ChatMessage>(`/api/staff/chat/sessions/${selected}/reply`, { method: "POST", body: JSON.stringify({ body: text.trim(), image }) });
      setThread((p) => (p.some((m) => m.id === msg.id) ? p : [...p, msg]));
      setText("");
      setImage(null);
      void load();
    } catch (e2) {
      alert(errMsg(e2));
    } finally {
      setSending(false);
    }
  }
  async function react(messageId: number, emoji: string) {
    try {
      await staffApi(`/api/staff/chat/messages/${messageId}/react`, { method: "POST", body: JSON.stringify({ emoji }) });
    } catch (e) {
      alert(errMsg(e));
    }
  }
  async function setStatus(status: "IN_PROGRESS" | "RESOLVED", note?: string) {
    if (!selected) return;
    await staffApi(`/api/staff/complaints/${selected}`, { method: "PATCH", body: JSON.stringify({ status, note }) });
    await load();
    await loadThread(selected);
  }

  return (
    <div>
      <ControlPanel crumbs={[{ label: "Khiếu nại của khách" }]} />
      <div className="o-content">
        {err && <Alert>{err}</Alert>}
        <div className="cp-layout">
          <aside className="o-card cp-list">
            <div className="cp-filters" role="tablist">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={filter === f.id ? "active" : ""} onClick={() => setFilter(f.id)}>
                  {f.label}{counts[f.id] > 0 && <em>{counts[f.id]}</em>}
                </button>
              ))}
            </div>
            {shown.length === 0 && <div className="o-muted" style={{ padding: 16 }}>Không có khiếu nại.</div>}
            {shown.map((r) => (
              <button key={r.id} type="button" className={`cp-item${r.id === selected ? " active" : ""}`} onClick={() => open(r.id)}>
                {r.firstImage ? <img src={mediaUrl(r.firstImage)} alt="" className="cp-thumb" /> : <span className="cp-thumb cp-thumb-empty"><MessageSquareWarning size={18} /></span>}
                <span className="cp-item-main">
                  <span className="cp-item-top">
                    <strong>#{r.id} · {COMPLAINT_CATEGORY[r.category ?? "OTHER"]}</strong>
                    <Badge tone={STATUS[r.complaintStatus].tone}>{STATUS[r.complaintStatus].label}</Badge>
                  </span>
                  <span className="cp-preview">{r.firstMessage || "📷 Ảnh"}</span>
                  <span className="o-muted cp-meta">
                    {r.awaitingReply && r.complaintStatus !== "RESOLVED" && <span className="cp-dot" title="Khách đang chờ phản hồi" />}
                    {r.guestName}{r.tableName ? ` · ${r.tableName}` : ""} · {r.store.name} · {fmtDateTime(r.lastAt)}
                  </span>
                </span>
              </button>
            ))}
          </aside>

          <section className="o-card cp-detail">
            {!row ? (
              <EmptyState icon={MessageSquareWarning} title="Chọn một khiếu nại" hint="Khách gửi khiếu nại kèm ảnh từ chatbot trên web / QR bàn — quản lý nhận thông báo ngay." />
            ) : (
              <>
                <div className="cp-head">
                  <div>
                    <strong>#{row.id} · {COMPLAINT_CATEGORY[row.category ?? "OTHER"]}</strong>{" "}
                    <Badge tone={STATUS[row.complaintStatus].tone}>{STATUS[row.complaintStatus].label}</Badge>
                    <div className="o-muted">{row.guestName}{row.tableName ? ` · ${row.tableName}` : ""} · {row.store.name} · gửi {fmtDateTime(row.createdAt)}</div>
                  </div>
                  {row.complaintStatus !== "RESOLVED" && (
                    <span className="o-inline">
                      {row.complaintStatus === "NEW" && <Button size="sm" onClick={() => void setStatus("IN_PROGRESS").catch((e) => alert(errMsg(e)))}>Nhận xử lý</Button>}
                      <Button size="sm" variant="primary" onClick={() => setResolving(true)}>Đã xử lý</Button>
                    </span>
                  )}
                </div>
                {row.resolutionNote && <Alert tone="info">Cách xử lý: {row.resolutionNote}</Alert>}
                <div className="cp-thread">
                  {thread.map((m) => (
                    <div key={m.id} className={`cp-msg cp-msg-${m.sender}${m.sender === "staff" ? " mine" : ""}`}>
                      <div className="cp-msg-name">{m.senderName}</div>
                      {m.body && <div className="cp-bubble">{m.body}</div>}
                      <MessageImage url={m.imageUrl} />
                      {m.sender !== "bot" && <MessageReactions reactions={m.reactions} mine={myKey} onReact={(e) => void react(m.id, e)} align={m.sender === "customer" ? "start" : "end"} />}
                      <div className="cp-time">{fmtDateTime(m.createdAt)}</div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
                {row.complaintStatus !== "RESOLVED" && (
                  <>
                    <PendingImage src={image} onRemove={() => setImage(null)} />
                    <form className="cp-reply" onSubmit={(e) => void send(e)}>
                      <ImageAttachButton onPick={setImage} disabled={sending} />
                      <EmojiPicker onPick={(e) => setText((t) => t + e)} disabled={sending} />
                      <input className="o-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Phản hồi ${row.guestName}…`} disabled={sending} />
                      <Button type="submit" variant="primary" disabled={sending || (!text.trim() && !image)}>Gửi</Button>
                    </form>
                  </>
                )}
              </>
            )}
          </section>
        </div>
      </div>
      {resolving && row && <ResolveDialog onClose={() => setResolving(false)} onSubmit={async (note) => { await setStatus("RESOLVED", note); setResolving(false); }} />}
    </div>
  );
}

function ResolveDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (note: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal
      title="Đóng khiếu nại"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" disabled={busy || !note.trim()} onClick={() => { setBusy(true); onSubmit(note).catch((e) => { setErr(errMsg(e)); setBusy(false); }); }}>Xác nhận đã xử lý</Button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      <Field label="Cách xử lý (khách sẽ thấy)" required full>
        <textarea className="o-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Đã vệ sinh lại khu vực, phun diệt côn trùng; tặng khách 1 phần bánh và xin lỗi." autoFocus />
      </Field>
    </Modal>
  );
}
