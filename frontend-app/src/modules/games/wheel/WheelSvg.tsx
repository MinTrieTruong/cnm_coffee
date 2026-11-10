import { useId } from "react";
import { mediaUrl } from "../../../lib/api";

export type WheelSegment = { label: string; imageUrl?: string | null; color?: string | null };

/** Màu ô mặc định khi giải không đặt màu riêng: xen kẽ màu nền vòng quay và trắng */
export function segmentFill(i: number, color: string | null | undefined, wheelColor: string) {
  return color || (i % 2 === 0 ? wheelColor : "#FFFFFF");
}

/** Chữ đen/trắng tuỳ độ sáng nền */
function textOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#1C1917";
  const n = parseInt(m[1], 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.6 ? "#1C1917" : "#FFFFFF";
}

/** Tách nhãn thành tối đa 2 dòng ngắn để vừa ô */
function lines(label: string, max = 14) {
  const words = label.split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max && cur) {
      out.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) out.push(cur);
  if (out.length > 2) return [out[0], out.slice(1).join(" ").slice(0, max - 1) + "…"];
  return out;
}

/** Góc (độ, tính từ đỉnh theo chiều kim đồng hồ) → toạ độ trên đường tròn bán kính r quanh tâm 0,0 */
const at = (deg: number, r: number) => {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [r * Math.cos(rad), r * Math.sin(rad)] as const;
};

/**
 * Vòng quay vẽ bằng SVG. Ô 0 bắt đầu ở đỉnh (dưới kim), các ô xếp theo chiều kim đồng hồ.
 * `rotorRef` trỏ vào nhóm các ô — trang chơi tự đặt thuộc tính transform mỗi khung hình (requestAnimationFrame)
 * thay vì dùng CSS transition, vì rule prefers-reduced-motion toàn cục ép transition về 0ms làm vòng nhảy thẳng tới kết quả.
 */
export function WheelSvg({
  segments,
  wheelColor,
  borderColor,
  size = 320,
  rotorRef,
}: {
  segments: WheelSegment[];
  wheelColor: string;
  borderColor: string;
  size?: number;
  rotorRef?: React.Ref<SVGGElement>;
}) {
  const uid = useId().replace(/:/g, "");
  const n = Math.max(segments.length, 1);
  const seg = 360 / n;
  const R = 100;
  const rim = 9;
  const r = R - rim;
  const bulbs = Math.max(12, n * 2);

  return (
    <svg viewBox="-112 -118 224 230" width={size} height={size * (230 / 224)} role="img" aria-label="Vòng quay may mắn" style={{ display: "block", maxWidth: "100%", height: "auto" }}>
      <defs>
        <clipPath id={`c${uid}`}>
          <circle r={11} />
        </clipPath>
        <filter id={`s${uid}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Viền + đèn */}
      <circle r={R} fill={borderColor} filter={`url(#s${uid})`} />
      {Array.from({ length: bulbs }, (_, i) => {
        const [x, y] = at((360 / bulbs) * i, R - rim / 2);
        return <circle key={i} cx={x} cy={y} r={2.1} fill="#FFFFFF" opacity={0.95} />;
      })}

      <g ref={rotorRef}>
        {segments.map((s, i) => {
          const a0 = i * seg;
          const a1 = (i + 1) * seg;
          const [x0, y0] = at(a0, r);
          const [x1, y1] = at(a1, r);
          const fill = segmentFill(i, s.color, wheelColor);
          const mid = a0 + seg / 2;
          const txt = lines(s.label, n > 10 ? 10 : 14);
          const [ix, iy] = at(mid, r * 0.78);
          const img = mediaUrl(s.imageUrl);
          return (
            <g key={i}>
              <path
                d={n === 1 ? `M 0 ${-r} A ${r} ${r} 0 1 1 -0.01 ${-r} Z` : `M 0 0 L ${x0} ${y0} A ${r} ${r} 0 ${seg > 180 ? 1 : 0} 1 ${x1} ${y1} Z`}
                fill={fill}
                stroke={borderColor}
                strokeOpacity={0.25}
                strokeWidth={0.6}
              />
              {img && (
                <g transform={`translate(${ix} ${iy})`}>
                  <circle r={11.8} fill="#FFFFFF" />
                  <image href={img} x={-11} y={-11} width={22} height={22} clipPath={`url(#c${uid})`} preserveAspectRatio="xMidYMid slice" />
                </g>
              )}
              <g transform={`rotate(${mid}) translate(0 ${-(img ? r * 0.52 : r * 0.62)})`}>
                {txt.map((t, k) => (
                  <text
                    key={k}
                    y={(k - (txt.length - 1) / 2) * 7.5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={n > 10 ? 5.2 : 6.2}
                    fontWeight={700}
                    fill={textOn(fill)}
                    style={{ fontFamily: "inherit" }}
                  >
                    {t}
                  </text>
                ))}
              </g>
            </g>
          );
        })}
      </g>

      {/* Tâm */}
      <circle r={13} fill={borderColor} stroke="#FFFFFF" strokeWidth={2.5} />
      <circle r={4} fill="#FFFFFF" />
      {/* Kim chỉ ở đỉnh */}
      <path d={`M -9 ${-R - 12} L 9 ${-R - 12} L 0 ${-R + 8} Z`} fill={borderColor} stroke="#FFFFFF" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

/** Góc (0–360) để ô `index` dừng dưới kim, lệch ngẫu nhiên trong ô cho tự nhiên */
export function stopAngle(index: number, count: number) {
  const seg = 360 / count;
  const jitter = (Math.random() - 0.5) * seg * 0.6;
  return (((360 - (index * seg + seg / 2) + jitter) % 360) + 360) % 360;
}
