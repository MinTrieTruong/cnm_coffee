/**
 * shared/brand.ts — Trang câu chuyện thương hiệu (/about) + hồ sơ chi nhánh (/stores/:id).
 * KHAI BÁO MỘT CHỖ, dùng chung:
 *  - backend: kiểm tra dữ liệu khi lưu (validateSection / validateStoreProfile), ghép bản tiếng Anh (mergeEn)
 *  - frontend (alias @shared/brand): kiểu dữ liệu để vẽ trang, mô tả trường để màn quản trị tự dựng form
 * File thuần TypeScript, không import gì (chạy được ở cả Node lẫn trình duyệt).
 */

/* ═══════════ Ảnh ═══════════ */

/**
 * Một ô ảnh. url: "/uploads/…" (ảnh chủ chuỗi tải lên) hoặc khóa ảnh mặc định "story/hat-rang" (public/site),
 * rỗng = chưa có ảnh (trang hiện ảnh giữ chỗ SVG). small: bản 800px (srcset). focus: điểm lấy nét 0–100%.
 */
export type BrandImage = { url: string; small?: string; alt: string; focus?: { x: number; y: number } };
export const EMPTY_IMAGE: BrandImage = { url: "", alt: "" };

/* ═══════════ Dữ liệu từng mục ═══════════ */

type Head = { eyebrow: string; title: string };
export type HeroData = Head & { subtitle: string; image: BrandImage };
export type FounderData = Head & { photo: BrandImage; opening: string; paragraphs: string[]; signature: BrandImage; name: string; role: string };
export type JourneyItem = { year: string; title: string; story: string; images: BrandImage[]; lesson: string };
export type JourneyData = Head & { items: JourneyItem[] };
export type HardestData = Head & { quote: string; story: string; outcome: string; image: BrandImage };
export type StatSource = "manual" | "stores" | "products" | "cups" | "rating";
export type StatItem = { source: StatSource; value: number; suffix: string; label: string; note: string };
export type StatsData = Head & { items: StatItem[] };
export type ValueItem = { title: string; text: string; image: BrandImage };
export type ValuesData = Head & { items: ValueItem[] };
export type FarmStep = { title: string; text: string; image: BrandImage };
export type FarmData = Head & { story: string; image: BrandImage; farmerName: string; farmerRegion: string; farmerQuote: string; farmerPhoto: BrandImage; steps: FarmStep[] };
export type TeamItem = { name: string; role: string; joinedYear: string; photo: BrandImage; favoriteProductId: number | null; quote: string };
export type TeamData = Head & { items: TeamItem[] };
export type SignatureItem = { productId: number | null; story: string; image: BrandImage };
export type SignatureData = Head & { items: SignatureItem[] };
export type StoresData = Head & { subtitle: string };
export type CommunityItem = { title: string; text: string; figure: string; figureLabel: string; image: BrandImage };
export type CommunityData = Head & { items: CommunityItem[] };
export type TestimonialItem = { reviewId: number | null; text: string; name: string; storeName: string; photo: BrandImage };
export type TestimonialsData = Head & { items: TestimonialItem[] };
export type PressItem = { outlet: string; title: string; url: string; logo: BrandImage };
export type PressData = Head & { items: PressItem[] };
export type GalleryItem = { image: BrandImage; caption: string; storeId: number | null; topic: string };
export type GalleryData = Head & { items: GalleryItem[] };
export type FutureData = Head & { text: string; image: BrandImage };

export type BrandDataMap = {
  hero: HeroData; founder: FounderData; journey: JourneyData; hardest: HardestData; stats: StatsData; values: ValuesData;
  farm: FarmData; team: TeamData; signature: SignatureData; stores: StoresData; community: CommunityData;
  testimonials: TestimonialsData; press: PressData; gallery: GalleryData; future: FutureData;
};
export type BrandKey = keyof BrandDataMap;
/** Một mục như API công khai trả về (đã ghép ngôn ngữ, đúng thứ tự, chỉ mục đang bật) */
export type BrandSection<K extends BrandKey = BrandKey> = { key: K; data: BrandDataMap[K] };

/* ═══════════ Mô tả trường (màn quản trị dựng form + backend kiểm tra) ═══════════ */

