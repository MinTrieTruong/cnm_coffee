/**
 * Lập danh mục route từ backend-node/src/routes + tiền tố mount trong src/index.ts.
 * Ghi output/routes.json và in các route KHÔNG có middleware xác thực để rà tay.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { OUT } from "./lib.mjs";

const ROOT = new URL("../../backend-node/src/", import.meta.url);
const index = readFileSync(new URL("index.ts", ROOT), "utf8");

// tên router → file, file → tiền tố
const importOf = {};
for (const m of index.matchAll(/import \{([^}]+)\} from "\.\/routes\/([A-Za-z]+)\.js"/g)) {
  for (const n of m[1].split(",").map((s) => s.trim())) importOf[n] = m[2];
}
const prefixOf = {};
for (const m of index.matchAll(/app\.use\("([^"]+)",\s*([A-Za-z]+)/g)) {
  const file = importOf[m[2]];
  if (file) (prefixOf[file] ??= new Set()).add(m[1]);
}

const AUTH = /attachStaff|staffAuth|\bauth\b|customerAuth|requireRoles|manager|ownerOnly|\bowner\b|admins?\b|staff\b|cashier|kitchen|warehouse|shipper|attachSupplier|supplierAuth|\bmw\b|guard|protect/i;
const routes = [];
const dir = fileURLToPath(new URL("routes/", ROOT));
for (const f of readdirSync(dir)) {
  if (!f.endsWith(".ts")) continue;
  const name = f.replace(/\.ts$/, "");
  const src = readFileSync(join(dir, f), "utf8");
  const prefixes = [...(prefixOf[name] ?? ["/api"])];
  // Router-level r.use(...) áp cho mọi route khai báo sau nó
  const useAt = [...src.matchAll(/\b(?:r|router)\.use\(([^;]*?)\);/g)].map((m) => ({ at: m.index, text: m[1] }));
  for (const m of src.matchAll(/\b(?:r|router)\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]\s*,([\s\S]*?)(?:async\s*)?\(\s*req\b/g)) {
    const mws = m[3].replace(/\s+/g, " ").trim().replace(/,$/, "");
    const routerUse = useAt.filter((u) => u.at < m.index).map((u) => u.text).join(" ");
    for (const p of prefixes) {
      routes.push({ file: name, method: m[1].toUpperCase(), path: (p + m[2]).replace(/\/+/g, "/"), mws, routerUse, protected: AUTH.test(mws) || AUTH.test(routerUse) });
    }
  }
}
writeFileSync(join(OUT, "routes.json"), JSON.stringify(routes, null, 1));
console.log(`Tổng ${routes.length} route trong ${new Set(routes.map((r) => r.file)).size} file.`);
const open = routes.filter((r) => !r.protected);
console.log(`\nRoute không thấy middleware xác thực (${open.length}) — rà tay xem có cố ý công khai không:`);
for (const r of open) console.log(`${r.method.padEnd(6)} ${r.path}   [${r.file}] ${r.mws.slice(0, 60)}`);
