import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Coins, Gift, RotateCw, Ticket, X } from "lucide-react";
import QRCode from "qrcode";
import { api, mediaUrl } from "../../../lib/api";
import type { PlayViewProps } from "../registry";
import type { PlayResponse, PublicSegment } from "../types";
import { WHEEL_DEFAULT_CONFIG, type WheelConfig } from "./WheelConfigPanel";
import { WheelSvg, rotationFor } from "./WheelSvg";

const SPIN_MS = 5200;
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Giao diện chơi vòng quay của khách */
export function WheelPlayView({ campaign, storeId, onPlayed }: PlayViewProps) {
  const view = campaign.view as { config: Partial<WheelConfig>; segments: PublicSegment[] };
  const cfg = { ...WHEEL_DEFAULT_CONFIG, ...view.config };
  const segments = view.segments;
  const nav = useNavigate();
  const loc = useLocation();
  const [rotation, setRotation] = useState(0);
  const [spinMs, setSpinMs] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<PlayResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyExchange, setBusyExchange] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const me = campaign.me;
  const canSpin = !!me && me.leftToday > 0 && campaign.running && campaign.storeAllowed && !spinning;
  const nextUrl = encodeURIComponent(loc.pathname + loc.search);

  async function spin() {
    if (!canSpin) return;
    setErr(null);
    setSpinning(true);
    try {
      const r = await api<PlayResponse>(`/api/games/${campaign.id}/play`, { method: "POST", body: JSON.stringify({ storeId }) });
      const idx = Number(r.data.segmentIndex ?? -1);
      const ms = reducedMotion() ? 1200 : SPIN_MS;
      setSpinMs(ms);
      setRotation((cur) => rotationFor(idx >= 0 ? idx : 0, segments.length, cur, reducedMotion() ? 2 : 6));
      timer.current = window.setTimeout(() => {
        setSpinning(false);
        setResult(r);
        onPlayed();
      }, ms + 250);
    } catch (e) {
      setSpinning(false);
      setErr(e instanceof Error ? e.message : "Không quay được, thử lại sau.");
    }
  }

  async function exchange() {
    setErr(null);
    setBusyExchange(true);
    try {
      await api(`/api/games/${campaign.id}/exchange`, { method: "POST" });
      onPlayed();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Không đổi được lượt.");
    } finally {
      setBusyExchange(false);
    }
  }

  const bg = mediaUrl(cfg.backgroundUrl);
  const style = { "--gw-main": cfg.borderColor, "--gw-soft": cfg.wheelColor } as React.CSSProperties;

  return (
    <div className="gw" style={style}>
      <div className="gw-hero" style={bg ? { backgroundImage: `linear-gradient(180deg, rgba(0,0,0,.15), rgba(0,0,0,.55)), url("${bg}")` } : undefined}>
        <h1>{campaign.name}</h1>
        {campaign.description && <p>{campaign.description}</p>}
        {me && (
          <div className="gw-chips">
            <span className="gw-chip"><Ticket size={15} aria-hidden /> Còn <strong>{me.tickets}</strong> lượt</span>
            <span className="gw-chip">Hôm nay quay thêm được <strong>{me.leftToday}</strong></span>
          </div>
        )}
      </div>

      <div className="gw-stage">
        <div className="gw-wheel">
          <WheelSvg segments={segments} wheelColor={cfg.wheelColor} borderColor={cfg.borderColor} size={380} rotation={rotation} spinMs={spinMs} />
        </div>

        {err && <div className="gw-err" role="alert">{err}</div>}

        {!campaign.running ? (
          <div className="gw-note">Chương trình chưa bắt đầu hoặc đã kết thúc.</div>
        ) : !campaign.storeAllowed ? (
          <div className="gw-note">Chương trình không áp dụng tại chi nhánh này.</div>
        ) : !me ? (
          <div className="gw-login">
            <p>Đăng nhập bằng số điện thoại để quay và nhận quà.</p>
            <div className="gw-row">
              <Link className="gw-btn" to={`/login?next=${nextUrl}`}>Đăng nhập</Link>
              <Link className="gw-btn ghost" to={`/register?next=${nextUrl}`}>Đăng ký</Link>
            </div>
          </div>
        ) : (
          <>
            <button type="button" className="gw-spin" onClick={() => void spin()} disabled={!canSpin}>
              <RotateCw size={20} aria-hidden className={spinning ? "gw-rotating" : undefined} />
              {spinning ? "Đang quay…" : "QUAY"}
            </button>
            {me.tickets === 0 && (
              <div className="gw-note">
                Bạn đã hết lượt. Mỗi đơn từ <strong>{campaign.minOrderValue.toLocaleString("vi-VN")}đ</strong> được tặng 1 lượt quay.
                {campaign.allowPointExchange && (
                  <div className="gw-row" style={{ marginTop: 10 }}>
                    <button type="button" className="gw-btn ghost" disabled={busyExchange || me.points < campaign.pointsPerTicket} onClick={() => void exchange()}>
                      <Coins size={16} aria-hidden /> Đổi {campaign.pointsPerTicket.toLocaleString("vi-VN")} điểm lấy 1 lượt
                    </button>
                    <span className="gw-muted">Bạn có {me.points.toLocaleString("vi-VN")} điểm</span>
                  </div>
                )}
              </div>
            )}
            {me.tickets > 0 && me.leftToday === 0 && <div className="gw-note">Hôm nay bạn đã quay đủ {campaign.maxPlaysPerDay} lượt, quay lại vào ngày mai nhé.</div>}
          </>
        )}

        <Link className="gw-link" to="/account/gifts"><Gift size={15} aria-hidden /> Quà của tôi</Link>
      </div>

      {result && <ResultPopup r={result} onClose={() => setResult(null)} onUseVoucher={() => nav("/menu")} />}
    </div>
  );
}

