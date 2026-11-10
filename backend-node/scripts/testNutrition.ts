/**
 * Kiểm thử dinh dưỡng:  npx tsx scripts/testNutrition.ts [--suggest] [--approve]
 *
 *  --suggest: AI gợi ý dinh dưỡng cho mọi nguyên liệu CHƯA DUYỆT (Gemini thật), in giá trị + cảnh báo + độ tin.
 *  --approve: duyệt mọi nguyên liệu đã có đủ số (giả lập quản lý duyệt sau khi đã xem bảng) rồi tính lại món.
 * Luôn chạy các kiểm tra bằng code (không AI):
 *  - nguyên liệu chưa duyệt không làm hiện nhãn / không lọt bộ lọc loại trừ
 *  - đổi định mức công thức → số đổi theo (thử trên bản sao trong transaction, rồi huỷ)
 *  - lọc "không sữa" không trả món có nguyên liệu mang cờ milk
 *  - cà phê đen nhiều caffeine hơn bạc xỉu; bánh croissant có gluten + sữa
 */
import "dotenv/config";
import { prisma } from "../src/db.js";
import { MAX_SUGGEST, suggestNutrition } from "../src/lib/nutrition/suggest.js";
import { calcProductNutrition, recomputeAll } from "../src/lib/nutrition/compute.js";
import { fitsDiet, type NutritionValues } from "../src/lib/nutrition/labels.js";

let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
};

if (process.argv.includes("--suggest")) {
  const todo = await prisma.inventoryItem.findMany({ where: { OR: [{ nutrition: null }, { nutrition: { approved: false } }] }, select: { id: true } });
  console.log(`AI gợi ý cho ${todo.length} nguyên liệu chưa duyệt…`);
  for (let i = 0; i < todo.length; i += MAX_SUGGEST) {
    const out = await suggestNutrition(todo.slice(i, i + MAX_SUGGEST).map((t) => t.id));
    console.log(`  lô ${i / MAX_SUGGEST + 1}: ${out.saved} nguyên liệu, ${out.latencyMs} ms, ${out.tokensIn}+${out.tokensOut} token, ${out.model}`);
  }
}

const all = await prisma.inventoryItem.findMany({ include: { nutrition: true }, orderBy: { id: "asc" } });
console.log("\nNguyên liệu (/100 g·ml hoặc /cái):");
for (const i of all) {
  const n = i.nutrition;
  if (!n) {
    console.log(`  ${i.name}: (chưa có)`);
    continue;
  }
  const w = (n.warnings as string[] | null) ?? [];
  console.log(`  ${n.approved ? "✓" : "·"} ${i.name.padEnd(36)} ${n.basis === "PER_UNIT" ? "/cái" : "/100"} ${n.kcal ?? "?"} kcal · béo ${n.fatG ?? "?"} · đường ${n.sugarG ?? "?"} · đạm ${n.proteinG ?? "?"} · caf ${n.caffeineMg ?? "?"} mg · [${((n.allergens as string[]) ?? []).join(",")}]${n.isVegan ? " chay" : ""}${n.isSugarSource ? " tạo-ngọt" : ""}${n.source === "AI" ? ` · AI ${Math.round((n.confidence ?? 0) * 100)}%` : ""}${w.length ? `  ⚠ ${w.join("; ")}` : ""}`);
}

if (process.argv.includes("--approve")) {
  const ok = all.filter((i) => i.nutrition && [i.nutrition.kcal, i.nutrition.fatG, i.nutrition.sugarG, i.nutrition.caffeineMg].every((v) => v != null));
  await prisma.ingredientNutrition.updateMany({ where: { itemId: { in: ok.map((i) => i.id) } }, data: { approved: true, approvedAt: new Date() } });
  console.log(`\nĐã duyệt ${ok.length} nguyên liệu.`);
}
await recomputeAll();

