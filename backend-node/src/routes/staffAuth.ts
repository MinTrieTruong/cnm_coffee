import { Router } from "express";
import { saveDataUrlImage } from "../lib/uploadImage.js";
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
    const staff = await prisma.staff.findFirst({ where: { username: username.trim() }, include: { store: true } });
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
        storeId: staff.storeId,
        storeName: staff.store?.name ?? null,
        avatarUrl: staff.avatarUrl,
      },
    });
  });

  /**
   * Danh sách đồng nghiệp (tên/vai trò) để chọn người đổi ca. Cần đăng nhập nhân sự;
   * nhân viên chỉ thấy chi nhánh mình, Chủ chuỗi lọc bằng `?store=` (hoặc chi nhánh đang chọn).
   */
  r.get("/staff/members", auth, async (req, res) => {
    const sr = req as StaffRequest;
    const asked = Number(req.query.store);
    const storeId = sr.staffRow!.role === "Owner" ? (Number.isInteger(asked) && asked > 0 ? asked : sr.storeId) : sr.storeId;
    const rows = await prisma.staff.findMany({
      where: { status: "Active", ...(storeId != null ? { storeId } : {}) },
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
      select: { id: true, fullName: true, role: true },
    });
    res.json(rows);
  });

  /**
   * Nhân viên tự cập nhật thông tin cá nhân (không sửa role/status).
   */
  r.patch("/staff/me", auth, async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const { fullName, phone, avatarDataUrl, removeAvatar } = req.body as { fullName?: string; phone?: string; avatarDataUrl?: string; removeAvatar?: boolean };
    const data: { fullName?: string; phone?: string | null; avatarUrl?: string | null } = {};
    // Ảnh đại diện (hiện cạnh tin nhắn nhân viên trong chat với khách)
    if (avatarDataUrl?.startsWith("data:")) {
      try {
        data.avatarUrl = await saveDataUrlImage(avatarDataUrl);
      } catch {
        return res.status(400).json({ error: "Lỗi lưu ảnh đại diện." });
      }
    } else if (removeAvatar) data.avatarUrl = null;
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
        avatarUrl: true,
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
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Mật khẩu mới phải từ 6 ký tự." });
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
