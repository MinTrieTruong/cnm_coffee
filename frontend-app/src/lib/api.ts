import { getToken } from "./session";

const base = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const t = getToken();
  if (t) headers.set("Authorization", `Bearer ${t}`);
  const res = await fetch(`${base}${path}`, { ...init, headers });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function apiOrigin() {
  return base;
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
