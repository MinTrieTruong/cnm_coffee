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

/**
 * Cộng/trừ tồn kho của chi nhánh và ghi InventoryTransaction.
 * Chưa có dòng tồn kho cho chi nhánh thì tạo mới từ 0.
 */
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

export async function adjustStoreStock(
  tx: Tx,
  args: { storeId: number; itemId: number; qtyChange: number; type: string; referenceId?: string | null },
) {
  const { storeId, itemId } = args;
  const qtyChange = roundQty(args.qtyChange);
  const row = await tx.storeInventory.upsert({
    where: { storeId_itemId: { storeId, itemId } },
    update: { stockQty: { increment: qtyChange } },
    create: { storeId, itemId, stockQty: qtyChange },
  });
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

/** Thanh toán xong → trừ kho tự động theo định mức các món trong đơn */
export async function deductInventoryForOrder(tx: Tx, orderId: number) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { storeId: true } });
  const details = await tx.orderDetail.findMany({ where: { orderId }, select: { productId: true, size: true, quantity: true } });
  return deductForCups(tx, { storeId: order.storeId, cups: details, type: "SELL", referenceId: `ORDER-${orderId}` });
}
