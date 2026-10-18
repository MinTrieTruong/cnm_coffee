import { useEffect, useRef, useState, type ComponentType } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  CalendarCheck,
  CalendarDays,
  ChefHat,
  FileText,
  LayoutGrid,
  ListChecks,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Store,
  Truck,
  Wallet,
  X,
} from "lucide-react";
import { clearStaffSession, getStaffInfo, getStaffToken } from "../lib/staffApi";
import { LogoMark } from "./LogoMark";
import { useResponsiveTables } from "../lib/useResponsiveTables";

type IconType = ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;

type NavGroup = "ops" | "manage" | "personal";

type NavItem = {
  to: string;
  label: string;
  /** Nhãn ngắn cho bottom nav (mobile) */
  short: string;
  icon: IconType;
  roles: string[] | "all";
  group: NavGroup;
  /** Ưu tiên hiển thị trên bottom nav — số nhỏ hơn đứng trước */
  mobilePriority?: number;
};

const OPS = ["Admin", "Waiter", "Kitchen", "Cashier", "Shipper"];

const GROUPS: Array<{ id: NavGroup; label: string }> = [
  { id: "ops", label: "Vận hành" },
  { id: "manage", label: "Quản lý" },
  { id: "personal", label: "Cá nhân" },
];

/* Với Admin: QR, định mức, mua hàng, lịch tổng… đã gom vào trang /admin theo phân hệ */
const NAV_ITEMS: NavItem[] = [
  { to: "/pos", label: "Thu ngân (POS)", short: "Thu ngân", icon: Receipt, roles: ["Admin", "Cashier"], group: "ops", mobilePriority: 1 },
  { to: "/staff/tables", label: "Sơ đồ bàn", short: "Bàn", icon: LayoutGrid, roles: ["Admin", "Waiter", "Cashier"], group: "ops", mobilePriority: 2 },
  { to: "/kds", label: "Pha chế (KDS)", short: "Pha chế", icon: ChefHat, roles: ["Admin", "Kitchen"], group: "ops", mobilePriority: 1 },
  { to: "/staff/inventory", label: "Kiểm kho", short: "Kho", icon: Package, roles: ["Admin", "Kitchen"], group: "ops", mobilePriority: 2 },
  { to: "/staff/shipper", label: "Giao hàng (GPS)", short: "Giao hàng", icon: Truck, roles: ["Admin", "Shipper"], group: "ops", mobilePriority: 1 },
  { to: "/staff/order-status", label: "Trạng thái món", short: "Món", icon: ListChecks, roles: ["Admin", "Waiter"], group: "ops", mobilePriority: 3 },
  { to: "/staff/chat", label: "Tin nhắn", short: "Chat", icon: MessageSquare, roles: ["Admin", "Cashier", "Waiter"], group: "ops", mobilePriority: 4 },
  { to: "/admin", label: "Trang quản trị", short: "Admin", icon: Settings, roles: ["Admin"], group: "manage" },
  { to: "/admin/procurement", label: "Mua hàng", short: "Mua hàng", icon: ShoppingCart, roles: ["Purchasing", "Manager"], group: "manage", mobilePriority: 1 },
  { to: "/admin/schedule", label: "Bảng lịch tổng", short: "Lịch tổng", icon: CalendarDays, roles: ["Cashier", "Kitchen", "Waiter", "Shipper"], group: "manage" },
  { to: "/staff/schedule", label: "Lịch cá nhân", short: "Lịch", icon: CalendarCheck, roles: OPS, group: "personal", mobilePriority: 5 },
  { to: "/staff/attendance", label: "Chấm công & Ca", short: "Chấm công", icon: MapPin, roles: "all", group: "personal", mobilePriority: 3 },
  { to: "/staff/requests", label: "Đề xuất cá nhân", short: "Đề xuất", icon: FileText, roles: OPS, group: "personal" },
  { to: "/staff/payslips", label: "Phiếu lương của tôi", short: "Lương", icon: Wallet, roles: "all", group: "personal" },
];

const MAX_BOTTOM_ITEMS = 4;

function allowed(item: NavItem, role: string) {
  return item.roles === "all" || item.roles.includes(role);
}

/** Returns the default route for a given role */
function defaultRouteForRole(role: string): string {
  if (role === "Admin") return "/admin";
  if (role === "Kitchen") return "/kds";
  if (role === "Cashier") return "/pos";
  if (role === "Waiter") return "/staff/tables";
  if (role === "Shipper") return "/staff/shipper";
  return "/staff/tables";
}

