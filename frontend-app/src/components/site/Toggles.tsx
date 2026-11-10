import { Moon, Sun } from "lucide-react";
import { useLang } from "../../lib/i18n";
import type { ColorMode } from "../../lib/siteTheme";

/** Nút đổi sáng/tối + VI/EN (header máy tính, chân trang) */
export function Toggles({ mode, setMode, canToggle }: { mode: ColorMode; setMode: (m: ColorMode) => void; canToggle: boolean }) {
  const { lang, setLang, t } = useLang();
  const dark = mode === "dark";
  return (
    <div className="c-toggles">
      {canToggle && (
        <button
          type="button"
          className="c-toggle"
          onClick={() => setMode(dark ? "light" : "dark")}
          aria-pressed={dark}
          aria-label={dark ? t("Chuyển sang giao diện sáng") : t("Chuyển sang giao diện tối")}
          title={dark ? t("Giao diện sáng") : t("Giao diện tối")}
        >
          {dark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
        </button>
      )}
      <div className="c-lang" role="group" aria-label={t("Ngôn ngữ")}>
        <button type="button" aria-pressed={lang === "vi"} onClick={() => setLang("vi")} lang="vi" title="Tiếng Việt">VI</button>
        <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")} lang="en" title="English">EN</button>
      </div>
    </div>
  );
}
