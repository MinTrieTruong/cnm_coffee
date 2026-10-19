import type { PrismaClient, Prisma } from "@prisma/client";

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
export async function adjustStoreStock(
  tx: Tx,
  args: { storeId: number; itemId: number; qtyChange: number; type: string; referenceId?: string | null },
) {
  const { storeId, itemId, qtyChange } = args;
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

export async function deductInventoryForOrder(tx: Tx, orderId: number) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { storeId: true } });
  const details = await tx.orderDetail.findMany({
    where: { orderId },
    include: { product: { include: { formulas: true } } },
  });

  for (const detail of details) {
    if (!detail.product.formulas || detail.product.formulas.length === 0) continue;
    for (const formula of detail.product.formulas) {
      let baseQty = formula.qtyPerUnit;
      if (detail.size === "S" && formula.qtySizeS !== null) baseQty = formula.qtySizeS;
      else if (detail.size === "M" && formula.qtySizeM !== null) baseQty = formula.qtySizeM;
      else if (detail.size === "L" && formula.qtySizeL !== null) baseQty = formula.qtySizeL;

      const deductQtyFloat = baseQty * detail.quantity;
      const deductInt = Math.round(deductQtyFloat);
      if (deductInt > 0) {
        await adjustStoreStock(tx, {
          storeId: order.storeId,
          itemId: formula.itemId,
          qtyChange: -deductInt,
          type: "SELL",
          referenceId: `ORDER-${orderId}`,
        });
      }
    }
  }
}
