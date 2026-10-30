import { useState } from "react";
import { Gift, Plus } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
import { Alert, Badge, Button, EmptyState, Field, Modal, errMsg, formatVnd } from "../../components/erp";
import { ImageField, useResource } from "../shared";
import type { GiftItemOpt, StoreOpt } from "./types";

/** CRM › Quà tặng hiện vật: danh mục quà + tồn từng chi nhánh (đang giữ cho khách đã trúng) */
export function GiftItems() {
  const owner = isOwnerRole(getStaffInfo()?.role);
  const myStore = getStaffInfo()?.storeId ?? null;
  const items = useResource<GiftItemOpt[]>("/api/admin/games/gift-items", []);
  const stores = useResource<StoreOpt[]>("/api/stores", []);
  const [editing, setEditing] = useState<GiftItemOpt | "new" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const visibleStores = owner ? stores.data : stores.data.filter((s) => s.id === myStore);

  async function setStock(g: GiftItemOpt, storeId: number, cur: number) {
    const v = window.prompt(`Tồn "${g.name}" tại chi nhánh (hiện ${cur}):`, String(cur));
    if (v == null) return;
    try {
      await staffApi(`/api/admin/games/gift-items/${g.id}/stock`, { method: "PUT", body: JSON.stringify({ storeId, qty: Number(v) }) });
      await items.reload();
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  return (
    <div className="o-stack" style={{ gap: 12 }}>
      <div className="gm-section-head">
        <h3>Quà tặng hiện vật</h3>
        <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>Thêm quà</Button>
      </div>
      {err && <Alert>{err}</Alert>}
      {items.error && <Alert>{items.error}</Alert>}
      {!items.loading && !items.data.length ? (
        <EmptyState icon={Gift} title="Chưa có quà hiện vật" hint="Thêm quà (nón, ly giữ nhiệt…) để đưa vào vòng quay." />
      ) : (
        <div className="o-list-wrap">
          <table className="o-list">
            <thead>
              <tr>
                <th>Quà</th>
                <th className="num">Giá trị</th>
                {visibleStores.map((s) => <th key={s.id} className="num">{s.name}<div className="o-muted gm-sub">tồn · đang giữ</div></th>)}
                <th>Trạng thái</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.data.map((g) => (
                <tr key={g.id}>
                  <td>
                    <div className="gm-player">
                      {g.imageUrl ? <img src={mediaUrl(g.imageUrl)} alt="" /> : <span className="gm-avatar"><Gift size={14} /></span>}
                      <div><strong>{g.name}</strong>{g.note && <div className="o-muted">{g.note}</div>}</div>
                    </div>
                  </td>
                  <td className="num">{formatVnd(g.value)}</td>
                  {visibleStores.map((s) => {
                    const st = g.stocks.find((x) => x.storeId === s.id);
                    return (
                      <td key={s.id} className="num">
                        <button type="button" className="gm-stock-btn" onClick={() => void setStock(g, s.id, st?.qty ?? 0)} title="Bấm để sửa tồn">
                          <strong>{st?.qty ?? 0}</strong> · {st?.reserved ?? 0}
                        </button>
                      </td>
                    );
                  })}
                  <td>{g.isActive ? <Badge tone="success">Đang dùng</Badge> : <Badge>Ngừng</Badge>}</td>
                  <td><Button size="sm" onClick={() => setEditing(g)}>Sửa</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <GiftItemForm item={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void items.reload(); }} />}
    </div>
  );
}

function GiftItemForm({ item, onClose, onSaved }: { item: GiftItemOpt | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: item?.name ?? "", imageUrl: item?.imageUrl ?? "", value: String(item?.value ?? ""), note: item?.note ?? "", isActive: item?.isActive ?? true });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const body = JSON.stringify({ name: f.name, imageUrl: f.imageUrl || null, value: Number(f.value.replace(/\D/g, "")) || 0, note: f.note || null, isActive: f.isActive });
      if (item) await staffApi(`/api/admin/games/gift-items/${item.id}`, { method: "PATCH", body });
      else await staffApi("/api/admin/games/gift-items", { method: "POST", body });
      onSaved();
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  }
  return (
    <Modal
      title={item ? `Sửa quà: ${item.name}` : "Thêm quà hiện vật"}
      onClose={onClose}
      footer={<><Button variant="primary" disabled={busy || !f.name.trim()} onClick={() => void save()}>Lưu</Button><Button onClick={onClose}>Hủy</Button></>}
    >
      {err && <Alert>{err}</Alert>}
      <div className="gm-form-grid">
        <Field label="Tên quà" required full><input className="o-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Ảnh" full><ImageField value={f.imageUrl} onChange={(v) => setF({ ...f, imageUrl: v })} onBusy={setBusy} /></Field>
        <Field label="Giá trị ước tính (đ)"><input className="o-input" inputMode="numeric" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
        <Field label="Đang dùng"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /></Field>
        <Field label="Ghi chú" full><input className="o-input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
