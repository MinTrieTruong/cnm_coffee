import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { randomUUID } from "crypto";
import { attachStaff, requireRoles } from "../middleware/staff.js";

type CartLine = {
  productId: number;
  quantity: number;
  unitPrice: number;
  customNotes?: string;
};

const GRACE_MS = 60_000;

export function ordersRouter(prisma: PrismaClient, io: Server) {
  const r = Router();
  const kitchenAuth = [attachStaff(prisma), requireRoles("Kitchen", "Admin")];

  r.get("/orders/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ" });
    const order = await prisma.order.findUnique({
      where: { id },
      include: { details: { include: { product: true } }, table: true },
    });
    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn" });
    res.json(order);
  });

  r.post("/orders", async (req, res) => {
    const body = req.body as {
      tableId?: number | null;
      customerId?: number | null;
      orderType?: string;
      sessionId?: string | null;
      payMode?: "now" | "later";
      lines?: CartLine[];
    };
    const lines = body.lines ?? [];
    if (!lines.length) {
      return res.status(400).json({ error: "Giỏ hàng trống." });
    }
    const subTotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const orderType = body.orderType ?? "Dine-in";
    const payMode = body.payMode ?? "later";
    const immediatePay = payMode === "now";
    const isTakeaway = orderType.toLowerCase().includes("take") || orderType === "Takeaway";
    if (!isTakeaway && !body.tableId) {
      return res.status(400).json({ error: "Đơn tại quán bắt buộc phải có thông tin bàn." });
    }
    const sessionId =
      isTakeaway ? body.sessionId ?? randomUUID() : null;

    const maxOrder = (await prisma.order.aggregate({ _max: { id: true } }))._max.id ?? 0;
    const maxDetail = (await prisma.orderDetail.aggregate({ _max: { id: true } }))._max.id ?? 0;
    const graceEndsAt = immediatePay ? null : new Date(Date.now() + GRACE_MS);

    const order = await prisma.order.create({
      data: {
        id: maxOrder + 1,
        tableId: body.tableId ?? null,
        customerId: body.customerId ?? null,
        staffId: null,
        sessionId,
        orderType,
        subTotal,
        discountAmt: 0,
        vatAmount: 0,
        totalAmount: subTotal,
        status: immediatePay ? "Confirmed" : "Pending_Grace",
        graceEndsAt,
        details: {
          create: lines.map((l, i) => ({
            id: maxDetail + i + 1,
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            customNotes: l.customNotes ?? null,
            kdsStatus: immediatePay ? "Waiting" : "Hold",
          })),
        },
      },
      include: { details: { include: { product: true } }, table: true },
    });

    if (order.tableId) {
      await prisma.cafeTable.update({
        where: { id: order.tableId },
        data: { status: immediatePay ? "Waiting_Pay" : "Occupied" },
      });
    }

    io.to("pos").emit("order:pending_grace", {
      orderId: order.id,
      tableId: order.tableId,
      payMode,
    });
    if (immediatePay) {
      io.to("kds").emit("order:new", { orderId: order.id, details: order.details });
      io.to("pos").emit("order:confirmed", { orderId: order.id });
      io.to("pos").emit("payment:request", { orderId: order.id, tableId: order.tableId, fromCustomer: true });
    }

    res.status(201).json({
      ...order,
      graceSeconds: 60,
    });
  });

  r.post("/orders/:id/cancel", async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ" });
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn" });
    if (order.status !== "Pending_Grace") {
      return res.status(400).json({ error: "Chỉ hủy được trong thời gian ân hạn." });
    }
    const now = new Date();
    if (order.graceEndsAt && order.graceEndsAt < now) {
      return res.status(400).json({ error: "Đã hết thời gian ân hạn." });
    }
    await prisma.order.update({
      where: { id },
      data: { status: "Cancelled", cancelReason: "Hủy bởi khách (ân hạn)" },
    });
    res.json({ ok: true });
  });

  r.get("/kds/queue", ...kitchenAuth, async (_req, res) => {
    const details = await prisma.orderDetail.findMany({
      where: {
        kdsStatus: { in: ["Waiting", "Cooking"] },
        order: { status: "Confirmed" },
      },
      include: {
        product: true,
        order: { include: { table: true } },
      },
      orderBy: [{ orderId: "asc" }, { id: "asc" }],
    });
    res.json(details);
  });

  r.patch("/kds/details/:id", ...kitchenAuth, async (req, res) => {
    const id = Number(req.params.id);
    const { kdsStatus } = req.body as { kdsStatus?: string };
    if (!kdsStatus) return res.status(400).json({ error: "Thiếu kdsStatus" });
    const d = await prisma.orderDetail.update({
      where: { id },
      data: { kdsStatus },
      include: { product: true, order: { include: { table: true } } },
    });
    if (d.order.status !== "Confirmed") {
      return res.status(400).json({ error: "Đơn chưa xác nhận xuống bếp." });
    }
    io.to("staff").emit("kds:update", d);
    res.json(d);
  });

  return r;
}