function ResultPopup({ r, onClose, onUseVoucher }: { r: PlayResponse; onClose: () => void; onUseVoucher: () => void }) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (r.giftClaim) void QRCode.toDataURL(r.giftClaim.code, { width: 320, margin: 1 }).then(setQr);
  }, [r.giftClaim]);
  const img = mediaUrl(r.prize.imageUrl);
  const lose = r.prize.kind === "NONE";

  return (
    <div className="gw-modal" role="dialog" aria-modal="true" aria-label="Kết quả" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`gw-result${lose ? " lose" : ""}`}>
        <button type="button" className="gw-close" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        {!lose && <div className="gw-confetti" aria-hidden />}
        <div className="gw-kicker">{lose ? "Tiếc quá!" : "Chúc mừng bạn!"}</div>
        {img && !lose && <img className="gw-prize-img" src={img} alt="" />}
        <h2>{r.prize.label}</h2>

        {r.prize.kind === "POINTS" && <div className="gw-big">+{(r.prize.points ?? 0).toLocaleString("vi-VN")} điểm</div>}

        {r.prize.kind === "VOUCHER" && r.prize.voucher && (
          <>
            <div className="gw-code">{r.prize.voucher.code}</div>
            <p className="gw-muted">
              Đã thêm vào ví voucher · giảm {r.prize.voucher.discountValue.toLocaleString("vi-VN")}đ cho đơn từ {r.prize.voucher.minBillValue.toLocaleString("vi-VN")}đ ·
              hạn {new Date(r.prize.voucher.endDate).toLocaleDateString("vi-VN")}
            </p>
            <button type="button" className="gw-btn" onClick={onUseVoucher}>Dùng ngay</button>
          </>
        )}

        {r.giftClaim && (
          <>
            <p className="gw-muted">Đưa mã này cho thu ngân để nhận quà</p>
            <div className="gw-code">{r.giftClaim.code}</div>
            {qr && <img className="gw-qr" src={qr} alt={`QR mã ${r.giftClaim.code}`} />}
            <p className="gw-muted">
              Hạn nhận: <strong>{new Date(r.giftClaim.expiresAt).toLocaleDateString("vi-VN")}</strong>
              <br />
              Nhận tại: <strong>{r.giftClaim.store ? r.giftClaim.store.name : "bất kỳ chi nhánh còn quà"}</strong>
              {r.giftClaim.store?.address ? <><br />{r.giftClaim.store.address}</> : null}
            </p>
          </>
        )}

        {lose && <p className="gw-muted">Chúc bạn may mắn lần sau nhé!</p>}
        <button type="button" className={`gw-btn${r.prize.kind === "VOUCHER" ? " ghost" : ""}`} onClick={onClose}>Đóng</button>
      </div>
    </div>
  );
}
