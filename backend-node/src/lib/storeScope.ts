import type { Request } from "express";
import type { Server } from "socket.io";
import type { StaffRequest } from "../middleware/staff.js";

/** Chi nhánh của request; `null` = Owner đang xem tất cả chi nhánh. */
export function reqStoreId(req: Request): number | null {
  return (req as StaffRequest).storeId ?? null;
}

/** Chi nhánh bắt buộc — dùng sau middleware `requireStore`. */
export function mustStoreId(req: Request): number {
  const sid = reqStoreId(req);
  if (sid == null) throw new Error("storeId missing — route thiếu middleware requireStore");
  return sid;
}

/** Điều kiện `where` lọc theo chi nhánh của request (rỗng khi Owner xem tất cả). */
export function storeWhere(req: Request): { storeId?: number } {
  const sid = reqStoreId(req);
  return sid == null ? {} : { storeId: sid };
}

/** Bản ghi có thuộc phạm vi chi nhánh của request không. */
export function inStore(req: Request, row: { storeId: number | null } | null | undefined): boolean {
  if (!row) return false;
  const sid = reqStoreId(req);
  return sid == null || row.storeId === sid;
}

/** Phòng socket nội bộ theo chi nhánh: kds, pos, staff, admin_room. */
export type StoreRoom = "kds" | "pos" | "staff" | "admin_room";

export function storeRoom(room: StoreRoom, storeId: number) {
  return `${room}:${storeId}`;
}

export function toStore(io: Server, room: StoreRoom, storeId: number) {
  return io.to(storeRoom(room, storeId));
}
