/**
 * lib/menuDraft/evaluate.ts — Kiểm tra và tính tiền một phương án món (AI phác thảo hoặc người dùng sửa). Không gọi AI.
 *
 *  - Dòng định mức: itemId phải có thật (bịa → bỏ), lượng > 0, S ≤ M ≤ L (sai → sắp lại), đơn vị theo nguyên liệu, gộp dòng trùng.
 *  - Thể tích lỏng mỗi size so với dung tích ly CUP_ML: vượt hoặc < 40% → cảnh báo (chưa tính nước pha trà / cà phê).
 *  - Tên nhắc nguyên liệu chính (matcha, dừa, đào…) mà định mức không có → cảnh báo. Tên trùng món đang có → lỗi.
 *  - Giá vốn S/M/L: formulaLineCost (cùng hàm với lib/productCost.ts) × giá nhập HIỆN TẠI; nguyên liệu mới = lượng × giá AI ước tính (cờ estimated).
 *  - Giá bán gợi ý: giá vốn ÷ trung vị (giá vốn / giá bán) các món cùng danh mục, làm tròn lên 1.000đ; lãi gộp < MIN_MARGIN → cảnh báo.
 *  - Cần mua thêm: nguyên liệu hết ở chi nhánh + nguyên liệu mới. Dinh dưỡng ước tính size M (nguyên liệu đã duyệt).
 */
import type { PrismaClient } from "@prisma/client";
import { formulaLineCost } from "../productCost.js";
import { levenshtein } from "../searchInsights.js";
import { foldVi } from "../../ai/knowledge/text.js";
import type { DraftLine, DraftOption } from "./generate.js";

export const CUP_ML = { S: 350, M: 450, L: 600 } as const;
export const MIN_MARGIN = 0.6;
const SIZES = ["S", "M", "L"] as const;
type Size = (typeof SIZES)[number];
type Sizes<T> = Record<Size, T>;

export type DraftWarning = { level: "warn" | "danger"; text: string };
export type EvalLine = DraftLine & { name: string; inStock: boolean | null; estimated: boolean; liquid: boolean; cost: Sizes<number> };
export type ToBuy = { name: string; kind: "OUT_OF_STOCK" | "NEW"; recipeUnit: string; estCostPerRecipeUnit: number | null; note: string | null };
export type EvaluatedOption = Omit<DraftOption, "lines"> & {
  lines: EvalLine[];
  categoryName: string | null;
  costs: Sizes<number>;
  estimated: boolean;
  suggestedPrice: Sizes<number | null>;
  margin: Sizes<number | null>;
  categoryPriceRange: { min: number; max: number; count: number; costRatio: number; scope: "CATEGORY" | "ALL" } | null;
  volumeMl: Sizes<number> | null;
  toBuy: ToBuy[];
  warnings: DraftWarning[];
  nutrition: { kcal: number; caffeineMg: number; sugarG: number; complete: boolean } | null;
};

type ItemRow = { id: number; name: string; category: string | null; unit: string | null; unitCostPrice: number; recipeUnit: string | null; recipePerUnit: number };
export type EvalData = {
  items: Map<number, ItemRow>;
  inStock: Set<number> | null;
  categories: Map<number, { id: number; name: string; parentId: number | null }>;
  products: { id: number; name: string; categoryId: number; hasSizes: boolean; costPrice: number; sellPrice: number }[];
  nutrition: Map<number, { basis: string; kcal: number | null; caffeineMg: number | null; sugarG: number | null }>;
};

