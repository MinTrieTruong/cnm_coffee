import { pickPrize } from "../picker.js";
import type { CampaignWithPrizes, GameHandler } from "../types.js";

/** Cấu hình riêng của vòng quay (GameCampaign.config) */
export type WheelConfig = { backgroundUrl: string | null; wheelColor: string; borderColor: string };

const HEX = /^#[0-9a-f]{6}$/i;
export const WHEEL_DEFAULTS: WheelConfig = { backgroundUrl: null, wheelColor: "#FFF7ED", borderColor: "#92400E" };

/** Các ô trên vòng: giải đang dùng, theo thứ tự — chỉ số ô gửi cho giao diện để dừng đúng chỗ */
const segmentsOf = (c: CampaignWithPrizes) =>
  c.prizes.filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

export const wheelHandler: GameHandler = {
  validateConfig(raw) {
    const c = (raw ?? {}) as Partial<WheelConfig>;
    const wheelColor = c.wheelColor ?? WHEEL_DEFAULTS.wheelColor;
    const borderColor = c.borderColor ?? WHEEL_DEFAULTS.borderColor;
    if (!HEX.test(wheelColor)) throw new Error("Màu nền vòng quay phải dạng #RRGGBB.");
    if (!HEX.test(borderColor)) throw new Error("Màu viền vòng quay phải dạng #RRGGBB.");
    const backgroundUrl = typeof c.backgroundUrl === "string" && c.backgroundUrl.trim() ? c.backgroundUrl.trim().slice(0, 1024) : null;
    return { backgroundUrl, wheelColor: wheelColor.toUpperCase(), borderColor: borderColor.toUpperCase() };
  },

  async play(tx, ctx) {
    const segments = segmentsOf(ctx.campaign);
    if (segments.length < 2) throw new Error("Vòng quay cần ít nhất 2 ô.");
    const prize = await pickPrize(tx, segments, { customerId: ctx.customerId, storeId: ctx.storeId });
    const segmentIndex = prize ? segments.findIndex((s) => s.id === prize.id) : -1;
    return { prize, data: { segmentIndex, segmentCount: segments.length } };
  },

  publicView(campaign) {
    const config = { ...WHEEL_DEFAULTS, ...((campaign.config ?? {}) as Partial<WheelConfig>) };
    return {
      config,
      segments: segmentsOf(campaign).map((p) => ({ id: p.id, label: p.label, imageUrl: p.imageUrl, color: p.color, kind: p.kind })),
    };
  },
};
