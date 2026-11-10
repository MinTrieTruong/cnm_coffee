/**
 * Trang chi tiết món › "Dinh dưỡng ước tính": kcal, caffeine, đường, béo, đạm theo size + mức đường đang chọn,
 * thanh so với khuyến nghị một ngày, gợi ý giảm (size S / đường 50%), dị ứng, câu lưu ý.
 * Số liệu: GET /api/menu/:id/nutrition (tính từ công thức). Quán tắt hiển thị / chưa đủ dữ liệu → ẩn hoặc báo.
 */
import { useLang } from "../../lib/i18n";
import { ALLERGEN_TEXT, adjustForSugar, useNutrition } from "../../lib/nutrition";

const fmt = (n: number, d = 0) => n.toLocaleString("vi-VN", { maximumFractionDigits: d });

export function NutritionPanel({ productId, size, sugarPct }: { productId: number; size: string; sugarPct: number }) {
  const { t } = useLang();
  const data = useNutrition(productId);
  if (!data || !data.sizes.length) return null;
  const raw = data.sizes.find((s) => s.size === size) ?? data.sizes.find((s) => s.size === "M") ?? data.sizes[0];
  const allergens = (raw.allergens ?? []).map((a) => t(ALLERGEN_TEXT[a]));

  if (!raw.complete) {
    return (
      <section className="c-nut" aria-labelledby="c-nut-h">
        <h3 id="c-nut-h">{t("Dinh dưỡng ước tính")}</h3>
        <p className="c-nut-missing">{t("Quán đang cập nhật thông tin dinh dưỡng cho món này.")}</p>
        {allergens.length > 0 && <p className="c-nut-allergy"><b>{t("Có chứa:")}</b> {allergens.join(", ")}</p>}
        <p className="c-nut-note">{t(data.disclaimer)}</p>
      </section>
    );
  }

  const n = adjustForSugar(raw, sugarPct);
  const th = data.thresholds;
  // Gợi ý giảm: size S + đường 50% (món có size, đồ uống) — chỉ hiện khi giảm được ≥ 15%
  const small = data.sizes.find((s) => s.size === "S");
  const lighter = small && raw.size !== "-" ? adjustForSugar(small, Math.min(sugarPct, 50)) : null;
  const cut = lighter ? { kcal: n.kcal - lighter.kcal, sugar: Math.round((n.sugarG - lighter.sugarG) * 10) / 10 } : null;
  const showTip = !!cut && n.kcal > 0 && (cut.kcal / n.kcal >= 0.15 || (n.sugarG > 0 && cut.sugar / n.sugarG >= 0.15)) && (raw.size !== "S" || sugarPct > 50);

  const bar = (label: string, v: number, max: number, unit: string, high: number) => (
    <div className="c-nut-bar">
      <span>{label}</span>
      <span className="c-nut-track" aria-hidden><span className={v >= high ? "c-nut-fill is-high" : "c-nut-fill"} style={{ width: `${Math.min(100, (v / max) * 100)}%` }} /></span>
      <small>{fmt(v, 1)}/{max} {unit}</small>
    </div>
  );
  const cell = (v: string, label: string) => (
    <div className="c-nut-cell"><b>{v}</b><span>{label}</span></div>
  );

  return (
    <section className="c-nut" aria-labelledby="c-nut-h">
      <h3 id="c-nut-h">{t("Dinh dưỡng ước tính")}</h3>
      <p className="c-nut-sub">
        {raw.size === "-" ? t("1 phần") : t("Size {s}, đường {p}%", { s: raw.size, p: sugarPct })}
        {" · "}{t("đổi size / lượng đường ở trên, số tự cập nhật")}
      </p>
      <div className="c-nut-grid">
        {cell(fmt(n.kcal), "kcal")}
        {cell(`${fmt(n.caffeineMg)} mg`, t("caffeine"))}
        {cell(`${fmt(n.sugarG, 1)} g`, t("đường"))}
        {cell(`${fmt(n.fatG, 1)} g`, t("chất béo"))}
        {cell(`${fmt(n.proteinG, 1)} g`, t("chất đạm"))}
      </div>
      <div className="c-nut-bars" aria-label={t("So với khuyến nghị một ngày")}>
        {bar(t("Caffeine"), n.caffeineMg, th.caffeine.dailyMax, "mg", th.caffeine.high)}
        {bar(t("Đường"), n.sugarG, th.sugar.dailyMax, "g", th.sugar.high)}
        {bar(t("Năng lượng"), n.kcal, th.kcalDaily, "kcal", th.kcalDaily * 0.25)}
      </div>
      {showTip && cut && (
        <p className="c-nut-tip">
          {t("Chọn size S, đường 50% giảm {k} kcal / {g} g đường.", { k: fmt(cut.kcal), g: fmt(cut.sugar, 1) })}
        </p>
      )}
      {allergens.length > 0 && <p className="c-nut-allergy"><b>{t("Có chứa:")}</b> {allergens.join(", ")}</p>}
      <p className="c-nut-note">
        {t("Khuyến nghị: caffeine ≤ 400 mg / ngày (FDA), đường tự do ≤ 25 g / ngày (WHO).")} {t(data.disclaimer)}
      </p>
    </section>
  );
}

