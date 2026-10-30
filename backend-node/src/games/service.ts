import type { GameCampaign, PrismaClient } from "@prisma/client";
import { bizDayStart, bizToday } from "../lib/bizTime.js";
import { GAME_HANDLERS, READY_GAMES } from "./registry.js";
import { grantReward } from "./rewards.js";
import type { Tx } from "./types.js";

/** Lỗi nghiệp vụ trả về cho khách / nhân viên (400) */
export class GameError extends Error {}

export const isRunning = (c: Pick<GameCampaign, "isActive" | "startAt" | "endAt" | "gameType">, now = new Date()) =>
  c.isActive && c.startAt <= now && c.endAt >= now && READY_GAMES.includes(c.gameType);

export const storeAllowed = (c: { allStores: boolean; stores: { storeId: number }[] }, storeId: number | null) =>
  c.allStores || storeId == null || c.stores.some((s) => s.storeId === storeId);

/* ═══════════════ Lượt chơi ═══════════════ */

/**
 * Đơn chuyển Paid (gọi trong transaction thanh toán, xem lib/points.ts settlePaidPoints):
 * tặng 1 lượt cho mỗi chiến dịch đang chạy tại chi nhánh của đơn mà đơn đạt giá trị tối thiểu.
 */
export async function issueOrderTickets(tx: Tx, orderId: number) {
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, customerId: true, storeId: true, totalAmount: true } });
  if (!order?.customerId) return;
  const now = new Date();
  const campaigns = await tx.gameCampaign.findMany({
    where: {
      isActive: true, startAt: { lte: now }, endAt: { gte: now }, gameType: { in: READY_GAMES },
      minOrderValue: { lte: order.totalAmount },
      OR: [{ allStores: true }, { stores: { some: { storeId: order.storeId } } }],
    },
    select: { id: true, endAt: true },
  });
  for (const c of campaigns) {
    const exists = await tx.gameTicket.findFirst({ where: { campaignId: c.id, orderId }, select: { id: true } });
    if (exists) continue;
    await tx.gameTicket.create({ data: { customerId: order.customerId, campaignId: c.id, source: "ORDER", orderId, expiresAt: c.endAt } });
  }
}

/** Đơn bị hủy / hoàn tiền toàn bộ → thu hồi lượt chưa dùng của đơn đó */
export async function revokeOrderTickets(tx: Tx, orderId: number) {
  await tx.gameTicket.updateMany({ where: { orderId, status: "UNUSED" }, data: { status: "REVOKED" } });
}

/** Khách đổi điểm lấy 1 lượt (nếu chiến dịch cho phép) */
export async function exchangePointsForTicket(prisma: PrismaClient, campaignId: number, customerId: number) {
  return prisma.$transaction(async (tx) => {
    const c = await tx.gameCampaign.findUnique({ where: { id: campaignId } });
    if (!c || !isRunning(c)) throw new GameError("Chiến dịch không còn diễn ra.");
    if (!c.allowPointExchange || c.pointsPerTicket <= 0) throw new GameError("Chiến dịch này không cho đổi điểm lấy lượt.");
    const spent = await tx.customer.updateMany({
      where: { id: customerId, points: { gte: c.pointsPerTicket } },
      data: { points: { decrement: c.pointsPerTicket } },
    });
    if (!spent.count) throw new GameError(`Cần ${c.pointsPerTicket.toLocaleString("vi-VN")} điểm để đổi 1 lượt.`);
    await tx.pointTransaction.create({
      data: { customerId, delta: -c.pointsPerTicket, type: "GAME_EXCHANGE", note: `Đổi lượt chơi: ${c.name}`.slice(0, 255) },
    });
    return tx.gameTicket.create({ data: { customerId, campaignId, source: "POINTS", expiresAt: c.endAt } });
  });
}

