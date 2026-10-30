import { useState, useEffect, useRef, type FormEvent } from "react";
import { io, type Socket } from "socket.io-client";
import { getTableId } from "../lib/session";
import { getStoreId } from "../lib/customerStore";
import { apiBase, apiOrigin } from "../lib/api";
import { getToken } from "../lib/session";
import {
  applyReaction, EmojiPicker, ImageAttachButton, MessageImage, MessageReactions, PendingImage,
  type ChatMessage, type ChatReaction,
} from "./chat/ChatParts";

type Mode = "chat" | "complaint";
/** Phiên của khách: id + mã bí mật (cần để xem lịch sử, thả cảm xúc, nhận tin qua socket) */
type Ref = { id: number; key: string };
type SessionInfo = { status: "open" | "closed"; kind: "CHAT" | "COMPLAINT"; category: string | null; complaintStatus: string | null };

const COMPLAINT_CATEGORIES: Record<string, string> = {
  HYGIENE: "Vệ sinh", SERVICE: "Thái độ phục vụ", FOOD: "Chất lượng món", WAIT: "Chờ lâu",
  DELIVERY: "Giao hàng", BILLING: "Thanh toán", OTHER: "Khác",
};
const COMPLAINT_STATUS: Record<string, string> = { NEW: "Đã gửi — chờ quản lý", IN_PROGRESS: "Quản lý đang xử lý", RESOLVED: "Đã xử lý" };
const STORE_KEY: Record<Mode, string> = { chat: "cmn_chat", complaint: "cmn_complaint" };

/* ── Helper: lấy tên khách từ localStorage nếu đã đăng nhập ───────── */
function getCustomerName(): string {
  try {
    const raw = localStorage.getItem("cmn_customer_info");
    if (raw) {
      const info = JSON.parse(raw) as { fullName?: string; phone?: string };
      return info.fullName || info.phone || "Khách";
    }
  } catch { /* */ }
  return "Khách";
}

function loadRef(mode: Mode): Ref | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY[mode]) ?? "null") as Ref | null;
    return v && v.id && v.key ? v : null;
  } catch {
    return null;
  }
}
function saveRef(mode: Mode, ref: Ref | null) {
  try {
    if (ref) localStorage.setItem(STORE_KEY[mode], JSON.stringify(ref));
    else localStorage.removeItem(STORE_KEY[mode]);
  } catch { /* */ }
}

let globalSocket: Socket | null = null;
function getSocket(): Socket {
  if (!globalSocket) globalSocket = io(apiOrigin(), { transports: ["websocket", "polling"] });
  return globalSocket;
}
const roomOf = (r: Ref) => `chat:${r.id}:${r.key}`;

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Có lỗi xảy ra, vui lòng thử lại.");
  return data;
}

