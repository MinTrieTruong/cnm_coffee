import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { attachStaff, requireRoles } from "../middleware/staff.js";
import { storeWhere } from "../lib/storeScope.js";

const prisma = new PrismaClient();

export function auditRouter() {
  const r = Router();
  const auth = attachStaff(prisma);
  const admin = [auth, requireRoles("Admin")];

  /**
   * GET /api/admin/audit-logs?page=1&limit=50&staffId=&action=&date=YYYY-MM-DD
   */
  r.get("/audit-logs", ...admin, async (req, res) => {
    const page  = Math.max(1, Number(req.query.page)  || 1);
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const skip  = (page - 1) * limit;
    const staffId = req.query.staffId ? Number(req.query.staffId) : undefined;
    const action  = req.query.action  as string | undefined;
    const dateStr = req.query.date    as string | undefined;

    const where: Record<string, unknown> = { ...storeWhere(req) };
    if (staffId)  where.staffId = staffId;
    if (action)   where.action  = { contains: action };
    if (dateStr) {
      const d = new Date(dateStr);
      const s = new Date(d); s.setHours(0, 0, 0, 0);
      const e = new Date(d); e.setHours(23, 59, 59, 999);
      where.createdAt = { gte: s, lte: e };
    }

    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          staff: { select: { fullName: true, username: true, role: true } },
          store: { select: { name: true } },
        },
      }),
    ]);

    res.json({ total, page, limit, rows });
  });

  return r;
}
