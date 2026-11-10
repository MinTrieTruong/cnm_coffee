/**
 * Dữ liệu mẫu cho trang "Hành vi khách" (buổi demo):  npm run db:tracking
 *
 * ~2.000 phiên trong 30 ngày qua, rải các chi nhánh đang mở; cao điểm 7–9h và 14–17h; 70% điện thoại, 15% QR tại bàn.
 * Món phổ biến được xem nhiều hơn; cố ý có 3 món "xem nhiều ít mua" và 2 món "hay bị bỏ giỏ".
 * Chạy lại được: xoá dữ liệu mẫu cũ (sessionKey bắt đầu bằng "seed-") trước khi sinh.
 * Đơn mẫu không có thật → Order_ID âm (không trùng đơn thật).
 */
import "dotenv/config";
import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const VISITS = 2000;
const DAYS = 30;
const VN_OFFSET = 7 * 3600_000;

// Số ngẫu nhiên cố định hạt giống → mỗi lần chạy ra cùng một bộ dữ liệu
let seed = 20261109;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const between = (a: number, b: number) => a + rnd() * (b - a);
const chance = (p: number) => rnd() < p;
function weighted<T>(items: T[], weight: (t: T, i: number) => number): T {
  const ws = items.map(weight);
  let x = rnd() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) if ((x -= ws[i]) <= 0) return items[i];
  return items[items.length - 1];
}

/** Giờ ghé theo giờ VN: cao điểm sáng 7–9h, chiều 14–17h */
const HOUR_W = [0.1, 0, 0, 0, 0, 0.2, 1, 5, 6, 4, 2, 2.5, 3, 2.5, 4, 4.5, 4.5, 4, 2.5, 2.5, 2, 1.5, 0.8, 0.3];

