/**
 * lib/voiceOrder.ts — Đặt món bằng giọng nói / câu tự nhiên: phần dùng chung cho POS (components/VoiceOrder.tsx)
 * và web khách (components/site/QuickOrder.tsx): kiểu dữ liệu, gọi API, trạng thái bật / tắt, ghi âm.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiOrigin, type Temp } from "./api";
import { staffApi } from "./staffApi";

/* ═══════════ Kiểu dữ liệu (khớp backend lib/voiceOrder/parse.ts) ═══════════ */

export type Level = 0 | 50 | 100;
export type VoiceLine = {
  productId: number | null;
  comboId: number | null;
  qty: number;
  size: "S" | "M" | "L" | null;
  temp: Temp | null;
  ice: Level | null;
  sugar: Level | null;
  note: string | null;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  hasSizes: boolean;
  temps: Temp[];
  confidence: number;
  changed: boolean;
};
export type VoiceUnknown = { spokenName: string; reason: "missing" | "soldout"; suggestions: { id: number; name: string; imageUrl: string | null; price: number }[] };
export type VoiceResult = { transcript: string; intent: string; lines: VoiceLine[]; unknown: VoiceUnknown[]; clarify: string | null };

/** Lỗi gọi API: 503 = tính năng tắt / AI lỗi, 429 = quá số lần */
export type VoiceError = Error & { status?: number };

export const LOW_CONFIDENCE = 0.7;
export const MAX_RECORD_SEC = 20;
export const LEVEL_TEXT: Record<"ice" | "sugar", Record<Level, string>> = {
  ice: { 0: "Không đá", 50: "Ít đá", 100: "Nhiều đá" },
  sugar: { 0: "Không đường", 50: "Ít đường", 100: "Đường bình thường" },
};

/** Ghi chú cho bếp từ tùy chọn: "Ít đá · Ít đường · thêm trân châu" (100% = bình thường, không ghi) */
export function voiceNote(l: Pick<VoiceLine, "ice" | "sugar" | "note">) {
  return [l.ice != null && l.ice !== 100 ? LEVEL_TEXT.ice[l.ice] : "", l.sugar != null && l.sugar !== 100 ? LEVEL_TEXT.sugar[l.sugar] : "", l.note?.trim() ?? ""].filter(Boolean).join(" · ");
}


/* ═══════════ API ═══════════ */

/** Giỏ gửi kèm khi nói tiếp để sửa — chỉ các trường lựa chọn, giá / tên do máy chủ tính lại */
const toCurrent = (lines: VoiceLine[]) => lines.map(({ productId, comboId, qty, size, temp, ice, sugar, note }) => ({ productId, comboId, qty, size, temp, ice, sugar, note }));

export async function parseVoiceOrder(input: { audio?: Blob; text?: string; current?: VoiceLine[]; extra?: Record<string, string> }, call: (path: string, init: RequestInit) => Promise<VoiceResult> = staffApi) {
  const fd = new FormData();
  if (input.audio) fd.append("audio", input.audio, `voice.${input.audio.type.includes("mp4") ? "m4a" : input.audio.type.includes("ogg") ? "ogg" : "webm"}`);
  if (input.text) fd.append("text", input.text);
  if (input.current?.length) fd.append("current", JSON.stringify(toCurrent(input.current)));
  for (const [k, v] of Object.entries(input.extra ?? {})) fd.append(k, v);
  return call("/api/voice-order/parse", { method: "POST", body: fd });
}

let statusCache: Promise<{ pos: boolean; web: boolean }> | null = null;
/** Tính năng có bật không (POS / web) — đọc một lần mỗi lần tải trang */
export function useVoiceStatus(): { pos: boolean; web: boolean } | null {
  const [s, setS] = useState<{ pos: boolean; web: boolean } | null>(null);
  useEffect(() => {
    statusCache ??= fetch(`${apiOrigin()}/api/voice-order/status`)
      .then((r) => (r.ok ? (r.json() as Promise<{ pos: boolean; web: boolean }>) : { pos: false, web: false }))
      .catch(() => ({ pos: false, web: false }));
    let alive = true;
    void statusCache.then((v) => alive && setS(v));
    return () => {
      alive = false;
    };
  }, []);
  return s;
}

/* ═══════════ Ghi âm ═══════════ */

export const pickMime = () => {
  if (typeof MediaRecorder === "undefined") return null;
  // Chrome / Edge / Firefox: webm-opus; Safari / iPhone: mp4 (aac)
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
};

type RecSession = { mr: MediaRecorder; chunks: Blob[]; stream: MediaStream; started: number; timer: number; raf: number; ctx?: AudioContext; done?: (b: Blob | null) => void };

export type RecorderState = "idle" | "recording" | "unsupported" | "denied";

/**
 * Ghi âm: start() xin quyền micro (lần đầu) và bắt đầu; stop() trả Blob (null nếu quá ngắn / lỗi).
 * Tự dừng sau 20 giây (onAutoStop nhận Blob). `level` 0–1 để vẽ sóng âm.
 */
