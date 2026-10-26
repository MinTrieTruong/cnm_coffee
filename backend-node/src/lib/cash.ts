import type { Prisma, PrismaClient, Shift } from "@prisma/client";

/**
 * Quỹ tiền của chi nhánh:
 *   SAFE   — két sắt: cuối ca nộp tiền vào, đầu ca / cần tiền lẻ thì mở két lấy ra
 *   DRAWER — ngăn kéo thu ngân của 1 ca
 *   BANK   — tài khoản ngân hàng: nhận tiền online / chuyển khoản / quẹt thẻ
 */
export const FUNDS = ["SAFE", "DRAWER", "BANK"] as const;
export type Fund = (typeof FUNDS)[number];

export type EntryKind = "IN" | "OUT" | "TRANSFER" | "ADJUST";

/** Danh mục phiếu. `system` = chỉ hệ thống tạo (mở/đóng ca, trả NCC, kiểm két) */
export const CATEGORIES: Record<string, { label: string; kind: EntryKind; system?: boolean; managerOnly?: boolean }> = {
  // Chi
  SUPPLIES: { label: "Vật dụng lặt vặt", kind: "OUT" },
  REPAIR: { label: "Sửa chữa, bảo trì", kind: "OUT" },
  UTILITIES: { label: "Điện, nước, internet", kind: "OUT" },
  CLEANING: { label: "Vệ sinh", kind: "OUT" },
  RENT: { label: "Mặt bằng", kind: "OUT", managerOnly: true },
  MARKETING: { label: "Quảng cáo, khuyến mãi", kind: "OUT" },
  REFUND: { label: "Hoàn tiền khách", kind: "OUT" },
  OTHER_EXPENSE: { label: "Chi khác", kind: "OUT" },
  SUPPLIER_PAYMENT: { label: "Trả nhà cung cấp", kind: "OUT", system: true },
  // Thu
  OPENING_BALANCE: { label: "Số dư đầu kỳ", kind: "IN", managerOnly: true },
  CAPITAL: { label: "Bổ sung quỹ", kind: "IN", managerOnly: true },
  OTHER_INCOME: { label: "Thu khác", kind: "IN" },
  // Chuyển quỹ
  SHIFT_FLOAT: { label: "Lấy tiền đầu ca", kind: "TRANSFER", system: true },
  SHIFT_DEPOSIT: { label: "Nộp tiền cuối ca", kind: "TRANSFER", system: true },
  TOP_UP: { label: "Lấy thêm tiền lẻ từ két", kind: "TRANSFER" },
  DROP: { label: "Nộp bớt tiền vào két giữa ca", kind: "TRANSFER" },
  BANK_DEPOSIT: { label: "Nộp tiền vào ngân hàng", kind: "TRANSFER", managerOnly: true },
  BANK_WITHDRAW: { label: "Rút tiền ngân hàng về két", kind: "TRANSFER", managerOnly: true },
  // Điều chỉnh
  SAFE_DIFF: { label: "Chênh lệch kiểm két", kind: "ADJUST", system: true },
};

/** Hướng chuyển cố định của các danh mục chuyển quỹ */
export const TRANSFER_ROUTES: Record<string, { from: Fund; to: Fund }> = {
  SHIFT_FLOAT: { from: "SAFE", to: "DRAWER" },
  TOP_UP: { from: "SAFE", to: "DRAWER" },
  SHIFT_DEPOSIT: { from: "DRAWER", to: "SAFE" },
  DROP: { from: "DRAWER", to: "SAFE" },
  BANK_DEPOSIT: { from: "SAFE", to: "BANK" },
  BANK_WITHDRAW: { from: "BANK", to: "SAFE" },
};

/**
 * Phương thức thanh toán: tiền mặt vào ngăn kéo; điểm không phải tiền; còn lại vào tài khoản ngân hàng.
 * PointsRefund: dòng âm khi hoàn một phần tiền đơn ra điểm — giảm doanh thu nhưng không phải dòng tiền
 * (tiền vẫn ở tài khoản quán, chỉ chuyển thành điểm khách giữ).
 */
export const CASH_METHOD = "Cash";
export const POINTS_REFUND_METHOD = "PointsRefund";
export const NON_MONEY_METHODS = ["Points", POINTS_REFUND_METHOD];
/** COD cũ (shipper thu hộ) — không còn dùng, không tính vào quỹ nào */
const LEGACY_METHODS = ["COD"];
export const isBankMethod = (m: string) => m !== CASH_METHOD && !NON_MONEY_METHODS.includes(m) && !LEGACY_METHODS.includes(m);

export const METHOD_LABEL: Record<string, string> = {
  Cash: "Tiền mặt",
  Transfer_QR: "Chuyển khoản QR",
  Card: "Thẻ",
  MoMo: "MoMo",
  VNPay: "VNPay",
  SePay: "SePay (chuyển khoản)",
  Points: "Điểm đổi",
  PointsRefund: "Hoàn ra điểm",
  COD: "COD (cũ)",
};

type Db = PrismaClient | Prisma.TransactionClient;

const CODE_PREFIX: Record<EntryKind, string> = { IN: "PT", OUT: "PC", TRANSFER: "CQ", ADJUST: "DC" };

