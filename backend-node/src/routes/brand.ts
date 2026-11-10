/**
 * routes/brand.ts — Trang câu chuyện thương hiệu (/about) + hồ sơ giới thiệu chi nhánh (/stores/:id)
 *
 * Khách:  GET /site/brand?lang=en        — các mục đang bật, đúng thứ tự, đã ghép tiếng Anh + dữ liệu tham chiếu (món, đánh giá, chi nhánh, số liệu)
 *         GET /site/brand/stats          — số tự động cho mục "Con số biết nói"
 *         GET /stores/:id/public         — hồ sơ chi nhánh + đánh giá của chi nhánh
 * Chủ chuỗi:  GET /admin/brand/sections · GET/PUT /admin/brand/sections/:key · PATCH /admin/brand/order · GET /admin/brand/images
 * Chủ chuỗi + Quản lý chi nhánh (chi nhánh của mình):  GET/PUT /admin/stores/:id/profile
 * Kiểu dữ liệu + kiểm tra: src/shared/brand.ts (dùng chung với frontend).
 */
import { Router, type Request } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";
import { attachStaff, isOwner, requireRoles, type StaffRequest } from "../middleware/staff.js";
import { audit } from "../lib/audit.js";
import { siteStats } from "../lib/siteStats.js";
import {
  BRAND_SECTIONS, BRAND_KEYS, countDefaultImages, mergeEn, sectionDef, STORE_PROFILE_FIELDS, validateSection, validateStoreProfile,
  type BrandImage, type BrandKey, type StoreProfile,
} from "../shared/brand.js";

const json = (v: unknown) => v as Prisma.InputJsonValue;
const asImage = (v: unknown): BrandImage => (v && typeof v === "object" ? (v as BrandImage) : { url: "", alt: "" });
const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Thẻ chi nhánh (trang /about mục "Mỗi quán một câu chuyện", trang /stores) */
export const storeCardSelect = {
  id: true, name: true, address: true, phone: true, lat: true, lng: true, openTime: true, closeTime: true,
  coverImage: true, tagline: true, openedYear: true, amenities: true,
} as const;

/** Hồ sơ chi nhánh từ dòng Store (cột null → giá trị rỗng) */
function profileOf(s: {
  coverImage: unknown; story: string | null; openedYear: number | null; tagline: string | null; managerName: string | null;
  managerPhoto: unknown; managerQuote: string | null; amenities: unknown; galleryImages: unknown; favoriteSpots: unknown;
}): StoreProfile {
  return {
    coverImage: asImage(s.coverImage), story: s.story ?? "", openedYear: s.openedYear, tagline: s.tagline ?? "",
    managerName: s.managerName ?? "", managerPhoto: asImage(s.managerPhoto), managerQuote: s.managerQuote ?? "",
    amenities: asArray<string>(s.amenities), galleryImages: asArray(s.galleryImages), favoriteSpots: asArray(s.favoriteSpots),
  };
}

