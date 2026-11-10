import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Bổ sung nhân viên cho đủ định biên ca ở mọi chi nhánh (mật khẩu staff123).
 * Mỗi chi nhánh: 4 thu ngân, 19 phục vụ, 6 pha chế, 5 giao hàng, 3 thủ kho — đủ để tự xếp lịch
 * Ca sáng / Ca tối với tối đa 6 ca/tuần/người. Chỉ thêm phần còn thiếu, chạy lại nhiều lần không sao.
 * Thông tin cá nhân là dữ liệu mẫu (tên, SĐT, CCCD ngẫu nhiên — không phải người thật).
 */
const prisma = new PrismaClient();

const TARGET: Record<string, number> = { Cashier: 4, Waiter: 19, Kitchen: 6, Shipper: 5, Warehouse: 3 };
const PREFIX: Record<string, string> = { Cashier: "TN", Waiter: "NV", Kitchen: "PC", Shipper: "SP", Warehouse: "TK" };
/** [lương cơ bản thấp nhất, cao nhất] */
const SALARY: Record<string, [number, number]> = {
  Cashier: [6_500_000, 7_200_000],
  Waiter: [5_000_000, 5_600_000],
  Kitchen: [6_500_000, 7_800_000],
  Shipper: [4_500_000, 5_200_000],
  Warehouse: [6_500_000, 7_500_000],
};

