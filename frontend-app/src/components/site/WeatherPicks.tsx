/**
 * Trang chủ › "Hợp thời tiết hôm nay": thời tiết ở chi nhánh đang chọn + câu dẫn + 4 món gợi ý (lý do, bản đá / nóng).
 * Bấm món → trang chi tiết chọn sẵn bản đá / nóng (?temp=). Không có thời tiết → "Gợi ý buổi sáng / chiều / tối".
 * API: GET /api/home/weather-picks?storeId= (backend routes/home.ts). Quán tắt khối này hoặc lỗi → không hiện gì.
 */
import { useEffect, useState } from "react";
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSun, Moon, Sun, type LucideIcon } from "lucide-react";
import { api, type Product } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { ProductCard } from "./parts";
import "../../styles/weather.css";

type Text = { vi: string; en: string };
type Weather = { tempC: number; feelsC: number; humidity: number; raining: boolean; condition: "hot" | "warm" | "cool" | "rain"; label: Text; icon: string; isDay: boolean };
type Pick = Product & { reason: Text; suggestTemp: "ICED" | "HOT" | null };
type Resp = { hidden?: boolean; store: { id: number; name: string }; weather: Weather | null; headline: Text; source: "AI" | "TEMPLATE"; products: Pick[] };

const ICONS: Record<string, LucideIcon> = {
  sun: Sun, "cloud-sun": CloudSun, cloud: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, storm: CloudLightning, moon: Moon, "cloud-moon": CloudMoon,
};

const daypart = (h: number) => (h >= 5 && h < 11 ? "Gợi ý buổi sáng" : h >= 11 && h < 14 ? "Gợi ý buổi trưa" : h >= 14 && h < 17 ? "Gợi ý buổi chiều" : "Gợi ý buổi tối");

export function WeatherPicks({ storeId }: { storeId: number | null }) {
  const { t, lang } = useLang();
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let alive = true;
    api<Resp>(`/api/home/weather-picks${storeId ? `?storeId=${storeId}` : ""}`)
      .then((r) => alive && setData(r))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [storeId]);

  if (!data || data.hidden || !data.products?.length) return null;
  const w = data.weather;
  const Icon = w ? ICONS[w.icon] ?? Cloud : null;
  const pick = (x: Text) => (lang === "en" ? x.en : x.vi);
  const store = data.store.name.replace(/^TD Coffee\s*[-–·:]\s*/i, "");

  return (
    <section className="c-wrap c-sec c-sec-tight c-wx" aria-labelledby="c-wx-h">
      <div className="c-wx-head">
        <div className="c-wx-now">
          {w && Icon ? (
            <>
              <span className={`c-wx-icon is-${w.condition}`} aria-hidden><Icon size={26} strokeWidth={1.8} /></span>
              <span className="c-wx-temp">{w.tempC}°C</span>
              <span className="c-wx-meta">
                {pick(w.label)} · {t("cảm giác {n}°C", { n: w.feelsC })}
                <small>{store}</small>
              </span>
            </>
          ) : (
            <span className="c-wx-meta">
              {t(daypart(new Date().getHours()))}
              <small>{store}</small>
            </span>
          )}
        </div>
        <div className="c-wx-copy">
          <h2 id="c-wx-h" className="c-wx-title">{t("Hợp thời tiết hôm nay")}</h2>
          <p className="c-wx-line">{pick(data.headline)}</p>
        </div>
      </div>
      <div className="c-wx-row">
        {data.products.map((p) => (
          <ProductCard
            key={p.id}
            p={p}
            to={`/product/${p.id}${p.suggestTemp ? `?temp=${p.suggestTemp}` : ""}`}
            line={
              <>
                {p.suggestTemp && <span className={`c-wx-tag is-${p.suggestTemp.toLowerCase()}`}>{t(p.suggestTemp === "ICED" ? "Bản đá" : "Bản nóng")}</span>}
                <span className="c-wx-reason">{pick(p.reason)}</span>
              </>
            }
          />
        ))}
      </div>
    </section>
  );
}
