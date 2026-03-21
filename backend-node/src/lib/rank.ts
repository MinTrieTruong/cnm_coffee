/** Hạng theo tổng chi tiêu tích lũy (đơn đã thanh toán), đơn vị VND */
export function rankTierFromLifetimeSpend(totalVnd: number): string {
  if (totalVnd >= 50_000_000) return "KimCuong";
  if (totalVnd >= 20_000_000) return "Vang";
  if (totalVnd >= 5_000_000) return "Bac";
  return "Dong";
}

export const RANK_LABELS: Record<string, string> = {
  Dong: "Đồng",
  Bac: "Bạc",
  Vang: "Vàng",
  KimCuong: "Kim cương",
};
