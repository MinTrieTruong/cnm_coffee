/**
 * ai/agent/tools.ts — Công cụ (function calling) cho agent: tra dữ liệu THẬT trong CSDL, luôn theo chi nhánh của phiên.
 * Kết quả rút gọn ≤ 2.000 ký tự, là dữ liệu (prompt dặn model không làm theo chỉ dẫn trong đó).
 */
import type { FunctionDeclaration } from "@google/genai";
import { prisma } from "../../db.js";
import { storeMenuState } from "../../lib/storeProducts.js";
import { TEMP_LABEL, unitPriceOf, type Size } from "../../lib/menuPrice.js";
import { activePromotions, describeTier, type Channel } from "../../lib/promotions.js";
import { voucherStoreError } from "../../lib/stores.js";
import { AI_CONFIG, gemini, withRetry } from "../gemini.js";
import { searchKnowledge, type SearchResult } from "../knowledge/search.js";
import { foldVi } from "../knowledge/text.js";
import { ALLERGEN_LABEL, DISCLAIMER, fitsDiet, isDiet, type Diet } from "../../lib/nutrition/labels.js";
import { parseAllergens } from "../../lib/nutrition/compute.js";
import { parseAliases } from "../../lib/productAliases.js";
import { siteFlags } from "../../routes/site.js";

export type ToolContext = {
  storeId: number;
  customerId: number | null;
  kbIds: number[];
  minScore: number;
  /** Đoạn tài liệu công cụ tim_kien_thuc tìm thêm (ghi vào nhật ký) */
  retrieved: SearchResult[];
  /** Model gọi chuyen_nhan_vien */
  handoff: { reason: string } | null;
  /** Token của lượt tìm web (cộng vào chi phí) */
  extraTokens: { prompt: number; output: number };
};

const MAX = 2000;
const cap = (s: string) => (s.length > MAX ? `${s.slice(0, MAX - 1)}…` : s);
const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

