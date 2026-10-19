import { useState, useEffect, useRef, type FormEvent } from "react";
import { io, type Socket } from "socket.io-client";
import { getTableId } from "../lib/session";
import { getStoreId } from "../lib/customerStore";
import { apiBase, apiOrigin } from "../lib/api";
import { getToken } from "../lib/session";

/* ── Types ─────────────────────────────────────────────────────────── */
interface ChatMsg {
  id: number;
  sender: "customer" | "bot" | "staff";
  senderName: string;
  body: string;
  createdAt: string;
}

/* ── Helper: lấy tên khách từ localStorage nếu đã đăng nhập ───────── */
function getCustomerInfo(): { name: string; token: string | null } {
  try {
    const raw = localStorage.getItem("cmn_customer_info");
    if (raw) {
      const info = JSON.parse(raw) as { fullName?: string; phone?: string };
      return { name: info.fullName || info.phone || "Khách", token: getToken() };
    }
  } catch { /* */ }
  return { name: "Khách", token: null };
}

let globalSocket: Socket | null = null;

function getSocket(): Socket {
  if (!globalSocket) {
    globalSocket = io(apiOrigin(), { transports: ["websocket", "polling"] });
  }
  return globalSocket;
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(() => {
    const v = localStorage.getItem("cmn_chat_session");
    return v ? Number(v) : null;
  });
  const [loading, setLoading] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const tableId = getTableId();
  const { name: guestName } = getCustomerInfo();

  /* ── Kết nối socket & lắng nghe reply ───────────────────────────── */
  useEffect(() => {
    const sock = getSocket();

    // Join phòng chat của phiên này
    if (sessionId) {
      sock.emit("join", `chat:${sessionId}`);
    }

    function onReply(data: { sessionId: number; message: ChatMsg }) {
      if (data.sessionId !== sessionId) return;
      setMessages((prev) => {
        if (prev.find((m) => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
      if (!open) setHasNew(true);
    }

    function onClosed(data: { sessionId: number }) {
      if (data.sessionId !== sessionId) return;
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          sender: "bot",
          senderName: "TD Bot",
          body: "Phiên chat đã được đóng. Cảm ơn bạn đã liên hệ! ☕",
          createdAt: new Date().toISOString(),
        },
      ]);
      setSessionId(null);
      localStorage.removeItem("cmn_chat_session");
    }

    sock.on("chat:reply", onReply);
    sock.on("chat:closed", onClosed);
    return () => {
      sock.off("chat:reply", onReply);
      sock.off("chat:closed", onClosed);
    };
  }, [sessionId, open]);

  /* ── Load lịch sử nếu đã có session ─────────────────────────────── */
  useEffect(() => {
    if (!sessionId) return;
    const base = apiBase();
    fetch(`${base}/api/chat/session/${sessionId}`)
      .then((r) => r.json())
      .then((data: { messages?: ChatMsg[] }) => {
        if (data.messages) setMessages(data.messages);
        // join socket room
        getSocket().emit("join", `chat:${sessionId}`);
      })
      .catch(() => {
        // session không còn → reset
        setSessionId(null);
        localStorage.removeItem("cmn_chat_session");
      });
  }, [sessionId]);

  /* ── Scroll xuống cuối khi có tin mới ───────────────────────────── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  /* ── Mở widget → xoá badge "new" ────────────────────────────────── */
  function handleToggle() {
    setOpen((v) => !v);
    setHasNew(false);
  }

  /* ── Gửi tin nhắn ───────────────────────────────────────────────── */
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || loading) return;
    const userText = text.trim();
    setText("");
    setLoading(true);

    // Hiển thị ngay tin của khách (optimistic)
    const tmpMsg: ChatMsg = {
      id: Date.now(),
      sender: "customer",
      senderName: guestName,
      body: userText,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tmpMsg]);

    try {
      const base = apiBase();
      const body: Record<string, unknown> = {
        message: userText,
        tableId,
        // Không ngồi bàn: chuyển tới nhân viên chi nhánh khách đang chọn
        storeId: getStoreId(),
        guestName,
        sessionId,
      };
      const token = getToken();
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        reply?: string;
        bot?: boolean;
        sessionId?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Lỗi gửi tin nhắn");

      // Lưu sessionId mới
      if (data.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
        localStorage.setItem("cmn_chat_session", String(data.sessionId));
        getSocket().emit("join", `chat:${data.sessionId}`);
      }

      // Thêm reply bot
      if (data.reply) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            sender: data.bot ? "bot" : "bot",
            senderName: "TD Bot",
            body: data.reply!,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 2,
          sender: "bot",
          senderName: "TD Bot",
          body: err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <>
      {/* FAB button */}
      <button
        id="chat-fab-btn"
        type="button"
        className="chat-fab"
        onClick={handleToggle}
        aria-label="Chat hỗ trợ"
      >
        {open ? "✕" : "💬"}
        {!open && hasNew && <span className="chat-fab-badge" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="chat-panel card" id="chat-panel">
          {/* Header */}
          <div className="chat-panel-header">
            <span>💬 Hỗ trợ TD Coffee</span>
            {tableId && <span className="chat-table-badge">Bàn {tableId}</span>}
          </div>

          {/* Messages */}
          <div className="chat-messages" id="chat-messages-list">
            {messages.length === 0 && (
              <p className="chat-empty">Chào bạn! Cần hỗ trợ gì không? 😊<br />
                <span className="subtle">Thử hỏi: pass wifi, nhà vệ sinh, giờ mở cửa…</span>
              </p>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-msg chat-msg-${msg.sender}`}
              >
                {msg.sender !== "customer" && (
                  <div className="chat-msg-name">{msg.senderName}</div>
                )}
                <div className="chat-msg-bubble">{msg.body}</div>
                <div className="chat-msg-time">
                  {new Date(msg.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))}
            {loading && (
              <div className="chat-msg chat-msg-bot">
                <div className="chat-msg-bubble chat-typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form className="chat-input-row" onSubmit={(e) => void send(e)}>
            <input
              id="chat-input"
              className="input chat-input"
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Nhắn tin…"
              autoComplete="off"
              disabled={loading}
            />
            <button
              type="submit"
              className="btn btn-primary chat-send-btn"
              disabled={loading || !text.trim()}
            >
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  );
}
