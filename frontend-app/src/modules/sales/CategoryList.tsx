import { useState } from "react";
import { FolderTree, Trash2 } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
import { Alert, Button, EmptyState, Field, Modal, RecordList, errMsg } from "../../components/erp";
import { ImageField, useResource } from "../shared";

type Category = { id: number; name: string; sortOrder: number; imageUrl: string | null };

/** Ảnh tròn 32px ở cột "Ảnh"; không có / lỗi ảnh → vòng tròn nhạt */
function Thumb({ url }: { url: string | null }) {
  const [broken, setBroken] = useState(false);
  const src = mediaUrl(url ?? undefined);
  const box = { width: 32, height: 32, borderRadius: "50%", display: "block", background: "var(--o-surface-alt)", border: "1px solid var(--o-border)" } as const;
  return src && !broken ? <img src={src} alt="" style={{ ...box, objectFit: "cover" }} loading="lazy" onError={() => setBroken(true)} /> : <span style={box} aria-hidden />;
}

export function CategoryList() {
  const { data: rows, loading, error, reload } = useResource<Category[]>("/api/admin/categories", []);
  const [editing, setEditing] = useState<Category | "new" | null>(null);

  return (
    <>
      <RecordList
        crumbs={[{ label: "Danh mục" }]}
        rows={rows}
        columns={[
          { key: "img", label: "Ảnh", render: (c) => <Thumb url={c.imageUrl} />, width: 56, sortable: false },
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
  const [imageUrl, setImageUrl] = useState(record?.imageUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Route chỉ cho Chủ chuỗi sửa; vai trò khác (nếu được xem) thấy ô ảnh ở chế độ chỉ xem
  const canEdit = isOwnerRole(getStaffInfo()?.role);

  async function save() {
    if (!name.trim()) return setErr("Nhập tên danh mục.");
    setBusy(true);
    setErr(null);
    try {
      if (record) {
        await staffApi(`/api/admin/categories/${record.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: name.trim(), sortOrder: Number(sortOrder.replace(/\D/g, "")) || 0, imageUrl: imageUrl.trim() || null }),
        });
      } else {
        await staffApi("/api/admin/categories", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), sortOrder: sortOrder.trim() ? Number(sortOrder.replace(/\D/g, "")) : undefined, imageUrl: imageUrl.trim() || null }),
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
          <Button variant="primary" onClick={() => void save()} disabled={busy || uploading || !canEdit}>{uploading ? "Đang tải ảnh…" : "Lưu"}</Button>
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
        <Field label="Ảnh đại diện">
          <ImageField value={imageUrl} onChange={setImageUrl} onBusy={setUploading} disabled={!canEdit} round />
          <div className="o-hint">Ảnh vuông, tối thiểu 400×400, hiện hình tròn trên menu web. Để trống sẽ dùng ảnh món đầu tiên.</div>
        </Field>
      </div>
    </Modal>
  );
}
