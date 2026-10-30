import { Router, type Request } from "express";
import type { ContactButton, PrismaClient } from "@prisma/client";
import { audit } from "../lib/audit.js";
import {
  CONTACT_DEFAULTS, CONTACT_TYPES, CUSTOM_ICONS, contactHref, formatVnPhone, isContactType, normalizeColor, normalizeContact, normalizeIcon,
  type ContactType,
} from "../lib/contactLinks.js";
import { attachStaff, isOwner, requireRoles, type StaffRequest } from "../middleware/staff.js";

type ButtonInput = {
  id?: number;
  type?: string;
  label?: string;
  value?: string;
  color?: string | null;
  icon?: string | null;
  isActive?: boolean;
};

/** Dữ liệu 1 nút gửi cho trang khách / khung xem trước */
function toPublic(b: Pick<ContactButton, "id" | "type" | "label" | "value" | "color" | "icon" | "storeId">) {
  const type = b.type as ContactType;
  const color = b.color ?? (type === "CUSTOM" && b.icon && CUSTOM_ICONS[b.icon] ? CUSTOM_ICONS[b.icon].color : CONTACT_DEFAULTS[type].color);
  return {
    id: b.id, type, label: b.label, color, icon: b.icon, href: contactHref(type, b.value),
    phone: type === "PHONE" ? b.value : null,
    phoneDisplay: type === "PHONE" ? formatVnPhone(b.value) : null,
    fromChain: b.storeId == null,
  };
}

/**
 * Gộp nút chi nhánh + mặc định chuỗi: loại nào chi nhánh đã khai báo (có giá trị) thì dùng nút chi nhánh
 * (kể cả khi chi nhánh tắt hết nút loại đó → ẩn), loại chưa khai báo thì lấy nút của chuỗi.
 */
export function mergeButtons(chain: ContactButton[], store: ContactButton[]) {
  const declared = new Set(store.filter((b) => b.value).map((b) => b.type));
  return [...store.filter((b) => b.value), ...chain.filter((b) => b.value && !declared.has(b.type))]
    .filter((b) => b.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.storeId == null ? 1 : 0) - (b.storeId == null ? 1 : 0) || a.id - b.id);
}

