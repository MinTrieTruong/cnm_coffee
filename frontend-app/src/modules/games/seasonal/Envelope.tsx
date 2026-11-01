import type { CSSProperties } from "react";
import { Coins, Gift, Smile, TicketPercent } from "lucide-react";
import { mediaUrl } from "../../../lib/api";
import type { PrizeKind } from "../types";

export type EnvelopePrize = { label: string; imageUrl: string | null; kind: PrizeKind; points?: number | null };
export type EnvelopeState = "idle" | "picked" | "open" | "dim";

/** Pha màu #rrggbb về phía đen (t < 0) hoặc trắng (t > 0) */
function shade(hex: string, t: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  const to = t < 0 ? 0 : 255;
  const k = Math.abs(t);
  const ch = (v: number) => Math.round(v + (to - v) * k);
  return `rgb(${ch((n >> 16) & 255)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
}

/** Hoa mai nhỏ trang trí góc bao */
function Blossom({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  return (
    <g opacity={0.85}>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx={x} cy={y - r * 0.6} rx={r * 0.45} ry={r * 0.62} fill={fill} transform={`rotate(${a} ${x} ${y})`} />
      ))}
      <circle cx={x} cy={y} r={r * 0.28} fill={shade(fill, -0.35)} />
    </g>
  );
}

/** Tấm thiệp rút ra khỏi bao: lời chúc + quà */
function Card({ prize, greeting }: { prize: EnvelopePrize | null; greeting: string }) {
  const img = mediaUrl(prize?.imageUrl ?? null);
  const Icon = prize?.kind === "VOUCHER" ? TicketPercent : prize?.kind === "POINTS" ? Coins : prize?.kind === "NONE" ? Smile : Gift;
  return (
    <div className="lx-card" aria-hidden>
      <span className="lx-card-greet">{greeting}</span>
      {img ? <img src={img} alt="" /> : <Icon size={26} aria-hidden />}
      <strong>{prize?.label ?? ""}</strong>
      {prize?.kind === "POINTS" && prize.points ? <span>+{prize.points.toLocaleString("vi-VN")} điểm</span> : null}
    </div>
  );
}

/**
 * Một bao lì xì (SVG). `state`: idle = rung nhẹ chờ chọn · picked = đang mở (lắc) · open = nắp lật, thiệp trồi lên · dim = bao không chọn.
 */
export function Envelope({
  index,
  color,
  accent,
  text,
  greeting,
  state,
  prize,
  disabled,
  onPick,
}: {
  index: number;
  color: string;
  accent: string;
  text: string;
  greeting: string;
  state: EnvelopeState;
  prize: EnvelopePrize | null;
  disabled?: boolean;
  onPick?: () => void;
}) {
  const dark = shade(color, -0.22);
  const fs = text.length <= 2 ? 15 : text.length <= 4 ? 11 : 8;
  return (
    <button
      type="button"
      className={`lx-env is-${state}`}
      style={{ "--lx-i": index, "--lx-accent": accent } as CSSProperties}
      onClick={onPick}
      disabled={disabled}
      aria-label={`Bao lì xì số ${index + 1}`}
    >
      <svg viewBox="0 0 100 140" className="lx-svg" aria-hidden>
        <rect x={2} y={2} width={96} height={136} rx={9} fill={color} />
        <rect x={8} y={8} width={84} height={124} rx={6} fill="none" stroke={accent} strokeWidth={1.4} opacity={0.75} />
        <Blossom x={20} y={118} r={7} fill={accent} />
        <Blossom x={80} y={120} r={5.5} fill={accent} />
        <Blossom x={30} y={104} r={4} fill={accent} />
        <g className="lx-flap">
          <path d="M2 11 Q2 2 11 2 L89 2 Q98 2 98 11 L98 36 L50 66 L2 36 Z" fill={dark} />
          <path d="M8 36 L50 61 L92 36" fill="none" stroke={accent} strokeWidth={1.2} opacity={0.6} />
        </g>
        <g className="lx-seal">
          <circle cx={50} cy={66} r={17} fill={accent} />
          <circle cx={50} cy={66} r={13.5} fill="none" stroke={color} strokeWidth={1} opacity={0.6} />
          <text x={50} y={66.5} textAnchor="middle" dominantBaseline="middle" fontSize={fs} fontWeight={800} fill={color} style={{ fontFamily: "inherit" }}>{text}</text>
        </g>
      </svg>
      {state === "open" && <Card prize={prize} greeting={greeting} />}
    </button>
  );
}
