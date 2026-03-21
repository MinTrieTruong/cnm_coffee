import type { PrismaClient } from "@prisma/client";

export async function getStoreSettings(prisma: PrismaClient) {
  let s = await prisma.storeSettings.findUnique({ where: { id: 1 } });
  if (!s) {
    s = await prisma.storeSettings.create({
      data: {
        id: 1,
        vatRatePercent: 10,
        pointPerVnd: 10000,
        pointValueVnd: 1,
        cashRoundTo: 1000,
        pointEarnEveryVnd: 1000,
        pointEarnEach: 100,
      },
    });
  }
  return s;
}

/** Điểm cộng sau thanh toán: cứ mỗi `everyVnd` VND thành tiền → `each` điểm */
export function computePointsEarned(paidAmountVnd: number, everyVnd: number, each: number) {
  const block = everyVnd > 0 ? everyVnd : 1000;
  const pts = each > 0 ? each : 100;
  return Math.floor(paidAmountVnd / block) * pts;
}

/** taxable = subTotal - discount - pointsDiscount; VAT trên taxable */
export function computeBill(
  subTotal: number,
  discountAmt: number,
  pointsToUse: number,
  pointValueVnd: number,
  vatRatePercent: number,
) {
  const pointsDiscount = pointsToUse * pointValueVnd;
  const taxable = Math.max(0, subTotal - discountAmt - pointsDiscount);
  const vatAmount = Math.floor((taxable * vatRatePercent) / 100);
  const totalAmount = taxable + vatAmount;
  return { taxable, pointsDiscount, vatAmount, totalAmount };
}

export function roundCashAmount(amount: number, roundTo: number) {
  if (roundTo <= 1) return amount;
  return Math.round(amount / roundTo) * roundTo;
}
