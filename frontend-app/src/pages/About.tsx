/**
 * /about — Trang câu chuyện thương hiệu. Mọi ảnh và chữ do chủ chuỗi sửa ở Website › Câu chuyện thương hiệu
 * (bảng Brand_Sections, API GET /api/site/brand). Mục nào tắt thì không hiện; thứ tự theo quản trị.
 * ?preview=1: hiện bản nháp chưa lưu từ màn quản trị (lib/brand.ts › readPreview).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowRight, Clock } from "lucide-react";
import type {
  BrandKey, BrandSection, CommunityData, FarmData, FounderData, FutureData, GalleryData, HardestData, HeroData, JourneyData, PressData,
  SignatureData, StatsData, StoresData, TeamData, TestimonialsData, ValuesData,
} from "@shared/brand";
import { brandEditHref, hm, OPEN_LABEL, openState, useBrandPage, useOwnerEditing, type BrandRefs } from "../lib/brand";
import { floorThousand, formatVnd } from "../lib/site";
import { calculateFinalPrice } from "../lib/api";
import { useLang } from "../lib/i18n";
import { Divider, Eyebrow, Lightbox, Reveal, StatCounter, useHeroHeader, type LightboxItem } from "../components/site/lux";
import { BrandImg, EditPen, OwnerBar } from "../components/site/BrandParts";
import { CustomerAvatar } from "../components/CustomerAvatar";
import { Skeleton } from "../components/site/lux";
import "../styles/customer-brand.css";

type Ctx = { refs: BrandRefs; owner: boolean };

/** Đầu mục: eyebrow + tiêu đề serif + vạch chia (+ bút chì sửa cho chủ chuỗi) */
function Head({ k, eyebrow, title, center, light, owner, children }: { k: BrandKey; eyebrow: string; title: string; center?: boolean; light?: boolean; owner: boolean; children?: ReactNode }) {
  return (
    <div className={`c-b-head${center ? " is-center" : ""}${light ? " is-light" : ""}`}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="c-b-title">{title}</h2>
      <Divider center={center} />
      {children}
      <EditPen show={owner} to={brandEditHref(k)} label={title} />
    </div>
  );
}

/* ─────────── 1. Hero ─────────── */
function Hero({ d, owner }: { d: HeroData; owner: boolean }) {
  const { t } = useLang();
  useHeroHeader();
  return (
    <section className="c-b-hero" aria-labelledby="c-b-hero-t">
      <BrandImg img={d.image} className="c-b-hero-img" priority sizes="100vw" placeholder="awning" />
      <div className="c-wrap c-b-hero-in">
        {d.eyebrow && <Eyebrow>{d.eyebrow}</Eyebrow>}
        <h1 id="c-b-hero-t" className="c-b-hero-title">{d.title}</h1>
        {d.subtitle && <p className="c-b-hero-sub">{d.subtitle}</p>}
      </div>
      <button type="button" className="c-b-hero-down" aria-label={t("Cuộn xuống đọc tiếp")}
        onClick={(e) => (e.currentTarget.closest("section")?.nextElementSibling as HTMLElement | null)?.scrollIntoView({ behavior: "smooth" })}>
        <ArrowDown size={22} aria-hidden />
      </button>
      <EditPen show={owner} to={brandEditHref("hero", "image")} label={t("Ảnh bìa")} className="is-corner" />
    </section>
  );
}

