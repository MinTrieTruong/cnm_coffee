/**
 * lib/notify.ts — Gửi thông báo nội bộ (Trung tâm thông báo)
 *
 * Mọi thông báo — quản lý gửi thủ công hay hệ thống tự gửi — đều đi qua `notify()`:
 *   1. Chốt danh sách người nhận (theo id, hoặc theo chi nhánh + vai trò) — chỉ nhân viên đang làm
 *   2. Ghi Notifications + Notification_Recipients
 *   3. Đẩy socket "notify:new" tới phòng staff_<id> của từng người (client tăng badge ngay)
 *
 * Gọi kiểu "bắn rồi quên": lỗi được ghi log, không làm hỏng thao tác chính (thanh toán, duyệt đơn…).
 */
import type { PrismaClient } from "@prisma/client";
import { getRealtime } from "./realtime.js";
import { sendPush, sendRecall } from "./webPush.js";

let prisma: PrismaClient | null = null;
/** Gọi 1 lần khi khởi động (index.ts) */
export function initNotify(client: PrismaClient) {
  prisma = client;
}

export type NotifyType =
  | "BROADCAST"
  | "MENU_SOLDOUT"
  | "MENU_BACK"
  | "DELIVERY_NEW"
  | "DELIVERY_REFUND"
  | "HR_REQUEST"
  | "HR_REVIEWED"
  | "LOW_STOCK"
  | "STOCK_REQUEST"
  | "MENU_PROPOSAL"
  | "TASK"
  | "SHIFT_OPEN"
  | "BRANCH_PROPOSAL"
  | "INVENTORY_COUNT";

export type Audience = {
  /** Gửi đích danh */
  staffIds?: number[];
  /** Chi nhánh; null/undefined + roles = mọi chi nhánh */
  storeId?: number | null;
  /** Lọc vai trò; rỗng = mọi vai trò (trừ Chủ chuỗi). Có "Owner" = gửi thêm cho Chủ chuỗi */
  roles?: string[];
  /** Không gửi cho người này (thường là người vừa thao tác) */
  exceptStaffId?: number;
};

export type NotifyInput = {
  type: NotifyType;
  title: string;
  body?: string | null;
  link?: string | null;
  severity?: "NORMAL" | "IMPORTANT";
  storeId?: number | null;
  senderId?: number | null;
  audienceLabel?: string | null;
  to: Audience;
  /** Không gửi lại thông báo cùng khóa trong `dedupeMinutes` phút (mặc định 30) */
  dedupeKey?: string;
  dedupeMinutes?: number;
};

const RETENTION_DAYS = 90;

/** Danh sách nhân viên nhận theo đối tượng */
export async function resolveRecipients(db: PrismaClient, to: Audience): Promise<number[]> {
  let ids: number[];
  if (to.staffIds) {
    const rows = await db.staff.findMany({ where: { id: { in: to.staffIds }, status: "Active" }, select: { id: true } });
    ids = rows.map((r) => r.id);
  } else {
    const roles = to.roles ?? [];
    const branchRoles = roles.filter((r) => r !== "Owner");
    const or: object[] = [];
    // Nhân viên chi nhánh (Chủ chuỗi không thuộc chi nhánh nào)
    if (roles.length === 0 || branchRoles.length > 0) {
      or.push({
        role: branchRoles.length ? { in: branchRoles } : { not: "Owner" },
        ...(to.storeId != null ? { storeId: to.storeId } : {}),
      });
    }
    if (roles.includes("Owner")) or.push({ role: "Owner" });
    const rows = await db.staff.findMany({ where: { status: "Active", OR: or }, select: { id: true } });
    ids = rows.map((r) => r.id);
  }
  return [...new Set(ids)].filter((id) => id !== to.exceptStaffId);
}

/** Dạng gửi về client (khớp GET /api/notifications) */
export type NotificationDto = {
  id: number;
  type: string;
  severity: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: Date;
  readAt: Date | null;
  sender: { fullName: string } | null;
  storeName: string | null;
};

export async function notify(input: NotifyInput): Promise<{ id: number; recipients: number } | null> {
  const db = prisma;
  if (!db) return null;
  try {
    if (input.dedupeKey) {
      const since = new Date(Date.now() - (input.dedupeMinutes ?? 30) * 60_000);
      const dup = await db.notification.findFirst({ where: { dedupeKey: input.dedupeKey, createdAt: { gte: since }, recalledAt: null }, select: { id: true } });
      if (dup) return null;
    }
    const staffIds = await resolveRecipients(db, input.to);
    if (!staffIds.length) return null;

    const row = await db.notification.create({
      data: {
        type: input.type,
        severity: input.severity ?? "NORMAL",
        title: input.title.slice(0, 150),
        body: input.body?.slice(0, 1000) || null,
        link: input.link ?? null,
        storeId: input.storeId ?? null,
        senderId: input.senderId ?? null,
        audience: input.audienceLabel?.slice(0, 255) ?? null,
        dedupeKey: input.dedupeKey ?? null,
        recipients: { createMany: { data: staffIds.map((staffId) => ({ staffId })) } },
      },
      include: { sender: { select: { fullName: true } }, store: { select: { name: true } } },
    });

    const io = getRealtime();
    if (io) {
      const dto: NotificationDto = {
        id: row.id,
        type: row.type,
        severity: row.severity,
        title: row.title,
        body: row.body,
        link: row.link,
        createdAt: row.createdAt,
        readAt: null,
        sender: row.sender,
        storeName: row.store?.name ?? null,
      };
      for (const id of staffIds) io.to(`staff_${id}`).emit("notify:new", dto);
    }
    // Web Push: tới cả máy đã đóng tab (Service Worker tự bỏ qua khi app đang mở và hiển thị)
    void sendPush(staffIds, { id: row.id, title: row.title, body: row.body, link: row.link, severity: row.severity, type: row.type }).catch((e) =>
      console.error("[notify] web push lỗi:", e),
    );
    return { id: row.id, recipients: staffIds.length };
  } catch (e) {
    console.error("[notify] gửi thông báo lỗi:", e);
    return null;
  }
}

/** Thu hồi: ẩn khỏi danh sách của mọi người nhận */
export async function recallNotification(id: number) {
  const db = prisma;
  if (!db) return;
  const row = await db.notification.update({ where: { id }, data: { recalledAt: new Date() }, include: { recipients: { select: { staffId: true } } } });
  const io = getRealtime();
  if (io) for (const r of row.recipients) io.to(`staff_${r.staffId}`).emit("notify:recalled", { id });
  // Đóng thông báo hệ điều hành đang hiện trên máy người nhận (Service Worker xử lý "recall")
  void sendRecall(row.recipients.map((r) => r.staffId), id).catch(() => {});
}

/** Xóa thông báo cũ hơn 90 ngày — chạy lúc khởi động và mỗi ngày một lần */
export function startNotificationCleanup() {
  const run = async () => {
    if (!prisma) return;
    try {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
      await prisma.notification.deleteMany({ where: { createdAt: { lt: cutoff } } });
    } catch (e) {
      console.error("[notify] dọn thông báo cũ lỗi:", e);
    }
  };
  void run();
  setInterval(run, 86_400_000).unref();
}
