import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, Minus, Plus } from "lucide-react";
import { api, mediaUrl, type Product } from "../lib/api";
import { addToCart } from "../lib/cart";
import { formatVnd } from "../lib/site";
import { Crumbs, ProductImage, listPrice, quickAdd } from "../components/site/parts";

type Detail = Product & { sku?: string | null; outOfStock?: boolean; tags?: unknown };
type Review = { id: number; rating: number; comment: string | null; imageUrl: string | null; adminReply: string | null; createdAt: string; customer: { fullName: string } | null };
type Extras = { pairings: Product[]; reviews: Review[] };

const SIZES = ["S", "M", "L"] as const;
type Size = (typeof SIZES)[number];

/** Giá theo size trước giảm giá — S/L thiếu giá riêng thì −3.000 / +5.000 như trước */
function sizePrice(p: Product, s: Size) {
  if (s === "S") return Math.max(0, p.priceSizeS ?? p.sellPrice - 3000);
  if (s === "L") return p.priceSizeL ?? p.sellPrice + 5000;
  return p.sellPrice;
}
const off = (p: Product, n: number) => (p.discountPercent && p.discountPercent > 0 ? Math.round(n * (1 - p.discountPercent / 100)) : n);
const tagList = (t: unknown): string[] => {
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  if (typeof t === "string") {
    try {
      return tagList(JSON.parse(t));
    } catch {
      return [];
    }
  }
  return [];
};

