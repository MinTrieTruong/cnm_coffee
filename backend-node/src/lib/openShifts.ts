/**
 * lib/openShifts.ts — Ca trống: mời nhân viên nhận ca, ai bấm trước được ca, không ai nhận thì báo quản lý
 *
 *   1. Có ca trống (duyệt đơn nghỉ, quản lý bỏ người khỏi ca, công bố lịch còn thiếu người)
 *      → `announceOpenShifts()` gửi thông báo cho nhân viên cùng chi nhánh, cùng vị trí, CHƯA có ca nào ngày đó
 *        và không nghỉ phép ngày đó. Không có ai phù hợp → báo quản lý luôn.
 *   2. Nhân viên bấm "Nhận ca" → `claimOpenShift()`: cập nhật có điều kiện (ca vẫn trống mới gán)
 *      nên 2 người bấm cùng lúc chỉ 1 người được. Nhận xong → thu hồi thông báo của những người còn lại.
 *   3. Tác vụ nền mỗi 10 phút (`startOpenShiftJob()`):
 *      - mời nhận các ca trống trong 3 ngày tới chưa mời (VD ca trống sinh ra lúc công bố lịch tháng)
 *      - tới hạn (12 giờ trước ca; ca mở sát giờ thì sau 30 phút) mà chưa ai nhận → báo quản lý
 *      - ca đã bắt đầu mà vẫn trống → thu hồi lời mời
 */
import type { PrismaClient, WorkSchedule } from "@prisma/client";
import type { Server } from "socket.io";
import { bizDayStart } from "./bizTime.js";
import { SHIFT_ROLES } from "./hrConfig.js";
import { notify, recallNotification } from "./notify.js";
import { toStore } from "./storeScope.js";

/** Báo quản lý khi còn ít hơn chừng này giờ tới ca mà chưa ai nhận */
const ESCALATE_BEFORE_H = 12;
/** Ca trống mở sát giờ: vẫn chờ nhân viên nhận ít nhất chừng này phút rồi mới báo quản lý */
const MIN_WAIT_MIN = 30;
/** Tác vụ nền tự mời nhận các ca trống trong chừng này ngày tới */
const ANNOUNCE_AHEAD_DAYS = 3;
const JOB_EVERY_MS = 10 * 60_000;

export const OPEN_SHIFTS_LINK = "/app/hr/open-shifts";

