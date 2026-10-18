import { useState, useEffect } from "react";
import { staffApi } from "../lib/staffApi";

type Zone = { id: number; name: string; isActive: boolean };
type Table = { id: number; name: string; location: string | null; capacity: number; status: string; zoneId: number | null; zone: Zone | null };

export function AdminZones() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // Form states for Zone
  const [zoneName, setZoneName] = useState("");
  const [editingZone, setEditingZone] = useState<Zone | null>(null);

  // Form states for Table
  const [showTableForm, setShowTableForm] = useState(false);
  const [tableForm, setTableForm] = useState<{ id?: number; name: string; location: string; capacity: number; zoneId: number }>({
    name: "", location: "", capacity: 4, zoneId: 0
  });

  const load = async () => {
    try {
      setErr(null);
      const [zRes, tRes] = await Promise.all([
        staffApi<Zone[]>("/api/admin/zones"),
        staffApi<Table[]>("/api/admin/tables")
      ]);
      setZones(zRes);
      setTables(tRes);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi tải dữ liệu khu vực");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const saveZone = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setErr(null);
      if (editingZone) {
        await staffApi(`/api/admin/zones/${editingZone.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: zoneName }),
        });
      } else {
        await staffApi("/api/admin/zones", {
          method: "POST",
          body: JSON.stringify({ name: zoneName }),
        });
      }
      setZoneName("");
      setEditingZone(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi lưu khu vực");
    }
  };

  const deleteZone = async (id: number) => {
    if (!window.confirm("Xóa khu vực này?")) return;
    try {
      setErr(null);
      await staffApi(`/api/admin/zones/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi xóa khu vực");
    }
  };

  const saveTable = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setErr(null);
      if (tableForm.id) {
        await staffApi(`/api/admin/tables/${tableForm.id}`, {
          method: "PATCH",
          body: JSON.stringify(tableForm),
        });
      } else {
        await staffApi("/api/admin/tables", {
          method: "POST",
          body: JSON.stringify(tableForm),
        });
      }
      setShowTableForm(false);
      setTableForm({ name: "", location: "", capacity: 4, zoneId: zones[0]?.id || 0 });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi lưu bàn");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

      {/* ZONE MANAGEMENT */}
      <div className="card" style={{ padding: "1rem" }}>
        <h3>Quản lý Khu vực</h3>
        <form onSubmit={saveZone} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", marginBottom: "1rem" }}>
          <div className="field" style={{ marginBottom: 0, flex: 1 }}>
            <label className="label">Tên Khu vực</label>
            <input className="input" value={zoneName} onChange={e => setZoneName(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary">
            {editingZone ? "Cập nhật Khu vực" : "Thêm Khu vực"}
          </button>
          {editingZone && (
            <button type="button" className="btn btn-ghost" onClick={() => { setEditingZone(null); setZoneName(""); }}>
              Hủy
            </button>
          )}
        </form>

        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Tên Khu vực</th>
              <th>Số bàn</th>
              <th style={{ width: 150 }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {zones.map(z => {
              const count = tables.filter(t => t.zoneId === z.id).length;
              return (
                <tr key={z.id}>
                  <td>{z.id}</td>
                  <td><strong>{z.name}</strong></td>
                  <td>{count} bàn</td>
                  <td>
                    <button className="btn btn-ghost" onClick={() => { setEditingZone(z); setZoneName(z.name); }}>Sửa</button>
                    <button className="btn btn-ghost" style={{ color: "red" }} onClick={() => deleteZone(z.id)}>Xóa</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* TABLE MANAGEMENT */}
      <div className="card" style={{ padding: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3>Quản lý Bàn</h3>
          <button className="btn btn-primary" onClick={() => {
            setTableForm({ name: "", location: "", capacity: 4, zoneId: zones[0]?.id || 0 });
            setShowTableForm(true);
          }}>
            Thêm Bàn mới
          </button>
        </div>

        {showTableForm && (
          <form onSubmit={saveTable} style={{ background: "#f9f6f2", padding: "1rem", borderRadius: 8, marginBottom: "1rem" }}>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              <div className="field">
                <label className="label">Tên Bàn</label>
                <input className="input" value={tableForm.name} onChange={e => setTableForm({ ...tableForm, name: e.target.value })} required />
              </div>
              <div className="field">
                <label className="label">Khu vực</label>
                <select className="input" value={tableForm.zoneId} onChange={e => setTableForm({ ...tableForm, zoneId: Number(e.target.value) })}>
                  {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label">Vị trí (Mô tả)</label>
                <input className="input" value={tableForm.location} onChange={e => setTableForm({ ...tableForm, location: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
              <button type="submit" className="btn btn-primary">Lưu Bàn</button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowTableForm(false)}>Hủy</button>
            </div>
          </form>
        )}

        {/* Bàn hiển thị theo nhóm khu vực */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {zones.map(z => {
            const zTables = tables.filter(t => t.zoneId === z.id);
            if (zTables.length === 0) return null;
            return (
              <div key={z.id}>
                <h4 style={{ margin: "0 0 0.5rem", color: "var(--primary)" }}>{z.name}</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.5rem" }}>
                  {zTables.map(t => (
                    <div key={t.id} style={{ background: "#fff", border: "1px solid #e5ddd5", padding: "0.75rem", borderRadius: 8 }}>
                      <div style={{ fontWeight: 600 }}>{t.name}</div>
                      <div style={{ fontSize: "0.8rem", color: "#6b5e55", marginBottom: "0.5rem" }}>{t.location || "Chưa có mô tả"}</div>
                      <div>
                        <button className="btn btn-ghost staff-btn-light" style={{ padding: "0.2rem 0.5rem", fontSize: "0.8rem", marginRight: "0.5rem" }} onClick={() => {
                          setTableForm({ id: t.id, name: t.name, location: t.location || "", capacity: t.capacity, zoneId: t.zoneId || zones[0]?.id });
                          setShowTableForm(true);
                        }}>Sửa</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
