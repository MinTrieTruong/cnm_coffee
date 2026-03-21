import type { Server } from "socket.io";

export function registerSocketHandlers(io: Server) {
  io.on("connection", (socket) => {
    socket.on("join", (room: string) => {
      if (typeof room === "string" && ["kds", "staff", "pos"].includes(room)) {
        void socket.join(room);
      }
    });
  });
}
