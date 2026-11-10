/**
 * routes/menuProposals.ts — Pha chế đề xuất món mới
 *
 * PENDING → (Chủ chuỗi duyệt) APPROVED → (tạo món từ đề xuất) CREATED
 *         ↘ REJECTED
 *
 * GET  /menu-proposals              — Pha chế: của mình · Quản lý: chi nhánh · Chủ chuỗi: tất cả
 * GET  /menu-proposals/:id
 * POST /menu-proposals              — pha chế gửi đề xuất
 * POST /menu-proposals/:id/review   — Chủ chuỗi duyệt / từ chối { status, note? }
 * POST /menu-proposals/:id/created  — gắn món vừa tạo { productId } → CREATED (+ tạo định mức từ formulaDraft nếu món chưa có)
 *
 * AI phác thảo món (MENU_DRAFT — tắt thì 503 { unavailable }, đề xuất tay vẫn chạy):
 * GET  /menu-proposals/ai-draft/status — { enabled }
 * POST /menu-proposals/ai-draft { term?, idea?, categoryId?, note?, storeId? } — 2–3 phương án đã tính giá vốn / giá gợi ý. Không lưu DB.
 * POST /menu-proposals/evaluate { option, storeId? } — tính lại sau khi người dùng sửa định mức (không gọi AI)
 */
import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { attachStaff, isOwner, requireRoles, type StaffRequest } from "../middleware/staff.js";
import { mustStoreId, storeWhere, toStore } from "../lib/storeScope.js";
import { audit } from "../lib/audit.js";
import { notify } from "../lib/notify.js";
import { normalizeTerm } from "../lib/searchInsights.js";
import type { Prisma } from "@prisma/client";
import { bizDayStart, bizToday } from "../lib/bizTime.js";
import { recalcProductCost } from "../lib/productCost.js";
import { computeProductNutrition } from "../lib/nutrition/compute.js";
import { aiErrorMessage, hasGeminiKey } from "../ai/gemini.js";
import { getAiSetting } from "../ai/settings.js";
import { buildDraftContext } from "../lib/menuDraft/context.js";
import { generateDraft, normalizeOption, type DraftLine } from "../lib/menuDraft/generate.js";
import { evaluateOption, formulaDraftOf, loadEvalData, recipeTextOf, type EvaluatedOption } from "../lib/menuDraft/evaluate.js";

