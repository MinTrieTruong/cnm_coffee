import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import QRCode from "qrcode";
import { getStaffInfo, staffApi } from "../lib/staffApi";

/* ─── Types ─── */
type TableRow = { id: number; name: string; location: string | null };
type QrTab = "table" | "takeaway";

/* ─── Màu ─── */
const ACCENT  = "#c9a227";
const SURFACE = "#1e1710";
const BORDER  = "rgba(201,162,39,0.25)";

const inputStyle: React.CSSProperties = {
  flex: 1, minWidth: 220,
  background: "rgba(255,255,255,0.06)",
  border: `1px solid ${BORDER}`,
  borderRadius: 8, color: "#fff",
  padding: "0.55rem 0.85rem", fontSize: "0.88rem",
  outline: "none",
};

const btnSecondary: React.CSSProperties = {
  background: "rgba(201,162,39,0.12)", border: `1px solid ${BORDER}`,
  borderRadius: 8, color: ACCENT,
  fontWeight: 600, fontSize: "0.8rem",
  padding: "0.5rem 0.85rem", cursor: "pointer",
  whiteSpace: "nowrap",
};

/* ─── Vẽ QR ra canvas ─── */
async function drawQr(canvas: HTMLCanvasElement, text: string) {
  if (!text.trim()) return;
  await QRCode.toCanvas(canvas, text, {
    width: 280,
    margin: 2,
    color: { dark: "#1a120d", light: "#fff8ee" },
    errorCorrectionLevel: "M",
  });
}

/* ─── Download PNG ─── */
function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const a = document.createElement("a");
  a.download = filename;
  a.href = canvas.toDataURL("image/png");
  a.click();
}

/* ─── QR Card dùng chung ─── */
function QrCard({
  url, label, sublabel, filename,
}: {
  url: string; label: string; sublabel?: string; filename: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (canvasRef.current && url) void drawQr(canvasRef.current, url);
  }, [url]);

  function copyLink() {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{
      background: SURFACE, border: `1.5px solid ${BORDER}`,
      borderRadius: 16, padding: "1.25rem",
      display: "flex", flexDirection: "column", alignItems: "center", gap: "0.85rem",
      minWidth: 240, flex: "1 1 240px", maxWidth: 320,
    }}>
      <div style={{ fontWeight: 800, fontSize: "1rem", color: "#fff", textAlign: "center" }}>{label}</div>
      {sublabel && (
        <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.45)", textAlign: "center", marginTop: -8 }}>
          {sublabel}
        </div>
      )}
      <div style={{ background: "#fff8ee", borderRadius: 12, padding: "0.65rem", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
        <canvas ref={canvasRef} style={{ display: "block", borderRadius: 8 }} />
      </div>
      <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.38)", wordBreak: "break-all", textAlign: "center", maxWidth: 260, lineHeight: 1.4 }}>
        {url}
      </div>
      <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
        <button type="button" onClick={copyLink} style={{
          flex: 1,
          background: copied ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.07)",
          border: copied ? "1px solid rgba(74,222,128,0.4)" : "1px solid rgba(255,255,255,0.15)",
          borderRadius: 8, color: copied ? "#4ade80" : "rgba(255,255,255,0.7)",
          fontWeight: 600, fontSize: "0.82rem", padding: "0.5rem", cursor: "pointer", transition: "all 0.15s",
        }}>
          {copied ? "Đã copy!" : "Copy link"}
        </button>
        <button type="button" onClick={() => canvasRef.current && downloadCanvas(canvasRef.current, filename)}
          style={{ flex: 1, ...btnSecondary, fontWeight: 700 }}>
          Tải PNG
        </button>
      </div>
    </div>
  );
}

