/**
 * routes/analyst.ts — Trợ lý AI hỏi số liệu (Chủ chuỗi + Quản lý chi nhánh) và cài đặt bật / tắt tính năng AI.
 *
 * POST   /analyst/ask { conversationId?, question, requestId? } → { conversationId, message }
 *          Trong lúc chạy, socket phòng staff_<id> nhận "analyst:status" { requestId, conversationId, tool, text }
 * GET    /analyst/conversations              — hội thoại của mình (mới nhất trước)
 * GET    /analyst/conversations/:id          — tin nhắn của một hội thoại
 * DELETE /analyst/conversations/:id
 * POST   /analyst/messages/:id/rate { rating: -1 | 0 | 1 }
 * GET    /ai/settings                        — (Owner / Admin) tính năng AI nào đang bật
 * PUT    /ai/settings/:feature { enabled?, dailyLimit?, hourlyPerUser? } — (Owner)
 *
 * Tính năng tắt / thiếu khóa / Gemini lỗi → 503 { unavailable: true, reason } (không 500).
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import type { AnalystConversation, Prisma, PrismaClient } from "@prisma/client";
import { attachStaff, requireRoles, type StaffRequest } from "../middleware/staff.js";
import { reqStoreId } from "../lib/storeScope.js";
import { scopeOf } from "../lib/analytics/scope.js";
import { getRealtime } from "../lib/realtime.js";
import { audit } from "../lib/audit.js";
import { bizDayStart, bizToday } from "../lib/bizTime.js";
import { hasGeminiKey } from "../ai/gemini.js";
import { getAiSetting, isAiFeature, listAiSettings } from "../ai/settings.js";
import { askAnalyst, type Turn } from "../ai/analyst/run.js";

const MAX_QUESTION = 500;
/** Số lượt hỏi đáp gần nhất gửi kèm (mỗi lượt = câu hỏi + câu trả lời) */
const HISTORY_TURNS = 10;

