/**
 * Kiểm thử đọc hoá đơn bằng AI:  npx tsx scripts/testInvoiceOcr.ts [poId]
 *
 * Với đơn mua mẫu (scripts/seedInvoiceDemo.ts), chạy extract + validate cho từng ảnh trong scripts/fixtures/invoices/
 * (Gemini thật), so với đáp án JSON cạnh ảnh: đọc được hay không, đúng mặt hàng, đúng số nhận (đơn vị kho), đúng hạn dùng,
 * mặt hàng ngoài đơn mua, cảnh báo mong đợi. Thêm kiểm tra bằng code (không cần AI): itemId ngoài đơn mua bị loại,
 * số vượt phần còn phải giao bị chặn, hoá đơn trùng bị cảnh báo. Ghi bảng kết quả vào docs/qa/invoice-ocr-ket-qua.md.
 */
import "dotenv/config";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import { prisma } from "../src/db.js";
import { buildPoContext, type PoContext } from "../src/lib/invoiceOcr/context.js";
import { extractInvoice, normalizeExtraction } from "../src/lib/invoiceOcr/extract.js";
import { applySharpness, validateExtraction, type Validated } from "../src/lib/invoiceOcr/validate.js";

type Answer = { readable: boolean; sharpness?: number; invoiceNo?: string; lines: Record<string, { receivedQty: number; expiryDate: string | null }>; unmatched?: string[]; flags: string[] };

const GAP_MS = Number(process.env.INVOICE_TEST_GAP_MS ?? 6000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
};

const argId = Number(process.argv.find((a) => /^\d+$/.test(a)));
const po = argId
  ? await prisma.purchaseOrder.findUnique({ where: { id: argId } })
  : await prisma.purchaseOrder.findFirst({ where: { status: { in: ["PENDING", "PARTIAL"] }, quote: { note: "[demo đọc hoá đơn]" } }, orderBy: { id: "desc" } });
if (!po) throw new Error("Chưa có đơn mua mẫu — chạy: npx tsx scripts/seedInvoiceDemo.ts");
const ctx = (await buildPoContext(prisma, po.id)) as PoContext;
const itemByName = (n: string) => ctx.lines.find((l) => l.name.toLowerCase().includes(n.toLowerCase()));
console.log(`Đơn mua ${ctx.poCode} — ${ctx.supplierName}: ${ctx.lines.map((l) => `${l.name} còn ${l.remaining}`).join("; ")}`);

/* ═══════════ 1. Kiểm tra bằng code (không gọi AI) ═══════════ */
console.log("\n== Kiểm tra bằng code ==");
{
  const sua = ctx.lines[0];
  const fake = normalizeExtraction({
    readable: true, legibility: 0.95, invoiceNo: "TEST-DUP", invoiceDate: "2026-11-07", supplierName: "Thực phẩm Minh Phát", totalAmount: null,
    lines: [
      { rawName: "Hàng lạ", itemId: 99999, matchConfidence: 0.95, qtyInvoice: 3, qtyStock: 3, unitPrice: 10000, lineTotal: 30000 },
      { rawName: sua.name, itemId: sua.itemId, matchConfidence: 0.95, qtyInvoice: sua.remaining + 5, qtyStock: sua.remaining + 5, unitPrice: sua.quotedPrice, lineTotal: (sua.remaining + 5) * sua.quotedPrice },
    ],
  });
  const v = await validateExtraction(prisma, fake, ctx);
  check("itemId ngoài đơn mua bị loại (vào 'Không có trong đơn mua')", v.unmatched.some((u) => u.rawName === "Hàng lạ") && !v.lines.some((l) => l.itemId === 99999));
  const d = v.lines.find((l) => l.itemId === sua.itemId)!;
  check("Giao dư: điền tối đa số còn phải giao + lỗi OVER", d.receivedQty === sua.remaining && d.flags.some((f) => f.code === "OVER" && f.level === "error"), `điền ${d.receivedQty}/${sua.remaining}`);

  // Hoá đơn trùng: tạm gắn số hoá đơn vào một phiếu nhập có sẵn của cùng NCC (nếu có) — không có thì bỏ qua
  const grn = await prisma.goodsReceipt.findFirst({ where: { po: { supplierId: ctx.supplierId } }, select: { id: true, invoiceNo: true } });
  if (grn) {
    await prisma.goodsReceipt.update({ where: { id: grn.id }, data: { invoiceNo: "TEST-DUP" } });
    const v2 = await validateExtraction(prisma, fake, ctx);
    await prisma.goodsReceipt.update({ where: { id: grn.id }, data: { invoiceNo: grn.invoiceNo } });
    check("Số hoá đơn trùng bị cảnh báo đỏ", v2.header.flags.some((f) => f.code === "DUPLICATE" && f.level === "error"));
  } else console.log("  · (bỏ qua kiểm tra trùng hoá đơn: NCC mẫu chưa có phiếu nhập nào)");
  const other = await validateExtraction(prisma, { ...fake, invoiceNo: null, supplierName: "Công ty Bao Bì ABC" }, ctx);
  check("Hoá đơn của NCC khác bị cảnh báo đỏ", other.header.supplierMismatch);
}

