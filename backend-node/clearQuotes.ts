import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  await p.purchaseOrder.deleteMany();
  await p.supplierQuoteItem.deleteMany();
  await p.supplierQuote.deleteMany();
  console.log("Deleted old quotes");
}
main().finally(() => p.$disconnect());
