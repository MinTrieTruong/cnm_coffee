/**
 * Thói quen gọi món của khách — dùng chung cho hồ sơ khách (Admin), thực đơn ("Món quen"), POS và trang tài khoản.
 *
 * Nguồn: dòng đơn đã thanh toán. Tuỳ chọn đồ uống đọc từ cột size / temperature và chuỗi customNotes
 * ("Size M · Đá 50% · Đường 50% · không ống hút" — web; "Size M, Đá, ít ngọt" — POS). Không đổi định dạng chuỗi này.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { storeMenuState } from "./storeProducts.js";

const DAY = 86_400_000;

/** Đường / đá từ ghi chú đồ uống ("Size M · Đá 100% · Đường 50%") */
export function optionsOf(notes: string | null) {
  const sugar = /Đường (\d+)%/.exec(notes ?? "")?.[1];
  const ice = /Đá (\d+)%/.exec(notes ?? "")?.[1];
  return { sugar: sugar ? `${sugar}%` : null, ice: ice ? `${ice}%` : null };
}

/** Giá trị xuất hiện nhiều nhất (bỏ null) */
export function mode(values: (string | null | undefined)[]) {
  const c = new Map<string, number>();
  for (const v of values) if (v) c.set(v, (c.get(v) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [k, v] of c) if (v > n) [best, n] = [k, v];
  return best;
}

export type Size = "S" | "M" | "L";
export type Temp = "HOT" | "ICED";
export type SplitNotes = { size?: Size; temp?: Temp; icePct?: number; sugar?: string; free: string };

/** Một mẩu tuỳ chọn chuẩn → gán vào kết quả; trả false nếu không phải tuỳ chọn (là ghi chú tự do) */
function takeOption(tok: string, out: SplitNotes): boolean {
  let m: RegExpExecArray | null;
  if ((m = /^Size\s+(S|M|L)$/i.exec(tok))) return (out.size = m[1].toUpperCase() as Size), true;
  if (/^Nóng$/i.test(tok)) return (out.temp = "HOT"), true;
  if ((m = /^Đá\s+(\d{1,3})\s*%$/i.exec(tok))) return (out.temp = "ICED"), (out.icePct = Number(m[1])), true;
  // POS ghi "Đá" không kèm %
  if (/^Đá$/i.test(tok)) return (out.temp = "ICED"), true;
  if ((m = /^Đường\s+(\d{1,3})\s*%$/i.exec(tok))) return (out.sugar = m[1]), true;
  return false;
}

/**
 * Tách customNotes thành tuỳ chọn chuẩn + phần ghi chú tự do.
 * Web nối bằng " · ", POS nối bằng ", " — ghi chú tự do có thể chứa dấu phẩy nên chỉ bóc các mẩu đúng mẫu tuỳ chọn.
 * Lượng đá chỉ có khi uống đá; món ăn không có Size / Đường.
 */
export function splitNotes(customNotes: string | null | undefined): SplitNotes {
  const out: SplitNotes = { free: "" };
  const free: string[] = [];
  for (const seg of (customNotes ?? "").split(/\s*·\s*/)) {
    const s = seg.trim();
    if (!s) continue;
    if (takeOption(s, out)) continue;
    // Đoạn có dấu phẩy (kiểu POS): bóc tuỳ chọn, giữ nguyên phần còn lại
    const rest = s.split(/\s*,\s*/).filter((t) => t && !takeOption(t, out));
    if (rest.length) free.push(rest.join(", "));
  }
  out.free = free.join(" · ");
  return out;
}

/** Chuẩn hoá ghi chú tự do để đếm trùng ("Không ống hút " ~ "không ống hút") */
const noteKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!]+$/, "");

export type Usual = { size: Size | null; temperature: Temp | null; icePct: number | null; sugar: string | null };

export type HabitLine = {
  productId: number;
  quantity: number;
  size: string | null;
  temperature: string | null;
  customNotes: string | null;
  /** Lúc ghé (thanh toán / tạo đơn) */
  at: Date;
  /** Món ăn (hasSizes = false): không size / nóng-đá / đá / đường */
  food: boolean;
  /** Kiểu nóng/đá cho phép của món — bản quen không hợp cấu hình hiện tại thì bỏ */
  temps?: string;
};

export type UsualCore = {
  productId: number;
  timesOrdered: number;
  lastOrderedAt: Date;
  usual: Usual;
  usualNote: string | null;
  /** Tỷ lệ (0–1, có trọng số) số lần chọn đúng bộ tuỳ chọn quen */
  confidence: number;
  /** Điểm xếp hạng (số ly × trọng số gần đây) */
  score: number;
};

/** Trọng số theo tuổi đơn: giảm một nửa sau mỗi 4 tuần (đơn tuần này nặng gấp đôi đơn cách đây 1 tháng) */
export const recencyWeight = (at: Date, now: Date) => Math.pow(0.5, Math.max(0, now.getTime() - at.getTime()) / (28 * DAY));

