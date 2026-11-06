import type { Product, Combo } from "./api";

export type CartItem = {
  productId: number;
  name: string;
  unitPrice: number;
  quantity: number;
  imageUrl: string | null;
  size: "S" | "M" | "L";
  /** Nóng / đá (null = món không áp dụng) */
  temp?: "HOT" | "ICED" | null;
  icePct: 0 | 50 | 100;
  sugar: "0" | "50" | "100";
  notes: string;
  /// Nếu đây là combo: lưu comboId để truyền lên backend khi tạo đơn
  comboId?: number | null;
  isCombo?: boolean;
};

const CART_KEY = "cmn_cart";
export const CART_BACKUP_KEY = "cmn_cart_backup";

function load(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CartItem[];
  } catch {
    return [];
  }
}

/** Sự kiện báo giỏ hàng đổi (header cập nhật số lượng) */
export const CART_EVENT = "cmn:cart";

function save(items: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CART_EVENT));
}

export function getCart(): CartItem[] {
  return load();
}

export function addToCart(
  product: Product,
  opts: Omit<CartItem, "productId" | "name" | "imageUrl">,
) {
  const items = load();
  // Gộp nếu trùng product + size + nóng/đá + đá + đường + notes
  const key = `${product.id}|${opts.size}|${opts.temp ?? ""}|${opts.icePct}|${opts.sugar}|${opts.notes}`;
  const existing = items.find(
    (i) => `${i.productId}|${i.size}|${i.temp ?? ""}|${i.icePct}|${i.sugar}|${i.notes}` === key,
  );
  if (existing) {
    existing.quantity += opts.quantity;
  } else {
    items.push({
      productId: product.id,
      name: product.name,
      imageUrl: product.imageUrl,
      ...opts,
    });
  }
  save(items);
}

export function removeLine(index: number) {
  const items = load();
  items.splice(index, 1);
  save(items);
}

/** Xoá nhiều dòng một lúc (chọn tất cả / vuốt xoá trong giỏ) */
export function removeLines(indexes: number[]) {
  const drop = new Set(indexes);
  save(load().filter((_, i) => !drop.has(i)));
}

/** Khoá ổn định của một dòng giỏ (cùng tiêu chí gộp ở addToCart/addComboToCart) */
export function lineKey(i: CartItem) {
  return i.isCombo ? `combo|${i.comboId}` : `${i.productId}|${i.size}|${i.temp ?? ""}|${i.icePct}|${i.sugar}|${i.notes}`;
}

/** Bớt 1 món ở dòng thêm gần nhất của sản phẩm (nút − trên thẻ món ngoài menu) */
export function decProduct(productId: number) {
  const items = load();
  for (let i = items.length - 1; i >= 0; i--) {
    if (!items[i].isCombo && items[i].productId === productId) return updateQty(i, items[i].quantity - 1);
  }
}

/** Cập nhật số lượng; nếu qty <= 0 thì xóa dòng đó */
export function updateQty(index: number, qty: number) {
  const items = load();
  if (qty <= 0) {
    items.splice(index, 1);
  } else {
    items[index].quantity = qty;
  }
  save(items);
}

export function clearCart() {
  localStorage.removeItem(CART_KEY);
}

export function backupCart() {
  const raw = localStorage.getItem(CART_KEY);
  if (raw) localStorage.setItem(CART_BACKUP_KEY, raw);
}

export function restoreCartFromBackup() {
  const raw = localStorage.getItem(CART_BACKUP_KEY);
  if (raw) {
    localStorage.setItem(CART_KEY, raw);
    localStorage.removeItem(CART_BACKUP_KEY);
  }
}

export function clearCartBackup() {
  localStorage.removeItem(CART_BACKUP_KEY);
}

export function cartTotal(items: CartItem[]) {
  return items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
}

/**
 * Thêm 1 combo vào giỏ hàng.
 * Combo được lưu như một CartItem duy nhất (diện dạng của combo, không phải từng món riêng lẻ).
 * Backend sẽ dùng comboId để tra cứu các món bên trong và trừ kho.
 */
export function addComboToCart(combo: Combo) {
  const items = load();
  // Mỗi combo là một dòng độc lập trong giỏ hàng (không gộp)
  const existing = items.find((i) => i.comboId === combo.id && i.isCombo);
  if (existing) {
    existing.quantity += 1;
  } else {
    items.push({
      productId: 0, // placeholder — backend dùng comboId
      name: combo.name,
      imageUrl: combo.imageUrl ?? null,
      unitPrice: combo.comboPrice,
      quantity: 1,
      size: "M",
      icePct: 100,
      sugar: "100",
      notes: "",
      comboId: combo.id,
      isCombo: true,
    });
  }
  save(items);
}

/** Ghi chú đồ uống gửi kèm dòng món (pha chế đọc trên KDS): "Size M · Đá 100% · Đường 100%" / "Size M · Nóng · Đường 50%" */
export function drinkNotes(o: { size: string; temp: "HOT" | "ICED" | null; icePct: number; sugar: string }) {
  return [`Size ${o.size}`, o.temp === "HOT" ? "Nóng" : o.temp === "ICED" ? `Đá ${o.icePct}%` : null, `Đường ${o.sugar}%`].filter(Boolean).join(" · ");
}
