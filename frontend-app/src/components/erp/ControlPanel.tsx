import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Filter, Layers, LayoutGrid, List, Search, X } from "lucide-react";
import { Button } from "./primitives";

export type Crumb = { label: ReactNode; to?: string };

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="o-breadcrumb" aria-label="Breadcrumb">
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <span key={i} style={{ display: "contents" }}>
            {c.to && !last ? <Link to={c.to}>{c.label}</Link> : <span className={last ? "o-breadcrumb-current" : undefined}>{c.label}</span>}
            {!last && <span className="o-breadcrumb-sep">/</span>}
          </span>
        );
      })}
    </nav>
  );
}

/** Dropdown đơn giản, tự đóng khi bấm ra ngoài */
export function Dropdown({
  button,
  children,
  align = "left",
}: {
  button: (p: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div className="o-dropdown" ref={ref}>
      {button({ open, toggle: () => setOpen((v) => !v) })}
      {open && <div className={`o-dropdown-menu${align === "right" ? " right" : ""}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

export type Facet = { id: string; label: string; onRemove: () => void };
export type ToggleOption = { id: string; label: string; active: boolean };

export function ControlPanel({
  crumbs,
  actions,
  search,
  onSearch,
  facets = [],
  filters,
  onToggleFilter,
  groupBys,
  onToggleGroupBy,
  view,
  views,
  onView,
  pager,
}: {
  crumbs: Crumb[];
  actions?: ReactNode;
  search?: string;
  onSearch?: (v: string) => void;
  facets?: Facet[];
  filters?: ToggleOption[];
  onToggleFilter?: (id: string) => void;
  groupBys?: ToggleOption[];
  onToggleGroupBy?: (id: string) => void;
  view?: "list" | "kanban";
  views?: ("list" | "kanban")[];
  onView?: (v: "list" | "kanban") => void;
  pager?: { offset: number; limit: number; total: number; onChange: (offset: number) => void };
}) {
  // Tiêu đề trang đã nằm ở PageHeader: chỉ hiện breadcrumb khi có cấp cha (danh sách › bản ghi)
  const showCrumbs = crumbs.length > 1;
  const hasTools = !!(onSearch || actions || filters?.length || groupBys?.length || (pager && pager.total > 0) || (views && views.length > 1 && onView));
  if (!showCrumbs && !hasTools) return null;
  return (
    <div className="o-cp">
      <div className="o-cp-left">
        {showCrumbs && <Breadcrumb items={crumbs} />}
      </div>
      <div className="o-cp-right">
        {onSearch && (
          <div className="o-search">
            <Search size={16} aria-hidden style={{ color: "var(--o-muted)" }} />
            {facets.map((f) => (
              <span key={f.id} className="o-facet">
                {f.label}
                <button type="button" onClick={f.onRemove} aria-label={`Bỏ ${f.label}`}><X size={12} /></button>
              </span>
            ))}
            <input value={search ?? ""} onChange={(e) => onSearch(e.target.value)} placeholder="Tìm kiếm…" aria-label="Tìm kiếm" />
          </div>
        )}
      </div>
      <div className="o-cp-left">{actions}</div>
      <div className="o-cp-right">
        {filters && filters.length > 0 && (
          <Dropdown
            align="right"
            button={({ open, toggle }) => (
              <Button variant="secondary" icon={Filter} onClick={toggle} aria-expanded={open}>Bộ lọc</Button>
            )}
          >
            {() =>
              filters.map((f) => (
                <button key={f.id} type="button" className={f.active ? "o-dropdown-item active" : "o-dropdown-item"} onClick={() => onToggleFilter?.(f.id)}>
                  <input type="checkbox" readOnly checked={f.active} tabIndex={-1} /> {f.label}
                </button>
              ))
            }
          </Dropdown>
        )}
        {groupBys && groupBys.length > 0 && (
          <Dropdown
            align="right"
            button={({ open, toggle }) => (
              <Button variant="secondary" icon={Layers} onClick={toggle} aria-expanded={open}>Nhóm theo</Button>
            )}
          >
            {() =>
              groupBys.map((g) => (
                <button key={g.id} type="button" className={g.active ? "o-dropdown-item active" : "o-dropdown-item"} onClick={() => onToggleGroupBy?.(g.id)}>
                  <input type="checkbox" readOnly checked={g.active} tabIndex={-1} /> {g.label}
                </button>
              ))
            }
          </Dropdown>
        )}
        {pager && pager.total > 0 && (
          <span className="o-pager">
            {pager.offset + 1}-{Math.min(pager.offset + pager.limit, pager.total)} / {pager.total}
            <Button variant="secondary" size="sm" icon={ChevronLeft} aria-label="Trang trước" disabled={pager.offset === 0} onClick={() => pager.onChange(Math.max(0, pager.offset - pager.limit))} />
            <Button variant="secondary" size="sm" icon={ChevronRight} aria-label="Trang sau" disabled={pager.offset + pager.limit >= pager.total} onClick={() => pager.onChange(pager.offset + pager.limit)} />
          </span>
        )}
        {views && views.length > 1 && onView && (
          <div className="o-view-switch" role="group" aria-label="Kiểu xem">
            {views.map((v) => (
              <button key={v} type="button" className={view === v ? "active" : ""} onClick={() => onView(v)} aria-label={v === "list" ? "Danh sách" : "Kanban"} aria-pressed={view === v}>
                {v === "list" ? <List size={16} /> : <LayoutGrid size={16} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Trạng thái quy trình dạng mũi tên */
export function StatusBar<T extends string>({
  steps,
  current,
  onSelect,
}: {
  steps: { id: T; label: string }[];
  current: T;
  onSelect?: (id: T) => void;
}) {
  const idx = steps.findIndex((s) => s.id === current);
  return (
    <div className="o-statusbar" role="list" aria-label="Trạng thái">
      {steps.map((s, i) => {
        const cls = `o-status-step${i === idx ? " current" : i < idx ? " done" : ""}`;
        return onSelect ? (
          <button key={s.id} type="button" className={cls} onClick={() => onSelect(s.id)} aria-current={i === idx ? "step" : undefined}>
            {s.label}
          </button>
        ) : (
          <span key={s.id} className={cls} role="listitem" aria-current={i === idx ? "step" : undefined}>
            {s.label}
          </span>
        );
      })}
    </div>
  );
}
