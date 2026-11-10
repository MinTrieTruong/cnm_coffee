/**
 * /stores — Hệ thống cửa hàng: thẻ chi nhánh (ảnh bìa, địa chỉ, giờ, trạng thái theo giờ hiện tại) + bản đồ dính bên phải,
 * lọc quận, nút "Gần tôi" (sắp theo khoảng cách). Bấm thẻ → bản đồ bay tới.
 * /stores/:id — Trang từng chi nhánh: câu chuyện, quản lý, tiện ích, góc ngồi, thư viện ảnh, bản đồ, đặt món tại quán, đánh giá.
 * Ảnh + chữ chủ chuỗi / quản lý sửa ở Cấu hình › Chi nhánh › Trang giới thiệu (API /api/admin/stores/:id/profile).
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { ArrowRight, Bike, Laptop, LocateFixed, MapPin, Navigation, PawPrint, Phone, Plug, Snowflake, Trees, Wifi, type LucideIcon } from "lucide-react";
import { AMENITIES, type StoreProfile } from "@shared/brand";
import { api } from "../lib/api";
import { useCustomerStore } from "../lib/customerStore";
import { storeEditHref, useOwnerEditing, type StoreCard } from "../lib/brand";
import { useLang } from "../lib/i18n";
import { Divider, Eyebrow, Lightbox, PageHero, Reveal, Skeleton, EmptyState, useHeroHeader, type LightboxItem } from "../components/site/lux";
import { BrandImg, EditPen, OwnerBar } from "../components/site/BrandParts";
import { StoreStatus } from "./About";
import { ReviewItem, type PublicReviewRow } from "../components/site/ReviewItem";
import "../styles/customer-brand.css";

const directions = (s: { lat: number; lng: number }) => `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;
const hasPos = (s: { lat: number; lng: number }) => Number.isFinite(s.lat) && Number.isFinite(s.lng) && !!(s.lat || s.lng);
/** Quận / phường lấy từ địa chỉ (phần trước "TP.HCM"), dùng cho bộ lọc */
function districtOf(addr: string | null) {
  const parts = (addr ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const i = parts.findIndex((x) => /^(tp\.?|thành phố)\s*(hcm|hồ chí minh)/i.test(x));
  return (i > 0 ? parts[i - 1] : parts[parts.length - 1]) ?? "";
}

function MapFocus({ stores, focus }: { stores: { lat: number; lng: number }[]; focus: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], 16, { duration: 0.6 });
    else if (stores.length > 1) map.fitBounds(stores.map((s) => [s.lat, s.lng] as [number, number]), { padding: [40, 40] });
    else if (stores[0]) map.setView([stores[0].lat, stores[0].lng], 15);
  }, [map, stores, focus]);
  return null;
}