const SURNAMES = ["Nguyễn", "Nguyễn", "Nguyễn", "Trần", "Trần", "Lê", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý", "Trương", "Đinh", "Lâm", "Mai", "Tô", "Châu"];
const MALE_MIDDLE = ["Văn", "Minh", "Quốc", "Hoàng", "Đức", "Thành", "Gia", "Tuấn", "Anh", "Hữu", "Nhật", "Thanh", "Công", "Trọng"];
const FEMALE_MIDDLE = ["Thị", "Ngọc", "Thanh", "Thu", "Bảo", "Khánh", "Mỹ", "Phương", "Hồng", "Kim", "Như", "Diệu", "Hoài", "Minh"];
const MALE_GIVEN = ["Huy", "Khang", "Phúc", "Nam", "Long", "Khoa", "Tài", "Trí", "Hiếu", "Quân", "Thịnh", "Duy", "Tùng", "Sơn", "Vinh", "Lộc", "Nhân", "Tín", "Kiệt", "Bình", "Hải", "Toàn", "Phát", "Thắng"];
const FEMALE_GIVEN = ["Linh", "Trang", "Ngân", "Vy", "Hân", "Thảo", "Nhi", "Yến", "Hương", "Uyên", "Trâm", "Mai", "Quỳnh", "Tiên", "My", "Như", "Châu", "Diễm", "Giang", "Hà", "Loan", "Thư", "Oanh", "Tâm"];

/** Địa chỉ ở TP.HCM: [đường, phường, quận] */
const ADDRESSES: [string, string, string][] = [
  ["Nguyễn Trãi", "Phường 2", "Quận 5"],
  ["Lê Văn Sỹ", "Phường 13", "Quận 3"],
  ["Cách Mạng Tháng 8", "Phường 7", "Quận Tân Bình"],
  ["Phan Văn Trị", "Phường 11", "Quận Bình Thạnh"],
  ["Quang Trung", "Phường 10", "Quận Gò Vấp"],
  ["Nguyễn Oanh", "Phường 17", "Quận Gò Vấp"],
  ["Lê Đức Thọ", "Phường 6", "Quận Gò Vấp"],
  ["Huỳnh Văn Bánh", "Phường 12", "Quận Phú Nhuận"],
  ["Phan Đăng Lưu", "Phường 3", "Quận Phú Nhuận"],
  ["Trường Chinh", "Phường 14", "Quận Tân Bình"],
  ["Âu Cơ", "Phường 9", "Quận Tân Bình"],
  ["Lũy Bán Bích", "Phường Tân Thới Hòa", "Quận Tân Phú"],
  ["Tân Kỳ Tân Quý", "Phường Sơn Kỳ", "Quận Tân Phú"],
  ["Võ Văn Ngân", "Phường Linh Chiểu", "TP. Thủ Đức"],
  ["Kha Vạn Cân", "Phường Linh Đông", "TP. Thủ Đức"],
  ["Nguyễn Văn Linh", "Phường Tân Phong", "Quận 7"],
  ["Huỳnh Tấn Phát", "Phường Tân Thuận Đông", "Quận 7"],
  ["Tôn Đản", "Phường 13", "Quận 4"],
  ["Hậu Giang", "Phường 11", "Quận 6"],
  ["Ba Tháng Hai", "Phường 12", "Quận 10"],
  ["Lạc Long Quân", "Phường 5", "Quận 11"],
  ["Nguyễn Thị Thập", "Phường Tân Hưng", "Quận 7"],
  ["Trần Xuân Soạn", "Phường Tân Kiểng", "Quận 7"],
  ["Lê Văn Việt", "Phường Hiệp Phú", "TP. Thủ Đức"],
  ["Tô Ký", "Phường Trung Mỹ Tây", "Quận 12"],
  ["Hà Huy Giáp", "Phường Thạnh Lộc", "Quận 12"],
  ["Bùi Viện", "Phường Phạm Ngũ Lão", "Quận 1"],
  ["Trần Hưng Đạo", "Phường Cầu Kho", "Quận 1"],
];
/** Mã tỉnh trên CCCD (nơi đăng ký khai sinh) */
const PROVINCES = ["079", "079", "079", "083", "089", "074", "075", "086", "087", "052", "049", "040", "082", "080", "084", "094", "070", "051"];
const PHONE_PREFIX = ["032", "033", "034", "035", "036", "037", "038", "039", "070", "076", "077", "078", "079", "081", "083", "084", "085", "086", "088", "089", "090", "091", "093", "094", "096", "097", "098"];

// Bộ sinh số ngẫu nhiên cố định hạt giống → chạy lại ra cùng kết quả
let seed = 20261020;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const digits = (n: number) => Array.from({ length: n }, () => between(0, 9)).join("");
const ascii = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");

async function main() {
  const passwordHash = await bcrypt.hash("staff123", 10);
  const stores = await prisma.store.findMany({ orderBy: { id: "asc" } });
  const existing = await prisma.staff.findMany({ select: { id: true, username: true, fullName: true, phone: true, cccd: true } });
  const usernames = new Set(existing.map((s) => s.username?.toLowerCase()).filter(Boolean));
  const names = new Set(existing.map((s) => s.fullName));
  const phones = new Set(existing.map((s) => s.phone).filter(Boolean));
  const cccds = new Set(existing.map((s) => s.cccd).filter(Boolean));
  let nextId = Math.max(0, ...existing.map((s) => s.id)) + 1;

  for (const store of stores) {
    for (const [role, target] of Object.entries(TARGET)) {
      const have = await prisma.staff.count({ where: { storeId: store.id, role, status: "Active" } });
      const rows = [];
      for (let i = have; i < target; i++) {
        // Giao hàng chủ yếu nam; phục vụ / thu ngân / pha chế chia đều
        const female = role === "Shipper" ? rand() < 0.1 : rand() < 0.55;
        let fullName = "";
        let given = "";
        do {
          given = pick(female ? FEMALE_GIVEN : MALE_GIVEN);
          fullName = `${pick(SURNAMES)} ${pick(female ? FEMALE_MIDDLE : MALE_MIDDLE)} ${given}`;
        } while (names.has(fullName));
        names.add(fullName);

        const base = `${PREFIX[role]}_${ascii(given)}`;
        let username = base;
        for (let n = 2; usernames.has(username.toLowerCase()); n++) username = `${base}${n}`;
        usernames.add(username.toLowerCase());

        const year = between(1996, 2006);
        const dob = new Date(Date.UTC(year, between(0, 11), between(1, 28)));
        let phone = "";
        do phone = pick(PHONE_PREFIX) + digits(7); while (phones.has(phone));
        phones.add(phone);
        // CCCD: mã tỉnh + giới tính/thế kỷ + 2 số cuối năm sinh + 6 số
        const genderDigit = (year >= 2000 ? 2 : 0) + (female ? 1 : 0);
        let cccd = "";
        do cccd = `${pick(PROVINCES)}${genderDigit}${String(year).slice(2)}${digits(6)}`; while (cccds.has(cccd));
        cccds.add(cccd);

        const [street, ward, district] = pick(ADDRESSES);
        const [lo, hi] = SALARY[role];
        rows.push({
          id: nextId++,
          username,
          passwordHash,
          fullName,
          phone,
          address: `${between(1, 499)}${rand() < 0.25 ? `/${between(1, 40)}` : ""} ${street}, ${ward}, ${district}, TP. Hồ Chí Minh`,
          dob,
          cccd,
          role,
          baseSalary: Math.round(between(lo, hi) / 100_000) * 100_000,
          allowance: between(4, 16) * 50_000,
          hireDate: new Date(Date.UTC(between(2023, 2026), between(0, 8), between(1, 28))),
          status: "Active",
          storeId: store.id,
        });
      }
      if (rows.length) await prisma.staff.createMany({ data: rows });
      console.log(`${store.name} · ${role}: có ${have}, thêm ${rows.length}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
