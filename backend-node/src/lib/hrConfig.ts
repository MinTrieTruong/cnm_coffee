/**
 * lib/hrConfig.ts — Cấu hình ca làm, định biên & quy tắc chấm công (dùng chung toàn chuỗi).
 * Lần đầu chạy tự tạo mặc định: Ca sáng 07:00–15:00, Ca tối 14:00–22:00.
 */
import type { PrismaClient, ShiftTemplate, StaffingRule } from "@prisma/client";

/** Vị trí được xếp ca (khớp Staff.role) */
export const SHIFT_ROLES = ["Cashier", "Waiter", "Kitchen", "Shipper", "Warehouse"] as const;

const DEFAULT_TEMPLATES = [
  {
    code: "SANG", name: "Ca sáng", startMin: 7 * 60, endMin: 15 * 60, color: "#d97706", sortOrder: 1,
    staffing: { Cashier: [1, 1], Waiter: [5, 6], Kitchen: [1, 2], Shipper: [1, 2], Warehouse: [1, 1] },
  },
  {
    code: "TOI", name: "Ca tối", startMin: 14 * 60, endMin: 22 * 60, color: "#4f46e5", sortOrder: 2,
    staffing: { Cashier: [1, 1], Waiter: [8, 9], Kitchen: [2, 3], Shipper: [2, 2], Warehouse: [1, 1] },
  },
];

export type TemplateWithStaffing = ShiftTemplate & { staffing: StaffingRule[] };

export async function getHrConfig(prisma: PrismaClient) {
  return (
    (await prisma.hrConfig.findUnique({ where: { id: 1 } })) ??
    (await prisma.hrConfig.create({ data: { id: 1 } }))
  );
}

/** Mẫu ca (kèm định biên). `activeOnly` = chỉ ca đang dùng */
export async function getShiftTemplates(prisma: PrismaClient, activeOnly = false): Promise<TemplateWithStaffing[]> {
  if ((await prisma.shiftTemplate.count()) === 0) {
    for (const t of DEFAULT_TEMPLATES) {
      await prisma.shiftTemplate.create({
        data: {
          code: t.code, name: t.name, startMin: t.startMin, endMin: t.endMin, color: t.color, sortOrder: t.sortOrder,
          staffing: {
            create: Object.entries(t.staffing).map(([role, [weekdayCount, weekendCount]]) => ({ role, weekdayCount, weekendCount })),
          },
        },
      });
    }
  }
  // Vị trí mới thêm sau (VD Thủ kho) chưa có dòng định biên → lấy số mặc định.
  // Dòng đã có (kể cả Chủ chuỗi đặt 0) thì giữ nguyên.
  for (const t of DEFAULT_TEMPLATES) {
    const tpl = await prisma.shiftTemplate.findUnique({ where: { code: t.code }, include: { staffing: true } });
    if (!tpl) continue;
    const missing = Object.entries(t.staffing).filter(([role]) => !tpl.staffing.some((r) => r.role === role));
    if (missing.length) {
      await prisma.staffingRule.createMany({
        data: missing.map(([role, [weekdayCount, weekendCount]]) => ({ shiftTemplateId: tpl.id, role, weekdayCount, weekendCount })),
        skipDuplicates: true,
      });
    }
  }
  return prisma.shiftTemplate.findMany({
    where: activeOnly ? { isActive: true } : {},
    include: { staffing: true },
    orderBy: [{ sortOrder: "asc" }, { startMin: "asc" }],
  });
}

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Dạng gọn trả cho frontend (thay cho SHIFT_DEFS cố định trước đây) */
export function shiftDefsOf(templates: ShiftTemplate[]) {
  return templates.map((t) => ({
    code: t.code,
    name: t.name,
    label: `${hhmm(t.startMin)} – ${hhmm(t.endMin)}`,
    startMin: t.startMin,
    endMin: t.endMin,
    hours: Math.round(((t.endMin - t.startMin) / 60) * 10) / 10,
    color: t.color,
    isActive: t.isActive,
  }));
}

/** Mã ca từ tên: "Ca sáng" → "CASANG" (không dấu, ≤ 10 ký tự, không trùng) */
export function codeFromName(name: string, taken: Set<string>) {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/gi, "D")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .slice(0, 8) || "CA";
  let code = base;
  for (let i = 2; taken.has(code); i++) code = `${base.slice(0, 8)}${i}`;
  return code;
}
