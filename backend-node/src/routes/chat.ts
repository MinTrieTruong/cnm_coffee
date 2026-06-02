import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { attachStaff, requireRoles, type StaffRequest } from "../middleware/staff.js";
import { optionalCustomerAuth } from "../middleware/customer.js";
import type { Request } from "express";

type CustReq = Request & { customerId?: number };

/* ─── Trả lời tự động của bot ───────────────────────────────────────── */
function botReply(text: string): string | null {
  const t = text.toLowerCase();
  if (t.includes("wifi") || t.includes("wi-fi") || t.includes("pass wifi") || t.includes("mật khẩu wifi"))
    return "📶 Pass WiFi: **caphe1234**";
  if (t.includes("wc") || t.includes("nhà vệ sinh") || t.includes("toilet") || t.includes("vệ sinh"))
    return "🚻 Nhà vệ sinh ở cuối hành lang bên phải quầy bar.";
  if (t.includes("giờ mở cửa") || t.includes("mấy giờ") || t.includes("mở cửa"))
    return "⏰ TD Coffee mở cửa từ 7:00 – 22:00, tất cả các ngày trong tuần.";
  if (t.includes("địa chỉ") || t.includes("ở đâu") || t.includes("chỗ nào"))
    return "📍 Địa chỉ quán: 123 Đường Cà Phê, Quận 1, TP.HCM.";
  if (t.includes("gửi xe") || t.includes("đậu xe") || t.includes("bãi xe"))
    return "🅿️ Quán có bãi xe miễn phí phía sau, vào cổng phụ đường Bạch Mai.";
  return null; // Không khớp → escalate lên nhân viên
}

