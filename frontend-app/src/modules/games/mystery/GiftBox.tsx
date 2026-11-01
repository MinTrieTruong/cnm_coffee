import type { CSSProperties } from "react";
import { Coins, Gift, Smile, TicketPercent } from "lucide-react";
import { mediaUrl } from "../../../lib/api";
import type { PickItemProps } from "../PickOneGame";

/** Bảng màu khi bật "mỗi hộp một màu" — tránh vàng để ruy băng vàng vẫn nổi */
export const BOX_PALETTE = ["#7C3AED", "#E11D48", "#0EA5E9", "#16A34A", "#DB2777", "#2563EB", "#EA580C", "#0D9488", "#4F46E5"];

/** Pha màu #rrggbb về phía đen (t < 0) hoặc trắng (t > 0) */
function shade(hex: string, t: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  const to = t < 0 ? 0 : 255;
  const k = Math.abs(t);
  const ch = (v: number) => Math.round(v + (to - v) * k);
  return `rgb(${ch((n >> 16) & 255)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
}

/**
 * Một hộp quà (SVG). idle = nảy nhẹ chờ chọn · picked = lắc · open = nắp bung lên, tia sáng + thẻ quà trồi lên · dim = hộp không chọn.
 */
export function GiftBox({ index, state, prize, disabled, onPick, color, ribbon }: PickItemProps & { color: string; ribbon: string }) {
  const img = mediaUrl(prize?.imageUrl ?? null);
  const Icon = prize?.kind === "VOUCHER" ? TicketPercent : prize?.kind === "POINTS" ? Coins : prize?.kind === "NONE" ? Smile : Gift;
  return (
    <button
      type="button"
      className={`lx-env mb-box is-${state}`}
      style={{ "--lx-i": index, "--lx-accent": ribbon } as CSSProperties}
      onClick={onPick}
      disabled={disabled}
      aria-label={`Hộp quà số ${index + 1}`}
    >
      {state === "open" && <span className="mb-burst" aria-hidden />}
      <svg viewBox="0 0 100 110" className="lx-svg" aria-hidden>
        <ellipse cx={50} cy={104} rx={40} ry={4.5} fill="rgba(0,0,0,0.14)" />
        <rect x={12} y={46} width={76} height={56} rx={4} fill={color} />
        <rect x={12} y={46} width={76} height={7} fill={shade(color, -0.35)} opacity={0.5} />
        <rect x={44} y={46} width={12} height={56} fill={ribbon} />
        <text x={28} y={80} textAnchor="middle" fontSize={18} fontWeight={800} fill="#fff" opacity={0.45}>?</text>
        <text x={72} y={80} textAnchor="middle" fontSize={18} fontWeight={800} fill="#fff" opacity={0.45}>?</text>
        <g className="mb-lid">
          <rect x={6} y={32} width={88} height={16} rx={3} fill={shade(color, 0.12)} />
          <rect x={44} y={32} width={12} height={16} fill={ribbon} />
          <ellipse cx={39} cy={25} rx={11} ry={6.5} fill="none" stroke={ribbon} strokeWidth={4} transform="rotate(-22 39 25)" />
          <ellipse cx={61} cy={25} rx={11} ry={6.5} fill="none" stroke={ribbon} strokeWidth={4} transform="rotate(22 61 25)" />
          <circle cx={50} cy={30} r={5} fill={shade(ribbon, -0.12)} />
        </g>
      </svg>
      {state === "open" && (
        <div className="lx-card mb-card" aria-hidden>
          {img ? <img src={img} alt="" /> : <Icon size={26} aria-hidden />}
          <strong>{prize?.label ?? ""}</strong>
          {prize?.kind === "POINTS" && prize.points ? <span>+{prize.points.toLocaleString("vi-VN")} điểm</span> : null}
        </div>
      )}
    </button>
  );
}
