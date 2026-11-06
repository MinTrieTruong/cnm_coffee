/**
 * routes/knowledge.ts — Kho tri thức cho AI tư vấn (RAG). Xử lý tài liệu: ai/knowledge/ingest.ts
 *
 * Quyền: Chủ chuỗi toàn quyền. Quản lý chi nhánh xem kho chung cả chuỗi + kho của chi nhánh mình,
 * chỉ tạo / sửa / xoá kho và tài liệu của chi nhánh mình.
 *
 * GET    /knowledge-bases                          — danh sách kho kèm thống kê
 * POST   /knowledge-bases                          — { name, description?, storeId? }
 * GET    /knowledge-bases/:id
 * PATCH  /knowledge-bases/:id                      — { name?, description?, storeId?, enabled? }
 * DELETE /knowledge-bases/:id
 * GET    /knowledge-bases/:id/documents
 * POST   /knowledge-bases/:id/documents/upload     — multipart `files` (≤ 10 MB/tệp; .pdf .docx .txt .md)
 * POST   /knowledge-bases/:id/documents/text       — { title, text }
 * POST   /knowledge-bases/:id/documents/faq        — { title, items: [{ q, a }] }
 * POST   /knowledge-bases/:id/documents/faq/import — multipart `file` (CSV 2 cột "Câu hỏi","Trả lời") + `title`
 * PATCH  /knowledge-documents/:id                  — { title?, enabled?, text?, items? } (đổi nội dung → xử lý lại)
 * POST   /knowledge-documents/:id/reindex
 * DELETE /knowledge-documents/:id
 * GET    /knowledge-documents/:id/chunks
 * GET    /knowledge-documents/:id/file             — tải tệp gốc
 * POST   /knowledge-bases/search-test              — { kbIds, query, k? } → các đoạn kèm điểm + thời gian
 */
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import multer from "multer";
import type { KnowledgeBase, Prisma, PrismaClient } from "@prisma/client";
import { attachStaff, isOwner, requireRoles, type StaffRequest } from "../middleware/staff.js";
import { reqStoreId } from "../lib/storeScope.js";
import { audit } from "../lib/audit.js";
import { hasGeminiKey } from "../ai/gemini.js";
import { cleanText, detectKind, KIND_MIME } from "../ai/knowledge/extract.js";
import {
  MAX_DOC_CHARS,
  deleteKnowledgeFile,
  enqueueDocument,
  parseFaq,
  readKnowledgeFile,
  saveKnowledgeFile,
  type FaqItem,
} from "../ai/knowledge/ingest.js";
import { invalidateKb, searchKnowledge } from "../ai/knowledge/search.js";

const MAX_FILE = 10 * 1024 * 1024;
const MAX_FAQ = 2000;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE, files: 20 } });

/** multer báo lỗi (tệp quá lớn, quá nhiều tệp) → 400 tiếng Việt */
const withFiles = (mw: RequestHandler) => (req: Request, res: Response, next: NextFunction) =>
  mw(req, res, (err?: unknown) => {
    if (!err) return next();
    const code = err instanceof multer.MulterError ? err.code : "";
    const msg =
      code === "LIMIT_FILE_SIZE" ? "Tệp quá lớn (tối đa 10 MB mỗi tệp)." : code === "LIMIT_FILE_COUNT" ? "Tối đa 20 tệp mỗi lần tải." : "Tệp tải lên không hợp lệ.";
    res.status(400).json({ error: msg });
  });

/** Tên tệp: multer đọc theo latin1 → đổi về UTF-8, bỏ ký tự đường dẫn / điều khiển */
function fileNameOf(f: Express.Multer.File) {
  const name = Buffer.from(f.originalname, "latin1").toString("utf8").normalize("NFC");
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(-200) || "tai-lieu";
}

/** CSV 2 cột (Câu hỏi, Trả lời): hỗ trợ ô có dấu nháy kép, dấu phẩy / chấm phẩy, BOM; bỏ dòng tiêu đề */
export function parseFaqCsv(csv: string): FaqItem[] {
  const text = csv.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) row.push(cell), (cell = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell), rows.push(row), (row = []), (cell = "");
    } else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  const items = rows.map((r) => ({ q: cleanText(r[0] ?? ""), a: cleanText(r[1] ?? "") })).filter((x) => x.q && x.a);
  if (items.length && /^(cau hoi|câu hỏi|question|q|hỏi)$/i.test(items[0].q.trim())) items.shift();
  return items;
}

