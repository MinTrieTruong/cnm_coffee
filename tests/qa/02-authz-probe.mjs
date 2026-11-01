/**
 * Dò quyền động: gọi mọi route (output/routes.json) với
 *   - không token, token khách hàng → route nhân sự phải 401/403
 *   - GET với token từng vai trò (cashier, waiter, kitchen, shipper, kho, admin, admin2, owner)
 * Ghi ma trận vào output/authz-matrix.json; in các route trả 2xx khi không đăng nhập.
 * Thao tác ghi (POST/PUT/PATCH/DELETE) chỉ gọi KHÔNG token và token khách (body rỗng) để không làm bẩn dữ liệu.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OUT, call, staffLogin, newCustomer } from "./lib.mjs";

const routes = JSON.parse(readFileSync(join(OUT, "routes.json"), "utf8"));
// Route cố ý công khai (đọc menu, đăng nhập, webhook có chữ ký riêng…) — vẫn ghi lại nhưng không coi là nghi vấn
const PUBLIC_OK = [
  /^GET \/api\/(menu|homepage|store-config|categories|combos|stores|site-info|banners|contact-buttons|promotions\/active|health|posts|vouchers\/public|games\/active|popups\b)/,
  /^POST \/api\/(auth\/(register|login)|staff\/login|supplier\/login|contact-clicks|contact-messages|popups\/\d+\/(view|click)|promotions\/preview)/,
  /^(GET|POST) \/api\/(vnpay|momo|sepay)\/ipn/,
];

const fill = (p) => p.replace(/:[A-Za-z]+/g, "1");
const roles = ["cashier", "waiter", "kitchen", "SP_Hieu", "kho", "admin", "admin2", "owner"];

const tokens = {};
for (const u of roles) tokens[u] = await staffLogin(u);
const cust = await newCustomer("authz");
const seen = new Set();
const matrix = [];
for (const r of routes) {
  const key = `${r.method} ${r.path}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const path = fill(r.path);
  const row = { key, file: r.file, mws: r.mws.slice(0, 80) };
  row.anon = (await call(r.method, path, r.method === "GET" ? {} : { body: {} })).status;
  row.cust = (await call(r.method, path, r.method === "GET" ? { token: cust.token } : { token: cust.token, body: {} })).status;
  if (r.method === "GET") for (const u of roles) row[u] = (await call("GET", path, { token: tokens[u] })).status;
  matrix.push(row);
}
writeFileSync(join(OUT, "authz-matrix.json"), JSON.stringify(matrix, null, 1));

const okish = (s) => s >= 200 && s < 300;
const isPublic = (k) => PUBLIC_OK.some((re) => re.test(k.replace(/:[A-Za-z]+/g, "1")));
console.log("\n── Route trả 2xx/4xx-khác-401/403 khi KHÔNG đăng nhập (trừ route công khai đã biết):");
for (const m of matrix) {
  if (isPublic(m.key)) continue;
  if (m.anon !== 401 && m.anon !== 403) console.log(`anon=${m.anon} cust=${m.cust}  ${m.key}  [${m.file}]`);
}
console.log("\n── GET mà shipper/kitchen/waiter/cashier đều 2xx trên đường dẫn admin/quản trị:");
for (const m of matrix) {
  if (!m.key.startsWith("GET")) continue;
  if (/\/admin|report|payroll|audit|purchasing|hr\/|salary|payslip/.test(m.key) && ["cashier", "waiter", "kitchen", "SP_Hieu"].some((u) => okish(m[u])))
    console.log(`${m.key}  cashier=${m.cashier} waiter=${m.waiter} kitchen=${m.kitchen} shipper=${m.SP_Hieu} kho=${m.kho}`);
}
console.log("\n── Có 500:");
for (const m of matrix) for (const [k, v] of Object.entries(m)) if (v === 500) console.log(`${k}: ${m.key}`);
