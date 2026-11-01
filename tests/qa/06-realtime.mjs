/**
 * B27 Realtime (socket.io): mở nhiều phiên song song, kiểm sự kiện tới đúng phòng / đúng chi nhánh.
 * Chạy: NODE_PATH=frontend-app/node_modules node tests/qa/06-realtime.mjs (dùng socket.io-client của frontend)
 */
import { createRequire } from "node:module";
import { join } from "node:path";
import { call, check, group, save, newCustomer, staffLogin } from "./lib.mjs";

const require = createRequire(join(process.cwd(), "frontend-app", "package.json"));
const { io } = require("socket.io-client");
const API = process.env.QA_API ?? "http://localhost:4100";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(token, rooms) {
  const s = io(API, { transports: ["websocket"], auth: token ? { token } : {}, forceNew: true });
  const got = [];
  s.onAny((ev, payload) => got.push({ ev, payload }));
  s.on("connect", () => rooms.forEach((r) => s.emit("join", r)));
  return { s, got };
}

group("B27 Realtime — đúng phòng, đúng chi nhánh");
const pos1 = client(await staffLogin("cashier"), ["pos"]);
const pos2 = client(await staffLogin("cashier2"), ["pos"]);
const anon = client(null, ["pos", "kds", "admin_room"]);
const waiterAdmin = client(await staffLogin("waiter"), ["admin_room"]);
await sleep(1500);

const c = await newCustomer("socket");
const o = await call("POST", "/api/orders", { token: c.token, body: { orderType: "Takeaway", storeId: 1, lines: [{ productId: 2, quantity: 1, size: "M" }] } });
const spy = client(null, [`order:${o.body.id}`]);
await sleep(800);
const cashier = await staffLogin("cashier");
const sh = await call("GET", "/api/shifts/open", { token: cashier });
if (!sh.body?.shift) await call("POST", "/api/shifts/open", { token: cashier, body: { startingCash: 0 } });
await call("POST", "/api/pos/pay", { token: cashier, body: { orderId: o.body.id, method: "Transfer" } });
await sleep(1500);

const has = (cl, ev) => cl.got.some((g) => g.ev === ev && (g.payload?.orderId === o.body.id || g.payload?.id === o.body.id));
check("Thu ngân CN1 nhận order:pending_grace của đơn CN1", has(pos1, "order:pending_grace"), pos1.got.map((g) => g.ev).join(","));
check("Thu ngân CN2 KHÔNG nhận sự kiện đơn CN1", !has(pos2, "order:pending_grace") && !has(pos2, "payment:done"), pos2.got.map((g) => g.ev).join(",") || "không có sự kiện");
check("Kết nối không token join 'pos/kds/admin_room' không nhận gì", anon.got.length === 0, anon.got.map((g) => g.ev).join(","));
check("Phục vụ không vào được admin_room", waiterAdmin.got.every((g) => !String(g.ev).startsWith("complaint")), `${waiterAdmin.got.length} sự kiện`);
check("Người lạ join phòng order:<id> của đơn người khác không nhận payment:success", !spy.got.some((g) => g.ev === "payment:success"), spy.got.map((g) => `${g.ev}:${JSON.stringify(g.payload).slice(0, 80)}`).join(" | "));

for (const cl of [pos1, pos2, anon, waiterAdmin, spy]) cl.s.close();
save("06-realtime.json");
process.exit(0);