export function analystRouter(prisma: PrismaClient) {
  const r = Router();
  const auth = attachStaff(prisma);
  const managers = [auth, requireRoles("Admin")];
  const me = (req: Request) => (req as StaffRequest).staffRow!;
  const unavailable = (res: Response, reason: string) => res.status(503).json({ unavailable: true, reason });

  async function enabled(_req: Request, res: Response, next: NextFunction) {
    if (!hasGeminiKey()) return unavailable(res, "Chưa cấu hình GEMINI_API_KEY.");
    if (!(await getAiSetting("ANALYST")).enabled) return unavailable(res, "Trợ lý AI đang tạm tắt.");
    next();
  }

  const ownConversation = (req: Request, id: number) => prisma.analystConversation.findFirst({ where: { id, staffId: me(req).id } });

  r.post("/analyst/ask", ...managers, enabled, async (req, res) => {
    const staff = me(req);
    const b = req.body as { conversationId?: number; question?: string; requestId?: string };
    const question = typeof b.question === "string" ? b.question.trim() : "";
    if (!question) return res.status(400).json({ error: "Nhập câu hỏi." });
    if (question.length > MAX_QUESTION) return res.status(400).json({ error: `Câu hỏi tối đa ${MAX_QUESTION} ký tự.` });
    const requestId = typeof b.requestId === "string" ? b.requestId.slice(0, 64) : null;

    // Hạn mức: cả hệ thống mỗi ngày, mỗi người mỗi giờ (đếm câu trả lời đã lưu)
    const setting = await getAiSetting("ANALYST");
    const [today, hour] = await Promise.all([
      setting.dailyLimit ? prisma.analystMessage.count({ where: { role: "assistant", createdAt: { gte: bizDayStart(bizToday()) } } }) : 0,
      setting.hourlyPerUser
        ? prisma.analystMessage.count({ where: { role: "assistant", createdAt: { gte: new Date(Date.now() - 3_600_000) }, conversation: { staffId: staff.id } } })
        : 0,
    ]);
    if (setting.dailyLimit && today >= setting.dailyLimit) return res.status(429).json({ error: `Trợ lý đã hết ${setting.dailyLimit} câu hỏi hôm nay, mai hỏi tiếp nhé.` });
    if (setting.hourlyPerUser && hour >= setting.hourlyPerUser) return res.status(429).json({ error: `Bạn đã hỏi ${setting.hourlyPerUser} câu trong 1 giờ qua, đợi một lát rồi hỏi tiếp nhé.` });

    let conversation: AnalystConversation | null = null;
    if (b.conversationId != null) {
      conversation = Number.isInteger(b.conversationId) ? await ownConversation(req, b.conversationId!) : null;
      if (!conversation) return res.status(404).json({ error: "Không tìm thấy hội thoại." });
    }
    const history: Turn[] = conversation
      ? (await prisma.analystMessage.findMany({
          where: { conversationId: conversation.id, errorMessage: null },
          orderBy: { id: "desc" },
          take: HISTORY_TURNS * 2,
          select: { role: true, content: true, toolCalls: true },
        }))
          .reverse()
          .map((m) => ({ role: m.role as Turn["role"], content: m.content, toolCalls: m.toolCalls as Turn["toolCalls"] }))
      : [];

    const scope = scopeOf(req as StaffRequest);
    const io = getRealtime();
    const result = await askAnalyst({
      scope,
      question,
      history,
      focusStoreId: scope.storeIds === "ALL" ? reqStoreId(req) : null,
      onTool: (tool, label) => io?.to(`staff_${staff.id}`).emit("analyst:status", { requestId, conversationId: conversation?.id ?? null, tool, text: `Đang tra ${label.toLowerCase()}…` }),
    });
    if (result.error) return unavailable(res, result.error);

    conversation ??= await prisma.analystConversation.create({
      data: { staffId: staff.id, storeScope: scope.storeIds === "ALL" ? "ALL" : scope.storeIds.join(","), title: question.replace(/\s+/g, " ").slice(0, 80) },
    });
    const [, message] = await prisma.$transaction([
      prisma.analystMessage.create({ data: { conversationId: conversation.id, role: "user", content: question } }),
      prisma.analystMessage.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: result.answer,
          charts: result.charts as Prisma.InputJsonValue,
          toolCalls: result.toolCalls as Prisma.InputJsonValue,
          followUps: result.followUps,
          model: result.model,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          latencyMs: result.latencyMs,
        },
      }),
      prisma.analystConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } }),
    ]);
    res.json({ conversationId: conversation.id, title: conversation.title, message });
  });

  r.get("/analyst/conversations", ...managers, async (req, res) => {
    res.json(
      await prisma.analystConversation.findMany({
        where: { staffId: me(req).id },
        orderBy: { updatedAt: "desc" },
        take: 100,
        select: { id: true, title: true, storeScope: true, createdAt: true, updatedAt: true },
      }),
    );
  });

  r.get("/analyst/conversations/:id", ...managers, async (req, res) => {
    const c = await ownConversation(req, Number(req.params.id));
    if (!c) return res.status(404).json({ error: "Không tìm thấy hội thoại." });
    const messages = await prisma.analystMessage.findMany({ where: { conversationId: c.id }, orderBy: { id: "asc" } });
    res.json({ ...c, messages });
  });

  r.delete("/analyst/conversations/:id", ...managers, async (req, res) => {
    const c = await ownConversation(req, Number(req.params.id));
    if (!c) return res.status(404).json({ error: "Không tìm thấy hội thoại." });
    await prisma.analystConversation.delete({ where: { id: c.id } });
    res.json({ ok: true });
  });

  r.post("/analyst/messages/:id/rate", ...managers, async (req, res) => {
    const rating = Number((req.body as { rating?: unknown }).rating);
    if (![-1, 0, 1].includes(rating)) return res.status(400).json({ error: "Đánh giá không hợp lệ." });
    const msg = await prisma.analystMessage.findFirst({ where: { id: Number(req.params.id), role: "assistant", conversation: { staffId: me(req).id } } });
    if (!msg) return res.status(404).json({ error: "Không tìm thấy câu trả lời." });
    res.json(await prisma.analystMessage.update({ where: { id: msg.id }, data: { rating }, select: { id: true, rating: true } }));
  });

  /* ═══════════ Cài đặt tính năng AI ═══════════ */

  r.get("/ai/settings", ...managers, async (_req, res) => {
    res.json({ hasKey: hasGeminiKey(), features: await listAiSettings() });
  });

  r.put("/ai/settings/:feature", auth, requireRoles("Owner"), async (req, res) => {
    const feature = req.params.feature;
    if (!isAiFeature(feature)) return res.status(404).json({ error: "Không có tính năng này." });
    const b = req.body as { enabled?: unknown; dailyLimit?: unknown; hourlyPerUser?: unknown };
    const limit = (v: unknown, max: number) => (v === null ? null : Number.isInteger(v) && (v as number) >= 1 && (v as number) <= max ? (v as number) : undefined);
    const data: Prisma.AiSettingUpdateInput = {};
    if (b.enabled !== undefined) data.enabled = !!b.enabled;
    if (b.dailyLimit !== undefined) {
      const v = limit(b.dailyLimit, 100_000);
      if (v === undefined) return res.status(400).json({ error: "Giới hạn mỗi ngày: 1–100.000 (để trống = không giới hạn)." });
      data.dailyLimit = v;
    }
    if (b.hourlyPerUser !== undefined) {
      const v = limit(b.hourlyPerUser, 1000);
      if (v === undefined) return res.status(400).json({ error: "Giới hạn mỗi người mỗi giờ: 1–1.000 (để trống = không giới hạn)." });
      data.hourlyPerUser = v;
    }
    await getAiSetting(feature);
    const row = await prisma.aiSetting.update({ where: { feature }, data });
    audit(me(req).id, "AI_SETTING", feature, JSON.stringify(data));
    res.json(row);
  });

  return r;
}
