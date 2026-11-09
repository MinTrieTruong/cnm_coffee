/**
 * lib/shiftWish/explain.ts — Lời giải thích kết quả xếp ca: cho quản lý (tóm tắt) và cho từng nhân viên.
 *
 * Thuật toán chỉ trả MÃ (lý do ô, nguyên nhân nguyện vọng chưa đáp ứng — lib/autoSchedule.ts); ở đây diễn đạt thành câu:
 *  - Mẫu câu theo mã (luôn có, dùng khi SHIFT_EXPLAIN_AI tắt / AI lỗi / AI viết sai số liệu)
 *  - Gemini viết lại tự nhiên hơn từ đúng các mã + số liệu đó. Mọi con số trong câu AI phải có trong số liệu đưa vào,
 *    sai → dùng mẫu câu cho phần đó. Chỉ gửi mã nhân viên + tên gọi (không họ đệm, không SĐT).
 *    Model chính quá tải / hết hạn mức → model lite.
 */
import { ThinkingLevel } from "@google/genai";
import { AI_CONFIG, gemini, isBusy, withRetry } from "../../ai/gemini.js";
import type { AutoMetrics, UnmetCause, UnmetWish } from "../autoSchedule.js";

export const CAUSE_TEXT: Record<UnmetCause, string> = {
  FULL_BY_OTHERS: "ca đó đã đủ người",
  MAX_WEEK_REACHED: "tuần đó đã đủ số ca tối đa",
  REST_RULE: "vướng ca khác hoặc chưa đủ giờ nghỉ giữa 2 ca",
  NO_SLOT_FOR_ROLE: "ngày đó không cần thêm người ở vị trí này",
  ON_LEAVE: "đang nghỉ phép ngày đó",
  SELF_UNAVAILABLE: "trùng ngày đã báo không thể làm",
  BALANCE_TRADEOFF: "để chia đều số ca giữa mọi người",
};

export type ExplainStaff = { id: number; fullName: string };
export type ShiftName = { code: string; name: string };
export type Explanations = { summary: string; perStaff: Record<string, string>; source: "AI" | "TEMPLATE" };

const dm = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
/** Tên gọi: chữ cuối của họ tên ("Nguyễn Thị Lan" → "Lan") */
export const callName = (fullName: string) => fullName.trim().split(/\s+/).pop() ?? fullName;

