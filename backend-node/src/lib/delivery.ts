import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { toStore } from "./storeScope.js";

/**
 * Luồng giao hàng (Order.deliveryStatus):
 *   Awaiting_Confirm  — khách đã đặt (COD hoặc đã trả online), chờ thu ngân xác nhận
 *   Preparing         — thu ngân xác nhận, bếp đang pha chế
 *   Ready             — bếp báo xong, chờ hệ thống tìm shipper
 *   Assigned          — đã gán shipper, shipper đang tới quán lấy hàng
 *   Delivering        — shipper đã lấy hàng, đang giao theo tuyến
 *   Delivered | Failed | Rejected — kết thúc
 */
export const DS = {
  AwaitingConfirm: "Awaiting_Confirm",
  Preparing: "Preparing",
  Ready: "Ready",
  Assigned: "Assigned",
  Delivering: "Delivering",
  Delivered: "Delivered",
  Failed: "Failed",
  Rejected: "Rejected",
} as const;

export const ACTIVE_SHIPPER_STATUSES = [DS.Assigned, DS.Delivering];

/** Số đơn tối đa 1 shipper chở cùng lúc */
export const MAX_ORDERS_PER_SHIPPER = 3;
/** Ghép đơn: điểm giao mới phải cách các điểm giao hiện có của shipper tối đa (km) */
const BATCH_RADIUS_KM = 3;
/** Tốc độ trung bình xe máy trong phố (km/h) & hệ số đường vòng so với đường chim bay */
const AVG_SPEED_KMH = 22;
const ROAD_FACTOR = 1.35;
/** Thời gian dừng giao mỗi điểm (phút) */
const STOP_MINUTES = 3;

export type LatLng = { lat: number; lng: number };

export function haversineKm(a: LatLng, b: LatLng) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function travelMinutes(km: number) {
  return ((km * ROAD_FACTOR) / AVG_SPEED_KMH) * 60;
}

/** Phí ship: ≤ 3km miễn phí, xa hơn 15.000đ + 5.000đ/km */
export function shippingFeeForDistance(km: number) {
  if (km <= 3) return 0;
  return 15000 + Math.ceil(km - 3) * 5000;
}

function pathLength(start: LatLng, stops: LatLng[]) {
  let d = 0;
  let cur = start;
  for (const s of stops) {
    d += haversineKm(cur, s);
    cur = s;
  }
  return d;
}

/**
 * Tối ưu thứ tự giao (bài toán TSP đường mở, không quay về):
 * nearest-neighbour để có lời giải ban đầu rồi cải thiện bằng 2-opt.
 * Với ≤ 7 điểm thì duyệt hoán vị đầy đủ để ra tối ưu tuyệt đối.
 */
export function optimizeRoute<T extends LatLng>(start: LatLng, stops: T[]): T[] {
  if (stops.length <= 1) return [...stops];

  if (stops.length <= 7) {
    let best: T[] = [...stops];
    let bestLen = pathLength(start, best);
    const permute = (arr: T[], k: number) => {
      if (k === arr.length) {
        const len = pathLength(start, arr);
        if (len < bestLen) {
          bestLen = len;
          best = [...arr];
        }
        return;
      }
      for (let i = k; i < arr.length; i++) {
        [arr[k], arr[i]] = [arr[i], arr[k]];
        permute(arr, k + 1);
        [arr[k], arr[i]] = [arr[i], arr[k]];
      }
    };
    permute([...stops], 0);
    return best;
  }

  const remaining = [...stops];
  const route: T[] = [];
  let cur: LatLng = start;
  while (remaining.length) {
    let bi = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (haversineKm(cur, remaining[i]) < haversineKm(cur, remaining[bi])) bi = i;
    }
    cur = remaining[bi];
    route.push(remaining.splice(bi, 1)[0]);
  }
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const candidate = [...route.slice(0, i), ...route.slice(i, j + 1).reverse(), ...route.slice(j + 1)];
        if (pathLength(start, candidate) + 1e-9 < pathLength(start, route)) {
          route.splice(0, route.length, ...candidate);
          improved = true;
        }
      }
    }
  }
  return route;
}

/** Toạ độ chi nhánh — điểm xuất phát của shipper và gốc tính phí ship */
export async function getStoreLocation(prisma: PrismaClient, storeId: number) {
  const s = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
  return { lat: s.lat, lng: s.lng, address: s.address ?? null };
}

