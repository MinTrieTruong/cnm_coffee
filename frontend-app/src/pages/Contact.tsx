import { useEffect, useState, type FormEvent } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { Mail, MapPin, Phone } from "lucide-react";
import { api } from "../lib/api";
import { getStoreId } from "../lib/customerStore";
import { useSiteInfo, type SiteStore } from "../lib/site";
import { Crumbs, SectionHead } from "../components/site/parts";
import { useLang } from "../lib/i18n";

const hm = (t: string | null) => (t ? t.slice(0, 5) : null);
const hours = (s: SiteStore) => (hm(s.openTime) && hm(s.closeTime) ? `${hm(s.openTime)} – ${hm(s.closeTime)}` : null);
const directions = (s: SiteStore) => `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;

/** Khung bản đồ vừa đủ mọi chi nhánh; bấm tên chi nhánh ở danh sách thì bay tới */
function FitStores({ stores, focus }: { stores: SiteStore[]; focus: SiteStore | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], 16, { duration: 0.6 });
    else if (stores.length > 1) map.fitBounds(stores.map((s) => [s.lat, s.lng] as [number, number]), { padding: [40, 40] });
    else if (stores[0]) map.setView([stores[0].lat, stores[0].lng], 15);
  }, [map, stores, focus]);
  return null;
}

type Form = { name: string; email: string; phone: string; message: string; website: string };
const EMPTY: Form = { name: "", email: "", phone: "", message: "", website: "" };

export function Contact() {
  const info = useSiteInfo();
  const { t } = useLang();
  const [focus, setFocus] = useState<SiteStore | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [errs, setErrs] = useState<Partial<Record<keyof Form, string>>>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const stores = (info?.stores ?? []).filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng) && (s.lat || s.lng));
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v: typeof errs = {};
    if (!f.name.trim()) v.name = t("Nhập họ tên.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) v.email = t("Email chưa đúng.");
    if (f.message.trim().length < 5) v.message = t("Nhập nội dung (ít nhất 5 ký tự).");
    setErrs(v);
    if (Object.keys(v).length) return;
    setSending(true);
    setFail(null);
    try {
      await api("/api/contact-messages", { method: "POST", body: JSON.stringify({ kind: "CONTACT", ...f, storeId: getStoreId() }) });
      setDone(true);
      setF(EMPTY);
    } catch (err) {
      setFail(err instanceof Error ? err.message : t("Gửi chưa được, thử lại sau."));
    } finally {
      setSending(false);
    }
  }

  const field = (k: "name" | "email" | "phone", label: string, type: string, auto: string, required = false) => (
    <label className="c-field">
      <span className="c-field-label">{t(label)}{required && <span aria-hidden> *</span>}</span>
      <input className="c-input" type={type} autoComplete={auto} value={f[k]} onChange={set(k)} aria-invalid={!!errs[k]} aria-describedby={errs[k] ? `e-${k}` : undefined} required={required} />
      {errs[k] && <span className="c-field-err" id={`e-${k}`}>{errs[k]}</span>}
    </label>
  );

  return (
    <div className="c-wrap c-contact">
      <Crumbs items={[{ label: "Liên hệ" }]} />
      <div className="c-contact-grid">
        <div className="c-contact-left">
          <section>
            <h1 className="c-contact-company">{info?.company.name ?? "TD Coffee"}</h1>
            <ul className="c-contact-lines">
              {info?.company.address && <li><MapPin size={17} aria-hidden /><span>{info.company.address}</span></li>}
              {info?.hotline.display && <li><Phone size={17} aria-hidden /><a href={info.hotline.href}>{info.hotline.display}</a></li>}
              {info?.company.email && <li><Mail size={17} aria-hidden /><a href={`mailto:${info.company.email}`}>{info.company.email}</a></li>}
            </ul>
            {info?.company.hours && <p className="c-muted-txt">{t("Mở cửa")} {info.company.hours}</p>}
          </section>

          {stores.length > 0 && (
            <section>
              <h2 className="c-pd-h">{t("Hệ thống cửa hàng")}</h2>
              <ul className="c-store-list">
                {stores.map((s) => (
                  <li key={s.id} className={focus?.id === s.id ? "is-on" : undefined}>
                    <button type="button" className="c-store-name" onClick={() => setFocus(s)}>{s.name}</button>
                    {s.address && <span>{s.address}</span>}
                    <span className="c-store-meta">
                      {hours(s) && <>{t("Mở cửa")} {hours(s)}</>}
                      {s.phone && <> · <a href={`tel:${s.phone}`}>{s.phone}</a></>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <SectionHead title="Liên hệ với chúng tôi" sub="góp ý, đặt tiệc, hợp tác" />
            {done ? (
              <div className="c-done" role="status">
                <p><strong>{t("Đã nhận tin nhắn của bạn.")}</strong> {t("Quán sẽ trả lời qua email hoặc điện thoại trong giờ mở cửa.")}</p>
                <button type="button" className="c-btn is-outline" onClick={() => setDone(false)}>{t("Gửi tin khác")}</button>
              </div>
            ) : (
              <form className="c-form" onSubmit={submit} noValidate>
                <div className="c-form-row">
                  {field("name", "Họ tên", "text", "name", true)}
                  {field("phone", "Số điện thoại", "tel", "tel")}
                </div>
                {field("email", "Email", "email", "email", true)}
                <label className="c-field">
                  <span className="c-field-label">{t("Nội dung")}<span aria-hidden> *</span></span>
                  <textarea className="c-input" value={f.message} onChange={set("message")} maxLength={4000} aria-invalid={!!errs.message} aria-describedby={errs.message ? "e-message" : undefined} required />
                  {errs.message && <span className="c-field-err" id="e-message">{errs.message}</span>}
                </label>
                {/* Ô ẩn chống bot */}
                <input className="c-sr" tabIndex={-1} autoComplete="off" aria-hidden value={f.website} onChange={set("website")} name="website" />
                {fail && <p className="c-err" role="alert">{fail}</p>}
                <button type="submit" className="c-btn" disabled={sending}>{sending ? t("Đang gửi…") : t("Gửi liên hệ")}</button>
              </form>
            )}
          </section>
        </div>

        <div className="c-contact-map">
          {stores.length > 0 ? (
            <MapContainer center={[stores[0].lat, stores[0].lng]} zoom={13} scrollWheelZoom={false} className="c-map">
              <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <FitStores stores={stores} focus={focus} />
              {stores.map((s) => (
                <Marker key={s.id} position={[s.lat, s.lng]} title={s.name}>
                  <Popup>
                    <div className="c-map-pop">
                      <strong>{s.name}</strong>
                      {s.address && <span>{s.address}</span>}
                      {hours(s) && <span>{t("Mở cửa")} {hours(s)}</span>}
                      <a href={directions(s)} target="_blank" rel="noopener noreferrer">{t("Chỉ đường")}</a>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          ) : (
            <div className="c-map c-noimg">{info ? t("Chưa có vị trí chi nhánh") : t("Đang tải bản đồ…")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
