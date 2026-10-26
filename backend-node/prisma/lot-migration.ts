import { PrismaClient } from "@prisma/client";
import { reconcileLots } from "../src/lib/inventory.js";

/**
 * Gộp lô hàng về một bảng (StockReceipt) — chạy 1 lần sau `prisma db push`:
 *   1. Chép các lô nhận theo PO trong Inventory_Batches (bảng cũ, không còn dùng) sang Stock_Receipts (source "PO")
 *   2. Kẹp "còn lại" của mọi lô ≤ tồn thực, trừ theo hết-hạn-trước-xuất-trước (trước đây bán hàng không trừ lô)
 * Chạy lại nhiều lần không sao — lô đã chép (ghi chú có "GRI#<id>") được bỏ qua.
 */
const prisma = new PrismaClient();

async function main() {
  const batches = await prisma.inventoryBatch.findMany({
    include: { grnItem: { include: { grn: { include: { po: { select: { code: true, supplierId: true } } } } } } },
  });
  let copied = 0;
  for (const b of batches) {
    const marker = `GRI#${b.grnItemId}`;
    if (await prisma.stockReceipt.findFirst({ where: { note: { contains: marker } }, select: { id: true } })) continue;
    const grn = b.grnItem.grn;
    await prisma.stockReceipt.create({
      data: {
        storeId: b.storeId,
        itemId: b.itemId,
        qty: b.originalQty,
        remainingQty: b.remainingQty,
        expiryDate: b.expiryDate,
        source: "PO",
        supplierId: grn.po.supplierId,
        note: `${grn.code} · ${grn.po.code} · ${marker}`,
        receivedAt: b.createdAt,
        receivedById: grn.receivedById,
      },
    });
    copied++;
  }
  console.log(`Đã chép ${copied}/${batches.length} lô từ Inventory_Batches sang Stock_Receipts.`);

  await reconcileLots(prisma);
  console.log("Đã cân lại số còn lại của các lô theo tồn kho thực.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
