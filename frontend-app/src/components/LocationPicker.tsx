import { useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Marker as LMarker } from "leaflet";
import { Crosshair, Search } from "lucide-react";
import { homeIcon, storeIcon, type LatLng } from "../lib/delivery";

function ClickToPick({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function FlyTo({ to }: { to: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (to) map.flyTo([to.lat, to.lng], Math.max(map.getZoom(), 16), { duration: 0.5 });
  }, [to?.lat, to?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/**
 * Chọn vị trí giao hàng: bấm/kéo ghim trên bản đồ, dùng GPS, hoặc tìm theo địa chỉ (OSM Nominatim).
 */
export function LocationPicker({
  value,
  onChange,
  store,
  address,
  onAddressFound,
}: {
  value: LatLng | null;
  onChange: (p: LatLng) => void;
  store: LatLng | null;
  address: string;
  onAddressFound?: (addr: string) => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const center = value ?? store ?? { lat: 10.7769, lng: 106.7009 };

  function useGps() {
    if (!navigator.geolocation) return setMsg("Trình duyệt không hỗ trợ định vị.");
    setBusy(true);
    setMsg("Đang lấy vị trí…");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onChange(p);
        setMsg(null);
        setBusy(false);
        if (onAddressFound && !address.trim()) {
          try {
            const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&accept-language=vi&lat=${p.lat}&lon=${p.lng}`);
            const j = (await r.json()) as { display_name?: string };
            if (j.display_name) onAddressFound(j.display_name);
          } catch {
            /* bỏ qua */
          }
        }
      },
      () => {
        setBusy(false);
        setMsg("Không lấy được vị trí. Hãy cho phép truy cập vị trí hoặc ghim trên bản đồ.");
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  async function searchAddress() {
    if (!address.trim()) return setMsg("Nhập địa chỉ trước khi tìm.");
    setBusy(true);
    setMsg("Đang tìm địa chỉ…");
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=vn&accept-language=vi&q=${encodeURIComponent(address)}`,
      );
      const j = (await r.json()) as { lat: string; lon: string }[];
      if (j[0]) {
        onChange({ lat: Number(j[0].lat), lng: Number(j[0].lon) });
        setMsg("Đã tìm thấy — kéo ghim để chỉnh chính xác cổng nhà bạn.");
      } else setMsg("Không tìm thấy, hãy ghim trực tiếp trên bản đồ.");
    } catch {
      setMsg("Không tìm được địa chỉ, hãy ghim trực tiếp trên bản đồ.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lp-wrap">
      <div className="lp-map">
        <MapContainer center={[center.lat, center.lng]} zoom={15} style={{ height: "100%", width: "100%" }}>
          <TileLayer attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {store && <Marker position={[store.lat, store.lng]} icon={storeIcon} />}
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              icon={homeIcon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const ll = (e.target as LMarker).getLatLng();
                  onChange({ lat: ll.lat, lng: ll.lng });
                },
              }}
            />
          )}
          <ClickToPick onPick={onChange} />
          <FlyTo to={value} />
        </MapContainer>
        {!value && <div className="lp-hint">Chạm vào bản đồ để ghim vị trí giao hàng</div>}
      </div>
      <div className="lp-actions">
        <button type="button" className="btn btn-ghost" onClick={useGps} disabled={busy}>
          <Crosshair size={16} /> Vị trí hiện tại
        </button>
        <button type="button" className="btn btn-ghost" onClick={searchAddress} disabled={busy}>
          <Search size={16} /> Tìm theo địa chỉ
        </button>
      </div>
      {msg && <div className="lp-msg">{msg}</div>}
    </div>
  );
}
