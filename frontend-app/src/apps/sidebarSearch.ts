/**
 * Tìm chức năng trên sidebar — hàm thuần, không phụ thuộc React.
 * Chỉ tìm trong `groups` đã dựng theo vai trò (buildSidebar), nên kết quả luôn đúng quyền: không duyệt lại APPS.
 *
 *   const index = buildSearchIndex(groups);
 *   searchLeaves(index, "bang luong") → [{ leaf, groupLabel, ... }]
 */
import { LEAF_KEYWORDS, leavesOfGroup, type SideGroup, type SideLeaf } from "./sidebar";

export type SearchEntry = {
  leaf: SideLeaf;
  groupLabel: string;
  /** Nhãn đã bỏ dấu (xếp hạng, tô đậm) */
  label: string;
  /** Nhãn + nhóm + mô tả + từ khóa phụ, đã bỏ dấu */
  haystack: string;
  /** Thứ tự trong sidebar (giữ khi cùng hạng) */
  order: number;
};
export type SearchIndex = SearchEntry[];

/** Chữ thường, bỏ dấu tiếng Việt, đ → d, gộp khoảng trắng: "Bảng  LƯƠNG" → "bang luong" */
export function normalizeVi(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSearchIndex(groups: SideGroup[]): SearchIndex {
  const out: SearchIndex = [];
  for (const g of groups) {
    for (const leaf of leavesOfGroup(g)) {
      const words = [leaf.label, g.label, leaf.leaf.description ?? "", ...(LEAF_KEYWORDS[leaf.key] ?? [])];
      out.push({ leaf, groupLabel: g.label, label: normalizeVi(leaf.label), haystack: normalizeVi(words.join(" ")), order: out.length });
    }
  }
  return out;
}

/** Hạng: 0 nhãn bắt đầu bằng query · 1 một từ trong nhãn bắt đầu bằng query · 2 nhãn chứa query · 3 chỉ khớp nhóm / mô tả / từ khóa */
function rank(label: string, q: string): number {
  if (label.startsWith(q)) return 0;
  if (label.split(" ").some((w) => w.startsWith(q))) return 1;
  if (label.includes(q)) return 2;
  return 3;
}

/** Mục khớp khi MỌI từ của query có trong haystack; xếp theo hạng rồi thứ tự sidebar. Query rỗng → [] */
export function searchLeaves(index: SearchIndex, query: string, limit = 8): SearchEntry[] {
  const q = normalizeVi(query);
  if (!q) return [];
  const words = q.split(" ");
  return index
    .filter((e) => words.every((w) => e.haystack.includes(w)))
    .map((e) => ({ e, r: rank(e.label, q) }))
    .sort((a, b) => a.r - b.r || a.e.order - b.e.order)
    .slice(0, limit)
    .map((x) => x.e);
}

/**
 * Đoạn cần tô đậm trên nhãn GỐC (có dấu): so khớp trên chuỗi đã bỏ dấu, quy vị trí về chữ gốc.
 * Trả các khoảng [start, end) không chồng nhau, theo thứ tự.
 */
export function matchRanges(label: string, query: string): [number, number][] {
  // Bỏ dấu từng ký tự gốc, nhớ ký tự bỏ dấu thứ i thuộc ký tự gốc nào (ký tự dấu rời → rỗng)
  let norm = "";
  const owner: number[] = [];
  let i = 0;
  for (const ch of label) {
    const n = ch.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
    for (let k = 0; k < n.length; k++) {
      norm += n[k];
      owner.push(i);
    }
    i += ch.length;
  }
  const words = [...new Set(normalizeVi(query).split(" ").filter(Boolean))].sort((a, b) => b.length - a.length);
  const hits: [number, number][] = [];
  for (const w of words) {
    let from = 0;
    for (;;) {
      const at = norm.indexOf(w, from);
      if (at < 0) break;
      const s = owner[at];
      const lastOwner = owner[at + w.length - 1];
      // Kết thúc sau ký tự gốc cuối (kể cả dấu rời đi kèm)
      let e = lastOwner + 1;
      while (e < label.length && /[̀-ͯ]/.test(label[e])) e++;
      if (!hits.some(([a, b]) => s < b && e > a)) hits.push([s, e]);
      from = at + w.length;
    }
  }
  return hits.sort((a, b) => a[0] - b[0]);
}

/* ───────── Mục mở gần đây (localStorage `td.sidebar.recent`) ───────── */
const RECENT_KEY = "td.sidebar.recent";
const RECENT_MAX = 5;

export function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/** Ghi nhận vừa mở `app/leaf` (đưa lên đầu) */
export function pushRecent(key: string) {
  try {
    const next = [key, ...readRecent().filter((k) => k !== key)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* bộ nhớ trình duyệt bị chặn — chỉ mất phần "Gần đây" */
  }
}

/** Mục gần đây còn nằm trong menu của vai trò hiện tại */
export function recentEntries(index: SearchIndex, keys: string[] = readRecent()): SearchEntry[] {
  return keys.map((k) => index.find((e) => e.leaf.key === k)).filter((e): e is SearchEntry => !!e);
}
