/**
 * routes/aiDashboard.ts — Bảng điều khiển AI, lịch sử thực thi, đánh giá câu trả lời.
 *
 * GET  /ai/dashboard?from&to&agentId    — (Chủ chuỗi) số liệu kỳ + kỳ trước, theo ngày, loại xử lý, agent,
 *                                          câu hỏi AI chưa trả lời được, phiên AI đang xử lý / chờ nhân viên
 * GET  /ai/runs?from&to&kind&agentId&status&rated&q&page — (Chủ chuỗi) lịch sử thực thi, phân trang
 * GET  /ai/runs/:id                     — (Chủ chuỗi) chi tiết: đoạn tài liệu, công cụ, token, độ trễ
 * POST /ai/runs/:id/feedback            — (nhân viên chat / quản lý) { rating: GOOD | BAD, correction?, knowledgeBaseId? }
 *                                          có câu trả lời đúng + kho → thêm vào bảng Hỏi–Đáp "Câu trả lời đã sửa" của kho
 */
import { Router, type Request } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";
import { attachStaff, isOwner, requireRoles, type StaffRequest } from "../middleware/staff.js";
import { reqStoreId } from "../lib/storeScope.js";
import { audit } from "../lib/audit.js";
import { addDaysYmd, bizDayEnd, bizDayStart, bizToday, daysInRange } from "../lib/bizTime.js";
import { foldVi } from "../ai/knowledge/text.js";
import { enqueueDocument, parseFaq } from "../ai/knowledge/ingest.js";
import { invalidateKb } from "../ai/knowledge/search.js";
import { inSchedule } from "../ai/agent/config.js";