/* ─── Tab QR Bàn ─── */
function TableQrTab() {
  const [tables,   setTables]   = useState<TableRow[]>([]);
  const [baseUrl,  setBaseUrl]  = useState(() => window.location.origin);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await staffApi<TableRow[]>("/api/admin/tables");
      setTables(data);
      if (data.length > 0) setSelected([data[0].id]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi tải danh sách bàn");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleTable = (id: number) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const cleanBase    = baseUrl.replace(/\/$/, "");
  const chosenTables = tables.filter((t) => selected.includes(t.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {err && <p style={{ color: "#f87171" }}>{err}</p>}

      {/* Base URL */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: "0.04em" }}>
          ĐỊA CHỈ WEB (phần trước <code style={{ color: ACCENT }}>?table=...</code>)
        </label>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <input
            id="qr-table-base-url"
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://192.168.1.x:5173 hoặc https://domain.com"
            style={inputStyle}
          />
          <button type="button" onClick={() => setBaseUrl(window.location.origin)} style={btnSecondary}>
            Dùng link hiện tại
          </button>
        </div>
        <p style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.3)", margin: 0 }}>
          Ví dụ: <span style={{ color: ACCENT }}>{cleanBase}/?table=1</span>
          {" "}— có thể nhập IP nội bộ (192.168.x.x) nếu demo trên mạng LAN.
        </p>
      </div>

      {/* Chọn bàn */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
          <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: "0.04em" }}>
            CHỌN BÀN ({selected.length}/{tables.length})
          </label>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <button type="button" onClick={() => setSelected(tables.map((t) => t.id))}
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "rgba(255,255,255,0.65)", fontSize: "0.75rem", padding: "0.25rem 0.6rem", cursor: "pointer" }}>
              Chọn tất cả
            </button>
            <button type="button" onClick={() => setSelected([])}
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "rgba(255,255,255,0.4)", fontSize: "0.75rem", padding: "0.25rem 0.6rem", cursor: "pointer" }}>
              Bỏ chọn
            </button>
          </div>
        </div>

        {loading ? (
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem" }}>Đang tải...</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {tables.map((t) => {
              const on = selected.includes(t.id);
              return (
                <button key={t.id} type="button" id={`qr-table-${t.id}`}
                  onClick={() => toggleTable(t.id)}
                  style={{
                    background: on ? "rgba(201,162,39,0.18)" : "rgba(255,255,255,0.05)",
                    border: on ? `1.5px solid ${ACCENT}` : "1.5px solid rgba(255,255,255,0.1)",
                    borderRadius: 8, color: on ? ACCENT : "rgba(255,255,255,0.55)",
                    fontWeight: on ? 700 : 400, fontSize: "0.85rem",
                    padding: "0.35rem 0.8rem", cursor: "pointer", transition: "all 0.15s",
                  }}>
                  {t.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* QR cards */}
      {chosenTables.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginTop: "0.25rem" }}>
          {chosenTables.map((t) => (
            <QrCard
              key={t.id}
              url={`${cleanBase}/?table=${t.id}`}
              label={t.name}
              sublabel={t.location ?? undefined}
              filename={`qr-${t.name.replace(/\s+/g, "-").toLowerCase()}.png`}
            />
          ))}
        </div>
      ) : !loading && (
        <div style={{
          textAlign: "center", color: "rgba(255,255,255,0.22)",
          padding: "2.5rem 1rem",
          border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 12,
        }}>
          Chọn ít nhất 1 bàn để hiện mã QR
        </div>
      )}
    </div>
  );
}

