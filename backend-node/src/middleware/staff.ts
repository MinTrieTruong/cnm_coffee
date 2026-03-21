import type { Request, Response, NextFunction } from "express";
import type { PrismaClient, Staff } from "@prisma/client";
import { verifyToken, type StaffPayload } from "../lib/jwt.js";

export type StaffRequest = Request & { staffRow?: Staff };

export function attachStaff(prisma: PrismaClient) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const h = req.headers.authorization;
    const token = h?.startsWith("Bearer ") ? h.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: "Cần đăng nhập nhân sự." });
    }
    try {
      const p = verifyToken<StaffPayload>(token);
      if (p.typ !== "staff") {
        return res.status(403).json({ error: "Không phải tài khoản nhân sự." });
      }
      const staffRow = await prisma.staff.findUnique({ where: { id: p.sub } });
      if (!staffRow || staffRow.status !== "Active") {
        return res.status(403).json({ error: "Tài khoản không hoạt động." });
      }
      (req as StaffRequest).staffRow = staffRow;
      next();
    } catch {
      return res.status(401).json({ error: "Token không hợp lệ." });
    }
  };
}

export function requireRoles(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const row = (req as StaffRequest).staffRow;
    if (!row) return res.status(401).json({ error: "Chưa xác thực." });
    if (!roles.includes(row.role)) {
      return res.status(403).json({ error: "Không đủ quyền thực hiện thao tác này." });
    }
    next();
  };
}
