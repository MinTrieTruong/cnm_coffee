import type { Request, Response, NextFunction } from "express";
import type { PrismaClient, Staff } from "@prisma/client";
import { verifyToken, type StaffPayload } from "../lib/jwt.js";

/**
 * `storeId`: chi nhánh request đang làm việc.
 * - Nhân viên: luôn là chi nhánh của mình.
 * - Owner: chi nhánh chọn qua header `X-Store-Id`, hoặc `null` = tất cả chi nhánh.
 */
export type StaffRequest = Request & { staffRow?: Staff; storeId?: number | null };

/** Owner (Chủ chuỗi) có mọi quyền của Admin, trên mọi chi nhánh. */
export function isOwner(role: string) {
  return role === "Owner";
}

export function isAdminLike(role: string) {
  return role === "Admin" || role === "Owner";
}

export function attachStaff(prisma: PrismaClient) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const h = req.headers.authorization;
    const token = h?.startsWith("Bearer ") ? h.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: "Cần đăng nhập nhân sự." });
    }
    let p: StaffPayload;
    try {
      p = verifyToken<StaffPayload>(token);
    } catch {
      return res.status(401).json({ error: "Token không hợp lệ." });
    }
    if (p.typ !== "staff") {
      return res.status(403).json({ error: "Không phải tài khoản nhân sự." });
    }
    const staffRow = await prisma.staff.findUnique({ where: { id: p.sub } });
    if (!staffRow || staffRow.status !== "Active") {
      return res.status(403).json({ error: "Tài khoản không hoạt động." });
    }

    let storeId: number | null;
    if (isOwner(staffRow.role)) {
      const raw = req.headers["x-store-id"];
      if (raw === undefined || raw === "" || raw === "all") {
        storeId = null;
      } else {
        const sid = Number(raw);
        const store = Number.isInteger(sid) ? await prisma.store.findUnique({ where: { id: sid } }) : null;
        if (!store) return res.status(400).json({ error: "Chi nhánh không tồn tại." });
        storeId = store.id;
      }
    } else {
      if (!staffRow.storeId) {
        return res.status(403).json({ error: "Tài khoản chưa được gán chi nhánh." });
      }
      storeId = staffRow.storeId;
    }

    (req as StaffRequest).staffRow = staffRow;
    (req as StaffRequest).storeId = storeId;
    next();
  };
}

export function requireRoles(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const row = (req as StaffRequest).staffRow;
    if (!row) return res.status(401).json({ error: "Chưa xác thực." });
    const ok = roles.includes(row.role) || (isOwner(row.role) && roles.includes("Admin"));
    if (!ok) {
      return res.status(403).json({ error: "Không đủ quyền thực hiện thao tác này." });
    }
    next();
  };
}

/** Route thao tác trên một chi nhánh cụ thể: Owner phải chọn chi nhánh trước. */
export function requireStore(req: Request, res: Response, next: NextFunction) {
  if ((req as StaffRequest).storeId == null) {
    return res.status(400).json({ error: "Hãy chọn chi nhánh trước khi thao tác." });
  }
  next();
}
