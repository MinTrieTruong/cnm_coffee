import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Gift, QrCode, Ticket, X } from "lucide-react";
import QRCode from "qrcode";
import { api, mediaUrl } from "../../lib/api";
import { GAME_UI } from "./registry";
import { CLAIM_STATUS, PRIZE_KIND_LABEL, type GameType, type PrizeKind } from "./types";
import "../../styles/games.css";

type MyPlay = {
  id: number;
  playedAt: string;
  prizeLabel: string;
  prizeKind: PrizeKind;
  prizeImage: string | null;
  campaign: { id: number; name: string; gameType: GameType };
  giftClaim: { code: string; status: string; expiresAt: string; store: { name: string; address: string | null } | null } | null;
};
type MyGames = { tickets: { id: number; name: string; gameType: GameType; endAt: string; count: number }[]; plays: MyPlay[] };

/** "Quà của tôi" trong trang Tài khoản — dùng chung mọi mini game */
export function MyGifts() {
  const [d, setD] = useState<MyGames | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [qr, setQr] = useState("");

  useEffect(() => {
    api<MyGames>("/api/games/me").then(setD).catch((e) => setErr(e instanceof Error ? e.message : "Lỗi tải dữ liệu"));
  }, []);
  useEffect(() => {
    if (qrFor) void QRCode.toDataURL(qrFor, { width: 320, margin: 1 }).then(setQr);
  }, [qrFor]);

  if (err) return <p className="gw-muted">{err}</p>;
  if (!d) return <p className="gw-muted">Đang tải…</p>;
  const now = Date.now();
  const waiting = d.plays.filter((p) => p.giftClaim?.status === "WAITING" && +new Date(p.giftClaim.expiresAt) > now);

  return (
    <div className="mg">
      <section>
        <h3><Ticket size={18} aria-hidden /> Lượt chơi còn lại</h3>
        {!d.tickets.length ? (
          <p className="gw-muted">Bạn chưa có lượt chơi nào. Đơn hàng đạt mức tối thiểu của chương trình sẽ được tặng lượt.</p>
        ) : (
          <div className="mg-tickets">
            {d.tickets.map((t) => (
              <Link key={t.id} to={`/game/${t.id}`} className="mg-ticket">
                <span className="mg-ticket-count">{t.count}</span>
                <span>
                  <strong>{t.name}</strong>
                  <span className="gw-muted">{GAME_UI[t.gameType]?.label} · đến {new Date(t.endAt).toLocaleDateString("vi-VN")}</span>
                </span>
                <span className="gw-btn sm">Chơi ngay</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3><Gift size={18} aria-hidden /> Mã nhận quà đang chờ</h3>
        {!waiting.length ? (
          <p className="gw-muted">Không có quà nào đang chờ nhận.</p>
        ) : (
          <div className="mg-claims">
            {waiting.map((p) => (
              <div key={p.id} className="mg-claim">
                {p.prizeImage ? <img src={mediaUrl(p.prizeImage)} alt="" /> : <span className="mg-claim-ph"><Gift size={20} aria-hidden /></span>}
                <div className="mg-claim-main">
                  <strong>{p.prizeLabel}</strong>
                  <span className="gw-muted">Hạn {new Date(p.giftClaim!.expiresAt).toLocaleDateString("vi-VN")} · {p.giftClaim!.store?.name ?? "bất kỳ chi nhánh còn quà"}</span>
                </div>
                <button type="button" className="mg-code" onClick={() => setQrFor(p.giftClaim!.code)}>
                  <QrCode size={15} aria-hidden /> {p.giftClaim!.code}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3>Lịch sử chơi</h3>
        {!d.plays.length ? (
          <p className="gw-muted">Chưa có lượt chơi nào.</p>
        ) : (
          <ul className="mg-history">
            {d.plays.map((p) => {
              const st = p.giftClaim
                ? (p.giftClaim.status === "WAITING" && +new Date(p.giftClaim.expiresAt) < now ? CLAIM_STATUS.EXPIRED : CLAIM_STATUS[p.giftClaim.status])
                : null;
              return (
                <li key={p.id}>
                  <span className="mg-when">{new Date(p.playedAt).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</span>
                  <span className="mg-what">
                    <strong>{p.prizeLabel}</strong>
                    <span className="gw-muted">{p.campaign.name}</span>
                  </span>
                  <span className={`mg-tag k-${p.prizeKind.toLowerCase()}`}>{st ? st.label : PRIZE_KIND_LABEL[p.prizeKind]}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {qrFor && (
        <div className="gw-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && setQrFor(null)}>
          <div className="gw-result">
            <button type="button" className="gw-close" onClick={() => setQrFor(null)} aria-label="Đóng"><X size={18} /></button>
            <p className="gw-muted">Đưa mã này cho thu ngân</p>
            <div className="gw-code">{qrFor}</div>
            {qr && <img className="gw-qr" src={qr} alt={`QR ${qrFor}`} />}
          </div>
        </div>
      )}
    </div>
  );
}

/** Banner mời chơi (trang chủ, màn đặt hàng thành công) — chỉ hiện khi có chiến dịch đang chạy */
export function GameBanner({ storeId, compact }: { storeId?: number | null; compact?: boolean }) {
  const [list, setList] = useState<{ id: number; name: string; gameType: GameType; minOrderValue: number; me: { tickets: number; leftToday: number } | null }[]>([]);
  useEffect(() => {
    api<typeof list>(`/api/games/active${storeId ? `?store=${storeId}` : ""}`).then(setList).catch(() => setList([]));
  }, [storeId]);
  const c = list[0];
  if (!c) return null;
  const ui = GAME_UI[c.gameType];
  return (
    <Link to={`/game/${c.id}${storeId ? `?store=${storeId}` : ""}`} className={`gb${compact ? " compact" : ""}`}>
      <span className="gb-icon"><ui.icon size={compact ? 22 : 28} aria-hidden /></span>
      <span className="gb-text">
        <strong>{c.name}</strong>
        <span>
          {c.me?.tickets
            ? `Bạn đang có ${c.me.tickets} lượt chơi — vào quay ngay!`
            : `Mỗi đơn từ ${c.minOrderValue.toLocaleString("vi-VN")}đ được 1 lượt ${ui.label.toLowerCase()}`}
        </span>
      </span>
      <span className="gb-cta">{c.me?.tickets ? "Quay ngay" : "Xem quà"}</span>
    </Link>
  );
}
