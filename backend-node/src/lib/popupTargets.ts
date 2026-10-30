import type { PrismaClient } from "@prisma/client";

/**
 * DANH SÁCH LOẠI ĐÍCH CỦA POP UP — khai báo MỘT chỗ duy nhất.
 * Backend dùng để kiểm tra dữ liệu, sinh đường dẫn, nhãn hiển thị và loại pop up có đích đã hết hạn;
 * frontend lấy danh sách qua GET /api/admin/popups/meta (dropdown) và nhận sẵn `href` trong /api/popups/active.
 * Thêm loại đích mới: thêm 1 dòng vào POPUP_TARGETS (nếu cần chọn đối tượng thì khai báo `ref` + loader bên dưới).
 */

/** Loại đối tượng cần chọn kèm theo (dropdown thứ hai) */
export type RefKind = "voucher" | "game" | "category" | "product" | "post" | "url";

type TargetDef = {
  label: string;
  ref: RefKind | null;
  /** Đường dẫn khách được đưa tới */
  href: (ref: string | null) => string;
  /** Phải đăng nhập mới vào được (khách chưa đăng nhập đi qua /login?next=…) */
  needsLogin?: boolean;
};

export const POPUP_TARGETS = {
  PROMOTIONS: { label: "Ưu đãi", ref: null, href: () => "/promotions" },
  VOUCHER: { label: "Một voucher cụ thể", ref: "voucher", href: (r) => `/promotions?voucher=${r}` },
  MINIGAME: { label: "Mini game", ref: "game", href: (r) => `/game/${r}`, needsLogin: true },
  CATEGORY: { label: "Danh mục", ref: "category", href: (r) => `/menu?category=${r}` },
  PRODUCT: { label: "Sản phẩm nổi bật / một món", ref: "product", href: (r) => `/product/${r}` },
  CART: { label: "Giỏ hàng của bạn", ref: null, href: () => "/cart" },
  ABOUT: { label: "Thông tin về chúng tôi", ref: null, href: () => "/about" },
  NEWS: { label: "Tin tức", ref: null, href: () => "/blog" },
  POST: { label: "Một bài tin cụ thể", ref: "post", href: (r) => `/blog/${r}` },
  ACCOUNT: { label: "Tài khoản / Quà của tôi", ref: null, href: () => "/account" },
  URL: { label: "Liên kết tùy chỉnh", ref: "url", href: (r) => r ?? "/" },
} satisfies Record<string, TargetDef>;

export type PopupTargetType = keyof typeof POPUP_TARGETS;
export const POPUP_TARGET_TYPES = Object.keys(POPUP_TARGETS) as PopupTargetType[];
export const isTargetType = (t: unknown): t is PopupTargetType => typeof t === "string" && t in POPUP_TARGETS;

/** Nhãn tên đối tượng của từng loại tham chiếu (dòng phụ "Mini game: Vòng quay tháng 11") */
const REF_LABEL: Record<RefKind, string> = { voucher: "Voucher", game: "Mini game", category: "Danh mục", product: "Món", post: "Bài tin", url: "Liên kết" };

/** URL nội bộ bắt đầu bằng "/" (không phải "//"), hoặc https:// mở tab mới */
export function normalizeUrl(raw: string | null | undefined): string | null {
  const s = raw?.trim() ?? "";
  if (/^\/(?!\/)[^\s]*$/.test(s)) return s.slice(0, 500);
  if (/^https:\/\/[^\s]+$/i.test(s)) return s.slice(0, 500);
  return null;
}

export type RefOption = { value: string; label: string; sub?: string; image?: string | null };

/** Dropdown thứ hai: danh sách đối tượng có tìm kiếm */
export async function refOptions(prisma: PrismaClient, kind: RefKind, q: string): Promise<RefOption[]> {
  const contains = q.trim() ? { contains: q.trim() } : undefined;
  const now = new Date();
  switch (kind) {
    case "voucher":
      return (await prisma.voucher.findMany({
        where: { isActive: true, endDate: { gte: now }, ...(contains ? { OR: [{ code: contains }, { description: contains }] } : {}) },
        orderBy: { createdAt: "desc" }, take: 50,
      })).map((v) => ({ value: String(v.id), label: v.code, sub: v.description ?? `Giảm ${v.discountValue.toLocaleString("vi-VN")}đ` }));
    case "game":
      // Chỉ chiến dịch đang bật
      return (await prisma.gameCampaign.findMany({
        where: { isActive: true, endAt: { gte: now }, ...(contains ? { name: contains } : {}) },
        orderBy: { startAt: "desc" }, take: 50,
      })).map((c) => ({ value: String(c.id), label: c.name, sub: `đến ${c.endAt.toLocaleDateString("vi-VN")}` }));
    case "category":
      return (await prisma.category.findMany({ where: contains ? { name: contains } : {}, orderBy: { sortOrder: "asc" }, take: 100 }))
        .map((c) => ({ value: String(c.id), label: c.name }));
    case "product":
      return (await prisma.product.findMany({ where: { isActive: true, ...(contains ? { name: contains } : {}) }, orderBy: { name: "asc" }, take: 50 }))
        .map((p) => ({ value: String(p.id), label: p.name, sub: `${p.sellPrice.toLocaleString("vi-VN")}đ`, image: p.imageUrl }));
    case "post":
      return (await prisma.post.findMany({ where: { isPublished: true, ...(contains ? { title: contains } : {}) }, orderBy: { createdAt: "desc" }, take: 50 }))
        .map((p) => ({ value: String(p.id), label: p.title, image: p.imageUrl }));
    case "url":
      return [];
  }
}