/** Tạo phiếu với mã dạng PC-000123 (theo id, không trùng khi nhiều người lập cùng lúc) */
export async function createEntry(db: Db, data: Omit<Prisma.CashEntryUncheckedCreateInput, "code">) {
  const tmp = await db.cashEntry.create({ data: { ...data, code: `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` } });
  return db.cashEntry.update({
    where: { id: tmp.id },
    data: { code: `${CODE_PREFIX[data.kind as EntryKind]}-${String(tmp.id).padStart(6, "0")}` },
  });
}

/** Số dư quỹ két / ngân hàng theo sổ (phiếu đã duyệt) tính đến thời điểm `at` */
export async function fundBalance(db: Db, storeId: number, fund: "SAFE" | "BANK", at?: Date) {
  const time = at ? { lte: at } : undefined;
  const [inn, out] = await Promise.all([
    db.cashEntry.aggregate({ where: { storeId, toFund: fund, status: "APPROVED", createdAt: time }, _sum: { amount: true } }),
    db.cashEntry.aggregate({ where: { storeId, fromFund: fund, status: "APPROVED", createdAt: time }, _sum: { amount: true } }),
  ]);
  let balance = (inn._sum.amount ?? 0) - (out._sum.amount ?? 0);
  if (fund === "BANK") {
    // Tiền khách trả online / chuyển khoản / thẻ vào thẳng tài khoản
    const pays = await db.payment.groupBy({
      by: ["method"],
      // Đơn hoàn 100% ra điểm: tiền vẫn nằm trong tài khoản (thành điểm khách giữ) → vẫn tính vào số dư
      where: { paymentTime: time, order: { storeId, OR: [{ status: "Paid" }, { refundStatus: "Refunded" }] } },
      _sum: { amount: true },
    });
    balance += pays.filter((p) => isBankMethod(p.method)).reduce((s, p) => s + (p._sum.amount ?? 0), 0);
  }
  return balance;
}

/** Phiên mở két đang mở của chi nhánh (mỗi chi nhánh chỉ 1 phiên mở tại một thời điểm) */
export function openSafeSession(db: Db, storeId: number) {
  return db.safeSession.findFirst({ where: { storeId, closedAt: null }, orderBy: { id: "desc" } });
}

/**
 * Tiền mặt trong ngăn kéo của ca:
 *   đầu ca + tiền mặt bán hàng + thu vào ngăn kéo + lấy thêm từ két − chi từ ngăn kéo − nộp bớt vào két
 * Tiền đầu ca lấy từ shift.startingCash (phiếu SHIFT_FLOAT chỉ để ghi nhận két giảm).
 */
export async function drawerSummary(db: Db, shift: Pick<Shift, "id" | "startingCash">) {
  const [sales, entries] = await Promise.all([
    db.payment.aggregate({ where: { shiftId: shift.id, method: CASH_METHOD }, _sum: { amount: true }, _count: { _all: true } }),
    db.cashEntry.findMany({ where: { shiftId: shift.id, status: "APPROVED", category: { notIn: ["SHIFT_FLOAT", "SHIFT_DEPOSIT"] } } }),
  ]);
  const cashSales = sales._sum.amount ?? 0;
  const cashIn = entries.filter((e) => e.toFund === "DRAWER").reduce((s, e) => s + e.amount, 0);
  const cashOut = entries.filter((e) => e.fromFund === "DRAWER").reduce((s, e) => s + e.amount, 0);
  return {
    startingCash: shift.startingCash,
    cashSales,
    cashSalesCount: sales._count._all,
    cashIn,
    cashOut,
    expectedCash: shift.startingCash + cashSales + cashIn - cashOut,
  };
}

/** Tổng hợp thanh toán theo phương thức */
export function groupByMethod(payments: { method: string; amount: number }[]) {
  const map = new Map<string, { method: string; label: string; count: number; amount: number }>();
  for (const p of payments) {
    const row = map.get(p.method) ?? { method: p.method, label: METHOD_LABEL[p.method] ?? p.method, count: 0, amount: 0 };
    row.count += 1;
    row.amount += p.amount;
    map.set(p.method, row);
  }
  const order = Object.keys(METHOD_LABEL);
  const rank = (m: string) => (order.includes(m) ? order.indexOf(m) : order.length);
  return [...map.values()].sort((a, b) => rank(a.method) - rank(b.method));
}

/** Mệnh giá tiền Việt dùng khi đếm két / ngăn kéo */
export const DENOMINATIONS = [500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000];

/** Kiểm tra & chuẩn hoá bảng đếm mệnh giá; trả về JSON lưu DB và tổng tiền */
export function parseDenominations(raw: unknown): { json: string; total: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const counts: Record<string, number> = {};
  let total = 0;
  for (const d of DENOMINATIONS) {
    const n = Number((raw as Record<string, unknown>)[String(d)] ?? 0);
    if (!Number.isInteger(n) || n < 0) return null;
    if (n > 0) {
      counts[String(d)] = n;
      total += n * d;
    }
  }
  return { json: JSON.stringify(counts), total };
}

/** Khoảng thời gian 1 ngày (giờ máy chủ) từ chuỗi YYYY-MM-DD */
export function dayRange(dateStr?: string) {
  const base = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(`${dateStr}T00:00:00`) : new Date();
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/** Tạo công nợ với mã CN-000123 */
export async function createBill(db: Db, data: Omit<Prisma.SupplierBillUncheckedCreateInput, "code">) {
  const tmp = await db.supplierBill.create({ data: { ...data, code: `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` } });
  return db.supplierBill.update({ where: { id: tmp.id }, data: { code: `CN-${String(tmp.id).padStart(6, "0")}` } });
}
