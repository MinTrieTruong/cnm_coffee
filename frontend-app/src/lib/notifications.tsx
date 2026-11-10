/**
 * Trung tâm thông báo phía client — một Provider đặt trong AppShell, chuông / trang "Thông báo" đọc chung.
 *
 * - Tải hộp thư (GET /api/notifications) + thông báo QUAN TRỌNG chưa xác nhận (GET /api/notifications/unread)
 * - Socket "notify:new" (phòng staff_<id>, kết nối dùng chung): thêm vào đầu danh sách, tăng badge,
 *   thông báo thường → thẻ nổi vài giây; quan trọng → hộp thoại phải bấm "Đã hiểu"
 * - Tab đang ẩn → thông báo trình duyệt (Notification API) nếu người dùng đã bật
 * - "notify:recalled": quản lý thu hồi → gỡ khỏi danh sách
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { staffApi } from "./staffApi";
import { acquireSocket } from "./sharedSocket";
import { ensureStaffManifest, needsInstallForPush, pushSupported, subscribePush, unsubscribePush } from "./push";

export type AppNotification = {
  id: number;
  type: string;
  severity: "NORMAL" | "IMPORTANT";
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  readAt: string | null;
  sender: { fullName: string } | null;
  storeName: string | null;
};

type Ctx = {
  items: AppNotification[];
  unread: number;
  hasMore: boolean;
  loading: boolean;
  loadMore: () => Promise<void>;
  markRead: (id: number) => void;
  markAllRead: () => void;
  /** Thẻ nổi đang hiện (thông báo thường vừa tới) */
  toasts: AppNotification[];
  dismissToast: (id: number) => void;
  /** Thông báo quan trọng chưa xác nhận — hộp thoại hiện cái đầu tiên */
  important: AppNotification[];
  browser: BrowserNotifyState;
  /** Thiết bị đã đăng ký Web Push — nhận cả khi đóng tab */
  pushActive: boolean;
  enableBrowser: () => Promise<void>;
  disableBrowser: () => Promise<void>;
};

/** install = iPhone/iPad phải "Thêm vào MH chính" mới có thông báo */
export type BrowserNotifyState = "unsupported" | "install" | "default" | "denied" | "on" | "off";

const NotificationContext = createContext<Ctx | null>(null);
const BROWSER_KEY = "td.notify.browser";
const TOAST_MS = 6000;

function browserState(): BrowserNotifyState {
  if (typeof window !== "undefined" && needsInstallForPush()) return "install";
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "default") return "default";
  try {
    return localStorage.getItem(BROWSER_KEY) === "0" ? "off" : "on";
  } catch {
    return "on";
  }
}

