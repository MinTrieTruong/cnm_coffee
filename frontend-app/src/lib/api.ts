import { getTableId, getTakeawaySessionId, getToken } from "./session";
import { mapFetchError } from "./net";


export function apiBase(): string {
  if (import.meta.env.DEV) return ""; // Dùng Vite proxy (tránh lỗi Mixed Content trên điện thoại)
  // Build production: VITE_API_URL khi API ở tên miền riêng; để trống = cùng tên miền (nginx chuyển /api, /socket.io, /uploads)
  return import.meta.env.VITE_API_URL?.trim().replace(/\/$/, "") ?? "";
}

export function apiOrigin(): string {
  if (import.meta.env.DEV && typeof window !== "undefined") {
    return window.location.origin;
  }
  const b = apiBase();
  return b || (typeof window !== "undefined" ? window.location.origin : "");
}

/** Thông tin bắt tay socket để vào phòng order:<id> / tracking:<id> — máy chủ kiểm đúng chủ đơn */
export function orderSocketAuth() {
  return { customerToken: getToken() ?? undefined, orderSession: getTakeawaySessionId() ?? undefined, tableId: getTableId() ?? undefined };
}

/** Lỗi API kèm mã HTTP và nguyên body (vd. 409 LINK_REQUIRED mang phiếu liên kết) — message vẫn là câu báo lỗi */
export class ApiError extends Error {
  constructor(message: string, public status: number, public data?: Record<string, unknown>) {
    super(message);
  }
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
    let data: Record<string, unknown> | undefined;
    try {
      data = (await res.json()) as Record<string, unknown>;
      if (typeof data.error === "string") msg = data.error;
    } catch {

    }
    if (import.meta.env.DEV && msg === "Internal Server Error") {
      msg =
        "API đang lỗi/không chạy. Kiểm tra backend (cd backend-node && npm run dev), MySQL Docker và thử lại.";
    }
    throw new ApiError(msg, res.status, data);
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
  /** Nhiệt độ phục vụ: BOTH = khách chọn, ICED = chỉ đá, HOT = chỉ nóng, NONE = không áp dụng */
  temps?: ProductTemps;
  isActive: boolean;
  isBestSeller?: boolean;
  discountPercent?: number | null;
  imageUrl: string | null;
  category?: Category;
  /** Chi nhánh đang hết món (báo hết / hết nguyên liệu) — thực đơn hiện mờ, không cho thêm */
  soldOut?: boolean;
  /** Điểm sao trung bình từ đánh giá theo món (null = chưa có đánh giá) */
  rating?: { avg: number; count: number } | null;
};

export type ProductTemps = "BOTH" | "ICED" | "HOT" | "NONE";
export type Temp = "HOT" | "ICED";
export const TEMP_TEXT: Record<Temp, string> = { HOT: "Nóng", ICED: "Đá" };

/** Kiểu nóng / đá khách được chọn cho món — khớp tempFor ở backend (món 1 loại không có nóng/đá) */
export function tempChoices(p: { temps?: ProductTemps; hasSizes?: boolean }): Temp[] {
  if (p.hasSizes === false || p.temps === "NONE") return [];
  if (p.temps === "HOT") return ["HOT"];
  if (p.temps === "ICED") return ["ICED"];
  return ["ICED", "HOT"];
}

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
