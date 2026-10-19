import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { verifyToken, type StaffPayload } from "../lib/jwt.js";
import { isOwner } from "../middleware/staff.js";
import { storeRoom, type StoreRoom } from "../lib/storeScope.js";

const STORE_ROOMS: StoreRoom[] = ["kds", "staff", "pos", "admin_room"];

type SocketStaff = { id: number; role: string; storeIds: number[] };

export function registerSocketHandlers(io: Server, prisma: PrismaClient) {
  // Nhân viên gửi token qua `auth.token` (Owner gửi thêm `auth.storeId`).
  // Không có token hoặc token sai → kết nối như khách, chỉ vào được phòng của khách.
  io.use(async (socket, next) => {
    const { token, storeId } = (socket.handshake.auth ?? {}) as { token?: unknown; storeId?: unknown };
    if (typeof token === "string" && token) {
      try {
        const p = verifyToken<StaffPayload>(token);
        const s = p.typ === "staff" ? await prisma.staff.findUnique({ where: { id: p.sub } }) : null;
        if (s && s.status === "Active") {
          let storeIds: number[];
          if (isOwner(s.role)) {
            const want = Number(storeId);
            storeIds = Number.isInteger(want) && want > 0
              ? [want]
              : (await prisma.store.findMany({ select: { id: true } })).map((x) => x.id);
          } else {
            storeIds = s.storeId ? [s.storeId] : [];
          }
          socket.data.staff = { id: s.id, role: s.role, storeIds } satisfies SocketStaff;
        }
      } catch {
        /* token hết hạn/sai → coi như khách */
      }
    }
    next();
  });

  io.on("connection", (socket) => {
    socket.on("join", (room: string) => {
      if (typeof room !== "string") return;
      const staff = socket.data.staff as SocketStaff | undefined;

      // Phòng nội bộ: client vẫn gửi "pos"/"kds"/..., server gán vào đúng chi nhánh
      if ((STORE_ROOMS as string[]).includes(room)) {
        if (!staff) return;
        for (const sid of staff.storeIds) void socket.join(storeRoom(room as StoreRoom, sid));
        return;
      }

      const own = /^staff_(\d+)$/.exec(room);
      if (own) {
        if (staff && staff.id === Number(own[1])) void socket.join(room);
        return;
      }

      if (
        /^order:\d+$/.test(room) ||
        /^chat:\d+$/.test(room) || // khách join phòng riêng để nhận reply
        /^tracking:\d+$/.test(room) // khách join phòng tracking để xem Shipper
      ) {
        void socket.join(room);
      }
    });

    // Vị trí shipper được gửi qua REST đã xác thực (POST /api/shipper/location)
    // và server phát lại tới phòng tracking:<orderId> dưới sự kiện "delivery:location".
  });
}
