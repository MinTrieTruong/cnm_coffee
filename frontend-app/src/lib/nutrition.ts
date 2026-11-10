/**
 * Dinh dưỡng ước tính trên trang khách: nhãn thẻ món, bảng ở trang chi tiết, bộ lọc ăn kiêng, sở thích ăn uống.
 * Số do backend tính từ công thức × dinh dưỡng nguyên liệu đã duyệt (backend lib/nutrition/). Ngưỡng nhãn: backend labels.ts.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "./api";
import { getToken } from "./session";

export type Allergen = "milk" | "nuts" | "peanut" | "gluten" | "egg" | "soy";
export type NutritionLabels = {
  caffeine: "none" | "low" | "high" | null;
  sugar: "low" | "high" | null;
  fat: "low" | "high" | null;
  allergens: Allergen[];
  vegan: boolean;
};
/** Bản rút gọn kèm mỗi món trong GET /api/menu (size mặc định) */
export type NutritionBrief = { size: string; kcal: number; caffeineMg: number; sugarG: number; fatG: number; proteinG: number; complete: boolean; labels: NutritionLabels | null };
/** Đủ các size — GET /api/menu/:id/nutrition */
export type NutritionSize = {
  size: string; kcal: number; fatG: number; satFatG: number; sugarG: number; proteinG: number; caffeineMg: number;
  sugarFromSourcesG: number; kcalFromSources: number; allergens: Allergen[] | null; isVegan: boolean; complete: boolean; labels: NutritionLabels | null;
};
export type NutritionDetail = { hidden?: boolean; sizes: NutritionSize[]; thresholds: { caffeine: { low: number; high: number; dailyMax: number }; sugar: { low: number; high: number; dailyMax: number }; fat: { low: number; high: number; dailyMax: number }; kcalDaily: number }; disclaimer: string };

export const ALLERGEN_TEXT: Record<Allergen, string> = { milk: "sữa", nuts: "hạt", peanut: "đậu phộng", gluten: "gluten", egg: "trứng", soy: "đậu nành" };

export const DIETS = ["no_caffeine", "low_caffeine", "no_milk", "low_sugar", "low_fat", "vegan", "no_nuts"] as const;
export type Diet = (typeof DIETS)[number];
export const DIET_TEXT: Record<Diet, string> = {
  no_caffeine: "Không caffeine",
  low_caffeine: "Ít caffeine",
  no_milk: "Không lactose",
  low_sugar: "Ít đường",
  low_fat: "Ít béo",
  vegan: "Thuần chay",
  no_nuts: "Không hạt",
};
/** Sở thích ở tài khoản ("Tôi hạn chế…") — cùng mã với bộ lọc */
export const PREF_TEXT: Record<Diet, string> = {
  no_caffeine: "Không uống caffeine",
  low_caffeine: "Hạn chế caffeine",
  no_milk: "Không uống được sữa",
  low_sugar: "Hạn chế đường",
  low_fat: "Hạn chế chất béo",
  vegan: "Ăn thuần chay",
  no_nuts: "Dị ứng các loại hạt",
};

export type CardLabel = { key: string; text: string; tone: "warn" | "info" | "ok" };

/** Tối đa 2 nhãn cho thẻ món, theo thứ tự ưu tiên: Caffeine cao, Không caffeine, Nhiều đường, Thuần chay, Có sữa */
export function cardLabels(n: NutritionBrief | null | undefined): CardLabel[] {
  const l = n?.labels;
  if (!l) return [];
  const out: CardLabel[] = [];
  if (l.caffeine === "high") out.push({ key: "caf-high", text: "Caffeine cao", tone: "warn" });
  if (l.caffeine === "none") out.push({ key: "caf-none", text: "Không caffeine", tone: "ok" });
  if (l.sugar === "high") out.push({ key: "sugar-high", text: "Nhiều đường", tone: "warn" });
  if (l.vegan) out.push({ key: "vegan", text: "Thuần chay", tone: "ok" });
  if (l.allergens.includes("milk")) out.push({ key: "milk", text: "Có sữa", tone: "info" });
  return out.slice(0, 2);
}

