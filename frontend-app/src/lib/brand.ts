/**
 * lib/brand.ts — Trang câu chuyện thương hiệu (/about) và hồ sơ chi nhánh (/stores, /stores/:id) phía khách.
 * Kiểu dữ liệu + mô tả trường dùng chung với backend: @shared/brand (backend-node/src/shared/brand.ts).
 */
import { useEffect, useState } from "react";
import { mergeEn, sectionDef, type BrandKey, type BrandSection, type StoreProfile } from "@shared/brand";
import { api } from "./api";
import { getStaffInfo, getStaffToken } from "./staffApi";

/** GET /api/site/stats — số liệu tự động (chi nhánh, món, ly đã bán, điểm TB) */
export type SiteStats = { stores: number; products: number; cups: number; rating: number | null; reviews: number };
export type BrandProduct = { id: number; name: string; imageUrl: string | null; sellPrice: number; discountPercent: number | null };
export type BrandReview = { rating: number; comment: string | null; storeName: string; name: string | null; avatarUrl: string | null };
export type StoreCard = {
  id: number; name: string; address: string | null; phone: string | null; lat: number; lng: number; openTime: string | null; closeTime: string | null;
  coverImage: StoreProfile["coverImage"] | null; tagline: string | null; openedYear: number | null; amenities: string[] | null;
};
export type BrandRefs = { products: Record<string, BrandProduct>; reviews: Record<string, BrandReview>; stores: StoreCard[]; stats: SiteStats | null };
export type BrandPage = { sections: BrandSection[]; refs: BrandRefs };

/** Bản nháp màn quản trị gửi sang tab xem trước (/about?preview=1) — chưa lưu vào CSDL */
export const PREVIEW_KEY = "brand-preview";
export type PreviewDraft = { at: number; sections: { key: BrandKey; isVisible: boolean; data: unknown; dataEn: unknown }[] };

export function readPreview(): PreviewDraft | null {
  try {
    const raw = localStorage.getItem(PREVIEW_KEY);
    return raw ? (JSON.parse(raw) as PreviewDraft) : null;
  } catch {
    return null;
  }
}

/** Trang câu chuyện theo ngôn ngữ; preview = dùng bản nháp của màn quản trị thay cho nội dung đã lưu (dữ liệu tham chiếu vẫn lấy từ API) */
export function useBrandPage(lang: "vi" | "en", preview: boolean) {
  const [page, setPage] = useState<BrandPage | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let off = false;
    api<BrandPage>(`/api/site/brand${lang === "en" ? "?lang=en" : ""}`)
      .then((p) => {
        if (off) return;
        const draft = preview ? readPreview() : null;
        if (draft) {
          p = {
            ...p,
            sections: draft.sections
              .filter((s) => s.isVisible && sectionDef(s.key))
              .map((s) => ({ key: s.key, data: (lang === "en" && s.dataEn ? mergeEn(sectionDef(s.key)!.fields, s.data, s.dataEn) : s.data) as BrandSection["data"] })),
          };
        }
        setPage(p);
      })
      .catch(() => !off && setError(true));
    return () => {
      off = true;
    };
  }, [lang, preview]);
  return { page, error };
}

/** Người đang xem là Chủ chuỗi đã đăng nhập khu nhân sự trên cùng trình duyệt → hiện thanh "Sửa trang" (API vẫn tự kiểm quyền) */
export function useOwnerEditing() {
  const [owner, setOwner] = useState(false);
  useEffect(() => {
    setOwner(!!getStaffToken() && getStaffInfo()?.role === "Owner");
  }, []);
  return owner;
}

/** Đường dẫn mở đúng mục / đúng ô trong màn quản trị */
export const brandEditHref = (section: BrandKey, field?: string) => `/app/website/brand?section=${section}${field ? `&field=${encodeURIComponent(field)}` : ""}`;
export const storeEditHref = (storeId: number, field?: string) => `/app/settings/stores/${storeId}?tab=profile${field ? `&field=${encodeURIComponent(field)}` : ""}`;

/* ─────────── Giờ mở cửa ─────────── */

const toMin = (hhmm: string | null) => {
  const m = hhmm ? /^(\d{1,2}):(\d{2})/.exec(hhmm) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
/** Phút hiện tại theo giờ Việt Nam (khách ở múi giờ khác vẫn thấy đúng trạng thái quán) */
function vnMinutes(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return (get("hour") % 24) * 60 + get("minute");
}
export type OpenState = "open" | "closing" | "closed" | "unknown";
/** Đang mở / sắp đóng (còn ≤ 60 phút) / đã đóng; hỗ trợ quán mở qua nửa đêm */
export function openState(openTime: string | null, closeTime: string | null, now = new Date()): OpenState {
  const o = toMin(openTime), c = toMin(closeTime);
  if (o == null || c == null) return "unknown";
  const t = vnMinutes(now);
  const isOpen = o < c ? t >= o && t < c : t >= o || t < c;
  if (!isOpen) return "closed";
  const left = (c - t + 1440) % 1440;
  return left <= 60 ? "closing" : "open";
}
export const OPEN_LABEL: Record<OpenState, string> = { open: "Đang mở", closing: "Sắp đóng", closed: "Đã đóng", unknown: "" };
export const hm = (t: string | null) => (t ? t.slice(0, 5) : "");
