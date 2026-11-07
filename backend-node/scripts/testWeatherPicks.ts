/**
 * Kiểm thử "Hợp thời tiết hôm nay":  npx tsx scripts/testWeatherPicks.ts [storeId] [--ai]
 *
 * Giả lập 4 tình huống (thời tiết + giờ trong ngày), in 4 món được chọn + điểm + lý do + bản đá / nóng + câu dẫn mẫu.
 *  --ai: gọi thêm Gemini viết câu dẫn (chờ đủ, không cắt 2,5 giây như trên trang chủ).
 * Kiểm tra bằng code: buổi tối không có món caffeine cao · trời nóng ưu tiên bản đá · trời mưa ưu tiên bản nóng
 * · tối đa 2 món / danh mục · câu mẫu ≤ 120 ký tự, không emoji · Open-Meteo lỗi (weather null) vẫn ra đủ món.
 */
import "dotenv/config";
import { prisma } from "../src/db.js";
import { bizToday } from "../src/lib/bizTime.js";
import { normalizeWeather, type Weather } from "../src/lib/weather.js";
import { headline, pickProducts, templateHeadline } from "../src/lib/weatherPicks.js";
import type { Labels } from "../src/lib/nutrition/labels.js";

let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
};
const storeId = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 1);
const useAi = process.argv.includes("--ai");
const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { name: true } });
const at = (h: number) => new Date(`${bizToday()}T${String(h).padStart(2, "0")}:00:00+07:00`);
const w = (temp: number, feels: number, code: number, precip = 0, day = 1): Weather =>
  normalizeWeather({ temperature_2m: temp, apparent_temperature: feels, relative_humidity_2m: 70, precipitation: precip, weather_code: code, is_day: day });

const scenarios: { name: string; now: Date; weather: Weather | null }[] = [
  { name: "11h, 35°C nắng", now: at(11), weather: w(35, 39, 1) },
  { name: "15h, mưa 24°C", now: at(15), weather: w(24, 25, 63, 3.2) },
  { name: "7h, 27°C ít mây", now: at(7), weather: w(27, 29, 2) },
  { name: "20h, 28°C trời quang", now: at(20), weather: w(28, 31, 0, 0, 0) },
  { name: "16h, không có thời tiết (Open-Meteo lỗi)", now: at(16), weather: null },
];

const products = await prisma.product.findMany({ select: { id: true, categoryId: true, nutrition: { select: { size: true, labels: true, complete: true } } } });
const labelOf = (id: number) => {
  const n = products.find((p) => p.id === id)?.nutrition;
  const r = n?.find((x) => x.size === "M") ?? n?.find((x) => x.size === "-");
  return r?.complete ? (r.labels as Labels) : null;
};
const catOf = (id: number) => products.find((p) => p.id === id)?.categoryId;

for (const s of scenarios) {
  console.log(`\n▸ ${s.name}${s.weather ? ` → ${s.weather.condition} (${s.weather.label.vi}, cảm giác ${s.weather.feelsC}°C)` : ""}`);
  const picks = await pickProducts(storeId, s.now, s.weather);
  for (const p of picks) {
    const temp = p.suggestTemp === "ICED" ? "đá" : p.suggestTemp === "HOT" ? "nóng" : "—";
    console.log(`   ${String(p.score).padStart(4)}  ${p.name.padEnd(30)} ${temp.padEnd(5)} caffeine:${(() => { const l = labelOf(p.productId); return !l ? "?" : l.caffeine ?? "vừa"; })()}  · ${p.reason.vi}`);
  }
  const t = templateHeadline(store.name, s.weather, picks[0], s.now);
  console.log(`   Câu mẫu: ${t.vi}\n            ${t.en}`);
  if (useAi) {
    const h = await headline(storeId, store.name, s.weather, picks, s.now, 25_000);
    console.log(`   Câu ${h.source}: ${h.headline.vi}\n            ${h.headline.en}`);
  }

  check("đủ 4 món", picks.length === 4, `${picks.length}`);
  const perCat = new Map<number | undefined, number>();
  picks.forEach((p) => perCat.set(catOf(p.productId), (perCat.get(catOf(p.productId)) ?? 0) + 1));
  check("tối đa 2 món cùng danh mục", [...perCat.values()].every((n) => n <= 2));
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  check("câu mẫu ngắn, không emoji", t.vi.length <= 120 && !emoji.test(t.vi + t.en), `${t.vi.length} ký tự`);
  if (s.now.getTime() === at(20).getTime()) check("buổi tối không có món caffeine cao", picks.every((p) => labelOf(p.productId)?.caffeine !== "high"));
  const drinks = picks.filter((p) => p.suggestTemp);
  if (s.weather?.condition === "hot") check("trời nóng: đồ uống gợi ý bản đá", drinks.length > 0 && drinks.every((p) => p.suggestTemp === "ICED"));
  if (s.weather?.condition === "rain") check("trời mưa: đồ uống gợi ý bản nóng", drinks.length > 0 && drinks.every((p) => p.suggestTemp === "HOT"));
}

console.log(failed ? `\n✗ ${failed} kiểm tra không đạt` : "\n✓ Tất cả kiểm tra đạt");
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
