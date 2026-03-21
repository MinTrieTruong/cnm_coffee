import { useState, type FormEvent } from "react";
import { getTableId } from "../lib/session";
import { apiOrigin } from "../lib/api";

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setReply(null);
    try {
      const base = apiOrigin();
      const tableId = getTableId();
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), tableId }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Lỗi");
      setReply(data.reply ?? "");
      setText("");
    } catch (err) {
      setReply(err instanceof Error ? err.message : "Lỗi");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          bottom: "1rem",
          right: "1rem",
          zIndex: 45,
          borderRadius: "999px",
          padding: "0.65rem 1rem",
          boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
        }}
      >
        {open ? "Đóng chat" : "💬 Hỏi quán"}
      </button>
      {open && (
        <div
          className="card"
          style={{
            position: "fixed",
            bottom: "4.5rem",
            right: "1rem",
            zIndex: 46,
            width: "min(360px, calc(100vw - 2rem))",
            padding: "1rem",
            boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
          }}
        >
          <p className="subtle" style={{ fontSize: "0.85rem", marginTop: 0 }}>
            WiFi, WC… bot trả lời nhanh; còn lại chuyển cho nhân viên (socket → staff).
          </p>
          <form onSubmit={(e) => void send(e)}>
            <div className="field" style={{ marginBottom: "0.65rem" }}>
              <textarea
                className="input"
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Ví dụ: pass wifi?"
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? "…" : "Gửi"}
            </button>
          </form>
          {reply && (
            <p style={{ marginTop: "0.75rem", fontSize: "0.92rem", whiteSpace: "pre-wrap" }}>
              {reply}
            </p>
          )}
        </div>
      )}
    </>
  );
}
