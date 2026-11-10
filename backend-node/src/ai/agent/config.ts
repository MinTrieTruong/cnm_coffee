/**
 * ai/agent/config.ts — Hằng số, giá trị mặc định, kiểm tra cấu hình agent và chọn agent cho một phiên chat.
 */
import type { AiAgent, Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import { bizMinute, bizWeekday } from "../../lib/bizTime.js";

export const AGENT_ICONS = ["DEFAULT", "CHAT", "CREATIVE", "TECH", "CSKH", "SALES", "SUPPORT", "VIP"] as const;
export const TONES = ["PROFESSIONAL", "FRIENDLY", "CASUAL"] as const;
export const LENGTHS = { SHORT: 100, MEDIUM: 200, LONG: 300, VERY_LONG: 500 } as const;
export const REASONING = { OFF: 0, NORMAL: 1024, DEEP: 4096 } as const;
export const CHANNELS = ["WEB", "MESSENGER", "INSTAGRAM", "ZALO"] as const;
/** Kênh đã chạy được; còn lại hiện "Sắp có" */
export const LIVE_CHANNELS = ["WEB"];

export type ScheduleSlot = { day: number; from: string; to: string };

export const DEFAULT_SCHEDULE: ScheduleSlot[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, from: "07:00", to: "22:00" }));

/** 4 mẫu trả lời nhanh tạo sẵn cho agent mới */
export const DEFAULT_QUICK_REPLIES = [
  { name: "Chào hỏi", matchType: "EXACT", patterns: ["xin chao", "hi shop", "hello", "alo", "chao shop", "hi", "chao ban", "shop oi"], replies: ["Dạ {self} chào {customer}, {customer} cần {self} tư vấn món nào hay thông tin gì ạ?"], action: "NONE" },
  { name: "Cảm ơn", matchType: "CONTAINS", patterns: ["cam on", "thanks", "thank you", "tks", "ok shop"], replies: ["Dạ không có gì ạ, {customer} cần gì cứ nhắn {self} nha."], action: "NONE" },
  { name: "Tạm biệt", matchType: "CONTAINS", patterns: ["bye", "tam biet", "gap lai sau"], replies: ["Dạ {self} chào {customer}, hẹn gặp lại {customer} ở quán ạ."], action: "NONE" },
  { name: "Gặp nhân viên", matchType: "CONTAINS", patterns: ["gap nhan vien", "noi chuyen voi nguoi", "nhan vien dau", "gap nguoi that"], replies: ["Dạ {self} chuyển {customer} sang nhân viên ngay ạ."], action: "HANDOFF" },
] as const;

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** Agent đang trong giờ hoạt động không (giờ Việt Nam); ca qua nửa đêm (22:00–02:00) cũng tính */
export function inSchedule(agent: Pick<AiAgent, "scheduleMode" | "schedule">, now = new Date()): boolean {
  if (agent.scheduleMode !== "SCHEDULE") return true;
  const slots = (Array.isArray(agent.schedule) ? agent.schedule : []) as ScheduleSlot[];
  const day = bizWeekday(now);
  const min = bizMinute(now);
  return slots.some((s) => {
    if (!HM.test(s.from) || !HM.test(s.to)) return false;
    const from = toMin(s.from);
    const to = toMin(s.to);
    if (from < to) return s.day === day && min >= from && min < to;
    // Qua nửa đêm: phần tối của ngày `day` + phần sáng của ngày hôm sau
    return (s.day === day && min >= from) || ((s.day + 1) % 7 === day && min < to);
  });
}

/**
 * Agent trả lời phiên: bản gán đúng kênh + chi nhánh, không có thì bản gán "cả chuỗi" của kênh.
 * Agent phải đang bật — tắt agent là chat quay về bot cũ / nhân viên ngay.
 */
export async function agentFor(channel: string, storeId: number) {
  const bindings = await prisma.aiAgentBinding.findMany({
    where: { channel, OR: [{ storeId }, { storeId: null }], channelAccountId: null, agent: { enabled: true } },
    include: { agent: true },
  });
  return (bindings.find((b) => b.storeId === storeId) ?? bindings.find((b) => b.storeId == null))?.agent ?? null;
}

/** Kho tri thức agent được dùng ở chi nhánh: kho đang bật, dùng chung cả chuỗi hoặc của đúng chi nhánh */
export async function agentKbIds(agentId: number, storeId: number | null) {
  const rows = await prisma.aiAgentKnowledgeBase.findMany({
    where: { agentId, knowledgeBase: { enabled: true, ...(storeId != null ? { OR: [{ storeId: null }, { storeId }] } : {}) } },
    select: { knowledgeBaseId: true },
  });
  return rows.map((r) => r.knowledgeBaseId);
}

/* ═══════════ Kiểm tra dữ liệu form agent ═══════════ */

export type AgentInput = {
  name?: string;
  description?: string | null;
  icon?: string;
  enabled?: boolean;
  botName?: string;
  tone?: string;
  selfPronoun?: string;
  customerPronoun?: string;
  greeting?: string;
  fallbackMessage?: string;
  memory?: string | null;
  extraInstructions?: string | null;
  responseLength?: string;
  splitLongMessages?: boolean;
  allowGeneralKnowledge?: boolean;
  allowWebSearch?: boolean;
  mergeWindowSec?: number;
  historySize?: number;
  reasoningLevel?: string;
  minScore?: number;
  handoffEnabled?: boolean;
  quickRepliesEnabled?: boolean;
  scheduleMode?: string;
  schedule?: ScheduleSlot[];
  outOfHoursMessage?: string | null;
  staffWaitMinutes?: number;
  dailyRequestLimit?: number | null;
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v: unknown, min: number, max: number) => (Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : null);

