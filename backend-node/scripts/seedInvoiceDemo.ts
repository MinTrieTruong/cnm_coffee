/**
 * Đơn mua mẫu cho thử "đọc hoá đơn bằng AI":  npx tsx scripts/seedInvoiceDemo.ts [storeId] [--fresh]
 *
 * Tạo (nếu chưa có) nhà cung cấp "Thực Phẩm Minh Phát (demo)" và một đơn mua 5 mặt hàng đang chờ giao ở chi nhánh:
 * sữa tươi (hộp), sữa đặc (lon), kem béo (hộp), đường (bịch), nước cốt dừa (lon) — khớp các ảnh trong
 * scripts/fixtures/invoices/. --fresh: tạo thêm một đơn mua mới (khi đơn cũ đã nhận hàng).
 * In ra mã đơn mua để mở màn Nhận hàng.
 */
import "dotenv/config";
import { prisma } from "../src/db.js";

const storeId = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 1);
const fresh = process.argv.includes("--fresh");
const SUPPLIER = "Thực Phẩm Minh Phát (demo)";
const MARK = "[demo đọc hoá đơn]";
/** Tên mặt hàng (khớp bảng Inventory) → số đặt, giá báo giá theo đơn vị kho */
export const DEMO_LINES = [
  { name: "Sữa Tươi Thanh Trùng 1L (Hộp)", qty: 48, price: 36000 },
  { name: "Sữa Đặc Ngôi Sao (Lon)", qty: 24, price: 35000 },
  { name: "Kem Béo Thực Vật Rich's (Hộp 1L)", qty: 12, price: 92000 },
  { name: "Đường Cát Trắng (Bịch 1Kg)", qty: 20, price: 23000 },
  { name: "Nước Cốt Dừa (Lon 400ml)", qty: 24, price: 21000 },
];

const staff = await prisma.staff.findFirstOrThrow({ where: { storeId, role: { in: ["Warehouse", "Admin"] }, status: "Active" }, orderBy: { role: "desc" } });
const items = await Promise.all(DEMO_LINES.map((l) => prisma.inventoryItem.findFirstOrThrow({ where: { name: l.name }, select: { id: true, name: true } })));
const supplier =
  (await prisma.supplier.findFirst({ where: { name: SUPPLIER } })) ??
  (await prisma.supplier.create({ data: { name: SUPPLIER, phone: "0909000111", address: "12 Nguyễn Trãi, Q.5, TP.HCM", paymentTermDays: 15 } }));

const existing = await prisma.purchaseOrder.findFirst({
  where: { supplierId: supplier.id, storeId, status: { in: ["PENDING", "PARTIAL"] }, quote: { note: MARK } },
  orderBy: { id: "desc" },
});
if (existing && !fresh) {
  console.log(`Đã có đơn mua mẫu: ${existing.code} (id ${existing.id}, ${existing.status})`);
  await prisma.$disconnect();
  process.exit(0);
}

const now = new Date();
const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
const po = await prisma.$transaction(async (tx) => {
  const pr = await tx.purchaseRequisition.create({
    data: { code: `TMP-PR-${Date.now()}`, storeId, staffId: staff.id, status: "APPROVED", note: MARK, items: { create: DEMO_LINES.map((l, i) => ({ itemId: items[i].id, qty: l.qty })) } },
  });
  await tx.purchaseRequisition.update({ where: { id: pr.id }, data: { code: `PR-${stamp}-${String(pr.id).padStart(4, "0")}` } });
  const rfq = await tx.requestForQuotation.create({ data: { code: `TMP-RFQ-${Date.now()}`, requisitionId: pr.id, status: "CLOSED" } });
  await tx.requestForQuotation.update({ where: { id: rfq.id }, data: { code: `RFQ-${stamp}-${String(rfq.id).padStart(4, "0")}` } });
  const quote = await tx.supplierQuote.create({
    data: { rfqId: rfq.id, supplierId: supplier.id, status: "SELECTED", note: MARK, items: { create: DEMO_LINES.map((l, i) => ({ itemId: items[i].id, unitPrice: l.price })) } },
  });
  const p = await tx.purchaseOrder.create({
    data: { code: `TMP-PO-${Date.now()}`, quoteId: quote.id, supplierId: supplier.id, storeId, status: "PENDING", totalAmount: DEMO_LINES.reduce((s, l) => s + l.qty * l.price, 0) },
  });
  return tx.purchaseOrder.update({ where: { id: p.id }, data: { code: `PO-${stamp}-${String(p.id).padStart(4, "0")}` } });
});
console.log(`Đã tạo đơn mua mẫu ${po.code} (id ${po.id}) — NCC ${SUPPLIER}, chi nhánh #${storeId}`);
await prisma.$disconnect();