export function toolDeclarations(opts: { webSearch: boolean; handoff: boolean }): FunctionDeclaration[] {
  const list: FunctionDeclaration[] = [
    {
      name: "tra_cuu_mon",
      description: "Tra món trong thực đơn của chi nhánh: tên, size, giá, nóng / đá, còn hay hết. Không truyền gì thì trả danh mục + món bán chạy.",
      parametersJsonSchema: {
        type: "object",
        properties: {
          tu_khoa: { type: "string", description: "Tên món hoặc từ khóa, VD 'bạc xỉu', 'trà đào'" },
          danh_muc: { type: "string", description: "Tên danh mục, VD 'cà phê', 'trà', 'bánh'" },
        },
      },
    },
    {
      name: "tra_cuu_combo",
      description: "Tra combo (gói nhiều món giá ưu đãi) đang bán: tên, gồm những món nào, giá combo, giá gốc, còn bán ở chi nhánh không.",
      parametersJsonSchema: {
        type: "object",
        properties: { tu_khoa: { type: "string", description: "Tên combo hoặc món có trong combo (bỏ trống = tất cả combo)" } },
      },
    },
    {
      name: "thong_tin_chi_nhanh",
      description: "Địa chỉ, giờ mở cửa, số điện thoại các chi nhánh đang hoạt động.",
      parametersJsonSchema: { type: "object", properties: { ten: { type: "string", description: "Tên / khu vực chi nhánh cần tìm (bỏ trống = tất cả)" } } },
    },
    {
      name: "khuyen_mai_hien_tai",
      description: "Chương trình ưu đãi và voucher công khai đang chạy ở chi nhánh, kèm điều kiện.",
      parametersJsonSchema: { type: "object", properties: {} },
    },
    {
      name: "tim_kien_thuc",
      description: "Tìm thêm trong kho tài liệu của quán (chính sách, giao hàng, thành viên, thương hiệu, câu hỏi thường gặp) bằng câu hỏi cụ thể.",
      parametersJsonSchema: { type: "object", properties: { cau_hoi: { type: "string" } }, required: ["cau_hoi"] },
    },
    {
      name: "tra_dinh_duong",
      description: "Dinh dưỡng ước tính của một món theo size: kcal, caffeine, đường, béo, đạm, chất gây dị ứng (sữa, hạt, gluten…). Dùng khi khách hỏi calo, caffeine, có sữa không…",
      parametersJsonSchema: { type: "object", properties: { ten_mon: { type: "string", description: "Tên món, VD 'bạc xỉu'" } }, required: ["ten_mon"] },
    },
    {
      name: "tim_mon_theo_che_do_an",
      description: "Tìm món đang bán ở chi nhánh hợp chế độ ăn: no_caffeine (không caffeine), low_caffeine (ít caffeine), no_milk (không sữa / lactose), low_sugar (ít đường), low_fat (ít béo), vegan (thuần chay), no_nuts (không hạt). Dùng khi khách hỏi 'món nào không caffeine', 'không uống được sữa thì uống gì'.",
      parametersJsonSchema: {
        type: "object",
        properties: { che_do: { type: "array", items: { type: "string", enum: ["no_caffeine", "low_caffeine", "no_milk", "low_sugar", "low_fat", "vegan", "no_nuts"] } } },
        required: ["che_do"],
      },
    },
    {
      name: "trang_thai_don",
      description: "Tình trạng một đơn hàng của khách (chỉ xem được khi khách đã đăng nhập đúng tài khoản đặt đơn).",
      parametersJsonSchema: { type: "object", properties: { ma_don: { type: "integer", description: "Mã đơn, VD 1052" } }, required: ["ma_don"] },
    },
  ];
  if (opts.handoff) {
    list.push({
      name: "chuyen_nhan_vien",
      description: "Chuyển cuộc trò chuyện cho nhân viên thật. AI sẽ ngừng trả lời phiên này.",
      parametersJsonSchema: { type: "object", properties: { ly_do: { type: "string" } }, required: ["ly_do"] },
    });
  }
  if (opts.webSearch) {
    list.push({
      name: "tim_tren_web",
      description: "Tìm trên Internet kiến thức chung (cà phê, đồ uống, sức khỏe, sự kiện…). Không dùng cho giá, món, chính sách của quán.",
      parametersJsonSchema: { type: "object", properties: { cau_hoi: { type: "string" } }, required: ["cau_hoi"] },
    });
  }
  return list;
}

/* ── Từng công cụ ── */

const DIET_TEXT: Record<Diet, string> = { no_caffeine: "không caffeine", low_caffeine: "ít caffeine", no_milk: "không sữa", low_sugar: "ít đường", low_fat: "ít béo", vegan: "thuần chay", no_nuts: "không hạt" };

/** Dinh dưỡng ước tính của một món (tính từ công thức × nguyên liệu đã duyệt) */
async function traDinhDuong(ctx: ToolContext, args: { ten_mon?: string }) {
  if (!(await siteFlags(prisma)).showNutrition) return "Quán chưa công bố thông tin dinh dưỡng. Khách cần thì hỏi nhân viên.";
  const q = foldVi(args.ten_mon ?? "");
  const state = await storeMenuState(prisma, ctx.storeId);
  const products = (await prisma.product.findMany({ where: { isActive: true }, select: { id: true, name: true, aliases: true, nutrition: true } }))
    .filter((p) => !state.disabled.has(p.id) && (foldVi(p.name).includes(q) || parseAliases(p.aliases).some((a) => foldVi(a).includes(q))))
    .slice(0, 3);
  if (!products.length) return `Không tìm thấy món "${args.ten_mon}".`;
  return [
    ...products.map((p) => {
      const sizes = p.nutrition.filter((n) => n.complete).sort((a, b) => "SML-".indexOf(a.size) - "SML-".indexOf(b.size));
      const allergens = parseAllergens(p.nutrition[0]?.allergens).map((a) => ALLERGEN_LABEL[a]);
      if (!sizes.length) return `- ${p.name}: chưa đủ dữ liệu dinh dưỡng${allergens.length ? `; chắc chắn có ${allergens.join(", ")}` : ""}.`;
      return `- ${p.name}: ${sizes.map((n) => `${n.size === "-" ? "" : `size ${n.size}: `}${Math.round(n.kcal)} kcal, caffeine ${Math.round(n.caffeineMg)} mg, đường ${n.sugarG} g, béo ${n.fatG} g`).join("; ")}${allergens.length ? `. Có ${allergens.join(", ")}` : ""}.`;
    }),
    `Lưu ý: ${DISCLAIMER} Đường giảm khi chọn ít đường.`,
  ].join("\n");
}

