/**
 * lib/behaviorInsights.ts — Số liệu trang "Hành vi khách" (tách khỏi route để Trợ lý AI dùng lại)
 *
 * Nguồn: Customer_Events (lib/customerEvents.ts, routes/tracking.ts).
 *   - Phiên = visitId (đổi khi khách vắng > 30 phút) · Khách khác nhau = sessionKey (mã ẩn danh trình duyệt).
 *   - Lọc chi nhánh / kênh / thiết bị theo PHIÊN: phiên có sự kiện ở chi nhánh đó, kênh / thiết bị của phiên
 *     (ORDER_PLACED do máy chủ ghi không có thiết bị — vẫn thuộc phiên của nó).
 *   - Gom bằng SQL (CTE + window function, MySQL 8), không kéo từng dòng về JS.
 *
 * TODO: khi bảng vượt vài triệu dòng → thêm bảng tổng hợp theo ngày (rollup) thay vì quét dữ liệu thô.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { BIZ_OFFSET_MIN } from "./bizTime.js";

export type BehaviorFilter = { storeId: number | null; from: Date; to: Date; channel?: "web" | "qr_table" | null; device?: "mobile" | "desktop" | null };

export const SCREEN_LABEL: Record<string, string> = {
  home: "Trang chủ", menu: "Thực đơn", product: "Chi tiết món", cart: "Giỏ hàng", checkout: "Thanh toán", grace: "Chờ xác nhận đơn",
  tracking: "Theo dõi đơn", success: "Đặt thành công", promotions: "Khuyến mãi", blog: "Tin tức", blog_post: "Bài viết", about: "Câu chuyện",
  stores: "Cửa hàng", store_detail: "Chi tiết cửa hàng", contact: "Liên hệ", account: "Tài khoản", game: "Mini game", policy: "Chính sách",
  payment_return: "Kết quả thanh toán", other: "Khác",
};
export const SOURCE_LABEL: Record<string, string> = {
  card_quick: "Nút + trên thẻ món", product_detail: "Trang chi tiết món", voice: "Đặt bằng giọng nói", usual: "Món quen", combo: "Combo", reorder: "Đặt lại đơn cũ",
};
export const FUNNEL_STEPS = ["visit", "product_view", "add_to_cart", "cart_view", "checkout_start", "order"] as const;

/** Ngưỡng cảnh báo theo món */
const VIEW_NO_BUY_MIN_VIEWERS = 20;
const VIEW_NO_BUY_MAX_PCT = 5;
const CART_DROP_MIN_QTY = 5;
const CART_DROP_PCT = 40;
/** Chỉ xếp hạng màn hình có đủ lượt */
const SCREEN_MIN_VIEWS = 20;

const n = (v: unknown) => (v == null ? 0 : Number(v));
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

/** CTE `v`: các phiên trong kỳ thoả bộ lọc, kèm thuộc tính phiên */
function visitsCte(f: BehaviorFilter) {
  const having: Prisma.Sql[] = [];
  if (f.storeId) having.push(Prisma.sql`SUM(Store_ID = ${f.storeId}) > 0`);
  if (f.device) having.push(Prisma.sql`device = ${f.device}`);
  if (f.channel) having.push(Prisma.sql`channel = ${f.channel}`);
  return Prisma.sql`v AS (
    SELECT Visit_ID AS vid, MIN(Session_Key) AS sk, MAX(Customer_ID) AS cust,
      IF(SUM(Device = 'mobile') > 0, 'mobile', IF(SUM(Device = 'desktop') > 0, 'desktop', 'unknown')) AS device,
      IF(SUM(Channel = 'qr_table') > 0, 'qr_table', 'web') AS channel,
      MIN(Created_At) AS startAt,
      SUM(Type = 'ORDER_PLACED') > 0 AS ordered
    FROM Customer_Events
    WHERE Created_At >= ${f.from} AND Created_At <= ${f.to}
    GROUP BY Visit_ID
    ${having.length ? Prisma.sql`HAVING ${Prisma.join(having, " AND ")}` : Prisma.empty}
  )`;
}
/** Sự kiện trong kỳ của các phiên đã lọc */
const eventsIn = (f: BehaviorFilter) => Prisma.sql`Customer_Events e JOIN v ON v.vid = e.Visit_ID WHERE e.Created_At >= ${f.from} AND e.Created_At <= ${f.to}`;

