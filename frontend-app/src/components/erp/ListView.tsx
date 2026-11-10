import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Download, SlidersHorizontal } from "lucide-react";
import { Button } from "./primitives";
import { Dropdown } from "./ControlPanel";

export type Column<T> = {
  key: string;
  label: string;
  /** Nội dung ô; mặc định hiển thị value(row) */
  render?: (row: T) => ReactNode;
  /** Giá trị thô dùng để sắp xếp / xuất CSV / cộng tổng */
  value?: (row: T) => string | number | null | undefined;
  numeric?: boolean;
  /** Cộng tổng ở dòng cuối */
  sum?: boolean;
  formatSum?: (n: number) => ReactNode;
  wrap?: boolean;
  width?: number | string;
  /** Cho phép ẩn/hiện qua nút cột tùy chọn */
  optional?: boolean;
  defaultHidden?: boolean;
  sortable?: boolean;
};

export type BulkAction<T> = { label: string; onClick: (rows: T[]) => void | Promise<void>; danger?: boolean };

export function csvEscape(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const body = [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function readHidden(storageKey?: string): string[] | null {
  if (!storageKey) return null;
  try {
    const raw = localStorage.getItem(`o-cols:${storageKey}`);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

export function ListView<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectable,
  bulkActions = [],
  exportName,
  groupBy,
  emptyState,
  loading,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  bulkActions?: BulkAction<T>[];
  /** Tên file CSV; có giá trị thì hiện nút Xuất CSV */
  exportName?: string;
  /** Nhóm dòng theo khóa */
  groupBy?: (row: T) => string;
  emptyState?: ReactNode;
  loading?: boolean;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [hidden, setHidden] = useState<string[]>(
    () => readHidden(exportName) ?? columns.filter((c) => c.defaultHidden).map((c) => c.key),
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!exportName) return;
    try {
      localStorage.setItem(`o-cols:${exportName}`, JSON.stringify(hidden));
    } catch {
      /* bỏ qua */
    }
  }, [hidden, exportName]);

  // Bỏ chọn các dòng không còn tồn tại
  useEffect(() => {
    setSelected((prev) => {
      const keys = new Set(rows.map(rowKey));
      const next = new Set([...prev].filter((k) => keys.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows, rowKey]);

  const visible = columns.filter((c) => !hidden.includes(c.key));
  const raw = (c: Column<T>, r: T) => (c.value ? c.value(r) : undefined);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.value) return rows;
    return [...rows].sort((a, b) => {
      const va = col.value!(a);
      const vb = col.value!(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * sort.dir;
      return String(va).localeCompare(String(vb), "vi") * sort.dir;
    });
  }, [rows, sort, columns]);

  const groups = useMemo(() => {
    if (!groupBy) return null;
    const m = new Map<string, T[]>();
    for (const r of sorted) {
      const k = groupBy(r) || "Không xác định";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return [...m.entries()];
  }, [sorted, groupBy]);

  const hasSum = visible.some((c) => c.sum);
  const sumOf = (c: Column<T>, list: T[]) => list.reduce((s, r) => s + (Number(raw(c, r)) || 0), 0);
  const selRows = rows.filter((r) => selected.has(rowKey(r)));
  const allChecked = rows.length > 0 && selected.size === rows.length;

  function toggleSort(c: Column<T>) {
    if (!c.value || c.sortable === false) return;
    setSort((s) => (s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }));
  }

  function exportRows(list: T[]) {
    const cols = visible.filter((c) => c.value);
    downloadCsv(exportName ?? "export", cols.map((c) => c.label), list.map((r) => cols.map((c) => raw(c, r))));
  }

  const renderCell = (c: Column<T>, r: T) => {
    if (c.render) return c.render(r);
    const v = raw(c, r);
    if (v == null || v === "") return <span className="o-muted">—</span>;
    return c.numeric && typeof v === "number" ? v.toLocaleString("vi-VN") : v;
  };

  const renderRow = (r: T) => {
    const k = rowKey(r);
    const isSel = selected.has(k);
    return (
      <tr key={k} className={`${onRowClick ? "clickable" : ""}${isSel ? " selected" : ""}`} onClick={() => onRowClick?.(r)}>
        {selectable && (
          <td className="o-col-check" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={isSel}
              aria-label="Chọn dòng"
              onChange={() =>
                setSelected((prev) => {
                  const n = new Set(prev);
                  if (n.has(k)) n.delete(k);
                  else n.add(k);
                  return n;
                })
              }
            />
          </td>
        )}
        {visible.map((c) => (
          <td key={c.key} className={[c.numeric ? "num" : "", c.wrap ? "wrap" : ""].join(" ").trim() || undefined} style={c.width ? { width: c.width } : undefined}>
            {renderCell(c, r)}
          </td>
        ))}
        <td />
      </tr>
    );
  };

  const optionalCols = columns.filter((c) => c.optional);
  const colSpan = visible.length + (selectable ? 1 : 0) + 1;

  return (
    <div>
      {(selRows.length > 0 || exportName) && (
        <div className="o-list-bulk" style={selRows.length ? undefined : { background: "var(--o-surface)" }}>
          {selRows.length > 0 ? (
            <>
              <strong>Đã chọn {selRows.length}</strong>
              {bulkActions.map((a) => (
                <Button key={a.label} size="sm" variant={a.danger ? "danger" : "secondary"} onClick={() => void a.onClick(selRows)}>
                  {a.label}
                </Button>
              ))}
              {exportName && <Button size="sm" variant="secondary" icon={Download} onClick={() => exportRows(selRows)}>Xuất CSV</Button>}
              <Button size="sm" variant="link" onClick={() => setSelected(new Set())}>Bỏ chọn</Button>
            </>
          ) : (
            <>
              <span className="o-muted">{rows.length} bản ghi</span>
              <span style={{ flex: 1 }} />
              <Button size="sm" variant="secondary" icon={Download} onClick={() => exportRows(sorted)} disabled={!rows.length}>Xuất CSV</Button>
            </>
          )}
        </div>
      )}
      <div className="o-list-wrap">
        <table className="o-list">
          <thead>
            <tr>
              {selectable && (
                <th className="o-col-check">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    aria-label="Chọn tất cả"
                    onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map(rowKey)))}
                  />
                </th>
              )}
              {visible.map((c) => {
                const sortable = !!c.value && c.sortable !== false;
                return (
                  <th
                    key={c.key}
                    className={[sortable ? "sortable" : "", c.numeric ? "num" : ""].join(" ").trim() || undefined}
                    onClick={() => toggleSort(c)}
                    aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                  >
                    {c.label}
                    {sort?.key === c.key && (
                      <span className="o-sort">{sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}</span>
                    )}
                  </th>
                );
              })}
              <th style={{ width: 32, padding: "0 6px" }}>
                {optionalCols.length > 0 && (
                  <Dropdown
                    align="right"
                    button={({ toggle }) => (
                      <Button variant="link" size="sm" icon={SlidersHorizontal} onClick={toggle} aria-label="Chọn cột hiển thị" />
                    )}
                  >
                    {() =>
                      optionalCols.map((c) => (
                        <label key={c.key} className="o-dropdown-item">
                          <input
                            type="checkbox"
                            checked={!hidden.includes(c.key)}
                            onChange={() => setHidden((h) => (h.includes(c.key) ? h.filter((x) => x !== c.key) : [...h, c.key]))}
                          />
                          {c.label}
                        </label>
                      ))
                    }
                  </Dropdown>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr><td colSpan={colSpan} className="o-muted" style={{ textAlign: "center", padding: 24 }}>Đang tải…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={colSpan} style={{ padding: 0 }}>{emptyState ?? <div className="o-empty">Không có bản ghi.</div>}</td></tr>
            )}
            {groups
              ? groups.map(([g, list]) => {
                  const isCol = collapsed.has(g);
                  return (
                    <Fragment key={g}>
                      <tr
                        className="o-group-row"
                        onClick={() =>
                          setCollapsed((prev) => {
                            const n = new Set(prev);
                            if (n.has(g)) n.delete(g);
                            else n.add(g);
                            return n;
                          })
                        }
                      >
                        {selectable && <td />}
                        {visible.map((c, i) => (
                          <td key={c.key} className={c.numeric ? "num" : undefined}>
                            {i === 0 ? (
                              <span className="o-row" style={{ gap: 4, flexWrap: "nowrap" }}>
                                {isCol ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                {g} ({list.length})
                              </span>
                            ) : c.sum ? (
                              (c.formatSum ?? ((n: number) => n.toLocaleString("vi-VN")))(sumOf(c, list))
                            ) : null}
                          </td>
                        ))}
                        <td />
                      </tr>
                      {!isCol && list.map(renderRow)}
                    </Fragment>
                  );
                })
              : sorted.map(renderRow)}
          </tbody>
          {hasSum && rows.length > 0 && (
            <tfoot>
              <tr>
                {selectable && <td />}
                {visible.map((c, i) => (
                  <td key={c.key} className={c.numeric ? "num" : undefined}>
                    {c.sum ? (c.formatSum ?? ((n: number) => n.toLocaleString("vi-VN")))(sumOf(c, rows)) : i === 0 ? "Tổng" : null}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/** Kanban: cột theo trạng thái, thẻ gọn */
export function KanbanView<T>({
  columns,
  rows,
  columnOf,
  rowKey,
  card,
  onOpen,
}: {
  columns: { id: string; label: string }[];
  rows: T[];
  columnOf: (row: T) => string;
  rowKey: (row: T) => string | number;
  card: (row: T) => ReactNode;
  onOpen?: (row: T) => void;
}) {
  return (
    <div className="o-kanban">
      {columns.map((col) => {
        const list = rows.filter((r) => columnOf(r) === col.id);
        return (
          <div key={col.id} className="o-kanban-col">
            <div className="o-kanban-col-head">
              <span>{col.label}</span>
              <span className="o-muted">{list.length}</span>
            </div>
            <div className="o-kanban-cards">
              {list.map((r) => (
                <div
                  key={rowKey(r)}
                  className="o-kanban-card"
                  onClick={() => onOpen?.(r)}
                  role={onOpen ? "button" : undefined}
                  tabIndex={onOpen ? 0 : undefined}
                  onKeyDown={(e) => e.key === "Enter" && onOpen?.(r)}
                >
                  {card(r)}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