export function contactButtonsRouter(prisma: PrismaClient) {
  const r = Router();
  const manager = [attachStaff(prisma), requireRoles("Admin")];

  /** Phạm vi quản lý được sửa: Chủ chuỗi sửa "chain" và mọi chi nhánh; quản lý chỉ chi nhánh mình */
  function scopeOf(req: Request): { storeId: number | null } | { error: string } {
    const staff = (req as StaffRequest).staffRow!;
    const raw = String(req.query.storeId ?? (req.body as { storeId?: unknown })?.storeId ?? "");
    const storeId = raw === "" || raw === "chain" || raw === "null" ? null : Number(raw);
    if (storeId !== null && !Number.isInteger(storeId)) return { error: "Chi nhánh không hợp lệ." };
    if (isOwner(staff.role)) return { storeId };
    if (storeId === null || storeId !== staff.storeId) return { error: "Bạn chỉ cấu hình được nút liên hệ của chi nhánh mình." };
    return { storeId };
  }

  r.get("/admin/contact-buttons/meta", ...manager, async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const stores = await prisma.store.findMany({
      where: { isActive: true, ...(isOwner(staff.role) ? {} : { id: staff.storeId ?? -1 }) },
      select: { id: true, name: true }, orderBy: { id: "asc" },
    });
    res.json({
      types: CONTACT_TYPES.map((t) => ({ type: t, ...CONTACT_DEFAULTS[t] })),
      icons: Object.entries(CUSTOM_ICONS).map(([key, v]) => ({ key, ...v })),
      stores, canEditChain: isOwner(staff.role),
    });
  });

  /** Nút của 1 phạm vi + nút mặc định chuỗi (để xem trước khi chi nhánh chưa khai báo) + lượt bấm 30 ngày */
  r.get("/admin/contact-buttons", ...manager, async (req, res) => {
    const scope = scopeOf(req);
    if ("error" in scope) return res.status(403).json({ error: scope.error });
    const [rows, chain] = await Promise.all([
      prisma.contactButton.findMany({ where: { storeId: scope.storeId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
      scope.storeId == null ? Promise.resolve([]) : prisma.contactButton.findMany({ where: { storeId: null }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    ]);
    const since = new Date(Date.now() - 30 * 86_400_000);
    const clicks = await prisma.contactClick.groupBy({
      by: ["buttonId"],
      where: { buttonId: { in: [...rows, ...chain].map((b) => b.id) }, createdAt: { gte: since }, ...(scope.storeId != null ? { storeId: scope.storeId } : {}) },
      _count: true,
    });
    const clickOf = new Map(clicks.map((c) => [c.buttonId, c._count]));
    const withClicks = (list: ContactButton[]) => list.map((b) => ({ ...b, clicks30d: clickOf.get(b.id) ?? 0 }));
    res.json({ storeId: scope.storeId, buttons: withClicks(rows), chain: withClicks(chain) });
  });

  /** Chuẩn hoá khi dán (ô báo lỗi ngay, không cần bấm Lưu) */
  r.post("/admin/contact-buttons/normalize", ...manager, (req, res) => {
    const { type, value } = req.body as { type?: string; value?: string };
    if (!isContactType(type)) return res.status(400).json({ error: "Loại nút không hợp lệ." });
    res.json(normalizeContact(type, value));
  });

  /** Lưu cả danh sách nút của 1 phạm vi (thứ tự = thứ tự trong mảng) */
  r.put("/admin/contact-buttons", ...manager, async (req, res) => {
    const scope = scopeOf(req);
    if ("error" in scope) return res.status(403).json({ error: scope.error });
    const input = ((req.body as { buttons?: ButtonInput[] }).buttons ?? []).slice(0, 20);
    const errors: Record<number, Record<string, string>> = {};
    const clean = input.map((b, i) => {
      const e: Record<string, string> = {};
      if (!isContactType(b.type)) e.type = "Chọn loại nút.";
      const type = (isContactType(b.type) ? b.type : "CUSTOM") as ContactType;
      const norm = normalizeContact(type, b.value);
      if ("error" in norm) e.value = norm.error;
      if (b.isActive !== false && "value" in norm && !norm.value) e.value = "Dán SĐT / link, hoặc tắt nút này.";
      const label = (b.label ?? "").trim() || CONTACT_DEFAULTS[type].label;
      const icon = type === "CUSTOM" ? normalizeIcon(b.icon) : null;
      if (type === "CUSTOM" && !icon) e.icon = "Chọn icon cho nút.";
      if (b.color != null && b.color !== "" && !normalizeColor(b.color)) e.color = "Màu dạng #RRGGBB.";
      if (Object.keys(e).length) errors[i] = e;
      return {
        id: Number.isInteger(b.id) ? b.id : undefined, type, label: label.slice(0, 60), value: "value" in norm ? norm.value : "",
        color: normalizeColor(b.color), icon, isActive: b.isActive !== false, sortOrder: i + 1,
      };
    });
    if (Object.keys(errors).length) {
      return res.status(400).json({ error: "Có ô chưa đúng — xem báo lỗi dưới từng ô.", rows: errors });
    }

    const staff = (req as StaffRequest).staffRow!;
    const old = await prisma.contactButton.findMany({ where: { storeId: scope.storeId } });
    const keep = new Set<number>();
    await prisma.$transaction(async (tx) => {
      for (const b of clean) {
        const data = { type: b.type, label: b.label, value: b.value, color: b.color, icon: b.icon, isActive: b.isActive, sortOrder: b.sortOrder, updatedById: staff.id };
        const prev = b.id ? old.find((o) => o.id === b.id) : undefined;
        if (prev) {
          await tx.contactButton.update({ where: { id: prev.id }, data });
          keep.add(prev.id);
        } else {
          await tx.contactButton.create({ data: { ...data, storeId: scope.storeId } });
        }
      }
      const gone = old.filter((o) => !keep.has(o.id)).map((o) => o.id);
      if (gone.length) await tx.contactButton.deleteMany({ where: { id: { in: gone } } });
    });

    // Nhật ký: nút nào đổi gì
    const changes: string[] = [];
    for (const b of clean) {
      const prev = b.id ? old.find((o) => o.id === b.id) : undefined;
      if (!prev) changes.push(`Thêm ${b.label}`);
      else {
        if (prev.value !== b.value) changes.push(`${b.label}: ${prev.value || "(trống)"} → ${b.value || "(trống)"}`);
        if (prev.isActive !== b.isActive) changes.push(`${b.label}: ${b.isActive ? "Bật" : "Tắt"}`);
      }
    }
    for (const o of old.filter((x) => !keep.has(x.id))) changes.push(`Xóa ${o.label}`);
    const scopeName = scope.storeId == null ? "Mặc định cả chuỗi" : (await prisma.store.findUnique({ where: { id: scope.storeId }, select: { name: true } }))?.name ?? `#${scope.storeId}`;
    audit(staff.id, "CONTACT_BUTTONS_UPDATE", `Nút liên hệ · ${scopeName}`, (changes.join("; ") || "Đổi thứ tự / màu").slice(0, 500));
    res.json({ ok: true });
  });

  /* ═══════════ Trang khách ═══════════ */

  /** Cụm nút đã gộp (chi nhánh + mặc định chuỗi), chỉ nút đang bật, đã chuẩn hoá link, theo thứ tự */
  r.get("/contact-buttons", async (req, res) => {
    const raw = req.query.storeId ?? req.query.store;
    const storeId = raw != null && /^\d+$/.test(String(raw)) ? Number(raw) : null;
    const [chain, store] = await Promise.all([
      prisma.contactButton.findMany({ where: { storeId: null } }),
      storeId ? prisma.contactButton.findMany({ where: { storeId } }) : Promise.resolve([]),
    ]);
    // Không cache lâu: quản lý đổi link là khách thấy ngay
    res.set("Cache-Control", "no-store");
    res.json(mergeButtons(chain, store).map(toPublic));
  });

  r.post("/contact-clicks", async (req, res) => {
    const { buttonId, storeId } = (req.body ?? {}) as { buttonId?: number; storeId?: number | null };
    const b = Number.isInteger(buttonId) ? await prisma.contactButton.findUnique({ where: { id: buttonId }, select: { id: true, type: true } }) : null;
    if (!b) return res.status(400).json({ error: "Nút không tồn tại." });
    await prisma.contactClick.create({ data: { buttonId: b.id, type: b.type, storeId: Number.isInteger(storeId) ? storeId : null } });
    res.json({ ok: true });
  });

  return r;
}
