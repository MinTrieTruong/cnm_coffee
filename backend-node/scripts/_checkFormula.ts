import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const row = await p.productFormula.findFirst({ where: { productId: 1, itemId: 1 } });
console.log(JSON.stringify(row, null, 2));
await p.$disconnect();
