/**
 * Đặt nhanh bằng giọng nói / câu tự nhiên — trang khách.
 *
 *  - QuickOrderHost (gắn một lần ở PublicLayout): bảng xác nhận (bottom sheet trên điện thoại, popup trên máy tính).
 *  - openQuickOrder({ mic }) / openQuickOrder({ text }): mở từ ô tìm kiếm của trang Thực đơn / header.
 *  - QuickOrderMic: nút micro trong ô tìm kiếm (chạm để bắt đầu, chạm lại để dừng — điện thoại không giữ nút).
 *  - useQuickOrder(): tính năng có bật không (GET /api/voice-order/status web) và có micro không.
 * Món chỉ vào giỏ khi khách bấm "Thêm tất cả vào giỏ"; ghi chú theo đúng định dạng trang chi tiết món.
 * 429 → "thử lại sau ít phút"; 503 → ẩn tính năng tới khi tải lại trang.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowUp, Loader2, Mic, Minus, Plus, RefreshCw, Square, Trash2, X } from "lucide-react";
import { api, apiBase, mediaUrl, TEMP_TEXT, type MenuResponse, type Product } from "../../lib/api";
import { getToken } from "../../lib/session";
import { getStoreId } from "../../lib/customerStore";
import { sessionKey } from "../../lib/searchLog";
import { addComboToCart, addToCart, drinkNotes } from "../../lib/cart";
import { useLang } from "../../lib/i18n";
import { formatVnd } from "../../lib/site";
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
} from "../../lib/voiceOrder";
import "../../styles/quick-order.css";

const EVT = "cmn:quick-order";
type OpenDetail = { mic?: boolean; text?: string };
export const openQuickOrder = (d: OpenDetail) => window.dispatchEvent(new CustomEvent<OpenDetail>(EVT, { detail: d }));

/* Tắt sau 503 (tới khi tải lại trang) / micro bị từ chối — dùng chung giữa host và các nút */
const flags = { off: false, noMic: false };
const subs = new Set<() => void>();
const setFlag = (k: keyof typeof flags) => {
  flags[k] = true;
  subs.forEach((f) => f());
};
let snap = { ...flags };
const useFlags = () =>
  useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => (snap.off === flags.off && snap.noMic === flags.noMic ? snap : (snap = { ...flags })),
  );

const canRecord = () => typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

/** Có hiện "Đặt nhanh" / micro không */
export function useQuickOrder() {
  const status = useVoiceStatus();
  const f = useFlags();
  const enabled = !!status?.web && !f.off;
  return { enabled, mic: enabled && !f.noMic && canRecord() };
}

export function QuickOrderMic({ className }: { className?: string }) {
  const { t } = useLang();
  const { mic } = useQuickOrder();
  if (!mic) return null;
  return (
    <button type="button" className={`qo-mic-btn${className ? ` ${className}` : ""}`} onClick={() => openQuickOrder({ mic: true })} aria-label={t("Nói món bạn muốn")} title={t("Nói món bạn muốn")}>
      <Mic size={18} aria-hidden />
    </button>
  );
}

