/**
 * Đặt món bằng giọng nói / câu tự nhiên — giao diện POS (Sơ đồ bàn › Gọi món). Ghi âm, gọi API, kiểu dữ liệu: lib/voiceOrder.ts.
 *
 *  - PosVoiceBar: nút micro bấm-giữ-để-nói (máy tính: giữ phím Space) + ô gõ chữ, rồi mở bảng xác nhận.
 *  - VoiceConfirm: sửa số lượng / size / nóng-đá / đá / đường / ghi chú, đổi món, nói tiếp để sửa; "Thêm vào đơn".
 * AI chỉ đề xuất — không bao giờ tự gửi bếp; giá hiển thị tính lại theo size như máy chủ.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2, Mic, Minus, Plus, RefreshCw, SendHorizontal, Trash2, X } from "lucide-react";
import { apiOrigin, TEMP_TEXT } from "../lib/api";
import {
  LOW_CONFIDENCE,
  MAX_RECORD_SEC,
  lineFromProduct,
  parseVoiceOrder,
  unitPriceFor,
  useVoiceRecorder,
  useVoiceStatus,
  type Level,
  type VoiceError,
  type VoiceLine,
  type VoiceResult,
} from "../lib/voiceOrder";
import type { PanelProduct } from "./TablePanel";
import "../styles/voice-order.css";

const imgUrl = (u: string | null) => (u ? (u.startsWith("http") ? u : `${apiOrigin()}${u}`) : null);
const vnd = (n: number) => `${new Intl.NumberFormat("vi-VN").format(n)}đ`;

/** Sóng âm + chấm đỏ + đồng hồ khi đang ghi */
export function RecordingIndicator({ seconds, level }: { seconds: number; level: number }) {
  return (
    <span className="vo-rec" role="status" aria-live="polite">
      <span className="vo-rec-dot" aria-hidden />
      <span className="vo-wave" aria-hidden>
        {[0.6, 1, 0.8, 1, 0.6].map((k, i) => <i key={i} style={{ transform: `scaleY(${0.25 + level * k * 0.75})` }} />)}
      </span>
      <span>
        0:{String(seconds).padStart(2, "0")} / 0:{MAX_RECORD_SEC}
      </span>
    </span>
  );
}

/* ═══════════ POS: thanh micro + ô gõ ═══════════ */

/** Space giữ để nói khi không gõ ở ô nhập */
const typingTarget = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(t.tagName));

export function PosVoiceBar({ products, onAdd }: { products: PanelProduct[]; onAdd: (lines: VoiceLine[]) => void }) {
  const status = useVoiceStatus();
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [lines, setLines] = useState<VoiceLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [off, setOff] = useState(false);
  const [text, setText] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const pressAt = useRef(0);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const open = !!result;

  const send = useCallback(async (input: { audio?: Blob; text?: string }) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await parseVoiceOrder({ ...input, current: linesRef.current });
      setResult(r);
      setLines(r.lines);
    } catch (e) {
      const ve = e as VoiceError;
      if (ve.status === 503) setOff(true);
      setErr(ve.status === 429 ? "Thử lại sau ít phút nhé." : ve.message || "Không hiểu được câu gọi món.");
    } finally {
      setBusy(false);
    }
  }, []);

  const rec = useVoiceRecorder((blob) => blob && void send({ audio: blob }));

  const press = () => {
    pressAt.current = Date.now();
    setHint(null);
    void rec.start();
  };
  const release = async () => {
    if (rec.state !== "recording" && !pressAt.current) return;
    const held = Date.now() - pressAt.current;
    pressAt.current = 0;
    const blob = await rec.stop();
    if (!blob) {
      if (held < 500) setHint("Giữ nút trong lúc nói, thả ra để gửi.");
      return;
    }
    void send({ audio: blob });
  };

  // Máy tính: giữ phím Space để nói (khi không gõ ở ô nhập)
  const recRef = useRef({ press, release, busy, canRecord: false });
  recRef.current = { press, release, busy, canRecord: rec.state === "idle" || rec.state === "recording" };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || typingTarget(e.target) || recRef.current.busy || !recRef.current.canRecord) return;
      e.preventDefault();
      recRef.current.press();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !pressAt.current) return;
      e.preventDefault();
      void recRef.current.release();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  if (!status?.pos || off) return off && err ? <div className="vo-off">{err} Gọi món bằng tay như bình thường.</div> : null;
  const canMic = rec.state === "idle" || rec.state === "recording";

  const mic = (big: boolean) =>
    canMic && (
      <button
        type="button"
        className={`vo-mic${big ? " is-big" : ""}${rec.state === "recording" ? " is-rec" : ""}`}
        onPointerDown={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          if (!busy) press();
        }}
        onPointerUp={() => void release()}
        onPointerCancel={() => void release()}
        onContextMenu={(e) => e.preventDefault()}
        disabled={busy}
        aria-label="Giữ để nói món (hoặc giữ phím Space)"
        title="Giữ để nói (hoặc giữ phím Space)"
      >
        {busy ? <Loader2 size={big ? 22 : 18} className="vo-spin" aria-hidden /> : <Mic size={big ? 22 : 18} aria-hidden />}
      </button>
    );

  const submitText = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    void send({ text: t });
  };

  const bar = (inSheet: boolean) => (
    <div className={inSheet ? "vo-bar is-sheet" : "vo-bar"}>
      {mic(!inSheet)}
      {rec.state === "recording" ? (
        <RecordingIndicator seconds={rec.seconds} level={rec.level} />
      ) : busy ? (
        <span className="vo-busy" role="status">Đang hiểu…</span>
      ) : (
        <input
          className="o-input vo-text"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 500))}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submitText())}
          placeholder={inSheet ? "Nói / gõ để sửa: “đổi bạc xỉu size L”" : canMic ? "Giữ mic để nói, hoặc gõ: 2 bạc xỉu ít đá…" : "Gõ món: 2 bạc xỉu ít đá, 1 croissant…"}
          aria-label="Gõ câu gọi món"
        />
      )}
      {rec.state !== "recording" && !busy && text.trim() && (
        <button type="button" className="vo-send" onClick={submitText} aria-label="Gửi câu gọi món"><SendHorizontal size={18} aria-hidden /></button>
      )}
    </div>
  );

  return (
    <>
      {bar(false)}
      {!open && (hint || err) && <div className={err ? "vo-msg is-err" : "vo-msg"}>{err ?? hint}</div>}
      {rec.state === "denied" && !open && <div className="vo-msg">Chưa cấp quyền micro — vẫn gõ chữ được.</div>}
      {open && result && (
        <VoiceConfirm
          result={result}
          lines={lines}
          setLines={setLines}
          products={products}
          error={err ?? hint}
          footerBar={bar(true)}
          onCancel={() => {
            setResult(null);
            setLines([]);
            setErr(null);
          }}
          onConfirm={() => {
            onAdd(lines);
            setResult(null);
            setLines([]);
          }}
        />
      )}
    </>
  );
}

