/**
 * Cấu hình thanh điều hướng đáy (mobile) theo vai trò.
 * AppShell (nhân viên) và PublicLayout (khách) cùng đọc file này.
 *
 * Thêm vai trò mới (vd "ChainOwner", "BranchManager"): thêm một mục vào NAV_BY_ROLE.
 */
import {
  Bike,
  ArrowRightLeft,
  CalendarCheck,
  CalendarDays,
  ChefHat,
  ClipboardList,
  Clock,
  Coffee,
  FileCheck,
  FileText,
  History,
  Home,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Map as MapIcon,
  MessageSquare,
  Monitor,
  Package,
  ReceiptText,
  ShoppingBag,
  ShoppingCart,
  Store,
  Truck,
  User,
  UsersRound,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { canSee, firstPathOf, locate, visibleApps } from "../apps/registry";

/** Nguồn số badge (lấy từ socket / API hiện có — xem lib/navBadges.ts) */
export type BadgeKey = "cart" | "kds" | "deliveryNew" | "shipperOrders";

export type NavItem = {
  id: string;
  /** Nhãn đầy đủ (dùng trong sheet "Thêm") */
  label: string;
  /** Nhãn ngắn dưới icon (≤ ~10 ký tự) */
  short: string;
  icon: LucideIcon;
  to: string;
  /** Mặc định: khớp theo đường dẫn (không tính query) */
  match?: (pathname: string, search: string) => boolean;
  badge?: BadgeKey;
};

export type RoleNav = {
  /** Các tab chính theo thứ tự ưu tiên */
  primary: NavItem[];
  /** Mục bổ sung trong "Thêm" (ngoài các mục chung của nhân viên) */
  more?: NavItem[];
  /** Liệt kê mọi app còn lại vào "Thêm" (dành cho Quản lý / chủ chuỗi) */
  moreAllApps?: boolean;
};

const startsWith = (prefix: string) => (p: string) => p === prefix || p.startsWith(prefix + "/");
const withView = (path: string, view: string | null) => (p: string, s: string) =>
  p === path && (new URLSearchParams(s).get("view") ?? null) === view;

/* ─────────── Mục dùng chung ─────────── */
const I: Record<string, NavItem> = {
  home: { id: "home", label: "Trang chủ", short: "Trang chủ", icon: Home, to: "/app/overview/home" },
  attendance: { id: "attendance", label: "Chấm công", short: "Chấm công", icon: Clock, to: "/app/hr/attendance" },
  floor: { id: "floor", label: "Sơ đồ bàn", short: "Bàn", icon: LayoutGrid, to: "/app/tables/floor" },
  orderStatus: { id: "order-status", label: "Trạng thái món", short: "Món", icon: ListChecks, to: "/app/tables/order-status" },
  chat: { id: "chat", label: "Tin nhắn", short: "Tin nhắn", icon: MessageSquare, to: "/app/tables/chat" },
  pos: { id: "pos", label: "Thu ngân (POS)", short: "POS", icon: Monitor, to: "/pos" },
  onlineOrders: { id: "delivery-orders", label: "Đơn online / giao hàng", short: "Đơn online", icon: Bike, to: "/app/delivery/orders", badge: "deliveryNew" },
  kds: { id: "kds", label: "Pha chế (KDS)", short: "KDS", icon: ChefHat, to: "/app/kitchen/kds", badge: "kds" },
  schedule: { id: "schedule", label: "Bảng lịch tổng", short: "Lịch", icon: CalendarDays, to: "/app/hr/schedule" },
  // Shipper: 3 tab cùng một màn hình, phân biệt bằng ?view= (chưa có route riêng)
  shipOrders: { id: "ship-orders", label: "Đơn giao", short: "Đơn giao", icon: Package, to: "/app/delivery/shipper", match: withView("/app/delivery/shipper", null), badge: "shipperOrders" },
  shipMap: { id: "ship-map", label: "Bản đồ tuyến", short: "Bản đồ", icon: MapIcon, to: "/app/delivery/shipper?view=map", match: withView("/app/delivery/shipper", "map") },
  shipHistory: { id: "ship-history", label: "Lịch sử giao", short: "Lịch sử", icon: History, to: "/app/delivery/shipper?view=history", match: withView("/app/delivery/shipper", "history") },
  purchase: { id: "purchase", label: "Mua hàng", short: "Mua hàng", icon: ShoppingCart, to: "/app/purchase/orders" },
  suppliers: { id: "suppliers", label: "Nhà cung cấp", short: "NCC", icon: Truck, to: "/app/purchase/suppliers" },
  stock: { id: "stock", label: "Tồn kho", short: "Tồn kho", icon: Warehouse, to: "/app/inventory/stock" },
  // Quản lý: "Tổng quan / Kho / Nhân sự" khớp theo cả app
  overview: { id: "overview", label: "Tổng quan", short: "Tổng quan", icon: LayoutDashboard, to: "/app/overview/dashboard", match: (p: string) => startsWith("/app/overview")(p) && p !== "/app/overview/home" },
  // "Đơn hàng" chưa có màn riêng → màn đơn chờ thanh toán / đơn giao của POS
  orders: { id: "orders", label: "Đơn hàng", short: "Đơn hàng", icon: ReceiptText, to: "/pos", badge: "deliveryNew" },
  inventoryApp: { id: "inventory", label: "Kho", short: "Kho", icon: Warehouse, to: "/app/inventory/stock", match: startsWith("/app/inventory") },
  products: { id: "products", label: "Thực đơn & giá", short: "Thực đơn", icon: Coffee, to: "/app/sales/products" },
  employees: { id: "employees", label: "Nhân viên", short: "Nhân viên", icon: UsersRound, to: "/app/hr/employees" },
  approvals: { id: "approvals", label: "Duyệt đơn từ", short: "Duyệt", icon: FileCheck, to: "/app/hr/approvals" },
  urgentStock: { id: "urgent-stock", label: "Cần hàng gấp", short: "Hàng gấp", icon: ClipboardList, to: "/app/inventory/urgent" },
  transfers: { id: "transfers", label: "Chuyển kho", short: "Chuyển kho", icon: ArrowRightLeft, to: "/app/inventory/transfers" },
  storesCompare: { id: "stores-compare", label: "So sánh chi nhánh", short: "Chi nhánh", icon: Store, to: "/app/overview/compare" },
  stores: { id: "stores", label: "Quản lý chi nhánh", short: "Chi nhánh", icon: Store, to: "/app/settings/stores" },
  hrApp: { id: "hr", label: "Nhân sự", short: "Nhân sự", icon: UsersRound, to: "/app/hr/employees", match: (p: string) => startsWith("/app/hr")(p) && !["/app/hr/attendance", "/app/hr/schedule"].includes(p) },
};

/** Luôn có trong "Thêm" của mọi nhân viên (Đổi mật khẩu & Đăng xuất là hành động, do BottomNav vẽ) */
export const STAFF_COMMON_MORE: NavItem[] = [
  { id: "my-schedule", label: "Lịch cá nhân", short: "Lịch", icon: CalendarCheck, to: "/app/hr/my-schedule" },
  { id: "my-requests", label: "Đề xuất cá nhân", short: "Đề xuất", icon: FileText, to: "/app/hr/requests" },
  { id: "payslips", label: "Phiếu lương", short: "Lương", icon: Wallet, to: "/app/hr/payslips" },
];

export const NAV_BY_ROLE: Record<string, RoleNav> = {
  // Mọi vai trò: Trang chủ · 2 việc chính của vai trò · Chấm công; phần còn lại ở Trang chủ và "Thêm"
  Waiter: { primary: [I.home, I.floor, I.orderStatus, I.attendance], more: [I.chat] },
  Cashier: { primary: [I.home, I.pos, I.onlineOrders, I.attendance], more: [I.floor, I.chat, I.schedule] },
  // Pha chế chỉ tập trung pha chế: hết món / hao hụt / đề xuất món đều nằm trong màn KDS
  Kitchen: { primary: [I.home, I.kds, I.schedule, I.attendance], more: [] },
  Shipper: { primary: [I.home, I.shipOrders, I.shipMap, I.attendance], more: [I.shipHistory, I.schedule] },
  // Thủ kho kiểm tồn hằng ngày, sắp hết thì đặt mua hoặc nhờ chi nhánh khác chuyển gấp
  Warehouse: { primary: [I.home, I.stock, I.purchase, I.attendance], more: [I.urgentStock, I.transfers, I.suppliers] },
  // Quản lý chi nhánh: duyệt & lịch; thao tác ca nằm ở nhóm "Theo dõi ca" của Trang chủ
  Admin: { primary: [I.home, I.approvals, I.schedule, I.attendance], more: [I.overview, I.inventoryApp, I.employees], moreAllApps: true },
  // Chủ chuỗi: việc của cả chuỗi
  Owner: { primary: [I.home, I.storesCompare, I.products, I.employees], more: [I.stores, I.overview], moreAllApps: true },
};

/** Tab khách hàng (tối đa 5, không có "Thêm") */
export function customerNav(loggedIn: boolean): NavItem[] {
  return [
    { id: "home", label: "Trang chủ", short: "Trang chủ", icon: Home, to: "/", match: (p) => p === "/" },
    { id: "menu", label: "Menu", short: "Menu", icon: Coffee, to: "/menu", match: (p) => p.startsWith("/menu") || p.startsWith("/product") },
    { id: "cart", label: "Giỏ hàng", short: "Giỏ hàng", icon: ShoppingBag, to: "/cart", badge: "cart" },
    // Chưa có trang "Đơn của tôi" riêng → tab Đơn hàng trong trang Tài khoản
    {
      id: "my-orders",
      label: "Đơn của tôi",
      short: "Đơn hàng",
      icon: ReceiptText,
      to: loggedIn ? "/account?tab=orders" : "/login?next=orders",
      match: (p, s) =>
        (p === "/account" && new URLSearchParams(s).get("tab") === "orders") ||
        (p === "/login" && new URLSearchParams(s).get("next") === "orders") ||
        p.startsWith("/order/"),
    },
    {
      id: "account",
      label: "Tài khoản",
      short: "Tài khoản",
      icon: User,
      to: loggedIn ? "/account" : "/login",
      match: (p, s) =>
        (p === "/account" && new URLSearchParams(s).get("tab") !== "orders") ||
        (p === "/login" && new URLSearchParams(s).get("next") !== "orders") ||
        p === "/register",
    },
  ];
}

export function isActive(item: NavItem, pathname: string, search: string) {
  if (item.match) return item.match(pathname, search);
  const path = item.to.split("?")[0];
  return pathname === path || pathname.startsWith(path + "/");
}

/** Mục có route & vai trò được phép xem? (theo phân quyền trong apps/registry) */
function allowed(item: NavItem, role: string) {
  const path = item.to.split("?")[0];
  const found = locate(path);
  return !found || canSee(found.leaf, role);
}

export type ResolvedNav = { primary: NavItem[]; more: NavItem[]; moreApps: NavItem[] };

/** Tính tab thực tế cho một vai trò: lọc theo quyền, tối đa 4 tab + "Thêm" */
export function staffNav(role: string): ResolvedNav {
  const cfg = NAV_BY_ROLE[role] ?? { primary: [I.attendance] };
  const primaryAll = cfg.primary.filter((i) => allowed(i, role));
  const primary = primaryAll.slice(0, 4);
  const overflow = primaryAll.slice(4);
  const seen = new Set(primary.map((i) => i.to));
  const more = [...overflow, ...(cfg.more ?? []), ...STAFF_COMMON_MORE].filter((i) => {
    if (seen.has(i.to) || !allowed(i, role)) return false;
    seen.add(i.to);
    return true;
  });
  const usedApps = new Set(primary.map((i) => locate(i.to.split("?")[0])?.app.id));
  const moreApps: NavItem[] = cfg.moreAllApps
    ? visibleApps(role)
        .filter((a) => !usedApps.has(a.id))
        .map((a) => ({ id: `app-${a.id}`, label: a.label, short: a.label, icon: a.icon as LucideIcon, to: firstPathOf(a, role), match: startsWith(`/app/${a.id}`) }))
    : [];
  return { primary, more, moreApps };
}

