import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const s = await prisma.workSchedule.findMany({ where: { staffId: 4, shiftCode: 'SP2' } });
  console.log(s.map(x => x.workDate));
}
main().finally(() => prisma.$disconnect());
