import { Router } from "express";
import type { Request } from "express";
import type { PrismaClient } from "@prisma/client";
import { customerAuth } from "../middleware/customer.js";
import bcrypt from "bcryptjs";
import { saveDataUrlImage } from "../lib/uploadImage.js";
import { getStoreSettings } from "../lib/pricing.js";
import { DS } from "../lib/delivery.js";
import { customerCancelDeadline, moneyToPoints, paidMoney } from "../lib/points.js";

export function customerRouter(prisma: PrismaClient) {
  const r = Router();

  r.patch("/profile", customerAuth, async (req, res) => {
    const customerId = (req as Request & { customerId?: number }).customerId!;
    const { fullName, phone, email, address, dob, gender, avatarDataUrl } = req.body as {
      fullName?: string;
      phone?: string;
      email?: string;
      address?: string;
      dob?: string;
      gender?: string;
      avatarDataUrl?: string;
    };

    const dataToUpdate: any = {};
    if (fullName) dataToUpdate.fullName = fullName.trim();
    if (phone) dataToUpdate.phone = phone.trim();
    if (email !== undefined) dataToUpdate.email = email?.trim() || null;
    if (address !== undefined) dataToUpdate.address = address?.trim() || null;
    if (dob) dataToUpdate.dob = new Date(dob);
    if (gender !== undefined) dataToUpdate.gender = gender;

    if (avatarDataUrl && avatarDataUrl.startsWith("data:")) {
      try {
        const url = await saveDataUrlImage(avatarDataUrl);
        dataToUpdate.avatarUrl = url;
      } catch (e) {
        return res.status(400).json({ error: "Lỗi lưu ảnh đại diện." });
      }
    }

    const c = await prisma.customer.update({
      where: { id: customerId },
      data: dataToUpdate,
    });
    res.json(c);
  });

  r.patch("/password", customerAuth, async (req, res) => {
    const customerId = (req as Request & { customerId?: number }).customerId!;
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Mật khẩu mới phải ≥ 6 ký tự." });
    }

    const c = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!c || !c.passwordHash) return res.status(400).json({ error: "Không tìm thấy khách hàng." });

    const isValid = await bcrypt.compare(currentPassword, c.passwordHash);
    if (!isValid) return res.status(400).json({ error: "Mật khẩu hiện tại không đúng." });

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.customer.update({
      where: { id: customerId },
      data: { passwordHash: hash },
    });
    res.json({ ok: true });
  });

  r.get("/orders", customerAuth, async (req, res) => {
    const customerId = (req as Request & { customerId?: number }).customerId!;
    const { type } = req.query; // "all", "online"
    
    const whereClause: any = { customerId };
    if (type === "online") {
      whereClause.orderType = { in: ["Delivery", "Takeaway"] };
    }

    const orders = await prisma.order.findMany({
      where: whereClause,
      include: {
        details: { include: { product: true } },
        payments: { select: { method: true, amount: true } },
      },
      orderBy: { id: "desc" },
    });

    // Đơn giao hàng đã trả: hạn tự hủy + số điểm sẽ nhận lại nếu hủy
    const settings = await getStoreSettings(prisma);
    res.json(
      orders.map(({ payments, ...o }) => {
        const deadline = o.deliveryStatus === DS.AwaitingConfirm ? customerCancelDeadline(o, settings.cancelWindowMinutes) : null;
        const open = deadline != null && deadline.getTime() > Date.now();
        return {
          ...o,
          cancelUntil: open ? deadline.toISOString() : null,
          refundPreview: open ? moneyToPoints(paidMoney(payments), settings.pointValueVnd) + o.pointsUsed - o.pointsEarned : null,
        };
      }),
    );
  });

  /** Lịch sử biến động điểm */
  r.get("/points-history", customerAuth, async (req, res) => {
    const customerId = (req as Request & { customerId?: number }).customerId!;
    const rows = await prisma.pointTransaction.findMany({
      where: { customerId },
      orderBy: { id: "desc" },
      take: 100,
    });
    res.json(rows);
  });

  r.get("/summary", customerAuth, async (req, res) => {
    const customerId = (req as Request & { customerId?: number }).customerId!;
    
    const agg = await prisma.order.aggregate({
      where: { customerId, status: "Paid" },
      _sum: { totalAmount: true },
      _count: { id: true },
    });

    res.json({
      totalSpent: agg._sum.totalAmount || 0,
      totalOrders: agg._count.id || 0,
    });
  });

  return r;
}
