import { useEffect, type ButtonHTMLAttributes, type ComponentType, type ReactNode } from "react";
import { X } from "lucide-react";

export type IconType = ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean; className?: string }>;

/* ───────────── Button ───────────── */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "link" | "danger";
  size?: "sm" | "md";
  icon?: IconType;
};
export function Button({ variant = "secondary", size = "md", icon: Icon, className, children, type = "button", ...rest }: ButtonProps) {
  const cls = [
    "o-btn",
    `o-btn-${variant}`,
    size === "sm" ? "o-btn-sm" : "",
    Icon && !children ? "o-btn-icon" : "",
    className ?? "",
  ].filter(Boolean).join(" ");
  return (
    <button type={type} className={cls} {...rest}>
      {Icon && <Icon size={16} aria-hidden />}
      {children}
    </button>
  );
}

/* ───────────── Badge ───────────── */
export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "primary";
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={tone === "neutral" ? "o-badge" : `o-badge o-badge-${tone}`}>{children}</span>;
}

/* ───────────── Field (nhãn / giá trị trong form) ───────────── */
export function Field({
  label,
  required,
  full,
  children,
  htmlFor,
}: {
  label?: ReactNode;
  required?: boolean;
  full?: boolean;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className={full ? "o-field full" : "o-field"}>
      {label !== undefined && (
        <label className="o-field-label" htmlFor={htmlFor}>
          {label}
          {required && <span className="req">*</span>}
        </label>
      )}
      <div className="o-field-value">{children}</div>
    </div>
  );
}

export function FormGroups({ children }: { children: ReactNode }) {
  return <div className="o-groups">{children}</div>;
}

export function FormGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="o-group">
      {title && <div className="o-group-title">{title}</div>}
      {children}
    </div>
  );
}

/* ───────────── Modal ───────────── */
export function Modal({
  title,
  onClose,
  footer,
  size = "md",
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="o-modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`o-modal${size === "md" ? "" : ` ${size}`}`} role="dialog" aria-modal="true">
        <div className="o-modal-head">
          <h2>{title}</h2>
          <Button variant="link" icon={X} onClick={onClose} aria-label="Đóng" />
        </div>
        <div className="o-modal-body">{children}</div>
        {footer && <div className="o-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ───────────── Tabs (notebook) ───────────── */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: ReactNode }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="o-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          className={active === t.id ? "o-tab active" : "o-tab"}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ───────────── EmptyState ───────────── */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon?: IconType;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="o-empty">
      {Icon && <div className="o-empty-icon"><Icon aria-hidden /></div>}
      <div className="o-empty-title">{title}</div>
      {hint && <div>{hint}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

/* ───────────── MonthYearPicker ───────────── */
export function MonthYearPicker({
  month,
  year,
  onChange,
  yearsBack = 3,
}: {
  month: number;
  year: number;
  onChange: (month: number, year: number) => void;
  yearsBack?: number;
}) {
  const now = new Date().getFullYear();
  const years = Array.from({ length: yearsBack + 2 }, (_, i) => now + 1 - i);
  return (
    <span className="o-month-picker">
      <select className="o-input" value={month} onChange={(e) => onChange(Number(e.target.value), year)} aria-label="Tháng">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <option key={m} value={m}>Tháng {m}</option>
        ))}
      </select>
      <select className="o-input" value={year} onChange={(e) => onChange(month, Number(e.target.value))} aria-label="Năm">
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </span>
  );
}

/* ───────────── KPI tile ───────────── */
export function Kpi({ label, value, onClick, tone }: { label: string; value: ReactNode; onClick?: () => void; tone?: Tone }) {
  const color =
    tone === "success" ? "var(--o-success)" : tone === "danger" ? "var(--o-danger)" : tone === "warning" ? "var(--o-warning)" : tone === "info" ? "var(--o-info)" : undefined;
  return (
    <div className={onClick ? "o-kpi clickable" : "o-kpi"} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}>
      <div className="o-kpi-label">{label}</div>
      <div className="o-kpi-value" style={color ? { color } : undefined}>{value}</div>
    </div>
  );
}

/* ───────────── Alert ───────────── */
export function Alert({ tone = "danger", children }: { tone?: "danger" | "info" | "warning"; children: ReactNode }) {
  return <div className={`o-alert o-alert-${tone}`} role={tone === "danger" ? "alert" : undefined}>{children}</div>;
}
