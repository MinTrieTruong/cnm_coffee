import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, apiBase } from "../../lib/api";
import { getStoreId } from "../../lib/customerStore";
import { getTableId, getUser, isGuestMode } from "../../lib/session";
import { PopupCard, type PopupView } from "./PopupCard";

type ActivePopup = PopupView & {
  frequency: "EVERY_VISIT" | "DAILY" | "ONCE";
  href: string;
  external: boolean;
  needsLogin: boolean;
};

/** Chỉ hiện ở trang chủ, menu, khuyến mãi, tin tức — không cản giỏ hàng / thanh toán / theo dõi đơn */
const ALLOWED = (p: string) => p === "/" || p === "/menu" || p === "/promotions" || p === "/blog" || p.startsWith("/blog/");

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/* localStorage có thể bị chặn (tab ẩn danh, cài đặt trình duyệt) → mọi đọc/ghi bọc try/catch */
let storageBroken = false;
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    storageBroken = true;
    return null;
  }
}
function write(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    storageBroken = true;
  }
}

/** Đã hiện trong lần tải trang này (SPA chuyển trang không hiện lại) */
let shownThisLoad = false;

/** Lọc theo tần suất đã lưu cho từng pop up */
function due(p: ActivePopup) {
  const seen = read(`pu.seen.${p.id}`);
  if (p.frequency === "ONCE") return seen !== "once";
  if (p.frequency === "DAILY") return seen !== today();
  return true;
}

const post = (path: string) => {
  // keepalive: vẫn gửi được khi trang chuyển ngay sau khi bấm
  void fetch(`${apiBase()}${path}`, { method: "POST", keepalive: true }).catch(() => undefined);
};

/** Pop up quảng bá khi khách vào web (gắn trong PublicLayout) */
export function PopupHost() {
  const loc = useLocation();
  const nav = useNavigate();
  const [list, setList] = useState<ActivePopup[]>([]);
  const [idx, setIdx] = useState(0);
  /** Đang chạy hiệu ứng đóng (trượt xuống / mờ dần) */
  const [leaving, setLeaving] = useState(false);
  const viewed = useRef(new Set<number>());
  const touchX = useRef<number | null>(null);

  // Tải 1 lần khi khách vào trang được phép
  useEffect(() => {
    if (shownThisLoad || !ALLOWED(loc.pathname) || getTableId()) return;
    if (read("pu.snooze") === today()) return;
    shownThisLoad = true;
    const storeId = getStoreId();
    api<ActivePopup[]>(`/api/popups/active${storeId ? `?storeId=${storeId}` : ""}`)
      .then((rows) => setList(storageBroken ? rows.slice(0, 1) : rows.filter(due)))
      .catch(() => setList([]));
  }, [loc.pathname]);

  const cur = list[idx];

  // Ghi lượt hiển thị + đánh dấu tần suất khi pop up thực sự hiện
  useEffect(() => {
    if (!cur || viewed.current.has(cur.id)) return;
    viewed.current.add(cur.id);
    post(`/api/popups/${cur.id}/view`);
    if (cur.frequency === "ONCE") write(`pu.seen.${cur.id}`, "once");
    else if (cur.frequency === "DAILY") write(`pu.seen.${cur.id}`, today());
  }, [cur]);

  const close = useCallback((snooze = false) => {
    if (snooze) write("pu.snooze", today());
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setList([]);
      return;
    }
    setLeaving(true);
    window.setTimeout(() => {
      setList([]);
      setLeaving(false);
    }, 180);
  }, []);

  // Esc để đóng + khoá cuộn trang khi đang mở
  useEffect(() => {
    if (!cur) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setIdx((i) => Math.min(i + 1, list.length - 1));
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [cur, close, list.length]);

  if (!cur) return null;

  function go() {
    post(`/api/popups/${cur.id}/click`);
    close();
    if (cur.external) {
      window.open(cur.href, "_blank", "noopener,noreferrer");
      return;
    }
    const loggedIn = !isGuestMode() && !!getUser();
    if (cur.needsLogin && !loggedIn) nav(`/login?next=${encodeURIComponent(cur.href)}`);
    else nav(cur.href);
  }

  const many = list.length > 1;
  return (
    <div
      className={`pu-overlay${leaving ? " leaving" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={cur.name}
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current == null || !many) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (dx < -40) setIdx((i) => Math.min(i + 1, list.length - 1));
        if (dx > 40) setIdx((i) => Math.max(i - 1, 0));
      }}
    >
      <PopupCard
        key={cur.id}
        p={cur}
        onGo={go}
        onClose={() => close()}
        onSnooze={() => close(true)}
        pager={many ? { index: idx, total: list.length, prev: () => setIdx((i) => Math.max(i - 1, 0)), next: () => setIdx((i) => Math.min(i + 1, list.length - 1)) } : undefined}
      />
    </div>
  );
}