/* ═══════════ 2. Ảnh mẫu qua Gemini ═══════════ */
console.log("\n== Ảnh hoá đơn mẫu (Gemini thật) ==");
const dir = path.join(process.cwd(), "scripts/fixtures/invoices");
const files = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
const field = { readable: [0, 0], item: [0, 0], receivedQty: [0, 0], expiryDate: [0, 0], unmatched: [0, 0], flags: [0, 0] };
const rows: string[] = [];
const perf: { ms: number; tokens: number }[] = [];
const add = (k: keyof typeof field, ok: boolean) => {
  field[k][0] += Number(ok);
  field[k][1]++;
};

for (const f of files) {
  const ans = JSON.parse(readFileSync(path.join(dir, f.replace(/\.png$/, ".json")), "utf8")) as Answer;
  const img = `data:image/png;base64,${readFileSync(path.join(dir, f)).toString("base64")}`;
  await sleep(GAP_MS);
  let v: Validated;
  let ms = 0;
  let tokens = 0;
  let model = "";
  try {
    let out;
    try {
      out = await extractInvoice({ images: [img], ctx });
    } catch (e) {
      if (!String(e).includes("429")) throw e;
      await sleep(60_000);
      out = await extractInvoice({ images: [img], ctx });
    }
    v = await validateExtraction(prisma, applySharpness(out.extraction, ans.sharpness != null ? [ans.sharpness] : undefined), ctx);
    ms = out.latencyMs;
    tokens = out.tokensIn + out.tokensOut;
    model = out.model;
    perf.push({ ms, tokens });
  } catch (e) {
    console.log(`✗ ${f}: LỖI ${String(e).slice(0, 200)}`);
    failed++;
    rows.push(`| ${f} | LỖI | | | | | | |`);
    continue;
  }
  console.log(`\n${f} — ${ms}ms, ${tokens} token, ${model}`);
  console.log(`  độ nét ${ans.sharpness ?? "?"} · độ rõ AI ${Math.round(v.legibility * 100)}% · đọc được: ${v.readable}${v.reason ? ` (${v.reason})` : ""} · số HĐ ${v.header.invoiceNo ?? "—"} · tổng ${v.totals.invoice ?? "—"}`);
  for (const l of v.lines) console.log(`  · ${l.name}: nhận ${l.receivedQty}${l.expiryDate ? ` HSD ${l.expiryDate}` : ""}${l.invoice ? ` ← "${l.invoice.rawName}" ${l.invoice.qtyInvoice} ${l.invoice.unitInvoice ?? ""}${l.invoice.conversionNote ? ` (${l.invoice.conversionNote})` : ""}` : ""}${l.flags.length ? ` [${l.flags.map((x) => x.code).join(",")}]` : ""}`);
  for (const u of v.unmatched) console.log(`  · ngoài đơn mua: "${u.rawName}" ${u.qtyInvoice} ${u.unitInvoice ?? ""}`);
  for (const h of v.header.flags) console.log(`  ! ${h.text}`);

  add("readable", v.readable === ans.readable);
  check("Đọc được / không đọc được đúng", v.readable === ans.readable);
  let ok = { item: 0, qty: 0, exp: 0, n: 0 };
  if (ans.readable) {
    for (const l of v.lines) {
      const key = Object.keys(ans.lines).find((k) => l.name.toLowerCase().includes(k.toLowerCase()));
      const want = key ? ans.lines[key] : null;
      ok.n++;
      // Mặt hàng: có trên hoá đơn ⇔ có trong đáp án
      const itemOk = !!l.invoice === !!want;
      add("item", itemOk);
      ok.item += Number(itemOk);
      if (want) {
        const q = l.receivedQty === want.receivedQty;
        const e = (l.expiryDate ?? null) === want.expiryDate;
        add("receivedQty", q);
        add("expiryDate", e);
        ok.qty += Number(q);
        ok.exp += Number(e);
        if (!q || !e) console.log(`  ✗ ${l.name}: mong đợi nhận ${want.receivedQty}${want.expiryDate ? ` HSD ${want.expiryDate}` : ""}`);
      }
    }
    for (const u of ans.unmatched ?? []) add("unmatched", v.unmatched.some((x) => x.rawName.toLowerCase().includes(u.toLowerCase())));
    for (const fl of ans.flags) {
      const [code, name] = fl.split(":");
      const hit = v.lines.some((l) => l.name.toLowerCase().includes(name.toLowerCase()) && l.flags.some((x) => x.code === code));
      add("flags", hit);
      if (!hit) console.log(`  ✗ thiếu cảnh báo ${fl}`);
    }
  }
  const wantLines = Object.keys(ans.lines).length;
  rows.push(`| ${f} | ${v.readable ? "có" : "không"}${v.readable !== ans.readable ? " ✗" : ""} | ${ans.readable ? `${ok.item}/${ok.n}` : "—"} | ${ans.readable ? `${ok.qty}/${wantLines}` : "—"} | ${ans.readable ? `${ok.exp}/${wantLines}` : "—"} | ${v.unmatched.map((u) => u.rawName).join(", ") || "—"} | ${[...v.header.flags.map((x) => x.code), ...v.lines.flatMap((l) => l.flags.map((x) => x.code))].join(", ") || "—"} | ${ms} |`);
}

