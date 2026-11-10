import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useLang } from "../../lib/i18n";
import type { Occasion, OccasionId } from "../../lib/occasions";

/* ── Hình trang trí dịp lễ, vẽ bằng SVG (khung 160×80) ── */

/** Hoa 5 cánh (mai) tâm cx,cy */
function Flower({ cx, cy, r, fill = "#f7c531", core = "#d9822b" }: { cx: number; cy: number; r: number; fill?: string; core?: string }) {
  return (
    <g>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx={cx} cy={cy - r * 0.62} rx={r * 0.48} ry={r * 0.66} fill={fill} transform={`rotate(${a} ${cx} ${cy})`} />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.3} fill={core} />
    </g>
  );
}

/** Toạ độ ngôi sao 5 cánh */
function starPoints(cx: number, cy: number, R: number) {
  const r = R * 0.382;
  return Array.from({ length: 10 }, (_, i) => {
    const rad = ((i * 36 - 90) * Math.PI) / 180;
    const k = i % 2 ? r : R;
    return `${(cx + k * Math.cos(rad)).toFixed(2)},${(cy + k * Math.sin(rad)).toFixed(2)}`;
  }).join(" ");
}

function Snowflake({ cx, cy, r, stroke = "#8fc3e3" }: { cx: number; cy: number; r: number; stroke?: string }) {
  return (
    <g stroke={stroke} strokeWidth={1.2} strokeLinecap="round">
      {[0, 60, 120].map((a) => (
        <line key={a} x1={cx} y1={cy - r} x2={cx} y2={cy + r} transform={`rotate(${a} ${cx} ${cy})`} />
      ))}
    </g>
  );
}

function Tulip({ x, y, fill }: { x: number; y: number; fill: string }) {
  return <path d={`M${x - 7} ${y} C${x - 8} ${y - 10} ${x - 4} ${y - 14} ${x - 3} ${y - 12} L${x} ${y - 16} L${x + 3} ${y - 12} C${x + 4} ${y - 14} ${x + 8} ${y - 10} ${x + 7} ${y} C${x + 5} ${y + 6} ${x - 5} ${y + 6} ${x - 7} ${y} Z`} fill={fill} />;
}

const Heart = ({ x, y, s = 1, fill }: { x: number; y: number; s?: number; fill: string }) => (
  <path d="M0 4 C-8 -4 -4 -10 0 -4 C4 -10 8 -4 0 4 Z" fill={fill} transform={`translate(${x} ${y}) scale(${s})`} />
);

function TetArt() {
  return (
    <>
      <g fill="none" stroke="#6b3f22" strokeLinecap="round">
        <path d="M4 72 C40 62 60 42 100 34 S150 20 158 10" strokeWidth={3} />
        <path d="M60 47 C66 32 74 25 82 20" strokeWidth={2} />
        <path d="M108 32 C116 44 124 50 134 52" strokeWidth={2} />
      </g>
      {[[30, 63, 7], [58, 47, 8], [82, 20, 6], [100, 34, 7], [126, 24, 6], [134, 52, 6], [150, 15, 5], [72, 30, 4.5]].map(([x, y, r], i) => (
        <Flower key={i} cx={x} cy={y} r={r} />
      ))}
      {/* Đèn lồng */}
      <line x1={40} y1={0} x2={40} y2={12} stroke="#6b3f22" strokeWidth={1.2} />
      <rect x={33} y={11} width={14} height={4} rx={1} fill="#e0a531" />
      <ellipse cx={40} cy={29} rx={15} ry={14} fill="#c62828" />
      <ellipse cx={40} cy={29} rx={7} ry={14} fill="none" stroke="#8e1b1b" strokeWidth={1.2} />
      <line x1={40} y1={15} x2={40} y2={43} stroke="#8e1b1b" strokeWidth={1.2} />
      <rect x={33} y={42} width={14} height={4} rx={1} fill="#e0a531" />
      <g stroke="#e0a531" strokeWidth={1.2}>
        <line x1={37} y1={46} x2={36} y2={56} />
        <line x1={40} y1={46} x2={40} y2={58} />
        <line x1={43} y1={46} x2={44} y2={56} />
      </g>
    </>
  );
}

