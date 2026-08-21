import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { attachStaff, requireRoles, type StaffRequest } from "../middleware/staff.js";
import { saveDataUrlImage } from "../lib/uploadImage.js";
import { audit } from "../lib/audit.js";

export function adminRouter(prisma: PrismaClient) {
  const r = Router();
  const auth = attachStaff(prisma);
  const admin = [auth, requireRoles("Admin")];
  const isMissingColumn = (e: unknown, colName: string) =>
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2022" && String(e.meta?.column).includes(colName);
  const rolePrefix = (role: string) => {
    if (role === "Waiter") return "NVB";
    if (role === "Kitchen") return "PC";
    if (role === "Cashier") return "TN";
    return "QL";
  };
  const toSlug = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "staff";
  const makeUsername = async (role: string, fullName: string) => {
    const base = `${rolePrefix(role)}_${toSlug(fullName)}`;
    let candidate = base;
    let i = 1;
    while (await prisma.staff.findFirst({ where: { username: candidate } })) {
      i += 1;
      candidate = `${base}_${i}`;
    }
    return candidate;
  };

  r.get("/stats", ...admin, async (_req, res) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [
      todayOrders,
      todayRev,
      weekOrders,
      weekRev,
      monthOrders,
      monthRev,
      products,
      tables,
      staff,
      pendingReq,
    ] = await Promise.all([
      prisma.order.count({ where: { status: "Paid", createdAt: { gte: start } } }),
      prisma.order.aggregate({
        where: { status: "Paid", createdAt: { gte: start } },
        _sum: { totalAmount: true },
      }),
      prisma.order.count({ where: { status: "Paid", createdAt: { gte: weekAgo } } }),
      prisma.order.aggregate({
        where: { status: "Paid", createdAt: { gte: weekAgo } },
        _sum: { totalAmount: true },
      }),
      prisma.order.count({ where: { status: "Paid", createdAt: { gte: monthStart } } }),
      prisma.order.aggregate({
        where: { status: "Paid", createdAt: { gte: monthStart } },
        _sum: { totalAmount: true },
      }),
      prisma.product.count(),
      prisma.cafeTable.count(),
      prisma.staff.count({ where: { status: "Active" } }),
      prisma.inventoryRequest.count({ where: { status: "Pending" } }),
    ]);
    res.json({
      todayOrders,
      todayRevenue: todayRev._sum.totalAmount ?? 0,
      weekOrders,
      weekRevenue: weekRev._sum.totalAmount ?? 0,
      monthOrders,
      monthRevenue: monthRev._sum.totalAmount ?? 0,
      products,
      tables,
      staff,
      pendingRequests: pendingReq,
    });
  });

  r.get("/products", ...admin, async (_req, res) => {
    const rows = await prisma.product.findMany({
      include: { category: true },
      orderBy: [{ categoryId: "asc" }, { id: "asc" }],
    });
    res.json(rows);
  });

  r.post("/products", ...admin, async (req, res) => {
    const b = req.body as {
      categoryId?: number;
      name?: string;
      sku?: string;
      costPrice?: number;
      sellPrice?: number;
      imageUrl?: string;
      isActive?: boolean;
    };
    if (!b.name || typeof b.sellPrice !== "number" || !b.categoryId) {
      return res.status(400).json({ error: "Thiếu tên, giá bán hoặc danh mục." });
    }
    const maxId = (await prisma.product.aggregate({ _max: { id: true } }))._max.id ?? 0;
    const p = await prisma.product.create({
      data: {
        id: maxId + 1,
        categoryId: b.categoryId,
        sku: b.sku ?? `SKU-${maxId + 1}`,
        name: b.name,
        costPrice: b.costPrice ?? 0,
        sellPrice: b.sellPrice,
        isActive: b.isActive ?? true,
        outOfStock: false,
        imageUrl: b.imageUrl ?? null,
      },
    });
    res.status(201).json(p);
  });

  r.patch("/products/:id", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body as Partial<{
      name: string;
      sku: string;
      costPrice: number;
      sellPrice: number;
      imageUrl: string | null;
      isActive: boolean;
      outOfStock: boolean;
      categoryId: number;
    }>;
    const p = await prisma.product.update({ where: { id }, data: b });
    res.json(p);
  });

  r.get("/categories", ...admin, async (_req, res) => {
    res.json(await prisma.category.findMany({ orderBy: { sortOrder: "asc" } }));
  });

  r.post("/categories", ...admin, async (req, res) => {
    const { name, sortOrder } = req.body as { name?: string; sortOrder?: number };
    if (!name?.trim()) return res.status(400).json({ error: "Thiếu tên" });
    const maxId = (await prisma.category.aggregate({ _max: { id: true } }))._max.id ?? 0;
    const c = await prisma.category.create({
      data: { id: maxId + 1, name: name.trim(), sortOrder: sortOrder ?? maxId + 1 },
    });
    res.status(201).json(c);
  });

  r.patch("/categories/:id", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body as { name?: string; sortOrder?: number };
    res.json(await prisma.category.update({ where: { id }, data: b }));
  });

  r.delete("/categories/:id", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const cnt = await prisma.product.count({ where: { categoryId: id } });
    if (cnt > 0) {
      return res.status(400).json({
        error: `Danh mục còn ${cnt} món. Hãy xóa hoặc chuyển món sang danh mục khác trước.`,
      });
    }
    await prisma.category.delete({ where: { id } });
    res.status(204).send();
  });

  r.patch("/staff/:id/reset-face", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const staff = await prisma.staff.findUnique({ where: { id } });
    if (!staff) return res.status(404).json({ error: "Không tìm thấy nhân viên." });
    
    await prisma.staff.update({
      where: { id },
      data: { faceDescriptor: null },
    });
    res.json({ message: "Đã xóa dữ liệu khuôn mặt" });
  });

  r.post("/upload-image", ...admin, async (req, res) => {
    try {
      const { dataUrl } = req.body as { dataUrl?: string };
      if (!dataUrl?.startsWith("data:")) {
        return res.status(400).json({ error: "Thiếu dataUrl (ảnh base64)." });
      }
      const url = await saveDataUrlImage(dataUrl);
      res.json({ url });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Không lưu được ảnh." });
    }
  });

  r.get("/staff", ...admin, async (_req, res) => {
    const rows = await prisma.staff.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        username: true,
        fullName: true,
        phone: true,
        address: true,
        dob: true,
        role: true,
        status: true,
        hireDate: true,
        baseSalary: true,
        faceDescriptor: true,
      },
    });
    res.json(rows.map(r => ({ ...r, hasFaceData: !!r.faceDescriptor, faceDescriptor: undefined })));
  });

  r.post("/staff", ...admin, async (req, res) => {
    const b = req.body as {
      username?: string;
      password?: string;
      fullName?: string;
      role?: string;
      phone?: string;
      address?: string;
      dob?: string;
      hireDate?: string;
      status?: string;
      imageUrl?: string;
    };
    if (!b.password || b.password.length < 4 || !b.fullName?.trim() || !b.role) {
      return res.status(400).json({ error: "Thiếu mật khẩu, họ tên hoặc role." });
    }
    const normalizedName = b.fullName.trim();
    const desiredUsername = b.username?.trim();
    const username = desiredUsername || (await makeUsername(b.role, normalizedName));
    const exists = await prisma.staff.findFirst({ where: { username } });
    if (exists) return res.status(409).json({ error: "Username đã tồn tại." });
    const maxId = (await prisma.staff.aggregate({ _max: { id: true } }))._max.id ?? 0;
    const hash = await bcrypt.hash(b.password, 10);
    const hireDate = b.hireDate ? new Date(b.hireDate) : new Date();
    const dob = b.dob ? new Date(b.dob) : null;
    const s = await prisma.staff.create({
      data: {
        id: maxId + 1,
        username,
        passwordHash: hash,
        fullName: normalizedName,
        phone: b.phone?.trim() ?? null,
        address: b.address?.trim() ?? null,
        dob: dob && !Number.isNaN(dob.getTime()) ? dob : null,
        role: b.role,
        imageUrl: b.imageUrl?.trim() || null,
        hireDate: Number.isNaN(hireDate.getTime()) ? new Date() : hireDate,
        status: b.status === "Inactive" ? "Inactive" : "Active",
      },
    });
    const actor = (req as StaffRequest).staffRow!;
    audit(actor.id, "STAFF_CREATE", `Staff #${s.id}`, `${s.username} (${s.role})`);
    res.status(201).json({
      id: s.id,
      username: s.username,
      fullName: s.fullName,
      role: s.role,
      status: s.status,
    });
  });

  r.patch("/staff/:id", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const actor = (req as StaffRequest).staffRow!;
    const b = req.body as {
      fullName?: string;
      role?: string;
      status?: string;
      password?: string;
      phone?: string;
      address?: string;
      dob?: string;
      hireDate?: string;
      imageUrl?: string;
    };
    const data: Record<string, unknown> = { ...b };
    if (b.password) {
      data.passwordHash = await bcrypt.hash(b.password, 10);
      delete data.password;
    }
    if (b.hireDate !== undefined) {
      const parsed = new Date(b.hireDate);
      if (Number.isNaN(parsed.getTime())) return res.status(400).json({ error: "hireDate không hợp lệ." });
      data.hireDate = parsed;
    }
    if (b.dob !== undefined) {
      const parsedDob = b.dob ? new Date(b.dob) : null;
      if (parsedDob && Number.isNaN(parsedDob.getTime())) return res.status(400).json({ error: "dob không hợp lệ." });
      data.dob = parsedDob;
    }
    if (b.imageUrl !== undefined) {
      data.imageUrl = b.imageUrl.trim() || null;
    }
    const updated = await prisma.staff.update({ where: { id }, data });
    audit(actor.id, "STAFF_UPDATE", `Staff #${id}`, `${updated.username ?? updated.fullName}`);
    res.json(updated);
  });

  r.delete("/staff/:id", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const actor = (req as StaffRequest).staffRow!;
    if (actor.id === id) return res.status(400).json({ error: "Không thể tự xóa chính mình." });
    const row = await prisma.staff.update({
      where: { id },
      data: { status: "Inactive" },
    });
    audit(actor.id, "STAFF_DEACTIVATE", `Staff #${id}`, row.username ?? row.fullName);
    res.json({ ok: true });
  });

  r.get("/customers", ...admin, async (_req, res) => {
    const rows = await prisma.customer.findMany({
      orderBy: { id: "desc" },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        address: true,
        dob: true,
        points: true,
        rankTier: true,
        createdAt: true,
        lastLogin: true,
      },
    });
    res.json(rows);
  });

  r.patch("/customers/:id", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const actor = (req as StaffRequest).staffRow!;
    const b = req.body as Partial<{
      fullName: string;
      phone: string;
      email: string;
      address: string;
      dob: string;
      points: number;
      rankTier: string;
    }>;
    const data: Record<string, unknown> = {};
    if (b.fullName !== undefined) data.fullName = b.fullName.trim();
    if (b.phone !== undefined) data.phone = b.phone.trim() || null;
    if (b.email !== undefined) data.email = b.email.trim() || null;
    if (b.address !== undefined) data.address = b.address.trim() || null;
    if (b.rankTier !== undefined) data.rankTier = b.rankTier.trim() || "Dong";
    if (b.points !== undefined) data.points = Number(b.points) || 0;
    if (b.dob !== undefined) {
      const parsed = b.dob ? new Date(b.dob) : null;
      if (parsed && Number.isNaN(parsed.getTime())) return res.status(400).json({ error: "dob không hợp lệ." });
      data.dob = parsed;
    }
    const updated = await prisma.customer.update({ where: { id }, data });
    audit(actor.id, "CUSTOMER_UPDATE", `Customer #${id}`, updated.fullName);
    res.json(updated);
  });

  r.post("/customers/:id/reset-password", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const actor = (req as StaffRequest).staffRow!;
    const { newPassword } = req.body as { newPassword?: string };
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Mật khẩu mới tối thiểu 6 ký tự." });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.customer.update({
      where: { id },
      data: { passwordHash: hash },
    });
    audit(actor.id, "CUSTOMER_PASSWORD_RESET", `Customer #${id}`);
    res.json({ ok: true });
  });

  r.get("/tables", ...admin, async (_req, res) => {
    res.json(await prisma.cafeTable.findMany({ orderBy: { id: "asc" } }));
  });

  r.post("/tables", ...admin, async (req, res) => {
    const b = req.body as { name?: string; location?: string; capacity?: number; qrCode?: string };
    if (!b.name?.trim()) return res.status(400).json({ error: "Thiếu tên bàn" });
    const maxId = (await prisma.cafeTable.aggregate({ _max: { id: true } }))._max.id ?? 0;
    const id = maxId + 1;
    const qr = b.qrCode ?? `${process.env.PUBLIC_APP_URL ?? "http://localhost:5173"}/?idtable=${id}`;
    const t = await prisma.cafeTable.create({
      data: {
        id,
        name: b.name.trim(),
        location: b.location ?? null,
        capacity: b.capacity ?? 4,
        qrCode: qr,
        status: "Empty",
      },
    });
    res.status(201).json(t);
  });

  r.patch("/tables/:id", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body as { name?: string; location?: string; capacity?: number; status?: string; qrCode?: string };
    res.json(await prisma.cafeTable.update({ where: { id }, data: b }));
  });

  r.get("/inventory", ...admin, async (_req, res) => {
    try {
      res.json(await prisma.inventoryItem.findMany({ orderBy: { id: "asc" } }));
    } catch (e) {
      if (isMissingColumn(e, "Inventory.Image_URL")) {
        return res.status(500).json({
          error: "CSDL kho chưa đồng bộ cột ảnh. Chạy: cd backend-node && npx prisma db push",
        });
      }
      throw e;
    }
  });

  r.post("/inventory", ...admin, async (req, res) => {
    const b = req.body as {
      name?: string;
      skuCode?: string | null;
      unit?: string | null;
      stockQty?: number;
      minLevel?: number;
      supplier?: string | null;
      imageUrl?: string | null;
    };
    if (!b.name?.trim()) return res.status(400).json({ error: "Thiếu tên nguyên liệu." });
    const maxId = (await prisma.inventoryItem.aggregate({ _max: { id: true } }))._max.id ?? 0;
    const row = await prisma.inventoryItem.create({
      data: {
        id: maxId + 1,
        name: b.name.trim(),
        skuCode: b.skuCode?.trim() || null,
        unit: b.unit?.trim() || null,
        stockQty: typeof b.stockQty === "number" ? b.stockQty : 0,
        minLevel: typeof b.minLevel === "number" ? b.minLevel : 0,
        supplier: b.supplier?.trim() || null,
        imageUrl: b.imageUrl ?? null,
      },
    });
    res.status(201).json(row);
  });

  r.patch("/inventory/:id", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body as Partial<{
      stockQty: number;
      minLevel: number;
      name: string;
      skuCode: string | null;
      unit: string | null;
      supplier: string | null;
      imageUrl: string | null;
    }>;
    res.json(await prisma.inventoryItem.update({ where: { id }, data: b }));
  });

  r.delete("/inventory/:id", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    await prisma.inventoryRequest.deleteMany({ where: { itemId: id } });
    await prisma.inventoryItem.delete({ where: { id } });
    res.status(204).send();
  });

  r.post("/inventory/:id/receive", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const { qty } = req.body as { qty?: number };
    if (typeof qty !== "number" || qty <= 0) return res.status(400).json({ error: "Số lượng không hợp lệ" });
    const item = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ error: "Không tìm thấy" });
    const updated = await prisma.inventoryItem.update({
      where: { id },
      data: { stockQty: item.stockQty + qty },
    });
    res.json(updated);
  });

  r.get("/requests", ...admin, async (_req, res) => {
    const rows = await prisma.inventoryRequest.findMany({
      orderBy: { id: "desc" },
      include: { item: true, staff: { select: { fullName: true, id: true } }, approvedBy: { select: { fullName: true } } },
    });
    res.json(rows);
  });

  r.patch("/requests/:id", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const staff = (req as StaffRequest).staffRow!;
    const b = req.body as { status?: string; note?: string };
    if (!b.status || !["Approved", "Rejected"].includes(b.status)) {
      return res.status(400).json({ error: "status phải Approved hoặc Rejected" });
    }
    const reqRow = await prisma.inventoryRequest.findUnique({ where: { id } });
    if (!reqRow || reqRow.status !== "Pending") return res.status(400).json({ error: "Phiếu không hợp lệ" });
    const updated = await prisma.inventoryRequest.update({
      where: { id },
      data: {
        status: b.status,
        approvedById: staff.id,
        approvedAt: new Date(),
        note: b.note ?? reqRow.note,
      },
    });
    if (b.status === "Approved") {
      const item = await prisma.inventoryItem.findUnique({ where: { id: reqRow.itemId } });
      if (item) {
        const newQty = item.stockQty + reqRow.requestQty;
        await prisma.inventoryItem.update({
          where: { id: item.id },
          data: { stockQty: newQty },
        });
        // Tạo phiếu nhập kho
        await prisma.stockReceipt.create({
          data: {
            itemId: reqRow.itemId,
            qty: reqRow.requestQty,
            source: "Request",
            requestId: reqRow.id,
            note: reqRow.note ?? null,
            receivedById: staff.id,
          },
        });
        audit(staff.id, "INVENTORY_RECEIVE",
          `Nhập kho: ${item.name}`,
          `+${reqRow.requestQty} ${item.unit ?? ""} (từ phiếu #${reqRow.id})`);
        // Low-stock check: nếu sau khi nhập vẫn thấp hơn minLevel → vẫn cảnh báo
        if (newQty <= item.minLevel) {
          audit(null, "LOW_STOCK_ALERT", item.name, `Tồn: ${newQty}, Tối thiểu: ${item.minLevel}`);
        }
      }
    }
    res.json(updated);
  });

  // GET /admin/receipts?date=YYYY-MM-DD
  r.get("/receipts", ...admin, async (req, res) => {
    const dateStr = req.query.date as string | undefined;
    let where: Record<string, unknown> = {};
    if (dateStr) {
      const d = new Date(dateStr);
      const start = new Date(d); start.setHours(0, 0, 0, 0);
      const end   = new Date(d); end.setHours(23, 59, 59, 999);
      where = { receivedAt: { gte: start, lte: end } };
    }
    const rows = await prisma.stockReceipt.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: 200,
      include: {
        item: { select: { name: true, unit: true } },
        receivedBy: { select: { fullName: true } },
        request: { select: { id: true, type: true } },
      },
    });
    res.json(rows);
  });

  r.get("/reviews", ...admin, async (_req, res) => {
    const rows = await prisma.review.findMany({
      orderBy: { id: "desc" },
      take: 200,
      include: {
        customer: { select: { fullName: true, phone: true } },
        order: { select: { id: true, totalAmount: true } },
        replyBy: { select: { fullName: true } },
      },
    });
    res.json(rows);
  });

  r.patch("/reviews/:id", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const staff = (req as StaffRequest).staffRow!;
    const b = req.body as { adminReply?: string | null; hidden?: boolean };
    const data: Record<string, unknown> = {};
    if (b.hidden !== undefined) data.hidden = b.hidden;
    if (b.adminReply !== undefined) {
      data.adminReply = b.adminReply?.trim() || null;
      data.replyById = b.adminReply?.trim() ? staff.id : null;
    }
    res.json(await prisma.review.update({ where: { id }, data }));
  });

  r.get("/settings", ...admin, async (_req, res) => {
    const s = await prisma.storeSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        vatRatePercent: 10,
        pointPerVnd: 10000,
        pointValueVnd: 1,
        cashRoundTo: 1000,
        pointEarnEveryVnd: 1000,
        pointEarnEach: 100,
        storeLat: 10.7769,
        storeLng: 106.7009,
        storeAddress: null,
        allowedRadius: 50,
        faceMatchThreshold: 0.5,
      },
      update: {},
    });
    res.json(s);
  });

  r.patch("/settings", ...admin, async (req, res) => {
    const b = req.body as Partial<{
      vatRatePercent: number;
      pointPerVnd: number;
      pointValueVnd: number;
      cashRoundTo: number;
      pointEarnEveryVnd: number;
      pointEarnEach: number;
      storeLat: number | null;
      storeLng: number | null;
      storeAddress: string | null;
      allowedRadius: number;
      faceMatchThreshold: number;
    }>;
    res.json(
      await prisma.storeSettings.upsert({
        where: { id: 1 },
        create: {
          id: 1,
          vatRatePercent: b.vatRatePercent ?? 10,
          pointPerVnd: b.pointPerVnd ?? 10000,
          pointValueVnd: b.pointValueVnd ?? 1,
          cashRoundTo: b.cashRoundTo ?? 1000,
          pointEarnEveryVnd: b.pointEarnEveryVnd ?? 1000,
          pointEarnEach: b.pointEarnEach ?? 100,
          storeLat: b.storeLat ?? 10.7769,
          storeLng: b.storeLng ?? 106.7009,
          storeAddress: b.storeAddress ?? null,
          allowedRadius: b.allowedRadius ?? 50,
          faceMatchThreshold: b.faceMatchThreshold ?? 0.5,
        },
        update: b,
      }),
    );
  });

  r.get("/reports/revenue", ...admin, async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 86400000);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    to.setHours(23, 59, 59, 999);
    const orders = await prisma.order.findMany({
      where: { status: "Paid", createdAt: { gte: from, lte: to } },
      select: { totalAmount: true, createdAt: true, id: true },
    });
    const byDay = new Map<string, number>();
    for (const o of orders) {
      const d = o.createdAt.toISOString().slice(0, 10);
      byDay.set(d, (byDay.get(d) ?? 0) + o.totalAmount);
    }
    res.json({
      from,
      to,
      total: orders.reduce((s, o) => s + o.totalAmount, 0),
      byDay: Object.fromEntries([...byDay.entries()].sort()),
    });
  });

  r.get("/reports/top-products", ...admin, async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 86400000);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    to.setHours(23, 59, 59, 999);
    const details = await prisma.orderDetail.findMany({
      where: { order: { status: "Paid", createdAt: { gte: from, lte: to } } },
      select: { productId: true, quantity: true, unitPrice: true },
    });
    const map = new Map<number, { qty: number; revenue: number }>();
    for (const d of details) {
      const cur = map.get(d.productId) ?? { qty: 0, revenue: 0 };
      cur.qty += d.quantity;
      cur.revenue += d.quantity * d.unitPrice;
      map.set(d.productId, cur);
    }
    const products = await prisma.product.findMany({ where: { id: { in: [...map.keys()] } } });
    const pname = new Map(products.map((p) => [p.id, p.name]));
    const ranked = [...map.entries()]
      .map(([productId, v]) => ({
        productId,
        name: pname.get(productId) ?? `#${productId}`,
        quantity: v.qty,
        revenue: v.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue);
    res.json({ from, to, items: ranked });
  });

  r.get("/export/revenue.csv", ...admin, async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 86400000);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    to.setHours(23, 59, 59, 999);
    const orders = await prisma.order.findMany({
      where: { status: "Paid", createdAt: { gte: from, lte: to } },
      orderBy: { id: "asc" },
      select: { id: true, createdAt: true, totalAmount: true, subTotal: true, vatAmount: true, discountAmt: true, orderType: true },
    });
    const header = "Order_ID,Created_At,Sub_Total,Discount,VAT,Total,Order_Type\n";
    const lines = orders
      .map(
        (o) =>
          `${o.id},${o.createdAt.toISOString()},${o.subTotal},${o.discountAmt},${o.vatAmount},${o.totalAmount},${o.orderType}`,
      )
      .join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=revenue.csv");
    res.send("\uFEFF" + header + lines);
  });

  return r;
}
