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
  const tpl = ws.isExtra ? null : await db.shiftTemplate.findUnique({ where: { code: ws.shiftCode }, select: { name: true } });
  return `${ws.isExtra ? EXTRA_SHIFT_NAME : tpl?.name ?? `Ca ${ws.shiftCode}`} ${dmy(ws.workDate)} (${hhmm(ws.startMin)}–${hhmm(ws.endMin)})`;
}

/** Tên hiển thị của ca bổ sung (shiftCode EXTRA, giờ do quản lý chọn) */
export const EXTRA_SHIFT_NAME = "Ca bổ sung";

type Slot = Pick<WorkSchedule, "startMin" | "endMin" | "isExtra">;
/**
 * Ca `ws` có vướng ca `other` cùng ngày không.
 * Ca thường: mỗi người một ca/ngày (như trước). Có ca bổ sung ở một trong hai bên: chỉ vướng khi trùng giờ
 * (VD người ca chiều 14h vẫn nhận được ca bổ sung 10h–13h).
 */
export const clashes = (ws: Slot, other: Slot) => (ws.isExtra || other.isExtra ? ws.startMin < other.endMin && other.startMin < ws.endMin : true);

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
    db.workSchedule.findMany({ where: { staffId: { in: ids }, workDate: ws.workDate, status: { not: "REJECTED" } }, select: { staffId: true, startMin: true, endMin: true, isExtra: true } }),
    db.leaveRequest.findMany({ where: { userId: { in: ids }, ...onLeaveWhere(ws.workDate) }, select: { userId: true } }),
  ]);
  const out = new Set<number>([...busy.filter((b) => clashes(ws, b)).map((b) => b.staffId!), ...leaves.map((l) => l.userId)]);
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

