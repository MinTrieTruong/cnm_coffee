import type { PrismaClient, Prisma } from "@prisma/client";
import { emitLowStock, type LowStockAlert } from "./realtime.js";

type Tx = Prisma.TransactionClient | PrismaClient;

/** Dùng trong `include`/`select` của InventoryItem: lấy tồn kho của 1 chi nhánh. */
export function storeStockOf(storeId: number) {
  return { where: { storeId }, select: { stockQty: true, minLevel: true } } as const;
}

/** Gộp `storeStocks` (từ `storeStockOf`) thành `stockQty`/`minLevel` phẳng như trước đây. */
export function withStoreStock<T extends { storeStocks: { stockQty: number; minLevel: number }[] }>(item: T) {
  const { storeStocks, ...rest } = item;
  return { ...rest, stockQty: storeStocks[0]?.stockQty ?? 0, minLevel: storeStocks[0]?.minLevel ?? 0 };
}

/** Làm tròn số lượng kho tới 4 chữ số thập phân (tránh sai số cộng dồn số thực) */
export const roundQty = (n: number) => Math.round(n * 10_000) / 10_000;

type FormulaLike = {
  itemId: number;
  qtyPerUnit: number;
  qtySizeS: number | null;
  qtySizeM: number | null;
  qtySizeL: number | null;
  conversionFactor: number;
};

/**
 * Lượng nguyên liệu cho 1 ly, đã quy về ĐƠN VỊ KHO.
 * Định mức ghi theo đơn vị công thức (g, ml); conversionFactor = số đơn vị công thức trong 1 đơn vị kho
 * (VD 1 bịch = 1000 g → 20 g/ly = 0.02 bịch/ly).
 */
export function stockPerCup(f: FormulaLike, size?: string | null) {
  const recipe =
    size === "S" && f.qtySizeS != null ? f.qtySizeS
    : size === "M" && f.qtySizeM != null ? f.qtySizeM
    : size === "L" && f.qtySizeL != null ? f.qtySizeL
    : f.qtyPerUnit;
  return recipe / (f.conversionFactor > 0 ? f.conversionFactor : 1);
}

/**
 * Lô hàng (StockReceipt) — bảng lô duy nhất, có hạn sử dụng: nhập tay, nhận hàng theo PO.
 * Tồn giảm (bán, hao hụt, chuyển đi, kiểm kê thiếu…) → trừ vào lô theo hết-hạn-trước-xuất-trước:
 * lô có hạn sớm nhất trước, lô không ghi hạn sau cùng, cùng hạn thì lô nhập trước.
 * Sau đó luôn giữ tổng "còn lại" của các lô ≤ tồn thực (phần tồn không thuộc lô nào: tồn ban đầu, chuyển kho đến…).
 */
async function consumeLots(tx: Tx, storeId: number, itemId: number, consume: number, stockQty: number) {
  const lots = await tx.stockReceipt.findMany({
    where: { storeId, itemId, remainingQty: { gt: 0 } },
    select: { id: true, remainingQty: true, expiryDate: true, receivedAt: true },
  });
  if (!lots.length) return;
  lots.sort((a, b) => {
    const ea = a.expiryDate?.getTime() ?? Infinity;
    const eb = b.expiryDate?.getTime() ?? Infinity;
    return ea !== eb ? ea - eb : a.receivedAt.getTime() - b.receivedAt.getTime();
  });
  const total = lots.reduce((s, l) => s + l.remainingQty, 0);
  let left = roundQty(Math.max(consume, total - Math.max(0, stockQty)));
  for (const l of lots) {
    if (left <= 0) break;
    const take = Math.min(l.remainingQty, left);
    await tx.stockReceipt.update({ where: { id: l.id }, data: { remainingQty: roundQty(l.remainingQty - take) } });
    left = roundQty(left - take);
  }
}

/**
 * Cộng/trừ tồn kho của chi nhánh, ghi InventoryTransaction và trừ lô khi tồn giảm.
 * Chưa có dòng tồn kho cho chi nhánh thì tạo mới từ 0.
 * `lots: false` — người gọi tự cập nhật lô (VD huỷ đúng 1 lô hết hạn), chỉ kẹp tổng lô ≤ tồn.
 */
export async function adjustStoreStock(
  tx: Tx,
  args: { storeId: number; itemId: number; qtyChange: number; type: string; referenceId?: string | null; lots?: boolean },
) {
  const { storeId, itemId } = args;
  const qtyChange = roundQty(args.qtyChange);
  const row = await tx.storeInventory.upsert({
    where: { storeId_itemId: { storeId, itemId } },
    update: { stockQty: { increment: qtyChange } },
    create: { storeId, itemId, stockQty: qtyChange },
  });
  if (qtyChange < 0) await consumeLots(tx, storeId, itemId, args.lots === false ? 0 : -qtyChange, row.stockQty);
  await tx.inventoryTransaction.create({
    data: {
      storeId,
      itemId,
      qtyChange,
      newStockQty: row.stockQty,
      transactionType: args.type,
      referenceId: args.referenceId ?? null,
    },
  });
  return row;
}

