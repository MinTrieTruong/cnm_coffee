/**
 * lib/weatherPicks.ts — "Hợp thời tiết hôm nay": chọn 4 món bằng LUẬT (giải thích được), AI chỉ viết câu dẫn.
 *
 * Điểm từng món đang bán ở chi nhánh (chưa hết hàng):
 *  - nóng / ấm: món có bản đá (ICED / BOTH) +3, trà trái cây / đá xay +2, "Nhiều béo" −1
 *  - mát / mưa: món có bản nóng (HOT / BOTH) +3, bánh +1
 *  - 5–10h: cà phê +2 · 14–17h: bánh / đồ ăn nhẹ +1 · sau 17h: caffeine cao −3, không / ít caffeine +2
 *  - bán chạy 14 ngày ở chi nhánh: tối đa +2 theo thứ hạng · đang giảm giá +1
 * Chọn 4 món điểm cao nhất, tối đa 2 món cùng danh mục; kèm lý do ngắn + gợi ý bản đá / nóng.
 * Câu dẫn: Gemini liteModel (cache theo chi nhánh + ngày + khung 3 giờ + kiểu thời tiết); tắt / lỗi → câu mẫu.
 */
import { ThinkingLevel } from "@google/genai";
import { prisma } from "../db.js";
import { addDaysYmd, bizDayStart, bizHour, bizToday } from "./bizTime.js";
import { storeMenuState } from "./storeProducts.js";
import { AI_CONFIG, gemini, hasGeminiKey } from "../ai/gemini.js";
import { getAiSetting } from "../ai/settings.js";
import { foldVi } from "../ai/knowledge/text.js";
import type { Labels } from "./nutrition/labels.js";
import type { Condition, Weather } from "./weather.js";

export type Pick = { productId: number; name: string; score: number; reason: { vi: string; en: string }; suggestTemp: "ICED" | "HOT" | null };
export type Headline = { vi: string; en: string };
type Daypart = "morning" | "noon" | "afternoon" | "evening";

export const daypartOf = (hour: number): Daypart => (hour >= 5 && hour < 11 ? "morning" : hour < 14 && hour >= 11 ? "noon" : hour >= 14 && hour < 17 ? "afternoon" : "evening");

type Candidate = {
  id: number; name: string; categoryId: number; category: string; temps: string; hasSizes: boolean; discountPercent: number | null;
  labels: Labels | null;
};

/** Ứng viên: món đang bán ở chi nhánh, chưa hết hàng, kèm nhãn dinh dưỡng size mặc định */
async function candidates(storeId: number): Promise<Candidate[]> {
  const { disabled, soldOut } = await storeMenuState(prisma, storeId);
  const rows = await prisma.product.findMany({
    where: { isActive: true, outOfStock: false },
    select: { id: true, name: true, categoryId: true, temps: true, hasSizes: true, discountPercent: true, category: { select: { name: true } }, nutrition: { select: { size: true, labels: true, complete: true } } },
  });
  return rows
    .filter((p) => !disabled.has(p.id) && !soldOut.has(p.id))
    .map((p) => {
      const n = p.nutrition.find((x) => x.size === "M") ?? p.nutrition.find((x) => x.size === "-");
      return { id: p.id, name: p.name, categoryId: p.categoryId, category: p.category.name, temps: p.temps, hasSizes: p.hasSizes, discountPercent: p.discountPercent, labels: n?.complete ? (n.labels as Labels) : null };
    });
}

/** Thứ hạng bán chạy 14 ngày gần nhất ở chi nhánh (productId → hạng, 0 = nhất) */
async function bestSellerRanks(storeId: number) {
  const since = bizDayStart(addDaysYmd(bizToday(), -13));
  const rows = await prisma.orderDetail.groupBy({
    by: ["productId"],
    where: { order: { storeId, status: "Paid", createdAt: { gte: since } } },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: 10,
  });
  return new Map(rows.map((r, i) => [r.productId, i]));
}