function topCause(unmet: UnmetWish[]) {
  const n = new Map<UnmetCause, number>();
  for (const u of unmet) n.set(u.cause, (n.get(u.cause) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
const spreadOf = (m: AutoMetrics) => Math.max(0, ...Object.values(m.shiftsSpreadByRole ?? {}));
const pctOf = (m: AutoMetrics) => (m.preferTotal ? Math.round((m.preferMet / m.preferTotal) * 100) : 100);

/** Mẫu câu theo mã */
export function templateExplain(m: AutoMetrics, unmet: UnmetWish[], staff: ExplainStaff[], shifts: ShiftName[]): Explanations {
  const nameOf = new Map(shifts.map((s) => [s.code, s.name]));
  const filled = m.perStaff.reduce((a, p) => a + p.shifts, 0);
  const top = topCause(unmet);
  const summary = [
    m.preferTotal ? `Đáp ứng ${m.preferMet}/${m.preferTotal} lần nguyện vọng "muốn" (${pctOf(m)}%).` : "Chưa có nguyện vọng \"muốn\" nào.",
    `Vi phạm "không thể": ${m.hardViolations}.`,
    m.shortages ? `Còn ${m.shortages} chỗ thiếu người.` : "Không thiếu người.",
    `Tổng ${filled} ca, chênh lệch số ca trong cùng vị trí tối đa ±${spreadOf(m)}.`,
    top ? `Nguyện vọng chưa đáp ứng chủ yếu vì ${CAUSE_TEXT[top]}.` : "",
    m.existingConflicts ? `Có ${m.existingConflicts} ca đã duyệt từ trước trùng ngày nhân viên báo không thể — cần xem lại.` : "",
  ].filter(Boolean).join(" ");

  const perStaff: Record<string, string> = {};
  for (const p of m.perStaff) {
    const s = staff.find((x) => x.id === p.staffId);
    if (!s) continue;
    const mine = unmet.filter((u) => u.staffId === p.staffId);
    let text = p.preferTotal
      ? `${callName(s.fullName)} được đáp ứng ${p.preferMet}/${p.preferTotal} lần nguyện vọng "muốn", ${p.shifts} ca trong tháng.`
      : `${callName(s.fullName)} có ${p.shifts} ca trong tháng (${p.weekendShifts} ca cuối tuần).`;
    if (mine.length) {
      const u = mine[0];
      text += ` Chưa được ${nameOf.get(u.code) ?? u.code} ${dm(u.date)} vì ${CAUSE_TEXT[u.cause]}${mine.length > 1 ? ` (và ${mine.length - 1} lần khác)` : ""}.`;
    }
    perStaff[String(p.staffId)] = text;
  }
  return { summary, perStaff, source: "TEMPLATE" };
}

/** Các con số được phép xuất hiện trong câu (đúng với số liệu) */
const numbersIn = (text: string) => (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => x.replace(",", "."));
const allowed = (xs: (number | string)[]) => new Set(xs.map((x) => String(x)));
const dateNums = (ds: string[]) => ds.flatMap((d) => [Number(d.slice(8, 10)), Number(d.slice(5, 7)), d.slice(8, 10), d.slice(5, 7)]);

const EXPLAIN_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    perStaff: { type: "array", items: { type: "object", properties: { staffId: { type: "integer" }, text: { type: "string" } }, required: ["staffId", "text"] } },
  },
  required: ["summary", "perStaff"],
};
const SYSTEM = [
  "Bạn viết lời giải thích kết quả xếp lịch làm việc tháng của một quán cà phê Việt Nam. Lịch do thuật toán xếp, bạn KHÔNG đổi lịch, chỉ diễn đạt.",
  "- summary: 3–4 câu cho quản lý: tỉ lệ nguyện vọng \"muốn\" được đáp ứng, vi phạm \"không thể\", chỗ thiếu người, độ chênh số ca, nguyên nhân chính khi không đáp ứng.",
  "- perStaff: mỗi nhân viên ≤ 2 câu, giọng lịch sự, gọi bằng tên gọi; nói rõ nguyện vọng nào được / chưa được và vì sao, CHỈ dựa vào mã nguyên nhân đã cho.",
  "Nghĩa mã nguyên nhân: " + Object.entries(CAUSE_TEXT).map(([k, v]) => `${k} = ${v}`).join("; ") + ".",
  "- Chỉ dùng các con số có trong dữ liệu (không tự tính số mới, không làm tròn khác đi). Ngày viết dạng 14/12. Không nhắc mã nhân viên, không dùng mã nguyên nhân trong câu.",
].join("\n");

/** Gemini viết lời giải thích; phần nào sai số liệu → dùng mẫu câu. Ném lỗi khi gọi AI thất bại. */
export async function aiExplain(m: AutoMetrics, unmet: UnmetWish[], staff: ExplainStaff[], shifts: ShiftName[], month: string) {
  const base = templateExplain(m, unmet, staff, shifts);
  const nameOf = new Map(shifts.map((s) => [s.code, s.name]));
  const people = m.perStaff
    .map((p) => ({ p, s: staff.find((x) => x.id === p.staffId) }))
    .filter((x): x is { p: AutoMetrics["perStaff"][number]; s: ExplainStaff } => !!x.s);
  const data = {
    month,
    tongQuat: {
      daDapUng: m.preferMet, tongNguyenVong: m.preferTotal, phanTram: pctOf(m), viPhamKhongThe: m.hardViolations,
      choThieuNguoi: m.shortages, chenhLechSoCaToiDa: spreadOf(m), soNhanVien: people.length, caDaDuyetTrungKhongThe: m.existingConflicts,
      nguyenNhanChinh: topCause(unmet),
    },
    nhanVien: people.map(({ p, s }) => ({
      staffId: p.staffId, tenGoi: callName(s.fullName), soCa: p.shifts, caCuoiTuan: p.weekendShifts, daDapUng: p.preferMet, tongNguyenVong: p.preferTotal,
      chuaDapUng: unmet.filter((u) => u.staffId === p.staffId).slice(0, 4).map((u) => ({ ngay: dm(u.date), ca: nameOf.get(u.code) ?? u.code, nguyenNhan: u.cause })),
      soLanChuaDapUng: unmet.filter((u) => u.staffId === p.staffId).length,
    })),
  };
  const t0 = Date.now();
  let model = AI_CONFIG.chatModel;
  const call = (m: string) => withRetry(
    () =>
      gemini().models.generateContent({
        model: m,
        contents: [{ role: "user", parts: [{ text: `DỮ LIỆU (JSON):\n${JSON.stringify(data)}\n\nViết summary và perStaff (đủ mọi nhân viên) theo schema.` }] }],
        config: {
          systemInstruction: SYSTEM,
          temperature: 0.4,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseJsonSchema: EXPLAIN_SCHEMA,
          abortSignal: AbortSignal.timeout(45_000),
        },
      }),
    1,
  );
  const res = await call(model).catch((e) => {
    if (!isBusy(e) || model === AI_CONFIG.liteModel) throw e;
    model = AI_CONFIG.liteModel;
    return call(model);
  });
  const raw = JSON.parse((res.text ?? "").replace(/^```(?:json)?\s*|\s*```$/g, "")) as { summary?: unknown; perStaff?: unknown };

  const [y, mo] = month.split("-");
  const common = [y, Number(mo), mo];
  const okSummary = (() => {
    const text = typeof raw.summary === "string" ? raw.summary.trim().slice(0, 800) : "";
    const ok = allowed([...common, m.preferMet, m.preferTotal, pctOf(m), m.hardViolations, m.shortages, spreadOf(m), people.length, m.existingConflicts,
      m.perStaff.reduce((a, p) => a + p.shifts, 0), ...dateNums(unmet.map((u) => u.date))]);
    return text && numbersIn(text).every((n) => ok.has(n)) ? text : null;
  })();
  let rejected = okSummary ? 0 : 1;
  const perStaff: Record<string, string> = { ...base.perStaff };
  for (const item of Array.isArray(raw.perStaff) ? raw.perStaff : []) {
    const it = item as { staffId?: unknown; text?: unknown };
    const person = people.find((x) => x.p.staffId === it.staffId);
    const text = typeof it.text === "string" ? it.text.trim().slice(0, 400) : "";
    if (!person || !text) continue;
    const mine = unmet.filter((u) => u.staffId === person.p.staffId);
    const ok = allowed([...common, person.p.shifts, person.p.weekendShifts, person.p.preferMet, person.p.preferTotal, mine.length, Math.max(0, mine.length - 1), ...dateNums(mine.map((u) => u.date))]);
    if (numbersIn(text).every((n) => ok.has(n))) perStaff[String(person.p.staffId)] = text;
    else rejected++;
  }
  return {
    explanations: { summary: okSummary ?? base.summary, perStaff, source: "AI" } as Explanations,
    rejected,
    model,
    tokensIn: res.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: (res.usageMetadata?.candidatesTokenCount ?? 0) + (res.usageMetadata?.thoughtsTokenCount ?? 0),
    latencyMs: Date.now() - t0,
  };
}
