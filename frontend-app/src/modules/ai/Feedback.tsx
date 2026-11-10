import { useEffect, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { staffApi } from "../../lib/staffApi";
import { Button, errMsg } from "../../components/erp";
import type { KbRow } from "../../lib/knowledge";

/** Đánh giá câu trả lời của AI (Đúng / Sai) + câu trả lời đúng lưu vào kho — dùng ở Bảng điều khiển AI và màn Tin nhắn */
export function FeedbackForm({ runId, initial, onDone }: { runId: number; initial?: { rating?: string | null; correction?: string | null }; onDone: (r: { rating: string; added: unknown }) => void }) {
  const [rating, setRating] = useState<"GOOD" | "BAD" | null>((initial?.rating as "GOOD" | "BAD") ?? null);
  const [text, setText] = useState(initial?.correction ?? "");
  const [kbs, setKbs] = useState<KbRow[]>([]);
  const [kbId, setKbId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (rating !== "BAD") return;
    staffApi<{ items: KbRow[] }>("/api/knowledge-bases")
      .then((r) => {
        const editable = r.items.filter((k) => k.canEdit);
        setKbs(editable);
        if (editable.length && !kbId) setKbId(String(editable[0].id));
      })
      .catch(() => setKbs([]));
  }, [rating]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(r: "GOOD" | "BAD") {
    setBusy(true);
    try {
      const out = await staffApi<{ rating: string; added: unknown }>(`/api/ai/runs/${runId}/feedback`, {
        method: "POST",
        body: JSON.stringify({ rating: r, correction: r === "BAD" ? text : undefined, knowledgeBaseId: r === "BAD" && text.trim() && kbId ? Number(kbId) : undefined }),
      });
      setErr(null);
      onDone(out);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ai-feedback">
      <div className="ai-feedback-btns">
        <Button size="sm" icon={ThumbsUp} variant={rating === "GOOD" ? "primary" : "secondary"} disabled={busy} onClick={() => { setRating("GOOD"); void send("GOOD"); }}>Đúng</Button>
        <Button size="sm" icon={ThumbsDown} variant={rating === "BAD" ? "danger" : "secondary"} disabled={busy} onClick={() => setRating("BAD")}>Sai</Button>
      </div>
      {rating === "BAD" && (
        <div className="ai-feedback-form">
          <textarea className="o-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Câu trả lời đúng (AI sẽ học từ câu này)" maxLength={5000} />
          {kbs.length > 0 ? (
            <select className="o-input" value={kbId} onChange={(e) => setKbId(e.target.value)} aria-label="Lưu vào kho">
              <option value="">Không lưu vào kho</option>
              {kbs.map((k) => <option key={k.id} value={k.id}>Lưu vào kho: {k.name}</option>)}
            </select>
          ) : (
            <small className="o-muted">Chỉ ghi nhận đánh giá — quản lý / Chủ chuỗi lưu câu trả lời vào kho.</small>
          )}
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void send("BAD")}>{busy ? "Đang lưu…" : "Gửi"}</Button>
        </div>
      )}
      {err && <div className="kb-doc-err">{err}</div>}
    </div>
  );
}
