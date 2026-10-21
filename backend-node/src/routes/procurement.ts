import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { signSupplierToken } from "../lib/jwt.js";
import { attachSupplier, type SupplierRequest } from "../middleware/supplier.js";
import { attachStaff, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { inStore, mustStoreId, storeWhere } from "../lib/storeScope.js";
import { adjustStoreStock } from "../lib/inventory.js";
import { productsUsingItems, recalcProductCost } from "../lib/productCost.js";
import { createBill } from "../lib/cash.js";

export function procurementRouter(prisma: PrismaClient) {
  const r = Router();
  const authStaff = attachStaff(prisma);
  /** Thủ kho lập đề xuất & nhận hàng; Quản lý chi nhánh duyệt đề xuất & chọn báo giá */
  const purchasing = [authStaff, requireRoles("Admin", "Warehouse")];
  const purchasingStore = [...purchasing, requireStore];
  const approver = [authStaff, requireRoles("Admin"), requireStore];
  const authSupp = attachSupplier(prisma);

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
    const { quoteId } = req.body as { quoteId: number };

    const quote = await prisma.supplierQuote.findUnique({
      where: { id: quoteId },
      include: { items: true, rfq: { include: { requisition: { include: { items: true } } } } }
    });

    if (!quote || quote.rfqId !== rfqId || !inStore(req, quote.rfq.requisition)) return res.status(400).json({ error: "Invalid quote" });
    if (quote.rfq.status === "CLOSED") return res.status(400).json({ error: "RFQ already closed" });

    const pr = quote.rfq.requisition;
    let totalAmount = 0;
    for (const pItem of pr.items) {
      const qItem = quote.items.find(q => q.itemId === pItem.itemId);
      if (qItem) totalAmount += qItem.unitPrice * pItem.qty;
    }

    const poCount = await prisma.purchaseOrder.count();
    const poCode = `PO-${new Date().getFullYear()}${(new Date().getMonth()+1).toString().padStart(2, '0')}-${String(poCount+1).padStart(4, '0')}`;

    await prisma.$transaction([
      prisma.requestForQuotation.update({ where: { id: rfqId }, data: { status: "CLOSED" } }),
      prisma.purchaseRequisition.update({ where: { id: pr.id }, data: { status: "COMPLETED" } }),
      prisma.supplierQuote.updateMany({ where: { rfqId, id: { not: quoteId } }, data: { status: "REJECTED" } }),
      prisma.supplierQuote.update({ where: { id: quoteId }, data: { status: "SELECTED" } }),
      prisma.purchaseOrder.create({
        data: {
          code: poCode,
          storeId: pr.storeId,
          quoteId: quote.id,
          supplierId: quote.supplierId,
          totalAmount
        }
      })
    ]);

    res.json({ ok: true, poCode });
  });

  // 6. Lấy danh sách PO
  r.get("/purchasing/orders", ...purchasing, async (req, res) => {
    const pos = await prisma.purchaseOrder.findMany({
      where: storeWhere(req),
      include: {
        store: { select: { id: true, name: true, address: true } },
        supplier: { select: { name: true } },
        quote: { include: { items: { include: { item: { select: { name: true, unit: true } } } }, rfq: { include: { requisition: { include: { items: { include: { item: { select: { name: true, unit: true } } } } } } } } } },
        receipts: true
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(pos);
  });

  // 7. Nhập kho (Receive PO) -> GRN & InventoryBatch
  r.post("/purchasing/orders/:id/receive", ...purchasingStore, async (req, res) => {
    const poId = Number(req.params.id);
    const staff = (req as StaffRequest).staffRow!;
    const { expiries } = req.body as { expiries: Record<number, string> }; // itemId -> YYYY-MM-DD

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: { quote: { include: { items: true, rfq: { include: { requisition: { include: { items: true } } } } } } }
    });

    if (!po || !inStore(req, po) || po.status === "DELIVERED") return res.status(400).json({ error: "PO invalid or already received" });

    const grnCount = await prisma.goodsReceipt.count();
    const grnCode = `GRN-${new Date().getFullYear()}${(new Date().getMonth()+1).toString().padStart(2, '0')}-${String(grnCount+1).padStart(4, '0')}`;

    await prisma.$transaction(async (tx) => {
      await tx.purchaseOrder.update({ where: { id: poId }, data: { status: "DELIVERED" } });

      const grn = await tx.goodsReceipt.create({
        data: {
          code: grnCode,
          storeId: po.storeId,
          poId,
          receivedById: staff.id,
          status: "COMPLETED"
        }
      });

      for (const prItem of po.quote.rfq.requisition.items) {
        const qItem = po.quote.items.find(q => q.itemId === prItem.itemId);
        if (!qItem) continue;

        const expiryDate = expiries && expiries[prItem.itemId] ? new Date(expiries[prItem.itemId]) : null;

        // Lấy tồn kho + giá vốn TRƯỚC KHI nhập để tính bình quân gia quyền.
        // Giá vốn dùng chung cả chuỗi nên tồn cũ là tổng tồn mọi chi nhánh.
        const currentItem = await tx.inventoryItem.findUnique({
          where: { id: prItem.itemId },
          select: { unitCostPrice: true }
        });
        const chainStock = await tx.storeInventory.aggregate({
          where: { itemId: prItem.itemId },
          _sum: { stockQty: true },
        });
        const oldQty = Math.max(0, chainStock._sum.stockQty ?? 0);
        const oldCost = currentItem?.unitCostPrice ?? 0;
        const newQty = prItem.qty;
        const newUnitPrice = qItem.unitPrice; // Đơn giá từ báo giá nhà cung cấp

        // Bình quân gia quyền: (tồn_cũ × giá_cũ + lượng_nhập × giá_nhập) / (tồn_cũ + lượng_nhập).
        // Tồn cũ chưa có giá (0đ) thì không tính vào, lấy luôn giá nhập — tránh kéo giá vốn xuống vô lý.
        const totalQtyAfter = oldQty + newQty;
        const weightedAvgCost = oldCost > 0 && totalQtyAfter > 0
          ? Math.round((oldQty * oldCost + newQty * newUnitPrice) / totalQtyAfter)
          : newUnitPrice;

        await tx.inventoryItem.update({
          where: { id: prItem.itemId },
          data: { unitCostPrice: weightedAvgCost },
        });
        // Giá nhập đổi → giá vốn các món dùng nguyên liệu này đổi theo
        await recalcProductCost(tx, await productsUsingItems(tx, [prItem.itemId]));

        await adjustStoreStock(tx, {
          storeId: po.storeId,
          itemId: prItem.itemId,
          qtyChange: prItem.qty,
          type: "RECEIVE",
          referenceId: grnCode,
        });

        const gri = await tx.goodsReceiptItem.create({
          data: {
            grnId: grn.id,
            itemId: prItem.itemId,
            receivedQty: prItem.qty,
            expiryDate
          }
        });

        await tx.inventoryBatch.create({
          data: {
            storeId: po.storeId,
            itemId: prItem.itemId,
            grnItemId: gri.id,
            originalQty: prItem.qty,
            remainingQty: prItem.qty,
            expiryDate
          }
        });
      }

      // Công nợ phải trả NCC = số lượng thực nhận × đơn giá báo giá, hạn trả theo kỳ hạn của NCC
      const billAmount = po.quote.rfq.requisition.items.reduce((sum, prItem) => {
        const qItem = po.quote.items.find((q) => q.itemId === prItem.itemId);
        return qItem ? sum + prItem.qty * qItem.unitPrice : sum;
      }, 0);
      if (billAmount > 0) {
        const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: po.supplierId }, select: { paymentTermDays: true } });
        const now = new Date();
        await createBill(tx, {
          storeId: po.storeId,
          supplierId: po.supplierId,
          source: "GRN",
          grnId: grn.id,
          amount: billAmount,
          billDate: now,
          dueDate: new Date(now.getTime() + supplier.paymentTermDays * 86400_000),
          note: `Nhận hàng ${grnCode} theo ${po.code}`,
          createdById: staff.id,
        });
      }
    });

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
