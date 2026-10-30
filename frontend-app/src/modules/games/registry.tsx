import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { CalendarHeart, CircleDot, Gift, ListChecks, MessageCircleQuestion, Stamp, Ticket } from "lucide-react";
import type { IconType } from "../../components/erp";
import type { GameType, PrizeDraft, PublicCampaign } from "./types";
import { WheelConfigPanel, WHEEL_DEFAULT_CONFIG, type WheelConfig } from "./wheel/WheelConfigPanel";
import { WheelSvg } from "./wheel/WheelSvg";
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
  SCRATCH: { label: "Thẻ cào", description: "Cào lớp phủ để lộ phần thưởng.", icon: Ticket, ready: false, defaultConfig: {} },
  MYSTERY_BOX: { label: "Hộp quà bí mật", description: "Chọn 1 trong nhiều hộp quà.", icon: Gift, ready: false, defaultConfig: {} },
  STAMP: { label: "Thẻ tích ly", description: "Mua đủ số ly nhận quà.", icon: Stamp, ready: false, defaultConfig: {} },
  MISSION: { label: "Nhiệm vụ tuần", description: "Hoàn thành nhiệm vụ nhận thưởng.", icon: ListChecks, ready: false, defaultConfig: {} },
  QUIZ: { label: "Đố vui", description: "Trả lời đúng nhận quà.", icon: MessageCircleQuestion, ready: false, defaultConfig: {} },
  SEASONAL: { label: "Lì xì theo mùa", description: "Lì xì Tết, quà lễ theo mùa.", icon: CalendarHeart, ready: false, defaultConfig: {} },
};

export const GAME_TYPES = Object.keys(GAME_UI) as GameType[];
