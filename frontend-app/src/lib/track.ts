/**
 * Ghi nhận hành vi khách trên web (trang quản trị "Hành vi khách"): xem màn hình bao lâu, xem món, thêm / bớt giỏ.
 *
 * - Ẩn danh: mã trình duyệt (`sessionKey`, dùng chung với thống kê tìm kiếm) + mã phiên (`visitId`, đổi khi vắng > 30 phút).
 *   Không gửi URL thô, IP hay vị trí; khách đăng nhập thì máy chủ tự lấy tài khoản từ token.
 * - Gửi gộp tối đa 30 sự kiện / lần, mỗi 10 giây; khi ẩn tab / rời trang gửi nốt (fetch keepalive, dự phòng sendBeacon).
 * - Không ghi ở khu nhân viên, khi trình duyệt đang đăng nhập nhân viên, hoặc quán tắt ghi nhận.
 * - Mọi lỗi đều nuốt im lặng — không bao giờ ảnh hưởng đặt món.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { apiBase } from "./api";
import { getStoreId } from "./customerStore";
import { getTableId, getToken } from "./session";
import { getStaffToken } from "./staffApi";
import { loadSiteInfo } from "./site";

export type TrackType = "PAGE_VIEW" | "PRODUCT_VIEW" | "ADD_TO_CART" | "REMOVE_FROM_CART" | "CART_VIEW" | "CHECKOUT_START";
/** Nguồn thêm giỏ */
export type CartSource = "card_quick" | "product_detail" | "voice" | "usual" | "combo" | "reorder";
type Payload = { screen?: string; productId?: number | null; comboId?: number | null; qty?: number; durationMs?: number; source?: CartSource };
type Event = Payload & { type: TrackType; sessionKey: string; visitId: string; storeId: number | null; device: "mobile" | "desktop"; channel: "web" | "qr_table"; at: number };

const SID_KEY = "searchSid";
const VISIT_KEY = "cmn_visit";
const VISIT_IDLE_MS = 30 * 60_000;
const BATCH = 30;
const FLUSH_MS = 10_000;

/** Mã ẩn danh của trình duyệt — đếm khách khác nhau (tìm kiếm, hành vi), ghép "tìm → xem → mua" */
export function sessionKey() {
  try {
    let v = localStorage.getItem(SID_KEY);
    if (!v) {
      v = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(SID_KEY, v);
    }
    return v;
  } catch {
    return "no-storage";
  }
}

