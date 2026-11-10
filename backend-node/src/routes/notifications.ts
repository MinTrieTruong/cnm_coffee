/**
 * routes/notifications.ts — Trung tâm thông báo
 *
 * Mọi nhân viên:
 *   GET  /notifications?before=<id>&limit=20&unread=1  — hộp thư của tôi (mới nhất trước) + số chưa đọc
 *   GET  /notifications/unread                         — số chưa đọc + thông báo QUAN TRỌNG chưa xác nhận
 *   POST /notifications/:id/read                       — đánh dấu đã đọc (thông báo quan trọng: "Đã hiểu")
 *   POST /notifications/read-all
 * Quản lý chi nhánh / Chủ chuỗi:
 *   GET  /notifications/audience                       — chi nhánh & vai trò chọn được + số người sẽ nhận
 *   POST /notifications/broadcast                      — gửi thủ công { title, body?, severity, roles[], storeIds? }
 *   GET  /notifications/sent                           — lịch sử đã gửi + tỉ lệ đã đọc
 *   POST /notifications/:id/recall                     — thu hồi thông báo đã gửi
 *
 * Web Push (thiết bị):
 *   GET  /push/public-key · POST /push/subscribe · POST /push/unsubscribe
 *
 * Real-time: Socket.io — "notify:new" / "notify:recalled" tới phòng staff_<id> (lib/notify.ts);
 * máy đã đóng tab nhận qua Web Push (lib/webPush.ts).
 */
import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { attachStaff, requireRoles, type StaffRequest } from "../middleware/staff.js";
import { reqStoreId } from "../lib/storeScope.js";
import { audit } from "../lib/audit.js";
import { notify, recallNotification } from "../lib/notify.js";
import { pushPublicKey } from "../lib/webPush.js";

/** Vai trò nhận được thông báo thủ công (theo lib/roles.ts phía frontend) */
const ROLE_LABEL: Record<string, string> = {
  Admin: "Quản lý chi nhánh",
  Warehouse: "Thủ kho",
  Cashier: "Thu ngân",
  Waiter: "Phục vụ",
  Kitchen: "Pha chế",
  Shipper: "Shipper",
};
const ROLES = Object.keys(ROLE_LABEL);