/**
 * Trừ tồn kho theo định mức cho các ly cụ thể (bán hàng, làm hỏng món…).
 * Gộp theo nguyên liệu, trừ 1 lần / nguyên liệu, rồi báo pha chế nếu nguyên liệu vừa sắp hết.
 */
export async function deductForCups(
  tx: Tx,
  args: { storeId: number; cups: { productId: number; size?: string | null; quantity: number }[]; type: string; referenceId: string },
) {
  const { storeId } = args;
  const productIds = [...new Set(args.cups.map((c) => c.productId))];
  const formulas = await tx.productFormula.findMany({ where: { productId: { in: productIds } } });

  const need = new Map<number, number>();
  for (const c of args.cups) {
    for (const f of formulas.filter((x) => x.productId === c.productId)) {
      need.set(f.itemId, (need.get(f.itemId) ?? 0) + stockPerCup(f, c.size) * c.quantity);
    }
  }

  const alerts: LowStockAlert[] = [];
  for (const [itemId, qty] of need) {
    const amount = roundQty(qty);
    if (amount <= 0) continue;
    const row = await adjustStoreStock(tx, { storeId, itemId, qtyChange: -amount, type: args.type, referenceId: args.referenceId });
    const before = row.stockQty + amount;
    // Món không còn đủ nguyên liệu này để làm thêm 1 ly (size mặc định) — chỉ báo lúc vừa chuyển sang thiếu
    const usedBy = await tx.productFormula.findMany({ where: { itemId }, include: { product: { select: { id: true, name: true } } } });
    const cantMake = usedBy.filter((f) => { const per = stockPerCup(f); return per > row.stockQty && per <= before; }).map((f) => f.product);
    const crossedMin = before > row.minLevel && row.stockQty <= row.minLevel;
    if (crossedMin || cantMake.length) {
      const item = await tx.inventoryItem.findUnique({ where: { id: itemId }, select: { name: true, unit: true } });
      alerts.push({ id: itemId, name: item?.name ?? "", unit: item?.unit ?? null, stockQty: roundQty(row.stockQty), minLevel: row.minLevel, products: cantMake });
    }
  }
  emitLowStock(storeId, alerts);
  return { deducted: need.size, alerts };
}

/**
 * Trả lại lượng vừa cộng vào tồn cho các lô (VD đơn bán bị hủy, nhập lại nguyên liệu).
 * Lô bị trừ theo thứ tự hết-hạn-trước-xuất-trước nên phần bị trừ luôn là "đầu hàng đợi":
 * trả ngược từ lô đang dở dang về các lô trước nó, mỗi lô không vượt số lượng nhập.
 * Bỏ qua lô đã hết hạn (đã / sẽ bị huỷ). Gọi sau khi đã cộng tồn để tổng lô vẫn ≤ tồn.
 */
export async function restoreLots(tx: Tx, storeId: number, itemId: number, qty: number) {
  const now = new Date();
  const lots = await tx.stockReceipt.findMany({
    where: { storeId, itemId, OR: [{ expiryDate: null }, { expiryDate: { gt: now } }] },
    select: { id: true, qty: true, remainingQty: true, expiryDate: true, receivedAt: true },
  });
  lots.sort((a, b) => {
    const ea = a.expiryDate?.getTime() ?? Infinity;
    const eb = b.expiryDate?.getTime() ?? Infinity;
    return ea !== eb ? eb - ea : b.receivedAt.getTime() - a.receivedAt.getTime();
  });
  let left = roundQty(qty);
  for (const l of lots) {
    if (left <= 0) break;
    const room = roundQty(l.qty - l.remainingQty);
    if (room <= 0) continue;
    const add = Math.min(room, left);
    await tx.stockReceipt.update({ where: { id: l.id }, data: { remainingQty: roundQty(l.remainingQty + add) } });
    left = roundQty(left - add);
  }
}

/** Thanh toán xong → trừ kho tự động theo định mức các món trong đơn */
export async function deductInventoryForOrder(tx: Tx, orderId: number) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { storeId: true } });
  const details = await tx.orderDetail.findMany({ where: { orderId }, select: { productId: true, size: true, quantity: true } });
  return deductForCups(tx, { storeId: order.storeId, cups: details, type: "SELL", referenceId: `ORDER-${orderId}` });
}

/** Kẹp tổng "còn lại" của các lô ≤ tồn thực cho mọi nguyên liệu của chi nhánh (dùng sau khi chuyển dữ liệu lô cũ) */
export async function reconcileLots(tx: Tx, storeId?: number) {
  const stocks = await tx.storeInventory.findMany({ where: storeId != null ? { storeId } : {}, select: { storeId: true, itemId: true, stockQty: true } });
  for (const s of stocks) await consumeLots(tx, s.storeId, s.itemId, 0, s.stockQty);
}