export type FieldDef =
  | { k: string; type: "text"; label: string; max: number; required?: boolean; hint?: string }
  | { k: string; type: "textarea"; label: string; max: number; rows?: number; required?: boolean; hint?: string }
  | { k: string; type: "paragraphs"; label: string; maxItems: number; max: number }
  | { k: string; type: "image"; label: string; ratio: string; recommend: string }
  | { k: string; type: "images"; label: string; maxItems: number; ratio: string; recommend: string }
  | { k: string; type: "number"; label: string; min: number; max: number; hint?: string }
  | { k: string; type: "select"; label: string; options: { value: string; label: string }[] }
  | { k: string; type: "multi"; label: string; options: { value: string; label: string }[] }
  | { k: string; type: "product" | "review" | "store"; label: string; hint?: string }
  | { k: string; type: "list"; label: string; itemLabel: string; maxItems: number; titleKey: string; fields: FieldDef[] };

const T = (k: string, label: string, max: number, extra: Partial<{ required: boolean; hint: string }> = {}): FieldDef => ({ k, type: "text", label, max, ...extra });
const A = (k: string, label: string, max: number, rows = 4, hint?: string): FieldDef => ({ k, type: "textarea", label, max, rows, hint });
const I = (k: string, label: string, ratio: string, recommend: string): FieldDef => ({ k, type: "image", label, ratio, recommend });
const HEAD: FieldDef[] = [T("eyebrow", "Nhãn nhỏ phía trên", 60), T("title", "Tiêu đề", 140, { required: true })];

export const STAT_SOURCES: { value: StatSource; label: string }[] = [
  { value: "manual", label: "Nhập tay" },
  { value: "stores", label: "Tự động: số chi nhánh" },
  { value: "products", label: "Tự động: số món đang bán" },
  { value: "cups", label: "Tự động: số ly đã bán" },
  { value: "rating", label: "Tự động: điểm đánh giá trung bình" },
];

export type SectionDef = { key: BrandKey; label: string; hint: string; defaultVisible: boolean; fields: FieldDef[] };

