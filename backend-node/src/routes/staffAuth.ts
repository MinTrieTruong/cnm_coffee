import { Router } from "express";
import { readPrivateFacePhoto, saveDataUrlImage } from "../lib/uploadImage.js";
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

  /** Hồ sơ của chính nhân viên (trang "Tài khoản của tôi") — không trả lương, mật khẩu, dữ liệu khuôn mặt */
  const profileSelect = {
    id: true, username: true, fullName: true, avatarUrl: true, phone: true, address: true, dob: true, cccd: true,
    role: true, status: true, hireDate: true, faceRegisteredAt: true, facePhotoPath: true, faceDescriptor: true,
    store: { select: { name: true } },
  } as const;
  type ProfileRow = { faceDescriptor: string | null; facePhotoPath: string | null; [k: string]: unknown };
  const publicProfile = ({ faceDescriptor, facePhotoPath, ...rest }: ProfileRow) => ({ ...rest, faceRegistered: !!faceDescriptor, hasFacePhoto: !!facePhotoPath });

  r.get("/staff/me/profile", auth, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const row = await prisma.staff.findUnique({ where: { id: me.id }, select: profileSelect });
    if (!row) return res.status(404).json({ error: "Không tìm thấy tài khoản." });
    res.json(publicProfile(row));
  });

  /** Ảnh chụp lúc đăng ký FaceID của chính mình (tệp riêng tư, không nằm trong /uploads công khai) */
  r.get("/staff/me/face-photo", auth, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const row = await prisma.staff.findUnique({ where: { id: me.id }, select: { facePhotoPath: true } });
    const photo = row?.facePhotoPath ? await readPrivateFacePhoto(row.facePhotoPath) : null;
    if (!photo) return res.status(404).json({ error: "Chưa có ảnh." });
    res.setHeader("Cache-Control", "private, no-store");
    res.type(photo.type).send(photo.buf);
  });

  /**
   * Nhân viên tự cập nhật: ảnh đại diện, SĐT, địa chỉ, ngày sinh, CCCD (CCCD chỉ nhập khi còn trống).
   * Họ tên, vai trò, lương, trạng thái do quản lý sửa. Mỗi lần đổi ghi nhật ký (cũ → mới) vào hồ sơ nhân viên.
   */
  r.patch("/staff/me", auth, async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const b = req.body as { fullName?: string; phone?: string | null; address?: string | null; dob?: string | null; cccd?: string | null; avatarDataUrl?: string; removeAvatar?: boolean };
    if (b.fullName !== undefined && b.fullName.trim() !== staff.fullName) {
      return res.status(403).json({ error: "Họ tên do quản lý cập nhật (in trên phiếu lương)." });
    }
    const data: { phone?: string | null; address?: string | null; dob?: Date | null; cccd?: string; avatarUrl?: string | null } = {};
    const changes: string[] = [];
    const fmtDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "trống");

    // Ảnh đại diện (hiện cạnh tin nhắn nhân viên trong chat với khách, menu hồ sơ)
    if (b.avatarDataUrl?.startsWith("data:")) {
      try {
        data.avatarUrl = await saveDataUrlImage(b.avatarDataUrl);
      } catch {
        return res.status(400).json({ error: "Lỗi lưu ảnh đại diện." });
      }
      changes.push("Đổi ảnh đại diện");
    } else if (b.removeAvatar) {
      data.avatarUrl = null;
      changes.push("Xoá ảnh đại diện");
    }
    if (b.phone !== undefined) {
      const v = (b.phone ?? "").replace(/[\s.-]/g, "");
      if (v && !/^(0|\+84)\d{9,10}$/.test(v)) return res.status(400).json({ error: "Số điện thoại không hợp lệ." });
      if ((v || null) !== staff.phone) {
        data.phone = v || null;
        changes.push(`SĐT: ${staff.phone ?? "trống"} → ${v || "trống"}`);
      }
    }
    if (b.address !== undefined) {
      const v = (b.address ?? "").trim().slice(0, 255);
      if ((v || null) !== staff.address) {
        data.address = v || null;
        changes.push(`Địa chỉ: ${staff.address ?? "trống"} → ${v || "trống"}`);
      }
    }
    if (b.dob !== undefined) {
      const d = b.dob ? new Date(b.dob) : null;
      if (d && Number.isNaN(d.getTime())) return res.status(400).json({ error: "Ngày sinh không hợp lệ." });
      if (d) {
        const age = (Date.now() - d.getTime()) / (365.25 * 86_400_000);
        if (age < 16 || age > 80) return res.status(400).json({ error: "Ngày sinh không hợp lệ (16–80 tuổi)." });
      }
      if (fmtDate(d) !== fmtDate(staff.dob)) {
        data.dob = d;
        changes.push(`Ngày sinh: ${fmtDate(staff.dob)} → ${fmtDate(d)}`);
      }
    }
    if (b.cccd !== undefined && (b.cccd ?? "").trim() !== (staff.cccd ?? "")) {
      // CCCD: tự nhập lần đầu; đã có thì chỉ quản lý sửa
      if (staff.cccd) return res.status(403).json({ error: "CCCD đã lưu — liên hệ quản lý nếu cần sửa." });
      const v = (b.cccd ?? "").trim();
      if (!/^\d{12}$/.test(v)) return res.status(400).json({ error: "CCCD gồm đúng 12 chữ số." });
      if (await prisma.staff.findFirst({ where: { cccd: v, id: { not: staff.id } }, select: { id: true } })) {
        return res.status(409).json({ error: "CCCD này đã có trong hồ sơ nhân viên khác." });
      }
      data.cccd = v;
      changes.push(`Nhập CCCD ****${v.slice(-4)}`);
    }
    const updated = Object.keys(data).length
      ? await prisma.staff.update({ where: { id: staff.id }, data, select: profileSelect })
      : await prisma.staff.findUniqueOrThrow({ where: { id: staff.id }, select: profileSelect });
    if (changes.length) audit(staff.id, "STAFF_PROFILE_UPDATE", `Staff #${staff.id}`, `Tự cập nhật — ${changes.join("; ")}`.slice(0, 500));
    res.json(publicProfile(updated));
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
