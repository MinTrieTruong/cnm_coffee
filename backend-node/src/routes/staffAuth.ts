import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { signStaffToken } from "../lib/jwt.js";
import { attachStaff, type StaffRequest } from "../middleware/staff.js";
import { audit } from "../lib/audit.js";

export function staffAuthRouter(prisma: PrismaClient) {
  const r = Router();
  const auth = attachStaff(prisma);

  r.post("/staff/login", async (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username?.trim() || !password) {
      return res.status(400).json({ error: "Thiếu tên đăng nhập hoặc mật khẩu." });
    }
    const staff = await prisma.staff.findFirst({ where: { username: username.trim() } });
    if (!staff || staff.status !== "Active") {
      return res.status(401).json({ error: "Sai thông tin đăng nhập hoặc tài khoản đã khóa." });
    }
    if (!staff.passwordHash || !(await bcrypt.compare(password, staff.passwordHash))) {
      return res.status(401).json({ error: "Sai thông tin đăng nhập." });
    }
    const token = signStaffToken(staff.id, staff.role);
    return res.json({
      token,
      staff: {
        id: staff.id,
        username: staff.username,
        fullName: staff.fullName,
        role: staff.role,
      },
    });
  });

  /** Public — chỉ trả tên/role để hiển thị danh sách chọn nhân viên trên trang login */
  r.get("/staff/members", async (_req, res) => {
    const rows = await prisma.staff.findMany({
      where: { status: "Active" },
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
      select: { id: true, fullName: true, role: true, username: true },
    });
    res.json(rows);
  });

  /**
   * Nhân viên tự cập nhật thông tin cá nhân (không sửa role/status).
   */
  r.patch("/staff/me", auth, async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const { fullName, phone } = req.body as { fullName?: string; phone?: string };
    const data: { fullName?: string; phone?: string | null } = {};
    if (fullName !== undefined) {
      const clean = fullName.trim();
      if (!clean) return res.status(400).json({ error: "Họ tên không hợp lệ." });
      data.fullName = clean;
    }
    if (phone !== undefined) {
      data.phone = phone.trim() || null;
    }
    const updated = await prisma.staff.update({
      where: { id: staff.id },
      data,
      select: {
        id: true,
        username: true,
        fullName: true,
        phone: true,
        role: true,
        status: true,
        hireDate: true,
      },
    });
    audit(staff.id, "STAFF_PROFILE_UPDATE", `Staff #${staff.id}`, "Cập nhật thông tin cá nhân");
    res.json(updated);
  });

  /**
   * Nhân viên tự đổi mật khẩu bằng mật khẩu hiện tại.
   */
  r.post("/staff/me/change-password", auth, async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Thiếu mật khẩu hiện tại hoặc mật khẩu mới." });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ error: "Mật khẩu mới phải từ 4 ký tự." });
    }
    if (!staff.passwordHash || !(await bcrypt.compare(currentPassword, staff.passwordHash))) {
      return res.status(401).json({ error: "Mật khẩu hiện tại không đúng." });
    }
    const nextHash = await bcrypt.hash(newPassword, 10);
    await prisma.staff.update({
      where: { id: staff.id },
      data: { passwordHash: nextHash },
    });
    audit(staff.id, "STAFF_PASSWORD_CHANGE", `Staff #${staff.id}`);
    res.json({ ok: true });
  });

  return r;
}