export const BRAND_SECTIONS: SectionDef[] = [
  { key: "hero", label: "Ảnh bìa đầu trang", hint: "Ảnh lớn toàn chiều ngang, tiêu đề và một câu phụ", defaultVisible: true,
    fields: [...HEAD, A("subtitle", "Câu phụ", 240, 2), I("image", "Ảnh bìa", "16 / 9", "Ngang, tối thiểu 1600×900")] },
  { key: "founder", label: "Thư người sáng lập", hint: "Chân dung khung vòm + lá thư 3–4 đoạn + chữ ký", defaultVisible: true,
    fields: [...HEAD, I("photo", "Ảnh chân dung", "4 / 5", "Dọc, tối thiểu 800×1000"), A("opening", "Câu mở đầu (chữ nghiêng)", 240, 2),
      { k: "paragraphs", type: "paragraphs", label: "Các đoạn thư", maxItems: 4, max: 900 },
      I("signature", "Chữ ký tay (PNG nền trong)", "3 / 1", "PNG nền trong suốt, khoảng 600×200"), T("name", "Tên người ký", 80), T("role", "Vai trò", 80)] },
  { key: "journey", label: "Hành trình khởi nghiệp", hint: "Các mốc năm xen trái / phải", defaultVisible: true,
    fields: [...HEAD, { k: "items", type: "list", label: "Các mốc", itemLabel: "Mốc", maxItems: 12, titleKey: "title", fields: [
      T("year", "Năm", 10, { required: true }), T("title", "Tiêu đề", 120, { required: true }), A("story", "Câu chuyện (2–4 câu)", 900, 4),
      { k: "images", type: "images", label: "Ảnh (tối đa 3)", maxItems: 3, ratio: "4 / 3", recommend: "Ngang 4:3, tối thiểu 1200×900" },
      T("lesson", "Điều tụi mình học được (tuỳ chọn)", 240)] }] },
  { key: "hardest", label: "Những ngày khó nhất", hint: "Trích dẫn lớn trên nền tối — một lần vấp ngã thật và cách vượt qua", defaultVisible: true,
    fields: [...HEAD, A("quote", "Câu trích dẫn lớn", 300, 3), A("story", "Chuyện đã xảy ra", 1200, 5), A("outcome", "Tụi mình đã vượt qua thế nào", 900, 4), I("image", "Ảnh mờ phía sau", "16 / 9", "Ngang, tối thiểu 1600×900")] },
  { key: "stats", label: "Con số biết nói", hint: "4 ô số đếm lên — nhập tay hoặc lấy tự động", defaultVisible: true,
    fields: [...HEAD, { k: "items", type: "list", label: "Các ô số", itemLabel: "Ô số", maxItems: 4, titleKey: "label", fields: [
      { k: "source", type: "select", label: "Nguồn số", options: STAT_SOURCES },
      { k: "value", type: "number", label: "Số (khi nhập tay)", min: 0, max: 1e9 }, T("suffix", "Hậu tố (VD: +, /5, %)", 8),
      T("label", "Nhãn", 60, { required: true }), T("note", "Chú thích nhỏ", 120)] }] },
  { key: "values", label: "Giá trị cốt lõi", hint: "3–4 thẻ: ảnh + tiêu đề + 2 câu", defaultVisible: true,
    fields: [...HEAD, { k: "items", type: "list", label: "Các giá trị", itemLabel: "Giá trị", maxItems: 4, titleKey: "title", fields: [
      T("title", "Tiêu đề", 60, { required: true }), A("text", "Hai câu", 300, 3), I("image", "Ảnh", "4 / 3", "Ngang 4:3, tối thiểu 1000×750")] }] },
  { key: "farm", label: "Từ nông trại đến ly", hint: "Vùng trồng, người nông dân hợp tác, 4 bước", defaultVisible: true,
    fields: [...HEAD, A("story", "Về vùng trồng", 1000, 4), I("image", "Ảnh vùng trồng", "4 / 3", "Ngang, tối thiểu 1400×1050"),
      T("farmerName", "Tên nông dân / nông hộ", 80), T("farmerRegion", "Vùng", 80), A("farmerQuote", "Một câu họ nói", 300, 2), I("farmerPhoto", "Ảnh nông dân", "1 / 1", "Vuông, tối thiểu 600×600"),
      { k: "steps", type: "list", label: "Các bước", itemLabel: "Bước", maxItems: 4, titleKey: "title", fields: [
        T("title", "Tên bước", 40, { required: true }), A("text", "Một câu", 200, 2), I("image", "Ảnh tròn", "1 / 1", "Vuông, tối thiểu 400×400")] }] },
  { key: "team", label: "Gương mặt sau quầy", hint: "Thẻ người: ảnh vòm, tên, vai trò, món tủ, một câu", defaultVisible: true,
    fields: [...HEAD, { k: "items", type: "list", label: "Thành viên", itemLabel: "Người", maxItems: 12, titleKey: "name", fields: [
      T("name", "Tên", 60, { required: true }), T("role", "Vai trò", 60), T("joinedYear", "Năm gia nhập", 10), I("photo", "Ảnh", "4 / 5", "Dọc, tối thiểu 600×750"),
      { k: "favoriteProductId", type: "product", label: "Món tủ", hint: "Chọn từ thực đơn — thẻ có link sang trang món" },
      A("quote", "\"Mình thích nhất ở quán là…\"", 200, 2)] }] },
  { key: "signature", label: "Ly làm nên tên tuổi", hint: "1–3 món signature kèm chuyện ra đời", defaultVisible: true,
    fields: [...HEAD, { k: "items", type: "list", label: "Món signature", itemLabel: "Món", maxItems: 3, titleKey: "story", fields: [
      { k: "productId", type: "product", label: "Món" }, A("story", "Chuyện ra đời của món", 700, 4),
      I("image", "Ảnh lớn (để trống = dùng ảnh món)", "4 / 5", "Dọc, tối thiểu 1000×1250")] }] },
  { key: "stores", label: "Mỗi quán một câu chuyện", hint: "Thẻ từng chi nhánh — sửa ảnh và câu riêng ở Cấu hình › Chi nhánh › Trang giới thiệu", defaultVisible: true,
    fields: [...HEAD, A("subtitle", "Câu phụ", 240, 2)] },
  { key: "community", label: "Cùng cộng đồng", hint: "Việc quán làm cho cộng đồng — ảnh + một con số", defaultVisible: true,
    fields: [...HEAD, { k: "items", type: "list", label: "Các việc", itemLabel: "Việc", maxItems: 6, titleKey: "title", fields: [
      T("title", "Tiêu đề", 80, { required: true }), A("text", "Mô tả ngắn", 300, 2), T("figure", "Con số (VD: 1.200 kg)", 30), T("figureLabel", "Nhãn con số", 60),
      I("image", "Ảnh", "4 / 3", "Ngang 4:3, tối thiểu 1000×750")] }] },
  { key: "testimonials", label: "Khách kể về tụi mình", hint: "Chọn từ đánh giá thật hoặc nhập tay", defaultVisible: true,
    fields: [...HEAD, { k: "items", type: "list", label: "Lời kể", itemLabel: "Lời kể", maxItems: 6, titleKey: "name", fields: [
      { k: "reviewId", type: "review", label: "Lấy từ đánh giá thật (tuỳ chọn)", hint: "Chọn đánh giá thì nội dung, tên, chi nhánh lấy từ đánh giá" },
      A("text", "Lời kể (nhập tay)", 500, 3), T("name", "Tên khách", 60), T("storeName", "Chi nhánh", 80), I("photo", "Ảnh khách (tuỳ chọn)", "1 / 1", "Vuông, tối thiểu 300×300")] }] },
  { key: "press", label: "Báo chí & giải thưởng", hint: "Logo + tiêu đề bài + link", defaultVisible: false,
    fields: [...HEAD, { k: "items", type: "list", label: "Bài báo / giải thưởng", itemLabel: "Bài", maxItems: 8, titleKey: "outlet", fields: [
      T("outlet", "Tờ báo / giải", 80, { required: true }), T("title", "Tiêu đề bài", 200), T("url", "Link (https://…)", 500), I("logo", "Logo", "3 / 1", "PNG nền trong, khoảng 600×200")] }] },
  { key: "gallery", label: "Không gian quán", hint: "Lưới ảnh, lọc theo chi nhánh, bấm xem lớn", defaultVisible: true,
    fields: [...HEAD, { k: "items", type: "list", label: "Ảnh", itemLabel: "Ảnh", maxItems: 30, titleKey: "caption", fields: [
      I("image", "Ảnh", "4 / 3", "Tối thiểu 1200px cạnh dài"), T("caption", "Chú thích", 140), { k: "storeId", type: "store", label: "Chi nhánh (tuỳ chọn)" },
      { k: "topic", type: "select", label: "Chủ đề", options: [{ value: "space", label: "Không gian" }, { value: "drinks", label: "Đồ uống" }, { value: "events", label: "Sự kiện" }] }] }] },
  { key: "future", label: "Chặng tiếp theo", hint: "Tầm nhìn 2–3 câu + ảnh, kết bằng nút ghé quán / xem thực đơn", defaultVisible: true,
    fields: [...HEAD, A("text", "Tầm nhìn", 600, 3), I("image", "Ảnh", "16 / 9", "Ngang, tối thiểu 1600×900")] },
];
export const BRAND_KEYS = BRAND_SECTIONS.map((s) => s.key);
export const sectionDef = (key: string) => BRAND_SECTIONS.find((s) => s.key === key);

