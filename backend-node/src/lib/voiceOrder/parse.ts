/**
 * lib/voiceOrder/parse.ts — Câu gọi món (âm thanh hoặc chữ) → giỏ hàng chờ xác nhận.
 *
 * Một lần gọi Gemini: nghe / đọc câu + thực đơn chi nhánh → JSON (món, số lượng, size, nóng/đá, đá, đường, ghi chú).
 * Sau đó backend KIỂM TRA LẠI mọi thứ: món phải thuộc thực đơn chi nhánh và đang bán, size / nóng-đá theo cấu hình món,
 * số lượng 1–20, giá do backend tính (unitPriceOf) — không lấy giá hay tên món từ AI.
 * Câu sửa ("đổi bạc xỉu thành size L", "bỏ croissant") được áp lên giỏ đang xác nhận (`current`) và trả về giỏ đầy đủ.
 * Món không có / đang hết → `unknown` kèm gợi ý, ghi vào SearchLog để hiện ở "Khách tìm kiếm".
 * Khách web đã đăng nhập: món quen (lib/customerHabits.ts) gửi kèm prompt — "như mọi khi" / "món quen" → món quen số 1;
 * gọi món quen mà không nói size / nóng-đá / đá / đường / ghi chú → điền theo lựa chọn quen thay vì mặc định 100/100.
 * Không bao giờ tự gửi đơn: người dùng luôn bấm xác nhận.
 */
import { ThinkingLevel, type Content, type Part } from "@google/genai";
import { prisma } from "../../db.js";
import { AI_CONFIG, audioPart, gemini, isBusy } from "../../ai/gemini.js";
import { unitPriceOf, type Size, type Temp } from "../menuPrice.js";
import { normalizeTerm } from "../searchInsights.js";
import { buildMenuContext, menuPromptText, type MenuContext, type MenuProduct } from "./menuContext.js";
import { getUsualItems, type UsualItem } from "../customerHabits.js";

export type Channel = "POS" | "WEB";
export type Level = 0 | 50 | 100;
export type Intent = "add" | "modify" | "remove" | "clear" | "unclear";

/** Một dòng giỏ (giỏ đang xác nhận gửi lên, hoặc kết quả trả về) */
export type CartLine = {
  productId: number | null;
  comboId: number | null;
  qty: number;
  size: Size | null;
  temp: Temp | null;
  /** % đá (chỉ món uống đá); null = bình thường */
  ice: Level | null;
  /** % đường (chỉ món uống); null = bình thường */
  sugar: Level | null;
  note: string | null;
};
export type OutLine = CartLine & {
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  hasSizes: boolean;
  /** Nóng / đá chọn được: [] = không áp dụng */
  temps: Temp[];
  /** Độ chắc chắn của AI (0–1); < 0,7 → giao diện tô vàng */
  confidence: number;
  /** Dòng mới thêm / vừa sửa trong lần nói này */
  changed: boolean;
};
export type Suggestion = { id: number; name: string; imageUrl: string | null; price: number };
export type Unknown = { spokenName: string; reason: "missing" | "soldout"; suggestions: Suggestion[] };
export type ParseResult = {
  transcript: string;
  intent: Intent;
  lines: OutLine[];
  unknown: Unknown[];
  clarify: string | null;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
};

const TIMEOUT_MS = 10_000;
const MODEL = process.env.VOICE_ORDER_MODEL || AI_CONFIG.liteModel;
const FALLBACK_MODEL = MODEL === AI_CONFIG.liteModel ? AI_CONFIG.chatModel : AI_CONFIG.liteModel;
const MAX_QTY = 20;
const LEVELS = [0, 50, 100];

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    transcript: { type: "string" },
    intent: { type: "string", enum: ["add", "modify", "remove", "clear", "unclear"] },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          productId: { type: ["integer", "null"] },
          comboId: { type: ["integer", "null"] },
          spokenName: { type: "string" },
          qty: { type: "integer" },
          size: { type: ["string", "null"], enum: ["S", "M", "L", null] },
          temp: { type: ["string", "null"], enum: ["HOT", "ICED", null] },
          ice: { type: ["integer", "null"] },
          sugar: { type: ["integer", "null"] },
          note: { type: ["string", "null"] },
          confidence: { type: "number" },
          targetLine: { type: ["integer", "null"] },
        },
        required: ["productId", "spokenName", "qty", "confidence"],
      },
    },
    unknown: {
      type: "array",
      items: {
        type: "object",
        properties: { spokenName: { type: "string" }, suggestions: { type: "array", items: { type: "integer" } } },
        required: ["spokenName", "suggestions"],
      },
    },
    clarify: { type: ["string", "null"] },
  },
  required: ["transcript", "intent", "items", "unknown"],
};

