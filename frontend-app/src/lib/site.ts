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

/** Thông tin công ty, hotline theo chi nhánh khách chọn, danh sách chi nhánh, mạng xã hội (từ nút liên hệ) */
export function useSiteInfo() {
  const { storeId } = useCustomerStore();
  const [info, setInfo] = useState<SiteInfo | null>(() => readStoredInfo(storeId));
  useEffect(() => {
    let off = false;
    const stored = readStoredInfo(storeId);
    if (stored) setInfo(stored);
    cached(infoCache, String(storeId ?? ""), () => api<SiteInfo>(`/api/site-info${storeId ? `?storeId=${storeId}` : ""}`))
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

export const formatVnd = (n: number) => new Intl.NumberFormat("vi-VN").format(n) + "đ";
