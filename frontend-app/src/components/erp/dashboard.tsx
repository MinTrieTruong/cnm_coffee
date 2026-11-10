import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, CalendarDays, ChevronDown } from "lucide-react";
import type { IconType } from "./primitives";

/* ═══════════ PageHeader ═══════════ */

/** Tiêu đề trang 24px + mô tả 1 dòng; bên phải là hành động của trang */
export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="o-ph">
      <div className="o-ph-text">
        {back}
        <h1 className="o-ph-title">{title}</h1>
        {description && <p className="o-ph-desc">{description}</p>}
      </div>
      {actions && <div className="o-ph-actions">{actions}</div>}
    </header>
  );
}

/* ═══════════ KpiCard ═══════════ */

/** % thay đổi so với kỳ trước; null = không có số kỳ trước để so */
export function pctChange(cur: number, prev: number | null | undefined): number | "new" | null {
  if (prev == null) return null;
  if (prev === 0) return cur > 0 ? "new" : null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  change,
  sub,
  tone = "primary",
  invert = false,
  to,
}: {
  icon: IconType;
  label: string;
  value: ReactNode;
  /** Kết quả pctChange */
  change?: number | "new" | null;
  sub?: ReactNode;
  tone?: "primary" | "green" | "blue" | "orange" | "red";
  /** Tăng là xấu (vd giá trị hủy) */
  invert?: boolean;
  to?: string;
}) {
  let chip: ReactNode = null;
  if (change === "new") chip = <span className="o-kpic-chip is-new">Mới</span>;
  else if (typeof change === "number" && Number.isFinite(change)) {
    const up = change >= 0;
    const good = invert ? !up : up;
    const Arrow = up ? ArrowUpRight : ArrowDownRight;
    const txt = `${Math.abs(change) >= 100 ? Math.round(Math.abs(change)) : Math.abs(change).toFixed(1).replace(".", ",")}%`;
    chip = (
      <span className={good ? "o-kpic-chip is-up" : "o-kpic-chip is-down"} title="So với kỳ trước">
        <Arrow size={14} strokeWidth={2} aria-hidden />
        <span className="o-sr">{up ? "tăng" : "giảm"} </span>
        {txt}
      </span>
    );
  }
  const body = (
    <>
      <div className="o-kpic-top">
        <span className={`o-kpic-icon is-${tone}`}><Icon size={20} strokeWidth={1.75} aria-hidden /></span>
        {chip}
      </div>
      <div className="o-kpic-value">{value}</div>
      <div className="o-kpic-label">{label}</div>
      {sub && <div className="o-kpic-sub">{sub}</div>}
    </>
  );
  return to ? <Link to={to} className="o-kpic is-link">{body}</Link> : <div className="o-kpic">{body}</div>;
}

/* ═══════════ ChartCard ═══════════ */

export function ChartCard({ title, description, actions, children, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className ? `o-dcard ${className}` : "o-dcard"}>
      <div className="o-dcard-head">
        <div>
          <h2 className="o-dcard-title">{title}</h2>
          {description && <p className="o-dcard-desc">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="o-dcard-body">{children}</div>
    </section>
  );
}

/* ═══════════ DateRangePicker ═══════════ */

export type RangePreset = "today" | "7d" | "30d" | "month" | "lastMonth" | "custom";
export type DateRange = { preset: RangePreset; from: string; to: string };

const pad = (n: number) => String(n).padStart(2, "0");
/** Ngày theo giờ máy (không dùng toISOString để khỏi lệch múi giờ) */
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const daysBetween = (from: string, to: string) => Math.round((parseYmd(to).getTime() - parseYmd(from).getTime()) / 86_400_000) + 1;

export const PRESETS: { id: RangePreset; label: string }[] = [
  { id: "today", label: "Hôm nay" },
  { id: "7d", label: "7 ngày" },
  { id: "30d", label: "30 ngày" },
  { id: "month", label: "Tháng này" },
  { id: "lastMonth", label: "Tháng trước" },
  { id: "custom", label: "Tùy chọn" },
];