/** Món quen của khách → chữ cho prompt: "1. #7 Bạc Xỉu — size M, đá 50%, đường 50%, ghi chú: không ống hút" */
function usualPromptText(usual: UsualItem[]) {
  return usual
    .map((u, i) => {
      const o = u.usual;
      const opts = [o.size ? `size ${o.size}` : "", o.temperature === "HOT" ? "nóng" : o.temperature === "ICED" ? `đá ${o.icePct ?? 100}%` : "", o.sugar != null ? `đường ${o.sugar}%` : "", u.usualNote ? `ghi chú: ${u.usualNote}` : ""].filter(Boolean);
      return `${i + 1}. #${u.productId} ${u.product.name}${opts.length ? ` — ${opts.join(", ")}` : ""}${u.soldOut ? " (ĐANG HẾT)" : ""}`;
    })
    .join("\n");
}

/** Câu "như mọi khi" / "món quen" / "như cũ" (đã bỏ dấu) */
const USUAL_PHRASE = /\b(nhu moi khi|nhu cu|nhu thuong le|nhu hom truoc|nhu lan truoc|mon quen|mon hay uong|mon hay goi|as usual|the usual)\b/;
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");

function systemPrompt(menu: string, channel: Channel, usual = "") {
  return `Bạn là nhân viên nhận order của quán cà phê TD Coffee${channel === "POS" ? " (thu ngân nói lại món khách gọi)" : " (khách tự đặt món trên web)"}.
Nhiệm vụ: nghe đoạn âm thanh hoặc đọc câu chữ, trả về JSON các món được gọi. KHÔNG trả lời gì khác.

THỰC ĐƠN CHI NHÁNH (chỉ được chọn productId "#số"${channel === "WEB" ? ' hoặc comboId "C số"' : ""} có trong danh sách này):
${menu}

QUY TẮC:
- transcript: câu bạn nghe / đọc được, viết lại tiếng Việt có dấu cho dễ đọc.
- Hiểu tiếng Việt nói tự nhiên, không dấu, viết tắt (cf = cà phê, ts = trà sữa, vs = với, bx = bạc xỉu), tên gọi khác ghi trong thực đơn, gõ / nói sai nhẹ.
- Số lượng: "một"/"1" = 1, "hai"/"2" = 2, "một cặp"/"đôi" = 2, "chục" = 10, "nửa chục" = 5; không nói = 1. Tối đa 20.
- Size: "nhỏ"/"S" = S; "vừa"/"M"/không nói = M (để null nếu không nói); "lớn"/"bự"/"to"/"L" = L. Món đồ ăn không có size.
- Nóng / đá: "nóng" = HOT, "đá"/"lạnh" = ICED, không nói = null. Món "chỉ đá" / "chỉ nóng" theo thực đơn.
- Đá: "ít đá" = 50, "không đá" = 0, "nhiều đá"/"đá bình thường" = 100; không nói = null.
- Đường: "ít ngọt"/"ít đường" = 50, "không đường"/"không ngọt" = 0, "ngọt bình thường"/"nhiều ngọt" = 100; không nói = null.
- Topping và yêu cầu khác ("thêm trân châu", "để riêng đá", "mang về") ghi vào note ngắn gọn, không tính tiền.
- Món đồ ăn (bánh…) không có size / nóng-đá / đá / đường.
- Món khách nói KHÔNG có trong thực đơn → đưa vào unknown (spokenName = tên khách nói) với tối đa 3 productId gợi ý gần giống trong thực đơn; không ép thành món khác.
- Món ghi "ĐANG HẾT" vẫn trả productId bình thường (hệ thống sẽ báo hết cho khách).
- Khi có GIỎ ĐANG XÁC NHẬN (các dòng đánh số): câu "đổi …", "sửa …", "thêm một cái nữa", "bỏ …", "không lấy …", "xóa hết" là sửa giỏ:
  · modify: trả item có targetLine = số dòng cần sửa, ghi ĐỦ thông tin dòng sau khi sửa (qty là tổng số mới, VD đang 2 mà "thêm một cái nữa" → qty 3; trường không đổi thì chép lại từ giỏ).
  · remove: item có targetLine = dòng cần bỏ.
  · clear: xóa cả giỏ (items rỗng).
  · Gọi thêm món mới thì intent "add" (targetLine null). Một câu vừa sửa vừa thêm thì intent "modify", món mới để targetLine null.
- confidence 0–1: chắc chắn đúng món / số lượng thì ≥ 0,9; nghe không rõ, nhiều món gần giống thì < 0,7. Không đoán bừa.
- Không hiểu hoặc thiếu thông tin quan trọng → intent "unclear", clarify = một câu hỏi lại ngắn (VD "Bạn muốn Latte nóng hay đá?"). Âm thanh không có tiếng nói / không phải gọi món → items rỗng, clarify nhắc nói lại.${
    usual
      ? `

MÓN QUEN CỦA KHÁCH (xếp theo độ thường gọi):
${usual}
- "như mọi khi", "như cũ", "món quen", "như thường lệ", "như lần trước" → thêm món quen số 1 (intent "add", confidence 0,9). "2 ly như mọi khi" → qty 2.
- Khách gọi tên món (hoặc món quen) mà KHÔNG nói size / nóng-đá / đá / đường / ghi chú → để các trường đó null, hệ thống tự điền theo lựa chọn quen. Không tự chép tuỳ chọn quen vào.`
      : ""
  }`;
}

