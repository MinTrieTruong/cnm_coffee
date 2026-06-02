/**
 * seedSuppliers.ts
 * Tạo dữ liệu mẫu nhà cung cấp dựa theo danh mục hàng trong kho.
 * Chạy: npx tsx scripts/seedSuppliers.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ── 1. Upsert nhà cung cấp ──────────────────────────────────────────────
  const suppliers = [
    {
      // Chuyên cà phê hạt, cung cấp Robusta & Arabica
      name: "Công Ty TNHH Cà Phê Trung Nguyên",
      phone: "0263 3 822 999",
      address: "82-84 Hoàng Diệu, TP. Buôn Ma Thuột, Đắk Lắk",
      email: "supply@trungnguyen.com.vn",
      note: "NCC chính cà phê phin Robusta & cà phê máy Arabica. Giao hàng thứ Hai & thứ Năm hằng tuần.",
    },
    {
      // Chuyên sữa đặc & nguyên liệu pha chế sữa
      name: "Vinamilk – Đại lý Miền Nam",
      phone: "1800 1220",
      address: "10 Tân Trào, Tân Phú, TP. HCM",
      email: "dalymn@vinamilk.com.vn",
      note: "Cung cấp sữa đặc Ngôi Sao, sữa tươi thanh trùng. Đặt tối thiểu 50 hộp/đơn.",
    },
    {
      // Trà các loại
      name: "Trà Lộc Phát – Chi Nhánh HCM",
      phone: "028 3855 1212",
      address: "45 Bình Thới, Q.11, TP. HCM",
      email: "kinhdoanh@locphat.vn",
      note: "Cung cấp Trà Đen Lộc Phát & Trà Oolong Nướng. Chiết khấu 5% khi đặt ≥ 20 bịch.",
    },
    {
      // Matcha nhập khẩu Nhật Bản
      name: "Nippon Matcha Import",
      phone: "028 7301 0098",
      address: "12 Nguyễn Trãi, Q.1, TP. HCM",
      email: "order@nipponmatcha.vn",
      note: "Matcha Nhật Bản chứng nhận JAS. Giao trong 3 ngày làm việc, bảo quản lạnh.",
    },
    {
      // Bột sữa, nguyên liệu pha chế
      name: "Indo Dairy Supplier",
      phone: "028 3512 4444",
      address: "89 Hùng Vương, Q.5, TP. HCM",
      email: "sales@indodairy.vn",
      note: "Bột sữa béo Indo (full-cream), bột kem béo. Xuất xứ Indonesia, nhập khẩu chính ngạch.",
    },
    {
      // Syrup, đường, topping Đài Loan
      name: "Đài Loan Topping Co., Ltd",
      phone: "028 3966 7788",
      address: "23 Hòa Bình, Bình Tân, TP. HCM",
      email: "order@tltopping.vn",
      note: "Syrup đường đen Tiger, trân châu đen, thạch trái cây. Giao hàng thứ Ba & thứ Sáu.",
    },
    {
      // Bao bì: ly nhựa, nắp, ống hút
      name: "Bao Bì Xanh Sạch",
      phone: "0274 3 888 001",
      address: "15/5 Đường Số 8, KCN Sóng Thần, Bình Dương",
      email: "info@baobixanh.vn",
      note: "Ly nhựa PET 500ml/700ml kèm nắp dome. Tối thiểu đặt 1.000 cái/đơn, giao trong 2 ngày.",
    },
  ];

  console.log("⏳ Seeding suppliers...");
  for (const s of suppliers) {
    // Dùng upsert theo tên để idempotent
    await prisma.supplier.upsert({
      where: { id: await getIdByName(s.name) },
      update: { ...s },
      create: { ...s },
    });
  }

  // ── 2. In kết quả ────────────────────────────────────────────────────────
  const all = await prisma.supplier.findMany({ orderBy: { id: "asc" } });
  console.log(`\n✅ Đã tạo ${all.length} nhà cung cấp:`);
  all.forEach((s) =>
    console.log(`  [${s.id}] ${s.name} — ${s.phone ?? "—"}`)
  );
}

/** Lấy id hiện có nếu trùng tên, hoặc trả 0 để upsert tạo mới */
async function getIdByName(name: string): Promise<number> {
  const found = await prisma.supplier.findFirst({ where: { name } });
  return found?.id ?? 0;
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
