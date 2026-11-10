/**
 * lib/chatBroadcast.ts — Phát tin chat tới đúng nơi (dùng chung cho routes/chat.ts và AI tư vấn ai/agent/).
 */
import type { ChatSession } from "@prisma/client";
import type { Server } from "socket.io";
import { toStore } from "./storeScope.js";

/** Phòng socket riêng của khách — tên kèm mã bí mật, không đoán được từ số phiên */
export const customerRoom = (s: Pick<ChatSession, "id" | "accessKey">) => `chat:${s.id}:${s.accessKey}`;

/** Tin bot báo đã chuyển cho nhân viên — dùng để biết phiên có tin khách cần nhân viên (badge chưa đọc) */
export const WAIT_FOR_STAFF = "Đã chuyển yêu cầu tới nhân viên. Vui lòng chờ trong giây lát.";

/** Sự kiện tới khách + nhân viên: khiếu nại → quản lý, chat → nhân viên chi nhánh */
export function broadcastChat(io: Server, session: Pick<ChatSession, "id" | "accessKey" | "kind" | "storeId">, event: string, payload: unknown) {
  if (session.accessKey) io.to(customerRoom(session)).emit(event, payload);
  toStore(io, session.kind === "COMPLAINT" ? "admin_room" : "staff", session.storeId).emit(event, payload);
}

/** Báo nhân viên chi nhánh có phiên cần người trả lời (danh sách Tin nhắn + chuông) */
export function escalateChat(
  io: Server,
  session: Pick<ChatSession, "id" | "guestName" | "tableId" | "storeId">,
  message: string,
  extra?: { reason?: string; summary?: string },
) {
  toStore(io, "staff", session.storeId).emit("chat:escalate", {
    sessionId: session.id,
    guestName: session.guestName,
    tableId: session.tableId,
    message,
    at: new Date().toISOString(),
    ...extra,
  });
}
