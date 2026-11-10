/**
 * lib/menuDraft/generate.ts — Gemini phác thảo 2–3 phương án món mới (tên, mô tả, định mức S/M/L chọn từ kho thật, cách pha).
 * AI KHÔNG ghi giá vốn / giá bán — evaluate.ts tính bằng code. Model chính quá tải → model lite.
 */
import { ThinkingLevel } from "@google/genai";
import { AI_CONFIG, gemini, isBusy, withRetry } from "../../ai/gemini.js";
import type { DraftContext } from "./context.js";

export type NewIngredient = { name: string; recipeUnit: string; estCostPerRecipeUnit: number; note: string | null };
export type DraftRole = "base" | "milk" | "sweetener" | "topping" | "other";
export type DraftLine = {
  itemId: number | null;
  newIngredient: NewIngredient | null;
  qtyS: number | null;
  qtyM: number;
  qtyL: number | null;
  recipeUnit: string;
  role: DraftRole;
};
export type DraftOption = {
  name: string;
  description: string;
  categoryId: number;
  temps: "BOTH" | "ICED" | "HOT" | "NONE";
  hasSizes: boolean;
  lines: DraftLine[];
  steps: string[];
  whyFits: string;
  risk: string | null;
};
export type DraftResult = { understood: string; options: DraftOption[] };

const TIMEOUT_MS = 45_000;

const LINE_SCHEMA = {
  type: "object",
  properties: {
    itemId: { type: ["integer", "null"], description: "id nguyên liệu trong danh sách kho; null nếu là nguyên liệu mới" },
    newIngredient: {
      type: ["object", "null"],
      properties: {
        name: { type: "string" },
        recipeUnit: { type: "string", enum: ["g", "ml", "cái"] },
        estCostPerRecipeUnit: { type: "number", description: "giá ước tính VND trên 1 đơn vị công thức (1 g / 1 ml / 1 cái)" },
        note: { type: ["string", "null"] },
      },
      required: ["name", "recipeUnit", "estCostPerRecipeUnit"],
    },
    qtyS: { type: ["number", "null"] },
    qtyM: { type: "number" },
    qtyL: { type: ["number", "null"] },
    recipeUnit: { type: "string" },
    role: { type: "string", enum: ["base", "milk", "sweetener", "topping", "other"] },
  },
  required: ["itemId", "newIngredient", "qtyS", "qtyM", "qtyL", "recipeUnit", "role"],
};

export const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    understood: { type: "string", description: "AI hiểu khách muốn gì, 1 câu" },
    options: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string", description: "≤ 160 ký tự, giọng thực đơn" },
          categoryId: { type: "integer" },
          temps: { type: "string", enum: ["BOTH", "ICED", "HOT", "NONE"] },
          hasSizes: { type: "boolean" },
          lines: { type: "array", items: LINE_SCHEMA },
          steps: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 6 },
          whyFits: { type: "string" },
          risk: { type: ["string", "null"] },
        },
        required: ["name", "description", "categoryId", "temps", "hasSizes", "lines", "steps", "whyFits", "risk"],
      },
    },
  },
  required: ["understood", "options"],
};

const SYSTEM = [
  "Bạn là chuyên viên R&D đồ uống / bánh của một chuỗi cà phê Việt Nam (TD Coffee). Nhiệm vụ: phác thảo 2–3 phương án món mới KHÁC NHAU RÕ RỆT (VD latte / đá xay / kem muối) đáp ứng nhu cầu khách.",
  "Quy tắc:",
  "- Ưu tiên nguyên liệu SẴN CÓ trong danh sách kho (ghi itemId đúng id trong danh sách, newIngredient = null). Chỉ đề xuất newIngredient (itemId = null) khi thật cần, tối đa 2 nguyên liệu mới mỗi phương án, kèm giá ước tính VND / 1 đơn vị công thức theo giá sỉ thị trường Việt Nam.",
  "- Định lượng theo ĐƠN VỊ CÔNG THỨC của nguyên liệu (recipeUnit trong danh sách). Tham khảo định mức các món mẫu để lượng hợp lý (VD sữa đặc 25–45 g / ly, đá 150–260 g / ly). Đồ uống có size: qtyS < qtyM < qtyL; ly nhựa, ống hút: 1 cái mỗi size.",
  "- Đồ uống mang đi gồm ly, ống hút và đá (nếu có bản đá) như các món mẫu. Dung tích ly: S 350 ml, M 450 ml, L 600 ml.",
  "- Món bánh / đồ ăn: hasSizes = false, temps = NONE, qtyS = qtyL = null.",
  "- Không dùng nguyên liệu có cồn. Tên món tiếng Việt ngắn (≤ 40 ký tự), KHÔNG trùng món đang có. Tên nhắc nguyên liệu nào thì định mức phải có nguyên liệu đó.",
  "- categoryId chọn trong danh sách danh mục (danh mục con cụ thể, không chọn danh mục gốc nếu có danh mục con phù hợp).",
  "- KHÔNG ghi giá bán, giá vốn (hệ thống tự tính). steps: 3–6 bước pha ngắn gọn cho pha chế. risk: rủi ro thực tế khi pha / bảo quản, hoặc null.",
].join("\n");

