import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Ban,
  Bell,
  BellRing,
  Bike,
  CalendarPlus,
  CheckCheck,
  CircleCheck,
  FileCheck,
  FileText,
  Lightbulb,
  ListTodo,
  Megaphone,
  Package,
  X,
  type LucideIcon,
  Send,
  ClipboardList,
} from "lucide-react";
import { timeAgo, useNotifications, type AppNotification } from "../../lib/notifications";

/** Icon + tông màu theo loại thông báo */
const TYPE_META: Record<string, { icon: LucideIcon; tone: string }> = {
  BROADCAST: { icon: Megaphone, tone: "primary" },
  MENU_SOLDOUT: { icon: Ban, tone: "red" },
  MENU_BACK: { icon: CircleCheck, tone: "green" },
  DELIVERY_NEW: { icon: Bike, tone: "blue" },
  DELIVERY_REFUND: { icon: Bike, tone: "orange" },
  HR_REQUEST: { icon: FileText, tone: "orange" },
  HR_REVIEWED: { icon: FileCheck, tone: "green" },
  LOW_STOCK: { icon: AlertTriangle, tone: "orange" },
  STOCK_REQUEST: { icon: Package, tone: "blue" },
  MENU_PROPOSAL: { icon: Lightbulb, tone: "orange" },
  TASK: { icon: ListTodo, tone: "primary" },
  SHIFT_OPEN: { icon: CalendarPlus, tone: "orange" },
  BRANCH_PROPOSAL: { icon: Send, tone: "blue" },
  INVENTORY_COUNT: { icon: ClipboardList, tone: "orange" },
};
const metaOf = (n: AppNotification) => (n.severity === "IMPORTANT" ? { icon: BellRing, tone: "red" } : TYPE_META[n.type] ?? { icon: Bell, tone: "primary" });

function NotifIcon({ n }: { n: AppNotification }) {
  const m = metaOf(n);
  return <span className={`o-kpic-icon is-sm is-${m.tone}`}><m.icon size={16} strokeWidth={1.75} aria-hidden /></span>;
}

/** Một dòng thông báo (dùng ở bảng xổ và trang "Thông báo") */
export function NotificationRow({ n, onOpen }: { n: AppNotification; onOpen: (n: AppNotification) => void }) {
  return (
    <li>
      <button type="button" className={n.readAt ? "o-notif-row" : "o-notif-row is-unread"} onClick={() => onOpen(n)}>
        <NotifIcon n={n} />
        <span className="o-notif-text">
          <span className="o-notif-title">{n.title}</span>
          {n.body && <span className="o-notif-body">{n.body}</span>}
          <span className="o-notif-meta">
            {timeAgo(n.createdAt)}
            {n.sender && ` · ${n.sender.fullName}`}
            {n.severity === "IMPORTANT" && " · Quan trọng"}
          </span>
        </span>
        {!n.readAt && <span className="o-notif-dot" aria-label="Chưa đọc" />}
      </button>
    </li>
  );
}

/** Mở thông báo: đánh dấu đã đọc + đi tới trang liên quan */
export function useOpenNotification() {
  const { markRead } = useNotifications();
  const nav = useNavigate();
  return (n: AppNotification) => {
    markRead(n.id);
    if (n.link) nav(n.link);
  };
}

/**
 * Chuông + badge chưa đọc. Bấm mở bảng xổ (position: fixed — không bị cột sidebar cắt).
 * `side`: đầu sidebar (bảng mở sang phải) · `compact`: header điện thoại (bảng phủ ngang màn hình)
 */
