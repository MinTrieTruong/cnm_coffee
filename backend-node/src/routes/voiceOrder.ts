/**
 * routes/voiceOrder.ts — Đặt món bằng giọng nói / câu tự nhiên.
 *
 * POST /voice-order/parse (multipart): audio (file ≤ 1 MB) hoặc text (≤ 500 ký tự); current (JSON giỏ đang xác nhận, tùy chọn)
 *   - Có token nhân sự → kênh POS: chi nhánh theo phiên nhân viên (Owner phải chọn chi nhánh), tính năng VOICE_ORDER_POS.
 *   - Không → kênh web khách: store (id chi nhánh như /api/menu?store=), sessionKey (mã phiên trình duyệt, như /search-log),
 *     tính năng VOICE_ORDER_WEB; tối đa N lần / phiên / giờ (cài đặt), 30 lần / IP / giờ, hạn mức ngày.
 *   → { transcript, intent, lines, unknown, clarify } — chỉ là đề xuất, người dùng xác nhận mới thêm vào đơn / giỏ.
 *   AI tắt / thiếu khóa / lỗi / quá 10 giây → 503 { unavailable: true, reason } (không 500).
 * GET  /voice-order/status?store= → { pos, web }: giao diện có hiện nút micro / ô đặt nhanh không.
 */
import { createHash } from "crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import type { PrismaClient } from "@prisma/client";
import { attachStaff, type StaffRequest } from "../middleware/staff.js";
import { optionalCustomerAuth } from "../middleware/customer.js";
import { verifyToken, type StaffPayload } from "../lib/jwt.js";
import { storeFromQuery } from "../lib/storeProducts.js";
import { bizDayStart, bizToday } from "../lib/bizTime.js";
import { AUDIO_MAX_BYTES, aiErrorMessage, audioMime, hasGeminiKey } from "../ai/gemini.js";
import { getAiSetting, type AiFeature } from "../ai/settings.js";
import { parseOrder, type CartLine, type Channel } from "../lib/voiceOrder/parse.js";

const MAX_TEXT = 500;
const IP_PER_HOUR = 30;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: AUDIO_MAX_BYTES, files: 1 } });

const ipHash = (ip: string | undefined) => createHash("sha256").update(`voice:${ip ?? ""}`).digest("hex").slice(0, 16);