/** Nạp một lần cho nhiều phương án (giá nhập hiện tại, tồn chi nhánh, món đang bán, dinh dưỡng nguyên liệu đã duyệt) */
export async function loadEvalData(prisma: PrismaClient, storeId: number | null): Promise<EvalData> {
  const [items, stocks, categories, products, nutrition] = await Promise.all([
    prisma.inventoryItem.findMany({ select: { id: true, name: true, category: true, unit: true, unitCostPrice: true, recipeUnit: true, recipePerUnit: true } }),
    storeId != null ? prisma.storeInventory.findMany({ where: { storeId, stockQty: { gt: 0 } }, select: { itemId: true } }) : Promise.resolve(null),
    prisma.category.findMany({ select: { id: true, name: true, parentId: true } }),
    prisma.product.findMany({ where: { isActive: true }, select: { id: true, name: true, categoryId: true, hasSizes: true, costPrice: true, sellPrice: true } }),
    prisma.ingredientNutrition.findMany({ where: { approved: true }, select: { itemId: true, basis: true, kcal: true, caffeineMg: true, sugarG: true } }),
  ]);
  return {
    items: new Map(items.map((i) => [i.id, i])),
    inStock: stocks ? new Set(stocks.map((s) => s.itemId)) : null,
    categories: new Map(categories.map((c) => [c.id, c])),
    products,
    nutrition: new Map(nutrition.map((n) => [n.itemId, n])),
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const sameUnit = (a: string, b: string) => foldVi(a) === foldVi(b);

/** Nguyên liệu tính vào thể tích ly: đơn vị ml, hoặc g thuộc nhóm sữa / syrup / topping / đá / trái cây (trừ dạng bột) */
function isLiquid(unit: string, category: string | null, name: string) {
  if (/^ml$/i.test(unit)) return true;
  if (!/^g$/i.test(unit)) return false;
  return /\b(sua|syrup|topping|da|trai cay)\b/.test(foldVi(category ?? "")) && !/\bbot\b/.test(foldVi(name));
}

/** Tên món nhắc nguyên liệu chính → định mức phải có dòng khớp */
const KEY_INGREDIENTS: { inName: RegExp; inLines: RegExp; label: string }[] = [
  { inName: /\bmatcha\b/, inLines: /matcha/, label: "matcha" },
  { inName: /\bdua\b/, inLines: /\bdua\b/, label: "dừa" },
  { inName: /\bdao\b/, inLines: /\bdao\b/, label: "đào" },
  { inName: /\b(cacao|socola|chocolate)\b/, inLines: /cacao|socola|chocolate/, label: "cacao / socola" },
  { inName: /\bxoai\b/, inLines: /xoai/, label: "xoài" },
  { inName: /\bvai\b/, inLines: /\bvai\b/, label: "vải" },
  { inName: /\bcam\b/, inLines: /\bcam\b/, label: "cam" },
  { inName: /\bbuoi\b/, inLines: /buoi/, label: "bưởi" },
  { inName: /\bcaramel\b/, inLines: /caramel/, label: "caramel" },
  { inName: /\btran chau\b/, inLines: /tran chau/, label: "trân châu" },
  { inName: /\bmuoi\b/, inLines: /muoi/, label: "muối" },
  { inName: /\bsau rieng\b/, inLines: /sau rieng/, label: "sầu riêng" },
  { inName: /\boolong\b/, inLines: /oolong/, label: "oolong" },
  // "latte" không tính: Matcha Latte không có cà phê
  { inName: /\b(ca phe|coffee|espresso|cold brew|americano)\b/, inLines: /ca phe|coffee|espresso|cold brew/, label: "cà phê" },
];

export function evaluateOption(data: EvalData, option: DraftOption): EvaluatedOption {
  const warnings: DraftWarning[] = [];
  const warn = (text: string, level: DraftWarning["level"] = "warn") => warnings.push({ level, text });
  const hasSizes = option.hasSizes;

  // ── Dòng định mức ──
  const merged = new Map<string, EvalLine>();
  let reordered = false;
  for (const l of option.lines) {
    const item = l.itemId != null ? data.items.get(l.itemId) : null;
    if (l.itemId != null && !item) {
      warn(`Nguyên liệu #${l.itemId} không có trong kho — đã bỏ dòng này.`, "danger");
      continue;
    }
    if (!item && !l.newIngredient) continue;
    const name = item ? item.name : l.newIngredient!.name;
    if (!(l.qtyM > 0)) {
      warn(`${name}: lượng size M phải lớn hơn 0 — đã bỏ dòng này.`);
      continue;
    }
    let s = hasSizes && l.qtyS != null && l.qtyS > 0 ? l.qtyS : hasSizes ? l.qtyM : null;
    let m = l.qtyM;
    let lg = hasSizes && l.qtyL != null && l.qtyL > 0 ? l.qtyL : hasSizes ? l.qtyM : null;
    if (hasSizes && s != null && lg != null && !(s <= m && m <= lg)) {
      [s, m, lg] = [s, m, lg].sort((a, b) => a - b);
      reordered = true;
    }
    const unit = item ? (item.recipeUnit ?? item.unit ?? "") : l.newIngredient!.recipeUnit;
    if (item && l.recipeUnit && !sameUnit(l.recipeUnit, unit)) warn(`${name}: AI ghi đơn vị "${l.recipeUnit}", đã dùng đơn vị công thức "${unit}" của kho — kiểm tra lại lượng.`);
    const key = item ? `i${item.id}` : `n${foldVi(name)}`;
    const prev = merged.get(key);
    if (prev) {
      warn(`${name} xuất hiện 2 lần — đã gộp lượng.`);
      prev.qtyM = r2(prev.qtyM + m);
      if (prev.qtyS != null && s != null) prev.qtyS = r2(prev.qtyS + s);
      if (prev.qtyL != null && lg != null) prev.qtyL = r2(prev.qtyL + lg);
      continue;
    }
    merged.set(key, {
      ...l,
      itemId: item ? item.id : null,
      newIngredient: item ? null : l.newIngredient,
      qtyS: s != null ? r2(s) : null,
      qtyM: r2(m),
      qtyL: lg != null ? r2(lg) : null,
      recipeUnit: unit,
      name,
      inStock: item ? (data.inStock ? data.inStock.has(item.id) : null) : false,
      estimated: !item,
      liquid: isLiquid(unit, item?.category ?? null, name),
      cost: { S: 0, M: 0, L: 0 },
    });
  }
  if (reordered) warn("Có dòng định mức S / M / L không tăng dần — đã sắp lại.");
  const lines = [...merged.values()];
  if (!lines.length) warn("Phương án chưa có dòng định mức hợp lệ nào.", "danger");
  const newCount = lines.filter((l) => l.newIngredient).length;
  if (newCount > 2) warn(`Phương án cần ${newCount} nguyên liệu mới (khuyến nghị tối đa 2).`);

  // ── Giá vốn từng dòng / từng size ──
  const costs: Sizes<number> = { S: 0, M: 0, L: 0 };
  for (const l of lines) {
    const item = l.itemId != null ? data.items.get(l.itemId)! : null;
    for (const size of SIZES) {
      const qty = size === "S" ? (l.qtyS ?? l.qtyM) : size === "L" ? (l.qtyL ?? l.qtyM) : l.qtyM;
      const c = item
        ? formulaLineCost({ itemId: item.id, qtyPerUnit: l.qtyM, qtySizeS: l.qtyS, qtySizeM: l.qtyM, qtySizeL: l.qtyL, conversionFactor: item.recipePerUnit > 0 ? item.recipePerUnit : 1 }, size, item.unitCostPrice)
        : qty * (l.newIngredient?.estCostPerRecipeUnit ?? 0);
      l.cost[size] = Math.round(c);
      costs[size] += c;
    }
    if (item && item.unitCostPrice <= 0) warn(`${item.name} chưa có giá nhập — giá vốn đang thiếu phần này.`);
    if (l.newIngredient && !(l.newIngredient.estCostPerRecipeUnit > 0)) warn(`${l.name}: chưa có giá ước tính.`);
  }
  for (const size of SIZES) costs[size] = Math.round(costs[size]);

  // ── Thể tích ly (đồ uống) ──
  const drink = hasSizes && option.temps !== "NONE";
  let volumeMl: Sizes<number> | null = null;
  if (drink && lines.length) {
    volumeMl = { S: 0, M: 0, L: 0 };
    for (const l of lines.filter((x) => x.liquid)) {
      volumeMl.S += l.qtyS ?? l.qtyM;
      volumeMl.M += l.qtyM;
      volumeMl.L += l.qtyL ?? l.qtyM;
    }
    for (const size of SIZES) {
      volumeMl[size] = Math.round(volumeMl[size]);
      if (volumeMl[size] > CUP_ML[size]) warn(`Size ${size}: khoảng ${volumeMl[size]} ml chất lỏng / đá, vượt ly ${CUP_ML[size]} ml.`, "danger");
      else if (volumeMl[size] < CUP_ML[size] * 0.4) warn(`Size ${size}: chỉ khoảng ${volumeMl[size]} ml chất lỏng / đá (ly ${CUP_ML[size]} ml) — có thể thiếu sữa / đá / nước pha.`);
    }
  }

  // ── Tên món: trùng món đang có, nguyên liệu chính ──
  const fname = foldVi(option.name);
  const dup = data.products.find((p) => foldVi(p.name) === fname);
  if (dup) warn(`Tên trùng món đang bán "${dup.name}" — đổi tên.`, "danger");
  else {
    const near = data.products.find((p) => levenshtein(foldVi(p.name), fname) <= 2);
    if (near) warn(`Tên gần giống món đang bán "${near.name}".`);
  }
  const lineNames = foldVi(lines.map((l) => l.name).join(" | "));
  for (const k of KEY_INGREDIENTS) {
    if (k.inName.test(fname) && !k.inLines.test(lineNames)) warn(`Tên món có "${k.label}" nhưng định mức không có nguyên liệu nào là ${k.label}.`);
  }

  // ── Danh mục ──
  const cat = data.categories.get(option.categoryId) ?? null;
  if (!cat) warn("Chưa chọn danh mục hợp lệ.", "danger");
  else if ([...data.categories.values()].some((c) => c.parentId === cat.id)) warn(`"${cat.name}" là danh mục gốc — nên chọn danh mục con.`);

  // ── Giá bán gợi ý theo tỉ lệ giá vốn / giá bán các món cùng danh mục ──
  const priced = (list: EvalData["products"]) => list.filter((p) => p.costPrice > 0 && p.sellPrice > 0);
  let peers = priced(data.products.filter((p) => cat && p.categoryId === cat.id));
  let scope: "CATEGORY" | "ALL" = "CATEGORY";
  if (peers.length < 3) {
    peers = priced(data.products.filter((p) => p.hasSizes === hasSizes));
    scope = "ALL";
  }
  const suggestedPrice: Sizes<number | null> = { S: null, M: null, L: null };
  const margin: Sizes<number | null> = { S: null, M: null, L: null };
  let categoryPriceRange: EvaluatedOption["categoryPriceRange"] = null;
  if (peers.length) {
    const ratio = median(peers.map((p) => p.costPrice / p.sellPrice));
    const prices = peers.map((p) => p.sellPrice);
    categoryPriceRange = { min: Math.min(...prices), max: Math.max(...prices), count: peers.length, costRatio: Math.round(ratio * 1000) / 1000, scope };
    for (const size of hasSizes ? SIZES : (["M"] as const)) {
      if (costs[size] <= 0) continue;
      const price = Math.ceil(costs[size] / ratio / 1000) * 1000;
      suggestedPrice[size] = price;
      margin[size] = Math.round((1 - costs[size] / price) * 1000) / 1000;
    }
    if (margin.M != null && margin.M < MIN_MARGIN) warn(`Lãi gộp size M ${Math.round(margin.M * 100)}% thấp hơn mức tối thiểu ${MIN_MARGIN * 100}%.`);
    // Giữ tỉ lệ lãi như cùng danh mục mà giá vọt hẳn lên → khó bán: nên giảm định lượng / đổi nguyên liệu rẻ hơn
    const vndK = (n: number) => `${Math.round(n / 1000)}k`;
    if (suggestedPrice.M != null && suggestedPrice.M > categoryPriceRange.max * 1.2) {
      warn(`Giá gợi ý M ${vndK(suggestedPrice.M)} cao hơn hẳn các món cùng ${scope === "CATEGORY" ? "danh mục" : "loại"} (${vndK(categoryPriceRange.min)}–${vndK(categoryPriceRange.max)}) — cân nhắc giảm định lượng hoặc nguyên liệu rẻ hơn.`);
    }
  }

  // ── Cần mua thêm ──
  const toBuy: ToBuy[] = lines
    .filter((l) => l.newIngredient || l.inStock === false)
    .map((l) => ({
      name: l.name,
      kind: l.newIngredient ? "NEW" : "OUT_OF_STOCK",
      recipeUnit: l.recipeUnit,
      estCostPerRecipeUnit: l.newIngredient?.estCostPerRecipeUnit ?? null,
      note: l.newIngredient?.note ?? null,
    }));

  // ── Dinh dưỡng ước tính size M (chỉ nguyên liệu đã duyệt) ──
  let nutrition: EvaluatedOption["nutrition"] = null;
  if (lines.length) {
    let complete = true;
    const acc = { kcal: 0, caffeineMg: 0, sugarG: 0 };
    for (const l of lines) {
      const n = l.itemId != null ? data.nutrition.get(l.itemId) : null;
      if (!n || n.kcal == null) {
        complete = false;
        continue;
      }
      const k = n.basis === "PER_UNIT" ? l.qtyM : l.qtyM / 100;
      acc.kcal += (n.kcal ?? 0) * k;
      acc.caffeineMg += (n.caffeineMg ?? 0) * k;
      acc.sugarG += (n.sugarG ?? 0) * k;
    }
    nutrition = { kcal: Math.round(acc.kcal), caffeineMg: Math.round(acc.caffeineMg), sugarG: Math.round(acc.sugarG * 10) / 10, complete };
  }

  return {
    ...option,
    hasSizes,
    lines,
    categoryName: cat?.name ?? null,
    costs,
    estimated: lines.some((l) => l.estimated),
    suggestedPrice,
    margin,
    categoryPriceRange,
    volumeMl,
    toBuy,
    warnings,
    nutrition,
  };
}

/** Định mức gọn để lưu MenuProposal.formulaDraft */
export const formulaDraftOf = (o: EvaluatedOption): DraftLine[] =>
  o.lines.map((l) => ({ itemId: l.itemId, newIngredient: l.newIngredient, qtyS: l.qtyS, qtyM: l.qtyM, qtyL: l.qtyL, recipeUnit: l.recipeUnit, role: l.role }));

/** Text "Nguyên liệu: … / Cách pha: …" cho cột recipe cũ (màn đề xuất cũ vẫn đọc được) */
export function recipeTextOf(o: EvaluatedOption) {
  const fmt = (n: number | null) => (n == null ? "" : String(Math.round(n * 100) / 100));
  const ingr = o.lines
    .map((l) => `- ${l.name}${l.newIngredient ? " (nguyên liệu mới)" : ""}: ${o.hasSizes ? `${fmt(l.qtyS)} / ${fmt(l.qtyM)} / ${fmt(l.qtyL)}` : fmt(l.qtyM)} ${l.recipeUnit}`)
    .join("\n");
  const steps = o.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return `Nguyên liệu${o.hasSizes ? " (S / M / L)" : ""}:\n${ingr}${steps ? `\n\nCách pha:\n${steps}` : ""}`;
}
