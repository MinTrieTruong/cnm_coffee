/**
 * lib/shiftWish/parse.ts — Gemini đọc câu nguyện vọng xếp ca viết tự nhiên → ràng buộc có cấu trúc.
 *
 * AI chỉ chuyển câu thành ràng buộc (nhân viên xem lại rồi mới xác nhận); mọi kết quả đi qua validateRules().
 * Không gửi tên / SĐT nhân viên — chỉ vai trò, ca đang dùng, quy định chung và lịch của tháng.
 * Model chính quá tải → model lite.
 */
import { ThinkingLevel } from "@google/genai";
import { AI_CONFIG, gemini, isBusy, withRetry } from "../../ai/gemini.js";
import { addDaysYmd } from "../bizTime.js";
import { validateRules, weekdayOf, WISH_PERIODS, WISH_TYPES, type WishContext, type WishRule } from "./normalize.js";

const TIMEOUT_MS = 30_000;
export const MAX_WISH_TEXT = 1000;

const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const ROLE_VI: Record<string, string> = { Cashier: "Thu ngân", Waiter: "Phục vụ", Kitchen: "Pha chế / bếp", Shipper: "Giao hàng", Warehouse: "Thủ kho" };
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const nullable = (t: string) => [t, "null"];
const RULE_SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", enum: [...WISH_TYPES] },
    dates: { type: nullable("array"), items: { type: "string", description: "YYYY-MM-DD" } },
    weekdays: { type: nullable("array"), items: { type: "integer", description: "0 = CN, 1 = T2 … 6 = T7" } },
    fromDate: { type: nullable("string"), description: "YYYY-MM-DD" },
    toDate: { type: nullable("string"), description: "YYYY-MM-DD" },
    shiftCodes: { type: nullable("array"), items: { type: "string" } },
    timeFrom: { type: nullable("integer"), description: "phút từ 00:00" },
    timeTo: { type: nullable("integer"), description: "phút từ 00:00" },
    count: { type: nullable("integer") },
    period: { type: nullable("string"), description: WISH_PERIODS.join(" | ") },
    quote: { type: "string", description: "đoạn câu gốc sinh ra ràng buộc" },
    confidence: { type: "number", description: "0–1" },
  },
  required: ["type", "dates", "weekdays", "fromDate", "toDate", "shiftCodes", "timeFrom", "timeTo", "count", "period", "quote", "confidence"],
};
const WISH_SCHEMA = {
  type: "object",
  properties: {
    rules: { type: "array", items: RULE_SCHEMA },
    leaveSuggestions: {
      type: "array",
      items: {
        type: "object",
        properties: { from: { type: "string" }, to: { type: "string" }, reason: { type: "string" } },
        required: ["from", "to", "reason"],
      },
    },
    unclear: { type: "array", items: { type: "string" } },
  },
  required: ["rules", "leaveSuggestions", "unclear"],
};

const SYSTEM = [
  "Bạn chuyển nguyện vọng xếp ca của nhân viên một quán cà phê Việt Nam thành ràng buộc có cấu trúc. Bạn KHÔNG xếp lịch, chỉ hiểu câu.",
  "Loại ràng buộc:",
  "- UNAVAILABLE: không thể làm. Các cách nói: \"không được\", \"bận\", \"đi học\", \"có việc\", \"xin nghỉ\", \"không làm\".",
  "- PREFER: muốn làm. \"muốn\", \"thích\", \"ưu tiên\", \"chỉ làm\" (\"chỉ làm tối\" = PREFER ca tối, KHÔNG suy ra UNAVAILABLE ca khác).",
  "- AVOID: làm được nhưng không thích. \"hạn chế\", \"không thích lắm\", \"đỡ\", \"ít thôi\" (khi nói về một ca / ngày).",
  "- MAX_SHIFTS / MIN_SHIFTS: số ca tối đa / tối thiểu, kèm period: WEEK (mỗi tuần T2–CN), MONTH (cả tháng) hoặc RANGE (trong fromDate–toDate, VD \"tuần cuối tháng\" không trọn tuần). \"cần nhiều ca kiếm thêm\" không kèm số → MIN_SHIFTS với count hợp lý theo quy định chung và confidence thấp.",
  "- DAY_OFF_PATTERN: muốn nghỉ cố định một thứ mỗi tuần (weekdays).",
  "Phạm vi: dates (ngày cụ thể) HOẶC weekdays (0 = CN, 1 = T2 … 6 = T7) trong fromDate–toDate (để null = cả tháng). Ca: shiftCodes CHỈ dùng mã trong danh sách ca; nếu người viết nói giờ thì điền timeFrom / timeTo (phút) và để shiftCodes null (\"sau 6h chiều\" = timeFrom 1080, timeTo 1440; \"trước 12h trưa\" = timeFrom 0, timeTo 720). \"sáng / trưa / chiều / tối / ca 1, ca 2\" ánh xạ theo giờ các ca trong danh sách. Không nói ca nào = cả ngày (shiftCodes null).",
  "Quy tắc:",
  "- \"xin nghỉ ngày X\" → UNAVAILABLE ngày X VÀ thêm leaveSuggestions { from, to, reason }.",
  "- Ngày nằm ngoài tháng cần xếp → bỏ, ghi vào unclear. Cụm thời gian mơ hồ không quy được ra ngày (VD \"tuần sau nữa\" khi không rõ mốc, \"mấy hôm\") → ghi đúng cụm đó vào unclear, không đoán.",
  "- Mỗi rule có quote là đoạn câu gốc sinh ra nó (giữ nguyên chữ người viết). confidence 0–1: thấp khi phải đoán.",
  "- Không bịa ràng buộc không có trong câu. Câu mâu thuẫn thì vẫn ghi cả hai ràng buộc như người viết nói.",
  "- Hiểu cả câu viết tắt / không dấu (VD \"t3\" = thứ 3, \"cn\" = chủ nhật, \"k\" / \"ko\" = không, \"ca toi\" = ca tối).",
  "- Không có số ca cụ thể thì count = null; các trường không dùng để null.",
].join("\n");

