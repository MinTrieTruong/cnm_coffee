/** Kho tri thức cho AI tư vấn — kiểu dữ liệu & tiện ích (API: backend-node/src/routes/knowledge.ts) */

export type KbRow = {
  id: number;
  name: string;
  description: string | null;
  storeId: number | null;
  storeName: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  docCount: number;
  readyCount: number;
  errorCount: number;
  processingCount: number;
  charCount: number;
  chunkCount: number;
  /** PDF · DOCX · TXT · MD · TEXT · FAQ */
  sourceTypes: string[];
  agentCount: number;
  canEdit: boolean;
  geminiReady?: boolean;
};

export type DocStatus = "PENDING" | "PROCESSING" | "READY" | "ERROR";

export type KbDoc = {
  id: number;
  knowledgeBaseId: number;
  title: string;
  sourceType: "FILE" | "TEXT" | "FAQ";
  fileType: string;
  fileName: string | null;
  charCount: number;
  chunkCount: number;
  embeddedCount: number;
  status: DocStatus;
  errorMessage: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type FaqItem = { q: string; a: string };

export type KbChunk = { id: number; ordinal: number; heading: string | null; content: string; charCount: number; embedded: boolean };

export type SearchResult = {
  chunkId: number;
  documentId: number;
  knowledgeBaseId: number;
  title: string;
  heading: string | null;
  content: string;
  vectorScore: number | null;
  keywordScore: number | null;
  rrfScore: number;
};

export type SearchOut = { results: SearchResult[]; bestVectorScore: number | null; mode: "hybrid" | "keyword"; vectorError?: string; ms: number };

/** Chấm trạng thái kho: xanh = có tài liệu sẵn sàng, đỏ = có tài liệu lỗi, tím rỗng = chưa có tài liệu */
export function kbHealth(kb: KbRow): "ready" | "error" | "empty" {
  if (kb.errorCount > 0) return "error";
  return kb.readyCount > 0 ? "ready" : "empty";
}

export const KB_HEALTH_LABEL = { ready: "Có tài liệu sẵn sàng", error: "Có tài liệu lỗi", empty: "Chưa có tài liệu" } as const;

export const DOC_STATUS: Record<DocStatus, { label: string; tone: "neutral" | "info" | "success" | "danger" }> = {
  PENDING: { label: "Chờ xử lý", tone: "neutral" },
  PROCESSING: { label: "Đang xử lý", tone: "info" },
  READY: { label: "Sẵn sàng", tone: "success" },
  ERROR: { label: "Lỗi", tone: "danger" },
};

export const SOURCE_LABEL: Record<string, string> = { PDF: "PDF", DOCX: "Word", TXT: "TXT", MD: "Markdown", TEXT: "Văn bản", FAQ: "Hỏi–Đáp" };

export const fmtCount = (n: number) => n.toLocaleString("vi-VN");

/** CSV mẫu cho bảng Hỏi–Đáp (UTF-8 có BOM để Excel đọc đúng dấu) */
export function faqCsvTemplate(): Blob {
  const rows = [
    ["Câu hỏi", "Trả lời"],
    ["Quán có wifi không?", "Có, mọi chi nhánh đều có wifi miễn phí."],
    ["Có chỗ đậu xe máy không?", "Có, giữ xe máy miễn phí cho khách."],
  ];
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\r\n");
  return new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
