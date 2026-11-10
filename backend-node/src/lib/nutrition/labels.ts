/**
 * lib/nutrition/labels.ts — Ngưỡng nhãn dinh dưỡng cho 1 ly / 1 phần và luật lọc ăn kiêng.
 *
 * Căn cứ (để trình bày):
 *  - Caffeine: FDA (Cục Quản lý Thực phẩm và Dược phẩm Hoa Kỳ) — người lớn khỏe mạnh ≤ 400 mg / ngày.
 *    "Caffeine cao" ≥ 150 mg / ly (khoảng 1/3 mức tối đa một ngày); "Ít caffeine" < 50 mg; "Không caffeine" = 0.
 *  - Đường: WHO — đường tự do < 10% năng lượng, tốt hơn < 5% (~25 g / ngày). "Nhiều đường" ≥ 25 g / ly; "Ít đường" ≤ 5 g.
 *  - Béo: "Nhiều béo" ≥ 15 g / ly (~1/5 khẩu phần béo 70 g / ngày); "Ít béo" ≤ 3 g.
 * Nhãn dinh dưỡng chỉ sinh khi đủ dữ liệu (mọi nguyên liệu đã duyệt). Dị ứng: chỉ khẳng định "Có X" khi chắc chắn có;
 * không bao giờ khẳng định "Không có X" khi dữ liệu chưa đủ.
 */
export const THRESHOLDS = {
  caffeine: { low: 50, high: 150, dailyMax: 400 },
  sugar: { low: 5, high: 25, dailyMax: 25 },
  fat: { low: 3, high: 15, dailyMax: 70 },
  kcalDaily: 2000,
} as const;

export const ALLERGENS = ["milk", "nuts", "peanut", "gluten", "egg", "soy"] as const;
export type Allergen = (typeof ALLERGENS)[number];
export const ALLERGEN_LABEL: Record<Allergen, string> = { milk: "sữa", nuts: "hạt", peanut: "đậu phộng", gluten: "gluten", egg: "trứng", soy: "đậu nành" };

export type Labels = {
  caffeine: "none" | "low" | "high" | null;
  sugar: "low" | "high" | null;
  fat: "low" | "high" | null;
  allergens: Allergen[];
  vegan: boolean;
};

export type NutritionValues = { kcal: number; fatG: number; sugarG: number; caffeineMg: number; allergens: Allergen[]; isVegan: boolean; complete: boolean };

export function makeLabels(n: NutritionValues): Labels {
  // Dị ứng: từ nguyên liệu đã duyệt có cờ đó → chắc chắn có, kể cả khi món chưa đủ dữ liệu
  const allergens = ALLERGENS.filter((a) => n.allergens.includes(a));
  if (!n.complete) return { caffeine: null, sugar: null, fat: null, allergens, vegan: false };
  return {
    caffeine: n.caffeineMg <= 0 ? "none" : n.caffeineMg < THRESHOLDS.caffeine.low ? "low" : n.caffeineMg >= THRESHOLDS.caffeine.high ? "high" : null,
    sugar: n.sugarG <= THRESHOLDS.sugar.low ? "low" : n.sugarG >= THRESHOLDS.sugar.high ? "high" : null,
    fat: n.fatG <= THRESHOLDS.fat.low ? "low" : n.fatG >= THRESHOLDS.fat.high ? "high" : null,
    allergens,
    vegan: n.isVegan,
  };
}

/** Bộ lọc ăn kiêng của thực đơn / sở thích khách */
export const DIETS = ["no_caffeine", "low_caffeine", "no_milk", "low_sugar", "low_fat", "vegan", "no_nuts"] as const;
export type Diet = (typeof DIETS)[number];
export const isDiet = (v: unknown): v is Diet => typeof v === "string" && (DIETS as readonly string[]).includes(v);

/**
 * Món có hợp chế độ ăn không (theo size mặc định M / "-").
 * Bộ lọc loại trừ ("không…", "ít…") chỉ cho món đủ dữ liệu lọt qua — thà ẩn còn hơn hứa sai.
 */
export function fitsDiet(n: NutritionValues, diet: Diet): boolean {
  if (!n.complete) return false;
  switch (diet) {
    case "no_caffeine":
      return n.caffeineMg <= 0;
    case "low_caffeine":
      return n.caffeineMg < THRESHOLDS.caffeine.low;
    case "no_milk":
      return !n.allergens.includes("milk");
    case "low_sugar":
      return n.sugarG <= THRESHOLDS.sugar.low;
    case "low_fat":
      return n.fatG <= THRESHOLDS.fat.low;
    case "vegan":
      return n.isVegan;
    case "no_nuts":
      return !n.allergens.includes("nuts") && !n.allergens.includes("peanut");
  }
}

export const DISCLAIMER =
  "Giá trị ước tính theo công thức chuẩn, có thể chênh lệch khi pha. Nếu dị ứng nặng, vui lòng báo nhân viên (quầy có dùng chung dụng cụ).";