/** Tuỳ chọn của 1 dòng sau khi điền mặc định (đá thiếu % = 100, đường thiếu = 100) */
function lineUsual(l: HabitLine): Usual {
  if (l.food) return { size: null, temperature: null, icePct: null, sugar: null };
  const n = splitNotes(l.customNotes);
  const size = (["S", "M", "L"].includes(l.size ?? "") ? l.size : n.size ?? "M") as Size;
  const temperature = (l.temperature === "HOT" || l.temperature === "ICED" ? l.temperature : n.temp ?? null) as Temp | null;
  return {
    size,
    temperature,
    icePct: temperature === "ICED" ? n.icePct ?? 100 : null,
    sugar: n.sugar ?? "100",
  };
}

/** Bản quen không còn hợp cấu hình món (VD món đổi sang chỉ phục vụ nóng) → bỏ nóng/đá */
function fitTemps(u: Usual, temps?: string): Usual {
  if (!u.temperature || !temps) return u;
  const ok = temps === "BOTH" || temps === u.temperature;
  return ok ? u : { ...u, temperature: temps === "HOT" || temps === "ICED" ? temps : null, icePct: temps === "ICED" ? 100 : null };
}

/**
 * Tính món quen từ các dòng đơn (hàm thuần, không đọc CSDL — dễ kiểm thử).
 * Xếp theo tổng số ly × trọng số gần đây; bộ tuỳ chọn quen = bộ (size, nóng/đá, đá, đường) có trọng số lớn nhất;
 * ghi chú quen = ghi chú tự do lặp lại ≥ 2 lần (lấy cách viết gần nhất).
 */
export function computeUsual(lines: HabitLine[], now = new Date(), limit = 3): UsualCore[] {
  type Acc = { productId: number; times: number; last: Date; score: number; combos: Map<string, { u: Usual; w: number }>; notes: Map<string, { n: number; text: string; at: number }>; temps?: string };
  const by = new Map<number, Acc>();
  for (const l of lines) {
    const w = recencyWeight(l.at, now);
    const a = by.get(l.productId) ?? { productId: l.productId, times: 0, last: l.at, score: 0, combos: new Map(), notes: new Map(), temps: l.temps };
    a.times += l.quantity;
    a.score += l.quantity * w;
    if (l.at > a.last) a.last = l.at;
    const u = lineUsual(l);
    const key = `${u.size}|${u.temperature}|${u.icePct}|${u.sugar}`;
    const c = a.combos.get(key) ?? { u, w: 0 };
    c.w += l.quantity * w;
    a.combos.set(key, c);
    const free = splitNotes(l.customNotes).free;
    if (free) {
      const k = noteKey(free);
      const n = a.notes.get(k) ?? { n: 0, text: free, at: 0 };
      n.n++;
      if (l.at.getTime() >= n.at) [n.text, n.at] = [free.trim(), l.at.getTime()];
      a.notes.set(k, n);
    }
    by.set(l.productId, a);
  }
  return [...by.values()]
    .sort((a, b) => b.score - a.score || b.last.getTime() - a.last.getTime())
    .slice(0, limit)
    .map((a) => {
      const combos = [...a.combos.values()].sort((x, y) => y.w - x.w);
      const total = combos.reduce((s, c) => s + c.w, 0);
      const note = [...a.notes.values()].filter((n) => n.n >= 2).sort((x, y) => y.n - x.n || y.at - x.at)[0];
      return {
        productId: a.productId,
        timesOrdered: a.times,
        lastOrderedAt: a.last,
        usual: fitTemps(combos[0].u, a.temps),
        usualNote: note?.text ?? null,
        confidence: total ? Math.round((combos[0].w / total) * 100) / 100 : 0,
        score: Math.round(a.score * 100) / 100,
      };
    });
}

/** Trường món trả kèm món quen (đủ để hiện thẻ + thêm vào giỏ) */
export const USUAL_PRODUCT_SELECT = {
  id: true, categoryId: true, name: true, sellPrice: true, priceSizeS: true, priceSizeL: true, hasSizes: true, temps: true,
  isActive: true, outOfStock: true, discountPercent: true, imageUrl: true,
} as const satisfies Prisma.ProductSelect;
export type UsualProduct = Prisma.ProductGetPayload<{ select: typeof USUAL_PRODUCT_SELECT }>;

export type UsualItem = Omit<UsualCore, "score"> & { soldOut: boolean; product: UsualProduct };

/**
 * Món quen của khách (tối đa `limit`): đơn Paid trong `days` ngày (mặc định 90), bỏ món tặng và dòng combo.
 * Món ngừng bán / chi nhánh tắt → bỏ; món hết hàng vẫn trả với `soldOut`.
 * `orderWhere` thêm điều kiện đơn (POS: chỉ đơn tại chi nhánh).
 */