function WomenDayArt() {
  const heads: [number, number, string][] = [[46, 44, "#f06292"], [62, 32, "#e8467c"], [80, 26, "#c2185b"], [98, 32, "#f48fb1"], [114, 44, "#e8467c"]];
  return (
    <>
      <g fill="none" stroke="#3f7d3a" strokeWidth={2.4} strokeLinecap="round">
        {heads.map(([x, y], i) => (
          <path key={i} d={`M80 72 Q${(80 + x) / 2} ${(72 + y) / 2 + 6} ${x} ${y + 3}`} />
        ))}
      </g>
      <path d="M80 70 C66 64 58 56 56 48 C66 52 74 58 80 70 Z" fill="#4c9a45" />
      <path d="M80 70 C94 64 102 56 104 48 C94 52 86 58 80 70 Z" fill="#4c9a45" />
      {heads.map(([x, y, c], i) => (
        <Tulip key={i} x={x} y={y} fill={c} />
      ))}
      {/* Nơ */}
      <path d="M80 68 L66 62 L68 76 Z M80 68 L94 62 L92 76 Z" fill="#b0306a" />
      <circle cx={80} cy={68} r={3.4} fill="#8c2453" />
      <Heart x={20} y={24} s={1.3} fill="#f6a5c0" />
      <Heart x={140} y={20} s={1} fill="#f48fb1" />
      <Heart x={146} y={52} s={0.8} fill="#f6a5c0" />
      <Heart x={16} y={56} s={0.8} fill="#f48fb1" />
    </>
  );
}

function ReunificationArt() {
  const flags = Array.from({ length: 9 }, (_, i) => {
    const t = (i + 0.5) / 9;
    return { x: 160 * t, y: 6 * (1 - t) ** 2 + 2 * (1 - t) * t * 30 + 6 * t * t, red: i % 2 === 0 };
  });
  return (
    <>
      <path d="M0 6 Q80 30 160 6" fill="none" stroke="#7a4a2a" strokeWidth={1} />
      {flags.map((f, i) => (
        <polygon key={i} points={`${f.x - 6},${f.y} ${f.x + 6},${f.y} ${f.x},${f.y + 12}`} fill={f.red ? "#da251d" : "#ffcd00"} />
      ))}
      {/* Cờ trên cán */}
      <line x1={30} y1={30} x2={30} y2={80} stroke="#8d6e63" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={30} cy={29} r={2.4} fill="#e0a531" />
      <path d="M31 31 C50 25 62 39 84 33 L84 61 C62 67 50 53 31 59 Z" fill="#da251d" />
      <polygon points={starPoints(57, 46, 8.5)} fill="#ffcd00" />
      {/* Pháo hoa */}
      {[
        [124, 44, 15, "#ffcd00"],
        [146, 64, 9, "#da251d"],
        [108, 66, 7, "#f2a33a"],
      ].map(([x, y, r, c], k) => (
        <g key={k} stroke={c as string} strokeWidth={1.6} strokeLinecap="round">
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * 30 * Math.PI) / 180;
            const R = r as number;
            return <line key={i} x1={(x as number) + Math.cos(a) * R * 0.3} y1={(y as number) + Math.sin(a) * R * 0.3} x2={(x as number) + Math.cos(a) * R} y2={(y as number) + Math.sin(a) * R} />;
          })}
        </g>
      ))}
    </>
  );
}

function NoelArt() {
  return (
    <>
      <polygon points="50,12 30,40 70,40" fill="#2e7d4f" />
      <polygon points="50,24 24,58 76,58" fill="#27704a" />
      <polygon points="50,40 18,74 82,74" fill="#1f5f3f" />
      <rect x={45} y={74} width={10} height={6} fill="#6d4c41" />
      <polygon points={starPoints(50, 11, 7)} fill="#ffcd00" />
      {[[44, 34, "#e04a4f"], [58, 50, "#ffcd00"], [38, 54, "#ffcd00"], [62, 66, "#e04a4f"], [34, 70, "#e04a4f"], [50, 62, "#8fc3e3"]].map(([x, y, c], i) => (
        <circle key={i} cx={x as number} cy={y as number} r={2.6} fill={c as string} />
      ))}
      {/* Hộp quà */}
      <rect x={92} y={56} width={26} height={22} rx={1.5} fill="#e04a4f" />
      <rect x={103} y={56} width={4} height={22} fill="#ffcd00" />
      <rect x={92} y={64} width={26} height={4} fill="#ffcd00" />
      <ellipse cx={101} cy={53} rx={5} ry={3} fill="none" stroke="#ffcd00" strokeWidth={2} />
      <ellipse cx={109} cy={53} rx={5} ry={3} fill="none" stroke="#ffcd00" strokeWidth={2} />
      <rect x={124} y={64} width={18} height={14} rx={1.5} fill="#2e7d4f" />
      <rect x={131} y={64} width={4} height={14} fill="#e04a4f" />
      <Snowflake cx={92} cy={18} r={6} />
      <Snowflake cx={122} cy={34} r={4.5} />
      <Snowflake cx={146} cy={14} r={5.5} />
      <Snowflake cx={14} cy={22} r={5} />
      <Snowflake cx={150} cy={50} r={3.5} />
    </>
  );
}

