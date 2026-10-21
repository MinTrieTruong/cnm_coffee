/**
 * Attendance.tsx — Trang chấm công GPS + FaceID
 *
 * Layout split-screen:
 * - Trái: Camera quét khuôn mặt (face-api.js)
 * - Phải: Bản đồ react-leaflet (vị trí quán + vị trí NV)
 *
 * Luồng:
 * 1. Check-in: Xác minh khuôn mặt + GPS trong phạm vi 50m
 * 2. Check-out: Có phiếu làm thêm đã duyệt → tự xác nhận giờ làm thêm; ở lại >30 phút mà chưa có phiếu → gợi ý làm phiếu bổ sung
 */
import { MapPin, Video, Map as MapIcon, CheckCircle2, X } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import * as faceapi from "face-api.js";
import { staffApi, getStaffInfo } from "../lib/staffApi";
import { AttendanceCalendar } from "../components/AttendanceCalendar";

import "leaflet/dist/leaflet.css";

/* ── Fix Leaflet default marker icon ─────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const staffIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-gold.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

/* ── Types ───────────────────────────────────────────────────────── */
interface Schedule {
  id: number;
  shiftCode: string;
  shiftName?: string;
  startMin: number;
  endMin: number;
  actualCheckIn: string | null;
  actualCheckOut: string | null;
  isOvertime: boolean;
  overtimeNote: string | null;
  overtimeMinutes: number | null;
}

interface StoreLocation {
  lat: number;
  lng: number;
  radius: number;
  faceMatchThreshold: number;
}

interface ClockResponse {
  ok: boolean;
  message: string;
  schedule: Schedule;
  distance: number;
  extraMinutes?: number;
  promptOvertime?: boolean;
}

type LivenessStep = 0 | 1 | 2 | 3 | 4;
// 0: Chưa bắt đầu
// 1: Nhìn thẳng
// 2: Quay trái
// 3: Quay phải
// 4: Hoàn thành (sẵn sàng checkin)

