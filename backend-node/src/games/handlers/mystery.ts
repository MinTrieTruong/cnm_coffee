import { GameError } from "../errors.js";
import { pickOneHandler } from "./pickOne.js";

/** Cấu hình riêng của hộp quà bí mật (GameCampaign.config) */
export type MysteryConfig = {
  backgroundUrl: string | null;
  /** Màu hộp (khi không bật nhiều màu) */
  boxColor: string;
  /** Màu ruy băng, nơ */
  ribbonColor: string;
  /** Mỗi hộp một màu theo bảng màu có sẵn */
  colorful: boolean;
  /** Số hộp bày ra cho khách chọn */
  boxCount: number;
};

const HEX = /^#[0-9a-f]{6}$/i;
export const BOX_COUNTS = [3, 4, 6, 8, 9];
export const MYSTERY_DEFAULTS: MysteryConfig = { backgroundUrl: null, boxColor: "#7C3AED", ribbonColor: "#F2C230", colorful: true, boxCount: 6 };

export const mysteryHandler = pickOneHandler("Hộp quà bí mật", MYSTERY_DEFAULTS, (raw) => {
  const c = (raw ?? {}) as Partial<MysteryConfig>;
  const boxColor = c.boxColor ?? MYSTERY_DEFAULTS.boxColor;
  const ribbonColor = c.ribbonColor ?? MYSTERY_DEFAULTS.ribbonColor;
  if (!HEX.test(boxColor)) throw new GameError("Màu hộp phải dạng #RRGGBB.");
  if (!HEX.test(ribbonColor)) throw new GameError("Màu ruy băng phải dạng #RRGGBB.");
  const boxCount = Number(c.boxCount ?? MYSTERY_DEFAULTS.boxCount);
  if (!BOX_COUNTS.includes(boxCount)) throw new GameError(`Số hộp chọn một trong: ${BOX_COUNTS.join(", ")}.`);
  const backgroundUrl = typeof c.backgroundUrl === "string" && c.backgroundUrl.trim() ? c.backgroundUrl.trim().slice(0, 1024) : null;
  return { backgroundUrl, boxColor: boxColor.toUpperCase(), ribbonColor: ribbonColor.toUpperCase(), colorful: c.colorful !== false, boxCount };
});
