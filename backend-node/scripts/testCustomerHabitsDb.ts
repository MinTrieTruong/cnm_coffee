/**
 * Kiểm thử món quen với CSDL thật:  npx tsx scripts/testCustomerHabitsDb.ts [storeId]
 *
 * Trong 1 transaction (cuối cùng ROLLBACK — không để lại dữ liệu): tạo khách mới + 3 đơn Paid cùng món
 * "Size M · Đá 50% · Đường 50% · không ống hút", rồi kiểm tra getUsualItems (bộ tuỳ chọn quen, ghi chú quen),
 * noteSuggestion (gợi ý lưu ghi chú gõ ≥ 3 đơn), reorderLines (đặt lại đơn gần nhất) và khách chưa mua → rỗng.
 */
import "dotenv/config";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../src/db.js";
import { getUsualItems, noteSuggestion, reorderLines } from "../src/lib/customerHabits.js";

let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
};
const storeId = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 1);
const ROLLBACK = new Error("rollback");

try {
  await prisma.$transaction(async (tx) => {
    const db = tx as unknown as PrismaClient;
    // Món uống có cả nóng/đá đang bán ở chi nhánh
    const drink = await tx.product.findFirst({ where: { isActive: true, hasSizes: true, temps: "BOTH", outOfStock: false, storeProducts: { none: { storeId, OR: [{ isAvailable: false }, { outOfStock: true }] } } }, select: { id: true, name: true, sellPrice: true } });
    if (!drink) throw new Error("Không có món uống nóng/đá đang bán để thử.");
    const maxId = (await tx.customer.aggregate({ _max: { id: true } }))._max.id ?? 0;
    const c = await tx.customer.create({ data: { id: maxId + 1, fullName: "Khách thử món quen", phone: null } });
    const fresh = await tx.customer.create({ data: { id: maxId + 2, fullName: "Khách mới chưa mua", phone: null } });
    const notes = "Size M · Đá 50% · Đường 50% · không ống hút";
    for (let i = 0; i < 3; i++) {
      const at = new Date(Date.now() - (i * 3 + 1) * 86_400_000);
      await tx.order.create({
        data: {
          customerId: c.id, storeId, orderType: "Takeaway", status: "Paid", subTotal: drink.sellPrice, totalAmount: drink.sellPrice, createdAt: at, paidAt: at,
          details: { create: [{ productId: drink.id, quantity: 1, unitPrice: drink.sellPrice, size: "M", temperature: "ICED", customNotes: notes }] },
        },
      });
    }
    console.log(`\n▸ Khách #${c.id}: 3 đơn "${notes}" — món ${drink.name} (#${drink.id}), chi nhánh ${storeId}`);

    const items = await getUsualItems(db, c.id, { storeId });
    const top = items[0];
    check("món quen số 1 đúng món", top?.productId === drink.id, String(top?.productId));
    check("tuỳ chọn quen M · Đá 50% · Đường 50%", top?.usual.size === "M" && top.usual.temperature === "ICED" && top.usual.icePct === 50 && top.usual.sugar === "50", JSON.stringify(top?.usual));
    check("ghi chú quen 'không ống hút'", top?.usualNote === "không ống hút", String(top?.usualNote));
    check("độ tin cậy 1", top?.confidence === 1, String(top?.confidence));
    check("timesOrdered = 3", top?.timesOrdered === 3);

    const sugg = await noteSuggestion(db, c.id, null);
    check("gợi ý lưu ghi chú gõ ở 3 đơn", sugg === "không ống hút", String(sugg));
    check("đã lưu làm mặc định thì không gợi ý nữa", (await noteSuggestion(db, c.id, "Không ống hút")) === null);

    const last = await tx.order.findFirst({ where: { customerId: c.id }, orderBy: { paidAt: "desc" }, select: { id: true } });
    const re = last ? await reorderLines(db, last.id, storeId) : null;
    check("đặt lại: 1 dòng, còn bán", re?.lines.length === 1 && re.lines[0].available && !re.lines[0].soldOut);
    check("đặt lại giữ tuỳ chọn + ghi chú", re?.lines[0].usual.icePct === 50 && re.lines[0].note === "không ống hút", JSON.stringify(re?.lines[0]?.usual));

    check("khách chưa mua → không có món quen", (await getUsualItems(db, fresh.id, { storeId })).length === 0);
    check("lọc theo chi nhánh khác → không có món quen", (await getUsualItems(db, c.id, { storeId, orderWhere: { storeId: -1 } })).length === 0);
    throw ROLLBACK;
  }, { timeout: 30_000 });
} catch (e) {
  if (e !== ROLLBACK) {
    console.error(e);
    failed++;
  }
} finally {
  await prisma.$disconnect();
}
console.log(failed ? `\n✗ ${failed} kiểm tra lỗi` : "\n✓ Tất cả kiểm tra đạt (đã rollback, không để lại dữ liệu)");
process.exit(failed ? 1 : 0);
