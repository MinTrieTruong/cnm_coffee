/**
 * ai/knowledge/ingest.ts — Hàng đợi xử lý tài liệu (trong tiến trình, tuần tự từng tài liệu).
 *
 *   PENDING → PROCESSING → trích văn bản → cắt đoạn → embedding → ghi đoạn mới → READY
 *                                                         (lỗi ở bước nào) → ERROR + errorMessage
 *
 * - Nội dung (kể cả tên tài liệu, vì tên nằm trong tiền tố embedding) giống lần trước và đoạn cũ đã có
 *   embedding đúng model → bỏ qua embedding, không tốn lượt gọi Gemini.
 * - Chưa có GEMINI_API_KEY: vẫn cắt đoạn và lưu (tìm được theo từ khóa); có khóa rồi bấm "Xử lý lại"
 *   hoặc khởi động lại server để tạo embedding.
 * - Mỗi lần đổi trạng thái phát socket `kb:doc_status` tới phòng quản trị.
 * Hàng đợi nằm trong bộ nhớ; khởi động lại server thì `resumeKnowledgeQueue` đưa tài liệu dở dang vào lại.
 */
import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "../../db.js";
import { getRealtime } from "../../lib/realtime.js";
import { storeRoom } from "../../lib/storeScope.js";
import { AI_CONFIG, aiErrorMessage, embedTexts, hasGeminiKey, vecToBytes } from "../gemini.js";
import { chunkText, type Chunk } from "./chunk.js";
import { cleanText, detectKind, extractFile } from "./extract.js";
import { invalidateKb } from "./search.js";
import { embedInput } from "./text.js";

/** Giới hạn văn bản mỗi tài liệu */
export const MAX_DOC_CHARS = 2_000_000;

/* ── Tệp gốc: lưu ngoài thư mục /uploads công khai, chỉ tải qua API có kiểm quyền ── */
const FILE_DIR = path.join(process.cwd(), "private-uploads", "knowledge");

export async function saveKnowledgeFile(buf: Buffer, ext: string): Promise<string> {
  await mkdir(FILE_DIR, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(path.join(FILE_DIR, name), buf);
  return `knowledge/${name}`;
}

const safeName = (fileUrl: string) => {
  const m = /^knowledge\/([0-9a-f-]{36}\.(pdf|docx|txt|md))$/.exec(fileUrl);
  return m ? path.join(FILE_DIR, m[1]) : null;
};

export async function readKnowledgeFile(fileUrl: string): Promise<Buffer | null> {
  const p = safeName(fileUrl);
  return p ? readFile(p).catch(() => null) : null;
}

export async function deleteKnowledgeFile(fileUrl: string | null | undefined) {
  const p = fileUrl ? safeName(fileUrl) : null;
  if (p) await unlink(p).catch(() => undefined);
}

/* ── Hỏi–Đáp ── */
export type FaqItem = { q: string; a: string };

export function parseFaq(raw: string): FaqItem[] {
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => ({ q: cleanText(String((x as FaqItem)?.q ?? "")), a: cleanText(String((x as FaqItem)?.a ?? "")) }))
      .filter((x) => x.q && x.a);
  } catch {
    return [];
  }
}

/* ── Socket ── */
async function emitStatus(doc: { id: number; knowledgeBaseId: number; status: string; chunkCount: number; errorMessage: string | null }, storeId: number | null) {
  const io = getRealtime();
  if (!io) return;
  // Kho chung cả chuỗi: báo mọi phòng quản trị (Owner xem "Tất cả chi nhánh" có mặt ở mọi phòng)
  const storeIds = storeId != null ? [storeId] : (await prisma.store.findMany({ select: { id: true } })).map((s) => s.id);
  if (!storeIds.length) return;
  io.to(storeIds.map((id) => storeRoom("admin_room", id))).emit("kb:doc_status", {
    documentId: doc.id,
    knowledgeBaseId: doc.knowledgeBaseId,
    status: doc.status,
    chunkCount: doc.chunkCount,
    error: doc.errorMessage,
  });
}