const levelOf = (v: unknown): Level | null => (LEVELS.includes(Number(v)) && v !== null && v !== "" ? (Number(v) as Level) : null);
const clampQty = (v: unknown) => Math.min(MAX_QTY, Math.max(1, Math.round(Number(v)) || 1));

/** Nóng / đá chọn được của món (giống tempChoices phía giao diện): đồ ăn / NONE → [] */
export const tempChoices = (p: Pick<MenuProduct, "hasSizes" | "temps">): Temp[] =>
  !p.hasSizes || p.temps === "NONE" ? [] : p.temps === "HOT" ? ["HOT"] : p.temps === "ICED" ? ["ICED"] : ["ICED", "HOT"];

type RawItem = Partial<CartLine> & { spokenName?: string; confidence?: number; targetLine?: number | null };

/** Chuẩn hóa một dòng theo cấu hình món: size / nóng-đá / đá / đường hợp lệ, giá do backend tính */
function normalizeLine(ctx: MenuContext, raw: RawItem, channel: Channel): OutLine | { missing: true } | { soldOut: MenuProduct } {
  if (channel === "WEB" && raw.comboId != null && !raw.productId) {
    const c = ctx.combos.find((x) => x.id === Number(raw.comboId));
    if (!c) return { missing: true };
    return {
      productId: null, comboId: c.id, qty: clampQty(raw.qty), size: null, temp: null, ice: null, sugar: null,
      note: cleanNote(raw.note), name: c.name, imageUrl: c.imageUrl, unitPrice: c.price, hasSizes: false, temps: [],
      confidence: clamp01(raw.confidence), changed: false,
    };
  }
  const p = ctx.products.find((x) => x.id === Number(raw.productId));
  if (!p) return { missing: true };
  if (p.outOfStock) return { soldOut: p };
  const temps = tempChoices(p);
  const size: Size | null = p.hasSizes ? (raw.size === "S" || raw.size === "L" ? raw.size : "M") : null;
  const temp: Temp | null = temps.length === 0 ? null : temps.length === 1 ? temps[0] : raw.temp === "HOT" || raw.temp === "ICED" ? raw.temp : "ICED";
  return {
    productId: p.id,
    comboId: null,
    qty: clampQty(raw.qty),
    size,
    temp,
    // Đá chỉ có nghĩa với món uống đá; đường chỉ với món uống
    ice: temp === "ICED" ? levelOf(raw.ice) : null,
    sugar: temps.length || p.hasSizes ? levelOf(raw.sugar) : null,
    note: cleanNote(raw.note),
    name: p.name,
    imageUrl: p.imageUrl,
    unitPrice: unitPriceOf(p, size ?? "M"),
    hasSizes: p.hasSizes,
    temps,
    confidence: clamp01(raw.confidence),
    changed: false,
  };
}
const clamp01 = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);
const cleanNote = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);
const sameOptions = (a: CartLine, b: CartLine) =>
  a.productId === b.productId && a.comboId === b.comboId && a.size === b.size && a.temp === b.temp && a.ice === b.ice && a.sugar === b.sugar && (a.note ?? "") === (b.note ?? "");

