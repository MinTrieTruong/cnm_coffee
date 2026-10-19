import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const productImages: Record<number, string> = {
  1: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=800&q=80",
  2: "https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=800&q=80",
  3: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=800&q=80",
  4: "https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=800&q=80",
  5: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=800&q=80",
  6: "https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=800&q=80",
  7: "https://images.unsplash.com/photo-1558857563-b37103387b5f?w=800&q=80",
  8: "https://images.unsplash.com/photo-1525385133512-2f3bdd039054?w=800&q=80",
  9: "https://images.unsplash.com/photo-1556679343-c1306c40fc7a?w=800&q=80",
  10: "https://images.unsplash.com/photo-1515825838458-f2a94b20105a?w=800&q=80",
  11: "https://images.unsplash.com/photo-1515823064-d6e0c04616e7?w=800&q=80",
  12: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=800&q=80",
};

async function main() {
  // Clean up in proper FK order
  await prisma.chatMessage.deleteMany();
  await prisma.chatSession.deleteMany();
  await prisma.userVoucher.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.review.deleteMany();
  await prisma.stockReceipt.deleteMany();
  await prisma.inventoryRequest.deleteMany();
  await prisma.shiftInventoryLog.deleteMany();
  await prisma.orderDetail.deleteMany();
  await prisma.order.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.workSchedule.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.stockTransfer.deleteMany();
  await prisma.storeProduct.deleteMany();
  await prisma.storeInventory.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.productFormula.deleteMany();
  await prisma.product.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.category.deleteMany();
  await prisma.cafeTable.deleteMany();

  // Chi nhánh mặc định — mọi dữ liệu mẫu bên dưới thuộc chi nhánh này
  const store = await prisma.store.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, code: "CN1", name: "TD Coffee - Chi nhánh 1" },
  });

  // ── Danh mục phân cấp (Mega Menu) ──────────────────────────────
  // Cấp 1: Danh mục gốc
  await prisma.category.create({ data: { id: 100, name: "Thức Uống", sortOrder: 1, parentId: null } });
  await prisma.category.create({ data: { id: 200, name: "Đồ Ăn Nhẹ", sortOrder: 2, parentId: null } });

  // Cấp 2: Danh mục con
  await prisma.category.create({ data: { id: 1, name: "Cà Phê Phin & Truyền Thống", sortOrder: 1, parentId: 100 } });
  await prisma.category.create({ data: { id: 2, name: "Cà Phê Pha Máy (Espresso)", sortOrder: 2, parentId: 100 } });
  await prisma.category.create({ data: { id: 3, name: "Trà Trái Cây (Syrup/Mứt)", sortOrder: 3, parentId: 100 } });
  await prisma.category.create({ data: { id: 4, name: "Trà Sữa & Trân Châu", sortOrder: 4, parentId: 100 } });
  await prisma.category.create({ data: { id: 5, name: "Matcha & Sữa Tươi", sortOrder: 5, parentId: 100 } });

  const inventorySeed = [
    { id: 1, name: "Cà Phê Phin Robusta (Bịch 1Kg)", stockQty: 15, minLevel: 3, unit: "Bịch" },
    { id: 2, name: "Cà Phê Máy Arabica (Bịch 1Kg)", stockQty: 10, minLevel: 2, unit: "Bịch" },
    { id: 3, name: "Sữa Đặc Ngôi Sao (Lon)", stockQty: 48, minLevel: 12, unit: "Lon" },
    { id: 4, name: "Sữa Tươi Thanh Trùng 1L (Hộp)", stockQty: 24, minLevel: 6, unit: "Hộp" },
    { id: 5, name: "Trà Đen Lộc Phát (Bịch 1Kg)", stockQty: 10, minLevel: 2, unit: "Bịch" },
    { id: 6, name: "Trà Oolong Nướng (Bịch 1Kg)", stockQty: 10, minLevel: 2, unit: "Bịch" },
    { id: 7, name: "Bột Matcha Nhật Bản (Bịch 500g)", stockQty: 8, minLevel: 2, unit: "Bịch" },
    { id: 8, name: "Bột Sữa Béo Indo (Bịch 1Kg)", stockQty: 15, minLevel: 3, unit: "Bịch" },
    { id: 9, name: "Syrup Đường Đen Đài Loan (Chai 2.5Kg)", stockQty: 6, minLevel: 2, unit: "Chai" },
    { id: 10, name: "Trân Châu Đen (Bịch 1Kg)", stockQty: 20, minLevel: 5, unit: "Bịch" },
    { id: 11, name: "Thạch Trái Cây (Hộp 1Kg)", stockQty: 10, minLevel: 2, unit: "Hộp" },
    { id: 12, name: "Ly Nhựa Kèm Nắp (Cái)", stockQty: 1000, minLevel: 200, unit: "Cái" },
  ];
  // Danh mục nguyên liệu dùng chung; số tồn thuộc chi nhánh
  await prisma.inventoryItem.createMany({
    data: inventorySeed.map(({ stockQty: _q, minLevel: _m, ...it }) => it),
  });
  await prisma.storeInventory.createMany({
    data: inventorySeed.map((it) => ({ storeId: store.id, itemId: it.id, stockQty: it.stockQty, minLevel: it.minLevel })),
  });

  const products = [
    { id: 1, sku: "CF-001", categoryId: 1, name: "Cà Phê Đen Đá", costPrice: 8000, sellPrice: 25000, isActive: true, isBestSeller: true, discountPercent: 15 },
    { id: 2, sku: "CF-002", categoryId: 1, name: "Bạc Xỉu Đá", costPrice: 12000, sellPrice: 35000, isActive: true, isBestSeller: true, discountPercent: null },
    { id: 3, sku: "CF-003", categoryId: 2, name: "Americano (Đá)", costPrice: 9000, sellPrice: 35000, isActive: true, isBestSeller: false, discountPercent: 20 },
    { id: 4, sku: "CF-004", categoryId: 2, name: "Latte (Đá/Nóng)", costPrice: 14000, sellPrice: 45000, isActive: true, isBestSeller: false, discountPercent: 10 },
    { id: 5, sku: "TS-001", categoryId: 4, name: "Trà Sữa Truyền Thống", costPrice: 10000, sellPrice: 30000, isActive: true, isBestSeller: false, discountPercent: null },
    { id: 6, sku: "TS-002", categoryId: 4, name: "Trà Sữa Oolong Nướng", costPrice: 12000, sellPrice: 35000, isActive: true, isBestSeller: false, discountPercent: 25 },
    { id: 7, sku: "TS-003", categoryId: 4, name: "Trà Sữa Trân Châu Đường Đen", costPrice: 14000, sellPrice: 39000, isActive: true, isBestSeller: true, discountPercent: null },
    { id: 8, sku: "TS-004", categoryId: 4, name: "Trà Đen Macchiato", costPrice: 13000, sellPrice: 39000, isActive: true, isBestSeller: false, discountPercent: null },
    { id: 9, sku: "MT-001", categoryId: 5, name: "Sữa Tươi Trân Châu Đường Đen", costPrice: 15000, sellPrice: 40000, isActive: true, isBestSeller: true, discountPercent: 10 },
    { id: 10, sku: "MT-002", categoryId: 5, name: "Matcha Latte (Nóng/Đá)", costPrice: 15000, sellPrice: 45000, isActive: true, isBestSeller: true, discountPercent: null },
    { id: 11, sku: "MT-003", categoryId: 5, name: "Matcha Đá Xay (Frappe)", costPrice: 18000, sellPrice: 49000, isActive: true, isBestSeller: false, discountPercent: 30 },
    { id: 12, sku: "MT-004", categoryId: 5, name: "Sữa Tươi Matcha Trân Châu", costPrice: 16000, sellPrice: 45000, isActive: true, isBestSeller: false, discountPercent: null },
  ];

  for (const p of products) {
    await prisma.product.create({
      data: {
        ...p,
        imageUrl: productImages[p.id] ?? null,
      },
    });
  }

  await prisma.cafeTable.createMany({
    data: Array.from({ length: 51 }, (_, i) => {
      const id = i + 1;
      return {
        id,
        name: `Bàn ${id}`,
        location: `Tầng ${Math.floor(i / 20) + 1}`,
        capacity: 4,
        qrCode: `http://localhost:5173/?table=${id}`,
        status: id === 1 ? "Occupied" : "Empty",
      };
    }),
  });

  const custHash = await bcrypt.hash("123456", 10);
  await prisma.customer.create({
    data: {
      id: 1,
      phone: "0900000000",
      passwordHash: custHash,
      fullName: "Khách Demo",
      email: "demo@example.com",
      points: 120,
      rankTier: "Bac",
    },
  });

  const staffPass = await bcrypt.hash("staff123", 10);
  await prisma.staff.createMany({
    data: [
      { id: 1, username: "admin", passwordHash: staffPass, fullName: "Quản lý", role: "Admin", hireDate: new Date() },
      { id: 2, username: "cashier", passwordHash: staffPass, fullName: "Thu ngân Demo", role: "Cashier", hireDate: new Date() },
      { id: 3, username: "kitchen", passwordHash: staffPass, fullName: "Pha chế Demo", role: "Kitchen", hireDate: new Date() },
      { id: 4, username: "waiter", passwordHash: staffPass, fullName: "Phục vụ Demo", role: "Waiter", hireDate: new Date() },
      { id: 5, username: "owner", passwordHash: staffPass, fullName: "Chủ chuỗi", role: "Owner", storeId: null, hireDate: new Date() },
    ],
  });

  await prisma.storeSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      vatRatePercent: 10,
      pointPerVnd: 10000,
      pointValueVnd: 1,
      cashRoundTo: 1000,
      pointEarnEveryVnd: 1000,
      pointEarnEach: 100,
    },
    update: {
      pointValueVnd: 1,
      pointEarnEveryVnd: 1000,
      pointEarnEach: 100,
    },
  });

  const paidAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await prisma.order.create({
    data: {
      id: 1,
      tableId: 1,
      customerId: 1,
      staffId: 3,
      orderType: "Dine-in",
      subTotal: 89000,
      vatAmount: 8900,
      totalAmount: 97900,
      status: "Paid",
      graceEndsAt: null,
      createdAt: paidAt,
      details: {
        create: [
          {
            id: 1,
            productId: 9,
            quantity: 1,
            unitPrice: 40000,
            customNotes: "Nhiều trân châu, ít đá",
            kdsStatus: "Ready",
          },
          {
            id: 2,
            productId: 11,
            quantity: 1,
            unitPrice: 49000,
            customNotes: "Thêm kem whip",
            kdsStatus: "Ready",
          },
        ],
      },
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
