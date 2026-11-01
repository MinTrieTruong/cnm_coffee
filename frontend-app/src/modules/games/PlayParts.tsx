import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Coins, Gift, Ticket, X } from "lucide-react";
import QRCode from "qrcode";
import { api, mediaUrl } from "../../lib/api";
import type { PlayResponse, PublicCampaign, PublicSegment } from "./types";

/** Phần dùng chung của màn chơi mọi mini game: đầu trang, điều kiện chơi (lượt / đăng nhập / đổi điểm), popup kết quả */

export function GameHero({ campaign, backgroundUrl, verb }: { campaign: PublicCampaign; backgroundUrl?: string | null; verb: string }) {
  const bg = mediaUrl(backgroundUrl ?? null);
  const me = campaign.me;
  return (
    <div className="gw-hero" style={bg ? { backgroundImage: `linear-gradient(180deg, rgba(0,0,0,.15), rgba(0,0,0,.55)), url("${bg}")` } : undefined}>
      <h1>{campaign.name}</h1>
      {campaign.description && <p>{campaign.description}</p>}
      {me && (
        <div className="gw-chips">
          <span className="gw-chip"><Ticket size={15} aria-hidden /> Còn <strong>{me.tickets}</strong> lượt</span>
          <span className="gw-chip">Hôm nay {verb} thêm được <strong>{me.leftToday}</strong></span>
        </div>
      )}
    </div>
  );
}

/**
 * Điều kiện chơi: chưa chạy / sai chi nhánh / chưa đăng nhập → thông báo; đã đăng nhập → `children` (nút chơi)
 * kèm ghi chú hết lượt (đổi điểm lấy lượt) hoặc đã chơi đủ lượt hôm nay.
 */
export function PlayGate({ campaign, verb, onPlayed, onError, children }: { campaign: PublicCampaign; verb: string; onPlayed: () => void; onError: (msg: string | null) => void; children: ReactNode }) {
  const loc = useLocation();
  const [busy, setBusy] = useState(false);
  const me = campaign.me;
  const nextUrl = encodeURIComponent(loc.pathname + loc.search);

  async function exchange() {
    onError(null);
    setBusy(true);
    try {
      await api(`/api/games/${campaign.id}/exchange`, { method: "POST" });
      onPlayed();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Không đổi được lượt.");
    } finally {
      setBusy(false);
    }
  }

  if (!campaign.running) return <div className="gw-note">Chương trình chưa bắt đầu hoặc đã kết thúc.</div>;
  if (!campaign.storeAllowed) return <div className="gw-note">Chương trình không áp dụng tại chi nhánh này.</div>;
  if (!me)
    return (
      <div className="gw-login">
        <p>Đăng nhập bằng số điện thoại để {verb} và nhận quà.</p>
        <div className="gw-row">
          <Link className="gw-btn" to={`/login?next=${nextUrl}`}>Đăng nhập</Link>
          <Link className="gw-btn ghost" to={`/register?next=${nextUrl}`}>Đăng ký</Link>
        </div>
      </div>
    );
  return (
    <>
      {children}
      {me.tickets === 0 && (
        <div className="gw-note">
          Bạn đã hết lượt. Mỗi đơn từ <strong>{campaign.minOrderValue.toLocaleString("vi-VN")}đ</strong> được tặng 1 lượt {verb}.
          {campaign.allowPointExchange && (
            <div className="gw-row" style={{ marginTop: 10 }}>
              <button type="button" className="gw-btn ghost" disabled={busy || me.points < campaign.pointsPerTicket} onClick={() => void exchange()}>
                <Coins size={16} aria-hidden /> Đổi {campaign.pointsPerTicket.toLocaleString("vi-VN")} điểm lấy 1 lượt
              </button>
              <span className="gw-muted">Bạn có {me.points.toLocaleString("vi-VN")} điểm</span>
            </div>
          )}
        </div>
      )}
      {me.tickets > 0 && me.leftToday === 0 && <div className="gw-note">Hôm nay bạn đã {verb} đủ {campaign.maxPlaysPerDay} lượt, quay lại vào ngày mai nhé.</div>}
    </>
  );
}

export function ResultPopup({ r, onClose, onUseVoucher }: { r: PlayResponse; onClose: () => void; onUseVoucher: () => void }) {
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

/** Danh sách quà có thể trúng (bỏ ô "không trúng", không lộ tỉ lệ) */
export function PrizeChips({ prizes, title = "Quà có thể trúng" }: { prizes: PublicSegment[]; title?: string }) {
  const list = prizes.filter((p) => p.kind !== "NONE");
  if (!list.length) return null;
  return (
    <div className="gs-prizes">
      <div className="gs-prizes-title">{title}</div>
      <ul>
        {list.map((p) => {
          const img = mediaUrl(p.imageUrl);
          return (
            <li key={p.id}>
              {img ? <img src={img} alt="" /> : <Gift size={18} aria-hidden />}
              <span>{p.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