/** Các chỗ còn trống của cùng nhóm ca bổ sung (trừ `exceptId`), thứ tự id */
async function openSlotsOf(db: PrismaClient, group: string, exceptId?: number) {
  return db.workSchedule.findMany({
    where: { extraGroup: group, status: "OPEN_SHIFT", staffId: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
    orderBy: { id: "asc" },
  });
}

/** Thu hồi lời mời nhận ca (đã có người nhận / quản lý tự xếp / ca bị xoá) */
export async function closeOpenShift(wsId: number) {
  const db = prisma;
  if (!db) return;
  try {
    const ws = await db.workSchedule.findUnique({ where: { id: wsId }, select: { openNotifId: true, openedAt: true, extraGroup: true } });
    // Ca bổ sung nhiều chỗ: chỗ này hết trống nhưng nhóm còn chỗ → giữ lời mời, chuyển sang chỗ kế tiếp
    const next = ws?.extraGroup && ws.openNotifId ? (await openSlotsOf(db, ws.extraGroup, wsId))[0] : undefined;
    if (next && ws?.openNotifId) {
      await db.workSchedule.update({ where: { id: next.id }, data: { openNotifId: ws.openNotifId, openedAt: ws.openedAt ?? new Date() } });
      await db.workSchedule.update({ where: { id: wsId }, data: { openNotifId: null, openedAt: null, escalatedAt: null } });
      return;
    }
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
    const rows = await db.workSchedule.findMany({ where: { id: { in: wsIds }, status: "OPEN_SHIFT", staffId: null }, orderBy: { id: "asc" } });
    const now = Date.now();
    const doneGroups = new Set<string>();
    for (const ws of rows) {
      const start = shiftStart(ws).getTime();
      if (start <= now) continue;
      // Ca bổ sung nhiều chỗ: một lời mời cho cả nhóm (gắn vào chỗ trống đầu tiên)
      let slots = 1;
      if (ws.extraGroup) {
        if (doneGroups.has(ws.extraGroup)) continue;
        doneGroups.add(ws.extraGroup);
        const open = await openSlotsOf(db, ws.extraGroup);
        slots = open.length;
        const others = open.filter((o) => o.id !== ws.id);
        for (const o of others) if (o.openNotifId) await recallNotification(o.openNotifId).catch(() => {});
        await db.workSchedule.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { openNotifId: null, openedAt: new Date(), escalatedAt: null } });
      }
      if (ws.openNotifId) await recallNotification(ws.openNotifId).catch(() => {});
      const label = await shiftLabel(db, ws);
      const staffIds = await candidatesFor(db, ws);
      const sent = staffIds.length
        ? await notify({
            type: "SHIFT_OPEN",
            // Ca trong 24 giờ tới: bật hộp thoại
            severity: start - now < 24 * 3_600_000 ? "IMPORTANT" : "NORMAL",
            title: slots > 1 ? `Cần ${slots} người nhận ca: ${label}` : `Cần người nhận ca: ${label}`,
            body: `${reason ? `${reason}. ` : ""}${slots > 1 ? `Còn ${slots} chỗ — ai bấm "Nhận ca" trước được xếp, đủ người thì ngưng nhận.` : `Ai bấm "Nhận ca" trước sẽ được xếp vào ca này.`}`,
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
    db.workSchedule.findMany({ where: { staffId, workDate: { in: dates }, status: { not: "REJECTED" } }, select: { workDate: true, startMin: true, endMin: true, isExtra: true } }),
    db.leaveRequest.findMany({ where: { userId: staffId, status: "APPROVED" } }),
    db.shiftTemplate.findMany({ select: { code: true, name: true } }),
  ]);
  const busyFor = (r: WorkSchedule) => busy.some((b) => ymdOf(b.workDate) === ymdOf(r.workDate) && clashes(r, b));
  const onLeave = (d: Date) => leaves.some((l) => l.date <= d && (l.toDate ?? l.date) >= d);
  const names = new Map(templates.map((t) => [t.code, t.name]));
  const now = Date.now();
  // Ca bổ sung nhiều chỗ: gộp thành 1 dòng (chỗ trống đầu tiên) kèm số chỗ còn lại
  const left = new Map<string, number>();
  for (const r of rows) if (r.extraGroup) left.set(r.extraGroup, (left.get(r.extraGroup) ?? 0) + 1);
  const seen = new Set<string>();
  return rows
    .filter((r) => {
      if (!r.extraGroup) return true;
      if (seen.has(r.extraGroup)) return false;
      seen.add(r.extraGroup);
      return true;
    })
    .filter((r) => shiftStart(r).getTime() > now && !busyFor(r) && !onLeave(r.workDate))
    .map((r) => ({
      id: r.id, workDate: r.workDate, shiftCode: r.shiftCode, shiftName: r.isExtra ? EXTRA_SHIFT_NAME : names.get(r.shiftCode) ?? `Ca ${r.shiftCode}`,
      startMin: r.startMin, endMin: r.endMin, role: r.role, managerNote: r.managerNote, isExtra: r.isExtra,
      slotsLeft: r.extraGroup ? left.get(r.extraGroup) ?? 1 : 1,
    }));
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
  // Ca bổ sung nhiều chỗ: chỗ vừa bấm đã có người → nhận chỗ trống khác của nhóm
  if (ws.extraGroup && (ws.status !== "OPEN_SHIFT" || ws.staffId != null)) {
    const other = (await openSlotsOf(db, ws.extraGroup))[0];
    if (!other) return { ok: false, error: "Ca bổ sung này đã đủ người." };
    return claimOpenShift(staffId, other.id);
  }
  if (ws.status !== "OPEN_SHIFT" || ws.staffId != null) return { ok: false, error: "Ca này đã có người nhận." };
  if (ws.role && ws.role !== me.role) return { ok: false, error: "Ca này dành cho vị trí khác." };
  if (shiftStart(ws).getTime() <= Date.now()) return { ok: false, error: "Ca đã bắt đầu, không nhận được nữa." };
  const [busy, leave] = await Promise.all([
    db.workSchedule.findMany({ where: { staffId, workDate: ws.workDate, status: { not: "REJECTED" } }, select: { startMin: true, endMin: true, isExtra: true } }),
    db.leaveRequest.findFirst({ where: { userId: staffId, ...onLeaveWhere(ws.workDate) }, select: { id: true } }),
  ]);
  if (busy.some((b) => clashes(ws, b))) return { ok: false, error: ws.isExtra ? "Bạn đã có ca trùng giờ với ca bổ sung này." : "Bạn đã có ca trong ngày này." };
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
  if (!won) {
    if (ws.extraGroup && (await openSlotsOf(db, ws.extraGroup)).length) return claimOpenShift(staffId, wsId);
    return { ok: false, error: ws.extraGroup ? "Ca bổ sung này vừa đủ người." : "Ca này vừa có người khác nhận trước." };
  }

  // Cùng một người bấm nhận 2 ca khác nhau của cùng ngày gần như cùng lúc → trả lại ca này
  const sameDay = await db.workSchedule.findMany({ where: { staffId, workDate: ws.workDate, status: { not: "REJECTED" }, id: { not: wsId } }, select: { startMin: true, endMin: true, isExtra: true } });
  if (sameDay.some((b) => clashes(ws, b))) {
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
      const leadOf = new Map<string, number>();
      for (const r of rows) if (r.extraGroup && (!leadOf.has(r.extraGroup) || r.id < leadOf.get(r.extraGroup)!)) leadOf.set(r.extraGroup, r.id);
      for (const ws of rows) {
        if (ws.extraGroup && leadOf.get(ws.extraGroup) !== ws.id && shiftStart(ws).getTime() > Date.now()) continue;
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