/** Tổng quan + phễu theo phiên */
async function overview(prisma: PrismaClient, f: BehaviorFilter) {
  const [row] = await prisma.$queryRaw<Record<string, unknown>[]>`
    WITH ${visitsCte(f)},
    pv AS (
      SELECT e.Visit_ID AS vid,
        MAX(e.Type = 'PRODUCT_VIEW') AS pv, MAX(e.Type = 'ADD_TO_CART') AS ac, MAX(e.Type = 'CART_VIEW') AS cv,
        MAX(e.Type = 'CHECKOUT_START') AS cs, MAX(e.Type = 'ORDER_PLACED') AS op,
        SUM(e.Type = 'PRODUCT_VIEW') AS views, SUM(e.Type = 'ADD_TO_CART') AS adds,
        SUM(IF(e.Type = 'PAGE_VIEW', e.Duration_Ms, 0)) AS dur
      FROM ${eventsIn(f)}
      GROUP BY e.Visit_ID
    )
    SELECT COUNT(*) AS visits, COUNT(DISTINCT v.sk) AS visitors, SUM(v.cust IS NOT NULL) AS loggedIn,
      SUM(pv.pv) AS fPv, SUM(pv.ac) AS fAc, SUM(pv.cv) AS fCv, SUM(pv.cs) AS fCs, SUM(pv.op) AS fOp,
      SUM(pv.views) AS views, SUM(pv.adds) AS adds, SUM(pv.dur) AS dur
    FROM v LEFT JOIN pv ON pv.vid = v.vid`;
  const [ord] = await prisma.$queryRaw<{ orders: bigint }[]>`
    WITH ${visitsCte(f)}
    SELECT COUNT(DISTINCT e.Order_ID) AS orders FROM ${eventsIn(f)} AND e.Type = 'ORDER_PLACED'`;
  // Bỏ giỏ: phiên có thêm giỏ mà cùng trình duyệt không đặt đơn trong 24 giờ kể từ lần thêm đầu
  const [ab] = await prisma.$queryRaw<{ carts: bigint; abandoned: Prisma.Decimal | null }[]>`
    WITH ${visitsCte(f)},
    a AS (
      SELECT e.Visit_ID AS vid, MIN(v.sk) AS sk, MIN(e.Created_At) AS firstAdd, MAX(e.Created_At) AS lastAdd
      FROM ${eventsIn(f)} AND e.Type = 'ADD_TO_CART'
      GROUP BY e.Visit_ID
    )
    SELECT COUNT(*) AS carts,
      SUM(NOT EXISTS (
        SELECT 1 FROM Customer_Events o
        WHERE o.Type = 'ORDER_PLACED' AND o.Session_Key = a.sk AND o.Created_At >= a.firstAdd AND o.Created_At <= a.lastAdd + INTERVAL 1 DAY
      )) AS abandoned
    FROM a`;
  const visits = n(row?.visits);
  const converted = n(row?.fOp);
  return {
    visits,
    visitors: n(row?.visitors),
    loggedInPct: pct(n(row?.loggedIn), visits),
    productViews: n(row?.views),
    addToCarts: n(row?.adds),
    orders: n(ord?.orders),
    conversionPct: pct(converted, visits),
    cartAbandonPct: pct(n(ab?.abandoned), n(ab?.carts)),
    avgVisitSec: visits ? Math.round(n(row?.dur) / visits / 1000) : 0,
    funnel: [visits, n(row?.fPv), n(row?.fAc), n(row?.fCv), n(row?.fCs), converted].map((c, i) => ({ step: FUNNEL_STEPS[i], visits: c })),
  };
}

type ProductRow = { pid: number; views: bigint; viewers: bigint; adds: bigint; addQty: Prisma.Decimal | null; adders: bigint; removeQty: Prisma.Decimal | null; orderQty: Prisma.Decimal | null };

