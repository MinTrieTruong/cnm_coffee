import "dotenv/config";
import path from "path";
import express, { type NextFunction, type Request, type Response } from "express";
// Express 4 không tự bắt lỗi của route async → 1 request lỗi làm sập cả server. Gói này chuyển lỗi vào error handler bên dưới.
import "express-async-errors";
import { Prisma } from "@prisma/client";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { authRouter } from "./routes/auth.js";
import { prisma } from "./db.js";
import { staffAuthRouter } from "./routes/staffAuth.js";
import { catalogRouter } from "./routes/catalog.js";
import { menuRouter } from "./routes/menu.js";
import { ordersRouter } from "./routes/orders.js";
import { shiftsRouter } from "./routes/shifts.js";
import { cashRouter } from "./routes/cash.js";
import { chatRouter } from "./routes/chat.js";
import { reviewsRouter } from "./routes/reviews.js";
import { posRouter } from "./routes/pos.js";
import { adminRouter } from "./routes/admin.js";
import { staffOpsRouter, takeawayRouter } from "./routes/staffOps.js";
import { formulaRouter } from "./routes/formula.js";
import { vnpayRouter } from "./routes/vnpay.js";
import { momoRouter } from "./routes/momo.js";
import { sepayRouter } from "./routes/sepay.js";
import { supplierRouter } from "./routes/supplier.js";
import { auditRouter } from "./routes/auditLog.js";
import { reportsRouter } from "./routes/reports.js";
import { vouchersRouter } from "./routes/vouchers.js";
import { postsRouter } from "./routes/posts.js";
import { scheduleRouter } from "./routes/schedule.js";
import { hrConfigRouter } from "./routes/hrConfig.js";
import { kitchenRouter } from "./routes/kitchen.js";
import { stockRequestsRouter } from "./routes/stockRequests.js";
import { menuProposalsRouter } from "./routes/menuProposals.js";
import { branchProposalsRouter } from "./routes/branchProposals.js";
import { inventoryCountsRouter } from "./routes/inventoryCounts.js";
import { setRealtime } from "./lib/realtime.js";
import { hrRequestsRouter } from "./routes/hrRequests.js";
import { attendanceRouter } from "./routes/attendance.js";
import { tasksRouter } from "./routes/tasks.js";
import { myStatsRouter } from "./routes/myStats.js";
import { notificationsRouter } from "./routes/notifications.js";
import { initNotify, startNotificationCleanup } from "./lib/notify.js";
import { initWebPush } from "./lib/webPush.js";
import { initOpenShifts, startOpenShiftJob } from "./lib/openShifts.js";
import { startBackorderReminder } from "./lib/supplierReturns.js";
import { comboRouter } from "./routes/combo.js";
import { payrollRoutes } from "./routes/payroll.js";
import { procurementRouter } from "./routes/procurement.js";
import { addressesRouter } from "./routes/addresses.js";
import { customerRouter } from "./routes/customer.js";
import { deliveryRouter } from "./routes/delivery.js";
import { storesRouter } from "./routes/stores.js";
import { stockTransferRouter } from "./routes/stockTransfer.js";
import { startDispatchWorker } from "./lib/delivery.js";
import { registerSocketHandlers } from "./socket/handlers.js";
import { startGraceWorker } from "./graceWorker.js";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: true, methods: ["GET", "POST"] },
});
setRealtime(io);
initNotify(prisma);
initWebPush(prisma);
initOpenShifts(prisma, io);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "6mb" }));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, service: "cmn-coffee-backend", database: "up" });
  } catch (err) {
    console.error("[health] database unreachable:", err);
    res.status(503).json({
      ok: false,
      service: "cmn-coffee-backend",
      database: "down",
      hint: "Kiểm tra MySQL (docker compose up -d) và DATABASE_URL trong backend-node/.env",
    });
  }
});