function userPrompt(input: { text: string; ctx: WishContext; role: string; maxShiftsPerWeek: number; minRestHours: number; today: string }) {
  const { ctx } = input;
  const first = ctx.days[0];
  const last = ctx.days[ctx.days.length - 1];
  return [
    `THÁNG CẦN XẾP: ${ctx.month} (từ ${first} đến ${last}). Hôm nay: ${input.today} (${WD[weekdayOf(input.today)]}). Tháng trước kết thúc ${addDaysYmd(first, -1)}, tháng sau bắt đầu ${addDaysYmd(last, 1)}.`,
    "LỊCH THÁNG (ngày | thứ):\n" + ctx.days.map((d) => `${d} ${WD[weekdayOf(d)]}`).join(", "),
    "CA ĐANG DÙNG (mã | tên | giờ):\n" + ctx.templates.map((t) => `${t.code} | ${t.name} | ${hhmm(t.startMin)}–${hhmm(t.endMin)}`).join("\n"),
    `VỊ TRÍ NHÂN VIÊN: ${ROLE_VI[input.role] ?? input.role}. QUY ĐỊNH CHUNG: tối đa ${input.maxShiftsPerWeek} ca / tuần, nghỉ ít nhất ${input.minRestHours} tiếng giữa 2 ca, mỗi ngày tối đa 1 ca.`,
    `NGUYỆN VỌNG:\n"""${input.text}"""`,
    "Trả JSON đúng schema.",
  ].join("\n\n");
}

export type LeaveSuggestion = { from: string; to: string; reason: string };
export type ParseResult = {
  rules: WishRule[];
  leaveSuggestions: LeaveSuggestion[];
  unclear: string[];
  warnings: string[];
  narrow: boolean;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
};

export async function parseWish(input: { text: string; ctx: WishContext; role: string; maxShiftsPerWeek: number; minRestHours: number; today: string }): Promise<ParseResult> {
  const t0 = Date.now();
  const deadline = t0 + TIMEOUT_MS;
  let model = AI_CONFIG.chatModel;
  const call = (m: string) =>
    withRetry(
      () =>
        gemini().models.generateContent({
          model: m,
          contents: [{ role: "user", parts: [{ text: userPrompt(input) }] }],
          config: {
            systemInstruction: SYSTEM,
            temperature: 0.1,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: "application/json",
            responseJsonSchema: WISH_SCHEMA,
            abortSignal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())),
          },
        }),
      1,
    );
  const res = await call(model).catch((e) => {
    if (!isBusy(e) || model === AI_CONFIG.liteModel || deadline - Date.now() < 8000) throw e;
    model = AI_CONFIG.liteModel;
    return call(model);
  });
  const raw = JSON.parse((res.text ?? "").replace(/^```(?:json)?\s*|\s*```$/g, "")) as { rules?: unknown; leaveSuggestions?: unknown; unclear?: unknown };

  const rules = (Array.isArray(raw.rules) ? raw.rules : []).map((r) => (r && typeof r === "object" ? { ...r, source: "AI" } : r));
  const checked = validateRules(rules, input.ctx);
  const daySet = new Set(input.ctx.days);
  const leaveSuggestions = (Array.isArray(raw.leaveSuggestions) ? raw.leaveSuggestions : [])
    .map((s) => s as Partial<LeaveSuggestion>)
    .filter((s) => typeof s.from === "string" && daySet.has(s.from))
    .map((s) => {
      const to = typeof s.to === "string" && daySet.has(s.to) && s.to >= s.from! ? s.to : s.from!;
      return { from: s.from!, to, reason: typeof s.reason === "string" ? s.reason.trim().slice(0, 200) : "" };
    })
    .slice(0, 5);
  const unclear = (Array.isArray(raw.unclear) ? raw.unclear : [])
    .filter((u): u is string => typeof u === "string" && !!u.trim())
    .map((u) => u.trim().slice(0, 200))
    .slice(0, 5);

  return {
    ...checked,
    leaveSuggestions,
    unclear,
    model,
    tokensIn: res.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: (res.usageMetadata?.candidatesTokenCount ?? 0) + (res.usageMetadata?.thoughtsTokenCount ?? 0),
    latencyMs: Date.now() - t0,
  };
}
