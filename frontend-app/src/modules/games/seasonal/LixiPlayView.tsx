import type { PlayViewProps } from "../registry";
import { PickOneGame } from "../PickOneGame";
import { OccasionArt } from "../../../components/site/Festive";
import { LIXI_DEFAULT_CONFIG, type LixiConfig } from "./LixiConfigPanel";
import { Envelope } from "./Envelope";

/** Giao diện chơi lì xì: chọn 1 bao → bao lắc → nắp lật, thiệp trồi lên → popup kết quả (khung chung PickOneGame) */
export function LixiPlayView(props: PlayViewProps) {
  const cfg = { ...LIXI_DEFAULT_CONFIG, ...((props.campaign.view as { config: Partial<LixiConfig> }).config) };
  return (
    <PickOneGame
      {...props}
      count={cfg.envelopeCount}
      backgroundUrl={cfg.backgroundUrl}
      mainColor={cfg.envelopeColor}
      verb="mở"
      texts={{
        pick: "Chọn một bao lì xì để nhận lộc đầu năm.",
        picking: "Đang mở bao lì xì…",
        opened: "Lộc đã được lưu trong Quà của tôi.",
        chips: "Lộc có thể nhận",
        error: "Không mở được bao lì xì, thử lại sau.",
      }}
      board={(grid) => (
        <div className="lx-board">
          <OccasionArt id="tet" className="lx-deco lx-deco-l" height={56} />
          <OccasionArt id="tet" className="lx-deco lx-deco-r" height={56} flip />
          {grid}
        </div>
      )}
      renderItem={(p) => (
        <Envelope
          index={p.index}
          color={cfg.envelopeColor}
          accent={cfg.accentColor}
          text={cfg.envelopeText}
          greeting={cfg.greeting}
          state={p.state}
          prize={p.prize}
          disabled={p.disabled}
          onPick={p.onPick}
        />
      )}
    />
  );
}