async function main() {
  const removed = await prisma.customerEvent.deleteMany({ where: { sessionKey: { startsWith: "seed-" } } });
  const [stores, products, combos, customers] = await Promise.all([
    prisma.store.findMany({ where: { isActive: true }, select: { id: true } }),
    prisma.product.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { id: "asc" } }),
    prisma.combo.findMany({ where: { isActive: true }, select: { id: true } }),
    prisma.customer.findMany({ select: { id: true }, take: 200 }),
  ]);
  if (!stores.length || products.length < 8) throw new Error("Cần ít nhất 1 chi nhánh và 8 món đang bán.");

  // Độ phổ biến giảm dần theo thứ tự xáo trộn; chọn món "điểm nhấn"
  const shuffled = [...products].sort(() => rnd() - 0.5);
  const viewNoBuy = new Set(shuffled.slice(2, 5).map((p) => p.id));
  const cartDrop = new Set(shuffled.slice(5, 7).map((p) => p.id));
  const pop = (p: { id: number }, i: number) => (viewNoBuy.has(p.id) ? 9 : 10 / (1 + i * 0.35));
  const addProb = (id: number) => (viewNoBuy.has(id) ? 0.015 : cartDrop.has(id) ? 0.55 : 0.32);

  const rows: Prisma.CustomerEventCreateManyInput[] = [];
  const visitors = Math.round(VISITS * 0.62);
  const now = Date.now();
  let fakeOrder = 0;

  for (let i = 0; i < VISITS; i++) {
    const v = Math.floor(rnd() * visitors);
    const sessionKey = `seed-${v}`;
    const visitId = `seed-v${i}`;
    // Cùng 1 trình duyệt giữ thiết bị / tài khoản
    const device = v % 10 < 7 ? "mobile" : "desktop";
    const customerId = customers.length && v % 4 === 0 ? customers[v % customers.length].id : null;
    const channel = chance(0.15) ? "qr_table" : "web";
    const storeId = stores[v % stores.length].id;
    // Ngày + giờ VN → UTC
    const dayBack = Math.floor(rnd() * DAYS);
    const hour = weighted(HOUR_W.map((_, h) => h), (h) => HOUR_W[h]);
    const vnMidnight = Math.floor((now + VN_OFFSET) / 86400_000) * 86400_000 - dayBack * 86400_000;
    let t = vnMidnight + hour * 3600_000 + Math.floor(rnd() * 3600_000) - VN_OFFSET;
    if (t > now - 3600_000) t = now - 3600_000 - Math.floor(rnd() * 6 * 3600_000);

    const base = { sessionKey, visitId, customerId, storeId, device, channel };
    const at = (ms: number) => new Date((t += ms));
    let pages = 0;
    // Lượt xem màn hình ghi lúc RỜI màn (như web thật): thời gian a–b giây
    const page = (screen: string, a: number, b: number, productId?: number) => {
      const ms = Math.round(between(a, b) * 1000);
      pages++;
      rows.push({ ...base, type: "PAGE_VIEW", screen, productId: productId ?? null, durationMs: ms, createdAt: at(ms) });
    };
    const cart = new Map<number, number>();

    if (channel === "web" && chance(0.6)) page("home", 8, 40);
    if (chance(0.12)) page(chance(0.5) ? "promotions" : "blog", 10, 70);
    if (!chance(0.88)) {
      // Rời đi sớm
      if (!pages) page("home", 3, 15);
      continue;
    }
    const nViews = weighted([0, 1, 2, 3, 4], (k) => [2, 4, 3, 2, 1][k]);
    const menuSec = between(40, 120);
    // Thêm nhanh từ thực đơn (không mở trang món)
    if (chance(0.35)) {
      const p = weighted(shuffled, pop);
      if (!viewNoBuy.has(p.id) || chance(0.1)) {
        const qty = chance(0.85) ? 1 : 2;
        rows.push({ ...base, type: "ADD_TO_CART", productId: p.id, qty, source: chance(0.2) && customerId ? "usual" : "card_quick", createdAt: new Date(t + menuSec * 500) });
        cart.set(p.id, (cart.get(p.id) ?? 0) + qty);
      }
    }
    if (chance(0.05)) {
      rows.push({ ...base, type: "ADD_TO_CART", productId: shuffled[0].id, qty: 1, source: "voice", createdAt: new Date(t + menuSec * 600) });
      cart.set(shuffled[0].id, (cart.get(shuffled[0].id) ?? 0) + 1);
    }
    page("menu", menuSec, menuSec);
    for (let k = 0; k < nViews; k++) {
      const p = weighted(shuffled, pop);
      rows.push({ ...base, type: "PRODUCT_VIEW", productId: p.id, createdAt: at(400) });
      const dur = between(15, 60);
      if (chance(addProb(p.id))) {
        const qty = chance(0.8) ? 1 : 2;
        rows.push({ ...base, type: "ADD_TO_CART", productId: p.id, qty, source: "product_detail", createdAt: new Date(t + dur * 800) });
        cart.set(p.id, (cart.get(p.id) ?? 0) + qty);
      }
      page("product", dur, dur, p.id);
      if (k < nViews - 1) page("menu", 8, 30);
    }
    if (combos.length && chance(0.04)) rows.push({ ...base, type: "ADD_TO_CART", comboId: combos[i % combos.length].id, qty: 1, source: "combo", createdAt: at(2000) });
    if (customerId && chance(0.03)) {
      const p = shuffled[1];
      rows.push({ ...base, type: "ADD_TO_CART", productId: p.id, qty: 1, source: "reorder", createdAt: at(1500) });
      cart.set(p.id, (cart.get(p.id) ?? 0) + 1);
    }
    if (!cart.size) {
      if (chance(0.15)) page("account", 10, 50);
      continue;
    }
    // Giỏ hàng: món "hay bị bỏ giỏ" bị bớt nhiều
    rows.push({ ...base, type: "CART_VIEW", qty: [...cart.values()].reduce((a, b) => a + b, 0), createdAt: at(300) });
    for (const [pid, q] of cart) {
      if (chance(cartDrop.has(pid) ? 0.6 : 0.08)) {
        rows.push({ ...base, type: "REMOVE_FROM_CART", productId: pid, qty: q, createdAt: at(between(5, 20) * 1000) });
        cart.delete(pid);
      }
    }
    const cartSec = between(20, 90);
    if (!cart.size || !chance(0.62)) {
      page("cart", cartSec, cartSec);
      continue;
    }
    rows.push({ ...base, type: "CHECKOUT_START", qty: [...cart.values()].reduce((a, b) => a + b, 0), createdAt: new Date(t + cartSec * 900) });
    if (!chance(0.9)) {
      page("cart", cartSec, cartSec);
      continue;
    }
    const orderId = -++fakeOrder;
    for (const [pid, q] of cart) rows.push({ ...base, type: "ORDER_PLACED", productId: pid, qty: q, orderId, createdAt: new Date(t + cartSec * 950) });
    page("cart", cartSec, cartSec);
    if (channel === "web") page("checkout", 30, 180);
    page(channel === "web" ? "tracking" : "grace", 20, 120);
  }

  for (let i = 0; i < rows.length; i += 2000) await prisma.customerEvent.createMany({ data: rows.slice(i, i + 2000) });
  const name = (ids: Set<number>) => products.filter((p) => ids.has(p.id)).map((p) => p.name).join(", ");
  console.log(`Đã xoá ${removed.count} sự kiện mẫu cũ, sinh ${rows.length} sự kiện / ${VISITS} phiên / ${visitors} trình duyệt, ${fakeOrder} đơn mẫu.`);
  console.log(`  Xem nhiều ít mua: ${name(viewNoBuy)}`);
  console.log(`  Hay bị bỏ giỏ:    ${name(cartDrop)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
