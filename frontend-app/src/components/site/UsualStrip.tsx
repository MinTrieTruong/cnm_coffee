/**
 * Món quen của khách: thanh ngang thẻ nhỏ (ảnh · tên · tuỳ chọn quen · nút "+" thêm đúng tuỳ chọn quen)
 * + "Đặt lại đơn gần nhất". Dùng ở Thực đơn (chế độ menu giấy), Trang chủ, Giỏ hàng ("Thêm món quen?").
 */
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, Plus, RotateCcw } from "lucide-react";
import type { Usual } from "../../lib/api";
import { useUsual, type Reorder } from "../../lib/habits";
import { formatVnd } from "../../lib/site";
import { useLang } from "../../lib/i18n";
import { ProductImage, UsualLine, quickAddUsual, sizePrice, usualOptions, type CartProduct } from "./parts";
import { calculateFinalPrice } from "../../lib/api";
import "../../styles/habits.css";

export type UsualCardItem = { product: CartProduct; usual?: Usual | null; usualNote?: string | null; soldOut?: boolean };

function UsualChip({ it, onAdded }: { it: UsualCardItem; onAdded?: () => void }) {
  const { t } = useLang();
  const [done, setDone] = useState(false);
  const p = it.product;
  const o = usualOptions(p, it.usual);
  const price = calculateFinalPrice(o.food ? p.sellPrice : sizePrice(p, o.size), p.discountPercent);
  return (
    <li className={`c-usual-chip${it.soldOut ? " is-soldout" : ""}`}>
      <Link to={`/product/${p.id}`} className="c-usual-img"><ProductImage p={p} /></Link>
      <div className="c-usual-txt">
        <Link to={`/product/${p.id}`} className="c-usual-name">{p.name}</Link>
        <UsualLine p={p} usual={it.usual} note={it.usualNote} />
        <span className="c-price">{it.soldOut ? t("Hết hàng") : formatVnd(price)}</span>
      </div>
      <button
        type="button"
        className={`c-add${done ? " is-done" : ""}`}
        disabled={it.soldOut}
        onClick={() => {
          quickAddUsual(p, it.usual, it.usualNote);
          setDone(true);
          onAdded?.();
          window.setTimeout(() => setDone(false), 1400);
        }}
        aria-label={done ? t("Đã thêm {name}", { name: p.name }) : t("Thêm {name} vào giỏ", { name: p.name })}
      >
        {done ? <Check size={18} aria-hidden /> : <Plus size={18} aria-hidden />}
      </button>
    </li>
  );
}

export function UsualStrip({ items, title, action, compact, onAdded }: { items: UsualCardItem[]; title?: ReactNode; action?: ReactNode; compact?: boolean; onAdded?: () => void }) {
  if (!items.length && !action) return null;
  return (
    <div className={`c-usual${compact ? " is-compact" : ""}`}>
      {(title || action) && (
        <div className="c-usual-head">
          {title && <h2 className="c-usual-title">{title}</h2>}
          {action}
        </div>
      )}
      {items.length > 0 && <ul className="c-usual-row">{items.map((it) => <UsualChip key={it.product.id} it={it} onAdded={onAdded} />)}</ul>}
    </div>
  );
}

/**
 * Thêm các dòng của đơn cũ vào giỏ (đúng size / nóng-đá / đá / đường / ghi chú).
 * Món hết hàng hoặc ngừng bán không thêm — trả về tên để báo khách.
 */
export function addReorderToCart(r: Reorder): { added: number; skipped: string[] } {
  let added = 0;
  const skipped: string[] = [];
  for (const l of r.lines) {
    if (!l.available || l.soldOut) {
      skipped.push(l.product.name);
      continue;
    }
    quickAddUsual(l.product, l.usual, l.note, l.quantity);
    added += l.quantity;
  }
  return { added, skipped };
}

/** Nút "Đặt lại" + dòng báo kết quả (món nào bị bỏ vì hết hàng) */
export function ReorderButton({ load, label, className }: { load: () => Promise<Reorder | null>; label?: string; className?: string }) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await load();
      if (!r) throw new Error(t("Không tìm thấy đơn"));
      const { added, skipped } = addReorderToCart(r);
      const parts = [added ? t("Đã thêm {n} món vào giỏ.", { n: added }) : t("Không thêm được món nào.")];
      if (skipped.length) parts.push(t("Tạm hết: {names}.", { names: skipped.join(", ") }));
      if (r.comboSkipped) parts.push(t("Combo cần chọn lại ở trang combo."));
      setMsg({ ok: added > 0, text: parts.join(" ") });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("Lỗi") });
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="c-reorder">
      <button type="button" className={className ?? "c-linkbtn"} disabled={busy} onClick={() => void run()}>
        <RotateCcw size={15} aria-hidden /> {busy ? t("Đang thêm…") : t(label ?? "Đặt lại")}
      </button>
      {msg && (
        <span className={msg.ok ? "c-acc-ok" : "c-err"} role="status">
          {msg.text} {msg.ok && <Link to="/cart">{t("Xem giỏ")}</Link>}
        </span>
      )}
    </span>
  );
}

/** Trang chủ (đã đăng nhập): "Món quen" + "Đặt lại đơn gần nhất"; chưa có thói quen → ẩn */
export function UsualHome({ storeId }: { storeId: number | null }) {
  const { t } = useLang();
  const data = useUsual(storeId);
  if (!data || (!data.items.length && !data.lastOrder)) return null;
  const last = data.lastOrder;
  const canReorder = !!last && last.lines.some((l) => l.available && !l.soldOut);
  return (
    <section className="c-wrap c-sec c-sec-tight c-usual-home" aria-label={t("Món quen")}>
      <UsualStrip
        title={t("Món quen")}
        items={data.items.map((u) => ({ product: u.product, usual: u.usual, usualNote: u.usualNote, soldOut: u.soldOut }))}
        action={last && canReorder ? <ReorderButton load={async () => last} label="Đặt lại đơn gần nhất" className="c-btn is-outline c-btn-sm" /> : undefined}
      />
    </section>
  );
}