/* ═══════════ Bảng xác nhận ═══════════ */

const SIZES = ["S", "M", "L"] as const;
function Chips<T extends string | number | null>({ value, options, onChange, label }: { value: T; options: { v: T; text: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="vo-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} type="button" className={o.v === value ? "vo-chip is-on" : "vo-chip"} aria-pressed={o.v === value} onClick={() => onChange(o.v)}>
          {o.text}
        </button>
      ))}
    </div>
  );
}

export function VoiceConfirm({
  result,
  lines,
  setLines,
  products,
  error,
  footerBar,
  onCancel,
  onConfirm,
  confirmLabel = "Thêm vào đơn",
}: {
  result: VoiceResult;
  lines: VoiceLine[];
  setLines: (fn: (l: VoiceLine[]) => VoiceLine[]) => void;
  products: PanelProduct[];
  error?: string | null;
  /** Thanh micro / ô gõ để nói tiếp sửa giỏ */
  footerBar?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  const [swap, setSwap] = useState<number | null>(null);
  const prodOf = (l: VoiceLine) => products.find((p) => p.id === l.productId);
  const upd = (i: number, patch: Partial<VoiceLine>) =>
    setLines((ls) =>
      ls.map((l, j) => {
        if (j !== i) return l;
        const n = { ...l, ...patch, confidence: patch.confidence ?? Math.max(l.confidence, LOW_CONFIDENCE) };
        if (n.temp !== "ICED") n.ice = null;
        n.unitPrice = n.comboId ? l.unitPrice : unitPriceFor(prodOf(n), n.size, l.unitPrice);
        return n;
      }),
    );
  const total = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <div className="vo-sheet-scrim" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <section className="vo-sheet" role="dialog" aria-modal="true" aria-labelledby="vo-title">
        <header className="vo-head">
          <div className="vo-head-text">
            <h3 id="vo-title">Xác nhận món</h3>
            {result.transcript && <p className="vo-heard">Nghe được: “{result.transcript}”</p>}
          </div>
          <button type="button" className="vo-icon" onClick={onCancel} aria-label="Đóng"><X size={18} aria-hidden /></button>
        </header>

        <div className="vo-body">
          {result.clarify && <p className="vo-clarify">{result.clarify}</p>}
          {lines.length === 0 && !result.unknown.length && !result.clarify && <p className="vo-empty">Chưa có món nào. Nói hoặc gõ lại món bạn muốn.</p>}

          <ul className="vo-lines">
            {lines.map((l, i) => {
              const low = l.confidence < LOW_CONFIDENCE;
              const img = imgUrl(l.imageUrl);
              return (
                <li key={`${l.productId ?? `c${l.comboId}`}-${i}`} className={`vo-line${low ? " is-low" : ""}${l.changed ? " is-changed" : ""}`}>
                  <div className="vo-line-top">
                    {img ? <img src={img} alt="" className="vo-thumb" /> : <span className="vo-thumb" />}
                    <div className="vo-line-main">
                      <div className="vo-name">
                        {l.name}
                        {low && <span className="vo-low"><AlertTriangle size={12} aria-hidden /> Kiểm tra lại</span>}
                      </div>
                      <div className="vo-price">{vnd(l.unitPrice)} × {l.qty} = <strong>{vnd(l.unitPrice * l.qty)}</strong></div>
                    </div>
                    <div className="vo-stepper">
                      <button type="button" onClick={() => (l.qty > 1 ? upd(i, { qty: l.qty - 1 }) : setLines((ls) => ls.filter((_, j) => j !== i)))} aria-label={l.qty > 1 ? `Bớt ${l.name}` : `Bỏ ${l.name}`}>
                        {l.qty > 1 ? <Minus size={14} aria-hidden /> : <Trash2 size={14} aria-hidden />}
                      </button>
                      <span aria-live="polite">{l.qty}</span>
                      <button type="button" onClick={() => upd(i, { qty: Math.min(20, l.qty + 1) })} aria-label={`Thêm ${l.name}`}><Plus size={14} aria-hidden /></button>
                    </div>
                  </div>
                  <div className="vo-opts">
                    {l.hasSizes && <Chips label="Size" value={l.size} options={SIZES.map((s) => ({ v: s, text: s }))} onChange={(v) => upd(i, { size: v })} />}
                    {l.temps.length > 1 && <Chips label="Nóng / đá" value={l.temp} options={l.temps.map((t) => ({ v: t, text: TEMP_TEXT[t] }))} onChange={(v) => upd(i, { temp: v })} />}
                    {l.temp === "ICED" && (
                      <Chips label="Đá" value={l.ice} options={[{ v: null, text: "Đá thường" }, { v: 50, text: "Ít đá" }, { v: 0, text: "Không đá" }]} onChange={(v) => upd(i, { ice: v as Level | null })} />
                    )}
                    {l.temps.length > 0 && (
                      <Chips label="Đường" value={l.sugar} options={[{ v: null, text: "Ngọt thường" }, { v: 50, text: "Ít đường" }, { v: 0, text: "Không đường" }]} onChange={(v) => upd(i, { sugar: v as Level | null })} />
                    )}
                  </div>
                  <div className="vo-line-foot">
                    <input className="o-input vo-note" value={l.note ?? ""} onChange={(e) => upd(i, { note: e.target.value.slice(0, 120) || null })} placeholder="Ghi chú (thêm trân châu…)" aria-label={`Ghi chú ${l.name}`} />
                    {!l.comboId && (
                      <button type="button" className={low ? "vo-swap is-low" : "vo-swap"} onClick={() => setSwap(swap === i ? null : i)}>
                        <RefreshCw size={13} aria-hidden /> Đổi món
                      </button>
                    )}
                  </div>
                  {swap === i && (
                    <select
                      className="o-input vo-swap-select"
                      autoFocus
                      value=""
                      onChange={(e) => {
                        const p = products.find((x) => x.id === Number(e.target.value));
                        if (p) setLines((ls) => ls.map((x, j) => (j === i ? lineFromProduct(p, x) : x)));
                        setSwap(null);
                      }}
                      aria-label="Chọn món khác"
                    >
                      <option value="" disabled>Chọn món khác…</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>

          {result.unknown.length > 0 && (
            <div className="vo-unknown">
              {result.unknown.map((u) => (
                <div key={u.spokenName} className="vo-unknown-item">
                  <p>
                    {u.reason === "soldout" ? <>Hiện đang hết <strong>{u.spokenName}</strong>.</> : <>Quán chưa có <strong>{u.spokenName}</strong>.</>}
                    {u.suggestions.length > 0 && " Thử:"}
                  </p>
                  {u.suggestions.length > 0 && (
                    <div className="vo-sugg">
                      {u.suggestions.map((s) => {
                        const p = products.find((x) => x.id === s.id);
                        return (
                          <button key={s.id} type="button" className="vo-chip" disabled={!p} onClick={() => p && setLines((ls) => [...ls, lineFromProduct(p)])}>
                            <Plus size={12} aria-hidden /> {s.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {error && <p className="vo-msg is-err">{error}</p>}
        </div>

        <footer className="vo-foot">
          {footerBar}
          <div className="vo-actions">
            <button type="button" className="o-btn o-btn-secondary" onClick={onCancel}>Hủy</button>
            <button type="button" className="o-btn o-btn-primary vo-confirm" disabled={!lines.length} onClick={onConfirm}>
              {confirmLabel}{count > 0 && ` · ${count} món · ${vnd(total)}`}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

