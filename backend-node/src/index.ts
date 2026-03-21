import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";
import { authRouter } from "./routes/auth.js";
import { staffAuthRouter } from "./routes/staffAuth.js";
import { catalogRouter } from "./routes/catalog.js";
import { menuRouter } from "./routes/menu.js";
import { ordersRouter } from "./routes/orders.js";
import { shiftsRouter } from "./routes/shifts.js";
import { chatRouter } from "./routes/chat.js";
import { reviewsRouter } from "./routes/reviews.js";
import { posRouter } from "./routes/pos.js";
import { adminRouter } from "./routes/admin.js";
import { staffOpsRouter } from "./routes/staffOps.js";
import { registerSocketHandlers } from "./socket/handlers.js";
import { startGraceWorker } from "./graceWorker.js";

const prisma = new PrismaClient();
const app = express();
const httpServer = createServer(app);

const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";
const io = new Server(httpServer, {
  cors: { origin: corsOrigin, methods: ["GET", "POST"] },
});

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "cmn-coffee-backend" });
});

app.use("/api/auth", authRouter(prisma));
app.use("/api", staffAuthRouter(prisma));
app.use("/api", shiftsRouter(prisma));
app.use("/api/admin", adminRouter(prisma));
app.use("/api", catalogRouter(prisma));
app.use("/api", menuRouter(prisma));
app.use("/api", ordersRouter(prisma, io));
app.use("/api", chatRouter(prisma, io));
app.use("/api", reviewsRouter(prisma));
app.use("/api", posRouter(prisma, io));
app.use("/api", staffOpsRouter(prisma, io));

registerSocketHandlers(io);
startGraceWorker(prisma, io);

const port = Number(process.env.PORT) || 4000;
httpServer.listen(port, () => {
  console.log(`API + Socket.io: http://localhost:${port}`);
});
