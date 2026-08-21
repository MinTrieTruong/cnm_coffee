import { useState, useRef, useMemo, useEffect, type FormEvent } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMapEvent, useMap } from "react-leaflet";
import { staffApi } from "../lib/staffApi";

type StoreSettingsPayload = {
  vatRatePercent: number;
  pointPerVnd: number;
  pointValueVnd: number;
  cashRoundTo: number;
  pointEarnEveryVnd: number;
  pointEarnEach: number;
  storeLat: number | null;
  storeLng: number | null;
  storeAddress: string | null;
  allowedRadius: number;
  faceMatchThreshold: number;
};

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

export function AdminStoreSettings({
  settings,
  onSaved,
  onErr,
}: {
  settings: StoreSettingsPayload;
  onSaved: () => Promise<void>;
  onErr: (s: string | null) => void;
}) {
  const [vat, setVat] = useState(String(settings.vatRatePercent ?? 10));
  const [earnEvery, setEarnEvery] = useState(String(settings.pointEarnEveryVnd ?? 1000));
  const [earnEach, setEarnEach] = useState(String(settings.pointEarnEach ?? 100));
  const [pval, setPval] = useState(String(settings.pointValueVnd ?? 1));
  const [round, setRound] = useState(String(settings.cashRoundTo ?? 1000));

  const defaultLat = 10.53;
  const defaultLng = 105.63;

  const [lat, setLat] = useState(settings.storeLat ?? defaultLat);
  const [lng, setLng] = useState(settings.storeLng ?? defaultLng);
  const [zoom, setZoom] = useState(16);
  const [radius, setRadius] = useState(String(settings.allowedRadius ?? 50));
  const [threshold, setThreshold] = useState(settings.faceMatchThreshold ?? 0.5);
  
  const [provincesData, setProvincesData] = useState<any[]>([]);
  const [selProv, setSelProv] = useState<any>(null);
  const [selWard, setSelWard] = useState<any>(null);
  const [street, setStreet] = useState("");

  const [busy, setBusy] = useState(false);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    fetch("https://provinces.open-api.vn/api/?depth=3")
      .then(res => res.json())
      .then(data => setProvincesData(data))
      .catch(e => console.error("Error loading provinces:", e));
  }, []);

  useEffect(() => {
    setVat(String(settings.vatRatePercent ?? 10));
    setEarnEvery(String(settings.pointEarnEveryVnd ?? 1000));
    setEarnEach(String(settings.pointEarnEach ?? 100));
    setPval(String(settings.pointValueVnd ?? 1));
    setRound(String(settings.cashRoundTo ?? 1000));
    setLat(settings.storeLat ?? defaultLat);
    setLng(settings.storeLng ?? defaultLng);
    setRadius(String(settings.allowedRadius ?? 50));
    setThreshold(settings.faceMatchThreshold ?? 0.5);
    // Note: We don't try to parse back the flat string into dropdowns for simplicity,
    // in a real app we'd save codes instead of just string, or parse the string.
  }, [settings]);

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const position = marker.getLatLng();
          setLat(position.lat);
          setLng(position.lng);
        }
      },
    }),
    []
  );

  const radiusNum = Number(radius) || 50;

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
        setLat(parseFloat(data[0].lat));
        setLng(parseFloat(data[0].lon));
        setZoom(16);
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
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
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

  async function save(e: FormEvent) {
    e.preventDefault();
    onErr(null);
    setBusy(true);
    try {
      const parts = [street, selWard?.name, selProv?.name].filter(Boolean);
      const addressString = parts.length > 0 ? parts.join(", ") : settings.storeAddress;

      await staffApi("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          vatRatePercent: Number(vat),
          pointValueVnd: Number(pval),
          cashRoundTo: Number(round),
          pointEarnEveryVnd: Number(earnEvery),
          pointEarnEach: Number(earnEach),
          storeLat: lat,
          storeLng: lng,
          storeAddress: addressString,
          allowedRadius: radiusNum,
          faceMatchThreshold: threshold,
        }),
      });
      await onSaved();
      alert("Đã lưu cấu hình thành công!");
    } catch (err) {
      onErr(err instanceof Error ? err.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ padding: "1.25rem", maxWidth: "1200px" }} onSubmit={(e) => void save(e)}>
      <h2 style={{ marginTop: 0, marginBottom: "1.5rem", fontSize: "1.3rem", color: "var(--accent)" }}>Cài đặt Hệ thống</h2>
      
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(450px, 1fr))", gap: "2rem" }}>
        
        {/* Left column: Business settings & AI */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          
          {/* General Box */}
          <div style={{ border: "1px solid rgba(255,255,255,0.08)", padding: "1.25rem", borderRadius: "10px", background: "rgba(255,255,255,0.02)" }}>
            <h3 style={{ margin: "0 0 1rem", fontSize: "1.05rem" }}>Tài chính & Tích điểm</h3>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="label">VAT (%)</label>
                <input className="input" type="number" value={vat} onChange={(e) => setVat(e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="label">Làm tròn (VND)</label>
                <input className="input" type="number" value={round} onChange={(e) => setRound(e.target.value)} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="label">Chi tiêu (VND)</label>
                <input className="input" type="number" value={earnEvery} onChange={(e) => setEarnEvery(e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="label">Cộng số điểm</label>
                <input className="input" type="number" value={earnEach} onChange={(e) => setEarnEach(e.target.value)} />
              </div>
            </div>
            
            <div className="field" style={{ marginTop: "1rem" }}>
              <label className="label">1 điểm quy đổi (VND giảm trừ)</label>
              <input className="input" type="number" value={pval} onChange={(e) => setPval(e.target.value)} />
            </div>
          </div>

          {/* AI Config Box */}
          <div style={{ border: "1px solid rgba(201,162,39,0.2)", padding: "1.25rem", borderRadius: "10px", background: "rgba(201,162,39,0.04)" }}>
            <h3 style={{ margin: "0 0 1rem", fontSize: "1.05rem", color: "var(--accent)" }}>Cấu hình AI Nhận diện khuôn mặt</h3>
            
            <div className="field">
              <label className="label">
                Độ nhạy (Ngưỡng khoảng cách - Threshold)
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "0.5rem" }}>
                <input 
                  type="range" 
                  min="0.3" 
                  max="0.8" 
                  step="0.05"
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                  style={{ flex: 1, accentColor: "var(--accent)", cursor: "pointer" }}
                />
                <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--accent)", minWidth: "40px", textAlign: "right" }}>
                  {threshold.toFixed(2)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.4rem", fontSize: "0.8rem", color: "var(--muted)" }}>
                <span>0.3 (Khắt khe)</span>
                <span>0.5 (Chuẩn)</span>
                <span>0.8 (Dễ dãi)</span>
              </div>
              <p style={{ marginTop: "0.8rem", fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.4 }}>
                * Hệ thống so sánh ảnh hiện tại với ảnh gốc. Khoảng cách càng nhỏ càng khắt khe. Ngưỡng thấp (0.4) chống nhận diện nhầm tốt nhưng cần góc sáng chuẩn, ngưỡng cao (0.6) dễ nhận diện hơn.
              </p>
            </div>
          </div>

        </div>

        {/* Right column: Address, Map & GPS */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          
          <div style={{ border: "1px solid rgba(255,255,255,0.08)", padding: "1.25rem", borderRadius: "10px", background: "rgba(255,255,255,0.02)", flex: 1, display: "flex", flexDirection: "column" }}>
            <h3 style={{ margin: "0 0 1rem", fontSize: "1.05rem" }}>Địa chỉ & Định vị GPS</h3>
            
            {/* Multi-level Address selector (Gộp Phường/Xã) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem", marginBottom: "0.8rem" }}>
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
              <button type="button" className="btn btn-ghost" style={{ flex: 1, background: "rgba(201,162,39,0.15)", color: "var(--accent)" }} onClick={() => void handleGeocode()} disabled={busy}>
                📍 Định vị
              </button>
              <button type="button" className="btn btn-ghost" style={{ flex: 1, background: "rgba(39, 201, 128, 0.15)", color: "#27c980" }} onClick={handleCurrentLocation} disabled={busy}>
                🧭 Vị trí hiện tại
              </button>
            </div>

            {/* GPS coordinates & Radius */}
            <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label className="label">Vĩ độ (Lat)</label>
                <input className="input" style={{ background: "rgba(0,0,0,0.3)" }} readOnly value={lat.toFixed(6)} />
              </div>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label className="label">Kinh độ (Lng)</label>
                <input className="input" style={{ background: "rgba(0,0,0,0.3)" }} readOnly value={lng.toFixed(6)} />
              </div>
              <div className="field" style={{ width: "120px", marginBottom: 0 }}>
                <label className="label">Bán kính (m)</label>
                <input className="input" type="number" min="10" max="1000" value={radius} onChange={(e) => setRadius(e.target.value)} />
              </div>
            </div>

            <div style={{ minHeight: "320px", flex: 1, borderRadius: "8px", overflow: "hidden", border: "1px solid rgba(201,162,39,0.2)", position: "relative", zIndex: 1 }}>
              <MapContainer 
                center={[lat, lng]} 
                zoom={zoom} 
                scrollWheelZoom={true} 
                style={{ height: "100%", width: "100%", position: "absolute", inset: 0 }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker
                  draggable={true}
                  eventHandlers={eventHandlers}
                  position={[lat, lng]}
                  ref={markerRef}
                />
                <Circle 
                  center={[lat, lng]} 
                  pathOptions={{ fillColor: 'var(--accent)', color: 'var(--accent)', weight: 2 }} 
                  radius={radiusNum} 
                />
                <MapClickHandler setPos={(newLat, newLng) => { setLat(newLat); setLng(newLng); }} />
                <MapUpdater lat={lat} lng={lng} zoom={zoom} />
              </MapContainer>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "2rem", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "1.25rem", display: "flex", justifyContent: "flex-end" }}>
        <button 
          type="submit" 
          className="btn btn-primary" 
          style={{ padding: "0.75rem 2rem", fontSize: "1.05rem", fontWeight: 700, letterSpacing: "0.02em" }}
          disabled={busy}
        >
          {busy ? "Đang lưu..." : "Lưu Cài Đặt"}
        </button>
      </div>
    </form>
  );
}