async function products(prisma: PrismaClient, f: BehaviorFilter) {
  const rows = await prisma.$queryRaw<ProductRow[]>`
    WITH ${visitsCte(f)}
    SELECT e.Product_ID AS pid,
      SUM(e.Type = 'PRODUCT_VIEW') AS views, COUNT(DISTINCT IF(e.Type = 'PRODUCT_VIEW', v.sk, NULL)) AS viewers,
      SUM(e.Type = 'ADD_TO_CART') AS adds, SUM(IF(e.Type = 'ADD_TO_CART', COALESCE(e.Qty, 1), 0)) AS addQty,
      COUNT(DISTINCT IF(e.Type = 'ADD_TO_CART', v.sk, NULL)) AS adders,
      SUM(IF(e.Type = 'REMOVE_FROM_CART', COALESCE(e.Qty, 1), 0)) AS removeQty,
      SUM(IF(e.Type = 'ORDER_PLACED', COALESCE(e.Qty, 1), 0)) AS orderQty
    FROM ${eventsIn(f)} AND e.Product_ID IS NOT NULL
    GROUP BY e.Product_ID`;
  // Xem → giỏ: trong các phiên đã mở trang món, bao nhiêu phiên thêm chính món đó vào giỏ
  const conv = await prisma.$queryRaw<{ pid: number; viewVisits: Prisma.Decimal; viewAddVisits: Prisma.Decimal }[]>`
    WITH ${visitsCte(f)},
    x AS (
      SELECT e.Product_ID AS pid, e.Visit_ID AS vid, MAX(e.Type = 'PRODUCT_VIEW') AS viewed, MAX(e.Type = 'ADD_TO_CART') AS added
      FROM ${eventsIn(f)} AND e.Product_ID IS NOT NULL AND e.Type IN ('PRODUCT_VIEW', 'ADD_TO_CART')
      GROUP BY e.Product_ID, e.Visit_ID
    )
    SELECT pid, SUM(viewed) AS viewVisits, SUM(viewed AND added) AS viewAddVisits FROM x GROUP BY pid`;
  const convOf = new Map(conv.map((c) => [n(c.pid), c]));
  const meta = new Map(
    (await prisma.product.findMany({ where: { id: { in: rows.map((r) => n(r.pid)) } }, select: { id: true, name: true, imageUrl: true, isActive: true } })).map((p) => [p.id, p]),
  );
  return rows.map((r) => {
    const pid = n(r.pid);
    const m = meta.get(pid);
    const c = convOf.get(pid);
    const viewers = n(r.viewers);
    const addQty = n(r.addQty);
    const removes = n(r.removeQty);
    const ordersQty = n(r.orderQty);
    const viewToCartPct = pct(n(c?.viewAddVisits), n(c?.viewVisits));
    const cartToOrderPct = Math.min(100, pct(ordersQty, addQty));
    const flag: "VIEW_NO_BUY" | "CART_DROP" | null =
      viewers >= VIEW_NO_BUY_MIN_VIEWERS && viewToCartPct < VIEW_NO_BUY_MAX_PCT
        ? "VIEW_NO_BUY"
        : addQty >= CART_DROP_MIN_QTY && pct(removes, addQty) >= CART_DROP_PCT
          ? "CART_DROP"
          : null;
    return {
      productId: pid,
      name: m?.name ?? `Món #${pid}`,
      image: m?.imageUrl ?? null,
      active: m?.isActive ?? false,
      views: n(r.views),
      viewers,
      adds: n(r.adds),
      addQty,
      adders: n(r.adders),
      removes,
      ordersQty,
      viewToCartPct,
      cartToOrderPct,
      flag,
    };
  });
}

async function screens(prisma: PrismaClient, f: BehaviorFilter) {
  const rows = await prisma.$queryRaw<{ s: string; views: bigint; avgMs: Prisma.Decimal; totalMs: Prisma.Decimal; medianMs: Prisma.Decimal }[]>`
    WITH ${visitsCte(f)},
    p AS (
      SELECT e.Screen AS s, e.Duration_Ms AS d,
        ROW_NUMBER() OVER (PARTITION BY e.Screen ORDER BY e.Duration_Ms) AS rn, COUNT(*) OVER (PARTITION BY e.Screen) AS c
      FROM ${eventsIn(f)} AND e.Type = 'PAGE_VIEW' AND e.Duration_Ms IS NOT NULL
    )
    SELECT s, MAX(c) AS views, AVG(d) AS avgMs, SUM(d) AS totalMs,
      AVG(IF(rn IN (FLOOR((c + 1) / 2), CEIL((c + 1) / 2)), d, NULL)) AS medianMs
    FROM p GROUP BY s`;
  // Màn hình thoát: màn cuối của các phiên rời đi mà không đặt đơn
  const exits = await prisma.$queryRaw<{ s: string; exits: bigint }[]>`
    WITH ${visitsCte(f)},
    l AS (
      SELECT e.Screen AS s, v.ordered AS ordered, ROW_NUMBER() OVER (PARTITION BY e.Visit_ID ORDER BY e.Created_At DESC, e.CE_ID DESC) AS rn
      FROM ${eventsIn(f)} AND e.Type = 'PAGE_VIEW'
    )
    SELECT s, COUNT(*) AS exits FROM l WHERE rn = 1 AND NOT ordered GROUP BY s`;
  const exitOf = new Map(exits.map((e) => [e.s, n(e.exits)]));
  const totalExits = [...exitOf.values()].reduce((a, b) => a + b, 0);
  return rows
    .map((r) => ({
      screen: r.s,
      label: SCREEN_LABEL[r.s] ?? r.s,
      views: n(r.views),
      medianSec: Math.round(n(r.medianMs) / 100) / 10,
      avgSec: Math.round(n(r.avgMs) / 100) / 10,
      totalMin: Math.round(n(r.totalMs) / 6000) / 10,
      exits: exitOf.get(r.s) ?? 0,
      /** % trong các phiên rời đi mà không đặt đơn */
      exitPct: pct(exitOf.get(r.s) ?? 0, totalExits),
      ranked: n(r.views) >= SCREEN_MIN_VIEWS,
    }))
    .sort((a, b) => Number(b.ranked) - Number(a.ranked) || b.medianSec - a.medianSec);
}

