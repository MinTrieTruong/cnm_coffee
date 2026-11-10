import { useState, useEffect, useRef, type FormEvent } from "react";
import type { Socket } from "socket.io-client";
import { apiBase } from "../lib/api";
import { getStaffInfo, getStaffToken, staffSocket as openStaffSocket } from "../lib/staffApi";
import {
  applyReaction, EmojiPicker, ImageAttachButton, MessageImage, MessageReactions, PendingImage,
  type ChatMessage as ChatMsg, type ChatReaction,
} from "../components/chat/ChatParts";
import { FeedbackForm } from "../modules/ai/Feedback";

interface ChatSession {
  id: number;
  guestName: string;
  tableId: number | null;
  status: "open" | "closed";
  updatedAt: string;
  messages: ChatMsg[]; // chỉ có 1 tin gần nhất (từ list endpoint)
  /** AI tư vấn: agent đang gán cho phiên, AI dừng (nhân viên tiếp quản / đã chuyển / tắt tay) */
  aiAgentId?: number | null;
  aiPaused?: boolean;
  aiPausedReason?: string | null;
  /** Tóm tắt AI gửi khi chuyển nhân viên (lưu trong phiên) */
  aiHandoffSummary?: string | null;
}

type AiState = { sessionId: number; aiPaused: boolean; aiPausedReason: string | null; summary?: string };

/** Nhãn trạng thái AI của phiên */
function aiLabel(s: Pick<ChatSession, "aiAgentId" | "aiPaused" | "aiPausedReason">) {
  if (!s.aiAgentId) return null;
  if (!s.aiPaused) return { text: "AI đang trả lời", cls: "is-ai" };
  return s.aiPausedReason === "HANDOFF" ? { text: "Đã chuyển nhân viên", cls: "is-handoff" } : { text: "Nhân viên đang xử lý", cls: "is-staff" };
}

/* ── Socket singleton ───────────────────────────────────────────────── */
let staffSocket: Socket | null = null;
function getSocket(): Socket {
  if (!staffSocket) {
    staffSocket = openStaffSocket();
  }
  return staffSocket;
}

