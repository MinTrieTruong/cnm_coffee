/**
 * Kiểm thử AI phác thảo món mới:  npx tsx scripts/testMenuDraft.ts [storeId] [--no-ai] [--md]
 *
 * Gọi Gemini thật cho 4 đầu vào (từ khóa "matcha dua", "cold brew cam"; ý tưởng "đá xay sầu riêng", "bánh ăn kèm cà phê sáng"),
 * in phương án, định mức, giá vốn, giá gợi ý, lãi gộp, cảnh báo, token. --md: ghi docs/qa/menu-draft-ket-qua.md
 * Kiểm tra bằng code (không AI, luôn chạy):
 *  - itemId bịa bị loại, lượng 0 bị bỏ, S/M/L sai thứ tự được sắp lại, tên trùng món bị báo lỗi
 *  - giá vốn phương án = định mức × giá nhập, khớp đúng giá vốn hệ thống của món Bạc Xỉu khi chép y định mức
 *  - đổi giá nhập (trong transaction rồi huỷ) → giá vốn phương án đổi theo
 *  - giá bán gợi ý = ceil(giá vốn ÷ trung vị tỉ lệ cùng danh mục), lãi gộp đúng công thức
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { prisma } from "../src/db.js";
import { productCosts } from "../src/lib/productCost.js";
import { buildDraftContext } from "../src/lib/menuDraft/context.js";
import { generateDraft, type DraftOption } from "../src/lib/menuDraft/generate.js";
import { evaluateOption, loadEvalData, type EvaluatedOption } from "../src/lib/menuDraft/evaluate.js";

let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
};
const args = process.argv.slice(2);
const storeId = Number(args.find((a) => /^\d+$/.test(a)) ?? 1);
const vnd = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("vi-VN")}đ`);
const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

/* ═══════════ Kiểm tra bằng code ═══════════ */
console.log("▸ Kiểm tra bằng code");
const data = await loadEvalData(prisma, storeId);
const bacXiu = await prisma.product.findFirstOrThrow({ where: { name: "Bạc Xỉu Đá" }, include: { formulas: true } });
const copy: DraftOption = {
  name: "Thử Nghiệm Bạc Xỉu", description: "", categoryId: bacXiu.categoryId, temps: "BOTH", hasSizes: true, steps: [], whyFits: "", risk: null,
  lines: bacXiu.formulas.map((f) => ({ itemId: f.itemId, newIngredient: null, qtyS: f.qtySizeS, qtyM: f.qtySizeM ?? f.qtyPerUnit, qtyL: f.qtySizeL, recipeUnit: f.recipeUnit ?? "", role: "other" as const })),
};
const evCopy = evaluateOption(data, copy);
const sys = (await productCosts(prisma, [bacXiu.id])).get(bacXiu.id)!;
check("giá vốn S/M/L khớp màn Công thức & giá vốn (chép định mức Bạc Xỉu)", ["S", "M", "L"].every((s) => evCopy.costs[s as "S"] === Math.round(sys[s as "S"])), `${evCopy.costs.S}/${evCopy.costs.M}/${evCopy.costs.L} vs ${Math.round(sys.S)}/${Math.round(sys.M)}/${Math.round(sys.L)}`);
const r = evCopy.categoryPriceRange!;
check("giá gợi ý = ceil(giá vốn ÷ tỉ lệ trung vị, 1.000đ)", evCopy.suggestedPrice.M === Math.ceil(evCopy.costs.M / r.costRatio / 1000) * 1000 || Math.abs(evCopy.suggestedPrice.M! - Math.ceil(evCopy.costs.M / r.costRatio / 1000) * 1000) <= 1000, `M ${vnd(evCopy.suggestedPrice.M)}, tỉ lệ ${pct(r.costRatio)} (${r.count} món ${r.scope})`);
check("lãi gộp = 1 − giá vốn / giá bán", Math.abs(evCopy.margin.M! - (1 - evCopy.costs.M / evCopy.suggestedPrice.M!)) < 0.001, pct(evCopy.margin.M));