export function Stores() {
  const { t } = useLang();
  const [stores, setStores] = useState<(StoreCard & { distanceKm?: number })[] | null>(null);
  const [focus, setFocus] = useState<StoreCard | null>(null);
  const [district, setDistrict] = useState("all");
  const [locating, setLocating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    api<StoreCard[]>("/api/stores").then(setStores).catch(() => setStores([]));
  }, []);

  function nearMe() {
    if (!navigator.geolocation) return setMsg(t("Trình duyệt không hỗ trợ định vị."));
    setLocating(true);
    setMsg(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const list = await api<(StoreCard & { distanceKm: number })[]>(`/api/stores?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`);
          setStores(list);
          setDistrict("all");
          if (list[0]) setFocus(list[0]);
        } catch {
          setMsg(t("Không tải được danh sách chi nhánh."));
        } finally {
          setLocating(false);
        }
      },
      () => {
        setMsg(t("Không lấy được vị trí. Hãy chọn chi nhánh trong danh sách."));
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  const districts = useMemo(() => [...new Set((stores ?? []).map((s) => districtOf(s.address)).filter(Boolean))], [stores]);
  const list = (stores ?? []).filter((s) => district === "all" || districtOf(s.address) === district);
  const pins = list.filter(hasPos);

  return (
    <div className="c-bpage">
      <PageHero eyebrow={t("Hệ thống cửa hàng")} title={t("Ghé quán gần bạn")} sub={t("Cùng một vị cà phê, mỗi quán một góc ngồi riêng.")} image="space/quay-bar" crumbs={[{ label: t("Cửa hàng") }]} />
      <div className="c-wrap c-sec c-st">
        <div className="c-st-list">
          <div className="c-st-tools">
            <button type="button" className="c-btn c-btn--outline is-sm" onClick={nearMe} disabled={locating}><LocateFixed size={16} aria-hidden /> {locating ? t("Đang tìm…") : t("Gần tôi")}</button>
            {districts.length > 1 && (
              <div className="c-b-chips" role="group" aria-label={t("Lọc theo khu vực")}>
                <button type="button" aria-pressed={district === "all"} onClick={() => setDistrict("all")}>{t("Tất cả")}</button>
                {districts.map((d) => <button key={d} type="button" aria-pressed={district === d} onClick={() => setDistrict(d)}>{d}</button>)}
              </div>
            )}
          </div>
          {msg && <p className="c-muted-txt" role="status">{msg}</p>}
          {stores === null ? (
            <Skeleton variant="row" count={3} />
          ) : !list.length ? (
            <EmptyState art="awning" text={t("Chưa có chi nhánh nào ở khu vực này.")} />
          ) : (
            <ul className="c-st-cards">
              {list.map((s) => (
                <li key={s.id}>
                  <article className={`c-st-card${focus?.id === s.id ? " is-on" : ""}`} onClick={() => setFocus(s)}>
                    <BrandImg img={s.coverImage} ratio="4 / 3" className="c-st-card-img" sizes="200px" placeholder="awning" />
                    <div className="c-st-card-txt">
                      <h2><button type="button" onClick={() => setFocus(s)}>{s.name}</button></h2>
                      {s.tagline && <p className="c-st-tag">{s.tagline}</p>}
                      {s.address && <p><MapPin size={14} aria-hidden /> {s.address}{s.distanceKm != null && <span className="c-muted-txt"> · {t("{n} km", { n: s.distanceKm })}</span>}</p>}
                      <StoreStatus open={s.openTime} close={s.closeTime} />
                      <div className="c-st-links">
                        <Link to={`/stores/${s.id}`} className="c-sec-more">{t("Xem quán")} <ArrowRight size={14} aria-hidden /></Link>
                        <a href={directions(s)} target="_blank" rel="noopener noreferrer">{t("Chỉ đường")}</a>
                      </div>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="c-st-map">
          {pins.length > 0 ? (
            <MapContainer center={[pins[0].lat, pins[0].lng]} zoom={13} scrollWheelZoom={false} className="c-map">
              <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapFocus stores={pins} focus={focus} />
              {pins.map((s) => (
                <Marker key={s.id} position={[s.lat, s.lng]} title={s.name} eventHandlers={{ click: () => setFocus(s) }}>
                  <Popup>
                    <div className="c-map-pop"><strong>{s.name}</strong>{s.address && <span>{s.address}</span>}<Link to={`/stores/${s.id}`}>{t("Xem quán")}</Link></div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          ) : (
            <div className="c-map c-noimg">{stores ? t("Chưa có vị trí chi nhánh") : t("Đang tải bản đồ…")}</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════ /stores/:id ═══════════ */

type StoreDetailData = {
  id: number; name: string; address: string | null; phone: string | null; lat: number; lng: number; openTime: string | null; closeTime: string | null;
  profile: StoreProfile; rating: { avg: number; count: number } | null; reviews: PublicReviewRow[];
};
const AMENITY_ICON: Record<string, LucideIcon> = { wifi: Wifi, outlet: Plug, parking: Bike, aircon: Snowflake, outdoor: Trees, pets: PawPrint, quiet: Laptop };

function DetailHero({ s, owner }: { s: StoreDetailData; owner: boolean }) {
  const { t } = useLang();
  useHeroHeader();
  return (
    <section className="c-b-hero is-short">
      <BrandImg img={s.profile.coverImage} className="c-b-hero-img" priority sizes="100vw" placeholder="awning" />
      <div className="c-wrap c-b-hero-in">
        <nav className="c-ph-crumbs" aria-label={t("Vị trí")}><Link to="/">{t("Trang chủ")}</Link><span aria-hidden>·</span><Link to="/stores">{t("Cửa hàng")}</Link></nav>
        {s.profile.openedYear && <Eyebrow>{t("Mở từ {y}", { y: s.profile.openedYear })}</Eyebrow>}
        <h1 className="c-b-hero-title">{s.name}</h1>
        {s.profile.tagline && <p className="c-b-hero-sub">{s.profile.tagline}</p>}
        <StoreStatus open={s.openTime} close={s.closeTime} />
      </div>
      <EditPen show={owner} to={storeEditHref(s.id, "coverImage")} label={t("Ảnh bìa quán")} className="is-corner" />
    </section>
  );
}

export function StoreDetail() {
  const { id } = useParams();
  const { t } = useLang();
  const nav = useNavigate();
  const { setStore } = useCustomerStore();
  const owner = useOwnerEditing();
  const [s, setS] = useState<StoreDetailData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    setS(null);
    setErr(null);
    api<StoreDetailData>(`/api/stores/${id}/public`).then(setS).catch((e) => setErr(e instanceof Error ? e.message : t("Không tải được chi nhánh.")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (err) return <div className="c-wrap c-sec"><EmptyState art="awning" text={err} action={{ to: "/stores", label: t("Xem các chi nhánh") }} /></div>;
  if (!s) return <div className="c-wrap c-sec"><Skeleton variant="news" count={2} /></div>;
  const p = s.profile;
  const gallery = p.galleryImages.filter((g) => g.image.url);
  const lb: LightboxItem[] = gallery.map((g) => ({ src: g.image.url, alt: g.image.alt, caption: g.caption || g.image.alt }));
  const orderHere = () => {
    if (setStore(s.id)) nav("/menu");
  };

  return (
    <div className="c-bpage has-hero">
      <DetailHero s={s} owner={owner} />

      <section className="c-wrap c-sec c-sd-intro">
        <Reveal className="c-sd-story">
          <Eyebrow>{t("Câu chuyện của quán")}</Eyebrow>
          <h2 className="c-b-title">{t("Vì sao là chỗ này")}</h2>
          <Divider />
          {p.story ? p.story.split(/\n+/).map((x, i) => <p key={i}>{x}</p>) : <p className="c-muted-txt">{t("Quán đang viết câu chuyện của mình.")}</p>}
          <div className="c-b-cta">
            <button type="button" className="c-btn c-btn--solid is-lg" onClick={orderHere}>{t("Đặt món tại quán này")}</button>
            <a href={directions(s)} target="_blank" rel="noopener noreferrer" className="c-btn c-btn--outline is-lg"><Navigation size={16} aria-hidden /> {t("Chỉ đường")}</a>
          </div>
          <EditPen show={owner} to={storeEditHref(s.id, "story")} label={t("Câu chuyện của quán")} />
        </Reveal>
        <Reveal className="c-sd-side" delay={120}>
          {(p.managerName || p.managerQuote) && (
            <figure className="c-sd-manager c-float">
              <BrandImg img={p.managerPhoto} ratio="4 / 5" className="c-arch" sizes="160px" placeholder="person" />
              <div>
                {p.managerQuote && <blockquote>{p.managerQuote}</blockquote>}
                <figcaption><strong>{p.managerName}</strong><span>{t("Quản lý quán")}</span></figcaption>
              </div>
            </figure>
          )}
          <dl className="c-sd-facts">
            {s.address && <div><dt><MapPin size={16} aria-hidden /> {t("Địa chỉ")}</dt><dd>{s.address}</dd></div>}
            {s.phone && <div><dt><Phone size={16} aria-hidden /> {t("Điện thoại")}</dt><dd><a href={`tel:${s.phone}`}>{s.phone}</a></dd></div>}
            {s.rating && <div><dt>{t("Đánh giá")}</dt><dd>{s.rating.avg.toFixed(1)}/5 · {t("{n} đánh giá", { n: s.rating.count })}</dd></div>}
          </dl>
          {p.amenities.length > 0 && (
            <ul className="c-sd-amen" aria-label={t("Tiện ích")}>
              {AMENITIES.filter((a) => p.amenities.includes(a.value)).map((a) => {
                const Icon = AMENITY_ICON[a.value];
                return <li key={a.value}><Icon size={18} aria-hidden /> {t(a.label)}</li>;
              })}
            </ul>
          )}
        </Reveal>
      </section>

      {p.favoriteSpots.length > 0 && (
        <section className="c-wrap c-sec c-sd-spots">
          <Eyebrow>{t("Góc ngồi được yêu thích")}</Eyebrow>
          <h2 className="c-b-title">{t("Khách quen hay ngồi đâu")}</h2>
          <Divider />
          <ul className={`c-sd-spot-list is-${p.favoriteSpots.length}`}>
            {p.favoriteSpots.map((x, i) => (
              <Reveal as="li" key={i} delay={i * 80}>
                <BrandImg img={x.image} ratio="4 / 3" className="c-rounded" sizes="(max-width: 768px) 90vw, 400px" placeholder="awning" />
                {x.caption && <p>{x.caption}</p>}
              </Reveal>
            ))}
          </ul>
        </section>
      )}

      {gallery.length > 0 && (
        <section className="c-wrap c-sec">
          <Eyebrow>{t("Thư viện ảnh")}</Eyebrow>
          <h2 className="c-b-title">{t("Một vòng quanh quán")}</h2>
          <Divider />
          <ul className="c-gallery">
            {gallery.map((g, i) => (
              <li key={i}><button type="button" onClick={() => setOpen(i)} aria-label={`${t("Xem ảnh")}: ${g.image.alt}`}><BrandImg img={g.image} sizes="(max-width: 768px) 50vw, 33vw" /></button></li>
            ))}
          </ul>
          {open != null && <Lightbox items={lb} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
        </section>
      )}

      {hasPos(s) && (
        <section className="c-wrap c-sec c-sd-map">
          <MapContainer center={[s.lat, s.lng]} zoom={16} scrollWheelZoom={false} className="c-map">
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker position={[s.lat, s.lng]} title={s.name} />
          </MapContainer>
        </section>
      )}

      {s.reviews.length > 0 && (
        <section className="c-wrap c-sec">
          <Eyebrow>{t("Khách nói gì")}</Eyebrow>
          <h2 className="c-b-title">{t("Đánh giá ở quán này")}</h2>
          <Divider />
          <ul className="c-reviews">{s.reviews.map((r) => <ReviewItem key={r.id} r={r} />)}</ul>
        </section>
      )}

      <OwnerBar show={owner} editHref={storeEditHref(s.id)} />
    </div>
  );
}
