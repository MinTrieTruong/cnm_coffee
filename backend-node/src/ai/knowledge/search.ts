/**
 * ai/knowledge/search.ts — Tìm kiếm lai trên kho tri thức.
 *
 *   câu hỏi ─┬─ embedding (RETRIEVAL_QUERY) → vector top 20 ─┐
 *            └─ BM25 trên chữ bỏ dấu → từ khóa top 20 ───────┴─ Reciprocal Rank Fusion (k = 60) → top k
 *
 * RRF: điểm(đoạn) = Σ 1 / (60 + hạng của đoạn trong từng danh sách). Không cần chuẩn hoá thang điểm
 * giữa cosine và BM25 — chỉ dùng thứ hạng.
 * Chưa có GEMINI_API_KEY / Gemini lỗi → chỉ tìm theo từ khóa (mode "keyword").
 */
import { prisma } from "../../db.js";
import { aiErrorMessage, embedTexts, hasGeminiKey } from "../gemini.js";
import { keywordIndex } from "./keyword.js";
import { vectorStore } from "./vectorStore.js";

const RRF_K = 60;
const CANDIDATES = 20;

export type SearchResult = {
  chunkId: number;
  documentId: number;
  knowledgeBaseId: number;
  title: string;
  heading: string | null;
  content: string;
  /** cosine (0–1); null nếu đoạn không lọt top vector */
  vectorScore: number | null;
  /** điểm BM25; null nếu đoạn không lọt top từ khóa */
  keywordScore: number | null;
  rrfScore: number;
};

export type SearchOutput = {
  results: SearchResult[];
  /** cosine cao nhất — phiên sau dùng làm ngưỡng "có tài liệu liên quan không" */
  bestVectorScore: number | null;
  mode: "hybrid" | "keyword";
  /** lý do không tìm được bằng vector (thiếu khóa, Gemini lỗi) */
  vectorError?: string;
  ms: number;
};

export async function searchKnowledge({ kbIds, query, k = 5 }: { kbIds: number[]; query: string; k?: number }): Promise<SearchOutput> {
  const t0 = performance.now();
  const q = query.trim();
  if (!kbIds.length || !q) return { results: [], bestVectorScore: null, mode: "keyword", ms: 0 };

  let vectorError: string | undefined = hasGeminiKey() ? undefined : "Chưa cấu hình GEMINI_API_KEY — chỉ tìm theo từ khóa.";
  const vectorP = vectorError
    ? Promise.resolve([])
    : embedTexts([q], "RETRIEVAL_QUERY")
        .then(([v]) => vectorStore.search(kbIds, v, CANDIDATES))
        .catch((e) => {
          vectorError = aiErrorMessage(e);
          return [];
        });
  const [vec, kw] = await Promise.all([vectorP, keywordIndex.search(kbIds, q, CANDIDATES)]);

  const fused = new Map<number, { rrf: number; v: number | null; kw: number | null }>();
  const add = (id: number, rank: number) => {
    const row = fused.get(id) ?? { rrf: 0, v: null, kw: null };
    row.rrf += 1 / (RRF_K + rank + 1);
    fused.set(id, row);
    return row;
  };
  vec.forEach((h, i) => (add(h.chunkId, i).v = h.score));
  kw.forEach((h, i) => (add(h.chunkId, i).kw = h.score));

  const top = [...fused].sort((a, b) => b[1].rrf - a[1].rrf).slice(0, k);
  const rows = await prisma.knowledgeChunk.findMany({
    where: { id: { in: top.map(([id]) => id) } },
    select: { id: true, documentId: true, knowledgeBaseId: true, heading: true, content: true, document: { select: { title: true } } },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const results: SearchResult[] = top.flatMap(([id, s]) => {
    const r = byId.get(id);
    return r
      ? [{ chunkId: id, documentId: r.documentId, knowledgeBaseId: r.knowledgeBaseId, title: r.document.title, heading: r.heading, content: r.content, vectorScore: s.v, keywordScore: s.kw, rrfScore: s.rrf }]
      : [];
  });

  return {
    results,
    bestVectorScore: vec[0]?.score ?? null,
    mode: vectorError ? "keyword" : "hybrid",
    vectorError,
    ms: Math.round(performance.now() - t0),
  };
}

/** Xoá cache tìm kiếm của kho (gọi khi tài liệu thêm / sửa / xoá / bật / tắt) */
export function invalidateKb(kbId: number) {
  vectorStore.invalidate(kbId);
  keywordIndex.invalidate(kbId);
}
