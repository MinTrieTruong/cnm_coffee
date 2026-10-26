import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";

import { getOwnerStore, staffApi, isAdminRole } from "./staffApi";
import { acquireSocket } from "./sharedSocket";
import type { BadgeKey } from "./navConfig";

type Counts = Partial<Record<BadgeKey, number>>;

type Pending = {
  lowStock: number;
  urgentFromOthers: number;
  menuProposals: number;
  leave: number;
  swap: number;
  adjust: number;
  purchaseRequisitions: number;
  incomingTransfers: number;
  openPurchaseOrders: number;
  branchProposals?: number;
  branchProposalsNeedInfo?: number;
  inventoryCounts?: number;
};

/** Gọi để badge tính lại ngay (vd vừa duyệt xong một đơn) */
export const refreshBadges = () => window.dispatchEvent(new Event("td:badges-refresh"));

/**
 * Số badge cho thanh đáy của nhân viên, lấy từ API + socket đang có:
 *  - kds: món đang chờ pha (GET /api/kds/queue, socket "order:new" / "kds:update")
 *  - deliveryNew: đơn giao chờ thu ngân xác nhận (GET /api/delivery/board, socket "delivery:*")
 *  - shipperOrders: đơn đang gán cho shipper (GET /api/shipper/me, socket "shipper:*")
 *  - tasks: việc được giao hôm nay chưa xong (GET /api/tasks/my, socket "task:*")
 *  - openShifts: ca trống mình nhận được (GET /api/schedule/open, socket "openshift:update")
 *  - việc chờ xử lý (GET /api/admin/stats → pending, socket admin_room "hr:request" / "menu-proposal:new" / "stock-request:*"):
 *      approvals (đơn nghỉ + đổi ca + giải trình), purchase (QL: đề xuất mua chờ duyệt · Kho: đơn mua chờ nhận),
 *      proposals (Chủ chuỗi: đề xuất món), lowStock, transfers (phiếu chuyển chờ nhận), urgentStock (CN khác cần hàng gấp)
 * Vai trò không có nguồn nào → không gọi API.
 * (Badge "attendance" do AppShell tính từ lib/attendanceReminder.)
 */
export function useStaffBadges(role: string | undefined, staffId: number | undefined): Counts {
  const [counts, setCounts] = useState<Counts>({});

  useEffect(() => {
    if (!role || !staffId) return;
    const wantKds = role === "Kitchen";
    const wantDelivery = role === "Cashier" || isAdminRole(role);
    const wantShipper = role === "Shipper";
    // Chủ chuỗi không nhận việc giao theo ca
    const wantTasks = role !== "Owner";
    // Quản lý không nhận ca trống
    const wantOpenShifts = !isAdminRole(role);
    const wantStats = isAdminRole(role) || role === "Warehouse";
    // Chủ chuỗi xem "Tất cả chi nhánh": việc chờ là của từng chi nhánh → chỉ đếm đề xuất món (việc của chuỗi)
    const allStores = role === "Owner" && getOwnerStore() == null;
    if (!wantKds && !wantDelivery && !wantShipper && !wantTasks && !wantOpenShifts && !wantStats) return;

    let alive = true;
    const refresh = async () => {
      const next: Counts = {};
      try {
        if (wantKds) {
          const q = await staffApi<{ kdsStatus: string }[]>("/api/kds/queue");
          next.kds = q.filter((d) => d.kdsStatus === "Waiting").length;
        }
        if (wantDelivery) {
          const b = await staffApi<{ orders: { deliveryStatus: string }[] }>("/api/delivery/board");
          next.deliveryNew = b.orders.filter((o) => o.deliveryStatus === "Awaiting_Confirm").length;
        }
        if (wantShipper) {
          const me = await staffApi<{ orders: unknown[] }>("/api/shipper/me");
          next.shipperOrders = me.orders.length;
        }
        if (wantTasks) {
          // Lỗi riêng nguồn này không làm mất các badge khác
          const my = await staffApi<{ tasks: { assignees: { staffId: number; status: string }[] }[] }>("/api/tasks/my").catch(() => null);
          if (my) next.tasks = my.tasks.filter((t) => t.assignees.some((a) => a.staffId === staffId && a.status !== "DONE")).length;
        }
        if (wantOpenShifts) {
          const o = await staffApi<{ shifts: unknown[] }>("/api/schedule/open").catch(() => null);
          if (o) next.openShifts = o.shifts.length;
        }
        if (wantStats) {
          const s = await staffApi<{ pending: Pending }>("/api/admin/stats").catch(() => null);
          const p = s?.pending;
          if (p) {
            if (role === "Owner") next.proposals = p.menuProposals;
            if (role === "Owner") next.branchProposals = p.branchProposals;
            if (role === "Admin") next.branchProposals = p.branchProposalsNeedInfo;
            if (role === "Admin") next.inventoryCounts = p.inventoryCounts;
            if (role === "Warehouse") {
              next.purchase = p.openPurchaseOrders;
              next.transfers = p.incomingTransfers;
              next.urgentStock = p.urgentFromOthers;
            } else if (!allStores) {
              next.approvals = p.leave + p.swap + p.adjust;
              next.purchase = p.purchaseRequisitions;
            }
            if (!allStores) next.lowStock = p.lowStock;
          }
        }
      } catch {
        /* badge là phụ — lỗi thì giữ số cũ */
        return;
      }
      if (alive) setCounts(next);
    };
    void refresh();

    const shared = acquireSocket();
    const socket: Socket = shared.socket;
    if (wantKds) shared.join("kds");
    if (wantDelivery) shared.join("pos");
    shared.join(`staff_${staffId}`);
    if (wantStats) shared.join("admin_room");
    shared.join("staff");
    // Nhiều sự kiện dồn dập (vd POS tạo đơn liên tục) → gom lại, tối đa 1 lần / 2 giây
    let timer: number | undefined;
    const onEvent = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(), 2000);
    };
    const events = [
      "order:new", "kds:update", "delivery:new", "delivery:update", "shipper:new_order", "shipper:refresh",
      "task:assigned", "task:update", "task:redo", "openshift:update",
      "hr:request", "menu-proposal:new", "branch-proposal:update", "inventory-count:update", "stock-request:new", "stock-request:accepted",
    ];
    for (const ev of events) socket.on(ev, onEvent);
    // Kết nối lại sau khi mất mạng → có thể đã lỡ sự kiện, tải lại
    socket.on("connect", onEvent);
    // Màn "Việc của tôi" báo xong / vừa rời màn duyệt → cập nhật badge ngay
    window.addEventListener("td:tasks-changed", onEvent);
    window.addEventListener("td:badges-refresh", onEvent);
    const poll = window.setInterval(onEvent, 60_000);
    return () => {
      alive = false;
      for (const ev of events) socket.off(ev, onEvent);
      socket.off("connect", onEvent);
      shared.release();
      window.clearInterval(poll);
      window.clearTimeout(timer);
      window.removeEventListener("td:tasks-changed", onEvent);
      window.removeEventListener("td:badges-refresh", onEvent);
    };
  }, [role, staffId]);

  return counts;
}
