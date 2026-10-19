import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { toStore } from "./lib/storeScope.js";

/** QTNV-01: hết ân hạn → Confirmed, đẩy KDS (Waiting), không đẩy khi Hold */
export function startGraceWorker(prisma: PrismaClient, io: Server) {
  const tick = async () => {
    const now = new Date();
    const due = await prisma.order.findMany({
      where: { status: "Pending_Grace", graceEndsAt: { lte: now } },
    });
    for (const o of due) {
      await prisma.order.update({
        where: { id: o.id },
        data: { status: "Confirmed" },
      });
      if (o.tableId) {
        await prisma.cafeTable.update({
          where: { id: o.tableId },
          data: { status: "Occupied" },
        });
      }
      await prisma.orderDetail.updateMany({
        where: { orderId: o.id, kdsStatus: "Hold" },
        data: { kdsStatus: "Waiting" },
      });
      const details = await prisma.orderDetail.findMany({
        where: { orderId: o.id },
        include: { product: true, order: { include: { table: true } } },
      });
      toStore(io, "kds", o.storeId).emit("order:new", { orderId: o.id, details });
      toStore(io, "pos", o.storeId).emit("order:confirmed", { orderId: o.id });
    }
  };
  setInterval(() => {
    void tick();
  }, 2000);
}
