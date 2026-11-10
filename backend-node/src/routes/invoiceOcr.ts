/**
 * routes/invoiceOcr.ts — Đọc hoá đơn nhà cung cấp bằng AI khi nhận hàng theo đơn mua.
 *
 * POST /purchasing/orders/:id/read-invoice { images: string[] (data URL, 1–3 ảnh), sharpness?: number[] (độ nét đo ở trình duyệt) }
 *   — Thủ kho / Quản lý chi nhánh
 *   → lưu ảnh (dùng lại làm chứng từ công nợ, không phải chụp lại) → AI đọc → kiểm tra bằng code → lưu InvoiceExtraction
 *   → { extractionId, readable, reason, header, lines, unmatched, totals, imageUrls }
 *   Chỉ là bản NHÁP: người nhận kiểm tra từng dòng rồi mới gọi /receive (không đổi logic nhập kho).
 *   AI tắt / thiếu khóa / lỗi / quá 20 giây → 503 { unavailable: true, reason, imageUrls }.
 * GET  /ai/invoice-ocr/status — { enabled } cho màn Nhận hàng (Thủ kho / Quản lý)
 * GET  /ai/invoice-ocr/stats (Owner) — số lần đọc, tỉ lệ đọc được, độ chính xác theo trường (AI so với giá trị người nhận xác nhận).
 */