async function timMonTheoCheDoAn(ctx: ToolContext, args: { che_do?: string[] }) {
  if (!(await siteFlags(prisma)).showNutrition) return "Quán chưa công bố thông tin dinh dưỡng. Khách cần thì hỏi nhân viên.";
  const diets = (args.che_do ?? []).filter(isDiet);
  if (!diets.length) return "Chưa rõ chế độ ăn khách cần.";
  const state = await storeMenuState(prisma, ctx.storeId);
  const products = await prisma.product.findMany({ where: { isActive: true, outOfStock: false }, select: { id: true, name: true, nutrition: true } });
  const fit = products.filter((p) => {
    if (state.disabled.has(p.id) || state.soldOut.has(p.id)) return false;
    const n = p.nutrition.find((x) => x.size === "M") ?? p.nutrition.find((x) => x.size === "-");
    return !!n && diets.every((d) => fitsDiet({ kcal: n.kcal, fatG: n.fatG, sugarG: n.sugarG, caffeineMg: n.caffeineMg, allergens: parseAllergens(n.allergens), isVegan: n.isVegan, complete: n.complete }, d));
  });
  const want = diets.map((d) => DIET_TEXT[d]).join(", ");
  if (!fit.length) return `Hiện chưa có món nào chắc chắn ${want} theo dữ liệu của quán (món chưa đủ dữ liệu không được tính). Khách hỏi nhân viên để được tư vấn.`;
  return `Món ${want} (size M, theo công thức chuẩn): ${fit.map((p) => p.name).join(", ")}.
Lưu ý: ${DISCLAIMER}`;
}

async function traCuuMon(ctx: ToolContext, args: { tu_khoa?: string; danh_muc?: string }) {
  const [products, categories, state] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true }, select: { id: true, name: true, categoryId: true, sellPrice: true, priceSizeS: true, priceSizeL: true, discountPercent: true, hasSizes: true, temps: true, isBestSeller: true } }),
    prisma.category.findMany({ select: { id: true, name: true } }),
    storeMenuState(prisma, ctx.storeId),
  ]);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const sellable = products.filter((p) => !state.disabled.has(p.id));
  const kw = foldVi(args.tu_khoa ?? "");
  const cat = foldVi(args.danh_muc ?? "");
  if (!kw && !cat) {
    const best = sellable.filter((p) => p.isBestSeller).slice(0, 8);
    const cats = [...new Set(sellable.map((p) => catName.get(p.categoryId)).filter(Boolean))];
    const combos = await prisma.combo.count({ where: { isActive: true } });
    return `Danh mục: ${cats.join(", ")}.\nMón bán chạy: ${best.map((p) => p.name).join(", ") || "(chưa đánh dấu)"}.${combos ? `\nCó ${combos} combo đang bán — gọi tra_cuu_combo để xem.` : ""}\nHỏi cụ thể tên món để biết giá.`;
  }
  const words = kw.split(" ").filter(Boolean);
  const hits = sellable
    .map((p) => {
      const name = foldVi(p.name);
      const c = foldVi(catName.get(p.categoryId) ?? "");
      const score = (kw && name.includes(kw) ? 10 : 0) + words.filter((w) => name.includes(w)).length + (cat && c.includes(cat) ? 3 : 0);
      return { p, score, catOk: !cat || c.includes(cat) };
    })
    .filter((x) => x.score > 0 && x.catOk && (!kw || words.every((w) => foldVi(x.p.name).includes(w)) || x.score >= 10))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  if (!hits.length) return `Không có món lẻ nào khớp "${args.tu_khoa ?? args.danh_muc}" trong thực đơn chi nhánh này. Nếu khách hỏi gói / combo thì gọi tra_cuu_combo.`;
  return hits
    .map(({ p }) => {
      const sizes: Size[] = p.hasSizes ? ["S", "M", "L"] : ["M"];
      const price = sizes.map((s) => (p.hasSizes ? `${s} ${vnd(unitPriceOf(p, s))}` : vnd(unitPriceOf(p, s)))).join(", ");
      const temp = !p.hasSizes || p.temps === "NONE" ? "" : p.temps === "BOTH" ? " · nóng hoặc đá" : ` · chỉ ${TEMP_LABEL[p.temps as "HOT" | "ICED"]}`;
      const sale = p.discountPercent ? ` · đang giảm ${p.discountPercent}%` : "";
      const out = state.soldOut.has(p.id) ? " · HẾT HÀNG hôm nay" : "";
      return `- ${p.name} (${catName.get(p.categoryId) ?? ""}): ${price}${temp}${sale}${out}`;
    })
    .join("\n");
}

