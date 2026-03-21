import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { attachStaff, requireRoles, type StaffRequest } from "../middleware/staff.js";

export function adminRouter(prisma: PrismaClient) {
  const r = Router();
  const auth = attachStaff(prisma);
  const admin = [auth, requireRoles("Admin")];

  r.get("/stats", ...admin, async (_req, res) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [todayOrders, todayRev, products, tables, staff, pendingReq] = await Promise.all([
      prisma.order.count({ where: { status: "Paid", createdAt: { gte: start } } }),
      prisma.order.aggregate({
        where: { status: "Paid", createdAt: { gte: start } },
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

  r.get("/staff", ...admin, async (_req, res) => {
    const rows = await prisma.staff.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        username: true,
        fullName: true,
        phone: true,
        role: true,
        status: true,
        hireDate: true,
        baseSalary: true,
      },
    });
    res.json(rows);
  });

  r.post("/staff", ...admin, async (req, res) => {
    const b = req.body as {
      username?: string;
      password?: string;
      fullName?: string;
      role?: string;
      phone?: string;
    };
    if (!b.username?.trim() || !b.password || b.password.length < 4 || !b.fullName?.trim() || !b.role) {
      return res.status(400).json({ error: "Thiếu username, mật khẩu, họ tên hoặc role." });
    }
    const exists = await prisma.staff.findFirst({ where: { username: b.username.trim() } });
    if (exists) return res.status(409).json({ error: "Username đã tồn tại." });
    const maxId = (await prisma.staff.aggregate({ _max: { id: true } }))._max.id ?? 0;
    const hash = await bcrypt.hash(b.password, 10);
    const s = await prisma.staff.create({
      data: {
        id: maxId + 1,
        username: b.username.trim(),
        passwordHash: hash,
        fullName: b.fullName.trim(),
        phone: b.phone?.trim() ?? null,
        role: b.role,
      },
    });
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
    const b = req.body as { fullName?: string; role?: string; status?: string; password?: string };
    const data: Record<string, unknown> = { ...b };
    if (b.password) {
      data.passwordHash = await bcrypt.hash(b.password, 10);
      delete data.password;
    }
    res.json(await prisma.staff.update({ where: { id }, data }));
  });

  r.get("/tables", ...admin, async (_req, res) => {
    res.json(await prisma.cafeTable.findMany({ orderBy: { id: "asc" } }));
  });

  r.post("/tables", ...admin, async (req, res) => {
    const b = req.body as { name?: string; location?: string; capacity?: number; qrCode?: string };
    if (!b.name?.trim()) return res.status(400).json({ error: "Thiếu tên bàn" });
    const maxId = (await prisma.cafeTable.aggregate({ _max: { id: true } }))._max.id ?? 0;
    const id = maxId + 1;
    const qr = b.qrCode ?? `${process.env.PUBLIC_APP_URL ?? "http://localhost:5173"}/?table=${id}`;
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
    res.json(await prisma.inventoryItem.findMany({ orderBy: { id: "asc" } }));
  });

  r.patch("/inventory/:id", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body as { stockQty?: number; minLevel?: number; name?: string };
    res.json(await prisma.inventoryItem.update({ where: { id }, data: b }));
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
        note: b.note ?? reqRow.note,
      },
    });
    if (b.status === "Approved") {
      const item = await prisma.inventoryItem.findUnique({ where: { id: reqRow.itemId } });
      if (item) {
        await prisma.inventoryItem.update({
          where: { id: item.id },
          data: { stockQty: item.stockQty + reqRow.requestQty },
        });
      }
    }
    res.json(updated);
  });

  r.get("/reviews", ...admin, async (_req, res) => {
    const rows = await prisma.review.findMany({
      orderBy: { id: "desc" },
      take: 200,
      include: {
        customer: { select: { fullName: true, phone: true } },
        order: { select: { id: true, totalAmount: true } },
      },
    });
    res.json(rows);
  });

  r.patch("/reviews/:id", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const staff = (req as StaffRequest).staffRow!;
    const b = req.body as { adminReply?: string; hidden?: boolean };
    const data: Record<string, unknown> = { ...b };
    if (b.adminReply !== undefined) {
      data.replyById = staff.id;
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