export function NotificationBell({ variant = "side" }: { variant?: "side" | "compact" }) {
  const { items, unread, markAllRead, loading, browser, enableBrowser } = useNotifications();
  const open = useOpenNotification();
  const [show, setShow] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!show || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    setPos(variant === "side" ? { top: Math.max(8, r.top - 8), left: r.right + 12 } : { top: r.bottom + 8, left: 0 });
  }, [show, variant]);

  useEffect(() => {
    if (!show) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) setShow(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShow(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [show]);

  const list = tab === "unread" ? items.filter((n) => !n.readAt) : items;
  const label = unread ? `Thông báo, ${unread} chưa đọc` : "Thông báo";
  return (
    <>
      <button ref={btn} type="button" className={`o-bell is-${variant}`} onClick={() => setShow((v) => !v)} aria-label={label} title={label} aria-expanded={show} aria-haspopup="dialog">
        <Bell size={20} strokeWidth={1.75} aria-hidden />
        {unread > 0 && <span className="o-bell-badge">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {show && pos && (
        <div ref={panel} className={`o-notif-panel is-${variant}`} style={variant === "side" ? { top: pos.top, left: pos.left } : { top: pos.top }} role="dialog" aria-label="Thông báo">
          <div className="o-notif-head">
            <strong>Thông báo</strong>
            {unread > 0 && (
              <button type="button" className="o-btn o-btn-link o-btn-sm" onClick={markAllRead}>
                <CheckCheck size={14} aria-hidden /> Đã đọc tất cả
              </button>
            )}
          </div>
          <div className="o-seg o-notif-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "all"} className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>Tất cả</button>
            <button type="button" role="tab" aria-selected={tab === "unread"} className={tab === "unread" ? "active" : ""} onClick={() => setTab("unread")}>
              Chưa đọc{unread ? ` (${unread})` : ""}
            </button>
          </div>
          <ul className="o-notif-list">
            {list.map((n) => (
              <NotificationRow
                key={n.id}
                n={n}
                onOpen={(x) => {
                  setShow(false);
                  open(x);
                }}
              />
            ))}
            {!list.length && <li className="o-notif-empty">{loading ? "Đang tải…" : tab === "unread" ? "Bạn đã đọc hết thông báo." : "Chưa có thông báo nào."}</li>}
          </ul>
          {(browser === "default" || browser === "off") && (
            <button type="button" className="o-notif-browser" onClick={() => void enableBrowser()}>
              <BellRing size={16} aria-hidden /> Bật thông báo trên thiết bị này — nhận cả khi đã đóng tab
            </button>
          )}
          {browser === "install" && (
            <p className="o-notif-browser is-hint">
              <BellRing size={16} aria-hidden /> iPhone/iPad: bấm Chia sẻ → “Thêm vào MH chính”, mở app từ màn hình chính để nhận thông báo.
            </p>
          )}
          <Link to="/app/overview/notifications" className="o-notif-foot" onClick={() => setShow(false)}>Xem tất cả thông báo</Link>
        </div>
      )}
    </>
  );
}

/** Thẻ nổi góc trên phải cho thông báo thường vừa tới */
export function NotificationToasts() {
  const { toasts, dismissToast } = useNotifications();
  const open = useOpenNotification();
  if (!toasts.length) return null;
  return (
    <div className="o-ntoasts" aria-live="polite">
      {toasts.map((n) => (
        <div key={n.id} className="o-ntoast">
          <NotifIcon n={n} />
          <button
            type="button"
            className="o-ntoast-text"
            onClick={() => {
              dismissToast(n.id);
              open(n);
            }}
          >
            <strong>{n.title}</strong>
            {n.body && <span>{n.body}</span>}
          </button>
          <button type="button" className="o-ntoast-close" onClick={() => dismissToast(n.id)} aria-label="Đóng">
            <X size={14} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Hộp thoại thông báo QUAN TRỌNG: phải bấm "Đã hiểu" (ghi nhận đã đọc) */
export function ImportantNotice() {
  const { important, markRead } = useNotifications();
  const n = important[0];
  if (!n) return null;
  return (
    <div className="o-modal-backdrop" role="presentation">
      <div className="o-modal sm o-important" role="alertdialog" aria-modal="true" aria-labelledby="imp-title" aria-describedby="imp-body">
        <div className="o-important-icon"><BellRing size={28} strokeWidth={1.75} aria-hidden /></div>
        <div className="o-important-eyebrow">Thông báo quan trọng{important.length > 1 ? ` · 1/${important.length}` : ""}</div>
        <h2 id="imp-title" className="o-important-title">{n.title}</h2>
        {n.body && <p id="imp-body" className="o-important-body">{n.body}</p>}
        <div className="o-important-meta">
          {n.sender ? n.sender.fullName : "Hệ thống"}
          {n.storeName && ` · ${n.storeName}`} · {new Date(n.createdAt).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
        </div>
        <button type="button" className="o-btn o-btn-primary o-important-ok" onClick={() => markRead(n.id)} autoFocus>Đã hiểu</button>
      </div>
    </div>
  );
}