console.log("\n== Kiểm tra bằng code ==");
const byName = async (s: string) => (await prisma.product.findFirstOrThrow({ where: { name: { contains: s } }, include: { nutrition: true } }));
const def = (p: Awaited<ReturnType<typeof byName>>) => p.nutrition.find((n) => n.size === "M") ?? p.nutrition.find((n) => n.size === "-")!;
const vals = (n: ReturnType<typeof def>): NutritionValues => ({ kcal: n.kcal, fatG: n.fatG, sugarG: n.sugarG, caffeineMg: n.caffeineMg, allergens: (n.allergens as NutritionValues["allergens"]) ?? [], isVegan: n.isVegan, complete: n.complete });

const den = def(await byName("Cà Phê Đen"));
const bx = def(await byName("Bạc Xỉu"));
check("Cà phê đen nhiều caffeine hơn bạc xỉu", den.complete && bx.complete && den.caffeineMg > bx.caffeineMg, `${den.caffeineMg} > ${bx.caffeineMg} mg`);
const ts = def(await byName("Trà Sữa Truyền Thống"));
check("Trà sữa nhiều đường (≥ 25 g)", ts.complete && ts.sugarG >= 25, `${ts.sugarG} g`);
const cr = def(await byName("Croissant"));
const crAll = ((cr.allergens as string[]) ?? []);
check("Croissant có gluten + sữa", crAll.includes("gluten") && crAll.includes("milk"), crAll.join(", "));

// Nguyên liệu chưa duyệt → không nhãn, không lọt bộ lọc loại trừ (thử trong transaction rồi huỷ)
await prisma.$transaction(async (tx) => {
  const milk = await tx.inventoryItem.findFirstOrThrow({ where: { name: { contains: "Sữa Tươi" } } });
  await tx.ingredientNutrition.update({ where: { itemId: milk.id }, data: { approved: false } });
  const latte = await tx.product.findFirstOrThrow({ where: { name: { contains: "Latte (Đá/Nóng)" } } });
  const m = (await calcProductNutrition(tx, latte.id)).find((r) => r.size === "M")!;
  check("Nguyên liệu chưa duyệt → món chưa đủ dữ liệu, không nhãn caffeine / đường", !m.complete && m.labels.caffeine === null && m.labels.sugar === null, `thiếu ${m.missing.map((x) => x.name).join(", ")}`);
  check("Món chưa đủ dữ liệu không lọt bộ lọc 'ít đường'", !fitsDiet(m, "low_sugar"));
  throw new Error("rollback");
}).catch((e) => { if (e.message !== "rollback") throw e; });

// Đổi định mức → số đổi theo
await prisma.$transaction(async (tx) => {
  const p = await tx.product.findFirstOrThrow({ where: { name: { contains: "Cà Phê Đen" } } });
  const coffee = await tx.inventoryItem.findFirstOrThrow({ where: { name: { contains: "Robusta" } } });
  const before = (await calcProductNutrition(tx, p.id)).find((r) => r.size === "M")!;
  await tx.productFormula.update({ where: { productId_itemId: { productId: p.id, itemId: coffee.id } }, data: { qtySizeM: 30 } });
  const after = (await calcProductNutrition(tx, p.id)).find((r) => r.size === "M")!;
  check("Tăng định mức cà phê → caffeine tăng", after.caffeineMg > before.caffeineMg, `${before.caffeineMg} → ${after.caffeineMg} mg`);
  throw new Error("rollback");
}).catch((e) => { if (e.message !== "rollback") throw e; });

// Lọc "không sữa": mọi món lọt qua không có cờ milk
const products = await prisma.product.findMany({ where: { isActive: true }, include: { nutrition: true } });
const noMilk = products.filter((p) => { const n = p.nutrition.find((x) => x.size === "M") ?? p.nutrition.find((x) => x.size === "-"); return n && fitsDiet(vals(n), "no_milk"); });
check("Lọc 'không sữa' không trả món có sữa", noMilk.every((p) => !p.nutrition.some((n) => ((n.allergens as string[]) ?? []).includes("milk"))), noMilk.map((p) => p.name).join(", ") || "(không món nào)");

console.log(failed ? `\n${failed} kiểm tra KHÔNG đạt` : "\nMọi kiểm tra đạt");
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
