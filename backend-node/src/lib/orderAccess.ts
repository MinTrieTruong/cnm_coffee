import type { Request } from "express";
import type { Order, PrismaClient } from "@prisma/client";
import { verifyToken, type CustomerPayload, type StaffPayload } from "./jwt.js";

type OrderOwner = Pick<Order, "customerId" | "sessionId" | "tableId" | "storeId">;

/** Người xem phía khách: tài khoản (token), phiên mang về, bàn đang ngồi */
export type OrderViewer = { customerId?: number | null; session?: string | null; tableId?: number | null };

/** Đọc token (khách hoặc nhân sự) — không bắt buộc, sai thì bỏ qua */
export function readToken(token: string | null | undefined): CustomerPayload | StaffPayload | null {
  if (!token) return null;
  try {
    return verifyToken<CustomerPayload | StaffPayload>(token);
  } catch {
    return null;
  }
}

/**
 * Khách có phải chủ đơn không — cùng quy tắc với hủy đơn:
 * đơn của khách đăng nhập → đúng tài khoản; đơn mang về vãng lai → đúng mã phiên; đơn tại bàn vãng lai → đúng số bàn.
 */
export function viewerOwnsOrder(order: OrderOwner, v: OrderViewer) {
  if (order.customerId) return v.customerId === order.customerId;
  if (order.sessionId) return !!v.session && v.session === order.sessionId;
  if (order.tableId != null) return v.tableId === order.tableId;
  return false;
}

/**
 * Ai được xem đơn qua REST (chi tiết, bill, theo dõi giao hàng): chủ đơn (token / header X-Order-Session / X-Table-Id)
 * hoặc nhân viên đang hoạt động cùng chi nhánh, hoặc Chủ chuỗi.
 */
export async function canViewOrder(prisma: PrismaClient, req: Request, order: OrderOwner) {
  const h = req.headers.authorization;
  const p = readToken(h?.startsWith("Bearer ") ? h.slice(7) : null);
  if (p?.typ === "staff") {
    const s = await prisma.staff.findUnique({ where: { id: p.sub }, select: { role: true, status: true, storeId: true } });
    if (s && s.status === "Active" && (s.role === "Owner" || s.storeId === order.storeId)) return true;
  }
  return viewerOwnsOrder(order, {
    customerId: p?.typ === "cust" ? p.sub : null,
    session: req.header("x-order-session") ?? null,
    tableId: req.header("x-table-id") ? Number(req.header("x-table-id")) : null,
  });
}