export async function pickProducts(storeId: number, now: Date, weather: Weather | null, limit = 4): Promise<Pick[]> {
  const [list, ranks] = await Promise.all([candidates(storeId), bestSellerRanks(storeId)]);
  const hour = bizHour(now);
  const part = daypartOf(hour);
  const cond: Condition | null = weather?.condition ?? null;
  const hotish = cond === "hot" || cond === "warm";
  const coolish = cond === "cool" || cond === "rain";

  const scored = list.map((p) => {
    const cat = foldVi(p.category);
    const name = foldVi(p.name);
    const isFood = !p.hasSizes || /do an|banh/.test(cat);
    const isCoffee = /ca phe|espresso|coffee/.test(cat) || /ca phe|americano|latte|cappuccino|bac xiu|macchiato/.test(name);
    const isFruitTea = /trai cay|tra dao|tra vai|buoi|cam sa|da xay|frappe/.test(`${cat} ${name}`);
    // Tên món đã ghi rõ "đá" / "nóng" (Cà Phê Sữa Đá, Americano (Đá)) → chỉ gợi ý đúng bản đó
    const nameIced = /(^|[\s(])da($|[\s)])/.test(name);
    const nameHot = /(^|[\s(])nong($|[\s)])/.test(name);
    const canIce = (p.temps === "ICED" || p.temps === "BOTH") && !nameHot;
    const canHot = (p.temps === "HOT" || p.temps === "BOTH") && !nameIced;
    const why: { vi: string; en: string }[] = [];
    let score = 0;
    let suggestTemp: Pick["suggestTemp"] = null;

    if (hotish && !isFood) {
      if (canIce) {
        score += 3;
        suggestTemp = "ICED";
        why.push({ vi: "uống đá cho mát", en: "iced to cool down" });
      }
      if (isFruitTea) {
        score += 2;
        why.push({ vi: "thanh mát", en: "light and refreshing" });
      }
      if (p.labels?.fat === "high") score -= 1;
      else if (p.labels?.fat === "low" && canIce) why.push({ vi: "ít béo", en: "low fat" });
    }
    if (coolish) {
      if (!isFood && canHot) {
        score += 3;
        suggestTemp = "HOT";
        why.push({ vi: cond === "rain" ? "ly nóng ngày mưa" : "ấm người", en: cond === "rain" ? "a warm cup for the rain" : "warms you up" });
      }
      if (isFood) {
        score += 1;
        why.push({ vi: "ăn kèm ấm bụng", en: "a cosy bite" });
      }
    }
    if (part === "morning" && isCoffee) {
      score += 2;
      why.push({ vi: "tỉnh táo buổi sáng", en: "a morning pick-me-up" });
    }
    if (part === "afternoon" && isFood) {
      score += 1;
      why.push({ vi: "ăn nhẹ buổi chiều", en: "an afternoon snack" });
    }
    if (part === "evening") {
      if (p.labels?.caffeine === "high") score -= 3;
      if (p.labels?.caffeine === "none" || p.labels?.caffeine === "low") {
        score += 2;
        why.push({ vi: "ít caffeine cho buổi tối", en: "low caffeine for the evening" });
      }
    }
    const rank = ranks.get(p.id);
    if (rank != null) {
      score += rank === 0 ? 2 : rank < 3 ? 1.5 : rank < 6 ? 1 : 0.5;
      if (rank < 3) why.push({ vi: "đang bán chạy", en: "a best seller" });
    }
    if (p.discountPercent && p.discountPercent > 0) {
      score += 1;
      why.push({ vi: `đang giảm ${p.discountPercent}%`, en: `${p.discountPercent}% off` });
    }
    const top = why.slice(0, 2);
    return {
      productId: p.id,
      name: p.name,
      categoryId: p.categoryId,
      score,
      suggestTemp,
      reason: { vi: top.map((w) => w.vi).join(", ") || "món quen của quán", en: top.map((w) => w.en).join(", ") || "a house favourite" },
    };
  });

  // Điểm cao trước; hoà điểm thì món bán chạy trước, rồi theo id cho ổn định
  scored.sort((a, b) => b.score - a.score || (ranks.get(a.productId) ?? 99) - (ranks.get(b.productId) ?? 99) || a.productId - b.productId);
  const out: Pick[] = [];
  const perCat = new Map<number, number>();
  for (const s of scored) {
    if ((perCat.get(s.categoryId) ?? 0) >= 2) continue;
    perCat.set(s.categoryId, (perCat.get(s.categoryId) ?? 0) + 1);
    out.push({ productId: s.productId, name: s.name, score: s.score, reason: s.reason, suggestTemp: s.suggestTemp });
    if (out.length >= limit) break;
  }
  return out;
}