/* ─── Tab QR Mang về ─── */
function TakeawayQrTab() {
  const [baseUrl, setBaseUrl] = useState(() => window.location.origin);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  const cleanBase = baseUrl.replace(/\/$/, "");
  // QR luôn trỏ đến backend endpoint — mỗi lần quét sinh UUID mới
  const qrUrl = `${cleanBase}/api/takeaway/new`;

  useEffect(() => {
    if (canvasRef.current && qrUrl) void drawQr(canvasRef.current, qrUrl);
  }, [qrUrl]);

  function copyLink() {
    void navigator.clipboard.writeText(qrUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      {/* Mô tả */}
      <div style={{
        background: "rgba(201,162,39,0.06)", border: `1px solid ${BORDER}`,
        borderRadius: 12, padding: "1rem 1.15rem",
        fontSize: "0.85rem", lineHeight: 1.65, color: "rgba(255,255,255,0.6)",
      }}>
        <strong style={{ color: ACCENT, display: "block", marginBottom: "0.4rem", fontSize: "0.9rem" }}>
          Mã QR động — mỗi lần quét là 1 phiên mới
        </strong>
        Mã QR trỏ đến <code style={{ color: ACCENT, background: "rgba(201,162,39,0.1)", padding: "0.1rem 0.35rem", borderRadius: 4 }}>/api/takeaway/new</code>.
        Mỗi khi khách quét, hệ thống tự sinh UUID session riêng biệt rồi chuyển hướng về giỏ hàng
        với <code style={{ color: ACCENT }}>?session=...&amp;orderType=Takeaway</code>.<br />
        <strong style={{ color: "rgba(255,255,255,0.75)" }}>In 1 tờ QR này, đặt trên quầy — khách quét là đặt hàng mang về ngay.</strong>
      </div>

      {/* Nhập địa chỉ backend */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: "0.04em" }}>
          ĐỊA CHỈ SERVER BACKEND (phần trước <code style={{ color: ACCENT }}>/api/takeaway/new</code>)
        </label>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <input
            id="qr-takeaway-base-url"
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://192.168.1.x:4000 hoặc https://domain.com"
            style={inputStyle}
          />
          <button type="button" onClick={() => setBaseUrl(window.location.origin)} style={btnSecondary}>
            Dùng link hiện tại
          </button>
        </div>
        <p style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.3)", margin: 0 }}>
          URL đầy đủ QR sẽ là:{" "}
          <span style={{ color: ACCENT, wordBreak: "break-all" }}>{qrUrl}</span>
        </p>
      </div>

      {/* QR Card */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{
          background: SURFACE, border: `1.5px solid ${BORDER}`,
          borderRadius: 16, padding: "1.5rem 2rem",
          display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem",
          maxWidth: 340, width: "100%",
        }}>
          <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#fff" }}>
            QR Đặt Món Mang Về
          </div>
          <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)", marginTop: -8 }}>
            Mỗi lần quét = 1 phiên độc lập
          </div>

          <div style={{ background: "#fff8ee", borderRadius: 14, padding: "0.75rem", boxShadow: "0 6px 28px rgba(0,0,0,0.35)" }}>
            <canvas ref={canvasRef} style={{ display: "block", borderRadius: 8 }} />
          </div>

          <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.35)", wordBreak: "break-all", textAlign: "center", maxWidth: 280, lineHeight: 1.4 }}>
            {qrUrl}
          </div>

          <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
            <button type="button" onClick={copyLink} style={{
              flex: 1,
              background: copied ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.07)",
              border: copied ? "1px solid rgba(74,222,128,0.4)" : "1px solid rgba(255,255,255,0.15)",
              borderRadius: 8, color: copied ? "#4ade80" : "rgba(255,255,255,0.7)",
              fontWeight: 600, fontSize: "0.82rem", padding: "0.5rem", cursor: "pointer",
            }}>
              {copied ? "Đã copy!" : "Copy link"}
            </button>
            <button type="button"
              onClick={() => canvasRef.current && downloadCanvas(canvasRef.current, "qr-mang-ve.png")}
              style={{ flex: 1, ...btnSecondary, fontWeight: 700 }}>
              Tải PNG
            </button>
          </div>
        </div>
      </div>

      <p style={{ textAlign: "center", fontSize: "0.8rem", color: "rgba(255,255,255,0.28)", marginTop: "0.25rem" }}>
        Bấm "Tải PNG" rồi in ra hoặc dùng trong Canva / Word để thiết kế tờ QR đẹp hơn.
      </p>
    </div>
  );
}

/* ─── Trang chính ─── */
export function QrGenerator() {
  const info = getStaffInfo();
  const [activeTab, setActiveTab] = useState<QrTab>("table");

  if (!info || info.role !== "Admin") {
    return <Navigate to="/staff/login" replace />;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#120d08", color: "#fff" }}>
      {/* Header */}
      <div style={{ padding: "1.5rem 2rem 1rem", borderBottom: `1px solid ${BORDER}`, background: "rgba(0,0,0,0.2)" }}>
        <h1 style={{ margin: 0, fontWeight: 900, fontSize: "1.35rem", color: "#fff", letterSpacing: "-0.01em" }}>
          Tạo mã QR
        </h1>
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.82rem", color: "rgba(255,255,255,0.38)" }}>
          Sinh mã QR cho bàn trong quán và mã mang về động
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", padding: "1rem 2rem 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        {([
          { id: "table",    label: "QR Gọi món tại bàn" },
          { id: "takeaway", label: "QR Mang về (mã động)" },
        ] as { id: QrTab; label: string }[]).map((t) => (
          <button
            key={t.id}
            type="button"
            id={`qr-tab-${t.id}`}
            onClick={() => setActiveTab(t.id)}
            style={{
              background: "none", border: "none",
              borderBottom: activeTab === t.id ? `2.5px solid ${ACCENT}` : "2.5px solid transparent",
              color: activeTab === t.id ? ACCENT : "rgba(255,255,255,0.45)",
              fontWeight: activeTab === t.id ? 700 : 400,
              fontSize: "0.88rem", padding: "0.6rem 1.1rem 0.7rem",
              cursor: "pointer", transition: "color 0.15s", letterSpacing: "0.02em",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "1.5rem 2rem 3rem", maxWidth: 960, margin: "0 auto" }}>
        {activeTab === "table"    && <TableQrTab />}
        {activeTab === "takeaway" && <TakeawayQrTab />}
      </div>
    </div>
  );
}