export function emitDeliveryChanged(io: Server, storeId: number, orderIds: number[], shipperIds: number[] = []) {
  toStore(io, "pos", storeId).emit("delivery:update", { orderIds });
  for (const id of orderIds) io.to(`tracking:${id}`).emit("delivery:status", { orderId: id });
  for (const sid of shipperIds) io.to(`staff_${sid}`).emit("shipper:refresh", { orderIds });
}

/**
 * Tính lại tuyến cho 1 shipper: các đơn Assigned/Delivering được sắp xếp
 * theo tuyến ngắn nhất. Nếu shipper chưa lấy hàng → xuất phát từ quán,
 * nếu đang giao → xuất phát từ vị trí GPS hiện tại.
 */
export async function recomputeRoute(prisma: PrismaClient, shipperId: number) {
  const [shipper, orders] = await Promise.all([
    prisma.staff.findUnique({ where: { id: shipperId } }),
    prisma.order.findMany({
      where: { shipperId, deliveryStatus: { in: ACTIVE_SHIPPER_STATUSES } },
      select: { id: true, storeId: true, customerLat: true, customerLng: true, deliveryStatus: true },
    }),
  ]);
  if (!orders.length) return [];
  // Shipper chỉ nhận đơn của chi nhánh mình nên mọi đơn cùng một điểm xuất phát
  const store = await getStoreLocation(prisma, orders[0].storeId);
  const anyAssigned = orders.some((o) => o.deliveryStatus === DS.Assigned);
  const start: LatLng =
    !anyAssigned && shipper?.lastLat != null && shipper.lastLng != null
      ? { lat: shipper.lastLat, lng: shipper.lastLng }
      : store;

  const stops = orders.map((o) => ({
    id: o.id,
    lat: o.customerLat ?? store.lat,
    lng: o.customerLng ?? store.lng,
  }));
  const route = optimizeRoute(start, stops);
  await prisma.$transaction(
    route.map((s, i) => prisma.order.update({ where: { id: s.id }, data: { routeSeq: i + 1 } })),
  );
  return route.map((s) => s.id);
}

/** Ước tính thời gian tới từng điểm (phút, cộng dồn) dọc theo tuyến */
export function etaAlongRoute(start: LatLng, stops: LatLng[], extraStartMinutes = 0) {
  const out: number[] = [];
  let cur = start;
  let t = extraStartMinutes;
  for (const s of stops) {
    t += travelMinutes(haversineKm(cur, s));
    out.push(Math.round(t));
    t += STOP_MINUTES;
    cur = s;
  }
  return out;
}

/**
 * Điều phối: gán các đơn Ready cho shipper phù hợp.
 *  1. Ưu tiên shipper rảnh (không có đơn) — gần quán nhất, hôm nay giao ít hơn.
 *  2. Nếu không còn ai rảnh: ghép đơn cho shipper chưa rời quán (toàn đơn Assigned),
 *     còn chỗ (< MAX_ORDERS_PER_SHIPPER) và các điểm giao gần nhau — chọn người
 *     làm tuyến dài thêm ít nhất.
 *  3. Không ai phù hợp → đơn nằm chờ ở trạng thái Ready, sẽ được gán khi có shipper rảnh.
 */
