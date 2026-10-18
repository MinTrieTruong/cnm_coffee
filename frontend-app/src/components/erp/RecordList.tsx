import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { ControlPanel, type Crumb } from "./ControlPanel";
import { KanbanView, ListView, type BulkAction, type Column } from "./ListView";
import { Alert, Button } from "./primitives";

export type ListFilter<T> = { id: string; label: string; test: (row: T) => boolean };
export type ListGroupBy<T> = { id: string; label: string; key: (row: T) => string };

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

/**
 * Màn hình danh sách chuẩn: ControlPanel (tìm kiếm, bộ lọc, nhóm theo, phân trang,
 * chuyển List/Kanban) + ListView/KanbanView.
 */
export function RecordList<T>({
  crumbs,
  rows,
  columns,
  rowKey,
  loading,
  error,
  onOpen,
  onCreate,
  createLabel = "Tạo mới",
  actions,
  searchText,
  filters = [],
  defaultFilters = [],
  groupBys = [],
  kanban,
  defaultView = "list",
  bulkActions,
  selectable,
  exportName,
  pageSize = 80,
  top,
  emptyState,
}: {
  crumbs: Crumb[];
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: string | null;
  onOpen?: (row: T) => void;
  onCreate?: () => void;
  createLabel?: string;
  /** Nút phụ cạnh nút Tạo mới */
  actions?: ReactNode;
  searchText?: (row: T) => string;
  filters?: ListFilter<T>[];
  defaultFilters?: string[];
  groupBys?: ListGroupBy<T>[];
  kanban?: { columns: { id: string; label: string }[]; columnOf: (row: T) => string; card: (row: T) => ReactNode };
  defaultView?: "list" | "kanban";
  bulkActions?: BulkAction<T>[];
  selectable?: boolean;
  exportName?: string;
  pageSize?: number;
  /** Nội dung phía trên danh sách (KPI, cảnh báo…) */
  top?: ReactNode;
  emptyState?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState<string[]>(defaultFilters);
  const [group, setGroup] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "kanban">(kanban ? defaultView : "list");
  const [offset, setOffset] = useState(0);

  const filtered = useMemo(() => {
    const nq = normalize(q.trim());
    const activeFilters = filters.filter((f) => active.includes(f.id));
    return rows.filter((r) => {
      if (nq && searchText && !normalize(searchText(r)).includes(nq)) return false;
      // Các bộ lọc cùng nhóm hoạt động theo OR như Odoo
      if (activeFilters.length && !activeFilters.some((f) => f.test(r))) return false;
      return true;
    });
  }, [rows, q, active, filters, searchText]);

  useEffect(() => setOffset(0), [q, active, group]);

  const groupFn = groupBys.find((g) => g.id === group)?.key;
  // Khi nhóm hoặc kanban: hiển thị hết, không phân trang
  const paged = groupFn || view === "kanban" ? filtered : filtered.slice(offset, offset + pageSize);

  const facets = [
    ...filters.filter((f) => active.includes(f.id)).map((f) => ({ id: `f-${f.id}`, label: f.label, onRemove: () => setActive((a) => a.filter((x) => x !== f.id)) })),
    ...(group ? [{ id: "g", label: `Nhóm: ${groupBys.find((g) => g.id === group)?.label}`, onRemove: () => setGroup(null) }] : []),
  ];

  return (
    <div>
      <ControlPanel
        crumbs={crumbs}
        actions={
          <>
            {onCreate && <Button variant="primary" icon={Plus} onClick={onCreate}>{createLabel}</Button>}
            {actions}
          </>
        }
        search={searchText ? q : undefined}
        onSearch={searchText ? setQ : undefined}
        facets={facets}
        filters={filters.map((f) => ({ id: f.id, label: f.label, active: active.includes(f.id) }))}
        onToggleFilter={(id) => setActive((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]))}
        groupBys={groupBys.map((g) => ({ id: g.id, label: g.label, active: group === g.id }))}
        onToggleGroupBy={(id) => setGroup((g) => (g === id ? null : id))}
        view={view}
        views={kanban ? ["list", "kanban"] : undefined}
        onView={setView}
        pager={!groupFn && view === "list" ? { offset, limit: pageSize, total: filtered.length, onChange: setOffset } : undefined}
      />
      {error && <div style={{ padding: "8px 16px" }}><Alert>{error}</Alert></div>}
      {top && <div style={{ padding: "12px 16px 0" }}>{top}</div>}
      {view === "kanban" && kanban ? (
        <KanbanView columns={kanban.columns} rows={filtered} columnOf={kanban.columnOf} rowKey={rowKey} card={kanban.card} onOpen={onOpen} />
      ) : (
        <div style={top ? { marginTop: 12 } : undefined}>
          <ListView
            columns={columns}
            rows={paged}
            rowKey={rowKey}
            onRowClick={onOpen}
            selectable={selectable ?? !!bulkActions?.length}
            bulkActions={bulkActions}
            exportName={exportName}
            groupBy={groupFn}
            loading={loading}
            emptyState={emptyState}
          />
        </div>
      )}
    </div>
  );
}
