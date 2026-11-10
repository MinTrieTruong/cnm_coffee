/**
 * ai/knowledge/keyword.ts — Tìm theo từ khóa bằng BM25 (k1 = 1.2, b = 0.75) trên chữ đã bỏ dấu.
 *
 * Bổ sung cho vector: bắt đúng tên riêng ("Bạc Xỉu", "Cold Brew Cam") và câu gõ không dấu.
 * Mỗi đoạn được đánh chỉ mục kèm tên tài liệu + tiêu đề mục. Chỉ mục cache theo kho.
 */
import { prisma } from "../../db.js";
import { tokenize } from "./text.js";
import { searchableChunk } from "./vectorStore.js";

const K1 = 1.2;
const B = 0.75;

export type KeywordHit = { chunkId: number; score: number };

type KbIndex = {
  ids: number[];
  /** tần suất từ trong từng đoạn */
  tf: Map<string, number>[];
  len: number[];
  df: Map<string, number>;
};

/** BM25 trên nhiều kho: thống kê (số đoạn, độ dài trung bình, df) gộp lại như một kho */
function bm25(indexes: KbIndex[], query: string, k: number): KeywordHit[] {
  const q = [...new Set(tokenize(query))];
  if (!q.length) return [];
  const n = indexes.reduce((s, x) => s + x.ids.length, 0);
  if (!n) return [];
  const avg = indexes.reduce((s, x) => s + x.len.reduce((a, b) => a + b, 0), 0) / n;
  const idf = new Map(
    q.map((t) => {
      const df = indexes.reduce((s, x) => s + (x.df.get(t) ?? 0), 0);
      return [t, Math.log(1 + (n - df + 0.5) / (df + 0.5))];
    }),
  );
  const hits: KeywordHit[] = [];
  for (const x of indexes) {
    for (let i = 0; i < x.ids.length; i++) {
      let score = 0;
      for (const t of q) {
        const f = x.tf[i].get(t);
        if (!f) continue;
        score += idf.get(t)! * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * x.len[i]) / avg)));
      }
      if (score > 0) hits.push({ chunkId: x.ids[i], score });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, k);
}

const cache = new Map<number, Promise<KbIndex>>();

function load(kbId: number): Promise<KbIndex> {
  let p = cache.get(kbId);
  if (!p) {
    p = (async () => {
      const rows = await prisma.knowledgeChunk.findMany({
        where: searchableChunk(kbId),
        select: { id: true, heading: true, content: true, document: { select: { title: true } } },
      });
      const idx: KbIndex = { ids: [], tf: [], len: [], df: new Map() };
      for (const r of rows) {
        const toks = tokenize(`${r.document.title} ${r.heading ?? ""} ${r.content}`);
        const tf = new Map<string, number>();
        for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
        for (const t of tf.keys()) idx.df.set(t, (idx.df.get(t) ?? 0) + 1);
        idx.ids.push(r.id);
        idx.tf.push(tf);
        idx.len.push(toks.length);
      }
      return idx;
    })();
    p.catch(() => cache.delete(kbId));
    cache.set(kbId, p);
  }
  return p;
}

export const keywordIndex = {
  async search(kbIds: number[], query: string, k: number): Promise<KeywordHit[]> {
    return bm25(await Promise.all(kbIds.map(load)), query, k);
  },
  invalidate(kbId: number) {
    cache.delete(kbId);
  },
};