export function ChatWidget() {
  // Phiên cũ (trước khi có mã truy cập) không dùng tiếp được
  useEffect(() => localStorage.removeItem("cmn_chat_session"), []);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("chat");
  const [refs, setRefs] = useState<Record<Mode, Ref | null>>(() => ({ chat: loadRef("chat"), complaint: loadRef("complaint") }));
  const [threads, setThreads] = useState<Record<Mode, ChatMessage[]>>({ chat: [], complaint: [] });
  const [info, setInfo] = useState<Record<Mode, SessionInfo | null>>({ chat: null, complaint: null });
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  // Form khiếu nại mới
  const [composing, setComposing] = useState(false);
  const [category, setCategory] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const tableId = getTableId();
  const guestName = getCustomerName();

  const setRef = (m: Mode, r: Ref | null) => {
    saveRef(m, r);
    setRefs((p) => ({ ...p, [m]: r }));
  };
  const push = (m: Mode, msgs: ChatMessage[]) =>
    setThreads((p) => ({ ...p, [m]: [...p[m], ...msgs.filter((x) => !p[m].some((y) => y.id === x.id))] }));

  /* ── Tải lịch sử + join phòng socket của từng phiên ─────────────── */
  useEffect(() => {
    for (const m of ["chat", "complaint"] as Mode[]) {
      const r = refs[m];
      if (!r) {
        setThreads((p) => ({ ...p, [m]: [] }));
        setInfo((p) => ({ ...p, [m]: null }));
        continue;
      }
      fetch(`${apiBase()}/api/chat/session/${r.id}?key=${encodeURIComponent(r.key)}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data: SessionInfo & { messages: ChatMessage[] }) => {
          setThreads((p) => ({ ...p, [m]: data.messages }));
          setInfo((p) => ({ ...p, [m]: { status: data.status, kind: data.kind, category: data.category, complaintStatus: data.complaintStatus } }));
          getSocket().emit("join", roomOf(r));
        })
        .catch(() => setRef(m, null));
    }
  }, [refs.chat?.id, refs.complaint?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Socket: tin mới, cảm xúc, đóng phiên ───────────────────────── */
  useEffect(() => {
    const sock = getSocket();
    const modeOf = (sessionId: number) => (Object.keys(refs) as Mode[]).find((m) => refs[m]?.id === sessionId);
    function onReply(d: { sessionId: number; message: ChatMessage }) {
      const m = modeOf(d.sessionId);
      if (!m) return;
      push(m, [d.message]);
      if (!open || m !== mode) setHasNew(true);
      // Quản lý trả lời khiếu nại → trạng thái đổi; tải lại để lấy trạng thái mới
      if (m === "complaint") setInfo((p) => (p.complaint && p.complaint.complaintStatus === "NEW" && d.message.sender === "staff" ? { ...p, complaint: { ...p.complaint, complaintStatus: "IN_PROGRESS" } } : p));
    }
    function onReaction(d: { sessionId: number; messageId: number; reactions: ChatReaction[] }) {
      const m = modeOf(d.sessionId);
      if (m) setThreads((p) => ({ ...p, [m]: applyReaction(p[m], d.messageId, d.reactions) }));
    }
    function onClosed(d: { sessionId: number }) {
      const m = modeOf(d.sessionId);
      if (!m) return;
      setInfo((p) => (p[m] ? { ...p, [m]: { ...p[m]!, status: "closed", complaintStatus: m === "complaint" ? "RESOLVED" : p[m]!.complaintStatus } } : p));
      if (m === "chat") {
        push("chat", [{ id: -Date.now(), sender: "bot", senderName: "TD Bot", body: "Phiên chat đã được đóng. Cảm ơn bạn đã liên hệ! ☕", createdAt: new Date().toISOString() }]);
        setRef("chat", null);
      }
    }
    sock.on("chat:reply", onReply);
    sock.on("chat:reaction", onReaction);
    sock.on("chat:closed", onClosed);
    return () => {
      sock.off("chat:reply", onReply);
      sock.off("chat:reaction", onReaction);
      sock.off("chat:closed", onClosed);
    };
  }, [refs, open, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threads, open, mode]);

  function handleToggle() {
    setOpen((v) => !v);
    setHasNew(false);
  }

  /** Gửi tin (chat, khiếu nại mới, hoặc bổ sung cho khiếu nại đang mở) */
  async function send(e?: FormEvent) {
    e?.preventDefault();
    if ((!text.trim() && !image) || loading) return;
    const isComplaint = mode === "complaint";
    const newComplaint = isComplaint && (composing || !refs.complaint || info.complaint?.status === "closed");
    if (newComplaint && !category) return alert("Chọn loại khiếu nại.");
    const ref = isComplaint && newComplaint ? null : refs[mode];
    const body = text.trim();
    const img = image;
    setText("");
    setImage(null);
    setLoading(true);
    try {
      const data = await postJson<{ sessionId: number; key: string; kind: string; message: ChatMessage; reply: ChatMessage | null }>("/api/chat", {
        message: body, image: img, tableId, storeId: getStoreId(), guestName,
        sessionId: ref?.id ?? null, key: ref?.key ?? null,
        kind: isComplaint ? "COMPLAINT" : "CHAT", category: newComplaint ? category : undefined,
      });
      if (!ref || data.sessionId !== ref.id) {
        const r = { id: data.sessionId, key: data.key };
        setThreads((p) => ({ ...p, [mode]: [] }));
        setRef(mode, r);
        getSocket().emit("join", roomOf(r));
        if (isComplaint) {
          setInfo((p) => ({ ...p, complaint: { status: "open", kind: "COMPLAINT", category, complaintStatus: "NEW" } }));
          setComposing(false);
          setCategory("");
        }
      }
      push(mode, [data.message, ...(data.reply ? [data.reply] : [])]);
    } catch (err) {
      setText(body);
      setImage(img);
      alert(err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  async function react(messageId: number, emoji: string) {
    const r = refs[mode];
    if (!r || messageId <= 0) return;
    try {
      await postJson(`/api/chat/messages/${messageId}/react`, { key: r.key, emoji });
    } catch { /* bỏ qua */ }
  }

  const complaintInfo = info.complaint;
  const showComplaintForm = mode === "complaint" && (composing || !refs.complaint);
  const thread = threads[mode];
  const closed = info[mode]?.status === "closed";

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <>
      <button id="chat-fab-btn" type="button" className="chat-fab" onClick={handleToggle} aria-label="Chat hỗ trợ">
        {open ? "✕" : "💬"}
        {!open && hasNew && <span className="chat-fab-badge" />}
      </button>

      {open && (
        <div className="chat-panel card" id="chat-panel">
          <div className="chat-panel-header">
            <span>💬 Hỗ trợ TD Coffee</span>
            {tableId && <span className="chat-table-badge">Bàn {tableId}</span>}
          </div>
          <div className="cx-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === "chat"} className={mode === "chat" ? "active" : ""} onClick={() => setMode("chat")}>💬 Chat</button>
            <button type="button" role="tab" aria-selected={mode === "complaint"} className={mode === "complaint" ? "active" : ""} onClick={() => setMode("complaint")}>⚠️ Khiếu nại</button>
          </div>

          {mode === "complaint" && !showComplaintForm && complaintInfo && (
            <div className="cx-status">
              <span>#{refs.complaint?.id} · {COMPLAINT_CATEGORIES[complaintInfo.category ?? "OTHER"]} · <b>{COMPLAINT_STATUS[complaintInfo.complaintStatus ?? "NEW"]}</b></span>
              <button type="button" className="cx-link" onClick={() => { setComposing(true); setCategory(""); }}>+ Khiếu nại mới</button>
            </div>
          )}

          {showComplaintForm ? (
            <div className="cx-complaint-form">
              <p>Gặp vấn đề tại quán? Gửi khiếu nại kèm ảnh, <b>quản lý chi nhánh</b> sẽ nhận ngay và phản hồi bạn tại đây.</p>
              <div className="cx-cats" role="radiogroup" aria-label="Loại khiếu nại">
                {Object.entries(COMPLAINT_CATEGORIES).map(([k, v]) => (
                  <button key={k} type="button" role="radio" aria-checked={category === k} className={category === k ? "active" : ""} onClick={() => setCategory(k)}>{v}</button>
                ))}
              </div>
              <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Mô tả vấn đề (VD: bàn số 5 có gián, ly nước có dị vật…)" maxLength={2000} />
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <ImageAttachButton onPick={setImage} disabled={loading} />
                <EmojiPicker onPick={(e) => setText((t) => t + e)} disabled={loading} />
                <PendingImage src={image} onRemove={() => setImage(null)} />
                <span style={{ flex: 1 }} />
                {refs.complaint && <button type="button" className="btn btn-ghost" onClick={() => setComposing(false)}>Huỷ</button>}
                <button type="button" className="btn btn-primary" disabled={loading || !category || (!text.trim() && !image)} onClick={() => void send()}>
                  {loading ? "Đang gửi…" : "Gửi khiếu nại"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="chat-messages" id="chat-messages-list">
                {thread.length === 0 && mode === "chat" && (
                  <p className="chat-empty">Chào bạn! Cần hỗ trợ gì không? 😊<br />
                    <span className="subtle">Thử hỏi: pass wifi, nhà vệ sinh, giờ mở cửa…</span>
                  </p>
                )}
                {thread.map((msg) => (
                  <div key={msg.id} className={`chat-msg chat-msg-${msg.sender}`}>
                    {msg.sender !== "customer" && <div className="chat-msg-name">{msg.senderName}</div>}
                    {msg.body && <div className="chat-msg-bubble">{msg.body}</div>}
                    <MessageImage url={msg.imageUrl} />
                    {msg.id > 0 && !closed && (
                      <MessageReactions reactions={msg.reactions} mine="customer" onReact={(e) => void react(msg.id, e)} align={msg.sender === "customer" ? "end" : "start"} />
                    )}
                    <div className="chat-msg-time">
                      {new Date(msg.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="chat-msg chat-msg-bot">
                    <div className="chat-msg-bubble chat-typing"><span /><span /><span /></div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {closed && mode === "complaint" ? (
                <div className="cx-closed">Khiếu nại đã được xử lý. <button type="button" className="cx-link" onClick={() => { setComposing(true); setCategory(""); }}>Gửi khiếu nại mới</button></div>
              ) : (
                <>
                  <PendingImage src={image} onRemove={() => setImage(null)} />
                  <form className="chat-input-row" onSubmit={(e) => void send(e)}>
                    <ImageAttachButton onPick={setImage} disabled={loading} />
                    <EmojiPicker onPick={(e) => setText((t) => t + e)} disabled={loading} />
                    <input
                      id="chat-input"
                      className="input chat-input"
                      type="text"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={mode === "complaint" ? "Bổ sung thông tin cho quản lý…" : "Nhắn tin…"}
                      autoComplete="off"
                      disabled={loading}
                    />
                    <button type="submit" className="btn btn-primary chat-send-btn" disabled={loading || (!text.trim() && !image)} aria-label="Gửi">➤</button>
                  </form>
                </>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