/* ─────────── 2. Thư người sáng lập ─────────── */
function Founder({ d, owner }: { d: FounderData; owner: boolean }) {
  return (
    <section className="c-wrap c-sec c-b-founder">
      <Reveal className="c-b-founder-photo">
        <span className="c-b-back" aria-hidden />
        <BrandImg img={d.photo} ratio="4 / 5" className="c-arch" sizes="(max-width: 768px) 80vw, 420px" placeholder="person" />
        <EditPen show={owner} to={brandEditHref("founder", "photo")} label="Ảnh chân dung" className="is-corner" />
      </Reveal>
      <Reveal className="c-b-letter" delay={120}>
        <Head k="founder" eyebrow={d.eyebrow} title={d.title} owner={owner} />
        {d.opening && <p className="c-b-letter-open">{d.opening}</p>}
        {d.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        <div className="c-b-sign">
          {d.signature.url ? <BrandImg img={d.signature} className="c-b-sign-img" sizes="240px" /> : <span className="c-b-sign-name" aria-hidden>{d.name}</span>}
          <span><strong>{d.name}</strong>{d.role && <small>{d.role}</small>}</span>
        </div>
      </Reveal>
    </section>
  );
}

/* ─────────── 3. Hành trình — đường nối sáng dần theo vị trí cuộn ─────────── */
function Journey({ d, owner }: { d: JourneyData; owner: boolean }) {
  const { t } = useLang();
  const line = useRef<HTMLOListElement>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const el = line.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return setProgress(1);
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const mid = window.innerHeight * 0.6;
        setProgress(Math.min(1, Math.max(0, (mid - r.top) / r.height)));
      });
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);
  return (
    <section className="c-wrap c-sec c-b-journey">
      <Head k="journey" eyebrow={d.eyebrow} title={d.title} center owner={owner} />
      <ol className="c-b-tl" ref={line} style={{ ["--p" as string]: progress }}>
        {d.items.map((it, i) => (
          <Reveal as="li" key={i} className={`c-b-tl-item${i % 2 ? " is-right" : ""}`}>
            <span className="c-b-tl-dot" aria-hidden />
            <div className="c-b-tl-card">
              <span className="c-b-tl-year">{it.year}</span>
              <h3>{it.title}</h3>
              {it.story && <p>{it.story}</p>}
              {it.images.length > 0 && (
                <div className={`c-b-tl-imgs is-${it.images.length}`}>
                  {it.images.map((im, k) => <BrandImg key={k} img={im} ratio="4 / 3" sizes="(max-width: 768px) 45vw, 240px" />)}
                </div>
              )}
              {it.lesson && <p className="c-b-tl-lesson"><span>{t("Điều tụi mình học được")}</span>{it.lesson}</p>}
            </div>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

/* ─────────── 4. Những ngày khó nhất ─────────── */
function Hardest({ d, owner }: { d: HardestData; owner: boolean }) {
  return (
    <section className="c-b-hard c-grain">
      <BrandImg img={d.image} className="c-b-hard-bg" sizes="100vw" placeholder="bean" />
      <div className="c-wrap c-sec c-b-hard-in">
        <Head k="hardest" eyebrow={d.eyebrow} title={d.title} light owner={owner} />
        {d.quote && <blockquote className="c-b-hard-quote">{d.quote}</blockquote>}
        <div className="c-b-hard-cols">
          {d.story && <p>{d.story}</p>}
          {d.outcome && <p>{d.outcome}</p>}
        </div>
      </div>
    </section>
  );
}

/* ─────────── 5. Con số biết nói ─────────── */
function Stats({ d, refs, owner }: { d: StatsData; owner: boolean } & Ctx) {
  const s = refs.stats;
  const value = (src: string, manual: number) => (src === "manual" ? manual : src === "stores" ? s?.stores : src === "products" ? s?.products : src === "cups" ? (s ? floorThousand(s.cups) : null) : s?.rating) ?? null;
  const items = d.items.map((it) => ({ ...it, n: value(it.source, it.value) })).filter((it) => it.n != null);
  if (!items.length) return null;
  return (
    <section className="c-stats-band c-grain c-b-stats" aria-label={d.title}>
      <div className="c-wrap c-b-stats-head">
        {d.eyebrow && <Eyebrow>{d.eyebrow}</Eyebrow>}
        <h2 className="c-b-title">{d.title}</h2>
        <EditPen show={owner} to={brandEditHref("stats")} label={d.title} />
      </div>
      <div className="c-wrap">
        {items.map((it, i) => (
          <div key={i} className="c-b-stat">
            <StatCounter value={it.n!} decimals={it.source === "rating" ? 1 : 0} suffix={it.suffix} label={it.label} />
            {it.note && <small>{it.note}</small>}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────── 6. Giá trị cốt lõi ─────────── */
function Values({ d, owner }: { d: ValuesData; owner: boolean }) {
  return (
    <section className="c-wrap c-sec">
      <Head k="values" eyebrow={d.eyebrow} title={d.title} owner={owner} />
      <ul className="c-b-values">
        {d.items.map((v, i) => (
          <Reveal as="li" key={i} delay={i * 80} className="c-b-value">
            <BrandImg img={v.image} ratio="4 / 3" sizes="(max-width: 768px) 90vw, 300px" placeholder="bean" />
            <h3>{v.title}</h3>
            <p>{v.text}</p>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

/* ─────────── 7. Từ nông trại đến ly ─────────── */
function Farm({ d, owner }: { d: FarmData; owner: boolean }) {
  return (
    <section className="c-sec c-b-farm">
      <div className="c-wrap c-b-farm-in">
        <Reveal className="c-b-farm-media">
          <BrandImg img={d.image} ratio="4 / 3" className="c-rounded" sizes="(max-width: 768px) 92vw, 600px" placeholder="branch" />
          {(d.farmerName || d.farmerQuote) && (
            <figure className="c-b-farmer c-float">
              <BrandImg img={d.farmerPhoto} ratio="1 / 1" className="c-b-farmer-photo" sizes="96px" placeholder="person" />
              <blockquote>{d.farmerQuote}</blockquote>
              <figcaption><strong>{d.farmerName}</strong>{d.farmerRegion && <span>{d.farmerRegion}</span>}</figcaption>
            </figure>
          )}
        </Reveal>
        <Reveal className="c-b-farm-copy" delay={120}>
          <Head k="farm" eyebrow={d.eyebrow} title={d.title} owner={owner} />
          {d.story && <p>{d.story}</p>}
        </Reveal>
      </div>
      {d.steps.length > 0 && (
        <div className="c-wrap c-steps c-b-farm-steps">
          <div className="c-steps-body">
            <svg className="c-steps-curve" viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden>
              <path d="M125 60 C 220 0, 300 0, 375 60 S 540 120, 625 60 S 800 0, 875 60" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="6 8" vectorEffect="non-scaling-stroke" />
            </svg>
            <ol className="c-steps-list" style={{ gridTemplateColumns: `repeat(${Math.min(4, d.steps.length)}, minmax(0, 1fr))` }}>
              {d.steps.map((s, k) => (
                <Reveal as="li" key={k} delay={k * 90} className="c-step">
                  <BrandImg img={s.image} className="c-step-img" sizes="160px" placeholder="bean" />
                  <span className="c-step-n" aria-hidden>{String(k + 1).padStart(2, "0")}</span>
                  <h3 className="c-step-title">{s.title}</h3>
                  <p className="c-step-text">{s.text}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}

/* ─────────── 8. Gương mặt sau quầy ─────────── */
function Team({ d, refs, owner }: { d: TeamData; owner: boolean } & Ctx) {
  const { t } = useLang();
  return (
    <section className="c-wrap c-sec">
      <Head k="team" eyebrow={d.eyebrow} title={d.title} center owner={owner} />
      <ul className="c-b-team">
        {d.items.map((m, i) => {
          const fav = m.favoriteProductId ? refs.products[m.favoriteProductId] : null;
          return (
            <Reveal as="li" key={i} delay={i * 80} className="c-b-person">
              <BrandImg img={m.photo} ratio="4 / 5" className="c-arch" sizes="(max-width: 768px) 45vw, 260px" placeholder="person" />
              <h3>{m.name}</h3>
              <p className="c-b-person-role">{m.role}{m.joinedYear && <> · {t("từ {y}", { y: m.joinedYear })}</>}</p>
              {fav && <Link to={`/product/${fav.id}`} className="c-b-person-fav">{t("Món tủ")}: {fav.name}</Link>}
              {m.quote && <p className="c-b-person-quote">{m.quote}</p>}
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}

/* ─────────── 9. Ly làm nên tên tuổi ─────────── */
function Signature({ d, refs, owner }: { d: SignatureData; owner: boolean } & Ctx) {
  const { t } = useLang();
  const items = d.items.map((it) => ({ ...it, p: it.productId ? refs.products[it.productId] : null })).filter((it) => it.p);
  if (!items.length) return null;
  return (
    <section className="c-sec c-b-sig">
      <div className="c-wrap">
        <Head k="signature" eyebrow={d.eyebrow} title={d.title} center owner={owner} />
        {items.map((it, i) => (
          <Reveal key={i} className={`c-b-sig-row${i % 2 ? " is-flip" : ""}`}>
            <BrandImg img={it.image.url ? it.image : { url: it.p!.imageUrl ?? "", alt: it.p!.name }} ratio="4 / 5" className="c-arch" sizes="(max-width: 768px) 80vw, 420px" />
            <div className="c-b-sig-copy">
              <span className="c-b-sig-n" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
              <h3>{it.p!.name}</h3>
              <p>{it.story}</p>
              <div className="c-b-sig-foot">
                <span className="c-price">{formatVnd(calculateFinalPrice(it.p!.sellPrice, it.p!.discountPercent))}</span>
                <Link to={`/product/${it.p!.id}`} className="c-btn c-btn--solid">{t("Gọi món này")} <ArrowRight size={16} aria-hidden /></Link>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ─────────── 10. Mỗi quán một câu chuyện ─────────── */
export function StoreStatus({ open, close }: { open: string | null; close: string | null }) {
  const { t } = useLang();
  const st = openState(open, close);
  if (st === "unknown") return null;
  return <span className={`c-b-open is-${st}`}><Clock size={13} aria-hidden /> {t(OPEN_LABEL[st])} · {hm(open)}–{hm(close)}</span>;
}
function Stores({ d, refs, owner }: { d: StoresData; owner: boolean } & Ctx) {
  const { t } = useLang();
  if (!refs.stores.length) return null;
  return (
    <section className="c-sec c-b-stores">
      <div className="c-wrap">
        <Head k="stores" eyebrow={d.eyebrow} title={d.title} owner={owner}>{d.subtitle && <p className="c-b-sub">{d.subtitle}</p>}</Head>
        <ul className="c-b-store-row">
          {refs.stores.map((s) => (
            <li key={s.id} className="c-b-store">
              <BrandImg img={s.coverImage} ratio="16 / 10" sizes="(max-width: 768px) 80vw, 380px" placeholder="awning" />
              <div className="c-b-store-txt">
                <h3>{s.name}</h3>
                {s.openedYear && <span className="c-b-store-year">{t("Mở từ {y}", { y: s.openedYear })}</span>}
                {s.tagline && <p>{s.tagline}</p>}
                <StoreStatus open={s.openTime} close={s.closeTime} />
                <Link to={`/stores/${s.id}`} className="c-sec-more">{t("Xem quán")} <ArrowRight size={14} aria-hidden /></Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ─────────── 11. Cùng cộng đồng ─────────── */
function Community({ d, owner }: { d: CommunityData; owner: boolean }) {
  return (
    <section className="c-wrap c-sec">
      <Head k="community" eyebrow={d.eyebrow} title={d.title} owner={owner} />
      <ul className="c-b-comm">
        {d.items.map((c, i) => (
          <Reveal as="li" key={i} delay={i * 80} className="c-b-comm-item">
            <BrandImg img={c.image} ratio="4 / 3" sizes="(max-width: 768px) 90vw, 300px" placeholder="branch" />
            {c.figure && <span className="c-b-comm-fig">{c.figure}</span>}
            {c.figureLabel && <span className="c-b-comm-lab">{c.figureLabel}</span>}
            <h3>{c.title}</h3>
            <p>{c.text}</p>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

/* ─────────── 12. Khách kể về tụi mình ─────────── */
function Testimonials({ d, refs, owner }: { d: TestimonialsData; owner: boolean } & Ctx) {
  const { t } = useLang();
  const items = d.items
    .map((it) => {
      const r = it.reviewId ? refs.reviews[it.reviewId] : null;
      return r
        ? { text: r.comment ?? "", name: r.name ?? t("Khách ẩn danh"), store: r.storeName, avatar: r.avatarUrl, rating: r.rating, photo: null }
        : { text: it.text, name: it.name, store: it.storeName, avatar: null, rating: 0, photo: it.photo.url ? it.photo : null };
    })
    .filter((x) => x.text.trim());
  if (!items.length) return null;
  return (
    <section className="c-wrap c-sec c-quotes">
      <Head k="testimonials" eyebrow={d.eyebrow} title={d.title} center owner={owner} />
      <ul className={`c-quotes-list is-${Math.min(3, items.length)}`}>
        {items.map((q, i) => (
          <Reveal as="li" key={i} delay={i * 80} className="c-quote">
            {q.rating > 0 && <span className="c-stars" role="img" aria-label={t("{n} trên 5 sao", { n: q.rating })}>{[1, 2, 3, 4, 5].map((k) => <span key={k} aria-hidden className={k <= q.rating ? "is-on" : undefined}>★</span>)}</span>}
            <blockquote>{q.text}</blockquote>
            <div className="c-quote-who">
              {q.photo ? <BrandImg img={q.photo} className="c-b-quote-ava" sizes="40px" /> : <CustomerAvatar src={q.avatar} name={q.name} seed={i} size={40} />}
              <span><strong>{q.name}</strong><small>{q.store?.replace(/^TD Coffee\s*[-–·:]\s*/i, "")}</small></span>
            </div>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

/* ─────────── 13. Báo chí & giải thưởng ─────────── */
function Press({ d, owner }: { d: PressData; owner: boolean }) {
  if (!d.items.length) return null;
  return (
    <section className="c-wrap c-sec">
      <Head k="press" eyebrow={d.eyebrow} title={d.title} center owner={owner} />
      <ul className="c-b-press">
        {d.items.map((p, i) => (
          <li key={i}>
            <a href={p.url || undefined} target="_blank" rel="noopener noreferrer">
              {p.logo.url ? <BrandImg img={p.logo} className="c-b-press-logo" sizes="160px" /> : <strong>{p.outlet}</strong>}
              {p.title && <span>{p.title}</span>}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─────────── 14. Không gian quán — lọc theo chi nhánh, lightbox ─────────── */
function Gallery({ d, refs, owner }: { d: GalleryData; owner: boolean } & Ctx) {
  const { t } = useLang();
  const [store, setStore] = useState<number | "all">("all");
  const [open, setOpen] = useState<number | null>(null);
  const storeIds = [...new Set(d.items.map((x) => x.storeId).filter((x): x is number => x != null))];
  const list = d.items.filter((x) => x.image.url && (store === "all" || x.storeId === store));
  const lb: LightboxItem[] = list.map((x) => ({ src: x.image.url, alt: x.image.alt, caption: x.caption || x.image.alt }));
  if (!d.items.length) return null;
  return (
    <section className="c-wrap c-sec" id="gallery">
      <Head k="gallery" eyebrow={d.eyebrow} title={d.title} owner={owner} />
      {storeIds.length > 0 && (
        <div className="c-b-chips" role="group" aria-label={t("Lọc theo chi nhánh")}>
          <button type="button" aria-pressed={store === "all"} onClick={() => setStore("all")}>{t("Tất cả")}</button>
          {storeIds.map((id) => (
            <button key={id} type="button" aria-pressed={store === id} onClick={() => setStore(id)}>{refs.stores.find((s) => s.id === id)?.name ?? `#${id}`}</button>
          ))}
        </div>
      )}
      <ul className="c-gallery">
        {list.map((x, i) => (
          <li key={i}>
            <button type="button" onClick={() => setOpen(i)} aria-label={`${t("Xem ảnh")}: ${x.image.alt}`}>
              <BrandImg img={x.image} sizes="(max-width: 768px) 50vw, 33vw" />
            </button>
          </li>
        ))}
      </ul>
      {open != null && <Lightbox items={lb} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </section>
  );
}

/* ─────────── 15. Chặng tiếp theo ─────────── */
function Future({ d, owner }: { d: FutureData; owner: boolean }) {
  const { t } = useLang();
  return (
    <section className="c-wrap c-sec c-b-future">
      <Reveal className="c-b-future-in">
        <BrandImg img={d.image} ratio="16 / 10" className="c-rounded" sizes="(max-width: 768px) 92vw, 620px" placeholder="awning" />
        <div className="c-b-future-copy">
          <Head k="future" eyebrow={d.eyebrow} title={d.title} owner={owner} />
          {d.text && <p>{d.text}</p>}
          <div className="c-b-cta">
            <Link to="/stores" className="c-btn c-btn--solid is-lg">{t("Ghé quán gần bạn")}</Link>
            <Link to="/menu" className="c-btn c-btn--outline is-lg">{t("Xem thực đơn")}</Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function renderSection(s: BrandSection, ctx: Ctx) {
  const o = ctx.owner;
  switch (s.key) {
    case "hero": return <Hero d={s.data as HeroData} owner={o} />;
    case "founder": return <Founder d={s.data as FounderData} owner={o} />;
    case "journey": return <Journey d={s.data as JourneyData} owner={o} />;
    case "hardest": return <Hardest d={s.data as HardestData} owner={o} />;
    case "stats": return <Stats d={s.data as StatsData} {...ctx} />;
    case "values": return <Values d={s.data as ValuesData} owner={o} />;
    case "farm": return <Farm d={s.data as FarmData} owner={o} />;
    case "team": return <Team d={s.data as TeamData} {...ctx} />;
    case "signature": return <Signature d={s.data as SignatureData} {...ctx} />;
    case "stores": return <Stores d={s.data as StoresData} {...ctx} />;
    case "community": return <Community d={s.data as CommunityData} owner={o} />;
    case "testimonials": return <Testimonials d={s.data as TestimonialsData} {...ctx} />;
    case "press": return <Press d={s.data as PressData} owner={o} />;
    case "gallery": return <Gallery d={s.data as GalleryData} {...ctx} />;
    case "future": return <Future d={s.data as FutureData} owner={o} />;
  }
}

export function About() {
  const { t, lang } = useLang();
  const [params] = useSearchParams();
  const preview = params.get("preview") === "1";
  const { page, error } = useBrandPage(lang, preview);
  const owner = useOwnerEditing();
  const ctx = useMemo<Ctx | null>(() => (page ? { refs: page.refs, owner } : null), [page, owner]);
  const hasHero = page?.sections[0]?.key === "hero";

  return (
    <div className={`c-bpage${hasHero ? " has-hero" : ""}`}>
      {!page && !error && <div className="c-wrap c-sec"><Skeleton variant="news" count={3} /></div>}
      {error && <div className="c-wrap c-sec"><p className="c-muted-txt">{t("Chưa tải được trang, thử lại sau.")}</p></div>}
      {page && ctx && page.sections.length === 0 && (
        <div className="c-wrap c-sec"><p className="c-muted-txt">{t("Trang đang được chuẩn bị.")}</p></div>
      )}
      {page && ctx && page.sections.map((s) => <div key={s.key} className="c-b-sec" data-section={s.key}>{renderSection(s, ctx)}</div>)}
      <OwnerBar show={owner} preview={preview} editHref={brandEditHref("hero")} />
    </div>
  );
}
