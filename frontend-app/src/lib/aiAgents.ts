/** AI Agent tư vấn — kiểu dữ liệu & nhãn (API: backend-node/src/routes/aiAgents.ts) */

export type ScheduleSlot = { day: number; from: string; to: string };
export type QuickReply = { id?: number; name: string; matchType: "EXACT" | "CONTAINS"; patterns: string[]; replies: string[]; action: "NONE" | "HANDOFF"; enabled: boolean };
export type Binding = { channel: string; storeId: number | null; storeName?: string | null };

export type Agent = {
  id: number;
  name: string;
  description: string | null;
  icon: string;
  enabled: boolean;
  online?: boolean;
  botName: string;
  tone: "PROFESSIONAL" | "FRIENDLY" | "CASUAL";
  selfPronoun: string;
  customerPronoun: string;
  greeting: string;
  fallbackMessage: string;
  memory: string | null;
  extraInstructions: string | null;
  responseLength: "SHORT" | "MEDIUM" | "LONG" | "VERY_LONG";
  splitLongMessages: boolean;
  allowGeneralKnowledge: boolean;
  allowWebSearch: boolean;
  mergeWindowSec: number;
  historySize: number;
  reasoningLevel: "OFF" | "NORMAL" | "DEEP";
  minScore: number;
  handoffEnabled: boolean;
  quickRepliesEnabled: boolean;
  scheduleMode: "ALWAYS" | "SCHEDULE";
  schedule: ScheduleSlot[] | null;
  outOfHoursMessage: string | null;
  staffWaitMinutes: number;
  dailyRequestLimit: number | null;
  kbIds: number[];
  bindings: Binding[];
  quickReplies: QuickReply[];
  updatedAt: string;
  runsToday?: number;
  canEdit?: boolean;
  geminiReady?: boolean;
};

export type ChannelTarget = { storeId: number | null; name: string; agent: { id: number; name: string; enabled: boolean } | null };
export type ChannelInfo = { channel: string; live: boolean; targets: ChannelTarget[] };

export type TestResult = {
  runId: number;
  kind: string;
  bubbles: string[];
  handoff: { reason: string } | null;
  quickReply?: string;
  retrieved: { chunkId: number; title: string; heading: string | null; content?: string; vectorScore: number | null; keywordScore: number | null }[];
  toolCalls: { name: string; args: unknown; resultSummary: string; ms: number }[];
  promptTokens?: number;
  outputTokens?: number;
  thinkingTokens?: number;
  latencyMs: number;
  costVnd?: number;
  model?: string;
  error?: string;
};

export const TONE_LABEL = {
  PROFESSIONAL: { label: "Chuyên nghiệp", hint: "Lịch sự, chuẩn mực, rõ ràng" },
  FRIENDLY: { label: "Thân thiện", hint: "Gần gũi, ấm áp, có 'dạ', 'nha'" },
  CASUAL: { label: "Thoải mái", hint: "Như nhắn tin với bạn, vẫn tôn trọng" },
} as const;

export const LENGTH_LABEL = {
  SHORT: { label: "Ngắn", hint: "~100 từ" },
  MEDIUM: { label: "Vừa", hint: "~200 từ" },
  LONG: { label: "Dài", hint: "~300 từ" },
  VERY_LONG: { label: "Rất dài", hint: "~500 từ" },
} as const;

export const REASONING_LABEL = {
  OFF: { label: "Tắt", hint: "Nhanh, rẻ nhất — hợp câu hỏi đơn giản" },
  NORMAL: { label: "Vừa", hint: "Cân bằng tốc độ và độ chính xác" },
  DEEP: { label: "Sâu", hint: "Trả lời kỹ hơn, chậm và tốn hơn" },
} as const;

export const CHANNEL_LABEL: Record<string, string> = { WEB: "Chat trên web", MESSENGER: "Messenger", INSTAGRAM: "Instagram", ZALO: "Zalo OA" };

export const DAY_LABEL = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

/** Agent mới: giống mặc định của máy chủ (máy chủ tự thêm 4 mẫu trả lời nhanh) */
export const NEW_AGENT: Omit<Agent, "id" | "updatedAt" | "quickReplies"> & { quickReplies?: QuickReply[] } = {
  name: "",
  description: "",
  icon: "DEFAULT",
  enabled: true,
  botName: "TD Bot",
  tone: "FRIENDLY",
  selfPronoun: "em",
  customerPronoun: "anh/chị",
  greeting: "Dạ {self} chào {customer}! {self} là trợ lý của TD Coffee. {customer} cần {self} tư vấn món, giá, khuyến mãi hay thông tin chi nhánh ạ?",
  fallbackMessage: "Dạ thông tin này {self} chưa nắm chắc, {self} chuyển {customer} sang nhân viên để được hỗ trợ chính xác nhé.",
  memory: "",
  extraInstructions: "",
  responseLength: "MEDIUM",
  splitLongMessages: true,
  allowGeneralKnowledge: false,
  allowWebSearch: false,
  mergeWindowSec: 5,
  historySize: 20,
  reasoningLevel: "NORMAL",
  minScore: 0.68,
  handoffEnabled: true,
  quickRepliesEnabled: true,
  scheduleMode: "ALWAYS",
  schedule: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, from: "07:00", to: "22:00" })),
  outOfHoursMessage: "Dạ hiện ngoài giờ trực tư vấn tự động. Nhân viên sẽ trả lời {customer} sớm nhất có thể ạ.",
  staffWaitMinutes: 0,
  dailyRequestLimit: null,
  kbIds: [],
  bindings: [],
};

/** Mô tả ngắn thời gian AI đợi trước khi trả lời */
export function waitLabel(a: Pick<Agent, "mergeWindowSec" | "staffWaitMinutes">) {
  if (a.staffWaitMinutes > 0) return `đợi nhân viên ${a.staffWaitMinutes} phút rồi AI mới trả lời`;
  return a.mergeWindowSec > 0 ? `gộp tin trong ${a.mergeWindowSec} giây rồi trả lời một lần` : "trả lời ngay từng tin";
}

export function scheduleLabel(a: Pick<Agent, "scheduleMode" | "schedule">) {
  if (a.scheduleMode !== "SCHEDULE") return "24/7";
  const slots = a.schedule ?? [];
  if (!slots.length) return "Chưa có khung giờ";
  const same = slots.length === 7 && slots.every((s) => s.from === slots[0].from && s.to === slots[0].to);
  return same ? `Hằng ngày ${slots[0].from}–${slots[0].to}` : `${slots.length} khung giờ / tuần`;
}
