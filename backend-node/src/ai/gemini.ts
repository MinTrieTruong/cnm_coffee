/**
 * ai/gemini.ts — Client Gemini dùng chung (SDK @google/genai).
 *
 * Khóa GEMINI_API_KEY chỉ nằm ở backend, không bao giờ trả ra ngoài.
 * Thiếu khóa: server vẫn chạy; hàm gọi Gemini ném AiConfigError, kho tri thức lui về tìm theo từ khóa.
 */
import { ApiError, GoogleGenAI } from "@google/genai";

export const AI_CONFIG = {
  // gemini-2.5-* đã ngừng cấp cho tài khoản mới (11/2026)
  chatModel: process.env.GEMINI_CHAT_MODEL || "gemini-3.5-flash",
  liteModel: process.env.GEMINI_LITE_MODEL || "gemini-3.5-flash-lite",
  embedModel: process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001",
  embedDim: Number(process.env.GEMINI_EMBED_DIM) || 768,
  pdfOcr: process.env.AI_PDF_OCR === "true",
};

export class AiConfigError extends Error {}

let client: GoogleGenAI | null = null;

export const hasGeminiKey = () => !!process.env.GEMINI_API_KEY?.trim();

export function gemini(): GoogleGenAI {
  if (!hasGeminiKey()) throw new AiConfigError("Chưa cấu hình GEMINI_API_KEY");
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!.trim() });
  return client;
}

const RETRY_STATUS = new Set([429, 500, 503]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Gemini quá tải / giới hạn tốc độ (gọi lại được) */
export const isBusy = (e: unknown) => e instanceof ApiError && RETRY_STATUS.has(e.status);

/** Gọi lại khi Gemini quá tải / giới hạn tốc độ: lùi 1s, 2s, 4s, 8s (`retries` lần) */
export async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= retries || !isBusy(e)) throw e;
      await sleep(1000 * 2 ** attempt);
    }
  }
}

/** Câu lỗi dễ hiểu cho người dùng (không lộ chi tiết khóa) */
export function aiErrorMessage(e: unknown): string {
  if (e instanceof AiConfigError) return e.message;
  if (e instanceof ApiError) {
    if (e.status === 429) return "Gemini đang giới hạn tốc độ (429) — thử lại sau ít phút.";
    if (e.status === 400 || e.status === 403) return `Gemini từ chối yêu cầu (${e.status}) — kiểm tra GEMINI_API_KEY và tên model.`;
    return `Gemini lỗi ${e.status}.`;
  }
  if (e instanceof Error && e.name === "TimeoutError") return "Gemini phản hồi quá lâu (quá 30 giây).";
  return e instanceof Error ? e.message : "Lỗi không xác định khi gọi Gemini.";
}

function l2normalize(values: number[]): Float32Array {
  const v = Float32Array.from(values);
  let sum = 0;
  for (const x of v) sum += x * x;
  const n = Math.sqrt(sum) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

/**
 * Embedding theo lô (≤ 100 đoạn mỗi lần gọi). Cắt còn GEMINI_EMBED_DIM chiều nên phải tự chuẩn hoá L2
 * — sau đó cosine = tích vô hướng.
 */
export async function embedTexts(texts: string[], taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<Float32Array[]> {
  const ai = gemini();
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const res = await withRetry(() =>
      ai.models.embedContent({
        model: AI_CONFIG.embedModel,
        contents: batch.map((text) => ({ role: "user", parts: [{ text }] })),
        config: { taskType, outputDimensionality: AI_CONFIG.embedDim, abortSignal: AbortSignal.timeout(30_000) },
      }),
    );
    const embs = res.embeddings ?? [];
    if (embs.length !== batch.length) throw new Error(`Gemini trả ${embs.length}/${batch.length} embedding.`);
    for (const e of embs) {
      if (!e.values?.length) throw new Error("Gemini trả embedding rỗng.");
      out.push(l2normalize(e.values));
    }
  }
  return out;
}

/** Float32Array ↔ bytes lưu cột MEDIUMBLOB (little-endian, như mọi máy x86/ARM hiện nay) */
export const vecToBytes = (v: Float32Array) => new Uint8Array(v.slice().buffer);
export function bytesToVec(b: Uint8Array): Float32Array {
  // Sao chép để căn lề 4 byte (Buffer của Prisma có thể lệch offset)
  const copy = new Uint8Array(b.byteLength);
  copy.set(b);
  return new Float32Array(copy.buffer);
}