export function brandRouter(prisma: PrismaClient) {
  const r = Router();
  const owner = [attachStaff(prisma), requireRoles("Owner")];
  const manager = [attachStaff(prisma), requireRoles("Admin")];
  const staffId = (req: Request) => (req as StaffRequest).staffRow?.id ?? null;

  /* ─────────── Khách ─────────── */

  r.get("/site/brand", async (req, res) => {
    const en = req.query.lang === "en";
    const rows = await prisma.brandSection.findMany({ where: { isVisible: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
    const sections = rows
      .filter((row) => BRAND_KEYS.includes(row.key as BrandKey))
      .map((row) => ({ key: row.key as BrandKey, data: en && row.dataEn ? mergeEn(sectionDef(row.key)!.fields, row.data, row.dataEn) : (row.data as Record<string, unknown>) }));

    // Dữ liệu tham chiếu: món (signature, món tủ), đánh giá thật (lời kể), chi nhánh, số liệu tự động
    const ids = { products: new Set<number>(), reviews: new Set<number>() };
    for (const s of sections) {
      for (const it of asArray<Record<string, unknown>>(s.data.items)) {
        for (const k of ["productId", "favoriteProductId"]) if (typeof it[k] === "number") ids.products.add(it[k] as number);
        if (typeof it.reviewId === "number") ids.reviews.add(it.reviewId);
      }
    }
    const [products, reviews, stores, stats] = await Promise.all([
      ids.products.size
        ? prisma.product.findMany({ where: { id: { in: [...ids.products] }, isActive: true }, select: { id: true, name: true, imageUrl: true, sellPrice: true, discountPercent: true } })
        : [],
      ids.reviews.size
        ? prisma.review.findMany({
            where: { id: { in: [...ids.reviews] }, hidden: false },
            select: { id: true, rating: true, comment: true, anonymous: true, customer: { select: { fullName: true, avatarUrl: true } }, order: { select: { store: { select: { name: true } } } } },
          })
        : [],
      sections.some((s) => s.key === "stores" || s.key === "gallery")
        ? prisma.store.findMany({ where: { isActive: true }, orderBy: { id: "asc" }, select: storeCardSelect })
        : [],
      sections.some((s) => s.key === "stats") ? siteStats(prisma) : null,
    ]);
    res.json({
      sections,
      refs: {
        products: Object.fromEntries(products.map((p) => [p.id, p])),
        // Đánh giá ẩn danh: không trả tên / ảnh khách
        reviews: Object.fromEntries(reviews.map((v) => [v.id, {
          rating: v.rating, comment: v.comment, storeName: v.order.store.name,
          name: v.anonymous ? null : v.customer.fullName, avatarUrl: v.anonymous ? null : v.customer.avatarUrl,
        }])),
        stores,
        stats,
      },
    });
  });

  r.get("/site/brand/stats", async (_req, res) => res.json(await siteStats(prisma)));

  r.get("/stores/:id/public", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Chi nhánh không hợp lệ." });
    const s = await prisma.store.findFirst({ where: { id, isActive: true } });
    if (!s) return res.status(404).json({ error: "Không tìm thấy chi nhánh." });
    const where = { hidden: false, order: { storeId: id } };
    const [agg, reviews] = await Promise.all([
      prisma.review.aggregate({ where, _avg: { rating: true }, _count: { _all: true } }),
      prisma.review.findMany({
        where: { ...where, comment: { not: null } }, orderBy: { createdAt: "desc" }, take: 6,
        select: { id: true, rating: true, comment: true, createdAt: true, anonymous: true, customer: { select: { fullName: true, avatarUrl: true } }, product: { select: { id: true, name: true } } },
      }),
    ]);
    res.json({
      id: s.id, name: s.name, address: s.address, phone: s.phone, lat: s.lat, lng: s.lng, openTime: s.openTime, closeTime: s.closeTime,
      profile: profileOf(s),
      rating: agg._count._all ? { avg: Math.round((agg._avg.rating ?? 0) * 10) / 10, count: agg._count._all } : null,
      reviews: reviews.map(({ anonymous, customer, ...v }) => ({ ...v, customer: anonymous ? null : customer })),
    });
  });

  /* ─────────── Chủ chuỗi: các mục câu chuyện ─────────── */

  /** Cả 15 mục (mục chưa có trong CSDL trả dữ liệu rỗng để màn quản trị tạo mới), kèm số ô ảnh còn mặc định */
  r.get("/admin/brand/sections", ...owner, async (_req, res) => {
    const rows = await prisma.brandSection.findMany();
    const byKey = new Map(rows.map((x) => [x.key, x]));
    const list = BRAND_SECTIONS.map((def, i) => {
      const row = byKey.get(def.key);
      const data = row?.data ?? validateSection(def.key, {}).data;
      return {
        key: def.key, sortOrder: row?.sortOrder ?? i, isVisible: row?.isVisible ?? def.defaultVisible, exists: !!row,
        data, dataEn: row?.dataEn ?? null, updatedAt: row?.updatedAt ?? null, defaultImages: countDefaultImages(def.fields, data),
      };
    }).sort((a, b) => a.sortOrder - b.sortOrder);
    res.json(list);
  });

  r.get("/admin/brand/sections/:key", ...owner, async (req, res) => {
    const key = String(req.params.key);
    const def = sectionDef(key);
    if (!def) return res.status(404).json({ error: "Mục không tồn tại." });
    const row = await prisma.brandSection.findUnique({ where: { key } });
    res.json({ key, isVisible: row?.isVisible ?? def.defaultVisible, data: row?.data ?? validateSection(key, {}).data, dataEn: row?.dataEn ?? null, updatedAt: row?.updatedAt ?? null });
  });

  /** Lưu một mục: { data, dataEn? } — lỗi trả theo từng ô (fields: { "items.2.title": "…" }; bản tiếng Anh có tiền tố "en.") */
  r.put("/admin/brand/sections/:key", ...owner, async (req, res) => {
    const key = String(req.params.key);
    const def = sectionDef(key);
    if (!def) return res.status(404).json({ error: "Mục không tồn tại." });
    const body = (req.body ?? {}) as { data?: unknown; dataEn?: unknown };
    const vi = validateSection(key, body.data);
    const en = body.dataEn == null ? null : validateSection(key, body.dataEn, true);
    const errors = { ...vi.errors, ...Object.fromEntries(Object.entries(en?.errors ?? {}).map(([k, v]) => [`en.${k}`, v])) };
    if (Object.keys(errors).length) return res.status(400).json({ error: Object.values(errors)[0], fields: errors });
    const count = await prisma.brandSection.count();
    const row = await prisma.brandSection.upsert({
      where: { key },
      update: { data: json(vi.data), dataEn: en ? json(en.data) : Prisma.DbNull, updatedBy: staffId(req) },
      create: { key, data: json(vi.data), dataEn: en ? json(en.data) : Prisma.DbNull, updatedBy: staffId(req), isVisible: def.defaultVisible, sortOrder: count },
    });
    audit(staffId(req), "BRAND_SECTION_UPDATE", `brand:${key}`, def.label);
    res.json({ key, data: row.data, dataEn: row.dataEn, updatedAt: row.updatedAt, defaultImages: countDefaultImages(def.fields, row.data) });
  });

  /** Thứ tự + bật/tắt: { items: [{ key, isVisible }] } theo thứ tự hiển thị */
  r.patch("/admin/brand/order", ...owner, async (req, res) => {
    const items = asArray<{ key?: unknown; isVisible?: unknown }>((req.body as { items?: unknown })?.items);
    const clean = items.filter((x) => typeof x.key === "string" && sectionDef(x.key)).map((x) => ({ key: x.key as string, isVisible: x.isVisible !== false }));
    if (!clean.length) return res.status(400).json({ error: "Danh sách mục trống." });
    await prisma.$transaction(clean.map((x, i) =>
      prisma.brandSection.upsert({
        where: { key: x.key },
        update: { sortOrder: i, isVisible: x.isVisible, updatedBy: staffId(req) },
        create: { key: x.key, sortOrder: i, isVisible: x.isVisible, data: json(validateSection(x.key, {}).data), updatedBy: staffId(req) },
      }),
    ));
    audit(staffId(req), "BRAND_ORDER_UPDATE", "brand", clean.map((x) => `${x.key}${x.isVisible ? "" : "(ẩn)"}`).join(", "));
    res.json({ ok: true });
  });

  /** Thư viện "Chọn ảnh đã tải": ảnh đang dùng ở trang câu chuyện, hồ sơ chi nhánh, banner, bài đăng (không quét thư mục uploads — tránh lộ ảnh của khách) */
  r.get("/admin/brand/images", ...manager, async (_req, res) => {
    const [sections, stores, banners, posts] = await Promise.all([
      prisma.brandSection.findMany({ select: { data: true } }),
      prisma.store.findMany({ select: { coverImage: true, managerPhoto: true, galleryImages: true, favoriteSpots: true } }),
      prisma.banner.findMany({ select: { imageUrl: true }, orderBy: { id: "desc" }, take: 50 }),
      prisma.post.findMany({ where: { imageUrl: { startsWith: "/uploads/" } }, select: { imageUrl: true }, orderBy: { id: "desc" }, take: 50 }),
    ]);
    const found = new Map<string, BrandImage>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (!v || typeof v !== "object") return;
      const o = v as Record<string, unknown>;
      if (typeof o.url === "string" && o.url.startsWith("/uploads/") && typeof o.alt === "string") found.set(o.url, { url: o.url, small: typeof o.small === "string" ? o.small : undefined, alt: o.alt });
      Object.values(o).forEach(walk);
    };
    walk(sections.map((x) => x.data));
    walk(stores);
    for (const b of [...banners, ...posts]) if (b.imageUrl?.startsWith("/uploads/") && !found.has(b.imageUrl)) found.set(b.imageUrl, { url: b.imageUrl, alt: "" });
    res.json([...found.values()]);
  });

  /* ─────────── Hồ sơ chi nhánh ─────────── */

  /** Quản lý chi nhánh chỉ sửa được chi nhánh của mình; Chủ chuỗi sửa mọi chi nhánh */
  const canEditStore = (req: Request, id: number) => {
    const row = (req as StaffRequest).staffRow!;
    return isOwner(row.role) || row.storeId === id;
  };

  r.get("/admin/stores/:id/profile", ...manager, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !canEditStore(req, id)) return res.status(403).json({ error: "Không đủ quyền với chi nhánh này." });
    const s = await prisma.store.findUnique({ where: { id } });
    if (!s) return res.status(404).json({ error: "Không tìm thấy chi nhánh." });
    res.json({ profile: profileOf(s), defaultImages: countDefaultImages(STORE_PROFILE_FIELDS, profileOf(s)) });
  });

  r.put("/admin/stores/:id/profile", ...manager, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !canEditStore(req, id)) return res.status(403).json({ error: "Không đủ quyền với chi nhánh này." });
    const { data, errors } = validateStoreProfile(req.body);
    if (Object.keys(errors).length) return res.status(400).json({ error: Object.values(errors)[0], fields: errors });
    const s = await prisma.store.update({
      where: { id },
      data: {
        coverImage: json(data.coverImage), story: data.story || null, openedYear: data.openedYear, tagline: data.tagline || null,
        managerName: data.managerName || null, managerPhoto: json(data.managerPhoto), managerQuote: data.managerQuote || null,
        amenities: json(data.amenities), galleryImages: json(data.galleryImages), favoriteSpots: json(data.favoriteSpots),
      },
    }).catch(() => null);
    if (!s) return res.status(404).json({ error: "Không tìm thấy chi nhánh." });
    audit(staffId(req), "STORE_PROFILE_UPDATE", `store:${id}`, s.name);
    res.json({ profile: profileOf(s) });
  });

  return r;
}