export function notificationsRouter(prisma: PrismaClient) {
  const r = Router();
  const auth = attachStaff(prisma);
  const manager = [auth, requireRoles("Admin")];

  const dto = (x: {
    readAt: Date | null;
    notification: { id: number; type: string; severity: string; title: string; body: string | null; link: string | null; createdAt: Date; sender: { fullName: string } | null; store: { name: string } | null };
  }) => ({
    id: x.notification.id,
    type: x.notification.type,
    severity: x.notification.severity,
    title: x.notification.title,
    body: x.notification.body,
    link: x.notification.link,
    createdAt: x.notification.createdAt,
    readAt: x.readAt,
    sender: x.notification.sender,
    storeName: x.notification.store?.name ?? null,
  });
  const inboxInclude = { notification: { include: { sender: { select: { fullName: true } }, store: { select: { name: true } } } } } as const;
  const visible = { recalledAt: null };

  r.get("/notifications", auth, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const before = Number(req.query.before) || undefined;
    const onlyUnread = req.query.unread === "1";
    const where = {
      staffId: me.id,
      notification: visible,
      ...(before ? { notificationId: { lt: before } } : {}),
      ...(onlyUnread ? { readAt: null } : {}),
    };
    const [rows, unread] = await Promise.all([
      prisma.notificationRecipient.findMany({ where, include: inboxInclude, orderBy: { notificationId: "desc" }, take: limit + 1 }),
      prisma.notificationRecipient.count({ where: { staffId: me.id, readAt: null, notification: visible } }),
    ]);
    res.json({ items: rows.slice(0, limit).map(dto), hasMore: rows.length > limit, unread });
  });

  r.get("/notifications/unread", auth, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const [unread, important] = await Promise.all([
      prisma.notificationRecipient.count({ where: { staffId: me.id, readAt: null, notification: visible } }),
      prisma.notificationRecipient.findMany({
        where: { staffId: me.id, readAt: null, notification: { ...visible, severity: "IMPORTANT" } },
        include: inboxInclude,
        orderBy: { notificationId: "asc" },
        take: 10,
      }),
    ]);
    res.json({ unread, important: important.map(dto) });
  });

  r.post("/notifications/read-all", auth, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const r2 = await prisma.notificationRecipient.updateMany({ where: { staffId: me.id, readAt: null }, data: { readAt: new Date() } });
    res.json({ updated: r2.count });
  });

  r.post("/notifications/:id/read", auth, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    await prisma.notificationRecipient.updateMany({ where: { notificationId: id, staffId: me.id, readAt: null }, data: { readAt: new Date() } });
    res.json({ ok: true });
  });

  /* ─────────── Web Push (thông báo khi đã đóng tab) ─────────── */

  r.get("/push/public-key", auth, (_req, res) => {
    res.json({ publicKey: pushPublicKey() });
  });

  /** Thiết bị bật thông báo: gắn đăng ký với người đang đăng nhập (máy dùng chung → chuyển sang người mới) */
  r.post("/push/subscribe", auth, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const b = req.body as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!pushPublicKey()) return res.status(503).json({ error: "Máy chủ chưa cấu hình Web Push (VAPID)." });
    if (!b.endpoint?.startsWith("https://") || !b.keys?.p256dh || !b.keys.auth || b.endpoint.length > 768) {
      return res.status(400).json({ error: "Đăng ký thông báo không hợp lệ." });
    }
    const data = { staffId: me.id, p256dh: b.keys.p256dh.slice(0, 255), auth: b.keys.auth.slice(0, 255), userAgent: req.get("user-agent")?.slice(0, 255) ?? null };
    await prisma.pushSubscription.upsert({ where: { endpoint: b.endpoint }, update: data, create: { endpoint: b.endpoint, ...data } });
    res.json({ ok: true });
  });

  /** Đăng xuất / tắt thông báo trên thiết bị này */
  r.post("/push/unsubscribe", auth, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const endpoint = (req.body as { endpoint?: string }).endpoint;
    if (endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint, staffId: me.id } });
    res.json({ ok: true });
  });

  /* ─────────── Gửi thủ công ─────────── */

  /** Chi nhánh gửi được: Quản lý → chi nhánh mình; Chủ chuỗi → chi nhánh đang chọn hoặc mọi chi nhánh */
  async function allowedStores(req: StaffRequest) {
    const me = req.staffRow!;
    if (me.role !== "Owner") return me.storeId ? await prisma.store.findMany({ where: { id: me.storeId }, select: { id: true, name: true } }) : [];
    return prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { id: "asc" } });
  }

  r.get("/notifications/audience", ...manager, async (req, res) => {
    const stores = await allowedStores(req as StaffRequest);
    const staff = await prisma.staff.findMany({
      where: { status: "Active", storeId: { in: stores.map((s) => s.id) }, role: { in: ROLES } },
      select: { storeId: true, role: true },
    });
    const counts: Record<string, Record<string, number>> = {};
    for (const s of staff) {
      const k = String(s.storeId);
      counts[k] ??= {};
      counts[k][s.role] = (counts[k][s.role] ?? 0) + 1;
    }
    res.json({
      stores,
      roles: ROLES.map((id) => ({ id, label: ROLE_LABEL[id] })),
      counts,
      // Chủ chuỗi đang chọn 1 chi nhánh → chọn sẵn chi nhánh đó
      defaultStoreIds: reqStoreId(req) != null ? [reqStoreId(req)] : stores.map((s) => s.id),
    });
  });

  r.post("/notifications/broadcast", ...manager, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const b = req.body as { title?: string; body?: string; severity?: string; roles?: string[]; storeIds?: number[] };
    const title = b.title?.trim();
    if (!title) return res.status(400).json({ error: "Nhập tiêu đề thông báo." });
    if (title.length > 150) return res.status(400).json({ error: "Tiêu đề tối đa 150 ký tự." });
    const severity = b.severity === "IMPORTANT" ? "IMPORTANT" : "NORMAL";
    const roles = (b.roles ?? []).filter((x) => ROLES.includes(x));

    const stores = await allowedStores(req as StaffRequest);
    const allowed = new Map(stores.map((s) => [s.id, s.name]));
    const storeIds = me.role === "Owner" ? (b.storeIds ?? []).filter((x) => allowed.has(x)) : stores.map((s) => s.id);
    if (!storeIds.length) return res.status(400).json({ error: "Chọn ít nhất một chi nhánh." });

    // Một bản ghi cho mỗi chi nhánh — lịch sử gửi & tỉ lệ đã đọc theo từng chi nhánh
    const roleText = roles.length ? roles.map((x) => ROLE_LABEL[x]).join(", ") : "Mọi nhân viên";
    let sent = 0;
    const ids: number[] = [];
    for (const storeId of storeIds) {
      const out = await notify({
        type: "BROADCAST",
        severity,
        title,
        body: b.body?.trim() || null,
        storeId,
        senderId: me.id,
        audienceLabel: `${allowed.get(storeId)} · ${roleText}`,
        to: { storeId, roles, exceptStaffId: me.id },
      });
      if (out) {
        sent += out.recipients;
        ids.push(out.id);
      }
    }
    if (!sent) return res.status(400).json({ error: "Không có nhân viên nào thuộc nhóm đã chọn." });
    audit(me.id, "NOTIFY_BROADCAST", title, `${sent} người · ${roleText}`);
    res.status(201).json({ ids, recipients: sent });
  });

  r.get("/notifications/sent", ...manager, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const stores = await allowedStores(req as StaffRequest);
    const rows = await prisma.notification.findMany({
      where: { type: "BROADCAST", storeId: { in: stores.map((s) => s.id) } },
      include: { sender: { select: { fullName: true } }, store: { select: { name: true } }, _count: { select: { recipients: true } } },
      orderBy: { id: "desc" },
      take: 50,
    });
    const reads = await prisma.notificationRecipient.groupBy({
      by: ["notificationId"],
      where: { notificationId: { in: rows.map((x) => x.id) }, readAt: { not: null } },
      _count: { _all: true },
    });
    const readOf = new Map(reads.map((x) => [x.notificationId, x._count._all]));
    res.json(
      rows.map((x) => ({
        id: x.id,
        title: x.title,
        body: x.body,
        severity: x.severity,
        audience: x.audience,
        storeName: x.store?.name ?? null,
        sender: x.sender,
        createdAt: x.createdAt,
        recalledAt: x.recalledAt,
        total: x._count.recipients,
        read: readOf.get(x.id) ?? 0,
        canRecall: !x.recalledAt && (me.role === "Owner" || x.senderId === me.id),
      })),
    );
  });

  r.post("/notifications/:id/recall", ...manager, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    const row = await prisma.notification.findUnique({ where: { id } });
    if (!row || row.type !== "BROADCAST") return res.status(404).json({ error: "Không tìm thấy thông báo." });
    if (me.role !== "Owner" && row.senderId !== me.id) return res.status(403).json({ error: "Chỉ người gửi mới thu hồi được." });
    if (row.recalledAt) return res.json({ ok: true });
    await recallNotification(id);
    audit(me.id, "NOTIFY_RECALL", row.title);
    res.json({ ok: true });
  });

  return r;
}
