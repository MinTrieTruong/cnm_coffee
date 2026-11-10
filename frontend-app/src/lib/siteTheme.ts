import { useEffect, useState, useSyncExternalStore } from "react";

/** Màu trang khách do chủ chuỗi chọn ở Website › Giao diện (GET /api/site-info → theme) */
export type SiteTheme = {
  preset: string;
  primary: string;
  accent: string;
  defaultMode: "light" | "dark" | "auto";
  allowToggle: boolean;
  /** Chủ đề dịp lễ đang bật (lib/occasions.ts); until = ngày cuối còn hiện (YYYY-MM-DD), null = tới khi tắt tay */
  occasion?: { id: string; until: string | null; effects: boolean } | null;
  /** Hiện thông tin dinh dưỡng (nhãn, bảng ước tính, bộ lọc ăn kiêng) cho khách */
  showNutrition?: boolean;
  /** Hiện khối "Hợp thời tiết hôm nay" trên trang chủ */
  showWeatherPicks?: boolean;
};
export type ColorMode = "light" | "dark";

export const DEFAULT_THEME: SiteTheme = { preset: "espresso-kem", primary: "#4a2c1d", accent: "#c08a4b", defaultMode: "light", allowToggle: true, occasion: null, showNutrition: true, showWeatherPicks: true };

/** Bộ màu gợi ý — đã kiểm tra tương phản; tránh trùng nhận diện các chuỗi lớn */
export const PRESETS: { id: string; name: string; note: string; primary: string; accent: string }[] = [
  { id: "espresso-kem", name: "Espresso & Kem", note: "Nâu espresso, vàng đồng, nền kem — mặc định", primary: "#4a2c1d", accent: "#c08a4b" },
  { id: "gach-bong", name: "Gạch bông", note: "Xanh men gạch bông, vàng nghệ", primary: "#1e5a5f", accent: "#e0a531" },
  { id: "rang-moc", name: "Rang mộc", note: "Nâu hạt rang, vàng mật ong", primary: "#5b3a24", accent: "#d9a441" },
  { id: "che-xanh", name: "Chè xanh", note: "Xanh rêu trầm, vàng chanh", primary: "#3d5a3a", accent: "#d8c04a" },
  { id: "muc-tim", name: "Mực tím", note: "Tím mực học trò, cam đào", primary: "#4a3a6b", accent: "#ec9a5c" },
  { id: "dat-sa", name: "Đất sa", note: "Nâu đỏ đất bazan, kem bơ", primary: "#7a3b2e", accent: "#e8b964" },
];

/* ── Toán màu ── */
type RGB = [number, number, number];
const hexToRgb = (h: string): RGB => {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (c: RGB) => "#" + c.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0")).join("");
export const mix = (a: string, b: string, t: number) => {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
};
const lum = (h: string) => {
  const c = hexToRgb(h).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
/** Đẩy màu về phía `toward` (đen/trắng) cho tới khi đạt tương phản `min` với nền */
function ensure(color: string, bg: string, min: number, toward: string) {
  let c = color;
  for (let i = 1; i <= 20 && contrast(c, bg) < min; i++) c = mix(color, toward, i * 0.05);
  return c;
}

/* Nền trung tính — trùng customer-tokens.css (sáng) và khối dark trong đó */
export const NEUTRAL = {
  light: { paper: "#faf6f0", surface: "#ffffff", ink: "#2b1d14" },
  dark: { paper: "#16100c", surface: "#1d1510", ink: "#f1e8dc" },
};

/** Biến CSS phụ thuộc màu chủ đạo / màu nhấn cho từng chế độ (nền trung tính nằm trong CSS) */
export function paletteVars(theme: Pick<SiteTheme, "primary" | "accent">, mode: ColorMode): Record<string, string> {
  const n = NEUTRAL[mode];
  const dark = mode === "dark";
  // Màu chủ đạo dùng cả làm chữ (giá, liên kết) trên nền giấy lẫn làm nền nút → đủ 4.5:1 với giấy
  const primary = dark ? ensure(theme.primary, n.paper, 4.6, "#ffffff") : ensure(theme.primary, n.paper, 4.6, "#000000");
  const onPrimary = contrast("#fffaf3", primary) >= 4.5 ? "#fffaf3" : "#16100c";
  const accent = theme.accent;
  const onAccent = contrast("#2b1d14", accent) >= 4.5 ? "#2b1d14" : "#fffaf3";
  // Thanh điều hướng (nền màu lớn): ở chế độ tối dùng bản đậm của màu gốc + chữ sáng, thay vì màu đã làm sáng cho chữ
  const bar = dark ? ensure(mix(theme.primary, "#000000", 0.3), "#fffaf3", 4.6, "#000000") : primary;
  const onBar = dark ? "#fffaf3" : onPrimary;
  const [r, g, b] = hexToRgb(primary);
  return {
    "--c-primary": primary,
    "--c-primary-dark": dark ? mix(primary, "#ffffff", 0.18) : mix(primary, "#000000", 0.25),
    "--c-on-primary": onPrimary,
    "--c-bar": bar,
    "--c-on-bar": onBar,
    "--c-accent": accent,
    // Màu nhấn dùng làm CHỮ (eyebrow, từ nghiêng nhấn trong tiêu đề): đẩy cho đủ 4.5:1 với nền
    "--c-accent-ink": ensure(accent, n.paper, 4.6, dark ? "#ffffff" : "#000000"),
    "--c-on-accent": onAccent,
    // Footer: màu chủ đạo pha đen thật đậm (sáng) / gần nền (tối)
    "--c-footer": dark ? mix(theme.primary, "#000000", 0.82) : mix(theme.primary, "#000000", 0.55),
    "--accent-rgb": `${r}, ${g}, ${b}`,
    "--accent-soft": mix(primary, n.surface, 0.85),
    "--accent-soft-2": mix(primary, n.surface, 0.75),
  };
}

/* ── Chế độ sáng / tối của khách ── */
const MODE_KEY = "c-mode";
const listeners = new Set<() => void>();
// Trình duyệt chặn localStorage (chế độ riêng tư) → vẫn đổi được trong phiên
let memMode: ColorMode | null = null;
function readStored(): ColorMode | null {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === "dark" || v === "light" ? v : memMode;
  } catch {
    return memMode;
  }
}
const systemDark = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;

/** Chế độ đang dùng: khách đã chọn → theo khách; chưa chọn → mặc định của quán (auto = theo máy) */
export function useColorMode(theme: SiteTheme | null) {
  const stored = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readStored,
    () => null,
  );
  const [sys, setSys] = useState(systemDark);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const on = () => setSys(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const t = theme ?? DEFAULT_THEME;
  const fallback: ColorMode = t.defaultMode === "auto" ? (sys ? "dark" : "light") : t.defaultMode;
  const mode: ColorMode = t.allowToggle && stored ? stored : fallback;
  useEffect(() => {
    document.documentElement.dataset.cMode = mode;
  }, [mode]);
  // Ghi nhớ mặc định của quán để script đầu index.html dùng ở lần tải sau (khách chưa tự chọn)
  useEffect(() => {
    if (!theme) return;
    try {
      localStorage.setItem("c-mode-site", fallback);
    } catch {
      /* bỏ qua */
    }
  }, [theme, fallback]);
  const setMode = (m: ColorMode) => {
    memMode = m;
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* chế độ riêng tư: giữ trong memMode */
    }
    document.documentElement.dataset.cMode = m;
    listeners.forEach((l) => l());
  };
  return { mode, setMode, canToggle: t.allowToggle };
}
