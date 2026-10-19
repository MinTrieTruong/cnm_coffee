import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { haversineKm } from "../lib/delivery.js";
import { attachStaff, isOwner, requireRoles, type StaffRequest } from "../middleware/staff.js";
import { audit } from "../lib/audit.js";

type StoreBody = Partial<{
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  allowedRadius: number;
  openTime: string | null;
  closeTime: string | null;
  isActive: boolean;
}>;

/** Chỉ lấy các trường hợp lệ từ body (bỏ qua giá trị sai kiểu). */
function pickStore(b: StoreBody) {
  const out: StoreBody = {};
  if (typeof b.code === "string" && b.code.trim()) out.code = b.code.trim().toUpperCase();
  if (typeof b.name === "string" && b.name.trim()) out.name = b.name.trim();
  if (b.address !== undefined) out.address = b.address?.trim() || null;
  if (b.phone !== undefined) out.phone = b.phone?.trim() || null;
  if (typeof b.lat === "number" && Math.abs(b.lat) <= 90) out.lat = b.lat;
  if (typeof b.lng === "number" && Math.abs(b.lng) <= 180) out.lng = b.lng;
  if (typeof b.allowedRadius === "number" && b.allowedRadius > 0) out.allowedRadius = Math.round(b.allowedRadius);
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (b.openTime !== undefined) out.openTime = b.openTime && hhmm.test(b.openTime) ? b.openTime : null;
  if (b.closeTime !== undefined) out.closeTime = b.closeTime && hhmm.test(b.closeTime) ? b.closeTime : null;
  if (typeof b.isActive === "boolean") out.isActive = b.isActive;
  return out;
}

const publicSelect = {
  id: true,
  code: true,
  name: true,
  address: true,
  phone: true,
  lat: true,
  lng: true,
  openTime: true,
  closeTime: true,
} as const;

export function storesRouter(prisma: PrismaClient) {
  const r = Router();
  const admin = [attachStaff(prisma), requireRoles("Admin")];
  const owner = [attachStaff(prisma), requireRoles("Owner")];

  /** Public — chi nhánh đang hoạt động. Gửi `?lat=&lng=` để sắp theo khoảng cách (kèm `distanceKm`). */
  r.get("/stores", async (req, res) => {
    const stores = await prisma.store.findMany({
      where: { isActive: true },
      select: publicSelect,
      orderBy: { id: "asc" },
    });
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || req.query.lat === undefined || req.query.lng === undefined) {
      return res.json(stores);
    }
    const withDist = stores
      .map((s) => ({ ...s, distanceKm: Math.round(haversineKm({ lat, lng }, s) * 10) / 10 }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
    res.json(withDist);
  });

  /** Public — chi nhánh của bàn (khách quét QR) */
  r.get("/tables/:id/store", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Bàn không hợp lệ." });
    const t = await prisma.cafeTable.findUnique({ where: { id }, select: { name: true, store: { select: publicSelect } } });
    if (!t) return res.status(404).json({ error: "Không tìm thấy bàn." });
    res.json({ tableName: t.name, store: t.store });
  });

  /* ─────────────── Quản trị chi nhánh ─────────────── */

  /** Owner: mọi chi nhánh (kể cả ngừng hoạt động); Admin: chi nhánh của mình */
  r.get("/admin/stores", ...admin, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const rows = await prisma.store.findMany({
      where: isOwner(me.role) ? {} : { id: me.storeId ?? -1 },
      orderBy: { id: "asc" },
      include: { _count: { select: { staff: { where: { status: "Active" } }, tables: true } } },
    });
    res.json(rows);
  });

  r.post("/admin/stores", ...owner, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const data = pickStore(req.body as StoreBody);
    if (!data.code || !data.name) return res.status(400).json({ error: "Thiếu mã hoặc tên chi nhánh." });
    if (await prisma.store.findUnique({ where: { code: data.code } })) {
      return res.status(409).json({ error: "Mã chi nhánh đã tồn tại." });
    }
    const store = await prisma.store.create({
      // Tạo sẵn 1 khu vực để thêm bàn ngay
      data: { ...data, code: data.code, name: data.name, zones: { create: { name: "Khu A" } } },
    });
    audit(me.id, "STORE_CREATE", `Chi nhánh #${store.id}`, store.name);
    res.status(201).json(store);
  });

  /** Owner sửa mọi trường; Admin chỉ sửa thông tin liên hệ, GPS, giờ mở cửa của chi nhánh mình */
  r.patch("/admin/stores/:id", ...admin, async (req, res) => {
    const id = Number(req.params.id);
    const me = (req as StaffRequest).staffRow!;
    if (!isOwner(me.role) && me.storeId !== id) return res.status(404).json({ error: "Không tìm thấy chi nhánh." });
    const data = pickStore(req.body as StoreBody);
    if (!isOwner(me.role)) {
      delete data.code;
      delete data.isActive;
    }
    if (data.code) {
      const dup = await prisma.store.findUnique({ where: { code: data.code } });
      if (dup && dup.id !== id) return res.status(409).json({ error: "Mã chi nhánh đã tồn tại." });
    }
    if (data.isActive === false) {
      const others = await prisma.store.count({ where: { isActive: true, id: { not: id } } });
      if (others === 0) return res.status(400).json({ error: "Phải còn ít nhất 1 chi nhánh hoạt động." });
    }
    const store = await prisma.store.update({ where: { id }, data });
    audit(me.id, "STORE_UPDATE", `Chi nhánh #${id}`, store.name);
    res.json(store);
  });

  return r;
}
