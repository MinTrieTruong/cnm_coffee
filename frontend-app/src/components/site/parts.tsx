import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Minus, Plus, Trash2 } from "lucide-react";
import { calculateFinalPrice, mediaUrl, tempChoices, type Product } from "../../lib/api";
import { addToCart, CART_EVENT, decProduct, drinkNotes, getCart } from "../../lib/cart";
import { formatVnd } from "../../lib/site";
import { useLang } from "../../lib/i18n";
import { cardLabels, prefConflicts, useDietPrefs } from "../../lib/nutrition";
import "../../styles/nutrition.css";
import { Divider, Eyebrow } from "./lux";

/** Đầu mục: nhãn nhỏ (eyebrow) + tiêu đề serif chữ thường + vạch chia có chấm + 1 dòng phụ; "xem tất cả" bên phải */
export function SectionHead({ title, sub, eyebrow, more, center, as: Tag = "h2" }: {
  title: ReactNode; sub?: string; eyebrow?: string; more?: { to: string; label?: string }; center?: boolean; as?: "h1" | "h2";
}) {
  const { t } = useLang();
  return (
    <div className={`c-sec-head${center ? " is-center" : ""}`}>
      <div className="c-sec-head-txt">
        {eyebrow && <Eyebrow>{t(eyebrow)}</Eyebrow>}
        <Tag className="c-sec-title">{typeof title === "string" ? t(title) : title}</Tag>
        <Divider center={center} />
        {sub && <p className="c-sec-sub">{t(sub)}</p>}
      </div>
      {more && <Link to={more.to} className="c-sec-more">{t(more.label ?? "Xem tất cả")} <span aria-hidden>→</span></Link>}
    </div>
  );
}

export function Crumbs({ items }: { items: { to?: string; label: string }[] }) {
  const { t } = useLang();
  return (
    <nav className="c-crumbs" aria-label={t("Vị trí")}>
      <Link to="/">{t("Trang chủ")}</Link>
      {items.map((it, i) => (
        <span key={i} style={{ display: "contents" }}>
          <span aria-hidden>/</span>
          {it.to && i < items.length - 1 ? <Link to={it.to}>{t(it.label)}</Link> : <span aria-current={i === items.length - 1 ? "page" : undefined}>{t(it.label)}</span>}
        </span>
      ))}
    </nav>
  );
}

/** Ảnh món; thiếu ảnh → khối kem có tên món chữ poster */
export function ProductImage({ p, className }: { p: Pick<Product, "name" | "imageUrl">; className?: string }) {
  const src = mediaUrl(p.imageUrl);
  const [broken, setBroken] = useState(false);
  return src && !broken ? (
    <img className={className} src={src} alt={p.name} loading="lazy" decoding="async" onError={() => setBroken(true)} />
  ) : (
    <span className={`${className ?? ""} c-noimg`} role="img" aria-label={p.name}>{p.name}</span>
  );
}

/**
 * Ảnh tròn đại diện danh mục: thử lần lượt các ảnh (ảnh danh mục → ảnh món), ảnh nào lỗi chuyển ảnh kế tiếp,
 * hết ảnh thì hiện khối kem nét vẽ ly — không bao giờ hiện icon ảnh vỡ.
 */
export function CategoryThumb({ name, images, className }: { name: string; images: string[]; className?: string }) {
  const [i, setI] = useState(0);
  const key = images.join("|");
  useEffect(() => setI(0), [key]);
  const src = mediaUrl(images[i]);
  return src ? (
    <img key={src} className={className} src={src} alt={name} loading="lazy" decoding="async" onError={() => setI((x) => x + 1)} />
  ) : (
    <span className={`${className ?? ""} c-noimg`} role="img" aria-label={name} />
  );
}

/** Giá bán size M (đã trừ giảm giá) — đúng giá ProductDetail tính khi chưa đổi size */
export const listPrice = (p: Product) => calculateFinalPrice(p.sellPrice, p.discountPercent);

/** Thêm nhanh 1 món size M, nóng/đá + đường mặc định (như mặc định ở trang chi tiết; món chỉ nóng → nóng) */
export function quickAdd(p: Product) {
  const food = p.hasSizes === false;
  const temp = tempChoices(p)[0] ?? null;
  addToCart(p, {
    unitPrice: listPrice(p),
    quantity: 1,
    size: "M",
    temp,
    icePct: 100,
    sugar: "100",
    notes: food ? "" : drinkNotes({ size: "M", temp, icePct: 100, sugar: "100" }),
  });
}

