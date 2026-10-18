import type { Product, Combo } from "./api";

export type CartItem = {
  productId: number;
  name: string;
  unitPrice: number;
  quantity: number;
  imageUrl: string | null;
  size: "S" | "M" | "L";
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

function save(items: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

export function getCart(): CartItem[] {
  return load();
}

export function addToCart(
  product: Product,
  opts: Omit<CartItem, "productId" | "name" | "imageUrl">,
) {
  const items = load();
  // Gộp nếu trùng product + size + đá + đường + notes
  const key = `${product.id}|${opts.size}|${opts.icePct}|${opts.sugar}|${opts.notes}`;
  const existing = items.find(
    (i) => `${i.productId}|${i.size}|${i.icePct}|${i.sugar}|${i.notes}` === key,
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
