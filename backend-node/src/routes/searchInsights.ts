/**
 * routes/searchInsights.ts — Khách tìm món gì, món nào quán chưa có
 *
 * POST /search-log                 — khách (ẩn danh hoặc đăng nhập) ghi 1 lượt tìm khi ngừng gõ
 * GET  /search-insights?days=      — Quản lý / Chủ chuỗi: thống kê từ khóa, tỷ lệ, gợi ý món mới
 * POST /search-insights/dismiss    — "Bỏ qua" 1 từ khóa { term, undo? }
 */
import { Router, type Request } from "express";
import type { PrismaClient } from "@prisma/client";
import { attachStaff, isOwner, requireRoles, type StaffRequest } from "../middleware/staff.js";
import { optionalCustomerAuth } from "../middleware/customer.js";
import { hiddenProductIds, storeFromQuery } from "../lib/storeProducts.js";
import { computeSearchInsights, normalizeTerm } from "../lib/searchInsights.js";

export function searchInsightsRouter(prisma: PrismaClient) {
  const r = Router();
  const manager = [attachStaff(prisma), requireRoles("Admin")];

  r.post("/search-log", optionalCustomerAuth, async (req, res) => {
    const { query, sessionKey, store } = (req.body ?? {}) as { query?: string; sessionKey?: string; store?: number };
    const raw = String(query ?? "").trim().slice(0, 100);
    const term = normalizeTerm(raw);
    const sid = String(sessionKey ?? "").trim().slice(0, 64);
    if (term.length < 2 || !sid) return res.status(204).end();
    const customerId = (req as Request & { customerId?: number }).customerId ?? null;
    const storeId = storeFromQuery(store);

    // Cùng 1 khách gõ lại đúng từ khóa trong 10 phút → không tính thêm lượt
    const dup = await prisma.searchLog.findFirst({
      where: { term, createdAt: { gte: new Date(Date.now() - 10 * 60_000) }, ...(customerId ? { customerId } : { sessionKey: sid }) },
      select: { id: true },
    });
    if (dup) return res.status(204).end();

    // Đếm lại kết quả giống hệt thực đơn khách thấy (không tin số trình duyệt gửi)
    const hidden = await hiddenProductIds(prisma, storeId);
    const resultCount = await prisma.product.count({
      where: { isActive: true, outOfStock: false, id: { notIn: [...hidden] }, name: { contains: raw } },
    });
    await prisma.searchLog.create({ data: { storeId, customerId, sessionKey: sid, query: raw, term, resultCount } });
    res.status(204).end();
  });

  r.get("/search-insights", ...manager, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const settings = await prisma.storeSettings.findUnique({ where: { id: 1 } });
    const days = Math.min(365, Math.max(1, Number(req.query.days) || settings?.searchWindowDays || 30));
    // Quản lý chi nhánh: chi nhánh mình · Chủ chuỗi: chi nhánh đang chọn hoặc toàn chuỗi
    const storeId = isOwner(me.role) ? (req as StaffRequest).storeId ?? null : me.storeId;
    res.json(await computeSearchInsights(prisma, { storeId, days }));
  });

  r.post("/search-insights/dismiss", ...manager, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const { term: rawTerm, undo } = (req.body ?? {}) as { term?: string; undo?: boolean };
    const term = normalizeTerm(String(rawTerm ?? ""));
    if (term.length < 2) return res.status(400).json({ error: "Từ khóa không hợp lệ." });
    // Chủ chuỗi bỏ qua cho toàn chuỗi; quản lý chi nhánh chỉ cho chi nhánh mình
    const storeId = isOwner(me.role) ? null : me.storeId;
    if (undo) {
      await prisma.searchTermDismissal.deleteMany({ where: { term, storeId } });
    } else if (!(await prisma.searchTermDismissal.findFirst({ where: { term, storeId } }))) {
      await prisma.searchTermDismissal.create({ data: { term, storeId, dismissedById: me.id } });
    }
    res.json({ ok: true });
  });

  return r;
}
