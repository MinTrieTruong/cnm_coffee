import { Router } from "express";
import type { Request } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { attachStaff, isOwner, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { customerAuth } from "../middleware/customer.js";
import { inStore, mustStoreId } from "../lib/storeScope.js";
import { voucherStoreError } from "../lib/stores.js";
import { resolveVoucher } from "../lib/vouchers.js";
import { storeFromQuery } from "../lib/storeProducts.js";

type CustReq = Request & { customerId?: number };

export function vouchersRouter(prisma: PrismaClient, io: Server) {
  const r = Router();
  const staffAuth = attachStaff(prisma);
  const adminOnly = [staffAuth, requireRoles("Admin")];
  const cashierAuth = [staffAuth, requireRoles("Cashier", "Admin"), requireStore];

  /**
   * Voucher toàn chuỗi (không gắn chi nhánh) chỉ Owner quản lý; Admin chi nhánh quản lý
   * voucher chỉ áp dụng cho riêng chi nhánh mình.
   */
  const canManage = async (req: Request, voucherId: number) => {
    const me = (req as StaffRequest).staffRow!;
    if (isOwner(me.role)) return true;
    const stores = await prisma.voucherStore.findMany({ where: { voucherId } });
    return stores.length === 1 && stores[0].storeId === me.storeId;
  };

  /* ───────────────────────────── ADMIN ───────────────────────────── */

  /** GET /vouchers/admin — danh sách tất cả voucher */
  r.get("/vouchers/admin", ...adminOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const rows = await prisma.voucher.findMany({
      // Admin chi nhánh: voucher toàn chuỗi + voucher áp dụng tại chi nhánh mình
      where: isOwner(me.role) ? {} : { OR: [{ stores: { none: {} } }, { stores: { some: { storeId: me.storeId ?? -1 } } }] },
      orderBy: { id: "desc" },
      include: { _count: { select: { userVouchers: true } }, stores: { include: { store: { select: { id: true, name: true } } } } },
    });
    res.json(rows);
  });

  /** POST /vouchers/admin — tạo voucher mới */
  r.post("/vouchers/admin", ...adminOnly, async (req, res) => {
    const {
      code, description, discountValue, minBillValue,
      startDate, endDate, quantity, voucherType,
      goldHourStart, goldHourEnd, autoGift, storeIds,
    } = req.body as {
      code: string; description?: string;
      discountValue: number; minBillValue?: number;
      startDate?: string; endDate: string;
      quantity: number; voucherType?: string;
      goldHourStart?: number | null; goldHourEnd?: number | null;
      autoGift?: boolean; // tự động tặng cho tất cả khách hiện tại
      storeIds?: number[]; // chi nhánh áp dụng; rỗng = toàn chuỗi (chỉ Owner)
    };
    const me = (req as StaffRequest).staffRow!;
    const applyStores = isOwner(me.role)
      ? [...new Set((storeIds ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))]
      : [me.storeId!];

    if (!code?.trim() || !discountValue || !endDate || !quantity) {
      return res.status(400).json({ error: "Thiếu thông tin bắt buộc." });
    }

    const voucher = await prisma.voucher.create({
      data: {
        code: code.trim().toUpperCase(),
        description: description?.trim() || null,
        discountValue,
        minBillValue: minBillValue ?? 0,
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: new Date(endDate),
        quantity,
        voucherType: voucherType ?? "public",
        goldHourStart: goldHourStart ?? null,
        goldHourEnd: goldHourEnd ?? null,
        stores: { create: applyStores.map((storeId) => ({ storeId })) },
      },
    });

    // Broadcast thông báo voucher mới tới khách hàng
    io.emit("voucher:new", {
      code: voucher.code,
      description: voucher.description,
      discountValue: voucher.discountValue,
      endDate: voucher.endDate,
    });

    // Auto-gift: tặng luôn cho tất cả khách hiện tại
    if (autoGift) {
      const customers = await prisma.customer.findMany({ select: { id: true } });
      await prisma.userVoucher.createMany({
        data: customers.map((c) => ({ customerId: c.id, voucherId: voucher.id })),
        skipDuplicates: true,
      });
    }

    res.status(201).json(voucher);
  });

  /** PATCH /vouchers/admin/:id — sửa / khóa voucher */
  r.patch("/vouchers/admin/:id", ...adminOnly, async (req, res) => {
    const id = Number(req.params.id);
    const { isActive, description, endDate, quantity, goldHourStart, goldHourEnd, storeIds } =
      req.body as Partial<{
        isActive: boolean; description: string;
        endDate: string; quantity: number;
        goldHourStart: number | null; goldHourEnd: number | null;
        storeIds: number[];
      }>;
    if (!(await canManage(req, id))) {
      return res.status(403).json({ error: "Voucher toàn chuỗi hoặc của chi nhánh khác — chỉ Chủ chuỗi được sửa." });
    }
    if (storeIds !== undefined) {
      if (!isOwner((req as StaffRequest).staffRow!.role)) {
        return res.status(403).json({ error: "Chỉ Chủ chuỗi được đổi chi nhánh áp dụng." });
      }
      await prisma.$transaction([
        prisma.voucherStore.deleteMany({ where: { voucherId: id } }),
        prisma.voucherStore.createMany({ data: [...new Set(storeIds.map(Number))].map((storeId) => ({ voucherId: id, storeId })) }),
      ]);
    }

    const updated = await prisma.voucher.update({
      where: { id },
      data: {
        ...(isActive !== undefined && { isActive }),
        ...(description !== undefined && { description }),
        ...(endDate && { endDate: new Date(endDate) }),
        ...(quantity !== undefined && { quantity }),
        ...(goldHourStart !== undefined && { goldHourStart }),
        ...(goldHourEnd !== undefined && { goldHourEnd }),
      },
    });
    res.json(updated);
  });

  /** GET /vouchers/admin/stats — thống kê */
  r.get("/vouchers/admin/stats", ...adminOnly, async (_req, res) => {
    const vouchers = await prisma.voucher.findMany({
      include: {
        userVouchers: { where: { isUsed: true }, select: { voucherId: true } },
      },
    });
    const stats = vouchers.map((v) => ({
      id: v.id,
      code: v.code,
      description: v.description,
      discountValue: v.discountValue,
      quantity: v.quantity,
      usedCount: v.usedCount,
      claimedCount: v.userVouchers.length,
      totalDiscountGiven: v.usedCount * v.discountValue,
      isActive: v.isActive,
      endDate: v.endDate,
    }));
    res.json(stats);
  });

  /* ──────────────────────── KHÁCH HÀNG ─────────────────────────── */

  /** GET /vouchers/public — danh sách voucher public còn hạn */
  r.get("/vouchers/public", async (_req, res) => {
    const now = new Date();
    const rows = await prisma.voucher.findMany({
      where: {
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
        voucherType: "public",
      },
      select: {
        id: true, code: true, description: true,
        discountValue: true, minBillValue: true,
        endDate: true, quantity: true, usedCount: true,
        goldHourStart: true, goldHourEnd: true,
        // Rỗng = áp dụng toàn chuỗi
        stores: { select: { store: { select: { id: true, name: true } } } },
      },
      orderBy: { endDate: "asc" },
    });
    res.json(rows);
  });

  /**
   * POST /vouchers/validate-public
   * Khách tự kiểm tra voucher khi thanh toán (không cần cashier auth).
   * Body: { code, subTotal, customerId? }
   */
  r.post("/vouchers/validate-public", async (req, res) => {
    const { code, subTotal, customerId, storeId, tableId } = req.body as {
      code?: string; subTotal?: number; customerId?: number | null;
      storeId?: number | null; tableId?: number | null;
    };
    if (!code?.trim() || typeof subTotal !== "number") {
      return res.status(400).json({ error: "Thiếu mã voucher hoặc tổng tiền." });
    }

    // Cùng quy tắc với lúc thanh toán (lib/vouchers) — đây chỉ là kiểm tra trước, lúc thanh toán máy chủ kiểm tra lại
    const table = tableId ? await prisma.cafeTable.findUnique({ where: { id: Number(tableId) }, select: { storeId: true } }) : null;
    const checked = await resolveVoucher(prisma, code, {
      subTotal,
      storeId: table?.storeId ?? storeFromQuery(storeId),
      customerId: customerId ? Number(customerId) : null,
    });
    if ("error" in checked) return res.status(400).json({ error: checked.error });
    const voucher = await prisma.voucher.findUniqueOrThrow({ where: { id: checked.voucherId! } });

    res.json({
      ok: true,
      voucher: {
        id: voucher.id,
        code: voucher.code,
        description: voucher.description,
        discountValue: voucher.discountValue,
        voucherType: voucher.voucherType,
      },
    });
  });

  /** POST /vouchers/claim — khách lưu voucher vào ví */
  r.post("/vouchers/claim", customerAuth, async (req, res) => {
    const customerId = (req as CustReq).customerId;
    if (!customerId) return res.status(401).json({ error: "Chưa đăng nhập." });

    const { voucherId } = req.body as { voucherId?: number };
    if (!voucherId) return res.status(400).json({ error: "Thiếu voucherId." });

    const voucher = await prisma.voucher.findUnique({ where: { id: voucherId } });
    if (!voucher || !voucher.isActive) {
      return res.status(404).json({ error: "Voucher không tồn tại hoặc đã bị khóa." });
    }
    if (voucher.voucherType !== "personal") {
      return res.status(400).json({ error: "Voucher này không cần lưu vào ví." });
    }
    const now = new Date();
    if (voucher.endDate < now) {
      return res.status(400).json({ error: "Voucher đã hết hạn." });
    }
    if (voucher.quantity !== -1 && voucher.usedCount >= voucher.quantity) {
      return res.status(400).json({ error: "Voucher đã hết lượt phát." });
    }

    const existing = await prisma.userVoucher.findUnique({
      where: { customerId_voucherId: { customerId, voucherId } },
    });
    if (existing) {
      return res.status(400).json({ error: "Bạn đã lưu voucher này rồi." });
    }

    const uv = await prisma.userVoucher.create({
      data: { customerId, voucherId },
    });
    res.status(201).json(uv);
  });

  /** GET /vouchers/my — ví voucher của khách */
  r.get("/vouchers/my", customerAuth, async (req, res) => {
    const customerId = (req as CustReq).customerId;
    if (!customerId) return res.status(401).json({ error: "Chưa đăng nhập." });

    const uvs = await prisma.userVoucher.findMany({
      where: { customerId },
      include: {
        voucher: {
          select: {
            id: true, code: true, description: true,
            discountValue: true, minBillValue: true,
            endDate: true, isActive: true,
            goldHourStart: true, goldHourEnd: true,
          },
        },
      },
      orderBy: { claimedAt: "desc" },
    });
    res.json(uvs);
  });

  /* ──────────────────────────── POS ──────────────────────────────── */

  /**
   * POST /vouchers/validate
   * Kiểm tra voucher trước khi áp dụng.
   * Body: { code, subTotal, customerId? }
   */
  r.post("/vouchers/validate", ...cashierAuth, async (req, res) => {
    const { code, subTotal, customerId } = req.body as {
      code?: string; subTotal?: number; customerId?: number | null;
    };
    if (!code?.trim() || typeof subTotal !== "number") {
      return res.status(400).json({ error: "Thiếu code hoặc subTotal." });
    }

    const voucher = await prisma.voucher.findUnique({
      where: { code: code.trim().toUpperCase() },
    });
    if (!voucher) return res.status(404).json({ error: "Mã voucher không tồn tại." });
    if (!voucher.isActive) return res.status(400).json({ error: "Voucher đã bị khóa." });
    const storeErr = await voucherStoreError(prisma, voucher.id, mustStoreId(req));
    if (storeErr) return res.status(400).json({ error: storeErr });

    const now = new Date();
    if (voucher.startDate > now) return res.status(400).json({ error: "Voucher chưa đến ngày hiệu lực." });
    if (voucher.endDate < now) return res.status(400).json({ error: "Voucher đã hết hạn." });

    // Kiểm tra giờ vàng
    if (voucher.goldHourStart !== null && voucher.goldHourEnd !== null) {
      const hour = now.getHours();
      if (hour < voucher.goldHourStart || hour >= voucher.goldHourEnd) {
        return res.status(400).json({
          error: `Voucher chỉ áp dụng trong Giờ Vàng ${voucher.goldHourStart}h–${voucher.goldHourEnd}h.`,
        });
      }
    }

    if (subTotal < voucher.minBillValue) {
      return res.status(400).json({
        error: `Hóa đơn cần tối thiểu ${voucher.minBillValue.toLocaleString("vi-VN")}đ để dùng voucher này.`,
      });
    }
    if (voucher.quantity !== -1 && voucher.usedCount >= voucher.quantity) {
      return res.status(400).json({ error: "Voucher đã hết lượt sử dụng." });
    }

    // Kiểm tra khách đã dùng chưa (nếu biết customerId)
    if (customerId) {
      if (voucher.voucherType === "personal") {
        // Phải có trong ví
        const uv = await prisma.userVoucher.findUnique({
          where: { customerId_voucherId: { customerId, voucherId: voucher.id } },
        });
        if (!uv) return res.status(400).json({ error: "Khách chưa lưu voucher này vào ví." });
        if (uv.isUsed) return res.status(400).json({ error: "Khách đã sử dụng voucher này rồi." });
      } else {
        // Public: kiểm tra đã dùng chưa
        const used = await prisma.userVoucher.findUnique({
          where: { customerId_voucherId: { customerId, voucherId: voucher.id } },
        });
        if (used?.isUsed) return res.status(400).json({ error: "Khách đã sử dụng mã này rồi." });
      }
    }

    res.json({
      ok: true,
      voucher: {
        id: voucher.id,
        code: voucher.code,
        description: voucher.description,
        discountValue: voucher.discountValue,
      },
    });
  });

  /**
   * POST /vouchers/apply
   * Áp dụng voucher vào đơn (gọi sau khi thanh toán xong).
   * Body: { voucherId, orderId, customerId? }
   */
  r.post("/vouchers/apply", ...cashierAuth, async (req, res) => {
    const { voucherId, orderId, customerId } = req.body as {
      voucherId: number; orderId: number; customerId?: number | null;
    };
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || !inStore(req, order)) return res.status(404).json({ error: "Không tìm thấy đơn." });
    const storeErr = await voucherStoreError(prisma, voucherId, order.storeId);
    if (storeErr) return res.status(400).json({ error: storeErr });

    await prisma.$transaction(async (tx) => {
      await tx.voucher.update({
        where: { id: voucherId },
        data: { usedCount: { increment: 1 } },
      });
      if (customerId) {
        await tx.userVoucher.upsert({
          where: { customerId_voucherId: { customerId, voucherId } },
          create: { customerId, voucherId, isUsed: true, usedAt: new Date(), orderId },
          update: { isUsed: true, usedAt: new Date(), orderId },
        });
      }
    });

    res.json({ ok: true });
  });

  return r;
}

/**
 * Gọi sau khi tạo Customer mới — tự động tặng voucher "Chào mừng".
 */
export async function autoGiftWelcomeVoucher(prisma: PrismaClient, customerId: number) {
  try {
    const welcome = await prisma.voucher.findFirst({
      where: { isActive: true, description: { contains: "welcome" } },
    });
    if (!welcome) return;
    await prisma.userVoucher.create({
      data: { customerId, voucherId: welcome.id },
    }).catch(() => { /* đã có rồi thì bỏ qua */ });
  } catch { /* */ }
}