/* ── Fetch helpers ─────────────────────────────────────────────────── */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = apiBase();
  const token = getStaffToken();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export function StaffChat() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [thread, setThread] = useState<ChatMsg[]>([]);
  const [replyText, setReplyText] = useState("");
  const [replyImage, setReplyImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [unreadIds, setUnreadIds] = useState<Set<number>>(new Set());
  // Tóm tắt AI gửi kèm khi chuyển nhân viên; phiên AI đang soạn câu trả lời
  const [summaries, setSummaries] = useState<Record<number, string>>({});
  const [aiTyping, setAiTyping] = useState<Set<number>>(new Set());
  // Tin AI đang mở khung đánh giá Đúng / Sai
  const [rateMsg, setRateMsg] = useState<number | null>(null);
  const [rated, setRated] = useState<Record<number, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const staffInfo = getStaffInfo();

  /* ── Load sessions ─────────────────────────────────────────────── */
  async function loadSessions() {
    try {
      const url = showAll ? "/api/staff/chat/sessions/all" : "/api/staff/chat/sessions";
      const [data, unread] = await Promise.all([
        apiFetch<ChatSession[]>(url),
        apiFetch<{ sessionIds: number[] }>("/api/staff/chat/unread").catch(() => null),
      ]);
      setSessions(data);
      // Chưa đọc lấy từ máy chủ (giữ được khi tải lại trang / đổi máy), trừ phiên đang mở
      if (unread) setUnreadIds(new Set(unread.sessionIds.filter((id) => id !== selected)));
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    void loadSessions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll]);

  /* ── Socket: join staff room, lắng nghe escalate & reply ──────── */
  useEffect(() => {
    const sock = getSocket();
    sock.emit("join", "staff");

    function onEscalate(data: { sessionId: number; guestName: string; tableId: number | null; message: string; summary?: string }) {
      if (data.summary) setSummaries((p) => ({ ...p, [data.sessionId]: data.summary! }));
      // Thêm vào danh sách nếu chưa có
      setSessions((prev) => {
        if (prev.find((s) => s.id === data.sessionId)) {
          return prev.map((s) =>
            s.id === data.sessionId
              ? { ...s, messages: [{ id: Date.now(), sender: "customer", senderName: data.guestName, body: data.message, createdAt: new Date().toISOString() }] }
              : s
          );
        }
        return [
          {
            id: data.sessionId,
            guestName: data.guestName,
            tableId: data.tableId,
            status: "open",
            updatedAt: new Date().toISOString(),
            messages: [{ id: Date.now(), sender: "customer", senderName: data.guestName, body: data.message, createdAt: new Date().toISOString() }],
          },
          ...prev,
        ];
      });
      if (data.sessionId === selected) {
        // Đang mở đúng phiên → coi như đã đọc (đợi bot ghi xong tin "chuyển tới nhân viên" rồi mới đánh dấu)
        window.setTimeout(() => void apiFetch(`/api/staff/chat/sessions/${data.sessionId}/read`, { method: "POST" }).catch(() => undefined), 1500);
      } else {
        setUnreadIds((prev) => new Set([...prev, data.sessionId]));
      }
    }

    function onReply(data: { sessionId: number; message: ChatMsg }) {
      // Cập nhật thread nếu đang xem phiên này
      setThread((prev) => {
        if (data.sessionId !== selected) return prev;
        if (prev.find((m) => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
      // Cập nhật preview
      setSessions((prev) =>
        prev.map((s) =>
          s.id === data.sessionId ? { ...s, messages: [data.message], updatedAt: new Date().toISOString() } : s
        )
      );
    }

    function onClosed(data: { sessionId: number }) {
      setSessions((prev) =>
        prev.map((s) => (s.id === data.sessionId ? { ...s, status: "closed" } : s))
      );
    }

    function onReaction(data: { sessionId: number; messageId: number; reactions: ChatReaction[] }) {
      if (data.sessionId === selected) setThread((prev) => applyReaction(prev, data.messageId, data.reactions));
    }

    function onAiState(data: AiState) {
      setSessions((prev) => prev.map((s) => (s.id === data.sessionId ? { ...s, aiPaused: data.aiPaused, aiPausedReason: data.aiPausedReason } : s)));
      if (data.summary) setSummaries((p) => ({ ...p, [data.sessionId]: data.summary! }));
    }

    function onTyping(data: { sessionId: number; on: boolean }) {
      setAiTyping((prev) => {
        const n = new Set(prev);
        if (data.on) n.add(data.sessionId);
        else n.delete(data.sessionId);
        return n;
      });
    }

    sock.on("chat:escalate", onEscalate);
    sock.on("chat:reply", onReply);
    sock.on("chat:reaction", onReaction);
    sock.on("chat:session_closed", onClosed);
    sock.on("chat:ai_state", onAiState);
    sock.on("chat:typing", onTyping);
    return () => {
      sock.off("chat:ai_state", onAiState);
      sock.off("chat:typing", onTyping);
      sock.off("chat:escalate", onEscalate);
      sock.off("chat:reply", onReply);
      sock.off("chat:reaction", onReaction);
      sock.off("chat:session_closed", onClosed);
    };
  }, [selected]);

  /* ── Load thread khi chọn phiên ───────────────────────────────── */
  async function selectSession(id: number) {
    setSelected(id);
    setReplyText("");
    setUnreadIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    try {
      const data = await apiFetch<{ messages: ChatMsg[]; aiAgentId: number | null; aiPaused: boolean; aiPausedReason: string | null; aiHandoffSummary: string | null }>(`/api/staff/chat/sessions/${id}`);
      setThread(data.messages ?? []);
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, aiAgentId: data.aiAgentId, aiPaused: data.aiPaused, aiPausedReason: data.aiPausedReason, aiHandoffSummary: data.aiHandoffSummary } : s)));
    } catch (e) {
      console.error(e);
    }
  }

  /* ── Scroll cuối thread ────────────────────────────────────────── */
  useEffect(() => {
    // Chỉ cuộn khung tin nhắn (scrollIntoView cuộn cả trang → khuất thanh tên khách / nút quay lại trên điện thoại)
    const box = bottomRef.current?.parentElement;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [thread]);

  /* ── Gửi reply ─────────────────────────────────────────────────── */
  async function sendReply(e: FormEvent) {
    e.preventDefault();
    if (!selected || (!replyText.trim() && !replyImage) || sending) return;
    setSending(true);
    const body = replyText.trim();
    const image = replyImage;
    setReplyText("");
    setReplyImage(null);
    try {
      const msg = await apiFetch<ChatMsg>(`/api/staff/chat/sessions/${selected}/reply`, {
        method: "POST",
        body: JSON.stringify({ body, image }),
      });
      setThread((prev) => {
        if (prev.find((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    } catch (e) {
      setReplyText(body);
      setReplyImage(image);
      alert(e instanceof Error ? e.message : "Gửi thất bại");
    } finally {
      setSending(false);
    }
  }

  /* ── Tiếp quản / trả lại cho AI ────────────────────────────────── */
  async function setAiPaused(id: number, paused: boolean) {
    try {
      const r = await apiFetch<{ aiPaused: boolean; aiPausedReason: string | null }>(`/api/staff/chat/sessions/${id}/ai`, { method: "PATCH", body: JSON.stringify({ paused }) });
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...r, ...(r.aiPaused ? {} : { aiHandoffSummary: null }) } : s)));
      if (!r.aiPaused) setSummaries((p) => { const n = { ...p }; delete n[id]; return n; });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Lỗi");
    }
  }

  /* ── Thả cảm xúc ───────────────────────────────────────────────── */
  async function react(messageId: number, emoji: string) {
    try {
      await apiFetch(`/api/staff/chat/messages/${messageId}/react`, { method: "POST", body: JSON.stringify({ emoji }) });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Lỗi");
    }
  }
  const myKey = `staff:${staffInfo?.id ?? 0}`;

  /* ── Đóng phiên ────────────────────────────────────────────────── */
  async function closeSession(id: number) {
    if (!confirm("Đóng phiên chat này?")) return;
    try {
      await apiFetch(`/api/staff/chat/sessions/${id}/close`, { method: "PATCH" });
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, status: "closed" } : s)));
      if (selected === id) {
        setThread((prev) => [
          ...prev,
          { id: Date.now(), sender: "bot", senderName: "Hệ thống", body: "Phiên chat đã đóng.", createdAt: new Date().toISOString() },
        ]);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Lỗi");
    }
  }

  const selectedSession = sessions.find((s) => s.id === selected);
  // Phiên chưa đọc lên đầu (còn lại giữ thứ tự mới nhất) — điện thoại danh sách ngắn, phiên cũ chưa đọc dễ bị khuất
  const ordered = [...sessions].sort((a, b) => Number(unreadIds.has(b.id)) - Number(unreadIds.has(a.id)));
  const unreadCount = sessions.filter((s) => unreadIds.has(s.id)).length;
  const timeLabel = (iso: string) => {
    const d = new Date(iso);
    const today = d.toDateString() === new Date().toDateString();
    return today
      ? d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
  };

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div className={selected ? "staff-chat-layout has-thread" : "staff-chat-layout"}>
      {/* ── Sidebar danh sách phiên ── */}
      <aside className="staff-chat-sidebar">
        <div className="staff-chat-sidebar-header">
          <h2 className="staff-chat-title">
            Tin nhắn
            {unreadCount > 0 && <span className="staff-chat-badge" title="Phiên chưa đọc">{unreadCount}</span>}
          </h2>
          <label className="staff-chat-toggle-label">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            <span>Xem tất cả</span>
          </label>
        </div>

        {sessions.length === 0 && (
          <p className="staff-chat-empty-list">Chưa có tin nhắn nào.</p>
        )}

        <ul className="staff-chat-session-list">
          {ordered.map((s) => {
            const preview = s.messages[0]?.body || (s.messages[0]?.imageUrl ? "📷 Ảnh" : "…");
            const isUnread = unreadIds.has(s.id);
            const isActive = selected === s.id;
            return (
              <li
                key={s.id}
                className={[
                  "staff-chat-session-item",
                  isActive ? "staff-chat-session-active" : "",
                  isUnread ? "staff-chat-session-unread" : "",
                  s.status === "closed" ? "staff-chat-session-closed" : "",
                ].join(" ")}
                onClick={() => void selectSession(s.id)}
              >
                <div className="staff-chat-session-top">
                  <span className="staff-chat-guest-name">
                    {isUnread && <span className="staff-chat-dot" />}
                    {s.guestName}
                  </span>
                  {s.tableId && (
                    <span className="staff-chat-table-tag">Bàn {s.tableId}</span>
                  )}
                  {s.status === "closed" && (
                    <span className="staff-chat-closed-tag">Đóng</span>
                  )}
                  {s.status === "open" && aiLabel(s) && <span className={`staff-chat-ai-tag ${aiLabel(s)!.cls}`}>{aiLabel(s)!.text}</span>}
                </div>
                <div className="staff-chat-preview">{preview}</div>
                <div className="staff-chat-time">
                  {timeLabel(s.updatedAt)}
                </div>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* ── Khung hội thoại ── */}
      <main className="staff-chat-main">
        {!selected ? (
          <div className="staff-chat-placeholder">
            <span>Chọn một phiên chat để xem</span>
          </div>
        ) : (
          <>
            {/* Header thread */}
            <div className="staff-chat-thread-header">
              {/* Điện thoại: danh sách và hội thoại là hai màn — nút quay lại danh sách */}
              <button type="button" className="staff-chat-back" onClick={() => setSelected(null)} aria-label="Quay lại danh sách">‹</button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{selectedSession?.guestName ?? "Khách"}</strong>
                {selectedSession?.tableId && (
                  <span className="staff-chat-table-tag" style={{ marginLeft: 8 }}>
                    Bàn {selectedSession.tableId}
                  </span>
                )}
                {selectedSession?.status === "closed" && (
                  <span className="staff-chat-closed-tag" style={{ marginLeft: 8 }}>Đã đóng</span>
                )}
              </div>
              {selectedSession?.status === "open" && selectedSession.aiAgentId && (
                <button
                  type="button"
                  className="btn staff-chat-ai-btn"
                  onClick={() => void setAiPaused(selected, !selectedSession.aiPaused)}
                  title={selectedSession.aiPaused ? "AI trả lời các tin khách nhắn tiếp theo" : "AI dừng ở phiên này, bạn trả lời khách"}
                >
                  {selectedSession.aiPaused ? "Trả lại cho AI" : "Tiếp quản"}
                </button>
              )}
              {selectedSession?.status === "open" && (
                <button
                  type="button"
                  className="btn"
                  style={{ fontSize: "0.8rem", padding: "4px 10px" }}
                  onClick={() => void closeSession(selected)}
                >
                  Đóng phiên
                </button>
              )}
            </div>

            {/* Messages */}
            {selectedSession?.status === "open" && aiLabel(selectedSession) && (
              <div className={`staff-chat-ai-bar ${aiLabel(selectedSession)!.cls}`}>
                <strong>{aiLabel(selectedSession)!.text}</strong>
                {!selectedSession.aiPaused && <span> · bạn trả lời khách thì AI tự dừng ở phiên này</span>}
                {selected != null && (summaries[selected] ?? selectedSession.aiHandoffSummary) && (
                  <p className="staff-chat-ai-summary"><b>Tóm tắt từ AI:</b> {summaries[selected] ?? selectedSession.aiHandoffSummary}</p>
                )}
              </div>
            )}
            <div className="staff-chat-thread" id="staff-chat-thread">
              {thread.map((msg, idx) => {
                const isStaff = msg.sender === "staff";
                const lastOfRun = msg.aiRunId != null && thread[idx + 1]?.aiRunId !== msg.aiRunId;
                const isMe = isStaff && msg.senderName === staffInfo?.fullName;
                return (
                  <div
                    key={msg.id}
                    className={[
                      "staff-msg",
                      msg.sender === "customer" ? "staff-msg-customer" : "",
                      isMe ? "staff-msg-me" : "",
                      msg.sender === "bot" ? "staff-msg-bot" : "",
                    ].join(" ")}
                  >
                    <div className="staff-msg-name">
                      {msg.senderName}
                      {msg.sender === "staff" && !isMe && " (NV)"}
                      {msg.sender === "bot" && msg.aiRunId != null && <span className="staff-chat-ai-mark">AI</span>}
                    </div>
                    {msg.body && <div className="staff-msg-bubble">{msg.body}</div>}
                    <MessageImage url={msg.imageUrl} />
                    {msg.sender === "bot" && msg.aiRunId != null && lastOfRun && (
                      rateMsg === msg.id ? (
                        <div className="staff-chat-rate">
                          <FeedbackForm runId={msg.aiRunId} onDone={(r) => { setRated((p) => ({ ...p, [msg.id]: r.rating })); setRateMsg(null); }} />
                        </div>
                      ) : (
                        <button type="button" className="staff-chat-rate-btn" onClick={() => setRateMsg(msg.id)}>
                          {rated[msg.id] === "GOOD" ? "Đã đánh giá: Đúng" : rated[msg.id] === "BAD" ? "Đã đánh giá: Sai" : "Đánh giá câu trả lời AI"}
                        </button>
                      )
                    )}
                    {msg.sender !== "bot" && (
                      <MessageReactions reactions={msg.reactions} mine={myKey} onReact={(e) => void react(msg.id, e)} align={msg.sender === "customer" ? "start" : "end"} />
                    )}
                    <div className="staff-msg-time">
                      {new Date(msg.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                );
              })}
              {selected != null && aiTyping.has(selected) && <div className="staff-msg staff-msg-bot"><div className="staff-msg-bubble staff-chat-ai-typing">AI đang soạn câu trả lời…</div></div>}
              <div ref={bottomRef} />
            </div>

            {/* Reply input */}
            {selectedSession?.status === "open" ? (
              <>
              <PendingImage src={replyImage} onRemove={() => setReplyImage(null)} />
              <form className="staff-chat-reply-form" onSubmit={(e) => void sendReply(e)}>
                <ImageAttachButton onPick={setReplyImage} disabled={sending} />
                <EmojiPicker onPick={(e) => setReplyText((t) => t + e)} disabled={sending} />
                <input
                  id="staff-chat-reply-input"
                  className="input"
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Trả lời ${selectedSession?.guestName ?? "khách"}…`}
                  autoComplete="off"
                  disabled={sending}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={sending || (!replyText.trim() && !replyImage)}
                >
                  {sending ? "…" : "Gửi"}
                </button>
              </form>
              </>
            ) : (
              <div className="staff-chat-closed-notice">
                Phiên chat đã đóng — không thể gửi thêm tin nhắn.
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
