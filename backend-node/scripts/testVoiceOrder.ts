/**
 * Kiểm thử đặt món bằng câu tự nhiên:  npx tsx scripts/testVoiceOrder.ts [storeId] [--audio]
 *
 * Chạy bộ câu chữ mẫu qua parseOrder (Gemini thật), so với kết quả mong đợi: đúng món, đúng số lượng, đúng size
 * (và nóng/đá, đá, đường khi câu có nói). Ghi bảng kết quả vào docs/qa/voice-order-ket-qua.md để đưa vào báo cáo.
 * --audio: thử thêm các file ghi âm thật trong scripts/fixtures/voice/ (tên file = câu mong đợi, VD "hai bạc xỉu ít đá.webm").
 * Món "đang hết" lấy một món đang bán rồi tạm báo hết trong lúc chạy (xong trả lại như cũ).
 */
import "dotenv/config";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { prisma } from "../src/db.js";
import { unitPriceOf } from "../src/lib/menuPrice.js";
import { buildMenuContext, invalidateMenuContext } from "../src/lib/voiceOrder/menuContext.js";
import { parseOrder, type CartLine, type Channel, type ParseResult } from "../src/lib/voiceOrder/parse.js";

const storeId = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 1);
const withAudio = process.argv.includes("--audio");
const GAP_MS = Number(process.env.VOICE_TEST_GAP_MS ?? 5000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Exp = { name: string; qty: number; size?: "S" | "M" | "L" | null; temp?: "HOT" | "ICED"; ice?: number | null; sugar?: number | null };
type Case = { label: string; text: string; channel?: Channel; current?: Partial<CartLine>[]; expect: Exp[]; unknown?: string[]; soldout?: boolean };

const ctx = await buildMenuContext(storeId);
const byName = (needle: string) => {
  const p = ctx.products.find((x) => x.name.toLowerCase().includes(needle.toLowerCase()));
  if (!p) throw new Error(`Thực đơn chi nhánh ${storeId} không có món "${needle}"`);
  return p;
};

// Tạm báo hết một món để thử "món đang hết"
const soldTarget = byName("Cà Phê Muối");
const prevSp = await prisma.storeProduct.findUnique({ where: { storeId_productId: { storeId, productId: soldTarget.id } } });

const bx = byName("Bạc Xỉu");
const croissant = byName("Croissant");
const cases: Case[] = [
  { label: "Câu demo POS", text: "hai bạc xỉu ít đá, một trà đào size lớn ít ngọt, một croissant", expect: [{ name: "Bạc Xỉu", qty: 2, size: "M", ice: 50 }, { name: "Trà Đào", qty: 1, size: "L", sugar: 50 }, { name: "Croissant", qty: 1, size: null }] },
  { label: "Viết tắt (web)", text: "cf sữa đá ít ngọt vs 1 bánh mì que", channel: "WEB", expect: [{ name: "Cà Phê Sữa Đá", qty: 1, sugar: 50 }, { name: "Bánh Mì Que", qty: 1, size: null }] },
  { label: "Không dấu", text: "3 ca phe den da khong duong", expect: [{ name: "Cà Phê Đen Đá", qty: 3, sugar: 0 }] },
  { label: "Số bằng chữ (chục)", text: "một chục trà sữa trân châu đường đen size nhỏ", expect: [{ name: "Trà Sữa Trân Châu Đường Đen", qty: 10, size: "S" }] },
  { label: "Nóng / đá", text: "cho mình 2 latte nóng với 1 cappuccino đá", expect: [{ name: "Latte", qty: 2, temp: "HOT" }, { name: "Cappuccino", qty: 1, temp: "ICED" }] },
  { label: "Món chưa có", text: "matcha dừa", expect: [], unknown: ["matcha dừa"] },
  { label: "Tên gọi khác", text: "1 bx size L, 1 tiramisu", expect: [{ name: "Bạc Xỉu", qty: 1, size: "L" }, { name: "Tiramisu", qty: 1, size: null }] },
  { label: "Một cặp", text: "một cặp cà phê sữa ít đá", expect: [{ name: "Cà Phê Sữa Đá", qty: 2, ice: 50 }] },
  { label: "Hai món, không đá", text: "trà vải lài không đá, trà oolong bưởi hồng size vừa", expect: [{ name: "Trà Vải Lài", qty: 1, ice: 0 }, { name: "Trà Oolong Bưởi Hồng", qty: 1, size: "M" }] },
  { label: "Món đang hết", text: "cho một ly cà phê muối", expect: [], unknown: ["Cà Phê Muối"], soldout: true },
  { label: "Món chưa có (2)", text: "hai sinh tố bơ với một trà đào", expect: [{ name: "Trà Đào", qty: 1 }], unknown: ["sinh tố bơ"] },
  { label: "Sửa size", text: "à đổi bạc xỉu thành size L", current: [{ productId: bx.id, qty: 2, size: "M" }, { productId: croissant.id, qty: 1 }], expect: [{ name: "Bạc Xỉu", qty: 2, size: "L" }, { name: "Croissant", qty: 1, size: null }] },
  { label: "Bỏ món", text: "bỏ croissant", current: [{ productId: bx.id, qty: 2, size: "M" }, { productId: croissant.id, qty: 1 }], expect: [{ name: "Bạc Xỉu", qty: 2, size: "M" }] },
  { label: "Thêm một nữa", text: "thêm một bạc xỉu nữa", current: [{ productId: bx.id, qty: 2, size: "M" }], expect: [{ name: "Bạc Xỉu", qty: 3, size: "M" }] },
  { label: "% đá đường (web)", text: "ts truyen thong 50% duong 50% da", channel: "WEB", expect: [{ name: "Trà Sữa Truyền Thống", qty: 1, sugar: 50, ice: 50 }] },
  { label: "productId bịa bị loại", text: "thêm 1 cà phê đen", current: [{ productId: 99999, qty: 1 }], expect: [{ name: "Cà Phê Đen Đá", qty: 1 }] },
];

type Row = { label: string; text: string; ok: { product: boolean; qty: boolean; size: boolean; options: boolean; unknown: boolean; price: boolean }; got: string; ms: number; tokens: number; error?: string };
const rows: Row[] = [];

function score(c: Case, r: ParseResult): Row["ok"] {
  const lines = r.lines;
  const match = c.expect.map((e) => lines.find((l) => l.name.toLowerCase().includes(e.name.toLowerCase())));
  const product = match.every(Boolean) && lines.length === c.expect.length;
  const qty = product && c.expect.every((e, i) => match[i]!.qty === e.qty);
  const size = product && c.expect.every((e, i) => e.size === undefined || match[i]!.size === e.size);
  const options = product && c.expect.every((e, i) => (e.temp === undefined || match[i]!.temp === e.temp) && (e.ice === undefined || match[i]!.ice === e.ice) && (e.sugar === undefined || match[i]!.sugar === e.sugar));
  const unknown = (c.unknown ?? []).every((u) => r.unknown.some((x) => x.spokenName.toLowerCase().includes(u.toLowerCase()) || u.toLowerCase().includes(x.spokenName.toLowerCase()))) && (!c.soldout || r.unknown.some((x) => x.reason === "soldout"));
  // Giá luôn do backend tính
  const price = lines.every((l) => {
    const p = ctx.products.find((x) => x.id === l.productId);
    return !p || l.unitPrice === unitPriceOf(p, l.size ?? "M");
  });
  return { product, qty, size, options, unknown, price };
}

const fmtLine = (l: ParseResult["lines"][number]) =>
  `${l.qty}× ${l.name}${l.size && l.size !== "M" ? ` ${l.size}` : ""}${l.temp === "HOT" ? " nóng" : ""}${l.ice != null ? ` đá ${l.ice}%` : ""}${l.sugar != null ? ` đường ${l.sugar}%` : ""}${l.note ? ` (${l.note})` : ""}${l.confidence < 0.7 ? " [?]" : ""}`;

try {
  await prisma.storeProduct.upsert({ where: { storeId_productId: { storeId, productId: soldTarget.id } }, update: { outOfStock: true }, create: { storeId, productId: soldTarget.id, outOfStock: true } });
  invalidateMenuContext(storeId);

  for (const c of cases) {
    await sleep(GAP_MS);
    const t = Date.now();
    try {
      let r: ParseResult;
      try {
        r = await parseOrder({ storeId, channel: c.channel ?? "POS", text: c.text, current: c.current, sessionKey: "test-voice-order" });
      } catch (e) {
        // Khóa miễn phí: 429 → đợi rồi thử lại một lần
        if (!String(e).includes("429")) throw e;
        await sleep(60_000);
        r = await parseOrder({ storeId, channel: c.channel ?? "POS", text: c.text, current: c.current, sessionKey: "test-voice-order" });
      }
      const ok = score(c, r);
      const got = [r.lines.map(fmtLine).join("; "), r.unknown.length ? `chưa có: ${r.unknown.map((u) => `${u.spokenName}${u.reason === "soldout" ? " (hết)" : ""}${u.suggestions.length ? ` → ${u.suggestions.map((s) => s.name).join(", ")}` : ""}`).join("; ")}` : "", r.clarify ? `hỏi lại: ${r.clarify}` : ""].filter(Boolean).join(" | ");
      rows.push({ label: c.label, text: c.text, ok, got, ms: r.latencyMs, tokens: r.tokensIn + r.tokensOut });
      const pass = Object.values(ok).every(Boolean);
      console.log(`${pass ? "✓" : "✗"} [${c.label}] "${c.text}"\n    → ${got || "(trống)"}\n    ${r.latencyMs}ms, ${r.tokensIn}+${r.tokensOut} token, ${r.model}${pass ? "" : `  ${JSON.stringify(ok)}`}`);
    } catch (e) {
      rows.push({ label: c.label, text: c.text, ok: { product: false, qty: false, size: false, options: false, unknown: false, price: true }, got: "", ms: Date.now() - t, tokens: 0, error: String(e).slice(0, 200) });
      console.log(`✗ [${c.label}] LỖI ${String(e).slice(0, 200)}`);
    }
  }

  // File ghi âm thật (không bắt buộc)
  const dir = path.join(process.cwd(), "scripts/fixtures/voice");
  if (withAudio && existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => /\.(webm|ogg|mp4|m4a|wav|mp3)$/i.test(x))) {
      await sleep(GAP_MS);
      const ext = f.split(".").pop()!.toLowerCase();
      const mimeType = { webm: "audio/webm", ogg: "audio/ogg", mp4: "audio/mp4", m4a: "audio/mp4", wav: "audio/wav", mp3: "audio/mpeg" }[ext]!;
      const r = await parseOrder({ storeId, channel: "POS", audio: { data: readFileSync(path.join(dir, f)), mimeType }, sessionKey: "test-voice-order" });
      console.log(`🎤 ${f}\n    nghe: "${r.transcript}"\n    → ${r.lines.map(fmtLine).join("; ")} ${r.unknown.length ? `| chưa có: ${r.unknown.map((u) => u.spokenName).join(", ")}` : ""}\n    ${r.latencyMs}ms, ${r.tokensIn}+${r.tokensOut} token`);
    }
  }
} finally {
  // Trả lại trạng thái món đã tạm báo hết
  if (prevSp) await prisma.storeProduct.update({ where: { storeId_productId: { storeId, productId: soldTarget.id } }, data: { outOfStock: prevSp.outOfStock } });
  else await prisma.storeProduct.delete({ where: { storeId_productId: { storeId, productId: soldTarget.id } } }).catch(() => {});
  invalidateMenuContext(storeId);
  // Không để nhu cầu giả của bài test lẫn vào "Khách tìm kiếm"
  await prisma.searchLog.deleteMany({ where: { sessionKey: "test-voice-order" } });
}

