import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting zone migration...");
  
  // Create a default zone
  let defaultZone = await prisma.zone.findFirst({
    where: { name: "Khu vực Chung" },
  });

  if (!defaultZone) {
    defaultZone = await prisma.zone.create({
      data: {
        name: "Khu vực Chung",
        isActive: true,
      },
    });
    console.log("Created default zone:", defaultZone.name);
  } else {
    console.log("Default zone already exists.");
  }

  // Update all tables that don't have a zone
  const result = await prisma.cafeTable.updateMany({
    where: { zoneId: null },
    data: { zoneId: defaultZone.id },
  });

  console.log(`Updated ${result.count} tables to the default zone.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