/** Tổng số lượng một món đang có trong giỏ (cộng mọi size/tuỳ chọn, không tính combo); tự cập nhật khi giỏ đổi */
function useCartQty(productId: number) {
  const count = () => getCart().reduce((s, i) => (!i.isCombo && i.productId === productId ? s + i.quantity : s), 0);
  const [qty, setQty] = useState(count);
  useEffect(() => {
    const on = () => setQty(count());
    on();
    window.addEventListener(CART_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(CART_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, [productId]);
  return qty;
}

/** Thẻ món: ảnh trên nền kem, tem giảm giá, tên, 1 dòng mô tả, giá gốc gạch + giá bán, nút "+" vuông */
/** Nhãn dinh dưỡng trên thẻ món (≤ 2) + nhắc nhẹ khi món không hợp sở thích ăn uống của khách (không ẩn món) */
export function NutritionTags({ p }: { p: Product }) {
  const { t } = useLang();
  const [prefs] = useDietPrefs();
  const labels = cardLabels(p.nutrition);
  const conflicts = prefConflicts(p.nutrition, prefs);
  if (!labels.length && !conflicts.length) return null;
  return (
    <span className="c-ntags">
      {conflicts.length > 0 && (
        <span className="c-ntag is-conflict" title={t("Không hợp sở thích ăn uống của bạn")}>
          <AlertTriangle size={12} aria-hidden /> {conflicts.slice(0, 2).map((c) => t(c)).join(" · ")}
        </span>
      )}
      {labels.filter((l) => !conflicts.includes(l.text)).map((l) => (
        <span key={l.key} className={`c-ntag is-${l.tone}`}>{t(l.text)}</span>
      ))}
    </span>
  );
}

export function ProductCard({ p, line, to }: { p: Product; line?: ReactNode; to?: string }) {
  const { t } = useLang();
  const inCart = useCartQty(p.id);
  const off = p.discountPercent && p.discountPercent > 0 ? p.discountPercent : 0;
  return (
    <article className={p.soldOut ? "c-pcard is-soldout" : "c-pcard"}>
      <Link to={to ?? `/product/${p.id}`} className="c-pcard-media" aria-label={p.name}>
        <ProductImage p={p} className="c-pcard-img" />
        {off > 0 && !p.soldOut && <span className="c-stamp c-pcard-stamp">{t("Giảm {n}%", { n: off })}</span>}
        {p.soldOut && <span className="c-pcard-soldout">{t("Hết hàng")}</span>}
      </Link>
      <div className="c-pcard-body">
        <Link to={to ?? `/product/${p.id}`} className="c-pcard-name">{p.name}</Link>
        {line && <p className="c-pcard-line">{line}</p>}
        <NutritionTags p={p} />
        {p.rating && p.rating.count > 0 && (
          <span className="c-pcard-rating" aria-label={t("{avg} trên 5 sao, {n} đánh giá", { avg: p.rating.avg.toFixed(1), n: p.rating.count })}>
            <span aria-hidden>★</span> {p.rating.avg.toFixed(1)} <span className="c-muted-txt">({p.rating.count})</span>
          </span>
        )}
        <div className="c-pcard-foot">
          <span className="c-pcard-prices">
            {off > 0 && <span className="c-price-old">{formatVnd(p.sellPrice)}</span>}
            <span className="c-price">{formatVnd(listPrice(p))}</span>
          </span>
          {p.soldOut ? (
            <span className="c-pcard-soldout-tag">{t("Hết hàng")}</span>
          ) : inCart > 0 ? (
            <span className="c-add-step" role="group" aria-label={t("{n} trong giỏ", { n: inCart })}>
              <button type="button" className="c-add" onClick={() => decProduct(p.id)} aria-label={inCart <= 1 ? t("Bỏ {name}", { name: p.name }) : t("Bớt 1")}>
                {inCart <= 1 ? <Trash2 size={16} aria-hidden /> : <Minus size={18} aria-hidden />}
              </button>
              <output className="c-add-qty" aria-live="polite">{inCart}</output>
              <button type="button" className="c-add" onClick={() => quickAdd(p)} aria-label={t("Thêm 1")}><Plus size={18} aria-hidden /></button>
            </span>
          ) : (
            <button type="button" className="c-add" onClick={() => quickAdd(p)} aria-label={t("Thêm {name} vào giỏ", { name: p.name })}>
              <Plus size={18} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export type PublicVoucher = { id: number; code: string; description: string | null; discountValue: number; minBillValue: number; endDate: string };

/** Vé voucher xé: mã + điều kiện, mép răng cưa hai bên */
export function VoucherTicket({ v, note }: { v: PublicVoucher; note?: ReactNode }) {
  const { t, date } = useLang();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(v.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt(t("Chép mã voucher:"), v.code);
    }
  }
  return (
    <div className="c-ticket">
      <div className="c-ticket-main">
        <span className="c-ticket-val">{t("Giảm {n}", { n: formatVnd(v.discountValue) })}</span>
        <span className="c-ticket-cond">{v.description ?? (v.minBillValue ? t("Đơn từ {n}", { n: formatVnd(v.minBillValue) }) : t("Mọi đơn"))}</span>
        {note && <span className="c-ticket-note">{note}</span>}
        <span className="c-ticket-exp">{t("HSD")} {date(v.endDate)}</span>
      </div>
      <div className="c-ticket-stub">
        <span className="c-ticket-k">{t("Nhập mã")}</span>
        <span className="c-ticket-code">{v.code}</span>
        <button type="button" className="c-ticket-btn" onClick={() => void copy()}>{copied ? t("Đã chép") : t("Chép mã")}</button>
      </div>
    </div>
  );
}