async function traCuuCombo(ctx: ToolContext, args: { tu_khoa?: string }) {
  const [combos, state] = await Promise.all([
    prisma.combo.findMany({
      where: { isActive: true },
      include: { items: { include: { product: { select: { id: true, name: true, isActive: true } } } } },
      orderBy: [{ isHot: "desc" }, { comboPrice: "asc" }],
    }),
    storeMenuState(prisma, ctx.storeId),
  ]);
  if (!combos.length) return "Hiện quán không có combo nào đang bán.";
  const kw = foldVi(args.tu_khoa ?? "").replace(/\bcombo\b/g, "").trim();
  const words = kw.split(" ").filter(Boolean);
  const hits = words.length
    ? combos.filter((c) => {
        const text = foldVi(`${c.name} ${c.description ?? ""} ${c.items.map((i) => i.product.name).join(" ")}`);
        return words.every((w) => text.includes(w));
      })
    : combos;
  if (!hits.length) return `Không có combo nào khớp "${args.tu_khoa}". Các combo đang bán: ${combos.map((c) => c.name).join(", ")}.`;
  return hits
    .slice(0, 10)
    .map((c) => {
      const items = c.items.map((i) => `${i.quantity > 1 ? `${i.quantity} ` : ""}${i.product.name}`).join(" + ");
      // Combo bán được khi mọi món trong combo còn bán ở chi nhánh
      const off = c.items.some((i) => !i.product.isActive || state.disabled.has(i.product.id) || state.soldOut.has(i.product.id));
      const save = c.originalPrice > c.comboPrice ? ` (giá gốc ${vnd(c.originalPrice)}, tiết kiệm ${vnd(c.originalPrice - c.comboPrice)})` : "";
      return `- ${c.name}: ${vnd(c.comboPrice)}${save}. Gồm: ${items}${c.description ? `. ${c.description}` : ""}${c.isHot ? " · combo nổi bật" : ""}${off ? " · TẠM HẾT ở chi nhánh này (có món trong combo đã hết)" : ""}`;
    })
    .join("\n");
}

async function thongTinChiNhanh(ctx: ToolContext, args: { ten?: string }) {
  const stores = await prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true, address: true, phone: true, openTime: true, closeTime: true } });
  const q = foldVi(args.ten ?? "");
  const list = q ? stores.filter((s) => foldVi(`${s.name} ${s.address ?? ""}`).includes(q)) : stores;
  if (!list.length) return `Không có chi nhánh nào khớp "${args.ten}". Các chi nhánh: ${stores.map((s) => s.name).join(", ")}.`;
  return list
    .map((s) => `- ${s.name}${s.id === ctx.storeId ? " (chi nhánh khách đang chat)" : ""}: ${s.address ?? "chưa có địa chỉ"}; mở cửa ${s.openTime && s.closeTime ? `${s.openTime}–${s.closeTime}` : "chưa cập nhật"}; điện thoại ${s.phone ?? "chưa cập nhật"}`)
    .join("\n");
}