/** Tên đối tượng của 1 đích (null nếu không tìm thấy) */
async function refName(prisma: PrismaClient, kind: RefKind, ref: string): Promise<string | null> {
  if (kind === "url") return ref;
  const id = Number(ref);
  if (!Number.isInteger(id)) return null;
  switch (kind) {
    case "voucher": return (await prisma.voucher.findUnique({ where: { id }, select: { code: true } }))?.code ?? null;
    case "game": return (await prisma.gameCampaign.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
    case "category": return (await prisma.category.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
    case "product": return (await prisma.product.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
    case "post": return (await prisma.post.findUnique({ where: { id }, select: { title: true } }))?.title ?? null;
  }
}

/** Kiểm tra đích khi lưu; trả về targetRef đã chuẩn hoá, ném Error(message) nếu sai */
export async function validateTarget(prisma: PrismaClient, type: unknown, ref: unknown): Promise<{ type: PopupTargetType; ref: string | null }> {
  if (!isTargetType(type)) throw new Error("Chọn đường dẫn đến trang.");
  const def: TargetDef = POPUP_TARGETS[type];
  if (!def.ref) return { type, ref: null };
  if (def.ref === "url") {
    const url = normalizeUrl(typeof ref === "string" ? ref : null);
    if (!url) throw new Error("Liên kết phải là đường dẫn nội bộ bắt đầu bằng / hoặc https://…");
    return { type, ref: url };
  }
  const s = ref == null ? "" : String(ref).trim();
  if (!s) throw new Error(`Chọn ${REF_LABEL[def.ref].toLowerCase()} cho đường dẫn.`);
  if (!(await refName(prisma, def.ref, s))) throw new Error(`${REF_LABEL[def.ref]} đã chọn không tồn tại.`);
  return { type, ref: s };
}

/** Nhãn đích cho trang quản trị, vd "Mini game: Vòng quay tháng 11" */
export async function describeTarget(prisma: PrismaClient, type: string, ref: string | null): Promise<string> {
  if (!isTargetType(type)) return type;
  const def: TargetDef = POPUP_TARGETS[type];
  if (!def.ref || !ref) return def.label;
  const name = await refName(prisma, def.ref, ref);
  return `${REF_LABEL[def.ref]}: ${name ?? `#${ref} (không còn tồn tại)`}`;
}

/** Đích còn dùng được không — pop up trỏ tới voucher / mini game đã hết hạn hoặc tắt thì tự ẩn phía khách */
export async function targetAlive(prisma: PrismaClient, type: string, ref: string | null, now = new Date()): Promise<boolean> {
  if (!isTargetType(type)) return false;
  const def: TargetDef = POPUP_TARGETS[type];
  if (!def.ref || def.ref === "url") return true;
  const id = Number(ref);
  if (!Number.isInteger(id)) return false;
  switch (def.ref) {
    case "voucher": {
      const v = await prisma.voucher.findUnique({ where: { id } });
      return !!v && v.isActive && v.startDate <= now && v.endDate >= now && (v.quantity === -1 || v.usedCount < v.quantity);
    }
    case "game": {
      const c = await prisma.gameCampaign.findUnique({ where: { id } });
      return !!c && c.isActive && c.startAt <= now && c.endAt >= now;
    }
    case "product": return !!(await prisma.product.findFirst({ where: { id, isActive: true }, select: { id: true } }));
    case "post": return !!(await prisma.post.findFirst({ where: { id, isPublished: true }, select: { id: true } }));
    case "category": return !!(await prisma.category.findUnique({ where: { id }, select: { id: true } }));
  }
}

/** Dữ liệu cho dropdown phía quản trị */
export const targetMeta = () =>
  POPUP_TARGET_TYPES.map((type) => {
    const d: TargetDef = POPUP_TARGETS[type];
    return { type, label: d.label, ref: d.ref, refLabel: d.ref ? REF_LABEL[d.ref] : null, path: d.ref && d.ref !== "url" ? d.href(`<${d.ref}>`) : d.ref ? null : d.href(null) };
  });
