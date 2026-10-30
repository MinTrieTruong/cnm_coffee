/**
 * Kiểm tra picker: quay 200 lượt (từng đợt 10 lượt song song) trên một chiến dịch tạm, so tỉ lệ thực tế với cấu hình
 * và kiểm tra không giải nào vượt số lượng. Chạy: npm run games:sim — xong tự dọn chiến dịch tạm và hoàn điểm đã cộng.
 */
import { PrismaClient } from "@prisma/client";
import { playCampaign } from "../src/games/service.js";

const prisma = new PrismaClient();
const N = 200;
const BATCH = 10;

async function main() {
  const customer = await prisma.customer.findFirst({ where: { phone: "0901000001" } });
  const product = await prisma.product.findFirst({ where: { isActive: true } });
  if (!customer || !product) throw new Error("Chạy npm run db:games trước.");
  const endAt = new Date(Date.now() + 86_400_000);
  const c = await prisma.gameCampaign.create({
    data: {
      gameType: "WHEEL", name: "[SIM] kiểm tra tỉ lệ", startAt: new Date(Date.now() - 60_000), endAt, isActive: true,
      maxPlaysPerDay: 10_000, config: {},
      prizes: {
        create: [
          { kind: "NONE", label: "Chúc may mắn", weight: 40, sortOrder: 0 },
          { kind: "POINTS", points: 1, label: "1 điểm", weight: 30, sortOrder: 1 },
          { kind: "PRODUCT", productId: product.id, label: product.name, weight: 20, quantity: 1000, sortOrder: 2 },
          { kind: "POINTS", points: 2, label: "2 điểm (chỉ 5 suất)", weight: 10, quantity: 5, sortOrder: 3 },
        ],
      },
    },
    include: { prizes: true },
  });
  const pointsBefore = customer.points;
  try {
    await prisma.gameTicket.createMany({ data: Array.from({ length: N }, () => ({ customerId: customer.id, campaignId: c.id, source: "ADMIN", expiresAt: endAt })) });
    let failed = 0;
    for (let i = 0; i < N; i += BATCH) {
      const rs = await Promise.allSettled(
        Array.from({ length: Math.min(BATCH, N - i) }, () => playCampaign(prisma, { campaignId: c.id, customerId: customer.id, storeId: null })),
      );
      failed += rs.filter((r) => r.status === "rejected").length;
      const firstErr = rs.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      if (firstErr) console.log("Lỗi:", JSON.stringify((firstErr.reason as { meta?: unknown })?.meta));
    }
    const plays = await prisma.gamePlay.groupBy({ by: ["prizeId"], where: { campaignId: c.id }, _count: true });
    const prizes = await prisma.gamePrize.findMany({ where: { campaignId: c.id } });
    const total = plays.reduce((s, p) => s + p._count, 0);
    console.log(`Đã quay ${total}/${N} lượt (${failed} lượt lỗi).`);
    console.table(prizes.map((p) => {
      const won = plays.find((x) => x.prizeId === p.id)?._count ?? 0;
      return {
        "Giải": p.label, "Cấu hình %": p.weight, "Thực tế %": +((won / total) * 100).toFixed(1),
        "Đã trúng": won, "Số lượng": p.quantity ?? "∞", "Vượt số lượng?": p.quantity != null && won > p.quantity ? "CÓ" : "không",
      };
    }));
    const over = prizes.some((p) => p.quantity != null && (plays.find((x) => x.prizeId === p.id)?._count ?? 0) > p.quantity);
    console.log(over ? "LỖI: có giải vượt số lượng." : "OK: không giải nào vượt số lượng.");
    console.log("Ghi chú: giải 5 suất hết sớm → phần tỉ lệ của nó dồn sang các giải còn lại theo trọng số.");
  } finally {
    // Dọn: xóa chiến dịch tạm (lượt, kết quả, mã nhận quà xóa theo), hoàn lại điểm đã cộng
    const pts = await prisma.pointTransaction.findMany({ where: { customerId: customer.id, type: "GAME_REWARD", note: { contains: "[SIM]" } } });
    await prisma.pointTransaction.deleteMany({ where: { id: { in: pts.map((p) => p.id) } } });
    await prisma.gameCampaign.delete({ where: { id: c.id } });
    await prisma.customer.update({ where: { id: customer.id }, data: { points: pointsBefore } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