export function NotificationProvider({ staffId, children }: { staffId: number | undefined; children: ReactNode }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const [important, setImportant] = useState<AppNotification[]>([]);
  const [browser, setBrowser] = useState<BrowserNotifyState>(browserState);
  const [pushActive, setPushActive] = useState(false);
  const browserRef = useRef(browser);
  browserRef.current = browser;
  const pushRef = useRef(pushActive);
  pushRef.current = pushActive;

  // Khu nhân sự: cho phép cài như ứng dụng; đã cho phép thông báo → đồng bộ đăng ký push với tài khoản hiện tại
  useEffect(() => {
    if (!staffId) return;
    ensureStaffManifest();
    if (browserState() === "on" && pushSupported()) void subscribePush().then(setPushActive);
  }, [staffId]);
  // Bản mới nhất cho các hàm xử lý sự kiện (tránh setState lồng trong updater)
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const importantRef = useRef(important);
  importantRef.current = important;

  const load = useCallback(async () => {
    try {
      const [inbox, pending] = await Promise.all([
        staffApi<{ items: AppNotification[]; hasMore: boolean; unread: number }>("/api/notifications?limit=20"),
        staffApi<{ unread: number; important: AppNotification[] }>("/api/notifications/unread"),
      ]);
      setItems(inbox.items);
      setHasMore(inbox.hasMore);
      setUnread(inbox.unread);
      setImportant(pending.important);
    } catch {
      /* thông báo là phụ — lỗi mạng thì thử lại khi kết nối lại */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!staffId) return;
    void load();
    const shared = acquireSocket();
    shared.join(`staff_${staffId}`);
    const onNew = (n: AppNotification) => {
      if (itemsRef.current.some((y) => y.id === n.id)) return;
      setItems((x) => (x.some((y) => y.id === n.id) ? x : [n, ...x]));
      setUnread((u) => u + 1);
      if (n.severity === "IMPORTANT") setImportant((x) => [...x, n]);
      else setToasts((x) => [n, ...x].slice(0, 3));
      // Có Web Push thì Service Worker tự hiện khi tab ẩn — chỉ dùng Notification trực tiếp khi không có push
      if (document.visibilityState === "hidden" && browserRef.current === "on" && !pushRef.current) {
        try {
          const b = new Notification(n.title, { body: n.body ?? undefined, icon: "/logo-td-coffee.png", tag: `td-${n.id}` });
          b.onclick = () => {
            window.focus();
            if (n.link) window.location.assign(n.link);
            b.close();
          };
        } catch {
          /* một số trình duyệt di động chỉ cho tạo qua Service Worker */
        }
      }
    };
    const onRecalled = ({ id }: { id: number }) => {
      // Đọc từ ref, không gọi setState lồng trong updater (StrictMode chạy updater 2 lần → trừ 2)
      const hit = itemsRef.current.find((y) => y.id === id);
      const queued = importantRef.current.some((y) => y.id === id);
      if ((hit && !hit.readAt) || (!hit && queued)) setUnread((u) => Math.max(0, u - 1));
      setItems((x) => x.filter((y) => y.id !== id));
      setImportant((x) => x.filter((y) => y.id !== id));
      setToasts((x) => x.filter((y) => y.id !== id));
    };
    // Mất mạng rồi kết nối lại → tải lại để không lỡ thông báo
    let first = true;
    const onConnect = () => {
      if (first) first = false;
      else void load();
    };
    shared.socket.on("notify:new", onNew);
    shared.socket.on("notify:recalled", onRecalled);
    shared.socket.on("connect", onConnect);
    return () => {
      shared.socket.off("notify:new", onNew);
      shared.socket.off("notify:recalled", onRecalled);
      shared.socket.off("connect", onConnect);
      shared.release();
    };
  }, [staffId, load]);

  // Thẻ nổi tự tắt
  useEffect(() => {
    if (!toasts.length) return;
    const t = window.setTimeout(() => setToasts((x) => x.slice(0, -1)), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [toasts]);

  const markRead = useCallback((id: number) => {
    const it = itemsRef.current.find((y) => y.id === id);
    const inQueue = importantRef.current.some((y) => y.id === id);
    if (it?.readAt && !inQueue) return;
    const now = new Date().toISOString();
    setItems((x) => x.map((y) => (y.id === id && !y.readAt ? { ...y, readAt: now } : y)));
    if (inQueue) setImportant((x) => x.filter((y) => y.id !== id));
    // Thông báo chưa có trong trang đầu (vd quan trọng cũ) vẫn trừ badge
    if (!it?.readAt) setUnread((u) => Math.max(0, u - 1));
    void staffApi(`/api/notifications/${id}/read`, { method: "POST" }).catch(() => {});
  }, []);

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    setItems((x) => x.map((y) => (y.readAt ? y : { ...y, readAt: now })));
    setImportant([]);
    setUnread(0);
    void staffApi("/api/notifications/read-all", { method: "POST" }).catch(() => {});
  }, []);

  const loadMore = useCallback(async () => {
    const last = items[items.length - 1];
    if (!last) return;
    const r = await staffApi<{ items: AppNotification[]; hasMore: boolean }>(`/api/notifications?limit=20&before=${last.id}`);
    setItems((x) => [...x, ...r.items.filter((n) => !x.some((y) => y.id === n.id))]);
    setHasMore(r.hasMore);
  }, [items]);

  const enableBrowser = useCallback(async () => {
    if (!("Notification" in window)) return;
    const p = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    try {
      localStorage.setItem(BROWSER_KEY, "1");
    } catch {
      /* bỏ qua */
    }
    setBrowser(p === "granted" ? "on" : p === "denied" ? "denied" : "default");
    if (p === "granted") setPushActive(await subscribePush());
  }, []);

  const disableBrowser = useCallback(async () => {
    try {
      localStorage.setItem(BROWSER_KEY, "0");
    } catch {
      /* bỏ qua */
    }
    await unsubscribePush();
    setPushActive(false);
    setBrowser(browserState());
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      items,
      unread,
      hasMore,
      loading,
      loadMore,
      markRead,
      markAllRead,
      toasts,
      dismissToast: (id) => setToasts((x) => x.filter((y) => y.id !== id)),
      important,
      browser,
      pushActive,
      enableBrowser,
      disableBrowser,
    }),
    [items, unread, hasMore, loading, loadMore, markRead, markAllRead, toasts, important, browser, pushActive, enableBrowser, disableBrowser],
  );
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): Ctx {
  const c = useContext(NotificationContext);
  if (!c) throw new Error("useNotifications phải nằm trong NotificationProvider");
  return c;
}

/** "vừa xong", "5 phút", "3 giờ", "hôm qua", "12/10" */
export function timeAgo(iso: string, now = Date.now()) {
  const d = new Date(iso);
  const s = Math.max(0, (now - d.getTime()) / 1000);
  if (s < 60) return "vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút`;
  if (s < 86_400) return `${Math.floor(s / 3600)} giờ`;
  if (s < 2 * 86_400) return "hôm qua";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