function validFaq(items: unknown): FaqItem[] | string {
  if (!Array.isArray(items)) return "Nhập ít nhất một cặp Hỏi–Đáp.";
  const out = items
    .map((x) => ({ q: cleanText(String((x as FaqItem)?.q ?? "")), a: cleanText(String((x as FaqItem)?.a ?? "")) }))
    .filter((x) => x.q || x.a);
  if (!out.length) return "Nhập ít nhất một cặp Hỏi–Đáp.";
  if (out.length > MAX_FAQ) return `Tối đa ${MAX_FAQ} cặp Hỏi–Đáp mỗi tài liệu.`;
  const bad = out.findIndex((x) => !x.q || !x.a);
  if (bad >= 0) return `Dòng ${bad + 1}: cần cả câu hỏi và câu trả lời.`;
  if (out.some((x) => x.q.length > 500 || x.a.length > 5000)) return "Câu hỏi tối đa 500 ký tự, câu trả lời tối đa 5.000 ký tự.";
  return out;
}

const fileTypeOf = (d: { sourceType: string; fileName: string | null }) =>
  d.sourceType === "FILE" ? (d.fileName?.toLowerCase().split(".").pop() ?? "file").toUpperCase() : d.sourceType;

export function knowledgeRouter(prisma: PrismaClient) {
  const r = Router();
  const managers = [attachStaff(prisma), requireRoles("Admin")];
  const actorOf = (req: Request) => (req as StaffRequest).staffRow!;

  /** Kho xem được: Owner (tất cả / chi nhánh đang chọn + kho chung); Quản lý: kho chung + chi nhánh mình */
  const visibleWhere = (req: Request): Prisma.KnowledgeBaseWhereInput => {
    const sid = reqStoreId(req);
    return sid == null ? {} : { OR: [{ storeId: null }, { storeId: sid }] };
  };
  const canEdit = (req: Request, kb: { storeId: number | null }) => isOwner(actorOf(req).role) || (kb.storeId != null && kb.storeId === reqStoreId(req));

  /** Lấy kho theo :id và kiểm quyền; lỗi thì đã trả response và trả null */
  async function kbFor(req: Request, res: Response, edit: boolean): Promise<KnowledgeBase | null> {
    const id = Number(req.params.id);
    const kb = Number.isInteger(id) ? await prisma.knowledgeBase.findFirst({ where: { id, ...visibleWhere(req) } }) : null;
    if (!kb) {
      res.status(404).json({ error: "Không tìm thấy kho tri thức." });
      return null;
    }
    if (edit && !canEdit(req, kb)) {
      res.status(403).json({ error: "Kho dùng chung cả chuỗi chỉ Chủ chuỗi được sửa." });
      return null;
    }
    return kb;
  }

  async function docFor(req: Request, res: Response, edit: boolean) {
    const id = Number(req.params.id);
    const doc = Number.isInteger(id) ? await prisma.knowledgeDocument.findUnique({ where: { id } }) : null;
    const kb = doc && (await prisma.knowledgeBase.findFirst({ where: { id: doc.knowledgeBaseId, ...visibleWhere(req) } }));
    if (!doc || !kb) {
      res.status(404).json({ error: "Không tìm thấy tài liệu." });
      return null;
    }
    if (edit && !canEdit(req, kb)) {
      res.status(403).json({ error: "Tài liệu thuộc kho dùng chung cả chuỗi chỉ Chủ chuỗi được sửa." });
      return null;
    }
    return doc;
  }

  /** Chi nhánh của kho khi tạo / sửa: Owner chọn (null = cả chuỗi); Quản lý luôn là chi nhánh mình */
  async function storeIdFrom(req: Request, raw: unknown): Promise<number | null | string> {
    if (!isOwner(actorOf(req).role)) return reqStoreId(req);
    if (raw == null || raw === "") return null;
    const sid = Number(raw);
    const store = Number.isInteger(sid) ? await prisma.store.findUnique({ where: { id: sid }, select: { id: true } }) : null;
    return store ? store.id : "Chi nhánh không tồn tại.";
  }

  const shapeKb = async (req: Request, kbs: (KnowledgeBase & { store: { name: string } | null })[]) => {
    const agentLinks = await prisma.aiAgentKnowledgeBase.groupBy({ by: ["knowledgeBaseId"], where: { knowledgeBaseId: { in: kbs.map((k) => k.id) } }, _count: { _all: true } });
    const agents = new Map(agentLinks.map((a) => [a.knowledgeBaseId, a._count._all]));
    const docs = await prisma.knowledgeDocument.findMany({
      where: { knowledgeBaseId: { in: kbs.map((k) => k.id) } },
      select: { knowledgeBaseId: true, status: true, enabled: true, charCount: true, chunkCount: true, sourceType: true, fileName: true },
    });
    return kbs.map((kb) => {
      const mine = docs.filter((d) => d.knowledgeBaseId === kb.id);
      return {
        id: kb.id,
        name: kb.name,
        description: kb.description,
        storeId: kb.storeId,
        storeName: kb.store?.name ?? null,
        enabled: kb.enabled,
        createdAt: kb.createdAt,
        updatedAt: kb.updatedAt,
        docCount: mine.length,
        readyCount: mine.filter((d) => d.status === "READY").length,
        errorCount: mine.filter((d) => d.status === "ERROR").length,
        processingCount: mine.filter((d) => d.status === "PENDING" || d.status === "PROCESSING").length,
        charCount: mine.reduce((s, d) => s + (d.enabled ? d.charCount : 0), 0),
        chunkCount: mine.reduce((s, d) => s + (d.enabled && d.status === "READY" ? d.chunkCount : 0), 0),
        sourceTypes: [...new Set(mine.map(fileTypeOf))],
        agentCount: agents.get(kb.id) ?? 0,
        canEdit: canEdit(req, kb),
      };
    });
  };

  /* ═══════════ Kho ═══════════ */

  r.get("/knowledge-bases", ...managers, async (req, res) => {
    const kbs = await prisma.knowledgeBase.findMany({ where: visibleWhere(req), include: { store: { select: { name: true } } }, orderBy: [{ storeId: "asc" }, { name: "asc" }] });
    res.json({ items: await shapeKb(req, kbs), geminiReady: hasGeminiKey() });
  });

  r.post("/knowledge-bases/search-test", ...managers, async (req, res) => {
    const { kbIds, query, k } = req.body as { kbIds?: unknown; query?: unknown; k?: unknown };
    const q = typeof query === "string" ? query.trim().slice(0, 1000) : "";
    if (!q) return res.status(400).json({ error: "Nhập câu hỏi để thử tìm." });
    const ids = Array.isArray(kbIds) ? kbIds.map(Number).filter(Number.isInteger) : [];
    const allowed = (await prisma.knowledgeBase.findMany({ where: { id: { in: ids }, ...visibleWhere(req) }, select: { id: true } })).map((x) => x.id);
    if (!allowed.length) return res.status(400).json({ error: "Chọn ít nhất một kho tri thức." });
    const topK = Math.min(10, Math.max(1, Number(k) || 5));
    res.json(await searchKnowledge({ kbIds: allowed, query: q, k: topK }));
  });

  r.post("/knowledge-bases", ...managers, async (req, res) => {
    const { name, description, storeId } = req.body as { name?: string; description?: string; storeId?: unknown };
    if (!name?.trim()) return res.status(400).json({ error: "Nhập tên kho tri thức." });
    const sid = await storeIdFrom(req, storeId);
    if (typeof sid === "string") return res.status(400).json({ error: sid });
    const actor = actorOf(req);
    const kb = await prisma.knowledgeBase.create({
      data: { name: name.trim().slice(0, 150), description: description?.trim().slice(0, 1000) || null, storeId: sid, createdById: actor.id },
      include: { store: { select: { name: true } } },
    });
    audit(actor.id, "KB_CREATE", `Kho tri thức #${kb.id}`, kb.name);
    res.status(201).json((await shapeKb(req, [kb]))[0]);
  });

  r.get("/knowledge-bases/:id", ...managers, async (req, res) => {
    const kb = await kbFor(req, res, false);
    if (!kb) return;
    const full = await prisma.knowledgeBase.findUniqueOrThrow({ where: { id: kb.id }, include: { store: { select: { name: true } } } });
    res.json({ ...(await shapeKb(req, [full]))[0], geminiReady: hasGeminiKey() });
  });

  r.patch("/knowledge-bases/:id", ...managers, async (req, res) => {
    const kb = await kbFor(req, res, true);
    if (!kb) return;
    const b = req.body as { name?: string; description?: string | null; storeId?: unknown; enabled?: boolean };
    const data: Prisma.KnowledgeBaseUncheckedUpdateInput = {};
    if (b.name !== undefined) {
      if (!b.name.trim()) return res.status(400).json({ error: "Nhập tên kho tri thức." });
      data.name = b.name.trim().slice(0, 150);
    }
    if (b.description !== undefined) data.description = b.description?.trim().slice(0, 1000) || null;
    if (b.enabled !== undefined) data.enabled = !!b.enabled;
    if (b.storeId !== undefined && isOwner(actorOf(req).role)) {
      const sid = await storeIdFrom(req, b.storeId);
      if (typeof sid === "string") return res.status(400).json({ error: sid });
      data.storeId = sid;
    }
    const updated = await prisma.knowledgeBase.update({ where: { id: kb.id }, data, include: { store: { select: { name: true } } } });
    audit(actorOf(req).id, "KB_UPDATE", `Kho tri thức #${kb.id}`, updated.name);
    res.json((await shapeKb(req, [updated]))[0]);
  });

  r.delete("/knowledge-bases/:id", ...managers, async (req, res) => {
    const kb = await kbFor(req, res, true);
    if (!kb) return;
    const using = await prisma.aiAgent.findMany({ where: { knowledgeBases: { some: { knowledgeBaseId: kb.id } } }, select: { name: true } });
    if (using.length) return res.status(409).json({ error: `Kho đang được agent ${using.map((a) => `"${a.name}"`).join(", ")} dùng — bỏ kho khỏi agent trước khi xoá.` });
    const files = await prisma.knowledgeDocument.findMany({ where: { knowledgeBaseId: kb.id, fileUrl: { not: null } }, select: { fileUrl: true } });
    await prisma.knowledgeBase.delete({ where: { id: kb.id } });
    await Promise.all(files.map((f) => deleteKnowledgeFile(f.fileUrl)));
    invalidateKb(kb.id);
    audit(actorOf(req).id, "KB_DELETE", `Kho tri thức #${kb.id}`, kb.name);
    res.status(204).end();
  });

  /* ═══════════ Tài liệu ═══════════ */

  const docSelect = {
    id: true,
    knowledgeBaseId: true,
    title: true,
    sourceType: true,
    fileName: true,
    charCount: true,
    chunkCount: true,
    status: true,
    errorMessage: true,
    enabled: true,
    createdAt: true,
    updatedAt: true,
    createdBy: { select: { fullName: true } },
  } as const;

  async function shapeDocs(docs: Prisma.KnowledgeDocumentGetPayload<{ select: typeof docSelect }>[]) {
    const embedded = await prisma.knowledgeChunk.groupBy({
      by: ["documentId"],
      where: { documentId: { in: docs.map((d) => d.id) }, embedding: { not: null } },
      _count: { _all: true },
    });
    const emb = new Map(embedded.map((e) => [e.documentId, e._count._all]));
    return docs.map((d) => ({ ...d, fileType: fileTypeOf(d), embeddedCount: emb.get(d.id) ?? 0, createdBy: d.createdBy.fullName }));
  }

  r.get("/knowledge-bases/:id/documents", ...managers, async (req, res) => {
    const kb = await kbFor(req, res, false);
    if (!kb) return;
    const docs = await prisma.knowledgeDocument.findMany({ where: { knowledgeBaseId: kb.id }, select: docSelect, orderBy: { createdAt: "desc" } });
    res.json(await shapeDocs(docs));
  });

  async function createDoc(req: Request, kb: KnowledgeBase, data: Omit<Prisma.KnowledgeDocumentUncheckedCreateInput, "knowledgeBaseId" | "createdById">) {
    const actor = actorOf(req);
    const doc = await prisma.knowledgeDocument.create({ data: { ...data, knowledgeBaseId: kb.id, createdById: actor.id, status: "PENDING" }, select: docSelect });
    audit(actor.id, "KB_DOC_ADD", `Kho tri thức #${kb.id}`, `${doc.title} (${fileTypeOf(doc)})`);
    enqueueDocument(doc.id);
    return (await shapeDocs([doc]))[0];
  }

  r.post("/knowledge-bases/:id/documents/upload", ...managers, withFiles(upload.array("files", 20)), async (req, res) => {
    const kb = await kbFor(req, res, true);
    if (!kb) return;
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) return res.status(400).json({ error: "Chọn tệp để tải lên." });
    const created = [];
    const errors: { fileName: string; error: string }[] = [];
    for (const f of files) {
      const fileName = fileNameOf(f);
      const kind = detectKind(fileName, f.buffer);
      if (!kind) {
        errors.push({ fileName, error: "Chỉ nhận PDF, DOCX, TXT, MD (nội dung phải đúng loại tệp)." });
        continue;
      }
      const fileUrl = await saveKnowledgeFile(f.buffer, kind);
      created.push(
        await createDoc(req, kb, { title: fileName.replace(/\.[^.]+$/, "").slice(0, 200), sourceType: "FILE", fileName, mimeType: KIND_MIME[kind], fileUrl, rawText: "" }),
      );
    }
    res.status(created.length ? 201 : 400).json({ created, errors, ...(created.length ? {} : { error: errors[0]?.error }) });
  });

  r.post("/knowledge-bases/:id/documents/text", ...managers, async (req, res) => {
    const kb = await kbFor(req, res, true);
    if (!kb) return;
    const { title, text } = req.body as { title?: string; text?: string };
    if (!title?.trim()) return res.status(400).json({ error: "Nhập tiêu đề tài liệu." });
    const clean = cleanText(text ?? "");
    if (!clean) return res.status(400).json({ error: "Nhập nội dung tài liệu." });
    if (clean.length > MAX_DOC_CHARS) return res.status(400).json({ error: "Văn bản quá dài (tối đa 2 triệu ký tự) — hãy tải lên dạng tệp." });
    res.status(201).json(await createDoc(req, kb, { title: title.trim().slice(0, 200), sourceType: "TEXT", rawText: clean }));
  });

  r.post("/knowledge-bases/:id/documents/faq", ...managers, async (req, res) => {
    const kb = await kbFor(req, res, true);
    if (!kb) return;
    const { title, items } = req.body as { title?: string; items?: unknown };
    if (!title?.trim()) return res.status(400).json({ error: "Nhập tiêu đề bảng Hỏi–Đáp." });
    const faq = validFaq(items);
    if (typeof faq === "string") return res.status(400).json({ error: faq });
    res.status(201).json(await createDoc(req, kb, { title: title.trim().slice(0, 200), sourceType: "FAQ", rawText: JSON.stringify(faq) }));
  });

  r.post("/knowledge-bases/:id/documents/faq/import", ...managers, withFiles(upload.single("file")), async (req, res) => {
    const kb = await kbFor(req, res, true);
    if (!kb) return;
    const f = req.file;
    if (!f) return res.status(400).json({ error: "Chọn tệp CSV." });
    if (f.buffer.includes(0)) return res.status(400).json({ error: "Tệp không phải CSV dạng chữ." });
    const faq = validFaq(parseFaqCsv(f.buffer.toString("utf8")));
    if (typeof faq === "string") return res.status(400).json({ error: `CSV: ${faq}` });
    const title = String((req.body as { title?: string }).title ?? "").trim() || fileNameOf(f).replace(/\.[^.]+$/, "");
    res.status(201).json(await createDoc(req, kb, { title: title.slice(0, 200), sourceType: "FAQ", rawText: JSON.stringify(faq) }));
  });

  r.patch("/knowledge-documents/:id", ...managers, async (req, res) => {
    const doc = await docFor(req, res, true);
    if (!doc) return;
    const b = req.body as { title?: string; enabled?: boolean; text?: string; items?: unknown };
    const data: Prisma.KnowledgeDocumentUpdateInput = {};
    let reprocess = false;
    if (b.title !== undefined) {
      if (!b.title.trim()) return res.status(400).json({ error: "Nhập tiêu đề tài liệu." });
      data.title = b.title.trim().slice(0, 200);
      reprocess ||= data.title !== doc.title;
    }
    if (b.text !== undefined) {
      if (doc.sourceType !== "TEXT") return res.status(400).json({ error: "Chỉ sửa được nội dung của tài liệu văn bản." });
      const clean = cleanText(b.text);
      if (!clean) return res.status(400).json({ error: "Nhập nội dung tài liệu." });
      if (clean.length > MAX_DOC_CHARS) return res.status(400).json({ error: "Văn bản quá dài (tối đa 2 triệu ký tự)." });
      data.rawText = clean;
      reprocess ||= clean !== doc.rawText;
    }
    if (b.items !== undefined) {
      if (doc.sourceType !== "FAQ") return res.status(400).json({ error: "Tài liệu này không phải bảng Hỏi–Đáp." });
      const faq = validFaq(b.items);
      if (typeof faq === "string") return res.status(400).json({ error: faq });
      data.rawText = JSON.stringify(faq);
      reprocess = true;
    }
    if (b.enabled !== undefined) data.enabled = !!b.enabled;
    if (reprocess) data.status = "PENDING";
    const updated = await prisma.knowledgeDocument.update({ where: { id: doc.id }, data, select: docSelect });
    invalidateKb(doc.knowledgeBaseId);
    if (reprocess) enqueueDocument(doc.id);
    res.json((await shapeDocs([updated]))[0]);
  });

  r.get("/knowledge-documents/:id", ...managers, async (req, res) => {
    const doc = await docFor(req, res, false);
    if (!doc) return;
    const [shaped] = await shapeDocs([await prisma.knowledgeDocument.findUniqueOrThrow({ where: { id: doc.id }, select: docSelect })]);
    // Nội dung để sửa: văn bản (TEXT) hoặc bảng Hỏi–Đáp (FAQ); tệp thì tải tệp gốc
    res.json({ ...shaped, text: doc.sourceType === "TEXT" ? doc.rawText : null, items: doc.sourceType === "FAQ" ? parseFaq(doc.rawText) : null });
  });

  r.post("/knowledge-documents/:id/reindex", ...managers, async (req, res) => {
    const doc = await docFor(req, res, true);
    if (!doc) return;
    const updated = await prisma.knowledgeDocument.update({ where: { id: doc.id }, data: { status: "PENDING", errorMessage: null }, select: docSelect });
    enqueueDocument(doc.id);
    res.json((await shapeDocs([updated]))[0]);
  });

  r.delete("/knowledge-documents/:id", ...managers, async (req, res) => {
    const doc = await docFor(req, res, true);
    if (!doc) return;
    await prisma.knowledgeDocument.delete({ where: { id: doc.id } });
    await deleteKnowledgeFile(doc.fileUrl);
    invalidateKb(doc.knowledgeBaseId);
    audit(actorOf(req).id, "KB_DOC_DELETE", `Kho tri thức #${doc.knowledgeBaseId}`, doc.title);
    res.status(204).end();
  });

  r.get("/knowledge-documents/:id/chunks", ...managers, async (req, res) => {
    const doc = await docFor(req, res, false);
    if (!doc) return;
    const chunks = await prisma.knowledgeChunk.findMany({
      where: { documentId: doc.id },
      select: { id: true, ordinal: true, heading: true, content: true, charCount: true, embedModel: true },
      orderBy: { ordinal: "asc" },
    });
    res.json(chunks.map(({ embedModel, ...c }) => ({ ...c, embedded: !!embedModel })));
  });

  r.get("/knowledge-documents/:id/file", ...managers, async (req, res) => {
    const doc = await docFor(req, res, false);
    if (!doc) return;
    const buf = doc.fileUrl ? await readKnowledgeFile(doc.fileUrl) : null;
    if (!buf) return res.status(404).json({ error: "Không có tệp gốc." });
    res.setHeader("Content-Type", doc.mimeType ?? "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(doc.fileName ?? "tai-lieu")}`);
    res.send(buf);
  });

  return r;
}
