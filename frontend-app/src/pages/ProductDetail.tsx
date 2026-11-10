import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Check, Minus, Plus, RotateCcw } from "lucide-react";
import { api, TEMP_TEXT, tempChoices, type Product, type Temp, type Usual } from "../lib/api";
import { addToCart, drinkNotes } from "../lib/cart";
import { trackProductView } from "../lib/track";
import { formatVnd } from "../lib/site";
import { useLang } from "../lib/i18n";
import { useCustomerStore, withStore } from "../lib/customerStore";
import { getUser } from "../lib/session";
import { ReviewComposer } from "../components/site/ReviewComposer";
import { Crumbs, ProductImage, listPrice, quickAdd, sizePrice, usualOptions } from "../components/site/parts";
import { ReviewItem, type PublicReviewRow } from "../components/site/ReviewItem";
import { NutritionPanel } from "../components/site/NutritionPanel";
import "../styles/habits.css";

type Detail = Product & { sku?: string | null; outOfStock?: boolean; tags?: unknown };
type Review = PublicReviewRow;
type Extras = { pairings: Product[]; reviews: Review[]; rating?: { avg: number; count: number } };

const SIZES = ["S", "M", "L"] as const;
type Size = (typeof SIZES)[number];

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
  const { t } = useLang();
  return (
    <fieldset className="c-pd-opt">
      <legend>{t(label)}</legend>
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
  const { t } = useLang();
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
        aria-label={done ? t("Đã thêm {name}", { name: p.name }) : t("Thêm {name} vào giỏ", { name: p.name })}
      >
        {done ? <Check size={18} aria-hidden /> : <Plus size={18} aria-hidden />}
      </button>
    </li>
  );
}

