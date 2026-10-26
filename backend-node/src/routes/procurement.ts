import { Router } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { signSupplierToken } from "../lib/jwt.js";
import { attachSupplier, type SupplierRequest } from "../middleware/supplier.js";
import { attachStaff, requireRoles, requireStore, type StaffRequest } from "../middleware/staff.js";
import { inStore, mustStoreId, storeWhere } from "../lib/storeScope.js";
import { adjustStoreStock, roundQty } from "../lib/inventory.js";
import { applyIncomingCost, applyOutgoingCost } from "../lib/productCost.js";
import { createBill, createEntry, openSafeSession } from "../lib/cash.js";
import { saveDataUrlImage } from "../lib/uploadImage.js";
import { getStoreSettings } from "../lib/pricing.js";
import { notify } from "../lib/notify.js";
import { applySupplierCredits, billRemaining, REJECT_REASONS, RETURN_RESOLUTIONS, returnDeadline, type ReturnResolution } from "../lib/supplierReturns.js";

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
    cancels: true,
    // Hàng trả NCC để đổi → phải giao lại
    returns: { where: { status: "APPROVED", resolution: "REPLACE" }, include: { items: true } },
  } as const;
  type PoWithLines = Prisma.PurchaseOrderGetPayload<{ include: typeof poLinesInclude }>;

  /**
   * Mặt hàng của đơn mua = mặt hàng trong đề xuất có báo giá.
   * Còn phải giao = đặt − đã nhận − đã hủy (NCC không giao bù) + đã trả để đổi hàng.
   */
  function orderedLines(po: PoWithLines) {
    return po.quote.rfq.requisition.items.flatMap((pi) => {
      const q = po.quote.items.find((x) => x.itemId === pi.itemId);
      if (!q) return [];
      const grnItems = po.receipts.flatMap((g) => g.items.filter((x) => x.itemId === pi.itemId).map((x) => ({ ...x, at: g.createdAt })));
      const received = grnItems.reduce((a, x) => a + x.receivedQty, 0);
      const rejected = grnItems.reduce((a, x) => a + x.rejectedQty, 0);
      const cancelled = po.cancels.filter((c) => c.itemId === pi.itemId).reduce((a, c) => a + c.qty, 0);
      const replaced = Math.round(po.returns.reduce((a, rt) => a + rt.items.filter((x) => x.itemId === pi.itemId).reduce((b, x) => b + x.qty, 0), 0));
      const remaining = Math.max(0, pi.qty - received - cancelled + replaced);
      // Ngày hẹn giao bù: theo đợt nhận mới nhất có chọn chờ giao bù
      const last = [...grnItems].sort((a, b) => b.at.getTime() - a.at.getTime())[0];
      const backorderDate = remaining > 0 && last?.shortAction === "BACKORDER" ? last.backorderDate : null;
      return [{ itemId: pi.itemId, name: pi.item.name, unit: pi.item.unit, ordered: pi.qty, received, rejected, cancelled, replaced, remaining, backorderDate, unitPrice: q.unitPrice }];
    });
  }

  /** Trạng thái đơn mua sau khi nhận / hủy / đổi hàng: còn phải giao → PENDING/PARTIAL; hết mà có hủy → CLOSED; nhận đủ → DELIVERED */
  async function settlePoStatus(tx: Prisma.TransactionClient, poId: number, closeNote?: string) {
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: poId }, include: poLinesInclude });
    const lines = orderedLines(po);
    const left = lines.some((l) => l.remaining > 0);
    const due = lines.map((l) => l.backorderDate).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    const status = left ? (po.receipts.length ? "PARTIAL" : "PENDING") : po.cancels.length ? "CLOSED" : "DELIVERED";
    await tx.purchaseOrder.update({
      where: { id: poId },
      data: {
        status,
        backorderDue: left ? due : null,
        ...(status === "CLOSED" && !po.closeNote ? { closeNote: closeNote ?? "Tự đóng: phần còn thiếu đã hủy" } : {}),
      },
    });
    return status;
  }

  /** Hủy phần còn phải giao (NCC không giao bù). reorder = tạo đề xuất mua mới cho phần đó */
  async function cancelRemaining(
    tx: Prisma.TransactionClient,
    po: { id: number; code: string; storeId: number },
    cut: { itemId: number; qty: number }[],
    opts: { reason: string; staffId: number; grnId?: number | null; reorder?: boolean },
  ) {
    const rows = cut.filter((c) => c.qty > 0);
    for (const c of rows) {
      await tx.purchaseOrderCancel.create({
        data: { poId: po.id, itemId: c.itemId, qty: c.qty, reason: opts.reason.slice(0, 255), grnId: opts.grnId ?? null, createdById: opts.staffId },
      });
    }
    if (!opts.reorder || !rows.length) return null;
    const now = new Date();
    const pr = await tx.purchaseRequisition.create({
      data: {
        code: `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, storeId: po.storeId, staffId: opts.staffId, status: "PENDING",
        note: `Bổ sung từ ${po.code}: nhà cung cấp không giao đủ`.slice(0, 255),
        items: { create: rows.map((c) => ({ itemId: c.itemId, qty: c.qty })) },
      },
    });
    const code = `PR-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${String(pr.id).padStart(4, "0")}`;
    await tx.purchaseRequisition.update({ where: { id: pr.id }, data: { code } });
    return code;
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
        ...poLinesInclude,
        store: { select: { id: true, name: true, address: true } },
        receipts: { include: { items: { include: { item: { select: { name: true, unit: true } } } } }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" }
    });
    // lines: đặt / đã nhận / bị trả lại / đã hủy / còn phải giao bù (kèm ngày hẹn) — NCC biết phải giao gì tiếp
    res.json(pos.map((po) => ({ ...po, lines: orderedLines(po) })));
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
        ...poLinesInclude,
        store: { select: { id: true, name: true, address: true } },
        supplier: { select: { name: true } },
        quote: { include: { items: { include: { item: { select: { name: true, unit: true } } } }, rfq: { include: { requisition: { include: { items: { include: { item: { select: { name: true, unit: true } } } } } } } } } },
        receipts: { include: { items: true, receivedBy: { select: { fullName: true } } }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" }
    });
    // lines: đặt / đã nhận / trả lại / đã hủy / còn phải giao (+ hẹn giao bù) từng mặt hàng
    res.json(pos.map((po) => ({ ...po, lines: orderedLines(po) })));
  });

  // 7. Nhập kho theo PO → GRN + lô hàng. Nhận được nhiều đợt (giao thiếu / giao bù), công nợ theo số thực nhận
  //    body: { lines: [{ itemId, receivedQty, rejectedQty?, expiryDate?, note? }], note? }
  //    (body cũ { expiries } = nhận đủ phần còn lại)
  r.post("/purchasing/orders/:id/receive", ...purchasingStore, async (req, res) => {
    const poId = Number(req.params.id);
    const staff = (req as StaffRequest).staffRow!;
    type ReceiveLine = {
      itemId: number; receivedQty: number; rejectedQty?: number; expiryDate?: string | null; note?: string;
      /** Hàng trả lại lúc nhận: lý do (REJECT_REASONS) + ảnh (data URL) bắt buộc */
      rejectReason?: string; rejectPhoto?: string;
      /** Phần còn thiếu sau đợt này: chờ giao bù (mặc định, kèm ngày hẹn) hoặc hủy */
      shortAction?: "BACKORDER" | "CANCEL"; backorderDate?: string | null;
    };
    const body = req.body as {
      lines?: ReceiveLine[];
      note?: string;
      expiries?: Record<number, string>;
      /** Phần bị hủy → tạo đề xuất mua mới */
      reorder?: boolean;
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
      if (l.receivedQty + (l.rejectedQty ?? 0) > o.remaining) {
        return res.status(400).json({ error: `${o.name}: nhận ${l.receivedQty} + trả lại ${l.rejectedQty ?? 0} vượt số còn phải giao (${o.remaining}).` });
      }
      if (l.expiryDate && Number.isNaN(Date.parse(l.expiryDate))) return res.status(400).json({ error: `Hạn sử dụng của ${o.name} không hợp lệ.` });
      if ((l.rejectedQty ?? 0) > 0) {
        if (!l.rejectReason || !REJECT_REASONS[l.rejectReason]) return res.status(400).json({ error: `${o.name}: chọn lý do trả lại.` });
        if (!l.rejectPhoto) return res.status(400).json({ error: `${o.name}: chụp ảnh hàng lỗi làm bằng chứng.` });
      }
      if (l.shortAction && l.shortAction !== "BACKORDER" && l.shortAction !== "CANCEL") return res.status(400).json({ error: "Cách xử lý phần thiếu không hợp lệ." });
      if (l.backorderDate && Number.isNaN(Date.parse(l.backorderDate))) return res.status(400).json({ error: `Ngày hẹn giao bù của ${o.name} không hợp lệ.` });
    }
    const taking = lines.filter((l) => l.receivedQty > 0 || (l.rejectedQty ?? 0) > 0 || l.shortAction === "CANCEL");
    if (!taking.length) return res.status(400).json({ error: "Nhập số lượng thực nhận cho ít nhất 1 mặt hàng." });

    // Ảnh hàng lỗi: lưu trước khi mở transaction
    const photos = new Map<number, string>();
    for (const l of taking) {
      if ((l.rejectedQty ?? 0) > 0 && l.rejectPhoto) {
        try {
          photos.set(l.itemId, await saveDataUrlImage(l.rejectPhoto));
        } catch (e) {
          return res.status(400).json({ error: e instanceof Error ? e.message : "Ảnh không hợp lệ" });
        }
      }
    }
    // Mặc định hẹn giao bù sau 3 ngày nếu thủ kho không chọn ngày
    const defaultBackorder = new Date(Date.now() + 3 * 86400_000);

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
      const cancelled: { itemId: number; qty: number }[] = [];
      for (const l of taking) {
        const o = ordered.find((x) => x.itemId === l.itemId)!;
        const expiryDate = l.expiryDate ? new Date(l.expiryDate) : null;
        const rejectedQty = l.rejectedQty ?? 0;
        // Phần còn thiếu sau đợt này (giao thiếu + trả lại)
        const short = o.remaining - l.receivedQty;
        const shortAction = short > 0 ? (l.shortAction ?? "BACKORDER") : null;
        await tx.goodsReceiptItem.create({
          data: {
            grnId: g.id, itemId: l.itemId, receivedQty: l.receivedQty, rejectedQty, note: l.note?.trim().slice(0, 255) || null, expiryDate,
            rejectReason: rejectedQty > 0 ? l.rejectReason! : null,
            rejectPhoto: photos.get(l.itemId) ?? null,
            shortAction,
            backorderDate: shortAction === "BACKORDER" ? (l.backorderDate ? new Date(l.backorderDate) : defaultBackorder) : null,
          },
        });
        if (shortAction === "CANCEL") cancelled.push({ itemId: l.itemId, qty: short });
        if (l.receivedQty <= 0) continue;
        billAmount += l.receivedQty * o.unitPrice;
        // Giá nhập bình quân (tính trước khi cộng tồn) → giá vốn món đổi theo
        await applyIncomingCost(tx, l.itemId, l.receivedQty, o.unitPrice);
        await adjustStoreStock(tx, { storeId: po.storeId, itemId: l.itemId, qtyChange: l.receivedQty, type: "RECEIVE", referenceId: grnCode });
        // Lô hàng (bảng lô chung với nhập tay): có hạn dùng → cảnh báo sắp hết hạn, trừ dần khi xuất kho
        await tx.stockReceipt.create({
          data: {
            storeId: po.storeId, itemId: l.itemId, qty: l.receivedQty, remainingQty: l.receivedQty, expiryDate,
            source: "PO", supplierId: po.supplierId, unitPrice: o.unitPrice, note: `${grnCode} · ${po.code}`, receivedById: staff.id, grnId: g.id,
          },
        });
      }

      // Công nợ phải trả NCC = số thực nhận × đơn giá báo giá, hạn trả theo kỳ hạn của NCC
      if (billAmount > 0) {
        const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: po.supplierId }, select: { paymentTermDays: true } });
        const bill = await createBill(tx, {
          storeId: po.storeId, supplierId: po.supplierId, source: "GRN", grnId: g.id, amount: billAmount,
          billDate: now, dueDate: new Date(now.getTime() + supplier.paymentTermDays * 86400_000),
          note: `Nhận hàng ${grnCode} theo ${po.code}`, createdById: staff.id,
        });
        // NCC đang nợ quán (trả hàng trước đó) → bù trừ ngay vào hoá đơn này
        await applySupplierCredits(tx, po.storeId, po.supplierId, bill.id);
      }

      const reorderCode = await cancelRemaining(tx, po, cancelled, {
        reason: `Hủy khi nhận ${grnCode}${body.note?.trim() ? `: ${body.note.trim()}` : ""}`,
        staffId: staff.id, grnId: g.id, reorder: body.reorder,
      });
      const status = await settlePoStatus(tx, poId);
      return { grnCode, billAmount, status, reorderCode };
    });
    if (!out) return res.status(409).json({ error: "Đơn mua vừa được người khác nhận hàng. Tải lại để xem số còn phải giao." });

    res.json({ ok: true, ...out });
  });

  // 7b. Đóng đơn mua giao thiếu: không nhận thêm (phần thiếu không tính công nợ)
  //     body: { note, itemId?, reorder? } — có itemId: chỉ hủy phần còn thiếu của mặt hàng đó, đơn vẫn chờ các mặt hàng khác
  r.post("/purchasing/orders/:id/close", ...approver, async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const { note: rawNote, itemId, reorder } = req.body as { note?: string; itemId?: number; reorder?: boolean };
    const note = rawNote?.trim();
    if (!note) return res.status(400).json({ error: "Ghi lý do (VD: NCC hết hàng, không giao bù)." });
    const po = await prisma.purchaseOrder.findUnique({ where: { id: Number(req.params.id) }, include: poLinesInclude });
    if (!po || !inStore(req, po)) return res.status(404).json({ error: "Không tìm thấy đơn mua." });
    if (!["PENDING", "PARTIAL"].includes(po.status)) return res.status(400).json({ error: "Đơn mua đã nhận đủ hoặc đã đóng." });
    const cut = orderedLines(po).filter((l) => l.remaining > 0 && (itemId == null || l.itemId === itemId)).map((l) => ({ itemId: l.itemId, qty: l.remaining }));
    if (!cut.length) return res.status(400).json({ error: "Không còn phần nào phải giao để hủy." });
    const out = await prisma.$transaction(async (tx) => {
      // Khoá đơn giống lúc nhận hàng: không chạy song song với 1 lượt nhận
      const lock = await tx.purchaseOrder.updateMany({ where: { id: po.id, status: po.status, updatedAt: po.updatedAt }, data: { status: "RECEIVING" } });
      if (!lock.count) return null;
      const reorderCode = await cancelRemaining(tx, po, cut, { reason: note, staffId: staff.id, reorder });
      const status = await settlePoStatus(tx, po.id, note.slice(0, 500));
      return { status, reorderCode };
    });
    if (!out) return res.status(409).json({ error: "Đơn mua vừa thay đổi. Tải lại rồi thử lại." });
    res.json({ ok: true, ...out });
  });

  // Nhà cung cấp xem công nợ của mình: đã thanh toán / còn nợ
  r.get("/supplier/bills", authSupp, async (req, res) => {
    const supp = (req as SupplierRequest).supplier!;
    const bills = await prisma.supplierBill.findMany({
      where: { supplierId: supp.id, status: { not: "CANCELLED" } },
      include: { store: { select: { name: true } }, grn: { select: { code: true, po: { select: { code: true } } } } },
      orderBy: { billDate: "desc" },
    });
    res.json(bills.map((b) => ({ ...b, remaining: billRemaining(b) })));
  });

  /* ═══════════ TRẢ HÀNG NHÀ CUNG CẤP (lỗi phát hiện sau khi nhập kho) ═══════════ */

  const returnInclude = {
    supplier: { select: { id: true, name: true } },
    po: { select: { id: true, code: true } },
    createdBy: { select: { fullName: true } },
    approvedBy: { select: { fullName: true } },
    credit: true,
    items: { include: { item: { select: { name: true, unit: true } }, lot: { select: { id: true, receivedAt: true, expiryDate: true, note: true } } } },
  } as const;

  /** Lô còn hàng có nhà cung cấp — chọn để lập phiếu trả. Kèm hạn trả theo cài đặt. */
  r.get("/purchasing/returnable-lots", ...purchasingStore, async (req, res) => {
    const settings = await getStoreSettings(prisma);
    const lots = await prisma.stockReceipt.findMany({
      where: { storeId: mustStoreId(req), supplierId: { not: null }, remainingQty: { gt: 0.0001 } },
      include: { item: { select: { name: true, unit: true } }, supplierRel: { select: { id: true, name: true } } },
      orderBy: { receivedAt: "desc" },
      take: 300,
    });
    const now = Date.now();
    res.json(lots.map((l) => {
      const deadline = returnDeadline(l, settings.supplierReturnDays);
      return { ...l, deadline, overdue: deadline.getTime() < now };
    }));
  });

  r.get("/purchasing/returns", ...purchasing, async (req, res) => {
    const settings = await getStoreSettings(prisma);
    const rows = await prisma.supplierReturn.findMany({ where: storeWhere(req), include: returnInclude, orderBy: { id: "desc" }, take: 200 });
    // overdue: có lô lập phiếu sau hạn trả → quản lý phải ghi lý do khi duyệt
    res.json(rows.map((t) => ({ ...t, overdue: t.items.some((i) => returnDeadline(i.lot, settings.supplierReturnDays) < t.createdAt), returnDays: settings.supplierReturnDays })));
  });

  /** Thủ kho lập phiếu trả hàng (chưa trừ kho — chờ quản lý duyệt). body: { lines: [{ lotId, qty, reason, photo }], note } */
  r.post("/purchasing/returns", ...purchasingStore, async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const storeId = mustStoreId(req);
    const { lines, note } = req.body as { lines?: { lotId: number; qty: number; reason: string; photo?: string }[]; note?: string };
    if (!lines?.length) return res.status(400).json({ error: "Chọn ít nhất 1 lô hàng cần trả." });
    const lots = await prisma.stockReceipt.findMany({ where: { id: { in: lines.map((l) => Number(l.lotId)) }, storeId }, include: { item: { select: { name: true, unitCostPrice: true } } } });
    const supplierIds = new Set(lots.map((l) => l.supplierId));
    if (lots.length !== new Set(lines.map((l) => l.lotId)).size || lots.length !== lines.length) return res.status(400).json({ error: "Lô hàng không hợp lệ hoặc bị chọn trùng." });
    if (supplierIds.size !== 1 || supplierIds.has(null)) return res.status(400).json({ error: "Một phiếu trả chỉ gồm hàng của cùng 1 nhà cung cấp." });
    for (const l of lines) {
      const lot = lots.find((x) => x.id === Number(l.lotId))!;
      const qty = roundQty(Number(l.qty));
      if (!(qty > 0) || qty > lot.remainingQty + 1e-9) return res.status(400).json({ error: `${lot.item.name}: số trả phải lớn hơn 0 và không quá số còn lại của lô (${lot.remainingQty}).` });
      if (!REJECT_REASONS[l.reason]) return res.status(400).json({ error: `${lot.item.name}: chọn lý do trả.` });
      if (!l.photo) return res.status(400).json({ error: `${lot.item.name}: chụp ảnh hàng lỗi làm bằng chứng.` });
    }
    // Lô nhập theo đơn mua → gắn đơn mua (dùng khi đổi hàng); nhiều đơn khác nhau thì để trống
    const grnIds = [...new Set(lots.map((l) => l.grnId).filter((x): x is number => x != null))];
    const grns = grnIds.length ? await prisma.goodsReceipt.findMany({ where: { id: { in: grnIds } }, select: { poId: true } }) : [];
    const poIds = [...new Set(grns.map((g) => g.poId))];
    const poId = poIds.length === 1 && lots.every((l) => l.grnId != null) ? poIds[0] : null;

    const photoUrls: string[] = [];
    for (const l of lines) {
      try {
        photoUrls.push(await saveDataUrlImage(l.photo!));
      } catch (e) {
        return res.status(400).json({ error: e instanceof Error ? e.message : "Ảnh không hợp lệ" });
      }
    }
    const ret = await prisma.$transaction(async (tx) => {
      const created = await tx.supplierReturn.create({
        data: {
          code: `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, storeId, supplierId: lots[0].supplierId!, poId,
          note: note?.trim().slice(0, 500) || null, createdById: staff.id,
          amount: lines.reduce((s, l) => {
            const lot = lots.find((x) => x.id === Number(l.lotId))!;
            return s + Math.round(roundQty(Number(l.qty)) * (lot.unitPrice ?? lot.item.unitCostPrice));
          }, 0),
          items: {
            create: lines.map((l, i) => {
              const lot = lots.find((x) => x.id === Number(l.lotId))!;
              return { lotId: lot.id, itemId: lot.itemId, qty: roundQty(Number(l.qty)), unitPrice: lot.unitPrice ?? lot.item.unitCostPrice, reason: l.reason, photoUrl: photoUrls[i] };
            }),
          },
        },
      });
      return tx.supplierReturn.update({ where: { id: created.id }, data: { code: `TH-${String(created.id).padStart(6, "0")}` } });
    });
    void notify({
      type: "SUPPLIER_RETURN",
      title: `Phiếu trả hàng ${ret.code} chờ duyệt`,
      body: `${lots.map((l) => l.item.name).join(", ")} — ${ret.amount.toLocaleString("vi-VN")}đ`,
      link: "/app/purchase/orders",
      storeId,
      to: { storeId, roles: ["Admin"], exceptStaffId: staff.id },
    });
    res.status(201).json(ret);
  });

  /**
   * Quản lý duyệt phiếu trả: trừ kho đúng lô, gỡ giá nhập bình quân, rồi xử lý tiền theo `resolution`.
   * body: { resolution, fund? (REFUND: SAFE | BANK), lateReason? (bắt buộc nếu quá hạn trả) }
   */
  r.post("/purchasing/returns/:id/approve", ...approver, async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const { resolution, fund, lateReason } = req.body as { resolution?: ReturnResolution; fund?: string; lateReason?: string };
    if (!resolution || !RETURN_RESOLUTIONS.includes(resolution)) return res.status(400).json({ error: "Chọn cách xử lý." });
    const ret = await prisma.supplierReturn.findUnique({ where: { id: Number(req.params.id) }, include: { items: { include: { lot: true, item: { select: { name: true } } } }, supplier: true } });
    if (!ret || !inStore(req, ret)) return res.status(404).json({ error: "Không tìm thấy phiếu trả hàng." });
    if (ret.status !== "PENDING") return res.status(400).json({ error: "Phiếu đã được xử lý." });
    const settings = await getStoreSettings(prisma);
    const overdue = ret.items.some((i) => returnDeadline(i.lot, settings.supplierReturnDays) < ret.createdAt);
    if (overdue && !lateReason?.trim()) return res.status(400).json({ error: `Có lô đã quá ${settings.supplierReturnDays} ngày kể từ ngày nhận — ghi lý do duyệt vượt hạn.` });
    if (resolution === "REPLACE" && !ret.poId) return res.status(400).json({ error: "Đổi hàng chỉ áp dụng cho hàng nhận theo cùng 1 đơn mua." });
    if (resolution === "REFUND" && fund !== "SAFE" && fund !== "BANK") return res.status(400).json({ error: "Chọn nhận tiền hoàn vào két hoặc ngân hàng." });
    const session = resolution === "REFUND" && fund === "SAFE" ? await openSafeSession(prisma, ret.storeId) : null;
    if (resolution === "REFUND" && fund === "SAFE" && !session) return res.status(400).json({ error: "Mở két trước khi nhận tiền mặt." });

    try {
      await prisma.$transaction(async (tx) => {
        const lock = await tx.supplierReturn.updateMany({
          where: { id: ret.id, status: "PENDING" },
          data: { status: "APPROVED", resolution, approvedById: staff.id, approvedAt: new Date(), lateReason: overdue ? lateReason!.trim().slice(0, 255) : null },
        });
        if (!lock.count) throw new Error("Phiếu vừa được người khác xử lý.");

        for (const i of ret.items) {
          const lot = await tx.stockReceipt.findUniqueOrThrow({ where: { id: i.lotId } });
          if (lot.remainingQty + 1e-9 < i.qty) throw new Error(`${i.item.name}: lô chỉ còn ${lot.remainingQty}, không đủ ${i.qty} để trả.`);
          await applyOutgoingCost(tx, i.itemId, i.qty, i.unitPrice);
          // Trừ đúng lô bị trả (không trừ theo hết-hạn-trước như xuất bán)
          await tx.stockReceipt.update({ where: { id: lot.id }, data: { remainingQty: roundQty(lot.remainingQty - i.qty) } });
          await adjustStoreStock(tx, { storeId: ret.storeId, itemId: i.itemId, qtyChange: -i.qty, type: "RETURN_SUPPLIER", referenceId: ret.code, lots: false });
          if (resolution === "WRITE_OFF") {
            await tx.wasteLog.create({
              data: {
                storeId: ret.storeId, staffId: staff.id, itemId: i.itemId, qty: i.qty, reason: "SUPPLIER",
                note: `${ret.code} · ${ret.supplier.name} không nhận lại (${REJECT_REASONS[i.reason] ?? i.reason})`.slice(0, 255),
                costValue: Math.round(i.qty * i.unitPrice),
              },
            });
          }
        }

        if (resolution === "CREDIT" && ret.amount > 0) {
          await tx.supplierCredit.create({ data: { storeId: ret.storeId, supplierId: ret.supplierId, returnId: ret.id, amount: ret.amount } });
          // Bù trước vào hoá đơn của đợt nhận có hàng bị trả, còn dư thì sang các hoá đơn khác của NCC
          const grnId = ret.items.map((i) => i.lot.grnId).find((x) => x != null);
          const bill = grnId ? await tx.supplierBill.findUnique({ where: { grnId }, select: { id: true } }) : null;
          await applySupplierCredits(tx, ret.storeId, ret.supplierId, bill?.id);
        }
        if (resolution === "REFUND" && ret.amount > 0) {
          await createEntry(tx, {
            storeId: ret.storeId, kind: "IN", toFund: fund!, safeSessionId: session?.id ?? null, category: "SUPPLIER_REFUND",
            amount: ret.amount, description: `${ret.supplier.name} hoàn tiền phiếu trả hàng ${ret.code}`,
            createdById: staff.id, approvedById: staff.id, approvedAt: new Date(),
          });
        }
        if (resolution === "REPLACE") await settlePoStatus(tx, ret.poId!);
      });
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : "Không duyệt được phiếu." });
    }
    res.json(await prisma.supplierReturn.findUnique({ where: { id: ret.id }, include: returnInclude }));
  });

  r.post("/purchasing/returns/:id/reject", ...approver, async (req, res) => {
    const staff = (req as StaffRequest).staffRow!;
    const note = (req.body as { note?: string }).note?.trim();
    if (!note) return res.status(400).json({ error: "Ghi lý do từ chối." });
    const ret = await prisma.supplierReturn.findUnique({ where: { id: Number(req.params.id) } });
    if (!ret || !inStore(req, ret)) return res.status(404).json({ error: "Không tìm thấy phiếu trả hàng." });
    const done = await prisma.supplierReturn.updateMany({
      where: { id: ret.id, status: "PENDING" },
      data: { status: "REJECTED", rejectNote: note.slice(0, 255), approvedById: staff.id, approvedAt: new Date() },
    });
    if (!done.count) return res.status(400).json({ error: "Phiếu đã được xử lý." });
    res.json({ ok: true });
  });

  /* Nhà cung cấp xem phiếu trả hàng đã duyệt, xác nhận hoặc khiếu nại (không chặn quy trình của quán) */
  r.get("/supplier/returns", authSupp, async (req, res) => {
    const supp = (req as SupplierRequest).supplier!;
    res.json(await prisma.supplierReturn.findMany({
      where: { supplierId: supp.id, status: "APPROVED" },
      include: { ...returnInclude, store: { select: { name: true } } },
      orderBy: { id: "desc" },
    }));
  });

  r.post("/supplier/returns/:id/respond", authSupp, async (req, res) => {
    const supp = await prisma.supplier.findUniqueOrThrow({ where: { id: (req as SupplierRequest).supplier!.id } });
    const { action, note } = req.body as { action?: string; note?: string };
    if (action !== "CONFIRM" && action !== "DISPUTE") return res.status(400).json({ error: "Thao tác không hợp lệ." });
    if (action === "DISPUTE" && !note?.trim()) return res.status(400).json({ error: "Ghi lý do khiếu nại." });
    const ret = await prisma.supplierReturn.findUnique({ where: { id: Number(req.params.id) } });
    if (!ret || ret.supplierId !== supp.id || ret.status !== "APPROVED") return res.status(404).json({ error: "Không tìm thấy phiếu trả hàng." });
    if (ret.supplierStatus) return res.status(400).json({ error: "Bạn đã phản hồi phiếu này." });
    await prisma.supplierReturn.update({
      where: { id: ret.id },
      data: { supplierStatus: action === "CONFIRM" ? "CONFIRMED" : "DISPUTED", supplierNote: note?.trim().slice(0, 500) || null, supplierAt: new Date() },
    });
    if (action === "DISPUTE") {
      void notify({
        type: "SUPPLIER_RETURN",
        title: `${supp.name} khiếu nại phiếu trả hàng ${ret.code}`,
        body: note!.trim(),
        severity: "IMPORTANT",
        link: "/app/purchase/orders",
        storeId: ret.storeId,
        to: { storeId: ret.storeId, roles: ["Admin"] },
      });
    }
    res.json({ ok: true });
  });

  // 8. Document Drive API
  r.get("/purchasing/documents", ...purchasing, async (req, res) => {
    // Collect all documents: PR, RFQ, PO, GRN
    const scope = storeWhere(req);
    const prs = await prisma.purchaseRequisition.findMany({ where: scope, include: { staff: { select: { fullName: true } } } });
    const rfqs = await prisma.requestForQuotation.findMany({ where: { requisition: scope } });
    const pos = await prisma.purchaseOrder.findMany({ where: scope, include: { supplier: { select: { name: true } } } });
    const grns = await prisma.goodsReceipt.findMany({ where: scope, include: { receivedBy: { select: { fullName: true } } } });
    const rets = await prisma.supplierReturn.findMany({ where: scope, include: { supplier: { select: { name: true } } } });

    const docs = [
      ...prs.map(p => ({ id: p.id, type: "PR", code: p.code, title: `Yêu cầu mua hàng của ${p.staff.fullName}`, date: p.createdAt, status: p.status })),
      ...rfqs.map(r => ({ id: r.id, type: "RFQ", code: r.code, title: `Yêu cầu báo giá ${r.code}`, date: r.createdAt, status: r.status })),
      ...pos.map(p => ({ id: p.id, type: "PO", code: p.code, title: `Đơn mua hàng từ ${p.supplier.name}`, date: p.createdAt, status: p.status })),
      ...grns.map(g => ({ id: g.id, type: "GRN", code: g.code, title: `Phiếu nhập kho bởi ${g.receivedBy.fullName}`, date: g.createdAt, status: g.status })),
      ...rets.map(t => ({ id: t.id, type: "RTV", code: t.code, title: `Phiếu trả hàng ${t.supplier.name}`, date: t.createdAt, status: t.status }))
    ];

    docs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    res.json(docs);
  });

  return r;
}
