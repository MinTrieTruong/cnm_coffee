import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { signStaffToken } from "../lib/jwt.js";

export function staffAuthRouter(prisma: PrismaClient) {
  const r = Router();

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

  return r;
}