export function StaffShell() {
  const token = getStaffToken();
  const info = getStaffInfo();
  const loc = useLocation();
  const nav = useNavigate();
  const [siderOpen, setSiderOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  useResponsiveTables(mainRef);

  // Đóng drawer khi chuyển trang
  useEffect(() => {
    setSiderOpen(false);
  }, [loc.pathname]);

  if (!token || !info) {
    return <Navigate to="/staff/login" replace state={{ from: loc.pathname }} />;
  }

  const role = info.role;
  const closeSider = () => setSiderOpen(false);
  const items = NAV_ITEMS.filter((i) => allowed(i, role));
  const scheduleLabel = role === "Admin" || role === "Cashier" ? "Quản lý lịch" : "Bảng lịch tổng";

  const bottomItems = items
    .filter((i) => i.mobilePriority !== undefined)
    .sort((a, b) => (a.mobilePriority ?? 99) - (b.mobilePriority ?? 99))
    .slice(0, MAX_BOTTOM_ITEMS);
  const activeInBottom = bottomItems.some((i) => i.to === loc.pathname);

  const logout = () => {
    clearStaffSession();
    closeSider();
  };

  return (
    <div className="staff-layout">
      {/* ── Sidebar (desktop) / Drawer (mobile) ── */}
      <aside className={`staff-sider${siderOpen ? " staff-sider-open" : ""}`} aria-label="Menu nhân sự">
        <button
          type="button"
          className="staff-sider-brand"
          style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", width: "100%" }}
          onClick={() => { nav(defaultRouteForRole(role)); closeSider(); }}
        >
          <LogoMark width={40} height={40} className="staff-sider-logo-img" />
          <div>
            <div className="staff-sider-title">TD Coffee</div>
            <div className="staff-sider-role">{role}</div>
          </div>
        </button>

        <button type="button" className="staff-sider-close-btn" onClick={closeSider} aria-label="Đóng menu">
          <X size={18} aria-hidden />
        </button>

        <nav className="staff-sider-nav">
          {GROUPS.map((g) => {
            const groupItems = items.filter((i) => i.group === g.id);
            if (groupItems.length === 0) return null;
            return (
              <div key={g.id} className="staff-nav-group">
                <div className="staff-nav-group-label">{g.label}</div>
                {groupItems.map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    className={loc.pathname === to ? "staff-nav-link staff-nav-link-active" : "staff-nav-link"}
                    aria-current={loc.pathname === to ? "page" : undefined}
                    onClick={closeSider}
                  >
                    <Icon size={18} strokeWidth={2} aria-hidden />
                    <span>{to === "/admin/schedule" ? scheduleLabel : label}</span>
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="staff-sider-footer">
          <Link to="/menu" className="staff-sider-foot-link" onClick={closeSider}>
            <Store size={18} aria-hidden /> Trang khách
          </Link>
          <Link to="/staff/login" className="staff-sider-foot-link staff-sider-foot-danger" onClick={logout}>
            <LogOut size={18} aria-hidden /> Đăng xuất
          </Link>
        </div>
      </aside>

      {siderOpen && <div className="staff-sider-overlay" onClick={closeSider} role="presentation" />}

      {/* ── Vùng nội dung ── */}
      <div className="staff-main" ref={mainRef}>
        <header className="staff-mobile-topbar">
          <button
            type="button"
            className="staff-mobile-menu-btn"
            onClick={() => setSiderOpen(true)}
            aria-label="Mở menu"
            aria-expanded={siderOpen}
          >
            <Menu size={22} aria-hidden />
          </button>
          <div className="staff-mobile-brand">
            <LogoMark width={28} height={28} />
            <span className="staff-mobile-brand-name">TD Coffee</span>
            <span className="staff-mobile-role-badge">{role}</span>
          </div>
          <Link to="/staff/login" className="staff-mobile-logout-btn" onClick={logout} aria-label="Đăng xuất">
            <LogOut size={20} aria-hidden />
          </Link>
        </header>

        <Outlet />

        {/* Bottom nav (mobile): tối đa 4 mục chính + "Thêm" mở drawer */}
        <nav className="staff-bottom-nav" aria-label="Điều hướng nhanh">
          {bottomItems.map(({ to, short, icon: Icon }) => {
            const active = loc.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={active ? "staff-bottom-nav-item staff-bottom-nav-active" : "staff-bottom-nav-item"}
                aria-current={active ? "page" : undefined}
              >
                <span className="staff-bottom-nav-icon"><Icon size={20} aria-hidden /></span>
                <span className="staff-bottom-nav-label">{short}</span>
              </Link>
            );
          })}
          <button
            type="button"
            className={
              !activeInBottom ? "staff-bottom-nav-item staff-bottom-nav-active" : "staff-bottom-nav-item"
            }
            onClick={() => setSiderOpen(true)}
            aria-label="Mở toàn bộ menu"
          >
            <span className="staff-bottom-nav-icon"><MoreHorizontal size={20} aria-hidden /></span>
            <span className="staff-bottom-nav-label">Thêm</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