/* ═══════════ Hồ sơ chi nhánh ═══════════ */

export const AMENITIES: { value: string; label: string }[] = [
  { value: "wifi", label: "Wifi" },
  { value: "outlet", label: "Ổ cắm" },
  { value: "parking", label: "Chỗ để xe" },
  { value: "aircon", label: "Máy lạnh" },
  { value: "outdoor", label: "Chỗ ngồi ngoài trời" },
  { value: "pets", label: "Cho mang thú cưng" },
  { value: "quiet", label: "Góc làm việc yên tĩnh" },
];
export type StorePhoto = { image: BrandImage; caption: string };
export type StoreProfile = {
  coverImage: BrandImage; tagline: string; openedYear: number | null; story: string;
  managerName: string; managerPhoto: BrandImage; managerQuote: string;
  amenities: string[]; favoriteSpots: StorePhoto[]; galleryImages: StorePhoto[];
};
export const STORE_PROFILE_FIELDS: FieldDef[] = [
  I("coverImage", "Ảnh bìa quán", "16 / 9", "Ngang, tối thiểu 1600×900"),
  T("tagline", "Một câu riêng của quán", 140, { hint: "VD: Quán có cây bàng trăm tuổi trước cửa" }),
  { k: "openedYear", type: "number", label: "Năm mở", min: 1990, max: 2100 },
  A("story", "Câu chuyện của quán (vì sao chọn chỗ này, điều đặc biệt)", 1500, 6),
  T("managerName", "Tên quản lý quán", 80), I("managerPhoto", "Ảnh quản lý", "4 / 5", "Dọc, tối thiểu 600×750"), A("managerQuote", "Lời chào của quản lý", 300, 2),
  { k: "amenities", type: "multi", label: "Tiện ích", options: AMENITIES },
  { k: "favoriteSpots", type: "list", label: "Góc ngồi được yêu thích", itemLabel: "Góc", maxItems: 4, titleKey: "caption", fields: [I("image", "Ảnh", "4 / 3", "Ngang 4:3, tối thiểu 1000×750"), T("caption", "Chú thích", 140)] },
  { k: "galleryImages", type: "list", label: "Thư viện ảnh của quán", itemLabel: "Ảnh", maxItems: 16, titleKey: "caption", fields: [I("image", "Ảnh", "4 / 3", "Tối thiểu 1200px cạnh dài"), T("caption", "Chú thích", 140)] },
];

