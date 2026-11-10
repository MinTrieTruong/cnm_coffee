import { GameError } from "../errors.js";
import { pickPrize } from "../picker.js";
import type { CampaignWithPrizes, GameHandler } from "../types.js";

/** Giải đang dùng, theo thứ tự trong bảng giải */
export const activePrizes = (c: CampaignWithPrizes) =>
  c.prizes.filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

/**
 * Phần chơi + dữ liệu công khai chung cho game "chọn 1 trong N" (lì xì, hộp quà bí mật):
 * món khách chọn chỉ là diễn hoạt — giải chọn theo tỉ lệ ở máy chủ khi khách mở.
 */
export function pickOneHandler<C extends object>(label: string, defaults: C, validateConfig: GameHandler["validateConfig"]): GameHandler {
  return {
    validateConfig,
    async play(tx, ctx) {
      const prizes = activePrizes(ctx.campaign);
      if (prizes.length < 2) throw new GameError(`${label} cần ít nhất 2 giải.`);
      const prize = await pickPrize(tx, prizes, { customerId: ctx.customerId, storeId: ctx.storeId });
      return { prize, data: { prizeId: prize?.id ?? null } };
    },
    publicView(campaign) {
      return {
        config: { ...defaults, ...((campaign.config ?? {}) as Partial<C>) },
        // Danh sách giải để khách xem "có thể trúng gì" — không gửi tỉ lệ / số lượng
        prizes: activePrizes(campaign).map((p) => ({ id: p.id, label: p.label, imageUrl: p.imageUrl, color: p.color, kind: p.kind })),
      };
    },
  };
}
