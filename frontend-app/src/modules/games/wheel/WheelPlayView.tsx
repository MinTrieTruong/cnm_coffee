import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Gift, RotateCw, Volume2, VolumeX } from "lucide-react";
import { api } from "../../../lib/api";
import { GameHero, PlayGate, ResultPopup } from "../PlayParts";
import type { PlayViewProps } from "../registry";
import type { PlayResponse, PublicSegment } from "../types";
import { WHEEL_DEFAULT_CONFIG, type WheelConfig } from "./WheelConfigPanel";
import { WheelSvg, stopAngle } from "./WheelSvg";
import { isMuted, playTick, setMuted, unlockTick } from "./wheelTick";

/** Tốc độ quay đều (độ/ms ≈ 2 vòng/giây), thời gian tăng tốc, số vòng tối thiểu khi giảm tốc */
const CRUISE = 0.75;
const RAMP_MS = 450;
const MIN_TURNS = 2.5;

/** Lệnh dừng: target = góc 0–360 cần dừng (null = dừng nhanh tại chỗ, khi lỗi) */
type StopReq = { target: number | null; done: () => void };

/** Giao diện chơi vòng quay của khách */
export function WheelPlayView({ campaign, storeId, onPlayed }: PlayViewProps) {
  const view = campaign.view as { config: Partial<WheelConfig>; segments: PublicSegment[] };
  const cfg = { ...WHEEL_DEFAULT_CONFIG, ...view.config };
  const segments = view.segments;
  const nav = useNavigate();
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<PlayResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const raf = useRef<number | undefined>(undefined);
  const rotor = useRef<SVGGElement>(null);
  const angle = useRef(0);
  const stopReq = useRef<StopReq | null>(null);
  const [muted, setMutedState] = useState(isMuted);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (raf.current) cancelAnimationFrame(raf.current);
    },
    [],
  );

  const me = campaign.me;
  const canSpin = !!me && me.leftToday > 0 && campaign.running && campaign.storeAllowed && !spinning;

  function setAngle(a: number) {
    // Vạch chia ô nằm ở bội số của góc mỗi ô (ô 0 bắt đầu dưới kim) — qua vạch mới thì kêu tích
    const seg = 360 / Math.max(segments.length, 1);
    if (!mutedRef.current && Math.floor(a / seg) !== Math.floor(angle.current / seg)) playTick();
    angle.current = a;
    rotor.current?.setAttribute("transform", `rotate(${a})`);
  }

  function toggleMute() {
    setMutedState((m) => {
      setMuted(!m);
      return !m;
    });
  }

  /**
   * Quay ngay khi bấm (tăng tốc rồi quay đều) trong lúc chờ máy chủ; có kết quả thì giảm tốc
   * theo ease-out bậc 3 với vận tốc đầu bằng tốc độ quay đều nên không bị khựng, dừng đúng ô.
   */
  function startRotor() {
    const t0 = performance.now();
    const a0 = angle.current;
    let settle: { from: number; dist: number; start: number; dur: number; done: () => void } | null = null;
    stopReq.current = null;

    const frame = (now: number) => {
      if (settle) {
        const s = Math.min(1, (now - settle.start) / settle.dur);
        setAngle(settle.from + settle.dist * (1 - (1 - s) ** 3));
        if (s >= 1) {
          // Thu góc về 0–360 (cùng vị trí, không kêu tích)
          angle.current %= 360;
          rotor.current?.setAttribute("transform", `rotate(${angle.current})`);
          raf.current = undefined;
          settle.done();
          return;
        }
      } else {
        const t = now - t0;
        setAngle(a0 + (t < RAMP_MS ? (CRUISE * t * t) / (2 * RAMP_MS) : CRUISE * (t - RAMP_MS / 2)));
        const req = stopReq.current;
        if (req && t >= RAMP_MS) {
          const from = angle.current;
          let dist = (CRUISE * 600) / 3;
          if (req.target !== null) {
            dist = (((req.target - from) % 360) + 360) % 360;
            while (dist < MIN_TURNS * 360) dist += 360;
          }
          settle = { from, dist, start: now, dur: (3 * dist) / CRUISE, done: req.done };
        }
      }
      raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);
  }

  async function spin() {
    if (!canSpin) return;
    setErr(null);
    setSpinning(true);
    unlockTick();
    startRotor();
    try {
      const r = await api<PlayResponse>(`/api/games/${campaign.id}/play`, { method: "POST", body: JSON.stringify({ storeId }) });
      const idx = Number(r.data.segmentIndex ?? -1);
      stopReq.current = {
        target: stopAngle(idx >= 0 ? idx : 0, segments.length),
        done: () => {
          timer.current = window.setTimeout(() => {
            setSpinning(false);
            setResult(r);
            onPlayed();
          }, 250);
        },
      };
    } catch (e) {
      stopReq.current = {
        target: null,
        done: () => {
          setSpinning(false);
          setErr(e instanceof Error ? e.message : "Không quay được, thử lại sau.");
        },
      };
    }
  }

  const style = { "--gw-main": cfg.borderColor, "--gw-soft": cfg.wheelColor } as React.CSSProperties;

  return (
    <div className="gw" style={style}>
      <GameHero campaign={campaign} backgroundUrl={cfg.backgroundUrl} verb="quay" />

      <div className="gw-stage">
        <div className="gw-wheel">
          <WheelSvg segments={segments} wheelColor={cfg.wheelColor} borderColor={cfg.borderColor} size={380} rotorRef={rotor} />
          <button type="button" className="gw-sound" onClick={toggleMute} aria-pressed={!muted} aria-label={muted ? "Bật tiếng" : "Tắt tiếng"} title={muted ? "Bật tiếng" : "Tắt tiếng"}>
            {muted ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
          </button>
        </div>

        {err && <div className="gw-err" role="alert">{err}</div>}

        <PlayGate campaign={campaign} verb="quay" onPlayed={onPlayed} onError={setErr}>
          <button type="button" className="gw-spin" onClick={() => void spin()} disabled={!canSpin}>
            <RotateCw size={20} aria-hidden className={spinning ? "gw-rotating" : undefined} />
            {spinning ? "Đang quay…" : "QUAY"}
          </button>
        </PlayGate>

        <Link className="gw-link" to="/account/gifts"><Gift size={15} aria-hidden /> Quà của tôi</Link>
      </div>

      {result && <ResultPopup r={result} onClose={() => setResult(null)} onUseVoucher={() => nav("/menu")} />}
    </div>
  );
}

