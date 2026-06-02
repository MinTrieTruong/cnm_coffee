import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Ghi audit log không block request chính (fire-and-forget)
 */
export function audit(
  staffId: number | null | undefined,
  action: string,
  target?: string,
  detail?: string
) {
  prisma.auditLog
    .create({
      data: {
        staffId: staffId ?? null,
        action,
        target: target ?? null,
        detail: detail ?? null,
      },
    })
    .catch(() => {}); // không throw lỗi audit vào request
}
