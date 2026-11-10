import { useEffect, useRef, useState } from "react";
import { Camera, MapPin, RotateCcw, X } from "lucide-react";

/** Thông tin gửi kèm ảnh để máy chủ kiểm tra (lib/photoProof.ts ở backend) */
export type ProofMeta = { lat: number; lng: number; accuracy: number; takenAt: string };
export type ProofShot = { dataUrl: string; proof: ProofMeta };

const pad = (n: number) => String(n).padStart(2, "0");
const stampTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}  ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

/** Địa chỉ từ toạ độ (OSM Nominatim) — không có mạng / chậm thì trả null, ảnh in toạ độ thay thế */
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const ctl = new AbortController();
    const t = window.setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&accept-language=vi&zoom=18&lat=${lat}&lon=${lng}`, { signal: ctl.signal });
    window.clearTimeout(t);
    const j = (await r.json()) as { display_name?: string };
    // Bỏ mã bưu chính và "Việt Nam" cho gọn
    const parts = j.display_name?.split(", ").filter((s) => !/^\d{5,6}$/.test(s) && s !== "Việt Nam") ?? [];
    return parts.length ? parts.slice(0, 6).join(", ") : null;
  } catch {
    return null;
  }
}

/** Ngắt dòng theo bề ngang canvas */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    } else cur = next;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  return lines;
}

/**
 * Chụp ảnh bằng chứng: CHỈ dùng camera trong app (không chọn ảnh từ thư viện), bắt buộc có GPS.
 * Ảnh được đóng dấu giờ chụp, tên địa chỉ (chỉ khi không tra được địa chỉ mới in toạ độ) và nội dung ngay khi chụp.
 */
export function ProofCamera({ context, onCapture, onClose }: {
  /** Dòng cuối trên dấu, VD "Đơn #52 · Shipper Nguyễn Văn A" */
  context: string;
  onCapture: (shot: ProofShot) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [camErr, setCamErr] = useState<string | null>(null);
  const [pos, setPos] = useState<GeolocationPosition | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [addrState, setAddrState] = useState<"idle" | "loading" | "done">("idle");
  const [ready, setReady] = useState(false);
  const [geoTry, setGeoTry] = useState(0);

  // Camera sau
  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamErr("Thiết bị / trình duyệt không mở được camera (cần HTTPS). Hãy mở app bằng đường dẫn https.");
      return;
    }
    let stopped = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().then(() => setReady(true)).catch(() => setReady(true));
        }
      })
      .catch(() => setCamErr("Không mở được camera. Cho phép quyền camera cho trang này rồi thử lại."));
    return () => {
      stopped = true;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Vị trí GPS (theo dõi liên tục để lấy điểm chính xác nhất)
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoErr("Thiết bị không hỗ trợ định vị.");
      return;
    }
    setGeoErr(null);
    const id = navigator.geolocation.watchPosition(
      (p) => setPos((old) => (!old || p.coords.accuracy <= old.coords.accuracy + 5 ? p : old)),
      (e) => setGeoErr(e.code === e.PERMISSION_DENIED ? "Chưa cho phép định vị. Bật quyền vị trí cho trang này rồi thử lại." : "Chưa lấy được vị trí — ra chỗ thoáng hoặc bật GPS."),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [geoTry]);

  // Tra tên địa chỉ một lần khi có vị trí; lỗi thì thử lại 1 lần rồi mới dùng toạ độ thay thế
  useEffect(() => {
    if (!pos || addrState !== "idle") return;
    setAddrState("loading");
    const { latitude, longitude } = pos.coords;
    void (async () => {
      const a = (await reverseGeocode(latitude, longitude)) ?? (await reverseGeocode(latitude, longitude));
      setAddress(a);
      setAddrState("done");
    })();
  }, [pos, addrState]);

  const coordText = (p: GeolocationPosition) => `${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`;

  function shoot() {
    const v = video.current;
    if (!v || !pos || !v.videoWidth) return;
    const scale = Math.min(1, 1280 / v.videoWidth);
    const w = Math.round(v.videoWidth * scale);
    const h = Math.round(v.videoHeight * scale);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(v, 0, 0, w, h);

    // Dấu thời gian + địa điểm ở đáy ảnh
    const now = new Date();
    const fs = Math.max(14, Math.round(w / 34));
    const lh = Math.round(fs * 1.35);
    ctx.font = `600 ${fs}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    const pad2 = Math.round(fs * 0.8);
    const maxW = w - pad2 * 2;
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    const lines = [
      stampTime(now),
      ...(address ? wrap(ctx, address, maxW, 2) : [`Vị trí ${coordText(pos)}`]),
      ...wrap(ctx, context, maxW, 1),
    ];
    const boxH = lines.length * lh + pad2 * 1.4;
    const grad = ctx.createLinearGradient(0, h - boxH - fs, 0, h);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.25, "rgba(0,0,0,0.55)");
    grad.addColorStop(1, "rgba(0,0,0,0.75)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, h - boxH - fs, w, boxH + fs);
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "top";
    lines.forEach((t, i) => {
      ctx.font = `${i === 0 ? 700 : 500} ${i === 0 ? Math.round(fs * 1.15) : fs}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      ctx.fillText(t, pad2, h - boxH + pad2 * 0.6 + i * lh);
    });

    onCapture({
      dataUrl: c.toDataURL("image/jpeg", 0.85),
      proof: { lat, lng, accuracy: Math.round(accuracy), takenAt: now.toISOString() },
    });
  }

  // Chờ tra xong địa chỉ để dấu trên ảnh là tên địa chỉ, không phải toạ độ
  const canShoot = ready && !!pos && addrState === "done" && !camErr;
  return (
    <div className="proofcam" role="dialog" aria-modal="true" aria-label="Chụp ảnh xác nhận">
      <video ref={video} className="proofcam-video" playsInline muted />
      <button type="button" className="proofcam-x" onClick={onClose} aria-label="Đóng"><X size={22} /></button>
      <div className="proofcam-info">
        {camErr ? (
          <span className="is-err">{camErr}</span>
        ) : geoErr ? (
          <span className="is-err">
            {geoErr} <button type="button" onClick={() => setGeoTry((n) => n + 1)}><RotateCcw size={14} /> Thử lại</button>
          </span>
        ) : pos && addrState !== "done" ? (
          <span><MapPin size={14} aria-hidden /> Đang tìm tên địa chỉ…</span>
        ) : pos ? (
          <span><MapPin size={14} aria-hidden /> {address ?? coordText(pos)}</span>
        ) : (
          <span><MapPin size={14} aria-hidden /> Đang lấy vị trí GPS…</span>
        )}
        <span className="proofcam-hint">Ảnh sẽ in giờ chụp và địa điểm. Chỉ chụp trực tiếp, không chọn ảnh có sẵn.</span>
      </div>
      <button type="button" className="proofcam-shutter" onClick={shoot} disabled={!canShoot} aria-label="Chụp ảnh">
        <Camera size={28} />
      </button>
    </div>
  );
}

/** Dòng thông tin ảnh bằng chứng cho quản lý: "Chụp 10:52 04/11 · cách địa chỉ khách 35 m" — xa quá ngưỡng thì tô đỏ */
export function ProofInfo({ takenAt, distanceM, target, farM = 300 }: { takenAt?: string | null; distanceM?: number | null; target: string; farM?: number }) {
  if (!takenAt) return <span className="proof-meta">Ảnh cũ — không có giờ / vị trí chụp</span>;
  const d = new Date(takenAt);
  const far = distanceM != null && distanceM > farM;
  return (
    <span className={far ? "proof-meta is-far" : "proof-meta"}>
      Chụp {pad(d.getHours())}:{pad(d.getMinutes())} {pad(d.getDate())}/{pad(d.getMonth() + 1)}
      {distanceM != null && ` · cách ${target} ${distanceM >= 1000 ? `${(distanceM / 1000).toFixed(1)} km` : `${distanceM} m`}`}
      {far && " — kiểm tra lại"}
    </span>
  );
}