app.use("/api/auth", authRouter(prisma));
app.use("/api", staffAuthRouter(prisma));
app.use("/api", shiftsRouter(prisma));
app.use("/api", cashRouter(prisma));
app.use("/api/admin", adminRouter(prisma));
app.use("/api/admin", supplierRouter());
app.use("/api/admin", auditRouter());
app.use("/api/admin", reportsRouter());
app.use("/api", formulaRouter(prisma));
app.use("/api", storesRouter(prisma));
app.use("/api", catalogRouter(prisma));
app.use("/api", menuRouter(prisma));
app.use("/api", ordersRouter(prisma, io));
app.use("/api", chatRouter(prisma, io));
app.use("/api", reviewsRouter(prisma));
app.use("/api", posRouter(prisma, io));
app.use("/api", staffOpsRouter(prisma, io));
app.use("/api", takeawayRouter());
app.use("/api", vnpayRouter(prisma, io));
app.use("/api", momoRouter(prisma, io));
app.use("/api", deliveryRouter(prisma, io));
app.use("/api", sepayRouter(prisma, io));

app.use("/api", vouchersRouter(prisma, io));
app.use("/api", postsRouter(prisma));
app.use("/api", scheduleRouter(prisma, io));
app.use("/api", hrConfigRouter(prisma));
app.use("/api", kitchenRouter(prisma, io));
app.use("/api", stockRequestsRouter(prisma, io));
app.use("/api", menuProposalsRouter(prisma, io));
app.use("/api", branchProposalsRouter(prisma, io));
app.use("/api", inventoryCountsRouter(prisma, io));
app.use("/api", hrRequestsRouter(prisma, io));
app.use("/api", attendanceRouter(prisma));
app.use("/api", tasksRouter(prisma, io));
app.use("/api", myStatsRouter(prisma));
app.use("/api", notificationsRouter(prisma));
app.use("/api", comboRouter(prisma));
app.use("/api", payrollRoutes);
app.use("/api", procurementRouter(prisma));
app.use("/api/admin", stockTransferRouter(prisma));
app.use("/api/customer-addresses", addressesRouter(prisma));
app.use("/api/customer", customerRouter(prisma));

/** Bắt mọi lỗi chưa xử lý của route: ghi log, trả JSON — không để sập server */
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  // Dữ liệu gửi lên sai kiểu / thiếu (id không phải số…) → lỗi của request, không phải của server
  if (err instanceof Prisma.PrismaClientValidationError) {
    console.warn(`[400] ${req.method} ${req.originalUrl}: dữ liệu không hợp lệ`);
    return res.status(400).json({ error: "Dữ liệu gửi lên không hợp lệ." });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") return res.status(404).json({ error: "Không tìm thấy dữ liệu." });
    if (err.code === "P2002") return res.status(409).json({ error: "Dữ liệu bị trùng." });
    if (err.code === "P2003") return res.status(400).json({ error: "Dữ liệu liên quan không tồn tại." });
  }
  if (err instanceof SyntaxError && "body" in err) return res.status(400).json({ error: "JSON không hợp lệ." });
  console.error(`[500] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: "Lỗi máy chủ. Vui lòng thử lại." });
});

registerSocketHandlers(io, prisma);
startGraceWorker(prisma, io);
startDispatchWorker(prisma, io);
startNotificationCleanup();
startOpenShiftJob();
startBackorderReminder(prisma);

const port = Number(process.env.PORT) || 4000;

async function bootstrap() {
  try {
    await prisma.$connect();
    console.log("Database: connected");
  } catch (err) {
    console.error("Database: connection failed — is MySQL running? (docker compose up -d)");
    console.error(err);
    process.exit(1);
  }

  httpServer.listen(port, () => {
    console.log(`API + Socket.io: http://localhost:${port}`);
  });
}

const shutdown = async (signal: string) => {
  console.log(`\n${signal}: shutting down…`);
  await prisma.$disconnect();
  httpServer.close(() => process.exit(0));
};

// Lỗi async ngoài route (socket, worker định kỳ…) — ghi log thay vì để Node tắt cả server
process.on("unhandledRejection", (reason) => console.error("[unhandledRejection]", reason));

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

void bootstrap();

// trigger restart
