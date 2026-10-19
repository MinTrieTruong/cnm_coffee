import { Suspense, useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronLeft, Grip, LogOut, Menu as MenuIcon, Store, UserRound } from "lucide-react";
import { clearStaffSession, getStaffInfo, getStaffToken, staffApi } from "../../lib/staffApi";
import { BottomNav } from "../BottomNav";
import { staffNav } from "../../lib/navConfig";
import { useStaffBadges } from "../../lib/navBadges";
import {
  appPath,
  canSee,
  defaultRouteForRole,
  firstPathOf,
  isLeaf,
  locate,
  visibleApps,
  type AppDef,
  type MenuLeaf,
} from "../../apps/registry";
import { Dropdown } from "./ControlPanel";
import { StoreSwitcher } from "./StoreSwitcher";
import { Alert, Button, EmptyState, Field, Modal } from "./primitives";

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, close]);
  return ref;
}

/**
 * Khung chung khu vực nhân sự (kiểu Odoo):
 * [Ứng dụng] Tên app | menu con … | chi nhánh | người dùng
 */
export function AppShell() {
  const token = getStaffToken();
  const info = getStaffInfo();
  const loc = useLocation();
  const nav = useNavigate();
  const [appsOpen, setAppsOpen] = useState(false);
  const [menusOpen, setMenusOpen] = useState(false);
  const appsRef = useOutsideClose(appsOpen, () => setAppsOpen(false));
  const [pwOpen, setPwOpen] = useState(false);
  const badges = useStaffBadges(info?.role, info?.id);

  useEffect(() => {
    setAppsOpen(false);
    setMenusOpen(false);
  }, [loc.pathname]);

  if (!token || !info) return <Navigate to="/staff/login" replace state={{ from: loc.pathname }} />;
  const role = info.role;
  const found = locate(loc.pathname);
  if (!found) return <Navigate to={defaultRouteForRole(role)} replace />;
  const { app, leaf } = found;
  const apps = visibleApps(role);

  const logout = () => {
    clearStaffSession();
    nav("/staff/login", { replace: true });
  };

  // Phần đuôi sau /app/<app>/<menu>/ → id bản ghi cho màn hình form
  const rest = loc.pathname.split("/").slice(4).join("/");
  const recordId = rest ? decodeURIComponent(rest) : undefined;
  const Comp = recordId && leaf.form ? leaf.form : leaf.component;

  const contentClass = leaf.layout === "erp" ? "o-content o-content-full" : leaf.layout === "full" ? "o-content o-content-full" : "o-content o-content-legacy";
  const labelOf = (l: MenuLeaf) => (l.labelFor ? l.labelFor(role) : l.label);
  const appLeaves = app.menus.flatMap((m) => (isLeaf(m) ? [m] : m.children)).filter((l) => canSee(l, role));
  const mobileNav = staffNav(role);

  return (
    <div className="o-app">
      <header className={menusOpen ? "o-navbar menus-open" : "o-navbar"}>
        {/* Mobile: chỉ tiêu đề trang (+ nút quay lại ở trang con) */}
        <div className="o-mobile-head">
          {recordId && (
            <Link to={appPath(app, leaf)} className="o-nav-btn" aria-label="Quay lại">
              <ChevronLeft size={20} aria-hidden />
            </Link>
          )}
          <span className="o-mobile-title">{labelOf(leaf)}</span>
        </div>
        <div className="o-dropdown o-desk" ref={appsRef}>
          <button type="button" className="o-nav-btn" onClick={() => setAppsOpen((v) => !v)} aria-expanded={appsOpen} aria-label="Ứng dụng" title="Ứng dụng">
            <Grip size={18} aria-hidden />
          </button>
          {appsOpen && <AppsPanel apps={apps} role={role} current={app} />}
        </div>
        <Link to={firstPathOf(app, role)} className="o-nav-btn o-nav-app o-desk">{app.label}</Link>

        <button type="button" className="o-nav-btn o-nav-burger" onClick={() => setMenusOpen((v) => !v)} aria-expanded={menusOpen} aria-label="Menu">
          <MenuIcon size={18} aria-hidden />
        </button>
        <nav className="o-nav-menus" aria-label={`Menu ${app.label}`}>
          {app.menus.map((m) => {
            if (isLeaf(m)) {
              if (!canSee(m, role)) return null;
              return (
                <Link key={m.id} to={appPath(app, m)} className={m.id === leaf.id ? "o-nav-btn active" : "o-nav-btn"} aria-current={m.id === leaf.id ? "page" : undefined}>
                  {labelOf(m)}
                </Link>
              );
            }
            const kids = m.children.filter((c) => canSee(c, role));
            if (!kids.length) return null;
            if (kids.length === 1) {
              const k = kids[0];
              return (
                <Link key={m.id} to={appPath(app, k)} className={k.id === leaf.id ? "o-nav-btn active" : "o-nav-btn"}>
                  {labelOf(k)}
                </Link>
              );
            }
            const activeGroup = kids.some((k) => k.id === leaf.id);
            return (
              <Dropdown
                key={m.id}
                button={({ open, toggle }) => (
                  <button type="button" className={activeGroup ? "o-nav-btn active" : "o-nav-btn"} onClick={toggle} aria-expanded={open}>
                    {m.label} <ChevronDown size={14} aria-hidden />
                  </button>
                )}
              >
                {(close) =>
                  kids.map((k) => (
                    <Link key={k.id} to={appPath(app, k)} className={k.id === leaf.id ? "o-dropdown-item active" : "o-dropdown-item"} onClick={close}>
                      {labelOf(k)}
                    </Link>
                  ))
                }
              </Dropdown>
            );
          })}
        </nav>

        <span className="o-nav-spacer" />
        <div className="o-nav-branch">
          <StoreSwitcher />
        </div>
        <div className="o-desk">
        <Dropdown
          align="right"
          button={({ open, toggle }) => (
            <button type="button" className="o-nav-btn" onClick={toggle} aria-expanded={open} aria-label="Tài khoản">
              <UserRound size={16} aria-hidden />
              <span className="o-nav-user-name">{info.fullName ?? "Nhân viên"}</span>
              <span className="o-nav-user-role">{role}</span>
            </button>
          )}
        >
          {() => (
            <>
              <div className="o-dropdown-header">{info.fullName ?? "Nhân viên"} · {role}</div>
              <Link to="/menu" className="o-dropdown-item"><Store size={16} aria-hidden /> Trang khách</Link>
              <div className="o-dropdown-sep" />
              <button type="button" className="o-dropdown-item" onClick={logout}><LogOut size={16} aria-hidden /> Đăng xuất</button>
            </>
          )}
        </Dropdown>
        </div>
      </header>

      {/* Mobile: các mục con của app hiện tại, cuộn ngang */}
      {appLeaves.length > 1 && (
        <nav className="o-mobile-subnav" aria-label={`Mục trong ${app.label}`}>
          {appLeaves.map((l) => (
            <Link key={l.id} to={appPath(app, l)} className={l.id === leaf.id ? "active" : undefined} aria-current={l.id === leaf.id ? "page" : undefined}>
              {labelOf(l)}
            </Link>
          ))}
        </nav>
      )}

      <main className="o-main">
        <div className={contentClass}>
          {canSee(leaf, role) ? (
            <Suspense fallback={<div className="o-empty">Đang tải…</div>}>
              <Comp key={`${app.id}/${leaf.id}/${recordId ?? ""}`} {...(leaf.props ?? {})} {...(recordId ? { recordId } : {})} />
            </Suspense>
          ) : (
            <EmptyState title="Không có quyền truy cập" hint="Màn hình này không dành cho vai trò của bạn." />
          )}
        </div>
      </main>

      <BottomNav
        items={mobileNav.primary}
        badges={badges}
        more={{
          items: mobileNav.more,
          apps: mobileNav.moreApps,
          profile: { name: info.fullName ?? "Nhân viên", role },
          onChangePassword: () => setPwOpen(true),
          onLogout: logout,
        }}
      />
      {pwOpen && <ChangePasswordDialog onClose={() => setPwOpen(false)} />}
    </div>
  );
}

