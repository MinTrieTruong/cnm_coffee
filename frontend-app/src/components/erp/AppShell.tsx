import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { clearStaffSession, getStaffInfo, getStaffToken, staffApi } from "../../lib/staffApi";
import { BottomNav } from "../BottomNav";
import { staffNav, type NavItem } from "../../lib/navConfig";
import { refreshBadges, useStaffBadges } from "../../lib/navBadges";
import { useAttendanceToday } from "../../lib/attendanceReminder";
import { AttendanceReminder } from "./AttendanceReminder";
import { appPath, canSee, defaultRouteForRole, isLeaf, listed, locate, type MenuLeaf } from "../../apps/registry";
import { LEAF_BADGES, buildSidebar, leavesOfGroup } from "../../apps/sidebar";
import { Sidebar } from "./Sidebar";
import { StoreSwitcher } from "./StoreSwitcher";
import { PageHeader } from "./dashboard";
import { roleLabel } from "../../lib/roles";
import { Alert, Button, EmptyState, Field, Modal } from "./primitives";
import { PasswordInput } from "../PasswordInput";
import { NotificationProvider, useNotifications } from "../../lib/notifications";
import { unsubscribePush } from "../../lib/push";
import { ImportantNotice, NotificationBell, NotificationToasts } from "./Notifications";

const COLLAPSE_KEY = "td.sidebar.collapsed";
/** Đường dẫn các mục có badge (/app/<app>/<menu>) */
const BADGE_PATHS = Object.keys(LEAF_BADGES).map((k) => `/app/${k}`);
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * Khung chung khu vực nhân sự: sidebar điều khiển bên trái (desktop) + vùng nội dung.
 * Điện thoại (≤ 768px): header gọn + BottomNav; mục "Thêm" liệt kê đủ chức năng theo SIDEBAR_GROUPS.
 * Chuông thông báo: đầu sidebar (desktop) / header (điện thoại) — dữ liệu từ NotificationProvider.
 */
export function AppShell() {
  const id = getStaffToken() ? getStaffInfo()?.id : undefined;
  return (
    <NotificationProvider staffId={id}>
      <Shell />
    </NotificationProvider>
  );
}

