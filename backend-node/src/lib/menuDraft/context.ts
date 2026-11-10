/**
 * lib/menuDraft/context.ts — Ngữ cảnh gửi AI khi phác thảo món mới:
 * nhu cầu (từ khóa khách tìm / ý tưởng), danh mục, nguyên liệu trong kho thật (giá theo đơn vị công thức, còn hàng ở chi nhánh),
 * 3 món mẫu gần nhất kèm định mức S/M/L (để AI định lượng hợp lý) và tên món đang có (tránh trùng).
 */
import type { PrismaClient } from "@prisma/client";
import { computeSearchInsights, normalizeTerm } from "../searchInsights.js";

export type DraftDemand = { term: string; display: string; variants: string[]; searchers: number; searches: number; days: number; status: string } | null;
export type CtxIngredient = { id: number; name: string; category: string | null; recipeUnit: string; costPerRecipeUnit: number; inStockAtStore: boolean };
export type CtxSample = {
  id: number; name: string; categoryId: number; temps: string; hasSizes: boolean; costPrice: number; sellPrice: number;
  lines: { itemId: number; name: string; recipeUnit: string; qtyS: number | null; qtyM: number; qtyL: number | null }[];
};
export type DraftContext = {
  storeId: number;
  demand: DraftDemand;
  idea: string | null;
  note: string | null;
  categoryId: number | null;
  categories: { id: number; name: string; parentId: number | null }[];
  ingredients: CtxIngredient[];
  samples: CtxSample[];
  existingNames: string[];
};

export const DEMAND_DAYS = 30;
const STOP = new Set(["tra", "ca", "phe", "sua", "da", "nong", "vi", "mon", "cho", "kem", "banh", "an", "uong", "va", "voi", "co", "1", "ly"]);

/** Từ có nghĩa của từ khóa / ý tưởng (bỏ dấu, bỏ từ quá chung) — để chọn món mẫu */
const keywords = (s: string) => normalizeTerm(s).split(" ").filter((w) => w.length > 1);

export async function buildDraftContext(
  prisma: PrismaClient,
  opts: { storeId: number; term?: string | null; idea?: string | null; note?: string | null; categoryId?: number | null },
): Promise<DraftContext> {
  const term = opts.term?.trim() ? normalizeTerm(opts.term) : null;
  const [categories, items, stocks, products, insights] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true, parentId: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.inventoryItem.findMany({ select: { id: true, name: true, category: true, unit: true, unitCostPrice: true, recipeUnit: true, recipePerUnit: true }, orderBy: { id: "asc" } }),
    prisma.storeInventory.findMany({ where: { storeId: opts.storeId, stockQty: { gt: 0 } }, select: { itemId: true } }),
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true, name: true, categoryId: true, temps: true, hasSizes: true, costPrice: true, sellPrice: true,
        formulas: { select: { itemId: true, qtyPerUnit: true, qtySizeS: true, qtySizeM: true, qtySizeL: true, recipeUnit: true, item: { select: { name: true, recipeUnit: true, unit: true } } } },
      },
    }),
    // Chủ chuỗi xem toàn chuỗi vẫn đếm nhu cầu cả chuỗi; tồn kho theo chi nhánh đang phác thảo
    term ? computeSearchInsights(prisma, { storeId: null, days: DEMAND_DAYS }) : Promise.resolve(null),
  ]);

  const hit = insights?.terms.find((t) => t.term === term);
  const demand: DraftDemand = term
    ? hit
      ? { term, display: hit.display, variants: hit.variants.slice(0, 5).map((v) => v.text), searchers: hit.searchers, searches: hit.searches, days: DEMAND_DAYS, status: hit.status }
      : { term, display: opts.term!.trim(), variants: [], searchers: 0, searches: 0, days: DEMAND_DAYS, status: "MISSING" }
    : null;

  const inStock = new Set(stocks.map((s) => s.itemId));
  const ingredients: CtxIngredient[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    category: i.category,
    recipeUnit: i.recipeUnit ?? i.unit ?? "",
    costPerRecipeUnit: Math.round((i.unitCostPrice / (i.recipePerUnit > 0 ? i.recipePerUnit : 1)) * 100) / 100,
    inStockAtStore: inStock.has(i.id),
  }));

  // Món mẫu: trùng từ riêng trong tên +3 (từ chung +0,5), nguyên liệu khớp từ khóa +1, cùng danh mục +2; chỉ món có định mức
  const words = keywords(`${term ?? ""} ${opts.idea ?? ""}`);
  // Ý tưởng về bánh / đồ ăn → món mẫu là món 1 loại (không size)
  const wantsFood = /\b(banh|do an|an nhe|an kem|an sang|snack|sandwich|croissant)\b/.test(normalizeTerm(`${term ?? ""} ${opts.idea ?? ""}`));
  const scored = products
    .filter((p) => p.formulas.length > 0)
    .map((p) => {
      const name = normalizeTerm(p.name);
      const ingr = normalizeTerm(p.formulas.map((f) => f.item.name).join(" "));
      let score = 0;
      // Từ đã bỏ dấu chỉ còn a-z0-9 → so theo từ nguyên vẹn bằng tách khoảng trắng (không cần RegExp)
      const nameWords = new Set(name.split(" "));
      const ingrWords = new Set(ingr.split(" "));
      // Từ riêng (matcha, dừa, khoai môn…) nặng ký; từ chung (trà, sữa, đá…) chỉ để phân xử khi không có từ riêng nào khớp
      for (const w of words) {
        const generic = STOP.has(w);
        if (nameWords.has(w)) score += generic ? 0.5 : 3;
        if (ingrWords.has(w) && !generic) score += 1;
      }
      if (opts.categoryId && p.categoryId === opts.categoryId) score += 2;
      if (wantsFood && !p.hasSizes) score += 4;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score || a.p.id - b.p.id);
  // Lấy tối đa 3 món, khác danh mục nếu được để AI thấy nhiều kiểu định lượng
  const picked: typeof scored = [];
  for (const s of scored) {
    if (picked.length >= 3) break;
    if (picked.length < 2 || !picked.some((x) => x.p.categoryId === s.p.categoryId) || s.score >= 3) picked.push(s);
  }
  const samples: CtxSample[] = picked.map(({ p }) => ({
    id: p.id, name: p.name, categoryId: p.categoryId, temps: p.temps, hasSizes: p.hasSizes, costPrice: p.costPrice, sellPrice: p.sellPrice,
    lines: p.formulas.map((f) => ({
      itemId: f.itemId,
      name: f.item.name,
      recipeUnit: f.recipeUnit ?? f.item.recipeUnit ?? f.item.unit ?? "",
      qtyS: p.hasSizes ? (f.qtySizeS ?? f.qtyPerUnit) : null,
      qtyM: f.qtySizeM ?? f.qtyPerUnit,
      qtyL: p.hasSizes ? (f.qtySizeL ?? f.qtyPerUnit) : null,
    })),
  }));

  return {
    storeId: opts.storeId,
    demand,
    idea: opts.idea?.trim() || null,
    note: opts.note?.trim() || null,
    categoryId: opts.categoryId ?? null,
    categories,
    ingredients,
    samples,
    existingNames: products.map((p) => p.name),
  };
}
