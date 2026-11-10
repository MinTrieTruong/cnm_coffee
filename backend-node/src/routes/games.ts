import { Router, type Request } from "express";
import type { GamePrizeKind, GameType, Prisma, PrismaClient } from "@prisma/client";
import { audit } from "../lib/audit.js";
import { bizDayEnd, bizDayStart } from "../lib/bizTime.js";
import { reqStoreId, mustStoreId } from "../lib/storeScope.js";
import { customerAuth, optionalCustomerAuth } from "../middleware/customer.js";
import { attachStaff, isOwner, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { GAME_HANDLERS, GAME_LABELS, READY_GAMES } from "../games/registry.js";
import {
  GameError, claimInclude, deliverClaim, exchangePointsForTicket, isRunning, playCampaign, storeAllowed, ticketSummary,
} from "../games/service.js";

const GAME_TYPES = Object.keys(GAME_LABELS) as GameType[];
const PRIZE_KINDS: GamePrizeKind[] = ["PRODUCT", "VOUCHER", "POINTS", "NONE"];
const KIND_LABEL: Record<GamePrizeKind, string> = { PRODUCT: "Sản phẩm", VOUCHER: "Voucher", POINTS: "Điểm", NONE: "Không trúng" };

const customerOf = (req: Request) => (req as Request & { customerId?: number }).customerId;
const idParam = (req: Request) => Number(req.params.id);

type PrizeInput = {
  id?: number;
  kind: GamePrizeKind;
  productId?: number | null;
  giftItemId?: number | null;
  voucherId?: number | null;
  points?: number | null;
  label?: string;
  imageUrl?: string | null;
  weight: number;
  quantity?: number | null;
  dailyLimit?: number | null;
  color?: string | null;
};

type CampaignInput = {
  gameType?: GameType;
  name?: string;
  description?: string | null;
  startAt?: string;
  endAt?: string;
  isActive?: boolean;
  allStores?: boolean;
  storeIds?: number[];
  config?: unknown;
  minOrderValue?: number;
  maxPlaysPerDay?: number;
  allowPointExchange?: boolean;
  pointsPerTicket?: number;
  claimDays?: number;
  prizes?: PrizeInput[];
};

const intOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export function gamesRouter(prisma: PrismaClient) {
  const r = Router();
  const staffAuth = attachStaff(prisma);
  /** Chủ chuỗi + quản lý chi nhánh */
  const manager = [staffAuth, requireRoles("Admin")];
  const cashier = [staffAuth, requireRoles("Cashier", "Admin"), requireStore];

  const campaignInclude = {
    stores: { include: { store: { select: { id: true, name: true } } } },
    prizes: {
      orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
      include: {
        product: { select: { id: true, name: true, imageUrl: true, sellPrice: true } },
        giftItem: { select: { id: true, name: true, imageUrl: true, value: true } },
        voucher: { select: { id: true, code: true, description: true, discountValue: true, isActive: true, endDate: true } },
      },
    },
  } satisfies Prisma.GameCampaignInclude;

  /* ═══════════ Phạm vi quyền ═══════════ */

  /** Chiến dịch quản lý chi nhánh được xem: cả chuỗi hoặc có chi nhánh mình */
  function visibleWhere(req: Request): Prisma.GameCampaignWhereInput {
    const sid = reqStoreId(req);
    const staff = (req as StaffRequest).staffRow!;
    if (isOwner(staff.role) && sid == null) return {};
    return { OR: [{ allStores: true }, { stores: { some: { storeId: sid! } } }] };
  }

  /** Sửa được: Chủ chuỗi sửa mọi chiến dịch; quản lý chỉ sửa chiến dịch riêng của chi nhánh mình */
  function canEdit(req: Request, c: { allStores: boolean; stores: { storeId: number }[] }) {
    const staff = (req as StaffRequest).staffRow!;
    if (isOwner(staff.role)) return true;
    return !c.allStores && c.stores.length === 1 && c.stores[0].storeId === staff.storeId;
  }

  /* ═══════════ Kiểm tra dữ liệu chiến dịch ═══════════ */

  async function normalizePrizes(list: PrizeInput[]) {
    const out: (PrizeInput & { label: string; sortOrder: number })[] = [];
    for (const [i, p] of list.entries()) {
      if (!PRIZE_KINDS.includes(p.kind)) throw new GameError("Loại phần thưởng không hợp lệ.");
      const weight = Number(p.weight);
      if (!Number.isFinite(weight) || weight < 0 || weight > 100) throw new GameError(`Ô ${i + 1}: tỉ lệ phải từ 0 đến 100%.`);
      const quantity = intOrNull(p.quantity);
      const dailyLimit = intOrNull(p.dailyLimit);
      if (quantity != null && (!Number.isInteger(quantity) || quantity < 0)) throw new GameError(`Ô ${i + 1}: số lượng không hợp lệ.`);
      if (dailyLimit != null && (!Number.isInteger(dailyLimit) || dailyLimit < 1)) throw new GameError(`Ô ${i + 1}: giới hạn mỗi ngày không hợp lệ.`);
      let label = (p.label ?? "").trim();
      const base = { productId: null as number | null, giftItemId: null as number | null, voucherId: null as number | null, points: null as number | null };

      if (p.kind === "PRODUCT") {
        if (!!p.productId === !!p.giftItemId) throw new GameError(`Ô ${i + 1}: chọn một món thực đơn hoặc một quà hiện vật.`);
        if (p.productId && !(await prisma.product.findUnique({ where: { id: p.productId }, select: { id: true } }))) throw new GameError(`Ô ${i + 1}: món không tồn tại.`);
        if (p.giftItemId && !(await prisma.giftItem.findUnique({ where: { id: p.giftItemId }, select: { id: true } }))) throw new GameError(`Ô ${i + 1}: quà không tồn tại.`);
        if (quantity == null) throw new GameError(`Ô ${i + 1}: nhập số lượng cho phần thưởng sản phẩm.`);
        base.productId = p.productId ?? null;
        base.giftItemId = p.giftItemId ?? null;
      } else if (p.kind === "VOUCHER") {
        const v = p.voucherId ? await prisma.voucher.findUnique({ where: { id: p.voucherId } }) : null;
        if (!v) throw new GameError(`Ô ${i + 1}: chọn voucher.`);
        if (quantity == null) throw new GameError(`Ô ${i + 1}: nhập số lượng cho phần thưởng voucher.`);
        base.voucherId = v.id;
        // Nội dung ô voucher lấy từ voucher (chỉ đọc)
        label = v.description?.trim() || `Voucher ${v.code} giảm ${v.discountValue.toLocaleString("vi-VN")}đ`;
      } else if (p.kind === "POINTS") {
        const pts = Number(p.points);
        if (!Number.isInteger(pts) || pts <= 0) throw new GameError(`Ô ${i + 1}: số điểm phải là số nguyên dương.`);
        base.points = pts;
        if (!label) label = `${pts.toLocaleString("vi-VN")} điểm`;
      } else if (!label) {
        label = "Chúc bạn may mắn lần sau";
      }
      if (!label) throw new GameError(`Ô ${i + 1}: nhập nội dung phần thưởng.`);
      out.push({
        ...p, ...base, label: label.slice(0, 255), weight: Math.round(weight * 100) / 100, quantity, dailyLimit,
        imageUrl: p.imageUrl?.trim() || null, color: p.color?.trim() || null, sortOrder: i,
      });
    }
    if (out.length < 2) throw new GameError("Cần ít nhất 2 ô phần thưởng.");
    const total = out.reduce((s, p) => s + p.weight, 0);
    if (Math.abs(total - 100) > 0.01) throw new GameError(`Tổng tỉ lệ đang là ${total.toLocaleString("vi-VN")}% — phải bằng đúng 100%.`);
    return out;
  }

  function parseGeneral(body: CampaignInput, gameType: GameType) {
    const name = body.name?.trim();
    if (!name) throw new GameError("Nhập tên chiến dịch.");
    const startAt = new Date(body.startAt ?? "");
    const endAt = new Date(body.endAt ?? "");
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) throw new GameError("Thời gian không hợp lệ.");
    if (endAt <= startAt) throw new GameError("Thời gian kết thúc phải sau thời gian bắt đầu.");
    const num = (v: unknown, def: number, label: string, min = 0) => {
      const n = v === undefined || v === null || v === "" ? def : Number(v);
      if (!Number.isInteger(n) || n < min) throw new GameError(`${label} không hợp lệ.`);
      return n;
    };
    const allowPointExchange = !!body.allowPointExchange;
    const pointsPerTicket = num(body.pointsPerTicket, 0, "Số điểm mỗi lượt");
    if (allowPointExchange && pointsPerTicket <= 0) throw new GameError("Nhập số điểm đổi 1 lượt.");
    return {
      name: name.slice(0, 150),
      description: body.description?.trim().slice(0, 1000) || null,
      startAt, endAt,
      isActive: !!body.isActive,
      config: GAME_HANDLERS[gameType].validateConfig(body.config) as Prisma.InputJsonValue,
      minOrderValue: num(body.minOrderValue, 0, "Giá trị đơn tối thiểu"),
      maxPlaysPerDay: num(body.maxPlaysPerDay, 3, "Số lượt tối đa mỗi ngày", 1),
      allowPointExchange, pointsPerTicket,
      claimDays: num(body.claimDays, 7, "Số ngày nhận quà", 1),
    };
  }

  /** Chủ chuỗi chọn phạm vi; quản lý chi nhánh luôn chỉ chi nhánh mình */
  function scopeOf(req: Request, body: CampaignInput) {
    const staff = (req as StaffRequest).staffRow!;
    if (!isOwner(staff.role)) return { allStores: false, storeIds: [staff.storeId!] };
    const storeIds = [...new Set((body.storeIds ?? []).map(Number).filter(Number.isInteger))];
    if (body.allStores === false && !storeIds.length) throw new GameError("Chọn ít nhất 1 chi nhánh áp dụng.");
    return { allStores: body.allStores !== false, storeIds: body.allStores === false ? storeIds : [] };
  }

  const handle = (fn: (req: Request, res: import("express").Response) => Promise<unknown>) =>
    async (req: Request, res: import("express").Response) => {
      try {
        await fn(req, res);
      } catch (e) {
        if (e instanceof GameError) {
          return res.status(400).json({ error: e.message });
        }
        throw e;
      }
    };

  /* ═══════════════════════ QUẢN TRỊ ═══════════════════════ */

  /** Món, voucher, quà, chi nhánh để chọn khi thêm giải */
  r.get("/admin/games/options", ...manager, async (_req, res) => {
    const now = new Date();
    const [products, vouchers, giftItems, stores] = await Promise.all([
      prisma.product.findMany({ where: { isActive: true }, select: { id: true, name: true, imageUrl: true, sellPrice: true }, orderBy: { name: "asc" } }),
      prisma.voucher.findMany({
        where: { isActive: true, endDate: { gte: now } },
        select: { id: true, code: true, description: true, discountValue: true, minBillValue: true, endDate: true, quantity: true, usedCount: true, voucherType: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.giftItem.findMany({ where: { isActive: true }, include: { stocks: true }, orderBy: { name: "asc" } }),
      prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true, address: true }, orderBy: { id: "asc" } }),
    ]);
    res.json({ products, vouchers, giftItems, stores, readyGames: READY_GAMES, gameLabels: GAME_LABELS });
  });

  r.get("/admin/games/campaigns", ...manager, async (req, res) => {
    const type = req.query.type as GameType | undefined;
    const rows = await prisma.gameCampaign.findMany({
      where: { ...visibleWhere(req), ...(type && GAME_TYPES.includes(type) ? { gameType: type } : {}) },
      include: { stores: { include: { store: { select: { id: true, name: true } } } }, _count: { select: { plays: true } } },
      orderBy: { createdAt: "desc" },
    });
    const won = await prisma.gamePlay.groupBy({
      by: ["campaignId"],
      where: { campaignId: { in: rows.map((c) => c.id) }, prizeKind: { not: "NONE" } },
      _count: true,
    });
    const wonOf = new Map(won.map((w) => [w.campaignId, w._count]));
    res.json(rows.map((c) => ({ ...c, playCount: c._count.plays, wonCount: wonOf.get(c.id) ?? 0, editable: canEdit(req, c), running: isRunning(c) })));
  });

  r.get("/admin/games/campaigns/:id", ...manager, async (req, res) => {
    const c = await prisma.gameCampaign.findFirst({ where: { id: idParam(req), ...visibleWhere(req) }, include: campaignInclude });
    if (!c) return res.status(404).json({ error: "Không tìm thấy chiến dịch." });
    const playCount = await prisma.gamePlay.count({ where: { campaignId: c.id } });
    res.json({ ...c, prizes: c.prizes.filter((p) => p.isActive), playCount, editable: canEdit(req, c) });
  });

  r.post("/admin/games/campaigns", ...manager, handle(async (req, res) => {
    const body = req.body as CampaignInput;
    const gameType = body.gameType ?? "WHEEL";
    if (!READY_GAMES.includes(gameType)) throw new GameError(`${GAME_LABELS[gameType] ?? "Game này"} sắp ra mắt.`);
    const general = parseGeneral(body, gameType);
    const scope = scopeOf(req, body);
    const prizes = await normalizePrizes(body.prizes ?? []);
    const staff = (req as StaffRequest).staffRow!;
    const c = await prisma.gameCampaign.create({
      data: {
        ...general, gameType, allStores: scope.allStores, createdById: staff.id,
        stores: { create: scope.storeIds.map((storeId) => ({ storeId })) },
        prizes: {
          create: prizes.map((p) => ({
            kind: p.kind, productId: p.productId, giftItemId: p.giftItemId, voucherId: p.voucherId, points: p.points, label: p.label,
            imageUrl: p.imageUrl, weight: p.weight, quantity: p.quantity, dailyLimit: p.dailyLimit, sortOrder: p.sortOrder, color: p.color,
          })),
        },
      },
    });
    audit(staff.id, "GAME_CAMPAIGN_CREATE", `Mini game #${c.id}`, `${GAME_LABELS[gameType]}: ${c.name} — ${prizes.length} ô, ${c.isActive ? "Bật" : "Tắt"}`);
    res.status(201).json(c);
  }));

  r.put("/admin/games/campaigns/:id", ...manager, handle(async (req, res) => {
    const id = idParam(req);
    const old = await prisma.gameCampaign.findUnique({ where: { id }, include: { stores: true, prizes: true } });
    if (!old) return res.status(404).json({ error: "Không tìm thấy chiến dịch." });
    if (!canEdit(req, old)) return res.status(403).json({ error: "Chiến dịch cả chuỗi do Chủ chuỗi quản lý." });
    const body = req.body as CampaignInput;
    const general = parseGeneral(body, old.gameType);
    const scope = scopeOf(req, body);
    const prizes = await normalizePrizes(body.prizes ?? []);
    const staff = (req as StaffRequest).staffRow!;

    const changes: string[] = [];
    if (old.isActive !== general.isActive) changes.push(`Trạng thái: ${old.isActive ? "Bật" : "Tắt"} → ${general.isActive ? "Bật" : "Tắt"}`);

    await prisma.$transaction(async (tx) => {
      await tx.gameCampaign.update({
        where: { id },
        data: { ...general, allStores: scope.allStores, stores: { deleteMany: {}, create: scope.storeIds.map((storeId) => ({ storeId })) } },
      });
      // Đổi hạn chiến dịch → lượt chưa dùng hết hạn theo
      if (+old.endAt !== +general.endAt) await tx.gameTicket.updateMany({ where: { campaignId: id, status: "UNUSED" }, data: { expiresAt: general.endAt } });

      const keep = new Set<number>();
      for (const p of prizes) {
        const data = {
          kind: p.kind, productId: p.productId, giftItemId: p.giftItemId, voucherId: p.voucherId, points: p.points, label: p.label,
          imageUrl: p.imageUrl, weight: p.weight, quantity: p.quantity, dailyLimit: p.dailyLimit, sortOrder: p.sortOrder, color: p.color, isActive: true,
        };
        const prev = p.id ? old.prizes.find((x) => x.id === p.id) : undefined;
        if (prev) {
          if (p.quantity != null && p.quantity < prev.wonCount) throw new GameError(`"${p.label}": số lượng không được nhỏ hơn số đã trúng (${prev.wonCount}).`);
          if (prev.weight !== p.weight) changes.push(`${p.label}: tỉ lệ ${prev.weight}% → ${p.weight}%`);
          if (prev.quantity !== p.quantity) changes.push(`${p.label}: số lượng ${prev.quantity ?? "∞"} → ${p.quantity ?? "∞"}`);
          await tx.gamePrize.update({ where: { id: prev.id }, data });
          keep.add(prev.id);
        } else {
          await tx.gamePrize.create({ data: { ...data, campaignId: id } });
          changes.push(`Thêm ô "${p.label}" (${p.weight}%)`);
        }
      }
      for (const prev of old.prizes.filter((x) => x.isActive && !keep.has(x.id))) {
        const used = await tx.gamePlay.count({ where: { prizeId: prev.id } });
        // Đã có người trúng → giữ lại cho lịch sử, chỉ ẩn khỏi vòng
        if (used) await tx.gamePrize.update({ where: { id: prev.id }, data: { isActive: false } });
        else await tx.gamePrize.delete({ where: { id: prev.id } });
        changes.push(`Xóa ô "${prev.label}"`);
      }
    });
    audit(staff.id, "GAME_CAMPAIGN_UPDATE", `Mini game #${id}`, (changes.join("; ") || `Cập nhật ${general.name}`).slice(0, 500));
    res.json({ ok: true });
  }));

  r.delete("/admin/games/campaigns/:id", ...manager, handle(async (req, res) => {
    const id = idParam(req);
    const c = await prisma.gameCampaign.findUnique({ where: { id }, include: { stores: true } });
    if (!c) return res.status(404).json({ error: "Không tìm thấy chiến dịch." });
    if (!canEdit(req, c)) return res.status(403).json({ error: "Chiến dịch cả chuỗi do Chủ chuỗi quản lý." });
    if (await prisma.gamePlay.count({ where: { campaignId: id } })) {
      throw new GameError("Chiến dịch đã có lượt quay — chỉ có thể Tắt, không xóa được.");
    }
    await prisma.gameCampaign.delete({ where: { id } });
    audit((req as StaffRequest).staffRow!.id, "GAME_CAMPAIGN_DELETE", `Mini game #${id}`, c.name);
    res.json({ ok: true });
  }));

  /** Quản lý tặng lượt cho khách (theo SĐT) */
  r.post("/admin/games/campaigns/:id/tickets", ...manager, handle(async (req, res) => {
    const { phone, count } = req.body as { phone?: string; count?: number };
    const c = await prisma.gameCampaign.findFirst({ where: { id: idParam(req), ...visibleWhere(req) } });
    if (!c) return res.status(404).json({ error: "Không tìm thấy chiến dịch." });
    const n = Number(count ?? 1);
    if (!Number.isInteger(n) || n < 1 || n > 20) throw new GameError("Số lượt tặng từ 1 đến 20.");
    const cust = phone ? await prisma.customer.findUnique({ where: { phone: phone.trim() } }) : null;
    if (!cust) throw new GameError("Không tìm thấy khách với SĐT này.");
    await prisma.gameTicket.createMany({ data: Array.from({ length: n }, () => ({ customerId: cust.id, campaignId: c.id, source: "ADMIN", expiresAt: c.endAt })) });
    audit((req as StaffRequest).staffRow!.id, "GAME_TICKET_GRANT", `Mini game #${c.id}`, `Tặng ${n} lượt cho ${cust.fullName} (${cust.phone})`);
    res.json({ ok: true });
  }));

  /** Danh sách trúng thưởng (lọc theo chiến dịch / chi nhánh / loại / khoảng ngày) */
  r.get("/admin/games/winners", ...manager, async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const sid = reqStoreId(req);
    const where: Prisma.GamePlayWhereInput = { campaign: visibleWhere(req) };
    if (q.campaignId) where.campaignId = Number(q.campaignId);
    if (sid != null) where.OR = [{ storeId: sid }, { storeId: null }];
    if (q.storeId) where.storeId = Number(q.storeId);
    if (q.kind && PRIZE_KINDS.includes(q.kind as GamePrizeKind)) where.prizeKind = q.kind as GamePrizeKind;
    if (q.from || q.to) {
      where.playedAt = {
        ...(q.from ? { gte: bizDayStart(q.from) } : {}),
        ...(q.to ? { lte: bizDayEnd(q.to) } : {}),
      };
    }
    if (q.onlyWon === "1") where.prizeKind = { not: "NONE" };
    const rows = await prisma.gamePlay.findMany({
      where,
      include: {
        customer: { select: { id: true, fullName: true, phone: true, avatarUrl: true } },
        prize: { select: { id: true, quantity: true, wonCount: true } },
        store: { select: { id: true, name: true } },
        campaign: { select: { id: true, name: true } },
        giftClaim: { select: { code: true, status: true, expiresAt: true, deliveredAt: true } },
      },
      orderBy: { playedAt: "desc" },
      take: 5000,
    });
    res.json(rows.map((p) => ({
      ...p,
      kindLabel: KIND_LABEL[p.prizeKind],
      remaining: p.prize?.quantity != null ? Math.max(0, p.prize.quantity - p.prize.wonCount) : null,
    })));
  });

  /* ─────────── Quà hiện vật ─────────── */

  r.get("/admin/games/gift-items", ...manager, async (_req, res) => {
    res.json(await prisma.giftItem.findMany({ include: { stocks: { include: { store: { select: { id: true, name: true } } } } }, orderBy: { createdAt: "desc" } }));
  });

  r.post("/admin/games/gift-items", ...manager, handle(async (req, res) => {
    const { name, imageUrl, value, note } = req.body as { name?: string; imageUrl?: string; value?: number; note?: string };
    if (!name?.trim()) throw new GameError("Nhập tên quà.");
    const g = await prisma.giftItem.create({
      data: { name: name.trim().slice(0, 150), imageUrl: imageUrl?.trim() || null, value: Math.max(0, Math.round(Number(value) || 0)), note: note?.trim() || null },
    });
    audit((req as StaffRequest).staffRow!.id, "GIFT_ITEM_CREATE", `Quà #${g.id}`, g.name);
    res.status(201).json(g);
  }));

  r.patch("/admin/games/gift-items/:id", ...manager, handle(async (req, res) => {
    const { name, imageUrl, value, note, isActive } = req.body as { name?: string; imageUrl?: string | null; value?: number; note?: string | null; isActive?: boolean };
    const g = await prisma.giftItem.update({
      where: { id: idParam(req) },
      data: {
        ...(name !== undefined ? { name: name.trim().slice(0, 150) } : {}),
        ...(imageUrl !== undefined ? { imageUrl: imageUrl?.trim() || null } : {}),
        ...(value !== undefined ? { value: Math.max(0, Math.round(Number(value) || 0)) } : {}),
        ...(note !== undefined ? { note: note?.trim() || null } : {}),
        ...(isActive !== undefined ? { isActive: !!isActive } : {}),
      },
    });
    res.json(g);
  }));

  /** Đặt tồn quà tại 1 chi nhánh (quản lý chi nhánh chỉ chi nhánh mình) */
  r.put("/admin/games/gift-items/:id/stock", ...manager, handle(async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const { storeId: rawStore, qty } = req.body as { storeId?: number; qty?: number };
    const storeId = isOwner(staff.role) ? Number(rawStore) : staff.storeId!;
    const n = Number(qty);
    if (!Number.isInteger(storeId)) throw new GameError("Chọn chi nhánh.");
    if (!Number.isInteger(n) || n < 0) throw new GameError("Tồn phải là số nguyên ≥ 0.");
    const giftItemId = idParam(req);
    const cur = await prisma.giftStock.findUnique({ where: { giftItemId_storeId: { giftItemId, storeId } } });
    if (cur && n < cur.reserved) throw new GameError(`Đang giữ ${cur.reserved} quà cho khách đã trúng — tồn không được nhỏ hơn số này.`);
    const s = await prisma.giftStock.upsert({ where: { giftItemId_storeId: { giftItemId, storeId } }, update: { qty: n }, create: { giftItemId, storeId, qty: n } });
    audit(staff.id, "GIFT_STOCK_SET", `Quà #${giftItemId}`, `Chi nhánh #${storeId}: ${cur?.qty ?? 0} → ${n}`);
    res.json(s);
  }));

  /* ═══════════════════════ POS — NHẬN QUÀ ═══════════════════════ */

  r.get("/pos/gift-claims/:code", ...cashier, async (req, res) => {
    const c = await prisma.giftClaim.findUnique({ where: { code: String(req.params.code).trim().toUpperCase() }, include: claimInclude });
    if (!c) return res.status(404).json({ error: "Không tìm thấy mã nhận quà." });
    const stock = c.giftItemId
      ? await prisma.giftStock.findUnique({ where: { giftItemId_storeId: { giftItemId: c.giftItemId, storeId: mustStoreId(req) } } })
      : null;
    res.json({ ...c, expired: c.status === "WAITING" && c.expiresAt < new Date(), stockHere: stock ? stock.qty - (c.storeId === stock.storeId ? 0 : stock.reserved) : null });
  });

  r.post("/pos/gift-claims/:code/deliver", ...cashier, handle(async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const c = await deliverClaim(prisma, String(req.params.code), staff, mustStoreId(req));
    audit(staff.id, "GIFT_CLAIM_DELIVER", `Mã ${c.code}`, `${c.product?.name ?? c.giftItem?.name} → ${c.customer.fullName} (${c.customer.phone ?? ""})`);
    res.json(c);
  }));

  /* ═══════════════════════ KHÁCH ═══════════════════════ */

  /** Chiến dịch đang chạy (banner trang chủ / màn đặt hàng thành công) */
  r.get("/games/active", optionalCustomerAuth, async (req, res) => {
    const now = new Date();
    const storeId = req.query.store ? Number(req.query.store) : null;
    const rows = await prisma.gameCampaign.findMany({
      where: { isActive: true, startAt: { lte: now }, endAt: { gte: now }, gameType: { in: READY_GAMES } },
      include: { stores: true },
      orderBy: { endAt: "asc" },
    });
    const cid = customerOf(req);
    const list = rows.filter((c) => storeAllowed(c, storeId));
    res.json(await Promise.all(list.map(async (c) => ({
      id: c.id, name: c.name, gameType: c.gameType, description: c.description, endAt: c.endAt, minOrderValue: c.minOrderValue,
      me: cid ? await ticketSummary(prisma, c, cid) : null,
    }))));
  });

  /** "Quà của tôi": lượt còn lại, lịch sử chơi, mã nhận quà */
  r.get("/games/me", customerAuth, async (req, res) => {
    const cid = customerOf(req)!;
    const now = new Date();
    const [tickets, plays] = await Promise.all([
      prisma.gameTicket.groupBy({ by: ["campaignId"], where: { customerId: cid, status: "UNUSED", expiresAt: { gt: now } }, _count: true }),
      prisma.gamePlay.findMany({
        where: { customerId: cid },
        include: {
          campaign: { select: { id: true, name: true, gameType: true } },
          giftClaim: { include: { store: { select: { id: true, name: true, address: true } } } },
        },
        orderBy: { playedAt: "desc" },
        take: 100,
      }),
    ]);
    const campaigns = tickets.length
      ? await prisma.gameCampaign.findMany({ where: { id: { in: tickets.map((t) => t.campaignId) } }, select: { id: true, name: true, gameType: true, endAt: true, isActive: true, startAt: true } })
      : [];
    res.json({
      tickets: campaigns.filter((c) => isRunning(c)).map((c) => ({ ...c, count: tickets.find((t) => t.campaignId === c.id)!._count })),
      plays,
    });
  });

  r.get("/games/:id", optionalCustomerAuth, async (req, res) => {
    const c = await prisma.gameCampaign.findUnique({ where: { id: idParam(req) }, include: { prizes: true, stores: { include: { store: { select: { id: true, name: true } } } } } });
    if (!c || !READY_GAMES.includes(c.gameType)) return res.status(404).json({ error: "Không tìm thấy chiến dịch." });
    const cid = customerOf(req);
    const storeId = req.query.store ? Number(req.query.store) : null;
    const me = cid
      ? { ...(await ticketSummary(prisma, c, cid)), points: (await prisma.customer.findUnique({ where: { id: cid }, select: { points: true } }))?.points ?? 0 }
      : null;
    res.json({
      id: c.id, gameType: c.gameType, name: c.name, description: c.description, startAt: c.startAt, endAt: c.endAt,
      running: isRunning(c), storeAllowed: storeAllowed(c, storeId),
      allStores: c.allStores, stores: c.stores.map((s) => s.store),
      minOrderValue: c.minOrderValue, maxPlaysPerDay: c.maxPlaysPerDay, claimDays: c.claimDays,
      allowPointExchange: c.allowPointExchange, pointsPerTicket: c.pointsPerTicket,
      view: GAME_HANDLERS[c.gameType].publicView(c),
      me,
    });
  });

  r.post("/games/:id/play", customerAuth, handle(async (req, res) => {
    const raw = (req.body as { storeId?: number | null }).storeId;
    const storeId = raw == null || raw === ("" as unknown) ? null : Number(raw);
    if (storeId != null && !Number.isInteger(storeId)) throw new GameError("Chi nhánh không hợp lệ.");
    res.json(await playCampaign(prisma, { campaignId: idParam(req), customerId: customerOf(req)!, storeId }));
  }));

  r.post("/games/:id/exchange", customerAuth, handle(async (req, res) => {
    await exchangePointsForTicket(prisma, idParam(req), customerOf(req)!);
    res.json({ ok: true });
  }));

  return r;
}