export function ProductDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { t } = useLang();
  const [p, setP] = useState<Detail | null>(null);
  const [extras, setExtras] = useState<Extras | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [size, setSize] = useState<Size>("M");
  /** Khách chọn nóng/đá — null = theo mặc định của món (kiểu đầu tiên trong tempChoices) */
  // ?temp=ICED|HOT (từ khối "Hợp thời tiết hôm nay") → chọn sẵn bản đá / nóng nếu món có
  const [params] = useSearchParams();
  const [tempPick, setTempPick] = useState<Temp | null>(() => {
    const q = params.get("temp");
    return q === "ICED" || q === "HOT" ? q : null;
  });
  const [icePct, setIcePct] = useState<0 | 50 | 100>(100);
  const [sugar, setSugar] = useState<"0" | "50" | "100">("100");
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  /** Khách đã gọi món này: chọn sẵn size / nóng-đá / đá / đường / ghi chú theo lựa chọn quen (đặt lại mặc định được) */
  const [usual, setUsual] = useState<{ usual: Usual; usualNote: string | null } | null>(null);
  const [usualOn, setUsualOn] = useState(false);
  const { storeId } = useCustomerStore();
  const user = getUser();
  /** Đơn đã mua món này mà khách chưa đánh giá món → hiện nút "Viết đánh giá" */
  const [canReview, setCanReview] = useState<{ orderId: number } | null>(null);
  const [writing, setWriting] = useState(false);
  const [thanks, setThanks] = useState(false);
  const [reviewTick, setReviewTick] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setP(null);
    setErr(null);
    setExtras(null);
    setQty(1);
    api<Detail>(withStore(`/api/products/${id}`, storeId))
      .then((d) => {
        if (cancelled) return;
        setP(d);
        trackProductView(d.id);
      })
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : t("Lỗi")));
    api<Extras>(withStore(`/api/products/${id}/extras`, storeId))
      .then((d) => !cancelled && setExtras(d))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [id, storeId]);

  useEffect(() => {
    setCanReview(null);
    setWriting(false);
    if (!id || !user?.customerId) return;
    let cancelled = false;
    api<{ orderId: number } | null>(`/api/reviews/product-eligible/${id}`)
      .then((d) => !cancelled && setCanReview(d))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [id, user?.customerId, reviewTick]);

  useEffect(() => setThanks(false), [id]);

  useEffect(() => {
    setUsual(null);
    setUsualOn(false);
    if (!id || !user?.customerId) return;
    let cancelled = false;
    api<{ item: { usual: Usual; usualNote: string | null } | null }>(`/api/customer/usual/${id}`)
      .then((d) => !cancelled && setUsual(d.item))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [id, user?.customerId]);

  // Áp lựa chọn quen khi đã có món + thói quen; ?temp= (khối thời tiết) vẫn ưu tiên hơn nóng/đá quen
  useEffect(() => {
    if (!p || !usual || String(p.id) !== id) return;
    applyUsual(p, usual);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id, usual]);

  function applyUsual(prod: Product, u: { usual: Usual; usualNote: string | null }) {
    const o = usualOptions(prod, u.usual);
    const q = params.get("temp");
    if (!o.food) {
      setSize(o.size);
      if (q !== "ICED" && q !== "HOT") setTempPick(o.temp);
      setIcePct(o.icePct);
      setSugar(o.sugar);
    }
    setNotes(u.usualNote ?? "");
    setUsualOn(true);
  }
  function resetDefaults() {
    const q = params.get("temp");
    setSize("M");
    setTempPick(q === "ICED" || q === "HOT" ? q : null);
    setIcePct(100);
    setSugar("100");
    setNotes("");
    setUsualOn(false);
  }

  if (err || !p) {
    return (
      <div className="c-wrap c-pd">
        <Crumbs items={[{ to: "/menu", label: "Thực đơn" }, { label: err ? "Không tìm thấy" : "Đang tải…" }]} />
        <p className="c-muted-txt">{err ?? t("Đang tải…")}</p>
        {err && <Link to="/menu" className="c-btn is-outline">{t("Về thực đơn")}</Link>}
      </div>
    );
  }

  // Món 1 loại (bánh…): không size / đá / đường — theo cờ hasSizes của món
  const isFood = p.hasSizes === false;
  const basePrice = isFood ? p.sellPrice : sizePrice(p, size);
  const unitPrice = off(p, basePrice);
  const hasDiscount = unitPrice < basePrice;
  // soldOut: máy chủ tính theo chi nhánh khách đang chọn (báo hết / hết nguyên liệu / chi nhánh không bán)
  const soldOut = !!p.soldOut || !!p.outOfStock || !p.isActive;
  // Nhãn lưu kèm emoji ("🔥 Best Seller") — chỉ hiện phần chữ
  const tags = tagList(p.tags).map((t) => t.replace(/^[^\p{L}\p{N}]+/u, "").trim()).filter(Boolean);

  // Nóng / đá theo cấu hình món: món chỉ nóng / chỉ đá không cho chọn kiểu kia
  const temps = tempChoices(p);
  const temp: Temp | null = temps.length === 0 ? null : tempPick && temps.includes(tempPick) ? tempPick : temps[0];

  function add() {
    if (!p || soldOut) return;
    const noteParts = [];
    if (!isFood) noteParts.push(drinkNotes({ size, temp, icePct, sugar }));
    if (notes.trim()) noteParts.push(notes.trim());
    addToCart(p, {
      unitPrice,
      quantity: qty,
      size: isFood ? "M" : size,
      temp,
      icePct: isFood || temp === "HOT" ? 100 : icePct,
      sugar: isFood ? "100" : sugar,
      notes: noteParts.join(" · "),
    }, "product_detail");
  }

  const reviews = extras?.reviews ?? [];
  const rating = extras?.rating ?? { avg: reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0, count: reviews.length };

  return (
    <div className="c-wrap c-pd">
      <Crumbs items={[{ to: "/menu", label: "Thực đơn" }, ...(p.category ? [{ to: `/menu?category=${p.category.id}`, label: p.category.name }] : []), { label: p.name }]} />

      <div className="c-pd-top">
        <div className="c-pd-gallery">
          <div className="c-pd-main">
            <ProductImage p={p} className="c-pd-img" />
            {hasDiscount && <span className="c-stamp c-pd-stamp">{t("Giảm {n}%", { n: p.discountPercent ?? 0 })}</span>}
          </div>
        </div>

        <div className="c-pd-info">
          <h1 className="c-pd-name">{p.name}</h1>
          <dl className="c-pd-meta">
            {p.sku && (<><dt>{t("Mã")}</dt><dd>{p.sku}</dd></>)}
            <dt>{t("Tình trạng")}</dt>
            <dd className={soldOut ? "is-out" : "is-in"}>{soldOut ? t("Tạm hết") : t("Còn hàng")}</dd>
            {p.category && (<><dt>{t("Nhóm")}</dt><dd>{p.category.name}</dd></>)}
          </dl>
          <div className="c-pd-price">
            <span className="c-price">{formatVnd(unitPrice)}</span>
            {hasDiscount && <span className="c-price-old">{formatVnd(basePrice)}</span>}
          </div>

          {usual && (
            <p className="c-pd-usual" role="status">
              {usualOn ? (
                <>
                  {t("Theo lựa chọn quen của bạn")} ·{" "}
                  <button type="button" className="c-linkish" onClick={resetDefaults}><RotateCcw size={13} aria-hidden /> {t("Đặt lại mặc định")}</button>
                </>
              ) : (
                <button type="button" className="c-linkish" onClick={() => applyUsual(p, usual)}>{t("Chọn theo lựa chọn quen của bạn")}</button>
              )}
            </p>
          )}

          {!isFood && (
            <>
              <Choice label="Kích cỡ" value={size} options={SIZES} onChange={setSize} />
              {temps.length > 1 && temp && <Choice label="Nóng / đá" value={temp} options={temps} onChange={setTempPick} fmt={(v) => t(TEMP_TEXT[v])} />}
              {temps.length === 1 && (
                <div className="c-pd-opt">
                  <span className="c-pd-label">{t("Nóng / đá")}</span>
                  <p className="c-muted-txt" style={{ margin: 0 }}>{temps[0] === "HOT" ? t("Món này chỉ phục vụ nóng") : t("Món này chỉ phục vụ đá")}</p>
                </div>
              )}
              {temp !== "HOT" && <Choice label="Lượng đá" value={icePct} options={[0, 50, 100] as const} onChange={setIcePct} fmt={(v) => `${v}%`} />}
              <Choice label="Lượng đường" value={sugar} options={["0", "50", "100"] as const} onChange={setSugar} fmt={(v) => `${v}%`} />
            </>
          )}

          <label className="c-pd-opt">
            <span className="c-pd-label">{t("Ghi chú")}</span>
            <input className="c-input" placeholder={t("Ít đá, thêm kem, không ống hút…")} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={120} />
          </label>

          <div className="c-pd-qty-row">
            <span className="c-pd-label">{t("Số lượng")}</span>
            <div className="c-qty">
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label={t("Bớt 1")}><Minus size={16} aria-hidden /></button>
              <output aria-live="polite">{qty}</output>
              <button type="button" onClick={() => setQty((q) => Math.min(20, q + 1))} disabled={qty >= 20} aria-label={t("Thêm 1")}><Plus size={16} aria-hidden /></button>
            </div>
            {qty > 1 && <span className="c-muted-txt">= {formatVnd(unitPrice * qty)}</span>}
          </div>

          <div className="c-pd-cta">
            <button type="button" className="c-btn" disabled={soldOut} onClick={() => { add(); nav("/cart"); }}>{t("Mua ngay")}</button>
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
              {soldOut ? t("Hết hàng") : added ? t("Đã thêm vào giỏ") : t("Thêm vào giỏ")}
            </button>
          </div>
          {soldOut && <p className="c-muted-txt c-pd-soldout" role="status">{t("Chi nhánh bạn chọn đang tạm hết món này. Thử chọn chi nhánh khác hoặc quay lại sau nhé.")}</p>}
        </div>
      </div>

      <div className="c-pd-bottom">
        <section>
          <h2 className="c-pd-h">{t("Mô tả sản phẩm")}</h2>
          <div className="c-pd-desc">
            <p>
              {p.category ? t("{name} thuộc nhóm {cat}", { name: p.name, cat: p.category.name }) : p.name}
              {isFood ? t(", bán theo phần.") : t(", pha theo ly — chọn size, lượng đá và đường theo khẩu vị.")}
            </p>
            {!isFood && (
              <table className="c-pd-sizes">
                <caption className="c-sr">{t("Giá theo size")}</caption>
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
          <NutritionPanel productId={p.id} size={isFood ? "-" : size} sugarPct={isFood ? 100 : Number(sugar)} />
        </section>

        {!!extras?.pairings.length && (
          <aside className="c-pd-side">
            <h2 className="c-pd-h">{t("Ăn kèm ngon hơn")}</h2>
            <ul className="c-pairs">{extras.pairings.map((x) => <PairRow key={x.id} p={x} />)}</ul>
          </aside>
        )}
      </div>

      <section className="c-pd-reviews">
        <div className="c-pd-rv-head">
          <h2 className="c-pd-h">
            {t("Đánh giá của khách")}
            {rating.count > 0 && <span className="c-pd-avg"> · ★ {rating.avg.toFixed(1)}/5 ({rating.count})</span>}
          </h2>
          {canReview && !writing && <button type="button" className="c-btn is-outline" onClick={() => { setWriting(true); setThanks(false); }}>{t("Viết đánh giá")}</button>}
        </div>
        {!user && <p className="c-muted-txt c-pd-rv-note">{t("Đã mua món này?")} <Link to="/login">{t("Đăng nhập")}</Link> {t("để viết đánh giá.")}</p>}
        {thanks && <p className="c-acc-ok" role="status">{t("Cảm ơn bạn đã gửi đánh giá!")}</p>}
        {canReview && writing && (
          <div className="c-pd-rv-write">
            <ReviewComposer
              orderId={canReview.orderId}
              productId={p.id}
              placeholder={t("Hương vị, độ ngọt, cách trình bày…")}
              onDone={() => {
                setWriting(false);
                setThanks(true);
                setReviewTick((n) => n + 1);
                // Tải lại danh sách đánh giá + điểm trung bình (không tải lại cả trang)
                api<Extras>(withStore(`/api/products/${p.id}/extras`, storeId)).then(setExtras).catch(() => undefined);
              }}
              onCancel={() => setWriting(false)}
            />
          </div>
        )}
        {reviews.length === 0 ? (
          <p className="c-muted-txt">{t("Chưa có đánh giá cho món này.")}</p>
        ) : (
          <ul className="c-reviews">
            {reviews.map((r) => <ReviewItem key={r.id} r={r} />)}
          </ul>
        )}
      </section>
    </div>
  );
}