/** Mã phiên ghé thăm: giữ nguyên khi khách còn thao tác, sinh mới sau 30 phút vắng */
export function visitId() {
  const now = Date.now();
  try {
    const cur = JSON.parse(localStorage.getItem(VISIT_KEY) ?? "null") as { id: string; lastAt: number } | null;
    const id = cur && now - cur.lastAt <= VISIT_IDLE_MS ? cur.id : `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(VISIT_KEY, JSON.stringify({ id, lastAt: now }));
    return id;
  } catch {
    return "no-storage";
  }
}

/** Khu nhân viên / nhà cung cấp — không phải khách */
const STAFF_PATHS = /^\/(app|pos|staff|supplier|admin)(\/|$)/;

let disabledByServer: boolean | null = null;
function serverFlag(): Promise<boolean> {
  if (disabledByServer != null) return Promise.resolve(!disabledByServer);
  return loadSiteInfo(getStoreId())
    .then((i) => {
      disabledByServer = i.tracking === false;
      return !disabledByServer;
    })
    .catch(() => true); // không đọc được cờ: vẫn gửi, máy chủ tự bỏ khi quán tắt ghi nhận
}

function allowedHere() {
  try {
    return !STAFF_PATHS.test(window.location.pathname) && !getStaffToken() && disabledByServer !== true;
  } catch {
    return false;
  }
}

const device = (): "mobile" | "desktop" => {
  try {
    return window.matchMedia("(max-width: 768px), (pointer: coarse)").matches ? "mobile" : "desktop";
  } catch {
    return "desktop";
  }
};

let queue: Event[] = [];
let timer: number | null = null;

function post(events: Event[], beacon: boolean) {
  const body = JSON.stringify({ events });
  const url = `${apiBase()}/api/track`;
  // fetch keepalive vẫn gửi được khi trang đóng và mang được token khách (sendBeacon không gắn header được)
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
    void fetch(url, { method: "POST", headers, body, keepalive: true }).catch(() => {});
    return;
  } catch {
    /* trình duyệt cũ không có keepalive → beacon */
  }
  try {
    if (beacon && navigator.sendBeacon) navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }));
  } catch {
    /* bỏ qua */
  }
}

/** Gửi hàng đợi. `all` = gửi hết (ẩn tab / rời trang), không thì 1 lô 30 sự kiện */
function flush(all = false) {
  try {
    if (!queue.length) return;
    if (!allowedHere()) {
      queue = [];
      return;
    }
    do post(queue.splice(0, BATCH), all);
    while (all && queue.length);
  } catch {
    /* bỏ qua */
  }
}

function ensureTimer() {
  if (timer != null) return;
  timer = window.setInterval(() => {
    void serverFlag().then((ok) => (ok ? flush() : (queue = [])));
  }, FLUSH_MS);
  const onHide = () => flush(true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") onHide();
  });
  window.addEventListener("pagehide", onHide);
}

/** Ghi 1 sự kiện (không bao giờ ném lỗi) */
export function track(type: TrackType, payload: Payload = {}) {
  try {
    if (!allowedHere()) return;
    queue.push({
      type,
      ...payload,
      sessionKey: sessionKey(),
      visitId: visitId(),
      storeId: getStoreId(),
      device: device(),
      channel: getTableId() != null ? "qr_table" : "web",
      at: Date.now(),
    });
    if (queue.length > 200) queue = queue.slice(-200);
    ensureTimer();
    // Ghi lúc đang ẩn tab / rời trang (lượt xem cuối) → gửi ngay, không chờ 10 giây
    if (queue.length >= BATCH || document.visibilityState === "hidden") flush(document.visibilityState === "hidden");
  } catch {
    /* bỏ qua */
  }
}

/** Mở trang chi tiết món: 1 lần / món / 5 phút (máy chủ chống trùng lại) */
const PV_KEY = "cmn_pv";
export function trackProductView(productId: number) {
  try {
    const now = Date.now();
    const seen = JSON.parse(sessionStorage.getItem(PV_KEY) ?? "{}") as Record<string, number>;
    if (seen[productId] && now - seen[productId] < 5 * 60_000) return;
    seen[productId] = now;
    for (const k of Object.keys(seen)) if (now - seen[k] > 5 * 60_000) delete seen[k];
    sessionStorage.setItem(PV_KEY, JSON.stringify(seen));
  } catch {
    /* không có sessionStorage: vẫn ghi, máy chủ chống trùng */
  }
  track("PRODUCT_VIEW", { productId });
}

/** Gửi kèm khi đặt đơn — máy chủ tự ghi ORDER_PLACED (không tin client). Không ghi nhận → {} */
export function trackIds(): { trackSid?: string; visitId?: string } {
  try {
    if (!allowedHere()) return {};
    return { trackSid: sessionKey(), visitId: visitId() };
  } catch {
    return {};
  }
}

/* ═══════════ Thời gian ở mỗi màn hình ═══════════ */

/** Đường dẫn → tên màn hình (không lưu URL thô — tránh lộ mã đơn). null = không tính (đăng nhập, nhân viên) */
export function screenOf(path: string): { screen: string; productId?: number } | null {
  const p = path.replace(/\/+$/, "") || "/";
  if (/^\/(login|register|welcome|staff|app|pos|supplier|admin)(\/|$)/.test(p)) return null;
  const product = /^\/product\/(\d+)$/.exec(p);
  if (product) return { screen: "product", productId: Number(product[1]) };
  const order = /^\/order\/[^/]+\/(checkout|tracking|success|grace)$/.exec(p);
  if (order) return { screen: order[1] };
  const exact: Record<string, string> = {
    "/": "home", "/menu": "menu", "/cart": "cart", "/promotions": "promotions", "/blog": "blog", "/about": "about",
    "/stores": "stores", "/contact": "contact", "/account": "account", "/privacy": "policy", "/data-deletion": "policy", "/vnpay-return": "payment_return",
  };
  if (exact[p]) return { screen: exact[p] };
  const prefix: [RegExp, string][] = [[/^\/blog\/[^/]+$/, "blog_post"], [/^\/account\/[^/]+$/, "account"], [/^\/stores\/[^/]+$/, "store_detail"], [/^\/game\/[^/]+$/, "game"], [/^\/policy\/[^/]+$/, "policy"]];
  return { screen: prefix.find(([re]) => re.test(p))?.[1] ?? "other" };
}

const IDLE_MS = 60_000;
const MAX_VIEW_MS = 30 * 60_000;
const MIN_VIEW_MS = 1000;

/**
 * Đo thời gian khách THỰC SỰ xem từng màn hình (gắn 1 lần ở PublicLayout):
 * dừng khi ẩn tab, dừng khi không cuộn / chạm / gõ quá 60 giây, tối đa 30 phút một lượt, bỏ lượt < 1 giây.
 */
export function useScreenTimer() {
  const { pathname } = useLocation();
  useEffect(() => {
    const target = screenOf(pathname);
    if (!target) return;
    let activeMs = 0;
    let segStart: number | null = document.visibilityState === "visible" ? Date.now() : null;
    let lastInput = Date.now();

    const pause = (until = Date.now()) => {
      if (segStart != null) activeMs += Math.max(0, until - segStart);
      segStart = null;
    };
    const emit = () => {
      pause();
      const ms = Math.min(activeMs, MAX_VIEW_MS);
      activeMs = 0;
      if (ms >= MIN_VIEW_MS) track("PAGE_VIEW", { screen: target.screen, productId: target.productId ?? null, durationMs: Math.round(ms) });
    };
    const onInput = () => {
      lastInput = Date.now();
      if (segStart == null && document.visibilityState === "visible") segStart = lastInput;
    };
    // Ẩn tab: ghi lượt đang xem (có thể khách không quay lại); quay lại thì tính lượt mới
    const onVisibility = () => (document.visibilityState === "hidden" ? emit() : onInput());
    const idle = window.setInterval(() => {
      // Không thao tác quá 60 giây: chỉ tính tới 60 giây sau lần thao tác cuối
      if (segStart != null && Date.now() - lastInput > IDLE_MS) pause(Math.max(segStart, lastInput + IDLE_MS));
    }, 5000);
    const opts = { passive: true, capture: true } as const;
    const inputs = ["scroll", "pointerdown", "pointermove", "keydown", "touchstart", "wheel"] as const;
    try {
      inputs.forEach((e) => window.addEventListener(e, onInput, opts));
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("pagehide", emit);
    } catch {
      /* bỏ qua */
    }
    return () => {
      window.clearInterval(idle);
      try {
        inputs.forEach((e) => window.removeEventListener(e, onInput, opts));
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pagehide", emit);
        emit();
      } catch {
        /* bỏ qua */
      }
    };
  }, [pathname]);
}
