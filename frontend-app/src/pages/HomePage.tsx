import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { api, mediaUrl, type HomePageResponse, type Product } from "../lib/api";
import { useCustomerStore, withStore } from "../lib/customerStore";
import { floorThousand, formatVnd, useMenuCategories, useMenuData, useSiteInfo } from "../lib/site";
import { CategoryThumb, listPrice, NutritionTags, ProductCard, ProductImage, quickAdd, SectionHead, VoucherTicket, type PublicVoucher } from "../components/site/parts";
import { useLang } from "../lib/i18n";
import { WeatherPicks } from "../components/site/WeatherPicks";
import { UsualHome } from "../components/site/UsualStrip";
import { ArchImage, Divider, Eyebrow, Reveal, SiteImg, Skeleton, StatCounter, useHeroHeader } from "../components/site/lux";
import type { PublicReviewRow } from "../components/site/ReviewItem";
import { CustomerAvatar } from "../components/CustomerAvatar";
import "../styles/customer-home.css";

type Banner = { id: number; imageUrl: string; title: string | null; subtitle: string | null; link: string | null };
type Post = { id: number; title: string; body: string; imageUrl: string | null; createdAt: string };
type ActiveGame = { id: number; name: string; description: string | null; minOrderValue: number; me: { tickets: number } | null };
type SiteStats = { stores: number; products: number; cups: number; rating: number | null; reviews: number };

const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const BANNER_MS = 6000;

