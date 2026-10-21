import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { attachStaff, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { inStore, mustStoreId, storeWhere, toStore } from "../lib/storeScope.js";
import { saveDataUrlImage } from "../lib/uploadImage.js";
import {
  ACTIVE_SHIPPER_STATUSES,
  DS,
  dispatchReadyOrders,
  emitDeliveryChanged,
  etaAlongRoute,
  getStoreLocation,
  haversineKm,
  pushHoldToKitchen,
  recomputeRoute,
  shipperShippingIncome,
  travelMinutes,
} from "../lib/delivery.js";

const orderInclude = {
  customer: { select: { id: true, fullName: true, phone: true } },
  shipper: { select: { id: true, fullName: true, phone: true, lastLat: true, lastLng: true, lastLocationAt: true } },
  details: { include: { product: { select: { id: true, name: true, imageUrl: true } } } },
  payments: { select: { method: true, amount: true } },
} as const;

export function deliveryRouter(prisma: PrismaClient, io: Server) {
  const r = Router();
  const auth = attachStaff(prisma);
  const cashier = [auth, requireRoles("Cashier", "Admin")];
  const shipperOnly = [auth, requireRoles("Shipper", "Admin"), requireStore];

  /* ═══════════════════════ THU NGÂN ═══════════════════════ */

  /** Bảng điều phối: đơn giao đang xử lý + trạng thái shipper */
  r.get("/delivery/board", ...cashier, async (req, res) => {
    const since = new Date(Date.now() - 12 * 3600_000);
    const [orders, shippers] = await Promise.all([
      prisma.order.findMany({
        where: {
          ...storeWhere(req),
          orderType: "Delivery",
          OR: [
            { deliveryStatus: { in: [DS.AwaitingConfirm, DS.Preparing, DS.Ready, DS.Assigned, DS.Delivering] } },
            { deliveryStatus: { in: [DS.Delivered, DS.Failed] }, createdAt: { gte: since } },
          ],
        },
        include: orderInclude,
        orderBy: { id: "desc" },
      }),
      prisma.staff.findMany({
        where: { ...storeWhere(req), role: "Shipper", status: "Active" },
        select: {
          id: true, fullName: true, phone: true, shipperOnline: true, lastLat: true, lastLng: true, lastLocationAt: true,
          ordersShipped: { where: { deliveryStatus: { in: ACTIVE_SHIPPER_STATUSES } }, select: { id: true } },
        },
      }),
    ]);
    res.json({
      orders,
      shippers: shippers.map(({ ordersShipped, ...s }) => ({ ...s, activeOrders: ordersShipped.length })),
    });
  });

  /** Thu ngân xác nhận đơn → đẩy xuống bếp */
  r.post("/delivery/:id/confirm", ...cashier, async (req, res) => {
    const id = Number(req.params.id);
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order || !inStore(req, order) || order.orderType !== "Delivery") return res.status(404).json({ error: "Không tìm thấy đơn giao hàng" });
    if (order.deliveryStatus !== DS.AwaitingConfirm) return res.status(400).json({ error: "Đơn không ở trạng thái chờ xác nhận" });
    if (order.status !== "Paid") return res.status(400).json({ error: "Đơn giao hàng chưa thanh toán — không thể nhận đơn" });
    await prisma.order.update({
      where: { id },
      data: { deliveryStatus: DS.Preparing, confirmedAt: new Date(), staffId: (req as StaffRequest).staffRow!.id },
    });
    await pushHoldToKitchen(prisma, io, id);
    emitDeliveryChanged(io, order.storeId, [id]);
    res.json({ ok: true });
  });

  /** Thu ngân từ chối đơn (hết món, ngoài vùng giao…) */
  r.post("/delivery/:id/reject", ...cashier, async (req, res) => {
    const id = Number(req.params.id);
    const reason = String((req.body as { reason?: string })?.reason ?? "").trim() || "Quán không thể nhận đơn";
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order || !inStore(req, order) || order.orderType !== "Delivery") return res.status(404).json({ error: "Không tìm thấy đơn giao hàng" });
    if (order.deliveryStatus !== DS.AwaitingConfirm) return res.status(400).json({ error: "Chỉ từ chối được đơn đang chờ xác nhận" });
    await prisma.order.update({
      where: { id },
      data: {
        deliveryStatus: DS.Rejected,
        deliveryNote: reason,
        // Đơn đã trả online giữ status Paid để kế toán hoàn tiền
        ...(order.status === "Paid" ? {} : { status: "Cancelled", cancelReason: reason }),
      },
    });
    emitDeliveryChanged(io, order.storeId, [id]);
    res.json({ ok: true });
  });

  /** Gán / đổi shipper thủ công */
  r.post("/delivery/:id/assign", ...cashier, async (req, res) => {
    const id = Number(req.params.id);
    const shipperId = Number((req.body as { shipperId?: number })?.shipperId);
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order || !inStore(req, order) || order.orderType !== "Delivery") return res.status(404).json({ error: "Không tìm thấy đơn giao hàng" });
    if (![DS.Ready, DS.Assigned].includes(order.deliveryStatus as never)) {
      return res.status(400).json({ error: "Chỉ gán được đơn đã pha xong và chưa lấy hàng" });
    }
    const shipper = await prisma.staff.findFirst({ where: { id: shipperId, role: "Shipper", status: "Active", storeId: order.storeId } });
    if (!shipper) return res.status(404).json({ error: "Shipper không tồn tại" });
    const prev = order.shipperId;
    await prisma.order.update({
      where: { id },
      data: { shipperId, deliveryStatus: DS.Assigned, assignedAt: new Date() },
    });
    await recomputeRoute(prisma, shipperId);
    if (prev && prev !== shipperId) await recomputeRoute(prisma, prev);
    io.to(`staff_${shipperId}`).emit("shipper:new_order", { orderId: id });
    emitDeliveryChanged(io, order.storeId, [id], prev && prev !== shipperId ? [shipperId, prev] : [shipperId]);
    res.json({ ok: true });
  });

  /* ═══════════════════════ SHIPPER ═══════════════════════ */

  /** Màn hình chính shipper: trạng thái online, đơn theo tuyến, thống kê hôm nay */
  r.get("/shipper/me", ...shipperOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [store, active, history] = await Promise.all([
      getStoreLocation(prisma, mustStoreId(req)),
      prisma.order.findMany({
        where: { shipperId: me.id, deliveryStatus: { in: ACTIVE_SHIPPER_STATUSES } },
        include: orderInclude,
        orderBy: [{ routeSeq: "asc" }, { id: "asc" }],
      }),
      prisma.order.findMany({
        where: { shipperId: me.id, deliveryStatus: { in: [DS.Delivered, DS.Failed] }, assignedAt: { gte: startOfDay } },
        include: orderInclude,
        orderBy: { deliveredAt: "desc" },
      }),
    ]);

    // ETA dọc tuyến: nếu còn đơn chưa lấy → tính từ quán, ngược lại từ vị trí hiện tại
    const anyAssigned = active.some((o) => o.deliveryStatus === DS.Assigned);
    const here = me.lastLat != null && me.lastLng != null ? { lat: me.lastLat, lng: me.lastLng } : store;
    const start = anyAssigned ? store : here;
    const toStoreMin = anyAssigned ? travelMinutes(haversineKm(here, store)) + 2 : 0;
    const etas = etaAlongRoute(
      start,
      active.map((o) => ({ lat: o.customerLat ?? store.lat, lng: o.customerLng ?? store.lng })),
      toStoreMin,
    );

    const delivered = history.filter((o) => o.deliveryStatus === DS.Delivered);
    const monthStart = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);
    const nextMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth() + 1, 1);
    const month = await shipperShippingIncome(prisma, me.id, monthStart, nextMonth);
    res.json({
      me: { id: me.id, fullName: me.fullName, phone: me.phone, online: me.shipperOnline, lastLat: me.lastLat, lastLng: me.lastLng },
      store,
      orders: active.map((o, i) => ({ ...o, etaMinutes: etas[i] })),
      history,
      stats: {
        deliveredToday: delivered.length,
        failedToday: history.length - delivered.length,
        shippingFeeToday: delivered.reduce((s, o) => s + o.shippingFee, 0),
        // Phí ship tháng này — được cộng vào phiếu lương cuối tháng
        shippingFeeMonth: month.amount,
      },
    });
  });

  /** Bật / tắt nhận đơn */
  r.post("/shipper/online", ...shipperOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const online = Boolean((req.body as { online?: boolean })?.online);
    if (!online) {
      const busy = await prisma.order.count({ where: { shipperId: me.id, deliveryStatus: { in: ACTIVE_SHIPPER_STATUSES } } });
      if (busy > 0) return res.status(400).json({ error: "Hoàn tất các đơn đang giao trước khi tạm nghỉ" });
    }
    await prisma.staff.update({ where: { id: me.id }, data: { shipperOnline: online } });
    toStore(io, "pos", mustStoreId(req)).emit("delivery:update", { shipperId: me.id });
    if (online) await dispatchReadyOrders(prisma, io);
    res.json({ ok: true, online });
  });

  /** Cập nhật GPS — phát tới khách đang theo dõi các đơn của shipper */
  r.post("/shipper/location", ...shipperOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const { lat, lng, heading } = req.body as { lat?: number; lng?: number; heading?: number | null };
    if (typeof lat !== "number" || typeof lng !== "number" || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ error: "Tọa độ không hợp lệ" });
    }
    const now = new Date();
    await prisma.staff.update({ where: { id: me.id }, data: { lastLat: lat, lastLng: lng, lastLocationAt: now } });
    const active = await prisma.order.findMany({
      where: { shipperId: me.id, deliveryStatus: { in: ACTIVE_SHIPPER_STATUSES } },
      select: { id: true },
    });
    const payload = { shipperId: me.id, lat, lng, heading: heading ?? null, at: now.toISOString() };
    for (const o of active) io.to(`tracking:${o.id}`).emit("delivery:location", { orderId: o.id, ...payload });
    toStore(io, "pos", mustStoreId(req)).emit("shipper:location", payload);
    res.json({ ok: true });
  });

  /** Đã lấy hàng tại quán → bắt đầu giao (mặc định lấy tất cả đơn đang chờ lấy) */
  r.post("/shipper/pickup", ...shipperOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const ids = (req.body as { orderIds?: number[] })?.orderIds;
    const where = {
      shipperId: me.id,
      deliveryStatus: DS.Assigned,
      ...(Array.isArray(ids) && ids.length ? { id: { in: ids.map(Number) } } : {}),
    };
    const orders = await prisma.order.findMany({ where, select: { id: true } });
    if (!orders.length) return res.status(400).json({ error: "Không có đơn nào chờ lấy" });
    const orderIds = orders.map((o) => o.id);
    await prisma.$transaction([
      prisma.order.updateMany({ where: { id: { in: orderIds } }, data: { deliveryStatus: DS.Delivering, pickedUpAt: new Date() } }),
      // Món đã rời quán — không còn hiện ở màn hình phục vụ
      prisma.orderDetail.updateMany({ where: { orderId: { in: orderIds }, kdsStatus: "Ready" }, data: { kdsStatus: "Served" } }),
    ]);
    await recomputeRoute(prisma, me.id);
    emitDeliveryChanged(io, mustStoreId(req), orderIds, [me.id]);
    res.json({ ok: true, orderIds });
  });

  /** Giao thành công — bắt buộc có ảnh xác nhận. Đơn đã thanh toán online trước nên shipper không thu tiền. */
  r.post("/shipper/orders/:id/deliver", ...shipperOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    const { photo, note } = req.body as { photo?: string; note?: string };
    const order = await prisma.order.findUnique({ where: { id }, include: { customer: true } });
    if (!order || !inStore(req, order) || (order.shipperId !== me.id && me.role === "Shipper")) return res.status(404).json({ error: "Không tìm thấy đơn" });
    if (order.deliveryStatus !== DS.Delivering) return res.status(400).json({ error: "Đơn chưa ở trạng thái đang giao" });
    if (!photo) return res.status(400).json({ error: "Cần chụp ảnh xác nhận đã giao" });
    if (order.status !== "Paid") return res.status(400).json({ error: "Đơn chưa thanh toán — liên hệ thu ngân trước khi giao" });

    let proofUrl: string;
    try {
      proofUrl = await saveDataUrlImage(photo);
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : "Ảnh không hợp lệ" });
    }

    // Phí ship của đơn được tính vào thu nhập shipper khi giao thành công (cộng vào lương cuối tháng)
    await prisma.order.update({
      where: { id },
      data: {
        deliveryStatus: DS.Delivered,
        deliveredAt: new Date(),
        deliveryProofUrl: proofUrl,
        deliveryNote: note?.trim() || null,
        routeSeq: null,
      },
    });

    await recomputeRoute(prisma, me.id);
    emitDeliveryChanged(io, order.storeId, [id], [me.id]);
    await dispatchReadyOrders(prisma, io);
    res.json({ ok: true, proofUrl, shippingFeeEarned: order.shippingFee });
  });

  /** Giao thất bại (không liên lạc được khách, khách từ chối nhận…) */
  r.post("/shipper/orders/:id/fail", ...shipperOnly, async (req, res) => {
    const me = (req as StaffRequest).staffRow!;
    const id = Number(req.params.id);
    const { reason, photo } = req.body as { reason?: string; photo?: string };
    if (!reason?.trim()) return res.status(400).json({ error: "Cần nhập lý do" });
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order || !inStore(req, order) || (order.shipperId !== me.id && me.role === "Shipper")) return res.status(404).json({ error: "Không tìm thấy đơn" });
    if (order.deliveryStatus !== DS.Delivering) return res.status(400).json({ error: "Đơn chưa ở trạng thái đang giao" });
    let proofUrl: string | null = null;
    if (photo) {
      try { proofUrl = await saveDataUrlImage(photo); } catch { /* ảnh tùy chọn */ }
    }
    await prisma.order.update({
      where: { id },
      data: {
        deliveryStatus: DS.Failed,
        deliveryNote: reason.trim(),
        deliveryProofUrl: proofUrl,
        routeSeq: null,
        ...(order.status === "Paid" ? {} : { status: "Cancelled", cancelReason: `Giao thất bại: ${reason.trim()}` }),
      },
    });
    await recomputeRoute(prisma, me.id);
    emitDeliveryChanged(io, order.storeId, [id], [me.id]);
    await dispatchReadyOrders(prisma, io);
    res.json({ ok: true });
  });

  /* ═══════════════════════ KHÁCH HÀNG ═══════════════════════ */

  /** Dữ liệu theo dõi đơn: trạng thái, vị trí shipper, thứ tự điểm giao, ETA */
  r.get("/orders/:id/tracking", async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ" });
    const order = await prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!order || order.orderType !== "Delivery") return res.status(404).json({ error: "Không tìm thấy đơn giao hàng" });
    const store = await getStoreLocation(prisma, order.storeId);
    const dest = { lat: order.customerLat ?? store.lat, lng: order.customerLng ?? store.lng };

    let stopsBefore = 0;
    let etaMinutes: number | null = null;
    const sh = order.shipper;
    if (sh && ACTIVE_SHIPPER_STATUSES.includes(order.deliveryStatus as never)) {
      const route = await prisma.order.findMany({
        where: { shipperId: sh.id, deliveryStatus: { in: ACTIVE_SHIPPER_STATUSES } },
        select: { id: true, customerLat: true, customerLng: true, deliveryStatus: true },
        orderBy: [{ routeSeq: "asc" }, { id: "asc" }],
      });
      const idx = route.findIndex((o) => o.id === id);
      stopsBefore = Math.max(0, idx);
      const here = sh.lastLat != null && sh.lastLng != null ? { lat: sh.lastLat, lng: sh.lastLng } : store;
      const anyAssigned = route.some((o) => o.deliveryStatus === DS.Assigned);
      const start = anyAssigned ? store : here;
      const etas = etaAlongRoute(
        start,
        route.slice(0, idx + 1).map((o) => ({ lat: o.customerLat ?? store.lat, lng: o.customerLng ?? store.lng })),
        anyAssigned ? travelMinutes(haversineKm(here, store)) + 2 : 0,
      );
      etaMinutes = etas[idx] ?? null;
    } else if ([DS.AwaitingConfirm, DS.Preparing, DS.Ready].includes(order.deliveryStatus as never)) {
      // Chưa có shipper: ước tính = pha chế (~10') + tìm tài xế (~3') + quãng đường
      etaMinutes = Math.round((order.deliveryStatus === DS.Ready ? 5 : 13) + travelMinutes(haversineKm(store, dest)));
    }

    res.json({
      id: order.id,
      status: order.status,
      deliveryStatus: order.deliveryStatus,
      deliveryAddress: order.deliveryAddress,
      deliveryNote: order.deliveryNote,
      deliveryProofUrl: order.deliveryProofUrl,
      customer: { lat: order.customerLat, lng: order.customerLng, name: order.customer?.fullName ?? null },
      store,
      shipper: sh
        ? { id: sh.id, fullName: sh.fullName, phone: sh.phone, lat: sh.lastLat, lng: sh.lastLng, at: sh.lastLocationAt }
        : null,
      timeline: {
        createdAt: order.createdAt,
        confirmedAt: order.confirmedAt,
        readyAt: order.readyAt,
        assignedAt: order.assignedAt,
        pickedUpAt: order.pickedUpAt,
        deliveredAt: order.deliveredAt,
      },
      stopsBefore,
      etaMinutes,
      items: order.details.map((d) => ({ id: d.id, name: d.product.name, quantity: d.quantity, unitPrice: d.unitPrice })),
      subTotal: order.subTotal,
      shippingFee: order.shippingFee,
      totalAmount: order.totalAmount,
    });
  });

  return r;
}
