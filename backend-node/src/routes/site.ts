import { Router, type Request } from "express";
import type { PrismaClient } from "@prisma/client";
import { audit } from "../lib/audit.js";
import { contactHref, formatVnPhone, normalizeVnPhone } from "../lib/contactLinks.js";
import { getStoreSettings } from "../lib/pricing.js";
import { reqStoreId } from "../lib/storeScope.js";
import { attachStaff, isOwner, requireRoles, type StaffRequest } from "../middleware/staff.js";
import { mergeButtons } from "./contactButtons.js";

const idOf = (req: Request) => Number(req.params.id);
const storeParam = (req: Request) => {
  const raw = req.query.storeId ?? req.query.store;
  return raw != null && /^\d+$/.test(String(raw)) ? Number(raw) : null;
};
/** Link banner: nội bộ "/…" hoặc https:// */
const cleanLink = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  if (/^\/(?!\/)\S*$/.test(s) || /^https:\/\/\S+$/i.test(s)) return s.slice(0, 500);
  return undefined;
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HEX = /^#[0-9a-f]{6}$/i;
type Occasion = { id: string; until: string | null; effects: boolean };
type SiteTheme = {
  preset: string; primary: string; accent: string; defaultMode: "light" | "dark" | "auto"; allowToggle: boolean; occasion: Occasion | null;
  /** Hiện thông tin dinh dưỡng (nhãn, bảng ước tính, bộ lọc ăn kiêng) cho khách */
  showNutrition: boolean;
  /** Hiện khối "Hợp thời tiết hôm nay" trên trang chủ */
  showWeatherPicks: boolean;
};
/** Màu mặc định "gạch bông Sài Gòn" — trùng customer-tokens.css */
const DEFAULT_THEME: SiteTheme = { preset: "gach-bong", primary: "#1e5a5f", accent: "#e0a531", defaultMode: "light", allowToggle: true, occasion: null, showNutrition: true, showWeatherPicks: true };
/** Chủ đề dịp lễ — trùng frontend lib/occasions.ts */
const OCCASION_IDS = ["tet", "8-3", "30-4", "noel"];
const YMD = /^\d{4}-\d{2}-\d{2}$/;
function readOccasion(raw: unknown): Occasion | null {
  const o = (raw && typeof raw === "object" ? raw : null) as Partial<Occasion> | null;
  if (!o || typeof o.id !== "string" || !OCCASION_IDS.includes(o.id)) return null;
  return { id: o.id, until: typeof o.until === "string" && YMD.test(o.until) ? o.until : null, effects: o.effects !== false };
}
export function readTheme(raw: unknown): SiteTheme {
  const t = (raw && typeof raw === "object" ? raw : {}) as Partial<SiteTheme>;
  return {
    preset: typeof t.preset === "string" ? t.preset.slice(0, 30) : DEFAULT_THEME.preset,
    primary: typeof t.primary === "string" && HEX.test(t.primary) ? t.primary.toLowerCase() : DEFAULT_THEME.primary,
    accent: typeof t.accent === "string" && HEX.test(t.accent) ? t.accent.toLowerCase() : DEFAULT_THEME.accent,
    defaultMode: t.defaultMode === "dark" || t.defaultMode === "auto" ? t.defaultMode : "light",
    allowToggle: t.allowToggle !== false,
    occasion: readOccasion(t.occasion),
    showNutrition: t.showNutrition !== false,
    showWeatherPicks: t.showWeatherPicks !== false,
  };
}

/** Công tắc hiển thị của trang khách (dinh dưỡng, gợi ý thời tiết) */
export async function siteFlags(prisma: PrismaClient) {
  const s = await getStoreSettings(prisma);
  const t = readTheme(s.siteTheme);
  return { showNutrition: t.showNutrition, showWeatherPicks: t.showWeatherPicks };
}

