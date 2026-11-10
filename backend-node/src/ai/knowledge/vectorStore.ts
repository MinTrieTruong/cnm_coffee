/**
 * ai/knowledge/vectorStore.ts — Tìm đoạn gần nghĩa nhất theo vector.
 *
 * MySQL 8 không có kiểu vector, quy mô quán cà phê chỉ vài nghìn đoạn nên duyệt hết trong bộ nhớ:
 * nạp vector của từng kho vào một Float32Array liền khối (cache theo kho), cosine = tích vô hướng
 * vì vector đã chuẩn hoá L2. 5.000 đoạn × 768 chiều mất khoảng 1–3 ms.
 * Khi vượt ~100 nghìn đoạn: viết bản cài đặt khác của `VectorStore` (Qdrant, pgvector, MySQL 9 VECTOR).
 */
import { prisma } from "../../db.js";
import { AI_CONFIG, bytesToVec } from "../gemini.js";

export type VectorHit = { chunkId: number; score: number };

export interface VectorStore {
  search(kbIds: number[], query: Float32Array, k: number): Promise<VectorHit[]>;
  invalidate(kbId: number): void;
}

type KbVectors = { ids: number[]; dim: number; data: Float32Array };

/** Điều kiện đoạn được tìm: tài liệu đang bật và đã xử lý xong */
export const searchableChunk = (kbId: number) => ({ knowledgeBaseId: kbId, document: { enabled: true, status: "READY" } });

class InMemoryVectorStore implements VectorStore {
  private cache = new Map<number, Promise<KbVectors>>();

  private load(kbId: number): Promise<KbVectors> {
    let p = this.cache.get(kbId);
    if (!p) {
      p = (async () => {
        const dim = AI_CONFIG.embedDim;
        // Chỉ lấy vector cùng model + số chiều đang cấu hình (đổi model thì phải "Xử lý lại")
        const rows = await prisma.knowledgeChunk.findMany({
          where: { ...searchableChunk(kbId), embedModel: AI_CONFIG.embedModel, embedDim: dim, embedding: { not: null } },
          select: { id: true, embedding: true },
        });
        const data = new Float32Array(rows.length * dim);
        rows.forEach((r, i) => data.set(bytesToVec(r.embedding!), i * dim));
        return { ids: rows.map((r) => r.id), dim, data };
      })();
      p.catch(() => this.cache.delete(kbId));
      this.cache.set(kbId, p);
    }
    return p;
  }

  async search(kbIds: number[], query: Float32Array, k: number): Promise<VectorHit[]> {
    const hits: VectorHit[] = [];
    for (const kb of await Promise.all(kbIds.map((id) => this.load(id)))) {
      if (kb.dim !== query.length) continue;
      for (let i = 0; i < kb.ids.length; i++) {
        let dot = 0;
        const off = i * kb.dim;
        for (let j = 0; j < kb.dim; j++) dot += kb.data[off + j] * query[j];
        hits.push({ chunkId: kb.ids[i], score: dot });
      }
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, k);
  }

  invalidate(kbId: number) {
    this.cache.delete(kbId);
  }
}

export const vectorStore: VectorStore = new InMemoryVectorStore();
