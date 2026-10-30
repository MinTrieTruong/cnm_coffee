import { Router, type Request, type Response } from "express";
import type { Popup, Prisma, PrismaClient } from "@prisma/client";
import { audit } from "../lib/audit.js";
import { sanitizeHtml } from "../lib/sanitizeHtml.js";
import { reqStoreId } from "../lib/storeScope.js";
import { POPUP_TARGETS, describeTarget, isTargetType, refOptions, targetAlive, targetMeta, validateTarget, type PopupTargetType } from "../lib/popupTargets.js";
import { optionalCustomerAuth } from "../middleware/customer.js";
import { attachStaff, isOwner, requireRoles, type StaffRequest } from "../middleware/staff.js";

/** Tối đa số pop up cùng hiệu lực trên một chi nhánh */
export const MAX_ACTIVE_POPUPS = 3;
const AUDIENCES = ["ALL", "LOGGED_IN", "NEW"] as const;
const FREQUENCIES = ["EVERY_VISIT", "DAILY", "ONCE"] as const;

class PopupError extends Error {}

type PopupInput = {
  name?: string;
  description?: string | null;
  imageUrl?: string;
  targetType?: string;
  targetRef?: string | number | null;
  buttonText?: string;
  sortOrder?: number;
  isActive?: boolean;
  startAt?: string | null;
  endAt?: string | null;
  allStores?: boolean;
  storeIds?: number[];
  audience?: string;
  frequency?: string;
};

type WithStores = Popup & { stores: { storeId: number }[] };

const idOf = (req: Request) => Number(req.params.id);

