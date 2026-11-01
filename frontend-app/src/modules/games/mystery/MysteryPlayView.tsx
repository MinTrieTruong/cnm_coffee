import type { PlayViewProps } from "../registry";
import { PickOneGame } from "../PickOneGame";
import { MYSTERY_DEFAULT_CONFIG, type MysteryConfig } from "./MysteryConfigPanel";
import { BOX_PALETTE, GiftBox } from "./GiftBox";

/** Giao diện chơi hộp quà bí mật: chọn 1 hộp → hộp lắc → nắp bung, quà trồi lên → popup kết quả (khung chung PickOneGame) */
export function MysteryPlayView(props: PlayViewProps) {
  const cfg = { ...MYSTERY_DEFAULT_CONFIG, ...(props.campaign.view as { config: Partial<MysteryConfig> }).config };
  const colorOf = (i: number) => (cfg.colorful ? BOX_PALETTE[i % BOX_PALETTE.length] : cfg.boxColor);
  return (
    <PickOneGame
      {...props}
      count={cfg.boxCount}
      backgroundUrl={cfg.backgroundUrl}
      mainColor={cfg.colorful ? BOX_PALETTE[0] : cfg.boxColor}
      verb="mở"
      texts={{
        pick: "Chọn một hộp quà bí mật — bên trong có gì nhỉ?",
        picking: "Đang mở hộp quà…",
        opened: "Quà đã được lưu trong Quà của tôi.",
        chips: "Quà có thể nằm trong hộp",
        error: "Không mở được hộp quà, thử lại sau.",
      }}
      board={(grid) => <div className="mb-board">{grid}</div>}
      renderItem={(p) => <GiftBox {...p} color={colorOf(p.index)} ribbon={cfg.ribbonColor} />}
    />
  );
}