const ART: Record<OccasionId, () => ReactNode> = { tet: TetArt, "8-3": WomenDayArt, "30-4": ReunificationArt, noel: NoelArt };

export function OccasionArt({ id, className, height = 64, flip }: { id: OccasionId; className?: string; height?: number; flip?: boolean }) {
  const Art = ART[id];
  return (
    <svg viewBox="0 0 160 80" height={height} width={height * 2} className={className} aria-hidden style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <Art />
    </svg>
  );
}

/* ── Hạt rơi (cánh mai, cánh hoa, sao, tuyết) ── */

function Particle({ id }: { id: OccasionId }) {
  if (id === "tet") return <svg viewBox="-10 -10 20 20"><Flower cx={0} cy={0} r={8} /></svg>;
  if (id === "8-3") return <svg viewBox="-10 -10 20 20"><ellipse rx={5} ry={8} fill="#f48fb1" opacity={0.9} /></svg>;
  if (id === "30-4") return <svg viewBox="-10 -10 20 20"><polygon points={starPoints(0, 0, 9)} fill="#ffcd00" /></svg>;
  return <svg viewBox="-10 -10 20 20"><Snowflake cx={0} cy={0} r={8} stroke="#ffffff" /><circle r={1.6} fill="#ffffff" /></svg>;
}

/** Vị trí/tốc độ cố định theo chỉ số (không đổi khi vẽ lại) */
const PARTICLES = Array.from({ length: 16 }, (_, i) => ({
  left: (i * 61 + 7) % 100,
  size: 10 + ((i * 7) % 9),
  dur: 9 + ((i * 13) % 8),
  delay: -((i * 17) % 16),
  sway: 2.5 + ((i * 5) % 3),
  rot: i % 2 ? 300 : -260,
}));

export function FestiveFall({ id }: { id: OccasionId }) {
  return (
    <div className={`fz-fall fz-fall-${id}`} aria-hidden>
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="fz-p"
          style={{ left: `${p.left}%`, width: p.size, height: p.size, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`, "--rot": `${p.rot}deg` } as React.CSSProperties}
        >
          <span className="fz-sway" style={{ animationDuration: `${p.sway}s` }}>
            <Particle id={id} />
          </span>
        </span>
      ))}
    </div>
  );
}

/* ── Dải lời chúc dưới header ── */

const hideKey = (id: string) => `fz-hide-${id}`;
function wasHidden(id: string) {
  try {
    return sessionStorage.getItem(hideKey(id)) === "1";
  } catch {
    return false;
  }
}

export function FestiveStrip({ occasion }: { occasion: Occasion }) {
  const { t } = useLang();
  const [hidden, setHidden] = useState(() => wasHidden(occasion.id));
  if (hidden) return null;
  function close() {
    setHidden(true);
    try {
      sessionStorage.setItem(hideKey(occasion.id), "1");
    } catch {
      /* chỉ ẩn trong lần xem này */
    }
  }
  return (
    <div className={`fz-strip fz-strip-${occasion.id}`} role="note">
      <div className="c-wrap fz-in">
        <OccasionArt id={occasion.id} className="fz-art" />
        <div className="fz-text">
          <strong>{t(occasion.greeting)}</strong>
          <span>{t(occasion.sub)}</span>
        </div>
        <OccasionArt id={occasion.id} className="fz-art fz-art-r" flip />
        <button type="button" className="fz-close" onClick={close} aria-label={t("Ẩn lời chúc")}>
          <X size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}
