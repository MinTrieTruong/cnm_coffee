import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Gift } from "lucide-react";
import { api } from "../../lib/api";
import type { PlayViewProps } from "./registry";
import type { PlayResponse, PrizeKind, PublicSegment } from "./types";
import { GameHero, PlayGate, PrizeChips, ResultPopup } from "./PlayParts";

/** Trạng thái một món trên bàn: idle = chờ chọn · picked = đang mở (lắc) · open = đã mở, lộ quà · dim = món không chọn */
export type PickState = "idle" | "picked" | "open" | "dim";
export type PickPrize = { label: string; imageUrl: string | null; kind: PrizeKind; points?: number | null };
export type PickItemProps = { index: number; state: PickState; prize: PickPrize | null; disabled: boolean; onPick: () => void };

/** Số cột theo số món — lưới cân đối */
const COLS: Record<number, number> = { 3: 3, 4: 2, 6: 3, 8: 4, 9: 3, 12: 4 };
/** Lắc tối thiểu trước khi mở (kịp thấy dù máy chủ trả nhanh), thời gian mở trước khi hiện popup */
const SHAKE_MS = 700;
const OPEN_MS = 1300;

type Phase = "idle" | "picking" | "open";

/**
 * Khung chung cho game "chọn 1 trong N" (lì xì, hộp quà bí mật): chọn món → lắc (gọi máy chủ) → mở, lộ quà → popup.
 * Món nào khách chọn cũng chỉ là diễn hoạt, giải do máy chủ chọn theo tỉ lệ. Đóng popup thì bày lại bàn mới.
 */
export function PickOneGame({
  campaign,
  storeId,
  onPlayed,
  count,
  backgroundUrl,
  mainColor,
  verb,
  texts,
  board,
  renderItem,
}: PlayViewProps & {
  count: number;
  backgroundUrl: string | null;
  mainColor: string;
  /** Động từ trong câu thông báo: "mở" */
  verb: string;
  texts: { pick: string; picking: string; opened: string; chips: string; error: string };
  /** Bọc lưới (trang trí riêng của game) */
  board: (grid: ReactNode) => ReactNode;
  renderItem: (p: PickItemProps) => ReactNode;
}) {
  const view = campaign.view as { prizes: PublicSegment[] };
  const nav = useNavigate();
  const [phase, setPhase] = useState<Phase>("idle");
  const [picked, setPicked] = useState<number | null>(null);
  const [play, setPlay] = useState<PlayResponse | null>(null);
  const [popup, setPopup] = useState<PlayResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const me = campaign.me;
  const canPick = !!me && me.leftToday > 0 && campaign.running && campaign.storeAllowed && phase === "idle";

  async function pick(i: number) {
    if (!canPick) return;
    setErr(null);
    setPicked(i);
    setPhase("picking");
    const started = performance.now();
    try {
      const r = await api<PlayResponse>(`/api/games/${campaign.id}/play`, { method: "POST", body: JSON.stringify({ storeId }) });
      const wait = Math.max(0, SHAKE_MS - (performance.now() - started));
      timer.current = window.setTimeout(() => {
        setPlay(r);
        setPhase("open");
        timer.current = window.setTimeout(() => {
          setPopup(r);
          onPlayed();
        }, OPEN_MS);
      }, wait);
    } catch (e) {
      setPhase("idle");
      setPicked(null);
      setErr(e instanceof Error ? e.message : texts.error);
    }
  }

  function closePopup() {
    setPopup(null);
    setPlay(null);
    setPicked(null);
    setPhase("idle");
  }

  const prize: PickPrize | null = play ? { label: play.prize.label, imageUrl: play.prize.imageUrl, kind: play.prize.kind, points: play.prize.points } : null;
  const stateOf = (i: number): PickState => (picked === null ? "idle" : picked === i ? (phase === "open" ? "open" : "picked") : "dim");

  const grid = (
    <div className="lx-grid" style={{ gridTemplateColumns: `repeat(${COLS[count] ?? 3}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }, (_, i) => (
        <Fragment key={i}>{renderItem({ index: i, state: stateOf(i), prize: picked === i ? prize : null, disabled: !canPick && picked !== i, onPick: () => void pick(i) })}</Fragment>
      ))}
    </div>
  );

  return (
    <div className="gw" style={{ "--gw-main": mainColor } as React.CSSProperties}>
      <GameHero campaign={campaign} backgroundUrl={backgroundUrl} verb={verb} />

      <div className="gw-stage">
        {board(grid)}

        <p className="gs-hint" aria-live="polite">
          {phase === "picking" ? texts.picking : phase === "open" ? texts.opened : canPick ? texts.pick : " "}
        </p>

        {err && <div className="gw-err" role="alert">{err}</div>}

        <PlayGate campaign={campaign} verb={verb} onPlayed={onPlayed} onError={setErr}>
          {null}
        </PlayGate>

        <PrizeChips prizes={view.prizes} title={texts.chips} />

        <Link className="gw-link" to="/account/gifts"><Gift size={15} aria-hidden /> Quà của tôi</Link>
      </div>

      {popup && <ResultPopup r={popup} onClose={closePopup} onUseVoucher={() => nav("/menu")} />}
    </div>
  );
}
