/**
 * lib/shiftWish/context.ts — Ngữ cảnh tháng (ngày, ca đang dùng, cấu hình), hạn chót, nhắc người chưa gửi.
 */
import type { PrismaClient } from "@prisma/client";
import { getHrConfig, getShiftTemplates, SHIFT_ROLES } from "../hrConfig.js";
import { notify } from "../notify.js";
import { bizToday } from "../bizTime.js";
import { monthDays, type WishContext } from "./normalize.js";

export const SHIFT_WISH_LINK = "/app/hr/shift-wishes";
/** Tự nhắc trước hạn chót N ngày */
export const REMIND_BEFORE_DAYS = 3;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM" cộng n tháng */
export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

export const currentMonth = () => bizToday().slice(0, 7);

/** Hạn gửi nguyện vọng cho tháng `month`: ngày `deadlineDay` của tháng trước (YYYY-MM-DD, hết ngày theo giờ quán) */
export function deadlineOf(month: string, deadlineDay: number) {
  return `${addMonths(month, -1)}-${pad2(deadlineDay)}`;
}

export const isPastDeadline = (month: string, deadlineDay: number) => bizToday() > deadlineOf(month, deadlineDay);

/** Ngữ cảnh kiểm tra rule của một tháng; null nếu tháng sai định dạng */
export async function wishContext(prisma: PrismaClient, month: string) {
  const days = monthDays(month);
  if (!days) return null;
  const [config, templates] = await Promise.all([getHrConfig(prisma), getShiftTemplates(prisma, true)]);
  const ctx: WishContext = {
    month,
    days,
    templates: templates.map((t) => ({ code: t.code, name: t.name, startMin: t.startMin, endMin: t.endMin })),
    maxRules: config.maxWishRules,
  };
  return { ctx, config, templates };
}

/** Nhân viên đang làm, được xếp ca, thuộc chi nhánh */
export const shiftStaffWhere = (storeId: number) => ({ storeId, status: "Active", role: { in: [...SHIFT_ROLES] } });

/**
 * Nhắc người chưa xác nhận nguyện vọng tháng `month` (chưa gửi hoặc còn nháp).
 * Mỗi người một thông báo, khóa chống trùng theo chi nhánh + tháng + người.
 */
export async function remindMissing(prisma: PrismaClient, storeId: number, month: string, dedupeMinutes: number, senderId?: number) {
  const [staff, done, config] = await Promise.all([
    prisma.staff.findMany({ where: shiftStaffWhere(storeId), select: { id: true } }),
    prisma.shiftWish.findMany({ where: { month, status: "CONFIRMED" }, select: { staffId: true } }),
    getHrConfig(prisma),
  ]);
  const doneIds = new Set(done.map((w) => w.staffId));
  const missing = staff.filter((s) => !doneIds.has(s.id)).map((s) => s.id);
  const deadline = deadlineOf(month, config.wishDeadlineDay);
  let sent = 0;
  for (const staffId of missing) {
    const r = await notify({
      type: "SHIFT_WISH",
      title: `Gửi nguyện vọng xếp ca tháng ${month.slice(5)}/${month.slice(0, 4)}`,
      body: `Hạn chót ${deadline.slice(8)}/${deadline.slice(5, 7)}. Gõ như nhắn tin, VD "Em đi học sáng thứ 3, muốn làm tối cuối tuần".`,
      link: `${SHIFT_WISH_LINK}?month=${month}`,
      storeId,
      senderId: senderId ?? null,
      to: { staffIds: [staffId] },
      dedupeKey: `shift-wish:${storeId}:${month}:${staffId}`,
      dedupeMinutes,
    });
    if (r) sent++;
  }
  return { missing: missing.length, sent };
}

/** Tác vụ nền: từ REMIND_BEFORE_DAYS ngày trước hạn chót đến hết hạn, nhắc người chưa gửi (mỗi người 1 lần) */
export function startShiftWishReminder(prisma: PrismaClient) {
  const run = async () => {
    try {
      const month = addMonths(currentMonth(), 1);
      const config = await getHrConfig(prisma);
      const deadline = deadlineOf(month, config.wishDeadlineDay);
      const today = bizToday();
      const start = new Date(Date.parse(`${deadline}T00:00:00Z`) - REMIND_BEFORE_DAYS * 86_400_000).toISOString().slice(0, 10);
      if (today < start || today > deadline) return;
      const stores = await prisma.store.findMany({ where: { isActive: true }, select: { id: true } });
      for (const s of stores) await remindMissing(prisma, s.id, month, (REMIND_BEFORE_DAYS + 1) * 1440);
    } catch (e) {
      console.error("[shiftWish] nhắc gửi nguyện vọng lỗi:", e);
    }
  };
  setTimeout(() => void run(), 30_000).unref();
  setInterval(() => void run(), 6 * 3_600_000).unref();
}
