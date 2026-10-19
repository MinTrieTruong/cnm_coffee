import type { PrismaClient } from "@prisma/client";

/**
 * Chi nhánh phục vụ khách: theo bàn (quét QR) nếu có, ngược lại theo chi nhánh khách chọn.
 * Khách chưa chọn mà chuỗi chỉ có 1 chi nhánh hoạt động thì dùng chi nhánh đó;
 * `fallbackFirst` cho phép lấy chi nhánh đầu tiên thay vì báo lỗi (dùng cho chat).
 */
export async function resolveCustomerStore(
  prisma: PrismaClient,
  tableId: number | null | undefined,
  wanted: unknown,
  opts: { fallbackFirst?: boolean } = {},
): Promise<{ storeId: number } | { error: string }> {
  if (tableId) {
    const t = await prisma.cafeTable.findUnique({ where: { id: tableId }, select: { storeId: true } });
    return t ? { storeId: t.storeId } : { error: "Bàn không tồn tại." };
  }
  const sid = Number(wanted);
  if (Number.isInteger(sid) && sid > 0) {
    const s = await prisma.store.findFirst({ where: { id: sid, isActive: true }, select: { id: true } });
    return s ? { storeId: s.id } : { error: "Chi nhánh không tồn tại hoặc đã ngừng hoạt động." };
  }
  const active = await prisma.store.findMany({
    where: { isActive: true },
    select: { id: true },
    orderBy: { id: "asc" },
    take: 2,
  });
  if (active.length === 1 || (opts.fallbackFirst && active.length > 0)) return { storeId: active[0].id };
  return { error: "Vui lòng chọn chi nhánh." };
}
