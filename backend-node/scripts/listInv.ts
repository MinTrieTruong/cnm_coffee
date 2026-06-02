import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.inventoryItem.findMany({
    select: { id: true, name: true, unit: true, stockQty: true },
    orderBy: { id: "asc" },
  });
  rows.forEach((r) => console.log(JSON.stringify(r)));
}

main().finally(() => prisma.$disconnect());
