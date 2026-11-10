/**
 * lib/nutrition/compute.ts — Dinh dưỡng món = Σ (định mức nguyên liệu theo size × dinh dưỡng nguyên liệu ĐÃ DUYỆT).
 *
 * Định mức ghi theo đơn vị công thức (g, ml, cái — ProductFormula.qtySizeS/M/L, thiếu thì qtyPerUnit).
 * PER_100: giá trị trên 100 g/ml → × định mức / 100 (coi 1 ml ≈ 1 g). PER_UNIT: giá trị trên 1 cái → × định mức.
 * Nguyên liệu chưa có dinh dưỡng / chưa duyệt → món complete = false (không sinh nhãn, không lọt bộ lọc loại trừ).
 * Gọi lại khi: lưu công thức món, duyệt / sửa dinh dưỡng nguyên liệu, scripts/recomputeNutrition.ts.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../../db.js";
import { ALLERGENS, makeLabels, type Allergen, type Labels, type NutritionValues } from "./labels.js";

type Db = PrismaClient | Prisma.TransactionClient;
export type Size = "S" | "M" | "L" | "-";
export type ProductNutritionRow = NutritionValues & {
  size: Size;
  satFatG: number;
  proteinG: number;
  sugarFromSourcesG: number;
  kcalFromSources: number;
  missing: { itemId: number; name: string }[];
  labels: Labels;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

export function parseAllergens(raw: unknown): Allergen[] {
  return Array.isArray(raw) ? (raw.filter((a) => (ALLERGENS as readonly string[]).includes(a)) as Allergen[]) : [];
}

/** Định mức theo size (đơn vị công thức) — cùng quy tắc với stockPerCup ở lib/inventory.ts */
function recipeQty(f: { qtyPerUnit: number; qtySizeS: number | null; qtySizeM: number | null; qtySizeL: number | null }, size: Size) {
  if (size === "S" && f.qtySizeS != null) return f.qtySizeS;
  if (size === "M" && f.qtySizeM != null) return f.qtySizeM;
  if (size === "L" && f.qtySizeL != null) return f.qtySizeL;
  return f.qtyPerUnit;
}

/** Tính (không lưu) dinh dưỡng các size của một món */
export async function calcProductNutrition(db: Db, productId: number): Promise<ProductNutritionRow[]> {
  const product = await db.product.findUnique({ where: { id: productId }, select: { hasSizes: true } });
  if (!product) return [];
  const formulas = await db.productFormula.findMany({
    where: { productId },
    include: { item: { select: { id: true, name: true } } },
  });
  const nut = await db.ingredientNutrition.findMany({ where: { itemId: { in: formulas.map((f) => f.itemId) } } });
  const byItem = new Map(nut.map((n) => [n.itemId, n]));
  const sizes: Size[] = product.hasSizes ? ["S", "M", "L"] : ["-"];

  return sizes.map((size) => {
    const acc = { kcal: 0, fatG: 0, satFatG: 0, sugarG: 0, proteinG: 0, caffeineMg: 0, sugarFromSourcesG: 0, kcalFromSources: 0 };
    const allergens = new Set<Allergen>();
    const missing: { itemId: number; name: string }[] = [];
    let vegan = true;
    for (const f of formulas) {
      const n = byItem.get(f.itemId);
      // Dị ứng: nguyên liệu đã duyệt có cờ → chắc chắn có
      if (n?.approved) for (const a of parseAllergens(n.allergens)) allergens.add(a);
      if (!n || !n.approved || n.kcal == null) {
        missing.push({ itemId: f.itemId, name: f.item.name });
        vegan = false;
        continue;
      }
      const qty = recipeQty(f, size);
      const k = n.basis === "PER_UNIT" ? qty : qty / 100;
      const kcal = (n.kcal ?? 0) * k;
      const sugar = (n.sugarG ?? 0) * k;
      acc.kcal += kcal;
      acc.fatG += (n.fatG ?? 0) * k;
      acc.satFatG += (n.satFatG ?? 0) * k;
      acc.sugarG += sugar;
      acc.proteinG += (n.proteinG ?? 0) * k;
      acc.caffeineMg += (n.caffeineMg ?? 0) * k;
      if (n.isSugarSource) {
        acc.sugarFromSourcesG += sugar;
        acc.kcalFromSources += kcal;
      }
      if (!n.isVegan) vegan = false;
    }
    const complete = formulas.length > 0 && missing.length === 0;
    const values: NutritionValues = {
      kcal: Math.round(acc.kcal),
      fatG: r1(acc.fatG),
      sugarG: r1(acc.sugarG),
      caffeineMg: Math.round(acc.caffeineMg),
      allergens: [...allergens],
      isVegan: complete && vegan,
      complete,
    };
    return {
      ...values,
      size,
      satFatG: r1(acc.satFatG),
      proteinG: r1(acc.proteinG),
      sugarFromSourcesG: r1(acc.sugarFromSourcesG),
      kcalFromSources: Math.round(acc.kcalFromSources),
      missing: formulas.length ? missing : [{ itemId: 0, name: "Món chưa có công thức" }],
      labels: makeLabels(values),
    };
  });
}

/** Tính và lưu bảng ProductNutrition của một món (xoá size không còn dùng) */
export async function computeProductNutrition(productId: number, db: Db = prisma) {
  const rows = await calcProductNutrition(db, productId);
  await db.productNutrition.deleteMany({ where: { productId, size: { notIn: rows.map((r) => r.size) } } });
  for (const r of rows) {
    const data = {
      kcal: r.kcal, fatG: r.fatG, satFatG: r.satFatG, sugarG: r.sugarG, proteinG: r.proteinG, caffeineMg: r.caffeineMg,
      sugarFromSourcesG: r.sugarFromSourcesG, kcalFromSources: r.kcalFromSources,
      allergens: r.allergens, isVegan: r.isVegan, complete: r.complete,
      missing: r.missing as unknown as Prisma.InputJsonValue, labels: r.labels as unknown as Prisma.InputJsonValue, computedAt: new Date(),
    };
    await db.productNutrition.upsert({ where: { productId_size: { productId, size: r.size } }, update: data, create: { productId, size: r.size, ...data } });
  }
  return rows;
}

/** Tính lại mọi món dùng các nguyên liệu này (sau khi duyệt / sửa dinh dưỡng nguyên liệu) */
export async function recomputeForItems(itemIds: number[], db: Db = prisma) {
  const products = await db.productFormula.findMany({ where: { itemId: { in: itemIds } }, select: { productId: true }, distinct: ["productId"] });
  for (const p of products) await computeProductNutrition(p.productId, db);
  return products.length;
}

export async function recomputeAll(db: Db = prisma) {
  const products = await db.product.findMany({ select: { id: true } });
  for (const p of products) await computeProductNutrition(p.id, db);
  return products.length;
}

/**
 * Đổi mức đường khách chọn (0 / 50 / 100%): phần đường + năng lượng từ nguyên liệu tạo ngọt co giãn theo tỉ lệ.
 * Đá không đổi dinh dưỡng. Dùng cho trang chi tiết món / giỏ hàng (frontend có bản tương tự).
 */
export function adjustForOptions<T extends { kcal: number; sugarG: number; sugarFromSourcesG: number; kcalFromSources: number }>(n: T, opts: { sugarPct?: number }): T {
  const pct = Math.min(100, Math.max(0, opts.sugarPct ?? 100)) / 100;
  return {
    ...n,
    sugarG: r1(n.sugarG - n.sugarFromSourcesG * (1 - pct)),
    kcal: Math.round(n.kcal - n.kcalFromSources * (1 - pct)),
  };
}
