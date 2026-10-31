import { Router } from "express";
import { randomUUID } from "crypto";
import type { PrismaClient, ChatSession } from "@prisma/client";
import type { Server } from "socket.io";
import { attachStaff, isAdminLike, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { inStore, storeWhere, toStore } from "../lib/storeScope.js";
import { resolveCustomerStore } from "../lib/stores.js";
import { optionalCustomerAuth } from "../middleware/customer.js";
import { saveDataUrlImage } from "../lib/uploadImage.js";
import { notify } from "../lib/notify.js";
import { getStoreSettings } from "../lib/pricing.js";
import type { Request } from "express";

type CustReq = Request & { customerId?: number };

/** Loại khiếu nại khách chọn */
export const COMPLAINT_CATEGORIES: Record<string, string> = {
  HYGIENE: "Vệ sinh",
  SERVICE: "Thái độ phục vụ",
  FOOD: "Chất lượng món",
  WAIT: "Chờ lâu",
  DELIVERY: "Giao hàng",
  BILLING: "Thanh toán",
  OTHER: "Khác",
};

/** Cảm xúc được phép thả (khớp bảng chọn ở frontend) */
const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "😡", "👏"];

/* ─── Trả lời tự động của bot (không dùng emoji — quy tắc giao diện trang khách) ─── */
type BotInfo = { hours: string; address: string };
function botReply(text: string, info: BotInfo): string | null {
  const t = text.toLowerCase();
  if (t.includes("wifi") || t.includes("wi-fi") || t.includes("pass wifi") || t.includes("mật khẩu wifi"))
    return "Mật khẩu WiFi: caphe1234";
  if (t.includes("wc") || t.includes("nhà vệ sinh") || t.includes("toilet") || t.includes("vệ sinh"))
    return "Nhà vệ sinh ở cuối hành lang bên phải quầy bar.";
  if (t.includes("giờ mở cửa") || t.includes("mấy giờ") || t.includes("mở cửa"))
    return `TD Coffee mở cửa ${info.hours}.`;
  if (t.includes("địa chỉ") || t.includes("ở đâu") || t.includes("chỗ nào"))
    return `Địa chỉ quán: ${info.address}.`;
  if (t.includes("gửi xe") || t.includes("đậu xe") || t.includes("bãi xe"))
    return "Quán có chỗ gửi xe miễn phí, nhân viên sẽ hướng dẫn khi bạn tới.";
  return null; // Không khớp → escalate lên nhân viên
}

/** Phòng socket riêng của khách — tên kèm mã bí mật, không đoán được từ số phiên */
const customerRoom = (s: Pick<ChatSession, "id" | "accessKey">) => `chat:${s.id}:${s.accessKey}`;

