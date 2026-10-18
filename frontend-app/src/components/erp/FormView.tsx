import { useEffect, useState, type ReactNode } from "react";
import { Pencil, Save, Undo2 } from "lucide-react";
import { staffApi } from "../../lib/staffApi";
import { Breadcrumb, type Crumb } from "./ControlPanel";
import { Alert, Button } from "./primitives";

/**
 * Khung form kiểu Odoo:
 *  - hàng breadcrumb + nút Sửa / Lưu / Hủy
 *  - thanh hành động (trái) + StatusBar (phải)
 *  - sheet trắng ở giữa, Chatter bên phải
 */
export function FormView({
  crumbs,
  editing,
  canEdit = true,
  onEdit,
  onSave,
  onDiscard,
  saving,
  actions,
  statusBar,
  chatter,
  error,
  info,
  children,
}: {
  crumbs: Crumb[];
  editing: boolean;
  canEdit?: boolean;
  onEdit?: () => void;
  onSave?: () => void;
  onDiscard?: () => void;
  saving?: boolean;
  actions?: ReactNode;
  statusBar?: ReactNode;
  chatter?: ReactNode;
  error?: string | null;
  info?: string | null;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="o-cp" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
        <div className="o-cp-left">
          <Breadcrumb items={crumbs} />
        </div>
        <div className="o-cp-right">
          {canEdit &&
            (editing ? (
              <>
                {onSave && (
                  <Button variant="primary" icon={Save} onClick={onSave} disabled={saving}>
                    {saving ? "Đang lưu…" : "Lưu"}
                  </Button>
                )}
                {onDiscard && (
                  <Button variant="secondary" icon={Undo2} onClick={onDiscard} disabled={saving}>Hủy</Button>
                )}
              </>
            ) : (
              onEdit && <Button variant="primary" icon={Pencil} onClick={onEdit}>Sửa</Button>
            ))}
        </div>
      </div>
      {(actions || statusBar) && (
        <div className="o-form-bar">
          <div className="o-form-bar-actions">{actions}</div>
          {statusBar}
        </div>
      )}
      <div className="o-form-body">
        <div className="o-form-main o-stack">
          {error && <Alert>{error}</Alert>}
          {info && <Alert tone="info">{info}</Alert>}
          <div className="o-sheet">{children}</div>
        </div>
        {chatter}
      </div>
    </div>
  );
}

/** Tiêu đề sheet: tên bản ghi lớn + phụ đề + ảnh (tùy chọn) */
export function SheetTitle({ title, sub, avatar, right }: { title: ReactNode; sub?: ReactNode; avatar?: string | null; right?: ReactNode }) {
  return (
    <div className="o-sheet-title">
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1>{title}</h1>
        {sub && <div className="o-sheet-sub">{sub}</div>}
      </div>
      {right}
      {avatar !== undefined && (avatar ? <img className="o-sheet-avatar" src={avatar} alt="" /> : <div className="o-sheet-avatar" />)}
    </div>
  );
}

type AuditRow = {
  id: number;
  action: string;
  target: string | null;
  detail: string | null;
  createdAt: string;
  staff: { fullName: string; username: string | null; role: string } | null;
};

/**
 * Chatter "Lịch sử": đọc API audit log sẵn có và lọc theo đối tượng (vd "Staff #3").
 * Không có log nào cho bản ghi → ẩn hẳn.
 */
export function Chatter({ target, action, reloadKey }: { target: string; action?: string; reloadKey?: unknown }) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ page: "1", limit: "200" });
    if (action) params.set("action", action);
    staffApi<{ rows: AuditRow[] }>(`/api/admin/audit-logs?${params}`)
      .then((d) => alive && setRows(d.rows.filter((r) => r.target === target)))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [target, action, reloadKey]);

  if (!rows || rows.length === 0) return null;
  return (
    <aside className="o-chatter" aria-label="Lịch sử">
      <h3>Lịch sử</h3>
      {rows.map((r) => (
        <div key={r.id} className="o-chatter-item">
          <div className="o-chatter-avatar">{(r.staff?.fullName ?? "H").slice(0, 1)}</div>
          <div style={{ minWidth: 0 }}>
            <div>
              <strong>{r.staff?.fullName ?? "Hệ thống"}</strong>{" "}
              <span className="o-chatter-meta">{new Date(r.createdAt).toLocaleString("vi-VN")}</span>
            </div>
            <div>{r.action}</div>
            {r.detail && <div className="o-muted" style={{ overflowWrap: "anywhere" }}>{r.detail}</div>}
          </div>
        </div>
      ))}
    </aside>
  );
}
