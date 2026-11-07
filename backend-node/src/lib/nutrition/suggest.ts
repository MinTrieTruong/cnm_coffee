/**
 * lib/nutrition/suggest.ts — AI gợi ý dinh dưỡng NGUYÊN LIỆU (không bao giờ gợi ý thẳng cho món).
 *
 * Kết quả lưu source = "AI", approved = false → không dùng cho khách tới khi quản lý duyệt.
 * Kiểm tra bằng code: số không âm; kcal ≈ 9×béo + 4×(carb hoặc đường) + 4×đạm (lệch > 25% → cảnh báo);
 * nguyên liệu không phải cà phê / trà / matcha / cacao mà có caffeine → cảnh báo.
 */
import { ThinkingLevel } from "@google/genai";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import { AI_CONFIG, gemini, isBusy } from "../../ai/gemini.js";
import { normalizeTerm } from "../searchInsights.js";
import { ALLERGENS } from "./labels.js";

export const MAX_SUGGEST = 20;
const TIMEOUT_MS = 30_000;

const NUM = { type: ["number", "null"] };
const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          itemId: { type: "integer" },
          basis: { type: "string", enum: ["PER_100", "PER_UNIT"] },
          kcal: NUM, fatG: NUM, satFatG: NUM, sugarG: NUM, proteinG: NUM, carbG: NUM, caffeineMg: NUM,
          allergens: { type: "array", items: { type: "string", enum: [...ALLERGENS] } },
          isVegan: { type: "boolean" },
          isSugarSource: { type: "boolean" },
          isFood: { type: "boolean" },
          confidence: { type: "number" },
          note: { type: "string" },
        },
        required: ["itemId", "basis", "kcal", "fatG", "sugarG", "proteinG", "caffeineMg", "allergens", "isVegan", "isSugarSource", "isFood", "confidence", "note"],
      },
    },
  },
  required: ["items"],
};

const SYSTEM = `Bạn là chuyên gia dinh dưỡng, ước tính thành phần dinh dưỡng NGUYÊN LIỆU pha chế của một quán cà phê ở Việt Nam.
Với mỗi nguyên liệu: dùng giá trị trung bình phổ biến của sản phẩm cùng loại bán ở Việt Nam (VD sữa đặc có đường, sữa tươi thanh trùng không đường, cà phê phin rang xay, bột matcha, trân châu đen nấu sẵn…).
- basis: "PER_100" = trên 100 g (hoặc 100 ml) đơn vị công thức; "PER_UNIT" khi đơn vị công thức là cái / chiếc (bánh, ly…) = trên 1 cái.
- Nguyên liệu CHIẾT rồi bỏ bã (cà phê bột / hạt, lá trà khô): mọi số là phần TAN VÀO ĐỒ UỐNG từ 100 g nguyên liệu, không phải nguyên liệu khô.
  VD 100 g cà phê bột pha phin / máy → ~ 20–30 kcal, béo ~ 0, đạm ~ 1 g, caffeine ~ 1.000–1.200 mg (robusta) / ~ 700–900 mg (arabica);
  100 g trà khô (đen, oolong, lài, xanh) pha → ~ 10–25 kcal, caffeine ~ 1.000–1.500 mg (chiết ~ 40–60% của 2.000–3.000 mg trong lá).
  Bột uống trọn (matcha, cacao) thì tính đủ như nguyên liệu khô.
- caffeineMg: lượng caffeine thực vào đồ uống từ 100 g (hoặc 1 cái) nguyên liệu. Ghi rõ giả định trong note. Nguyên liệu không có caffeine → 0.
- Vật tư không ăn được (ly, nắp, ống hút, túi) → isFood false, mọi số = 0, allergens rỗng. Đá viên / nước → isFood true, mọi số = 0, isVegan true.
- allergens trong: milk (sữa, kem sữa, bơ, phô mai, bột sữa béo có casein), nuts (hạt cây), peanut, gluten (lúa mì: bánh mì, bánh ngọt…), egg, soy. Thận trọng: có khả năng chứa thì đánh dấu (VD bột kem béo thực vật thường có casein sữa / đậu nành).
- isVegan: không có thành phần động vật (sữa, trứng, mật ong, gelatin…).
- isSugarSource: nguyên liệu dùng chủ yếu để tạo ngọt (đường, siro, sữa đặc, mứt…) — khách chọn ít đường thì giảm.
- Không chắc thì để null và confidence thấp (< 0,5). Không bịa độ chính xác: làm tròn hợp lý.
- note: ngắn gọn giả định đã dùng (tiếng Việt, ≤ 200 ký tự).`;

type Suggestion = {
  itemId: number; basis: "PER_100" | "PER_UNIT"; kcal: number | null; fatG: number | null; satFatG: number | null; sugarG: number | null;
  proteinG: number | null; carbG: number | null; caffeineMg: number | null; allergens: string[]; isVegan: boolean; isSugarSource: boolean;
  isFood: boolean; confidence: number; note: string;
};