/** Ô chọn dạng vuông (size, đá, đường) */
function Choice<T extends string | number>({ label, value, options, onChange, fmt }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; fmt?: (v: T) => string }) {
  return (
    <fieldset className="c-pd-opt">
      <legend>{label}</legend>
      <div className="c-pd-choices">
        {options.map((o) => (
          <button key={o} type="button" className={o === value ? "is-on" : undefined} aria-pressed={o === value} onClick={() => onChange(o)}>
            {fmt ? fmt(o) : String(o)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function PairRow({ p }: { p: Product }) {
  const [done, setDone] = useState(false);
  const off = p.discountPercent && p.discountPercent > 0;
  return (
    <li className="c-pair">
      <Link to={`/product/${p.id}`} className="c-pair-img"><ProductImage p={p} /></Link>
      <div className="c-pair-txt">
        <Link to={`/product/${p.id}`} className="c-pair-name">{p.name}</Link>
        <span>
          {off ? <span className="c-price-old">{formatVnd(p.sellPrice)}</span> : null} <span className="c-price">{formatVnd(listPrice(p))}</span>
        </span>
      </div>
      <button
        type="button"
        className={`c-add${done ? " is-done" : ""}`}
        onClick={() => {
          quickAdd(p);
          setDone(true);
          window.setTimeout(() => setDone(false), 1400);
        }}
        aria-label={done ? `Đã thêm ${p.name}` : `Thêm ${p.name} vào giỏ`}
      >
        {done ? <Check size={18} aria-hidden /> : <Plus size={18} aria-hidden />}
      </button>
    </li>
  );
}

export function ProductDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [p, setP] = useState<Detail | null>(null);
  const [extras, setExtras] = useState<Extras | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [size, setSize] = useState<Size>("M");
  const [icePct, setIcePct] = useState<0 | 50 | 100>(100);
  const [sugar, setSugar] = useState<"0" | "50" | "100">("100");
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setP(null);
    setErr(null);
    setExtras(null);
    setQty(1);
    api<Detail>(`/api/products/${id}`)
      .then((d) => !cancelled && setP(d))
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : "Lỗi"));
    api<Extras>(`/api/products/${id}/extras`)
      .then((d) => !cancelled && setExtras(d))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (err || !p) {
    return (
      <div className="c-wrap c-pd">
        <Crumbs items={[{ to: "/menu", label: "Thực đơn" }, { label: err ? "Không tìm thấy" : "Đang tải…" }]} />
        <p className="c-muted-txt">{err ?? "Đang tải…"}</p>
        {err && <Link to="/menu" className="c-btn is-outline">Về thực đơn</Link>}
      </div>
    );
  }

  // Món 1 loại (bánh…): không size / đá / đường — theo cờ hasSizes của món
  const isFood = p.hasSizes === false;
  const basePrice = isFood ? p.sellPrice : sizePrice(p, size);
  const unitPrice = off(p, basePrice);
  const hasDiscount = unitPrice < basePrice;
  const soldOut = !!p.outOfStock || !p.isActive;
  const tags = tagList(p.tags);

  function add() {
    if (!p) return;
    const noteParts = [];
    if (!isFood) noteParts.push(`Size ${size}`, `Đá ${icePct}%`, `Đường ${sugar}%`);
    if (notes.trim()) noteParts.push(notes.trim());
    addToCart(p, {
      unitPrice,
      quantity: qty,
      size: isFood ? "M" : size,
      icePct: isFood ? 100 : icePct,
      sugar: isFood ? "100" : sugar,
      notes: noteParts.join(" · "),
    });
  }

  const reviews = extras?.reviews ?? [];
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <div className="c-wrap c-pd">
      <Crumbs items={[{ to: "/menu", label: "Thực đơn" }, ...(p.category ? [{ to: `/menu?category=${p.category.id}`, label: p.category.name }] : []), { label: p.name }]} />

      <div className="c-pd-top">
        <div className="c-pd-gallery">
          <div className="c-pd-main">
            <ProductImage p={p} className="c-pd-img" />
            {hasDiscount && <span className="c-stamp c-pd-stamp">Giảm {p.discountPercent}%</span>}
          </div>
        </div>

        <div className="c-pd-info">
          <h1 className="c-pd-name">{p.name}</h1>
          <dl className="c-pd-meta">
            {p.sku && (<><dt>Mã</dt><dd>{p.sku}</dd></>)}
            <dt>Tình trạng</dt>
            <dd className={soldOut ? "is-out" : "is-in"}>{soldOut ? "Tạm hết" : "Còn hàng"}</dd>
            {p.category && (<><dt>Nhóm</dt><dd>{p.category.name}</dd></>)}
          </dl>
          <div className="c-pd-price">
            <span className="c-price">{formatVnd(unitPrice)}</span>
            {hasDiscount && <span className="c-price-old">{formatVnd(basePrice)}</span>}
          </div>

          {!isFood && (
            <>
              <Choice label="Kích cỡ" value={size} options={SIZES} onChange={setSize} />
              <Choice label="Lượng đá" value={icePct} options={[0, 50, 100] as const} onChange={setIcePct} fmt={(v) => `${v}%`} />
              <Choice label="Lượng đường" value={sugar} options={["0", "50", "100"] as const} onChange={setSugar} fmt={(v) => `${v}%`} />
            </>
          )}

          <label className="c-pd-opt">
            <span className="c-pd-label">Ghi chú</span>
            <input className="c-input" placeholder="Ít đá, thêm kem, không ống hút…" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={120} />
          </label>

          <div className="c-pd-qty-row">
            <span className="c-pd-label">Số lượng</span>
            <div className="c-qty">
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Bớt 1"><Minus size={16} aria-hidden /></button>
              <output aria-live="polite">{qty}</output>
              <button type="button" onClick={() => setQty((q) => Math.min(20, q + 1))} disabled={qty >= 20} aria-label="Thêm 1"><Plus size={16} aria-hidden /></button>
            </div>
            {qty > 1 && <span className="c-muted-txt">= {formatVnd(unitPrice * qty)}</span>}
          </div>

          <div className="c-pd-cta">
            <button type="button" className="c-btn" disabled={soldOut} onClick={() => { add(); nav("/cart"); }}>Mua ngay</button>
            <button
              type="button"
              className="c-btn is-outline"
              disabled={soldOut}
              onClick={() => {
                add();
                setAdded(true);
                window.setTimeout(() => setAdded(false), 1800);
              }}
            >
              {added ? "Đã thêm vào giỏ" : "Thêm vào giỏ"}
            </button>
          </div>
        </div>
      </div>

      <div className="c-pd-bottom">
        <section>
          <h2 className="c-pd-h">Mô tả sản phẩm</h2>
          <div className="c-pd-desc">
            <p>
              {p.name}
              {p.category ? ` thuộc nhóm ${p.category.name}` : ""}
              {isFood ? ", bán theo phần." : ", pha theo ly — chọn size, lượng đá và đường theo khẩu vị."}
            </p>
            {!isFood && (
              <table className="c-pd-sizes">
                <caption className="c-sr">Giá theo size</caption>
                <tbody>
                  {SIZES.map((s) => (
                    <tr key={s}>
                      <th scope="row">Size {s}</th>
                      <td className="c-leader" aria-hidden />
                      <td>{formatVnd(off(p, sizePrice(p, s)))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tags.length > 0 && <p className="c-pd-tags">{tags.join(" · ")}</p>}
          </div>
        </section>

        {!!extras?.pairings.length && (
          <aside className="c-pd-side">
            <h2 className="c-pd-h">Ăn kèm ngon hơn</h2>
            <ul className="c-pairs">{extras.pairings.map((x) => <PairRow key={x.id} p={x} />)}</ul>
          </aside>
        )}
      </div>

      <section className="c-pd-reviews">
        <h2 className="c-pd-h">
          Đánh giá của khách
          {reviews.length > 0 && <span className="c-pd-avg"> · {avg.toFixed(1)}/5 ({reviews.length})</span>}
        </h2>
        {reviews.length === 0 ? (
          <p className="c-muted-txt">Chưa có đánh giá cho món này.</p>
        ) : (
          <ul className="c-reviews">
            {reviews.map((r) => (
              <li key={r.id} className="c-review">
                <div className="c-review-head">
                  <strong>{r.customer?.fullName ?? "Khách"}</strong>
                  <span className="c-review-stars" aria-label={`${r.rating} trên 5 sao`}>{"★".repeat(r.rating)}<span aria-hidden className="is-dim">{"★".repeat(5 - r.rating)}</span></span>
                  <time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleDateString("vi-VN")}</time>
                </div>
                {r.comment && <p>{r.comment}</p>}
                {r.imageUrl && <img src={mediaUrl(r.imageUrl)} alt="Ảnh khách gửi" loading="lazy" className="c-review-img" />}
                {r.adminReply && <p className="c-review-reply"><strong>TD Coffee:</strong> {r.adminReply}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
