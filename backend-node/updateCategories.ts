import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const items = await prisma.inventoryItem.findMany();
  
  for (const item of items) {
    const name = item.name.toLowerCase();
    let category = "Khác";
    
    if (name.includes("cà phê") || name.includes("coffee")) {
      category = "Cà Phê";
    } else if (name.includes("trà") || name.includes("matcha")) {
      category = "Trà";
    } else if (name.includes("sữa")) {
      category = "Sữa";
    } else if (name.includes("syrup") || name.includes("siro")) {
      category = "Syrup";
    } else if (name.includes("trân châu") || name.includes("thạch") || name.includes("topping")) {
      category = "Topping";
    } else if (name.includes("ly") || name.includes("nắp") || name.includes("ống hút") || name.includes("túi")) {
      category = "Bao Bì";
    }

    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: { category }
    });
    
    console.log(`Updated ${item.name} -> ${category}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
