/**
 * lib/weather.ts — Thời tiết hiện tại ở chi nhánh (Open-Meteo: miễn phí, không cần khóa) theo Store.lat / lng.
 * Timeout 4 giây, cache 30 phút theo chi nhánh (bộ nhớ). Lỗi / không có mạng → null (khối gợi ý vẫn hiện theo giờ).
 */
import { prisma } from "../db.js";

export type Condition = "hot" | "warm" | "cool" | "rain";
export type Weather = {
  tempC: number;
  feelsC: number;
  humidity: number;
  raining: boolean;
  condition: Condition;
  /** Mô tả theo mã thời tiết WMO */
  label: { vi: string; en: string };
  /** sun | cloud-sun | cloud | fog | drizzle | rain | storm (giao diện chọn icon) */
  icon: string;
  isDay: boolean;
};

const TTL_MS = 30 * 60_000;
const cache = new Map<number, { at: number; value: Weather | null }>();

/** Mã thời tiết WMO → mô tả + icon */
function describe(code: number): { vi: string; en: string; icon: string; wet: boolean } {
  if (code === 0) return { vi: "Trời quang", en: "Clear", icon: "sun", wet: false };
  if (code === 1) return { vi: "Nắng", en: "Sunny", icon: "sun", wet: false };
  if (code === 2) return { vi: "Ít mây", en: "Partly cloudy", icon: "cloud-sun", wet: false };
  if (code === 3) return { vi: "Nhiều mây", en: "Cloudy", icon: "cloud", wet: false };
  if (code === 45 || code === 48) return { vi: "Sương mù", en: "Fog", icon: "fog", wet: false };
  if (code >= 51 && code <= 57) return { vi: "Mưa phùn", en: "Drizzle", icon: "drizzle", wet: true };
  if (code >= 61 && code <= 67) return { vi: "Mưa", en: "Rain", icon: "rain", wet: true };
  if (code >= 80 && code <= 82) return { vi: "Mưa rào", en: "Showers", icon: "rain", wet: true };
  if (code >= 95) return { vi: "Dông", en: "Thunderstorm", icon: "storm", wet: true };
  return { vi: "Nhiều mây", en: "Cloudy", icon: "cloud", wet: false };
}

/** Chuẩn hoá số liệu Open-Meteo → Weather (tách riêng để kiểm thử giả lập) */
export function normalizeWeather(c: { temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; precipitation: number; weather_code: number; is_day: number }): Weather {
  const d = describe(c.weather_code);
  const raining = c.precipitation > 0.2 || d.wet;
  const feels = c.apparent_temperature;
  return {
    tempC: Math.round(c.temperature_2m),
    feelsC: Math.round(feels),
    humidity: Math.round(c.relative_humidity_2m),
    raining,
    // hot: cảm giác ≥ 32 · warm: 26–32 · cool: < 26 · rain: có mưa
    condition: raining ? "rain" : feels >= 32 ? "hot" : feels >= 26 ? "warm" : "cool",
    label: { vi: d.vi, en: d.en },
    icon: c.is_day ? d.icon : d.icon === "sun" ? "moon" : d.icon === "cloud-sun" ? "cloud-moon" : d.icon,
    isDay: c.is_day === 1,
  };
}

export async function getWeather(storeId: number): Promise<Weather | null> {
  const hit = cache.get(storeId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { lat: true, lng: true } });
  if (!store) return null;
  let value: Weather | null = null;
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${store.lat}&longitude=${store.lng}` +
      "&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,is_day&timezone=Asia%2FHo_Chi_Minh";
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const j = (await res.json()) as { current?: Parameters<typeof normalizeWeather>[0] };
      if (j.current && typeof j.current.temperature_2m === "number") value = normalizeWeather(j.current);
    }
  } catch {
    value = null;
  }
  // Lỗi cũng cache (ngắn hơn) để không gọi lại liên tục khi mất mạng
  cache.set(storeId, { at: value ? Date.now() : Date.now() - TTL_MS + 5 * 60_000, value });
  return value;
}