/** Số lượt còn dùng được + số lượt đã chơi hôm nay */
export async function ticketSummary(prisma: PrismaClient, campaign: Pick<GameCampaign, "id" | "maxPlaysPerDay">, customerId: number) {
  const [tickets, playedToday] = await Promise.all([
    prisma.gameTicket.count({ where: { campaignId: campaign.id, customerId, status: "UNUSED", expiresAt: { gt: new Date() } } }),
    prisma.gamePlay.count({ where: { campaignId: campaign.id, customerId, playedAt: { gte: bizDayStart(bizToday()) } } }),
  ]);
  return { tickets, playedToday, leftToday: Math.max(0, Math.min(tickets, campaign.maxPlaysPerDay - playedToday)) };
}

/* ═══════════════ Chơi một lượt ═══════════════ */

/**
 * Luồng chung cho mọi mini game: kiểm tra chiến dịch / chi nhánh / lượt → transaction
 * (khoá vé → handler chọn kết quả → lưu GamePlay → phát thưởng).
 */
export async function playCampaign(prisma: PrismaClient, args: { campaignId: number; customerId: number; storeId: number | null }) {
  const campaign = await prisma.gameCampaign.findUnique({ where: { id: args.campaignId }, include: { prizes: true, stores: true } });
  if (!campaign) throw new GameError("Không tìm thấy chiến dịch.");
  if (!isRunning(campaign)) throw new GameError("Chiến dịch chưa bắt đầu hoặc đã kết thúc.");
  if (!storeAllowed(campaign, args.storeId)) throw new GameError("Chiến dịch không áp dụng tại chi nhánh này.");

  const sum = await ticketSummary(prisma, campaign, args.customerId);
  if (sum.playedToday >= campaign.maxPlaysPerDay) throw new GameError(`Hôm nay bạn đã chơi đủ ${campaign.maxPlaysPerDay} lượt, quay lại vào ngày mai nhé.`);
  if (!sum.tickets) throw new GameError("Bạn đã hết lượt chơi.");

  const ticket = await prisma.gameTicket.findFirst({
    where: { campaignId: campaign.id, customerId: args.customerId, status: "UNUSED", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "asc" },
  });
  if (!ticket) throw new GameError("Bạn đã hết lượt chơi.");
  const orderStore = ticket.orderId
    ? (await prisma.order.findUnique({ where: { id: ticket.orderId }, select: { storeId: true } }))?.storeId ?? null
    : null;
  const storeId = args.storeId ?? orderStore;
  const handler = GAME_HANDLERS[campaign.gameType];

  return prisma.$transaction(
    async (tx) => {
      const now = new Date();
      const lock = await tx.gameTicket.updateMany({ where: { id: ticket.id, status: "UNUSED" }, data: { status: "USED", usedAt: now } });
      if (!lock.count) throw new GameError("Lượt này vừa được dùng, vui lòng thử lại.");

      const { prize, data } = await handler.play(tx, { campaign, customerId: args.customerId, storeId });
      const play = await tx.gamePlay.create({
        data: {
          ticketId: ticket.id, customerId: args.customerId, campaignId: campaign.id, prizeId: prize?.id ?? null, storeId, playedAt: now,
          data: data as object,
          prizeLabel: prize?.label ?? "Chúc bạn may mắn lần sau",
          prizeKind: prize?.kind ?? "NONE",
          prizeImage: prize?.imageUrl ?? null,
          prizeWeight: prize?.weight ?? 0,
        },
      });
      const granted = await grantReward(tx, play, prize, { campaignName: campaign.name, claimDays: campaign.claimDays });
      if (granted.userVoucherId || granted.pointTransactionId) {
        await tx.gamePlay.update({
          where: { id: play.id },
          data: { userVoucherId: granted.userVoucherId ?? null, pointTransactionId: granted.pointTransactionId ?? null },
        });
      }
      const voucher = prize?.kind === "VOUCHER" && prize.voucherId
        ? await tx.voucher.findUnique({ where: { id: prize.voucherId }, select: { code: true, discountValue: true, minBillValue: true, endDate: true } })
        : null;
      const store = granted.giftClaim?.storeId
        ? await tx.store.findUnique({ where: { id: granted.giftClaim.storeId }, select: { id: true, name: true, address: true } })
        : null;
      return {
        playId: play.id,
        data,
        prize: {
          id: prize?.id ?? null,
          kind: play.prizeKind,
          label: play.prizeLabel,
          imageUrl: play.prizeImage,
          points: prize?.kind === "POINTS" ? prize.points : null,
          voucher,
        },
        giftClaim: granted.giftClaim ? { ...granted.giftClaim, store } : null,
      };
    },
    { timeout: 15_000 },
  );
}

