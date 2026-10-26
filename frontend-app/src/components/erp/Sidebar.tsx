import { useEffect, useRef, useState, type FocusEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, ChevronUp, KeyRound, LogOut, Store } from "lucide-react";
import { LogoMark } from "../LogoMark";
import { StoreSwitcher } from "./StoreSwitcher";
import type { BadgeKey } from "../../lib/navConfig";
import type { SideGroup, SideItem, SideLeaf } from "../../apps/sidebar";

const OPEN_KEY = "td.sidebar.open";

function readOpen(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}
function writeOpen(v: Record<string, boolean>) {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(v));
  } catch {
    /* bộ nhớ trình duyệt bị chặn — chỉ mất phần ghi nhớ */
  }
}

/** Chữ viết tắt từ họ tên: "Nguyễn Văn An" → "NA" */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts.length > 1 ? parts[0][0] : "";
  return (first + parts[parts.length - 1][0]).toUpperCase();
}

type Pop = { key: string; top: number; label: string; children?: SideLeaf[] };

/**
 * Sidebar điều khiển bên trái (desktop). Menu dựng từ apps/sidebar.ts.
 * `currentKey`: `app/leaf` của trang đang mở.
 */
export function Sidebar({
  groups,
  currentKey,
  collapsed,
  onToggle,
  badges,
  profile,
  onChangePassword,
  onLogout,
  bell,
}: {
  groups: SideGroup[];
  currentKey: string;
  collapsed: boolean;
  onToggle: () => void;
  badges: Partial<Record<BadgeKey, number>>;
  profile: { name: string; role: string };
  onChangePassword: () => void;
  onLogout: () => void;
  /** Chuông thông báo (đặt cạnh logo; khi thu gọn nằm dưới logo) */
  bell?: ReactNode;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(readOpen);
  const [pop, setPop] = useState<Pop | null>(null);
  const [userOpen, setUserOpen] = useState(false);
  const popTimer = useRef<number | undefined>(undefined);
  const footRef = useRef<HTMLDivElement>(null);

  // Mở sẵn nhóm & menu con chứa trang hiện tại
  useEffect(() => {
    const need: string[] = [];
    for (const g of groups) {
      for (const it of g.items) {
        const hit = it.kind === "leaf" ? it.key === currentKey : it.children.some((c) => c.key === currentKey);
        if (!hit) continue;
        need.push(`g:${g.id}`);
        if (it.kind === "node") need.push(`n:${it.key}`);
      }
    }
    setOpen((prev) => {
      if (need.every((k) => prev[k] !== false)) return prev;
      const next = { ...prev };
      for (const k of need) next[k] = true;
      writeOpen(next);
      return next;
    });
  }, [currentKey, groups]);

  useEffect(() => {
    setPop(null);
    setUserOpen(false);
  }, [currentKey, collapsed]);

  useEffect(() => {
    if (!userOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (footRef.current && !footRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setUserOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [userOpen]);

  // Nhóm mặc định mở, menu con mặc định đóng
  const isOpen = (k: string) => open[k] ?? k.startsWith("g:");
  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = { ...prev, [k]: !(prev[k] ?? k.startsWith("g:")) };
      writeOpen(next);
      return next;
    });

  /* Tooltip / flyout khi thu gọn: vị trí cố định để không bị cột cuộn cắt mất */
  const showPop = (e: ReactMouseEvent<HTMLElement> | FocusEvent<HTMLElement>, it: SideItem) => {
    if (!collapsed) return;
    window.clearTimeout(popTimer.current);
    const r = e.currentTarget.getBoundingClientRect();
    setPop({ key: it.key, top: r.top, label: it.label, children: it.kind === "node" ? it.children : undefined });
  };
  const hidePop = () => {
    window.clearTimeout(popTimer.current);
    popTimer.current = window.setTimeout(() => setPop(null), 120);
  };
  const keepPop = () => window.clearTimeout(popTimer.current);

  const badgeOf = (l: SideLeaf) => (l.badge ? badges[l.badge] ?? 0 : 0);

  const renderLeaf = (l: SideLeaf, child = false) => {
    const on = l.key === currentKey;
    const Icon = l.icon;
    const n = badgeOf(l);
    return (
      <li key={l.key}>
        <Link
          to={l.to}
          className={`o-side-link${on ? " active" : ""}${child ? " is-child" : ""}`}
          aria-current={on ? "page" : undefined}
          aria-label={collapsed ? (n ? `${l.label} (${n} mới)` : l.label) : undefined}
          onMouseEnter={child ? undefined : (e) => showPop(e, l)}
          onMouseLeave={child ? undefined : hidePop}
          onFocus={child ? undefined : (e) => showPop(e, l)}
          onBlur={child ? undefined : hidePop}
        >
          {!child && <Icon size={18} strokeWidth={1.75} aria-hidden />}
          <span className="o-side-label">{l.label}</span>
          {n > 0 && <span className="o-side-badge">{n > 99 ? "99+" : n}</span>}
        </Link>
      </li>
    );
  };

  const renderItem = (it: SideItem) => {
    if (it.kind === "leaf") return renderLeaf(it);
    const k = `n:${it.key}`;
    const expanded = isOpen(k);
    const active = it.children.some((c) => c.key === currentKey);
    const Icon = it.icon;
    const n = it.children.reduce((s, c) => s + badgeOf(c), 0);
    return (
      <li key={it.key}>
        <button
          type="button"
          className={`o-side-link${active && (collapsed || !expanded) ? " active" : ""}`}
          aria-expanded={collapsed ? pop?.key === it.key : expanded}
          aria-label={collapsed ? it.label : undefined}
          onClick={(e) => (collapsed ? showPop(e, it) : toggle(k))}
          onMouseEnter={(e) => showPop(e, it)}
          onMouseLeave={hidePop}
          onFocus={(e) => showPop(e, it)}
        >
          <Icon size={18} strokeWidth={1.75} aria-hidden />
          <span className="o-side-label">{it.label}</span>
          {n > 0 && !expanded && <span className="o-side-badge">{n > 99 ? "99+" : n}</span>}
          <ChevronRight size={16} strokeWidth={1.75} className={expanded ? "o-side-caret open" : "o-side-caret"} aria-hidden />
        </button>
        {!collapsed && expanded && <ul className="o-side-sub">{it.children.map((c) => renderLeaf(c, true))}</ul>}
      </li>
    );
  };

  return (
    <aside className={collapsed ? "o-side collapsed" : "o-side"} aria-label="Điều hướng">
      <div className="o-side-head">
        <div className="o-side-brand-row">
          <Link to="/app/overview/home" className="o-side-brand" aria-label="TD Coffee — Bảng điều khiển">
            <LogoMark width={32} height={32} className="o-side-logo" />
            <span className="o-side-brand-name">TD Coffee</span>
          </Link>
          {bell}
        </div>
        <StoreSwitcher variant="side" iconOnly={collapsed} />
      </div>
      <button type="button" className="o-side-collapse" onClick={onToggle} aria-label={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"} title={collapsed ? "Mở rộng" : "Thu gọn"}>
        <ChevronLeft size={14} strokeWidth={2} aria-hidden />
      </button>

      <nav className="o-side-scroll" aria-label="Chức năng">
        {groups.map((g) => {
          const k = `g:${g.id}`;
          const expanded = collapsed || isOpen(k);
          return (
            <section key={g.id} className={g.support ? "o-side-group is-support" : "o-side-group"}>
              {collapsed ? (
                <div className="o-side-sep" role="separator" aria-label={g.label} />
              ) : (
                <button type="button" className="o-side-group-title" onClick={() => toggle(k)} aria-expanded={expanded}>
                  <span>{g.label}</span>
                  <ChevronRight size={14} strokeWidth={1.75} className={expanded ? "o-side-caret open" : "o-side-caret"} aria-hidden />
                </button>
              )}
              {expanded && <ul className="o-side-list">{g.items.map(renderItem)}</ul>}
            </section>
          );
        })}
      </nav>

      <div className="o-side-foot" ref={footRef}>
        <button type="button" className="o-side-user" onClick={() => setUserOpen((v) => !v)} aria-expanded={userOpen} aria-haspopup="menu" title={collapsed ? `${profile.name} · ${profile.role}` : undefined}>
          <span className="o-side-avatar" aria-hidden>{initials(profile.name)}</span>
          <span className="o-side-user-text">
            <span className="o-side-user-name">{profile.name}</span>
            <span className="o-side-user-role">{profile.role}</span>
          </span>
          <ChevronUp size={16} strokeWidth={1.75} className="o-side-user-caret" aria-hidden />
        </button>
        {userOpen && (
          <div className="o-side-usermenu" role="menu">
            <button type="button" role="menuitem" className="o-dropdown-item" onClick={() => { setUserOpen(false); onChangePassword(); }}>
              <KeyRound size={16} aria-hidden /> Đổi mật khẩu
            </button>
            <Link to="/menu" role="menuitem" className="o-dropdown-item"><Store size={16} aria-hidden /> Trang khách</Link>
            <div className="o-dropdown-sep" />
            <button type="button" role="menuitem" className="o-dropdown-item is-danger" onClick={onLogout}>
              <LogOut size={16} aria-hidden /> Đăng xuất
            </button>
          </div>
        )}
      </div>

      {collapsed && pop && (
        <div className={pop.children ? "o-side-pop is-flyout" : "o-side-pop"} style={{ top: pop.top }} onMouseEnter={keepPop} onMouseLeave={hidePop} role={pop.children ? "menu" : "tooltip"}>
          {pop.children ? (
            <>
              <div className="o-side-pop-title">{pop.label}</div>
              {pop.children.map((c) => (
                <Link key={c.key} to={c.to} role="menuitem" className={c.key === currentKey ? "o-side-pop-item active" : "o-side-pop-item"} onBlur={hidePop} onFocus={keepPop}>
                  {c.label}
                  {badgeOf(c) > 0 && <span className="o-side-badge">{badgeOf(c)}</span>}
                </Link>
              ))}
            </>
          ) : (
            pop.label
          )}
        </div>
      )}
    </aside>
  );
}
