import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Request } from "express";
import { audit } from "../lib/audit.js";
import { attachStaff, isAdminLike, requireStore, type StaffRequest } from "../middleware/staff.js";
import { mustStoreId, storeWhere } from "../lib/storeScope.js";
import { createEntry, drawerSummary, fundBalance, openSafeSession, parseDenominations } from "../lib/cash.js";

function me(req: Request) {
  const s = (req as StaffRequest).staffRow!;
  return { sub: s.id, role: s.role };
}

export function shiftsRouter(prisma: PrismaClient) {
  const r = Router();
  // Ca thu ngân luôn gắn với 1 chi nhánh
  const staffAuth = [attachStaff(prisma), requireStore];

  r.get("/shifts/open", ...staffAuth, async (req, res) => {
    const p = me(req);
    if (p.role !== "Cashier" && !isAdminLike(p.role)) {
      return res.status(403).json({ error: "Chỉ thu ngân hoặc quản lý mở ca." });
    }
    const open = await prisma.shift.findFirst({
      where: { ...storeWhere(req), staffId: p.sub, endTime: null },
      orderBy: { id: "desc" },
    });
    // Đếm mù: thu ngân không thấy tiền mặt dự kiến trước khi đóng ca
    res.json({ shift: open, drawer: open && isAdminLike(p.role) ? await drawerSummary(prisma, open) : null });
  });

  /**
   * Mở ca: tiền đầu ca lấy từ két → phải đang mở két và két đủ tiền.
   * Ghi phiếu chuyển quỹ Két → Ngăn kéo để số dư két giảm tương ứng.
   */
  r.post("/shifts/open", ...staffAuth, async (req, res) => {
    const p = me(req);
    if (p.role !== "Cashier" && !isAdminLike(p.role)) {
      return res.status(403).json({ error: "Chỉ thu ngân hoặc quản lý mở ca." });
    }
    const storeId = mustStoreId(req);
    const existing = await prisma.shift.findFirst({ where: { storeId, staffId: p.sub, endTime: null } });
    if (existing) {
      return res.status(409).json({ error: "Đã có ca đang mở.", shift: existing });
    }
    const { startingCash } = req.body as { startingCash?: number };
    const cash = typeof startingCash === "number" && Number.isInteger(startingCash) && startingCash > 0 ? startingCash : 0;

    const session = cash > 0 ? await openSafeSession(prisma, storeId) : null;
    if (cash > 0) {
      if (!session) return res.status(400).json({ error: "Mở két trước để lấy tiền đầu ca." });
      const safe = await fundBalance(prisma, storeId, "SAFE");
      if (cash > safe) {
        return res.status(400).json({
          error: isAdminLike(p.role)
            ? `Két chỉ còn ${safe.toLocaleString("vi-VN")}đ theo sổ. Nếu két chưa nhập số dư, ghi "Số dư đầu kỳ" ở Tài chính › Két & quỹ.`
            : "Số tiền vượt số dư két trên sổ. Báo quản lý kiểm tra (két có thể chưa nhập số dư đầu kỳ).",
        });
      }
    }

    const shift = await prisma.$transaction(async (tx) => {
      const s = await tx.shift.create({ data: { storeId, staffId: p.sub, startTime: new Date(), startingCash: cash } });
      if (cash > 0) {
        await createEntry(tx, {
          storeId,
          kind: "TRANSFER",
          fromFund: "SAFE",
          toFund: "DRAWER",
          shiftId: s.id,
          safeSessionId: session!.id,
          category: "SHIFT_FLOAT",
          amount: cash,
          description: `Tiền đầu ca #${s.id}`,
          createdById: p.sub,
          approvedById: p.sub,
          approvedAt: new Date(),
        });
      }
      return s;
    });
    audit(p.sub, "SHIFT_OPEN", `Ca #${shift.id}`, `Tiền đầu ca: ${cash}`);
    res.status(201).json(shift);
  });

  /**
   * Đóng ca: đếm tiền ngăn kéo (theo mệnh giá hoặc nhập tổng), so với tiền dự kiến.
   * Lệch thì bắt buộc ghi lý do. Toàn bộ tiền đếm được nộp vào két (phiếu Ngăn kéo → Két).
   */
  r.post("/shifts/close", ...staffAuth, async (req, res) => {
    const p = me(req);
    if (p.role !== "Cashier" && !isAdminLike(p.role)) {
      return res.status(403).json({ error: "Chỉ thu ngân hoặc quản lý đóng ca." });
    }
    const { actualCash: rawActual, denominations, note } = req.body as { actualCash?: number; denominations?: unknown; note?: string };
    const denom = denominations ? parseDenominations(denominations) : null;
    if (denominations && !denom) return res.status(400).json({ error: "Số tờ theo mệnh giá không hợp lệ." });
    const actualCash = denom ? denom.total : rawActual;
    if (typeof actualCash !== "number" || !Number.isInteger(actualCash) || actualCash < 0) {
      return res.status(400).json({ error: "Nhập số tiền mặt thực tế đếm được." });
    }
    const storeId = mustStoreId(req);
    const open = await prisma.shift.findFirst({
      where: { storeId, staffId: p.sub, endTime: null },
      orderBy: { id: "desc" },
    });
    if (!open) return res.status(400).json({ error: "Không có ca đang mở." });

    const drawer = await drawerSummary(prisma, open);
    const diff = actualCash - drawer.expectedCash;
    const reason = note?.trim() || null;
    if (diff !== 0 && !reason) {
      // Thu ngân đếm mù: chỉ báo "không khớp" (không nói lệch bao nhiêu) để đếm lại
      return res.status(400).json(
        isAdminLike(p.role)
          ? { error: "Tiền đếm được lệch so với dự kiến — vui lòng ghi lý do.", code: "COUNT_MISMATCH", drawer, diff }
          : { error: "Tiền đếm được không khớp với hệ thống. Đếm lại — nếu chắc chắn đúng, ghi lý do rồi đóng ca.", code: "COUNT_MISMATCH" },
      );
    }

    const session = await openSafeSession(prisma, storeId);
    const closed = await prisma.$transaction(async (tx) => {
      const s = await tx.shift.update({
        where: { id: open.id },
        data: {
          endTime: new Date(),
          cashSales: drawer.cashSales,
          expectedCash: drawer.expectedCash,
          actualCash,
          differenceAmt: diff,
          denominations: denom?.json ?? null,
          note: reason,
        },
      });
      if (actualCash > 0) {
        // Nộp két qua khe hoặc trong lúc két đang mở — số dư két tăng, lần kiểm két sau sẽ đối chiếu
        await createEntry(tx, {
          storeId,
          kind: "TRANSFER",
          fromFund: "DRAWER",
          toFund: "SAFE",
          shiftId: open.id,
          safeSessionId: session?.id ?? null,
          category: "SHIFT_DEPOSIT",
          amount: actualCash,
          description: `Nộp tiền cuối ca #${open.id}`,
          createdById: p.sub,
          approvedById: p.sub,
          approvedAt: new Date(),
        });
      }
      return s;
    });
    audit(p.sub, "SHIFT_CLOSE", `Ca #${open.id}`, `Dự kiến: ${drawer.expectedCash}, Thực tế: ${actualCash}, Chênh lệch: ${diff}${reason ? ` — ${reason}` : ""}`);
    res.json({ ...closed, drawer });
  });

  return r;
}
