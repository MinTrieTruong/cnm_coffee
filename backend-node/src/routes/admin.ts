import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ALL_ROLES, BRANCH_STAFF_ROLES, attachStaff, isOwner, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { saveDataUrlImage } from "../lib/uploadImage.js";
import { audit } from "../lib/audit.js";
import { inStore, mustStoreId, reqStoreId, storeWhere } from "../lib/storeScope.js";
import { adjustStoreStock } from "../lib/inventory.js";

export function adminRouter(prisma: PrismaClient) {
  const r = Router();
  const auth = attachStaff(prisma);
  const admin = [auth, requireRoles("Admin")];
  /** Thao tác trên 1 chi nhánh cụ thể (Owner phải chọn chi nhánh) */
  const storeAdmin = [...admin, requireStore];
  /** Dữ liệu dùng chung cả chuỗi (món, danh mục, nguyên liệu, khách hàng) — chỉ Chủ chuỗi ghi */
  const owner = [auth, requireRoles("Owner")];
  /** Kho chi nhánh: Thủ kho làm, Quản lý chi nhánh xem/duyệt */
  const stock = [auth, requireRoles("Admin", "Warehouse")];
  const stockStore = [...stock, requireStore];

  /** Tồn kho của chi nhánh đang chọn; Owner xem tất cả → cộng dồn mọi chi nhánh */
  const stockOf = async (storeId: number | null) => {
    const rows = await prisma.storeInventory.groupBy({
      by: ["itemId"],
      where: storeId == null ? {} : { storeId },
      _sum: { stockQty: true, minLevel: true },
    });
    return new Map(rows.map((r) => [r.itemId, { stockQty: r._sum.stockQty ?? 0, minLevel: r._sum.minLevel ?? 0 }]));
  };
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

  r.get("/stats", ...stock, async (req, res) => {
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
      prisma.order.count({ where: { ...storeWhere(req), status: "Paid", createdAt: { gte: start } } }),
      prisma.order.aggregate({
        where: { status: "Paid", createdAt: { gte: start } },
        _sum: { totalAmount: true },
      }),
      prisma.order.count({ where: { ...storeWhere(req), status: "Paid", createdAt: { gte: weekAgo } } }),
      prisma.order.aggregate({
        where: { status: "Paid", createdAt: { gte: weekAgo } },
        _sum: { totalAmount: true },
      }),
      prisma.order.count({ where: { ...storeWhere(req), status: "Paid", createdAt: { gte: monthStart } } }),
      prisma.order.aggregate({
        where: { status: "Paid", createdAt: { gte: monthStart } },
        _sum: { totalAmount: true },
      }),
      prisma.product.count(),
      prisma.cafeTable.count({ where: storeWhere(req) }),
      prisma.staff.count({ where: { ...storeWhere(req), status: "Active" } }),
      prisma.inventoryRequest.count({ where: { ...storeWhere(req), status: "Pending" } }),
    ]);
    // Việc chờ xử lý của chi nhánh (đơn từ lọc theo chi nhánh của nhân viên)
    const byStaff = { user: storeWhere(req) };
    const [approvedRequests, pendingLeave, pendingSwap, pendingAdjust, pendingPR, incomingTransfers, openPO] = await Promise.all([
      prisma.inventoryRequest.count({ where: { ...storeWhere(req), status: "Approved" } }),
      prisma.leaveRequest.count({ where: { ...byStaff, status: "PENDING" } }),
      prisma.shiftSwapRequest.count({ where: { requester: storeWhere(req), status: "PENDING", targetUserStatus: "ACCEPTED" } }),
      prisma.attendanceAdjustment.count({ where: { ...byStaff, status: "PENDING" } }),
      prisma.purchaseRequisition.count({ where: { ...storeWhere(req), status: "PENDING" } }),
      prisma.stockTransfer.count({ where: { status: "SHIPPED", ...(reqStoreId(req) == null ? {} : { toStoreId: reqStoreId(req)! }) } }),
      prisma.purchaseOrder.count({ where: { ...storeWhere(req), status: { not: "DELIVERED" } } }),
    ]);
    const pending = {
      requests: pendingReq,
      approvedRequests,
      leave: pendingLeave,
      swap: pendingSwap,
      adjust: pendingAdjust,
      purchaseRequisitions: pendingPR,
      incomingTransfers,
      openPurchaseOrders: openPO,
    };
    // Thủ kho chỉ cần việc chờ, không xem doanh thu
    if ((req as StaffRequest).staffRow!.role === "Warehouse") return res.json({ pending });
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
      pending,
    });
  });

  r.get("/products", ...admin, async (req, res) => {
    const sid = reqStoreId(req);
    const rows = await prisma.product.findMany({
      include: { category: true, storeProducts: sid == null ? false : { where: { storeId: sid } } },
      orderBy: [{ categoryId: "asc" }, { id: "asc" }],
    });
    // Có chi nhánh: outOfStock/storeAvailable là trạng thái tại chi nhánh đó
    res.json(
      rows.map(({ storeProducts, ...p }) => {
        const sp = storeProducts?.[0];
        return sid == null ? p : { ...p, outOfStock: p.outOfStock || !!sp?.outOfStock, storeAvailable: sp?.isAvailable ?? true };
      }),
    );
  });

  /** Bật/tắt món hoặc báo hết món tại chi nhánh đang chọn */
  r.patch("/products/:id/availability", ...storeAdmin, async (req, res) => {
    const productId = Number(req.params.id);
    const storeId = mustStoreId(req);
    const b = req.body as { isAvailable?: boolean; outOfStock?: boolean };
    const data = {
      ...(typeof b.isAvailable === "boolean" ? { isAvailable: b.isAvailable } : {}),
      ...(typeof b.outOfStock === "boolean" ? { outOfStock: b.outOfStock } : {}),
    };
    const row = await prisma.storeProduct.upsert({
      where: { storeId_productId: { storeId, productId } },
      update: data,
      create: { storeId, productId, ...data },
    });
    res.json(row);
  });

  r.post("/products", ...owner, async (req, res) => {
    const b = req.body as {
      categoryId?: number;
      name?: string;
      sku?: string;
      costPrice?: number;
      sellPrice?: number;
      priceSizeS?: number;
      priceSizeL?: number;
      imageUrl?: string;
      isActive?: boolean;
      tags?: any;
      discountPercent?: number;
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
        priceSizeS: b.priceSizeS ?? null,
        priceSizeL: b.priceSizeL ?? null,
        isActive: b.isActive ?? true,
        imageUrl: b.imageUrl ?? null,
        tags: b.tags ?? null,
        discountPercent: b.discountPercent ?? null,
      },
    });
    res.status(201).json(p);
  });

  r.patch("/products/:id", ...owner, async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body as Partial<{
      name: string;
      sku: string;
      costPrice: number;
      sellPrice: number;
      priceSizeS: number | null;
      priceSizeL: number | null;
      imageUrl: string | null;
      isActive: boolean;
      outOfStock: boolean;
      categoryId: number;
      tags: any;
      discountPercent: number | null;
    }>;
    // outOfStock là trạng thái theo chi nhánh — không ghi vào món chung
    const { outOfStock, ...rest } = b;
    if (typeof outOfStock === "boolean") {
      const storeId = reqStoreId(req);
      if (storeId == null) return res.status(400).json({ error: "Hãy chọn chi nhánh để báo hết món." });
      await prisma.storeProduct.upsert({
        where: { storeId_productId: { storeId, productId: id } },
        update: { outOfStock },
        create: { storeId, productId: id, outOfStock },
      });
    }
    const p = Object.keys(rest).length
      ? await prisma.product.update({ where: { id }, data: rest })
      : await prisma.product.findUniqueOrThrow({ where: { id } });
    res.json(typeof outOfStock === "boolean" ? { ...p, outOfStock } : p);
  });

  r.get("/categories", ...admin, async (_req, res) => {
    res.json(await prisma.category.findMany({ orderBy: { sortOrder: "asc" } }));
  });

  r.post("/categories", ...owner, async (req, res) => {
    const { name, sortOrder } = req.body as { name?: string; sortOrder?: number };
    if (!name?.trim()) return res.status(400).json({ error: "Thiếu tên" });
    const maxId = (await prisma.category.aggregate({ _max: { id: true } }))._max.id ?? 0;
    const c = await prisma.category.create({
      data: { id: maxId + 1, name: name.trim(), sortOrder: sortOrder ?? maxId + 1 },
    });
    res.status(201).json(c);
  });

  r.patch("/categories/:id", ...owner, async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body as { name?: string; sortOrder?: number };
    res.json(await prisma.category.update({ where: { id }, data: b }));
  });

  r.delete("/categories/:id", ...owner, async (req, res) => {
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
    if (!staff || !inStore(req, staff)) return res.status(404).json({ error: "Không tìm thấy nhân viên." });

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

  r.get("/staff", ...admin, async (req, res) => {
    const rows = await prisma.staff.findMany({
      where: storeWhere(req),
      orderBy: { id: "asc" },
      select: {
        id: true,
        storeId: true,
        store: { select: { name: true } },
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
      baseSalary?: number;
      allowance?: number;
      storeId?: number | null;
    };
    if (!b.password || b.password.length < 4 || !b.fullName?.trim() || !b.role) {
      return res.status(400).json({ error: "Thiếu mật khẩu, họ tên hoặc role." });
    }
    const actorRow = (req as StaffRequest).staffRow!;
    if (!ALL_ROLES.includes(b.role)) return res.status(400).json({ error: "Vai trò không hợp lệ." });
    // Quản lý chi nhánh chỉ tạo nhân viên chi nhánh; Quản lý/Chủ chuỗi do Chủ chuỗi tạo
    if (!isOwner(actorRow.role) && !BRANCH_STAFF_ROLES.includes(b.role)) {
      return res.status(403).json({ error: "Chỉ Chủ chuỗi được tạo tài khoản Quản lý chi nhánh hoặc Chủ chuỗi." });
    }
    // Admin tạo nhân viên cho chi nhánh mình; Owner chọn chi nhánh (body hoặc chi nhánh đang xem)
    const storeId = isOwner(b.role) ? null : isOwner(actorRow.role) ? (b.storeId ?? reqStoreId(req)) : actorRow.storeId;
    if (!isOwner(b.role) && storeId == null) {
      return res.status(400).json({ error: "Hãy chọn chi nhánh cho nhân viên." });
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
        storeId,
        username,
        passwordHash: hash,
        fullName: normalizedName,
        phone: b.phone?.trim() ?? null,
        address: b.address?.trim() ?? null,
        dob: dob && !Number.isNaN(dob.getTime()) ? dob : null,
        role: b.role,
        hireDate: Number.isNaN(hireDate.getTime()) ? new Date() : hireDate,
        status: b.status === "Inactive" ? "Inactive" : "Active",
        baseSalary: b.baseSalary ?? 0,
        allowance: b.allowance ?? 0,
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
      baseSalary?: number;
      allowance?: number;
      storeId?: number;
    };
    const target = await prisma.staff.findUnique({ where: { id } });
    if (!target || !inStore(req, target)) return res.status(404).json({ error: "Không tìm thấy nhân viên." });
    if (b.role !== undefined && !ALL_ROLES.includes(b.role)) return res.status(400).json({ error: "Vai trò không hợp lệ." });
    if (!isOwner(actor.role)) {
      // Quản lý chi nhánh: sửa nhân viên chi nhánh (hoặc chính mình nhưng không đổi vai trò)
      const editable = BRANCH_STAFF_ROLES.includes(target.role) || (target.id === actor.id && b.role === undefined);
      if (!editable || (b.role !== undefined && !BRANCH_STAFF_ROLES.includes(b.role)) || b.storeId !== undefined) {
        return res.status(403).json({ error: "Chỉ Chủ chuỗi được sửa tài khoản quản lý hoặc đổi chi nhánh." });
      }
    }
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
    const updated = await prisma.staff.update({ where: { id }, data });
    audit(actor.id, "STAFF_UPDATE", `Staff #${id}`, `${updated.username ?? updated.fullName}`);
    res.json(updated);
  });

  r.delete("/staff/:id", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const actor = (req as StaffRequest).staffRow!;
    if (actor.id === id) return res.status(400).json({ error: "Không thể tự xóa chính mình." });
    const target = await prisma.staff.findUnique({ where: { id } });
    if (!target || !inStore(req, target)) return res.status(404).json({ error: "Không tìm thấy nhân viên." });
    if (!isOwner(actor.role) && !BRANCH_STAFF_ROLES.includes(target.role)) return res.status(403).json({ error: "Không đủ quyền." });
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

  r.patch("/customers/:id", ...owner, async (req, res) => {
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

  r.post("/customers/:id/reset-password", ...owner, async (req, res) => {
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

  // --- QUẢN LÝ KHU VỰC (ZONE) ---
  r.get("/zones", ...admin, async (req, res) => {
    res.json(await prisma.zone.findMany({ where: storeWhere(req), orderBy: { id: "asc" } }));
  });

  r.post("/zones", ...storeAdmin, async (req, res) => {
    const b = req.body as { name?: string; isActive?: boolean };
    if (!b.name?.trim()) return res.status(400).json({ error: "Thiếu tên khu vực" });
    const z = await prisma.zone.create({
      data: {
        storeId: mustStoreId(req),
        name: b.name.trim(),
        isActive: b.isActive ?? true,
      },
    });
    res.status(201).json(z);
  });

  r.patch("/zones/:id", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body as { name?: string; isActive?: boolean };
    const zone = await prisma.zone.findUnique({ where: { id } });
    if (!zone || !inStore(req, zone)) return res.status(404).json({ error: "Không tìm thấy khu vực" });
    res.json(await prisma.zone.update({ where: { id }, data: { name: b.name, isActive: b.isActive } }));
  });

  r.delete("/zones/:id", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const zone = await prisma.zone.findUnique({ where: { id } });
    if (!zone || !inStore(req, zone)) return res.status(404).json({ error: "Không tìm thấy khu vực" });
    const cnt = await prisma.cafeTable.count({ where: { zoneId: id } });
    if (cnt > 0) {
      return res.status(400).json({ error: `Khu vực đang có ${cnt} bàn. Vui lòng chuyển bàn sang khu vực khác trước.` });
    }
    await prisma.zone.delete({ where: { id } });
    res.status(204).send();
  });

  // --- QUẢN LÝ BÀN (TABLES) ---
  r.get("/tables", ...admin, async (req, res) => {
    const zoneId = req.query.zoneId ? Number(req.query.zoneId) : undefined;
    res.json(await prisma.cafeTable.findMany({
      where: { ...storeWhere(req), ...(zoneId ? { zoneId } : {}) },
      orderBy: { id: "asc" },
      include: { zone: true }
    }));
  });

  r.post("/tables", ...storeAdmin, async (req, res) => {
    const b = req.body as { name?: string; location?: string; capacity?: number; qrCode?: string; zoneId?: number };
    if (!b.name?.trim()) return res.status(400).json({ error: "Thiếu tên bàn" });
    const maxId = (await prisma.cafeTable.aggregate({ _max: { id: true } }))._max.id ?? 0;
    const id = maxId + 1;
    const qr = b.qrCode ?? `${process.env.PUBLIC_APP_URL ?? "http://localhost:5173"}/?idtable=${id}`;

    // Nếu không truyền zoneId, lấy zone đầu tiên (mặc định) của chi nhánh
    const storeId = mustStoreId(req);
    let zId = b.zoneId;
    if (zId) {
      const z = await prisma.zone.findUnique({ where: { id: zId } });
      if (!z || z.storeId !== storeId) return res.status(400).json({ error: "Khu vực không thuộc chi nhánh này" });
    } else {
      const firstZone = await prisma.zone.findFirst({ where: { storeId }, orderBy: { id: "asc" } });
      zId = firstZone?.id;
    }

    const t = await prisma.cafeTable.create({
      data: {
        id,
        storeId,
        name: b.name.trim(),
        location: b.location ?? null,
        capacity: b.capacity ?? 4,
        qrCode: qr,
        status: "Empty",
        zoneId: zId,
      },
      include: { zone: true },
    });
    res.status(201).json(t);
  });

  r.patch("/tables/:id", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body as { name?: string; location?: string; capacity?: number; status?: string; qrCode?: string; zoneId?: number };
    const table = await prisma.cafeTable.findUnique({ where: { id } });
    if (!table || !inStore(req, table)) return res.status(404).json({ error: "Không tìm thấy bàn" });
    if (b.zoneId) {
      const z = await prisma.zone.findUnique({ where: { id: b.zoneId } });
      if (!z || z.storeId !== table.storeId) return res.status(400).json({ error: "Khu vực không thuộc chi nhánh này" });
    }
    res.json(await prisma.cafeTable.update({ where: { id }, data: b, include: { zone: true } }));
  });

  r.get("/inventory", ...stock, async (req, res) => {
    try {
      const [items, stock] = await Promise.all([
        prisma.inventoryItem.findMany({ orderBy: { id: "asc" } }),
        stockOf(reqStoreId(req)),
      ]);
      res.json(items.map((it) => ({ ...it, ...(stock.get(it.id) ?? { stockQty: 0, minLevel: 0 }) })));
    } catch (e) {
      if (isMissingColumn(e, "Inventory.Image_URL")) {
        return res.status(500).json({
          error: "CSDL kho chưa đồng bộ cột ảnh. Chạy: cd backend-node && npx prisma db push",
        });
      }
      throw e;
    }
  });

  r.post("/inventory", ...owner, async (req, res) => {
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
    const storeId = reqStoreId(req);
    const stockQty = typeof b.stockQty === "number" ? b.stockQty : 0;
    const minLevel = typeof b.minLevel === "number" ? b.minLevel : 0;
    if (storeId == null && (stockQty || minLevel)) {
      return res.status(400).json({ error: "Hãy chọn chi nhánh để nhập tồn kho ban đầu." });
    }
    const maxId = (await prisma.inventoryItem.aggregate({ _max: { id: true } }))._max.id ?? 0;
    const row = await prisma.inventoryItem.create({
      data: {
        id: maxId + 1,
        name: b.name.trim(),
        skuCode: b.skuCode?.trim() || null,
        unit: b.unit?.trim() || null,
        supplier: b.supplier?.trim() || null,
        imageUrl: b.imageUrl ?? null,
        // Danh mục nguyên liệu dùng chung; tồn kho ban đầu thuộc chi nhánh đang chọn
        ...(storeId != null ? { storeStocks: { create: { storeId, stockQty, minLevel } } } : {}),
      },
    });
    res.status(201).json({ ...row, stockQty, minLevel });
  });

  r.patch("/inventory/:id", ...stock, async (req, res) => {
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
    const { stockQty, minLevel, ...catalog } = b;
    if (Object.keys(catalog).length && !isOwner((req as StaffRequest).staffRow!.role)) {
      return res.status(403).json({ error: "Tên, mã, đơn vị nguyên liệu dùng chung cả chuỗi — chỉ Chủ chuỗi sửa." });
    }
    if (stockQty !== undefined || minLevel !== undefined) {
      const storeId = reqStoreId(req);
      if (storeId == null) return res.status(400).json({ error: "Hãy chọn chi nhánh để sửa tồn kho." });
      const cur = await prisma.storeInventory.findUnique({ where: { storeId_itemId: { storeId, itemId: id } } });
      await prisma.$transaction(async (tx) => {
        if (typeof minLevel === "number") {
          await tx.storeInventory.upsert({
            where: { storeId_itemId: { storeId, itemId: id } },
            update: { minLevel },
            create: { storeId, itemId: id, minLevel },
          });
        }
        const delta = typeof stockQty === "number" ? stockQty - (cur?.stockQty ?? 0) : 0;
        if (delta !== 0) {
          await adjustStoreStock(tx, { storeId, itemId: id, qtyChange: delta, type: "ADJUST", referenceId: "ADMIN" });
        }
      });
    }
    const item = Object.keys(catalog).length
      ? await prisma.inventoryItem.update({ where: { id }, data: catalog })
      : await prisma.inventoryItem.findUniqueOrThrow({ where: { id } });
    const stock = (await stockOf(reqStoreId(req))).get(id) ?? { stockQty: 0, minLevel: 0 };
    res.json({ ...item, ...stock });
  });

  r.delete("/inventory/:id", ...owner, async (req, res) => {
    const id = Number(req.params.id);
    await prisma.inventoryRequest.deleteMany({ where: { itemId: id } });
    await prisma.storeInventory.deleteMany({ where: { itemId: id } });
    await prisma.inventoryItem.delete({ where: { id } });
    res.status(204).send();
  });

  r.post("/inventory/:id/receive", ...stockStore, async (req, res) => {
    const id = Number(req.params.id);
    const { qty, expiryDate } = req.body as { qty?: number; expiryDate?: string };
    if (typeof qty !== "number" || qty <= 0) return res.status(400).json({ error: "Số lượng không hợp lệ" });
    const item = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ error: "Không tìm thấy" });
    const staff = (req as StaffRequest).staffRow!;

    let parsedExpiry: Date | undefined;
    if (expiryDate) {
      parsedExpiry = new Date(expiryDate);
      if (isNaN(parsedExpiry.getTime())) {
        return res.status(400).json({ error: "Hạn sử dụng không hợp lệ" });
      }
    }

    const storeId = mustStoreId(req);
    const stock = await prisma.$transaction((tx) =>
      adjustStoreStock(tx, { storeId, itemId: id, qtyChange: qty, type: "RECEIVE", referenceId: "MANUAL" }),
    );
    const updated = { ...item, stockQty: stock.stockQty, minLevel: stock.minLevel };

    await prisma.stockReceipt.create({
      data: {
        storeId,
        itemId: id,
        qty: qty,
        remainingQty: qty,
        expiryDate: parsedExpiry,
        source: "Manual",
        receivedById: staff.id,
      },
    });

    audit(staff.id, "INVENTORY_RECEIVE", `Nhập kho thủ công: ${item.name}`, `+${qty} ${item.unit ?? ""}`);
    res.json(updated);
  });

  r.get("/inventory/expiring", ...stock, async (req, res) => {
    const now = new Date();
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const receipts = await prisma.stockReceipt.findMany({
      where: {
        ...storeWhere(req),
        remainingQty: { gt: 0 },
        expiryDate: { lte: next7Days }
      },
      orderBy: { expiryDate: "asc" },
      include: { item: { select: { name: true, unit: true, skuCode: true } } }
    });
    res.json(receipts);
  });

  r.post("/inventory/receipts/:id/discard", ...stock, async (req, res) => {
    const receiptId = Number(req.params.id);
    const staff = (req as StaffRequest).staffRow!;
    const receipt = await prisma.stockReceipt.findUnique({ where: { id: receiptId }, include: { item: true } });
    if (!receipt || !inStore(req, receipt) || receipt.remainingQty <= 0) {
      return res.status(400).json({ error: "Lô hàng không hợp lệ hoặc đã hết" });
    }

    // Giảm tồn kho của chi nhánh nhận lô hàng
    await prisma.$transaction((tx) =>
      adjustStoreStock(tx, {
        storeId: receipt.storeId,
        itemId: receipt.itemId,
        qtyChange: -receipt.remainingQty,
        type: "DISCARD",
        referenceId: `RECEIPT-${receipt.id}`,
      }),
    );

    // Set remainingQty = 0
    await prisma.stockReceipt.update({
      where: { id: receiptId },
      data: { remainingQty: 0 }
    });

    audit(staff.id, "INVENTORY_DISCARD", `Hủy lô hàng quá date: ${receipt.item.name}`, `-${receipt.remainingQty} ${receipt.item.unit ?? ""}`);
    res.json({ ok: true, discarded: receipt.remainingQty });
  });

  r.get("/requests", ...stock, async (req, res) => {
    const rows = await prisma.inventoryRequest.findMany({
      where: storeWhere(req),
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
    if (!reqRow || !inStore(req, reqRow) || reqRow.status !== "Pending") return res.status(400).json({ error: "Phiếu không hợp lệ" });
    // Duyệt chưa đụng tồn kho — Thủ kho thực hiện ở bước /fulfill
    const updated = await prisma.inventoryRequest.update({
      where: { id },
      data: {
        status: b.status,
        approvedById: staff.id,
        approvedAt: new Date(),
        note: b.note ?? reqRow.note,
      },
    });
    audit(staff.id, b.status === "Approved" ? "REQUEST_APPROVE" : "REQUEST_REJECT", `Phiếu #${reqRow.id}`);
    res.json(updated);
  });

  /**
   * Thủ kho thực hiện phiếu đã duyệt:
   * - Restock (đề nghị nhập hàng): hàng về → cộng kho + phiếu nhập.
   * - Kitchen (bếp xin nguyên liệu): xuất kho cho quầy pha chế → trừ kho.
   */
  r.post("/requests/:id/fulfill", ...stockStore, async (req, res) => {
    const id = Number(req.params.id);
    const staff = (req as StaffRequest).staffRow!;
    const reqRow = await prisma.inventoryRequest.findUnique({ where: { id }, include: { item: true } });
    if (!reqRow || !inStore(req, reqRow)) return res.status(404).json({ error: "Không tìm thấy phiếu" });
    if (reqRow.status !== "Approved") return res.status(400).json({ error: "Phiếu chưa được quản lý duyệt" });
    const isRestock = reqRow.type === "Restock";

    if (!isRestock) {
      const cur = await prisma.storeInventory.findUnique({
        where: { storeId_itemId: { storeId: reqRow.storeId, itemId: reqRow.itemId } },
      });
      if ((cur?.stockQty ?? 0) < reqRow.requestQty) {
        return res.status(400).json({ error: `Không đủ tồn kho (còn ${cur?.stockQty ?? 0} ${reqRow.item.unit ?? ""}).` });
      }
    }

    const stockRow = await prisma.$transaction(async (tx) => {
      const s = await adjustStoreStock(tx, {
        storeId: reqRow.storeId,
        itemId: reqRow.itemId,
        qtyChange: isRestock ? reqRow.requestQty : -reqRow.requestQty,
        type: isRestock ? "RECEIVE" : "ISSUE",
        referenceId: `REQUEST-${reqRow.id}`,
      });
      if (isRestock) {
        await tx.stockReceipt.create({
          data: {
            storeId: reqRow.storeId,
            itemId: reqRow.itemId,
            qty: reqRow.requestQty,
            source: "Request",
            requestId: reqRow.id,
            note: reqRow.note ?? null,
            receivedById: staff.id,
            remainingQty: reqRow.requestQty,
          },
        });
      }
      await tx.inventoryRequest.update({ where: { id }, data: { status: "Fulfilled" } });
      return s;
    });
    audit(staff.id, isRestock ? "INVENTORY_RECEIVE" : "INVENTORY_ISSUE",
      `${isRestock ? "Nhập kho" : "Xuất cho bếp"}: ${reqRow.item.name}`,
      `${isRestock ? "+" : "-"}${reqRow.requestQty} ${reqRow.item.unit ?? ""} (phiếu #${reqRow.id})`);
    if (stockRow.stockQty <= stockRow.minLevel) {
      audit(staff.id, "LOW_STOCK_ALERT", reqRow.item.name, `Tồn: ${stockRow.stockQty}, Tối thiểu: ${stockRow.minLevel}`);
    }
    res.json({ ok: true, stockQty: stockRow.stockQty });
  });

  // GET /admin/receipts?date=YYYY-MM-DD
  r.get("/receipts", ...stock, async (req, res) => {
    const dateStr = req.query.date as string | undefined;
    let where: Record<string, unknown> = { ...storeWhere(req) };
    if (dateStr) {
      const d = new Date(dateStr);
      const start = new Date(d); start.setHours(0, 0, 0, 0);
      const end   = new Date(d); end.setHours(23, 59, 59, 999);
      where = { ...where, receivedAt: { gte: start, lte: end } };
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

  r.get("/reviews", ...admin, async (req, res) => {
    const rows = await prisma.review.findMany({
      where: { order: storeWhere(req) },
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
    const review = await prisma.review.findUnique({ where: { id }, include: { order: true } });
    if (!review || !inStore(req, review.order)) return res.status(404).json({ error: "Không tìm thấy đánh giá" });
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
        faceMatchThreshold: 0.5,
      },
      update: {},
    });
    res.json(s);
  });

  // Cấu hình chung cả chuỗi (VAT, điểm, làm tròn) — chỉ Chủ chuỗi sửa
  r.patch("/settings", auth, requireRoles("Owner"), async (req, res) => {
    const b = req.body as Partial<{
      vatRatePercent: number;
      pointPerVnd: number;
      pointValueVnd: number;
      cashRoundTo: number;
      pointEarnEveryVnd: number;
      pointEarnEach: number;
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
          faceMatchThreshold: b.faceMatchThreshold ?? 0.5,
        },
        update: {
          vatRatePercent: b.vatRatePercent,
          pointPerVnd: b.pointPerVnd,
          pointValueVnd: b.pointValueVnd,
          cashRoundTo: b.cashRoundTo,
          pointEarnEveryVnd: b.pointEarnEveryVnd,
          pointEarnEach: b.pointEarnEach,
          faceMatchThreshold: b.faceMatchThreshold,
        },
      }),
    );
  });

  r.get("/reports/revenue", ...admin, async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 86400000);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    to.setHours(23, 59, 59, 999);
    const orders = await prisma.order.findMany({
      where: { ...storeWhere(req), status: "Paid", createdAt: { gte: from, lte: to } },
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
      where: { order: { ...storeWhere(req), status: "Paid", createdAt: { gte: from, lte: to } } },
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
      where: { ...storeWhere(req), status: "Paid", createdAt: { gte: from, lte: to } },
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