async function breakdowns(prisma: PrismaClient, f: BehaviorFilter) {
  const sources = await prisma.$queryRaw<{ source: string | null; adds: bigint }[]>`
    WITH ${visitsCte(f)}
    SELECT e.Source AS source, COUNT(*) AS adds FROM ${eventsIn(f)} AND e.Type = 'ADD_TO_CART' GROUP BY e.Source`;
  const heat = await prisma.$queryRaw<{ dow: bigint; hour: bigint; visits: bigint }[]>`
    WITH ${visitsCte(f)}
    SELECT DAYOFWEEK(startAt + INTERVAL ${BIZ_OFFSET_MIN} MINUTE) - 1 AS dow, HOUR(startAt + INTERVAL ${BIZ_OFFSET_MIN} MINUTE) AS hour, COUNT(*) AS visits
    FROM v GROUP BY dow, hour`;
  const devices = await prisma.$queryRaw<{ k: string; visits: bigint; converted: Prisma.Decimal }[]>`
    WITH ${visitsCte(f)} SELECT device AS k, COUNT(*) AS visits, SUM(ordered) AS converted FROM v GROUP BY device`;
  const channels = await prisma.$queryRaw<{ k: string; visits: bigint; converted: Prisma.Decimal }[]>`
    WITH ${visitsCte(f)} SELECT channel AS k, COUNT(*) AS visits, SUM(ordered) AS converted FROM v GROUP BY channel`;
  const totalAdds = sources.reduce((s, r) => s + n(r.adds), 0);
  return {
    addSources: sources
      .map((r) => ({ source: r.source ?? "unknown", label: SOURCE_LABEL[r.source ?? ""] ?? "Khác", adds: n(r.adds), pct: pct(n(r.adds), totalAdds) }))
      .sort((a, b) => b.adds - a.adds),
    heatmap: heat.map((h) => ({ dow: n(h.dow), hour: n(h.hour), visits: n(h.visits) })),
    devices: devices.map((d) => ({ device: d.k, visits: n(d.visits), conversionPct: pct(n(d.converted), n(d.visits)) })).sort((a, b) => b.visits - a.visits),
    channels: channels.map((d) => ({ channel: d.k, visits: n(d.visits), conversionPct: pct(n(d.converted), n(d.visits)) })).sort((a, b) => b.visits - a.visits),
  };
}

/** Kỳ trước cùng độ dài, liền trước kỳ đang xem */
export function previousRange(from: Date, to: Date) {
  const len = to.getTime() - from.getTime() + 1;
  return { prevFrom: new Date(from.getTime() - len), prevTo: new Date(from.getTime() - 1) };
}

export async function computeBehaviorInsights(prisma: PrismaClient, f: BehaviorFilter) {
  const { prevFrom, prevTo } = previousRange(f.from, f.to);
  const [cur, prev, prods, scr, br] = await Promise.all([
    overview(prisma, f),
    overview(prisma, { ...f, from: prevFrom, to: prevTo }),
    products(prisma, f),
    screens(prisma, f),
    breakdowns(prisma, f),
  ]);
  const { funnel, ...summary } = cur;
  const top = <K extends "views" | "adds">(k: K) =>
    prods
      .filter((p) => p[k] > 0)
      .sort((a, b) => b[k] - a[k])
      .slice(0, 20);
  return {
    range: { from: f.from, to: f.to, prevFrom, prevTo },
    summary: { ...summary, prev: { visits: prev.visits, visitors: prev.visitors, conversionPct: prev.conversionPct, cartAbandonPct: prev.cartAbandonPct, avgVisitSec: prev.avgVisitSec } },
    funnel,
    topViewed: top("views").map((p) => ({ productId: p.productId, name: p.name, image: p.image, views: p.views, viewers: p.viewers })),
    topAdded: top("adds").map((p) => ({ productId: p.productId, name: p.name, image: p.image, adds: p.adds, qty: p.addQty, adders: p.adders })),
    productFunnel: prods
      .filter((p) => p.views + p.adds + p.ordersQty > 0)
      .sort((a, b) => b.views - a.views || b.adds - a.adds)
      .map(({ productId, name, image, active, views, viewers, adds, addQty, removes, ordersQty, viewToCartPct, cartToOrderPct, flag }) => ({
        productId, name, image, active, views, viewers, adds, addQty, removes, ordersQty, viewToCartPct, cartToOrderPct, flag,
      })),
    screens: scr,
    ...br,
  };
}