/* ── Xử lý một tài liệu (seed / script gọi thẳng; route dùng hàng đợi) ── */
export async function processDocument(id: number) {
  const doc = await prisma.knowledgeDocument.findUnique({ where: { id }, include: { knowledgeBase: { select: { storeId: true } } } });
  if (!doc) return;
  const storeId = doc.knowledgeBase.storeId;
  await emitStatus(await prisma.knowledgeDocument.update({ where: { id }, data: { status: "PROCESSING", errorMessage: null } }), storeId);

  try {
    let text: string;
    let pieces: Chunk[];
    let charCount: number;
    if (doc.sourceType === "FAQ") {
      const items = parseFaq(doc.rawText);
      if (!items.length) throw new Error("Bảng Hỏi–Đáp trống.");
      text = JSON.stringify(items);
      // Mỗi cặp Hỏi–Đáp là một đoạn, không cắt
      pieces = items.map((it) => ({ heading: it.q.slice(0, 300), content: `Hỏi: ${it.q}\nĐáp: ${it.a}` }));
      charCount = items.reduce((s, it) => s + it.q.length + it.a.length, 0);
    } else {
      if (doc.sourceType === "FILE") {
        const buf = doc.fileUrl ? await readKnowledgeFile(doc.fileUrl) : null;
        if (!buf) throw new Error("Không tìm thấy tệp gốc — hãy tải lại tệp.");
        const kind = detectKind(doc.fileName ?? "", buf);
        if (!kind) throw new Error("Tệp không đúng định dạng PDF / DOCX / TXT / MD.");
        text = await extractFile(kind, buf);
      } else text = cleanText(doc.rawText);
      if (!text) throw new Error("Tài liệu không có chữ.");
      if (text.length > MAX_DOC_CHARS) throw new Error(`Tài liệu quá dài (${text.length.toLocaleString("vi-VN")} ký tự, tối đa 2 triệu).`);
      pieces = chunkText(text);
      charCount = text.length;
    }
    if (!pieces.length) throw new Error("Không cắt được đoạn nào từ tài liệu.");

    const hash = createHash("sha256").update(`${doc.title}\n${text}`).digest("hex");
    const embed = hasGeminiKey();
    const old = await prisma.knowledgeChunk.findMany({ where: { documentId: id }, select: { embedModel: true, embedDim: true } });
    const reusable =
      hash === doc.contentHash &&
      old.length === pieces.length &&
      (!embed || old.every((c) => c.embedModel === AI_CONFIG.embedModel && c.embedDim === AI_CONFIG.embedDim));

    if (!reusable) {
      const vecs = embed ? await embedTexts(pieces.map((p) => embedInput(doc.title, p.heading, p.content)), "RETRIEVAL_DOCUMENT") : null;
      await prisma.$transaction([
        prisma.knowledgeChunk.deleteMany({ where: { documentId: id } }),
        prisma.knowledgeChunk.createMany({
          data: pieces.map((p, i) => ({
            documentId: id,
            knowledgeBaseId: doc.knowledgeBaseId,
            ordinal: i,
            heading: p.heading,
            content: p.content,
            charCount: p.content.length,
            embedding: vecs ? vecToBytes(vecs[i]) : null,
            embedModel: vecs ? AI_CONFIG.embedModel : null,
            embedDim: vecs ? AI_CONFIG.embedDim : null,
          })),
        }),
      ]);
    }
    const done = await prisma.knowledgeDocument.update({
      where: { id },
      data: {
        status: "READY",
        errorMessage: null,
        contentHash: hash,
        charCount,
        chunkCount: pieces.length,
        ...(doc.sourceType === "FILE" ? { rawText: text } : {}),
      },
    });
    invalidateKb(doc.knowledgeBaseId);
    await emitStatus(done, storeId);
  } catch (e) {
    const failed = await prisma.knowledgeDocument.update({ where: { id }, data: { status: "ERROR", errorMessage: aiErrorMessage(e).slice(0, 1000) } });
    invalidateKb(doc.knowledgeBaseId);
    await emitStatus(failed, storeId);
  }
}

/* ── Hàng đợi ── */
const queue: number[] = [];
let running = false;

async function drain() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const id = queue.shift()!;
      await processDocument(id).catch((e) => console.error(`[knowledge] xử lý tài liệu #${id} lỗi:`, e));
    }
  } finally {
    running = false;
  }
}

export function enqueueDocument(id: number) {
  if (!queue.includes(id)) queue.push(id);
  void drain();
}

/** Khởi động server: tài liệu dở dang + (khi đã có khóa) tài liệu chưa có embedding → xử lý lại */
export async function resumeKnowledgeQueue() {
  try {
    const pending = await prisma.knowledgeDocument.findMany({ where: { status: { in: ["PENDING", "PROCESSING"] } }, select: { id: true } });
    const missing = hasGeminiKey()
      ? await prisma.knowledgeDocument.findMany({ where: { status: "READY", chunks: { some: { embedding: null } } }, select: { id: true } })
      : [];
    for (const d of [...pending, ...missing]) enqueueDocument(d.id);
    if (pending.length + missing.length) console.log(`[knowledge] xử lý lại ${pending.length + missing.length} tài liệu`);
  } catch (e) {
    console.error("[knowledge] không nạp được hàng đợi:", e);
  }
}
