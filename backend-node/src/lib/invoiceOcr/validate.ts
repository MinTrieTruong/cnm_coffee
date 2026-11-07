/**
 * lib/invoiceOcr/validate.ts — Kiểm tra bằng code kết quả AI đọc hoá đơn (không tin AI) và tạo dòng nháp cho form nhận hàng.
 *
 *  - itemId phải thuộc đơn mua; dòng không khớp → "Không có trong đơn mua" (người nhận chọn tay / bỏ qua).
 *  - Số nhận theo đơn vị kho, nguyên, ≥ 0, tối đa số còn phải giao (giao dư → lỗi, điền bằng số còn lại).
 *  - Thành tiền ≈ số lượng × đơn giá (lệch > 1% → vàng); tổng các dòng ≈ tổng hoá đơn.
 *  - Đơn giá theo đơn vị kho lệch giá báo giá > 2% → đỏ.
 *  - Hạn dùng phải là ngày tương lai; còn < 30 ngày → "cận hạn".
 *  - Ngày hoá đơn lệch hôm nay > 7 ngày → vàng; khác nhà cung cấp của đơn mua → đỏ; số hoá đơn đã dùng → đỏ "có thể trùng".
 * dòng nháp = đúng dạng body POST /purchasing/orders/:id/receive: { itemId, receivedQty, expiryDate, note }.
 */
import type { PrismaClient } from "@prisma/client";
import { addDaysYmd, bizToday, daysInRange } from "../bizTime.js";
import { normalizeTerm } from "../searchInsights.js";
import type { PoContext, PoLine } from "./context.js";
import type { Box, Extraction, ExtractedLine } from "./extract.js";

export type Flag = { code: string; level: "warn" | "error"; text: string };
export type InvoiceInfo = {
  rawName: string;
  qtyInvoice: number;
  unitInvoice: string | null;
  qtyStock: number | null;
  /** 1 đơn vị trên hoá đơn = factor đơn vị kho (null = chưa quy đổi được) */
  factor: number | null;
  conversionNote: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
  /** Đơn giá quy về 1 đơn vị kho (so với báo giá) */
  stockUnitPrice: number | null;
  lotNo: string | null;
  matchConfidence: number;
  box: Box | null;
};
export type DraftLine = {
  itemId: number;
  name: string;
  unit: string | null;
  remaining: number;
  quotedPrice: number;
  receivedQty: number;
  expiryDate: string | null;
  note: string;
  /** Ô nào do AI điền (giao diện viền tím) */
  aiFilled: { receivedQty: boolean; expiryDate: boolean; note: boolean };
  /** Dòng(s) trên hoá đơn khớp với mặt hàng này (null = không thấy trên hoá đơn) */
  invoice: InvoiceInfo | null;
  flags: Flag[];
};
export type Unmatched = InvoiceInfo & { index: number; reason: string; suggestedItemId: number | null };
export type Validated = {
  readable: boolean;
  reason: string | null;
  /** Độ rõ ảnh AI đánh giá (0–1) */
  legibility: number;
  header: {
    invoiceNo: string | null;
    invoiceDate: string | null;
    supplierName: string | null;
    totalAmount: number | null;
    supplierMismatch: boolean;
    flags: Flag[];
  };
  lines: DraftLine[];
  unmatched: Unmatched[];
  totals: { invoice: number | null; linesSum: number; byPo: number; diff: number | null };
};

/** Dưới ngưỡng này coi như không đọc được; dưới LEGIBLE thì cảnh báo mọi dòng */
const UNREADABLE = 0.4;
const LEGIBLE = 0.7;
const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
const pct = (a: number, b: number) => (b ? Math.abs(a - b) / Math.abs(b) : a ? 1 : 0);

/** Tên NCC trên hoá đơn có phải NCC của đơn mua không: chung ≥ 1/2 số từ có nghĩa (bỏ "công ty", "tnhh"…) */
function sameSupplier(a: string, b: string) {
  const stop = new Set(["cong", "ty", "tnhh", "co", "phan", "cp", "mtv", "thuong", "mai", "dich", "vu", "san", "xuat", "va", "ho", "kinh", "doanh"]);
  const words = (s: string) => new Set(normalizeTerm(s).split(" ").filter((w) => w.length > 1 && !stop.has(w)));
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return true;
  const common = [...wa].filter((w) => wb.has(w)).length;
  return common / Math.min(wa.size, wb.size) >= 0.5;
}

const sameUnit = (a: string | null, b: string | null) => !!a && !!b && normalizeTerm(a) === normalizeTerm(b);

