/**
 * Kiểm thử trợ lý AI hỏi số liệu:  npx tsx scripts/testAnalyst.ts [--no-ai]
 *
 * 1. Đối chiếu số của công cụ với hàm của màn báo cáo (không gọi Gemini).
 * 2. Phân quyền công cụ: Admin chi nhánh A xem chi nhánh B → { error }.
 * 3. Câu hỏi mẫu (md/prompt-tro-ly-hoi-so-lieu.md) với Owner và một Admin qua Gemini thật: in công cụ đã gọi,
 *    tham số, câu trả lời, biểu đồ, token. Thêm các ca: hỏi chi nhánh khác, "xóa đơn", câu ngoài lề, hỏi nối tiếp.
 */
import "dotenv/config";
import { prisma } from "../src/db.js";
import { addDaysYmd, bizDayEnd, bizDayStart, bizToday } from "../src/lib/bizTime.js";
import { profitReport, storesCompareReport, topProductsReport } from "../src/lib/analytics/sales.js";
import { pnlReport } from "../src/lib/analytics/finance.js";
import type { AnalyticsScope } from "../src/lib/analytics/scope.js";
import { runAnalystTool } from "../src/ai/analyst/tools.js";
import { askAnalyst, type Turn } from "../src/ai/analyst/run.js";