export function menuProposalsRouter(prisma: PrismaClient, io: Server) {
  const r = Router();
  const anyStaff = [attachStaff(prisma)];
  const proposer = [attachStaff(prisma), requireRoles("Kitchen", "Admin")];
  const owner = [attachStaff(prisma), requireRoles("Owner")];

  const include = {
    staff: { select: { id: true, fullName: true } },
    store: { select: { id: true, name: true } },
    category: { select: { id: true, name: true } },
    reviewer: { select: { fullName: true } },
    product: { select: { id: true, name: true } },
  } as const;

  /** Đề xuất có định mức nháp → kèm giá vốn TÍNH LẠI theo giá nhập hiện tại (giá nhập có thể đổi từ lúc đề xuất) */
  async function withCostNow<T extends { formulaDraft: unknown; name: string; categoryId: number | null; temps: string | null; hasSizes: boolean | null }>(rows: T[]) {
    if (!rows.some((r) => Array.isArray(r.formulaDraft))) return rows.map((r) => ({ ...r, costNow: null }));
    const data = await loadEvalData(prisma, null);
    return rows.map((r) => {
      if (!Array.isArray(r.formulaDraft)) return { ...r, costNow: null };
      const ev = evaluateOption(data, {
        name: r.name, description: "", categoryId: r.categoryId ?? 0, temps: (r.temps ?? "BOTH") as "BOTH", hasSizes: r.hasSizes ?? true,
        lines: r.formulaDraft as DraftLine[], steps: [], whyFits: "", risk: null,
      });
      return { ...r, costNow: { costs: ev.costs, estimated: ev.estimated, lines: ev.lines, toBuy: ev.toBuy, categoryPriceRange: ev.categoryPriceRange } };
    });
  }

  r.get("/menu-proposals", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const where = isOwner(me.role) ? storeWhere(req) : me.role === "Admin" ? storeWhere(req) : { staffId: me.id };
    res.json(await withCostNow(await prisma.menuProposal.findMany({ where, include, orderBy: { id: "desc" }, take: 200 })));
  });

  /* ═══════════ AI phác thảo món ═══════════ */

  r.get("/menu-proposals/ai-draft/status", ...proposer, async (_req, res) => {
    res.json({ enabled: hasGeminiKey() && (await getAiSetting("MENU_DRAFT")).enabled });
  });

  /** Chi nhánh để xem tồn kho: chi nhánh đang chọn → storeId gửi kèm (Chủ chuỗi xem toàn chuỗi) → chi nhánh đầu tiên */
  async function draftStore(req: StaffRequest, raw: unknown) {
    if (req.storeId != null) return req.storeId;
    const id = Number(raw);
    if (Number.isInteger(id) && id > 0 && (await prisma.store.findUnique({ where: { id } }))) return id;
    return (await prisma.store.findFirst({ where: { isActive: true }, orderBy: { id: "asc" }, select: { id: true } }))?.id ?? null;
  }

  r.post("/menu-proposals/ai-draft", ...proposer, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const b = req.body as { term?: unknown; idea?: unknown; categoryId?: unknown; note?: unknown; storeId?: unknown };
    const term = typeof b.term === "string" ? b.term.trim().slice(0, 100) : "";
    const idea = typeof b.idea === "string" ? b.idea.trim().slice(0, 300) : "";
    const note = typeof b.note === "string" ? b.note.trim().slice(0, 300) : "";
    if (!term && !idea) return res.status(400).json({ error: "Nhập từ khóa khách tìm hoặc ý tưởng món." });
    const unavailable = (reason: string) => res.status(503).json({ unavailable: true, reason });
    if (!hasGeminiKey()) return unavailable("Chưa cấu hình GEMINI_API_KEY.");
    const setting = await getAiSetting("MENU_DRAFT");
    if (!setting.enabled) return unavailable("AI phác thảo món đang tắt — đề xuất món nhập tay như bình thường.");
    const [today, hour] = await Promise.all([
      setting.dailyLimit ? prisma.aiCallLog.count({ where: { feature: "MENU_DRAFT", createdAt: { gte: bizDayStart(bizToday()) } } }) : 0,
      setting.hourlyPerUser ? prisma.aiCallLog.count({ where: { feature: "MENU_DRAFT", staffId: me.id, createdAt: { gte: new Date(Date.now() - 3_600_000) } } }) : 0,
    ]);
    if (setting.dailyLimit && today >= setting.dailyLimit) return res.status(429).json({ error: `Đã hết ${setting.dailyLimit} lượt AI phác thảo hôm nay.` });
    if (setting.hourlyPerUser && hour >= setting.hourlyPerUser) return res.status(429).json({ error: `Bạn đã phác thảo ${setting.hourlyPerUser} lần trong 1 giờ qua, đợi một lát nhé.` });

    const storeId = await draftStore(req as StaffRequest, b.storeId);
    if (storeId == null) return res.status(400).json({ error: "Chưa có chi nhánh." });
    const categoryId = Number.isInteger(Number(b.categoryId)) && Number(b.categoryId) > 0 ? Number(b.categoryId) : null;
    const ctx = await buildDraftContext(prisma, { storeId, term, idea, note, categoryId });
    const t0 = Date.now();
    try {
      const out = await generateDraft(ctx);
      const data = await loadEvalData(prisma, storeId);
      const options = out.result.options.map((o) => evaluateOption(data, o));
      await prisma.aiCallLog.create({
        data: {
          feature: "MENU_DRAFT", storeId, staffId: me.id, status: options.length ? "OK" : "EMPTY", inputKind: "text", model: out.model,
          tokensIn: out.tokensIn, tokensOut: out.tokensOut, latencyMs: out.latencyMs,
          transcript: (term ? `Từ khóa: ${term}` : `Ý tưởng: ${idea}`) + (note ? ` · Ghi chú: ${note}` : ""),
          summary: options.map((o) => o.name).join(" · ").slice(0, 500),
        },
      }).catch(() => {});
      if (!options.length) return unavailable("AI không phác thảo được phương án nào — thử lại hoặc nhập tay.");
      res.json({
        understood: out.result.understood, demand: ctx.demand, storeId, options,
        samples: ctx.samples.map((s) => s.name), ingredients: ctx.ingredients, categories: ctx.categories, model: out.model, tokensIn: out.tokensIn, tokensOut: out.tokensOut, latencyMs: out.latencyMs,
      });
    } catch (e) {
      const reason = /abort|timeout/i.test(String((e as Error)?.name) + String((e as Error)?.message)) ? "AI phác thảo quá 45 giây." : aiErrorMessage(e);
      await prisma.aiCallLog.create({ data: { feature: "MENU_DRAFT", storeId, staffId: me.id, status: "ERROR", inputKind: "text", latencyMs: Date.now() - t0, error: reason.slice(0, 500) } }).catch(() => {});
      unavailable(reason);
    }
  });

  r.post("/menu-proposals/evaluate", ...proposer, async (req, res) => {
    const b = req.body as { option?: unknown; storeId?: unknown };
    const option = normalizeOption(b.option);
    if (!option) return res.status(400).json({ error: "Phương án không hợp lệ (thiếu tên món)." });
    const storeId = await draftStore(req as StaffRequest, b.storeId);
    res.json(evaluateOption(await loadEvalData(prisma, storeId), option));
  });

  r.get("/menu-proposals/:id", ...anyStaff, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const row = await prisma.menuProposal.findUnique({ where: { id: Number(req.params.id) }, include });
    if (!row || (!isOwner(me.role) && row.staffId !== me.id && !(me.role === "Admin" && row.storeId === me.storeId))) {
      return res.status(404).json({ error: "Không tìm thấy đề xuất." });
    }
    res.json((await withCostNow([row]))[0]);
  });

  r.post("/menu-proposals", ...proposer, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const b = req.body as {
      name?: string; description?: string; recipe?: string; suggestedPrice?: number; categoryId?: number; imageUrl?: string;
      /** Tạo từ gợi ý "khách tìm nhưng chưa có": nguồn SEARCH + từ khóa; Chủ chuỗi xem toàn chuỗi gửi kèm chi nhánh có nhiều khách tìm nhất */
      searchTerm?: string; storeId?: number;
      /** Từ màn AI phác thảo / sửa định mức: phương án đầy đủ — server tính lại giá vốn, không tin số client */
      formulaDraft?: unknown; temps?: string; hasSizes?: boolean; priceS?: number; priceL?: number; aiDraft?: unknown; steps?: unknown;
    };
    const fromSearch = !!b.searchTerm?.trim();
    // Chủ chuỗi xem toàn chuỗi: đề xuất từ tìm kiếm / AI phác thảo gửi kèm chi nhánh
    const ownerStore = isOwner(me.role) && (req as StaffRequest).storeId == null && (fromSearch || Array.isArray(b.formulaDraft)) ? Number(b.storeId) : null;
    if ((req as StaffRequest).storeId == null && !(ownerStore && (await prisma.store.findUnique({ where: { id: ownerStore } })))) {
      return res.status(400).json({ error: "Hãy chọn chi nhánh trước khi thao tác." });
    }
    const storeId = ownerStore ?? mustStoreId(req);
    if (!b.name?.trim()) return res.status(400).json({ error: "Đặt tên món." });
    // Đề xuất từ tìm kiếm: chưa có công thức — pha chế nghiên cứu sau khi Chủ chuỗi duyệt ý tưởng
    // Có định mức nháp → đánh giá lại ở server (giá vốn, cảnh báo) và tự sinh recipe text nếu thiếu
    let evaluated: EvaluatedOption | null = null;
    if (Array.isArray(b.formulaDraft) && b.formulaDraft.length) {
      const option = normalizeOption({
        name: b.name, description: b.description, categoryId: b.categoryId ?? 0, temps: b.temps, hasSizes: b.hasSizes,
        lines: b.formulaDraft, steps: Array.isArray(b.steps) ? b.steps : [], whyFits: "", risk: null,
      });
      if (option) evaluated = evaluateOption(await loadEvalData(prisma, storeId), option);
      if (!evaluated?.lines.length) return res.status(400).json({ error: "Định mức chưa có dòng hợp lệ." });
      const blocking = evaluated.warnings.find((w) => w.level === "danger" && /trùng món/.test(w.text));
      if (blocking) return res.status(400).json({ error: blocking.text });
    }
    if (!b.recipe?.trim() && !fromSearch && !evaluated) return res.status(400).json({ error: "Ghi nguyên liệu & cách làm." });
    const intOrNull = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : null);
    if (b.suggestedPrice != null && !(Number.isInteger(b.suggestedPrice) && b.suggestedPrice >= 0)) {
      return res.status(400).json({ error: "Giá đề xuất không hợp lệ." });
    }
    if (b.categoryId != null && !(await prisma.category.findUnique({ where: { id: b.categoryId } }))) {
      return res.status(400).json({ error: "Danh mục không tồn tại." });
    }
    const row = await prisma.menuProposal.create({
      data: {
        storeId, staffId: me.id,
        name: b.name.trim(),
        description: b.description?.trim() || null,
        recipe: b.recipe?.trim() || (evaluated ? recipeTextOf(evaluated) : null),
        source: fromSearch ? "SEARCH" : "STAFF",
        searchTerm: fromSearch ? normalizeTerm(b.searchTerm!) : null,
        suggestedPrice: b.suggestedPrice ?? null,
        categoryId: b.categoryId ?? null,
        imageUrl: b.imageUrl?.trim() || null,
        ...(evaluated
          ? {
              formulaDraft: formulaDraftOf(evaluated) as unknown as Prisma.InputJsonValue,
              estCostS: evaluated.hasSizes ? evaluated.costs.S : null,
              estCostM: evaluated.costs.M,
              estCostL: evaluated.hasSizes ? evaluated.costs.L : null,
              temps: evaluated.temps,
              hasSizes: evaluated.hasSizes,
              priceS: evaluated.hasSizes ? intOrNull(b.priceS) : null,
              priceL: evaluated.hasSizes ? intOrNull(b.priceL) : null,
            }
          : {}),
        aiDraft: b.aiDraft && typeof b.aiDraft === "object" ? (b.aiDraft as Prisma.InputJsonValue) : undefined,
        aiGenerated: !!(b.aiDraft && typeof b.aiDraft === "object"),
      },
      include,
    });
    audit(me.id, "MENU_PROPOSAL_CREATE", row.name);
    // Chủ chuỗi nhận thông báo qua phòng quản lý của chi nhánh
    toStore(io, "admin_room", storeId).emit("menu-proposal:new", { id: row.id, name: row.name, by: me.fullName });
    void notify({
      type: "MENU_PROPOSAL",
      title: `Đề xuất món mới: ${row.name}`,
      body: `${me.fullName} đề xuất — chờ Chủ chuỗi duyệt.`,
      link: "/app/sales/proposals",
      storeId,
      to: { roles: ["Owner"] },
    });
    res.status(201).json(row);
  });

  r.post("/menu-proposals/:id/review", ...owner, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    const { status, note } = req.body as { status?: string; note?: string };
    if (status !== "APPROVED" && status !== "REJECTED") return res.status(400).json({ error: "Trạng thái không hợp lệ." });
    if (status === "REJECTED" && !note?.trim()) return res.status(400).json({ error: "Ghi lý do từ chối để pha chế biết." });
    const cur = await prisma.menuProposal.findUnique({ where: { id } });
    if (!cur) return res.status(404).json({ error: "Không tìm thấy đề xuất." });
    if (cur.status !== "PENDING") return res.status(400).json({ error: "Đề xuất đã được xử lý." });
    const row = await prisma.menuProposal.update({
      where: { id },
      data: { status, ownerNote: note?.trim() || null, reviewedById: me.id, reviewedAt: new Date() },
      include,
    });
    audit(me.id, status === "APPROVED" ? "MENU_PROPOSAL_APPROVE" : "MENU_PROPOSAL_REJECT", row.name);
    io.to(`staff_${row.staffId}`).emit("menu-proposal:reviewed", { id, status });
    void notify({
      type: "MENU_PROPOSAL",
      title: `Đề xuất "${row.name}" ${status === "APPROVED" ? "đã được duyệt" : "bị từ chối"}`,
      body: note?.trim() || null,
      to: { staffIds: [row.staffId] },
    });
    res.json(row);
  });

  r.post("/menu-proposals/:id/created", ...owner, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    const productId = Number((req.body as { productId?: number }).productId);
    const [cur, product] = await Promise.all([
      prisma.menuProposal.findUnique({ where: { id } }),
      prisma.product.findUnique({ where: { id: productId } }),
    ]);
    if (!cur) return res.status(404).json({ error: "Không tìm thấy đề xuất." });
    if (!product) return res.status(400).json({ error: "Không tìm thấy món." });
    if (cur.status !== "APPROVED") return res.status(400).json({ error: "Đề xuất chưa được duyệt hoặc đã tạo món." });
    const row = await prisma.menuProposal.update({ where: { id }, data: { status: "CREATED", productId }, include });
    audit(me.id, "MENU_PROPOSAL_CREATED", row.name, `Món #${productId}`);
    // Định mức nháp → ProductFormula (chỉ dòng nguyên liệu có trong kho; món đã có định mức thì giữ nguyên)
    let formulaCreated = 0;
    const pendingIngredients: string[] = [];
    if (Array.isArray(cur.formulaDraft) && !(await prisma.productFormula.count({ where: { productId } }))) {
      const lines = cur.formulaDraft as unknown as DraftLine[];
      const items = await prisma.inventoryItem.findMany({ where: { id: { in: lines.flatMap((l) => (l.itemId != null ? [l.itemId] : [])) } } });
      const byId = new Map(items.map((i) => [i.id, i]));
      for (const l of lines) {
        const it = l.itemId != null ? byId.get(l.itemId) : null;
        if (!it) {
          if (l.newIngredient?.name) pendingIngredients.push(l.newIngredient.name);
          continue;
        }
        await prisma.productFormula.create({
          data: {
            productId, itemId: it.id, qtyPerUnit: l.qtyM,
            qtySizeS: product.hasSizes ? (l.qtyS ?? l.qtyM) : null, qtySizeM: product.hasSizes ? l.qtyM : null, qtySizeL: product.hasSizes ? (l.qtyL ?? l.qtyM) : null,
            recipeUnit: it.recipeUnit ?? it.unit, conversionFactor: it.recipePerUnit > 0 ? it.recipePerUnit : 1,
          },
        });
        formulaCreated++;
      }
      if (formulaCreated) {
        await recalcProductCost(prisma, [productId]);
        await computeProductNutrition(productId).catch(() => {});
      }
    }
    io.to(`staff_${row.staffId}`).emit("menu-proposal:reviewed", { id, status: "CREATED" });
    void notify({ type: "MENU_PROPOSAL", title: `Món "${row.name}" bạn đề xuất đã lên thực đơn`, to: { staffIds: [row.staffId] } });
    res.json({ ...row, formulaCreated, pendingIngredients });
  });

  return r;
}
