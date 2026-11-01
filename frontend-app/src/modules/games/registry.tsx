import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { CalendarHeart, CircleDot, Gift, ListChecks, MessageCircleQuestion, Stamp, Ticket } from "lucide-react";
import type { IconType } from "../../components/erp";
import type { GameType, PrizeDraft, PublicCampaign } from "./types";
import { WheelConfigPanel, WHEEL_DEFAULT_CONFIG, type WheelConfig } from "./wheel/WheelConfigPanel";
import { WheelSvg } from "./wheel/WheelSvg";
import { ScratchConfigPanel, SCRATCH_DEFAULT_CONFIG, type ScratchConfig } from "./scratch/ScratchConfigPanel";
import { PrizeFace } from "./scratch/ScratchCard";
import { LixiConfigPanel, LIXI_DEFAULT_CONFIG, type LixiConfig } from "./seasonal/LixiConfigPanel";
import { Envelope } from "./seasonal/Envelope";
import { MysteryConfigPanel, MYSTERY_DEFAULT_CONFIG, type MysteryConfig } from "./mystery/MysteryConfigPanel";
import { BOX_PALETTE, GiftBox } from "./mystery/GiftBox";
import "../../styles/games.css";

/** Khối cấu hình riêng của game trong trang chi tiết chiến dịch */
export type ConfigPanelProps = { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void; disabled?: boolean };
/** Xem trước trong trang quản trị (render đúng cấu hình + các ô theo thứ tự) */
export type PreviewProps = { config: Record<string, unknown>; prizes: PrizeDraft[] };
/** Giao diện chơi của khách — nhận chiến dịch công khai, gọi onPlayed sau mỗi lượt để tải lại số lượt */
export type PlayViewProps = { campaign: PublicCampaign; storeId: number | null; onPlayed: () => void };

export type GameUI = {
  label: string;
  description: string;
  icon: IconType;
  ready: boolean;
  defaultConfig: Record<string, unknown>;
  ConfigPanel?: ComponentType<ConfigPanelProps>;
  Preview?: ComponentType<PreviewProps>;
  PlayView?: LazyExoticComponent<ComponentType<PlayViewProps>>;
};

function WheelPreview({ config, prizes }: PreviewProps) {
  const c = { ...WHEEL_DEFAULT_CONFIG, ...(config as Partial<WheelConfig>) };
  return <WheelSvg segments={prizes.map((p) => ({ label: p.label || "—", imageUrl: p.imageUrl, color: p.color }))} wheelColor={c.wheelColor} borderColor={c.borderColor} size={300} />;
}

/** Xem trước thẻ cào: lớp phủ đã cào một góc, lộ giải đầu tiên có quà */
function ScratchPreview({ config, prizes }: PreviewProps) {
  const c = { ...SCRATCH_DEFAULT_CONFIG, ...(config as Partial<ScratchConfig>) };
  const p = prizes.find((x) => x.kind !== "NONE") ?? prizes[0];
  return (
    <div className="gs-card" style={{ "--gs-card": c.cardColor, width: 300 } as React.CSSProperties}>
      <div className="gs-face">
        <div className="gs-title">Thẻ cào may mắn</div>
        <div className="gs-area">
          <PrizeFace prize={p ? { label: p.label || "—", imageUrl: p.imageUrl, kind: p.kind, color: p.color, points: p.points } : null} />
          <div className="gs-cover-preview" style={{ background: c.coverColor }}>
            <span>{c.coverText}</span>
          </div>
        </div>
        <div className="gs-perf" aria-hidden />
      </div>
    </div>
  );
}

/** Xem trước lì xì: 3 bao, bao giữa đang mở lộ giải đầu tiên có quà */
function LixiPreview({ config, prizes }: PreviewProps) {
  const c = { ...LIXI_DEFAULT_CONFIG, ...(config as Partial<LixiConfig>) };
  const p = prizes.find((x) => x.kind !== "NONE") ?? prizes[0];
  const prize = p ? { label: p.label || "—", imageUrl: p.imageUrl, kind: p.kind, points: p.points } : null;
  return (
    <div className="lx-grid lx-grid-preview" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", width: 300 }}>
      {[0, 1, 2].map((i) => (
        <Envelope key={i} index={i} color={c.envelopeColor} accent={c.accentColor} text={c.envelopeText} greeting={c.greeting} state={i === 1 ? "open" : "idle"} prize={i === 1 ? prize : null} disabled />
      ))}
    </div>
  );
}

