/**
 * Thư viện dùng chung cho script QA. Mặc định trỏ backend TEST (cổng 4100, CSDL cmn_test) —
 * KHÔNG trỏ vào backend/CSDL đang dùng của chủ dự án.
 *   QA_API=http://localhost:4100  QA_DB=cmn_test  node tests/qa/<script>.mjs
 */
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const API = process.env.QA_API ?? "http://localhost:4100";
export const DB = process.env.QA_DB ?? "cmn_test";
if (DB === "coffee_shop_db") throw new Error("Không chạy QA trên CSDL thật coffee_shop_db");

const here = dirname(fileURLToPath(import.meta.url));
export const OUT = join(here, "output");
mkdirSync(OUT, { recursive: true });

/** Gọi API, trả { status, body, ms } — không ném lỗi theo status */
export async function call(method, path, { token, body, headers = {}, raw } = {}) {
  const h = { ...headers };
  if (body !== undefined && !raw) h["Content-Type"] = "application/json";
  if (token) h.Authorization = `Bearer ${token}`;
  const t0 = performance.now();
  let res;
  try {
    res = await fetch(API + path, { method, headers: h, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
  } catch (e) {
    return { status: 0, body: String(e), ms: performance.now() - t0 };
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json, ms: Math.round(performance.now() - t0), headers: res.headers };
}

/** Truy vấn CSDL test qua docker (cmn-mysql). Trả mảng object. */
export function sql(query) {
  const out = execFileSync("docker", ["exec", "cmn-mysql", "mysql", "-uroot", "-proot", "--default-character-set=utf8mb4", "-B", DB, "-e", query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const lines = out.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const cols = lines[0].split("\t");
  return lines.slice(1).map((l) => Object.fromEntries(l.split("\t").map((v, i) => [cols[i], v === "NULL" ? null : v])));
}
export const sql1 = (q) => sql(q)[0] ?? null;

const tokenCache = new Map();
export async function staffLogin(username, password = "staff123") {
  if (tokenCache.has(username)) return tokenCache.get(username);
  const r = await call("POST", "/api/staff/login", { body: { username, password } });
  const t = r.body?.token;
  if (!t) throw new Error(`Đăng nhập nhân sự ${username} lỗi: ${r.status} ${JSON.stringify(r.body)}`);
  tokenCache.set(username, t);
  return t;
}

export async function customerLogin(identifier, password = "123456") {
  const r = await call("POST", "/api/auth/login", { body: { login: identifier, password } });
  return r.body?.token ?? null;
}

/** Tạo khách mới qua luồng đăng ký, trả { token, phone, id } */
export async function newCustomer(tag = "") {
  const phone = "09" + String(Date.now() + Math.floor(Math.random() * 1e5)).slice(-8);
  const r = await call("POST", "/api/auth/register", { body: { phone, password: "123456", fullName: `QA Khách ${tag}`.trim(), name: `QA Khách ${tag}`.trim() } });
  const token = r.body?.token ?? (await customerLogin(phone));
  const id = sql1(`SELECT Customer_ID id FROM Customers WHERE Phone='${phone}'`)?.id;
  return { token, phone, id: id ? Number(id) : null, reg: r };
}

/* ── Ghi kết quả ── */
const results = [];
let current = "chung";
/** Bắt đầu nhóm kiểm tra. QA_ONLY="A6,B17" → chỉ chạy nhóm có tên chứa một trong các chuỗi đó; trả false nếu bỏ qua */
export function group(name) {
  const only = (process.env.QA_ONLY ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  current = name;
  if (only.length && !only.some((o) => name.includes(o))) return false;
  console.log(`\n=== ${name}`);
  return true;
}
/** Ghi một kiểm tra: ok = true (đạt) / false (lỗi) / null (bỏ qua) */
export function check(name, ok, detail = "") {
  results.push({ group: current, name, ok, detail: typeof detail === "string" ? detail : JSON.stringify(detail) });
  const tag = ok === true ? "PASS" : ok === false ? "FAIL" : "SKIP";
  console.log(`[${tag}] ${name}${detail ? " — " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300) : ""}`);
  return ok;
}
export function save(file) {
  const p = join(OUT, file);
  writeFileSync(p, JSON.stringify(results, null, 1));
  const pass = results.filter((r) => r.ok === true).length;
  const fail = results.filter((r) => r.ok === false).length;
  const skip = results.filter((r) => r.ok === null).length;
  console.log(`\n${file}: ${pass} đạt · ${fail} lỗi · ${skip} bỏ qua`);
  appendFileSync(join(OUT, "summary.txt"), `${new Date().toISOString()} ${file}: ${pass} pass / ${fail} fail / ${skip} skip\n`);
}
export const short = (b) => String(typeof b === "string" ? b : JSON.stringify(b) ?? "").slice(0, 200);

/** Biến trong backend-node/.env (dùng để ký callback thanh toán hợp lệ khi test) — không in ra */
export function backendEnv(key) {
  const txt = readFileSync(join(here, "../../backend-node/.env"), "utf8");
  const m = new RegExp(`^${key}=(.*)$`, "m").exec(txt);
  return m ? m[1].trim().replace(/^"|"$/g, "") : "";
}

/** Bộ tham số vnp_* đã ký đúng (giống VNPay trả về thật) cho đơn `orderId`, số tiền `amount` VND */
export function signedVnpayParams(orderId, amount, extra = {}) {
  const params = { vnp_Amount: String(Math.round(amount) * 100), vnp_ResponseCode: "00", vnp_TransactionStatus: "00", vnp_TxnRef: `${orderId}_${Date.now()}`, vnp_TransactionNo: String(Date.now()).slice(-8), ...extra };
  const sorted = Object.fromEntries(Object.keys(params).sort().map((k) => [k, params[k]]));
  const signData = new URLSearchParams(sorted).toString();
  return { ...sorted, vnp_SecureHash: createHmac("sha512", backendEnv("VNPAY_HASH_SECRET")).update(signData).digest("hex") };
}
/** URL IPN VNPay đã ký đúng */
export function signedVnpayIpn(orderId, amount, extra = {}) {
  return `/api/vnpay/ipn?${new URLSearchParams(signedVnpayParams(orderId, amount, extra)).toString()}`;
}
