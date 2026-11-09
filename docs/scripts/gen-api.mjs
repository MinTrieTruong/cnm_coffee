// Sinh docs/api.md thẳng từ mã nguồn — chạy ở thư mục gốc repo: node docs/scripts/gen-api.mjs
// Tiền tố mount trong backend-node/src/index.ts + các lời gọi r.get/post/put/patch/delete trong backend-node/src/routes/*.ts
// (kể cả khai báo nhiều dòng). Router con gắn bằng r.use(xxxRoutes(...)) nhận tiền tố của router cha.
import { readFileSync, readdirSync, writeFileSync } from "fs";
import path from "path";

const ROOT = process.argv[2] ?? process.cwd();
const SRC = path.join(ROOT, "backend-node/src");
const index = readFileSync(path.join(SRC, "index.ts"), "utf8");

// tên hàm / hằng router → file
const fnFile = new Map();
for (const m of index.matchAll(/import\s*\{([^}]+)\}\s*from\s*"\.\/routes\/([\w]+)\.js"/g)) {
  for (const name of m[1].split(",").map((x) => x.trim()).filter(Boolean)) fnFile.set(name, m[2]);
}
for (const m of index.matchAll(/import\s+([A-Za-z_]\w*)\s+from\s*"\.\/routes\/([\w]+)\.js"/g)) fnFile.set(m[1], m[2]);
// file → các tiền tố mount
const mounts = new Map();
for (const m of index.matchAll(/app\.use\(\s*"([^"]+)"\s*,\s*([A-Za-z_]\w*)/g)) {
  const file = fnFile.get(m[2]);
  if (!file) continue;
  (mounts.get(file) ?? mounts.set(file, new Set()).get(file)).add(m[1]);
}
// router con: r.use(socialRoutes(prisma)) trong routes/auth.ts → socialAuth dùng tiền tố của auth
const routeFiles = readdirSync(path.join(SRC, "routes")).filter((f) => f.endsWith(".ts")).sort();
for (const f of routeFiles) {
  const src = readFileSync(path.join(SRC, "routes", f), "utf8");
  const parent = f.replace(".ts", "");
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*"\.\/([\w]+)\.js"/g)) {
    for (const name of m[1].split(",").map((x) => x.trim())) {
      if (name && new RegExp(`\\.use\\(\\s*${name}\\(`).test(src) && mounts.get(parent)) mounts.set(m[2], new Set(mounts.get(parent)));
    }
  }
}

const join = (a, b) => (`${a.replace(/\/$/, "")}/${b.replace(/^\//, "")}`.replace(/\/$/, "") || "/");
/** Middleware giữa đường dẫn và hàm xử lý: chỉ giữ tên */
function middlewares(rest) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of rest) {
    if ("([{".includes(ch)) depth++;
    if (")]}".includes(ch)) depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out
    .map((t) => t.replace(/^\.\.\./, ""))
    .filter((t) => /^[A-Za-z_][\w.]*(\([^()]*\))?$/.test(t) && !/^(async|req|res|_req)$/.test(t));
}
/** Mô tả: dòng đầu khối chú thích đầu file */
function describe(src) {
  const m = /^\s*\/\*\*?([\s\S]*?)\*\//.exec(src);
  if (!m) return "";
  const line = m[1].split("\n").map((l) => l.replace(/^\s*\*\s?/, "").trim()).find((l) => l && !/^@/.test(l)) ?? "";
  return line.replace(/^routes\/[\w.]+\s*[—-]\s*/i, "").replace(/\|/g, "/");
}

const byFile = new Map();
let total = 0;
const ROUTE = /\b(?:r|router)\.(get|post|put|patch|delete)\(\s*"([^"]+)"\s*,/g;
for (const f of routeFiles) {
  const file = f.replace(".ts", "");
  const src = readFileSync(path.join(SRC, "routes", f), "utf8");
  const prefixes = [...(mounts.get(file) ?? ["/api"])];
  const list = [];
  for (const m of src.matchAll(ROUTE)) {
    // phần sau đường dẫn tới hàm xử lý (async … / (req … / tên hàm cuối cùng)
    const after = src.slice(m.index + m[0].length, m.index + m[0].length + 600);
    const stop = after.search(/\basync\b|\(\s*_?req\b|\(\s*\)\s*=>/);
    const mws = middlewares(stop >= 0 ? after.slice(0, stop) : "");
    for (const pre of prefixes) list.push({ method: m[1].toUpperCase(), path: join(pre, m[2]), auth: mws });
  }
  if (list.length) {
    byFile.set(file, { list, desc: describe(src) });
    total += list.length;
  }
}

const files = [...byFile.keys()];
const lines = [
  "# Danh mục API (backend-node)",
  "",
  `Sinh tự động bằng \`node docs/scripts/gen-api.mjs\` (chạy ở thư mục gốc) từ mã nguồn (tiền tố mount trong \`backend-node/src/index.ts\` + các route trong \`backend-node/src/routes/*.ts\`): **${total} endpoint, ${files.length} file route**. Cột "Middleware" là middleware gắn trên từng route (\`—\` = không gắn; route có thể vẫn tự kiểm tra trong thân hàm hoặc dùng middleware gắn chung cho router bằng \`r.use(...)\`).`,
  "",
  "Middleware thường gặp: `attachStaff`, `anyStaff` = JWT nhân sự; `requireRoles(...)`, `mgmtOnly`, `adminOnly`, `owner`, `managers`, `stock` = giới hạn vai trò; `requireStore` = phải chọn 1 chi nhánh (Chủ chuỗi gửi header `X-Store-Id`); `customerAuth`, `optionalCustomerAuth` = JWT khách; `authSupp` = JWT nhà cung cấp.",
  "",
  "## Mục lục",
  "",
  ...files.map((f) => `- [${f}.ts](#${f.toLowerCase()}ts) (${byFile.get(f).list.length})`),
  "",
];
for (const f of files) {
  const { list, desc } = byFile.get(f);
  lines.push(`## ${f}.ts`, "");
  if (desc) lines.push(desc, "");
  lines.push("| Phương thức | Đường dẫn | Middleware |", "|---|---|---|");
  for (const r of list.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))) {
    lines.push(`| ${r.method} | \`${r.path}\` | ${r.auth.length ? [...new Set(r.auth)].join(", ") : "—"} |`);
  }
  lines.push("");
}
writeFileSync(path.join(ROOT, "docs/api.md"), lines.join("\n"));
console.log(`docs/api.md: ${total} endpoint, ${files.length} file`);
