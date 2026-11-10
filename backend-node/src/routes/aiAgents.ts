/**
 * routes/aiAgents.ts — Quản lý AI Agent tư vấn. Bộ máy trả lời: ai/agent/engine.ts
 *
 * Quyền: Chủ chuỗi tạo / sửa / bật tắt / xoá. Quản lý chi nhánh chỉ xem (và thử agent).
 *
 * GET    /ai/agents                 — danh sách + số kênh, số kho, lượt AI hôm nay
 * GET    /ai/agents/channels        — các kênh có thể gán (chat web cả chuỗi + từng chi nhánh) và agent đang giữ
 * GET    /ai/agents/:id             — đầy đủ cấu hình, kho, kênh, mẫu trả lời nhanh
 * POST   /ai/agents                 — tạo (cấu hình + kbIds + bindings + quickReplies)
 * PUT    /ai/agents/:id             — lưu (thay toàn bộ kbIds / bindings / quickReplies nếu gửi lên)
 * PATCH  /ai/agents/:id/enabled     — { enabled } bật / tắt nhanh
 * DELETE /ai/agents/:id
 * POST   /ai/agents/:id/test        — { messages: [{ role: "user" | "model", text }], storeId? } chạy thử, không lưu tin chat
 */
import { Router, type Request } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import { attachStaff, isOwner, requireRoles, type StaffRequest } from "../middleware/staff.js";
import { reqStoreId } from "../lib/storeScope.js";
import { audit } from "../lib/audit.js";
import { bizDayStart, bizToday } from "../lib/bizTime.js";
import { hasGeminiKey } from "../ai/gemini.js";
import { CHANNELS, DEFAULT_QUICK_REPLIES, DEFAULT_SCHEDULE, LIVE_CHANNELS, inSchedule, parseAgent, type AgentInput } from "../ai/agent/config.js";
import { matchQuickReply } from "../ai/agent/quickReply.js";
import { logRun, runAgent, splitReply, type Turn } from "../ai/agent/engine.js";

type BindingInput = { channel: string; storeId: number | null };
type QuickInput = { name?: string; matchType?: string; patterns?: unknown; replies?: unknown; action?: string; enabled?: boolean };
type Body = AgentInput & { kbIds?: unknown; bindings?: unknown; quickReplies?: unknown };

const DEFAULTS = {
  greeting: "Dạ {self} chào {customer}! {self} là trợ lý của TD Coffee. {customer} cần {self} tư vấn món, giá, khuyến mãi hay thông tin chi nhánh ạ?",
  fallbackMessage: "Dạ thông tin này {self} chưa nắm chắc, {self} chuyển {customer} sang nhân viên để được hỗ trợ chính xác nhé.",
  outOfHoursMessage: "Dạ hiện ngoài giờ trực tư vấn tự động. Nhân viên sẽ trả lời {customer} sớm nhất có thể ạ.",
};

const strList = (v: unknown, max: number) =>
  (Array.isArray(v) ? v : [])
    .map((x) => String(x ?? "").trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, max);

function parseQuick(items: unknown): Prisma.AiQuickReplyCreateManyAgentInput[] | string {
  if (!Array.isArray(items)) return "Mẫu trả lời nhanh không hợp lệ.";
  if (items.length > 50) return "Tối đa 50 mẫu trả lời nhanh.";
  const out: Prisma.AiQuickReplyCreateManyAgentInput[] = [];
  for (const [i, q] of (items as QuickInput[]).entries()) {
    const name = String(q?.name ?? "").trim().slice(0, 60);
    const patterns = strList(q?.patterns, 30);
    const replies = strList(q?.replies, 10);
    const action = q?.action === "HANDOFF" ? "HANDOFF" : "NONE";
    if (!name) return `Mẫu ${i + 1}: nhập tên.`;
    if (!patterns.length) return `Mẫu "${name}": cần ít nhất một câu / từ khóa để khớp.`;
    if (!replies.length && action !== "HANDOFF") return `Mẫu "${name}": cần ít nhất một câu trả lời.`;
    out.push({ name, matchType: q?.matchType === "EXACT" ? "EXACT" : "CONTAINS", patterns, replies, action, enabled: q?.enabled !== false, sortOrder: i });
  }
  return out;
}

