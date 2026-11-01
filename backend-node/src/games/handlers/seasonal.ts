import { GameError } from "../errors.js";
import { pickOneHandler } from "./pickOne.js";

/** Cấu hình riêng của lì xì (GameCampaign.config) */
export type LixiConfig = {
  backgroundUrl: string | null;
  /** Màu bao lì xì */
  envelopeColor: string;
  /** Màu nhũ vàng (viền, con dấu) */
  accentColor: string;
  /** Chữ trên con dấu: LỘC, PHÚC, AN… */
  envelopeText: string;
  /** Số bao bày ra cho khách chọn */
  envelopeCount: number;
  /** Lời chúc trên tấm thiệp trong bao */
  greeting: string;
};

const HEX = /^#[0-9a-f]{6}$/i;
export const ENVELOPE_COUNTS = [4, 6, 8, 9, 12];
export const LIXI_DEFAULTS: LixiConfig = {
  backgroundUrl: null, envelopeColor: "#C62828", accentColor: "#F2C230", envelopeText: "LỘC", envelopeCount: 9, greeting: "Chúc mừng năm mới",
};

export const seasonalHandler = pickOneHandler("Lì xì", LIXI_DEFAULTS, (raw) => {
  const c = (raw ?? {}) as Partial<LixiConfig>;
  const envelopeColor = c.envelopeColor ?? LIXI_DEFAULTS.envelopeColor;
  const accentColor = c.accentColor ?? LIXI_DEFAULTS.accentColor;
  if (!HEX.test(envelopeColor)) throw new GameError("Màu bao lì xì phải dạng #RRGGBB.");
  if (!HEX.test(accentColor)) throw new GameError("Màu nhũ phải dạng #RRGGBB.");
  const envelopeCount = Number(c.envelopeCount ?? LIXI_DEFAULTS.envelopeCount);
  if (!ENVELOPE_COUNTS.includes(envelopeCount)) throw new GameError(`Số bao lì xì chọn một trong: ${ENVELOPE_COUNTS.join(", ")}.`);
  const envelopeText = typeof c.envelopeText === "string" ? c.envelopeText.trim().slice(0, 8) : LIXI_DEFAULTS.envelopeText;
  const greeting = typeof c.greeting === "string" ? c.greeting.trim().slice(0, 60) : LIXI_DEFAULTS.greeting;
  const backgroundUrl = typeof c.backgroundUrl === "string" && c.backgroundUrl.trim() ? c.backgroundUrl.trim().slice(0, 1024) : null;
  return { backgroundUrl, envelopeColor: envelopeColor.toUpperCase(), accentColor: accentColor.toUpperCase(), envelopeText, envelopeCount, greeting };
});