export async function dispatchReadyOrders(prisma: PrismaClient, io: Server) {
  const ready = await prisma.order.findMany({
    where: { orderType: "Delivery", deliveryStatus: DS.Ready, shipperId: null },
    orderBy: [{ readyAt: "asc" }, { id: "asc" }],
  });
  if (!ready.length) return;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const locations = new Map<number, LatLng>();

  for (const order of ready) {
    let store = locations.get(order.storeId);
    if (!store) {
      store = await getStoreLocation(prisma, order.storeId);
      locations.set(order.storeId, store);
    }
    const shippers = await prisma.staff.findMany({
      where: { role: "Shipper", status: "Active", shipperOnline: true, storeId: order.storeId },
      include: {
        ordersShipped: {
          where: {
            OR: [
              { deliveryStatus: { in: ACTIVE_SHIPPER_STATUSES } },
              { deliveryStatus: DS.Delivered, deliveredAt: { gte: startOfDay } },
            ],
          },
          select: { id: true, deliveryStatus: true, customerLat: true, customerLng: true },
        },
      },
    });
    if (!shippers.length) continue;

    const dest: LatLng = { lat: order.customerLat ?? store.lat, lng: order.customerLng ?? store.lng };
    const withLoad = shippers.map((s) => {
      const active = s.ordersShipped.filter((o) => ACTIVE_SHIPPER_STATUSES.includes(o.deliveryStatus as never));
      const doneToday = s.ordersShipped.length - active.length;
      const distToStore =
        s.lastLat != null && s.lastLng != null ? haversineKm({ lat: s.lastLat, lng: s.lastLng }, store) : 50;
      return { s, active, doneToday, distToStore };
    });

    let chosen: (typeof withLoad)[number] | undefined;

    const free = withLoad.filter((x) => x.active.length === 0);
    if (free.length) {
      free.sort((a, b) => a.distToStore - b.distToStore || a.doneToday - b.doneToday);
      chosen = free[0];
    } else {
      let bestExtra = Infinity;
      for (const x of withLoad) {
        if (x.active.length >= MAX_ORDERS_PER_SHIPPER) continue;
        if (x.active.some((o) => o.deliveryStatus !== DS.Assigned)) continue; // đã rời quán
        const stops = x.active.map((o) => ({ lat: o.customerLat ?? store.lat, lng: o.customerLng ?? store.lng }));
        if (stops.some((p) => haversineKm(p, dest) > BATCH_RADIUS_KM)) continue;
        const before = pathLength(store, optimizeRoute(store, stops));
        const after = pathLength(store, optimizeRoute(store, [...stops, dest]));
        const extra = after - before;
        if (extra < bestExtra) {
          bestExtra = extra;
          chosen = x;
        }
      }
    }
    if (!chosen) continue;

    const res = await prisma.order.updateMany({
      where: { id: order.id, deliveryStatus: DS.Ready, shipperId: null },
      data: { shipperId: chosen.s.id, deliveryStatus: DS.Assigned, assignedAt: new Date() },
    });
    if (res.count === 0) continue;
    await recomputeRoute(prisma, chosen.s.id);
    io.to(`staff_${chosen.s.id}`).emit("shipper:new_order", { orderId: order.id });
    emitDeliveryChanged(io, order.storeId, [order.id], [chosen.s.id]);
  }
}

/**
 * Gọi sau khi đơn đã thanh toán (online) hoặc mọi trường hợp cần đẩy món xuống bếp.
 * - Đơn giao hàng: KHÔNG đẩy bếp ngay — chuyển sang chờ thu ngân xác nhận.
 * - Đơn khác: đẩy món Hold → Waiting như cũ.
 */
export async function releaseOrderToKitchen(prisma: PrismaClient, io: Server, orderId: number) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;
  if (order.orderType === "Delivery") {
    if (!order.deliveryStatus) {
      await prisma.order.update({ where: { id: orderId }, data: { deliveryStatus: DS.AwaitingConfirm } });
      toStore(io, "pos", order.storeId).emit("delivery:new", { orderId });
      emitDeliveryChanged(io, order.storeId, [orderId]);
    }
    return;
  }
  await pushHoldToKitchen(prisma, io, orderId);
}

export async function pushHoldToKitchen(prisma: PrismaClient, io: Server, orderId: number) {
  const hold = await prisma.orderDetail.count({ where: { orderId, kdsStatus: "Hold" } });
  if (hold === 0) return;
  const { storeId } = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { storeId: true } });
  await prisma.orderDetail.updateMany({ where: { orderId, kdsStatus: "Hold" }, data: { kdsStatus: "Waiting" } });
  const kdsDetails = await prisma.orderDetail.findMany({
    where: { orderId },
    include: { product: true, order: { include: { table: true } } },
  });
  toStore(io, "kds", storeId).emit("order:new", { orderId, details: kdsDetails });
}

/** Bếp cập nhật món: nếu là đơn giao và mọi món đã xong → Ready → điều phối shipper */
export async function onKitchenProgress(prisma: PrismaClient, io: Server, orderId: number) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { details: true } });
  if (!order || order.orderType !== "Delivery" || order.deliveryStatus !== DS.Preparing) return;
  const done = order.details.every((d) => ["Ready", "Served", "Cancelled"].includes(d.kdsStatus));
  if (!done) return;
  await prisma.order.update({ where: { id: orderId }, data: { deliveryStatus: DS.Ready, readyAt: new Date() } });
  emitDeliveryChanged(io, order.storeId, [orderId]);
  await dispatchReadyOrders(prisma, io);
}

/** Worker an toàn: định kỳ thử gán lại đơn đang chờ shipper */
export function startDispatchWorker(prisma: PrismaClient, io: Server) {
  setInterval(() => {
    dispatchReadyOrders(prisma, io).catch((e) => console.error("[dispatch]", e));
  }, 15_000);
}
