import { useState, useEffect, useRef, type FormEvent } from "react";
import { io, type Socket } from "socket.io-client";
import { apiBase, apiOrigin } from "../lib/api";
import { getStaffInfo, getStaffToken } from "../lib/staffApi";

/* ── Types ─────────────────────────────────────────────────────────── */
interface ChatMsg {
  id: number;
  sender: "customer" | "bot" | "staff";
  senderName: string;
  body: string;
  createdAt: string;
}

interface ChatSession {
  id: number;
  guestName: string;
  tableId: number | null;
  status: "open" | "closed";
  updatedAt: string;
  messages: ChatMsg[]; // chỉ có 1 tin gần nhất (từ list endpoint)
}

/* ── Socket singleton ───────────────────────────────────────────────── */
let staffSocket: Socket | null = null;
function getSocket(): Socket {
  if (!staffSocket) {
    staffSocket = io(apiOrigin(), { transports: ["websocket", "polling"] });
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
  const [sending, setSending] = useState(false);
  const [unreadIds, setUnreadIds] = useState<Set<number>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const staffInfo = getStaffInfo();

  /* ── Load sessions ─────────────────────────────────────────────── */
  async function loadSessions() {
    try {
      const url = showAll ? "/api/staff/chat/sessions/all" : "/api/staff/chat/sessions";
      const data = await apiFetch<ChatSession[]>(url);
      setSessions(data);
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

    function onEscalate(data: { sessionId: number; guestName: string; tableId: number | null; message: string }) {
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
      setUnreadIds((prev) => new Set([...prev, data.sessionId]));
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

    sock.on("chat:escalate", onEscalate);
    sock.on("chat:reply", onReply);
    sock.on("chat:session_closed", onClosed);
    return () => {
      sock.off("chat:escalate", onEscalate);
      sock.off("chat:reply", onReply);
      sock.off("chat:session_closed", onClosed);
    };
  }, [selected]);

  /* ── Load thread khi chọn phiên ───────────────────────────────── */
  async function selectSession(id: number) {
    setSelected(id);
    setReplyText("");
    setUnreadIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    try {
      const data = await apiFetch<{ messages: ChatMsg[] }>(`/api/staff/chat/sessions/${id}`);
      setThread(data.messages ?? []);
    } catch (e) {
      console.error(e);
    }
  }

  /* ── Scroll cuối thread ────────────────────────────────────────── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread]);

  /* ── Gửi reply ─────────────────────────────────────────────────── */
  async function sendReply(e: FormEvent) {
    e.preventDefault();
    if (!selected || !replyText.trim() || sending) return;
    setSending(true);
    const body = replyText.trim();
    setReplyText("");
    try {
      const msg = await apiFetch<ChatMsg>(`/api/staff/chat/sessions/${selected}/reply`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setThread((prev) => {
        if (prev.find((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gửi thất bại");
    } finally {
      setSending(false);
    }
  }

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
  const openCount = sessions.filter((s) => s.status === "open").length;

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div className="staff-chat-layout">
      {/* ── Sidebar danh sách phiên ── */}
      <aside className="staff-chat-sidebar">
        <div className="staff-chat-sidebar-header">
          <h2 className="staff-chat-title">
            💬 Tin nhắn
            {openCount > 0 && <span className="staff-chat-badge">{openCount}</span>}
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
          {sessions.map((s) => {
            const preview = s.messages[0]?.body ?? "…";
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
                </div>
                <div className="staff-chat-preview">{preview}</div>
                <div className="staff-chat-time">
                  {new Date(s.updatedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
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
            <span>👆 Chọn một phiên chat để xem</span>
          </div>
        ) : (
          <>
            {/* Header thread */}
            <div className="staff-chat-thread-header">
              <div>
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
            <div className="staff-chat-thread" id="staff-chat-thread">
              {thread.map((msg) => {
                const isStaff = msg.sender === "staff";
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
                    </div>
                    <div className="staff-msg-bubble">{msg.body}</div>
                    <div className="staff-msg-time">
                      {new Date(msg.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Reply input */}
            {selectedSession?.status === "open" ? (
              <form className="staff-chat-reply-form" onSubmit={(e) => void sendReply(e)}>
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
                  disabled={sending || !replyText.trim()}
                >
                  {sending ? "…" : "Gửi"}
                </button>
              </form>
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