const pct = (k: keyof Row["ok"]) => {
  const n = rows.filter((r) => r.ok[k]).length;
  return `${n}/${rows.length} (${Math.round((n / rows.length) * 100)}%)`;
};
const done = rows.filter((r) => !r.error);
const avgMs = done.length ? Math.round(done.reduce((s, r) => s + r.ms, 0) / done.length) : 0;
const avgTok = done.length ? Math.round(done.reduce((s, r) => s + r.tokens, 0) / done.length) : 0;
const summary = [
  `Đúng món: ${pct("product")}`,
  `Đúng số lượng: ${pct("qty")}`,
  `Đúng size: ${pct("size")}`,
  `Đúng nóng/đá, đá, đường: ${pct("options")}`,
  `Nhận ra món chưa có / đang hết: ${pct("unknown")}`,
  `Giá do backend tính: ${pct("price")}`,
  `Độ trễ trung bình: ${avgMs} ms · Token trung bình: ${avgTok} / lần`,
];
console.log(`\n${summary.join("\n")}`);

const mark = (b: boolean) => (b ? "✓" : "✗");
const md = `# Đặt món bằng câu tự nhiên — kết quả bộ câu mẫu

Chạy: \`npx tsx scripts/testVoiceOrder.ts ${storeId}\` · ${new Date().toLocaleString("vi-VN")} · chi nhánh #${storeId} · nhập bằng chữ (Gemini thật)

${summary.map((s) => `- ${s}`).join("\n")}

| # | Ca | Câu | Kết quả | Món | SL | Size | Tùy chọn | Chưa có | ms |
|---|---|---|---|:-:|:-:|:-:|:-:|:-:|--:|
${rows.map((r, i) => `| ${i + 1} | ${r.label} | ${r.text} | ${(r.error ? `LỖI: ${r.error}` : r.got || "(trống)").replace(/\|/g, "/")} | ${mark(r.ok.product)} | ${mark(r.ok.qty)} | ${mark(r.ok.size)} | ${mark(r.ok.options)} | ${mark(r.ok.unknown)} | ${r.ms} |`).join("\n")}
`;
mkdirSync(path.join(process.cwd(), "../docs/qa"), { recursive: true });
writeFileSync(path.join(process.cwd(), "../docs/qa/voice-order-ket-qua.md"), md);
console.log("Đã ghi docs/qa/voice-order-ket-qua.md");
await prisma.$disconnect();
