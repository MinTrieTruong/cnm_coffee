import type { PrismaClient, Prisma } from "@prisma/client";

export async function deductInventoryForOrder(
  tx: Prisma.TransactionClient | PrismaClient,
  orderId: number
) {
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
        const updatedItem = await tx.inventoryItem.update({
          where: { id: formula.itemId },
          data: { stockQty: { decrement: deductInt } },
        });
        await tx.inventoryTransaction.create({
          data: {
            itemId: formula.itemId,
            qtyChange: -deductInt,
            newStockQty: updatedItem.stockQty,
            transactionType: "SELL",
            referenceId: `ORDER-${orderId}`,
          },
        });
      }
    }
  }
}