/** Website khách: thông tin công ty, banner trang chủ, tin liên hệ / đăng ký nhận tin */
export function siteRouter(prisma: PrismaClient) {
  const r = Router();
  const auth = attachStaff(prisma);
  const manager = [auth, requireRoles("Admin")];

  /* ═══════════ Thông tin công ty + chi nhánh + hotline + mạng xã hội ═══════════ */

  r.get("/site-info", async (req, res) => {
    const storeId = storeParam(req);
    const [s, stores, chainButtons, storeButtons] = await Promise.all([
      getStoreSettings(prisma),
      prisma.store.findMany({
        where: { isActive: true },
        select: { id: true, name: true, address: true, phone: true, openTime: true, closeTime: true, lat: true, lng: true },
        orderBy: { id: "asc" },
      }),
      prisma.contactButton.findMany({ where: { storeId: null } }),
      storeId ? prisma.contactButton.findMany({ where: { storeId } }) : Promise.resolve([]),
    ]);
    const buttons = mergeButtons(chainButtons, storeButtons);
    const phoneBtn = buttons.find((b) => b.type === "PHONE");
    const hotline = phoneBtn?.value || s.companyPhone;
    res.set("Cache-Control", "no-store");
    res.json({
      company: { name: s.companyName, intro: s.companyIntro, address: s.companyAddress, email: s.companyEmail, phone: s.companyPhone, hours: s.companyHours },
      theme: readTheme(s.siteTheme),
      hotline: { value: hotline, display: formatVnPhone(hotline), href: `tel:${hotline}` },
      stores,
      // Mạng xã hội ở footer = nút liên hệ đang bật (Zalo, Messenger, TikTok…) — không ghi cứng link
      socials: buttons.filter((b) => b.type !== "PHONE").map((b) => ({ id: b.id, type: b.type, label: b.label, icon: b.icon, href: contactHref(b.type as never, b.value) })),
    });
  });

  r.patch("/admin/site-info", auth, requireRoles("Owner"), async (req, res) => {
    const b = req.body as Partial<Record<"companyName" | "companyIntro" | "companyAddress" | "companyEmail" | "companyPhone" | "companyHours", string>>;
    const data: Record<string, string> = {};
    const errors: Record<string, string> = {};
    const text = (k: keyof typeof b, max: number, label: string) => {
      if (b[k] === undefined) return;
      const v = String(b[k]).trim();
      if (!v) errors[k] = `Nhập ${label}.`;
      else data[k] = v.slice(0, max);
    };
    text("companyName", 150, "tên công ty");
    text("companyIntro", 500, "mô tả ngắn");
    text("companyAddress", 255, "địa chỉ");
    text("companyHours", 100, "giờ mở cửa");
    if (b.companyEmail !== undefined) {
      if (!EMAIL.test(String(b.companyEmail).trim())) errors.companyEmail = "Email chưa đúng.";
      else data.companyEmail = String(b.companyEmail).trim().slice(0, 150);
    }
    if (b.companyPhone !== undefined) {
      const p = normalizeVnPhone(String(b.companyPhone));
      if (!p) errors.companyPhone = "Số điện thoại chưa đúng.";
      else data.companyPhone = p;
    }
    if (Object.keys(errors).length) return res.status(400).json({ error: Object.values(errors)[0], fields: errors });
    await getStoreSettings(prisma);
    const s = await prisma.storeSettings.update({ where: { id: 1 }, data });
    audit((req as StaffRequest).staffRow!.id, "SITE_INFO_UPDATE", "Thông tin công ty", Object.keys(data).join(", "));
    res.json(s);
  });

  /** Website › Giao diện: màu chủ đạo, màu nhấn, chế độ sáng/tối mặc định */
  r.patch("/admin/site-theme", auth, requireRoles("Owner"), async (req, res) => {
    const b = (req.body ?? {}) as Partial<SiteTheme>;
    const errors: Record<string, string> = {};
    if (!b.primary || !HEX.test(b.primary)) errors.primary = "Màu chủ đạo dạng #rrggbb.";
    if (!b.accent || !HEX.test(b.accent)) errors.accent = "Màu nhấn dạng #rrggbb.";
    if (b.defaultMode && !["light", "dark", "auto"].includes(b.defaultMode)) errors.defaultMode = "Chế độ không hợp lệ.";
    if (Object.keys(errors).length) return res.status(400).json({ error: Object.values(errors)[0], fields: errors });
    const theme = readTheme(b);
    await getStoreSettings(prisma);
    await prisma.storeSettings.update({ where: { id: 1 }, data: { siteTheme: theme } });
    audit((req as StaffRequest).staffRow!.id, "SITE_THEME_UPDATE", "Giao diện trang khách", `${theme.primary} · ${theme.accent} · ${theme.defaultMode} · dinh dưỡng ${theme.showNutrition ? "hiện" : "ẩn"} · thời tiết ${theme.showWeatherPicks ? "hiện" : "ẩn"}${theme.occasion ? ` · lễ ${theme.occasion.id}${theme.occasion.until ? ` tới ${theme.occasion.until}` : ""}` : ""}`);
    res.json(theme);
  });

  /* ═══════════ Banner trang chủ ═══════════ */

  r.get("/banners", async (req, res) => {
    const storeId = storeParam(req);
    const rows = await prisma.banner.findMany({
      where: { isActive: true, OR: [{ storeId: null }, ...(storeId ? [{ storeId }] : [])] },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      take: 8,
    });
    res.set("Cache-Control", "no-store");
    res.json(rows.map((b) => ({ id: b.id, imageUrl: b.imageUrl, title: b.title, subtitle: b.subtitle, link: b.link })));
  });

  /** Chủ chuỗi thấy mọi banner; quản lý chi nhánh thấy banner cả chuỗi (chỉ xem) + banner chi nhánh mình */
  r.get("/admin/banners", ...manager, async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const sid = reqStoreId(req);
    const rows = await prisma.banner.findMany({
      where: isOwner(staff.role) && sid == null ? {} : { OR: [{ storeId: null }, { storeId: sid ?? -1 }] },
      include: { store: { select: { id: true, name: true } } },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    res.json(rows.map((b) => ({ ...b, editable: isOwner(staff.role) || b.storeId === staff.storeId })));
  });

  function parseBanner(req: Request) {
    const b = req.body as { imageUrl?: string; title?: string; subtitle?: string; link?: string; sortOrder?: number; isActive?: boolean; storeId?: number | null };
    const staff = (req as StaffRequest).staffRow!;
    const errors: Record<string, string> = {};
    const imageUrl = b.imageUrl?.trim();
    if (!imageUrl) errors.imageUrl = "Tải ảnh banner.";
    const link = cleanLink(b.link);
    if (link === undefined) errors.link = "Đường dẫn bắt đầu bằng / hoặc https://";
    const storeId = isOwner(staff.role) ? (b.storeId == null ? null : Number(b.storeId)) : staff.storeId!;
    return {
      errors,
      data: {
        imageUrl: imageUrl ?? "", title: b.title?.trim().slice(0, 120) || null, subtitle: b.subtitle?.trim().slice(0, 200) || null,
        link: link ?? null, sortOrder: Number.isInteger(Number(b.sortOrder)) ? Number(b.sortOrder) : 0, isActive: b.isActive !== false,
        storeId: storeId != null && Number.isInteger(storeId) ? storeId : null,
      },
    };
  }

  r.post("/admin/banners", ...manager, async (req, res) => {
    const { errors, data } = parseBanner(req);
    if (Object.keys(errors).length) return res.status(400).json({ error: Object.values(errors)[0], fields: errors });
    const staff = (req as StaffRequest).staffRow!;
    const b = await prisma.banner.create({ data: { ...data, createdById: staff.id } });
    audit(staff.id, "BANNER_CREATE", `Banner #${b.id}`, b.title ?? b.imageUrl);
    res.status(201).json(b);
  });

  r.put("/admin/banners/:id", ...manager, async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const old = await prisma.banner.findUnique({ where: { id: idOf(req) } });
    if (!old) return res.status(404).json({ error: "Không tìm thấy banner." });
    if (!isOwner(staff.role) && old.storeId !== staff.storeId) return res.status(403).json({ error: "Banner cả chuỗi do Chủ chuỗi quản lý." });
    const { errors, data } = parseBanner(req);
    if (Object.keys(errors).length) return res.status(400).json({ error: Object.values(errors)[0], fields: errors });
    const b = await prisma.banner.update({ where: { id: old.id }, data });
    audit(staff.id, "BANNER_UPDATE", `Banner #${b.id}`, `${b.title ?? ""}${old.isActive !== b.isActive ? ` · ${b.isActive ? "Bật" : "Tắt"}` : ""}`);
    res.json(b);
  });

  r.delete("/admin/banners/:id", ...manager, async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const old = await prisma.banner.findUnique({ where: { id: idOf(req) } });
    if (!old) return res.status(404).json({ error: "Không tìm thấy banner." });
    if (!isOwner(staff.role) && old.storeId !== staff.storeId) return res.status(403).json({ error: "Banner cả chuỗi do Chủ chuỗi quản lý." });
    await prisma.banner.delete({ where: { id: old.id } });
    audit(staff.id, "BANNER_DELETE", `Banner #${old.id}`, old.title ?? old.imageUrl);
    res.json({ ok: true });
  });

  /* ═══════════ Liên hệ từ khách / đăng ký nhận tin ═══════════ */

  r.post("/contact-messages", async (req, res) => {
    const b = (req.body ?? {}) as { kind?: string; name?: string; email?: string; phone?: string; message?: string; storeId?: number; website?: string };
    // Ô ẩn chống bot: người thật không điền
    if (b.website) return res.json({ ok: true });
    const kind = b.kind === "NEWSLETTER" ? "NEWSLETTER" : "CONTACT";
    const errors: Record<string, string> = {};
    const email = b.email?.trim() ?? "";
    const name = b.name?.trim() ?? "";
    const message = b.message?.trim() ?? "";
    const phone = b.phone?.trim() ? normalizeVnPhone(b.phone) : null;
    if (!EMAIL.test(email)) errors.email = "Email chưa đúng.";
    if (kind === "CONTACT") {
      if (!name) errors.name = "Nhập họ tên.";
      if (b.phone?.trim() && !phone) errors.phone = "Số điện thoại chưa đúng.";
      if (message.length < 5) errors.message = "Nhập nội dung (ít nhất 5 ký tự).";
    }
    if (Object.keys(errors).length) return res.status(400).json({ error: Object.values(errors)[0], fields: errors });
    if (kind === "NEWSLETTER" && (await prisma.contactMessage.findFirst({ where: { kind, email }, select: { id: true } }))) {
      return res.json({ ok: true, already: true });
    }
    await prisma.contactMessage.create({
      data: {
        kind, email: email.slice(0, 150), name: name.slice(0, 120) || null, phone, message: message.slice(0, 4000) || null,
        storeId: Number.isInteger(b.storeId) ? b.storeId : null,
      },
    });
    res.status(201).json({ ok: true });
  });

  r.get("/admin/contact-messages", ...manager, async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const sid = reqStoreId(req);
    const rows = await prisma.contactMessage.findMany({
      where: isOwner(staff.role) && sid == null ? {} : { OR: [{ storeId: sid ?? -1 }, { storeId: null }] },
      include: { store: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });
    res.json(rows);
  });

  r.patch("/admin/contact-messages/:id", ...manager, async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const handled = (req.body as { handled?: boolean }).handled !== false;
    const m = await prisma.contactMessage.update({
      where: { id: idOf(req) },
      data: handled ? { status: "HANDLED", handledById: staff.id, handledAt: new Date() } : { status: "NEW", handledById: null, handledAt: null },
    });
    res.json(m);
  });

  return r;
}
