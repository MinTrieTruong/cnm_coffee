/**
 * Thói quen của khách đã đăng nhập: món quen (kèm size / nóng-đá / đá / đường hay chọn), ghi chú mặc định,
 * đơn gần nhất để "Đặt lại". API: GET /api/customer/usual · /api/customer/orders/:id/reorder · PUT /api/customer/default-note.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { api, type Usual } from "./api";
import { getToken } from "./session";
import { withStore } from "./customerStore";

export type UsualProduct = {
  id: number; categoryId: number; name: string; sellPrice: number; priceSizeS: number | null; priceSizeL: number | null;
  hasSizes: boolean; temps: "BOTH" | "ICED" | "HOT" | "NONE"; isActive: boolean; outOfStock: boolean; discountPercent: number | null; imageUrl: string | null;
};
export type UsualItem = {
  productId: number; timesOrdered: number; lastOrderedAt: string; usual: Usual; usualNote: string | null; confidence: number; soldOut: boolean; product: UsualProduct;
};
export type ReorderLine = { productId: number; quantity: number; usual: Usual; note: string; soldOut: boolean; available: boolean; product: UsualProduct };
export type Reorder = { orderId: number; at: string; lines: ReorderLine[]; comboSkipped: boolean };
export type UsualData = { items: UsualItem[]; savedNote: string | null; noteSuggestion: string | null; lastOrder: Reorder | null };

/** Bộ nhớ tạm theo (token, chi nhánh) — nhiều khối trên cùng trang chỉ gọi API 1 lần */
let cache: { key: string; data: UsualData | null; p: Promise<void> } | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function load(key: string, storeId: number | null) {
  if (cache?.key === key) return;
  const entry: NonNullable<typeof cache> = { key, data: null, p: Promise.resolve() };
  entry.p = api<UsualData>(withStore("/api/customer/usual", storeId))
    .then((d) => {
      entry.data = d;
    })
    .catch(() => {
      entry.data = { items: [], savedNote: null, noteSuggestion: null, lastOrder: null };
    })
    .finally(emit);
  cache = entry;
}

/** Tải lại (sau khi lưu ghi chú mặc định / đặt đơn mới) */
export function reloadUsual() {
  cache = null;
  emit();
}

/** Thói quen của khách tại chi nhánh đang chọn; null = chưa đăng nhập hoặc đang tải */
export function useUsual(storeId: number | null): UsualData | null {
  const token = getToken();
  const key = `${token ?? ""}|${storeId ?? ""}`;
  useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => cache,
  );
  useEffect(() => {
    if (token) load(key, storeId);
  }, [key]);
  return token && cache?.key === key ? cache.data : null;
}

/** Các dòng của 1 đơn cũ để đặt lại */
export function fetchReorder(orderId: number, storeId: number | null) {
  return api<Reorder>(withStore(`/api/customer/orders/${orderId}/reorder`, storeId));
}

export async function saveDefaultNote(note: string) {
  const r = await api<{ defaultNote: string | null }>("/api/customer/default-note", { method: "PUT", body: JSON.stringify({ note }) });
  reloadUsual();
  return r.defaultNote;
}

/** Ghi chú mặc định (trang tài khoản) */
export function useDefaultNote(): [string | null, (v: string | null) => void] {
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!getToken()) return;
    api<{ defaultNote: string | null }>("/api/customer/default-note").then((r) => setNote(r.defaultNote ?? "")).catch(() => setNote(""));
  }, []);
  return [note, setNote];
}

/** Nối ghi chú đơn vào ghi chú dòng (bỏ qua nếu dòng đã có) — giữ định dạng "… · <ghi chú tự do>" */
export function withOrderNote(lineNotes: string, orderNote: string) {
  const n = orderNote.replace(/\s+/g, " ").trim();
  if (!n) return lineNotes;
  if (lineNotes.toLowerCase().includes(n.toLowerCase())) return lineNotes;
  return [lineNotes, n].filter(Boolean).join(" · ").slice(0, 512);
}
