import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api, mediaUrl, type HomePageResponse, type Product } from "../lib/api";
import { useCustomerStore, withStore } from "../lib/customerStore";
import { formatVnd, useMenuData, useSiteInfo } from "../lib/site";
import { ProductCard, SectionHead, VoucherTicket, type PublicVoucher } from "../components/site/parts";
import { useLang } from "../lib/i18n";
import { ReviewList } from "../components/ReviewList";

type Banner = { id: number; imageUrl: string; title: string | null; subtitle: string | null; link: string | null };
type Post = { id: number; title: string; body: string; imageUrl: string | null; createdAt: string };
type ActiveGame = { id: number; name: string; description: string | null; minOrderValue: number; me: { tickets: number } | null };

const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const BANNER_MS = 3000;

/** Banner lớn: ảnh do quản lý tải lên, tiêu đề poster đặt trên ảnh; tự chuyển 3 giây (dừng khi rê chuột), điện thoại vuốt ngang để đổi */
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
  if (!n) return <div className="c-banner c-banner-empty" aria-hidden />;

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

export function HomePage() {
  const { storeId } = useCustomerStore();
  const menu = useMenuData();
  const info = useSiteInfo();
  const { t, date } = useLang();
  const [home, setHome] = useState<HomePageResponse | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [vouchers, setVouchers] = useState<PublicVoucher[]>([]);
  const [games, setGames] = useState<ActiveGame[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    api<HomePageResponse>(withStore("/api/homepage", storeId)).then(setHome).catch(() => setHome(null));
    api<Banner[]>(`/api/banners${storeId ? `?storeId=${storeId}` : ""}`).then(setBanners).catch(() => setBanners([]));
    api<ActiveGame[]>(`/api/games/active${storeId ? `?store=${storeId}` : ""}`).then(setGames).catch(() => setGames([]));
  }, [storeId]);
  useEffect(() => {
    api<PublicVoucher[]>("/api/vouchers/public").then((v) => setVouchers(v.slice(0, 4))).catch(() => setVouchers([]));
    api<Post[]>("/api/posts").then((p) => setPosts(p.slice(0, 3))).catch(() => setPosts([]));
  }, []);

  const catName = useMemo(() => new Map((menu?.categories ?? []).map((c) => [c.id, c.name])), [menu]);
  // Danh mục gốc + ảnh 1 món tiêu biểu — tính cả món nằm trong danh mục con
  const cats = (menu?.categories ?? []).filter((c) => !c.parentId).map((c) => {
    const ids = new Set([c.id, ...(menu?.categories ?? []).filter((x) => x.parentId === c.id).map((x) => x.id)]);
    const list = (menu?.products ?? []).filter((p) => ids.has(p.categoryId));
    return { ...c, image: list.find((p) => p.imageUrl)?.imageUrl ?? null, count: list.length };
  });
  const newest = useMemo(() => [...(menu?.products ?? [])].sort((a, b) => b.id - a.id).slice(0, 8), [menu]);
  const line = (p: Product) => catName.get(p.categoryId) ?? null;
  const game = games[0];
  const storyImg = menu?.products.find((p) => p.imageUrl)?.imageUrl;

  return (
    <div className="c-home">
      {/* Khối đầu: danh mục trái + banner phải */}
      <section className="c-wrap c-hero">
        <nav className="c-hero-cats" aria-label={t("Danh mục sản phẩm")}>
          <div className="c-hero-cats-h">{t("Danh mục")}</div>
          {cats.map((c) => (
            <Link key={c.id} to={`/menu?category=${c.id}`} className="c-hero-cat">
              {c.image ? <img src={mediaUrl(c.image)} alt="" loading="lazy" /> : <span className="c-hero-cat-ph" aria-hidden />}
              <span className="c-hero-cat-name">{c.name}</span>
              <span className="c-hero-cat-n">{c.count}</span>
            </Link>
          ))}
          {!cats.length && <span className="c-hero-cat c-muted-txt">{t("Đang tải…")}</span>}
        </nav>
        <BannerCarousel banners={banners} />
      </section>

      {/* Dải voucher vé xé */}
      {vouchers.length > 0 && (
        <section className="c-wrap c-sec c-sec-tight">
          <SectionHead title="Mã giảm giá" sub="chép mã, dán khi thanh toán" more={{ to: "/promotions", label: "Tất cả ưu đãi" }} />
          <div className="c-tickets">
            {vouchers.map((v) => <VoucherTicket key={v.id} v={v} />)}
          </div>
        </section>
      )}

      {/* Mini game đang chạy */}
      {game && (
        <section className="c-game-strip">
          <div className="c-wrap c-game-strip-in">
            <div>
              <h2 className="c-game-title">{game.name}</h2>
              <p className="c-game-desc">
                {game.me?.tickets ? t("Bạn đang có {n} lượt chơi.", { n: game.me.tickets }) : game.description ?? t("Mỗi đơn từ {n} được 1 lượt chơi.", { n: formatVnd(game.minOrderValue) })}
              </p>
            </div>
            <Link to={`/game/${game.id}${storeId ? `?store=${storeId}` : ""}`} className="c-btn is-paper">{t("Chơi ngay")}</Link>
          </div>
        </section>
      )}

      {!!home?.flashSale.length && (
        <section className="c-wrap c-sec">
          <SectionHead title="Ưu đãi hôm nay" sub="giá giảm đến hết ngày" more={{ to: "/menu" }} />
          <div className="c-grid">{home.flashSale.slice(0, 8).map((p) => <ProductCard key={p.id} p={p} line={line(p)} />)}</div>
        </section>
      )}

      {!!home?.bestSellers.length && (
        <section className="c-wrap c-sec">
          <SectionHead title="Bán chạy" sub="ly quen của khách quán" more={{ to: "/menu" }} />
          <div className="c-grid">{home.bestSellers.slice(0, 8).map((p) => <ProductCard key={p.id} p={p} line={line(p)} />)}</div>
        </section>
      )}

      {newest.length > 0 && (
        <section className="c-wrap c-sec">
          <SectionHead title="Món mới" sub="vừa lên thực đơn" more={{ to: "/menu" }} />
          <div className="c-grid">{newest.map((p) => <ProductCard key={p.id} p={p} line={line(p)} />)}</div>
        </section>
      )}

      {/* Câu chuyện */}
      <section className="c-story">
        <div className="c-wrap c-story-in">
          <div className="c-story-img">
            {storyImg ? <img src={mediaUrl(storyImg)} alt={t("Quầy pha chế TD Coffee")} loading="lazy" /> : <span className="c-noimg">TD Coffee</span>}
          </div>
          <div className="c-story-copy">
            <h2 className="c-sec-title">
              {t("Câu chuyện TD Coffee")}
              <span className="c-sec-sub">— {t("pha phin mỗi sáng")}</span>
            </h2>
            {/* Nội dung lấy từ "Giới thiệu ngắn" trong Website › Thông tin công ty — chủ chuỗi tự viết */}
            <p>{info?.company.intro ?? ""}</p>
            {info && <p>{t("Mở cửa {h} · {n} chi nhánh.", { h: info.company.hours, n: info.stores.length })}</p>}
            <div className="c-story-sign">
              <Signature />
              <span>{t("Chủ quán {name}", { name: info?.company.name ?? "TD Coffee" })}</span>
            </div>
            <Link to="/about" className="c-btn is-outline">{t("Ghé cửa hàng")}</Link>
          </div>
        </div>
      </section>

      {posts.length > 0 && (
        <section className="c-wrap c-sec">
          <SectionHead title="Tin tức" sub="chuyện ở quán" more={{ to: "/blog" }} />
          <div className="c-news-grid">
            {posts.map((p) => (
              <Link key={p.id} to={`/blog/${p.id}`} className="c-news-card">
                <span className="c-news-img">
                  {p.imageUrl ? <img src={mediaUrl(p.imageUrl)} alt="" loading="lazy" /> : <span className="c-noimg">{p.title}</span>}
                </span>
                <time className="c-news-date" dateTime={p.createdAt}>{date(p.createdAt)}</time>
                <span className="c-news-title">{p.title}</span>
                <span className="c-news-ex">{plain(p.body).slice(0, 120)}…</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="c-wrap c-sec">
        <ReviewList title="Khách nói gì về quán" />
      </section>
    </div>
  );
}
