import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Chạy sau prisma/sql/001_chain_stores.sql: tạo tài khoản Chủ chuỗi (Owner).
 * Chạy lại nhiều lần không sao — đã có thì bỏ qua.
 */
const prisma = new PrismaClient();

async function main() {
  const stores = await prisma.store.count();
  if (stores === 0) throw new Error("Chưa có chi nhánh nào — hãy chạy prisma/sql/001_chain_stores.sql trước.");

  const existing = await prisma.staff.findFirst({ where: { role: "Owner" } });
  if (existing) {
    console.log(`Owner đã tồn tại: ${existing.username} (#${existing.id})`);
    return;
  }

  const password = process.env.OWNER_PASSWORD ?? "owner123";
  const maxId = (await prisma.staff.aggregate({ _max: { id: true } }))._max.id ?? 0;
  const owner = await prisma.staff.create({
    data: {
      id: maxId + 1,
      username: "owner",
      passwordHash: await bcrypt.hash(password, 10),
      fullName: "Chủ chuỗi",
      role: "Owner",
      // Owner không thuộc chi nhánh nào
      storeId: null,
    },
  });
  console.log(`✅ Tạo Owner: ${owner.username} / ${password} (#${owner.id})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