/** Đổi mật khẩu nhân viên — dùng API sẵn có POST /api/staff/me/change-password */
function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (next.length < 4) return setMsg({ ok: false, text: "Mật khẩu mới tối thiểu 4 ký tự." });
    if (next !== again) return setMsg({ ok: false, text: "Nhập lại mật khẩu mới không khớp." });
    setBusy(true);
    try {
      await staffApi("/api/staff/me/change-password", { method: "POST", body: JSON.stringify({ currentPassword: cur, newPassword: next }) });
      setMsg({ ok: true, text: "Đã đổi mật khẩu." });
      setCur("");
      setNext("");
      setAgain("");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Lỗi đổi mật khẩu" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Đổi mật khẩu"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !cur || !next}>Đổi mật khẩu</Button>
          <Button onClick={onClose}>Đóng</Button>
        </>
      }
    >
      {msg && <Alert tone={msg.ok ? "info" : "danger"}>{msg.text}</Alert>}
      <Field label="Mật khẩu hiện tại"><input className="o-input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></Field>
      <Field label="Mật khẩu mới"><input className="o-input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
      <Field label="Nhập lại"><input className="o-input" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" /></Field>
    </Modal>
  );
}

function AppsPanel({ apps, role, current }: { apps: AppDef[]; role: string; current: AppDef }) {
  return (
    <div className="o-apps-panel" role="menu" aria-label="Ứng dụng">
      {apps.map((a) => {
        const Icon = a.icon;
        return (
          <Link key={a.id} to={firstPathOf(a, role)} className={a.id === current.id ? "o-app-tile active" : "o-app-tile"} role="menuitem">
            <span className="o-app-tile-icon"><Icon aria-hidden /></span>
            {a.label}
          </Link>
        );
      })}
    </div>
  );
}
