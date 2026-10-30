import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GripVertical, Inbox, Pencil, Plus, RefreshCw, Save, Search, Settings2, SlidersHorizontal, Trash2 } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { staffApi } from "../../lib/staffApi";
import { Alert, Badge, Breadcrumb, Button, Dropdown, errMsg } from "../../components/erp";
import { useResource } from "../shared";
import { POPUPS_BASE, type PopupRow } from "./types";
import "../../styles/popup.css";

const MAX = 3;
const OPTIONAL_COLS = [
  { key: "time", label: "Thời gian chạy" },
  { key: "stats", label: "Lượt xem / Lượt bấm" },
  { key: "scope", label: "Chi nhánh" },
] as const;
type ColKey = (typeof OPTIONAL_COLS)[number]["key"];

const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString("vi-VN") : "");
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();
/** Đang bật và chưa hết hạn */
const live = (p: PopupRow) => p.isActive && (!p.endAt || +new Date(p.endAt) > Date.now());

function readCols(): ColKey[] {
  try {
    const raw = localStorage.getItem("popup-list-hidden");
    return raw ? (JSON.parse(raw) as ColKey[]) : [];
  } catch {
    return [];
  }
}

/** CRM › Pop up: danh sách, đổi thứ tự (kéo-thả / sửa số), bật/tắt trực tiếp rồi bấm Lưu */
export function PopupList() {
  const nav = useNavigate();
  const { data, loading, error, reload } = useResource<PopupRow[]>("/api/admin/popups", []);
  const [rows, setRows] = useState<PopupRow[]>([]);
  const [q, setQ] = useState("");
  const [hidden, setHidden] = useState<ColKey[]>(readCols);
  const [showExpired, setShowExpired] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dragId, setDragId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ tone: "danger" | "info"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setRows(data), [data]);
  useEffect(() => {
    try {
      localStorage.setItem("popup-list-hidden", JSON.stringify(hidden));
    } catch {
      /* bỏ qua */
    }
  }, [hidden]);

  const dirty = useMemo(
    () => rows.filter((r) => {
      const o = data.find((x) => x.id === r.id);
      return o && (o.sortOrder !== r.sortOrder || o.isActive !== r.isActive);
    }),
    [rows, data],
  );

  const shown = rows.filter((r) => {
    if (!showExpired && r.endAt && +new Date(r.endAt) < Date.now()) return false;
    const s = norm(q.trim());
    return !s || norm(`${r.name} ${r.targetLabel}`).includes(s);
  });

  const col = (k: ColKey) => !hidden.includes(k);
  const set = (id: number, patch: Partial<PopupRow>) => setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  function toggle(r: PopupRow) {
    setMsg(null);
    if (!r.isActive) {
      // Kiểm tra sơ bộ trên trình duyệt; server kiểm tra lại theo từng chi nhánh + thời gian chạy
      const overlapping = rows.filter((x) => x.id !== r.id && live(x) && (x.allStores || r.allStores || x.stores.some((s) => r.stores.some((t) => t.storeId === s.storeId))));
      if (overlapping.length >= MAX) {
        setMsg({ tone: "danger", text: `Chỉ được hiển thị tối đa ${MAX} pop up cùng lúc. Tắt bớt một pop up đang bật trước khi bật "${r.name}".` });
        return;
      }
    }
    set(r.id, { isActive: !r.isActive });
  }

  /** Kéo dòng `dragId` thả vào vị trí dòng `targetId` → đánh lại thứ tự 1, 2, 3… */
  function dropOn(targetId: number) {
    if (dragId == null || dragId === targetId) return;
    const list = [...rows];
    const from = list.findIndex((r) => r.id === dragId);
    const to = list.findIndex((r) => r.id === targetId);
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    setRows(list.map((r, i) => (r.editable ? { ...r, sortOrder: i + 1 } : r)));
    setDragId(null);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await staffApi("/api/admin/popups", { method: "PATCH", body: JSON.stringify({ items: dirty.map((r) => ({ id: r.id, sortOrder: r.sortOrder, isActive: r.isActive })) }) });
      await reload();
      setMsg({ tone: "info", text: "Đã lưu thứ tự và trạng thái." });
    } catch (e) {
      setMsg({ tone: "danger", text: errMsg(e) });
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: PopupRow) {
    if (!window.confirm(`Xóa pop up "${r.name}"?`)) return;
    try {
      await staffApi(`/api/admin/popups/${r.id}`, { method: "DELETE" });
      await reload();
    } catch (e) {
      setMsg({ tone: "danger", text: errMsg(e) });
    }
  }

  const allChecked = shown.length > 0 && shown.every((r) => selected.has(r.id));

  return (
    <div className="pu-admin">
      <div className="o-cp" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
        <div className="o-cp-left"><Breadcrumb items={[{ label: "Chiến dịch" }, { label: "Pop up" }]} /></div>
        <div className="o-cp-right" />
      </div>
      <div className="pu-head">
        <h1>Danh sách Pop up <span className="o-muted">(chỉ được hiển thị tối đa {MAX} Pop up)</span></h1>
        <Button variant="primary" icon={Plus} onClick={() => nav(`${POPUPS_BASE}/new`)}>Thêm Pop up</Button>
      </div>

      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {error && <Alert>{error}</Alert>}

      <section className="o-card pu-list-card">
        <div className="pu-toolbar">
          <div className="pu-search">
            <Search size={15} aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm kiếm" aria-label="Tìm kiếm" />
          </div>
          <span style={{ flex: 1 }} />
          <Button variant="link" icon={RefreshCw} onClick={() => void reload()} aria-label="Làm mới" title="Làm mới" />
          <Dropdown align="right" button={({ toggle: t }) => <Button variant="link" icon={SlidersHorizontal} onClick={t} aria-label="Chọn cột" title="Chọn cột" />}>
            {() => OPTIONAL_COLS.map((c) => (
              <label key={c.key} className="o-dropdown-item">
                <input type="checkbox" checked={col(c.key)} onChange={() => setHidden((h) => (h.includes(c.key) ? h.filter((x) => x !== c.key) : [...h, c.key]))} />
                {c.label}
              </label>
            ))}
          </Dropdown>
          <Dropdown align="right" button={({ toggle: t }) => <Button variant="link" icon={Settings2} onClick={t} aria-label="Cài đặt" title="Cài đặt" />}>
            {() => (
              <label className="o-dropdown-item">
                <input type="checkbox" checked={showExpired} onChange={(e) => setShowExpired(e.target.checked)} />
                Hiện pop up đã hết hạn
              </label>
            )}
          </Dropdown>
        </div>

        <div className="o-list-wrap">
          <table className="o-list pu-table">
            <thead>
              <tr>
                <th className="o-col-check">
                  <input type="checkbox" checked={allChecked} aria-label="Chọn tất cả" onChange={() => setSelected(allChecked ? new Set() : new Set(shown.map((r) => r.id)))} />
                </th>
                <th style={{ width: 28 }} aria-label="Kéo để đổi thứ tự" />
                <th style={{ width: 72 }}>Hình ảnh</th>
                <th>Tên</th>
                <th style={{ width: 110 }} className="num">Thứ tự hiển thị</th>
                <th style={{ width: 96 }}>Trạng thái</th>
                {col("time") && <th>Thời gian chạy</th>}
                {col("stats") && <th className="num">Lượt xem / bấm</th>}
                {col("scope") && <th>Chi nhánh</th>}
                <th style={{ width: 88 }}>Chỉnh sửa</th>
              </tr>
            </thead>
            <tbody>
              {loading && !rows.length && <tr><td colSpan={10} className="o-muted" style={{ textAlign: "center", padding: 24 }}>Đang tải…</td></tr>}
              {!loading && !shown.length && (
                <tr>
                  <td colSpan={10}>
                    <div className="o-empty">
                      <div className="o-empty-icon"><Inbox aria-hidden /></div>
                      <div className="o-empty-title">Chưa có dữ liệu</div>
                      <div>Bấm "Thêm Pop up" để tạo pop up đầu tiên.</div>
                    </div>
                  </td>
                </tr>
              )}
              {shown.map((r) => {
                const ctr = r.viewCount ? Math.round((r.clickCount / r.viewCount) * 1000) / 10 : 0;
                const expired = r.endAt && +new Date(r.endAt) < Date.now();
                return (
                  <tr
                    key={r.id}
                    className={`${dragId === r.id ? "pu-dragging" : ""}${selected.has(r.id) ? " selected" : ""}`}
                    draggable={r.editable}
                    onDragStart={() => setDragId(r.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => dropOn(r.id)}
                    onDragEnd={() => setDragId(null)}
                  >
                    <td className="o-col-check">
                      <input type="checkbox" checked={selected.has(r.id)} aria-label="Chọn dòng" onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />
                    </td>
                    <td className="pu-grip">{r.editable && <GripVertical size={14} aria-hidden />}</td>
                    <td><img className="pu-thumb" src={mediaUrl(r.imageUrl)} alt="" /></td>
                    <td className="wrap">
                      <strong>{r.name}</strong>
                      <div className="o-muted pu-sub">{r.targetLabel}</div>
                    </td>
                    <td className="num">
                      <input className="o-input num pu-order" inputMode="numeric" value={r.sortOrder} disabled={!r.editable}
                        onChange={(e) => set(r.id, { sortOrder: Number(e.target.value.replace(/[^\d-]/g, "")) || 0 })} aria-label="Thứ tự hiển thị" />
                    </td>
                    <td>
                      <button type="button" role="switch" aria-checked={r.isActive} className={`pu-switch${r.isActive ? " on" : ""}`} disabled={!r.editable} onClick={() => toggle(r)}>
                        <span />
                      </button>
                      {expired && <div><Badge>Hết hạn</Badge></div>}
                    </td>
                    {col("time") && <td>{r.startAt || r.endAt ? `${fmt(r.startAt) || "…"} → ${fmt(r.endAt) || "…"}` : <span className="o-muted">Không giới hạn</span>}</td>}
                    {col("stats") && <td className="num">{r.viewCount.toLocaleString("vi-VN")} / {r.clickCount.toLocaleString("vi-VN")}<div className="o-muted pu-sub">{ctr}% bấm</div></td>}
                    {col("scope") && <td>{r.allStores ? "Cả chuỗi" : r.stores.map((s) => s.store.name).join(", ")}</td>}
                    <td>
                      <span className="o-row" style={{ gap: 2, flexWrap: "nowrap" }}>
                        <Button variant="link" icon={Pencil} onClick={() => nav(`${POPUPS_BASE}/${r.id}`)} aria-label="Sửa" title={r.editable ? "Sửa" : "Xem"} />
                        {r.editable && <Button variant="link" icon={Trash2} onClick={() => void remove(r)} aria-label="Xóa" title="Xóa" />}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="pu-list-foot">
          <span className="o-muted">{dirty.length ? `${dirty.length} thay đổi chưa lưu` : "Kéo thả dòng hoặc sửa số để đổi thứ tự"}</span>
          <Button variant="primary" icon={Save} disabled={!dirty.length || saving} onClick={() => void save()}>{saving ? "Đang lưu…" : "Lưu"}</Button>
        </div>
      </section>
    </div>
  );
}
