import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.product.findMany({ include: { category: true } })
  .then(console.log)
  .catch(console.error)
  .finally(() => prisma.$disconnect());
