import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Tạo Chi nhánh #2 mẫu để thử nghiệm chuỗi cửa hàng: khu vực, 10 bàn (ID 101–110),
 * đủ bộ nhân viên (mật khẩu staff123) và tồn kho ban đầu. Chạy lại nhiều lần không sao.
 */
const prisma = new PrismaClient();
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL ?? "http://localhost:5173";

async function main() {
  const store = await prisma.store.upsert({
    where: { code: "CN2" },
    update: {},
    create: {
      code: "CN2",
      name: "TD Coffee - Chi nhánh 2",
      address: "Quận 1, TP. Hồ Chí Minh",
      lat: 10.7769,
      lng: 106.7009,
      allowedRadius: 50,
      openTime: "07:00",
      closeTime: "22:00",
    },
  });
  console.log(`Chi nhánh: ${store.name} (#${store.id})`);

  let zone = await prisma.zone.findFirst({ where: { storeId: store.id } });
  if (!zone) zone = await prisma.zone.create({ data: { name: "Khu A", storeId: store.id } });

  for (let i = 1; i <= 10; i++) {
    const id = 100 + i;
    await prisma.cafeTable.upsert({
      where: { id },
      update: {},
      create: {
        id,
        name: `Bàn ${i}`,
        capacity: 4,
        qrCode: `${PUBLIC_APP_URL}/?table=${id}`,
        zoneId: zone.id,
        storeId: store.id,
      },
    });
  }

  const hash = await bcrypt.hash("staff123", 10);
  const members: [string, string, string][] = [
    ["admin2", "Quản lý CN2", "Admin"],
    ["cashier2", "Thu ngân CN2", "Cashier"],
    ["kitchen2", "Pha chế CN2", "Kitchen"],
    ["waiter2", "Phục vụ CN2", "Waiter"],
    ["shipper2", "Shipper CN2", "Shipper"],
    ["kho2", "Thủ kho CN2", "Warehouse"],
  ];
  // DB nâng cấp từ bản 1 quán chưa có Thủ kho cho Chi nhánh #1
  const extra: [string, string, string, number][] = [["kho", "Thủ kho Demo", "Warehouse", 1]];
  for (const [username, fullName, role, storeId] of [...members.map((m) => [...m, store.id] as [string, string, string, number]), ...extra]) {
    const found = await prisma.staff.findUnique({ where: { username } });
    if (found) continue;
    const maxId = (await prisma.staff.aggregate({ _max: { id: true } }))._max.id ?? 0;
    await prisma.staff.create({
      data: { id: maxId + 1, username, passwordHash: hash, fullName, role, storeId },
    });
  }

  // Mức tồn tối thiểu lấy theo Chi nhánh #1
  const items = await prisma.inventoryItem.findMany({
    select: { id: true, storeStocks: { where: { storeId: 1 }, select: { minLevel: true } } },
  });
  for (const it of items) {
    await prisma.storeInventory.upsert({
      where: { storeId_itemId: { storeId: store.id, itemId: it.id } },
      update: {},
      create: { storeId: store.id, itemId: it.id, stockQty: 50, minLevel: it.storeStocks[0]?.minLevel ?? 0 },
    });
  }

  console.log(`✅ CN2: 10 bàn (ID 101–110), ${members.length} nhân viên (mật khẩu staff123), ${items.length} nguyên liệu; Thủ kho CN1: kho`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
