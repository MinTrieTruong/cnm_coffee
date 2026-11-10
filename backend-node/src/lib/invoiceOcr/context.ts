/**
 * lib/invoiceOcr/context.ts — Ngữ cảnh đơn mua gửi kèm cho AI đọc hoá đơn: mặt hàng còn phải giao, giá báo giá,
 * nhà cung cấp và các quy đổi đơn vị đã được người nhận xác nhận trước đây (theo NCC + tên hàng trên hoá đơn).
 */
import type { PrismaClient } from "@prisma/client";
import { orderedLines, poLinesInclude } from "../procurement/poLines.js";

export type PoLine = { itemId: number; name: string; unit: string | null; ordered: number; remaining: number; quotedPrice: number };
export type UnitAlias = { rawName: string; itemId: number; factor: number; unitInvoice: string | null };
export type PoContext = {
  poId: number;
  poCode: string;
  storeId: number;
  supplierId: number;
  supplierName: string;
  status: string;
  lines: PoLine[];
  aliases: UnitAlias[];
};

export async function buildPoContext(db: PrismaClient, poId: number): Promise<PoContext | null> {
  const po = await db.purchaseOrder.findUnique({ where: { id: poId }, include: { ...poLinesInclude, supplier: { select: { name: true } } } });
  if (!po) return null;
  const aliases = await db.supplierUnitAlias.findMany({ where: { supplierId: po.supplierId }, select: { rawName: true, itemId: true, factor: true, unitInvoice: true } });
  return {
    poId: po.id,
    poCode: po.code,
    storeId: po.storeId,
    supplierId: po.supplierId,
    supplierName: po.supplier.name,
    status: po.status,
    lines: orderedLines(po).map((l) => ({ itemId: l.itemId, name: l.name, unit: l.unit, ordered: l.ordered, remaining: l.remaining, quotedPrice: l.unitPrice })),
    aliases,
  };
}

/** Ngữ cảnh dạng chữ cho prompt */
export function poPromptText(ctx: PoContext) {
  const lines = ctx.lines.map((l) => `- itemId ${l.itemId}: ${l.name} | đơn vị kho: ${l.unit ?? "?"} | còn phải giao: ${l.remaining} | giá báo giá: ${l.quotedPrice.toLocaleString("vi-VN")}đ / ${l.unit ?? "đơn vị"}`);
  const aliases = ctx.aliases.map((a) => `- "${a.rawName}"${a.unitInvoice ? ` (${a.unitInvoice})` : ""} → itemId ${a.itemId}, 1 ${a.unitInvoice ?? "đơn vị hoá đơn"} = ${a.factor} đơn vị kho`);
  return [
    `Đơn mua ${ctx.poCode} — nhà cung cấp: ${ctx.supplierName}`,
    "MẶT HÀNG TRONG ĐƠN MUA:",
    ...lines,
    ...(aliases.length ? ["", "QUY ĐỔI ĐÃ GHI NHỚ CHO NHÀ CUNG CẤP NÀY (tên hàng trên hoá đơn đã bỏ dấu):", ...aliases] : []),
  ].join("\n");
}
