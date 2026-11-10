import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { attachStaff, requireRoles } from "../middleware/staff.js";
import { saveDataUrlImage } from "../lib/uploadImage.js";
import { storeWhere } from "../lib/storeScope.js";
import { bizRange } from "../lib/bizTime.js";

export function comboRouter(prisma: PrismaClient) {
  const r = Router();
  const admin = [attachStaff(prisma), requireRoles("Admin")];
  // Combo dùng chung cả chuỗi — chỉ Chủ chuỗi sửa
  const owner = [attachStaff(prisma), requireRoles("Owner")];

  // ────────────────────────────────────────────────────────────────────────────
  // PUBLIC ENDPOINTS
  // ────────────────────────────────────────────────────────────────────────────

  /** GET /api/combos — Lấy tất cả combo đang active */
  r.get("/combos", async (_req, res) => {
    try {
      const combos = await prisma.combo.findMany({
        where: { isActive: true },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sellPrice: true,
                  imageUrl: true,
                  isActive: true,
                },
              },
            },
            orderBy: { id: "asc" },
          },
        },
        orderBy: [{ isHot: "desc" }, { createdAt: "desc" }],
      });
      res.json(combos);
    } catch (e) {
      console.error("[combo GET /combos]", e);
      res.status(500).json({ error: "Lỗi tải danh sách combo" });
    }
  });

  /** GET /api/combos/hot — Chỉ lấy combo Hot đang active (dùng cho Homepage) */
  r.get("/combos/hot", async (_req, res) => {
    try {
      const combos = await prisma.combo.findMany({
        where: { isActive: true, isHot: true },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sellPrice: true,
                  imageUrl: true,
                  isActive: true,
                },
              },
            },
            orderBy: { id: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      res.json(combos);
    } catch (e) {
      console.error("[combo GET /combos/hot]", e);
      res.status(500).json({ error: "Lỗi tải hot combo" });
    }
  });

  /** GET /api/combos/:id — Chi tiết 1 combo */
  r.get("/combos/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ" });
    try {
      const combo = await prisma.combo.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sellPrice: true,
                  imageUrl: true,
                  isActive: true,
                  categoryId: true,
                },
              },
            },
          },
        },
      });
      if (!combo) return res.status(404).json({ error: "Không tìm thấy combo" });
      res.json(combo);
    } catch (e) {
      console.error("[combo GET /combos/:id]", e);
      res.status(500).json({ error: "Lỗi tải combo" });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // ADMIN ENDPOINTS
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/admin/combos/stats?from=YYYY-MM-DD&to=YYYY-MM-DD — combo bán được bao nhiêu (đơn đã thanh toán)
   * Mỗi combo: số suất, số đơn, doanh thu (= giá combo × số suất, ghi theo giá combo), giá lẻ tương đương, tiền đã giảm,
   * số lượng từng món đã xuất trong combo (kho trừ theo công thức từng món).
   * Đơn cũ trước khi có comboRef: ước tính số suất theo cấu hình combo hiện tại (estimated = true).
   */
  r.get("/admin/combos/stats", ...admin, async (req, res) => {
    const { from, to, fromYmd, toYmd } = bizRange(req.query.from as string | undefined, req.query.to as string | undefined, 29);
    const [combos, lines] = await Promise.all([
      prisma.combo.findMany({ include: { items: { include: { product: { select: { id: true, name: true, sellPrice: true } } } } } }),
      prisma.orderDetail.findMany({
        where: { comboId: { not: null }, order: { ...storeWhere(req), status: "Paid", createdAt: { gte: from, lte: to } } },
        select: { orderId: true, comboId: true, comboRef: true, comboQty: true, productId: true, quantity: true, unitPrice: true },
      }),
    ]);
    const stats = combos.map((c) => {
      const mine = lines.filter((l) => l.comboId === c.id);
      const refs = new Map<string, number>();
      const legacy = new Map<number, Map<number, number>>();
      for (const l of mine) {
        if (l.comboRef) refs.set(l.comboRef, l.comboQty ?? 1);
        else {
          const m = legacy.get(l.orderId) ?? new Map<number, number>();
          m.set(l.productId, (m.get(l.productId) ?? 0) + l.quantity);
          legacy.set(l.orderId, m);
        }
      }
      let units = [...refs.values()].reduce((a, b) => a + b, 0);
      for (const m of legacy.values()) {
        units += Math.max(0, ...c.items.map((i) => Math.floor((m.get(i.productId) ?? 0) / Math.max(1, i.quantity))));
      }
      const revenue = mine.reduce((a, l) => a + l.unitPrice * l.quantity, 0);
      const listUnit = c.items.reduce((a, i) => a + i.product.sellPrice * i.quantity, 0);
      const byProduct = new Map<number, number>();
      for (const l of mine) byProduct.set(l.productId, (byProduct.get(l.productId) ?? 0) + l.quantity);
      return {
        id: c.id, name: c.name, comboPrice: c.comboPrice, isActive: c.isActive,
        units,
        orders: new Set(mine.map((l) => l.orderId)).size,
        revenue,
        listValue: listUnit * units,
        discountGiven: Math.max(0, listUnit * units - revenue),
        items: c.items.map((i) => ({ productId: i.productId, name: i.product.name, perCombo: i.quantity, sold: byProduct.get(i.productId) ?? 0 })),
        estimated: legacy.size > 0,
      };
    });
    stats.sort((a, b) => b.units - a.units || b.revenue - a.revenue);
    res.json({ from: fromYmd, to: toYmd, combos: stats });
  });

  /** GET /api/admin/combos — Admin lấy tất cả combo (kể cả inactive) */
  r.get("/admin/combos", ...admin, async (_req, res) => {
    try {
      const combos = await prisma.combo.findMany({
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sellPrice: true,
                  imageUrl: true,
                },
              },
            },
            orderBy: { id: "asc" },
          },
        },
        orderBy: [{ isActive: "desc" }, { isHot: "desc" }, { createdAt: "desc" }],
      });
      res.json(combos);
    } catch (e) {
      console.error("[combo GET /admin/combos]", e);
      res.status(500).json({ error: "Lỗi tải danh sách combo" });
    }
  });

  /**
   * POST /api/admin/combos — Tạo combo mới
   * Body: { name, description?, imageUrl? (URL string hoặc base64), comboPrice, isHot, isActive, products: [{productId, quantity}] }
   */
  r.post("/admin/combos", ...owner, async (req, res) => {
    try {
      const body = req.body as {
        name: string;
        description?: string;
        imageUrl?: string;
        comboPrice: number;
        isHot?: boolean;
        isActive?: boolean;
        products: { productId: number; quantity: number }[];
      };

      if (!body.name?.trim()) return res.status(400).json({ error: "Tên combo không được để trống" });
      if (!body.comboPrice || body.comboPrice <= 0) return res.status(400).json({ error: "Giá combo không hợp lệ" });
      if (!body.products || body.products.length === 0) return res.status(400).json({ error: "Combo phải có ít nhất 1 sản phẩm" });

      // Tính originalPrice từ DB
      const productIds = body.products.map((p) => p.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, sellPrice: true },
      });
      const priceMap = new Map(products.map((p) => [p.id, p.sellPrice]));
      const originalPrice = body.products.reduce(
        (sum, p) => sum + (priceMap.get(p.productId) ?? 0) * p.quantity,
        0
      );

      if (body.comboPrice >= originalPrice) {
        return res.status(400).json({ error: "Giá combo phải nhỏ hơn giá gốc" });
      }

      // Xử lý ảnh nếu là base64
      let imageUrl = body.imageUrl?.trim() || null;
      if (imageUrl && imageUrl.startsWith("data:image")) {
        imageUrl = await saveDataUrlImage(imageUrl);
      }

      const combo = await prisma.combo.create({
        data: {
          name: body.name.trim(),
          description: body.description?.trim() || null,
          imageUrl,
          originalPrice,
          comboPrice: body.comboPrice,
          isHot: body.isHot ?? false,
          isActive: body.isActive ?? true,
          items: {
            create: body.products.map((p) => ({
              productId: p.productId,
              quantity: p.quantity,
            })),
          },
        },
        include: {
          items: { include: { product: { select: { id: true, name: true, sellPrice: true, imageUrl: true } } } },
        },
      });

      res.status(201).json(combo);
    } catch (e) {
      console.error("[combo POST /admin/combos]", e);
      res.status(500).json({ error: "Lỗi tạo combo" });
    }
  });

  /**
   * PUT /api/admin/combos/:id — Cập nhật combo
   * Xóa ComboItem cũ → tạo lại
   */
  r.put("/admin/combos/:id", ...owner, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ" });

    try {
      const body = req.body as {
        name?: string;
        description?: string;
        imageUrl?: string;
        comboPrice?: number;
        isHot?: boolean;
        isActive?: boolean;
        products?: { productId: number; quantity: number }[];
      };

      const existing = await prisma.combo.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "Không tìm thấy combo" });

      // Tính lại originalPrice nếu có thay đổi products
      let originalPrice = existing.originalPrice;
      let productsToSet = body.products;

      if (productsToSet && productsToSet.length > 0) {
        const productIds = productsToSet.map((p) => p.productId);
        const products = await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, sellPrice: true },
        });
        const priceMap = new Map(products.map((p) => [p.id, p.sellPrice]));
        originalPrice = productsToSet.reduce(
          (sum, p) => sum + (priceMap.get(p.productId) ?? 0) * p.quantity,
          0
        );
        const comboPrice = body.comboPrice ?? existing.comboPrice;
        if (comboPrice >= originalPrice) {
          return res.status(400).json({ error: "Giá combo phải nhỏ hơn giá gốc" });
        }
      }

      // Xử lý ảnh nếu là base64
      let imageUrl = body.imageUrl !== undefined ? body.imageUrl?.trim() || null : existing.imageUrl;
      if (imageUrl && imageUrl.startsWith("data:image")) {
        imageUrl = await saveDataUrlImage(imageUrl);
      }

      // Xóa items cũ và tạo lại nếu có products mới
      const updatedCombo = await prisma.$transaction(async (tx) => {
        if (productsToSet && productsToSet.length > 0) {
          await tx.comboItem.deleteMany({ where: { comboId: id } });
          return tx.combo.update({
            where: { id },
            data: {
              name: body.name?.trim() ?? existing.name,
              description: body.description !== undefined ? body.description?.trim() || null : existing.description,
              imageUrl,
              originalPrice,
              comboPrice: body.comboPrice ?? existing.comboPrice,
              isHot: body.isHot ?? existing.isHot,
              isActive: body.isActive ?? existing.isActive,
              items: {
                create: productsToSet.map((p) => ({
                  productId: p.productId,
                  quantity: p.quantity,
                })),
              },
            },
            include: {
              items: { include: { product: { select: { id: true, name: true, sellPrice: true, imageUrl: true } } } },
            },
          });
        } else {
          return tx.combo.update({
            where: { id },
            data: {
              name: body.name?.trim() ?? existing.name,
              description: body.description !== undefined ? body.description?.trim() || null : existing.description,
              imageUrl,
              comboPrice: body.comboPrice ?? existing.comboPrice,
              isHot: body.isHot ?? existing.isHot,
              isActive: body.isActive ?? existing.isActive,
            },
            include: {
              items: { include: { product: { select: { id: true, name: true, sellPrice: true, imageUrl: true } } } },
            },
          });
        }
      });

      res.json(updatedCombo);
    } catch (e) {
      console.error("[combo PUT /admin/combos/:id]", e);
      res.status(500).json({ error: "Lỗi cập nhật combo" });
    }
  });

  /** PATCH /api/admin/combos/:id/toggle-hot — Bật/tắt isHot */
  r.patch("/admin/combos/:id/toggle-hot", ...owner, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ" });
    try {
      const existing = await prisma.combo.findUnique({ where: { id }, select: { isHot: true } });
      if (!existing) return res.status(404).json({ error: "Không tìm thấy combo" });
      const updated = await prisma.combo.update({
        where: { id },
        data: { isHot: !existing.isHot },
        select: { id: true, isHot: true },
      });
      res.json(updated);
    } catch (e) {
      console.error("[combo PATCH toggle-hot]", e);
      res.status(500).json({ error: "Lỗi cập nhật trạng thái Hot" });
    }
  });

  /** PATCH /api/admin/combos/:id/toggle-active — Bật/tắt isActive */
  r.patch("/admin/combos/:id/toggle-active", ...owner, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ" });
    try {
      const existing = await prisma.combo.findUnique({ where: { id }, select: { isActive: true } });
      if (!existing) return res.status(404).json({ error: "Không tìm thấy combo" });
      const updated = await prisma.combo.update({
        where: { id },
        data: { isActive: !existing.isActive },
        select: { id: true, isActive: true },
      });
      res.json(updated);
    } catch (e) {
      console.error("[combo PATCH toggle-active]", e);
      res.status(500).json({ error: "Lỗi cập nhật trạng thái Active" });
    }
  });

  /** DELETE /api/admin/combos/:id — Xóa cứng combo */
  r.delete("/admin/combos/:id", ...owner, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ" });
    try {
      // Combo đã có đơn bán: giữ lại để còn lịch sử doanh thu / thống kê — chỉ cho ngừng bán
      const sold = await prisma.orderDetail.count({ where: { comboId: id } });
      if (sold > 0) return res.status(400).json({ error: "Combo đã có đơn bán — hãy tắt (ngừng bán) thay vì xoá để giữ lịch sử doanh thu." });
      // ComboItems tự xóa do onDelete: Cascade
      await prisma.combo.delete({ where: { id } });
      res.json({ ok: true });
    } catch (e) {
      console.error("[combo DELETE /admin/combos/:id]", e);
      res.status(500).json({ error: "Lỗi xóa combo" });
    }
  });

  return r;
}
