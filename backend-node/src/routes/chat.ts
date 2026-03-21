import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";

export function chatRouter(_prisma: PrismaClient, io: Server) {
  const r = Router();

  r.post("/chat", (req, res) => {
    const { message, tableId } = req.body as { message?: string; tableId?: number | null };
    const text = (message ?? "").toLowerCase();
    if (text.includes("wifi") || text.includes("wi-fi")) {
      return res.json({
        reply: "Pass WiFi: caphe1234",
        bot: true,
      });
    }
    if (text.includes("wc") || text.includes("nhà vệ sinh") || text.includes("toilet")) {
      return res.json({
        reply: "Nhà vệ sinh ở cuối hành lang bên phải quầy bar.",
        bot: true,
      });
    }
    io.to("staff").emit("chat:escalate", {
      message,
      tableId: tableId ?? null,
      at: new Date().toISOString(),
    });
    return res.json({
      reply: "Đã chuyển yêu cầu tới nhân viên. Vui lòng chờ trong giây lát.",
      bot: false,
    });
  });

  return r;
}