/* ── Helper: phút → "HH:MM" ─────────────────────────────────────── */
function minToTime(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/* ── Component: Tự fit map khi vị trí thay đổi ──────────────────── */
function FitBounds({ storeLat, storeLng, userLat, userLng }: {
  storeLat: number; storeLng: number;
  userLat: number | null; userLng: number | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (userLat != null && userLng != null) {
      const bounds = L.latLngBounds(
        [storeLat, storeLng],
        [userLat, userLng]
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
    } else {
      map.setView([storeLat, storeLng], 17);
    }
  }, [map, storeLat, storeLng, userLat, userLng]);
  return null;
}

/* ── Tính khoảng cách Haversine (client-side) ────────────────────── */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


/* ════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════════════ */
export function Attendance() {
  const info = getStaffInfo();

  /* ── State ── */
  const [storeLocation, setStoreLocation] = useState<StoreLocation | null>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [activeSchedule, setActiveSchedule] = useState<Schedule | null>(null);

  // Face
  const [faceReady, setFaceReady] = useState(false);
  const [faceMatch, setFaceMatch] = useState<boolean | null>(null);
  const [faceStatus, setFaceStatus] = useState("Đang tải mô hình...");
  const [savedDescriptor, setSavedDescriptor] = useState<Float32Array | null>(null);
  const [faceRegistered, setFaceRegistered] = useState(false);
  const [livenessStep, setLivenessStep] = useState<LivenessStep>(0);
  const faceWarningTimer = useRef<number | null>(null);

  // UI
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "ok" | "err" } | null>(null);
  const [showOvertimeModal, setShowOvertimeModal] = useState(false);
  const [overtimeData, setOvertimeData] = useState<{ scheduleId: number; extraMinutes: number } | null>(null);
  const [staffNote, setStaffNote] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successTime, setSuccessTime] = useState("");
  const [isCameraActive, setIsCameraActive] = useState(true);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceIntervalRef = useRef<number | null>(null);

  /* ── Load store location + today's schedules ── */
  useEffect(() => {
    staffApi<StoreLocation>("/api/attendance/store-location").then(setStoreLocation).catch(console.error);
    loadTodaySchedules();
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (faceIntervalRef.current) clearInterval(faceIntervalRef.current);
      if (faceWarningTimer.current) clearTimeout(faceWarningTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTodaySchedules = async () => {
    try {
      const data = await staffApi<{ schedules: Schedule[] }>("/api/attendance/today");
      setSchedules(data.schedules);
      // Tìm ca đang active (đã check-in nhưng chưa check-out, hoặc chưa check-in)
      const active = data.schedules.find(s => s.actualCheckIn && !s.actualCheckOut)
        ?? data.schedules.find(s => !s.actualCheckIn);
      setActiveSchedule(active ?? null);
    } catch (e) {
      console.error(e);
    }
  };

  /* ── GPS tracking ── */
  useEffect(() => {
    if (!storeLocation) return;
    if (!navigator.geolocation) {
      setMessage({ text: "Trình duyệt không hỗ trợ GPS.", type: "err" });
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserPos(p);
        const d = haversine(p.lat, p.lng, storeLocation.lat, storeLocation.lng);
        setDistance(Math.round(d));
      },
      (err) => {
        console.error("GPS error:", err);
        setMessage({ text: `Lỗi GPS (${err.code}): ${err.message}. Hãy kiểm tra Cài đặt máy.`, type: "err" });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [storeLocation]);

  /* ── Load face-api models + start camera ── */
  useEffect(() => {
    const init = async () => {
      try {
        const MODEL_URL = "/models";
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setFaceStatus("Mô hình đã sẵn sàng");
        setFaceReady(true);

        // Load saved descriptor
        const faceData = await staffApi<{ registered: boolean; descriptor: number[] | null }>(
          "/api/attendance/face-descriptor"
        );
        if (faceData.registered && faceData.descriptor) {
          setSavedDescriptor(new Float32Array(faceData.descriptor));
          setFaceRegistered(true);
          setFaceStatus("Đã có dữ liệu khuôn mặt");
        } else {
          setFaceStatus("Chưa đăng ký khuôn mặt — bấm 'Đăng ký' để lưu");
          setFaceRegistered(false);
        }

        // Start camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 480, height: 360 },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Face-api init error:", err);
        setFaceStatus("Lỗi tải mô hình nhận diện");
      }
    };
    init();
  }, []);

  /* ── Face detection loop ── */
  const startFaceDetection = useCallback(() => {
    if (faceIntervalRef.current) return;
    const video = videoRef.current;
    if (!video) return;

    // Timer cảnh báo nếu quá lâu không có khuôn mặt
    const resetWarningTimer = () => {
      if (faceWarningTimer.current) clearTimeout(faceWarningTimer.current);
      faceWarningTimer.current = window.setTimeout(() => {
        setFaceMatch(null);
        setFaceStatus("Không tìm thấy khuôn mặt. Vui lòng kiểm tra lại ánh sáng (tránh ngược sáng) hoặc tháo khẩu trang.");
      }, 5000);
    };
    resetWarningTimer();

    faceIntervalRef.current = window.setInterval(async () => {
      if (!video || video.readyState < 2) return;

      const fullDetection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!fullDetection) {
        setFaceMatch(null);
        return;
      }

      resetWarningTimer();

      // Draw detection overlay removed as requested
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      }

      // Check Match
      let isMatched = false;
      if (savedDescriptor) {
        const threshold = storeLocation?.faceMatchThreshold ?? 0.5;
        const dist = faceapi.euclideanDistance(fullDetection.descriptor, savedDescriptor);
        isMatched = dist < threshold;
        setFaceMatch(isMatched);
      }


      // Liveness Detection
      if (isMatched) {
        const landmarks = fullDetection.landmarks;
        const nose = landmarks.getNose();
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();

        const leftEyeX = leftEye.reduce((sum, pt) => sum + pt.x, 0) / leftEye.length;
        const rightEyeX = rightEye.reduce((sum, pt) => sum + pt.x, 0) / rightEye.length;
        const noseX = nose[0].x;

        const distLeft = Math.abs(noseX - leftEyeX);
        const distRight = Math.abs(rightEyeX - noseX);
        const yawRatio = distLeft / (distRight || 1);

        setLivenessStep(prev => {
          if (prev === 4) return 4;

          // Nhạy hơn: nhích cổ nhẹ là pass
          const isTurned = yawRatio < 0.8 || yawRatio > 1.25;
          if (isTurned) return 4;

          return 1;
        });
      } else {
        setLivenessStep(0);
      }
    }, 500); // 500ms cho mượt
  }, [savedDescriptor, storeLocation]);

  useEffect(() => {
    if (isScanning && faceReady && videoRef.current) {
      startFaceDetection();
    } else {
      if (faceIntervalRef.current) {
        clearInterval(faceIntervalRef.current);
        faceIntervalRef.current = null;
      }
    }
  }, [isScanning, faceReady, startFaceDetection]);

  /* ── Register face ── */
  const handleRegisterFace = async () => {
    const video = videoRef.current;
    if (!video) return;
    setLoading(true);
    try {
      const det = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (!det) {
        setMessage({ text: "Không phát hiện khuôn mặt. Hãy nhìn thẳng vào camera.", type: "err" });
        return;
      }
      const descriptor = Array.from(det.descriptor);
      await staffApi("/api/attendance/register-face", {
        method: "POST",
        body: JSON.stringify({ faceDescriptor: descriptor }),
      });
      setSavedDescriptor(new Float32Array(descriptor));
      setFaceRegistered(true);
      setFaceStatus("Đăng ký khuôn mặt thành công");
      setMessage({ text: "Đã lưu dữ liệu khuôn mặt!", type: "ok" });
    } catch (e) {
      setMessage({ text: String(e instanceof Error ? e.message : e), type: "err" });
    } finally {
      setLoading(false);
    }
  };

  /* ── Success helper ── */
  const onSuccess = (msg: string) => {
    setMessage({ text: msg, type: "ok" });
    if (faceIntervalRef.current) {
      clearInterval(faceIntervalRef.current);
      faceIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
    setIsSuccess(true);
    setIsScanning(false);
    setSuccessTime(new Date().toLocaleTimeString("vi-VN"));
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  /* ── Check-in ── */
  const handleCheckIn = async () => {
    if (!userPos) {
      setMessage({ text: "Đang chờ GPS...", type: "err" });
      return;
    }
    if (distance === null || !storeLocation || distance > storeLocation.radius) {
      setMessage({ text: "Bạn đang ở ngoài phạm vi chấm công. Không thể Check-in.", type: "err" });
      return;
    }
    if (faceRegistered && faceMatch !== true) {
      setMessage({ text: "Khuôn mặt không khớp. Hãy nhìn thẳng camera.", type: "err" });
      return;
    }
    if (livenessStep < 4) {
      setMessage({ text: "Bạn chưa hoàn thành bước kiểm tra bảo mật (xoay mặt).", type: "err" });
      return;
    }
    setLoading(true);
    try {
      const data = await staffApi<ClockResponse>("/api/attendance/clock", {
        method: "POST",
        body: JSON.stringify({
          lat: userPos.lat,
          lng: userPos.lng,
          type: "in",
          scheduleId: activeSchedule?.id,
        }),
      });
      onSuccess(data.message);
      await loadTodaySchedules();
    } catch (e) {
      setMessage({ text: String(e instanceof Error ? e.message : e), type: "err" });
    } finally {
      setLoading(false);
    }
  };

  /* ── Check-out ── */
  const handleCheckOut = async () => {
    if (!userPos) {
      setMessage({ text: "Đang chờ GPS...", type: "err" });
      return;
    }
    if (distance === null || !storeLocation || distance > storeLocation.radius) {
      setMessage({ text: "Bạn đang ở ngoài phạm vi chấm công. Không thể Check-out.", type: "err" });
      return;
    }
    if (faceRegistered && faceMatch !== true) {
      setMessage({ text: "Khuôn mặt không khớp. Hãy nhìn thẳng camera.", type: "err" });
      return;
    }
    if (livenessStep < 4) {
      setMessage({ text: "Bạn chưa hoàn thành bước kiểm tra bảo mật (xoay mặt).", type: "err" });
      return;
    }
    setLoading(true);
    try {
      const data = await staffApi<ClockResponse>("/api/attendance/clock", {
        method: "POST",
        body: JSON.stringify({
          lat: userPos.lat,
          lng: userPos.lng,
          type: "out",
          scheduleId: activeSchedule?.id,
        }),
      });
      onSuccess(data.message);

      // Ở lại > 30p mà chưa có phiếu làm thêm → gợi ý làm phiếu bổ sung
      if (data.promptOvertime && data.schedule) {
        setOvertimeData({
          scheduleId: data.schedule.id,
          extraMinutes: data.extraMinutes ?? 0,
        });
        setShowOvertimeModal(true);
      }

      await loadTodaySchedules();
    } catch (e) {
      setMessage({ text: String(e instanceof Error ? e.message : e), type: "err" });
    } finally {
      setLoading(false);
    }
  };

  /* ── Submit overtime request ── */
  const handleOvertimeSubmit = async () => {
    if (!overtimeData || !staffNote.trim()) return;
    setLoading(true);
    try {
      await staffApi("/api/attendance/request-overtime", {
        method: "POST",
        body: JSON.stringify({
          scheduleId: overtimeData.scheduleId,
          staffNote: staffNote.trim(),
        }),
      });
      setMessage({ text: "Đã gửi phiếu làm thêm giờ, chờ quản lý duyệt.", type: "ok" });
      setShowOvertimeModal(false);
      setStaffNote("");
      setOvertimeData(null);
      await loadTodaySchedules();
    } catch (e) {
      setMessage({ text: String(e instanceof Error ? e.message : e), type: "err" });
    } finally {
      setLoading(false);
    }
  };

  /* ── Determine button state ── */
  const canCheckIn = activeSchedule && !activeSchedule.actualCheckIn;
  const canCheckOut = activeSchedule && activeSchedule.actualCheckIn && !activeSchedule.actualCheckOut;
  const isInRange = distance !== null && storeLocation !== null && distance <= storeLocation.radius;

  useEffect(() => {
    if (livenessStep === 4 && !loading && isScanning && !isSuccess) {
      if (canCheckIn) void handleCheckIn();
      else if (canCheckOut) void handleCheckOut();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livenessStep]);

  /* ═══════════════════════════════════════════════════════════════ */
  return (
    <div className="attendance-page">
      <h1 className="attendance-title">
        <span className="attendance-title-icon"><MapPin size={16} aria-hidden /></span>
        Chấm Công
      </h1>

      {/* ── Toast message ── */}
      {message && (
        <div className={`attendance-toast attendance-toast-${message.type}`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} aria-label="Đóng"><X size={16} /></button>
        </div>
      )}

      {/* ── Split screen ── */}
      <div className="attendance-split">
        {/* ─── LEFT: Camera ─── */}
        <div className="attendance-panel attendance-camera-panel">
          <div className="attendance-panel-header">
            <span className="attendance-panel-icon"><Video size={16} aria-hidden /></span>
            Nhận diện khuôn mặt
          </div>
          {isSuccess ? (
            <div style={{ textAlign: "center", padding: "3rem 1rem", border: "1px solid rgba(201,162,39,0.2)", borderRadius: "10px", background: "rgba(201,162,39,0.05)" }}>
              <div style={{ marginBottom: "1rem", color: "var(--o-success)", display: "flex", justifyContent: "center" }}><CheckCircle2 size={48} aria-hidden /></div>
              <h2 style={{ color: "var(--accent)", marginBottom: "1rem", fontSize: "1.5rem" }}>Chấm công thành công!</h2>
              <p style={{ fontSize: "1.2rem", color: "var(--muted)", marginBottom: "2rem" }}>
                Thời gian: <strong style={{ color: "#fff" }}>{successTime}</strong>
              </p>
              <button className="attendance-btn attendance-btn-secondary" onClick={() => window.location.href = "/"}>
                Quay lại trang chủ
              </button>
            </div>
          ) : (
            <>
              {isCameraActive && (
                <div className="attendance-camera-wrap" style={{
                  position: "relative", width: "100%", aspectRatio: "1/1",
                  maxWidth: "400px", margin: "auto", borderRadius: "50%",
                  overflow: "hidden", border: "4px solid var(--border)"
                }}>
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="attendance-video"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  <canvas ref={canvasRef} className="attendance-canvas" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />

                  <div className="attendance-face-overlay" style={{ pointerEvents: "none" }}>
                    <div className="attendance-face-ring" style={{
                      position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                      width: "90%", height: "90%",
                      borderRadius: "50%",
                      border: isScanning ? "4px dashed var(--accent)" : "4px solid rgba(255,255,255,0.2)",
                      boxShadow: isScanning ? "0 0 15px var(--accent)" : "none",
                      animation: isScanning ? "spinCentered 4s linear infinite" : "none"
                    }} />
                  </div>

                  {/* Idle Mode Button */}
                  {!isScanning && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", zIndex: 10 }}>
                      {!isInRange ? (
                        <div style={{ color: "#ef4444", fontWeight: "bold", background: "rgba(0,0,0,0.8)", padding: "15px 20px", borderRadius: "10px", textAlign: "center", border: "1px solid #ef4444" }}>
                          {distance === null ? "Đang định vị GPS..." : `Ngoài phạm vi quán (${distance}m)`}
                        </div>
                      ) : (!canCheckIn && !canCheckOut && schedules.length > 0) ? (
                        <div style={{ color: "#22c55e", fontWeight: "bold", background: "rgba(0,0,0,0.8)", padding: "15px 20px", borderRadius: "10px", textAlign: "center", border: "1px solid #22c55e" }}>
                          Đã hoàn tất các ca hôm nay
                        </div>
                      ) : (
                        <button
                          className="attendance-btn attendance-btn-checkin"
                          onClick={() => setIsScanning(true)}
                          style={{ fontSize: "1.1rem", padding: "1rem 2rem", boxShadow: "0 4px 20px rgba(201,162,39,0.4)" }}
                        >
                          Bấm vào đây để chấm công
                        </button>
                      )}
                    </div>
                  )}

                  <style>{`@keyframes spinCentered { 100% { transform: translate(-50%, -50%) rotate(360deg); } }`}</style>

                  {/* Liveness UI Instruction */}
                  {isScanning && faceMatch === true && livenessStep < 4 && isInRange && (
                    <div style={{ position: "absolute", bottom: "20px", left: "10%", right: "10%", background: "rgba(0,0,0,0.75)", color: "#fff", padding: "10px", borderRadius: "10px", textAlign: "center", border: "2px solid var(--accent)", fontWeight: "bold" }}>
                      Vui lòng xoay nhẹ mặt sang trái hoặc phải
                    </div>
                  )}
                  {isScanning && faceMatch === true && livenessStep === 4 && (
                    <div style={{ position: "absolute", bottom: "20px", left: "10%", right: "10%", background: "rgba(34, 197, 94, 0.85)", color: "#fff", padding: "10px", borderRadius: "10px", textAlign: "center", fontWeight: "bold" }}>
                      Đã xác thực bảo mật
                    </div>
                  )}
                </div>
              )}

              {/* Face status */}
              <div className="attendance-face-status" style={{ marginTop: "1rem" }}>
                <div className={`attendance-badge ${faceMatch === true ? "badge-ok" : faceMatch === false ? "badge-err" : "badge-pending"}`}>
                  {!isScanning
                    ? "Nhấn nút để bắt đầu quét"
                    : faceMatch === true
                      ? "Khuôn mặt khớp"
                      : faceMatch === false
                        ? "Không khớp"
                        : faceRegistered
                          ? "Đang nhận diện..."
                          : "Chưa đăng ký"}
                </div>
                <p className="attendance-face-hint">{isScanning ? faceStatus : "Hệ thống đang ở chế độ chờ"}</p>
              </div>

              {/* Register face button */}
              {!faceRegistered && faceReady && (
                <button
                  className="attendance-btn attendance-btn-register"
                  onClick={handleRegisterFace}
                  disabled={loading}
                  style={{ marginTop: "1rem" }}
                >
                  Đăng ký khuôn mặt

                </button>
              )}
            </>
          )}
        </div>

        {/* ─── RIGHT: Map ─── */}
        <div className="attendance-panel attendance-map-panel">
          <div className="attendance-panel-header">
            <span className="attendance-panel-icon"><MapIcon size={16} aria-hidden /></span>
            Vị trí GPS
          </div>
          <div className="attendance-map-wrap">
            {storeLocation ? (
              <MapContainer
                center={[storeLocation.lat, storeLocation.lng]}
                zoom={17}
                className="attendance-map"
                scrollWheelZoom={true}
              >
                <TileLayer
                  attribution='&copy; Google Maps'
                  url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                />
                {/* Marker quán + vòng tròn bán kính */}
                <Marker position={[storeLocation.lat, storeLocation.lng]}>
                  <Popup>Vị trí quán TD Coffee</Popup>
                </Marker>
                <Circle
                  center={[storeLocation.lat, storeLocation.lng]}
                  radius={storeLocation.radius}
                  pathOptions={{
                    color: "#c9a227",
                    fillColor: "#c9a227",
                    fillOpacity: 0.15,
                    weight: 2,
                  }}
                />
                {/* Marker vị trí nhân viên */}
                {userPos && (
                  <Marker position={[userPos.lat, userPos.lng]} icon={staffIcon}>
                    <Popup>Vị trí của bạn ({info?.fullName})</Popup>
                  </Marker>
                )}
                <FitBounds
                  storeLat={storeLocation.lat}
                  storeLng={storeLocation.lng}
                  userLat={userPos?.lat ?? null}
                  userLng={userPos?.lng ?? null}
                />
              </MapContainer>
            ) : (
              <div className="attendance-map-loading">Đang tải bản đồ...</div>
            )}
          </div>

          {/* Distance indicator */}
          <div className="attendance-distance">
            <div className={`attendance-badge ${isInRange ? "badge-ok" : "badge-err"}`}>
              {distance !== null
                ? isInRange
                  ? `Trong phạm vi (${distance}m)`
                  : `Ngoài phạm vi (${distance}m)`
                : "Đang xác định vị trí..."}
            </div>
          </div>
        </div>
      </div>

      {/* ── Today's schedule info ── */}
      <div className="attendance-schedules">
        <h3 className="attendance-section-title">Ca làm hôm nay</h3>
        {schedules.length === 0 ? (
          <p className="attendance-empty">Không có ca làm nào được duyệt hôm nay.</p>
        ) : (
          <div className="attendance-schedule-grid">
            {schedules.map((s) => (
              <div
                key={s.id}
                className={`attendance-schedule-card ${activeSchedule?.id === s.id ? "card-active" : ""}`}
                onClick={() => setActiveSchedule(s)}
              >
                <div className="schedule-card-header">
                  <span className="schedule-shift-code">{s.shiftName ?? s.shiftCode}</span>
                  <span className="schedule-time">{minToTime(s.startMin)} – {minToTime(s.endMin)}</span>
                </div>
                <div className="schedule-card-status">
                  {s.actualCheckIn && s.actualCheckOut ? (
                    <span className="badge-ok">Hoàn tất</span>
                  ) : s.actualCheckIn ? (
                    <span className="badge-pending">Đang làm</span>
                  ) : (
                    <span className="badge-err">○ Chưa check-in</span>
                  )}
                  {s.isOvertime && (
                    <span className="badge-overtime">
                      {s.overtimeMinutes != null ? `Làm thêm ${s.overtimeMinutes} phút` : "Có phiếu làm thêm"}
                    </span>
                  )}
                </div>
                {s.actualCheckIn && (
                  <div className="schedule-card-times">
                    <span>Vào: {new Date(s.actualCheckIn).toLocaleTimeString("vi-VN")}</span>
                    {s.actualCheckOut && (
                      <span>Ra: {new Date(s.actualCheckOut).toLocaleTimeString("vi-VN")}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Action buttons removed (auto-submit replaces them) ── */}
      <div className="attendance-actions">
        {!canCheckIn && !canCheckOut && schedules.length > 0 && (
          <div className="attendance-done-msg">Đã hoàn tất tất cả ca hôm nay!</div>
        )}
      </div>

      {/* ── Monthly Calendar ── */}
      <AttendanceCalendar />

      {/* ══════════════════════════════════════════════════════════════
         MODAL: Phiếu làm thêm bổ sung
         ══════════════════════════════════════════════════════════════ */}
      {showOvertimeModal && overtimeData && (
        <div className="attendance-modal-overlay" onClick={() => setShowOvertimeModal(false)}>
          <div className="attendance-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Làm phiếu làm thêm giờ</h2>
              <button className="modal-close" onClick={() => setShowOvertimeModal(false)} aria-label="Đóng"><X size={16} /></button>
            </div>

            <div className="modal-body">
              <div className="modal-info-grid">
                <div className="modal-info-item">
                  <span className="modal-info-label">Ở lại sau giờ hết ca</span>
                  <span className="modal-info-value modal-info-highlight">
                    {overtimeData.extraMinutes} phút
                  </span>
                </div>
                <div className="modal-info-item">
                  <span className="modal-info-label">Ca làm</span>
                  <span className="modal-info-value">
                    {activeSchedule ? `${activeSchedule.shiftName ?? activeSchedule.shiftCode} (${minToTime(activeSchedule.startMin)} – ${minToTime(activeSchedule.endMin)})` : "—"}
                  </span>
                </div>
                <div className="modal-info-item">
                  <span className="modal-info-label">Giờ check-out</span>
                  <span className="modal-info-value">
                    {new Date().toLocaleTimeString("vi-VN")}
                  </span>
                </div>
              </div>

              <div className="modal-field">
                <label htmlFor="overtime-note" className="modal-label">
                  Lý do làm thêm <span className="required">*</span>
                </label>
                <textarea
                  id="overtime-note"
                  className="modal-textarea"
                  value={staffNote}
                  onChange={(e) => setStaffNote(e.target.value)}
                  placeholder="VD: Quán đông khách, cần hỗ trợ thêm..."
                  rows={3}
                  maxLength={500}
                />
                <div className="modal-char-count">{staffNote.length}/500</div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="attendance-btn attendance-btn-secondary"
                onClick={() => setShowOvertimeModal(false)}
              >
                Bỏ qua
              </button>
              <button
                className="attendance-btn attendance-btn-checkin"
                onClick={handleOvertimeSubmit}
                disabled={loading || !staffNote.trim()}
              >
                {loading ? "Đang gửi..." : "Gửi phiếu làm thêm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
