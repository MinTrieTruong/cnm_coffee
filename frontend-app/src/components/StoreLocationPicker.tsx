import { useState, useRef, useMemo, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMapEvent, useMap } from "react-leaflet";

export type StoreLocation = { lat: number; lng: number; radius: number };

function MapClickHandler({ setPos }: { setPos: (lat: number, lng: number) => void }) {
  useMapEvent("click", (e) => {
    setPos(e.latlng.lat, e.latlng.lng);
  });
  return null;
}

function MapUpdater({ lat, lng, zoom }: { lat: number, lng: number, zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], zoom);
  }, [lat, lng, zoom, map]);
  return null;
}

/**
 * Địa chỉ & định vị GPS của một chi nhánh: chọn tỉnh/phường + định vị, lấy vị trí hiện tại,
 * kéo ghim / bấm trên bản đồ. Bán kính dùng cho chấm công GPS.
 */
export function StoreLocationPicker({
  value,
  onChange,
  onAddress,
  onErr,
  disabled,
}: {
  value: StoreLocation;
  onChange: (v: StoreLocation) => void;
  /** Địa chỉ ghép từ tỉnh/phường/đường sau khi bấm "Định vị" */
  onAddress?: (address: string) => void;
  onErr: (s: string | null) => void;
  disabled?: boolean;
}) {
  const { lat, lng, radius } = value;
  const [zoom, setZoom] = useState(16);
  const [provincesData, setProvincesData] = useState<any[]>([]);
  const [selProv, setSelProv] = useState<any>(null);
  const [selWard, setSelWard] = useState<any>(null);
  const [street, setStreet] = useState("");
  const [busy, setBusy] = useState(false);
  const markerRef = useRef<any>(null);
  const setPos = (la: number, ln: number) => onChange({ ...value, lat: la, lng: ln });

  useEffect(() => {
    if (disabled) return;
    fetch("https://provinces.open-api.vn/api/?depth=3")
      .then(res => res.json())
      .then(data => setProvincesData(data))
      .catch(e => console.error("Error loading provinces:", e));
  }, [disabled]);

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const position = marker.getLatLng();
          setPos(position.lat, position.lng);
        }
      },
    }),
    [value]
  );

  // Compute all wards of the selected province
  const availableWards = useMemo(() => {
    if (!selProv || !selProv.districts) return [];
    return selProv.districts.flatMap((d: any) => d.wards || []);
  }, [selProv]);

  async function handleGeocode() {
    const parts = [street, selWard?.name, selProv?.name, "Việt Nam"].filter(Boolean);
    const searchString = parts.join(", ");
    if (!searchString) return onErr("Vui lòng nhập địa chỉ để định vị.");

    setBusy(true);
    try {
      const q = encodeURIComponent(searchString);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}`);
      const data = await res.json();
      if (data && data.length > 0) {
        setPos(parseFloat(data[0].lat), parseFloat(data[0].lon));
        setZoom(16);
        const addr = [street, selWard?.name, selProv?.name].filter(Boolean).join(", ");
        if (addr) onAddress?.(addr);
      } else {
        onErr("Không tìm thấy tọa độ. Vui lòng kéo thả Ghim đỏ trên bản đồ để tinh chỉnh.");
      }
    } catch (e) {
      onErr("Lỗi kết nối Geocoding.");
    } finally {
      setBusy(false);
    }
  }

  function handleCurrentLocation() {
    if (!navigator.geolocation) {
      onErr("Trình duyệt không hỗ trợ Geolocation.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPos(pos.coords.latitude, pos.coords.longitude);
        setZoom(16);
        setBusy(false);
      },
      (err) => {
        onErr("Không thể lấy vị trí hiện tại: " + err.message);
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {!disabled && (
        <>
          {/* Multi-level Address selector (Gộp Phường/Xã) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.8rem", marginBottom: "0.8rem" }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="label">Tỉnh / Thành phố</label>
              <select className="input" value={selProv?.code ?? ""} onChange={e => {
                const p = provincesData.find(x => x.code === Number(e.target.value));
                setSelProv(p); setSelWard(null);
              }}>
                <option value="">Chọn Tỉnh/Thành</option>
                {provincesData.map(p => (
                  <option key={p.code} value={p.code}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="label">Phường / Xã</label>
              <select className="input" value={selWard?.code ?? ""} disabled={!selProv} onChange={e => {
                const w = availableWards.find((x: any) => x.code === Number(e.target.value));
                setSelWard(w);
              }}>
                <option value="">Chọn Phường/Xã</option>
                {availableWards.map((w: any) => (
                  <option key={w.code} value={w.code}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field" style={{ marginBottom: "0.8rem" }}>
            <label className="label">Số nhà, Tên đường, Ấp...</label>
            <input className="input" value={street} onChange={e => setStreet(e.target.value)} placeholder="VD: 12 Nguyễn Văn Bảo" />
          </div>

          <div style={{ display: "flex", gap: "0.8rem", marginBottom: "1rem" }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1, background: "rgba(146,64,14,0.15)", color: "var(--accent)" }} onClick={() => void handleGeocode()} disabled={busy}>
              Định vị
            </button>
            <button type="button" className="btn btn-ghost" style={{ flex: 1, background: "rgba(39, 201, 128, 0.15)", color: "#27c980" }} onClick={handleCurrentLocation} disabled={busy}>
              Vị trí hiện tại
            </button>
          </div>
        </>
      )}

      {/* GPS coordinates & Radius */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 1, minWidth: 110, marginBottom: 0 }}>
          <label className="label">Vĩ độ (Lat)</label>
          <input className="input" style={{ background: "var(--surface)" }} readOnly value={lat.toFixed(6)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 110, marginBottom: 0 }}>
          <label className="label">Kinh độ (Lng)</label>
          <input className="input" style={{ background: "var(--surface)" }} readOnly value={lng.toFixed(6)} />
        </div>
        <div className="field" style={{ width: "120px", marginBottom: 0 }}>
          <label className="label">Bán kính (m)</label>
          <input className="input" type="number" min="10" max="1000" value={radius} disabled={disabled}
            onChange={(e) => onChange({ ...value, radius: Number(e.target.value) || 0 })} />
        </div>
      </div>

      <div style={{ minHeight: "320px", flex: 1, borderRadius: "8px", overflow: "hidden", border: "1px solid rgba(146,64,14,0.2)", position: "relative", zIndex: 1 }}>
        <MapContainer
          center={[lat, lng]}
          zoom={zoom}
          scrollWheelZoom={true}
          style={{ height: "100%", width: "100%", position: "absolute", inset: 0 }}
        >
          <TileLayer
            attribution='&copy; Google Maps'
            url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
          />
          <Marker
            draggable={!disabled}
            eventHandlers={eventHandlers}
            position={[lat, lng]}
            ref={markerRef}
          />
          <Circle
            center={[lat, lng]}
            pathOptions={{ fillColor: 'var(--accent)', color: 'var(--accent)', weight: 2 }}
            radius={radius || 50}
          />
          {!disabled && <MapClickHandler setPos={setPos} />}
          <MapUpdater lat={lat} lng={lng} zoom={zoom} />
        </MapContainer>
      </div>
    </div>
  );
}