export async function getUsualItems(
  prisma: PrismaClient,
  customerId: number,
  opts: { storeId?: number | null; limit?: number; days?: number; now?: Date; orderWhere?: Prisma.OrderWhereInput } = {},
): Promise<UsualItem[]> {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - (opts.days ?? 90) * DAY);
  const [details, state] = await Promise.all([
    prisma.orderDetail.findMany({
      where: { isGift: false, comboId: null, order: { customerId, status: "Paid", createdAt: { gte: since }, ...opts.orderWhere } },
      select: {
        productId: true, quantity: true, size: true, temperature: true, customNotes: true,
        order: { select: { paidAt: true, createdAt: true } },
        product: { select: USUAL_PRODUCT_SELECT },
      },
    }),
    storeMenuState(prisma, opts.storeId ?? null),
  ]);
  const products = new Map<number, UsualProduct>();
  const lines: HabitLine[] = [];
  for (const d of details) {
    if (!d.product.isActive || state.disabled.has(d.productId)) continue;
    products.set(d.productId, d.product);
    lines.push({
      productId: d.productId, quantity: d.quantity, size: d.size, temperature: d.temperature, customNotes: d.customNotes,
      at: d.order.paidAt ?? d.order.createdAt, food: d.product.hasSizes === false, temps: d.product.temps,
    });
  }
  return computeUsual(lines, now, opts.limit ?? 3).map(({ score: _score, ...u }) => {
    const product = products.get(u.productId)!;
    return { ...u, soldOut: product.outOfStock || state.soldOut.has(u.productId), product };
  });
}

/** "M · Đá 50% · Đường 50%" — dòng phụ trên thẻ món quen / POS (rỗng với món ăn) */
export function usualLabel(u: Usual) {
  return [u.size, u.temperature === "HOT" ? "Nóng" : u.temperature === "ICED" ? `Đá ${u.icePct ?? 100}%` : null, u.sugar != null ? `Đường ${u.sugar}%` : null].filter(Boolean).join(" · ");
}

/**
 * Ghi chú tự do khách gõ ở ≥ 3 trong 5 đơn đã thanh toán gần nhất mà chưa lưu làm ghi chú mặc định
 * → gợi ý "Lưu làm ghi chú mặc định?". null nếu không có.
 */
export async function noteSuggestion(prisma: PrismaClient, customerId: number, savedNote: string | null): Promise<string | null> {
  const orders = await prisma.order.findMany({
    where: { customerId, status: "Paid" },
    orderBy: [{ paidAt: "desc" }, { id: "desc" }],
    take: 5,
    select: { createdAt: true, details: { where: { isGift: false }, select: { customNotes: true } } },
  });
  const saved = savedNote ? noteKey(savedNote) : null;
  const count = new Map<string, { n: number; text: string }>();
  for (const o of orders) {
    const keys = new Map<string, string>();
    for (const d of o.details) {
      const free = splitNotes(d.customNotes).free;
      // Ghi chú đơn được nối vào từng dòng nên một mẩu có thể chứa nhiều ý ("không ống hút · thêm kem")
      for (const part of free.split(/\s*·\s*/)) if (part) keys.set(noteKey(part), part.trim());
    }
    for (const [k, text] of keys) count.set(k, { n: (count.get(k)?.n ?? 0) + 1, text: count.get(k)?.text ?? text });
  }
  const best = [...count.entries()].filter(([k, v]) => v.n >= 3 && k !== saved && k.length <= 120 && !(saved ?? "").includes(k)).sort((a, b) => b[1].n - a[1].n)[0];
  return best ? best[1].text : null;
}

export type ReorderLine = {
  productId: number;
  quantity: number;
  usual: Usual;
  /** Ghi chú tự do của dòng (đã tách phần Size / Đá / Đường) */
  note: string;
  soldOut: boolean;
  /** false = món ngừng bán / chi nhánh không bán → không đặt lại được */
  available: boolean;
  product: UsualProduct;
};

/** Các dòng của 1 đơn để "Đặt lại": bỏ món tặng; dòng combo không đặt lại từng món (báo qua `comboSkipped`) */
export async function reorderLines(prisma: PrismaClient, orderId: number, storeId: number | null) {
  const [order, state] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, paidAt: true, createdAt: true,
        details: { where: { isGift: false }, orderBy: { id: "asc" }, select: { productId: true, quantity: true, size: true, temperature: true, customNotes: true, comboId: true, product: { select: USUAL_PRODUCT_SELECT } } },
      },
    }),
    storeMenuState(prisma, storeId),
  ]);
  if (!order) return null;
  const lines: ReorderLine[] = order.details
    .filter((d) => d.comboId == null)
    .map((d) => {
      const food = d.product.hasSizes === false;
      const u = fitTemps(lineUsual({ ...d, at: order.createdAt, food }), d.product.temps);
      return {
        productId: d.productId,
        quantity: d.quantity,
        usual: u,
        note: splitNotes(d.customNotes).free,
        soldOut: d.product.outOfStock || state.soldOut.has(d.productId),
        available: d.product.isActive && !state.disabled.has(d.productId),
        product: d.product,
      };
    });
  return { orderId: order.id, at: order.paidAt ?? order.createdAt, lines, comboSkipped: order.details.some((d) => d.comboId != null) };
}