export function presetRange(preset: Exclude<RangePreset, "custom">, now = new Date()): DateRange {
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "today":
      return { preset, from: ymd(t), to: ymd(t) };
    case "7d":
      return { preset, from: ymd(addDays(t, -6)), to: ymd(t) };
    case "30d":
      return { preset, from: ymd(addDays(t, -29)), to: ymd(t) };
    case "month":
      return { preset, from: ymd(new Date(t.getFullYear(), t.getMonth(), 1)), to: ymd(t) };
    case "lastMonth":
      return { preset, from: ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)), to: ymd(new Date(t.getFullYear(), t.getMonth(), 0)) };
  }
}

/** Kỳ trước để so sánh: tháng → cùng khoảng ngày của tháng trước; còn lại → đoạn liền trước cùng độ dài */
export function previousRange(r: DateRange): { from: string; to: string } {
  const f = parseYmd(r.from);
  if (r.preset === "month" || r.preset === "lastMonth") {
    const start = new Date(f.getFullYear(), f.getMonth() - 1, 1);
    const endOfPrev = new Date(f.getFullYear(), f.getMonth(), 0);
    const span = daysBetween(r.from, r.to);
    const end = addDays(start, span - 1);
    return { from: ymd(start), to: ymd(end > endOfPrev ? endOfPrev : end) };
  }
  const n = daysBetween(r.from, r.to);
  return { from: ymd(addDays(f, -n)), to: ymd(addDays(f, -1)) };
}

const fmtShort = (s: string) => {
  const d = parseYmd(s);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};
export const rangeLabel = (r: { from: string; to: string }) => (r.from === r.to ? fmtShort(r.from) : `${fmtShort(r.from)} – ${fmtShort(r.to)}`);

export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    setFrom(value.from);
    setTo(value.to);
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, value.from, value.to]);

  const current = PRESETS.find((p) => p.id === value.preset)?.label ?? "";
  const valid = from && to && from <= to;
  return (
    <div className="o-drp" ref={ref}>
      <button type="button" className="o-btn o-btn-secondary o-drp-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog">
        <CalendarDays size={16} strokeWidth={1.75} aria-hidden />
        <span className="o-drp-preset">{current}</span>
        <span className="o-drp-range">{rangeLabel(value)}</span>
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden />
      </button>
      {open && (
        <div className="o-drp-pop" role="dialog" aria-label="Chọn khoảng thời gian">
          <div className="o-drp-presets">
            {PRESETS.filter((p) => p.id !== "custom").map((p) => (
              <button
                key={p.id}
                type="button"
                className={value.preset === p.id ? "o-drp-opt active" : "o-drp-opt"}
                onClick={() => {
                  onChange(presetRange(p.id as Exclude<RangePreset, "custom">));
                  setOpen(false);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="o-drp-custom">
            <div className="o-drp-custom-title">Tùy chọn</div>
            <label>Từ ngày <input type="date" className="o-input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>Đến ngày <input type="date" className="o-input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
            <button
              type="button"
              className="o-btn o-btn-primary"
              disabled={!valid}
              onClick={() => {
                onChange({ preset: "custom", from, to });
                setOpen(false);
              }}
            >
              Áp dụng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════ Bảng gọn (thành danh sách thẻ trên điện thoại) ═══════════ */

export type DashColumn<T> = { key: string; label: string; render: (r: T) => ReactNode; numeric?: boolean };

export function DashTable<T>({ columns, rows, rowKey, empty = "Chưa có dữ liệu." }: { columns: DashColumn<T>[]; rows: T[]; rowKey: (r: T) => string | number; empty?: string }) {
  if (!rows.length) return <p className="o-dash-empty">{empty}</p>;
  return (
    <table className="o-dtable">
      <thead>
        <tr>{columns.map((c) => <th key={c.key} className={c.numeric ? "num" : undefined} scope="col">{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={rowKey(r)}>
            {columns.map((c) => (
              <td key={c.key} className={c.numeric ? "num" : undefined} data-label={c.label}>{c.render(r)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
