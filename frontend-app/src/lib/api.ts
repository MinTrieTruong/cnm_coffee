import { getToken } from "./session";
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

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const t = getToken();
  if (t) headers.set("Authorization", `Bearer ${t}`);
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

export type Category = { id: number; name: string };

export type Product = {
  id: number;
  categoryId: number;
  name: string;
  costPrice: number;
  sellPrice: number;
  isActive: boolean;
  imageUrl: string | null;
  category?: Category;
};

export type MenuResponse = {
  categories: Category[];
  products: Product[];
  favorites: Product[];
};
