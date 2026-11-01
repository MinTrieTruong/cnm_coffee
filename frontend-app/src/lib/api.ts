import { getTableId, getTakeawaySessionId, getToken } from "./session";
import { mapFetchError } from "./net";


export function apiBase(): string {
  if (import.meta.env.DEV) return ""; // Dùng Vite proxy (tránh lỗi Mixed Content trên điện thoại)
  const API_URL = import.meta.env.VITE_API_URL;
  return API_URL ? API_URL.trim() : "http://localhost:4000";
}

export function apiOrigin(): string {
  if (import.meta.env.DEV && typeof window !== "undefined") {
    return window.location.origin;
  }
  const b = apiBase();
  return b || "http://localhost:4000";
}

/** Thông tin bắt tay socket để vào phòng order:<id> / tracking:<id> — máy chủ kiểm đúng chủ đơn */
export function orderSocketAuth() {
  return { customerToken: getToken() ?? undefined, orderSession: getTakeawaySessionId() ?? undefined, tableId: getTableId() ?? undefined };
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const t = getToken();
  if (t) headers.set("Authorization", `Bearer ${t}`);
  // Khách vãng lai: máy chủ chỉ cho xem đơn đúng phiên mang về / đúng bàn của mình
  const sid = getTakeawaySessionId();
  if (sid) headers.set("X-Order-Session", sid);
  const tableId = getTableId();
  if (tableId != null) headers.set("X-Table-Id", String(tableId));
  const base = apiBase();
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...init, headers });
  } catch (e) {
    throw mapFetchError(e);
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {

    }
    if (import.meta.env.DEV && msg === "Internal Server Error") {
      msg =
        "API đang lỗi/không chạy. Kiểm tra backend (cd backend-node && npm run dev), MySQL Docker và thử lại.";
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function mediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const b = apiBase().replace(/\/$/, "");
  return `${b}${url.startsWith("/") ? url : `/${url}`}`;
}

export type Category = {
  id: number;
  name: string;
  sortOrder?: number;
  parentId?: number | null;
  children?: Category[];
};

export type Product = {
  id: number;
  categoryId: number;
  name: string;
  costPrice: number;
  sellPrice: number;
  priceSizeS?: number | null;
  priceSizeL?: number | null;
  /** false = món 1 loại (bánh, đồ ăn): không chọn size */
  hasSizes?: boolean;
  isActive: boolean;
  isBestSeller?: boolean;
  discountPercent?: number | null;
  imageUrl: string | null;
  category?: Category;
};

export type MenuResponse = {
  categories: Category[];
  products: Product[];
  favorites: Product[];
};

export type ComboItem = {
  id: number;
  quantity: number;
  product: {
    id: number;
    name: string;
    sellPrice: number;
    imageUrl: string | null;
    isActive?: boolean;
  };
};

export type Combo = {
  id: number;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  originalPrice: number;
  comboPrice: number;
  isHot: boolean;
  isActive: boolean;
  createdAt?: string;
  items: ComboItem[];
};

export type HomePageResponse = {
  categoryTree: Category[];
  categories: Category[];
  flashSale: Product[];
  bestSellers: Product[];
  hotCombos: Combo[];
};

export function calculateFinalPrice(price: number, discountPercent?: number | null): number {
  if (!discountPercent || discountPercent <= 0) return price;
  return Math.round(price * (1 - discountPercent / 100));
}
