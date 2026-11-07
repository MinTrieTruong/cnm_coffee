/**
 * routes/nutrition.ts — Dinh dưỡng nguyên liệu (quản lý), dinh dưỡng món (khách), sở thích ăn uống của khách.
 *
 * Quản lý (Owner / Admin xem; Owner sửa / duyệt / AI gợi ý — dữ liệu dùng chung cả chuỗi):
 *   GET  /nutrition/ingredients                — nguyên liệu + dinh dưỡng + trạng thái duyệt + số món dùng
 *   PUT  /nutrition/ingredients/:itemId         — sửa tay (source MANUAL, cần duyệt lại)
 *   POST /nutrition/ingredients/suggest { itemIds } — AI gợi ý (≤ 20, chưa duyệt); AI tắt → 503
 *   POST /nutrition/ingredients/approve { itemIds } — duyệt → tính lại món dùng các nguyên liệu này
 *   GET  /nutrition/products/:id                — dinh dưỡng theo size + nguyên liệu còn thiếu (màn sửa món)
 * Khách (công khai, khi Website › Giao diện bật hiện dinh dưỡng):
 *   GET  /menu/:id/nutrition                    — mọi size + lưu ý dị ứng
 * Khách đăng nhập: GET / PUT /customer/diet-prefs
 */
import { Router } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import { attachStaff, requireRoles, type StaffRequest } from "../middleware/staff.js";
import { customerAuth } from "../middleware/customer.js";
import { audit } from "../lib/audit.js";
import { bizDayStart, bizToday } from "../lib/bizTime.js";
import { aiErrorMessage, hasGeminiKey } from "../ai/gemini.js";
import { getAiSetting } from "../ai/settings.js";
import { ALLERGENS, DIETS, DISCLAIMER, THRESHOLDS, isDiet } from "../lib/nutrition/labels.js";
import { calcProductNutrition, recomputeForItems } from "../lib/nutrition/compute.js";
import { MAX_SUGGEST, checkNutrition, suggestNutrition } from "../lib/nutrition/suggest.js";
import { siteFlags } from "./site.js";

const NUM_FIELDS = ["kcal", "fatG", "satFatG", "sugarG", "proteinG", "carbG", "caffeineMg"] as const;
/** Bắt buộc có khi duyệt (đủ để tính kcal / caffeine / đường / béo cho khách) */
const REQUIRED = ["kcal", "fatG", "sugarG", "caffeineMg"] as const;