/* ═══════════ Kiểm tra dữ liệu (theo từng ô) ═══════════ */

export type FieldErrors = Record<string, string>;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** Ảnh hợp lệ: ảnh tải lên (/uploads/…), khóa ảnh mặc định (chữ thường, a/b), hoặc rỗng */
const IMG_URL = /^(\/uploads\/[\w.-]+\.(png|jpe?g|webp|gif)|[a-z0-9-]+\/[a-z0-9-]+)?$/i;
const clampPct = (n: unknown) => (Number.isFinite(Number(n)) ? Math.min(100, Math.max(0, Math.round(Number(n)))) : 50);

function cleanImage(v: unknown, path: string, errs: FieldErrors, textOnly: boolean): BrandImage {
  const o = isObj(v) ? v : {};
  const alt = typeof o.alt === "string" ? o.alt.trim() : "";
  if (alt.length > 200) errs[`${path}.alt`] = "Mô tả ảnh tối đa 200 ký tự.";
  if (textOnly) return { url: "", alt };
  const url = typeof o.url === "string" ? o.url.trim() : "";
  const small = typeof o.small === "string" ? o.small.trim() : "";
  if (url.length > 1024 || !IMG_URL.test(url)) errs[`${path}.url`] = "Ảnh không hợp lệ — hãy tải ảnh lên.";
  if (small && !IMG_URL.test(small)) errs[`${path}.small`] = "Ảnh nhỏ không hợp lệ.";
  if (url && !alt) errs[`${path}.alt`] = "Nhập mô tả ảnh (cho người dùng trình đọc màn hình).";
  const f = isObj(o.focus) ? o.focus : {};
  return { url, ...(small ? { small } : {}), alt, focus: { x: clampPct(f.x), y: clampPct(f.y) } };
}

/**
 * Làm sạch + kiểm tra theo mô tả trường. textOnly = bản tiếng Anh: chỉ giữ chữ (và mô tả ảnh), bỏ số / ảnh / lựa chọn.
 * Trả về dữ liệu sạch và lỗi theo đường dẫn ô ("items.2.title").
 */
export function cleanFields(fields: FieldDef[], raw: unknown, textOnly = false, base = ""): { data: Record<string, unknown>; errors: FieldErrors } {
  const src = isObj(raw) ? raw : {};
  const out: Record<string, unknown> = {};
  const errors: FieldErrors = {};
  const p = (k: string) => (base ? `${base}.${k}` : k);
  for (const f of fields) {
    const v = src[f.k];
    switch (f.type) {
      case "text":
      case "textarea": {
        const s = typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : "";
        if (s.length > f.max) errors[p(f.k)] = `Tối đa ${f.max} ký tự (đang ${s.length}).`;
        if (f.required && !s && !textOnly) errors[p(f.k)] = "Không được để trống.";
        if (f.k === "url" && s && !/^https:\/\/\S+$/i.test(s)) errors[p(f.k)] = "Link phải bắt đầu bằng https://";
        out[f.k] = s;
        break;
      }
      case "paragraphs": {
        const arr = (Array.isArray(v) ? v : []).map((x) => (typeof x === "string" ? x.replace(/\r\n/g, "\n").trim() : ""));
        if (arr.length > f.maxItems) errors[p(f.k)] = `Tối đa ${f.maxItems} đoạn.`;
        arr.forEach((s, i) => { if (s.length > f.max) errors[p(`${f.k}.${i}`)] = `Tối đa ${f.max} ký tự (đang ${s.length}).`; });
        out[f.k] = textOnly ? arr : arr.filter(Boolean);
        break;
      }
      case "image":
        out[f.k] = cleanImage(v, p(f.k), errors, textOnly);
        break;
      case "images": {
        const arr = Array.isArray(v) ? v : [];
        if (arr.length > f.maxItems) errors[p(f.k)] = `Tối đa ${f.maxItems} ảnh.`;
        out[f.k] = arr.slice(0, f.maxItems).map((x, i) => cleanImage(x, p(`${f.k}.${i}`), errors, textOnly));
        break;
      }
      case "list": {
        const arr = Array.isArray(v) ? v : [];
        if (arr.length > f.maxItems) errors[p(f.k)] = `Tối đa ${f.maxItems} ${f.itemLabel.toLowerCase()}.`;
        out[f.k] = arr.slice(0, f.maxItems).map((x, i) => {
          const r = cleanFields(f.fields, x, textOnly, p(`${f.k}.${i}`));
          Object.assign(errors, r.errors);
          return r.data;
        });
        break;
      }
      default: {
        if (textOnly) break;
        if (f.type === "number") {
          const n = v === "" || v == null ? null : Number(v);
          if (n != null && (!Number.isFinite(n) || n < f.min || n > f.max)) errors[p(f.k)] = `Nhập số từ ${f.min} đến ${f.max}.`;
          out[f.k] = n != null && Number.isFinite(n) ? n : f.k === "value" ? 0 : null;
        } else if (f.type === "select") {
          out[f.k] = f.options.some((o) => o.value === v) ? v : f.options[0].value;
        } else if (f.type === "multi") {
          out[f.k] = (Array.isArray(v) ? v : []).filter((x) => f.options.some((o) => o.value === x));
        } else {
          // product / review / store: id số nguyên dương hoặc null
          const n = Number(v);
          out[f.k] = v != null && v !== "" && Number.isInteger(n) && n > 0 ? n : null;
        }
      }
    }
  }
  return { data: out, errors };
}

