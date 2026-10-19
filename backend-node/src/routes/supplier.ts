import { Router, type Request } from "express";
import { PrismaClient } from "@prisma/client";
import { attachStaff, requireRoles, type StaffRequest } from "../middleware/staff.js";
import { audit } from "../lib/audit.js";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export function supplierRouter() {
  const r = Router();
  const auth = attachStaff(prisma);
  // Nhà cung cấp dùng chung cả chuỗi: Chủ chuỗi quản lý; quản lý chi nhánh & thủ kho xem
  const admin = [auth, requireRoles("Admin", "Warehouse")];
  const owner = [auth, requireRoles("Owner")];

  // GET /api/admin/suppliers
  r.get("/suppliers", ...admin, async (_req, res) => {
    const rows = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
    res.json(rows);
  });

  // POST /api/admin/suppliers
  r.post("/suppliers", ...owner, async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const { name, phone, address, email, note, username, password } = req.body as {
      name?: string; phone?: string; address?: string; email?: string; note?: string; username?: string; password?: string;
    };
    if (!name?.trim()) return res.status(400).json({ error: "Thiếu tên nhà cung cấp" });
    
    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }
    
    try {
      const row = await prisma.supplier.create({
        data: { 
          name: name.trim(), 
          phone: phone?.trim() ?? null, 
          address: address?.trim() ?? null, 
          email: email?.trim() ?? null, 
          note: note?.trim() ?? null,
          username: username?.trim() || null,
          passwordHash
        },
      });
      audit(staff.id, "SUPPLIER_CREATE", `NCC #${row.id}`, row.name);
      res.status(201).json(row);
    } catch (e: any) {
      if (e.code === 'P2002') return res.status(400).json({ error: "Tên đăng nhập đã tồn tại" });
      res.status(500).json({ error: "Lỗi server" });
    }
  });

  // PATCH /api/admin/suppliers/:id
  r.patch("/suppliers/:id", ...owner, async (req, res) => {
    const id = Number(req.params.id);
    const staff = (req as StaffRequest).staffRow!;
    const { name, phone, address, email, note, isActive, username, password } = req.body as {
      name?: string; phone?: string; address?: string; email?: string; note?: string; isActive?: boolean; username?: string; password?: string;
    };
    
    let passwordHash = undefined;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }
    
    try {
      const row = await prisma.supplier.update({
        where: { id },
        data: {
          name: name?.trim(),
          phone: phone?.trim() ?? undefined,
          address: address?.trim() ?? undefined,
          email: email?.trim() ?? undefined,
          note: note?.trim() ?? undefined,
          isActive: typeof isActive === "boolean" ? isActive : undefined,
          username: username?.trim() || undefined,
          passwordHash
        },
      });
      audit(staff.id, "SUPPLIER_UPDATE", `NCC #${id}`, row.name);
      res.json(row);
    } catch (e: any) {
      if (e.code === 'P2002') return res.status(400).json({ error: "Tên đăng nhập đã tồn tại" });
      res.status(500).json({ error: "Lỗi server" });
    }
  });

  // DELETE /api/admin/suppliers/:id (soft delete)
  r.delete("/suppliers/:id", ...owner, async (req, res) => {
    const id = Number(req.params.id);
    const staff = (req as StaffRequest).staffRow!;
    await prisma.supplier.update({ where: { id }, data: { isActive: false } });
    audit(staff.id, "SUPPLIER_DELETE", `NCC #${id}`);
    res.status(204).send();
  });

  // GET /api/admin/suppliers/:id/receipts
  r.get("/suppliers/:id/receipts", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const rows = await prisma.stockReceipt.findMany({
      where: { supplierId: id },
      orderBy: { receivedAt: "desc" },
      take: 100,
      include: {
        item: { select: { name: true, unit: true } },
        receivedBy: { select: { fullName: true } },
      },
    });
    res.json(rows);
  });

  return r;
}
