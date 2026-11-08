import { useEffect, useState } from "react";
import { api, type MenuResponse } from "./api";
import { useCustomerStore, withStore } from "./customerStore";

export type SiteStore = { id: number; name: string; address: string | null; phone: string | null; openTime: string | null; closeTime: string | null; lat: number; lng: number };
export type SiteInfo = {
  company: { name: string; intro: string; address: string; email: string; phone: string; hours: string };
  hotline: { value: string; display: string; href: string };
  stores: SiteStore[];
  socials: { id: number; type: "ZALO" | "MESSENGER" | "CUSTOM"; label: string; icon: string | null; href: string }[];
  theme: import("./siteTheme").SiteTheme;
  /** Quán đang bật ghi nhận hành vi khách (lib/track.ts) */
  tracking?: boolean;
};

/* Bộ nhớ đệm theo chi nhánh: header, footer, trang chủ dùng chung 1 lần gọi */
const infoCache = new Map<string, Promise<SiteInfo>>();
const menuCache = new Map<string, Promise<MenuResponse>>();

function cached<T>(map: Map<string, Promise<T>>, key: string, load: () => Promise<T>) {
  let p = map.get(key);
  if (!p) {
    p = load().catch((e) => {
      map.delete(key);
      throw e;
    });
    map.set(key, p);
  }
  return p;
}

/* Bản site-info lần trước lưu trên máy: vẽ ngay đúng màu quán / chủ đề lễ khi tải lại trang
   (không nháy màu mặc định trong lúc chờ API), rồi cập nhật khi API trả về */
const lsKey = (storeId: number | null | undefined) => `c-site-info:${storeId ?? ""}`;
function readStoredInfo(storeId: number | null | undefined): SiteInfo | null {
  try {
    const raw = localStorage.getItem(lsKey(storeId));
    return raw ? (JSON.parse(raw) as SiteInfo) : null;
  } catch {
    return null;
  }
}

/** site-info theo chi nhánh (dùng chung bộ nhớ đệm với useSiteInfo) */
export function loadSiteInfo(storeId: number | null | undefined) {
  return cached(infoCache, String(storeId ?? ""), () => api<SiteInfo>(`/api/site-info${storeId ? `?storeId=${storeId}` : ""}`));
}

/** Thông tin công ty, hotline theo chi nhánh khách chọn, danh sách chi nhánh, mạng xã hội (từ nút liên hệ) */
export function useSiteInfo() {
  const { storeId } = useCustomerStore();
  const [info, setInfo] = useState<SiteInfo | null>(() => readStoredInfo(storeId));
  useEffect(() => {
    let off = false;
    const stored = readStoredInfo(storeId);
    if (stored) setInfo(stored);
    loadSiteInfo(storeId)
      .then((d) => {
        if (off) return;
        setInfo(d);
        try {
          localStorage.setItem(lsKey(storeId), JSON.stringify(d));
        } catch {
          /* chế độ riêng tư / đầy bộ nhớ: lần sau vẫn tải từ API */
        }
      })
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [storeId]);
  return info;
}

/** Danh mục + món theo chi nhánh (ẩn món chi nhánh không bán) */
export function useMenuData() {
  const { storeId } = useCustomerStore();
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  useEffect(() => {
    let off = false;
    cached(menuCache, String(storeId ?? ""), () => api<MenuResponse>(withStore("/api/menu", storeId)))
      .then((d) => !off && setMenu(d))
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [storeId]);
  return menu;
}

/**
 * Danh mục cho menu / trang chủ: danh mục gốc có danh mục con thì hiện các con (cụ thể hơn), không thì hiện chính nó; kèm ảnh 1 món tiêu biểu */
export function useMenuCategories() {
  const menu = useMenuData();
  const all = menu?.categories ?? [];
  const products = menu?.products ?? [];
  const sort = (a: { sortOrder?: number; id: number }, b: { sortOrder?: number; id: number }) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id;
  const leaves = all.filter((c) => !c.parentId).sort(sort).flatMap((r) => {
    const kids = all.filter((x) => x.parentId === r.id).sort(sort);
    return kids.length ? kids : [r];
  });
  return leaves
    .map((c) => {
      const ids = new Set([c.id, ...all.filter((x) => x.parentId === c.id).map((x) => x.id)]);
      const list = products.filter((p) => ids.has(p.categoryId));
      // Ảnh theo thứ tự ưu tiên: ảnh danh mục → ảnh các món có ảnh (CategoryThumb thử lần lượt nếu ảnh lỗi)
      const images = [...new Set([c.imageUrl, ...list.map((p) => p.imageUrl)].filter((u): u is string => !!u))];
      return { id: c.id, name: c.name, images, count: list.length };
    })
    .filter((c) => c.count > 0);
}

/** Làm tròn xuống hàng nghìn cho số lớn hiện kèm dấu "+" (55.033 → 55.000) */
export const floorThousand = (n: number) => Math.floor(n / 1000) * 1000;

export const formatVnd = (n: number) => new Intl.NumberFormat("vi-VN").format(n) + "đ";