/** Số lượng quy về đơn vị kho: AI quy đổi → dùng; không thì theo quy đổi đã ghi nhớ; cùng đơn vị → giữ nguyên */
function toStock(l: ExtractedLine, po: PoLine, ctx: PoContext): { qtyStock: number | null; factor: number | null; fromAlias: boolean } {
  const alias = ctx.aliases.find((a) => a.itemId === po.itemId && a.rawName === normalizeTerm(l.rawName));
  if (alias) return { qtyStock: l.qtyInvoice * alias.factor, factor: alias.factor, fromAlias: true };
  if (l.qtyStock != null) return { qtyStock: l.qtyStock, factor: l.qtyInvoice ? l.qtyStock / l.qtyInvoice : null, fromAlias: false };
  if (!l.unitInvoice || sameUnit(l.unitInvoice, po.unit)) return { qtyStock: l.qtyInvoice, factor: 1, fromAlias: false };
  return { qtyStock: null, factor: null, fromAlias: false };
}

/**
 * Độ nét ảnh đo bằng code ở trình duyệt (phương sai Laplacian, ảnh thu về rộng ≤ 1000px — lib/imageSharpness.ts).
 * Không dựa vào AI tự đánh giá: với ảnh mờ, model vẫn có thể "đọc" ra số hoá đơn / tổng tiền bịa mà tự chấm là rõ.
 * Hoá đơn in chụp rõ ~1.000–4.000; mờ nhẹ ~10–50; nhoè hẳn < 5.
 */
export const SHARP_UNREADABLE = 8;
export const SHARP_BLURRY = 60;
export function applySharpness(ex: Extraction, sharpness: number[] | undefined): Extraction {
  const vals = (sharpness ?? []).filter((v) => typeof v === "number" && Number.isFinite(v) && v >= 0);
  if (!vals.length) return ex;
  const min = Math.min(...vals);
  if (min < SHARP_UNREADABLE) return { ...ex, readable: false, reason: "Ảnh quá mờ — chụp lại gần hơn, đủ sáng và giữ máy thật chắc." };
  if (min < SHARP_BLURRY) return { ...ex, legibility: Math.min(ex.legibility, 0.5) };
  return ex;
}