import { Router } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import { attachStaff, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { inStore } from "../lib/storeScope.js";
import { saveDataUrlImage } from "../lib/uploadImage.js";
import { bizDayStart, bizToday } from "../lib/bizTime.js";
import { aiErrorMessage, hasGeminiKey } from "../ai/gemini.js";
import { getAiSetting } from "../ai/settings.js";
import { buildPoContext } from "../lib/invoiceOcr/context.js";
import { MAX_IMAGES, extractInvoice } from "../lib/invoiceOcr/extract.js";
import { applySharpness, validateExtraction, type DraftLine, type Validated } from "../lib/invoiceOcr/validate.js";

export function invoiceOcrRouter(prisma: PrismaClient) {
  const r = Router();
  const auth = attachStaff(prisma);
  const purchasingStore = [auth, requireRoles("Admin", "Warehouse"), requireStore];

  r.post("/purchasing/orders/:id/read-invoice", ...purchasingStore, async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const { images, sharpness } = req.body as { images?: unknown; sharpness?: unknown };
    if (!Array.isArray(images) || !images.length || images.length > MAX_IMAGES || images.some((x) => typeof x !== "string")) {
      return res.status(400).json({ error: `Gửi 1–${MAX_IMAGES} ảnh hoá đơn.` });
    }
    const ctx = await buildPoContext(prisma, Number(req.params.id));
    if (!ctx || !inStore(req, ctx)) return res.status(404).json({ error: "Không tìm thấy đơn mua." });
    if (ctx.status === "DELIVERED" || ctx.status === "CLOSED") return res.status(400).json({ error: "Đơn mua đã nhận đủ hoặc đã đóng." });

    // Lưu ảnh trước: AI tắt / lỗi thì người nhận vẫn dùng ảnh này làm chứng từ, không phải chụp lại
    const imageUrls: string[] = [];
    for (const img of images as string[]) {
      try {
        imageUrls.push(await saveDataUrlImage(img));
      } catch (e) {
        return res.status(400).json({ error: e instanceof Error ? e.message : "Ảnh không hợp lệ." });
      }
    }
    const unavailable = (reason: string) => res.status(503).json({ unavailable: true, reason, imageUrls });

    if (!hasGeminiKey()) return unavailable("Chưa cấu hình GEMINI_API_KEY.");
    const setting = await getAiSetting("INVOICE_OCR");
    if (!setting.enabled) return unavailable("Tính năng đọc hoá đơn bằng AI đang tắt.");
    if (setting.dailyLimit) {
      const today = await prisma.invoiceExtraction.count({ where: { createdAt: { gte: bizDayStart(bizToday()) } } });
      if (today >= setting.dailyLimit) return unavailable("Đã hết lượt đọc hoá đơn hôm nay.");
    }

    const base = { storeId: ctx.storeId, poId: ctx.poId, staffId: staff.id, imageUrls };
    let out: Awaited<ReturnType<typeof extractInvoice>>;
    try {
      out = await extractInvoice({ images: images as string[], ctx });
    } catch (e) {
      const reason = /abort|timeout/i.test(String((e as Error)?.name) + String((e as Error)?.message)) ? "AI đọc quá 20 giây." : aiErrorMessage(e);
      await prisma.invoiceExtraction.create({ data: { ...base, readable: false, error: reason.slice(0, 500) } }).catch(() => {});
      return unavailable(reason);
    }
    // Độ nét đo ở trình duyệt: ảnh mờ thì không tin số AI đọc (bắt kiểm từng dòng / coi như không đọc được)
    const validated = await validateExtraction(prisma, applySharpness(out.extraction, Array.isArray(sharpness) ? (sharpness as number[]) : undefined), ctx);
    const row = await prisma.invoiceExtraction.create({
      data: {
        ...base,
        readable: validated.readable,
        result: (out.raw ?? null) as Prisma.InputJsonValue,
        validated: validated as unknown as Prisma.InputJsonValue,
        model: out.model,
        tokensIn: out.tokensIn,
        tokensOut: out.tokensOut,
        latencyMs: out.latencyMs,
      },
    });
    res.json({ extractionId: row.id, imageUrls, latencyMs: out.latencyMs, ...validated });
  });

  /** Màn Nhận hàng có hiện nút "Đọc hoá đơn bằng AI" không (Thủ kho không xem được /ai/settings) */
  r.get("/ai/invoice-ocr/status", auth, requireRoles("Admin", "Warehouse"), async (_req, res) => {
    res.json({ enabled: hasGeminiKey() && (await getAiSetting("INVOICE_OCR")).enabled });
  });

  /** Độ chính xác theo trường: so dòng nháp AI (lúc đọc) với giá trị người nhận xác nhận (lúc nhập kho) */
  r.get("/ai/invoice-ocr/stats", auth, requireRoles("Owner"), async (_req, res) => {
    const rows = await prisma.invoiceExtraction.findMany({
      select: { readable: true, error: true, grnId: true, validated: true, finalLines: true, latencyMs: true, tokensIn: true, tokensOut: true },
    });
    const field = { item: [0, 0], receivedQty: [0, 0], expiryDate: [0, 0] };
    let lines = 0;
    for (const r of rows) {
      if (!r.grnId || !r.validated || !Array.isArray(r.finalLines)) continue;
      const drafts = (r.validated as unknown as Validated).lines ?? [];
      for (const f of r.finalLines as { itemId: number; receivedQty: number; expiryDate?: string | null }[]) {
        const d = drafts.find((x: DraftLine) => x.itemId === f.itemId);
        if (!d) continue;
        lines++;
        // Mặt hàng: AI thấy trên hoá đơn ⇔ người nhận nhận > 0
        field.item[0] += Number(!!d.invoice === f.receivedQty > 0);
        field.item[1]++;
        field.receivedQty[0] += Number(d.receivedQty === f.receivedQty);
        field.receivedQty[1]++;
        field.expiryDate[0] += Number((d.expiryDate ?? null) === (f.expiryDate || null));
        field.expiryDate[1]++;
      }
    }
    const ok = rows.filter((r) => !r.error);
    const rate = ([a, b]: number[]) => (b ? Math.round((a / b) * 1000) / 10 : null);
    res.json({
      reads: rows.length,
      errors: rows.length - ok.length,
      readableRate: ok.length ? Math.round((ok.filter((r) => r.readable).length / ok.length) * 1000) / 10 : null,
      confirmed: rows.filter((r) => r.grnId).length,
      confirmedLines: lines,
      accuracy: { item: rate(field.item), receivedQty: rate(field.receivedQty), expiryDate: rate(field.expiryDate) },
      avgLatencyMs: ok.length ? Math.round(ok.reduce((s, r) => s + r.latencyMs, 0) / ok.length) : null,
      avgTokens: ok.length ? Math.round(ok.reduce((s, r) => s + r.tokensIn + r.tokensOut, 0) / ok.length) : null,
    });
  });

  return r;
}
