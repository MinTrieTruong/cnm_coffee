import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, useLocation } from "react-router-dom";
import { KeyRound, LogOut, MoreHorizontal, X } from "lucide-react";
import { isActive, type BadgeKey, type NavItem } from "../lib/navConfig";

/* ───────── Ẩn thanh từ trong trang (vd POS đang mở bill) ───────── */
const hiders = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Gọi trong trang có thanh thao tác đáy riêng: `useHideBottomNav(billOpen)` */
export function useHideBottomNav(hidden: boolean) {
  const key = useRef(Math.random().toString(36)).current;
  useEffect(() => {
    if (hidden) hiders.add(key);
    else hiders.delete(key);
    emit();
    return () => {
      hiders.delete(key);
      emit();
    };
  }, [hidden, key]);
}

/** Bàn phím ảo đang mở (một ô nhập có focus) */
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const isField = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
      if (el.tagName !== "INPUT") return false;
      const t = (el as HTMLInputElement).type;
      return !["checkbox", "radio", "button", "submit", "range", "file", "color"].includes(t);
    };
    const onIn = (e: FocusEvent) => isField(e.target) && setOpen(true);
    const onOut = () => window.setTimeout(() => setOpen(isField(document.activeElement)), 50);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);
  return open;
}

export type MoreSheet = {
  /** Mục điều hướng còn lại */
  items: NavItem[];
  /** Danh sách app (Quản lý) */
  apps?: NavItem[];
  profile?: { name: string; role: string };
  onChangePassword?: () => void;
  onLogout?: () => void;
};

function Badge({ n }: { n?: number }) {
  if (!n) return null;
  return <span className="bn-badge" aria-label={`${n} mới`}>{n > 99 ? "99+" : n}</span>;
}

/**
 * Thanh điều hướng đáy dùng chung cho mọi vai trò (chỉ hiện ≤ 768px).
 * Tối đa 5 ô; nếu có `more` thì 4 ô + "Thêm" mở bottom sheet.
 */
export function BottomNav({
  items,
  badges = {},
  more,
  hidden,
}: {
  items: NavItem[];
  badges?: Partial<Record<BadgeKey, number>>;
  more?: MoreSheet;
  hidden?: boolean;
}) {
  const loc = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const keyboard = useKeyboardOpen();
  const pageHides = useSyncExternalStore(subscribe, () => hiders.size > 0);
  const visible = !hidden && !pageHides && !keyboard;

  useEffect(() => setSheetOpen(false), [loc.pathname, loc.search]);
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheetOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  // Chừa chỗ cho thanh ở cuối trang (CSS chỉ áp dụng ≤ 768px)
  useEffect(() => {
    document.body.classList.toggle("has-bottom-nav", visible);
    return () => document.body.classList.remove("has-bottom-nav");
  }, [visible]);

  const tabs = more ? items.slice(0, 4) : items.slice(0, 5);
  const act = (i: NavItem) => isActive(i, loc.pathname, loc.search);
  const anyTabActive = tabs.some(act);
  const moreActive = !!more && (sheetOpen || (!anyTabActive && [...more.items, ...(more.apps ?? [])].some(act)));

  return (
    <>
      {visible && (
        <nav className="bn" aria-label="Điều hướng chính">
          {tabs.map((i) => {
            const on = act(i);
            const Icon = i.icon;
            return (
              <Link key={i.id} to={i.to} className={on ? "bn-item active" : "bn-item"} aria-current={on ? "page" : undefined}>
                <span className="bn-icon">
                  <Icon size={22} aria-hidden />
                  <Badge n={i.badge ? badges[i.badge] : undefined} />
                </span>
                <span className="bn-label">{i.short}</span>
              </Link>
            );
          })}
          {more && (
            <button type="button" className={moreActive ? "bn-item active" : "bn-item"} onClick={() => setSheetOpen(true)} aria-haspopup="dialog" aria-expanded={sheetOpen}>
              <span className="bn-icon"><MoreHorizontal size={22} aria-hidden /></span>
              <span className="bn-label">Thêm</span>
            </button>
          )}
        </nav>
      )}

      {sheetOpen && more && (
        <div className="bn-sheet-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && setSheetOpen(false)}>
          <div className="bn-sheet" role="dialog" aria-modal="true" aria-label="Thêm">
            <div className="bn-sheet-head">
              {more.profile ? (
                <div className="bn-profile">
                  <span className="bn-avatar">{more.profile.name.slice(0, 1)}</span>
                  <span>
                    <strong>{more.profile.name}</strong>
                    <span className="bn-role">{more.profile.role}</span>
                  </span>
                </div>
              ) : (
                <strong>Thêm</strong>
              )}
              <button type="button" className="bn-close" onClick={() => setSheetOpen(false)} aria-label="Đóng"><X size={20} /></button>
            </div>
            <div className="bn-sheet-body">
              {more.apps && more.apps.length > 0 && (
                <>
                  <div className="bn-section">Ứng dụng</div>
                  <div className="bn-apps">
                    {more.apps.map((a) => {
                      const Icon = a.icon;
                      return (
                        <Link key={a.id} to={a.to} className={act(a) ? "bn-app active" : "bn-app"}>
                          <span className="bn-app-icon"><Icon size={20} aria-hidden /></span>
                          <span>{a.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}
              {more.items.length > 0 && (
                <>
                  <div className="bn-section">Cá nhân</div>
                  {more.items.map((i) => {
                    const Icon = i.icon;
                    return (
                      <Link key={i.id} to={i.to} className={act(i) ? "bn-row active" : "bn-row"}>
                        <Icon size={20} aria-hidden /> <span>{i.label}</span>
                        <Badge n={i.badge ? badges[i.badge] : undefined} />
                      </Link>
                    );
                  })}
                </>
              )}
              {(more.onChangePassword || more.onLogout) && <div className="bn-sep" />}
              {more.onChangePassword && (
                <button
                  type="button"
                  className="bn-row"
                  onClick={() => {
                    setSheetOpen(false);
                    more.onChangePassword!();
                  }}
                >
                  <KeyRound size={20} aria-hidden /> <span>Đổi mật khẩu</span>
                </button>
              )}
              {more.onLogout && (
                <button type="button" className="bn-row danger" onClick={more.onLogout}>
                  <LogOut size={20} aria-hidden /> <span>Đăng xuất</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
