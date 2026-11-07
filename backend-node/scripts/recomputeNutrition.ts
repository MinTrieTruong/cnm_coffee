/**
 * Tính lại dinh dưỡng mọi món từ công thức × dinh dưỡng nguyên liệu đã duyệt:  npx tsx scripts/recomputeNutrition.ts [--md]
 * In bảng món × size (kcal, caffeine, đường, béo, nhãn). --md: ghi thêm docs/qa/nutrition-bang-mon.md.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { prisma } from "../src/db.js";
import { recomputeAll } from "../src/lib/nutrition/compute.js";
import { ALLERGEN_LABEL, type Allergen, type Labels } from "../src/lib/nutrition/labels.js";

const n = await recomputeAll();
const rows = await prisma.productNutrition.findMany({ include: { product: { select: { name: true } } }, orderBy: [{ productId: "asc" }, { size: "asc" }] });
const order = (s: string) => "SML-".indexOf(s);
rows.sort((a, b) => a.productId - b.productId || order(a.size) - order(b.size));

const labelText = (l: Labels | null) => {
  if (!l) return "";
  return [
    l.caffeine === "none" ? "Không caffeine" : l.caffeine === "low" ? "Ít caffeine" : l.caffeine === "high" ? "Caffeine cao" : "",
    l.sugar === "high" ? "Nhiều đường" : l.sugar === "low" ? "Ít đường" : "",
    l.fat === "high" ? "Nhiều béo" : l.fat === "low" ? "Ít béo" : "",
    l.vegan ? "Thuần chay" : "",
    ...(l.allergens ?? []).map((a: Allergen) => `Có ${ALLERGEN_LABEL[a]}`),
  ].filter(Boolean).join(", ");
};

console.log(`Đã tính lại ${n} món.\n`);
const lines = rows.map((r) => {
  const l = r.labels as Labels | null;
  const missing = (r.missing as { name: string }[] | null)?.map((m) => m.name).join(", ");
  return { name: r.product.name, size: r.size, kcal: Math.round(r.kcal), caf: Math.round(r.caffeineMg), sugar: r.sugarG, fat: r.fatG, complete: r.complete, labels: labelText(l), missing };
});
for (const x of lines) {
  console.log(`${x.name.padEnd(34)} ${x.size}  ${String(x.kcal).padStart(4)} kcal  ${String(x.caf).padStart(4)} mg caf  ${String(x.sugar).padStart(5)} g đường  ${String(x.fat).padStart(5)} g béo  ${x.complete ? x.labels : `THIẾU: ${x.missing}`}`);
}

if (process.argv.includes("--md")) {
  const md = `# Dinh dưỡng ước tính các món (tính từ công thức)

Chạy: \`npx tsx scripts/recomputeNutrition.ts --md\` · ${new Date().toLocaleString("vi-VN")}

Món = Σ định mức nguyên liệu theo size × dinh dưỡng nguyên liệu đã duyệt. Đường / kcal ở mức đường 100%.

| Món | Size | kcal | Caffeine (mg) | Đường (g) | Béo (g) | Nhãn |
|---|:-:|--:|--:|--:|--:|---|
${lines.map((x) => `| ${x.name} | ${x.size} | ${x.kcal} | ${x.caf} | ${x.sugar} | ${x.fat} | ${x.complete ? x.labels || "—" : `chưa đủ dữ liệu (${x.missing})`} |`).join("\n")}
`;
  mkdirSync(path.join(process.cwd(), "../docs/qa"), { recursive: true });
  writeFileSync(path.join(process.cwd(), "../docs/qa/nutrition-bang-mon.md"), md);
  console.log("\nĐã ghi docs/qa/nutrition-bang-mon.md");
}
await prisma.$disconnect();
