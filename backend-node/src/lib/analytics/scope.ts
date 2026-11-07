/**
 * lib/analytics/scope.ts — Phạm vi chi nhánh cho các hàm báo cáo dùng chung (màn báo cáo + trợ lý AI).
 *
 * Hàm báo cáo nhận `sw` (điều kiện `where` theo chi nhánh) thay vì `req`, nên route cũ truyền `storeWhere(req)`
 * còn trợ lý AI truyền phạm vi của người hỏi — hai bên ra cùng một con số.
 */
import type { StaffRequest } from "../../middleware/staff.js";

/** Điều kiện lọc chi nhánh: rỗng = mọi chi nhánh */
export type StoreFilter = { storeId?: number | { in: number[] } };

/** Phạm vi người hỏi: Admin = [chi nhánh của mình]; Owner = "ALL" */
export type AnalyticsScope = { role: string; storeIds: number[] | "ALL" };

export function scopeWhere(storeIds: number[] | "ALL"): StoreFilter {
  if (storeIds === "ALL") return {};
  return { storeId: storeIds.length === 1 ? storeIds[0] : { in: storeIds } };
}

/** Phạm vi của người đang đăng nhập: Owner xem cả chuỗi, các vai trò khác chỉ chi nhánh của mình */
export function scopeOf(req: StaffRequest): AnalyticsScope {
  const row = req.staffRow!;
  return { role: row.role, storeIds: row.role === "Owner" ? "ALL" : row.storeId ? [row.storeId] : [] };
}

export const inScope = (scope: AnalyticsScope, storeId: number) => scope.storeIds === "ALL" || scope.storeIds.includes(storeId);
