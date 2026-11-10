import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Ghi audit log không block request chính (fire-and-forget).
 * Chi nhánh lấy theo nhân viên thực hiện (Owner → null).
 */
export function audit(
  staffId: number | null | undefined,
  action: string,
  target?: string,
  detail?: string
) {
  (async () => {
    const staff = staffId ? await prisma.staff.findUnique({ where: { id: staffId }, select: { storeId: true } }) : null;
    await prisma.auditLog.create({
      data: {
        staffId: staffId ?? null,
        storeId: staff?.storeId ?? null,
        action,
        target: target ?? null,
        detail: detail ?? null,
      },
    });
  })().catch(() => {}); // không throw lỗi audit vào request
}