const rate = ([a, b]: number[]) => (b ? `${a}/${b} (${Math.round((a / b) * 100)}%)` : "—");
const avgMs = perf.length ? Math.round(perf.reduce((s, p) => s + p.ms, 0) / perf.length) : 0;
const avgTok = perf.length ? Math.round(perf.reduce((s, p) => s + p.tokens, 0) / perf.length) : 0;
const summary = [
  `Nhận ra đọc được / không: ${rate(field.readable)}`,
  `Đúng mặt hàng (có / không có trên hoá đơn): ${rate(field.item)}`,
  `Đúng số nhận (đơn vị kho, đã quy đổi): ${rate(field.receivedQty)}`,
  `Đúng hạn sử dụng: ${rate(field.expiryDate)}`,
  `Nhận ra mặt hàng ngoài đơn mua: ${rate(field.unmatched)}`,
  `Có cảnh báo mong đợi (giá khác, giao thiếu, cận hạn): ${rate(field.flags)}`,
  `Thời gian đọc trung bình: ${avgMs} ms · Token trung bình: ${avgTok} / ảnh`,
];
console.log(`\n${summary.join("\n")}`);
console.log(failed ? `\n${failed} kiểm tra KHÔNG đạt` : "\nMọi kiểm tra đạt");

const md = `# Đọc hoá đơn nhà cung cấp bằng AI — kết quả bộ ảnh mẫu

Chạy: \`npx tsx scripts/testInvoiceOcr.ts\` · ${new Date().toLocaleString("vi-VN")} · đơn mua ${ctx.poCode} (${ctx.lines.length} mặt hàng) · ${files.length} ảnh trong \`backend-node/scripts/fixtures/invoices/\` (dựng bằng \`make.mjs\`)

${summary.map((s) => `- ${s}`).join("\n")}

| Ảnh | Đọc được | Mặt hàng | Số nhận | HSD | Ngoài đơn mua | Cảnh báo | ms |
|---|---|:-:|:-:|:-:|---|---|--:|
${rows.join("\n")}

Ảnh mẫu: hoá đơn in chuẩn, quy đổi thùng → hộp, giá khác báo giá + giao thiếu, có mặt hàng ngoài đơn mua, phiếu giao viết tay, ảnh mờ, hàng cận hạn.
`;
mkdirSync(path.join(process.cwd(), "../docs/qa"), { recursive: true });
writeFileSync(path.join(process.cwd(), "../docs/qa/invoice-ocr-ket-qua.md"), md);
console.log("Đã ghi docs/qa/invoice-ocr-ket-qua.md");
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
