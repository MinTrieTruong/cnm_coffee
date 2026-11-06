/**
 * ai/knowledge/chunk.ts — Cắt văn bản thành đoạn để embedding (hàm thuần, không I/O).
 *
 * Cắt theo cấu trúc trước, theo độ dài sau:
 *   1. Tách mục theo tiêu đề (Markdown `#`, dòng IN HOA ngắn, "Điều 3", "1." / "1.2").
 *   2. Trong mỗi mục, gom các đoạn văn tới ~`target` ký tự; không cắt giữa câu.
 *   3. Đoạn văn dài hơn `max` thì cắt theo câu; câu dài hơn `max` mới cắt theo từ.
 *   4. Đoạn sau lặp lại vài câu cuối của đoạn trước (~`overlap` ký tự) để không mất ngữ cảnh ở chỗ cắt.
 */

export type Chunk = { heading: string | null; content: string };
export type ChunkOptions = { target: number; max: number; overlap: number };

const DEFAULTS: ChunkOptions = { target: 1000, max: 1400, overlap: 150 };

/** Đoạn cuối mục ngắn hơn mức này thì gộp vào đoạn trước (nếu còn chỗ) */
const MIN_TAIL = 200;

const NUMBERED = /^(\d{1,2}(?:\.\d{1,2}){0,3})[.)]?\s+\S/;

/**
 * Nhận diện dòng tiêu đề; trả cấp (1 = lớn nhất) và chữ, hoặc null.
 * `numbered`: cho phép dòng đánh số làm tiêu đề — chỉ khi dòng đứng riêng (không nằm trong danh sách 1. 2. 3.).
 */
export function headingOf(line: string, numbered = true): { level: number; text: string } | null {
  const t = line.trim();
  if (!t || t.length > 100) return null;
  const md = /^(#{1,6})\s+(.+?)\s*#*$/.exec(t);
  if (md) return { level: md[1].length, text: md[2] };
  if (/^(Điều|Chương|Mục|Phần)\s+[\dIVXLC]+\b/iu.test(t) && t.length <= 80) return { level: 1, text: t };
  // "1. Giao hàng" / "2.3 Đổi trả" — đánh số, ngắn, không kết thúc bằng dấu câu như một câu văn
  const num = NUMBERED.exec(t);
  if (num) return numbered && t.length <= 80 && !/[.,;:!?…]$/.test(t) ? { level: num[1].split(".").length, text: t } : null;
  // DÒNG IN HOA ngắn (ít nhất 2 chữ cái)
  const letters = t.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 2 && t.length <= 80 && t === t.toUpperCase() && t !== t.toLowerCase()) return { level: 1, text: t };
  return null;
}

/** Tách câu: sau . ? ! … (kèm ngoặc / nháy đóng) + khoảng trắng + chữ hoa / số / mở ngoặc */
export function splitSentences(p: string): string[] {
  return p
    .split(/(?<=[.?!…]["”')\]]?)\s+(?=[\p{Lu}\d"“(\[-])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Câu dài quá `max` → cắt theo từ */
function splitLong(s: string, max: number): string[] {
  if (s.length <= max) return [s];
  const out: string[] = [];
  let cur = "";
  for (const w of s.split(/\s+/)) {
    if (cur && cur.length + 1 + w.length > max) {
      out.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  return out;
}

/** Các câu cuối của đoạn trước, tổng ≤ overlap ký tự */
function tailOverlap(text: string, overlap: number): string {
  if (overlap <= 0) return "";
  const sents = splitSentences(text.replace(/\n+/g, " "));
  let out = "";
  for (let i = sents.length - 1; i >= 0; i--) {
    const next = out ? `${sents[i]} ${out}` : sents[i];
    if (next.length > overlap) break;
    out = next;
  }
  return out;
}

type Section = { heading: string | null; paragraphs: string[] };

function toSections(text: string): Section[] {
  const sections: Section[] = [];
  const stack: { level: number; text: string }[] = [];
  let cur: Section = { heading: null, paragraphs: [] };
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) cur.paragraphs.push(para.join("\n"));
    para = [];
  };
  const lines = text.split("\n").map((l) => l.trimEnd());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Dòng đánh số là tiêu đề khi đứng riêng: dòng trước trống, dòng sau có chữ và không phải mục đánh số khác
    const prev = lines[i - 1]?.trim() ?? "";
    const next = lines[i + 1]?.trim() ?? "";
    const h = headingOf(line, !prev && !!next && !NUMBERED.test(next));
    if (h) {
      flushPara();
      if (cur.paragraphs.length) sections.push(cur);
      while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
      stack.push(h);
      cur = { heading: stack.map((s) => s.text).join(" › ").slice(0, 300), paragraphs: [] };
    } else if (!line.trim()) flushPara();
    else para.push(line.trim());
  }
  flushPara();
  if (cur.paragraphs.length) sections.push(cur);
  return sections;
}

export function chunkText(text: string, opts: Partial<ChunkOptions> = {}): Chunk[] {
  const { target, max, overlap } = { ...DEFAULTS, ...opts };
  const chunks: Chunk[] = [];

  for (const sec of toSections(text)) {
    // Đơn vị gom: đoạn văn nguyên vẹn, hoặc từng câu nếu đoạn văn quá dài
    const units = sec.paragraphs.flatMap((p) => (p.length <= max ? [p] : splitSentences(p.replace(/\n+/g, " ")).flatMap((s) => splitLong(s, max))));
    const out: string[] = [];
    let cur = "";
    for (const u of units) {
      if (!cur) cur = u;
      else if (cur.length + 2 + u.length <= target) cur = `${cur}\n\n${u}`;
      else {
        out.push(cur);
        const ov = tailOverlap(cur, overlap);
        cur = ov && ov.length + 1 + u.length <= max ? `${ov}\n${u}` : u;
      }
    }
    if (cur) {
      const prev = out[out.length - 1];
      // Đuôi ngắn: gộp vào đoạn trước nếu còn chỗ (bỏ phần lặp lại)
      if (prev !== undefined && cur.length < MIN_TAIL) {
        const tail = cur.replace(tailOverlap(prev, overlap), "").trim();
        if (prev.length + 2 + tail.length <= max) out[out.length - 1] = `${prev}\n\n${tail}`;
        else out.push(cur);
      } else out.push(cur);
    }
    for (const content of out) chunks.push({ heading: sec.heading, content });
  }
  return chunks;
}
