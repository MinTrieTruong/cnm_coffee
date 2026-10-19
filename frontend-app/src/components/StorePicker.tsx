import { useState } from "react";
import { MapPin, Store } from "lucide-react";
import { api } from "../lib/api";
import { useCustomerStore, type PublicStore } from "../lib/customerStore";

/** Chọn chi nhánh cho khách (ẩn khi chuỗi chỉ có 1 chi nhánh). Đang ngồi bàn thì chỉ hiển thị. */
export function StorePicker({ compact }: { compact?: boolean }) {
  const { store, stores, storeId, locked, setStore } = useCustomerStore();
  const [nearby, setNearby] = useState<PublicStore[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (stores.length <= 1 && !locked) return null;

  function findNearest() {
    if (!navigator.geolocation) return setMsg("Trình duyệt không hỗ trợ định vị.");
    setBusy(true);
    setMsg(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const list = await api<PublicStore[]>(`/api/stores?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`);
          setNearby(list);
          if (list[0]) setStore(list[0].id);
        } catch {
          setMsg("Không tải được danh sách chi nhánh.");
        } finally {
          setBusy(false);
        }
      },
      () => {
        setMsg("Không lấy được vị trí. Hãy chọn chi nhánh trong danh sách.");
        setBusy(false);
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  const dist = (id: number) => nearby?.find((s) => s.id === id)?.distanceKm;

  if (locked && store) {
    return (
      <div className="store-picker" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.9rem", color: "var(--muted)" }}>
        <Store size={16} aria-hidden /> Đang phục vụ tại <strong style={{ color: "var(--text)" }}>{store.name}</strong>
      </div>
    );
  }

  return (
    <div className="store-picker" style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: compact ? 0 : "1rem" }}>
      <label className="label" htmlFor="store-picker" style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
        <Store size={16} aria-hidden /> Chi nhánh đặt món
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select
          id="store-picker"
          className="input"
          style={{ flex: 1, minWidth: 0 }}
          value={storeId ?? ""}
          onChange={(e) => e.target.value && setStore(Number(e.target.value))}
        >
          <option value="">Chọn chi nhánh…</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {dist(s.id) != null ? ` — ${dist(s.id)} km` : ""}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-ghost" onClick={findNearest} disabled={busy} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <MapPin size={16} aria-hidden /> {busy ? "Đang tìm…" : "Gần tôi"}
        </button>
      </div>
      {store?.address && <span className="subtle" style={{ fontSize: "0.8rem" }}>{store.address}{store.openTime && store.closeTime ? ` · ${store.openTime}–${store.closeTime}` : ""}</span>}
      {msg && <span style={{ fontSize: "0.8rem", color: "var(--danger)" }}>{msg}</span>}
    </div>
  );
}
