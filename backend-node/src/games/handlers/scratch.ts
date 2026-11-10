import { GameError } from "../errors.js";
import { pickPrize } from "../picker.js";
import type { CampaignWithPrizes, GameHandler } from "../types.js";

/** Cấu hình riêng của thẻ cào (GameCampaign.config) */
export type ScratchConfig = {
  backgroundUrl: string | null;
  /** Màu lớp phủ bạc khách cào */
  coverColor: string;
  /** Chữ in trên lớp phủ */
  coverText: string;
  /** Màu khung thẻ / nút */
  cardColor: string;
  /** Cào được bao nhiêu % thì tự lộ hết */
  revealPercent: number;
};

const HEX = /^#[0-9a-f]{6}$/i;
export const SCRATCH_DEFAULTS: ScratchConfig = { backgroundUrl: null, coverColor: "#B8B2A7", coverText: "CÀO TẠI ĐÂY", cardColor: "#92400E", revealPercent: 50 };

/** Giải đang dùng, theo thứ tự trong bảng giải */
const prizesOf = (c: CampaignWithPrizes) =>
  c.prizes.filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

export const scratchHandler: GameHandler = {
  validateConfig(raw) {
    const c = (raw ?? {}) as Partial<ScratchConfig>;
    const coverColor = c.coverColor ?? SCRATCH_DEFAULTS.coverColor;
    const cardColor = c.cardColor ?? SCRATCH_DEFAULTS.cardColor;
    if (!HEX.test(coverColor)) throw new GameError("Màu lớp phủ phải dạng #RRGGBB.");
    if (!HEX.test(cardColor)) throw new GameError("Màu thẻ phải dạng #RRGGBB.");
    const pct = Math.round(Number(c.revealPercent ?? SCRATCH_DEFAULTS.revealPercent));
    if (!Number.isFinite(pct) || pct < 20 || pct > 90) throw new GameError("Tỉ lệ cào để lộ thưởng từ 20% đến 90%.");
    const coverText = typeof c.coverText === "string" ? c.coverText.trim().slice(0, 30) : SCRATCH_DEFAULTS.coverText;
    const backgroundUrl = typeof c.backgroundUrl === "string" && c.backgroundUrl.trim() ? c.backgroundUrl.trim().slice(0, 1024) : null;
    return { backgroundUrl, coverColor: coverColor.toUpperCase(), coverText, cardColor: cardColor.toUpperCase(), revealPercent: pct };
  },

  /** Kết quả chọn ngay khi khách lấy thẻ — lớp phủ chỉ là diễn hoạt, giải đã phát trong cùng transaction */
  async play(tx, ctx) {
    const prizes = prizesOf(ctx.campaign);
    if (prizes.length < 2) throw new GameError("Thẻ cào cần ít nhất 2 giải.");
    const prize = await pickPrize(tx, prizes, { customerId: ctx.customerId, storeId: ctx.storeId });
    return { prize, data: { prizeId: prize?.id ?? null } };
  },

  publicView(campaign) {
    const config = { ...SCRATCH_DEFAULTS, ...((campaign.config ?? {}) as Partial<ScratchConfig>) };
    // Danh sách giải để khách xem "có thể trúng gì" — không gửi tỉ lệ / số lượng
    return {
      config,
      prizes: prizesOf(campaign).map((p) => ({ id: p.id, label: p.label, imageUrl: p.imageUrl, color: p.color, kind: p.kind })),
    };
  },
};