export function chatRouter(prisma: PrismaClient, io: Server) {
  const r = Router();
  const staffAuth = [attachStaff(prisma), requireRoles("Admin", "Cashier", "Waiter", "Kitchen"), requireStore];
  /** Khiếu nại: Quản lý chi nhánh (chi nhánh mình) và Chủ chuỗi (mọi chi nhánh) */
  const managers = [attachStaff(prisma), requireRoles("Admin")];

  const msgInclude = { reactions: { select: { actorKey: true, actorName: true, emoji: true } } } as const;
  const withMessages = { messages: { orderBy: { createdAt: "asc" as const }, include: msgInclude } };

  /** Gắn ảnh đại diện nhân viên vào tin sender = "staff" (senderAvatarUrl) */
  async function withStaffAvatars<M extends { sender: string; staffId: number | null }>(msgs: M[]) {
    const ids = [...new Set(msgs.filter((m) => m.sender === "staff" && m.staffId).map((m) => m.staffId!))];
    const rows = ids.length ? await prisma.staff.findMany({ where: { id: { in: ids } }, select: { id: true, avatarUrl: true } }) : [];
    const map = new Map(rows.map((r) => [r.id, r.avatarUrl]));
    return msgs.map((m) => ({ ...m, senderAvatarUrl: m.staffId ? map.get(m.staffId) ?? null : null }));
  }

  /** Tin nhắn mới tới khách + nhân viên đúng nơi: khiếu nại → quản lý, chat → nhân viên chi nhánh */
  function broadcast(session: ChatSession, event: string, payload: unknown) {
    if (session.accessKey) io.to(customerRoom(session)).emit(event, payload);
    toStore(io, session.kind === "COMPLAINT" ? "admin_room" : "staff", session.storeId).emit(event, payload);
  }

  async function saveImage(dataUrl: unknown) {
    if (typeof dataUrl !== "string" || !dataUrl) return null;
    return saveDataUrlImage(dataUrl);
  }

  /** Khách sở hữu phiên: đúng mã truy cập (phiên cũ chưa có mã → không cho dùng tiếp) */
  async function ownSession(id: unknown, key: unknown) {
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0 || typeof key !== "string" || !key) return null;
    const s = await prisma.chatSession.findUnique({ where: { id: n } });
    return s && s.accessKey && s.accessKey === key ? s : null;
  }

  /* ─────────────────────────────────────────────────────────────────────
     POST /chat
     Khách gửi tin nhắn (chữ và / hoặc ảnh). Chat: bot trả lời hoặc chuyển nhân viên.
     Khiếu nại: tạo phiên khiếu nại, báo ngay quản lý chi nhánh.
     Body: { message?, image? (data URL), sessionId?, key?, tableId?, storeId?, guestName?, kind?: "CHAT" | "COMPLAINT", category? }
  ───────────────────────────────────────────────────────────────────── */
  r.post("/chat", optionalCustomerAuth, async (req, res) => {
    const customerId = (req as CustReq).customerId ?? null;
    const b = req.body as {
      message?: string; image?: string; sessionId?: number | null; key?: string | null;
      tableId?: number | null; storeId?: number | null; guestName?: string;
      kind?: string; category?: string;
    };
    const text = (b.message ?? "").trim().slice(0, 2000);
    if (!text && !b.image) return res.status(400).json({ error: "Tin nhắn không được rỗng." });
    const wantComplaint = b.kind === "COMPLAINT";
    if (wantComplaint && !b.sessionId && !COMPLAINT_CATEGORIES[String(b.category)]) return res.status(400).json({ error: "Chọn loại khiếu nại." });

    let imageUrl: string | null = null;
    try {
      imageUrl = await saveImage(b.image);
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : "Ảnh không hợp lệ" });
    }

    // Phiên đang mở của khách (đúng mã truy cập, đúng loại); không có → tạo mới
    let session = b.sessionId ? await ownSession(b.sessionId, b.key) : null;
    if (session && (session.status === "closed" || (session.kind === "COMPLAINT") !== wantComplaint)) session = null;
    const isNew = !session;
    if (!session) {
      let displayName = b.guestName?.trim().slice(0, 100) || "Khách";
      if (customerId) {
        const cust = await prisma.customer.findUnique({ where: { id: customerId }, select: { fullName: true, phone: true } });
        displayName = cust?.fullName || cust?.phone || "Khách";
      }
      const resolved = await resolveCustomerStore(prisma, b.tableId, b.storeId, { fallbackFirst: true });
      if ("error" in resolved) return res.status(400).json({ error: resolved.error });
      session = await prisma.chatSession.create({
        data: {
          storeId: resolved.storeId, customerId, guestName: displayName, tableId: b.tableId ?? null, status: "open",
          accessKey: randomUUID(),
          kind: wantComplaint ? "COMPLAINT" : "CHAT",
          ...(wantComplaint ? { category: String(b.category), complaintStatus: "NEW" } : {}),
        },
      });
    }

    const msg = await prisma.chatMessage.create({
      data: { sessionId: session.id, sender: "customer", senderName: session.guestName, body: text, imageUrl },
      include: msgInclude,
    });
    await prisma.chatSession.update({ where: { id: session.id }, data: { updatedAt: new Date() } });
    toStore(io, session.kind === "COMPLAINT" ? "admin_room" : "staff", session.storeId).emit("chat:reply", { sessionId: session.id, message: msg });

    const out = { sessionId: session.id, key: session.accessKey, kind: session.kind, message: msg };

    if (session.kind === "COMPLAINT") {
      if (!isNew) return res.json({ ...out, reply: null });
      // Khiếu nại mới → báo quản lý chi nhánh (chuông + push, mức quan trọng)
      const table = session.tableId ? await prisma.cafeTable.findUnique({ where: { id: session.tableId }, select: { name: true } }) : null;
      void notify({
        type: "COMPLAINT",
        title: `Khiếu nại mới #${session.id}: ${COMPLAINT_CATEGORIES[session.category ?? "OTHER"]}${table ? ` · ${table.name}` : ""}`,
        body: `${session.guestName}: ${text || "(ảnh)"}`.slice(0, 300),
        severity: "IMPORTANT",
        link: `/app/overview/complaints?id=${session.id}`,
        storeId: session.storeId,
        to: { storeId: session.storeId, roles: ["Admin", "Owner"] },
      });
      toStore(io, "admin_room", session.storeId).emit("complaint:new", { sessionId: session.id });
      const ack = await prisma.chatMessage.create({
        data: {
          sessionId: session.id, sender: "bot", senderName: "TD Bot",
          body: `Đã ghi nhận khiếu nại #${session.id} (${COMPLAINT_CATEGORIES[session.category ?? "OTHER"]}). Quản lý chi nhánh sẽ phản hồi bạn sớm nhất. Xin lỗi vì trải nghiệm chưa tốt.`,
        },
        include: msgInclude,
      });
      return res.json({ ...out, reply: ack });
    }

    // Chat: bot trả lời câu hỏi thường gặp (chỉ khi có chữ)
    let auto: string | null = null;
    if (text) {
      // Giờ mở cửa / địa chỉ: theo chi nhánh của phiên, thiếu thì lấy thông tin công ty (Website › Thông tin công ty)
      const [store, settings] = await Promise.all([
        prisma.store.findUnique({ where: { id: session.storeId }, select: { address: true, openTime: true, closeTime: true } }),
        getStoreSettings(prisma),
      ]);
      const hm = (v: string | null | undefined) => (v ? v.slice(0, 5) : null);
      auto = botReply(text, {
        hours: hm(store?.openTime) && hm(store?.closeTime) ? `từ ${hm(store?.openTime)} đến ${hm(store?.closeTime)} hằng ngày` : settings.companyHours,
        address: store?.address || settings.companyAddress,
      });
    }
    if (auto) {
      const bot = await prisma.chatMessage.create({ data: { sessionId: session.id, sender: "bot", senderName: "TD Bot", body: auto }, include: msgInclude });
      return res.json({ ...out, reply: bot, bot: true });
    }
    toStore(io, "staff", session.storeId).emit("chat:escalate", {
      sessionId: session.id, guestName: session.guestName, tableId: session.tableId, message: text || "[Ảnh]", at: new Date().toISOString(),
    });
    const wait = await prisma.chatMessage.create({
      data: { sessionId: session.id, sender: "bot", senderName: "TD Bot", body: "Đã chuyển yêu cầu tới nhân viên. Vui lòng chờ trong giây lát." },
      include: msgInclude,
    });
    return res.json({ ...out, reply: wait, bot: false });
  });

  /* GET /chat/session/:id?key= — khách xem lịch sử phiên của mình */
  r.get("/chat/session/:id", async (req, res) => {
    const s = await ownSession(req.params.id, req.query.key);
    if (!s) return res.status(404).json({ error: "Không tìm thấy phiên chat" });
    const found = await prisma.chatSession.findUnique({ where: { id: s.id }, include: withMessages });
    const session = found && { ...found, messages: await withStaffAvatars(found.messages) };
    // Ảnh đại diện của chính chủ phiên (người giữ mã) — hiện cạnh tin của khách
    const owner = session?.customerId ? await prisma.customer.findUnique({ where: { id: session.customerId }, select: { avatarUrl: true } }) : null;
    res.json({ ...session, accessKey: undefined, customerAvatarUrl: owner?.avatarUrl ?? null });
  });

  /* POST /chat/messages/:id/react { key, emoji } — khách thả / đổi / bỏ cảm xúc */
  r.post("/chat/messages/:id/react", async (req, res) => {
    const { key, emoji } = (req.body ?? {}) as { key?: string; emoji?: string };
    const m = await prisma.chatMessage.findUnique({ where: { id: Number(req.params.id) }, include: { session: true } });
    if (!m || !m.session.accessKey || m.session.accessKey !== key) return res.status(404).json({ error: "Không tìm thấy tin nhắn" });
    await react(m.id, m.session, "customer", m.session.guestName, emoji);
    res.json({ ok: true });
  });

  /** Thả cảm xúc: chưa có → thêm; khác → đổi; trùng → bỏ. Phát lại toàn bộ cảm xúc của tin */
  async function react(messageId: number, session: ChatSession, actorKey: string, actorName: string, emoji: unknown) {
    if (typeof emoji !== "string" || !REACTIONS.includes(emoji)) throw Object.assign(new Error("Cảm xúc không hợp lệ"), { status: 400 });
    const cur = await prisma.chatReaction.findUnique({ where: { messageId_actorKey: { messageId, actorKey } } });
    if (cur && cur.emoji === emoji) await prisma.chatReaction.delete({ where: { id: cur.id } });
    else await prisma.chatReaction.upsert({
      where: { messageId_actorKey: { messageId, actorKey } },
      create: { messageId, actorKey, actorName: actorName.slice(0, 100), emoji },
      update: { emoji, actorName: actorName.slice(0, 100) },
    });
    const reactions = await prisma.chatReaction.findMany({ where: { messageId }, select: { actorKey: true, actorName: true, emoji: true } });
    broadcast(session, "chat:reaction", { sessionId: session.id, messageId, reactions });
  }

  /* ───────────────────────── Nhân viên: chat (không gồm khiếu nại) ───────────────────────── */

  r.get("/staff/chat/sessions", ...staffAuth, async (req, res) => {
    res.json(await prisma.chatSession.findMany({
      where: { ...storeWhere(req), status: "open", kind: "CHAT" },
      orderBy: { updatedAt: "desc" },
      include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    }));
  });

  r.get("/staff/chat/sessions/all", ...staffAuth, async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = 30;
    res.json(await prisma.chatSession.findMany({
      where: { ...storeWhere(req), kind: "CHAT" },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    }));
  });

  /** Nhân viên được xem phiên: chat của chi nhánh; khiếu nại chỉ quản lý / Chủ chuỗi */
  async function staffSession(req: Request, id: number) {
    const s = await prisma.chatSession.findUnique({ where: { id } });
    if (!s || !inStore(req, s)) return null;
    if (s.kind === "COMPLAINT" && !isAdminLike((req as StaffRequest).staffRow!.role)) return null;
    return s;
  }

  r.get("/staff/chat/sessions/:id", attachStaff(prisma), requireRoles("Admin", "Cashier", "Waiter", "Kitchen"), async (req, res) => {
    const s = await staffSession(req, Number(req.params.id));
    if (!s) return res.status(404).json({ error: "Không tìm thấy" });
    res.json(await prisma.chatSession.findUnique({ where: { id: s.id }, include: withMessages }));
  });

  /* POST /staff/chat/sessions/:id/reply { body?, image? } — trả lời chat hoặc khiếu nại (quản lý) */
  r.post("/staff/chat/sessions/:id/reply", attachStaff(prisma), requireRoles("Admin", "Cashier", "Waiter", "Kitchen"), async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const { body: raw, image } = req.body as { body?: string; image?: string };
    const text = (raw ?? "").trim().slice(0, 2000);
    if (!text && !image) return res.status(400).json({ error: "Nội dung trống" });
    const session = await staffSession(req, Number(req.params.id));
    if (!session) return res.status(404).json({ error: "Không tìm thấy phiên" });
    let imageUrl: string | null = null;
    try {
      imageUrl = await saveImage(image);
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : "Ảnh không hợp lệ" });
    }
    const msg = await prisma.chatMessage.create({
      data: { sessionId: session.id, sender: "staff", senderName: staff.fullName || staff.username || "Nhân viên", staffId: staff.id, body: text, imageUrl },
      include: msgInclude,
    });
    // Quản lý trả lời khiếu nại mới → chuyển sang "Đang xử lý"
    const touched = await prisma.chatSession.update({
      where: { id: session.id },
      data: {
        updatedAt: new Date(),
        ...(session.kind === "COMPLAINT" && session.complaintStatus === "NEW" ? { complaintStatus: "IN_PROGRESS", handledById: staff.id } : {}),
      },
    });
    const [out] = await withStaffAvatars([msg]);
    broadcast(touched, "chat:reply", { sessionId: session.id, message: out });
    res.status(201).json(out);
  });

  r.post("/staff/chat/messages/:id/react", attachStaff(prisma), requireRoles("Admin", "Cashier", "Waiter", "Kitchen"), async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const m = await prisma.chatMessage.findUnique({ where: { id: Number(req.params.id) } });
    const session = m ? await staffSession(req, m.sessionId) : null;
    if (!m || !session) return res.status(404).json({ error: "Không tìm thấy tin nhắn" });
    try {
      await react(m.id, session, `staff:${staff.id}`, staff.fullName || "Nhân viên", (req.body as { emoji?: string })?.emoji);
      res.json({ ok: true });
    } catch (e) {
      res.status((e as { status?: number }).status ?? 500).json({ error: (e as Error).message });
    }
  });

  r.patch("/staff/chat/sessions/:id/close", ...staffAuth, async (req, res) => {
    const cur = await staffSession(req, Number(req.params.id));
    if (!cur) return res.status(404).json({ error: "Không tìm thấy phiên" });
    const updated = await prisma.chatSession.update({ where: { id: cur.id }, data: { status: "closed" } });
    broadcast(updated, "chat:closed", { sessionId: cur.id });
    toStore(io, "staff", updated.storeId).emit("chat:session_closed", { sessionId: cur.id });
    res.json(updated);
  });

  /* ───────────────────────── Quản lý: khiếu nại ───────────────────────── */

  r.get("/staff/complaints", ...managers, async (req, res) => {
    const rows = await prisma.chatSession.findMany({
      where: { ...storeWhere(req), kind: "COMPLAINT" },
      orderBy: { updatedAt: "desc" },
      take: 300,
      include: {
        store: { select: { name: true } },
        messages: { orderBy: { createdAt: "asc" }, select: { body: true, imageUrl: true, sender: true, createdAt: true } },
      },
    });
    const tables = new Map((await prisma.cafeTable.findMany({ where: { id: { in: rows.map((r) => r.tableId).filter((x): x is number => x != null) } }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));
    res.json(rows.map(({ messages, accessKey: _k, ...s }) => {
      const first = messages.find((m) => m.sender === "customer");
      return {
        ...s,
        tableName: s.tableId ? tables.get(s.tableId) ?? null : null,
        firstMessage: first?.body ?? "",
        firstImage: messages.find((m) => m.sender === "customer" && m.imageUrl)?.imageUrl ?? null,
        images: messages.filter((m) => m.imageUrl).length,
        lastAt: messages[messages.length - 1]?.createdAt ?? s.createdAt,
        // Khách đang chờ: tin cuối (bỏ qua tin tự động của bot) là của khách
        awaitingReply: [...messages].reverse().find((m) => m.sender !== "bot")?.sender === "customer",
      };
    }));
  });

  /* PATCH /staff/complaints/:id { status: IN_PROGRESS | RESOLVED, note? } */
  r.patch("/staff/complaints/:id", ...managers, async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const { status, note } = req.body as { status?: string; note?: string };
    if (status !== "IN_PROGRESS" && status !== "RESOLVED") return res.status(400).json({ error: "Trạng thái không hợp lệ" });
    if (status === "RESOLVED" && !note?.trim()) return res.status(400).json({ error: "Ghi cách xử lý trước khi đóng khiếu nại." });
    const cur = await staffSession(req, Number(req.params.id));
    if (!cur || cur.kind !== "COMPLAINT") return res.status(404).json({ error: "Không tìm thấy khiếu nại" });
    const updated = await prisma.chatSession.update({
      where: { id: cur.id },
      data: {
        complaintStatus: status, handledById: staff.id,
        ...(status === "RESOLVED" ? { resolutionNote: note!.trim().slice(0, 1000), resolvedAt: new Date(), status: "closed" } : { status: "open", resolvedAt: null }),
      },
    });
    if (status === "RESOLVED") {
      const msg = await prisma.chatMessage.create({
        data: { sessionId: cur.id, sender: "staff", senderName: staff.fullName || "Quản lý", staffId: staff.id, body: `Khiếu nại đã được xử lý: ${note!.trim()}` },
        include: msgInclude,
      });
      const [out] = await withStaffAvatars([msg]);
      broadcast(updated, "chat:reply", { sessionId: cur.id, message: out });
    }
    toStore(io, "admin_room", updated.storeId).emit("complaint:update", { sessionId: cur.id });
    res.json(updated);
  });

  return r;
}