const CAFFEINE_SOURCES = /ca phe|cafe|coffee|espresso|tra |^tra|matcha|cacao|cocoa|socola|chocolate|oolong|tiramisu|mocha/;

/** Cảnh báo kiểm tra bằng code cho một dòng dinh dưỡng */
export function checkNutrition(n: { kcal: number | null; fatG: number | null; sugarG: number | null; carbG: number | null; proteinG: number | null; caffeineMg: number | null }, name: string): string[] {
  const w: string[] = [];
  for (const [k, v] of Object.entries(n)) if (typeof v === "number" && v < 0) w.push(`${k} âm`);
  if (n.kcal != null && n.kcal > 0 && n.fatG != null && n.proteinG != null) {
    const carb = n.carbG ?? n.sugarG ?? 0;
    const est = 9 * n.fatG + 4 * carb + 4 * n.proteinG;
    if (Math.abs(est - n.kcal) / Math.max(n.kcal, 1) > 0.25) w.push(`kcal ${Math.round(n.kcal)} lệch > 25% so với 9×béo + 4×carb + 4×đạm = ${Math.round(est)}`);
  }
  if ((n.caffeineMg ?? 0) > 0 && !CAFFEINE_SOURCES.test(` ${normalizeTerm(name)}`)) w.push(`Có caffeine (${n.caffeineMg} mg) dù không phải cà phê / trà / matcha / cacao`);
  return w;
}

export async function suggestNutrition(itemIds: number[]) {
  const t0 = Date.now();
  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: itemIds.slice(0, MAX_SUGGEST) } },
    select: { id: true, name: true, category: true, unit: true, recipeUnit: true, recipePerUnit: true, nutrition: { select: { approved: true } } },
  });
  // Đã duyệt thì không ghi đè bằng gợi ý AI
  const todo = items.filter((i) => !i.nutrition?.approved);
  if (!todo.length) return { saved: 0, skipped: items.length, model: null, tokensIn: 0, tokensOut: 0, latencyMs: 0 };

  const list = todo.map((i) => `- itemId ${i.id}: ${i.name} | nhóm: ${i.category ?? "?"} | đơn vị công thức: ${i.recipeUnit ?? i.unit ?? "?"} (1 ${i.unit ?? "đơn vị kho"} = ${i.recipePerUnit} ${i.recipeUnit ?? ""})`).join("\n");
  let model = AI_CONFIG.liteModel;
  const call = (m: string) =>
    gemini().models.generateContent({
      model: m,
      contents: [{ role: "user", parts: [{ text: `Ước tính dinh dưỡng cho các nguyên liệu sau:\n${list}` }] }],
      config: {
        systemInstruction: SYSTEM,
        temperature: 0.2,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseJsonSchema: SCHEMA,
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      },
    });
  const res = await call(model).catch((e) => {
    if (!isBusy(e)) throw e;
    model = AI_CONFIG.chatModel;
    return call(model);
  });
  const parsed = JSON.parse((res.text ?? "{}").replace(/^```(?:json)?\s*|\s*```$/g, "")) as { items?: Suggestion[] };
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  let saved = 0;
  for (const s of parsed.items ?? []) {
    const item = todo.find((i) => i.id === s.itemId);
    if (!item) continue;
    const values = {
      basis: s.basis === "PER_UNIT" ? "PER_UNIT" : "PER_100",
      kcal: num(s.kcal), fatG: num(s.fatG), satFatG: num(s.satFatG), sugarG: num(s.sugarG), proteinG: num(s.proteinG), carbG: num(s.carbG), caffeineMg: num(s.caffeineMg),
      allergens: (s.allergens ?? []).filter((a) => (ALLERGENS as readonly string[]).includes(a)),
      isVegan: !!s.isVegan,
      isSugarSource: !!s.isSugarSource,
    };
    const warnings = checkNutrition(values, item.name);
    const data = {
      ...values,
      source: "AI",
      confidence: Math.min(1, Math.max(0, num(s.confidence) ?? 0.5)),
      note: [s.isFood === false ? "Vật tư, không ăn được." : "", String(s.note ?? "")].filter(Boolean).join(" ").slice(0, 500) || null,
      warnings: warnings as unknown as Prisma.InputJsonValue,
      approved: false,
      approvedById: null,
      approvedAt: null,
    };
    await prisma.ingredientNutrition.upsert({ where: { itemId: item.id }, update: data, create: { itemId: item.id, ...data } });
    saved++;
  }
  return {
    saved,
    skipped: items.length - todo.length,
    model,
    tokensIn: res.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: (res.usageMetadata?.candidatesTokenCount ?? 0) + (res.usageMetadata?.thoughtsTokenCount ?? 0),
    latencyMs: Date.now() - t0,
  };
}