export function popupsRouter(prisma: PrismaClient) {
  const r = Router();
  const manager = [attachStaff(prisma), requireRoles("Admin")];

  const handle = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof PopupError) return res.status(400).json({ error: e.message });
      throw e;
    }
  };

  /* ═══════════ Phạm vi quyền ═══════════ */

  function visibleWhere(req: Request): Prisma.PopupWhereInput {
    const staff = (req as StaffRequest).staffRow!;
    const sid = reqStoreId(req);
    if (isOwner(staff.role) && sid == null) return {};
    return { OR: [{ allStores: true }, { stores: { some: { storeId: sid! } } }] };
  }

  /** Chủ chuỗi sửa mọi pop up; quản lý chi nhánh chỉ sửa pop up riêng của chi nhánh mình */
  function canEdit(req: Request, p: { allStores: boolean; stores: { storeId: number }[] }) {
    const staff = (req as StaffRequest).staffRow!;
    if (isOwner(staff.role)) return true;
    return !p.allStores && p.stores.length === 1 && p.stores[0].storeId === staff.storeId;
  }

  /* ═══════════ Giới hạn 3 pop up cùng hiệu lực ═══════════ */

  /** Còn hiệu lực (đang bật, chưa hết hạn) */
  const live = (p: { isActive: boolean; endAt: Date | null }, now: Date) => p.isActive && (!p.endAt || p.endAt > now);
  const covers = (p: { allStores: boolean; stores: { storeId: number }[] }, storeId: number) => p.allStores || p.stores.some((s) => s.storeId === storeId);

  /**
   * Với danh sách pop up sau khi thay đổi, kiểm tra không chi nhánh nào có quá 3 pop up hiệu lực cùng một thời điểm
   * (xét chồng lấn thời gian chạy). Trả về thông báo lỗi hoặc null.
   */
  async function limitError(all: WithStores[]): Promise<string | null> {
    const now = new Date();
    const stores = await prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true } });
    const active = all.filter((p) => live(p, now));
    for (const s of stores) {
      const list = active.filter((p) => covers(p, s.id));
      if (list.length <= MAX_ACTIVE_POPUPS) continue;
      // Quét các mốc thời gian: số pop up cùng chạy lớn nhất
      const events = list.flatMap((p) => [
        { t: Math.max(p.startAt?.getTime() ?? -Infinity, now.getTime()), d: 1 },
        { t: p.endAt?.getTime() ?? Infinity, d: -1 },
      ]).sort((a, b) => a.t - b.t || a.d - b.d);
      let cur = 0;
      for (const e of events) {
        cur += e.d;
        if (cur > MAX_ACTIVE_POPUPS) {
          return `Chỉ được bật tối đa ${MAX_ACTIVE_POPUPS} pop up cùng lúc tại ${s.name}. Hãy tắt bớt pop up khác hoặc đổi thời gian chạy.`;
        }
      }
    }
    return null;
  }

  const allPopups = () => prisma.popup.findMany({ include: { stores: true } });

  /* ═══════════ Kiểm tra dữ liệu ═══════════ */

  async function parse(req: Request, body: PopupInput) {
    const errors: Record<string, string> = {};
    const name = body.name?.trim();
    if (!name) errors.name = "Nhập tên pop up.";
    const imageUrl = body.imageUrl?.trim();
    if (!imageUrl) errors.imageUrl = "Tải ảnh pop up.";
    let target: { type: PopupTargetType; ref: string | null } | null = null;
    try {
      target = await validateTarget(prisma, body.targetType, body.targetRef);
    } catch (e) {
      errors.target = e instanceof Error ? e.message : "Đích không hợp lệ.";
    }
    const startAt = body.startAt ? new Date(body.startAt) : null;
    const endAt = body.endAt ? new Date(body.endAt) : null;
    if ((startAt && Number.isNaN(startAt.getTime())) || (endAt && Number.isNaN(endAt.getTime()))) errors.time = "Thời gian không hợp lệ.";
    else if (startAt && endAt && endAt <= startAt) errors.time = "Thời gian kết thúc phải sau thời gian bắt đầu.";
    const sortOrder = body.sortOrder == null || (body.sortOrder as unknown) === "" ? 0 : Number(body.sortOrder);
    if (!Number.isInteger(sortOrder)) errors.sortOrder = "Thứ tự hiển thị phải là số nguyên.";
    const audience = AUDIENCES.includes(body.audience as never) ? (body.audience as string) : "ALL";
    const frequency = FREQUENCIES.includes(body.frequency as never) ? (body.frequency as string) : "DAILY";

    const staff = (req as StaffRequest).staffRow!;
    let allStores = body.allStores !== false;
    let storeIds = [...new Set((body.storeIds ?? []).map(Number).filter(Number.isInteger))];
    if (!isOwner(staff.role)) {
      allStores = false;
      storeIds = [staff.storeId!];
    } else if (!allStores && !storeIds.length) errors.stores = "Chọn ít nhất 1 chi nhánh.";

    if (Object.keys(errors).length) {
      const err = new PopupError(Object.values(errors)[0]);
      (err as PopupError & { fields?: Record<string, string> }).fields = errors;
      throw err;
    }
    return {
      data: {
        name: name!.slice(0, 150), description: sanitizeHtml(body.description), imageUrl: imageUrl!.slice(0, 1024),
        targetType: target!.type, targetRef: target!.ref, buttonText: body.buttonText?.trim().slice(0, 50) || "Xem ngay",
        sortOrder, isActive: !!body.isActive, startAt, endAt, allStores, audience, frequency,
      },
      storeIds: allStores ? [] : storeIds,
    };
  }

  /** Lỗi có danh sách lỗi từng ô → trả kèm `fields` để form hiện dưới từng ô */
  const fieldHandle = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof PopupError) return res.status(400).json({ error: e.message, fields: (e as PopupError & { fields?: unknown }).fields });
      throw e;
    }
  };

  const withLabels = async (rows: WithStores[], req: Request) =>
    Promise.all(rows.map(async (p) => ({
      ...p,
      targetLabel: await describeTarget(prisma, p.targetType, p.targetRef),
      href: isTargetType(p.targetType) ? POPUP_TARGETS[p.targetType].href(p.targetRef) : null,
      editable: canEdit(req, p),
    })));

  /* ═══════════════════════ QUẢN TRỊ ═══════════════════════ */

  r.get("/admin/popups/meta", ...manager, async (_req, res) => {
    const stores = await prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { id: "asc" } });
    res.json({ targets: targetMeta(), maxActive: MAX_ACTIVE_POPUPS, stores });
  });

  r.get("/admin/popups/ref-options", ...manager, handle(async (req, res) => {
    const type = req.query.type;
    if (!isTargetType(type)) throw new PopupError("Loại đích không hợp lệ.");
    const kind = POPUP_TARGETS[type].ref;
    res.json(kind ? await refOptions(prisma, kind, String(req.query.q ?? "")) : []);
  }));

  r.get("/admin/popups", ...manager, async (req, res) => {
    const rows = await prisma.popup.findMany({
      where: visibleWhere(req),
      include: { stores: { include: { store: { select: { id: true, name: true } } } } },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    res.json(await withLabels(rows, req));
  });

  r.get("/admin/popups/:id", ...manager, async (req, res) => {
    const p = await prisma.popup.findFirst({ where: { id: idOf(req), ...visibleWhere(req) }, include: { stores: { include: { store: { select: { id: true, name: true } } } } } });
    if (!p) return res.status(404).json({ error: "Không tìm thấy pop up." });
    res.json((await withLabels([p], req))[0]);
  });

  r.post("/admin/popups", ...manager, fieldHandle(async (req, res) => {
    const { data, storeIds } = await parse(req, req.body as PopupInput);
    const staff = (req as StaffRequest).staffRow!;
    if (data.isActive) {
      const msg = await limitError([...(await allPopups()), { ...data, id: 0, viewCount: 0, clickCount: 0, createdById: null, createdAt: new Date(), updatedAt: new Date(), stores: storeIds.map((storeId) => ({ storeId })) } as WithStores]);
      if (msg) throw new PopupError(msg);
    }
    const p = await prisma.popup.create({ data: { ...data, createdById: staff.id, stores: { create: storeIds.map((storeId) => ({ storeId })) } } });
    audit(staff.id, "POPUP_CREATE", `Pop up #${p.id}`, `${p.name} — ${p.isActive ? "Bật" : "Tắt"}`);
    res.status(201).json(p);
  }));

  r.put("/admin/popups/:id", ...manager, fieldHandle(async (req, res) => {
    const id = idOf(req);
    const old = await prisma.popup.findUnique({ where: { id }, include: { stores: true } });
    if (!old) return res.status(404).json({ error: "Không tìm thấy pop up." });
    if (!canEdit(req, old)) return res.status(403).json({ error: "Pop up cả chuỗi do Chủ chuỗi quản lý." });
    const { data, storeIds } = await parse(req, req.body as PopupInput);
    if (data.isActive) {
      const others = (await allPopups()).filter((p) => p.id !== id);
      const msg = await limitError([...others, { ...old, ...data, stores: storeIds.map((storeId) => ({ storeId })) }]);
      if (msg) throw new PopupError(msg);
    }
    await prisma.popup.update({ where: { id }, data: { ...data, stores: { deleteMany: {}, create: storeIds.map((storeId) => ({ storeId })) } } });
    const staff = (req as StaffRequest).staffRow!;
    const toggled = old.isActive !== data.isActive ? ` · ${data.isActive ? "Bật" : "Tắt"}` : "";
    audit(staff.id, toggled ? "POPUP_TOGGLE" : "POPUP_UPDATE", `Pop up #${id}`, `${data.name}${toggled}`);
    res.json({ ok: true });
  }));

  r.delete("/admin/popups/:id", ...manager, handle(async (req, res) => {
    const id = idOf(req);
    const p = await prisma.popup.findUnique({ where: { id }, include: { stores: true } });
    if (!p) return res.status(404).json({ error: "Không tìm thấy pop up." });
    if (!canEdit(req, p)) return res.status(403).json({ error: "Pop up cả chuỗi do Chủ chuỗi quản lý." });
    await prisma.popup.delete({ where: { id } });
    audit((req as StaffRequest).staffRow!.id, "POPUP_DELETE", `Pop up #${id}`, p.name);
    res.json({ ok: true });
  }));

  /** Nút "Lưu" ở trang danh sách: thứ tự + trạng thái sửa trực tiếp */
  r.patch("/admin/popups", ...manager, handle(async (req, res) => {
    const items = (req.body as { items?: { id: number; sortOrder?: number; isActive?: boolean }[] }).items ?? [];
    const all = await allPopups();
    const changes: { p: WithStores; sortOrder: number; isActive: boolean }[] = [];
    for (const it of items) {
      const p = all.find((x) => x.id === Number(it.id));
      if (!p) continue;
      const sortOrder = it.sortOrder == null ? p.sortOrder : Number(it.sortOrder);
      const isActive = it.isActive == null ? p.isActive : !!it.isActive;
      if (!Number.isInteger(sortOrder)) throw new PopupError(`"${p.name}": thứ tự phải là số nguyên.`);
      if (sortOrder === p.sortOrder && isActive === p.isActive) continue;
      if (!canEdit(req, p)) throw new PopupError(`"${p.name}" là pop up cả chuỗi do Chủ chuỗi quản lý.`);
      changes.push({ p, sortOrder, isActive });
    }
    const after = all.map((p) => {
      const c = changes.find((x) => x.p.id === p.id);
      return c ? { ...p, sortOrder: c.sortOrder, isActive: c.isActive } : p;
    });
    if (changes.some((c) => c.isActive && !c.p.isActive)) {
      const msg = await limitError(after);
      if (msg) throw new PopupError(msg);
    }
    await prisma.$transaction(changes.map((c) => prisma.popup.update({ where: { id: c.p.id }, data: { sortOrder: c.sortOrder, isActive: c.isActive } })));
    const staff = (req as StaffRequest).staffRow!;
    for (const c of changes) {
      if (c.isActive !== c.p.isActive) audit(staff.id, "POPUP_TOGGLE", `Pop up #${c.p.id}`, `${c.p.name} · ${c.isActive ? "Bật" : "Tắt"}`);
    }
    if (changes.some((c) => c.sortOrder !== c.p.sortOrder)) {
      audit(staff.id, "POPUP_REORDER", "Pop up", changes.filter((c) => c.sortOrder !== c.p.sortOrder).map((c) => `${c.p.name}: ${c.p.sortOrder} → ${c.sortOrder}`).join("; ").slice(0, 500));
    }
    res.json({ ok: true, changed: changes.length });
  }));

  /* ═══════════════════════ KHÁCH ═══════════════════════ */

  /** Tối đa 3 pop up đang chạy cho chi nhánh khách đang chọn + đúng đối tượng; đích đã hết hạn / tắt thì loại */
  r.get("/popups/active", optionalCustomerAuth, async (req, res) => {
    const now = new Date();
    const raw = req.query.storeId ?? req.query.store;
    const storeId = raw != null && /^\d+$/.test(String(raw)) ? Number(raw) : null;
    const customerId = (req as Request & { customerId?: number }).customerId ?? null;
    const isNew = customerId ? !(await prisma.order.findFirst({ where: { customerId, status: "Paid" }, select: { id: true } })) : true;

    const rows = await prisma.popup.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
          storeId ? { OR: [{ allStores: true }, { stores: { some: { storeId } } }] } : { allStores: true },
        ],
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    const out = [];
    for (const p of rows) {
      if (p.audience === "LOGGED_IN" && !customerId) continue;
      if (p.audience === "NEW" && !isNew) continue;
      if (!isTargetType(p.targetType) || !(await targetAlive(prisma, p.targetType, p.targetRef, now))) continue;
      const def = POPUP_TARGETS[p.targetType];
      const href = def.href(p.targetRef);
      out.push({
        id: p.id, name: p.name, description: p.description, imageUrl: p.imageUrl, buttonText: p.buttonText,
        frequency: p.frequency, updatedAt: p.updatedAt,
        href, external: /^https:\/\//i.test(href), needsLogin: "needsLogin" in def && def.needsLogin === true,
      });
      if (out.length >= MAX_ACTIVE_POPUPS) break;
    }
    res.json(out);
  });

  r.post("/popups/:id/view", async (req, res) => {
    await prisma.popup.updateMany({ where: { id: idOf(req) }, data: { viewCount: { increment: 1 } } });
    res.json({ ok: true });
  });

  r.post("/popups/:id/click", async (req, res) => {
    await prisma.popup.updateMany({ where: { id: idOf(req) }, data: { clickCount: { increment: 1 } } });
    res.json({ ok: true });
  });

  /** Trang Khuyến mãi mở sẵn 1 voucher (đích VOUCHER): ?voucher=<id> */
  r.get("/popups/voucher/:id", async (req, res) => {
    const now = new Date();
    const v = await prisma.voucher.findUnique({
      where: { id: idOf(req) },
      select: {
        id: true, code: true, description: true, discountValue: true, minBillValue: true, startDate: true, endDate: true,
        quantity: true, usedCount: true, isActive: true, voucherType: true,
      },
    });
    if (!v || !v.isActive || v.endDate < now) return res.status(404).json({ error: "Voucher không còn hiệu lực." });
    res.json(v);
  });

  return r;
}