/** Gọi API bằng FormData (api() của trang khách luôn gửi JSON) — kèm token khách nếu đã đăng nhập */
async function customerCall(path: string, init: RequestInit): Promise<VoiceResult> {
  const headers = new Headers(init.headers);
  const tok = getToken();
  if (tok) headers.set("Authorization", `Bearer ${tok}`);
  const res = await fetch(`${apiBase()}${path}`, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as VoiceResult & { error?: string; reason?: string };
  if (!res.ok) throw Object.assign(new Error(data.error ?? data.reason ?? res.statusText), { status: res.status });
  return data;
}

/* Thực đơn chi nhánh (đổi món, tính lại giá khi đổi size) — tải khi mở lần đầu */
let menuCache: { store: number | null; products: Promise<Product[]> } | null = null;
function loadMenu(store: number | null) {
  if (!menuCache || menuCache.store !== store) {
    menuCache = { store, products: api<MenuResponse>(`/api/menu${store ? `?store=${store}` : ""}`).then((m) => m.products.filter((p) => !p.soldOut)).catch(() => []) };
  }
  return menuCache.products;
}

const LEVELS: Level[] = [100, 50, 0];

function Chips<T extends string | number | null>({ value, options, onChange, label }: { value: T; options: { v: T; text: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="qo-chips" role="group" aria-label={label}>
      <span className="qo-chips-label">{label}</span>
      {options.map((o) => (
        <button key={String(o.v)} type="button" className={o.v === value ? "qo-chip is-on" : "qo-chip"} aria-pressed={o.v === value} onClick={() => onChange(o.v)}>
          {o.text}
        </button>
      ))}
    </div>
  );
}

export function QuickOrderHost() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [lines, setLines] = useState<VoiceLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [menu, setMenu] = useState<Product[]>([]);
  const [swap, setSwap] = useState<number | null>(null);
  const [toast, setToast] = useState<number | null>(null);
  const linesRef = useRef(lines);
  linesRef.current = lines;

  const send = useCallback(
    async (input: { audio?: Blob; text?: string }) => {
      setBusy(true);
      setErr(null);
      try {
        const r = await parseVoiceOrder(
          { ...input, current: linesRef.current, extra: { store: String(getStoreId() ?? ""), sessionKey: sessionKey() } },
          customerCall,
        );
        setResult(r);
        setLines(r.lines);
      } catch (e) {
        const ve = e as VoiceError;
        if (ve.status === 503) {
          setFlag("off");
          setErr(t("Tính năng đặt nhanh đang tạm tắt. Bạn chọn món trên thực đơn nhé."));
        } else setErr(ve.status === 429 ? t("Bạn thử lại sau ít phút nhé") : ve.message || t("Chưa hiểu món bạn muốn, bạn nói lại giúp nhé."));
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  const rec = useVoiceRecorder((blob) => blob && void send({ audio: blob }));
  const recState = rec.state;
  useEffect(() => {
    if (recState === "denied" || recState === "unsupported") setFlag("noMic");
  }, [recState]);

  const toggleMic = async () => {
    if (rec.state === "recording") {
      const blob = await rec.stop();
      if (blob) void send({ audio: blob });
      else setErr(t("Chưa nghe được gì, bạn nói lại giúp nhé."));
    } else if (!busy) {
      setErr(null);
      void rec.start();
    }
  };

  // Mở từ ô tìm kiếm (micro → bắt đầu ghi ngay trong cùng lần chạm, để trình duyệt cho xin quyền micro)
  const startRef = useRef(rec.start);
  startRef.current = rec.start;
  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<OpenDetail>).detail ?? {};
      setOpen(true);
      setErr(null);
      setSwap(null);
      void loadMenu(getStoreId()).then(setMenu);
      if (d.mic) void startRef.current();
      else if (d.text?.trim()) {
        setResult(null);
        setLines([]);
        linesRef.current = [];
        void send({ text: d.text.trim().slice(0, 500) });
      }
    };
    window.addEventListener(EVT, onOpen);
    return () => window.removeEventListener(EVT, onOpen);
  }, [send]);

  const close = useCallback(() => {
    if (rec.state === "recording") void rec.stop();
    setOpen(false);
    setResult(null);
    setLines([]);
    setErr(null);
    setText("");
  }, [rec]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    // Khóa cuộn trang phía sau
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  useEffect(() => {
    if (toast == null) return;
    const id = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const prodOf = (l: VoiceLine) => menu.find((p) => p.id === l.productId);
  const upd = (i: number, patch: Partial<VoiceLine>) =>
    setLines((ls) =>
      ls.map((l, j) => {
        if (j !== i) return l;
        const n = { ...l, ...patch, confidence: Math.max(l.confidence, LOW_CONFIDENCE) };
        if (n.temp !== "ICED") n.ice = null;
        n.unitPrice = n.comboId ? l.unitPrice : unitPriceFor(prodOf(n), n.size, l.unitPrice);
        return n;
      }),
    );

  const addAll = () => {
    let n = 0;
    for (const l of lines) {
      if (l.comboId) {
        for (let k = 0; k < l.qty; k++) addComboToCart({ id: l.comboId, name: l.name, imageUrl: l.imageUrl, comboPrice: l.unitPrice, originalPrice: l.unitPrice, isHot: false, isActive: true, items: [] });
        n += l.qty;
        continue;
      }
      if (!l.productId) continue;
      const food = !l.hasSizes;
      const size = food ? "M" : l.size ?? "M";
      const icePct: Level = food || l.temp !== "ICED" ? 100 : l.ice ?? 100;
      const sugar = String(food ? 100 : l.sugar ?? 100) as "0" | "50" | "100";
      // Cùng định dạng trang chi tiết món: "Size L · Đá 50% · Đường 50% · ghi chú"
      const notes = [food ? "" : drinkNotes({ size, temp: l.temp, icePct, sugar }), l.note?.trim() ?? ""].filter(Boolean).join(" · ");
      addToCart({ id: l.productId, name: l.name, imageUrl: l.imageUrl } as Product, { unitPrice: l.unitPrice, quantity: l.qty, size, temp: l.temp, icePct, sugar, notes });
      n += l.qty;
    }
    close();
    setToast(n);
  };

  const submitText = () => {
    const s = text.trim();
    if (!s || busy) return;
    setText("");
    void send({ text: s.slice(0, 500) });
  };

  const total = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const recording = rec.state === "recording";
  const micOk = rec.state === "idle" || recording;

  return (
    <>
      {toast != null && (
        <div className="qo-toast" role="status">
          <span>{t("Đã thêm {n} món vào giỏ", { n: toast })}</span>
          <Link to="/cart" onClick={() => setToast(null)}>{t("Xem giỏ")}</Link>
          <button type="button" onClick={() => setToast(null)} aria-label={t("Đóng")}><X size={16} aria-hidden /></button>
        </div>
      )}
      {open && (
        <div className="qo-back" onClick={(e) => e.target === e.currentTarget && close()}>
          <section className="qo-sheet" role="dialog" aria-modal="true" aria-labelledby="qo-title">
            <header className="qo-head">
              <div className="qo-head-text">
                <h2 id="qo-title">{t("Đặt nhanh")}</h2>
                {result?.transcript && <p className="qo-heard">{t("Bạn muốn:")} “{result.transcript}”</p>}
              </div>
              <button type="button" className="qo-x" onClick={close} aria-label={t("Đóng")}><X size={20} aria-hidden /></button>
            </header>

            <div className="qo-body">
              {!result && !busy && !recording && !err && <p className="qo-hint">{t("Nói hoặc gõ món bạn muốn. Thử nói: “Hai bạc xỉu ít đá, một bánh mì que”.")}</p>}
              {recording && !result && (
                <div className="qo-listen">
                  <span className="qo-listen-ring" style={{ transform: `scale(${1 + rec.level * 0.5})` }} aria-hidden />
                  <p>{t("Đang nghe… chạm nút đỏ khi nói xong")}</p>
                  <span className="qo-timer">0:{String(rec.seconds).padStart(2, "0")} / 0:{MAX_RECORD_SEC}</span>
                </div>
              )}
              {busy && !result && (
                <div className="qo-listen">
                  <Loader2 size={28} className="qo-spin" aria-hidden />
                  <p>{t("Đang hiểu món bạn chọn…")}</p>
                </div>
              )}
              {result?.clarify && <p className="qo-clarify">{result.clarify}</p>}

              {lines.length > 0 && (
                <ul className="qo-lines">
                  {lines.map((l, i) => {
                    const low = l.confidence < LOW_CONFIDENCE;
                    const img = mediaUrl(l.imageUrl);
                    return (
                      <li key={`${l.productId ?? `c${l.comboId}`}-${i}`} className={low ? "qo-line is-low" : "qo-line"}>
                        <div className="qo-line-top">
                          {img ? <img src={img} alt="" className="qo-thumb" /> : <span className="qo-thumb" />}
                          <div className="qo-line-main">
                            <div className="qo-name">
                              {l.name}
                              {low && <span className="qo-check"><AlertTriangle size={12} aria-hidden /> {t("Kiểm tra lại")}</span>}
                            </div>
                            <div className="qo-price">{formatVnd(l.unitPrice)}</div>
                          </div>
                          <div className="qo-step">
                            <button type="button" onClick={() => (l.qty > 1 ? upd(i, { qty: l.qty - 1 }) : setLines((ls) => ls.filter((_, j) => j !== i)))} aria-label={l.qty > 1 ? t("Bớt") : t("Bỏ món")}>
                              {l.qty > 1 ? <Minus size={14} aria-hidden /> : <Trash2 size={14} aria-hidden />}
                            </button>
                            <span aria-live="polite">{l.qty}</span>
                            <button type="button" onClick={() => upd(i, { qty: Math.min(20, l.qty + 1) })} aria-label={t("Thêm")}><Plus size={14} aria-hidden /></button>
                          </div>
                        </div>
                        <div className="qo-opts">
                          {l.hasSizes && <Chips label={t("Size")} value={l.size} options={(["S", "M", "L"] as const).map((s) => ({ v: s, text: s }))} onChange={(v) => upd(i, { size: v })} />}
                          {l.temps.length > 1 && <Chips label={t("Kiểu")} value={l.temp} options={l.temps.map((x) => ({ v: x, text: t(TEMP_TEXT[x]) }))} onChange={(v) => upd(i, { temp: v })} />}
                          {l.temp === "ICED" && <Chips label={t("Đá")} value={l.ice ?? 100} options={LEVELS.map((v) => ({ v, text: `${v}%` }))} onChange={(v) => upd(i, { ice: v })} />}
                          {l.temps.length > 0 && <Chips label={t("Đường")} value={l.sugar ?? 100} options={LEVELS.map((v) => ({ v, text: `${v}%` }))} onChange={(v) => upd(i, { sugar: v })} />}
                        </div>
                        <div className="qo-line-foot">
                          <input className="c-input qo-note" value={l.note ?? ""} onChange={(e) => upd(i, { note: e.target.value.slice(0, 120) || null })} placeholder={t("Ghi chú (thêm trân châu…)")} aria-label={t("Ghi chú")} />
                          {!l.comboId && menu.length > 0 && (
                            <button type="button" className={low ? "qo-swap is-low" : "qo-swap"} onClick={() => setSwap(swap === i ? null : i)}>
                              <RefreshCw size={13} aria-hidden /> {t("Đổi món")}
                            </button>
                          )}
                        </div>
                        {swap === i && (
                          <select
                            className="c-input qo-swap-select"
                            autoFocus
                            value=""
                            aria-label={t("Chọn món khác")}
                            onChange={(e) => {
                              const p = menu.find((x) => x.id === Number(e.target.value));
                              if (p) setLines((ls) => ls.map((x, j) => (j === i ? lineFromProduct(p, x) : x)));
                              setSwap(null);
                            }}
                          >
                            <option value="" disabled>{t("Chọn món khác…")}</option>
                            {menu.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {result && result.unknown.length > 0 && (
                <div className="qo-unknown">
                  {result.unknown.map((u) => (
                    <div key={u.spokenName} className="qo-unknown-item">
                      <p>
                        {u.reason === "soldout" ? t("Hiện quán đang hết {name}.", { name: u.spokenName }) : t("Quán chưa có {name}.", { name: u.spokenName })}
                        {u.suggestions.length > 0 && ` ${t("Bạn thử:")}`}
                      </p>
                      {u.suggestions.length > 0 && (
                        <div className="qo-sugg">
                          {u.suggestions.map((s) => {
                            const p = menu.find((x) => x.id === s.id);
                            return (
                              <button key={s.id} type="button" className="qo-chip" disabled={!p} onClick={() => p && setLines((ls) => [...ls, lineFromProduct(p)])}>
                                <Plus size={12} aria-hidden /> {s.name} · {formatVnd(s.price)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {result && !lines.length && !result.unknown.length && !result.clarify && <p className="qo-hint">{t("Chưa có món nào. Bạn nói hoặc gõ lại món muốn đặt nhé.")}</p>}
              {err && <p className="qo-err" role="alert">{err}</p>}
            </div>

            <footer className="qo-foot">
              <div className="qo-input">
                {micOk && (
                  <button type="button" className={recording ? "qo-mic is-rec" : "qo-mic"} onClick={() => void toggleMic()} disabled={busy} aria-label={recording ? t("Dừng ghi âm") : t("Nói món bạn muốn")}>
                    {busy ? <Loader2 size={18} className="qo-spin" aria-hidden /> : recording ? <Square size={16} aria-hidden /> : <Mic size={18} aria-hidden />}
                  </button>
                )}
                {recording ? (
                  <span className="qo-rec-text" role="status">{t("Đang nghe…")} 0:{String(rec.seconds).padStart(2, "0")}</span>
                ) : (
                  <input
                    className="c-input qo-text"
                    value={text}
                    onChange={(e) => setText(e.target.value.slice(0, 500))}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submitText())}
                    placeholder={result ? t("Nói / gõ để sửa: “đổi bạc xỉu size L”") : t("VD: 2 bạc xỉu ít đá, 1 bánh mì que")}
                    aria-label={t("Gõ món bạn muốn")}
                    disabled={busy}
                  />
                )}
                {!recording && text.trim() && (
                  <button type="button" className="qo-send" onClick={submitText} disabled={busy} aria-label={t("Gửi")}><ArrowUp size={18} aria-hidden /></button>
                )}
              </div>
              {lines.length > 0 && (
                <button type="button" className="c-btn qo-add" onClick={addAll}>
                  {t("Thêm tất cả vào giỏ")} · {count} {t("món")} · {formatVnd(total)}
                </button>
              )}
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