/* ═══════════ Câu dẫn ═══════════ */

const PART_TEXT: Record<Daypart, { vi: string; en: string }> = {
  morning: { vi: "buổi sáng", en: "morning" },
  noon: { vi: "buổi trưa", en: "midday" },
  afternoon: { vi: "buổi chiều", en: "afternoon" },
  evening: { vi: "buổi tối", en: "evening" },
};

/** Câu mẫu theo thời tiết + giờ (khi AI tắt / lỗi) */
/** "TD Coffee - Chi nhánh 1" → "Chi nhánh 1" (câu dẫn gọn) */
export const shortStoreName = (name: string) => name.replace(/^TD Coffee\s*[-–·:]\s*/i, "").trim() || name;

export function templateHeadline(storeName: string, weather: Weather | null, top: Pick | undefined, now: Date): Headline {
  const part = daypartOf(bizHour(now));
  storeName = shortStoreName(storeName);
  const dish = top?.name ?? "món quen";
  // Tên đã có "đá" / "nóng" thì không thêm lần nữa
  const named = /(^|[\s(])(da|nong)($|[\s)])/.test(foldVi(dish));
  const temp = named ? "" : top?.suggestTemp === "ICED" ? " đá" : top?.suggestTemp === "HOT" ? " nóng" : "";
  const tempEn = named ? "" : top?.suggestTemp === "ICED" ? "iced " : top?.suggestTemp === "HOT" ? "hot " : "";
  if (!weather) {
    return {
      vi: `Gợi ý ${PART_TEXT[part].vi} ở ${storeName}: thử ${dish}${temp} nhé`,
      en: `Our ${PART_TEXT[part].en} pick at ${storeName}: try the ${tempEn}${dish}`,
    };
  }
  const w = `${weather.tempC}°C, ${weather.label.vi.toLowerCase()}`;
  const wEn = `${weather.tempC}°C and ${weather.label.en.toLowerCase()}`;
  switch (weather.condition) {
    case "hot":
    case "warm":
      return { vi: `${w} ở ${storeName}, một ly ${dish}${temp} cho mát nhé`, en: `${wEn} at ${storeName} — cool off with ${tempEn ? "an " + tempEn : "a "}${dish}` };
    case "rain":
      return { vi: `${w} ở ${storeName}, ghé quán làm ly ${dish}${temp} ấm áp`, en: `${wEn} at ${storeName} — warm up with a ${tempEn}${dish}` };
    default:
      return { vi: `${w} ở ${storeName}, hợp một ly ${dish}${temp}`, en: `${wEn} at ${storeName} — perfect for a ${tempEn}${dish}` };
  }
}

const headlineCache = new Map<string, Headline>();
const inflight = new Map<string, Promise<Headline | null>>();

/**
 * Câu dẫn AI (cache theo chi nhánh + ngày + khung 3 giờ + kiểu thời tiết); trả kèm nguồn AI / TEMPLATE.
 * Chờ AI tối đa `waitMs` — quá thì trả câu mẫu ngay, AI vẫn chạy nền và vào cache cho lần tải sau (trang chủ không bị chậm).
 */
