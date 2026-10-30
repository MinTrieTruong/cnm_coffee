/**
 * lib/searchInsights.ts — Khách tìm gì trên thực đơn, món nào quán chưa có
 *
 * Mỗi lượt tìm (khách ngừng gõ) → SearchLog. Khi quản lý xem:
 *   1. Gom theo từ khóa đã chuẩn hóa ("Trà Sữa", "tra sua" → "tra sua")
 *   2. Đối chiếu THỰC ĐƠN HIỆN TẠI: AVAILABLE (đang bán) · NOT_SOLD_HERE (chuỗi có, chi nhánh không bán / báo hết)
 *      · MISSING (chuỗi chưa có món nào khớp)
 *   3. Tỷ lệ = số khách khác nhau tìm từ khóa mà không ra món ÷ số khách đã dùng ô tìm kiếm (đếm khách, không đếm lượt)
 *   4. Gợi ý món mới: MISSING, đạt ngưỡng số khách và tỷ lệ, chưa bị "Bỏ qua"
 */
import type { PrismaClient } from "@prisma/client";

/** Chữ thường, bỏ dấu tiếng Việt, chỉ giữ chữ / số, gộp khoảng trắng */
export function normalizeTerm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 100);
}

/** Chữ thường còn dấu, gộp khoảng trắng — so lỗi chính tả mà không nhầm "trà đào" với "trà dâu" */
function lowerAccented(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export type TermStatus = "AVAILABLE" | "NOT_SOLD_HERE" | "MISSING";

export type TermInsight = {
  term: string;
  /** Cách gõ phổ biến nhất (giữ dấu) */
  display: string;
  variants: { text: string; count: number }[];
  searches: number;
  searchers: number;
  /** % khách tìm từ khóa này / tổng khách dùng ô tìm kiếm */
  rate: number;
  zeroSearches: number;
  zeroSearchers: number;
  /** % khách tìm mà không ra món / tổng khách dùng ô tìm kiếm */
  zeroRate: number;
  prevSearchers: number;
  lastAt: Date;
  status: TermStatus;
  /** Món đang có khớp từ khóa (AVAILABLE / NOT_SOLD_HERE) */
  products: { id: number; name: string }[];
  /** Chi nhánh có khách tìm không ra dù chuỗi có món (chi nhánh tắt / báo hết) */
  notSoldStores: { id: number; name: string }[];
  /** MISSING nhưng gần giống tên món đang có — có thể khách gõ sai */
  typoOf: { id: number; name: string } | null;
  dismissed: boolean;
  suggested: boolean;
  /** Chi nhánh có nhiều khách tìm từ khóa này nhất (để gắn đề xuất) */
  topStoreId: number | null;
  proposal: { id: number; status: string } | null;
};

type Agg = {
  term: string;
  variants: Map<string, number>;
  searches: number;
  searchers: Set<string>;
  zeroSearches: number;
  zeroSearchers: Set<string>;
  zeroByStore: Map<number, Set<string>>;
  byStore: Map<number, number>;
  lastAt: Date;
};

const who = (l: { customerId: number | null; sessionKey: string }) => (l.customerId ? `c${l.customerId}` : `s${l.sessionKey}`);

function aggregate(logs: { term: string; query: string; customerId: number | null; sessionKey: string; resultCount: number; storeId: number | null; createdAt: Date }[]) {
  const m = new Map<string, Agg>();
  for (const l of logs) {
    let a = m.get(l.term);
    if (!a) {
      a = { term: l.term, variants: new Map(), searches: 0, searchers: new Set(), zeroSearches: 0, zeroSearchers: new Set(), zeroByStore: new Map(), byStore: new Map(), lastAt: l.createdAt };
      m.set(l.term, a);
    }
    const k = who(l);
    const v = lowerAccented(l.query);
    a.variants.set(v, (a.variants.get(v) ?? 0) + 1);
    a.searches++;
    a.searchers.add(k);
    if (l.storeId) a.byStore.set(l.storeId, (a.byStore.get(l.storeId) ?? 0) + 1);
    if (l.resultCount === 0) {
      a.zeroSearches++;
      a.zeroSearchers.add(k);
      if (l.storeId) {
        const set = a.zeroByStore.get(l.storeId) ?? new Set<string>();
        set.add(k);
        a.zeroByStore.set(l.storeId, set);
      }
    }
    if (l.createdAt > a.lastAt) a.lastAt = l.createdAt;
  }
  return m;
}

const topVariant = (a: Agg) => [...a.variants.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? a.term;

/** Gộp cụm b vào a (lỗi chính tả của cùng 1 món) */
function mergeInto(a: Agg, b: Agg) {
  for (const [v, c] of b.variants) a.variants.set(v, (a.variants.get(v) ?? 0) + c);
  a.searches += b.searches;
  a.zeroSearches += b.zeroSearches;
  for (const k of b.searchers) a.searchers.add(k);
  for (const k of b.zeroSearchers) a.zeroSearchers.add(k);
  for (const [s, set] of b.zeroByStore) {
    const t = a.zeroByStore.get(s) ?? new Set<string>();
    for (const k of set) t.add(k);
    a.zeroByStore.set(s, t);
  }
  for (const [s, c] of b.byStore) a.byStore.set(s, (a.byStore.get(s) ?? 0) + c);
  if (b.lastAt > a.lastAt) a.lastAt = b.lastAt;
}

/** Từ khóa gần giống 1 cụm từ liên tiếp trong tên món (≤1 ký tự, từ khóa ≥ 4 ký tự) */
function nearName(term: string, normName: string) {
  if (term.length < 4) return false;
  const words = normName.split(" ");
  const k = term.split(" ").length;
  for (let i = 0; i + k <= words.length; i++) {
    if (levenshtein(term, words.slice(i, i + k).join(" ")) <= 1) return true;
  }
  return false;
}

/**
 * Phân tích tìm kiếm trong `days` ngày gần nhất.
 * storeId: chi nhánh (quản lý chi nhánh / Chủ chuỗi chọn 1 chi nhánh) · null = toàn chuỗi.
 */
export async function computeSearchInsights(prisma: PrismaClient, opts: { storeId: number | null; days: number }) {
  const settings = await prisma.storeSettings.findUnique({ where: { id: 1 } });
  const minCustomers = settings?.searchMinCustomers ?? 3;
  const minPercent = settings?.searchMinPercent ?? 2;
  const now = Date.now();
  const from = new Date(now - opts.days * 86400_000);
  const prevFrom = new Date(now - 2 * opts.days * 86400_000);
  const scope = opts.storeId != null ? { storeId: opts.storeId } : {};

  const select = { term: true, query: true, customerId: true, sessionKey: true, resultCount: true, storeId: true, createdAt: true } as const;
  const [logs, prevLogs, products, overrides, stores, dismissals, proposals] = await Promise.all([
    prisma.searchLog.findMany({ where: { ...scope, createdAt: { gte: from } }, select }),
    prisma.searchLog.findMany({ where: { ...scope, createdAt: { gte: prevFrom, lt: from } }, select: { term: true, customerId: true, sessionKey: true } }),
    prisma.product.findMany({ select: { id: true, name: true, isActive: true, outOfStock: true } }),
    prisma.storeProduct.findMany({ where: { OR: [{ isAvailable: false }, { outOfStock: true }] }, select: { storeId: true, productId: true } }),
    prisma.store.findMany({ select: { id: true, name: true } }),
    prisma.searchTermDismissal.findMany({ where: { OR: [{ storeId: null }, ...(opts.storeId != null ? [{ storeId: opts.storeId }] : [])] }, select: { term: true } }),
    prisma.menuProposal.findMany({ where: { source: "SEARCH", searchTerm: { not: null } }, select: { id: true, status: true, searchTerm: true }, orderBy: { id: "desc" } }),
  ]);

  const totalSearchers = new Set(logs.map(who)).size;
  const zeroAll = logs.filter((l) => l.resultCount === 0);
  const pct = (n: number) => (totalSearchers ? Math.round((n / totalSearchers) * 1000) / 10 : 0);

  // Món & tình trạng bán theo chi nhánh
  const catalog = products.filter((p) => p.isActive).map((p) => ({ ...p, norm: normalizeTerm(p.name) }));
  const hidden = new Map<number, Set<number>>();
  for (const o of overrides) {
    const set = hidden.get(o.storeId) ?? new Set<number>();
    set.add(o.productId);
    hidden.set(o.storeId, set);
  }
  const sellableAt = (p: { id: number; outOfStock: boolean }, storeId: number) => !p.outOfStock && !hidden.get(storeId)?.has(p.id);
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const dismissed = new Set(dismissals.map((d) => d.term));
  const proposalOf = new Map<string, { id: number; status: string }>();
  for (const pr of proposals) if (!proposalOf.has(pr.searchTerm!)) proposalOf.set(pr.searchTerm!, { id: pr.id, status: pr.status });

  const aggs = aggregate(logs);
  const matches = (term: string) => catalog.filter((p) => p.norm.includes(term));

  // Gộp lỗi chính tả giữa các cụm CHƯA CÓ MÓN (so trên dạng còn dấu, ≤1 ký tự, ≥5 ký tự)
  const missing = [...aggs.values()].filter((a) => matches(a.term).length === 0).sort((x, y) => y.searchers.size - x.searchers.size);
  for (let i = 0; i < missing.length; i++) {
    const a = missing[i];
    if (!aggs.has(a.term)) continue;
    const ra = topVariant(a);
    for (let j = i + 1; j < missing.length; j++) {
      const b = missing[j];
      if (!aggs.has(b.term)) continue;
      const rb = topVariant(b);
      if (Math.min(ra.length, rb.length) >= 5 && levenshtein(ra, rb) <= 1) {
        mergeInto(a, b);
        aggs.delete(b.term);
      }
    }
  }

  const prevByTerm = aggregate(prevLogs.map((l) => ({ ...l, query: l.term, resultCount: 1, storeId: null, createdAt: from })));
  const terms: TermInsight[] = [...aggs.values()].map((a) => {
    const found = matches(a.term);
    let status: TermStatus;
    const notSoldStores: { id: number; name: string }[] = [];
    if (!found.length) status = "MISSING";
    else if (opts.storeId != null) status = found.some((p) => sellableAt(p, opts.storeId!)) ? "AVAILABLE" : "NOT_SOLD_HERE";
    else {
      // Toàn chuỗi: chi nhánh có khách tìm không ra mà món không bán ở chi nhánh đó
      for (const sid of a.zeroByStore.keys()) {
        if (!found.some((p) => sellableAt(p, sid))) notSoldStores.push({ id: sid, name: storeName.get(sid) ?? `#${sid}` });
      }
      status = notSoldStores.length ? "NOT_SOLD_HERE" : "AVAILABLE";
    }
    if (status === "NOT_SOLD_HERE" && opts.storeId != null) notSoldStores.push({ id: opts.storeId, name: storeName.get(opts.storeId) ?? "" });
    const typo = status === "MISSING" ? catalog.find((p) => nearName(a.term, p.norm)) : undefined;
    const zeroRate = pct(a.zeroSearchers.size);
    const isDismissed = dismissed.has(a.term);
    const variants = [...a.variants.entries()].sort((x, y) => y[1] - x[1]).map(([text, count]) => ({ text, count }));
    return {
      term: a.term,
      display: variants[0]?.text ?? a.term,
      variants: variants.slice(0, 5),
      searches: a.searches,
      searchers: a.searchers.size,
      rate: pct(a.searchers.size),
      zeroSearches: a.zeroSearches,
      zeroSearchers: a.zeroSearchers.size,
      zeroRate,
      prevSearchers: prevByTerm.get(a.term)?.searchers.size ?? 0,
      lastAt: a.lastAt,
      status,
      products: found.slice(0, 3).map((p) => ({ id: p.id, name: p.name })),
      notSoldStores,
      typoOf: typo ? { id: typo.id, name: typo.name } : null,
      dismissed: isDismissed,
      suggested: status === "MISSING" && !isDismissed && a.zeroSearchers.size >= minCustomers && zeroRate >= minPercent,
      topStoreId: [...a.byStore.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null,
      proposal: proposalOf.get(a.term) ?? null,
    };
  });
  terms.sort((x, y) => y.searchers - x.searchers || y.searches - x.searches);

  return {
    days: opts.days,
    storeId: opts.storeId,
    thresholds: { minCustomers, minPercent },
    summary: {
      searches: logs.length,
      searchers: totalSearchers,
      zeroSearches: zeroAll.length,
      zeroSearchers: new Set(zeroAll.map(who)).size,
      zeroRate: pct(new Set(zeroAll.map(who)).size),
      prevSearchers: new Set(prevLogs.map(who)).size,
    },
    terms,
  };
}

/** Xoá log tìm kiếm quá 90 ngày — chạy mỗi ngày */
export function startSearchLogCleanup(prisma: PrismaClient) {
  const run = () => void prisma.searchLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86400_000) } } }).catch((e) => console.error("[search-log]", e));
  setTimeout(run, 120_000);
  setInterval(run, 86400_000);
}