async function khuyenMai(ctx: ToolContext) {
  const channels: [Channel, string][] = [["dineIn", "tại quán"], ["takeaway", "mang về"], ["delivery", "giao hàng"]];
  const byId = new Map<number, { name: string; desc: string | null; tiers: string[]; where: string[] }>();
  for (const [ch, label] of channels) {
    for (const p of await activePromotions(prisma, { storeId: ctx.storeId, channel: ch })) {
      const row = byId.get(p.id) ?? { name: p.name, desc: p.description, tiers: [], where: [] };
      if (!row.tiers.length) {
        const gifts = new Map((await prisma.product.findMany({ where: { id: { in: p.tiers.map((t) => t.giftProductId).filter((x): x is number => x != null) } }, select: { id: true, name: true } })).map((g) => [g.id, g.name]));
        row.tiers = p.tiers.map((t) => `từ ${t.minQty} món${t.minAmount ? `, đơn từ ${vnd(t.minAmount)}` : ""}: ${describeTier(t, t.giftProductId ? gifts.get(t.giftProductId) : null)}`);
      }
      row.where.push(label);
      byId.set(p.id, row);
    }
  }
  const now = new Date();
  const vouchers = await prisma.voucher.findMany({ where: { isActive: true, voucherType: "public", startDate: { lte: now }, endDate: { gte: now } }, take: 20 });
  const okVouchers = [];
  for (const v of vouchers) {
    if (v.quantity !== -1 && v.usedCount >= v.quantity) continue;
    if (await voucherStoreError(prisma, v.id, ctx.storeId)) continue;
    okVouchers.push(v);
  }
  const lines = [
    ...[...byId.values()].map((p) => `- Ưu đãi "${p.name}" (${p.where.join(", ")})${p.desc ? `: ${p.desc}` : ""}. ${p.tiers.join("; ")}`),
    ...okVouchers.map(
      (v) =>
        `- Voucher ${v.code}: giảm ${vnd(v.discountValue)}${v.minBillValue ? `, đơn từ ${vnd(v.minBillValue)}` : ""}${v.goldHourStart != null && v.goldHourEnd != null ? `, chỉ ${v.goldHourStart}h–${v.goldHourEnd}h` : ""}, hạn đến ${v.endDate.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}${v.description ? ` (${v.description})` : ""}`,
    ),
  ];
  return lines.length ? lines.join("\n") : "Hiện chi nhánh không có chương trình ưu đãi hay voucher công khai nào đang chạy.";
}

async function timKienThuc(ctx: ToolContext, args: { cau_hoi?: string }) {
  if (!args.cau_hoi?.trim()) return "Thiếu câu hỏi.";
  const out = await searchKnowledge({ kbIds: ctx.kbIds, query: args.cau_hoi, k: 4 });
  const good = out.results.filter((r) => (out.mode === "keyword" ? (r.keywordScore ?? 0) > 0 : (r.vectorScore ?? 0) >= ctx.minScore));
  ctx.retrieved.push(...good.filter((g) => !ctx.retrieved.some((x) => x.chunkId === g.chunkId)));
  if (!good.length) return "Không tìm thấy tài liệu liên quan trong kho của quán.";
  return good.map((r, i) => `[${i + 1}] ${r.title}${r.heading ? ` › ${r.heading}` : ""}\n${r.content}`).join("\n\n");
}

const ORDER_STATUS: Record<string, string> = { Pending_Grace: "chờ xác nhận / thanh toán", Paid: "đã thanh toán", Cancelled: "đã huỷ", Confirmed: "đã xác nhận" };
const DELIVERY: Record<string, string> = {
  Awaiting_Confirm: "chờ quán xác nhận", Preparing: "đang pha chế", Ready: "đang tìm tài xế", Assigned: "tài xế đang tới quán",
  Delivering: "đang giao", Delivered: "đã giao", Failed: "giao thất bại", Rejected: "đã huỷ",
};

