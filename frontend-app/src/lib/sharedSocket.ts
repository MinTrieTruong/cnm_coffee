/**
 * Một kết nối Socket.io dùng chung cho khung nhân sự (badge, chuông thông báo, giao việc…)
 * thay vì mỗi hook tự mở một kết nối.
 *
 * - Đếm số nơi đang dùng: nơi cuối cùng trả lại thì mới ngắt kết nối.
 * - Nhớ các phòng đã join và join lại sau khi mất mạng / kết nối lại
 *   (phòng nằm ở phía máy chủ, mất khi socket cũ bị ngắt).
 *
 * Màn thao tác riêng (POS, KDS…) vẫn dùng staffSocket() như trước.
 */
import type { Socket } from "socket.io-client";
import { staffSocket } from "./staffApi";

let socket: Socket | null = null;
let users = 0;
const rooms = new Map<string, number>();

export type SharedSocket = {
  socket: Socket;
  join: (room: string) => void;
  release: () => void;
};

export function acquireSocket(): SharedSocket {
  if (!socket) {
    socket = staffSocket();
    socket.on("connect", () => {
      for (const r of rooms.keys()) socket?.emit("join", r);
    });
  }
  users += 1;
  const mine: string[] = [];
  const s = socket;
  let released = false;
  return {
    socket: s,
    join(room) {
      mine.push(room);
      rooms.set(room, (rooms.get(room) ?? 0) + 1);
      if (s.connected) s.emit("join", room);
    },
    release() {
      if (released) return;
      released = true;
      for (const r of mine) {
        const n = (rooms.get(r) ?? 1) - 1;
        if (n <= 0) rooms.delete(r);
        else rooms.set(r, n);
      }
      users -= 1;
      if (users <= 0) {
        s.disconnect();
        socket = null;
        users = 0;
        rooms.clear();
      }
    },
  };
}