export function useVoiceRecorder(onAutoStop?: (b: Blob | null) => void) {
  const supported = typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && pickMime() !== null;
  const [state, setState] = useState<RecorderState>(supported ? "idle" : "unsupported");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const rec = useRef<RecSession | null>(null);
  const autoRef = useRef(onAutoStop);
  autoRef.current = onAutoStop;
  /** Bấm rồi thả trước khi micro sẵn sàng → dừng ngay khi vừa bắt đầu */
  const cancelled = useRef(false);

  const cleanup = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    window.clearInterval(r.timer);
    cancelAnimationFrame(r.raf);
    r.stream.getTracks().forEach((t) => t.stop());
    void r.ctx?.close().catch(() => {});
    rec.current = null;
    setLevel(0);
  }, []);

  const stop = useCallback((): Promise<Blob | null> => {
    const r = rec.current;
    if (!r) {
      cancelled.current = true;
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      r.done = resolve;
      if (r.mr.state !== "inactive") r.mr.stop();
      else resolve(null);
    });
  }, []);

  const start = useCallback(async () => {
    if (rec.current || state === "unsupported") return;
    cancelled.current = false;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setState("denied");
      return;
    }
    const mime = pickMime() ?? "";
    const mr = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32_000 });
    const r: RecSession = { mr, chunks: [], stream, started: Date.now(), timer: 0, raf: 0 };
    rec.current = r;
    mr.ondataavailable = (e) => e.data.size && r.chunks.push(e.data);
    mr.onstop = () => {
      const ms = Date.now() - r.started;
      const blob = ms < 500 || !r.chunks.length ? null : new Blob(r.chunks, { type: (mr.mimeType || mime || "audio/webm").split(";")[0] });
      const done = r.done;
      cleanup();
      setState((s) => (s === "recording" ? "idle" : s));
      if (done) done(blob);
      else autoRef.current?.(blob);
    };
    // Sóng âm: mức âm lượng trung bình
    try {
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const tick = () => {
        an.getByteFrequencyData(buf);
        setLevel(Math.min(1, buf.reduce((s, v) => s + v, 0) / buf.length / 90));
        r.raf = requestAnimationFrame(tick);
      };
      r.ctx = ctx;
      r.raf = requestAnimationFrame(tick);
    } catch {
      /* không có sóng âm cũng được */
    }
    setSeconds(0);
    r.timer = window.setInterval(() => {
      const sec = Math.floor((Date.now() - r.started) / 1000);
      setSeconds(sec);
      if (sec >= MAX_RECORD_SEC && mr.state !== "inactive") mr.stop();
    }, 250);
    mr.start(250);
    setState("recording");
    if (cancelled.current) void stop();
  }, [state, cleanup, stop]);

  useEffect(() => () => {
    rec.current?.mr.state !== "inactive" && rec.current?.mr.stop();
    cleanup();
  }, [cleanup]);

  return { state, seconds, level, start, stop };
}

/** Giá 1 ly theo size như máy chủ (lib/menuPrice): S/L trống → M − 3.000đ / M + 5.000đ, trừ % giảm. Không có món → giá cũ */
export function unitPriceFor(
  p: { sellPrice: number; priceSizeS?: number | null; priceSizeL?: number | null; discountPercent?: number | null } | undefined,
  size: "S" | "M" | "L" | null,
  fallback: number,
) {
  if (!p) return fallback;
  const s = size ?? "M";
  const base = s === "S" ? p.priceSizeS ?? Math.max(0, p.sellPrice - 3000) : s === "L" ? p.priceSizeL ?? p.sellPrice + 5000 : p.sellPrice;
  return p.discountPercent && p.discountPercent > 0 ? Math.round(base * (1 - p.discountPercent / 100)) : base;
}

/** Từ chỉ số lượng / tùy chọn khi gọi món (không gồm "đá", "nóng", "sữa"… vì đó cũng là chữ trong tên món) */
const ORDER_WORDS = new Set(
  "một mot hai ba bốn bon năm sáu bảy bay tám chín chin mười muoi chục chuc cặp cap đôi ly cốc coc phần ít it không khong size với voi vs thêm them nhỏ lớn bự".split(" "),
);

/** Câu trông như gọi món (có số / từ chỉ số lượng, tùy chọn; ≥ 2 từ) → hiện "Đặt nhanh"; gõ tên món kiểu tìm kiếm thì vẫn là tìm kiếm */
export function looksLikeOrder(text: string) {
  const words = text.trim().toLowerCase().split(/[\s,.;]+/).filter(Boolean);
  return words.length >= 2 && words.some((w) => /\d/.test(w) || ORDER_WORDS.has(w));
}

/** Dòng món mới từ một món của thực đơn (gợi ý / đổi món) */
export type MenuItemLike = {
  id: number;
  name: string;
  imageUrl: string | null;
  sellPrice: number;
  priceSizeS?: number | null;
  priceSizeL?: number | null;
  discountPercent?: number | null;
  hasSizes?: boolean;
  temps?: "BOTH" | "ICED" | "HOT" | "NONE";
};

export function lineFromProduct(p: MenuItemLike, base?: Partial<VoiceLine>): VoiceLine {
  const hasSizes = p.hasSizes !== false;
  const temps: Temp[] = !hasSizes || p.temps === "NONE" ? [] : p.temps === "HOT" ? ["HOT"] : p.temps === "ICED" ? ["ICED"] : ["ICED", "HOT"];
  const size = hasSizes ? base?.size ?? "M" : null;
  const temp = temps.length ? (base?.temp && temps.includes(base.temp) ? base.temp : temps[0]) : null;
  return {
    productId: p.id, comboId: null, qty: base?.qty ?? 1, size, temp,
    ice: temp === "ICED" ? base?.ice ?? null : null, sugar: temps.length ? base?.sugar ?? null : null, note: base?.note ?? null,
    name: p.name, imageUrl: p.imageUrl, unitPrice: unitPriceFor(p, size, p.sellPrice), hasSizes, temps, confidence: 1, changed: true,
  };
}
