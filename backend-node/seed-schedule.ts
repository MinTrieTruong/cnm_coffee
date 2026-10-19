import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const staff = await prisma.staff.findFirst({
    where: { fullName: { contains: 'phục vụ demo' } }
  });
  
  if (!staff || !staff.storeId) return;

  // Insert missing 23rd
  const date23 = new Date('2026-08-23T00:00:00Z');
  
  const existing = await prisma.workSchedule.findFirst({
    where: { staffId: staff.id, workDate: date23, shiftCode: 'SP2' }
  });
  
  if (!existing) {
    await prisma.workSchedule.create({
      data: {
        storeId: staff.storeId,
        staffId: staff.id,
        workDate: date23,
        shiftCode: 'SP2',
        startMin: 17 * 60,
        endMin: 22 * 60,
        status: 'APPROVED',
        staffNote: 'Generated demo schedule'
      }
    });
    console.log("Added 23rd");
  }

  // Update 16th to 17th? Actually 17th is already there. So the previous script generated 7 days: 16, 17, 18, 19, 20, 21, 22.
  // Wait, if it inserted 16 to 22, it's 7 days. We just need to add 23.
}

main().finally(() => prisma.$disconnect());
