import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { clearCart, getCart } from "./cart";
import { getTableId, setTableId } from "./session";

/** Chi nhánh khách đang đặt (mang về / giao hàng). Ngồi tại bàn thì chi nhánh theo bàn. */
const STORE_KEY = "cmn_store_id";
const CHANGE_EVENT = "cmn-store-change";

export type PublicStore = {
  id: number;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  openTime: string | null;
  closeTime: string | null;
  distanceKm?: number;
};

export function getStoreId(): number | null {
  const n = Number(localStorage.getItem(STORE_KEY));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function saveStoreId(id: number | null) {
  if (id == null) localStorage.removeItem(STORE_KEY);
  else localStorage.setItem(STORE_KEY, String(id));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Thêm `store=` vào đường dẫn API của khách (menu, trang chủ, toạ độ quán) */
export function withStore(path: string, storeId: number | null) {
  if (storeId == null) return path;
  return `${path}${path.includes("?") ? "&" : "?"}store=${storeId}`;
}

let storesCache: Promise<PublicStore[]> | null = null;
function loadStores() {
  storesCache ??= api<PublicStore[]>("/api/stores").catch((e) => {
    storesCache = null;
    throw e;
  });
  return storesCache;
}

/**
 * Chi nhánh phục vụ khách:
 * - Đang ngồi bàn (quét QR): khoá theo chi nhánh của bàn.
 * - Mang về / giao hàng: chi nhánh khách chọn; chuỗi chỉ có 1 chi nhánh thì tự chọn.
 */
export function useCustomerStore() {
  const tableId = getTableId();
  const [stores, setStores] = useState<PublicStore[]>([]);
  const [storeId, setStoreIdState] = useState<number | null>(getStoreId);
  const [tableStore, setTableStore] = useState<PublicStore | null>(null);
  const [tableName, setTableName] = useState<string | null>(null);
  const [, rerender] = useState(0);

  useEffect(() => {
    const sync = () => setStoreIdState(getStoreId());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadStores()
      .then((list) => {
        if (cancelled) return;
        setStores(list);
        const cur = getStoreId();
        if (cur != null && !list.some((s) => s.id === cur)) saveStoreId(null);
        if ((cur == null || !list.some((s) => s.id === cur)) && list.length === 1) saveStoreId(list[0].id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!tableId) {
      setTableStore(null);
      setTableName(null);
      return;
    }
    let cancelled = false;
    api<{ tableName: string; store: PublicStore }>(`/api/tables/${tableId}/store`)
      .then((r) => {
        if (cancelled) return;
        setTableStore(r.store);
        setTableName(r.tableName);
        if (getStoreId() !== r.store.id) saveStoreId(r.store.id);
      })
      .catch((e) => {
        // Mã QR trỏ tới bàn đã xoá → bỏ gán bàn để khách chọn lại
        if (cancelled || !(e instanceof Error) || !/bàn/i.test(e.message)) return;
        setTableId(null);
        setTableStore(null);
        setTableName(null);
        rerender((n) => n + 1);
      });
    return () => {
      cancelled = true;
    };
  }, [tableId]);

  /** Đổi chi nhánh. Giỏ đang có món thì hỏi trước vì thực đơn từng chi nhánh có thể khác. */
  const setStore = useCallback((id: number) => {
    if (id === getStoreId()) return true;
    if (getCart().length > 0 && !window.confirm("Đổi chi nhánh sẽ xoá các món trong giỏ hàng. Tiếp tục?")) return false;
    clearCart();
    saveStoreId(id);
    return true;
  }, []);

  const effectiveId = tableStore?.id ?? storeId;
  return {
    storeId: effectiveId,
    store: tableStore ?? stores.find((s) => s.id === effectiveId) ?? null,
    stores,
    /** Đang ngồi tại bàn → không đổi chi nhánh được */
    locked: !!tableStore,
    tableId,
    /** Tên bàn hiển thị cho khách (vd "Bàn 3"), khác với id trong CSDL */
    tableName,
    setStore,
  };
}