export type BehaviorInsights = Awaited<ReturnType<typeof computeBehaviorInsights>>;

/** Chi tiết 1 món: xem / thêm / đặt theo ngày, nguồn thêm giỏ, màn hình ngay trước khi mở món */
export async function productBehavior(prisma: PrismaClient, f: BehaviorFilter, productId: number) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true, imageUrl: true, isActive: true } });
  if (!product) return null;
  const days = await prisma.$queryRaw<{ day: string; views: bigint; addQty: Prisma.Decimal; removeQty: Prisma.Decimal; orderQty: Prisma.Decimal }[]>`
    WITH ${visitsCte(f)}
    SELECT DATE_FORMAT(e.Created_At + INTERVAL ${BIZ_OFFSET_MIN} MINUTE, '%Y-%m-%d') AS day,
      SUM(e.Type = 'PRODUCT_VIEW') AS views,
      SUM(IF(e.Type = 'ADD_TO_CART', COALESCE(e.Qty, 1), 0)) AS addQty,
      SUM(IF(e.Type = 'REMOVE_FROM_CART', COALESCE(e.Qty, 1), 0)) AS removeQty,
      SUM(IF(e.Type = 'ORDER_PLACED', COALESCE(e.Qty, 1), 0)) AS orderQty
    FROM ${eventsIn(f)} AND e.Product_ID = ${productId}
    GROUP BY day ORDER BY day`;
  const sources = await prisma.$queryRaw<{ source: string | null; adds: bigint }[]>`
    WITH ${visitsCte(f)}
    SELECT e.Source AS source, COUNT(*) AS adds FROM ${eventsIn(f)} AND e.Type = 'ADD_TO_CART' AND e.Product_ID = ${productId} GROUP BY e.Source`;
  // Lượt xem màn hình được ghi lúc khách RỜI màn → màn ngay trước = PAGE_VIEW gần nhất trước lúc mở món
  const prev = await prisma.$queryRaw<{ s: string | null; c: bigint }[]>`
    WITH ${visitsCte(f)},
    x AS (
      SELECT (SELECT p.Screen FROM Customer_Events p
              WHERE p.Visit_ID = e.Visit_ID AND p.Type = 'PAGE_VIEW' AND (p.Created_At < e.Created_At OR (p.Created_At = e.Created_At AND p.CE_ID < e.CE_ID))
              ORDER BY p.Created_At DESC, p.CE_ID DESC LIMIT 1) AS s
      FROM ${eventsIn(f)} AND e.Type = 'PRODUCT_VIEW' AND e.Product_ID = ${productId}
    )
    SELECT s, COUNT(*) AS c FROM x GROUP BY s ORDER BY c DESC`;
  const totalAdds = sources.reduce((s, r) => s + n(r.adds), 0);
  const totalPrev = prev.reduce((s, r) => s + n(r.c), 0);
  return {
    product: { id: product.id, name: product.name, image: product.imageUrl, active: product.isActive },
    days: days.map((d) => ({ day: d.day, views: n(d.views), adds: n(d.addQty), removes: n(d.removeQty), orders: n(d.orderQty) })),
    sources: sources
      .map((r) => ({ source: r.source ?? "unknown", label: SOURCE_LABEL[r.source ?? ""] ?? "Khác", adds: n(r.adds), pct: pct(n(r.adds), totalAdds) }))
      .sort((a, b) => b.adds - a.adds),
    prevScreens: prev.map((r) => ({ screen: r.s ?? "entry", label: r.s ? SCREEN_LABEL[r.s] ?? r.s : "Vào thẳng (link / mở lại)", views: n(r.c), pct: pct(n(r.c), totalPrev) })),
  };
}
