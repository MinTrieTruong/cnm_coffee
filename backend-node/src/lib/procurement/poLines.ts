/**
 * lib/procurement/poLines.ts — Mặt hàng của đơn mua và số còn phải giao (dùng chung: nhận hàng, đọc hoá đơn bằng AI).
 */
import type { Prisma } from "@prisma/client";

/** Đơn mua kèm đủ dữ liệu tính số đã đặt / đã nhận của từng mặt hàng */
export const poLinesInclude = {
  quote: { include: { items: true, rfq: { include: { requisition: { include: { items: { include: { item: { select: { name: true, unit: true } } } } } } } } } },
  receipts: { include: { items: true } },
  cancels: true,
  // Hàng trả NCC để đổi → phải giao lại
  returns: { where: { status: "APPROVED", resolution: "REPLACE" }, include: { items: true } },
} as const;
export type PoWithLines = Prisma.PurchaseOrderGetPayload<{ include: typeof poLinesInclude }>;

/**
 * Mặt hàng của đơn mua = mặt hàng trong đề xuất có báo giá.
 * Còn phải giao = đặt − đã nhận − đã hủy (NCC không giao bù) + đã trả để đổi hàng.
 */
export function orderedLines(po: PoWithLines) {
  return po.quote.rfq.requisition.items.flatMap((pi) => {
    const q = po.quote.items.find((x) => x.itemId === pi.itemId);
    if (!q) return [];
    const grnItems = po.receipts.flatMap((g) => g.items.filter((x) => x.itemId === pi.itemId).map((x) => ({ ...x, at: g.createdAt })));
    const received = grnItems.reduce((a, x) => a + x.receivedQty, 0);
    const rejected = grnItems.reduce((a, x) => a + x.rejectedQty, 0);
    const cancelled = po.cancels.filter((c) => c.itemId === pi.itemId).reduce((a, c) => a + c.qty, 0);
    const replaced = Math.round(po.returns.reduce((a, rt) => a + rt.items.filter((x) => x.itemId === pi.itemId).reduce((b, x) => b + x.qty, 0), 0));
    const remaining = Math.max(0, pi.qty - received - cancelled + replaced);
    // Ngày hẹn giao bù: theo đợt nhận mới nhất có chọn chờ giao bù
    const last = [...grnItems].sort((a, b) => b.at.getTime() - a.at.getTime())[0];
    const backorderDate = remaining > 0 && last?.shortAction === "BACKORDER" ? last.backorderDate : null;
    return [{ itemId: pi.itemId, name: pi.item.name, unit: pi.item.unit, ordered: pi.qty, received, rejected, cancelled, replaced, remaining, backorderDate, unitPrice: q.unitPrice }];
  });
}

