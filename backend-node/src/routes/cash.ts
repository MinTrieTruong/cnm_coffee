import { Router, type Request } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import { attachStaff, isAdminLike, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { inStore, mustStoreId, reqStoreId, storeWhere } from "../lib/storeScope.js";
import { audit } from "../lib/audit.js";
import { saveDataUrlImage } from "../lib/uploadImage.js";
import { getStoreSettings } from "../lib/pricing.js";
import {
  CATEGORIES,
  TRANSFER_ROUTES,
  createBill,
  createEntry,
  dayRange,
  drawerSummary,
  fundBalance,
  groupByMethod,
  isBankMethod,
  NON_MONEY_METHODS,
  openSafeSession,
  parseDenominations,
  type Fund,
} from "../lib/cash.js";

const staffOf = (req: Request) => (req as StaffRequest).staffRow!;
const staffName = { select: { id: true, fullName: true } } as const;
const entryInclude = {
  createdBy: staffName,
  approvedBy: staffName,
  store: { select: { id: true, name: true } },
  supplierBill: { select: { id: true, code: true, supplier: { select: { name: true } } } },
} as const;

/** Lấy tiền ra khỏi quỹ: không được vượt số dư (két / ngăn kéo) */
async function availableIn(db: PrismaClient | Prisma.TransactionClient, storeId: number, fund: Fund, shiftId: number | null) {
  if (fund === "DRAWER") {
    const shift = await db.shift.findUnique({ where: { id: shiftId ?? -1 } });
    return shift ? (await drawerSummary(db, shift)).expectedCash : 0;
  }
  return fundBalance(db, storeId, fund);
}

const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;
/** Id trên URL; không hợp lệ → -1 (truy vấn ra "không tìm thấy" thay vì làm lỗi Prisma) */
const idOf = (req: Request) => {
  const n = Number(req.params.id);
  return Number.isInteger(n) && n > 0 ? n : -1;
};

export function cashRouter(prisma: PrismaClient) {
  const r = Router();
  const auth = attachStaff(prisma);
  /** Thu ngân + quản lý (Owner đi kèm Admin) */
  const cashier = [auth, requireRoles("Cashier", "Admin")];
  const cashierStore = [...cashier, requireStore];
  const manager = [auth, requireRoles("Admin")];
  const managerStore = [...manager, requireStore];

  /* ═══════════════ TỔNG QUAN QUỸ ═══════════════ */

  /** Số dư két, ngân hàng, ngăn kéo các ca đang mở. Owner xem tất cả → từng chi nhánh. */
  r.get("/cash/overview", ...cashier, async (req, res) => {
    const sid = reqStoreId(req);
    const stores = await prisma.store.findMany({
      where: sid == null ? { isActive: true } : { id: sid },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });
    const settings = await getStoreSettings(prisma);
    const rows = await Promise.all(
      stores.map(async (s) => {
        const [safe, bank, session, shifts, pending] = await Promise.all([
          fundBalance(prisma, s.id, "SAFE"),
          fundBalance(prisma, s.id, "BANK"),
          prisma.safeSession.findFirst({ where: { storeId: s.id, closedAt: null }, include: { openedBy: staffName } }),
          prisma.shift.findMany({ where: { storeId: s.id, endTime: null }, include: { staff: staffName } }),
          prisma.cashEntry.count({ where: { storeId: s.id, status: "PENDING" } }),
        ]);
        const drawers = await Promise.all(shifts.map(async (sh) => ({ shiftId: sh.id, staff: sh.staff, startTime: sh.startTime, ...(await drawerSummary(prisma, sh)) })));
        return { store: s, safe, bank, drawerTotal: drawers.reduce((t, d) => t + d.expectedCash, 0), drawers, safeSession: session, pendingCount: pending };
      }),
    );
    // Đếm mù: thu ngân không xem số dư két / ngân hàng / ngăn kéo theo sổ
    const blind = !isAdminLike(staffOf(req).role);
    res.json({
      pettyCashLimit: settings.pettyCashLimit,
      stores: blind ? rows.map((r) => ({ ...r, safe: null, bank: null, drawerTotal: null, drawers: [] })) : rows,
    });
  });

  /* ═══════════════ KÉT SẮT ═══════════════ */

  r.get("/cash/safe", ...cashierStore, async (req, res) => {
    const storeId = mustStoreId(req);
    const [balance, session, sessions] = await Promise.all([
      fundBalance(prisma, storeId, "SAFE"),
      prisma.safeSession.findFirst({
        where: { storeId, closedAt: null },
        include: { openedBy: staffName, entries: { include: entryInclude, orderBy: { id: "asc" } } },
      }),
      prisma.safeSession.findMany({
        where: { storeId },
        include: { openedBy: staffName, closedBy: staffName, _count: { select: { entries: true } } },
        orderBy: { id: "desc" },
        take: 60,
      }),
    ]);
    if (isAdminLike(staffOf(req).role)) return res.json({ balance, session, sessions });
    // Đếm mù: thu ngân thấy két đang mở / ai mở / lấy bỏ gì, nhưng không thấy số dư & kết quả kiểm két
    const hide = <T extends object>(x: T) => ({ ...x, openingBalance: null, expectedBalance: null, countedBalance: null, difference: null, denominations: null });
    res.json({ balance: null, session: session && hide(session), sessions: sessions.map(hide) });
  });

  r.get("/cash/safe/sessions/:id", ...cashier, async (req, res) => {
    const s = await prisma.safeSession.findUnique({
      where: { id: idOf(req) },
      include: { openedBy: staffName, closedBy: staffName, store: { select: { name: true } }, entries: { include: entryInclude, orderBy: { id: "asc" } } },
    });
    if (!s || !inStore(req, s)) return res.status(404).json({ error: "Không tìm thấy phiên mở két." });
    res.json(s);
  });

  /** Mở két — bắt buộc ghi lý do; mỗi chi nhánh chỉ 1 phiên mở */
  r.post("/cash/safe/open", ...cashierStore, async (req, res) => {
    const me = staffOf(req);
    const storeId = mustStoreId(req);
    const reason = String((req.body as { reason?: string })?.reason ?? "").trim();
    if (!reason) return res.status(400).json({ error: "Ghi lý do mở két." });
    if (await openSafeSession(prisma, storeId)) return res.status(409).json({ error: "Két đang mở — đóng két trước khi mở phiên mới." });
    const session = await prisma.safeSession.create({
      data: { storeId, reason, openedById: me.id, openingBalance: await fundBalance(prisma, storeId, "SAFE") },
    });
    audit(me.id, "SAFE_OPEN", `Két #${session.id}`, `${reason} — số dư sổ ${vnd(session.openingBalance)}`);
    res.status(201).json(session);
  });

  /**
   * Đóng két — đếm lại tiền trong két. Lệch so với sổ thì bắt buộc ghi lý do và
   * tự tạo phiếu điều chỉnh để số dư sổ khớp thực tế (chủ chuỗi xem được mọi lần lệch).
   */
  r.post("/cash/safe/close", ...cashierStore, async (req, res) => {
    const me = staffOf(req);
    const storeId = mustStoreId(req);
    const { countedBalance, denominations, note } = req.body as { countedBalance?: number; denominations?: unknown; note?: string };
    const denom = denominations ? parseDenominations(denominations) : null;
    if (denominations && !denom) return res.status(400).json({ error: "Số tờ theo mệnh giá không hợp lệ." });
    const counted = denom ? denom.total : countedBalance;
    if (typeof counted !== "number" || !Number.isInteger(counted) || counted < 0) {
      return res.status(400).json({ error: "Nhập số tiền đếm được trong két." });
    }
    const session = await openSafeSession(prisma, storeId);
    if (!session) return res.status(400).json({ error: "Két đang không mở." });
    const expected = await fundBalance(prisma, storeId, "SAFE");
    const diff = counted - expected;
    const reason = note?.trim() || null;
    if (diff !== 0 && !reason) {
      return res.status(400).json(
        isAdminLike(me.role)
          ? { error: "Tiền trong két lệch so với sổ — vui lòng ghi lý do.", code: "COUNT_MISMATCH", expected, diff }
          : { error: "Tiền đếm được không khớp với sổ. Đếm lại — nếu chắc chắn đúng, ghi lý do rồi đóng két.", code: "COUNT_MISMATCH" },
      );
    }

    const closed = await prisma.$transaction(async (tx) => {
      if (diff !== 0) {
        await createEntry(tx, {
          storeId,
          kind: "ADJUST",
          fromFund: diff < 0 ? "SAFE" : null,
          toFund: diff > 0 ? "SAFE" : null,
          safeSessionId: session.id,
          category: "SAFE_DIFF",
          amount: Math.abs(diff),
          description: `${diff > 0 ? "Thừa" : "Thiếu"} khi kiểm két: ${reason}`,
          createdById: me.id,
          approvedById: me.id,
          approvedAt: new Date(),
        });
      }
      return tx.safeSession.update({
        where: { id: session.id },
        data: {
          closedById: me.id,
          closedAt: new Date(),
          expectedBalance: expected,
          countedBalance: counted,
          difference: diff,
          denominations: denom?.json ?? null,
          note: reason,
        },
      });
    });
    audit(me.id, "SAFE_CLOSE", `Két #${session.id}`, `Sổ ${vnd(expected)}, đếm ${vnd(counted)}, lệch ${vnd(diff)}${reason ? ` — ${reason}` : ""}`);
    res.json(closed);
  });

  /* ═══════════════ PHIẾU THU / CHI / CHUYỂN QUỸ ═══════════════ */

  r.get("/cash/entries", ...cashier, async (req, res) => {
    const me = staffOf(req);
    const { from, to, status } = req.query as { from?: string; to?: string; status?: string };
    const start = from ? dayRange(from).start : new Date(Date.now() - 30 * 86400_000);
    const end = to ? dayRange(to).end : new Date(Date.now() + 86400_000);
    const rows = await prisma.cashEntry.findMany({
      where: {
        ...storeWhere(req),
        createdAt: { gte: start, lt: end },
        ...(status ? { status } : {}),
        // Thu ngân chỉ xem phiếu mình lập + phiếu két/ngăn kéo (không xem quỹ ngân hàng)
        ...(isAdminLike(me.role)
          ? {}
          : {
              OR: [
                { createdById: me.id },
                { AND: [{ OR: [{ fromFund: null }, { fromFund: { in: ["SAFE", "DRAWER"] } }] }, { OR: [{ toFund: null }, { toFund: { in: ["SAFE", "DRAWER"] } }] }] },
              ],
            }),
      },
      include: entryInclude,
      orderBy: { id: "desc" },
      take: 1000,
    });
    res.json(rows);
  });

  /**
   * Lập phiếu. Body: { type: IN|OUT|TRANSFER, category, amount, fund (IN/OUT), description, photo (data URL) }
   * - Đụng tới ngăn kéo: dùng ca đang mở của người lập.
   * - Lấy tiền ra khỏi két / bỏ tiền vào két (trừ nộp ca): két phải đang mở.
   * - Quỹ ngân hàng & các danh mục quản lý: chỉ quản lý.
   * - Thu ngân chi: bắt buộc ảnh chứng từ; vượt hạn mức → chờ quản lý duyệt.
   */
  r.post("/cash/entries", ...cashierStore, async (req, res) => {
    const me = staffOf(req);
    const storeId = mustStoreId(req);
    const manager = isAdminLike(me.role);
    const body = req.body as { type?: string; category?: string; amount?: number; fund?: string; description?: string; photo?: string };
    const cat = body.category ? CATEGORIES[body.category] : undefined;
    if (!cat || cat.system || cat.kind !== body.type) return res.status(400).json({ error: "Loại phiếu không hợp lệ." });
    if (cat.managerOnly && !manager) return res.status(403).json({ error: "Chỉ quản lý được lập loại phiếu này." });
    const amount = Number(body.amount);
    if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: "Số tiền không hợp lệ." });
    const description = body.description?.trim() || null;
    if (!description) return res.status(400).json({ error: "Ghi nội dung phiếu." });

    let fromFund: Fund | null = null;
    let toFund: Fund | null = null;
    if (cat.kind === "TRANSFER") {
      ({ from: fromFund, to: toFund } = TRANSFER_ROUTES[body.category!]);
    } else {
      const fund = body.fund as Fund;
      if (!["SAFE", "DRAWER", "BANK"].includes(fund)) return res.status(400).json({ error: "Chọn quỹ." });
      if (cat.kind === "OUT") fromFund = fund;
      else toFund = fund;
    }
    if ((fromFund === "BANK" || toFund === "BANK") && !manager) return res.status(403).json({ error: "Chỉ quản lý thao tác quỹ ngân hàng." });

    let shiftId: number | null = null;
    if (fromFund === "DRAWER" || toFund === "DRAWER") {
      const shift = await prisma.shift.findFirst({ where: { storeId, staffId: me.id, endTime: null } });
      if (!shift) return res.status(400).json({ error: "Bạn chưa mở ca — không có ngăn kéo để thu/chi." });
      shiftId = shift.id;
    }
    const session = await openSafeSession(prisma, storeId);
    if ((fromFund === "SAFE" || toFund === "SAFE") && !session && body.category !== "DROP") {
      return res.status(400).json({ error: "Mở két trước khi lấy / bỏ tiền vào két." });
    }

    const settings = await getStoreSettings(prisma);
    const needsApproval = cat.kind === "OUT" && !manager && amount > settings.pettyCashLimit;
    if (cat.kind === "OUT" && !manager && !body.photo) return res.status(400).json({ error: "Chụp ảnh hoá đơn / chứng từ cho phiếu chi." });
    if (fromFund && !needsApproval) {
      const avail = await availableIn(prisma, storeId, fromFund, shiftId);
      if (amount > avail) return res.status(400).json({ error: manager ? `Không đủ tiền: quỹ chỉ còn ${vnd(avail)} theo sổ.` : "Không đủ tiền trong quỹ theo sổ." });
    }

    let attachmentUrl: string | null = null;
    if (body.photo) {
      try {
        attachmentUrl = await saveDataUrlImage(body.photo);
      } catch (e) {
        return res.status(400).json({ error: e instanceof Error ? e.message : "Ảnh không hợp lệ" });
      }
    }

    const entry = await createEntry(prisma, {
      storeId,
      kind: cat.kind,
      fromFund,
      toFund,
      shiftId,
      safeSessionId: fromFund === "SAFE" || toFund === "SAFE" ? session?.id ?? null : null,
      category: body.category!,
      amount,
      description,
      attachmentUrl,
      status: needsApproval ? "PENDING" : "APPROVED",
      createdById: me.id,
      ...(needsApproval ? {} : { approvedById: me.id, approvedAt: new Date() }),
    });
    audit(me.id, "CASH_ENTRY", entry.code, `${cat.label} ${vnd(amount)}${needsApproval ? " (chờ duyệt)" : ""} — ${description}`);
    res.status(201).json(entry);
  });

  /** Quản lý duyệt phiếu chi vượt hạn mức — lúc này tiền mới rời quỹ */
  r.post("/cash/entries/:id/approve", ...manager, async (req, res) => {
    const me = staffOf(req);
    const e = await prisma.cashEntry.findUnique({ where: { id: idOf(req) } });
    if (!e || !inStore(req, e)) return res.status(404).json({ error: "Không tìm thấy phiếu." });
    if (e.status !== "PENDING") return res.status(400).json({ error: "Phiếu không ở trạng thái chờ duyệt." });
    if (e.fromFund) {
      const avail = await availableIn(prisma, e.storeId, e.fromFund as Fund, e.shiftId);
      if (e.amount > avail) return res.status(400).json({ error: `Không đủ tiền: quỹ chỉ còn ${vnd(avail)} theo sổ.` });
    }
    const session = e.fromFund === "SAFE" ? await openSafeSession(prisma, e.storeId) : null;
    if (e.fromFund === "SAFE" && !session) return res.status(400).json({ error: "Mở két trước khi duyệt phiếu chi từ két." });
    const updated = await prisma.cashEntry.update({
      where: { id: e.id },
      data: { status: "APPROVED", approvedById: me.id, approvedAt: new Date(), ...(session ? { safeSessionId: session.id } : {}) },
    });
    audit(me.id, "CASH_APPROVE", e.code, vnd(e.amount));
    res.json(updated);
  });

  r.post("/cash/entries/:id/reject", ...manager, async (req, res) => {
    const me = staffOf(req);
    const reason = String((req.body as { reason?: string })?.reason ?? "").trim();
    if (!reason) return res.status(400).json({ error: "Ghi lý do từ chối." });
    const e = await prisma.cashEntry.findUnique({ where: { id: idOf(req) } });
    if (!e || !inStore(req, e)) return res.status(404).json({ error: "Không tìm thấy phiếu." });
    if (e.status !== "PENDING") return res.status(400).json({ error: "Phiếu không ở trạng thái chờ duyệt." });
    const updated = await prisma.cashEntry.update({ where: { id: e.id }, data: { status: "REJECTED", rejectReason: reason, approvedById: me.id, approvedAt: new Date() } });
    audit(me.id, "CASH_REJECT", e.code, reason);
    res.json(updated);
  });

  /** Người lập huỷ phiếu đang chờ duyệt. Phiếu đã duyệt không sửa/xoá — sai thì lập phiếu ngược lại. */
  r.post("/cash/entries/:id/cancel", ...cashier, async (req, res) => {
    const me = staffOf(req);
    const e = await prisma.cashEntry.findUnique({ where: { id: idOf(req) } });
    if (!e || !inStore(req, e)) return res.status(404).json({ error: "Không tìm thấy phiếu." });
    if (e.status !== "PENDING") return res.status(400).json({ error: "Chỉ huỷ được phiếu đang chờ duyệt." });
    if (e.createdById !== me.id && !isAdminLike(me.role)) return res.status(403).json({ error: "Không phải phiếu của bạn." });
    res.json(await prisma.cashEntry.update({ where: { id: e.id }, data: { status: "CANCELLED" } }));
  });

  /* ═══════════════ BÁO CÁO CA ═══════════════ */

  /** Danh sách ca: quản lý xem cả chi nhánh, thu ngân xem ca của mình */
  r.get("/cash/shifts", ...cashier, async (req, res) => {
    const me = staffOf(req);
    const { from, to } = req.query as { from?: string; to?: string };
    const start = from ? dayRange(from).start : new Date(Date.now() - 31 * 86400_000);
    const end = to ? dayRange(to).end : new Date(Date.now() + 86400_000);
    const shifts = await prisma.shift.findMany({
      where: {
        ...storeWhere(req),
        // Ca chưa đóng luôn hiện (kể cả mở từ lâu) để không bị quên
        OR: [{ startTime: { gte: start, lt: end } }, { endTime: null }],
        ...(isAdminLike(me.role) ? {} : { staffId: me.id }),
      },
      include: { staff: staffName, reviewedBy: staffName, store: { select: { name: true } } },
      orderBy: { id: "desc" },
    });
    // Ca đang mở: quản lý thấy tiền dự kiến tạm thời; thu ngân đếm mù nên không thấy
    const rows = isAdminLike(me.role)
      ? await Promise.all(shifts.map(async (s) => (s.endTime ? s : { ...s, expectedCash: (await drawerSummary(prisma, s)).expectedCash })))
      : shifts;
    res.json(rows);
  });

  r.get("/cash/shifts/:id/report", ...cashier, async (req, res) => {
    const me = staffOf(req);
    const shift = await prisma.shift.findUnique({
      where: { id: idOf(req) },
      include: { staff: staffName, reviewedBy: staffName, store: { select: { name: true, address: true } } },
    });
    if (!shift || !inStore(req, shift) || (!isAdminLike(me.role) && shift.staffId !== me.id)) {
      return res.status(404).json({ error: "Không tìm thấy ca." });
    }
    const [payments, entries, drawer] = await Promise.all([
      prisma.payment.findMany({
        where: { shiftId: shift.id },
        include: { order: { select: { id: true, discountAmt: true, pointsRedeemAmt: true, shippingFee: true, orderType: true } } },
      }),
      prisma.cashEntry.findMany({ where: { shiftId: shift.id }, include: entryInclude, orderBy: { id: "asc" } }),
      drawerSummary(prisma, shift),
    ]);
    // Dòng tiền thật: bỏ điểm đổi và dòng hoàn ra điểm
    const money = payments.filter((p) => !NON_MONEY_METHODS.includes(p.method));
    const orders = new Map(payments.map((p) => [p.order.id, p.order]));
    const cancelled = await prisma.order.count({
      where: { storeId: shift.storeId, status: "Cancelled", createdAt: { gte: shift.startTime, lt: shift.endTime ?? new Date() } },
    });
    // Đếm mù: ca chưa đóng, thu ngân không thấy tiền mặt (tổng tiền mặt bán, tiền dự kiến) — chỉ thấy tiền online/chuyển khoản
    const blind = !shift.endTime && !isAdminLike(me.role);
    res.json({
      shift,
      blind,
      byMethod: groupByMethod(blind ? payments.filter((p) => isBankMethod(p.method)) : payments),
      totals: {
        orders: orders.size,
        money: blind ? null : money.reduce((s, p) => s + p.amount, 0),
        cash: blind ? null : money.filter((p) => !isBankMethod(p.method)).reduce((s, p) => s + p.amount, 0),
        bank: money.filter((p) => isBankMethod(p.method)).reduce((s, p) => s + p.amount, 0),
        points: payments.filter((p) => p.method === "Points").reduce((s, p) => s + p.amount, 0),
        discounts: [...orders.values()].reduce((s, o) => s + o.discountAmt, 0),
        shippingFee: [...orders.values()].reduce((s, o) => s + o.shippingFee, 0),
        cancelledOrders: cancelled,
      },
      drawer: shift.endTime
        ? { ...drawer, expectedCash: shift.expectedCash ?? drawer.expectedCash, actualCash: shift.actualCash, difference: shift.differenceAmt }
        : blind
          ? null
          : drawer,
      denominations: shift.denominations ? JSON.parse(shift.denominations) : null,
      entries,
    });
  });

  /** Quản lý xác nhận báo cáo ca (đã kiểm tra chênh lệch) */
  r.post("/cash/shifts/:id/review", ...manager, async (req, res) => {
    const me = staffOf(req);
    const shift = await prisma.shift.findUnique({ where: { id: idOf(req) } });
    if (!shift || !inStore(req, shift)) return res.status(404).json({ error: "Không tìm thấy ca." });
    if (!shift.endTime) return res.status(400).json({ error: "Ca chưa đóng." });
    const note = String((req.body as { note?: string })?.note ?? "").trim() || null;
    const updated = await prisma.shift.update({ where: { id: shift.id }, data: { reviewedById: me.id, reviewedAt: new Date(), reviewNote: note } });
    audit(me.id, "SHIFT_REVIEW", `Ca #${shift.id}`, note ?? "");
    res.json(updated);
  });

  /* ═══════════════ BÁO CÁO CUỐI NGÀY ═══════════════ */

  r.get("/cash/daily", ...managerStore, async (req, res) => {
    const storeId = mustStoreId(req);
    const { start, end } = dayRange(req.query.date as string | undefined);
    const [store, payments, shifts, entries, sessions, safeEnd, bankEnd, safeStart, bankStart] = await Promise.all([
      prisma.store.findUnique({ where: { id: storeId }, select: { name: true, address: true } }),
      prisma.payment.findMany({
        // Gồm cả đơn đã hoàn 100% ra điểm: tiền đã vào tài khoản trong ngày (khớp số dư ngân hàng)
        where: { paymentTime: { gte: start, lt: end }, order: { storeId, OR: [{ status: "Paid" }, { refundStatus: "Refunded" }] } },
        include: { order: { select: { id: true, subTotal: true, discountAmt: true, vatAmount: true, shippingFee: true, orderType: true } } },
      }),
      prisma.shift.findMany({
        where: { storeId, startTime: { gte: start, lt: end } },
        include: { staff: staffName, reviewedBy: staffName },
        orderBy: { id: "asc" },
      }),
      prisma.cashEntry.findMany({ where: { storeId, createdAt: { gte: start, lt: end } }, include: entryInclude, orderBy: { id: "asc" } }),
      prisma.safeSession.findMany({
        where: { storeId, openedAt: { gte: start, lt: end } },
        include: { openedBy: staffName, closedBy: staffName },
        orderBy: { id: "asc" },
      }),
      fundBalance(prisma, storeId, "SAFE", new Date(end.getTime() - 1)),
      fundBalance(prisma, storeId, "BANK", new Date(end.getTime() - 1)),
      fundBalance(prisma, storeId, "SAFE", new Date(start.getTime() - 1)),
      fundBalance(prisma, storeId, "BANK", new Date(start.getTime() - 1)),
    ]);
    const money = payments.filter((p) => !NON_MONEY_METHODS.includes(p.method));
    const orders = new Map(payments.map((p) => [p.order.id, p.order]));
    const approved = entries.filter((e) => e.status === "APPROVED");
    const byCategory = (kind: string) => {
      const m = new Map<string, { category: string; label: string; count: number; amount: number }>();
      for (const e of approved.filter((x) => x.kind === kind)) {
        const row = m.get(e.category) ?? { category: e.category, label: CATEGORIES[e.category]?.label ?? e.category, count: 0, amount: 0 };
        row.count += 1;
        row.amount += e.amount;
        m.set(e.category, row);
      }
      return [...m.values()];
    };
    const shiftRows = await Promise.all(
      shifts.map(async (s) => (s.endTime ? s : { ...s, expectedCash: (await drawerSummary(prisma, s)).expectedCash })),
    );
    const totalMoney = money.reduce((s, p) => s + p.amount, 0);
    const shippingFee = [...orders.values()].reduce((s, o) => s + o.shippingFee, 0);
    res.json({
      date: start.toISOString(),
      store,
      sales: {
        orders: orders.size,
        subTotal: [...orders.values()].reduce((s, o) => s + o.subTotal, 0),
        discounts: [...orders.values()].reduce((s, o) => s + o.discountAmt, 0),
        vat: [...orders.values()].reduce((s, o) => s + o.vatAmount, 0),
        points: payments.filter((p) => p.method === "Points").reduce((s, p) => s + p.amount, 0),
        shippingFee,
        totalCollected: totalMoney,
        /** Doanh thu quán = tiền thu − phí ship (thu hộ shipper) */
        netRevenue: totalMoney - shippingFee,
      },
      byMethod: groupByMethod(payments),
      cashTotal: money.filter((p) => !isBankMethod(p.method)).reduce((s, p) => s + p.amount, 0),
      bankTotal: money.filter((p) => isBankMethod(p.method)).reduce((s, p) => s + p.amount, 0),
      /** Thanh toán online chưa thu ngân nào xác nhận vào ca */
      unassignedOnline: money.filter((p) => !p.shiftId).reduce((s, p) => s + p.amount, 0),
      shifts: shiftRows,
      income: byCategory("IN"),
      expense: byCategory("OUT"),
      adjustments: approved.filter((e) => e.kind === "ADJUST"),
      pending: entries.filter((e) => e.status === "PENDING"),
      entries,
      safeSessions: sessions,
      funds: { safeStart, safeEnd, bankStart, bankEnd },
    });
  });

  /* ═══════════════ CÔNG NỢ NHÀ CUNG CẤP ═══════════════ */

  const billInclude = {
    supplier: { select: { id: true, name: true, phone: true, paymentTermDays: true } },
    store: { select: { id: true, name: true } },
    grn: { select: { code: true, po: { select: { code: true } } } },
    createdBy: staffName,
  } as const;

  r.get("/cash/payables", ...manager, async (req, res) => {
    const bills = await prisma.supplierBill.findMany({
      where: { ...storeWhere(req), status: { not: "CANCELLED" } },
      include: { ...billInclude, payments: { where: { status: "APPROVED" }, include: { createdBy: staffName }, orderBy: { id: "asc" } } },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    });
    const now = new Date();
    res.json(bills.map((b) => ({ ...b, remaining: b.amount - b.paidAmount, overdue: b.status !== "PAID" && b.dueDate < now })));
  });

  /** Ghi nhận hoá đơn mua ngoài (không qua quy trình đặt hàng) */
  r.post("/cash/payables", ...managerStore, async (req, res) => {
    const me = staffOf(req);
    const storeId = mustStoreId(req);
    const { supplierId, amount, billDate, dueDate, note } = req.body as { supplierId?: number; amount?: number; billDate?: string; dueDate?: string; note?: string };
    const supplier = Number.isInteger(supplierId) ? await prisma.supplier.findUnique({ where: { id: supplierId } }) : null;
    if (!supplier) return res.status(400).json({ error: "Chọn nhà cung cấp." });
    if (!Number.isInteger(amount) || (amount as number) <= 0) return res.status(400).json({ error: "Số tiền không hợp lệ." });
    const bd = billDate ? new Date(billDate) : new Date();
    const dd = dueDate ? new Date(dueDate) : new Date(bd.getTime() + supplier.paymentTermDays * 86400_000);
    if (Number.isNaN(bd.getTime()) || Number.isNaN(dd.getTime())) return res.status(400).json({ error: "Ngày không hợp lệ." });
    const bill = await createBill(prisma, { storeId, supplierId: supplier.id, source: "MANUAL", amount: amount as number, billDate: bd, dueDate: dd, note: note?.trim() || null, createdById: me.id });
    audit(me.id, "PAYABLE_CREATE", bill.code, `${supplier.name} ${vnd(bill.amount)}`);
    res.status(201).json(bill);
  });

  /** Trả nợ nhà cung cấp (một phần hoặc toàn bộ) — tự lập phiếu chi "Trả nhà cung cấp" */
  r.post("/cash/payables/:id/pay", ...managerStore, async (req, res) => {
    const me = staffOf(req);
    const { amount, fund, description, photo } = req.body as { amount?: number; fund?: string; description?: string; photo?: string };
    const bill = await prisma.supplierBill.findUnique({ where: { id: idOf(req) }, include: { supplier: true } });
    if (!bill || !inStore(req, bill)) return res.status(404).json({ error: "Không tìm thấy công nợ." });
    if (["PAID", "CANCELLED"].includes(bill.status)) return res.status(400).json({ error: "Công nợ đã tất toán / đã huỷ." });
    const amt = Number(amount);
    const remaining = bill.amount - bill.paidAmount;
    if (!Number.isInteger(amt) || amt <= 0 || amt > remaining) return res.status(400).json({ error: `Số tiền trả phải từ 1đ đến ${vnd(remaining)}.` });
    if (fund !== "SAFE" && fund !== "BANK") return res.status(400).json({ error: "Chọn trả bằng tiền mặt (két) hoặc chuyển khoản (ngân hàng)." });
    const session = fund === "SAFE" ? await openSafeSession(prisma, bill.storeId) : null;
    if (fund === "SAFE" && !session) return res.status(400).json({ error: "Mở két trước khi trả bằng tiền mặt." });
    const avail = await fundBalance(prisma, bill.storeId, fund);
    if (amt > avail) return res.status(400).json({ error: `Không đủ tiền: quỹ chỉ còn ${vnd(avail)} theo sổ.` });
    let attachmentUrl: string | null = null;
    if (photo) {
      try {
        attachmentUrl = await saveDataUrlImage(photo);
      } catch (e) {
        return res.status(400).json({ error: e instanceof Error ? e.message : "Ảnh không hợp lệ" });
      }
    }
    const result = await prisma.$transaction(async (tx) => {
      const entry = await createEntry(tx, {
        storeId: bill.storeId,
        kind: "OUT",
        fromFund: fund,
        safeSessionId: session?.id ?? null,
        category: "SUPPLIER_PAYMENT",
        amount: amt,
        description: description?.trim() || `Trả ${bill.supplier.name} — ${bill.code}`,
        attachmentUrl,
        supplierBillId: bill.id,
        createdById: me.id,
        approvedById: me.id,
        approvedAt: new Date(),
      });
      const paid = bill.paidAmount + amt;
      const updated = await tx.supplierBill.update({
        where: { id: bill.id },
        data: { paidAmount: paid, status: paid >= bill.amount ? "PAID" : "PARTIAL" },
      });
      return { entry, bill: updated };
    });
    audit(me.id, "PAYABLE_PAY", bill.code, `${vnd(amt)} qua ${fund === "BANK" ? "chuyển khoản" : "tiền mặt"}`);
    res.json(result);
  });

  r.post("/cash/payables/:id/cancel", ...managerStore, async (req, res) => {
    const me = staffOf(req);
    const bill = await prisma.supplierBill.findUnique({ where: { id: idOf(req) } });
    if (!bill || !inStore(req, bill)) return res.status(404).json({ error: "Không tìm thấy công nợ." });
    if (bill.paidAmount > 0) return res.status(400).json({ error: "Đã trả một phần — không huỷ được." });
    const updated = await prisma.supplierBill.update({ where: { id: bill.id }, data: { status: "CANCELLED" } });
    audit(me.id, "PAYABLE_CANCEL", bill.code, "");
    res.json(updated);
  });

  /* ═══════════════ LÃI LỖ ═══════════════ */

  /**
   * Lãi lỗ theo kỳ:
   *   Doanh thu thuần = tiền thu (không gồm điểm) − phí ship (thu hộ shipper)
   *   − Giá vốn món bán · − Hao hụt · − Chi phí vận hành (phiếu chi, trừ trả NCC vì đã nằm trong giá vốn)
   *   − Lương (không gồm phần phí ship đã cộng cho shipper)
   */
  r.get("/cash/pnl", ...manager, async (req, res) => {
    const { from, to } = req.query as { from?: string; to?: string };
    const start = from ? dayRange(from).start : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = to ? dayRange(to).end : new Date();
    const sw = storeWhere(req);
    const [payments, lines, waste, expenses, payslips] = await Promise.all([
      prisma.payment.findMany({
        where: { paymentTime: { gte: start, lt: end }, order: { ...sw, status: "Paid" } },
        select: { method: true, amount: true, order: { select: { id: true, shippingFee: true } } },
      }),
      prisma.orderDetail.findMany({
        where: { order: { ...sw, status: "Paid", createdAt: { gte: start, lt: end } } },
        select: { quantity: true, product: { select: { costPrice: true } } },
      }),
      prisma.wasteLog.aggregate({ where: { ...sw, createdAt: { gte: start, lt: end } }, _sum: { costValue: true } }),
      prisma.cashEntry.findMany({
        where: { ...sw, kind: "OUT", status: "APPROVED", category: { not: "SUPPLIER_PAYMENT" }, createdAt: { gte: start, lt: end } },
        select: { category: true, amount: true },
      }),
      prisma.payslip.findMany({ where: { staff: sw }, select: { month: true, year: true, netSalary: true, shippingIncome: true } }),
    ]);
    const money = payments.filter((p) => p.method !== "Points");
    const collected = money.reduce((s, p) => s + p.amount, 0);
    // Phí ship trừ theo đơn có tiền thu trong kỳ (dòng hoàn ra điểm ở kỳ sau không trừ lại)
    const orderShip = new Map(payments.filter((p) => p.amount > 0).map((p) => [p.order.id, p.order.shippingFee]));
    const shippingFee = [...orderShip.values()].reduce((s, v) => s + v, 0);
    const revenue = collected - shippingFee;
    const cogs = lines.reduce((s, l) => s + l.quantity * l.product.costPrice, 0);
    const wasteCost = waste._sum.costValue ?? 0;
    const expenseByCat = new Map<string, number>();
    for (const e of expenses) expenseByCat.set(e.category, (expenseByCat.get(e.category) ?? 0) + e.amount);
    const operating = expenses.reduce((s, e) => s + e.amount, 0);
    // Lương: các tháng nằm trong kỳ
    const inRange = (m: number, y: number) => {
      const d = new Date(y, m - 1, 1);
      return d >= new Date(start.getFullYear(), start.getMonth(), 1) && d < end;
    };
    const salary = payslips.filter((p) => inRange(p.month, p.year)).reduce((s, p) => s + p.netSalary - p.shippingIncome, 0);
    const grossProfit = revenue - cogs;
    res.json({
      from: start.toISOString(),
      to: end.toISOString(),
      collected,
      points: payments.filter((p) => p.method === "Points").reduce((s, p) => s + p.amount, 0),
      shippingFee,
      revenue,
      cogs,
      grossProfit,
      wasteCost,
      operating,
      operatingByCategory: [...expenseByCat.entries()].map(([category, amount]) => ({ category, label: CATEGORIES[category]?.label ?? category, amount })),
      salary,
      netProfit: grossProfit - wasteCost - operating - salary,
    });
  });

  return r;
}

