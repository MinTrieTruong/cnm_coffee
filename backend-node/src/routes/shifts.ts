import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Request, Response, NextFunction } from "express";
import { verifyToken, type StaffPayload } from "../lib/jwt.js";
import { audit } from "../lib/audit.js";

function staffAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  const token = h?.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Cần đăng nhập nhân sự." });
  try {
    const p = verifyToken<StaffPayload>(token);
    if (p.typ !== "staff") return res.status(403).json({ error: "Không phải tài khoản nhân sự." });
    (req as Request & { staff?: StaffPayload }).staff = p;
    next();
  } catch {
    return res.status(401).json({ error: "Token không hợp lệ." });
  }
}

export function shiftsRouter(prisma: PrismaClient) {
  const r = Router();

  r.get("/shifts/open", staffAuth, async (req, res) => {
    const p = (req as Request & { staff?: StaffPayload }).staff!;
    if (p.role !== "Cashier" && p.role !== "Admin") {
      return res.status(403).json({ error: "Chỉ thu ngân hoặc quản lý mở ca." });
    }
    const open = await prisma.shift.findFirst({
      where: { staffId: p.sub, endTime: null },
      orderBy: { id: "desc" },
    });
    res.json({ shift: open });
  });

  r.post("/shifts/open", staffAuth, async (req, res) => {
    const p = (req as Request & { staff?: StaffPayload }).staff!;
    if (p.role !== "Cashier" && p.role !== "Admin") {
      return res.status(403).json({ error: "Chỉ thu ngân hoặc quản lý mở ca." });
    }
    const existing = await prisma.shift.findFirst({ where: { staffId: p.sub, endTime: null } });
    if (existing) {
      return res.status(409).json({ error: "Đã có ca đang mở.", shift: existing });
    }
    const { startingCash } = req.body as { startingCash?: number };
    const cash = typeof startingCash === "number" ? startingCash : 0;
    const shift = await prisma.shift.create({
      data: {
        staffId: p.sub,
        startTime: new Date(),
        startingCash: cash,
      },
    });
    audit(p.sub, "SHIFT_OPEN", `Ca #${shift.id}`, `Tiền đầu ca: ${cash}`);
    res.status(201).json(shift);
  });

  r.post("/shifts/close", staffAuth, async (req, res) => {
    const p = (req as Request & { staff?: StaffPayload }).staff!;
    if (p.role !== "Cashier" && p.role !== "Admin") {
      return res.status(403).json({ error: "Chỉ thu ngân hoặc quản lý đóng ca." });
    }
    const { actualCash } = req.body as { actualCash?: number };
    if (typeof actualCash !== "number") {
      return res.status(400).json({ error: "Nhập số tiền mặt thực tế đếm được." });
    }
    const open = await prisma.shift.findFirst({
      where: { staffId: p.sub, endTime: null },
      orderBy: { id: "desc" },
    });
    if (!open) return res.status(400).json({ error: "Không có ca đang mở." });
    const expectedCash = open.startingCash;
    const diff = actualCash - expectedCash;
    const closed = await prisma.shift.update({
      where: { id: open.id },
      data: {
        endTime: new Date(),
        expectedCash,
        actualCash,
        differenceAmt: diff,
      },
    });
    audit(p.sub, "SHIFT_CLOSE", `Ca #${open.id}`, `Thực tế: ${actualCash}, Chênh lệch: ${diff}`);
    res.json(closed);
  });

  // ─── Kiểm kho ───────────────────────────────────────────────────────────────

  /**
   * GET /shifts/inventory
   * Trả về danh sách toàn bộ nguyên liệu trong kho để nhân viên xem khi kiểm kho.
   * Mọi nhân viên đã đăng nhập đều được xem.
   */
  r.get("/shifts/inventory", staffAuth, async (_req, res) => {
    const items = await prisma.inventoryItem.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        skuCode: true,
        unit: true,
        stockQty: true,
        minLevel: true,
        imageUrl: true,
      },
    });
    res.json(items);
  });

  /**
   * POST /shifts/inventory/check
   * Nhân viên lưu kết quả kiểm kho mở ca hoặc kết ca.
   * Body: { checkType: "open" | "close", items: [{ itemId, qty, note? }] }
   *
   * Logic:
   * - "open": ghi nhận tồn kho thực tế đầu ca (để so sánh với số trong hệ thống).
   * - "close": ghi nhận tồn kho thực tế cuối ca.
   * - Không thay đổi stockQty trong DB — chỉ là nhật ký kiểm kho.
   *   stockQty chỉ thay đổi khi admin duyệt phiếu nhập hàng.
   */
  r.post("/shifts/inventory/check", staffAuth, async (req, res) => {
    const p = (req as Request & { staff?: StaffPayload }).staff!;

    const { checkType, items, shiftId: bodyShiftId } = req.body as {
      checkType?: "open" | "close";
      items?: { itemId: number; qty: number; note?: string }[];
      shiftId?: number;
    };

    if (checkType !== "open" && checkType !== "close") {
      return res.status(400).json({ error: "checkType phải là 'open' hoặc 'close'" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Cần danh sách nguyên liệu kiểm kho." });
    }

    // Tìm ca hiện tại (nếu có) — không bắt buộc với Kitchen
    let shiftId: number | null = bodyShiftId ?? null;
    if (!shiftId) {
      const openShift = await prisma.shift.findFirst({
        where: { staffId: p.sub, endTime: null },
        orderBy: { id: "desc" },
      });
      shiftId = openShift?.id ?? null;
    }

    // Với Cashier: bắt buộc phải có ca đang mở
    if (!shiftId && p.role === "Cashier") {
      return res.status(400).json({ error: "Chưa mở ca. Hãy mở ca trước khi kiểm kho." });
    }

    // Với checkType = "close": kiểm tra đã có log mở ca hôm nay chưa
    if (checkType === "close") {
      const today = new Date();
      const dayStart = new Date(today); dayStart.setHours(0, 0, 0, 0);
      const dayEnd   = new Date(today); dayEnd.setHours(23, 59, 59, 999);
      const hasOpenLog = await prisma.shiftInventoryLog.findFirst({
        where: { checkType: "open", checkedAt: { gte: dayStart, lte: dayEnd } },
      });
      if (!hasOpenLog) {
        return res.status(400).json({ error: "Chưa có log kiểm kho mở ca hôm nay. Hãy mở ca trước." });
      }
    }

    // Tạo logs hàng loạt (shiftId có thể null với Kitchen)
    await prisma.shiftInventoryLog.createMany({
      data: items.map((it) => ({
        shiftId: shiftId,
        itemId: it.itemId,
        checkType,
        qty: it.qty,
        note: it.note ?? null,
      })),
      skipDuplicates: false,
    });

    audit(p.sub, checkType === "open" ? "INVENTORY_CHECK_OPEN" : "INVENTORY_CHECK_CLOSE",
      `Kiểm kho ${checkType === "open" ? "mở ca" : "kết ca"}`,
      `${items.length} nguyên liệu`);

    res.status(201).json({ ok: true, count: items.length, checkType });
  });

  /**
   * GET /shifts/inventory/log?date=YYYY-MM-DD
   * Trả về log kiểm kho của ngày chỉ định (mặc định hôm nay).
   * Nếu có ca (Cashier) thì cũng bao gồm log theo shiftId của ngày đó.
   */
  r.get("/shifts/inventory/log", staffAuth, async (req, res) => {
    const p = (req as Request & { staff?: StaffPayload }).staff!;
    const dateStr = req.query.date as string | undefined;
    const date = dateStr ? new Date(dateStr) : new Date();
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
    const dayEnd   = new Date(date); dayEnd.setHours(23, 59, 59, 999);

    // Lấy tất cả log trong ngày (không phân biệt shiftId)
    const logs = await prisma.shiftInventoryLog.findMany({
      where: { checkedAt: { gte: dayStart, lte: dayEnd } },
      include: { item: { select: { name: true, unit: true } } },
      orderBy: { checkedAt: "asc" },
    });

    res.json({ date: date.toISOString().slice(0, 10), logs });
  });

  return r;
}
