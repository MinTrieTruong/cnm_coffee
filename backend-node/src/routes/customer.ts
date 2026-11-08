import { Router } from "express";
import type { Request } from "express";
import type { PrismaClient } from "@prisma/client";
import { customerAuth } from "../middleware/customer.js";
import bcrypt from "bcryptjs";
import { saveDataUrlImage } from "../lib/uploadImage.js";
import { normalizeVnPhone } from "../lib/contactLinks.js";
import { getStoreSettings } from "../lib/pricing.js";
import { DS } from "../lib/delivery.js";
import { customerCancelDeadline, moneyToPoints, paidMoney } from "../lib/points.js";
import { logCustomerAuth } from "../lib/customerAccount.js";
import { getUsualItems, noteSuggestion, reorderLines } from "../lib/customerHabits.js";
import { storeFromQuery } from "../lib/storeProducts.js";

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
    if (phone) {
      const p = normalizeVnPhone(phone);
      if (!p) return res.status(400).json({ error: "Số điện thoại chưa đúng." });
      const taken = await prisma.customer.findFirst({ where: { phone: p, NOT: { id: customerId } }, select: { id: true } });
      if (taken) return res.status(409).json({ error: "Số điện thoại đã được tài khoản khác sử dụng." });
      dataToUpdate.phone = p;
    }
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
    const { passwordHash: _h, ...safe } = c;
    res.json(safe);
  });

  r.patch("/password", customerAuth, async (req, res) => {
    const customerId = (req as Request & { customerId?: number }).customerId!;
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Mật khẩu mới phải ≥ 6 ký tự." });
    }

    const c = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!c) return res.status(400).json({ error: "Không tìm thấy khách hàng." });

    // Khách tạo từ Google / Facebook chưa có mật khẩu → đặt lần đầu, không cần mật khẩu cũ
    if (c.passwordHash) {
      if (!currentPassword) return res.status(400).json({ error: "Nhập mật khẩu hiện tại." });
      const isValid = await bcrypt.compare(currentPassword, c.passwordHash);
      if (!isValid) return res.status(400).json({ error: "Mật khẩu hiện tại không đúng." });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.customer.update({
      where: { id: customerId },
      data: { passwordHash: hash },
    });
    if (!c.passwordHash) logCustomerAuth(prisma, req, customerId, "SET_PASSWORD", "PASSWORD");
    res.json({ ok: true });
  });

  /** Hộp thư: tin quán gửi (chăm sóc khách, tặng voucher, điều chỉnh điểm) */
  r.get("/messages", customerAuth, async (req, res) => {
    const customerId = (req as Request & { customerId?: number }).customerId!;
    const [rows, unread] = await Promise.all([
      prisma.customerMessage.findMany({
        where: { customerId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, kind: true, title: true, body: true, readAt: true, createdAt: true },
      }),
      prisma.customerMessage.count({ where: { customerId, readAt: null } }),
    ]);
    res.json({ unread, rows });
  });

  r.post("/messages/read", customerAuth, async (req, res) => {
    const customerId = (req as Request & { customerId?: number }).customerId!;
    await prisma.customerMessage.updateMany({ where: { customerId, readAt: null }, data: { readAt: new Date() } });
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

  /**
   * Món quen của khách tại chi nhánh `?store=` + ghi chú mặc định + gợi ý lưu ghi chú hay gõ
   * + đơn đã thanh toán gần nhất (để "Đặt lại"). Chỉ đọc dữ liệu của chính khách (theo token).
   */
  r.get("/usual", customerAuth, async (req, res) => {
    const customerId = (req as Request & { customerId?: number }).customerId!;
    const storeId = storeFromQuery(req.query.store);
    const [items, c, last] = await Promise.all([
      getUsualItems(prisma, customerId, { storeId, limit: 6 }),
      prisma.customer.findUnique({ where: { id: customerId }, select: { defaultNote: true } }),
      prisma.order.findFirst({ where: { customerId, status: "Paid" }, orderBy: [{ paidAt: "desc" }, { id: "desc" }], select: { id: true } }),
    ]);
    const savedNote = c?.defaultNote ?? null;
    res.json({
      items,
      savedNote,
      noteSuggestion: await noteSuggestion(prisma, customerId, savedNote),
      lastOrder: last ? await reorderLines(prisma, last.id, storeId) : null,
    });
  });

  /** Các dòng của 1 đơn đã thanh toán để "Đặt lại" (kèm cờ hết hàng / ngừng bán tại chi nhánh `?store=`) */
  r.get("/orders/:id/reorder", customerAuth, async (req, res) => {
    const customerId = (req as Request & { customerId?: number }).customerId!;
    const order = await prisma.order.findFirst({ where: { id: Number(req.params.id), customerId, status: "Paid" }, select: { id: true } });
    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn đã thanh toán." });
    res.json(await reorderLines(prisma, order.id, storeFromQuery(req.query.store)));
  });

  r.get("/default-note", customerAuth, async (req, res) => {
    const customerId = (req as Request & { customerId?: number }).customerId!;
    const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { defaultNote: true } });
    res.json({ defaultNote: c?.defaultNote ?? null });
  });

  /** Ghi chú mặc định cho mọi đơn (≤ 120 ký tự; rỗng = xoá) */
  r.put("/default-note", customerAuth, async (req, res) => {
    const customerId = (req as Request & { customerId?: number }).customerId!;
    const raw = (req.body as { note?: unknown }).note;
    if (raw != null && typeof raw !== "string") return res.status(400).json({ error: "Ghi chú không hợp lệ." });
    const note = (raw ?? "").replace(/\s+/g, " ").trim();
    if (note.length > 120) return res.status(400).json({ error: "Ghi chú tối đa 120 ký tự." });
    const c = await prisma.customer.update({ where: { id: customerId }, data: { defaultNote: note || null }, select: { defaultNote: true } });
    res.json({ defaultNote: c.defaultNote });
  });

  return r;
}