/** Gợi ý món gần giống (khi AI không gợi ý): trùng nhiều âm tiết nhất với tên / tên gọi khác, ưu tiên cùng danh mục */
function similar(ctx: MenuContext, spoken: string, sameCategory?: string): MenuProduct[] {
  const words = new Set(normalizeTerm(spoken).split(" ").filter((w) => w.length > 1));
  if (!words.size) return [];
  return ctx.products
    .filter((p) => !p.outOfStock)
    .map((p) => {
      const hay = new Set(normalizeTerm([p.name, ...p.aliases].join(" ")).split(" "));
      const score = [...words].filter((w) => hay.has(w)).length + (sameCategory && p.category === sameCategory ? 0.5 : 0);
      return { p, score };
    })
    .filter((x) => x.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.p);
}

/** Dòng mới là món quen → trường khách không nói (null) lấy theo lựa chọn quen; trường đã nói giữ nguyên */
function withUsual(raw: RawItem, usual: UsualItem[]): RawItem {
  const u = raw.productId ? usual.find((x) => x.productId === Number(raw.productId)) : undefined;
  if (!u) return raw;
  const temp = raw.temp ?? u.usual.temperature;
  return {
    ...raw,
    size: raw.size ?? u.usual.size,
    temp,
    // Lượng đá quen chỉ dùng khi vẫn uống đá như thói quen
    ice: raw.ice ?? (temp === u.usual.temperature ? levelOf(u.usual.icePct) : null),
    sugar: raw.sugar ?? levelOf(u.usual.sugar),
    note: raw.note ?? u.usualNote,
  };
}

const toSuggestion = (p: MenuProduct): Suggestion => ({ id: p.id, name: p.name, imageUrl: p.imageUrl, price: unitPriceOf(p, "M") });