export function voiceOrderRouter(prisma: PrismaClient) {
  const r = Router();
  const staffAuth = attachStaff(prisma);

  /** Token nhân sự (typ = staff) → kênh POS; còn lại (không token / token khách) → web */
  const isStaffRequest = (req: Request) => {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) return false;
    try {
      return verifyToken<StaffPayload>(h.slice(7)).typ === "staff";
    } catch {
      return false;
    }
  };

  async function available(feature: AiFeature) {
    if (!hasGeminiKey()) return { ok: false as const, reason: "Chưa cấu hình GEMINI_API_KEY." };
    const s = await getAiSetting(feature);
    return s.enabled ? { ok: true as const, setting: s } : { ok: false as const, reason: "Tính năng đặt món bằng giọng nói đang tắt." };
  }

  /** multer: file quá lớn / sai trường → 400 dễ hiểu thay vì lỗi chung */
  const receive = (req: Request, res: Response, next: NextFunction) =>
    upload.single("audio")(req, res, (err: unknown) => {
      if (!err) return next();
      const big = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE";
      res.status(400).json({ error: big ? "Đoạn ghi âm quá dài (tối đa khoảng 20 giây)." : "Dữ liệu ghi âm không hợp lệ." });
    });

  r.post("/voice-order/parse", receive, async (req, res) => {
    const b = req.body as { text?: string; current?: string; store?: string; sessionKey?: string };
    const t0 = Date.now();
    let channel: Channel;
    let storeId: number;
    let staffId: number | null = null;
    let customerId: number | null = null;
    let sessionKey: string;

    if (isStaffRequest(req)) {
      channel = "POS";
      await new Promise<void>((resolve) => void staffAuth(req, res, () => resolve()).then(() => resolve()));
      if (res.headersSent) return;
      const sr = req as StaffRequest;
      if (sr.storeId == null) return res.status(400).json({ error: "Hãy chọn chi nhánh trước khi gọi món." });
      storeId = sr.storeId;
      staffId = sr.staffRow!.id;
      sessionKey = `pos-staff-${staffId}`;
    } else {
      channel = "WEB";
      await new Promise<void>((resolve) => optionalCustomerAuth(req, res, () => resolve()));
      customerId = (req as Request & { customerId?: number }).customerId ?? null;
      const sid = storeFromQuery(b.store);
      const store = sid ? await prisma.store.findUnique({ where: { id: sid }, select: { id: true, isActive: true } }) : null;
      if (!store?.isActive) return res.status(400).json({ error: "Hãy chọn chi nhánh trước khi đặt món." });
      storeId = store.id;
      sessionKey = String(b.sessionKey ?? "").trim().slice(0, 64);
      if (!sessionKey) return res.status(400).json({ error: "Thiếu mã phiên." });
    }

    const feature: AiFeature = channel === "POS" ? "VOICE_ORDER_POS" : "VOICE_ORDER_WEB";
    const av = await available(feature);
    if (!av.ok) return res.status(503).json({ unavailable: true, reason: av.reason });

    // Hạn mức: ngày (cả hệ thống), phiên / giờ và IP / giờ (web khách)
    const hourAgo = new Date(Date.now() - 3_600_000);
    const ip = ipHash(req.ip);
    const [today, perSession, perIp] = await Promise.all([
      av.setting.dailyLimit ? prisma.aiCallLog.count({ where: { feature, createdAt: { gte: bizDayStart(bizToday()) } } }) : 0,
      channel === "WEB" && av.setting.hourlyPerUser ? prisma.aiCallLog.count({ where: { feature, sessionKey, createdAt: { gte: hourAgo } } }) : 0,
      channel === "WEB" ? prisma.aiCallLog.count({ where: { feature, ipHash: ip, createdAt: { gte: hourAgo } } }) : 0,
    ]);
    if (av.setting.dailyLimit && today >= av.setting.dailyLimit) return res.status(503).json({ unavailable: true, reason: "Đã hết lượt đặt món bằng giọng nói hôm nay." });
    if ((av.setting.hourlyPerUser && perSession >= av.setting.hourlyPerUser) || perIp >= IP_PER_HOUR) {
      return res.status(429).json({ error: "Bạn thử lại sau ít phút nhé." });
    }

    // Đầu vào: âm thanh hoặc chữ
    let audio: { data: Buffer; mimeType: string } | undefined;
    if (req.file) {
      const mimeType = audioMime(req.file.mimetype);
      if (!mimeType) return res.status(400).json({ error: "Định dạng ghi âm không hỗ trợ." });
      if (req.file.size < 1000) return res.status(400).json({ error: "Đoạn ghi âm quá ngắn, giữ nút lâu hơn một chút nhé." });
      audio = { data: req.file.buffer, mimeType };
    }
    const text = typeof b.text === "string" ? b.text.trim() : "";
    if (!audio && !text) return res.status(400).json({ error: "Hãy nói hoặc gõ món bạn muốn." });
    if (text.length > MAX_TEXT) return res.status(400).json({ error: `Tối đa ${MAX_TEXT} ký tự.` });
    let current: Partial<CartLine>[] = [];
    if (b.current) {
      try {
        const v = JSON.parse(b.current) as unknown;
        if (Array.isArray(v)) current = v as Partial<CartLine>[];
      } catch {
        return res.status(400).json({ error: "Giỏ đang xác nhận không hợp lệ." });
      }
    }

    const log = (data: { status: "OK" | "ERROR"; model?: string; tokensIn?: number; tokensOut?: number; error?: string }) =>
      prisma.aiCallLog
        .create({ data: { feature, storeId, staffId, sessionKey: channel === "WEB" ? sessionKey : null, ipHash: channel === "WEB" ? ip : null, inputKind: audio ? "audio" : "text", latencyMs: Date.now() - t0, ...data } })
        .catch(() => {});

    try {
      const out = await parseOrder({ storeId, channel, audio, text: audio ? undefined : text, current, sessionKey, customerId });
      await log({ status: "OK", model: out.model, tokensIn: out.tokensIn, tokensOut: out.tokensOut });
      res.json({ transcript: out.transcript, intent: out.intent, lines: out.lines, unknown: out.unknown, clarify: out.clarify, latencyMs: out.latencyMs });
    } catch (e) {
      const reason = aiErrorMessage(e);
      console.warn(`[voice-order] ${channel} store ${storeId}: ${reason}`);
      await log({ status: "ERROR", error: reason.slice(0, 500) });
      res.status(503).json({ unavailable: true, reason: e instanceof Error && /abort|timeout/i.test(`${e.name} ${e.message}`) ? "AI phản hồi quá lâu, bạn thử lại hoặc chọn món bằng tay nhé." : reason });
    }
  });

  r.get("/voice-order/status", async (_req, res) => {
    if (!hasGeminiKey()) return res.json({ pos: false, web: false });
    const [pos, web] = await Promise.all([getAiSetting("VOICE_ORDER_POS"), getAiSetting("VOICE_ORDER_WEB")]);
    res.json({ pos: pos.enabled, web: web.enabled });
  });

  return r;
}