export async function headline(storeId: number, storeName: string, weather: Weather | null, picks: Pick[], now: Date, waitMs = 2500): Promise<{ headline: Headline; source: "AI" | "TEMPLATE" }> {
  const fallback = { headline: templateHeadline(storeName, weather, picks[0], now), source: "TEMPLATE" as const };
  const slot = Math.floor(bizHour(now) / 3);
  const key = `${storeId}|${bizToday()}|${slot}|${weather?.condition ?? "none"}|${picks[0]?.productId ?? 0}`;
  const hit = headlineCache.get(key);
  if (hit) return { headline: hit, source: "AI" };
  if (!hasGeminiKey() || !picks.length) return fallback;
  const setting = await getAiSetting("WEATHER_PICKS");
  if (!setting.enabled) return fallback;
  let job = inflight.get(key);
  if (!job) {
    if (setting.dailyLimit) {
      const used = await prisma.aiCallLog.count({ where: { feature: "WEATHER_PICKS", createdAt: { gte: bizDayStart(bizToday()) } } });
      if (used >= setting.dailyLimit) return fallback;
    }
    job = aiHeadline(key, storeId, shortStoreName(storeName), weather, picks, now).finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  const h = await Promise.race([job, new Promise<null>((r) => setTimeout(() => r(null), waitMs))]);
  return h ? { headline: h, source: "AI" } : fallback;
}

async function aiHeadline(key: string, storeId: number, storeName: string, weather: Weather | null, picks: Pick[], now: Date): Promise<Headline | null> {
  const t0 = Date.now();
  const part = PART_TEXT[daypartOf(bizHour(now))];
  const prompt = [
    `Chi nhánh: ${storeName}. Thời điểm: ${part.vi}.`,
    weather ? `Thời tiết: ${weather.tempC}°C (cảm giác ${weather.feelsC}°C), ${weather.label.vi}, độ ẩm ${weather.humidity}%.` : "Không có dữ liệu thời tiết.",
    `Món gợi ý: ${picks.map((p) => `${p.name}${p.suggestTemp === "ICED" ? " (đá)" : p.suggestTemp === "HOT" ? " (nóng)" : ""}`).join(", ")}.`,
    `Viết MỘT câu dẫn ngắn cho khối "Hợp thời tiết hôm nay" trên trang chủ quán, nhắc thời tiết (nếu có) và đúng 1 món: "${picks[0]?.name ?? ""}".`,
  ].join("\n");
  try {
    const res = await gemini().models.generateContent({
      model: AI_CONFIG.liteModel,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction:
          "Bạn viết câu dẫn cho website quán cà phê TD Coffee: giọng thân thiện, tự nhiên như nhân viên quán, tối đa 90 ký tự mỗi câu, không emoji, không dấu chấm than liên tiếp, không hứa lợi ích sức khoẻ, không nói giá. Trả JSON { vi, en } (en là bản tiếng Anh tự nhiên, không dịch từng chữ).",
        temperature: 0.8,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseJsonSchema: { type: "object", properties: { vi: { type: "string" }, en: { type: "string" } }, required: ["vi", "en"] },
        abortSignal: AbortSignal.timeout(20000),
      },
    });
    const j = JSON.parse(res.text ?? "{}") as Partial<Headline>;
    const clean = (s: unknown) => (typeof s === "string" ? s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").replace(/\s+/g, " ").trim().slice(0, 90) : "");
    const h = { vi: clean(j.vi), en: clean(j.en) };
    if (!h.vi || !h.en) throw new Error("AI trả câu rỗng");
    headlineCache.set(key, h);
    await prisma.aiCallLog.create({
      data: { feature: "WEATHER_PICKS", storeId, status: "OK", inputKind: "text", model: AI_CONFIG.liteModel, tokensIn: res.usageMetadata?.promptTokenCount ?? 0, tokensOut: (res.usageMetadata?.candidatesTokenCount ?? 0) + (res.usageMetadata?.thoughtsTokenCount ?? 0), latencyMs: Date.now() - t0, summary: h.vi },
    }).catch(() => {});
    return h;
  } catch (e) {
    await prisma.aiCallLog.create({ data: { feature: "WEATHER_PICKS", storeId, status: "ERROR", inputKind: "text", latencyMs: Date.now() - t0, error: String(e).slice(0, 500) } }).catch(() => {});
    return null;
  }
}
