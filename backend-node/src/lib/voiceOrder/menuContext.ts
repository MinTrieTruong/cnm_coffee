/**
 * lib/voiceOrder/menuContext.ts — Thực đơn của chi nhánh gửi kèm cho AI đặt món (chỉ chọn được món có thật).
 *
 * Gồm: món đang bán + món chuỗi có nhưng chi nhánh đang hết (để AI nói "đang hết"), combo bán được ở chi nhánh.
 * Món chi nhánh tắt hẳn (isAvailable = false) / ngừng toàn chuỗi thì không gửi — với khách là "quán chưa có".
 * Cache 60 giây theo chi nhánh; announceMenuChange() và sửa món xóa cache ngay.
 */
import { prisma } from "../../db.js";
import { storeMenuState } from "../storeProducts.js";
import { unitPriceOf } from "../menuPrice.js";
import { parseAliases } from "../productAliases.js";

export type MenuProduct = {
  id: number;
  name: string;
  aliases: string[];
  category: string;
  /** false = món 1 loại (bánh…): không size / đá / đường */
  hasSizes: boolean;
  /** BOTH | ICED | HOT | NONE */
  temps: string;
  outOfStock: boolean;
  imageUrl: string | null;
  sellPrice: number;
  priceSizeS: number | null;
  priceSizeL: number | null;
  discountPercent: number | null;
};
export type MenuCombo = { id: number; name: string; price: number; imageUrl: string | null; items: string[] };
export type MenuContext = { storeId: number; products: MenuProduct[]; combos: MenuCombo[]; at: number };

const TTL_MS = 60_000;
const cache = new Map<number, MenuContext>();

/** Xóa cache (một chi nhánh, hoặc tất cả khi sửa món chung của chuỗi) */
export function invalidateMenuContext(storeId?: number) {
  if (storeId == null) cache.clear();
  else cache.delete(storeId);
}

export async function buildMenuContext(storeId: number): Promise<MenuContext> {
  const hit = cache.get(storeId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;

  const [{ disabled, soldOut }, rows, combos] = await Promise.all([
    storeMenuState(prisma, storeId),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: [{ categoryId: "asc" }, { id: "asc" }],
      select: {
        id: true, name: true, aliases: true, hasSizes: true, temps: true, outOfStock: true, imageUrl: true,
        sellPrice: true, priceSizeS: true, priceSizeL: true, discountPercent: true, category: { select: { name: true } },
      },
    }),
    prisma.combo.findMany({
      where: { isActive: true },
      select: { id: true, name: true, comboPrice: true, imageUrl: true, items: { select: { productId: true, quantity: true, product: { select: { name: true, isActive: true } } } } },
    }),
  ]);
  const products: MenuProduct[] = rows
    .filter((p) => !disabled.has(p.id))
    .map((p) => ({ ...p, aliases: parseAliases(p.aliases), category: p.category.name, outOfStock: p.outOfStock || soldOut.has(p.id) }));
  const sellable = new Set(products.filter((p) => !p.outOfStock).map((p) => p.id));
  const ctx: MenuContext = {
    storeId,
    products,
    // Combo bán được khi mọi món bên trong đang bán ở chi nhánh
    combos: combos
      .filter((c) => c.items.length && c.items.every((i) => i.product.isActive && sellable.has(i.productId)))
      .map((c) => ({ id: c.id, name: c.name, price: c.comboPrice, imageUrl: c.imageUrl, items: c.items.map((i) => `${i.quantity > 1 ? `${i.quantity} ` : ""}${i.product.name}`) })),
    at: Date.now(),
  };
  cache.set(storeId, ctx);
  return ctx;
}

/** Thực đơn dạng chữ gọn cho prompt: "#2 Bạc Xỉu Đá | Cà Phê Phin | size S/M/L | đá/nóng | 29.000đ | gọi khác: bx, bac siu" */
export function menuPromptText(ctx: MenuContext, withCombos: boolean): string {
  const temp: Record<string, string> = { BOTH: "đá/nóng", ICED: "chỉ đá", HOT: "chỉ nóng", NONE: "" };
  const lines = ctx.products.map((p) =>
    [
      `#${p.id} ${p.name}`,
      p.category,
      p.hasSizes ? "size S/M/L" : "đồ ăn, không size/đá/đường",
      p.hasSizes ? temp[p.temps] : "",
      `${unitPriceOf(p, "M").toLocaleString("vi-VN")}đ`,
      p.aliases.length ? `gọi khác: ${p.aliases.join(", ")}` : "",
      p.outOfStock ? "ĐANG HẾT" : "",
    ]
      .filter(Boolean)
      .join(" | "),
  );
  const combos = withCombos && ctx.combos.length ? ["", "COMBO:", ...ctx.combos.map((c) => `C${c.id} ${c.name} | gồm ${c.items.join(" + ")} | ${c.price.toLocaleString("vi-VN")}đ`)] : [];
  return [...lines, ...combos].join("\n");
}
