import { useState } from "react";
import { FolderTree, Trash2 } from "lucide-react";
import { staffApi } from "../../lib/staffApi";
import { Alert, Button, EmptyState, Field, Modal, RecordList, errMsg } from "../../components/erp";
import { useResource } from "../shared";

type Category = { id: number; name: string; sortOrder: number };

export function CategoryList() {
  const { data: rows, loading, error, reload } = useResource<Category[]>("/api/admin/categories", []);
  const [editing, setEditing] = useState<Category | "new" | null>(null);

  return (
    <>
      <RecordList
        crumbs={[{ label: "Danh mục" }]}
        rows={rows}
        columns={[
          { key: "sort", label: "Thứ tự", value: (c) => c.sortOrder, numeric: true, width: 90 },
          { key: "name", label: "Tên danh mục", value: (c) => c.name },
          { key: "id", label: "Mã", value: (c) => c.id, numeric: true, optional: true },
        ]}
        rowKey={(c) => c.id}
        loading={loading}
        error={error}
        onOpen={setEditing}
        onCreate={() => setEditing("new")}
        searchText={(c) => c.name}
        exportName="danh-muc"
        emptyState={<EmptyState icon={FolderTree} title="Chưa có danh mục" />}
      />
      {editing && (
        <CategoryDialog
          record={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
    </>
  );
}

function CategoryDialog({ record, onClose, onSaved }: { record: Category | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(record?.name ?? "");
  const [sortOrder, setSortOrder] = useState(record ? String(record.sortOrder) : "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return setErr("Nhập tên danh mục.");
    setBusy(true);
    setErr(null);
    try {
      if (record) {
        await staffApi(`/api/admin/categories/${record.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: name.trim(), sortOrder: Number(sortOrder.replace(/\D/g, "")) || 0 }),
        });
      } else {
        await staffApi("/api/admin/categories", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), sortOrder: sortOrder.trim() ? Number(sortOrder.replace(/\D/g, "")) : undefined }),
        });
      }
      await onSaved();
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  }

  async function remove() {
    if (!record || !window.confirm(`Xóa danh mục "${record.name}"? Chỉ xóa được khi không còn món.`)) return;
    setBusy(true);
    try {
      await staffApi(`/api/admin/categories/${record.id}`, { method: "DELETE" });
      await onSaved();
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={record ? `Danh mục: ${record.name}` : "Tạo danh mục"}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>Lưu</Button>
          <Button onClick={onClose}>Hủy</Button>
          {record && (
            <Button variant="danger" icon={Trash2} onClick={() => void remove()} disabled={busy} style={{ marginLeft: "auto" }}>Xóa</Button>
          )}
        </>
      }
    >
      <div className="o-stack" style={{ gap: 4 }}>
        {err && <Alert>{err}</Alert>}
        <Field label="Tên" required>
          <input className="o-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Thứ tự">
          <input className="o-input" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} placeholder="Số nhỏ hiện trước" />
        </Field>
      </div>
    </Modal>
  );
}