/* ═══════════════ Nhận quà tại quầy ═══════════════ */

export const claimInclude = {
  customer: { select: { id: true, fullName: true, phone: true } },
  product: { select: { id: true, name: true, imageUrl: true } },
  giftItem: { select: { id: true, name: true, imageUrl: true } },
  store: { select: { id: true, name: true } },
  play: { select: { campaign: { select: { id: true, name: true } } } },
} as const;

/** Thu ngân bấm "Đã trao": trừ tồn quà ở chi nhánh trao (nhả giữ chỗ ở chi nhánh cũ nếu khác) */
export async function deliverClaim(prisma: PrismaClient, code: string, staff: { id: number }, storeId: number) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.giftClaim.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!claim) throw new GameError("Không tìm thấy mã nhận quà.");
    if (claim.status === "DELIVERED") throw new GameError("Quà này đã được trao.");
    if (claim.status !== "WAITING") throw new GameError("Mã nhận quà đã hết hạn hoặc bị hủy.");
    if (claim.expiresAt < new Date()) throw new GameError("Mã nhận quà đã quá hạn.");

    if (claim.giftItemId) {
      const sameStore = claim.storeId === storeId;
      const stock = await tx.giftStock.findUnique({ where: { giftItemId_storeId: { giftItemId: claim.giftItemId, storeId } } });
      const avail = stock ? stock.qty - (sameStore ? 0 : stock.reserved) : 0;
      if (!stock || avail <= 0) throw new GameError("Chi nhánh này đã hết quà — hướng dẫn khách nhận ở chi nhánh giữ quà.");
      await tx.giftStock.update({
        where: { giftItemId_storeId: { giftItemId: claim.giftItemId, storeId } },
        data: { qty: { decrement: 1 }, ...(sameStore ? { reserved: { decrement: 1 } } : {}) },
      });
      if (!sameStore && claim.storeId != null) {
        await tx.giftStock.updateMany({
          where: { giftItemId: claim.giftItemId, storeId: claim.storeId, reserved: { gt: 0 } },
          data: { reserved: { decrement: 1 } },
        });
      }
    }
    const done = await tx.giftClaim.updateMany({
      where: { id: claim.id, status: "WAITING" },
      data: { status: "DELIVERED", deliveredById: staff.id, deliveredAt: new Date(), deliveredStoreId: storeId },
    });
    if (!done.count) throw new GameError("Quà vừa được trao ở quầy khác.");
    return tx.giftClaim.findUniqueOrThrow({ where: { id: claim.id }, include: claimInclude });
  });
}

/** Quà quá hạn chưa nhận → EXPIRED, trả lại số lượng giải và giữ chỗ tồn */
export async function expireClaims(prisma: PrismaClient) {
  const due = await prisma.giftClaim.findMany({
    where: { status: "WAITING", expiresAt: { lt: new Date() } },
    select: { id: true, giftItemId: true, storeId: true, play: { select: { prizeId: true } } },
    take: 200,
  });
  for (const c of due) {
    await prisma.$transaction(async (tx) => {
      const r = await tx.giftClaim.updateMany({ where: { id: c.id, status: "WAITING" }, data: { status: "EXPIRED" } });
      if (!r.count) return;
      if (c.play.prizeId) {
        await tx.gamePrize.updateMany({ where: { id: c.play.prizeId, wonCount: { gt: 0 } }, data: { wonCount: { decrement: 1 } } });
      }
      if (c.giftItemId && c.storeId != null) {
        await tx.giftStock.updateMany({ where: { giftItemId: c.giftItemId, storeId: c.storeId, reserved: { gt: 0 } }, data: { reserved: { decrement: 1 } } });
      }
    });
  }
  return due.length;
}

export function startGiftClaimExpiryJob(prisma: PrismaClient) {
  const run = () => void expireClaims(prisma).catch((e) => console.error("[games] expireClaims", e));
  setTimeout(run, 30_000);
  setInterval(run, 10 * 60_000);
}
