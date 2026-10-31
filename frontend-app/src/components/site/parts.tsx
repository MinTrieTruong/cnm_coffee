import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, Plus } from "lucide-react";
import { calculateFinalPrice, mediaUrl, type Product } from "../../lib/api";
import { addToCart } from "../../lib/cart";
import { formatVnd } from "../../lib/site";

/** Tiêu đề mục: chữ poster + dòng serif nghiêng + gạch đôi; "Xem tất cả →" bên phải */
export function SectionHead({ title, sub, more, as: Tag = "h2" }: { title: string; sub?: string; more?: { to: string; label?: string }; as?: "h1" | "h2" }) {
  return (
    <div className="c-sec-head">
      <Tag className="c-sec-title">
        {title}
        {sub && <span className="c-sec-sub">— {sub}</span>}
      </Tag>
      {more && <Link to={more.to} className="c-sec-more">{more.label ?? "Xem tất cả"} →</Link>}
    </div>
  );
}

export function Crumbs({ items }: { items: { to?: string; label: string }[] }) {
  return (
    <nav className="c-crumbs" aria-label="Vị trí">
      <Link to="/">Trang chủ</Link>
      {items.map((it, i) => (
        <span key={i} style={{ display: "contents" }}>
          <span aria-hidden>/</span>
          {it.to && i < items.length - 1 ? <Link to={it.to}>{it.label}</Link> : <span aria-current={i === items.length - 1 ? "page" : undefined}>{it.label}</span>}
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

/** Giá bán size M (đã trừ giảm giá) — đúng giá ProductDetail tính khi chưa đổi size */
export const listPrice = (p: Product) => calculateFinalPrice(p.sellPrice, p.discountPercent);

/** Thêm nhanh 1 món size M, đá & đường mặc định (như mặc định ở trang chi tiết) */
export function quickAdd(p: Product) {
  const food = p.hasSizes === false;
  addToCart(p, {
    unitPrice: listPrice(p),
    quantity: 1,
    size: "M",
    icePct: 100,
    sugar: "100",
    notes: food ? "" : "Size M · Đá 100% · Đường 100%",
  });
}

/** Thẻ món: ảnh trên nền kem, tem giảm giá, tên, 1 dòng mô tả, giá gốc gạch + giá bán, nút "+" vuông */
export function ProductCard({ p, line }: { p: Product; line?: ReactNode }) {
  const [added, setAdded] = useState(false);
  const off = p.discountPercent && p.discountPercent > 0 ? p.discountPercent : 0;
  return (
    <article className="c-pcard">
      <Link to={`/product/${p.id}`} className="c-pcard-media" aria-label={p.name}>
        <ProductImage p={p} className="c-pcard-img" />
        {off > 0 && <span className="c-stamp c-pcard-stamp">Giảm {off}%</span>}
      </Link>
      <div className="c-pcard-body">
        <Link to={`/product/${p.id}`} className="c-pcard-name">{p.name}</Link>
        {line && <p className="c-pcard-line">{line}</p>}
        <div className="c-pcard-foot">
          <span className="c-pcard-prices">
            {off > 0 && <span className="c-price-old">{formatVnd(p.sellPrice)}</span>}
            <span className="c-price">{formatVnd(listPrice(p))}</span>
          </span>
          <button
            type="button"
            className={`c-add${added ? " is-done" : ""}`}
            onClick={() => {
              quickAdd(p);
              setAdded(true);
              window.setTimeout(() => setAdded(false), 1400);
            }}
            aria-label={added ? `Đã thêm ${p.name}` : `Thêm ${p.name} vào giỏ`}
          >
            {added ? <Check size={18} aria-hidden /> : <Plus size={18} aria-hidden />}
          </button>
        </div>
      </div>
    </article>
  );
}

export type PublicVoucher = { id: number; code: string; description: string | null; discountValue: number; minBillValue: number; endDate: string };

/** Vé voucher xé: mã + điều kiện, mép răng cưa hai bên */
export function VoucherTicket({ v, note }: { v: PublicVoucher; note?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(v.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Chép mã voucher:", v.code);
    }
  }
  return (
    <div className="c-ticket">
      <div className="c-ticket-main">
        <span className="c-ticket-val">Giảm {formatVnd(v.discountValue)}</span>
        <span className="c-ticket-cond">{v.description ?? (v.minBillValue ? `Đơn từ ${formatVnd(v.minBillValue)}` : "Mọi đơn")}</span>
        {note && <span className="c-ticket-note">{note}</span>}
        <span className="c-ticket-exp">HSD {new Date(v.endDate).toLocaleDateString("vi-VN")}</span>
      </div>
      <div className="c-ticket-stub">
        <span className="c-ticket-k">Nhập mã</span>
        <span className="c-ticket-code">{v.code}</span>
        <button type="button" className="c-ticket-btn" onClick={() => void copy()}>{copied ? "Đã chép" : "Chép mã"}</button>
      </div>
    </div>
  );
}
