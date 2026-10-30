import { randomInt } from "crypto";
import { Prisma, type GamePrize } from "@prisma/client";
import { bizDayStart, bizToday } from "../lib/bizTime.js";
import type { Tx } from "./types.js";

/** Tỉ lệ % (tối đa 2 chữ số thập phân) → trọng số nguyên cho randomInt */
const weightOf = (p: GamePrize) => Math.max(0, Math.round(p.weight * 100));

/** Chọn ngẫu nhiên theo trọng số bằng crypto.randomInt (không đoán trước được như Math.random) */
export function weightedPick<T>(items: T[], weight: (x: T) => number): T | null {
  const total = items.reduce((s, x) => s + weight(x), 0);
  if (total <= 0) return null;
  let r = randomInt(total);
  for (const x of items) {
    r -= weight(x);
    if (r < 0) return x;
  }
  return null;
}

/**
 * Kiểm tra lại 1 giải ngay trong transaction, đọc có khoá (FOR UPDATE / LOCK IN SHARE MODE) để thấy số mới nhất
 * — 2 người quay cùng lúc thì người sau chờ người trước xong rồi mới đếm.
 */
async function stillAvailable(tx: Tx, prize: GamePrize, ctx: { customerId: number; storeId: number | null }): Promise<boolean> {
  if (prize.kind === "NONE") return true;
  const [row] = await tx.$queryRaw<{ wonCount: number; quantity: number | null; dailyLimit: number | null; isActive: number }[]>(
    Prisma.sql`SELECT Won_Count AS wonCount, Quantity AS quantity, Daily_Limit AS dailyLimit, Is_Active AS isActive
               FROM Game_Prizes WHERE Prize_ID = ${prize.id} FOR UPDATE`,
  );
  if (!row || !row.isActive) return false;
  if (row.quantity != null && Number(row.wonCount) >= Number(row.quantity)) return false;

  if (row.dailyLimit != null) {
    const [d] = await tx.$queryRaw<{ c: bigint }[]>(
      Prisma.sql`SELECT COUNT(*) AS c FROM Game_Plays WHERE Prize_ID = ${prize.id} AND Played_At >= ${bizDayStart(bizToday())} LOCK IN SHARE MODE`,
    );
    if (Number(d?.c ?? 0) >= Number(row.dailyLimit)) return false;
  }

  if (prize.kind === "VOUCHER") {
    if (!prize.voucherId) return false;
    const v = await tx.voucher.findUnique({ where: { id: prize.voucherId } });
    const now = new Date();
    if (!v || !v.isActive || v.endDate < now || (v.quantity !== -1 && v.usedCount >= v.quantity)) return false;
    // UserVoucher unique (khách, voucher): khách đã có voucher này (dù đã dùng) → không phát trùng, chọn giải khác
    const owned = await tx.userVoucher.findUnique({ where: { customerId_voucherId: { customerId: ctx.customerId, voucherId: v.id } } });
    if (owned) return false;
  }

  if (prize.kind === "POINTS" && !(prize.points && prize.points > 0)) return false;

  if (prize.kind === "PRODUCT") {
    if (!prize.productId && !prize.giftItemId) return false;
    if (prize.giftItemId) {
      // Quà hiện vật: phải còn tồn (qty − reserved) ở chi nhánh khách chơi; không rõ chi nhánh thì xét cả chuỗi
      const [s] = await tx.$queryRaw<{ avail: bigint | number | null }[]>(
        ctx.storeId != null
          ? Prisma.sql`SELECT SUM(Qty - Reserved) AS avail FROM Gift_Stocks WHERE Gift_Item_ID = ${prize.giftItemId} AND Store_ID = ${ctx.storeId} FOR UPDATE`
          : Prisma.sql`SELECT SUM(Qty - Reserved) AS avail FROM Gift_Stocks WHERE Gift_Item_ID = ${prize.giftItemId} FOR UPDATE`,
      );
      if (Number(s?.avail ?? 0) <= 0) return false;
    }
  }
  return true;
}

/**
 * Chọn giải theo trọng số trong các giải còn phát được. Giải bị chọn mà đã hết (số lượng / giới hạn ngày / tồn quà /
 * khách đã có voucher) → loại khỏi danh sách rồi chọn lại theo trọng số còn lại. Hết sạch → giải NONE của chiến dịch
 * (hoặc null nếu chiến dịch không có ô NONE). Giải được chọn đã được cộng `wonCount` trong transaction.
 */
export async function pickPrize(
  tx: Tx,
  prizes: GamePrize[],
  ctx: { customerId: number; storeId: number | null },
): Promise<GamePrize | null> {
  // Khoá mọi giải của chiến dịch theo thứ tự id trước khi chọn: các lượt cùng chiến dịch xếp hàng lần lượt,
  // không bao giờ khoá chéo (deadlock) dù giải bị chọn lại theo thứ tự ngẫu nhiên
  const campaignId = prizes[0]?.campaignId;
  if (campaignId != null) {
    await tx.$queryRaw(Prisma.sql`SELECT Prize_ID FROM Game_Prizes WHERE Campaign_ID = ${campaignId} ORDER BY Prize_ID FOR UPDATE`);
  }
  let pool = prizes.filter((p) => p.isActive && weightOf(p) > 0);
  while (pool.length) {
    const chosen = weightedPick(pool, weightOf)!;
    if (await stillAvailable(tx, chosen, ctx)) {
      if (chosen.kind !== "NONE") {
        await tx.gamePrize.update({ where: { id: chosen.id }, data: { wonCount: { increment: 1 } } });
      }
      return chosen;
    }
    pool = pool.filter((p) => p.id !== chosen.id);
  }
  return prizes.find((p) => p.isActive && p.kind === "NONE") ?? null;
}
