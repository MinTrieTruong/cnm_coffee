/**
 * ai/agent/scheduler.ts — Gộp tin & đợi nhân viên trước khi AI trả lời.
 *
 * Mỗi tin khách mới đặt lại hẹn giờ của phiên = max(gộp tin N giây, đợi nhân viên M phút):
 * khách gõ 3 tin liền → AI trả lời một lần cho cả 3. Nhân viên trả lời trong lúc chờ → huỷ hẹn giờ.
 * Đang trả lời dở mà hẹn giờ mới tới → đợi xong rồi chạy tiếp (không trả lời chồng).
 *
 * Giờ hẹn lưu ở Chat_Sessions.AI_Reply_Due_At: khởi động lại server thì `resumeAiReplies` hẹn lại
 * (quá giờ thì trả lời ngay). Nhiều máy chủ cùng chạy thì cần hàng đợi chung (Redis) — chưa cần ở quy mô này.
 */
import type { AiAgent } from "@prisma/client";
import { prisma } from "../../db.js";
import { handleIncoming } from "./engine.js";

const timers = new Map<number, NodeJS.Timeout>();
const running = new Set<number>();

/** Số giây AI sẽ đợi trước khi trả lời */
export const replyDelaySec = (agent: Pick<AiAgent, "mergeWindowSec" | "staffWaitMinutes">) => Math.max(agent.mergeWindowSec, agent.staffWaitMinutes * 60);

function fire(sessionId: number) {
  timers.delete(sessionId);
  if (running.has(sessionId)) {
    arm(sessionId, 2);
    return;
  }
  running.add(sessionId);
  prisma.chatSession
    .update({ where: { id: sessionId }, data: { aiReplyDueAt: null } })
    .catch(() => undefined)
    .then(() => handleIncoming(sessionId))
    .catch((e) => console.error(`[ai] phiên #${sessionId} lỗi:`, e))
    .finally(() => running.delete(sessionId));
}

function arm(sessionId: number, sec: number) {
  const cur = timers.get(sessionId);
  if (cur) clearTimeout(cur);
  timers.set(sessionId, setTimeout(() => fire(sessionId), Math.max(0, sec) * 1000));
}

/** Tin khách mới cần AI trả lời → (đặt lại) hẹn giờ và lưu giờ hẹn; trả số giây sẽ đợi */
export async function enqueueReply(sessionId: number, agent: Pick<AiAgent, "mergeWindowSec" | "staffWaitMinutes">) {
  const sec = replyDelaySec(agent);
  arm(sessionId, sec);
  await prisma.chatSession.update({ where: { id: sessionId }, data: { aiReplyDueAt: new Date(Date.now() + sec * 1000) } });
  return sec;
}

/** Nhân viên trả lời / tiếp quản / phiên đóng → không cần AI trả lời nữa */
export function cancelReply(sessionId: number) {
  const cur = timers.get(sessionId);
  if (cur) clearTimeout(cur);
  timers.delete(sessionId);
  void prisma.chatSession.updateMany({ where: { id: sessionId, aiReplyDueAt: { not: null } }, data: { aiReplyDueAt: null } }).catch(() => undefined);
}

/** Khởi động server: hẹn lại các phiên đang chờ AI trả lời */
export async function resumeAiReplies() {
  try {
    const rows = await prisma.chatSession.findMany({ where: { aiReplyDueAt: { not: null }, status: "open", aiPaused: false }, select: { id: true, aiReplyDueAt: true } });
    for (const r of rows) arm(r.id, Math.max(1, (r.aiReplyDueAt!.getTime() - Date.now()) / 1000));
    if (rows.length) console.log(`[ai] hẹn lại ${rows.length} phiên đang chờ AI trả lời`);
  } catch (e) {
    console.error("[ai] không nạp được hẹn giờ:", e);
  }
}

/** Dọn nhật ký AI: lượt thử (TEST) quá 30 ngày, còn lại quá 180 ngày — chạy lúc khởi động và mỗi ngày */
export function startAiLogCleanup() {
  const run = () => {
    const day = 86_400_000;
    void prisma.aiRunLog
      .deleteMany({ where: { OR: [{ kind: "TEST", createdAt: { lt: new Date(Date.now() - 30 * day) } }, { createdAt: { lt: new Date(Date.now() - 180 * day) } }] } })
      .catch((e) => console.error("[ai] dọn nhật ký lỗi:", e));
  };
  run();
  setInterval(run, 86_400_000).unref();
}
