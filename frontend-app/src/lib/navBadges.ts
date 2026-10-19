import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";

import { staffApi, staffSocket as openStaffSocket, isAdminRole } from "./staffApi";
import type { BadgeKey } from "./navConfig";

type Counts = Partial<Record<BadgeKey, number>>;

/**
 * Số badge cho thanh đáy của nhân viên, lấy từ API + socket đang có:
 *  - kds: món đang chờ pha (GET /api/kds/queue, socket "order:new" / "kds:update")
 *  - deliveryNew: đơn giao chờ thu ngân xác nhận (GET /api/delivery/board, socket "delivery:*")
 *  - shipperOrders: đơn đang gán cho shipper (GET /api/shipper/me, socket "shipper:*")
 * Vai trò không có nguồn nào → không gọi API.
 */
export function useStaffBadges(role: string | undefined, staffId: number | undefined): Counts {
  const [counts, setCounts] = useState<Counts>({});

  useEffect(() => {
    if (!role || !staffId) return;
    const wantKds = role === "Kitchen";
    const wantDelivery = role === "Cashier" || isAdminRole(role);
    const wantShipper = role === "Shipper";
    if (!wantKds && !wantDelivery && !wantShipper) return;

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
      } catch {
        /* badge là phụ — lỗi thì giữ số cũ */
        return;
      }
      if (alive) setCounts(next);
    };
    void refresh();

    const socket: Socket = openStaffSocket();
    if (wantKds) socket.emit("join", "kds");
    if (wantDelivery) socket.emit("join", "pos");
    if (wantShipper) socket.emit("join", `staff_${staffId}`);
    socket.emit("join", "staff");
    const onEvent = () => void refresh();
    for (const ev of ["order:new", "kds:update", "delivery:new", "delivery:update", "shipper:new_order", "shipper:refresh"]) socket.on(ev, onEvent);
    const poll = window.setInterval(onEvent, 60_000);
    return () => {
      alive = false;
      socket.disconnect();
      window.clearInterval(poll);
    };
  }, [role, staffId]);

  return counts;
}
