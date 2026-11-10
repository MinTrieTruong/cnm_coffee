/**
 * ai/knowledge/extract.ts — Trích & làm sạch văn bản từ tệp tải lên (PDF, DOCX, TXT, MD).
 */
import { extractTextItems } from "unpdf";
import mammoth from "mammoth";
import { AI_CONFIG, gemini, withRetry } from "../gemini.js";

export type FileKind = "pdf" | "docx" | "txt" | "md";

export const KIND_MIME: Record<FileKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
};

/** Loại tệp theo đuôi + chữ ký đầu tệp (không tin MIME trình duyệt khai báo); null = không hỗ trợ / sai nội dung */
export function detectKind(fileName: string, buf: Buffer): FileKind | null {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "pdf") return buf.subarray(0, 5).toString("latin1") === "%PDF-" ? "pdf" : null;
  if (ext === "docx") {
    // DOCX là tệp zip có word/document.xml (tên tệp trong zip không nén nên tìm được trực tiếp)
    const zip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
    return zip && buf.includes("word/document.xml") ? "docx" : null;
  }
  if (ext === "txt" || ext === "md") return buf.includes(0) ? null : ext;
  return null;
}

/** Làm sạch: chuẩn hoá Unicode NFC (PDF tiếng Việt hay ra dấu tổ hợp), gộp khoảng trắng, bỏ dòng số trang */
export function cleanText(text: string): string {
  return text
    .replace(/^﻿/, "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t  -​　]/g, " ")
    .split("\n")
    .map((l) => l.replace(/ {2,}/g, " ").trim())
    .filter((l) => !isPageNumber(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const isPageNumber = (l: string) => /^(trang|page)?\s*[-–]?\s*\d{1,4}\s*(\/\s*\d{1,4})?\s*[-–]?$/i.test(l);

/** Bỏ header / footer: dòng lặp lại ở 2 dòng đầu hoặc 2 dòng cuối của ≥ 50% số trang */
function stripRepeated(pages: string[]): string[] {
  if (pages.length < 3) return pages;
  const key = (l: string) => l.trim().toLowerCase().replace(/\d+/g, "#");
  const edges = (p: string) => {
    const ls = p.split("\n").map((l) => l.trim()).filter(Boolean);
    return new Set([...ls.slice(0, 2), ...ls.slice(-2)].map(key));
  };
  const count = new Map<string, number>();
  for (const p of pages) for (const k of edges(p)) count.set(k, (count.get(k) ?? 0) + 1);
  const repeated = new Set([...count].filter(([k, n]) => k && n >= pages.length / 2).map(([k]) => k));
  if (!repeated.size) return pages;
  return pages.map((p) => {
    const ls = p.split("\n");
    const n = ls.length;
    return ls.filter((l, i) => !((i < 3 || i >= n - 3) && repeated.has(key(l)))).join("\n");
  });
}

/** PDF dạng ảnh (scan): nhờ Gemini chép lại nguyên văn */
async function ocrPdf(buf: Buffer): Promise<string> {
  const res = await withRetry(() =>
    gemini().models.generateContent({
      model: AI_CONFIG.chatModel,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "application/pdf", data: buf.toString("base64") } },
            { text: "Chép lại nguyên văn toàn bộ chữ trong tài liệu này. Giữ tiêu đề ở dạng Markdown (#, ##). Không thêm bình luận, không tóm tắt." },
          ],
        },
      ],
      config: { abortSignal: AbortSignal.timeout(120_000) },
    }),
  );
  return res.text ?? "";
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

/** HTML gọn của mammoth → văn bản giữ cấu trúc: tiêu đề Word thành `#`, mục danh sách thành `-`, ô bảng cách bằng `|` */
export function docxHtmlToText(html: string): string {
  return html
    .replace(/<h([1-6])[^>]*>/g, (_, n: string) => `\n\n${"#".repeat(Number(n))} `)
    .replace(/<\/h[1-6]>/g, "\n\n")
    .replace(/<li[^>]*>/g, "\n- ")
    .replace(/<\/(p|ul|ol|table)>/g, "\n\n")
    .replace(/<\/tr>/g, "\n")
    .replace(/<\/t[dh]>/g, " | ")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTITIES[e]);
}

/**
 * PDF → văn bản giữ cấu trúc: dòng có cỡ chữ lớn hơn chữ thường ≥ 15% thành tiêu đề (`#` theo thứ bậc cỡ chữ),
 * khoảng cách dọc lớn giữa hai dòng thành ngắt đoạn. Trả về từng trang.
 */
async function pdfPages(buf: Buffer): Promise<{ totalPages: number; pages: string[] }> {
  const { totalPages, items } = await extractTextItems(new Uint8Array(buf));
  type Line = { text: string; size: number; y: number };
  const pageLines: Line[][] = items.map((page) => {
    const lines: Line[] = [];
    let cur: Line | null = null;
    for (const it of page) {
      cur ??= { text: "", size: 0, y: it.y };
      cur.text += it.str;
      if (it.str.trim()) cur.size = Math.max(cur.size, it.fontSize);
      if (it.hasEOL) {
        if (cur.text.trim()) lines.push(cur);
        cur = null;
      }
    }
    if (cur?.text.trim()) lines.push(cur);
    return lines;
  });

  // Cỡ chữ thân bài = cỡ chiếm nhiều ký tự nhất
  const chars = new Map<number, number>();
  for (const l of pageLines.flat()) chars.set(Math.round(l.size), (chars.get(Math.round(l.size)) ?? 0) + l.text.length);
  const body = [...chars].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const headSizes = [...new Set(pageLines.flat().filter((l) => l.size >= body * 1.15 && l.text.length <= 100).map((l) => Math.round(l.size)))].sort((a, b) => b - a);
  const level = (l: Line) => (l.size >= body * 1.15 && l.text.length <= 100 ? Math.min(6, headSizes.indexOf(Math.round(l.size)) + 1) : 0);

  const pages = pageLines.map((lines) => {
    let out = "";
    lines.forEach((l, i) => {
      const h = level(l);
      const prev = lines[i - 1];
      const gap = prev ? Math.abs(prev.y - l.y) : 0;
      const text = l.text.trim();
      if (h) out += `\n\n${"#".repeat(h)} ${text}\n\n`;
      else if (!prev || level(prev) || gap > Math.max(prev.size, l.size) * 1.8) out += `\n\n${text}`;
      // Dòng xuống hàng vì hết khổ giấy → nối lại thành câu; mục danh sách thì giữ xuống dòng
      else out += (/^([-•●▪*]|\d{1,2}[.)])\s/.test(text) ? "\n" : " ") + text;
    });
    return out.normalize("NFC");
  });
  return { totalPages, pages };
}

export async function extractFile(kind: FileKind, buf: Buffer): Promise<string> {
  if (kind === "txt" || kind === "md") return cleanText(buf.toString("utf8"));
  if (kind === "docx") {
    const { value } = await mammoth.convertToHtml({ buffer: buf });
    return cleanText(docxHtmlToText(value));
  }
  const { totalPages, pages: raw } = await pdfPages(buf);
  const pages = stripRepeated(raw);
  const joined = cleanText(pages.join("\n\n"));
  if (joined.replace(/\s/g, "").length / Math.max(1, totalPages) >= 50) return joined;
  if (!AI_CONFIG.pdfOcr) throw new Error("PDF dạng ảnh (scan), chưa hỗ trợ đọc. Bật AI_PDF_OCR=true để nhờ Gemini đọc.");
  const ocr = cleanText(await ocrPdf(buf));
  if (!ocr) throw new Error("Gemini không đọc được chữ trong PDF.");
  return ocr;
}