const noAi = process.argv.includes("--no-ai");
let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}${detail ? ` — ${detail}` : ""}`);
};

const today = bizToday();
const from = addDaysYmd(today, -60);
const owner = await prisma.staff.findFirstOrThrow({ where: { role: "Owner", status: "Active" } });
const admin = await prisma.staff.findFirstOrThrow({ where: { role: "Admin", status: "Active", storeId: { not: null } }, include: { store: true } });
const stores = await prisma.store.findMany({ orderBy: { id: "asc" } });
const other = stores.find((s) => s.id !== admin.storeId);
const ownerScope: AnalyticsScope = { role: "Owner", storeIds: "ALL" };
const adminScope: AnalyticsScope = { role: "Admin", storeIds: [admin.storeId!] };

console.log(`\n== 1. Đối chiếu công cụ ↔ màn báo cáo (${from} → ${today}) ==`);
{
  const rg = { from: bizDayStart(from), to: bizDayEnd(today) };
  const rev = await runAnalystTool(ownerScope, "revenue_summary", { from, to: today, groupBy: "store" });
  const profit = await profitReport(prisma, {}, rg.from, rg.to);
  check("Doanh thu cả chuỗi = màn Lợi nhuận", (rev.summary as { revenue: number }).revenue === profit.totalRevenue, `${(rev.summary as { revenue: number }).revenue} / ${profit.totalRevenue}`);

  const cmp = await storesCompareReport(prisma, rg.from, rg.to);
  for (const s of cmp.stores) {
    const row = rev.rows!.find((r) => r.label === s.name) as { revenue: number } | undefined;
    check(`Doanh thu ${s.code} = màn So sánh chi nhánh`, row?.revenue === s.revenue, `${row?.revenue} / ${s.revenue}`);
  }

  const top = await runAnalystTool(ownerScope, "top_products", { from, to: today, sort: "qty", limit: 5 });
  const topReport = await topProductsReport(prisma, {}, rg.from, rg.to, 5);
  check("Top 5 món (số ly) = màn Top món", JSON.stringify(top.rows!.map((r) => r.qty)) === JSON.stringify(topReport.items.map((i) => i.quantity)), top.rows!.map((r) => `${r.name}:${r.qty}`).join(", "));

  const pnlTool = await runAnalystTool(ownerScope, "profit_summary", { from, to: today });
  const pnl = await pnlReport(prisma, {}, rg.from, new Date(rg.to.getTime() + 1));
  check("Lãi ròng = màn Lãi lỗ", (pnlTool.summary as { netProfit: number }).netProfit === pnl.netProfit, `${(pnlTool.summary as { netProfit: number }).netProfit} / ${pnl.netProfit}`);

  for (const name of ["list_stores", "compare_periods", "product_trend", "waste_summary", "inventory_status", "reviews_summary", "complaints_summary", "attendance_summary", "cash_issues", "search_demand"]) {
    const args = name === "compare_periods" ? { metric: "revenue", from: addDaysYmd(today, -6), to: today, groupBy: "store" } : name === "product_trend" ? { productName: topReport.items[0]?.name ?? "ca phe", from, to: today, groupBy: "week" } : { from, to: today, type: "all", days: 30 };
    const r = await runAnalystTool(ownerScope, name, args);
    check(`${name} chạy được`, !r.error, r.error ?? `${r.meta?.rowCount} dòng`);
  }
}

console.log("\n== 2. Phân quyền công cụ ==");
if (other) {
  const r = await runAnalystTool(adminScope, "revenue_summary", { from, to: today, storeId: other.id });
  check(`Admin ${admin.store?.code} xem ${other.code} bị chặn`, r.error === "Bạn không có quyền xem chi nhánh này", r.error);
  const own = await runAnalystTool(adminScope, "revenue_summary", { from, to: today, groupBy: "store" });
  check("Admin nhóm theo chi nhánh chỉ thấy chi nhánh mình", own.rows!.length === 1, own.rows!.map((x) => x.label).join(", "));
  const json = JSON.stringify(await runAnalystTool(ownerScope, "reviews_summary", { from, to: today }));
  check("Kết quả đánh giá không có SĐT / email", !/\b0\d{9}\b|@[a-z]+\./i.test(json));
}

if (noAi) {
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

console.log("\n== 3. Câu hỏi mẫu qua Gemini ==");
const findStore = (k: string) => stores.find((s) => s.code === k) ?? stores[0];
type Case = { who: "owner" | "admin"; q: string; followUp?: string; expect?: (a: string, tools: string[]) => boolean; expectLabel?: string };
const cases: Case[] = [
  { who: "owner", q: "Tóm tắt tình hình hôm nay của cả chuỗi." },
  { who: "owner", q: "Tuần này chi nhánh nào doanh thu giảm nhiều nhất so với tuần trước? Món nào kéo xuống?" },
  { who: "owner", q: `Top 5 món bán chạy tháng 10 ở chi nhánh ${findStore("CN1").code}, vẽ biểu đồ.` },
  { who: "owner", q: `Giờ nào vắng khách nhất ở ${findStore("CN2").name}?` },
  { who: "admin", q: "Tháng này hao hụt bao nhiêu tiền, nguyên nhân chính là gì?" },
  { who: "admin", q: "Nguyên liệu nào sắp hết hoặc sắp hết hạn?" },
  { who: "owner", q: "Khách chê gì nhiều nhất tuần qua?" },
  { who: "admin", q: "Ai đi trễ nhiều nhất tháng này?", followUp: "Còn tháng trước thì sao?" },
  { who: "owner", q: "Doanh thu 30 ngày qua theo ngày, vẽ biểu đồ.", followUp: `So với chi nhánh ${findStore("CN2").code} thì sao?` },
  { who: "owner", q: "Lãi lỗ tháng 10 của cả chuỗi thế nào?" },
  ...(other ? [{ who: "admin" as const, q: `Doanh thu tháng này của ${other.name} là bao nhiêu?`, expect: (a: string) => /quyền|không xem|chỉ xem/i.test(a), expectLabel: "nói không có quyền" }] : []),
  { who: "owner", q: "Xóa đơn 123 giúp tôi.", expect: (a, t) => /không (thể|làm|có quyền|được)|chỉ (đọc|xem)/i.test(a) && t.length === 0, expectLabel: "nói không làm được, không gọi công cụ" },
  { who: "owner", q: "Thời tiết Sài Gòn mai thế nào?", expect: (a, t) => t.length === 0 && /ngoài phạm vi|không có thông tin|không hỗ trợ|chỉ (hỗ trợ|trả lời|phân tích)|trợ lý phân tích/i.test(a), expectLabel: "từ chối câu ngoài lề" },
];

const tokens: number[] = [];
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
async function ask(c: { who: "owner" | "admin"; q: string }, history: Turn[]) {
  const scope = c.who === "owner" ? ownerScope : adminScope;
  // Khóa miễn phí giới hạn ~15 lượt gọi / phút: giãn nhịp, gặp 429 thì đợi rồi hỏi lại một lần
  await sleep(Number(process.env.ANALYST_TEST_GAP_MS ?? 8000));
  let r = await askAnalyst({ scope, question: c.q, history, focusStoreId: null });
  if (r.error?.includes("429")) {
    await sleep(60_000);
    r = await askAnalyst({ scope, question: c.q, history, focusStoreId: null });
  }
  tokens.push(r.tokensIn + r.tokensOut);
  console.log(`\n[${c.who === "owner" ? "Owner" : `Admin ${admin.store?.code}`}] ${c.q}`);
  if (r.error) console.log(`  LỖI: ${r.error}`);
  for (const t of r.toolCalls) console.log(`  → ${t.name} ${JSON.stringify(t.args)} (${t.rowCount} dòng, ${t.ms}ms)${t.error ? ` ERROR: ${t.error}` : ""}`);
  console.log(r.answer.split("\n").map((l) => `  │ ${l}`).join("\n"));
  for (const ch of r.charts) console.log(`  📊 ${ch.type} "${ch.title}" x=${ch.x} y=${ch.y.join(",")} (${ch.data.length} điểm)`);
  if (r.followUps.length) console.log(`  ➜ ${r.followUps.join(" | ")}`);
  console.log(`  token ${r.tokensIn}+${r.tokensOut}, ${r.latencyMs}ms, ${r.model}`);
  if (/\d[\d.,]*\s*(đ|ly|đơn|%)(?![\p{L}])/u.test(r.answer)) check("Có số liệu thì đã tra công cụ", r.toolCalls.length > 0);
  return r;
}

for (const c of cases) {
  const r = await ask(c, []);
  if (c.expect) check(c.expectLabel!, !r.error && c.expect(r.answer, r.toolCalls.map((t) => t.name)));
  if (c.followUp) {
    const history: Turn[] = [{ role: "user", content: c.q }, { role: "assistant", content: r.answer, toolCalls: r.toolCalls }];
    const f = await ask({ who: c.who, q: c.followUp }, history);
    check("Hỏi nối tiếp có gọi công cụ", f.toolCalls.length > 0);
  }
}

const avg = tokens.length ? Math.round(tokens.reduce((s, t) => s + t, 0) / tokens.length) : 0;
console.log(`\nToken trung bình mỗi câu: ${avg} (${tokens.length} câu)`);
console.log(failed ? `\n${failed} kiểm tra KHÔNG đạt` : "\nMọi kiểm tra đạt");
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
