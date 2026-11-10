/**
 * routes/shiftWishes.ts — Nguyện vọng xếp ca viết tự nhiên.
 *
 * Nhân viên (vai trò được xếp ca):
 * GET  /shift-wishes/my?month=        — nguyện vọng + ràng buộc + hạn chót + tháng đã công bố chưa + aiAvailable
 * POST /shift-wishes/parse            — { month, text } AI đọc câu → ràng buộc (không lưu; 503 khi SHIFT_WISH_AI tắt)
 * PUT  /shift-wishes/my               — { month, text, rules, confirm } lưu nháp / xác nhận gửi
 * Quản lý (chi nhánh mình):
 * GET  /shift-wishes?month=           — trạng thái từng nhân viên + bản đồ nhiệt ngày × ca × vị trí
 * POST /shift-wishes/remind           — { month } nhắc người chưa gửi
 */
import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { attachStaff, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { mustStoreId } from "../lib/storeScope.js";
import { SHIFT_ROLES } from "../lib/hrConfig.js";
import { bizDayStart, bizToday } from "../lib/bizTime.js";
import { aiErrorMessage } from "../ai/gemini.js";
import { getAiSetting, isAiEnabled } from "../ai/settings.js";
import { ruleFromRow, validateRules, weekdayOf, wishCells, type WishRule } from "../lib/shiftWish/normalize.js";
import { MAX_WISH_TEXT, parseWish } from "../lib/shiftWish/parse.js";
import { addMonths, currentMonth, deadlineOf, isPastDeadline, remindMissing, shiftStaffWhere, wishContext } from "../lib/shiftWish/context.js";

const FEATURE = "SHIFT_WISH_AI";
const dateOnly = (s: string) => new Date(`${s}T00:00:00Z`);

/** Rule → dữ liệu ghi DB */
const ruleData = (r: WishRule) => ({
  type: r.type,
  dates: r.dates ?? undefined,
  weekdays: r.weekdays ?? undefined,
  fromDate: r.fromDate ? dateOnly(r.fromDate) : null,
  toDate: r.toDate ? dateOnly(r.toDate) : null,
  shiftCodes: r.shiftCodes ?? undefined,
  timeFrom: r.timeFrom,
  timeTo: r.timeTo,
  count: r.count,
  period: r.period,
  quote: r.quote,
  source: r.source,
  confidence: r.confidence,
});

export function shiftWishesRouter(prisma: PrismaClient) {
  const r = Router();
  const staffOnly = [attachStaff(prisma), requireRoles(...SHIFT_ROLES)];
  const mgmtOnly = [attachStaff(prisma), requireRoles("Admin"), requireStore];

  /** Tháng nhân viên được gửi: tháng này đến 2 tháng sau; mặc định tháng sau */
  const staffMonth = (v: unknown): string | null => {
    const cur = currentMonth();
    const month = typeof v === "string" && v ? v : addMonths(cur, 1);
    return /^\d{4}-\d{2}$/.test(month) && month >= cur && month <= addMonths(cur, 2) ? month : null;
  };

  const isPublished = async (storeId: number, month: string) =>
    !!(await prisma.scheduleMonth.findUnique({ where: { storeId_month: { storeId, month } } }))?.publishedAt;

  const loadWish = (staffId: number, month: string) =>
    prisma.shiftWish.findUnique({ where: { staffId_month: { staffId, month } }, include: { rules: { orderBy: { id: "asc" } } } });

  const wishOut = (w: NonNullable<Awaited<ReturnType<typeof loadWish>>>) => ({
    id: w.id, status: w.status, late: w.late, rawText: w.rawText ?? "", submittedAt: w.submittedAt, updatedAt: w.updatedAt,
  });

  /* ── GET /shift-wishes/my ── */
  r.get("/shift-wishes/my", ...staffOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const month = staffMonth(req.query.month);
    if (!month) return res.status(400).json({ error: "Chỉ gửi nguyện vọng cho tháng này đến 2 tháng tới." });
    const w = await wishContext(prisma, month);
    if (!w) return res.status(400).json({ error: "Tháng không hợp lệ." });
    const [wish, published, aiAvailable] = await Promise.all([loadWish(me.id, month), isPublished(me.storeId!, month), isAiEnabled(FEATURE)]);
    res.json({
      month,
      role: me.role,
      deadline: deadlineOf(month, w.config.wishDeadlineDay),
      pastDeadline: isPastDeadline(month, w.config.wishDeadlineDay),
      published,
      aiAvailable,
      maxRules: w.ctx.maxRules,
      maxText: MAX_WISH_TEXT,
      days: w.ctx.days,
      shifts: w.templates.map((t) => ({ code: t.code, name: t.name, startMin: t.startMin, endMin: t.endMin, color: t.color })),
      rules: { maxShiftsPerWeek: w.config.maxShiftsPerWeek, minRestHours: w.config.minRestHours },
      wish: wish ? wishOut(wish) : null,
      wishRules: wish ? wish.rules.map(ruleFromRow) : [],
    });
  });

  /* ── POST /shift-wishes/parse — AI đọc câu (không lưu) ── */
  r.post("/shift-wishes/parse", ...staffOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const b = req.body as { month?: string; text?: unknown };
    const month = staffMonth(b.month);
    if (!month) return res.status(400).json({ error: "Chỉ gửi nguyện vọng cho tháng này đến 2 tháng tới." });
    const text = typeof b.text === "string" ? b.text.trim() : "";
    if (text.length < 5) return res.status(400).json({ error: "Hãy viết nguyện vọng của bạn trước." });
    if (text.length > MAX_WISH_TEXT) return res.status(400).json({ error: `Tối đa ${MAX_WISH_TEXT} ký tự.` });

    if (!(await isAiEnabled(FEATURE))) return res.status(503).json({ unavailable: true, reason: "AI đọc nguyện vọng đang tắt — bạn thêm ràng buộc bằng form bên dưới nhé." });
    const setting = await getAiSetting(FEATURE);
    const hourAgo = new Date(Date.now() - 3_600_000);
    const [today, mine] = await Promise.all([
      setting.dailyLimit ? prisma.aiCallLog.count({ where: { feature: FEATURE, createdAt: { gte: bizDayStart(bizToday()) } } }) : 0,
      setting.hourlyPerUser ? prisma.aiCallLog.count({ where: { feature: FEATURE, staffId: me.id, createdAt: { gte: hourAgo } } }) : 0,
    ]);
    if (setting.dailyLimit && today >= setting.dailyLimit) return res.status(503).json({ unavailable: true, reason: "Hôm nay AI đã hết lượt đọc nguyện vọng — bạn thêm ràng buộc bằng form nhé." });
    if (setting.hourlyPerUser && mine >= setting.hourlyPerUser) {
      return res.status(429).json({ error: `Bạn đã nhờ AI đọc ${setting.hourlyPerUser} lần trong 1 giờ qua — thử lại sau ít phút, hoặc sửa ràng buộc bằng tay nhé.` });
    }

    const w = await wishContext(prisma, month);
    if (!w) return res.status(400).json({ error: "Tháng không hợp lệ." });
    if (!w.ctx.templates.length) return res.status(400).json({ error: "Chưa có ca làm nào đang dùng." });
    const t0 = Date.now();
    const log = (data: { status: "OK" | "ERROR"; model?: string; tokensIn?: number; tokensOut?: number; error?: string; summary?: string }) =>
      prisma.aiCallLog
        .create({ data: { feature: FEATURE, storeId: me.storeId, staffId: me.id, inputKind: "text", latencyMs: Date.now() - t0, transcript: text.slice(0, 500), ...data } })
        .catch(() => {});
    try {
      const out = await parseWish({
        text, ctx: w.ctx, role: me.role, maxShiftsPerWeek: w.config.maxShiftsPerWeek, minRestHours: w.config.minRestHours, today: bizToday(),
      });
      const counts = out.rules.reduce<Record<string, number>>((m, x) => ({ ...m, [x.type]: (m[x.type] ?? 0) + 1 }), {});
      const summary = [
        Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ") || "không có ràng buộc",
        out.unclear.length ? `chưa hiểu: ${out.unclear.join("; ")}` : "",
        out.warnings.length ? `${out.warnings.length} cảnh báo` : "",
      ].filter(Boolean).join(" | ");
      await log({ status: "OK", model: out.model, tokensIn: out.tokensIn, tokensOut: out.tokensOut, summary: summary.slice(0, 500) });
      res.json({ rules: out.rules, leaveSuggestions: out.leaveSuggestions, unclear: out.unclear, warnings: out.warnings, narrow: out.narrow, latencyMs: out.latencyMs });
    } catch (e) {
      const reason = aiErrorMessage(e);
      console.warn(`[shift-wish] staff ${me.id}: ${reason}`);
      await log({ status: "ERROR", error: reason.slice(0, 500) });
      res.status(503).json({ unavailable: true, reason: /abort|timeout/i.test(e instanceof Error ? `${e.name} ${e.message}` : "") ? "AI phản hồi quá lâu, bạn thử lại hoặc thêm ràng buộc bằng tay nhé." : reason });
    }
  });

  /* ── PUT /shift-wishes/my — lưu nháp / xác nhận ── */
  r.put("/shift-wishes/my", ...staffOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const b = req.body as { month?: string; text?: unknown; rules?: unknown; confirm?: unknown };
    const month = staffMonth(b.month);
    if (!month) return res.status(400).json({ error: "Chỉ gửi nguyện vọng cho tháng này đến 2 tháng tới." });
    const text = typeof b.text === "string" ? b.text.trim() : "";
    if (text.length > MAX_WISH_TEXT) return res.status(400).json({ error: `Tối đa ${MAX_WISH_TEXT} ký tự.` });
    if (await isPublished(me.storeId!, month)) {
      return res.status(409).json({ error: `Lịch tháng ${month.slice(5)}/${month.slice(0, 4)} đã công bố, không sửa nguyện vọng được nữa. Cần đổi ca hãy dùng "Đổi ca" hoặc gửi đơn từ.` });
    }
    const w = await wishContext(prisma, month);
    if (!w) return res.status(400).json({ error: "Tháng không hợp lệ." });
    const checked = validateRules(b.rules, w.ctx);
    const confirm = b.confirm === true;
    if (confirm && !checked.rules.length && !text) return res.status(400).json({ error: "Chưa có nguyện vọng nào để gửi." });

    const late = confirm && isPastDeadline(month, w.config.wishDeadlineDay);
    const data = {
      storeId: me.storeId!, rawText: text || null, status: confirm ? "CONFIRMED" : "DRAFT", late,
      submittedAt: confirm ? new Date() : null,
    };
    await prisma.$transaction(async (tx) => {
      const wish = await tx.shiftWish.upsert({
        where: { staffId_month: { staffId: me.id, month } },
        create: { staffId: me.id, month, ...data },
        update: data,
      });
      await tx.shiftWishRule.deleteMany({ where: { wishId: wish.id } });
      if (checked.rules.length) await tx.shiftWishRule.createMany({ data: checked.rules.map((x) => ({ wishId: wish.id, ...ruleData(x) })) });
    });
    const saved = (await loadWish(me.id, month))!;
    res.json({ ok: true, wish: wishOut(saved), wishRules: saved.rules.map(ruleFromRow), warnings: checked.warnings, narrow: checked.narrow });
  });

  /* ── GET /shift-wishes — tổng hợp cho quản lý ── */
  r.get("/shift-wishes", ...mgmtOnly, async (req, res) => {
    const storeId = mustStoreId(req);
    const month = typeof req.query.month === "string" ? req.query.month : addMonths(currentMonth(), 1);
    const w = await wishContext(prisma, month);
    if (!w) return res.status(400).json({ error: "Tháng không hợp lệ (YYYY-MM)." });
    const { ctx } = w;
    const staff = await prisma.staff.findMany({ where: shiftStaffWhere(storeId), select: { id: true, fullName: true, role: true }, orderBy: [{ role: "asc" }, { fullName: "asc" }] });
    const ids = staff.map((s) => s.id);
    const from = dateOnly(ctx.days[0]);
    const to = dateOnly(ctx.days[ctx.days.length - 1]);
    const [wishes, leaves, published] = await Promise.all([
      prisma.shiftWish.findMany({ where: { month, staffId: { in: ids } }, include: { rules: { orderBy: { id: "asc" } } } }),
      prisma.leaveRequest.findMany({ where: { userId: { in: ids }, status: "APPROVED", date: { lte: to }, OR: [{ toDate: null }, { toDate: { gte: from } }] } }),
      isPublished(storeId, month),
    ]);
    const wishOf = new Map(wishes.map((x) => [x.staffId, x]));
    const leaveDays = new Map<number, Set<string>>();
    for (const l of leaves) {
      const set = leaveDays.get(l.userId) ?? leaveDays.set(l.userId, new Set()).get(l.userId)!;
      for (let t = l.date.getTime(); t <= (l.toDate ?? l.date).getTime(); t += 86_400_000) set.add(new Date(t).toISOString().slice(0, 10));
    }

    // Ô của từng người (chỉ nguyện vọng đã xác nhận mới tính vào bản đồ nhiệt)
    const cellsOf = new Map<number, ReturnType<typeof wishCells>>();
    for (const x of wishes) if (x.status === "CONFIRMED") cellsOf.set(x.staffId, wishCells(x.rules.map(ruleFromRow), ctx));

    const heat: { date: string; code: string; role: string; need: number; available: number; unavailable: number[]; prefer: number[]; onLeave: number[] }[] = [];
    for (const date of ctx.days) {
      const weekend = [0, 6].includes(weekdayOf(date));
      for (const t of w.templates) {
        for (const rule of t.staffing) {
          const need = weekend ? rule.weekendCount : rule.weekdayCount;
          const pool = staff.filter((s) => s.role === rule.role);
          if (!need && !pool.length) continue;
          const key = `${date}|${t.code}`;
          const unavailable: number[] = [], prefer: number[] = [], onLeave: number[] = [];
          for (const s of pool) {
            if (leaveDays.get(s.id)?.has(date)) onLeave.push(s.id);
            else if (cellsOf.get(s.id)?.unavailable.has(key)) unavailable.push(s.id);
            else if (cellsOf.get(s.id)?.prefer.has(key)) prefer.push(s.id);
          }
          heat.push({ date, code: t.code, role: rule.role, need, available: pool.length - unavailable.length - onLeave.length, unavailable, prefer, onLeave });
        }
      }
    }

    res.json({
      month,
      deadline: deadlineOf(month, w.config.wishDeadlineDay),
      pastDeadline: isPastDeadline(month, w.config.wishDeadlineDay),
      published,
      days: ctx.days,
      shifts: w.templates.map((t) => ({ code: t.code, name: t.name, startMin: t.startMin, endMin: t.endMin, color: t.color })),
      staff: staff.map((s) => {
        const x = wishOf.get(s.id);
        const rules = x ? x.rules.map(ruleFromRow) : [];
        return {
          ...s,
          status: !x ? "NONE" : x.status === "CONFIRMED" ? (x.late ? "LATE" : "CONFIRMED") : "DRAFT",
          rawText: x?.rawText ?? null,
          submittedAt: x?.submittedAt ?? null,
          counts: rules.reduce<Record<string, number>>((m, r) => ({ ...m, [r.type]: (m[r.type] ?? 0) + 1 }), {}),
          rules,
        };
      }),
      heat,
    });
  });

  /* ── POST /shift-wishes/remind — nhắc người chưa gửi ── */
  r.post("/shift-wishes/remind", ...mgmtOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const storeId = mustStoreId(req);
    const month = (req.body as { month?: string }).month;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "Thiếu tháng (YYYY-MM)." });
    if (await isPublished(storeId, month)) return res.status(400).json({ error: "Lịch tháng này đã công bố." });
    // Bấm nhắc lại trong 10 phút không gửi trùng
    const out = await remindMissing(prisma, storeId, month, 10, me.id);
    res.json({ ok: true, ...out });
  });

  return r;
}