/** Dải banner dưới hero: ảnh do quản lý tải lên (Website › Banner), tiêu đề trên thẻ nổi; tự chuyển 6 giây (dừng khi rê chuột), điện thoại vuốt ngang để đổi */
function BannerCarousel({ banners }: { banners: Banner[] }) {
  const nav = useNavigate();
  const { t } = useLang();
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);
  /** Độ lệch (px) khi đang kéo bằng tay; null = không kéo */
  const [dx, setDx] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number; axis: "x" | "y" | null } | null>(null);
  const moved = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const n = banners.length;
  useEffect(() => {
    if (i >= n) setI(0);
  }, [i, n]);
  // Hẹn giờ theo từng ảnh: bấm chấm / mũi tên / vuốt thì đếm lại 3 giây từ đầu
  useEffect(() => {
    if (n < 2 || hover || dx != null) return;
    const tm = window.setTimeout(() => setI((x) => (x + 1) % n), BANNER_MS);
    return () => window.clearTimeout(tm);
  }, [i, n, hover, dx]);
  if (!n) return null;

  function onTouchStart(e: React.TouchEvent) {
    if (n < 2) return;
    const p = e.touches[0];
    drag.current = { x: p.clientX, y: p.clientY, axis: null };
    moved.current = false;
  }
  function onTouchMove(e: React.TouchEvent) {
    const d = drag.current;
    if (!d) return;
    const p = e.touches[0];
    const mx = p.clientX - d.x, my = p.clientY - d.y;
    if (!d.axis) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      d.axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
    }
    if (d.axis === "x") {
      moved.current = true;
      setDx(mx);
    }
  }
  function onTouchEnd() {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== "x" || dx == null) return setDx(null);
    const width = box.current?.offsetWidth ?? 360;
    if (Math.abs(dx) > Math.min(60, width * 0.2)) setI((x) => (dx < 0 ? (x + 1) % n : (x - 1 + n) % n));
    setDx(null);
  }
  const go = (b: Banner) => {
    if (!b.link) return;
    if (/^https:/i.test(b.link)) window.open(b.link, "_blank", "noopener,noreferrer");
    else nav(b.link);
  };
  return (
    <div
      ref={box}
      className="c-banner"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      // Vừa vuốt xong thì không tính là bấm "Xem ngay"
      onClickCapture={(e) => { if (moved.current) { e.stopPropagation(); e.preventDefault(); moved.current = false; } }}
      aria-roledescription="carousel"
      aria-label={t("Chương trình nổi bật")}
    >
      <div
        className={dx != null ? "c-banner-track is-dragging" : "c-banner-track"}
        style={{ transform: dx != null ? `translateX(calc(-${i * 100}% + ${dx}px))` : `translateX(-${i * 100}%)` }}
      >
        {banners.map((b, k) => (
          <div key={b.id} className="c-banner-slide" role="group" aria-roledescription="slide" aria-label={`${k + 1} / ${n}`} aria-hidden={k !== i}>
            <img src={mediaUrl(b.imageUrl)} alt={b.title ?? ""} loading={k === 0 ? "eager" : "lazy"} />
            {(b.title || b.subtitle) && (
              <div className="c-banner-copy">
                {b.title && <h2 className="c-banner-title">{b.title}</h2>}
                {b.subtitle && <p className="c-banner-sub">{b.subtitle}</p>}
                {b.link && <button type="button" className="c-btn" tabIndex={k === i ? 0 : -1} onClick={() => go(b)}>{t("Xem ngay")}</button>}
              </div>
            )}
          </div>
        ))}
      </div>
      {n > 1 && (
        <>
          <button type="button" className="c-banner-arrow is-prev" onClick={() => setI((x) => (x - 1 + n) % n)} aria-label={t("Banner trước")}><ChevronLeft size={22} aria-hidden /></button>
          <button type="button" className="c-banner-arrow is-next" onClick={() => setI((x) => (x + 1) % n)} aria-label={t("Banner sau")}><ChevronRight size={22} aria-hidden /></button>
          <div className="c-banner-dots">
            {banners.map((b, k) => (
              <button key={b.id} type="button" className={k === i ? "is-on" : undefined} onClick={() => setI(k)} aria-label={t("Banner {n}", { n: k + 1 })} aria-current={k === i} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Chữ ký tay của chủ quán (SVG nét bút) */
function Signature() {
  const { t } = useLang();
  return (
    <svg className="c-sign" viewBox="0 0 220 70" role="img" aria-label={t("Chữ ký chủ quán")}>
      <path
        d="M8 46c10-2 22-14 30-26 4-6 3-10-1-6-6 7-10 24-9 34 0 5 4 4 8-2 7-11 14-26 21-27 5-1 2 12-2 22-3 8 4 6 9 0 4-5 8-11 12-11 4 0 0 9 3 10 4 1 9-6 13-9 3-2 4 1 2 4-3 5-1 7 4 5 9-4 18-16 27-18 6-1 3 6 1 10-2 6 3 7 9 3 10-7 22-17 35-19 8-1 14 2 20 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M40 58c40-6 90-8 150-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

/** Vòng tròn ensō (nét cọ một vòng, chừa khe) — điểm tựa mờ sau ly ở hero */
function Enso() {
  return (
    <svg className="c-h2-enso" viewBox="0 0 200 200" aria-hidden>
      <path d="M150 42c-20-18-52-24-80-12C38 44 22 80 30 114c8 34 40 58 76 56 34-2 62-28 66-62 2-20-4-38-16-52" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
      <path d="M156 48c-6-6-12-10-20-14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

/** Hero "ly cà phê nổi": nền tối gạch bông + hạt nhiễu + 2 vệt đèn; món chính trôi nhẹ, 4 ảnh nhỏ bên dưới để đổi món */
function HeroFloat({ picks }: { picks: Product[] }) {
  const { t } = useLang();
  const [i, setI] = useState(0);
  const [added, setAdded] = useState<number | null>(null);
  useHeroHeader();
  useEffect(() => {
    if (i >= picks.length) setI(0);
  }, [i, picks.length]);
  useEffect(() => {
    if (added == null) return;
    const tm = window.setTimeout(() => setAdded(null), 1600);
    return () => window.clearTimeout(tm);
  }, [added]);
  const p = picks[i];
  // Cả câu là một khóa dịch, {em} = cụm chữ nghiêng → tiếng Anh tự xếp lại thứ tự từ
  const heroTitle = t("Cà phê {em} Sài Gòn").split("{em}");
  return (
    <section className="c-h2 c-grain c-tile c-spotlights" aria-labelledby="c-h2-title">
      <div className="c-wrap c-h2-in">
        <div className="c-h2-copy">
          <Eyebrow>{t("Cà phê phin · Sài Gòn")}</Eyebrow>
          <h1 id="c-h2-title" className="c-h2-title">{heroTitle[0]}<em>{t("đúng vị")}</em>{heroTitle[1]}</h1>
          <Divider />
          <p className="c-h2-sub">{t("Robusta rang mộc, pha phin từng ly, sữa đặc rót tay. Ghé quán ngồi lại, hoặc đặt mang về khi đang vội.")}</p>
          <div className="c-h2-cta">
            <Link to="/menu" className="c-btn c-btn--solid is-lg c-h2-order">{t("Đặt món ngay")}</Link>
            <Link to="/menu" className="c-btn c-btn--ghost is-lg">{t("Xem thực đơn")}</Link>
          </div>
        </div>

        <div className="c-h2-stage">
          <span className="c-h2-glow" aria-hidden />
          <Enso />
          <div className="c-h2-cup" key={p?.id ?? 0}>
            {p ? <ProductImage p={p} className="c-h2-cup-img" /> : <SiteImg src="menu/ca-phe-da" alt="" priority sizes="440px" className="c-h2-cup-img" />}
          </div>
          {p && (
            <div className="c-h2-card c-float" aria-live="polite">
              <Link to={`/product/${p.id}`} className="c-h2-card-name">{p.name}</Link>
              <span className="c-h2-card-row">
                <span className="c-price">{formatVnd(listPrice(p))}</span>
                {!p.soldOut && (
                  <button type="button" className="c-h2-add" onClick={() => { quickAdd(p); setAdded(p.id); }} aria-label={t("Thêm {name} vào giỏ", { name: p.name })}>
                    {added === p.id ? <Check size={18} aria-hidden /> : <Plus size={18} aria-hidden />}
                  </button>
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      {picks.length > 1 && (
        <div className="c-wrap">
          <div className="c-h2-thumbs" role="group" aria-label={t("Món nổi bật")}>
            {picks.map((x, k) => (
              <button key={x.id} type="button" aria-pressed={k === i} onClick={() => setI(k)}>
                <ProductImage p={x} className="c-h2-thumb-img" />
                <span>{x.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

type TabId = "best" | "new" | "sale";

/** Món nổi bật xếp lớp: 1 món lớn (khung vòm) + 4 món nhỏ; tab Bán chạy / Món mới / Đang giảm giá */
function FeaturedTabs({ lists, line, loading }: { lists: Record<TabId, Product[]>; line: (p: Product) => string | null; loading: boolean }) {
  const { t } = useLang();
  const tabs = ([["best", "Bán chạy"], ["new", "Món mới"], ["sale", "Đang giảm giá"]] as [TabId, string][]).filter(([id]) => lists[id].length);
  const [tab, setTab] = useState<TabId>("best");
  const cur = tabs.find(([id]) => id === tab) ? tab : tabs[0]?.[0];
  const list = cur ? lists[cur] : [];
  const big = list[0];
  const btns = useRef<(HTMLButtonElement | null)[]>([]);
  // ← → chuyển tab (mẫu tablist WAI-ARIA)
  function onKey(e: KeyboardEvent, k: number) {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (k + d + tabs.length) % tabs.length;
    setTab(tabs[n][0]);
    btns.current[n]?.focus();
  }
  return (
    <section className="c-wrap c-sec c-feat">
      <div className="c-feat-head">
        <SectionHead eyebrow="Thực đơn" title={<>{t("Món được")} <em>{t("gọi nhiều")}</em></>} sub="bán chạy, món mới và món đang giảm giá" />
        {tabs.length > 1 && (
          <div className="c-tabs" role="tablist" aria-label={t("Nhóm món")}>
            {tabs.map(([id, label], k) => (
              <button
                key={id}
                ref={(el) => { btns.current[k] = el; }}
                type="button"
                role="tab"
                id={`c-feat-${id}`}
                aria-selected={cur === id}
                aria-controls="c-feat-panel"
                tabIndex={cur === id ? 0 : -1}
                onClick={() => setTab(id)}
                onKeyDown={(e) => onKey(e, k)}
              >
                {t(label)}
              </button>
            ))}
          </div>
        )}
      </div>
      {loading && !big ? (
        <Skeleton variant="card" count={4} />
      ) : big ? (
        <div className="c-feat-body" id="c-feat-panel" role="tabpanel" aria-labelledby={cur ? `c-feat-${cur}` : undefined} key={cur}>
          <article className="c-feat-big">
            <Link to={`/product/${big.id}`} className="c-feat-big-media" aria-label={big.name} tabIndex={-1}>
              <figure className="c-arch"><ProductImage p={big} /></figure>
            </Link>
            <div className="c-feat-big-card c-float">
              {line(big) && <Eyebrow>{line(big)}</Eyebrow>}
              <h3><Link to={`/product/${big.id}`}>{big.name}</Link></h3>
              <NutritionTags p={big} />
              <div className="c-feat-big-foot">
                <span className="c-pcard-prices">
                  {!!big.discountPercent && <span className="c-price-old">{formatVnd(big.sellPrice)}</span>}
                  <span className="c-price">{formatVnd(listPrice(big))}</span>
                </span>
                <Link to={`/product/${big.id}`} className="c-btn c-btn--solid is-sm">{t("Chọn món")}</Link>
              </div>
            </div>
          </article>
          <div className="c-feat-grid">
            {list.slice(1, 5).map((p) => <ProductCard key={p.id} p={p} line={line(p)} />)}
          </div>
        </div>
      ) : null}
    </section>
  );
}

const STEPS = [
  { img: "story/qua-chin", title: "Chọn hạt", text: "Robusta Buôn Ma Thuột và Arabica Cầu Đất, chỉ hái quả chín đỏ." },
  { img: "story/may-rang", title: "Rang", text: "Rang mộc từng mẻ nhỏ, để hạt nghỉ ba ngày rồi mới xay." },
  { img: "story/nen-ca-phe", title: "Pha", text: "Phin nhôm ủ 30 giây, châm nước 92°C, nhỏ giọt chừng năm phút." },
  { img: "space/quay-bar", title: "Phục vụ", text: "Rót lên đá viên to hoặc ly sứ hâm nóng, mang ra khi còn thơm." },
];

/** Từ hạt đến ly: 4 bước, ảnh tròn + số serif lớn; máy tính nối bằng đường cong nét đứt */
function BeanToCup() {
  const { t } = useLang();
  return (
    <section className="c-wrap c-sec c-steps">
      <SectionHead eyebrow="Quy trình" title={<>{t("Từ hạt")} <em>{t("đến ly")}</em></>} center sub="bốn bước, không bỏ bước nào" />
      <div className="c-steps-body">
        <svg className="c-steps-curve" viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden>
          <path d="M125 60 C 220 0, 300 0, 375 60 S 540 120, 625 60 S 800 0, 875 60" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="6 8" vectorEffect="non-scaling-stroke" />
        </svg>
        <ol className="c-steps-list">
          {STEPS.map((s, k) => (
            <Reveal as="li" key={s.title} delay={k * 90} className="c-step">
              <span className="c-step-img"><SiteImg src={s.img} alt="" sizes="160px" /></span>
              <span className="c-step-n" aria-hidden>{String(k + 1).padStart(2, "0")}</span>
              <h3 className="c-step-title">{t(s.title)}</h3>
              <p className="c-step-text">{t(s.text)}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Stars({ n }: { n: number }) {
  const { t } = useLang();
  return (
    <span className="c-stars" role="img" aria-label={t("{n} trên 5 sao", { n })}>
      {[1, 2, 3, 4, 5].map((k) => <span key={k} aria-hidden className={k <= n ? "is-on" : undefined}>★</span>)}
    </span>
  );
}

const shortStore = (s?: string) => s?.replace(/^TD Coffee\s*[-–·:]\s*/i, "");

export function HomePage() {
  const { storeId } = useCustomerStore();
  const menu = useMenuData();
  const info = useSiteInfo();
  const cats = useMenuCategories();
  const { t, date } = useLang();
  const [home, setHome] = useState<HomePageResponse | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [vouchers, setVouchers] = useState<PublicVoucher[]>([]);
  const [games, setGames] = useState<ActiveGame[]>([]);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [reviews, setReviews] = useState<PublicReviewRow[]>([]);

  useEffect(() => {
    api<HomePageResponse>(withStore("/api/homepage", storeId)).then(setHome).catch(() => setHome(null));
    api<Banner[]>(`/api/banners${storeId ? `?storeId=${storeId}` : ""}`).then(setBanners).catch(() => setBanners([]));
    api<ActiveGame[]>(`/api/games/active${storeId ? `?store=${storeId}` : ""}`).then(setGames).catch(() => setGames([]));
  }, [storeId]);
  useEffect(() => {
    api<PublicVoucher[]>("/api/vouchers/public").then((v) => setVouchers(v.slice(0, 6))).catch(() => setVouchers([]));
    api<Post[]>("/api/posts").then((p) => setPosts(p.slice(0, 3))).catch(() => setPosts([]));
    api<SiteStats>("/api/site/stats").then(setStats).catch(() => setStats(null));
    // Đánh giá có lời nhận xét, điểm cao trước, lấy 3
    api<PublicReviewRow[]>("/api/reviews")
      .then((r) => setReviews(r.filter((x) => x.comment?.trim()).sort((a, b) => b.rating - a.rating).slice(0, 3)))
      .catch(() => setReviews([]));
  }, []);

  const catName = useMemo(() => new Map((menu?.categories ?? []).map((c) => [c.id, c.name])), [menu]);
  const line = (p: Product) => catName.get(p.categoryId) ?? null;
  // Hero: món bán chạy có ảnh, thiếu thì lấy món có ảnh trong thực đơn
  const heroPicks = useMemo(() => {
    const seen = new Set<number>();
    const ok = (p: Product) => !!p.imageUrl && !p.soldOut && !seen.has(p.id) && !!seen.add(p.id);
    return [...(home?.bestSellers ?? []), ...(menu?.products ?? [])].filter(ok).slice(0, 4);
  }, [home, menu]);
  const products = menu?.products ?? [];
  const lists: Record<TabId, Product[]> = {
    best: home?.bestSellers ?? [],
    new: [...products].sort((a, b) => b.id - a.id).slice(0, 5),
    sale: home?.flashSale.length ? home.flashSale : products.filter((p) => (p.discountPercent ?? 0) > 0),
  };
  const game = games[0];
  const [lead, ...restPosts] = posts ?? [];

  return (
    <div className="c-home">
      <HeroFloat picks={heroPicks} />

      {/* Danh mục: ảnh tròn cuộn ngang */}
      {cats.length > 0 && (
        <nav className="c-wrap c-cats" aria-label={t("Danh mục sản phẩm")}>
          <ul className="c-cats-row">
            {cats.map((c) => (
              <li key={c.id}>
                <Link to={`/menu?category=${c.id}`} className="c-cat">
                  <span className="c-cat-img"><CategoryThumb name={c.name} images={c.images} /></span>
                  <span className="c-cat-name">{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* Khách đã đăng nhập: món quen (thêm đúng tuỳ chọn quen) + đặt lại đơn gần nhất */}
      <UsualHome storeId={storeId} />

      {/* Banner cũ (Website › Banner) thành dải trượt dưới hero */}
      {banners.length > 0 && (
        <section className="c-wrap c-banner-band" aria-label={t("Chương trình nổi bật")}>
          <BannerCarousel banners={banners} />
        </section>
      )}

      <FeaturedTabs lists={lists} line={line} loading={!home || !menu} />

      {/* Hợp thời tiết hôm nay: 4 món theo thời tiết + giờ ở chi nhánh đang chọn */}
      <WeatherPicks storeId={storeId} />

      {/* Câu chuyện: ảnh vòm lớn + ảnh nhỏ đè lệch */}
      <section className="c-story2">
        <div className="c-wrap c-story2-in">
          <Reveal className="c-story2-media">
            <span className="c-story2-back" aria-hidden />
            <ArchImage src="space/ben-cua-so" ratio="4 / 5" className="c-story2-big" sizes="(max-width: 768px) 80vw, 440px" />
            <figure className="c-rounded c-story2-small"><SiteImg src="story/phin-ban-tre" sizes="220px" /></figure>
          </Reveal>
          <Reveal className="c-story2-copy" delay={120}>
            <SectionHead eyebrow="Câu chuyện của chúng tôi" title={<>{t("Một quầy phin nhỏ,")} <em>{t("mở cửa từ sáng sớm")}</em></>} />
            {/* Đoạn 1: "Giới thiệu ngắn" trong Website › Thông tin công ty — chủ chuỗi tự viết */}
            {info?.company.intro && <p>{info.company.intro}</p>}
            <p>{t("Mẻ phin đầu tiên nhỏ giọt khi trời còn tối. Khách quen ghé trước giờ làm, gọi một ly đen đá, ngồi bên cửa sổ một lúc rồi mới đi. Mình giữ nhịp đó ở mọi chi nhánh: pha từng ly, không pha sẵn.")}</p>
            <div className="c-story-sign">
              <Signature />
              <span>{t("Chủ quán {name}", { name: info?.company.name ?? "TD Coffee" })}</span>
            </div>
            <Link to="/about" className="c-btn c-btn--outline">{t("Đọc câu chuyện")} <ArrowRight size={16} aria-hidden /></Link>
          </Reveal>
        </div>
      </section>

      {/* Dải số liệu (số thật từ CSDL, đếm lên khi hiện) */}
      {stats && (
        <section className="c-stats-band c-grain" aria-label={t("TD Coffee qua những con số")}>
          <div className="c-wrap">
            <StatCounter value={stats.stores} label={t("chi nhánh ở Sài Gòn")} />
            <StatCounter value={stats.products} label={t("món trên thực đơn")} />
            <StatCounter value={floorThousand(stats.cups)} suffix="+" label={t("ly đã phục vụ")} />
            {stats.rating != null && <StatCounter value={stats.rating} decimals={1} suffix="/5" label={t("điểm đánh giá trung bình")} />}
          </div>
        </section>
      )}

      <BeanToCup />

      {/* Voucher dạng vé, cuộn ngang trên nền kem đậm */}
      {vouchers.length > 0 && (
        <section className="c-voucher-band">
          <div className="c-wrap c-sec">
            <SectionHead eyebrow="Ưu đãi" title="Mã giảm giá" sub="chép mã, dán ở bước thanh toán" more={{ to: "/promotions", label: "Tất cả ưu đãi" }} />
            <div className="c-tickets c-tickets-scroll">
              {vouchers.map((v) => <VoucherTicket key={v.id} v={v} />)}
            </div>
          </div>
        </section>
      )}

      {/* Mini game đang chạy: thẻ ngang có ảnh */}
      {game && (
        <section className="c-wrap c-sec c-sec-tight">
          <div className="c-game2 c-float">
            <figure className="c-game2-img"><SiteImg src="events/tiec-nhom" sizes="(max-width: 768px) 100vw, 420px" /></figure>
            <div className="c-game2-copy">
              <Eyebrow>{t("Mini game")}</Eyebrow>
              <h2 className="c-game2-title">{game.name}</h2>
              <p>{game.me?.tickets ? t("Bạn đang có {n} lượt chơi.", { n: game.me.tickets }) : game.description ?? t("Mỗi đơn từ {n} được 1 lượt chơi.", { n: formatVnd(game.minOrderValue) })}</p>
              <Link to={`/game/${game.id}${storeId ? `?store=${storeId}` : ""}`} className="c-btn c-btn--solid">{t("Chơi ngay")}</Link>
            </div>
          </div>
        </section>
      )}

      {/* Khách nói gì: đánh giá thật, có lời nhận xét (không có thì ẩn mục) */}
      {reviews.length > 0 && (
        <section className="c-wrap c-sec c-quotes">
          <SectionHead eyebrow="Khách nói gì" title="Lời thật từ khách quen" center />
          <ul className={`c-quotes-list is-${reviews.length}`}>
            {reviews.map((r, k) => (
              <Reveal as="li" key={r.id} delay={k * 90} className="c-quote">
                <Stars n={r.rating} />
                <blockquote>{r.comment}</blockquote>
                <div className="c-quote-who">
                  <CustomerAvatar src={r.customer?.avatarUrl} name={r.customer?.fullName ?? t("Khách")} anonymous={!r.customer} seed={r.id} size={40} />
                  <span>
                    <strong>{r.customer?.fullName ?? t("Khách ẩn danh")}</strong>
                    <small>{[r.product?.name, shortStore(r.storeName)].filter(Boolean).join(" · ")}</small>
                  </span>
                </div>
              </Reveal>
            ))}
          </ul>
        </section>
      )}

      {/* Tin tức: 1 bài lớn + 2 bài nhỏ */}
      {posts === null ? (
        <section className="c-wrap c-sec"><Skeleton variant="news" count={3} /></section>
      ) : lead ? (
        <section className="c-wrap c-sec c-news2">
          <SectionHead eyebrow="Tin tức" title="Chuyện ở quán" more={{ to: "/blog", label: "Xem tất cả bài" }} />
          <div className="c-news2-grid">
            <Link to={`/blog/${lead.id}`} className="c-news2-lead">
              <span className="c-news2-img">{lead.imageUrl ? <img src={mediaUrl(lead.imageUrl)} alt="" loading="lazy" /> : <span className="c-noimg">{lead.title}</span>}</span>
              <span className="c-news2-txt">
                <time dateTime={lead.createdAt}>{date(lead.createdAt)}</time>
                <strong>{lead.title}</strong>
                <span>{plain(lead.body).slice(0, 180)}…</span>
              </span>
            </Link>
            <div className="c-news2-side">
              {restPosts.map((p) => (
                <Link key={p.id} to={`/blog/${p.id}`} className="c-news2-item">
                  <span className="c-news2-img">{p.imageUrl ? <img src={mediaUrl(p.imageUrl)} alt="" loading="lazy" /> : <span className="c-noimg" />}</span>
                  <span className="c-news2-txt">
                    <time dateTime={p.createdAt}>{date(p.createdAt)}</time>
                    <strong>{p.title}</strong>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