function userPrompt(ctx: DraftContext) {
  const parts: string[] = [];
  if (ctx.demand) {
    parts.push(
      `NHU CẦU: khách tìm "${ctx.demand.display}"${ctx.demand.variants.length ? ` (các cách gõ: ${ctx.demand.variants.join(", ")})` : ""}` +
        `${ctx.demand.searchers ? ` — ${ctx.demand.searchers} khách / ${ctx.demand.searches} lượt trong ${ctx.demand.days} ngày` : ""}, quán chưa có món nào khớp.`,
    );
  }
  if (ctx.idea) parts.push(`Ý TƯỞNG CỦA NHÂN VIÊN: ${ctx.idea}`);
  if (ctx.note) parts.push(`GHI CHÚ KHI PHÁC THẢO LẠI: ${ctx.note}`);
  if (ctx.categoryId) parts.push(`Danh mục gợi ý: ${ctx.categoryId}`);
  parts.push(
    "DANH MỤC (id | tên | cha):\n" + ctx.categories.map((c) => `${c.id} | ${c.name} | ${c.parentId ?? "-"}`).join("\n"),
    "NGUYÊN LIỆU TRONG KHO (id | tên | nhóm | đơn vị công thức | giá VND / đơn vị công thức | còn ở chi nhánh):\n" +
      ctx.ingredients.map((i) => `${i.id} | ${i.name} | ${i.category ?? ""} | ${i.recipeUnit} | ${i.costPerRecipeUnit} | ${i.inStockAtStore ? "còn" : "hết"}`).join("\n"),
    "MÓN MẪU ĐANG BÁN (định mức S/M/L theo đơn vị công thức):\n" +
      ctx.samples
        .map((s) => `- ${s.name} (danh mục ${s.categoryId}, ${s.temps}${s.hasSizes ? "" : ", 1 loại"}):\n` + s.lines.map((l) => `    #${l.itemId} ${l.name}: ${s.hasSizes ? `${l.qtyS}/${l.qtyM}/${l.qtyL}` : l.qtyM} ${l.recipeUnit}`).join("\n"))
        .join("\n"),
    "MÓN ĐANG CÓ (không đặt trùng tên): " + ctx.existingNames.join("; "),
    "Phác thảo 2–3 phương án và trả JSON đúng schema.",
  );
  return parts.join("\n\n");
}

export async function generateDraft(ctx: DraftContext) {
  const t0 = Date.now();
  const deadline = t0 + TIMEOUT_MS;
  let model = AI_CONFIG.chatModel;
  const call = (m: string) =>
    withRetry(
      () =>
        gemini().models.generateContent({
          model: m,
          contents: [{ role: "user", parts: [{ text: userPrompt(ctx) }] }],
          config: {
            systemInstruction: SYSTEM,
            temperature: 0.7,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: "application/json",
            responseJsonSchema: DRAFT_SCHEMA,
            abortSignal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())),
          },
        }),
      1,
    );
  // Model chính quá tải / hết hạn mức → model lite (nếu còn thời gian)
  const res = await call(model).catch((e) => {
    if (!isBusy(e) || model === AI_CONFIG.liteModel || deadline - Date.now() < 8000) throw e;
    model = AI_CONFIG.liteModel;
    return call(model);
  });
  const raw = JSON.parse((res.text ?? "").replace(/^```(?:json)?\s*|\s*```$/g, "")) as Partial<DraftResult>;
  return {
    result: normalizeDraft(raw),
    model,
    tokensIn: res.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: (res.usageMetadata?.candidatesTokenCount ?? 0) + (res.usageMetadata?.thoughtsTokenCount ?? 0),
    latencyMs: Date.now() - t0,
  };
}

/* ═══════════ Chuẩn hoá (dùng cho cả kết quả AI lẫn phương án người dùng sửa) ═══════════ */

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const TEMPS = ["BOTH", "ICED", "HOT", "NONE"] as const;
const ROLES = ["base", "milk", "sweetener", "topping", "other"] as const;

export function normalizeLine(l: unknown): DraftLine | null {
  if (!l || typeof l !== "object") return null;
  const r = l as Record<string, unknown>;
  const itemId = num(r.itemId);
  const ni = r.newIngredient && typeof r.newIngredient === "object" ? (r.newIngredient as Record<string, unknown>) : null;
  const newIngredient: NewIngredient | null =
    itemId == null && ni && str(ni.name, 100)
      ? { name: str(ni.name, 100), recipeUnit: str(ni.recipeUnit, 20) || "g", estCostPerRecipeUnit: Math.max(0, num(ni.estCostPerRecipeUnit) ?? 0), note: str(ni.note, 200) || null }
      : null;
  return {
    itemId: itemId != null ? Math.round(itemId) : null,
    newIngredient,
    qtyS: num(r.qtyS),
    qtyM: num(r.qtyM) ?? 0,
    qtyL: num(r.qtyL),
    recipeUnit: str(r.recipeUnit, 20),
    role: (ROLES as readonly string[]).includes(r.role as string) ? (r.role as DraftRole) : "other",
  };
}

export function normalizeOption(o: unknown): DraftOption | null {
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  const name = str(r.name, 60);
  if (!name) return null;
  const temps = (TEMPS as readonly string[]).includes(r.temps as string) ? (r.temps as DraftOption["temps"]) : "BOTH";
  return {
    name,
    description: str(r.description, 200),
    categoryId: Math.round(num(r.categoryId) ?? 0),
    temps,
    hasSizes: r.hasSizes !== false,
    lines: (Array.isArray(r.lines) ? r.lines : []).slice(0, 15).map(normalizeLine).filter((x): x is DraftLine => !!x),
    steps: (Array.isArray(r.steps) ? r.steps : []).map((s) => str(s, 200)).filter(Boolean).slice(0, 8),
    whyFits: str(r.whyFits, 300),
    risk: str(r.risk, 300) || null,
  };
}

export function normalizeDraft(raw: Partial<DraftResult> | null): DraftResult {
  return {
    understood: str(raw?.understood, 300),
    options: (Array.isArray(raw?.options) ? raw!.options : []).slice(0, 3).map(normalizeOption).filter((x): x is DraftOption => !!x),
  };
}
