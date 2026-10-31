import { useSyncExternalStore } from "react";
import { EN } from "./i18n-en";

/**
 * Song ngữ trang khách. Khoá = câu tiếng Việt gốc → thiếu bản dịch thì hiện tiếng Việt, không vỡ trang.
 * Tên món, danh mục, banner, bài viết… lấy từ CSDL nên vẫn là tiếng Việt.
 * Biến: t("{n} món", { n: 3 }).
 */
export type Lang = "vi" | "en";
const KEY = "c-lang";
const listeners = new Set<() => void>();
let memLang: Lang | null = null;

function read(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "en" || v === "vi") return v;
  } catch {
    /* chế độ riêng tư */
  }
  return memLang ?? "vi";
}

export function setLang(l: Lang) {
  memLang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* giữ trong memLang */
  }
  document.documentElement.lang = l;
  listeners.forEach((f) => f());
}

export function translate(lang: Lang, s: string, vars?: Record<string, string | number>) {
  let out = lang === "en" ? EN[s] ?? s : s;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

export function useLang() {
  const lang = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => "vi" as Lang,
  );
  return {
    lang,
    setLang,
    t: (s: string, vars?: Record<string, string | number>) => translate(lang, s, vars),
    /** Định dạng ngày theo ngôn ngữ */
    date: (d: string | Date, opts?: Intl.DateTimeFormatOptions) => new Date(d).toLocaleDateString(lang === "en" ? "en-GB" : "vi-VN", opts),
  };
}