/** Chuẩn hoá phần cấu hình gửi lên; trả { data } hoặc { error, field } */
export function parseAgent(b: AgentInput, partial: boolean): { data: Prisma.AiAgentUncheckedUpdateInput } | { error: string; field: string } {
  const d: Prisma.AiAgentUncheckedUpdateInput = {};
  const has = (k: keyof AgentInput) => !partial || b[k] !== undefined;
  const fail = (field: string, error: string) => ({ error, field });

  if (has("name")) {
    const name = str(b.name, 60);
    if (!name) return fail("name", "Nhập tên agent.");
    if (!/^[\p{L}\p{N} _-]+$/u.test(name)) return fail("name", "Tên chỉ gồm chữ, số, khoảng trắng, gạch ngang.");
    d.name = name;
  }
  if (b.description !== undefined) d.description = str(b.description, 500) || null;
  if (b.icon !== undefined) {
    if (!AGENT_ICONS.includes(b.icon as never)) return fail("icon", "Biểu tượng không hợp lệ.");
    d.icon = b.icon;
  }
  if (b.enabled !== undefined) d.enabled = !!b.enabled;
  if (b.botName !== undefined) d.botName = str(b.botName, 60) || "TD Bot";
  if (b.tone !== undefined) {
    if (!TONES.includes(b.tone as never)) return fail("tone", "Tông giọng không hợp lệ.");
    d.tone = b.tone;
  }
  if (b.selfPronoun !== undefined) d.selfPronoun = str(b.selfPronoun, 20) || "em";
  if (b.customerPronoun !== undefined) d.customerPronoun = str(b.customerPronoun, 20) || "anh/chị";
  if (has("greeting")) {
    const g = str(b.greeting, 1000);
    if (!g) return fail("greeting", "Nhập lời chào.");
    d.greeting = g;
  }
  if (has("fallbackMessage")) {
    const f = str(b.fallbackMessage, 1000);
    if (!f) return fail("fallbackMessage", "Nhập câu trả lời khi không tìm thấy thông tin.");
    d.fallbackMessage = f;
  }
  if (b.memory !== undefined) d.memory = str(b.memory, 1000) || null;
  if (b.extraInstructions !== undefined) d.extraInstructions = str(b.extraInstructions, 2000) || null;
  if (b.responseLength !== undefined) {
    if (!(b.responseLength in LENGTHS)) return fail("responseLength", "Độ dài không hợp lệ.");
    d.responseLength = b.responseLength;
  }
  for (const k of ["splitLongMessages", "allowGeneralKnowledge", "allowWebSearch", "handoffEnabled", "quickRepliesEnabled"] as const) {
    if (b[k] !== undefined) d[k] = !!b[k];
  }
  if (b.mergeWindowSec !== undefined) {
    const v = int(b.mergeWindowSec, 0, 120);
    if (v == null) return fail("mergeWindowSec", "Gộp tin: 0–120 giây.");
    d.mergeWindowSec = v;
  }
  if (b.historySize !== undefined) {
    const v = int(b.historySize, 2, 50);
    if (v == null) return fail("historySize", "Bộ nhớ hội thoại: 2–50 tin.");
    d.historySize = v;
  }
  if (b.reasoningLevel !== undefined) {
    if (!(b.reasoningLevel in REASONING)) return fail("reasoningLevel", "Mức suy luận không hợp lệ.");
    d.reasoningLevel = b.reasoningLevel;
  }
  if (b.minScore !== undefined) {
    if (typeof b.minScore !== "number" || b.minScore < 0.3 || b.minScore > 0.95) return fail("minScore", "Ngưỡng liên quan: 0,30–0,95.");
    d.minScore = Math.round(b.minScore * 100) / 100;
  }
  if (b.scheduleMode !== undefined) {
    if (b.scheduleMode !== "ALWAYS" && b.scheduleMode !== "SCHEDULE") return fail("scheduleMode", "Chế độ giờ không hợp lệ.");
    d.scheduleMode = b.scheduleMode;
  }
  if (b.schedule !== undefined) {
    if (!Array.isArray(b.schedule) || b.schedule.length > 21) return fail("schedule", "Lịch hoạt động không hợp lệ.");
    const slots: ScheduleSlot[] = [];
    for (const s of b.schedule) {
      if (!Number.isInteger(s?.day) || s.day < 0 || s.day > 6 || !HM.test(s.from ?? "") || !HM.test(s.to ?? "") || s.from === s.to) {
        return fail("schedule", "Mỗi khung giờ cần ngày trong tuần và giờ bắt đầu / kết thúc khác nhau (HH:MM).");
      }
      slots.push({ day: s.day, from: s.from, to: s.to });
    }
    d.schedule = slots;
  }
  if (b.scheduleMode === "SCHEDULE" && Array.isArray(b.schedule) && !b.schedule.length) return fail("schedule", "Thêm ít nhất một khung giờ hoạt động.");
  if (b.outOfHoursMessage !== undefined) d.outOfHoursMessage = str(b.outOfHoursMessage, 1000) || null;
  if (b.staffWaitMinutes !== undefined) {
    const v = int(b.staffWaitMinutes, 0, 60);
    if (v == null) return fail("staffWaitMinutes", "Đợi nhân viên: 0–60 phút.");
    d.staffWaitMinutes = v;
  }
  if (b.dailyRequestLimit !== undefined) {
    const v = b.dailyRequestLimit == null ? null : int(b.dailyRequestLimit, 1, 100_000);
    if (b.dailyRequestLimit != null && v == null) return fail("dailyRequestLimit", "Giới hạn mỗi ngày: 1–100.000 lượt (để trống = không giới hạn).");
    d.dailyRequestLimit = v;
  }
  return { data: d };
}
