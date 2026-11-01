import { useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import { Coins, Gift, Smile, TicketPercent } from "lucide-react";
import { mediaUrl } from "../../../lib/api";
import type { PrizeKind } from "../types";

export type CardPrize = { label: string; imageUrl: string | null; kind: PrizeKind; color?: string | null; points?: number | null };

/** Bút cào (px CSS) và chu kỳ đo phần đã cào */
const BRUSH = 34;
const CHECK_MS = 120;

/** Phần thưởng nằm dưới lớp phủ */
export function PrizeFace({ prize, placeholder }: { prize: CardPrize | null; placeholder?: string }) {
  if (!prize) return <div className="gs-prize gs-prize-empty">{placeholder ?? "?"}</div>;
  const img = mediaUrl(prize.imageUrl);
  const Icon = prize.kind === "VOUCHER" ? TicketPercent : prize.kind === "POINTS" ? Coins : prize.kind === "NONE" ? Smile : Gift;
  return (
    <div className={`gs-prize${prize.kind === "NONE" ? " lose" : ""}`} style={prize.color ? ({ "--gs-prize-bg": prize.color } as CSSProperties) : undefined}>
      {img ? <img src={img} alt="" /> : <Icon size={34} aria-hidden />}
      <strong>{prize.label}</strong>
      {prize.kind === "POINTS" && prize.points ? <span>+{prize.points.toLocaleString("vi-VN")} điểm</span> : null}
    </div>
  );
}

/** Vẽ lớp phủ bạc: nền màu, hạt lấp lánh, sọc chéo mờ, chữ ở giữa */
function paintCover(cv: HTMLCanvasElement, color: string, text: string) {
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const { width: w, height: h } = cv;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, color);
  g.addColorStop(0.5, shade(color, 0.18));
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Sọc chéo
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = Math.max(2, w / 90);
  for (let x = -h; x < w; x += w / 14) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + h, 0);
    ctx.stroke();
  }
  // Hạt lấp lánh (cố định theo kích thước để không nhấp nháy khi vẽ lại)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const dots = Math.round((w * h) / 900);
  for (let i = 0; i < dots; i++) {
    ctx.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.10)";
    ctx.fillRect(rnd() * w, rnd() * h, 1.5 * (w / 400), 1.5 * (w / 400));
  }
  if (text) {
    const size = Math.round(Math.min(h * 0.2, w * 0.09));
    ctx.font = `800 ${size}px "Be Vietnam Pro", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillText(text, w / 2 + 2, h / 2 + 2);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(text, w / 2, h / 2);
  }
}

/** Làm sáng (t > 0) màu #rrggbb */
function shade(hex: string, t: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  const ch = (v: number) => Math.round(v + (255 - v) * t);
  return `rgb(${ch((n >> 16) & 255)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
}

/**
 * Thẻ cào: phần thưởng ở dưới, canvas phủ bạc ở trên. Khách cào (chuột / ngón tay) → xoá dần lớp phủ;
 * cào đủ `revealPercent` thì lớp phủ mờ đi và gọi onReveal. `cardKey` đổi = thẻ mới (vẽ lại lớp phủ).
 */
export function ScratchCard({
  cardKey,
  prize,
  coverColor,
  coverText,
  cardColor,
  revealPercent,
  active,
  revealed,
  onReveal,
}: {
  cardKey: number;
  prize: CardPrize | null;
  coverColor: string;
  coverText: string;
  cardColor: string;
  revealPercent: number;
  /** Cho phép cào (đã có kết quả) */
  active: boolean;
  revealed: boolean;
  onReveal: () => void;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const lastCheck = useRef(0);
  const done = useRef(false);
  const dirty = useRef(false);
  const drawing = useRef(false);

  const repaint = useCallback(() => {
    const el = cv.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = Math.max(1, Math.round(r.width * dpr));
    el.height = Math.max(1, Math.round(r.height * dpr));
    paintCover(el, coverColor, coverText);
  }, [coverColor, coverText]);

  // Thẻ mới → lớp phủ nguyên vẹn trước khi phần thưởng kịp hiện bên dưới
  useLayoutEffect(() => {
    done.current = false;
    dirty.current = false;
    repaint();
  }, [cardKey, repaint]);

  // Đổi cỡ (xoay máy) khi chưa cào thì vẽ lại cho nét; đã cào dở thì giữ nguyên
  useEffect(() => {
    const el = cv.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (!dirty.current) repaint();
    });
    ro.observe(el);
    // Font chữ lớp phủ tải xong sau lần vẽ đầu → vẽ lại cho đúng font
    void document.fonts?.ready.then(() => {
      if (!dirty.current) repaint();
    });
    return () => ro.disconnect();
  }, [repaint]);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const el = cv.current!;
    const r = el.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * el.width, y: ((e.clientY - r.top) / r.height) * el.height, scale: el.width / r.width };
  }

  function scratch(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = cv.current?.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = BRUSH * p.scale;
    ctx.beginPath();
    const from = last.current ?? p;
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(p.x + 0.01, p.y);
    ctx.stroke();
    last.current = p;
    dirty.current = true;
  }

  /** Tỉ lệ đã cào: lấy mẫu kênh alpha thưa (mỗi 6 điểm ảnh) */
  function check() {
    const el = cv.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx || done.current) return;
    const { data } = ctx.getImageData(0, 0, el.width, el.height);
    const step = 6;
    let total = 0;
    let clear = 0;
    for (let y = 0; y < el.height; y += step) {
      for (let x = 0; x < el.width; x += step) {
        total++;
        if (data[(y * el.width + x) * 4 + 3] < 64) clear++;
      }
    }
    if (total && (clear / total) * 100 >= revealPercent) {
      done.current = true;
      onReveal();
    }
  }

  return (
    <div className="gs-card" style={{ "--gs-card": cardColor } as CSSProperties}>
      <div className="gs-face">
        <div className="gs-title">Thẻ cào may mắn</div>
        <div className="gs-area">
          <PrizeFace prize={prize} />
          <canvas
            ref={cv}
            className={`gs-cover${active && !revealed ? " is-active" : ""}${revealed ? " is-gone" : ""}`}
            aria-hidden
            onPointerDown={(e) => {
              if (!active || revealed) return;
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                /* không bắt được con trỏ: vẫn cào trong khung */
              }
              drawing.current = true;
              last.current = null;
              scratch(e);
            }}
            onPointerMove={(e) => {
              if (!active || revealed || !drawing.current) return;
              scratch(e);
              const now = performance.now();
              if (now - lastCheck.current > CHECK_MS) {
                lastCheck.current = now;
                check();
              }
            }}
            onPointerUp={() => {
              drawing.current = false;
              last.current = null;
              if (active && !revealed) check();
            }}
            onPointerCancel={() => {
              drawing.current = false;
              last.current = null;
            }}
          />
        </div>
        <div className="gs-perf" aria-hidden />
      </div>
    </div>
  );
}
