/**
 * Khối dùng chung phong cách "mềm, ấm, cao cấp" của trang khách:
 * useReveal / Reveal (hiện dần khi cuộn tới), Eyebrow, SiteImg (ảnh mặc định WebP 2 cỡ hoặc ảnh tải lên),
 * ArchImage (khung vòm), PageHero (đầu trang có ảnh), StatCounter (số đếm lên), Lightbox, Sketch (nét vẽ tay).
 * CSS: styles/customer-lux.css. Chữ truyền vào đã dịch sẵn (t()) — component không tự dịch nội dung.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { isSiteImageKey, siteImageSrc } from "../../lib/siteImages";
import { useLang } from "../../lib/i18n";

const reduceMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Gắn class is-in khi phần tử vào khung nhìn (một lần). Không hỗ trợ IntersectionObserver / giảm chuyển động → hiện ngay */
export function useReveal<T extends Element>(threshold = 0.15) {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    if (reduceMotion() || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, threshold]);
  return { ref, shown };
}

/** Hiện dần + trượt 16px khi cuộn tới; delay (ms) để các phần tử cùng hàng nối tiếp nhau */
export function Reveal({ children, as: Tag = "div", delay = 0, className, style, id }: { children: ReactNode; as?: "div" | "section" | "li" | "article"; delay?: number; className?: string; style?: CSSProperties; id?: string }) {
  const { ref, shown } = useReveal<HTMLElement>();
  const El = Tag as "div";
  return (
    <El ref={ref as React.Ref<HTMLDivElement>} id={id} className={["c-reveal", shown ? "is-in" : "", className ?? ""].join(" ").trim()} style={{ ...style, ["--d" as string]: `${delay}ms` }}>
      {children}
    </El>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={className ? `c-eyebrow ${className}` : "c-eyebrow"}>{children}</span>;
}

/**
 * Ảnh trang trí: khóa ảnh mặc định ("home/hero-phin" → WebP 2 cỡ + srcset) hoặc URL ảnh chủ chuỗi tải lên.
 * priority = ảnh đầu trang (không lazy, fetchpriority high). Luôn giữ tỉ lệ khung để trang không giật.
 */
export function SiteImg({ src, alt, sizes = "100vw", className, priority, style }: { src: string | null | undefined; alt?: string; sizes?: string; className?: string; priority?: boolean; style?: CSSProperties }) {
  if (!src) return <span className={`c-noimg ${className ?? ""}`} aria-hidden />;
  const common = { className, style, loading: priority ? ("eager" as const) : ("lazy" as const), decoding: "async" as const, ...(priority ? { fetchPriority: "high" as const } : {}) };
  if (isSiteImageKey(src)) {
    const s = siteImageSrc(src);
    return <img {...common} src={s.src} srcSet={s.srcSet} sizes={sizes} width={s.info.w} height={s.info.h} alt={alt ?? s.info.alt} />;
  }
  return <img {...common} src={mediaUrl(src) ?? src} alt={alt ?? ""} />;
}

/** Khung vòm (bo tròn phía trên như ô cửa quán) — dấu ấn TD Coffee, dùng có chủ ý */
export function ArchImage({ src, alt, ratio = "4 / 5", className, sizes = "(max-width: 768px) 90vw, 40vw", priority }: { src: string | null | undefined; alt?: string; ratio?: string; className?: string; sizes?: string; priority?: boolean }) {
  return (
    <figure className={`c-arch ${className ?? ""}`} style={{ aspectRatio: ratio }}>
      <SiteImg src={src} alt={alt} sizes={sizes} priority={priority} />
    </figure>
  );
}

/** Nét vẽ tay một màu (nhận màu --c-sketch, đổi theo chế độ tối) */
export function Sketch({ name, className, style }: { name: "bean" | "branch" | "steam" | "cup"; className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={`c-sketch c-sketch-${name} ${className ?? ""}`} style={{ ...style, ["--sk" as string]: `url(/site/${name}.svg)` }} />;
}

/** Đầu trang nội dung: ảnh nền bo góc dưới, eyebrow + tiêu đề serif + 1 câu mô tả + breadcrumb */
export function PageHero({ eyebrow, title, sub, image, crumbs, children, compact }: {
  eyebrow?: string; title: ReactNode; sub?: ReactNode; image?: string | null;
  crumbs?: { to?: string; label: string }[]; children?: ReactNode; compact?: boolean;
}) {
  const { t } = useLang();
  return (
    <header className={`c-ph${image ? " has-img" : ""}${compact ? " is-compact" : ""}`}>
      {image && (
        <div className="c-ph-media" aria-hidden>
          <SiteImg src={image} alt="" priority sizes="100vw" />
        </div>
      )}
      <div className="c-wrap c-ph-in">
        {crumbs && (
          <nav className="c-ph-crumbs" aria-label={t("Vị trí")}>
            <Link to="/">{t("Trang chủ")}</Link>
            {crumbs.map((c, i) => (
              <span key={i} style={{ display: "contents" }}>
                <span aria-hidden>·</span>
                {c.to && i < crumbs.length - 1 ? <Link to={c.to}>{c.label}</Link> : <span aria-current={i === crumbs.length - 1 ? "page" : undefined}>{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="c-ph-title">{title}</h1>
        {sub && <p className="c-ph-sub">{sub}</p>}
        {children}
      </div>
    </header>
  );
}

/** Số thống kê đếm lên khi hiện (1,2 giây, easeOut); giảm chuyển động → hiện số luôn */
export function StatCounter({ value, label, suffix = "", decimals = 0 }: { value: number; label: string; suffix?: string; decimals?: number }) {
  const { ref, shown } = useReveal<HTMLDivElement>(0.4);
  const [n, setN] = useState(0);
  const { lang } = useLang();
  useEffect(() => {
    if (!shown) return;
    if (reduceMotion()) {
      setN(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 1200);
      setN(value * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [shown, value]);
  const fmt = n.toLocaleString(lang === "en" ? "en-US" : "vi-VN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (
    <div ref={ref} className="c-stat">
      <span className="c-stat-n" aria-hidden>{fmt}{suffix}</span>
      <span className="c-sr">{value.toLocaleString(lang === "en" ? "en-US" : "vi-VN", { maximumFractionDigits: decimals })}{suffix}</span>
      <span className="c-stat-l">{label}</span>
    </div>
  );
}

export type LightboxItem = { src: string; alt: string; caption?: string };

/** Xem ảnh lớn: ← → chuyển ảnh, Esc đóng, giữ focus trong hộp; trả focus về nút đã mở khi đóng */
export function Lightbox({ items, index, onClose, onIndex }: { items: LightboxItem[]; index: number; onClose: () => void; onIndex: (i: number) => void }) {
  const { t } = useLang();
  const box = useRef<HTMLDivElement>(null);
  const prev = useCallback(() => onIndex((index - 1 + items.length) % items.length), [index, items.length, onIndex]);
  const next = useCallback(() => onIndex((index + 1) % items.length), [index, items.length, onIndex]);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLButtonElement>(".c-lb-close")?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "Tab" && box.current) {
        // Giữ focus trong hộp
        const f = [...box.current.querySelectorAll<HTMLElement>("button")];
        const i = f.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1]?.focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0]?.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, prev, next]);
  const it = items[index];
  if (!it) return null;
  return (
    <div className="c-lb" role="dialog" aria-modal="true" aria-label={t("Xem ảnh")} ref={box} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <button type="button" className="c-lb-close" onClick={onClose} aria-label={t("Đóng")}><X size={22} /></button>
      {items.length > 1 && <button type="button" className="c-lb-nav is-prev" onClick={prev} aria-label={t("Ảnh trước")}><ChevronLeft size={26} /></button>}
      <figure className="c-lb-fig">
        <SiteImg src={it.src} alt={it.alt} sizes="90vw" priority />
        <figcaption>{it.caption ?? it.alt} <span className="c-lb-count">{index + 1} / {items.length}</span></figcaption>
      </figure>
      {items.length > 1 && <button type="button" className="c-lb-nav is-next" onClick={next} aria-label={t("Ảnh sau")}><ChevronRight size={26} /></button>}
    </div>
  );
}

/** Lưới ảnh kiểu masonry, bấm mở Lightbox */
export function Gallery({ items, className }: { items: LightboxItem[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const { t } = useLang();
  return (
    <>
      <ul className={`c-gallery ${className ?? ""}`}>
        {items.map((it, i) => (
          <li key={i}>
            <button type="button" onClick={() => setOpen(i)} aria-label={`${t("Xem ảnh")}: ${it.alt}`}>
              <SiteImg src={it.src} alt={it.alt} sizes="(max-width: 768px) 50vw, 33vw" />
            </button>
          </li>
        ))}
      </ul>
      {open != null && <Lightbox items={items} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}
