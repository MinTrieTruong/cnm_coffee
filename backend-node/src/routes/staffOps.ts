import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { attachStaff, requireRoles, type StaffRequest } from "../middleware/staff.js";
import { computeBill, getStoreSettings } from "../lib/pricing.js";

export function staffOpsRouter(prisma: PrismaClient, io: Server) {
  const r = Router();
  const auth = attachStaff(prisma);
  const waiterOps = [auth, requireRoles("Waiter", "Admin")];

  r.get("/staff/tables/:id/context", ...waiterOps, async (req, res) => {
    const tableId = Number(req.params.id);
    if (!tableId) return res.status(400).json({ error: "Bàn không hợp lệ." });
    const table = await prisma.cafeTable.findUnique({ where: { id: tableId } });
    if (!table) return res.status(404).json({ error: "Không tìm thấy bàn." });
    const activeOrder = await prisma.order.findFirst({
      where: { tableId, status: "Confirmed", payments: { none: {} } },
      include: {
        customer: { select: { id: true, fullName: true, phone: true, points: true } },
        details: { include: { product: true }, orderBy: { id: "asc" } },
      },
      orderBy: { id: "desc" },
    });
    res.json({ table, activeOrder });
  });

  r.post("/staff/tables/:id/items", ...waiterOps, async (req, res) => {
    const tableId = Number(req.params.id);
    const { productId, quantity, customNotes, customerPhone } = req.body as {
      productId?: number;
      quantity?: number;
      customNotes?: string;
      customerPhone?: string;
    };
    if (!tableId || !productId || typeof quantity !== "number" || quantity <= 0) {
      return res.status(400).json({ error: "Thiếu bàn, món hoặc số lượng." });
    }
    const [table, product] = await Promise.all([
      prisma.cafeTable.findUnique({ where: { id: tableId } }),
      prisma.product.findUnique({ where: { id: productId } }),
    ]);
    if (!table) return res.status(404).json({ error: "Không tìm thấy bàn." });
    if (!product || !product.isActive || product.outOfStock) {
      return res.status(400).json({ error: "Món không còn phục vụ." });
    }
    let customerId: number | null = null;
    if (customerPhone?.trim()) {
      const c = await prisma.customer.findFirst({ where: { phone: customerPhone.trim() } });
      customerId = c?.id ?? null;
    }

    const order = await prisma.$transaction(async (tx) => {
      let active = await tx.order.findFirst({
        where: { tableId, status: "Confirmed", payments: { none: {} } },
        orderBy: { id: "desc" },
      });
      if (!active) {
        const maxOrder = (await tx.order.aggregate({ _max: { id: true } }))._max.id ?? 0;
        active = await tx.order.create({
          data: {
            id: maxOrder + 1,
            tableId,
            customerId,
            staffId: (req as StaffRequest).staffRow!.id,
            orderType: "Dine-in",
            subTotal: 0,
            totalAmount: 0,
            discountAmt: 0,
            vatAmount: 0,
            status: "Confirmed",
            graceEndsAt: null,
          },
        });
      }
      const maxDetail = (await tx.orderDetail.aggregate({ _max: { id: true } }))._max.id ?? 0;
      await tx.orderDetail.create({
        data: {
          id: maxDetail + 1,
          orderId: active.id,
          productId,
          quantity,
          unitPrice: product.sellPrice,
          customNotes: customNotes?.trim() ? customNotes.trim() : null,
          kdsStatus: "Waiting",
        },
      });
      const details = await tx.orderDetail.findMany({ where: { orderId: active.id } });
      const subTotal = details.reduce((s, d) => s + d.unitPrice * d.quantity, 0);
      await tx.order.update({
        where: { id: active.id },
        data: { subTotal, totalAmount: subTotal, vatAmount: 0 },
      });
      await tx.cafeTable.update({ where: { id: tableId }, data: { status: "Occupied" } });
      return tx.order.findUnique({
        where: { id: active.id },
        include: {
          customer: { select: { id: true, fullName: true, phone: true, points: true } },
          details: { include: { product: true }, orderBy: { id: "asc" } },
        },
      });
    });
    io.to("kds").emit("order:new", { tableId });
    res.status(201).json(order);
  });

  r.post("/staff/orders/:orderId/items/:detailId/cancel", ...waiterOps, async (req, res) => {
    const orderId = Number(req.params.orderId);
    const detailId = Number(req.params.detailId);
    if (!orderId || !detailId) return res.status(400).json({ error: "Mã đơn/món không hợp lệ." });
    const detail = await prisma.orderDetail.findUnique({
      where: { id: detailId },
      include: { order: { include: { payments: true } } },
    });
    if (!detail || detail.orderId !== orderId) {
      return res.status(404).json({ error: "Không tìm thấy món trong đơn." });
    }
    if (detail.order.status !== "Confirmed" || detail.order.payments.length > 0) {
      return res.status(400).json({ error: "Đơn đã xử lý thanh toán, không thể hủy món." });
    }
    const ageMs = Date.now() - detail.order.createdAt.getTime();
    if (ageMs > 60_000) {
      return res.status(400).json({ error: "Chỉ hủy món trong vòng 1 phút sau khi gọi." });
    }
    if (!["Hold", "Waiting"].includes(detail.kdsStatus)) {
      return res.status(400).json({ error: "Món đã vào pha chế, không thể hủy." });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.orderDetail.delete({ where: { id: detailId } });
      const left = await tx.orderDetail.findMany({ where: { orderId } });
      const subTotal = left.reduce((s, d) => s + d.unitPrice * d.quantity, 0);
      if (left.length === 0) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: "Cancelled", cancelReason: "Nhân viên hủy toàn bộ trong 1 phút", subTotal: 0, totalAmount: 0 },
        });
        if (detail.order.tableId) {
          await tx.cafeTable.update({ where: { id: detail.order.tableId }, data: { status: "Empty" } });
        }
      } else {
        await tx.order.update({ where: { id: orderId }, data: { subTotal, totalAmount: subTotal, vatAmount: 0 } });
      }
      return tx.order.findUnique({
        where: { id: orderId },
        include: {
          customer: { select: { id: true, fullName: true, phone: true, points: true } },
          details: { include: { product: true }, orderBy: { id: "asc" } },
        },
      });
    });
    res.json(result);
  });

  r.post(
    "/staff/orders/request-payment",
    auth,
    requireRoles("Waiter", "Admin", "Cashier"),
    async (req, res) => {
      const { orderId, method } = req.body as { orderId?: number; method?: string };
      if (!orderId) return res.status(400).json({ error: "Thiếu orderId" });
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          customer: { select: { fullName: true, phone: true } },
          details: { include: { product: true } },
          table: true,
          payments: true,
        },
      });
      if (!order || order.status !== "Confirmed") {
        return res.status(400).json({ error: "Đơn không hợp lệ" });
      }
      if (order.payments.length > 0) {
        return res.status(400).json({ error: "Đơn đã thanh toán." });
      }
      const settings = await getStoreSettings(prisma);
      const bill = computeBill(order.subTotal, order.discountAmt, 0, settings.pointValueVnd, settings.vatRatePercent);
      if (order.tableId) {
        await prisma.cafeTable.update({
          where: { id: order.tableId },
          data: { status: "Waiting_Pay" },
        });
      }
      io.to("pos").emit("payment:request", { orderId, tableId: order.tableId, preferredMethod: method ?? null });
      res.json({
        ok: true,
        bill: {
          orderId: order.id,
          tableName: order.table?.name ?? null,
          customerName: order.customer?.fullName ?? "Khách vãng lai",
          customerPhone: order.customer?.phone ?? null,
          inAt: order.createdAt,
          outAt: new Date(),
          subTotal: order.subTotal,
          vatAmount: bill.vatAmount,
          totalAmount: bill.totalAmount,
          items: order.details.map((d) => ({
            id: d.id,
            name: d.product.name,
            quantity: d.quantity,
            unitPrice: d.unitPrice,
            amount: d.quantity * d.unitPrice,
          })),
          method: method ?? null,
        },
      });
    },
  );

  r.post("/staff/tables/:id/clean", ...waiterOps, async (req, res) => {
    const tableId = Number(req.params.id);
    if (!tableId) return res.status(400).json({ error: "Bàn không hợp lệ." });
    const open = await prisma.order.findFirst({
      where: { tableId, status: "Confirmed", payments: { none: {} } },
      select: { id: true },
    });
    if (open) {
      return res.status(400).json({ error: "Bàn còn đơn chưa thanh toán, chưa thể dọn." });
    }
    const table = await prisma.cafeTable.update({ where: { id: tableId }, data: { status: "Empty" } });
    res.json({ ok: true, table });
  });

  r.post("/staff/orders/merge", auth, requireRoles("Waiter", "Admin"), async (req, res) => {
    const { fromOrderId, toOrderId } = req.body as { fromOrderId?: number; toOrderId?: number };
    if (!fromOrderId || !toOrderId || fromOrderId === toOrderId) {
      return res.status(400).json({ error: "Thiếu hoặc trùng mã đơn" });
    }
    const [from, to] = await Promise.all([
      prisma.order.findUnique({ where: { id: fromOrderId }, include: { payments: true } }),
      prisma.order.findUnique({ where: { id: toOrderId } }),
    ]);
    if (!from || !to) return res.status(404).json({ error: "Không tìm thấy đơn" });
    if (from.payments.length > 0 || from.status !== "Confirmed") {
      return res.status(400).json({ error: "Chỉ gộp đơn chưa thanh toán" });
    }
    if (to.status !== "Confirmed") {
      return res.status(400).json({ error: "Đơn đích phải đang Confirmed" });
    }

    await prisma.orderDetail.updateMany({
      where: { orderId: fromOrderId },
      data: { orderId: toOrderId },
    });
    const details = await prisma.orderDetail.findMany({ where: { orderId: toOrderId } });
    const subTotal = details.reduce((s, d) => s + d.unitPrice * d.quantity, 0);
    await prisma.order.update({
      where: { id: toOrderId },
      data: { subTotal, totalAmount: subTotal, vatAmount: 0 },
    });
    await prisma.order.delete({ where: { id: fromOrderId } });
    res.json({ ok: true, mergedInto: toOrderId, subTotal });
  });

  r.post("/kitchen/requests", auth, requireRoles("Kitchen", "Admin"), async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const { itemId, requestQty, note } = req.body as {
      itemId?: number;
      requestQty?: number;
      note?: string;
    };
    if (!itemId || typeof requestQty !== "number" || requestQty <= 0) {
      return res.status(400).json({ error: "Thiếu nguyên liệu hoặc số lượng" });
    }
    const row = await prisma.inventoryRequest.create({
      data: {
        staffId: staff.id,
        itemId,
        requestQty,
        note: note ?? null,
      },
      include: { item: true },
    });
    io.to("pos").emit("inventory:request", { id: row.id });
    res.status(201).json(row);
  });

  return r;
}
