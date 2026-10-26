import { Router } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { signSupplierToken } from "../lib/jwt.js";
import { attachSupplier, type SupplierRequest } from "../middleware/supplier.js";
import { attachStaff, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { inStore, mustStoreId, storeWhere } from "../lib/storeScope.js";
import { adjustStoreStock } from "../lib/inventory.js";
import { applyIncomingCost } from "../lib/productCost.js";
import { createBill } from "../lib/cash.js";

export function procurementRouter(prisma: PrismaClient) {
  const r = Router();
  const authStaff = attachStaff(prisma);
  /** Thủ kho lập đề xuất & nhận hàng; Quản lý chi nhánh duyệt đề xuất & chọn báo giá */
  const purchasing = [authStaff, requireRoles("Admin", "Warehouse")];
  const purchasingStore = [...purchasing, requireStore];
  const approver = [authStaff, requireRoles("Admin"), requireStore];
  const authSupp = attachSupplier(prisma);

  /** Đơn mua kèm đủ dữ liệu tính số đã đặt / đã nhận của từng mặt hàng */
  const poLinesInclude = {
    quote: { include: { items: true, rfq: { include: { requisition: { include: { items: { include: { item: { select: { name: true, unit: true } } } } } } } } } },
    receipts: { include: { items: true } },
  } as const;
  type PoWithLines = Prisma.PurchaseOrderGetPayload<{ include: typeof poLinesInclude }>;

  /** Mặt hàng của đơn mua = mặt hàng trong đề xuất có báo giá; còn phải giao = đặt − đã nhận các đợt trước */
  function orderedLines(po: PoWithLines) {
    return po.quote.rfq.requisition.items.flatMap((pi) => {
      const q = po.quote.items.find((x) => x.itemId === pi.itemId);
      if (!q) return [];
      const received = po.receipts.reduce((s, g) => s + g.items.filter((x) => x.itemId === pi.itemId).reduce((a, x) => a + x.receivedQty, 0), 0);
      return [{ itemId: pi.itemId, name: pi.item.name, unit: pi.item.unit, ordered: pi.qty, received, remaining: Math.max(0, pi.qty - received), unitPrice: q.unitPrice }];
    });
  }

  // --- SUPPLIER PORTAL ---

  r.post("/supplier/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing credentials" });
    const supp = await prisma.supplier.findUnique({ where: { username } });
    if (!supp || !supp.isActive || !supp.passwordHash) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const match = await bcrypt.compare(password, supp.passwordHash);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    const token = signSupplierToken(supp.id);
    res.json({ token, supplier: { id: supp.id, name: supp.name } });
  });

  // Supplier fetches open RFQs
  r.get("/supplier/rfqs", authSupp, async (req, res) => {
    const supp = (req as SupplierRequest).supplier!;
    const rfqs = await prisma.requestForQuotation.findMany({
      where: { status: "OPEN" },
      include: {
        requisition: { include: { store: { select: { id: true, name: true, address: true } }, items: { include: { item: { select: { name: true, unit: true } } } } } },
        quotes: { where: { supplierId: supp.id } }
      },
      orderBy: { createdAt: "desc" }
    });
    const mapped = rfqs.map(rfq => ({
      ...rfq,
      hasQuoted: rfq.quotes.length > 0,
      myQuote: rfq.quotes[0] ?? null
    }));
    res.json(mapped);
  });

  // Supplier submits quote for RFQ
  r.post("/supplier/rfqs/:id/quote", authSupp, async (req, res) => {
    const rfqId = Number(req.params.id);
    const supp = (req as SupplierRequest).supplier!;
    const { items, note } = req.body as { items: { itemId: number; unitPrice: number; deliveryDate?: string }[], note?: string };

    if (!items || !Array.isArray(items)) return res.status(400).json({ error: "Invalid items format" });

    const existing = await prisma.supplierQuote.findUnique({
      where: { rfqId_supplierId: { rfqId, supplierId: supp.id } }
    });

    await prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.supplierQuote.delete({ where: { id: existing.id } });
      }

      await tx.supplierQuote.create({
        data: {
          rfqId,
          supplierId: supp.id,
          status: "PENDING",
          note,
          items: {
            create: items.map(i => ({
              itemId: i.itemId,
              unitPrice: i.unitPrice,
              deliveryDate: i.deliveryDate ? new Date(i.deliveryDate) : null
            }))
          }
        }
      });
    });

    res.json({ ok: true });
  });

  r.get("/supplier/orders", authSupp, async (req, res) => {
    const supp = (req as SupplierRequest).supplier!;
    const pos = await prisma.purchaseOrder.findMany({
      where: { supplierId: supp.id },
      include: {
        store: { select: { id: true, name: true, address: true } },
        quote: { include: { items: { include: { item: { select: { name: true, unit: true } } } }, rfq: { include: { requisition: { include: { items: { include: { item: { select: { name: true, unit: true } } } } } } } } } }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(pos);
  });

  // --- INTERNAL PURCHASING / ADMIN ---

  // 1. Tạo PR
  r.post("/purchasing/requisitions", ...purchasingStore, async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const { note, items } = req.body as { note?: string, items: { itemId: number, qty: number, note?: string }[] };

    if (!items || items.length === 0) return res.status(400).json({ error: "Items required" });

    const count = await prisma.purchaseRequisition.count();
    const code = `PR-${new Date().getFullYear()}${(new Date().getMonth()+1).toString().padStart(2, '0')}-${String(count+1).padStart(4, '0')}`;

    const pr = await prisma.purchaseRequisition.create({
      data: {
        code,
        storeId: mustStoreId(req),
        staffId: staff.id,
        note,
        status: "PENDING",
        items: {
          create: items.map(i => ({
            itemId: i.itemId,
            qty: i.qty,
            note: i.note
          }))
        }
      }
    });
    res.json(pr);
  });

  // 2. Lấy danh sách PR (Admin)
  r.get("/purchasing/requisitions", ...purchasing, async (req, res) => {
    const prs = await prisma.purchaseRequisition.findMany({
      where: storeWhere(req),
      include: {
        store: { select: { id: true, name: true, address: true } },
        staff: { select: { fullName: true } },
        items: { include: { item: { select: { name: true, unit: true } } } },
        rfqs: true
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(prs);
  });

  // 2b. Lấy danh sách PR của chính nhân viên (Staff)
  r.get("/purchasing/my-requisitions", authStaff, async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const prs = await prisma.purchaseRequisition.findMany({
      where: { staffId: staff.id },
      include: {
        items: { include: { item: { select: { name: true, unit: true } } } }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(prs);
  });

  // 3. Duyệt PR -> Tự động sinh RFQ
  r.post("/purchasing/requisitions/:id/approve", ...approver, async (req, res) => {
    const prId = Number(req.params.id);
    const pr = await prisma.purchaseRequisition.findUnique({ where: { id: prId } });
    if (!pr || !inStore(req, pr) || pr.status !== "PENDING") return res.status(400).json({ error: "PR not found or not pending" });

    const rfqCount = await prisma.requestForQuotation.count();
    const rfqCode = `RFQ-${new Date().getFullYear()}${(new Date().getMonth()+1).toString().padStart(2, '0')}-${String(rfqCount+1).padStart(4, '0')}`;

    await prisma.$transaction([
      prisma.purchaseRequisition.update({ where: { id: prId }, data: { status: "APPROVED" } }),
      prisma.requestForQuotation.create({
        data: {
          code: rfqCode,
          requisitionId: prId,
          status: "OPEN"
        }
      })
    ]);

    res.json({ ok: true, rfqCode });
  });

  // 4. Lấy danh sách RFQ & Báo giá
  r.get("/purchasing/rfqs", ...purchasing, async (req, res) => {
    const rfqs = await prisma.requestForQuotation.findMany({
      where: { requisition: storeWhere(req) },
      include: {
        requisition: { include: { store: { select: { id: true, name: true, address: true } }, items: { include: { item: { select: { name: true, unit: true } } } } } },
        quotes: { include: { supplier: { select: { name: true } }, items: true } }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(rfqs);
  });

  // 5. Chốt Quote -> Tạo PO
  r.post("/purchasing/rfqs/:id/select-quote", ...approver, async (req, res) => {
    const rfqId = Number(req.params.id);
    const { quoteId, allowPartial } = req.body as { quoteId: number; allowPartial?: boolean };

    const quote = await prisma.supplierQuote.findUnique({
      where: { id: quoteId },
      include: { items: true, rfq: { include: { requisition: { include: { items: { include: { item: { select: { name: true } } } } } } } } }
    });

    if (!quote || quote.rfqId !== rfqId || !inStore(req, quote.rfq.requisition)) return res.status(400).json({ error: "Báo giá không hợp lệ." });
    if (quote.rfq.status === "CLOSED") return res.status(400).json({ error: "Yêu cầu báo giá đã chốt." });

    const pr = quote.rfq.requisition;
    const priced = (itemId: number) => quote.items.find((q) => q.itemId === itemId && q.unitPrice > 0);
    // Báo giá thiếu mặt hàng: không bỏ qua im lặng — quản lý xác nhận, phần thiếu sang đề xuất mua mới
    const missing = pr.items.filter((i) => !priced(i.itemId));
    if (missing.length === pr.items.length) return res.status(400).json({ error: "Báo giá này không có mặt hàng nào trong đề xuất." });
    if (missing.length && !allowPartial) {
      return res.status(409).json({ error: `Báo giá thiếu: ${missing.map((m) => m.item.name).join(", ")}.`, missing: missing.map((m) => ({ itemId: m.itemId, name: m.item.name, qty: m.qty })) });
    }
    const totalAmount = pr.items.reduce((sum, i) => sum + (priced(i.itemId)?.unitPrice ?? 0) * i.qty, 0);

    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const tmp = () => `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await prisma.$transaction(async (tx) => {
      // Chỉ 1 người chốt được (2 người bấm cùng lúc không tạo 2 PO)
      const lock = await tx.requestForQuotation.updateMany({ where: { id: rfqId, status: { not: "CLOSED" } }, data: { status: "CLOSED" } });
      if (!lock.count) return null;
      await tx.purchaseRequisition.update({ where: { id: pr.id }, data: { status: "COMPLETED" } });
      await tx.supplierQuote.updateMany({ where: { rfqId, id: { not: quoteId } }, data: { status: "REJECTED" } });
      await tx.supplierQuote.update({ where: { id: quoteId }, data: { status: "SELECTED" } });
      // Mã theo id: không trùng khi nhiều chi nhánh chốt cùng lúc
      const po = await tx.purchaseOrder.create({ data: { code: tmp(), storeId: pr.storeId, quoteId: quote.id, supplierId: quote.supplierId, totalAmount } });
      const poCode = `PO-${ym}-${String(po.id).padStart(4, "0")}`;
      await tx.purchaseOrder.update({ where: { id: po.id }, data: { code: poCode } });

      let followUp: string | null = null;
      if (missing.length) {
        const npr = await tx.purchaseRequisition.create({
          data: {
            code: tmp(), storeId: pr.storeId, staffId: pr.staffId, status: "PENDING",
            note: `Bổ sung từ ${pr.code}: báo giá được chọn (${poCode}) thiếu các mặt hàng này`.slice(0, 255),
            items: { create: missing.map((m) => ({ itemId: m.itemId, qty: m.qty, note: m.note })) },
          },
        });
        followUp = `PR-${ym}-${String(npr.id).padStart(4, "0")}`;
        await tx.purchaseRequisition.update({ where: { id: npr.id }, data: { code: followUp } });
      }
      return { poCode, followUp };
    });
    if (!result) return res.status(409).json({ error: "Yêu cầu báo giá vừa được người khác chốt." });

    res.json({ ok: true, ...result });
  });

  // 6. Lấy danh sách PO
  r.get("/purchasing/orders", ...purchasing, async (req, res) => {
    const pos = await prisma.purchaseOrder.findMany({
      where: storeWhere(req),
      include: {
        store: { select: { id: true, name: true, address: true } },
        supplier: { select: { name: true } },
        quote: { include: { items: { include: { item: { select: { name: true, unit: true } } } }, rfq: { include: { requisition: { include: { items: { include: { item: { select: { name: true, unit: true } } } } } } } } } },
        receipts: { include: { items: true, receivedBy: { select: { fullName: true } } }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" }
    });
    // lines: đặt / đã nhận / còn phải giao từng mặt hàng (nhận nhiều đợt)
    res.json(pos.map((po) => ({ ...po, lines: orderedLines(po) })));
  });

  // 7. Nhập kho theo PO → GRN + lô hàng. Nhận được nhiều đợt (giao thiếu / giao bù), công nợ theo số thực nhận
  //    body: { lines: [{ itemId, receivedQty, rejectedQty?, expiryDate?, note? }], note? }
  //    (body cũ { expiries } = nhận đủ phần còn lại)
  r.post("/purchasing/orders/:id/receive", ...purchasingStore, async (req, res) => {
    const poId = Number(req.params.id);
    const staff = (req as StaffRequest).staffRow!;
    type ReceiveLine = { itemId: number; receivedQty: number; rejectedQty?: number; expiryDate?: string | null; note?: string };
    const body = req.body as {
      lines?: ReceiveLine[];
      note?: string;
      expiries?: Record<number, string>;
    };

    const po = await prisma.purchaseOrder.findUnique({ where: { id: poId }, include: poLinesInclude });
    if (!po || !inStore(req, po)) return res.status(404).json({ error: "Không tìm thấy đơn mua." });
    if (po.status === "DELIVERED" || po.status === "CLOSED") return res.status(400).json({ error: "Đơn mua đã nhận đủ hoặc đã đóng." });

    const ordered = orderedLines(po);
    const lines: ReceiveLine[] = body.lines ?? ordered.filter((o) => o.remaining > 0).map((o) => ({ itemId: o.itemId, receivedQty: o.remaining, expiryDate: body.expiries?.[o.itemId] ?? null }));
    for (const l of lines) {
      const o = ordered.find((x) => x.itemId === l.itemId);
      if (!o) return res.status(400).json({ error: "Có mặt hàng không thuộc đơn mua này." });
      if (!Number.isInteger(l.receivedQty) || l.receivedQty < 0) return res.status(400).json({ error: `Số nhận của ${o.name} phải là số nguyên từ 0 trở lên.` });
      if (l.rejectedQty != null && (!Number.isInteger(l.rejectedQty) || l.rejectedQty < 0)) return res.status(400).json({ error: `Số hỏng / trả lại của ${o.name} không hợp lệ.` });
      if (l.receivedQty > o.remaining) return res.status(400).json({ error: `${o.name}: nhận ${l.receivedQty} vượt số còn phải giao (${o.remaining}).` });
      if (l.expiryDate && Number.isNaN(Date.parse(l.expiryDate))) return res.status(400).json({ error: `Hạn sử dụng của ${o.name} không hợp lệ.` });
    }
    const taking = lines.filter((l) => l.receivedQty > 0 || (l.rejectedQty ?? 0) > 0);
    if (!taking.length) return res.status(400).json({ error: "Nhập số lượng thực nhận cho ít nhất 1 mặt hàng." });

    const now = new Date();
    const out = await prisma.$transaction(async (tx) => {
      // Khoá đơn: chỉ 1 lượt nhận chạy tại một thời điểm (2 người cùng bấm không nhập kho 2 lần)
      const lock = await tx.purchaseOrder.updateMany({ where: { id: poId, status: po.status, updatedAt: po.updatedAt }, data: { status: "RECEIVING" } });
      if (!lock.count) return null;
      const g = await tx.goodsReceipt.create({
        data: { code: `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, storeId: po.storeId, poId, receivedById: staff.id, status: "COMPLETED", note: body.note?.trim().slice(0, 500) || null },
      });
      // Mã theo id: không trùng khi 2 chi nhánh nhận hàng cùng lúc
      const grnCode = `GRN-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${String(g.id).padStart(4, "0")}`;
      await tx.goodsReceipt.update({ where: { id: g.id }, data: { code: grnCode } });

      let billAmount = 0;
      for (const l of taking) {
        const o = ordered.find((x) => x.itemId === l.itemId)!;
        const expiryDate = l.expiryDate ? new Date(l.expiryDate) : null;
        await tx.goodsReceiptItem.create({
          data: { grnId: g.id, itemId: l.itemId, receivedQty: l.receivedQty, rejectedQty: l.rejectedQty ?? 0, note: l.note?.trim().slice(0, 255) || null, expiryDate },
        });
        if (l.receivedQty <= 0) continue;
        billAmount += l.receivedQty * o.unitPrice;
        // Giá nhập bình quân (tính trước khi cộng tồn) → giá vốn món đổi theo
        await applyIncomingCost(tx, l.itemId, l.receivedQty, o.unitPrice);
        await adjustStoreStock(tx, { storeId: po.storeId, itemId: l.itemId, qtyChange: l.receivedQty, type: "RECEIVE", referenceId: grnCode });
        // Lô hàng (bảng lô chung với nhập tay): có hạn dùng → cảnh báo sắp hết hạn, trừ dần khi xuất kho
        await tx.stockReceipt.create({
          data: {
            storeId: po.storeId, itemId: l.itemId, qty: l.receivedQty, remainingQty: l.receivedQty, expiryDate,
            source: "PO", supplierId: po.supplierId, unitPrice: o.unitPrice, note: `${grnCode} · ${po.code}`, receivedById: staff.id,
          },
        });
      }

      // Công nợ phải trả NCC = số thực nhận × đơn giá báo giá, hạn trả theo kỳ hạn của NCC
      if (billAmount > 0) {
        const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: po.supplierId }, select: { paymentTermDays: true } });
        await createBill(tx, {
          storeId: po.storeId, supplierId: po.supplierId, source: "GRN", grnId: g.id, amount: billAmount,
          billDate: now, dueDate: new Date(now.getTime() + supplier.paymentTermDays * 86400_000),
          note: `Nhận hàng ${grnCode} theo ${po.code}`, createdById: staff.id,
        });
      }

      const left = ordered.reduce((s, o) => s + Math.max(0, o.remaining - (taking.find((l) => l.itemId === o.itemId)?.receivedQty ?? 0)), 0);
      const status = left > 0 ? "PARTIAL" : "DELIVERED";
      await tx.purchaseOrder.update({ where: { id: poId }, data: { status } });
      return { grnCode, billAmount, status };
    });
    if (!out) return res.status(409).json({ error: "Đơn mua vừa được người khác nhận hàng. Tải lại để xem số còn phải giao." });

    res.json({ ok: true, ...out });
  });

  // 7b. Đóng đơn mua giao thiếu: không nhận thêm (phần thiếu không tính công nợ)
  r.post("/purchasing/orders/:id/close", ...approver, async (req, res) => {
    const note = (req.body as { note?: string }).note?.trim();
    if (!note) return res.status(400).json({ error: "Ghi lý do đóng đơn (VD: NCC hết hàng, không giao bù)." });
    const po = await prisma.purchaseOrder.findUnique({ where: { id: Number(req.params.id) } });
    if (!po || !inStore(req, po)) return res.status(404).json({ error: "Không tìm thấy đơn mua." });
    const done = await prisma.purchaseOrder.updateMany({ where: { id: po.id, status: { in: ["PENDING", "PARTIAL"] } }, data: { status: "CLOSED", closeNote: note.slice(0, 500) } });
    if (!done.count) return res.status(400).json({ error: "Đơn mua đã nhận đủ hoặc đã đóng." });
    res.json({ ok: true });
  });

  // Nhà cung cấp xem công nợ của mình: đã thanh toán / còn nợ
  r.get("/supplier/bills", authSupp, async (req, res) => {
    const supp = (req as SupplierRequest).supplier!;
    const bills = await prisma.supplierBill.findMany({
      where: { supplierId: supp.id, status: { not: "CANCELLED" } },
      include: { store: { select: { name: true } }, grn: { select: { code: true, po: { select: { code: true } } } } },
      orderBy: { billDate: "desc" },
    });
    res.json(bills.map((b) => ({ ...b, remaining: b.amount - b.paidAmount })));
  });

  // 8. Document Drive API
  r.get("/purchasing/documents", ...purchasing, async (req, res) => {
    // Collect all documents: PR, RFQ, PO, GRN
    const scope = storeWhere(req);
    const prs = await prisma.purchaseRequisition.findMany({ where: scope, include: { staff: { select: { fullName: true } } } });
    const rfqs = await prisma.requestForQuotation.findMany({ where: { requisition: scope } });
    const pos = await prisma.purchaseOrder.findMany({ where: scope, include: { supplier: { select: { name: true } } } });
    const grns = await prisma.goodsReceipt.findMany({ where: scope, include: { receivedBy: { select: { fullName: true } } } });

    const docs = [
      ...prs.map(p => ({ id: p.id, type: "PR", code: p.code, title: `Yêu cầu mua hàng của ${p.staff.fullName}`, date: p.createdAt, status: p.status })),
      ...rfqs.map(r => ({ id: r.id, type: "RFQ", code: r.code, title: `Yêu cầu báo giá ${r.code}`, date: r.createdAt, status: r.status })),
      ...pos.map(p => ({ id: p.id, type: "PO", code: p.code, title: `Đơn mua hàng từ ${p.supplier.name}`, date: p.createdAt, status: p.status })),
      ...grns.map(g => ({ id: g.id, type: "GRN", code: g.code, title: `Phiếu nhập kho bởi ${g.receivedBy.fullName}`, date: g.createdAt, status: g.status }))
    ];

    docs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    res.json(docs);
  });

  return r;
}