let prisma: PrismaClient | null = null;
let io: Server | null = null;
/** Gọi 1 lần khi khởi động (index.ts) */
export function initOpenShifts(client: PrismaClient, server: Server) {
  prisma = client;
  io = server;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const ymdOf = (d: Date) => d.toISOString().slice(0, 10);
const hhmm = (m: number) => `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
const dmy = (d: Date) => `${ymdOf(d).slice(8, 10)}/${ymdOf(d).slice(5, 7)}`;

/** Giờ vào ca (giờ quán) */
export const shiftStart = (ws: Pick<WorkSchedule, "workDate" | "startMin">) => new Date(bizDayStart(ymdOf(ws.workDate)).getTime() + ws.startMin * 60_000);

/** "Ca sáng 26/10 (07:00–12:00)" */
async function shiftLabel(db: PrismaClient, ws: WorkSchedule) {
  const tpl = await db.shiftTemplate.findUnique({ where: { code: ws.shiftCode }, select: { name: true } });
  return `${tpl?.name ?? `Ca ${ws.shiftCode}`} ${dmy(ws.workDate)} (${hhmm(ws.startMin)}–${hhmm(ws.endMin)})`;
}

/** Điều kiện "đang nghỉ phép đã duyệt vào ngày d" */
const onLeaveWhere = (d: Date) => ({ status: "APPROVED" as const, date: { lte: d }, OR: [{ toDate: null, date: d }, { toDate: { gte: d } }] });

/** Nhân viên được mời nhận ca: cùng chi nhánh, cùng vị trí, ngày đó chưa có ca nào và không nghỉ phép */
async function candidatesFor(db: PrismaClient, ws: WorkSchedule): Promise<number[]> {
  const staff = await db.staff.findMany({
    where: { storeId: ws.storeId, status: "Active", role: ws.role ? ws.role : { in: [...SHIFT_ROLES] } },
    select: { id: true },
  });
  const ids = staff.map((s) => s.id);
  if (!ids.length) return [];
  const [busy, leaves] = await Promise.all([
    db.workSchedule.findMany({ where: { staffId: { in: ids }, workDate: ws.workDate, status: { not: "REJECTED" } }, select: { staffId: true } }),
    db.leaveRequest.findMany({ where: { userId: { in: ids }, ...onLeaveWhere(ws.workDate) }, select: { userId: true } }),
  ]);
  const out = new Set<number>([...busy.map((b) => b.staffId!), ...leaves.map((l) => l.userId)]);
  return ids.filter((id) => !out.has(id));
}

async function escalate(db: PrismaClient, ws: WorkSchedule, why: string) {
  await db.workSchedule.update({ where: { id: ws.id }, data: { escalatedAt: new Date() } });
  await notify({
    type: "SHIFT_OPEN",
    severity: "IMPORTANT",
    title: `Ca trống chưa có người: ${await shiftLabel(db, ws)}`,
    body: `${why} Vào "Xếp lịch tháng" để xếp người cho ca này.`,
    link: "/app/hr/schedule",
    storeId: ws.storeId,
    to: { storeId: ws.storeId, roles: ["Admin"] },
  });
}

/** Thu hồi lời mời nhận ca (đã có người nhận / quản lý tự xếp / ca bị xoá) */
export async function closeOpenShift(wsId: number) {
  const db = prisma;
  if (!db) return;
  try {
    const ws = await db.workSchedule.findUnique({ where: { id: wsId }, select: { openNotifId: true, openedAt: true } });
    if (ws?.openNotifId) await recallNotification(ws.openNotifId).catch(() => {});
    if (ws?.openedAt) await db.workSchedule.update({ where: { id: wsId }, data: { openNotifId: null, openedAt: null, escalatedAt: null } });
  } catch (e) {
    console.error("[openShifts] thu hồi lời mời lỗi:", e);
  }
}

/** Mời nhận các ca trống (bỏ qua ca đã có người / đã bắt đầu). Gọi kiểu "bắn rồi quên". */
export async function announceOpenShifts(wsIds: number[], reason?: string) {
  const db = prisma;
  if (!db || !wsIds.length) return;
  try {
    const rows = await db.workSchedule.findMany({ where: { id: { in: wsIds }, status: "OPEN_SHIFT", staffId: null } });
    const now = Date.now();
    for (const ws of rows) {
      const start = shiftStart(ws).getTime();
      if (start <= now) continue;
      if (ws.openNotifId) await recallNotification(ws.openNotifId).catch(() => {});
      const label = await shiftLabel(db, ws);
      const staffIds = await candidatesFor(db, ws);
      const sent = staffIds.length
        ? await notify({
            type: "SHIFT_OPEN",
            // Ca trong 24 giờ tới: bật hộp thoại
            severity: start - now < 24 * 3_600_000 ? "IMPORTANT" : "NORMAL",
            title: `Cần người nhận ca: ${label}`,
            body: `${reason ? `${reason}. ` : ""}Ai bấm "Nhận ca" trước sẽ được xếp vào ca này.`,
            link: OPEN_SHIFTS_LINK,
            storeId: ws.storeId,
            to: { staffIds },
          })
        : null;
      await db.workSchedule.update({ where: { id: ws.id }, data: { openNotifId: sent?.id ?? null, openedAt: new Date(), escalatedAt: null } });
      if (!sent) await escalate(db, ws, "Không có nhân viên cùng vị trí nào trống ca ngày này.");
      io && toStore(io, "staff", ws.storeId).emit("openshift:update", { id: ws.id });
    }
  } catch (e) {
    console.error("[openShifts] mời nhận ca lỗi:", e);
  }
}

/** Ca trống mà nhân viên này nhận được (đúng vị trí, ngày đó chưa có ca, không nghỉ phép, chưa bắt đầu) */
export async function openShiftsFor(staffId: number) {
  const db = prisma;
  if (!db) return [];
  const me = await db.staff.findUnique({ where: { id: staffId }, select: { storeId: true, role: true } });
  if (!me?.storeId) return [];
  const today = new Date(`${ymdOf(new Date(Date.now() - 86_400_000))}T00:00:00Z`);
  const rows = await db.workSchedule.findMany({
    where: { storeId: me.storeId, status: "OPEN_SHIFT", staffId: null, workDate: { gte: today }, OR: [{ role: me.role }, { role: null }] },
    orderBy: [{ workDate: "asc" }, { startMin: "asc" }],
  });
  if (!rows.length) return [];
  const dates = rows.map((r) => r.workDate);
  const [busy, leaves, templates] = await Promise.all([
    db.workSchedule.findMany({ where: { staffId, workDate: { in: dates }, status: { not: "REJECTED" } }, select: { workDate: true } }),
    db.leaveRequest.findMany({ where: { userId: staffId, status: "APPROVED" } }),
    db.shiftTemplate.findMany({ select: { code: true, name: true } }),
  ]);
  const busyDays = new Set(busy.map((b) => ymdOf(b.workDate)));
  const onLeave = (d: Date) => leaves.some((l) => l.date <= d && (l.toDate ?? l.date) >= d);
  const names = new Map(templates.map((t) => [t.code, t.name]));
  const now = Date.now();
  return rows
    .filter((r) => shiftStart(r).getTime() > now && !busyDays.has(ymdOf(r.workDate)) && !onLeave(r.workDate))
    .map((r) => ({ id: r.id, workDate: r.workDate, shiftCode: r.shiftCode, shiftName: names.get(r.shiftCode) ?? `Ca ${r.shiftCode}`, startMin: r.startMin, endMin: r.endMin, role: r.role, managerNote: r.managerNote }));
}

/** Nhân viên nhận ca trống. Trả lỗi (tiếng Việt) nếu không nhận được. */
export async function claimOpenShift(staffId: number, wsId: number): Promise<{ ok: true; schedule: WorkSchedule } | { ok: false; error: string }> {
  const db = prisma;
  if (!db) return { ok: false, error: "Máy chủ chưa sẵn sàng." };
  const [me, ws] = await Promise.all([
    db.staff.findUnique({ where: { id: staffId }, select: { fullName: true, storeId: true, role: true } }),
    db.workSchedule.findUnique({ where: { id: wsId } }),
  ]);
  if (!me || !ws || ws.storeId !== me.storeId) return { ok: false, error: "Không tìm thấy ca." };
  if (ws.status !== "OPEN_SHIFT" || ws.staffId != null) return { ok: false, error: "Ca này đã có người nhận." };
  if (ws.role && ws.role !== me.role) return { ok: false, error: "Ca này dành cho vị trí khác." };
  if (shiftStart(ws).getTime() <= Date.now()) return { ok: false, error: "Ca đã bắt đầu, không nhận được nữa." };
  const [busy, leave] = await Promise.all([
    db.workSchedule.findFirst({ where: { staffId, workDate: ws.workDate, status: { not: "REJECTED" } }, select: { id: true } }),
    db.leaveRequest.findFirst({ where: { userId: staffId, ...onLeaveWhere(ws.workDate) }, select: { id: true } }),
  ]);
  if (busy) return { ok: false, error: "Bạn đã có ca trong ngày này." };
  if (leave) return { ok: false, error: "Bạn đang nghỉ phép ngày này." };

  // Chỉ gán khi ca vẫn còn trống — ai cập nhật trước thì được ca
  const note = `${me.fullName} nhận ca trống`;
  let won = 0;
  try {
    won = (
      await db.workSchedule.updateMany({
        where: { id: wsId, status: "OPEN_SHIFT", staffId: null },
        data: { staffId, status: "APPROVED", role: ws.role ?? me.role, managerNote: ws.managerNote ? `${ws.managerNote} · ${note}` : note },
      })
    ).count;
  } catch (e: any) {
    if (e.code === "P2002") return { ok: false, error: "Bạn đã có ca trong ngày này." };
    throw e;
  }
  if (!won) return { ok: false, error: "Ca này vừa có người khác nhận trước." };

  // Cùng một người bấm nhận 2 ca khác nhau của cùng ngày gần như cùng lúc → trả lại ca này
  const sameDay = await db.workSchedule.count({ where: { staffId, workDate: ws.workDate, status: { not: "REJECTED" } } });
  if (sameDay > 1) {
    await db.workSchedule.update({ where: { id: wsId }, data: { staffId: null, status: "OPEN_SHIFT", role: ws.role, managerNote: ws.managerNote } });
    return { ok: false, error: "Bạn đã có ca trong ngày này." };
  }

  const schedule = (await db.workSchedule.findUnique({ where: { id: wsId } }))!;
  await closeOpenShift(wsId);
  const label = await shiftLabel(db, ws);
  void notify({ type: "SHIFT_OPEN", title: `Bạn đã nhận ${label}`, body: "Ca đã được thêm vào lịch cá nhân của bạn.", link: "/app/hr/my-schedule", storeId: ws.storeId, to: { staffIds: [staffId] } });
  void notify({ type: "SHIFT_OPEN", title: `${me.fullName} đã nhận ${label}`, body: ws.managerNote ?? null, link: "/app/hr/schedule", storeId: ws.storeId, to: { storeId: ws.storeId, roles: ["Admin"] } });
  if (io) {
    toStore(io, "admin_room", ws.storeId).emit("schedule:updated", schedule);
    toStore(io, "staff", ws.storeId).emit("openshift:update", { id: wsId });
    io.to(`staff_${staffId}`).emit("schedule:updated", schedule);
  }
  return { ok: true, schedule };
}

/** Tác vụ nền: mời nhận ca sắp tới, báo quản lý khi quá hạn, thu hồi lời mời của ca đã bắt đầu */
export function startOpenShiftJob() {
  const run = async () => {
    const db = prisma;
    if (!db) return;
    try {
      const now = Date.now();
      const from = new Date(`${ymdOf(new Date(now - 86_400_000))}T00:00:00Z`);
      const to = new Date(`${ymdOf(new Date(now + ANNOUNCE_AHEAD_DAYS * 86_400_000))}T00:00:00Z`);
      const rows = await db.workSchedule.findMany({ where: { status: "OPEN_SHIFT", staffId: null, workDate: { gte: from, lte: to } } });

      const toAnnounce: number[] = [];
      for (const ws of rows) {
        const start = shiftStart(ws).getTime();
        if (start <= now) {
          if (ws.openNotifId) await closeOpenShift(ws.id);
          continue;
        }
        if (!ws.openedAt) {
          if (start - now <= ANNOUNCE_AHEAD_DAYS * 86_400_000) toAnnounce.push(ws.id);
          continue;
        }
        const due = Math.max(start - ESCALATE_BEFORE_H * 3_600_000, ws.openedAt.getTime() + MIN_WAIT_MIN * 60_000);
        if (!ws.escalatedAt && now >= due) await escalate(db, ws, "Chưa có nhân viên nào nhận ca.");
      }
      await announceOpenShifts(toAnnounce);
    } catch (e) {
      console.error("[openShifts] tác vụ nền lỗi:", e);
    }
  };
  setTimeout(() => void run(), 15_000).unref();
  setInterval(() => void run(), JOB_EVERY_MS).unref();
}
