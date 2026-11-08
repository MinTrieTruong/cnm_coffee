import type { PrismaClient } from "@prisma/client";

export type SiteStats = { stores: number; products: number; cups: number; rating: number | null; reviews: number };

let cache: { at: number; data: SiteStats } | null = null;

/**
 * Số liệu trang khách: chi nhánh đang mở, món đang bán, ly đã phục vụ (tổng số lượng món trong đơn đã thanh toán),
 * điểm đánh giá trung bình. Đệm 5 phút. Dùng cho trang chủ (/site/stats) và mục "Con số biết nói" (/site/brand/stats).
 */
export async function siteStats(prisma: PrismaClient): Promise<SiteStats> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.data;
  const [stores, products, cups, rating] = await Promise.all([
    prisma.store.count({ where: { isActive: true } }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.orderDetail.aggregate({ where: { order: { status: "Paid" } }, _sum: { quantity: true } }),
    prisma.review.aggregate({ where: { hidden: false }, _avg: { rating: true }, _count: { _all: true } }),
  ]);
  const data = {
    stores,
    products,
    cups: cups._sum.quantity ?? 0,
    rating: rating._count._all ? Math.round((rating._avg.rating ?? 0) * 10) / 10 : null,
    reviews: rating._count._all,
  };
  cache = { at: Date.now(), data };
  return data;
}