/** Xem trước hộp quà: 3 hộp, hộp giữa đang mở lộ giải đầu tiên có quà */
function MysteryPreview({ config, prizes }: PreviewProps) {
  const c = { ...MYSTERY_DEFAULT_CONFIG, ...(config as Partial<MysteryConfig>) };
  const p = prizes.find((x) => x.kind !== "NONE") ?? prizes[0];
  const prize = p ? { label: p.label || "—", imageUrl: p.imageUrl, kind: p.kind, points: p.points } : null;
  return (
    <div className="lx-grid lx-grid-preview" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", width: 300, paddingTop: 40 }}>
      {[0, 1, 2].map((i) => (
        <GiftBox key={i} index={i} state={i === 1 ? "open" : "idle"} prize={i === 1 ? prize : null} disabled onPick={() => {}} color={c.colorful ? BOX_PALETTE[i] : c.boxColor} ribbon={c.ribbonColor} />
      ))}
    </div>
  );
}

const MysteryPlayView = lazy(() => import("./mystery/MysteryPlayView").then((m) => ({ default: m.MysteryPlayView })));
const LixiPlayView = lazy(() => import("./seasonal/LixiPlayView").then((m) => ({ default: m.LixiPlayView })));
const ScratchPlayView = lazy(() => import("./scratch/ScratchPlayView").then((m) => ({ default: m.ScratchPlayView })));
const WheelPlayView = lazy(() => import("./wheel/WheelPlayView").then((m) => ({ default: m.WheelPlayView })));

/**
 * Giao diện của từng mini game. Thêm game mới: viết ConfigPanel + PlayView (+ Preview) rồi đặt ready: true ở đây
 * và đăng ký handler ở backend-node/src/games/registry.ts. Xem docs/minigame-architecture.md.
 */
export const GAME_UI: Record<GameType, GameUI> = {
  WHEEL: {
    label: "Vòng quay may mắn",
    description: "Khách quay vòng quay trúng món, voucher, điểm hoặc quà hiện vật.",
    icon: CircleDot,
    ready: true,
    defaultConfig: WHEEL_DEFAULT_CONFIG,
    ConfigPanel: WheelConfigPanel,
    Preview: WheelPreview,
    PlayView: WheelPlayView,
  },
  SCRATCH: {
    label: "Thẻ cào",
    description: "Khách lấy thẻ rồi cào lớp bạc để lộ phần thưởng.",
    icon: Ticket,
    ready: true,
    defaultConfig: SCRATCH_DEFAULT_CONFIG,
    ConfigPanel: ScratchConfigPanel,
    Preview: ScratchPreview,
    PlayView: ScratchPlayView,
  },
  MYSTERY_BOX: {
    label: "Hộp quà bí mật",
    description: "Khách chọn một trong nhiều hộp quà, mở ra xem bên trong có gì.",
    icon: Gift,
    ready: true,
    defaultConfig: MYSTERY_DEFAULT_CONFIG,
    ConfigPanel: MysteryConfigPanel,
    Preview: MysteryPreview,
    PlayView: MysteryPlayView,
  },
  STAMP: { label: "Thẻ tích ly", description: "Mua đủ số ly nhận quà.", icon: Stamp, ready: false, defaultConfig: {} },
  MISSION: { label: "Nhiệm vụ tuần", description: "Hoàn thành nhiệm vụ nhận thưởng.", icon: ListChecks, ready: false, defaultConfig: {} },
  QUIZ: { label: "Đố vui", description: "Trả lời đúng nhận quà.", icon: MessageCircleQuestion, ready: false, defaultConfig: {} },
  SEASONAL: {
    label: "Lì xì Tết",
    description: "Khách chọn một bao lì xì, mở ra nhận lộc đầu năm.",
    icon: CalendarHeart,
    ready: true,
    defaultConfig: LIXI_DEFAULT_CONFIG,
    ConfigPanel: LixiConfigPanel,
    Preview: LixiPreview,
    PlayView: LixiPlayView,
  },
};

export const GAME_TYPES = Object.keys(GAME_UI) as GameType[];
