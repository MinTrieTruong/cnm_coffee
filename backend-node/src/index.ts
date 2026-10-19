import "dotenv/config";
import path from "path";
import express from "express";
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
import { hrRequestsRouter } from "./routes/hrRequests.js";
import { attendanceRouter } from "./routes/attendance.js";
import { comboRouter } from "./routes/combo.js";
import { payrollRoutes } from "./routes/payroll.js";
import { procurementRouter } from "./routes/procurement.js";
import { addressesRouter } from "./routes/addresses.js";
import { customerRouter } from "./routes/customer.js";
import { deliveryRouter } from "./routes/delivery.js";
import { storesRouter } from "./routes/stores.js";
import { startDispatchWorker } from "./lib/delivery.js";
import { registerSocketHandlers } from "./socket/handlers.js";
import { startGraceWorker } from "./graceWorker.js";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: true, methods: ["GET", "POST"] },
});

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
app.use("/api", hrRequestsRouter(prisma, io));
app.use("/api", attendanceRouter(prisma));
app.use("/api", comboRouter(prisma));
app.use("/api", payrollRoutes);
app.use("/api", procurementRouter(prisma));
app.use("/api/customer-addresses", addressesRouter(prisma));
app.use("/api/customer", customerRouter(prisma));

registerSocketHandlers(io, prisma);
startGraceWorker(prisma, io);
startDispatchWorker(prisma, io);

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

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

void bootstrap();

// trigger restart
