import type { ReactNode } from "react";

/**
 * Hình bàn nhìn từ trên xuống có ghế xung quanh (SVG inline), số ghế = sức chứa của bàn.
 * Ghế chia: 2 đầu bàn khi ≥ 6 chỗ (5 chỗ: 1 ghế đầu phải), còn lại chia cạnh trên / dưới (trên = làm tròn lên).
 * Màu lấy từ biến CSS `--tile` của lớp trạng thái (.table-tile-empty / -occupied / -paying / -cleaning — index.css):
 * mặt bàn đúng màu trạng thái, ghế cùng tông nhạt hơn. `children` (số bàn, trạng thái) đặt chồng lên đúng vùng mặt bàn.
 */
type Props = {
  /** Sức chứa (capacity), mặc định 4; kẹp 1–12 */
  seats?: number;
  /** Lớp màu trạng thái, VD "table-tile-occupied" */
  className?: string;
  selected?: boolean;
  /** Nội dung đặt giữa mặt bàn */
  children?: ReactNode;
  /** Px trên mỗi đơn vị viewBox (mặc định 1.5 — bàn 4 chỗ rộng ~120px) */
  scale?: number;
};

/** Ghế: viên thuốc 14 × 22, cách mặt bàn 3 */
const CHAIR_W = 14;
const CHAIR_L = 22;
const GAP = 3;
/** Khoảng cách tâm hai ghế liền nhau trên một cạnh; lề hai đầu mặt bàn */
const PITCH = 24;
const EDGE = 10;
const TABLE_H = 54;
/** Lề ngoài khi không có ghế ở đầu bàn */
const PAD = 4;

export function seatLayout(seats: number) {
  const n = Math.min(12, Math.max(1, Math.round(seats) || 4));
  const ends = n >= 6 ? 2 : n === 5 ? 1 : 0;
  const rest = n - ends;
  return { n, ends, top: Math.ceil(rest / 2), bottom: Math.floor(rest / 2) };
}

export function TableShape({ seats = 4, className = "", selected, children, scale = 1.5 }: Props) {
  const { ends, top, bottom } = seatLayout(seats);
  const tableW = Math.max(top, bottom, 1) * PITCH + EDGE * 2;
  const side = CHAIR_L + GAP;
  const left = ends === 2 ? side : PAD;
  const right = ends >= 1 ? side : PAD;
  const W = left + tableW + right;
  const H = side * 2 + TABLE_H;
  const tx = left;
  const ty = side;

  // Ghế cạnh trên / dưới (dọc), căn đều theo chiều dài bàn
  const row = (count: number, y: number) =>
    Array.from({ length: count }, (_, i) => {
      const cx = tx + (tableW * (i + 1)) / (count + 1);
      return <rect key={`${y}-${i}`} className="table-shape-chair" x={cx - CHAIR_W / 2} y={y} width={CHAIR_W} height={CHAIR_L} rx={CHAIR_W / 2} />;
    });
  const endChair = (x: number) => <rect key={`e${x}`} className="table-shape-chair" x={x} y={ty + TABLE_H / 2 - CHAIR_W / 2} width={CHAIR_L} height={CHAIR_W} rx={CHAIR_W / 2} />;

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div className={`table-shape ${className}${selected ? " is-selected" : ""}`} style={{ width: W * scale }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" aria-hidden focusable="false">
        {row(top, 0)}
        {row(bottom, ty + TABLE_H + GAP)}
        {ends === 2 && endChair(0)}
        {ends >= 1 && endChair(tx + tableW + GAP)}
        <rect className="table-shape-top-rect" x={tx} y={ty} width={tableW} height={TABLE_H} rx={10} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="table-shape-top" style={{ left: pct(tx, W), top: pct(ty, H), width: pct(tableW, W), height: pct(TABLE_H, H) }}>
        {children}
      </div>
    </div>
  );
}
