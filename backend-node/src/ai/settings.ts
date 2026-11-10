/**
 * ai/settings.ts — Bật / tắt từng tính năng AI và hạn mức (bảng AI_Settings).
 *
 * Tính năng chưa có dòng trong bảng thì dùng mặc định bên dưới (và tạo dòng ở lần đọc đầu).
 * Tắt tính năng: API trả 503 { unavailable }, giao diện ẩn mục / nút tương ứng.
 */
import type { AiSetting } from "@prisma/client";
import { prisma } from "../db.js";
import { hasGeminiKey } from "./gemini.js";

export const AI_FEATURES = {
  ANALYST: { label: "Trợ lý AI hỏi số liệu", enabled: true, dailyLimit: 200, hourlyPerUser: 30 },
  VOICE_ORDER_POS: { label: "Gọi món bằng giọng nói (POS / Sơ đồ bàn)", enabled: true, dailyLimit: null, hourlyPerUser: null },
  // hourlyPerUser: số lần / phiên trình duyệt / giờ
  VOICE_ORDER_WEB: { label: "Đặt món bằng giọng nói (web khách)", enabled: true, dailyLimit: 500, hourlyPerUser: 10 },
  INVOICE_OCR: { label: "Đọc hoá đơn nhà cung cấp khi nhận hàng", enabled: true, dailyLimit: 200, hourlyPerUser: null },
  NUTRITION_ASSIST: { label: "Gợi ý dinh dưỡng nguyên liệu", enabled: true, dailyLimit: 100, hourlyPerUser: null },
  WEATHER_PICKS: { label: "Câu gợi ý món theo thời tiết", enabled: true, dailyLimit: 300, hourlyPerUser: null },
  MENU_DRAFT: { label: "AI phác thảo món mới", enabled: true, dailyLimit: 50, hourlyPerUser: 10 },
  // hourlyPerUser: số lần / nhân viên / giờ
  SHIFT_WISH_AI: { label: "Hiểu nguyện vọng xếp ca viết tự nhiên", enabled: true, dailyLimit: 300, hourlyPerUser: 10 },
  SHIFT_EXPLAIN_AI: { label: "Giải thích kết quả xếp ca", enabled: true, dailyLimit: 100, hourlyPerUser: null },
} as const;
export type AiFeature = keyof typeof AI_FEATURES;

export const isAiFeature = (f: unknown): f is AiFeature => typeof f === "string" && f in AI_FEATURES;

export async function getAiSetting(feature: AiFeature): Promise<AiSetting> {
  const d = AI_FEATURES[feature];
  return prisma.aiSetting.upsert({
    where: { feature },
    create: { feature, enabled: d.enabled, dailyLimit: d.dailyLimit, hourlyPerUser: d.hourlyPerUser },
    update: {},
  });
}

/** Mọi tính năng kèm cờ đã cấu hình khóa Gemini chưa (cho trang cài đặt / menu) */
export async function listAiSettings() {
  const rows = await Promise.all((Object.keys(AI_FEATURES) as AiFeature[]).map(getAiSetting));
  return rows.map((r) => ({ ...r, label: AI_FEATURES[r.feature as AiFeature].label, available: r.enabled && hasGeminiKey() }));
}

/** Tính năng đang dùng được: đang bật và có khóa Gemini */
export async function isAiEnabled(feature: AiFeature) {
  return hasGeminiKey() && (await getAiSetting(feature)).enabled;
}
