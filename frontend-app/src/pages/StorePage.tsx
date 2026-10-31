import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, mediaUrl } from "../lib/api";
import { ReviewList } from "../components/ReviewList";
import { useSiteInfo, type SiteStore } from "../lib/site";
import { Crumbs, SectionHead } from "../components/site/parts";

const hm = (t: string | null) => (t ? t.slice(0, 5) : null);

/** Về chúng tôi / Cửa hàng: giới thiệu (Website › Thông tin công ty), ảnh không gian quán, danh sách chi nhánh, đánh giá */
export function StorePage() {
  const info = useSiteInfo();
  const [gallery, setGallery] = useState<string[]>([]);
  useEffect(() => {
    api<string[]>("/api/posts/gallery").then(setGallery).catch(() => setGallery([]));
  }, []);
  const stores: SiteStore[] = info?.stores ?? [];

  return (
    <div className="c-wrap c-about">
      <Crumbs items={[{ label: "Cửa hàng" }]} />
      <section className="c-about-intro">
        <div>
          <SectionHead as="h1" title={info?.company.name ?? "TD Coffee"} sub="cà phê Sài Gòn, pha phin mỗi sáng" />
          {info?.company.intro && <p className="c-about-lead">{info.company.intro}</p>}
          {info && (
            <dl className="c-about-facts">
              <div><dt>Chi nhánh</dt><dd>{stores.length}</dd></div>
              <div><dt>Mở cửa</dt><dd>{info.company.hours}</dd></div>
              <div><dt>Hotline</dt><dd><a href={info.hotline.href}>{info.hotline.display}</a></dd></div>
            </dl>
          )}
          <div className="c-about-cta">
            <Link to="/menu" className="c-btn">Xem thực đơn</Link>
            <Link to="/contact" className="c-btn is-outline">Bản đồ chi nhánh</Link>
          </div>
        </div>
        {gallery[0] && (
          <div className="c-about-img">
            <img src={mediaUrl(gallery[0])} alt="Không gian quán TD Coffee" loading="lazy" />
          </div>
        )}
      </section>

      {stores.length > 0 && (
        <section className="c-sec">
          <SectionHead title={stores.length > 1 ? "Hệ thống cửa hàng" : "Địa chỉ quán"} sub={`${stores.length} điểm, ghé là có chỗ`} more={{ to: "/contact", label: "Xem bản đồ" }} />
          <div className="c-store-cards">
            {stores.map((s) => (
              <article key={s.id} className="c-store-card">
                <h3>{s.name}</h3>
                {s.address && <p>{s.address}</p>}
                {hm(s.openTime) && hm(s.closeTime) && <p className="c-muted-txt">Mở cửa {hm(s.openTime)} – {hm(s.closeTime)}</p>}
                <p className="c-store-card-links">
                  {s.phone && <a href={`tel:${s.phone}`}>{s.phone}</a>}
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`} target="_blank" rel="noopener noreferrer">Chỉ đường →</a>
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      {gallery.length > 1 && (
        <section className="c-sec">
          <SectionHead title="Không gian quán" sub="góc ngồi quen của khách" />
          <div className="c-gallery">
            {gallery.slice(0, 8).map((url, i) => (
              <span key={url + i} className="c-gallery-item"><img src={mediaUrl(url)} alt={`Không gian quán ${i + 1}`} loading="lazy" /></span>
            ))}
          </div>
        </section>
      )}

      <section className="c-sec">
        <ReviewList title="Khách nói gì về quán" />
      </section>
    </div>
  );
}
