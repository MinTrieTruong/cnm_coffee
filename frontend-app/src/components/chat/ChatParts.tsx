import { useEffect, useRef, useState } from "react";
import { ImagePlus, SmilePlus, X } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { compressImage } from "../../lib/delivery";
import "../../styles/chat-extras.css";

/** Cảm xúc thả vào tin nhắn — khớp danh sách REACTIONS ở backend (routes/chat.ts) */
export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "😡", "👏"];

/** Bảng icon chèn vào nội dung tin nhắn */
const EMOJIS = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "🥰", "😘", "😋", "😎", "🤩", "🥳",
  "🙂", "😉", "🤔", "😐", "😴", "😅", "😢", "😭", "😡", "😱", "🥺", "😮",
  "👍", "👎", "👏", "🙏", "💪", "👌", "✌️", "🤝", "❤️", "💔", "🔥", "✨",
  "☕", "🧋", "🍵", "🥤", "🍰", "🥐", "🍪", "🍩", "🎉", "🎂", "⏰", "📍",
];

export type ChatReaction = { actorKey: string; actorName: string; emoji: string };
export type ChatMessage = {
  id: number;
  sender: "customer" | "bot" | "staff";
  senderName: string;
  /** Ảnh nhân viên (tin sender = "staff") */
  senderAvatarUrl?: string | null;
  body: string;
  imageUrl?: string | null;
  createdAt: string;
  reactions?: ChatReaction[];
  /** Tin do AI tư vấn trả lời (nhật ký AiRunLog) */
  aiRunId?: number | null;
};

/** Nút 😊 mở bảng icon; chọn icon → chèn vào ô nhập */
export function EmojiPicker({ onPick, disabled }: { onPick: (emoji: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="cx-emoji" ref={ref}>
      <button type="button" className="cx-icon-btn" onClick={() => setOpen((v) => !v)} disabled={disabled} aria-label="Chèn icon" aria-expanded={open}>
        <SmilePlus size={20} />
      </button>
      {open && (
        <div className="cx-emoji-pop" role="dialog" aria-label="Chọn icon">
          {EMOJIS.map((e) => (
            <button key={e} type="button" onClick={() => onPick(e)} aria-label={e}>{e}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Nút 📷 chọn / chụp ảnh — trả về data URL đã nén */
export function ImageAttachButton({ onPick, disabled }: { onPick: (dataUrl: string) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      onPick(await compressImage(file, 1280, 0.8));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Không đọc được ảnh");
    }
  }
  return (
    <>
      <button type="button" className="cx-icon-btn" onClick={() => input.current?.click()} disabled={disabled} aria-label="Đính kèm ảnh">
        <ImagePlus size={20} />
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
    </>
  );
}

/** Ảnh đang chờ gửi (xem trước + bỏ) */
export function PendingImage({ src, onRemove }: { src: string | null; onRemove: () => void }) {
  if (!src) return null;
  return (
    <div className="cx-pending">
      <img src={src} alt="Ảnh sẽ gửi" />
      <button type="button" onClick={onRemove} aria-label="Bỏ ảnh"><X size={14} /></button>
    </div>
  );
}

/** Ảnh trong tin nhắn — bấm mở ảnh gốc */
export function MessageImage({ url }: { url?: string | null }) {
  if (!url) return null;
  const src = mediaUrl(url);
  return (
    <a href={src} target="_blank" rel="noreferrer" className="cx-msg-img">
      <img src={src} alt="Ảnh đính kèm" loading="lazy" />
    </a>
  );
}

/**
 * Cảm xúc của 1 tin: các chip đã thả (số lượng, ai thả) + nút thả nhanh.
 * mine = actorKey của người đang xem ("customer" hoặc "staff:<id>") để tô chip của mình.
 */
export function MessageReactions({ reactions = [], mine, onReact, align = "start" }: {
  reactions?: ChatReaction[]; mine: string; onReact: (emoji: string) => void; align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const groups = REACTIONS.map((e) => ({ emoji: e, who: reactions.filter((r) => r.emoji === e) })).filter((g) => g.who.length);
  return (
    <div className={`cx-react cx-react-${align}`}>
      {groups.map((g) => (
        <button
          key={g.emoji}
          type="button"
          className={`cx-react-chip${g.who.some((w) => w.actorKey === mine) ? " mine" : ""}`}
          title={g.who.map((w) => w.actorName).join(", ")}
          onClick={() => onReact(g.emoji)}
        >
          {g.emoji}{g.who.length > 1 && <span>{g.who.length}</span>}
        </button>
      ))}
      <span className="cx-react-add">
        <button type="button" className="cx-react-toggle" onClick={() => setOpen((v) => !v)} aria-label="Thả cảm xúc">＋</button>
        {open && (
          <span className="cx-react-bar" role="menu">
            {REACTIONS.map((e) => (
              <button key={e} type="button" onClick={() => { onReact(e); setOpen(false); }} aria-label={`Thả ${e}`}>{e}</button>
            ))}
          </span>
        )}
      </span>
    </div>
  );
}

/** Cập nhật cảm xúc của 1 tin trong danh sách khi nhận socket "chat:reaction" */
export function applyReaction<T extends ChatMessage>(list: T[], messageId: number, reactions: ChatReaction[]) {
  return list.map((m) => (m.id === messageId ? { ...m, reactions } : m));
}
