import { Router, type Request } from "express";
import { PrismaClient } from "@prisma/client";
import { attachStaff, requireRoles, type StaffRequest } from "../middleware/staff.js";
import { audit } from "../lib/audit.js";

const prisma = new PrismaClient();

export function supplierRouter() {
  const r = Router();
  const auth = attachStaff(prisma);
  const admin = [auth, requireRoles("Admin")];

  // GET /api/admin/suppliers
  r.get("/suppliers", ...admin, async (_req, res) => {
    const rows = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
    res.json(rows);
  });

  // POST /api/admin/suppliers
  r.post("/suppliers", ...admin, async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const { name, phone, address, email, note } = req.body as {
      name?: string; phone?: string; address?: string; email?: string; note?: string;
    };
    if (!name?.trim()) return res.status(400).json({ error: "Thiếu tên nhà cung cấp" });
    const row = await prisma.supplier.create({
      data: { name: name.trim(), phone: phone?.trim() ?? null, address: address?.trim() ?? null, email: email?.trim() ?? null, note: note?.trim() ?? null },
    });
    audit(staff.id, "SUPPLIER_CREATE", `NCC #${row.id}`, row.name);
    res.status(201).json(row);
  });

  // PATCH /api/admin/suppliers/:id
  r.patch("/suppliers/:id", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const staff = (req as StaffRequest).staffRow!;
    const { name, phone, address, email, note, isActive } = req.body as {
      name?: string; phone?: string; address?: string; email?: string; note?: string; isActive?: boolean;
    };
    const row = await prisma.supplier.update({
      where: { id },
      data: {
        name: name?.trim(),
        phone: phone?.trim() ?? undefined,
        address: address?.trim() ?? undefined,
        email: email?.trim() ?? undefined,
        note: note?.trim() ?? undefined,
        isActive: typeof isActive === "boolean" ? isActive : undefined,
      },
    });
    audit(staff.id, "SUPPLIER_UPDATE", `NCC #${id}`, row.name);
    res.json(row);
  });

  // DELETE /api/admin/suppliers/:id (soft delete)
  r.delete("/suppliers/:id", ...admin, async (req, res) => {
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
