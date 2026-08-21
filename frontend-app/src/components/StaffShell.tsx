import { useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearStaffSession, getStaffInfo, getStaffToken } from "../lib/staffApi";
import { LogoMark } from "./LogoMark";

function StaffNavItem({ to, label, onClick }: { to: string; label: string; onClick?: () => void }) {
  const loc = useLocation();
  const active = loc.pathname === to;
  return (
    <Link
      to={to}
      className={active ? "staff-nav-link staff-nav-link-active" : "staff-nav-link"}
      onClick={onClick}
    >
      {label}
    </Link>
  );
}

/** Bottom nav item for mobile */
function MobileNavItem({ to, icon, label }: { to: string; icon: string; label: string }) {
  const loc = useLocation();
  const active = loc.pathname === to;
  return (
    <Link
      to={to}
      className={active ? "staff-bottom-nav-item staff-bottom-nav-active" : "staff-bottom-nav-item"}
    >
      <span className="staff-bottom-nav-icon">{icon}</span>
      <span className="staff-bottom-nav-label">{label}</span>
    </Link>
  );
}

/** Returns the default route for a given role */
function defaultRouteForRole(role: string): string {
  if (role === "Admin") return "/admin";
  if (role === "Kitchen") return "/kds";
  if (role === "Cashier") return "/pos";
  if (role === "Waiter") return "/staff/tables";
  return "/menu";
}

export function StaffShell() {
  const token = getStaffToken();
  const info = getStaffInfo();
  const loc = useLocation();
  const nav = useNavigate();
  const [siderOpen, setSiderOpen] = useState(false);

  if (!token || !info) {
    return <Navigate to="/staff/login" replace state={{ from: loc.pathname }} />;
  }

  const role = info.role;
  const closeSider = () => setSiderOpen(false);

  return (
    <div className="staff-layout">
      {/* ── Sidebar dọc (desktop) / Drawer (mobile) ── */}
      <aside className={`staff-sider${siderOpen ? " staff-sider-open" : ""}`}>
        <button
          type="button"
          className="staff-sider-brand"
          style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, width: "100%" }}
          onClick={() => { nav(defaultRouteForRole(role)); closeSider(); }}
        >
          <LogoMark width={40} height={40} className="staff-sider-logo-img" />
          <div>
            <div className="staff-sider-title">TD Coffee</div>
            <div className="staff-sider-role">{role}</div>
          </div>
        </button>

        {/* Nút đóng chỉ hiện trên mobile */}
        <button type="button" className="staff-sider-close-btn" onClick={closeSider} aria-label="Đóng menu">
          ✕
        </button>

        <nav className="staff-sider-nav" aria-label="Nhân sự">
          {(role === "Admin" || role === "Cashier") && (
            <StaffNavItem to="/pos" label="Thu ngân (POS)" onClick={closeSider} />
          )}
          {(role === "Admin" || role === "Waiter" || role === "Cashier") && (
            <StaffNavItem to="/staff/tables" label="Sơ đồ bàn" onClick={closeSider} />
          )}
          {(role === "Admin" || role === "Kitchen") && (
            <StaffNavItem to="/kds" label="Pha chế (KDS)" onClick={closeSider} />
          )}
          {(role === "Admin" || role === "Kitchen") && (
            <StaffNavItem to="/staff/inventory" label="Kiểm kho" onClick={closeSider} />
          )}
          {role === "Admin" && (
            <StaffNavItem to="/admin" label="Quản trị" onClick={closeSider} />
          )}
          {role === "Admin" && (
            <StaffNavItem to="/admin/formulas" label="Định mức nguyên liệu" onClick={closeSider} />
          )}
          {role === "Admin" && (
            <StaffNavItem to="/admin/qr" label="Tạo mã QR" onClick={closeSider} />
          )}
          <StaffNavItem to="/admin/schedule" label={role === "Admin" || role === "Cashier" ? "Quản lý lịch" : "Bảng lịch tổng"} onClick={closeSider} />
          {(role === "Admin" || role === "Waiter" || role === "Kitchen" || role === "Cashier") && (
            <StaffNavItem to="/staff/schedule" label="Lịch cá nhân" onClick={closeSider} />
          )}
          {(role === "Admin" || role === "Cashier" || role === "Waiter") && (
            <StaffNavItem to="/staff/chat" label="Tin nhắn" onClick={closeSider} />
          )}
          {(role === "Admin" || role === "Waiter") && (
            <StaffNavItem to="/staff/order-status" label="Trạng thái món" onClick={closeSider} />
          )}
          <StaffNavItem to="/staff/attendance" label="Chấm công" onClick={closeSider} />
        </nav>

        <div className="staff-sider-footer">
          <Link to="/menu" className="staff-sider-foot-link" onClick={closeSider}>
            🛍 Trang khách
          </Link>
          <Link
            to="/staff/login"
            className="staff-sider-foot-link"
            style={{ color: "rgba(255,120,120,0.8)" }}
            onClick={() => { clearStaffSession(); closeSider(); }}
          >
            🚪 Đăng xuất
          </Link>
        </div>
      </aside>

      {/* Overlay mờ khi drawer mở (mobile) */}
      {siderOpen && (
        <div className="staff-sider-overlay" onClick={closeSider} role="presentation" />
      )}

      {/* ── Vùng nội dung ── */}
      <div className="staff-main">
        {/* Top bar chỉ hiện trên mobile */}
        <header className="staff-mobile-topbar">
          <button
            type="button"
            className="staff-mobile-menu-btn"
            onClick={() => setSiderOpen(true)}
            aria-label="Mở menu"
          >
            ☰
          </button>
          <div className="staff-mobile-brand">
            <LogoMark width={26} height={26} />
            <span className="staff-mobile-brand-name">TD Coffee</span>
            <span className="staff-mobile-role-badge">{role}</span>
          </div>
          <Link
            to="/staff/login"
            className="staff-mobile-logout-btn"
            onClick={() => clearStaffSession()}
            aria-label="Đăng xuất"
          >
            🚪
          </Link>
        </header>

        <Outlet />

        {/* Bottom nav chỉ hiện trên mobile */}
        <nav className="staff-bottom-nav" aria-label="Điều hướng nhanh">
          {(role === "Admin" || role === "Cashier") && (
            <MobileNavItem to="/pos" icon="" label="Thu ngân" />
          )}
          {(role === "Admin" || role === "Waiter" || role === "Cashier") && (
            <MobileNavItem to="/staff/tables" icon="" label="Bàn" />
          )}
          {(role === "Admin" || role === "Kitchen") && (
            <MobileNavItem to="/kds" icon="" label="Pha chế" />
          )}
          {(role === "Admin" || role === "Kitchen") && (
            <MobileNavItem to="/staff/inventory" icon="" label="Kho" />
          )}
          {role === "Admin" && (
            <MobileNavItem to="/admin" icon="" label="Admin" />
          )}
          <MobileNavItem to="/admin/schedule" icon="" label="Lịch tổng" />
          {(role === "Admin" || role === "Waiter" || role === "Kitchen" || role === "Cashier") && (
            <MobileNavItem to="/staff/schedule" icon="" label="Lịch" />
          )}
          {(role === "Admin" || role === "Cashier" || role === "Waiter") && (
            <MobileNavItem to="/staff/chat" icon="" label="Chat" />
          )}
          {(role === "Admin" || role === "Waiter") && (
            <MobileNavItem to="/staff/order-status" icon="" label="Mon" />
          )}
          <MobileNavItem to="/staff/attendance" icon="📍" label="Chấm công" />
        </nav>
      </div>
    </div>
  );
}
