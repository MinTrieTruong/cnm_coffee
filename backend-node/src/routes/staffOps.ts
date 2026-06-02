import { Router } from "express";
import { randomUUID } from "crypto";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { attachStaff, requireRoles, type StaffRequest } from "../middleware/staff.js";
import { computeBill, getStoreSettings } from "../lib/pricing.js";

/**
 * GET /api/takeaway/new
 * Mỗi lần quét QR → sinh UUID session mới → redirect về /cart?session={uuid}&orderType=Takeaway
 * Không cần auth — đây là endpoint công khai dành cho khách quét QR.
 */
export function takeawayRouter() {
  const r = Router();
  r.get("/takeaway/new", (req, res) => {
    const session = randomUUID();
    const frontendOrigin = (req.headers.origin as string | undefined)
      ?? process.env.FRONTEND_URL
      ?? "http://localhost:5173";
    // Redirect về frontend cart với session và orderType mang về
    res.redirect(`${frontendOrigin}/cart?session=${session}&orderType=Takeaway`);
  });
  return r;
}



export function staffOpsRouter(prisma: PrismaClient, io: Server) {
  const r = Router();
  const auth = attachStaff(prisma);
  const waiterOps = [auth, requireRoles("Waiter", "Admin", "Cashier")];

  r.get("/staff/tables/:id/context", ...waiterOps, async (req, res) => {
    const tableId = Number(req.params.id);
    if (!tableId) return res.status(400).json({ error: "Bàn không hợp lệ." });
    const table = await prisma.cafeTable.findUnique({ where: { id: tableId } });
    if (!table) return res.status(404).json({ error: "Không tìm thấy bàn." });
    let activeOrder = await prisma.order.findFirst({
      where: { tableId, status: "Confirmed", payments: { none: {} } },
      include: {
        customer: { select: { id: true, fullName: true, phone: true, points: true } },
        details: { include: { product: true }, orderBy: { id: "asc" } },
      },
      orderBy: { id: "desc" },
    });
    
    // Nếu không có đơn đang mở nhưng bàn đang Cleaning, trả về đơn vừa thanh toán để nhân viên có thể check lại món
    if (!activeOrder && table.status === "Cleaning") {
      activeOrder = await prisma.order.findFirst({
        where: { tableId, status: "Paid" },
        include: {
          customer: { select: { id: true, fullName: true, phone: true, points: true } },
          details: { include: { product: true }, orderBy: { id: "asc" } },
        },
        orderBy: { id: "desc" },
      });
    }

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
    if (ageMs > 20_000) {
      return res.status(400).json({ error: "Chỉ hủy món trong vòng 20 giây sau khi gọi." });
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
          data: { status: "Cancelled", cancelReason: "Nhân viên hủy toàn bộ trong 20 giây", subTotal: 0, totalAmount: 0 },
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

  /**
   * POST /staff/tables/:id/clear
   * Nhân viên báo bàn trống sau khi khách đã thanh toán và rời đi.
   * Chỉ hoạt động khi bàn đang trạng thái Cleaning (đã thanh toán, khách còn ngồi).
   */
  r.post("/staff/tables/:id/clear", ...waiterOps, async (req, res) => {
    const tableId = Number(req.params.id);
    if (!tableId) return res.status(400).json({ error: "Bàn không hợp lệ." });
    const t = await prisma.cafeTable.findUnique({ where: { id: tableId } });
    if (!t) return res.status(404).json({ error: "Không tìm thấy bàn." });
    if (t.status !== "Cleaning") {
      return res.status(400).json({ error: "Bàn không ở trạng thái chờ báo trống." });
    }
    const table = await prisma.cafeTable.update({ where: { id: tableId }, data: { status: "Empty" } });
    io.to("pos").emit("table:cleared", { tableId });
    io.to("staff").emit("table:cleared", { tableId });
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
        type: "Kitchen",
        note: note ?? null,
      },
      include: { item: true },
    });
    io.to("pos").emit("inventory:request", { id: row.id });
    res.status(201).json(row);
  });

  /**
   * POST /staff/inventory/requests
   * Tạo phiếu nhập hàng — nhận mảng items để tạo nhiều dòng cùng lúc.
   * Body: { items: [{ itemId, requestQty, note? }], note?: string }
   */
  r.post(
    "/staff/inventory/requests",
    auth,
    requireRoles("Cashier", "Waiter", "Admin", "Kitchen"),
    async (req, res) => {
      const staff = (req as StaffRequest).staffRow!;
      const { items, note: globalNote } = req.body as {
        items?: { itemId: number; requestQty: number; note?: string }[];
        note?: string;
      };

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Cần ít nhất 1 nguyên liệu trong phiếu." });
      }

      // Validate từng dòng
      for (const it of items) {
        if (!it.itemId || typeof it.requestQty !== "number" || it.requestQty <= 0) {
          return res.status(400).json({ error: "Số lượng phải > 0 cho tất cả nguyên liệu." });
        }
      }

      // Tạo tất cả records trong 1 transaction
      const created = await prisma.$transaction(
        items.map((it) =>
          prisma.inventoryRequest.create({
            data: {
              staffId: staff.id,
              itemId: it.itemId,
              requestQty: it.requestQty,
              type: "Restock",
              note: it.note?.trim() || globalNote?.trim() || null,
            },
            include: { item: { select: { name: true, unit: true } } },
          }),
        ),
      );

      // Notify admin
      io.to("pos").emit("inventory:restock_request", {
        count: created.length,
        itemNames: created.map((r) => r.item.name).join(", "),
      });

      res.status(201).json(created);
    },
  );

  /**
   * GET /staff/inventory/requests
   * Nhân viên xem danh sách phiếu nhập hàng của chính mình.
   */
  r.get(
    "/staff/inventory/requests",
    auth,
    requireRoles("Cashier", "Waiter", "Admin", "Kitchen"),
    async (req, res) => {
      const staff = (req as StaffRequest).staffRow!;
      const rows = await prisma.inventoryRequest.findMany({
        where: { staffId: staff.id },
        orderBy: { id: "desc" },
        take: 50,
        include: {
          item: { select: { name: true, unit: true } },
          approvedBy: { select: { fullName: true } },
        },
      });
      res.json(rows);
    },
  );

  /**
   * GET /staff/order-items/live
   * Nhân viên phục vụ xem tất cả món đang hoạt động: Waiting, Cooking, Ready
   * kèm số bàn, mã bill — dùng cho màn hình trạng thái món.
   */
  r.get(
    "/staff/order-items/live",
    auth,
    requireRoles("Waiter", "Admin", "Cashier", "Kitchen"),
    async (_req, res) => {
      const items = await prisma.orderDetail.findMany({
        where: {
          kdsStatus: { in: ["Waiting", "Cooking", "Ready"] },
          order: { status: { in: ["Confirmed", "Paid"] } },
        },
        include: {
          product: { select: { id: true, name: true, imageUrl: true } },
          order: {
            include: {
              table: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ priority: "desc" }, { orderId: "asc" }, { id: "asc" }],
      });
      res.json(items);
    },
  );

  /**
   * POST /staff/order-items/:id/served
   * Nhân viên xác nhận đã bê món ra cho khách → kdsStatus = Served.
   * Món sẽ biến khỏi live board vì không còn trong [Waiting, Cooking, Ready].
   */
  r.post(
    "/staff/order-items/:id/served",
    auth,
    requireRoles("Waiter", "Admin", "Cashier"),
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: "ID không hợp lệ." });
      const detail = await prisma.orderDetail.findUnique({ where: { id } });
      if (!detail) return res.status(404).json({ error: "Không tìm thấy món." });
      if (detail.kdsStatus !== "Ready") {
        return res.status(400).json({ error: "Chỉ xác nhận bê khi món đã sẵn sàng (Ready)." });
      }
      const updated = await prisma.orderDetail.update({
        where: { id },
        data: { kdsStatus: "Served" },
      });
      // Thông báo cho các màn hình staff biết món đã được bê
      io.to("staff").emit("kds:served", { detailId: id });
      res.json(updated);
    },
  );

  return r;
}