function Shell() {
  const token = getStaffToken();
  const info = getStaffInfo();
  const { unread } = useNotifications();
  const loc = useLocation();
  const nav = useNavigate();
  const [pwOpen, setPwOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  // Trang toàn màn hình tự thu gọn; mở tạm (peek) không ghi đè lựa chọn của người dùng
  const [peek, setPeek] = useState(false);
  const sourceBadges = useStaffBadges(info?.role, info?.id);
  const role = info?.role ?? "";
  const groups = useMemo(() => buildSidebar(role), [role]);
  const attendance = useAttendanceToday(info ? role : undefined);
  const badges = { ...sourceBadges, attendance: attendance.reminder ? 1 : 0, notifications: unread };
  const onAttendancePage = loc.pathname === "/app/hr/attendance";

  useEffect(() => setPeek(false), [loc.pathname]);
  // Vừa rời màn có badge (duyệt đơn, mua hàng, tồn kho…) → badge tính lại ngay, không đợi 60 giây
  const prevPath = useRef(loc.pathname);
  useEffect(() => {
    const was = prevPath.current;
    prevPath.current = loc.pathname;
    if (was !== loc.pathname && BADGE_PATHS.some((p) => was.startsWith(p))) refreshBadges();
  }, [loc.pathname]);
  // Vừa rời màn chấm công → tải lại ca để tắt lời nhắc ngay
  const [wasOnAttendance, setWasOnAttendance] = useState(onAttendancePage);
  if (wasOnAttendance !== onAttendancePage) {
    setWasOnAttendance(onAttendancePage);
    if (!onAttendancePage) attendance.reload();
  }

  if (!token || !info) return <Navigate to="/staff/login" replace state={{ from: loc.pathname }} />;
  const found = locate(loc.pathname);
  if (!found) return <Navigate to={defaultRouteForRole(role)} replace />;
  const { app, leaf } = found;

  const logout = async () => {
    // Gỡ thiết bị khỏi tài khoản trước khi xóa token (máy dùng chung không nhận thông báo của người trước)
    await unsubscribePush().catch(() => {});
    clearStaffSession();
    nav("/staff/login", { replace: true });
  };

  // Phần đuôi sau /app/<app>/<menu>/ → id bản ghi cho màn hình form
  const rest = loc.pathname.split("/").slice(4).join("/");
  const recordId = rest ? decodeURIComponent(rest) : undefined;
  const Comp = recordId && leaf.form ? leaf.form : leaf.component;

  const full = leaf.layout === "full";
  const sideCollapsed = full ? !peek : collapsed;
  const toggleSide = () => {
    if (full) return setPeek((v) => !v);
    setCollapsed((v) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1");
      } catch {
        /* bỏ qua */
      }
      return !v;
    });
  };

  const labelOf = (l: MenuLeaf) => (l.labelFor ? l.labelFor(role) : l.label);
  const currentKey = `${app.id}/${leaf.alias ?? leaf.id}`;
  // Mobile: các mục con của app hiện tại, cuộn ngang
  const appLeaves = app.menus.flatMap((m) => (isLeaf(m) ? [m] : m.children)).filter((l) => listed(l, role));
  const mobileNav = staffNav(role);
  // "Thêm" trên điện thoại: đủ chức năng theo nhóm sidebar
  const moreGroups = groups.map((g) => ({
    label: g.label,
    items: leavesOfGroup(g).map((l): NavItem => ({ id: l.key, label: l.label, short: l.label, icon: l.icon, to: l.to, badge: l.badge })),
  }));
  const back = recordId ? (
    <Link to={appPath(app, leaf)} className="o-ph-back"><ChevronLeft size={16} aria-hidden /> {labelOf(leaf)}</Link>
  ) : undefined;

  const page = canSee(leaf, role) ? (
    <Suspense fallback={<div className="o-empty">Đang tải…</div>}>
      <Comp key={`${app.id}/${leaf.id}/${recordId ?? ""}`} {...(leaf.props ?? {})} {...(recordId ? { recordId } : {})} />
    </Suspense>
  ) : (
    <EmptyState title="Không có quyền truy cập" hint="Màn hình này không dành cho vai trò của bạn." />
  );

  return (
    <div className={sideCollapsed ? "o-app side-collapsed" : "o-app"}>
      <Sidebar
        groups={groups}
        currentKey={currentKey}
        collapsed={sideCollapsed}
        onToggle={toggleSide}
        badges={badges}
        profile={{ name: info.fullName ?? "Nhân viên", role: roleLabel(role) }}
        onChangePassword={() => setPwOpen(true)}
        onLogout={logout}
        bell={<NotificationBell variant="side" />}
      />

      <div className="o-main">
        {/* Mobile: tiêu đề trang (+ quay lại ở trang con) + chọn chi nhánh */}
        <header className="o-mobile-head">
          {recordId && (
            <Link to={appPath(app, leaf)} className="o-mobile-back" aria-label="Quay lại">
              <ChevronLeft size={20} aria-hidden />
            </Link>
          )}
          <span className="o-mobile-title">{labelOf(leaf)}</span>
          <StoreSwitcher variant="compact" />
          <NotificationBell variant="compact" />
        </header>
        {appLeaves.length > 1 && (
          <nav className="o-mobile-subnav" aria-label={`Mục trong ${app.label}`}>
            {appLeaves.map((l) => (
              <Link key={l.id} to={appPath(app, l)} className={l.id === (leaf.alias ?? leaf.id) ? "active" : undefined} aria-current={l.id === leaf.id ? "page" : undefined}>
                {labelOf(l)}
              </Link>
            ))}
          </nav>
        )}

        <main className={full ? "o-content o-content-full" : "o-page"}>
          {!full && !leaf.ownHeader && <PageHeader title={labelOf(leaf)} description={leaf.description} back={back} />}
          {full ? page : <div className={leaf.layout === "legacy" ? "o-page-body is-legacy" : "o-page-body"}>{page}</div>}
        </main>
      </div>

      <BottomNav
        items={mobileNav.primary}
        badges={badges}
        more={{
          items: mobileNav.more,
          apps: mobileNav.moreApps,
          groups: moreGroups,
          profile: { name: info.fullName ?? "Nhân viên", role: roleLabel(role) },
          onChangePassword: () => setPwOpen(true),
          onLogout: logout,
        }}
      />
      {!onAttendancePage && <AttendanceReminder reminder={attendance.reminder} />}
      <NotificationToasts />
      <ImportantNotice />
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
      <Field label="Mật khẩu hiện tại"><PasswordInput className="o-input" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></Field>
      <Field label="Mật khẩu mới"><PasswordInput className="o-input" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
      <Field label="Nhập lại"><PasswordInput className="o-input" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" /></Field>
    </Modal>
  );
}