export async function validateExtraction(db: PrismaClient, ex: Extraction, ctx: PoContext, today = bizToday()): Promise<Validated> {
  const headerFlags: Flag[] = [];
  const supplierMismatch = !!ex.supplierName && !sameSupplier(ex.supplierName, ctx.supplierName);
  if (supplierMismatch) headerFlags.push({ code: "SUPPLIER", level: "error", text: `Hoá đơn của "${ex.supplierName}", khác nhà cung cấp của đơn mua (${ctx.supplierName}).` });
  if (ex.invoiceDate) {
    const gap = Math.abs(daysInRange(ex.invoiceDate, today) - 1);
    if (gap > 7) headerFlags.push({ code: "DATE", level: "warn", text: `Ngày hoá đơn ${ex.invoiceDate.split("-").reverse().join("/")} cách hôm nay ${gap} ngày.` });
  }
  if (ex.invoiceNo) {
    const dup = await db.goodsReceipt.findFirst({
      where: { invoiceNo: ex.invoiceNo, po: { supplierId: ctx.supplierId } },
      select: { code: true },
    });
    if (dup) headerFlags.push({ code: "DUPLICATE", level: "error", text: `Có thể trùng hoá đơn: số ${ex.invoiceNo} đã dùng ở phiếu nhập ${dup.code}.` });
  }

  // Dòng hoá đơn → mặt hàng của đơn mua (itemId ngoài đơn mua coi như chưa khớp)
  const byItem = new Map<number, ExtractedLine[]>();
  const unmatched: Unmatched[] = [];
  ex.lines.forEach((l, index) => {
    const po = l.itemId != null ? ctx.lines.find((x) => x.itemId === l.itemId) : undefined;
    // Không khớp: thử quy đổi đã ghi nhớ theo tên trên hoá đơn
    const alias = !po ? ctx.aliases.find((a) => a.rawName === normalizeTerm(l.rawName) && ctx.lines.some((x) => x.itemId === a.itemId)) : undefined;
    const target = po ?? (alias ? ctx.lines.find((x) => x.itemId === alias.itemId) : undefined);
    if (target) {
      byItem.set(target.itemId, [...(byItem.get(target.itemId) ?? []), l]);
      return;
    }
    unmatched.push({
      index,
      rawName: l.rawName,
      qtyInvoice: l.qtyInvoice,
      unitInvoice: l.unitInvoice,
      qtyStock: l.qtyStock,
      factor: null,
      conversionNote: l.conversionNote,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
      stockUnitPrice: null,
      lotNo: l.lotNo,
      matchConfidence: l.matchConfidence,
      box: l.box,
      reason: l.itemId != null ? "AI chọn mặt hàng không thuộc đơn mua" : "Không có trong đơn mua",
      suggestedItemId: null,
    });
  });

  let linesSum = 0;
  const lines: DraftLine[] = ctx.lines
    .filter((po) => po.remaining > 0 || byItem.has(po.itemId))
    .map((po) => {
      const found = byItem.get(po.itemId) ?? [];
      const flags: Flag[] = [];
      if (!found.length) {
        if (po.remaining > 0) flags.push({ code: "NOT_ON_INVOICE", level: "warn", text: "Không thấy mặt hàng này trên hoá đơn — để 0 nếu NCC chưa giao." });
        return { itemId: po.itemId, name: po.name, unit: po.unit, remaining: po.remaining, quotedPrice: po.quotedPrice, receivedQty: 0, expiryDate: null, note: "", aiFilled: { receivedQty: false, expiryDate: false, note: false }, invoice: null, flags };
      }
      // Nhiều dòng hoá đơn cùng một mặt hàng → cộng lại
      let qtyStock: number | null = 0;
      let factor: number | null = null;
      let lineTotal: number | null = 0;
      let qtyInvoice = 0;
      for (const l of found) {
        const s = toStock(l, po, ctx);
        qtyStock = qtyStock == null || s.qtyStock == null ? null : qtyStock + s.qtyStock;
        factor ??= s.factor;
        qtyInvoice += l.qtyInvoice;
        const lt = l.lineTotal ?? (l.unitPrice != null ? l.unitPrice * l.qtyInvoice : null);
        lineTotal = lineTotal == null || lt == null ? null : lineTotal + lt;
        // Thành tiền ≈ số lượng × đơn giá
        if (l.lineTotal != null && l.unitPrice != null && pct(l.unitPrice * l.qtyInvoice, l.lineTotal) > 0.01) {
          flags.push({ code: "LINE_TOTAL", level: "warn", text: `Thành tiền ${vnd(l.lineTotal)} khác ${l.qtyInvoice} × ${vnd(l.unitPrice)} = ${vnd(l.unitPrice * l.qtyInvoice)}.` });
        }
      }
      const first = found[0];
      const minConf = Math.min(...found.map((l) => l.matchConfidence));
      if (minConf < 0.7) flags.push({ code: "MATCH", level: "warn", text: `AI chưa chắc "${first.rawName}" là ${po.name}.` });

      let receivedQty = 0;
      if (qtyStock == null) {
        flags.push({ code: "CONVERSION", level: "warn", text: `Chưa quy đổi được ${qtyInvoice} ${first.unitInvoice ?? ""} sang ${po.unit ?? "đơn vị kho"} — nhập số thực nhận.` });
      } else {
        if (!Number.isInteger(qtyStock)) flags.push({ code: "FRACTION", level: "warn", text: `Số quy đổi ${Math.round(qtyStock * 100) / 100} không tròn — đã làm tròn.` });
        const q = Math.max(0, Math.round(qtyStock));
        if (q > po.remaining) {
          flags.push({ code: "OVER", level: "error", text: `Giao dư: hoá đơn ${q} ${po.unit ?? ""}, đơn mua chỉ còn ${po.remaining} — điền ${po.remaining}, phần dư không nhập kho.` });
        } else if (q < po.remaining) {
          flags.push({ code: "SHORT", level: "warn", text: `Giao thiếu ${po.remaining - q} ${po.unit ?? ""} so với số còn phải giao.` });
        }
        receivedQty = Math.min(q, po.remaining);
        if (factor != null && factor !== 1 && !found.some((l) => l.conversionNote) && !ctx.aliases.some((a) => a.itemId === po.itemId)) {
          flags.push({ code: "CONVERSION", level: "warn", text: `Quy đổi 1 ${first.unitInvoice ?? "đơn vị"} = ${factor} ${po.unit ?? ""} chưa có căn cứ trên hoá đơn — kiểm tra lại.` });
        }
      }

      // Đơn giá quy về đơn vị kho so với báo giá
      const stockUnitPrice = lineTotal != null && qtyStock ? Math.round(lineTotal / qtyStock) : first.unitPrice != null && factor ? Math.round(first.unitPrice / factor) : null;
      if (stockUnitPrice != null && pct(stockUnitPrice, po.quotedPrice) > 0.02) {
        flags.push({ code: "PRICE", level: "error", text: `Giá khác báo giá: ${vnd(stockUnitPrice)} so với ${vnd(po.quotedPrice)} / ${po.unit ?? "đơn vị"}.` });
      }
      if (lineTotal != null) linesSum += lineTotal;

      // Hạn sử dụng
      const expiry = found.map((l) => l.expiryDate).filter((d): d is string => !!d).sort()[0] ?? null;
      let expiryDate: string | null = null;
      if (expiry) {
        if (expiry <= today) flags.push({ code: "EXPIRED", level: "error", text: `Hạn sử dụng ${expiry.split("-").reverse().join("/")} đã qua — không nên nhận.` });
        else {
          expiryDate = expiry;
          if (expiry < addDaysYmd(today, 30)) flags.push({ code: "NEAR_EXPIRY", level: "warn", text: `Cận hạn: còn ${daysInRange(today, expiry) - 1} ngày — cân nhắc trả lại (lý do "Cận hạn").` });
        }
      }
      const lots = [...new Set(found.map((l) => l.lotNo).filter(Boolean))];
      const note = lots.length ? `Lô ${lots.join(", ")}` : "";
      return {
        itemId: po.itemId,
        name: po.name,
        unit: po.unit,
        remaining: po.remaining,
        quotedPrice: po.quotedPrice,
        receivedQty,
        expiryDate,
        note,
        aiFilled: { receivedQty: qtyStock != null, expiryDate: !!expiryDate, note: !!note },
        invoice: {
          rawName: found.map((l) => l.rawName).join(" + "),
          qtyInvoice,
          unitInvoice: first.unitInvoice,
          qtyStock: qtyStock == null ? null : Math.round(qtyStock),
          factor,
          conversionNote: found.map((l) => l.conversionNote).find(Boolean) ?? (factor && factor !== 1 ? `1 ${first.unitInvoice ?? ""} = ${factor} ${po.unit ?? ""}` : null),
          unitPrice: first.unitPrice,
          lineTotal,
          stockUnitPrice,
          lotNo: lots.join(", ") || null,
          matchConfidence: minConf,
          box: first.box,
        },
        flags,
      };
    });

  // Ảnh không rõ: mọi giá trị AI đọc đều có thể sai (VD đọc nhầm số hoá đơn) → bắt kiểm từng dòng
  if (ex.legibility < LEGIBLE) {
    headerFlags.push({ code: "BLURRY", level: "warn", text: `Ảnh không rõ (độ rõ ${Math.round(ex.legibility * 100)}%) — đối chiếu kỹ từng số với hoá đơn giấy, cả số hoá đơn.` });
    for (const l of lines) if (l.invoice) l.flags.push({ code: "BLURRY", level: "warn", text: "Ảnh không rõ — đối chiếu số lượng, hạn dùng với hoá đơn giấy." });
  }
  for (const u of unmatched) if (u.lineTotal != null) linesSum += u.lineTotal;
  const byPo = lines.reduce((s, l) => s + l.receivedQty * l.quotedPrice, 0);
  if (ex.totalAmount != null && linesSum > 0 && pct(linesSum, ex.totalAmount) > 0.01) {
    headerFlags.push({ code: "TOTAL", level: "warn", text: `Tổng các dòng ${vnd(linesSum)} khác tổng hoá đơn ${vnd(ex.totalAmount)} (có thể có chiết khấu / VAT / phí).` });
  }
  return {
    readable: ex.readable && ex.legibility >= UNREADABLE && (ex.lines.length > 0 || !!ex.invoiceNo),
    legibility: ex.legibility,
    reason: !ex.readable ? ex.reason ?? "Không đọc được hoá đơn." : ex.legibility < UNREADABLE ? "Ảnh quá mờ." : ex.lines.length ? null : ex.reason ?? "Không thấy dòng hàng nào trên ảnh.",
    header: { invoiceNo: ex.invoiceNo, invoiceDate: ex.invoiceDate, supplierName: ex.supplierName, totalAmount: ex.totalAmount, supplierMismatch, flags: headerFlags },
    lines,
    unmatched,
    totals: { invoice: ex.totalAmount ?? (linesSum || null), linesSum, byPo, diff: ex.totalAmount != null ? ex.totalAmount - byPo : null },
  };
}