async function trangThaiDon(ctx: ToolContext, args: { ma_don?: number }) {
  if (!ctx.customerId) return "Khách chưa đăng nhập — cần đăng nhập đúng tài khoản đặt đơn để xem đơn. Hướng dẫn khách đăng nhập hoặc xem ở trang Đơn hàng.";
  const id = Number(args.ma_don);
  const o = Number.isInteger(id) ? await prisma.order.findUnique({ where: { id }, select: { id: true, customerId: true, status: true, deliveryStatus: true, orderType: true, totalAmount: true, createdAt: true } }) : null;
  if (!o || o.customerId !== ctx.customerId) return `Không tìm thấy đơn #${args.ma_don} trong tài khoản của khách.`;
  return `Đơn #${o.id} (${o.orderType}), tạo lúc ${o.createdAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}, tổng ${vnd(o.totalAmount)}: ${ORDER_STATUS[o.status] ?? o.status}${o.deliveryStatus ? `, giao hàng: ${DELIVERY[o.deliveryStatus] ?? o.deliveryStatus}` : ""}.`;
}

/** Tìm web: gọi riêng Gemini có Google Search (không gộp chung với function calling) */
async function timTrenWeb(ctx: ToolContext, args: { cau_hoi?: string }) {
  if (!args.cau_hoi?.trim()) return "Thiếu câu hỏi.";
  const res = await withRetry(() =>
    gemini().models.generateContent({
      model: AI_CONFIG.chatModel,
      contents: [{ role: "user", parts: [{ text: `Tìm và tóm tắt ngắn (tối đa 120 từ, tiếng Việt) thông tin đáng tin cậy để trả lời: ${args.cau_hoi}` }] }],
      config: { tools: [{ googleSearch: {} }], abortSignal: AbortSignal.timeout(20_000), thinkingConfig: { thinkingBudget: 0 } },
    }),
  );
  ctx.extraTokens.prompt += res.usageMetadata?.promptTokenCount ?? 0;
  ctx.extraTokens.output += (res.usageMetadata?.candidatesTokenCount ?? 0) + (res.usageMetadata?.thoughtsTokenCount ?? 0);
  const sources = (res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
    .map((c) => c.web?.title)
    .filter(Boolean)
    .slice(0, 3);
  return `${res.text ?? "Không tìm được thông tin."}${sources.length ? `\nNguồn: ${sources.join(", ")}` : ""}`;
}

export async function runTool(ctx: ToolContext, name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case "tra_cuu_mon":
        return cap(await traCuuMon(ctx, args as { tu_khoa?: string; danh_muc?: string }));
      case "tra_cuu_combo":
        return cap(await traCuuCombo(ctx, args as { tu_khoa?: string }));
      case "thong_tin_chi_nhanh":
        return cap(await thongTinChiNhanh(ctx, args as { ten?: string }));
      case "khuyen_mai_hien_tai":
        return cap(await khuyenMai(ctx));
      case "tim_kien_thuc":
        return cap(await timKienThuc(ctx, args as { cau_hoi?: string }));
      case "tra_dinh_duong":
        return cap(await traDinhDuong(ctx, args as { ten_mon?: string }));
      case "tim_mon_theo_che_do_an":
        return cap(await timMonTheoCheDoAn(ctx, args as { che_do?: string[] }));
      case "trang_thai_don":
        return cap(await trangThaiDon(ctx, args as { ma_don?: number }));
      case "tim_tren_web":
        return cap(await timTrenWeb(ctx, args as { cau_hoi?: string }));
      case "chuyen_nhan_vien":
        ctx.handoff = { reason: String(args.ly_do ?? "").slice(0, 300) || "Khách cần nhân viên" };
        return "Đã ghi nhận yêu cầu chuyển nhân viên. Báo khách ngắn gọn rằng nhân viên sẽ trả lời ngay.";
      default:
        return `Không có công cụ ${name}.`;
    }
  } catch (e) {
    return `Công cụ ${name} lỗi: ${e instanceof Error ? e.message.slice(0, 200) : "không rõ"}. Đừng đoán, hãy nói khách chờ nhân viên kiểm tra.`;
  }
}