/** Lượt có gọi AI (tính token, độ trễ); QUICK_REPLY / OUT_OF_HOURS không gọi AI, TEST là thử trong trang quản trị */
const LLM_KINDS = ["RAG", "FALLBACK", "HANDOFF", "ERROR"];
const CORRECTED_TITLE = "Câu trả lời đã sửa";
const validYmd = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export function aiDashboardRouter(prisma: PrismaClient) {
  const r = Router();
  const owner = [attachStaff(prisma), requireRoles("Owner")];
  const chatStaff = [attachStaff(prisma), requireRoles("Admin", "Cashier", "Waiter", "Kitchen")];

  function range(req: Request) {
    const to = validYmd(req.query.to) ?? bizToday();
    const from = validYmd(req.query.from) ?? addDaysYmd(to, -6);
    const days = Math.max(1, Math.min(366, daysInRange(from, to)));
    const prevTo = addDaysYmd(from, -1);
    const prevFrom = addDaysYmd(prevTo, -(days - 1));
    return { from, to, days, prevFrom, prevTo };
  }
  const agentFilter = (req: Request) => {
    const id = Number(req.query.agentId);
    return Number.isInteger(id) && id > 0 ? id : null;
  };

  /** Số liệu tổng của một kỳ */
  async function totals(fromYmd: string, toYmd: string, agentId: number | null) {
    const where: Prisma.AiRunLogWhereInput = { createdAt: { gte: bizDayStart(fromYmd), lte: bizDayEnd(toYmd) }, kind: { not: "TEST" }, ...(agentId ? { agentId } : {}) };
    const [all, llm, sessions, handoffSessions, ratings] = await Promise.all([
      prisma.aiRunLog.aggregate({ where, _count: { _all: true }, _sum: { promptTokens: true, outputTokens: true, thinkingTokens: true, costVnd: true } }),
      prisma.aiRunLog.aggregate({ where: { ...where, kind: { in: LLM_KINDS } }, _count: { _all: true }, _avg: { latencyMs: true } }),
      prisma.aiRunLog.groupBy({ by: ["sessionId"], where: { ...where, sessionId: { not: null } } }),
      prisma.aiRunLog.groupBy({ by: ["sessionId"], where: { ...where, sessionId: { not: null }, kind: { in: ["HANDOFF", "LIMIT", "ERROR"] } } }),
      prisma.aiRunLog.groupBy({ by: ["rating"], where: { ...where, rating: { not: null } }, _count: { _all: true } }),
    ]);
    // p95 độ trễ: lấy đúng 1 dòng ở vị trí 95%
    const n = llm._count._all;
    const p95 = n
      ? (await prisma.aiRunLog.findMany({ where: { ...where, kind: { in: LLM_KINDS } }, orderBy: { latencyMs: "asc" }, skip: Math.min(n - 1, Math.floor(n * 0.95)), take: 1, select: { latencyMs: true } }))[0]?.latencyMs ?? 0
      : 0;
    const conversations = sessions.length;
    const good = ratings.find((x) => x.rating === "GOOD")?._count._all ?? 0;
    const bad = ratings.find((x) => x.rating === "BAD")?._count._all ?? 0;
    return {
      messages: all._count._all,
      llmCalls: n,
      conversations,
      handoffConversations: handoffSessions.length,
      selfResolvedRate: conversations ? (conversations - handoffSessions.length) / conversations : null,
      promptTokens: all._sum.promptTokens ?? 0,
      outputTokens: all._sum.outputTokens ?? 0,
      thinkingTokens: all._sum.thinkingTokens ?? 0,
      tokens: (all._sum.promptTokens ?? 0) + (all._sum.outputTokens ?? 0) + (all._sum.thinkingTokens ?? 0),
      costVnd: Number(all._sum.costVnd ?? 0),
      avgLatencyMs: Math.round(llm._avg.latencyMs ?? 0),
      p95LatencyMs: p95,
      good,
      bad,
    };
  }

  r.get("/ai/dashboard", ...owner, async (req, res) => {
    const { from, to, days, prevFrom, prevTo } = range(req);
    const agentId = agentFilter(req);
    const start = bizDayStart(from);
    const end = bizDayEnd(to);
    const agentSql = agentId ? Prisma.sql`AND Agent_ID = ${agentId}` : Prisma.empty;

    const [cur, prev, agents, daily, kinds, byAgent, unansweredRows, pending, handoffs, recent] = await Promise.all([
      totals(from, to, agentId),
      totals(prevFrom, prevTo, agentId),
      prisma.aiAgent.findMany({ select: { id: true, name: true, enabled: true, scheduleMode: true, schedule: true, _count: { select: { bindings: true } } } }),
      // Theo ngày (giờ Việt Nam)
      prisma.$queryRaw<{ day: string; runs: bigint; llm: bigint; tokens: Prisma.Decimal | null; cost: Prisma.Decimal | null }[]>`
        SELECT DATE_FORMAT(DATE_ADD(Created_At, INTERVAL 7 HOUR), '%Y-%m-%d') AS day,
               COUNT(*) AS runs,
               SUM(Kind IN ('RAG','FALLBACK','HANDOFF','ERROR')) AS llm,
               SUM(Prompt_Tokens + Output_Tokens + Thinking_Tokens) AS tokens,
               SUM(Cost_VND) AS cost
        FROM AI_Run_Logs
        WHERE Created_At BETWEEN ${start} AND ${end} AND Kind <> 'TEST' ${agentSql}
        GROUP BY day ORDER BY day`,
      prisma.aiRunLog.groupBy({ by: ["kind"], where: { createdAt: { gte: start, lte: end }, kind: { not: "TEST" }, ...(agentId ? { agentId } : {}) }, _count: { _all: true }, _avg: { latencyMs: true } }),
      prisma.aiRunLog.groupBy({ by: ["agentId"], where: { createdAt: { gte: start, lte: end }, kind: { not: "TEST" } }, _count: { _all: true }, _sum: { costVnd: true, promptTokens: true, outputTokens: true, thinkingTokens: true } }),
      // Câu hỏi AI chưa trả lời được: không có căn cứ / chuyển nhân viên / lỗi
      prisma.aiRunLog.findMany({
        where: { createdAt: { gte: start, lte: end }, kind: { in: ["FALLBACK", "HANDOFF", "ERROR"] }, ...(agentId ? { agentId } : {}) },
        select: { id: true, input: true, kind: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 2000,
      }),
      // Đang xử lý: phiên AI đang đợi gộp tin / đợi nhân viên trước khi trả lời
      prisma.chatSession.findMany({
        where: { status: "open", aiPaused: false, aiReplyDueAt: { not: null } },
        select: { id: true, guestName: true, aiReplyDueAt: true, store: { select: { name: true } }, messages: { where: { sender: "customer" }, orderBy: { id: "desc" }, take: 1, select: { body: true, imageUrl: true } } },
        orderBy: { aiReplyDueAt: "asc" },
        take: 20,
      }),
      // AI đã chuyển, nhân viên chưa xử lý xong
      prisma.chatSession.findMany({
        where: { status: "open", aiPaused: true, aiPausedReason: "HANDOFF" },
        select: { id: true, guestName: true, aiHandoffSummary: true, updatedAt: true, store: { select: { name: true } } },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      prisma.aiRunLog.findMany({
        where: { kind: { not: "TEST" }, ...(agentId ? { agentId } : {}) },
        orderBy: { id: "desc" },
        take: 12,
        select: { id: true, kind: true, input: true, output: true, latencyMs: true, costVnd: true, createdAt: true, sessionId: true, errorMessage: true, agent: { select: { name: true } } },
      }),
    ]);

    // Gom câu hỏi gần giống: bỏ dấu, bỏ từ đệm, so theo 6 từ đầu
    const groups = new Map<string, { question: string; count: number; lastAt: Date; kinds: Set<string>; runId: number }>();
    for (const row of unansweredRows) {
      const q = row.input.split("\n").pop()?.trim() || row.input.trim();
      const key = foldVi(q).replace(/\b(a|ạ|oi|nha|nhe|vay|the|shop|quan|cho|minh|em|anh|chi|hoi)\b/g, " ").split(/\s+/).filter(Boolean).slice(0, 6).join(" ");
      if (!key) continue;
      const g = groups.get(key) ?? { question: q.slice(0, 300), count: 0, lastAt: row.createdAt, kinds: new Set<string>(), runId: row.id };
      g.count++;
      g.kinds.add(row.kind);
      groups.set(key, g);
    }
    const agentName = new Map(agents.map((a) => [a.id, a]));

    res.json({
      range: { from, to, days, prevFrom, prevTo },
      totals: cur,
      previous: prev,
      agents: { total: agents.length, active: agents.filter((a) => a.enabled && a._count.bindings > 0).length, online: agents.filter((a) => a.enabled && a._count.bindings > 0 && inSchedule(a)).length },
      daily: daily.map((d) => ({ day: d.day, runs: Number(d.runs), llm: Number(d.llm ?? 0), tokens: Number(d.tokens ?? 0), costVnd: Number(d.cost ?? 0) })),
      kinds: kinds.map((k) => ({ kind: k.kind, count: k._count._all, avgLatencyMs: Math.round(k._avg.latencyMs ?? 0) })).sort((a, b) => b.count - a.count),
      topAgents: byAgent
        .map((a) => ({
          agentId: a.agentId,
          name: agentName.get(a.agentId)?.name ?? `Agent #${a.agentId}`,
          enabled: agentName.get(a.agentId)?.enabled ?? false,
          runs: a._count._all,
          tokens: (a._sum.promptTokens ?? 0) + (a._sum.outputTokens ?? 0) + (a._sum.thinkingTokens ?? 0),
          costVnd: Number(a._sum.costVnd ?? 0),
        }))
        .sort((a, b) => b.runs - a.runs),
      unanswered: [...groups.values()]
        .sort((a, b) => b.count - a.count || b.lastAt.getTime() - a.lastAt.getTime())
        .slice(0, 15)
        .map((g) => ({ question: g.question, count: g.count, lastAt: g.lastAt, kinds: [...g.kinds], runId: g.runId })),
      live: {
        pending: pending.map((s) => ({ sessionId: s.id, guestName: s.guestName, storeName: s.store.name, dueAt: s.aiReplyDueAt, lastMessage: s.messages[0]?.body || (s.messages[0]?.imageUrl ? "[Ảnh]" : "") })),
        handoffs: handoffs.map((s) => ({ sessionId: s.id, guestName: s.guestName, storeName: s.store.name, summary: s.aiHandoffSummary, at: s.updatedAt })),
      },
      recent: recent.map((x) => ({ ...x, costVnd: Number(x.costVnd), agentName: x.agent.name, agent: undefined })),
    });
  });

  r.get("/ai/runs", ...owner, async (req, res) => {
    const { from, to } = range(req);
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = 30;
    const agentId = agentFilter(req);
    const kind = typeof req.query.kind === "string" && req.query.kind ? req.query.kind : null;
    const status = req.query.status;
    const rated = req.query.rated;
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const where: Prisma.AiRunLogWhereInput = {
      createdAt: { gte: bizDayStart(from), lte: bizDayEnd(to) },
      ...(kind ? { kind } : { kind: { not: "TEST" } }),
      ...(agentId ? { agentId } : {}),
      ...(status === "error" ? { OR: [{ kind: "ERROR" }, { errorMessage: { not: null } }] } : status === "ok" ? { kind: { notIn: ["ERROR", ...(kind ? [] : ["TEST"])] }, errorMessage: null } : {}),
      ...(rated === "yes" ? { rating: { not: null } } : rated === "no" ? { rating: null } : rated === "bad" ? { rating: "BAD" } : {}),
      ...(q ? { input: { contains: q } } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.aiRunLog.count({ where }),
      prisma.aiRunLog.findMany({
        where,
        orderBy: { id: "desc" },
        skip: (page - 1) * size,
        take: size,
        select: {
          id: true, kind: true, input: true, output: true, channel: true, storeId: true, sessionId: true, model: true,
          promptTokens: true, outputTokens: true, thinkingTokens: true, latencyMs: true, costVnd: true, errorMessage: true, rating: true, createdAt: true,
          agent: { select: { id: true, name: true } },
        },
      }),
    ]);
    const stores = new Map((await prisma.store.findMany({ select: { id: true, name: true } })).map((s) => [s.id, s.name]));
    res.json({
      total,
      page,
      pageSize: size,
      items: rows.map((x) => ({ ...x, costVnd: Number(x.costVnd), input: x.input.slice(0, 300), output: x.output.slice(0, 300), storeName: x.storeId ? stores.get(x.storeId) ?? null : null })),
    });
  });

  r.get("/ai/runs/:id", ...owner, async (req, res) => {
    const run = await prisma.aiRunLog.findUnique({ where: { id: Number(req.params.id) }, include: { agent: { select: { id: true, name: true } } } });
    if (!run) return res.status(404).json({ error: "Không tìm thấy lượt xử lý." });
    // Nội dung đoạn tài liệu đã đưa vào (đoạn có thể đã bị xoá / xử lý lại)
    const retrieved = (Array.isArray(run.retrieved) ? run.retrieved : []) as { chunkId: number }[];
    const chunks = new Map(
      (await prisma.knowledgeChunk.findMany({ where: { id: { in: retrieved.map((x) => x.chunkId) } }, select: { id: true, content: true } })).map((c) => [c.id, c.content]),
    );
    const [session, rater, store] = await Promise.all([
      run.sessionId ? prisma.chatSession.findUnique({ where: { id: run.sessionId }, select: { id: true, guestName: true, status: true } }) : null,
      run.ratedById ? prisma.staff.findUnique({ where: { id: run.ratedById }, select: { fullName: true } }) : null,
      run.storeId ? prisma.store.findUnique({ where: { id: run.storeId }, select: { name: true } }) : null,
    ]);
    res.json({
      ...run,
      costVnd: Number(run.costVnd),
      retrieved: retrieved.map((x) => ({ ...x, content: chunks.get(x.chunkId) ?? null })),
      session,
      ratedBy: rater?.fullName ?? null,
      storeName: store?.name ?? null,
    });
  });

  r.post("/ai/runs/:id/feedback", ...chatStaff, async (req, res) => {
    const actor = (req as StaffRequest).staffRow!;
    const run = await prisma.aiRunLog.findUnique({ where: { id: Number(req.params.id) } });
    if (!run) return res.status(404).json({ error: "Không tìm thấy lượt xử lý." });
    // Nhân viên chi nhánh chỉ đánh giá câu trả lời ở chi nhánh mình
    const sid = reqStoreId(req);
    if (!isOwner(actor.role) && run.storeId != null && run.storeId !== sid) return res.status(404).json({ error: "Không tìm thấy lượt xử lý." });
    const { rating, correction, knowledgeBaseId } = req.body as { rating?: string; correction?: string; knowledgeBaseId?: number };
    if (rating !== "GOOD" && rating !== "BAD") return res.status(400).json({ error: "Chọn Đúng hoặc Sai." });
    const fix = rating === "BAD" ? correction?.trim().slice(0, 5000) || null : null;

    let added: { knowledgeBaseId: number; documentId: number } | null = null;
    if (fix && knowledgeBaseId) {
      // Thêm cặp Hỏi–Đáp vào kho: Chủ chuỗi mọi kho; Quản lý chỉ kho chi nhánh mình
      const kb = await prisma.knowledgeBase.findUnique({ where: { id: Number(knowledgeBaseId) } });
      if (!kb) return res.status(400).json({ error: "Kho tri thức không tồn tại." });
      const canEdit = isOwner(actor.role) || (actor.role === "Admin" && kb.storeId != null && kb.storeId === sid);
      if (!canEdit) return res.status(403).json({ error: "Bạn không được thêm vào kho này (kho chung cả chuỗi chỉ Chủ chuỗi sửa)." });
      const question = (run.input.split("\n").filter(Boolean).pop() ?? run.input).trim().slice(0, 500);
      if (!question) return res.status(400).json({ error: "Lượt này không có câu hỏi để lưu." });
      const doc = await prisma.knowledgeDocument.findFirst({ where: { knowledgeBaseId: kb.id, sourceType: "FAQ", title: CORRECTED_TITLE } });
      const items = doc ? parseFaq(doc.rawText).filter((x) => foldVi(x.q) !== foldVi(question)) : [];
      items.push({ q: question, a: fix });
      const saved = doc
        ? await prisma.knowledgeDocument.update({ where: { id: doc.id }, data: { rawText: JSON.stringify(items), status: "PENDING" } })
        : await prisma.knowledgeDocument.create({ data: { knowledgeBaseId: kb.id, title: CORRECTED_TITLE, sourceType: "FAQ", rawText: JSON.stringify(items), status: "PENDING", createdById: actor.id } });
      enqueueDocument(saved.id);
      invalidateKb(kb.id);
      added = { knowledgeBaseId: kb.id, documentId: saved.id };
      audit(actor.id, "AI_CORRECTION", `AI run #${run.id}`, `Thêm Hỏi–Đáp vào kho #${kb.id}: ${question}`);
    }
    const updated = await prisma.aiRunLog.update({ where: { id: run.id }, data: { rating, ratedById: actor.id, correction: fix } });
    res.json({ rating: updated.rating, correction: updated.correction, added });
  });

  return r;
}
