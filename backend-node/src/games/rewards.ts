import { randomInt } from "crypto";
import type { GamePlay, GamePrize } from "@prisma/client";
import type { Tx } from "./types.js";

/** Bỏ các ký tự dễ nhầm (0/O, 1/I/L) để thu ngân đọc / gõ mã không sai */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function makeClaimCode(len = 6) {
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

export type GrantResult = {
  userVoucherId?: number;
  pointTransactionId?: number;
  giftClaim?: { id: number; code: string; expiresAt: Date; storeId: number | null };
};

/**
 * Phát thưởng cho một lượt chơi — dùng chung cho mọi mini game, chạy trong transaction của lượt chơi.
 * - VOUCHER: thêm vào ví (UserVoucher). Picker đã loại voucher khách đang có nên không đụng ràng buộc unique.
 * - POINTS: cộng điểm + ghi PointTransaction type GAME_REWARD.
 * - PRODUCT: sinh mã nhận quà tại quầy (GiftClaim); quà hiện vật thì giữ chỗ 1 cái trong tồn chi nhánh.
 * - NONE: không phát gì.
 */
export async function grantReward(
  tx: Tx,
  play: Pick<GamePlay, "id" | "customerId" | "storeId">,
  prize: GamePrize | null,
  opts: { campaignName: string; claimDays: number },
): Promise<GrantResult> {
  if (!prize || prize.kind === "NONE") return {};

  if (prize.kind === "VOUCHER") {
    const uv = await tx.userVoucher.create({ data: { customerId: play.customerId, voucherId: prize.voucherId! } });
    return { userVoucherId: uv.id };
  }

  if (prize.kind === "POINTS") {
    const points = prize.points ?? 0;
    await tx.customer.update({ where: { id: play.customerId }, data: { points: { increment: points } } });
    const pt = await tx.pointTransaction.create({
      data: { customerId: play.customerId, delta: points, type: "GAME_REWARD", note: `Vòng quay: ${opts.campaignName}`.slice(0, 255) },
    });
    return { pointTransactionId: pt.id };
  }

  // PRODUCT — món thực đơn hoặc quà hiện vật
  let storeId = play.storeId;
  if (prize.giftItemId) {
    if (storeId == null) {
      // Không rõ chi nhánh: giữ quà ở chi nhánh còn nhiều nhất (khách vẫn nhận được ở chi nhánh khác nếu còn hàng)
      const best = await tx.giftStock.findMany({ where: { giftItemId: prize.giftItemId }, orderBy: { qty: "desc" } });
      storeId = best.find((s) => s.qty - s.reserved > 0)?.storeId ?? null;
    }
    if (storeId != null) {
      await tx.giftStock.update({
        where: { giftItemId_storeId: { giftItemId: prize.giftItemId, storeId } },
        data: { reserved: { increment: 1 } },
      });
    }
  }
  const expiresAt = new Date(Date.now() + Math.max(1, opts.claimDays) * 86_400_000);
  for (let attempt = 0; ; attempt++) {
    const code = makeClaimCode();
    const exists = await tx.giftClaim.findUnique({ where: { code }, select: { id: true } });
    if (exists && attempt < 5) continue;
    const claim = await tx.giftClaim.create({
      data: {
        code, customerId: play.customerId, playId: play.id, productId: prize.productId, giftItemId: prize.giftItemId,
        storeId, expiresAt,
      },
    });
    return { giftClaim: { id: claim.id, code: claim.code, expiresAt, storeId } };
  }
}