export function nutritionRouter(prisma: PrismaClient) {
  const r = Router();
  const auth = attachStaff(prisma);
  const viewers = [auth, requireRoles("Admin")];
  const owner = [auth, requireRoles("Owner")];
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n > 0))] : []);

  r.get("/nutrition/ingredients", ...viewers, async (_req, res) => {
    const [items, uses] = await Promise.all([
      prisma.inventoryItem.findMany({ orderBy: [{ category: "asc" }, { id: "asc" }], select: { id: true, name: true, category: true, unit: true, recipeUnit: true, nutrition: true } }),
      prisma.productFormula.groupBy({ by: ["itemId"], _count: { _all: true } }),
    ]);
    const used = new Map(uses.map((u) => [u.itemId, u._count._all]));
    const [ai, products] = await Promise.all([getAiSetting("NUTRITION_ASSIST"), prisma.productNutrition.count({ where: { complete: true } })]);
    res.json({
      aiEnabled: hasGeminiKey() && ai.enabled,
      completeProductSizes: products,
      thresholds: THRESHOLDS,
      allergens: ALLERGENS,
      items: items.map((i) => ({ ...i, usedBy: used.get(i.id) ?? 0 })),
    });
  });

  r.put("/nutrition/ingredients/:itemId", ...owner, async (req, res) => {
    const itemId = Number(req.params.itemId);
    const item = await prisma.inventoryItem.findUnique({ where: { id: itemId }, select: { name: true } });
    if (!item) return res.status(404).json({ error: "Không tìm thấy nguyên liệu." });
    const b = (req.body ?? {}) as Record<string, unknown>;
    const values: Record<string, unknown> = {};
    for (const k of NUM_FIELDS) {
      if (b[k] === undefined) continue;
      if (b[k] === null || b[k] === "") values[k] = null;
      else {
        const v = Number(b[k]);
        if (!Number.isFinite(v) || v < 0 || v > 100_000) return res.status(400).json({ error: `Giá trị ${k} không hợp lệ.` });
        values[k] = Math.round(v * 100) / 100;
      }
    }
    if (b.basis !== undefined) {
      if (b.basis !== "PER_100" && b.basis !== "PER_UNIT") return res.status(400).json({ error: "Cách tính không hợp lệ." });
      values.basis = b.basis;
    }
    if (b.allergens !== undefined) {
      if (!Array.isArray(b.allergens) || b.allergens.some((a) => !(ALLERGENS as readonly string[]).includes(a as string))) return res.status(400).json({ error: "Chất gây dị ứng không hợp lệ." });
      values.allergens = [...new Set(b.allergens as string[])];
    }
    for (const k of ["isVegan", "isSugarSource"] as const) if (b[k] !== undefined) values[k] = !!b[k];
    if (b.note !== undefined) values.note = typeof b.note === "string" ? b.note.trim().slice(0, 500) || null : null;

    const prev = await prisma.ingredientNutrition.findUnique({ where: { itemId } });
    const merged = { kcal: null, fatG: null, sugarG: null, carbG: null, proteinG: null, caffeineMg: null, ...prev, ...values } as Parameters<typeof checkNutrition>[0];
    // Sửa tay → giá trị của người nhập, phải duyệt lại mới dùng cho khách
    const data = { ...values, source: "MANUAL", confidence: null, warnings: checkNutrition(merged, item.name) as unknown as Prisma.InputJsonValue, approved: false, approvedById: null, approvedAt: null };
    const row = await prisma.ingredientNutrition.upsert({ where: { itemId }, update: data, create: { itemId, ...data } });
    if (prev?.approved) await recomputeForItems([itemId]);
    res.json(row);
  });

  r.post("/nutrition/ingredients/suggest", ...owner, async (req, res) => {
    const itemIds = ids((req.body as { itemIds?: unknown }).itemIds).slice(0, MAX_SUGGEST);
    if (!itemIds.length) return res.status(400).json({ error: `Chọn 1–${MAX_SUGGEST} nguyên liệu.` });
    if (!hasGeminiKey()) return res.status(503).json({ unavailable: true, reason: "Chưa cấu hình GEMINI_API_KEY." });
    const setting = await getAiSetting("NUTRITION_ASSIST");
    if (!setting.enabled) return res.status(503).json({ unavailable: true, reason: "Tính năng AI gợi ý dinh dưỡng đang tắt." });
    if (setting.dailyLimit) {
      const today = await prisma.aiCallLog.count({ where: { feature: "NUTRITION_ASSIST", createdAt: { gte: bizDayStart(bizToday()) } } });
      if (today >= setting.dailyLimit) return res.status(503).json({ unavailable: true, reason: "Đã hết lượt AI gợi ý dinh dưỡng hôm nay." });
    }
    const staffId = (req as StaffRequest).staffRow!.id;
    const t0 = Date.now();
    try {
      const out = await suggestNutrition(itemIds);
      await prisma.aiCallLog.create({ data: { feature: "NUTRITION_ASSIST", staffId, status: "OK", inputKind: "text", model: out.model, tokensIn: out.tokensIn, tokensOut: out.tokensOut, latencyMs: out.latencyMs, summary: `${out.saved} nguyên liệu, bỏ qua ${out.skipped} đã duyệt` } });
      res.json(out);
    } catch (e) {
      const reason = aiErrorMessage(e);
      await prisma.aiCallLog.create({ data: { feature: "NUTRITION_ASSIST", staffId, status: "ERROR", inputKind: "text", latencyMs: Date.now() - t0, error: reason.slice(0, 500) } }).catch(() => {});
      res.status(503).json({ unavailable: true, reason });
    }
  });

  r.post("/nutrition/ingredients/approve", ...owner, async (req, res) => {
    const itemIds = ids((req.body as { itemIds?: unknown }).itemIds);
    if (!itemIds.length) return res.status(400).json({ error: "Chọn nguyên liệu cần duyệt." });
    const rows = await prisma.ingredientNutrition.findMany({ where: { itemId: { in: itemIds } }, include: { item: { select: { name: true } } } });
    const missing = itemIds.filter((id) => !rows.some((r) => r.itemId === id));
    const incomplete = rows.filter((r) => REQUIRED.some((k) => r[k] == null));
    if (missing.length || incomplete.length) {
      return res.status(400).json({ error: `Chưa đủ dữ liệu để duyệt (cần kcal, béo, đường, caffeine): ${[...incomplete.map((r) => r.item.name), ...missing.map((id) => `#${id}`)].join(", ")}.` });
    }
    const staffId = (req as StaffRequest).staffRow!.id;
    await prisma.ingredientNutrition.updateMany({ where: { itemId: { in: itemIds } }, data: { approved: true, approvedById: staffId, approvedAt: new Date() } });
    const products = await recomputeForItems(itemIds);
    audit(staffId, "NUTRITION_APPROVE", `${itemIds.length} nguyên liệu`, rows.map((r) => r.item.name).join(", ").slice(0, 500));
    res.json({ approved: itemIds.length, productsRecomputed: products });
  });

  r.get("/nutrition/products/:id", ...viewers, async (req, res) => {
    const productId = Number(req.params.id);
    res.json({ sizes: await calcProductNutrition(prisma, productId), thresholds: THRESHOLDS, disclaimer: DISCLAIMER });
  });

  /* ═══════════ Khách ═══════════ */

  r.get("/menu/:id/nutrition", async (req, res) => {
    if (!(await siteFlags(prisma)).showNutrition) return res.json({ hidden: true });
    const rows = await prisma.productNutrition.findMany({ where: { productId: Number(req.params.id) }, orderBy: { size: "asc" } });
    res.json({
      sizes: rows.map(({ productId: _p, missing: _m, computedAt: _c, ...n }) => n),
      thresholds: THRESHOLDS,
      disclaimer: DISCLAIMER,
    });
  });

  r.get("/customer/diet-prefs", customerAuth, async (req, res) => {
    const c = await prisma.customer.findUnique({ where: { id: (req as unknown as { customerId: number }).customerId }, select: { dietPrefs: true } });
    res.json({ dietPrefs: Array.isArray(c?.dietPrefs) ? c!.dietPrefs : [], options: DIETS });
  });

  r.put("/customer/diet-prefs", customerAuth, async (req, res) => {
    const raw = (req.body as { dietPrefs?: unknown }).dietPrefs;
    if (!Array.isArray(raw) || raw.some((d) => !isDiet(d))) return res.status(400).json({ error: "Sở thích ăn uống không hợp lệ." });
    const dietPrefs = [...new Set(raw as string[])];
    await prisma.customer.update({ where: { id: (req as unknown as { customerId: number }).customerId }, data: { dietPrefs } });
    res.json({ dietPrefs });
  });

  return r;
}