export function chatRouter(prisma: PrismaClient, io: Server) {
  const r = Router();
  const staffAuth = [attachStaff(prisma), requireRoles("Admin", "Cashier", "Waiter", "Kitchen")];

  /* ─────────────────────────────────────────────────────────────────────
     POST /chat
     Khách gửi tin nhắn. Trả về reply bot hoặc thông báo đã chuyển NV.
     Body: { message, sessionId?, tableId?, guestName? }
  ───────────────────────────────────────────────────────────────────── */
  r.post("/chat", optionalCustomerAuth, async (req, res) => {
    const customerId = (req as CustReq).customerId ?? null;
    const { message, sessionId: bodySessionId, tableId, guestName } = req.body as {
      message?: string;
      sessionId?: number | null;
      tableId?: number | null;
      guestName?: string;
    };

    const text = (message ?? "").trim();
    if (!text) return res.status(400).json({ error: "Tin nhắn không được rỗng." });

    // Tìm hoặc tạo phiên chat
    let session = bodySessionId
      ? await prisma.chatSession.findUnique({ where: { id: bodySessionId } })
      : null;

    // Nếu session đã closed → tạo mới
    if (!session || session.status === "closed") {
      let displayName = guestName?.trim() || "Khách";
      if (customerId) {
        const cust = await prisma.customer.findUnique({ where: { id: customerId }, select: { fullName: true, phone: true } });
        displayName = cust?.fullName || cust?.phone || "Khách";
      }
      session = await prisma.chatSession.create({
        data: {
          customerId,
          guestName: displayName,
          tableId: tableId ?? null,
          status: "open",
        },
      });
    }

    // Lấy tên hiển thị của khách
    const senderName = session.guestName;

    // Lưu tin nhắn của khách
    await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        sender: "customer",
        senderName,
        body: text,
      },
    });

    // Thử bot reply
    const auto = botReply(text);
    if (auto) {
      await prisma.chatMessage.create({
        data: {
          sessionId: session.id,
          sender: "bot",
          senderName: "TD Bot",
          body: auto,
        },
      });
      return res.json({ reply: auto, bot: true, sessionId: session.id });
    }

    // Escalate tới nhân viên qua socket
    io.to("staff").emit("chat:escalate", {
      sessionId: session.id,
      guestName: senderName,
      tableId: session.tableId,
      message: text,
      at: new Date().toISOString(),
    });

    const replyText = "Đã chuyển yêu cầu tới nhân viên. Vui lòng chờ trong giây lát ☕";
    await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        sender: "bot",
        senderName: "TD Bot",
        body: replyText,
      },
    });

    return res.json({ reply: replyText, bot: false, sessionId: session.id });
  });

  /* ─────────────────────────────────────────────────────────────────────
     GET /chat/session/:id
     Khách lấy lịch sử hội thoại của phiên (lắng nghe socket chat:reply)
  ───────────────────────────────────────────────────────────────────── */
  r.get("/chat/session/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID không hợp lệ" });
    const session = await prisma.chatSession.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!session) return res.status(404).json({ error: "Không tìm thấy phiên chat" });
    res.json(session);
  });

  /* ─────────────────────────────────────────────────────────────────────
     GET /staff/chat/sessions
     Nhân viên lấy danh sách phiên đang mở (có tin nhắn gần nhất)
  ───────────────────────────────────────────────────────────────────── */
  r.get("/staff/chat/sessions", ...staffAuth, async (_req, res) => {
    const sessions = await prisma.chatSession.findMany({
      where: { status: "open" },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    res.json(sessions);
  });

  /* ─────────────────────────────────────────────────────────────────────
     GET /staff/chat/sessions/all
     Tất cả phiên (kể cả closed), dùng để tra lịch sử
  ───────────────────────────────────────────────────────────────────── */
  r.get("/staff/chat/sessions/all", ...staffAuth, async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = 30;
    const sessions = await prisma.chatSession.findMany({
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    res.json(sessions);
  });

  /* ─────────────────────────────────────────────────────────────────────
     GET /staff/chat/sessions/:id
     Nhân viên xem toàn bộ hội thoại của 1 phiên
  ───────────────────────────────────────────────────────────────────── */
  r.get("/staff/chat/sessions/:id", ...staffAuth, async (req, res) => {
    const id = Number(req.params.id);
    const session = await prisma.chatSession.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!session) return res.status(404).json({ error: "Không tìm thấy" });
    res.json(session);
  });

  /* ─────────────────────────────────────────────────────────────────────
     POST /staff/chat/sessions/:id/reply
     Nhân viên gửi reply vào phiên chat
     Body: { body }
  ───────────────────────────────────────────────────────────────────── */
  r.post("/staff/chat/sessions/:id/reply", ...staffAuth, async (req, res) => {
    const id = Number(req.params.id);
    const staff = (req as StaffRequest).staffRow!;
    const { body: msgBody } = req.body as { body?: string };

    if (!msgBody?.trim()) return res.status(400).json({ error: "Nội dung trống" });

    const session = await prisma.chatSession.findUnique({ where: { id } });
    if (!session) return res.status(404).json({ error: "Không tìm thấy phiên" });

    const msg = await prisma.chatMessage.create({
      data: {
        sessionId: id,
        sender: "staff",
        senderName: staff.fullName || staff.username || "Nhân viên",
        body: msgBody.trim(),
      },
    });

    // Cập nhật updatedAt của session
    await prisma.chatSession.update({ where: { id }, data: { updatedAt: new Date() } });

    // Thông báo tới khách (room theo sessionId) và toàn bộ nhân viên
    io.to(`chat:${id}`).emit("chat:reply", {
      sessionId: id,
      message: msg,
    });
    io.to("staff").emit("chat:reply", {
      sessionId: id,
      message: msg,
    });

    res.status(201).json(msg);
  });

  /* ─────────────────────────────────────────────────────────────────────
     PATCH /staff/chat/sessions/:id/close
     Nhân viên đóng phiên chat
  ───────────────────────────────────────────────────────────────────── */
  r.patch("/staff/chat/sessions/:id/close", ...staffAuth, async (req, res) => {
    const id = Number(req.params.id);
    const updated = await prisma.chatSession.update({
      where: { id },
      data: { status: "closed" },
    });
    io.to(`chat:${id}`).emit("chat:closed", { sessionId: id });
    io.to("staff").emit("chat:session_closed", { sessionId: id });
    res.json(updated);
  });

  return r;
}
