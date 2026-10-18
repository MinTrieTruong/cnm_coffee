import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const data = [
  {
    category: "Cà Phê Phin & Truyền Thống",
    products: [
      { name: "Cà Phê Sữa Đá", price: 29000 },
      { name: "Cà Phê Muối", price: 35000 },
      { name: "Cà Phê Cốt Dừa", price: 39000 },
    ]
  },
  {
    category: "Cà Phê Pha Máy (Espresso)",
    products: [
      { name: "Cappuccino (Nóng/Đá)", price: 45000 },
      { name: "Caramel Macchiato", price: 49000 },
    ]
  },
  {
    category: "Trà Trái Cây (Syrup/Mứt)",
    products: [
      { name: "Trà Đào Cam Sả", price: 39000 },
      { name: "Trà Vải Lài", price: 39000 },
      { name: "Trà Oolong Bưởi Hồng", price: 45000 },
    ]
  },
  {
    category: "Đồ Ăn Nhẹ",
    products: [
      { name: "Bánh Sừng Trâu (Croissant)", price: 29000 },
      { name: "Bánh Mì Que Pâté", price: 15000 },
      { name: "Bánh Tiramisu", price: 39000 },
    ]
  }
];

async function main() {
  console.log("🚀 Bắt đầu seed dữ liệu menu...");

  for (const group of data) {
    // 1. Tìm hoặc tạo Category
    let cat = await prisma.category.findFirst({
      where: { name: group.category }
    });

    if (!cat) {
      // Do schema không có @default(autoincrement()) nên phải tự lấy max ID (đề phòng db không tự tăng)
      const maxCat = await prisma.category.aggregate({ _max: { id: true } });
      const nextCatId = (maxCat._max.id || 0) + 1;
      
      cat = await prisma.category.create({
        data: {
          id: nextCatId,
          name: group.category,
        }
      });
      console.log(`📁 Tạo mới danh mục: ${cat.name} (ID: ${cat.id})`);
    } else {
      console.log(`📁 Đã có danh mục: ${cat.name} (ID: ${cat.id})`);
    }

    // 2. Thêm Products
    for (const prod of group.products) {
      let p = await prisma.product.findFirst({
        where: { name: prod.name }
      });

      if (!p) {
        const maxProd = await prisma.product.aggregate({ _max: { id: true } });
        const nextProdId = (maxProd._max.id || 0) + 1;

        p = await prisma.product.create({
          data: {
            id: nextProdId,
            categoryId: cat.id,
            name: prod.name,
            costPrice: Math.floor(prod.price * 0.4), // Tạm tính cost price = 40% giá bán
            sellPrice: prod.price,
            isActive: true,
            outOfStock: false,
            isBestSeller: false,
            imageUrl: null // Cho phép nullable hoặc thêm URL placeholder
          }
        });
        console.log(`  ➔ Thêm món mới: ${p.name} - ${p.sellPrice}đ`);
      } else {
        console.log(`  ➔ Món đã tồn tại: ${p.name}`);
      }
    }
  }
  console.log("✅ Seed hoàn tất!");
}

main()
  .catch(e => {
    console.error("Lỗi khi seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