/** Giỏ đang xác nhận → chữ có đánh số cho AI */
function currentText(lines: OutLine[]) {
  const lvl = (v: Level | null, what: string) => (v == null ? "" : `${what} ${v}%`);
  return lines
    .map((l, i) =>
      [`${i + 1}. ${l.qty} × ${l.name}${l.comboId ? ` (combo C${l.comboId})` : ` (#${l.productId})`}`, l.size ? `size ${l.size}` : "", l.temp === "HOT" ? "nóng" : l.temp === "ICED" ? "đá" : "", lvl(l.ice, "đá"), lvl(l.sugar, "đường"), l.note ? `ghi chú: ${l.note}` : ""]
        .filter(Boolean)
        .join(", "),
    )
    .join("\n");
}

export async function parseOrder(input: {
  storeId: number;
  channel: Channel;
  audio?: { data: Buffer; mimeType: string };
  text?: string;
  /** Giỏ đang xác nhận (giao diện gửi lại) — kiểm tra lại như dòng mới */
  current?: Partial<CartLine>[];
  /** Ghi SearchLog cho món chưa có */
  sessionKey: string;
  customerId?: number | null;
}): Promise<ParseResult> {
  const t0 = Date.now();
  const ctx = await buildMenuContext(input.storeId);
  // Món quen: chỉ khách web đã đăng nhập (token khách), theo chi nhánh đang đặt
  const usual = input.channel === "WEB" && input.customerId ? await getUsualItems(prisma, input.customerId, { storeId: input.storeId, limit: 5 }).catch(() => []) : [];
  const usage = { in: 0, out: 0 };
  // Model lite mặc định: câu ngắn, cần nhanh (< 10 giây) và rẻ; quá tải thì đổi sang model còn lại
  let model = MODEL;

  // Giỏ đang xác nhận: kiểm tra lại từng dòng (giao diện có thể gửi sai / món vừa hết)
  const current: OutLine[] = [];
  for (const c of (input.current ?? []).slice(0, 30)) {
    const l = normalizeLine(ctx, { ...c, confidence: 1 }, input.channel);
    if ("name" in l) current.push(l);
  }

  const parts: Part[] = [];
  if (input.audio) parts.push(audioPart(input.audio.data, input.audio.mimeType));
  parts.push({
    text: [
      current.length ? `GIỎ ĐANG XÁC NHẬN:\n${currentText(current)}` : "GIỎ ĐANG XÁC NHẬN: (trống)",
      input.audio ? "Câu gọi món: trong đoạn âm thanh đính kèm." : `Câu gọi món: ${(input.text ?? "").slice(0, 500)}`,
    ].join("\n\n"),
  });
  const contents: Content[] = [{ role: "user", parts }];
  const deadline = t0 + TIMEOUT_MS;
  const call = (m: string) =>
    gemini().models.generateContent({
      model: m,
      contents,
      config: {
        systemInstruction: systemPrompt(menuPromptText(ctx, input.channel === "WEB"), input.channel, usualPromptText(usual)),
        temperature: 0.1,
        // Gemini 3.x không tắt hẳn được suy luận (thinkingBudget 0 → lỗi 400); mức LOW ~1 giây
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_SCHEMA,
        abortSignal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())),
      },
    });
  // Model đang dùng quá tải → model còn lại (nếu còn thời gian)
  const res = await call(model).catch((e) => {
    if (!isBusy(e) || model === FALLBACK_MODEL || deadline - Date.now() < 2000) throw e;
    model = FALLBACK_MODEL;
    return call(model);
  });
  usage.in += res.usageMetadata?.promptTokenCount ?? 0;
  usage.out += (res.usageMetadata?.candidatesTokenCount ?? 0) + (res.usageMetadata?.thoughtsTokenCount ?? 0);

  let ai: { transcript?: string; intent?: string; items?: RawItem[]; unknown?: { spokenName?: string; suggestions?: number[] }[]; clarify?: string | null };
  try {
    ai = JSON.parse((res.text ?? "{}").replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    ai = { intent: "unclear", items: [], unknown: [], clarify: "Mình chưa nghe rõ, bạn nói lại giúp nhé." };
  }
  const intent: Intent = (["add", "modify", "remove", "clear", "unclear"] as const).find((x) => x === ai.intent) ?? "unclear";

  // Áp lên giỏ đang xác nhận
  let lines: OutLine[] = intent === "clear" ? [] : current.map((l) => ({ ...l }));
  const removed = new Set<number>();
  const unknown: Unknown[] = [];
  const pushUnknown = (spokenName: string, reason: Unknown["reason"], sugg: MenuProduct[]) => {
    const name = spokenName.trim().slice(0, 100);
    if (!name || unknown.some((u) => normalizeTerm(u.spokenName) === normalizeTerm(name))) return;
    unknown.push({ spokenName: name, reason, suggestions: sugg.slice(0, 3).map(toSuggestion) });
  };

  for (const raw of (Array.isArray(ai.items) ? ai.items : []).slice(0, 20)) {
    const target = Number.isInteger(raw.targetLine) && raw.targetLine! >= 1 && raw.targetLine! <= current.length ? raw.targetLine! - 1 : null;
    if (intent === "remove") {
      // Bỏ dòng: theo số dòng, không có thì theo món
      const idx = target ?? lines.findIndex((l) => (raw.productId && l.productId === Number(raw.productId)) || (raw.comboId && l.comboId === Number(raw.comboId)));
      if (idx != null && idx >= 0) removed.add(idx);
      continue;
    }
    // Sửa dòng: trường AI để trống thì giữ như cũ
    const base = target != null ? lines[target] : null;
    const merged: RawItem = base
      ? {
          productId: raw.productId ?? base.productId, comboId: raw.comboId ?? base.comboId, qty: raw.qty ?? base.qty,
          size: raw.size ?? base.size, temp: raw.temp ?? base.temp, ice: raw.ice ?? base.ice, sugar: raw.sugar ?? base.sugar,
          note: raw.note ?? base.note, confidence: raw.confidence,
        }
      : raw;
    const n = normalizeLine(ctx, base ? merged : withUsual(merged, usual), input.channel);
    if ("missing" in n) {
      const ai_s = (ai.unknown ?? []).find((u) => normalizeTerm(u.spokenName ?? "") === normalizeTerm(raw.spokenName ?? ""))?.suggestions ?? [];
      const sugg = ai_s.map((id) => ctx.products.find((p) => p.id === id && !p.outOfStock)).filter((p): p is MenuProduct => !!p);
      pushUnknown(raw.spokenName ?? "", "missing", sugg.length ? sugg : similar(ctx, raw.spokenName ?? ""));
      continue;
    }
    if ("soldOut" in n) {
      pushUnknown(n.soldOut.name, "soldout", similar(ctx, `${raw.spokenName ?? ""} ${n.soldOut.name}`, n.soldOut.category).filter((p) => p.id !== n.soldOut.id));
      continue;
    }
    n.changed = true;
    if (base && target != null) {
      lines[target] = n;
      continue;
    }
    // Món mới trùng hệt tùy chọn với dòng đang có → cộng số lượng
    const same = lines.findIndex((l, i) => !removed.has(i) && sameOptions(l, n));
    if (same >= 0) lines[same] = { ...lines[same], qty: Math.min(MAX_QTY, lines[same].qty + n.qty), changed: true, confidence: Math.min(lines[same].confidence, n.confidence) };
    else lines.push(n);
  }
  lines = lines.filter((_, i) => !removed.has(i));

  // "Như mọi khi" mà AI không ra món (câu quá ngắn / AI bỏ sót) → món quen số 1 với tuỳ chọn quen
  const said = fold(`${input.text ?? ""} ${ai.transcript ?? ""}`);
  if (usual.length && USUAL_PHRASE.test(said) && !lines.some((l) => l.changed) && intent !== "remove" && intent !== "clear") {
    const top = usual.find((u) => !u.soldOut);
    const n = top ? normalizeLine(ctx, withUsual({ productId: top.productId, qty: 1, confidence: 0.9 }, usual), input.channel) : null;
    if (n && "name" in n) lines.push({ ...n, changed: true });
  }

  // Món AI xếp vào "không có trong thực đơn"
  for (const u of Array.isArray(ai.unknown) ? ai.unknown : []) {
    if (!u.spokenName) continue;
    const sugg = (u.suggestions ?? []).map((id) => ctx.products.find((p) => p.id === id && !p.outOfStock)).filter((p): p is MenuProduct => !!p);
    pushUnknown(u.spokenName, "missing", sugg.length ? sugg : similar(ctx, u.spokenName));
  }
  await logDemand(input.storeId, input.sessionKey, input.customerId ?? null, unknown.map((u) => u.spokenName)).catch(() => {});

  return {
    transcript: String(ai.transcript ?? input.text ?? "").trim().slice(0, 500),
    intent,
    lines,
    unknown,
    clarify: typeof ai.clarify === "string" && ai.clarify.trim() ? ai.clarify.trim().slice(0, 200) : null,
    model,
    tokensIn: usage.in,
    tokensOut: usage.out,
    latencyMs: Date.now() - t0,
  };
}

/** Món khách gọi mà quán chưa có / đang hết → SearchLog (như tìm kiếm không ra món), bỏ trùng trong 10 phút */
async function logDemand(storeId: number, sessionKey: string, customerId: number | null, names: string[]) {
  const since = new Date(Date.now() - 10 * 60_000);
  for (const query of names) {
    const term = normalizeTerm(query);
    if (term.length < 2) continue;
    const dup = await prisma.searchLog.findFirst({ where: { term, sessionKey, createdAt: { gte: since } }, select: { id: true } });
    if (!dup) await prisma.searchLog.create({ data: { storeId, customerId, sessionKey: sessionKey.slice(0, 64), query: query.slice(0, 100), term, resultCount: 0 } });
  }
}