const bad = evaluateOption(data, {
  ...copy,
  name: "Bạc Xỉu Đá",
  lines: [
    { itemId: 99999, newIngredient: null, qtyS: 1, qtyM: 2, qtyL: 3, recipeUnit: "g", role: "base" },
    { itemId: 1, newIngredient: null, qtyS: 20, qtyM: 10, qtyL: 14, recipeUnit: "g", role: "base" },
    { itemId: 4, newIngredient: null, qtyS: 0, qtyM: 0, qtyL: 0, recipeUnit: "ml", role: "milk" },
  ],
});
check("itemId bịa bị loại", !bad.lines.some((l) => l.itemId === 99999) && bad.warnings.some((w) => /#99999/.test(w.text)));
check("lượng 0 bị bỏ", !bad.lines.some((l) => l.itemId === 4));
check("S/M/L sai thứ tự được sắp lại", bad.lines[0]?.qtyS === 10 && bad.lines[0]?.qtyM === 14 && bad.lines[0]?.qtyL === 20);
check("tên trùng món đang bán bị báo lỗi", bad.warnings.some((w) => w.level === "danger" && /trùng/.test(w.text)));
const noMatcha = evaluateOption(data, { ...copy, name: "Matcha Thử" });
check("tên có matcha mà định mức không có matcha → cảnh báo", noMatcha.warnings.some((w) => /matcha/.test(w.text)));

// Đổi giá nhập trong transaction rồi huỷ → giá vốn phương án đổi theo
const before = evCopy.costs.M;
await prisma
  .$transaction(async (tx) => {
    await tx.inventoryItem.update({ where: { id: 1 }, data: { unitCostPrice: { increment: 100000 } } });
    const items = await tx.inventoryItem.findMany();
    const d2 = { ...data, items: new Map(items.map((i) => [i.id, i])) };
    const after = evaluateOption(d2, copy).costs.M;
    const line = copy.lines.find((l) => l.itemId === 1)!;
    check("đổi giá nhập → giá vốn phương án đổi theo", after - before === Math.round((line.qtyM / 1000) * 100000), `${vnd(before)} → ${vnd(after)}`);
    throw new Error("rollback");
  })
  .catch((e) => {
    if (String(e).includes("rollback")) return;
    throw e;
  });

/* ═══════════ 4 đầu vào mẫu (Gemini thật) ═══════════ */
const INPUTS: { term?: string; idea?: string }[] = [
  { term: "matcha dua" },
  { term: "cold brew cam" },
  { idea: "đá xay sầu riêng" },
  { idea: "bánh ăn kèm cà phê sáng" },
];
const md: string[] = ["# AI phác thảo món mới — kết quả 4 đầu vào mẫu", "", `Chi nhánh #${storeId}, ${new Date().toLocaleString("vi-VN")}. Giá vốn do hệ thống tính (định mức × giá nhập hiện tại); AI chỉ chọn nguyên liệu + định lượng.`, ""];

if (!args.includes("--no-ai")) {
  let totalIn = 0, totalOut = 0;
  for (const input of INPUTS) {
    const label = input.term ? `từ khóa "${input.term}"` : `ý tưởng "${input.idea}"`;
    console.log(`\n▸ AI phác thảo — ${label}`);
    md.push(`## ${label[0].toUpperCase()}${label.slice(1)}`, "");
    const ctx = await buildDraftContext(prisma, { storeId, ...input });
    try {
      const out = await generateDraft(ctx);
      totalIn += out.tokensIn;
      totalOut += out.tokensOut;
      const ev = out.result.options.map((o) => evaluateOption(data, o));
      const meta = `${out.model}, ${(out.latencyMs / 1000).toFixed(1)} s, ${out.tokensIn} + ${out.tokensOut} token · món mẫu: ${ctx.samples.map((s) => s.name).join(", ")}`;
      console.log(`  AI hiểu: ${out.result.understood}\n  ${meta}${ctx.demand ? ` · ${ctx.demand.searchers} khách tìm / ${ctx.demand.days} ngày` : ""}`);
      md.push(`AI hiểu: *${out.result.understood}*  `, `${meta}`, "");
      for (const o of ev) printOption(o);
      check("2–3 phương án", ev.length >= 2 && ev.length <= 3, `${ev.length}`);
      check("mọi itemId AI chọn đều có trong kho", out.result.options.every((o) => o.lines.every((l) => l.itemId == null || data.items.has(l.itemId))));
      check("phương án có giá vốn > 0", ev.every((o) => o.costs.M > 0));
    } catch (e) {
      console.log(`  ✗ Gemini lỗi: ${String(e).slice(0, 200)}`);
      md.push(`Gemini lỗi: ${String(e).slice(0, 200)}`, "");
      failed++;
    }
  }
  console.log(`\nTổng token: ${totalIn} vào + ${totalOut} ra`);
  md.push(`Tổng token 4 lần: ${totalIn} vào + ${totalOut} ra.`, "");
}

function printOption(o: EvaluatedOption) {
  const sizes = o.hasSizes ? (["S", "M", "L"] as const) : (["M"] as const);
  console.log(`\n  ■ ${o.name} — ${o.categoryName ?? "?"} · ${o.temps}${o.estimated ? " · có số ước tính" : ""}`);
  console.log(`    ${o.description}`);
  for (const l of o.lines) {
    const q = o.hasSizes ? `${l.qtyS}/${l.qtyM}/${l.qtyL}` : `${l.qtyM}`;
    console.log(`    - ${l.name}${l.newIngredient ? " [MỚI]" : ""}${l.inStock === false && !l.newIngredient ? " [hết ở CN]" : ""}: ${q} ${l.recipeUnit} → ${vnd(l.cost.M)}/ly M`);
  }
  console.log(`    Giá vốn ${sizes.map((s) => `${s} ${vnd(o.costs[s])}`).join(" · ")}`);
  console.log(`    Giá gợi ý ${sizes.map((s) => `${s} ${vnd(o.suggestedPrice[s])}`).join(" · ")} · lãi gộp ${sizes.map((s) => pct(o.margin[s])).join(" / ")}` + (o.categoryPriceRange ? ` · cùng danh mục ${vnd(o.categoryPriceRange.min)}–${vnd(o.categoryPriceRange.max)}` : ""));
  if (o.volumeMl) console.log(`    Thể tích lỏng ${o.volumeMl.S}/${o.volumeMl.M}/${o.volumeMl.L} ml`);
  if (o.nutrition) console.log(`    Dinh dưỡng M: ${o.nutrition.kcal} kcal, ${o.nutrition.caffeineMg} mg caffeine, ${o.nutrition.sugarG} g đường${o.nutrition.complete ? "" : " (chưa đủ dữ liệu)"}`);
  if (o.toBuy.length) console.log(`    Cần mua: ${o.toBuy.map((t) => `${t.name} (${t.kind === "NEW" ? `mới, ~${t.estCostPerRecipeUnit}đ/${t.recipeUnit}` : "hết ở chi nhánh"})`).join(", ")}`);
  for (const w of o.warnings) console.log(`    ${w.level === "danger" ? "⛔" : "⚠"} ${w.text}`);
  console.log(`    Vì sao hợp: ${o.whyFits}${o.risk ? ` · Rủi ro: ${o.risk}` : ""}`);

  md.push(`### ${o.name} (${o.categoryName ?? "?"}, ${o.temps})`, "", o.description, "", "| Nguyên liệu | S | M | L | Tiền / ly M |", "|---|---:|---:|---:|---:|");
  for (const l of o.lines) md.push(`| ${l.name}${l.newIngredient ? " *(mới, ước tính)*" : ""} | ${l.qtyS ?? ""} | ${l.qtyM} ${l.recipeUnit} | ${l.qtyL ?? ""} | ${vnd(l.cost.M)} |`);
  md.push(
    "",
    `- Giá vốn: ${sizes.map((s) => `${s} ${vnd(o.costs[s])}`).join(" · ")}${o.estimated ? " *(có phần ước tính)*" : ""}`,
    `- Giá gợi ý: ${sizes.map((s) => `${s} ${vnd(o.suggestedPrice[s])}`).join(" · ")} — lãi gộp ${sizes.map((s) => pct(o.margin[s])).join(" / ")}`,
    ...(o.toBuy.length ? [`- Cần mua thêm: ${o.toBuy.map((t) => t.name).join(", ")}`] : []),
    ...o.warnings.map((w) => `- ${w.level === "danger" ? "⛔" : "⚠"} ${w.text}`),
    `- Cách pha: ${o.steps.map((s, i) => `${i + 1}. ${s}`).join(" ")}`,
    `- Vì sao hợp: ${o.whyFits}${o.risk ? ` — Rủi ro: ${o.risk}` : ""}`,
    "",
  );
}

if (args.includes("--md")) {
  writeFileSync("../docs/qa/menu-draft-ket-qua.md", md.join("\n"), "utf8");
  console.log("→ docs/qa/menu-draft-ket-qua.md");
}
console.log(failed ? `\n✗ ${failed} kiểm tra không đạt` : "\n✓ Tất cả kiểm tra đạt");
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
