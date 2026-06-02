import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const custHash = await bcrypt.hash("123456", 10);
  const staffHash = await bcrypt.hash("staff123", 10);

  const custResult = await prisma.customer.updateMany({
    data: { passwordHash: custHash },
  });

  const staffResult = await prisma.staff.updateMany({
    data: { passwordHash: staffHash },
  });

  console.log(`✅ Reset ${custResult.count} khách hàng → mật khẩu: 123456`);
  console.log(`✅ Reset ${staffResult.count} nhân viên  → mật khẩu: staff123`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