export function aiAgentsRouter(prisma: PrismaClient) {
  const r = Router();
  const viewers = [attachStaff(prisma), requireRoles("Admin")];
  const owner = [attachStaff(prisma), requireRoles("Owner")];
  const actorId = (req: Request) => (req as StaffRequest).staffRow!.id;

  const full = { knowledgeBases: { select: { knowledgeBaseId: true } }, bindings: { include: { store: { select: { name: true } } } }, quickReplies: { orderBy: { sortOrder: "asc" as const } } };
  type Full = Prisma.AiAgentGetPayload<{ include: typeof full }>;

  const shape = (a: Full) => ({
    ...a,
    kbIds: a.knowledgeBases.map((k) => k.knowledgeBaseId),
    knowledgeBases: undefined,
    bindings: a.bindings.map((b) => ({ id: b.id, channel: b.channel, storeId: b.storeId, storeName: b.store?.name ?? null })),
    online: a.enabled && inSchedule(a),
  });

  /** Lưu kho / kênh / mẫu trả lời nhanh (thay toàn bộ phần được gửi lên) */
  async function saveRelations(tx: Prisma.TransactionClient, agentId: number, b: Body): Promise<string | null> {
    if (b.kbIds !== undefined) {
      const ids = [...new Set((Array.isArray(b.kbIds) ? b.kbIds : []).map(Number).filter(Number.isInteger))];
      const found = await tx.knowledgeBase.count({ where: { id: { in: ids } } });
      if (found !== ids.length) return "Có kho tri thức không tồn tại.";
      await tx.aiAgentKnowledgeBase.deleteMany({ where: { agentId } });
      if (ids.length) await tx.aiAgentKnowledgeBase.createMany({ data: ids.map((knowledgeBaseId) => ({ agentId, knowledgeBaseId })) });
    }
    if (b.bindings !== undefined) {
      const list = (Array.isArray(b.bindings) ? b.bindings : []) as BindingInput[];
      const seen = new Set<string>();
      const clean: BindingInput[] = [];
      for (const x of list) {
        if (!CHANNELS.includes(x?.channel as never)) return "Kênh không hợp lệ.";
        if (!LIVE_CHANNELS.includes(x.channel)) return "Kênh này chưa hỗ trợ.";
        const storeId = x.storeId == null ? null : Number(x.storeId);
        if (storeId != null && !(await tx.store.findUnique({ where: { id: storeId }, select: { id: true } }))) return "Chi nhánh không tồn tại.";
        const key = `${x.channel}:${storeId}`;
        if (!seen.has(key)) seen.add(key), clean.push({ channel: x.channel, storeId });
      }
      await tx.aiAgentBinding.deleteMany({ where: { agentId } });
      for (const x of clean) {
        // Kênh đang gán cho agent khác → chuyển sang agent này
        await tx.aiAgentBinding.deleteMany({ where: { channel: x.channel, storeId: x.storeId, channelAccountId: null } });
        await tx.aiAgentBinding.create({ data: { agentId, channel: x.channel, storeId: x.storeId } });
      }
    }
    if (b.quickReplies !== undefined) {
      const qs = parseQuick(b.quickReplies);
      if (typeof qs === "string") return qs;
      await tx.aiQuickReply.deleteMany({ where: { agentId } });
      if (qs.length) await tx.aiQuickReply.createMany({ data: qs.map((q) => ({ ...q, agentId })) });
    }
    return null;
  }

  r.get("/ai/agents", ...viewers, async (_req, res) => {
    const agents = await prisma.aiAgent.findMany({ include: full, orderBy: { updatedAt: "desc" } });
    const runs = await prisma.aiRunLog.groupBy({ by: ["agentId"], where: { createdAt: { gte: bizDayStart(bizToday()) }, kind: { not: "TEST" } }, _count: { _all: true } });
    const today = new Map(runs.map((x) => [x.agentId, x._count._all]));
    res.json({ items: agents.map((a) => ({ ...shape(a), runsToday: today.get(a.id) ?? 0 })), geminiReady: hasGeminiKey() });
  });

  r.get("/ai/agents/channels", ...viewers, async (_req, res) => {
    const [stores, bindings] = await Promise.all([
      prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { id: "asc" } }),
      prisma.aiAgentBinding.findMany({ where: { channelAccountId: null }, include: { agent: { select: { id: true, name: true, enabled: true } } } }),
    ]);
    const holder = (channel: string, storeId: number | null) => bindings.find((b) => b.channel === channel && b.storeId === storeId)?.agent ?? null;
    res.json({
      channels: CHANNELS.map((channel) => ({
        channel,
        live: LIVE_CHANNELS.includes(channel),
        targets: [{ storeId: null, name: "Cả chuỗi (mọi chi nhánh chưa gán riêng)" }, ...stores.map((s) => ({ storeId: s.id, name: s.name }))].map((t) => ({ ...t, agent: holder(channel, t.storeId) })),
      })),
    });
  });

  r.get("/ai/agents/:id", ...viewers, async (req, res) => {
    const a = await prisma.aiAgent.findUnique({ where: { id: Number(req.params.id) }, include: full });
    if (!a) return res.status(404).json({ error: "Không tìm thấy agent." });
    res.json({ ...shape(a), canEdit: isOwner((req as StaffRequest).staffRow!.role), geminiReady: hasGeminiKey() });
  });

  r.post("/ai/agents", ...owner, async (req, res) => {
    const b = req.body as Body;
    const parsed = parseAgent({ greeting: DEFAULTS.greeting, fallbackMessage: DEFAULTS.fallbackMessage, ...b }, false);
    if ("error" in parsed) return res.status(400).json({ error: parsed.error, fields: { [parsed.field]: parsed.error } });
    const result = await prisma.$transaction(async (tx) => {
      const a = await tx.aiAgent.create({
        data: {
          outOfHoursMessage: DEFAULTS.outOfHoursMessage,
          schedule: DEFAULT_SCHEDULE,
          ...(parsed.data as Prisma.AiAgentUncheckedCreateInput),
          createdById: actorId(req),
        },
      });
      const err = await saveRelations(tx, a.id, { ...b, quickReplies: b.quickReplies ?? DEFAULT_QUICK_REPLIES });
      if (err) throw Object.assign(new Error(err), { status: 400 });
      return a;
    }).catch((e: Error & { status?: number }) => (e.status === 400 ? e : Promise.reject(e)));
    if (result instanceof Error) return res.status(400).json({ error: result.message });
    audit(actorId(req), "AI_AGENT_CREATE", `AI Agent #${result.id}`, result.name);
    res.status(201).json(shape(await prisma.aiAgent.findUniqueOrThrow({ where: { id: result.id }, include: full })));
  });

  r.put("/ai/agents/:id", ...owner, async (req, res) => {
    const id = Number(req.params.id);
    if (!(await prisma.aiAgent.findUnique({ where: { id }, select: { id: true } }))) return res.status(404).json({ error: "Không tìm thấy agent." });
    const b = req.body as Body;
    const parsed = parseAgent(b, true);
    if ("error" in parsed) return res.status(400).json({ error: parsed.error, fields: { [parsed.field]: parsed.error } });
    const err = await prisma
      .$transaction(async (tx) => {
        await tx.aiAgent.update({ where: { id }, data: parsed.data });
        const e = await saveRelations(tx, id, b);
        if (e) throw Object.assign(new Error(e), { status: 400 });
      })
      .then(() => null)
      .catch((e: Error & { status?: number }) => (e.status === 400 ? e.message : Promise.reject(e)));
    if (err) return res.status(400).json({ error: err });
    const a = await prisma.aiAgent.findUniqueOrThrow({ where: { id }, include: full });
    audit(actorId(req), "AI_AGENT_UPDATE", `AI Agent #${id}`, a.name);
    res.json(shape(a));
  });

  r.patch("/ai/agents/:id/enabled", ...owner, async (req, res) => {
    const id = Number(req.params.id);
    const enabled = !!(req.body as { enabled?: boolean }).enabled;
    const a = await prisma.aiAgent.update({ where: { id }, data: { enabled }, include: full });
    audit(actorId(req), enabled ? "AI_AGENT_ENABLE" : "AI_AGENT_DISABLE", `AI Agent #${id}`, a.name);
    res.json(shape(a));
  });

  r.delete("/ai/agents/:id", ...owner, async (req, res) => {
    const id = Number(req.params.id);
    const a = await prisma.aiAgent.findUnique({ where: { id } });
    if (!a) return res.status(404).json({ error: "Không tìm thấy agent." });
    await prisma.aiAgent.delete({ where: { id } });
    audit(actorId(req), "AI_AGENT_DELETE", `AI Agent #${id}`, a.name);
    res.status(204).end();
  });

  /** Thử agent: chạy đúng bộ máy (mẫu nhanh → truy xuất → Gemini + công cụ) nhưng không lưu tin chat */
  r.post("/ai/agents/:id/test", ...viewers, async (req, res) => {
    const agent = await prisma.aiAgent.findUnique({ where: { id: Number(req.params.id) }, include: { quickReplies: true } });
    if (!agent) return res.status(404).json({ error: "Không tìm thấy agent." });
    const { messages, storeId: rawStore } = req.body as { messages?: Turn[]; storeId?: number };
    const turns = (Array.isArray(messages) ? messages : [])
      .filter((m) => (m?.role === "user" || m?.role === "model") && typeof m.text === "string")
      .map((m) => ({ role: m.role, text: m.text.slice(0, 2000) }))
      .slice(-41);
    const last = turns[turns.length - 1];
    if (!last || last.role !== "user" || !last.text.trim()) return res.status(400).json({ error: "Nhập tin nhắn để thử." });
    const storeId = reqStoreId(req) ?? (Number.isInteger(rawStore) ? rawStore! : (await prisma.store.findFirst({ where: { isActive: true }, select: { id: true } }))?.id);
    if (!storeId) return res.status(400).json({ error: "Chưa có chi nhánh nào." });

    const quick = agent.quickRepliesEnabled ? matchQuickReply(last.text, agent.quickReplies, agent) : null;
    if (quick) {
      const run = await logRun({ agentId: agent.id, storeId, kind: "TEST", input: last.text, output: `${quick.name}: ${quick.reply}` });
      return res.json({ runId: run.id, kind: "QUICK_REPLY", bubbles: quick.reply ? [quick.reply] : [], handoff: quick.action === "HANDOFF" ? { reason: "Mẫu trả lời nhanh: gặp nhân viên" } : null, quickReply: quick.name, retrieved: [], toolCalls: [], latencyMs: 0 });
    }
    const history = turns.slice(-agent.historySize - 1, -1);
    const prevUser = [...history].reverse().find((t) => t.role === "user")?.text;
    const result = await runAgent({ agent, storeId, customerId: null, history, userText: last.text, previousUserText: prevUser });
    const run = await logRun({
      agentId: agent.id, storeId, kind: "TEST", input: last.text, output: result.text,
      retrieved: result.retrieved.map((x) => ({ chunkId: x.chunkId, documentId: x.documentId, title: x.title, heading: x.heading, vectorScore: x.vectorScore, keywordScore: x.keywordScore })),
      toolCalls: result.toolCalls as Prisma.InputJsonValue, model: result.model, promptTokens: result.promptTokens, outputTokens: result.outputTokens,
      thinkingTokens: result.thinkingTokens, latencyMs: result.latencyMs, costVnd: result.costVnd, errorMessage: result.error ?? null,
    });
    res.json({
      runId: run.id,
      kind: result.kind,
      bubbles: splitReply(result.text, agent.splitLongMessages),
      handoff: result.handoff,
      retrieved: result.retrieved,
      toolCalls: result.toolCalls,
      promptTokens: result.promptTokens,
      outputTokens: result.outputTokens,
      thinkingTokens: result.thinkingTokens,
      latencyMs: result.latencyMs,
      costVnd: result.costVnd,
      model: result.model,
      error: result.error,
    });
  });

  return r;
}
