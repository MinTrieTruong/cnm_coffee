import type { Server } from "socket.io";

export function registerSocketHandlers(io: Server) {
  io.on("connection", (socket) => {
    socket.on("join", (room: string) => {
      if (typeof room !== "string") return;
      if (
        ["kds", "staff", "pos", "admin_room"].includes(room) ||
        /^order:\d+$/.test(room) ||
        /^staff_\d+$/.test(room) ||
        /^chat:\d+$/.test(room)   // khách join phòng riêng để nhận reply
      ) {
        void socket.join(room);
      }
    });
  });
}

