import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, Gift, Ticket } from "lucide-react";
import { api } from "../../../lib/api";
import type { PlayViewProps } from "../registry";
import type { PlayResponse, PublicSegment } from "../types";
import { GameHero, PlayGate, PrizeChips, ResultPopup } from "../PlayParts";
import { SCRATCH_DEFAULT_CONFIG, type ScratchConfig } from "./ScratchConfigPanel";
import { ScratchCard, type CardPrize } from "./ScratchCard";

type Phase = "idle" | "loading" | "ready" | "revealed";

/** Giao diện chơi thẻ cào: lấy thẻ (dùng 1 lượt, máy chủ chọn giải ngay) → cào lớp phủ → lộ giải → popup kết quả */
export function ScratchPlayView({ campaign, storeId, onPlayed }: PlayViewProps) {
  const view = campaign.view as { config: Partial<ScratchConfig>; prizes: PublicSegment[] };
  const cfg = { ...SCRATCH_DEFAULT_CONFIG, ...view.config };
  const nav = useNavigate();
  const [phase, setPhase] = useState<Phase>("idle");
  const [cardKey, setCardKey] = useState(0);
  const [play, setPlay] = useState<PlayResponse | null>(null);
  const [popup, setPopup] = useState<PlayResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const me = campaign.me;
  const canTake = !!me && me.leftToday > 0 && campaign.running && campaign.storeAllowed && (phase === "idle" || phase === "revealed");

  async function take() {
    if (!canTake) return;
    setErr(null);
    setPlay(null);
    setCardKey((k) => k + 1);
    setPhase("loading");
    try {
      const r = await api<PlayResponse>(`/api/games/${campaign.id}/play`, { method: "POST", body: JSON.stringify({ storeId }) });
      setPlay(r);
      setPhase("ready");
    } catch (e) {
      setPhase("idle");
      setErr(e instanceof Error ? e.message : "Không lấy được thẻ, thử lại sau.");
    }
  }

  function reveal() {
    if (!play || phase !== "ready") return;
    setPhase("revealed");
    const r = play;
    timer.current = window.setTimeout(() => {
      setPopup(r);
      onPlayed();
    }, 700);
  }

  const prize: CardPrize | null = play
    ? { label: play.prize.label, imageUrl: play.prize.imageUrl, kind: play.prize.kind, points: play.prize.points, color: view.prizes.find((p) => p.id === play.prize.id)?.color ?? null }
    : null;
  const style = { "--gw-main": cfg.cardColor } as React.CSSProperties;

  return (
    <div className="gw" style={style}>
      <GameHero campaign={campaign} backgroundUrl={cfg.backgroundUrl} verb="cào" />

      <div className="gw-stage">
        <ScratchCard
          cardKey={cardKey}
          prize={prize}
          coverColor={cfg.coverColor}
          coverText={cfg.coverText}
          cardColor={cfg.cardColor}
          revealPercent={cfg.revealPercent}
          active={phase === "ready"}
          revealed={phase === "revealed"}
          onReveal={reveal}
        />

        <p className="gs-hint" aria-live="polite">
          {phase === "loading" ? "Đang lấy thẻ…" : phase === "ready" ? "Dùng ngón tay hoặc chuột cào lớp bạc để xem quà." : phase === "revealed" ? "Quà đã được lưu trong Quà của tôi." : " "}
        </p>

        {err && <div className="gw-err" role="alert">{err}</div>}

        <PlayGate campaign={campaign} verb="cào" onPlayed={onPlayed} onError={setErr}>
          {phase === "ready" ? (
            <button type="button" className="gw-btn ghost" onClick={reveal}>
              <Eye size={18} aria-hidden /> Lật hết
            </button>
          ) : (
            <button type="button" className="gw-spin" onClick={() => void take()} disabled={!canTake}>
              <Ticket size={20} aria-hidden />
              {phase === "loading" ? "Đang lấy thẻ…" : phase === "revealed" ? "LẤY THẺ MỚI" : "LẤY THẺ"}
            </button>
          )}
        </PlayGate>

        <PrizeChips prizes={view.prizes} />

        <Link className="gw-link" to="/account/gifts"><Gift size={15} aria-hidden /> Quà của tôi</Link>
      </div>

      {popup && <ResultPopup r={popup} onClose={() => setPopup(null)} onUseVoucher={() => nav("/menu")} />}
    </div>
  );
}