export function validateSection(key: string, data: unknown, en = false) {
  const def = sectionDef(key);
  if (!def) return { data: {}, errors: { _: "Mục không tồn tại." } as FieldErrors };
  return cleanFields(def.fields, data, en);
}
export const validateStoreProfile = (data: unknown) => cleanFields(STORE_PROFILE_FIELDS, data) as { data: StoreProfile; errors: FieldErrors };

/* ═══════════ Ghép bản tiếng Anh ═══════════ */

/** Chữ tiếng Anh có thì thay, thiếu thì giữ tiếng Việt. Danh sách ghép theo vị trí; ảnh chỉ thay mô tả (alt). */
export function mergeEn(fields: FieldDef[], vi: unknown, en: unknown): Record<string, unknown> {
  const a = isObj(vi) ? vi : {};
  const b = isObj(en) ? en : {};
  const out: Record<string, unknown> = { ...a };
  for (const f of fields) {
    const ev = b[f.k];
    if (f.type === "text" || f.type === "textarea") {
      if (typeof ev === "string" && ev.trim()) out[f.k] = ev;
    } else if (f.type === "paragraphs") {
      const va = Array.isArray(a[f.k]) ? (a[f.k] as string[]) : [];
      const ea = Array.isArray(ev) ? (ev as unknown[]) : [];
      out[f.k] = va.map((s, i) => (typeof ea[i] === "string" && (ea[i] as string).trim() ? ea[i] : s));
    } else if (f.type === "image") {
      if (isObj(ev) && typeof ev.alt === "string" && ev.alt.trim() && isObj(a[f.k])) out[f.k] = { ...(a[f.k] as object), alt: ev.alt };
    } else if (f.type === "images" || f.type === "list") {
      const va = Array.isArray(a[f.k]) ? (a[f.k] as unknown[]) : [];
      const ea = Array.isArray(ev) ? (ev as unknown[]) : [];
      out[f.k] = va.map((x, i) =>
        f.type === "list" ? mergeEn(f.fields, x, ea[i]) : isObj(ea[i]) && typeof (ea[i] as BrandImage).alt === "string" && (ea[i] as BrandImage).alt.trim() ? { ...(x as object), alt: (ea[i] as BrandImage).alt } : x,
      );
    }
  }
  return out;
}

/** Ô ảnh còn dùng ảnh mặc định / chưa có ảnh (màn quản trị chấm báo cần thay) */
export function countDefaultImages(fields: FieldDef[], data: unknown): number {
  const o = isObj(data) ? data : {};
  let n = 0;
  const isDefault = (img: unknown) => !isObj(img) || !String(img.url ?? "").startsWith("/uploads/");
  for (const f of fields) {
    if (f.type === "image") n += isDefault(o[f.k]) ? 1 : 0;
    else if (f.type === "images") n += (Array.isArray(o[f.k]) ? (o[f.k] as unknown[]) : []).filter(isDefault).length;
    else if (f.type === "list") for (const x of Array.isArray(o[f.k]) ? (o[f.k] as unknown[]) : []) n += countDefaultImages(f.fields, x);
  }
  return n;
}