/** Món không hợp sở thích của khách → nhãn nhắc nhẹ (không ẩn món). Món chưa đủ dữ liệu: chỉ nhắc dị ứng chắc chắn có */
export function prefConflicts(n: NutritionBrief | null | undefined, prefs: Diet[]): string[] {
  const l = n?.labels;
  if (!l || !prefs.length) return [];
  const out: string[] = [];
  for (const p of prefs) {
    if (p === "no_milk" && l.allergens.includes("milk")) out.push("Có sữa");
    if (p === "no_nuts" && (l.allergens.includes("nuts") || l.allergens.includes("peanut"))) out.push("Có hạt");
    if (!n!.complete) continue;
    if (p === "no_caffeine" && l.caffeine !== "none") out.push("Có caffeine");
    if (p === "low_caffeine" && l.caffeine === "high") out.push("Caffeine cao");
    if (p === "low_sugar" && l.sugar === "high") out.push("Nhiều đường");
    if (p === "low_fat" && l.fat === "high") out.push("Nhiều béo");
    if (p === "vegan" && !l.vegan) out.push("Không thuần chay");
  }
  return [...new Set(out)];
}

/** Mức đường khách chọn (0 / 50 / 100%): đường + năng lượng từ nguyên liệu tạo ngọt co giãn theo tỉ lệ (giống backend) */
export function adjustForSugar(n: NutritionSize, sugarPct: number): NutritionSize {
  const k = 1 - Math.min(100, Math.max(0, sugarPct)) / 100;
  return { ...n, sugarG: Math.round((n.sugarG - n.sugarFromSourcesG * k) * 10) / 10, kcal: Math.round(n.kcal - n.kcalFromSources * k) };
}

/* ═══════════ Sở thích ăn uống ═══════════ */
const LOCAL_KEY = "c-diet-prefs";
const subs = new Set<() => void>();
let prefs: Diet[] = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? (v.filter((d) => (DIETS as readonly string[]).includes(d)) as Diet[]) : [];
  } catch {
    return [];
  }
})();
let loadedFor: string | null = null;
const emit = () => subs.forEach((f) => f());

/** Đăng nhập: lấy từ tài khoản (đồng bộ mọi máy); chưa đăng nhập: lưu ở trình duyệt */
export function useDietPrefs(): [Diet[], (next: Diet[]) => Promise<void>] {
  const value = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => prefs,
  );
  const token = getToken();
  useEffect(() => {
    if (!token || loadedFor === token) return;
    loadedFor = token;
    api<{ dietPrefs: Diet[] }>("/api/customer/diet-prefs")
      .then((r) => {
        prefs = r.dietPrefs;
        emit();
      })
      .catch(() => {});
  }, [token]);
  const set = async (next: Diet[]) => {
    prefs = next;
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    } catch {
      /* chế độ riêng tư */
    }
    emit();
    if (getToken()) await api("/api/customer/diet-prefs", { method: "PUT", body: JSON.stringify({ dietPrefs: next }) });
  };
  return [value, set];
}

/** Dinh dưỡng đủ size của một món (cache theo phiên) */
const detailCache = new Map<number, Promise<NutritionDetail | null>>();
export function useNutrition(productId: number | null | undefined) {
  const [data, setData] = useState<NutritionDetail | null>(null);
  useEffect(() => {
    if (!productId) return;
    let alive = true;
    if (!detailCache.has(productId)) detailCache.set(productId, api<NutritionDetail>(`/api/menu/${productId}/nutrition`).catch(() => null));
    void detailCache.get(productId)!.then((d) => alive && setData(d && !d.hidden ? d : null));
    return () => {
      alive = false;
    };
  }, [productId]);
  return data;
}
export const loadNutrition = (productId: number) => {
  if (!detailCache.has(productId)) detailCache.set(productId, api<NutritionDetail>(`/api/menu/${productId}/nutrition`).catch(() => null));
  return detailCache.get(productId)!;
};
