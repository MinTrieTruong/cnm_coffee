import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import {
  Bike,
  ChefHat,
  Cog,
  Globe,
  LayoutDashboard,
  Monitor,
  ShoppingBag,
  ShoppingCart,
  UsersRound,
  UtensilsCrossed,
  Warehouse,
} from "lucide-react";
import type { IconType } from "../components/erp";

/* ── Nạp lười từng màn hình để giảm dung lượng tải ban đầu ── */
type AnyComp = ComponentType<Record<string, unknown>>;
const L = (f: () => Promise<Record<string, unknown>>, name: string): LazyExoticComponent<AnyComp> =>
  lazy(() => f().then((m) => ({ default: m[name] as AnyComp })));

// Trang thao tác nhanh / trang sẵn có
const Pos = L(() => import("../pages/Pos"), "Pos");
const StaffTables = L(() => import("../pages/StaffTables"), "StaffTables");
const Kds = L(() => import("../pages/Kds"), "Kds");
const InventoryCheck = L(() => import("../pages/InventoryCheck"), "InventoryCheck");
const WorkSchedule = L(() => import("../pages/WorkSchedule"), "WorkSchedule");
const StaffChat = L(() => import("../pages/StaffChat"), "StaffChat");
const StaffOrderStatus = L(() => import("../pages/StaffOrderStatus"), "StaffOrderStatus");
const Attendance = L(() => import("../pages/Attendance"), "Attendance");
const StaffPayslips = L(() => import("../pages/StaffPayslips"), "StaffPayslips");
const HrRequests = L(() => import("../pages/HrRequests"), "HrRequests");
const ShipperDashboard = L(() => import("../pages/ShipperDashboard"), "ShipperDashboard");
const AdminSchedule = L(() => import("../pages/AdminSchedule"), "AdminSchedule");
const IngredientFormula = L(() => import("../pages/IngredientFormula"), "IngredientFormula");
const QrGenerator = L(() => import("../pages/QrGenerator"), "QrGenerator");
const ProcurementAdmin = L(() => import("../pages/ProcurementAdmin"), "ProcurementAdmin");
const AdminPayroll = L(() => import("../pages/AdminPayroll"), "AdminPayroll");
const AdminCombos = L(() => import("../pages/AdminCombos"), "AdminCombos");
const AdminHrRequests = L(() => import("../pages/AdminHrRequests"), "AdminHrRequests");
const AdminZones = L(() => import("../pages/AdminZones"), "AdminZones");
const DeliveryBoard = L(() => import("../modules/delivery/DeliveryBoard"), "DeliveryBoard");

// Modules ERP
const ProductList = L(() => import("../modules/sales/ProductList"), "ProductList");
const ProductForm = L(() => import("../modules/sales/ProductForm"), "ProductForm");
const CategoryList = L(() => import("../modules/sales/CategoryList"), "CategoryList");
const VoucherList = L(() => import("../modules/sales/Vouchers"), "VoucherList");
const VoucherForm = L(() => import("../modules/sales/Vouchers"), "VoucherForm");
const CustomerList = L(() => import("../modules/sales/Customers"), "CustomerList");
const CustomerForm = L(() => import("../modules/sales/Customers"), "CustomerForm");
const ReviewList = L(() => import("../modules/sales/Reviews"), "ReviewList");
const ReviewForm = L(() => import("../modules/sales/Reviews"), "ReviewForm");

const Dashboard = L(() => import("../modules/overview/Dashboard"), "Dashboard");
const Revenue = L(() => import("../modules/overview/Revenue"), "Revenue");
const Profit = L(() => import("../modules/overview/Profit"), "Profit");

const EmployeeList = L(() => import("../modules/hr/Employees"), "EmployeeList");
const EmployeeForm = L(() => import("../modules/hr/Employees"), "EmployeeForm");

const StockList = L(() => import("../modules/inventory/Stock"), "StockList");
const StockForm = L(() => import("../modules/inventory/Stock"), "StockForm");
const RequestList = L(() => import("../modules/inventory/Requests"), "RequestList");
const RequestForm = L(() => import("../modules/inventory/Requests"), "RequestForm");

const SupplierList = L(() => import("../modules/purchase/Suppliers"), "SupplierList");
const SupplierForm = L(() => import("../modules/purchase/Suppliers"), "SupplierForm");

const PostList = L(() => import("../modules/website/Posts"), "PostList");
const PostForm = L(() => import("../modules/website/Posts"), "PostForm");

const StoreSettings = L(() => import("../modules/settings/StoreSettings"), "StoreSettings");
const AuditLog = L(() => import("../modules/settings/AuditLog"), "AuditLog");

export type Layout = "erp" | "legacy" | "full";

export type MenuLeaf = {
  id: string;
  label: string;
  roles: string[] | "all";
  /** Nhãn khác theo vai trò (vd "Quản lý lịch" / "Bảng lịch tổng") */
  labelFor?: (role: string) => string;
  component: LazyExoticComponent<AnyComp>;
  props?: Record<string, unknown>;
  /** Màn hình form /app/<app>/<menu>/:id */
  form?: LazyExoticComponent<AnyComp>;
  layout: Layout;
};

export type MenuNode = MenuLeaf | { id: string; label: string; children: MenuLeaf[] };

export type AppDef = {
  id: string;
  label: string;
  icon: IconType;
  menus: MenuNode[];
  /** App mở thẳng một đường dẫn riêng (POS → /pos) */
  href?: string;
};

const ADMIN = ["Admin"];
const OPS = ["Admin", "Waiter", "Kitchen", "Cashier", "Shipper"];

export const APPS: AppDef[] = [
  {
    id: "overview",
    label: "Tổng quan",
    icon: LayoutDashboard,
    menus: [
      { id: "dashboard", label: "Bảng điều khiển", roles: ADMIN, component: Dashboard, layout: "erp" },
      { id: "revenue", label: "Doanh thu", roles: ADMIN, component: Revenue, layout: "erp" },
      { id: "profit", label: "Lợi nhuận", roles: ADMIN, component: Profit, layout: "erp" },
    ],
  },
  {
    id: "sales",
    label: "Bán hàng",
    icon: ShoppingBag,
    menus: [
      { id: "products", label: "Món & giá", roles: ADMIN, component: ProductList, form: ProductForm, layout: "erp" },
      { id: "categories", label: "Danh mục", roles: ADMIN, component: CategoryList, layout: "erp" },
      { id: "combos", label: "Combo", roles: ADMIN, component: AdminCombos, layout: "legacy" },
      { id: "vouchers", label: "Voucher", roles: ADMIN, component: VoucherList, form: VoucherForm, layout: "erp" },
      { id: "customers", label: "Khách hàng", roles: ADMIN, component: CustomerList, form: CustomerForm, layout: "erp" },
      { id: "reviews", label: "Đánh giá", roles: ADMIN, component: ReviewList, form: ReviewForm, layout: "erp" },
    ],
  },
  {
    id: "pos",
    label: "Điểm bán (POS)",
    icon: Monitor,
    href: "/pos",
    menus: [{ id: "pos", label: "Thu ngân", roles: ["Admin", "Cashier"], component: Pos, layout: "full" }],
  },
  {
    id: "tables",
    label: "Bàn & phục vụ",
    icon: UtensilsCrossed,
    menus: [
      { id: "floor", label: "Sơ đồ bàn", roles: ["Admin", "Waiter", "Cashier"], component: StaffTables, layout: "full" },
      { id: "zones", label: "Bàn & khu vực", roles: ADMIN, component: AdminZones, layout: "legacy" },
      { id: "qr", label: "Mã QR", roles: ADMIN, component: QrGenerator, props: { embedded: true }, layout: "legacy" },
      { id: "order-status", label: "Trạng thái món", roles: ["Admin", "Waiter"], component: StaffOrderStatus, layout: "full" },
      { id: "chat", label: "Tin nhắn", roles: ["Admin", "Cashier", "Waiter"], component: StaffChat, layout: "full" },
    ],
  },
  {
    id: "kitchen",
    label: "Bếp & pha chế",
    icon: ChefHat,
    menus: [
      { id: "kds", label: "KDS", roles: ["Admin", "Kitchen"], component: Kds, layout: "full" },
      { id: "formulas", label: "Định mức NL", roles: ADMIN, component: IngredientFormula, props: { embedded: true }, layout: "legacy" },
    ],
  },
  {
    id: "inventory",
    label: "Kho",
    icon: Warehouse,
    menus: [
      { id: "stock", label: "Tồn kho", roles: ADMIN, component: StockList, form: StockForm, layout: "erp" },
      { id: "check", label: "Kiểm kho", roles: ["Admin", "Kitchen"], component: InventoryCheck, layout: "full" },
      { id: "requests", label: "Phiếu xin NL", roles: ADMIN, component: RequestList, form: RequestForm, layout: "erp" },
    ],
  },
  {
    id: "purchase",
    label: "Mua hàng",
    icon: ShoppingCart,
    menus: [
      { id: "orders", label: "Mua hàng", roles: ["Admin", "Purchasing", "Manager"], component: ProcurementAdmin, props: { embedded: true }, layout: "legacy" },
      { id: "suppliers", label: "Nhà cung cấp", roles: ADMIN, component: SupplierList, form: SupplierForm, layout: "erp" },
    ],
  },
  {
    id: "delivery",
    label: "Giao hàng",
    icon: Bike,
    menus: [
      { id: "orders", label: "Trạng thái đơn", roles: ["Admin", "Cashier"], component: DeliveryBoard, layout: "legacy" },
      { id: "shipper", label: "Shipper", roles: ["Admin", "Shipper"], component: ShipperDashboard, layout: "full" },
    ],
  },
  {
    id: "hr",
    label: "Nhân sự",
    icon: UsersRound,
    menus: [
      { id: "employees", label: "Nhân viên", roles: ADMIN, component: EmployeeList, form: EmployeeForm, layout: "erp" },
      {
        id: "time",
        label: "Lịch & chấm công",
        children: [
          {
            id: "schedule",
            label: "Bảng lịch tổng",
            labelFor: (r) => (r === "Admin" || r === "Cashier" ? "Quản lý lịch" : "Bảng lịch tổng"),
            roles: ["Admin", "Cashier", "Kitchen", "Waiter", "Shipper"],
            component: AdminSchedule,
            props: { embedded: true },
            layout: "legacy",
          },
          { id: "my-schedule", label: "Lịch cá nhân", roles: OPS, component: WorkSchedule, layout: "legacy" },
          { id: "attendance", label: "Chấm công", roles: "all", component: Attendance, layout: "full" },
        ],
      },
      {
        id: "pay",
        label: "Bảng lương",
        children: [
          { id: "payroll", label: "Bảng lương", roles: ADMIN, component: AdminPayroll, layout: "legacy" },
          { id: "payslips", label: "Phiếu lương của tôi", roles: "all", component: StaffPayslips, layout: "legacy" },
        ],
      },
      {
        id: "forms",
        label: "Đơn từ",
        children: [
          { id: "approvals", label: "Duyệt đơn từ", roles: ADMIN, component: AdminHrRequests, layout: "legacy" },
          { id: "requests", label: "Đơn từ của tôi", roles: OPS, component: HrRequests, layout: "legacy" },
        ],
      },
    ],
  },
  {
    id: "website",
    label: "Website",
    icon: Globe,
    menus: [{ id: "posts", label: "Bài đăng", roles: ADMIN, component: PostList, form: PostForm, layout: "erp" }],
  },
  {
    id: "settings",
    label: "Cấu hình",
    icon: Cog,
    menus: [
      { id: "store", label: "Cài đặt cửa hàng", roles: ADMIN, component: StoreSettings, layout: "erp" },
      { id: "audit", label: "Nhật ký hệ thống", roles: ADMIN, component: AuditLog, layout: "erp" },
    ],
  },
];

/* ── Tiện ích phân quyền & điều hướng ── */
export const isLeaf = (m: MenuNode): m is MenuLeaf => !("children" in m);
export const canSee = (leaf: MenuLeaf, role: string) => leaf.roles === "all" || leaf.roles.includes(role);
export const leavesOf = (app: AppDef): MenuLeaf[] => app.menus.flatMap((m) => (isLeaf(m) ? [m] : m.children));
export const appPath = (app: AppDef, leaf: MenuLeaf) => (app.href && leaf.id === app.menus[0].id ? app.href : `/app/${app.id}/${leaf.id}`);

export function visibleApps(role: string) {
  return APPS.filter((a) => leavesOf(a).some((l) => canSee(l, role)));
}

export function firstPathOf(app: AppDef, role: string) {
  const leaf = leavesOf(app).find((l) => canSee(l, role));
  return leaf ? appPath(app, leaf) : "/staff/login";
}

/** Trang mặc định sau đăng nhập theo vai trò */
export function defaultRouteForRole(role: string): string {
  switch (role) {
    case "Admin":
      return "/app/overview/dashboard";
    case "Cashier":
      return "/pos";
    case "Kitchen":
      return "/app/kitchen/kds";
    case "Waiter":
      return "/app/tables/floor";
    case "Shipper":
      return "/app/delivery/shipper";
    case "Purchasing":
    case "Manager":
      return "/app/purchase/orders";
    default:
      return "/app/hr/attendance";
  }
}

/** Ánh xạ URL cũ → URL mới */
export const LEGACY_ADMIN_TABS: Record<string, string> = {
  dash: "/app/overview/dashboard",
  reports: "/app/overview/revenue",
  profit: "/app/overview/profit",
  products: "/app/sales/products",
  categories: "/app/sales/categories",
  combos: "/app/sales/combos",
  vouchers: "/app/sales/vouchers",
  customers: "/app/sales/customers",
  reviews: "/app/sales/reviews",
  formulas: "/app/kitchen/formulas",
  tables: "/app/tables/zones",
  zones: "/app/tables/zones",
  qr: "/app/tables/qr",
  staff: "/app/hr/employees",
  schedule: "/app/hr/schedule",
  payroll: "/app/hr/payroll",
  hrRequests: "/app/hr/approvals",
  inventory: "/app/inventory/stock",
  requests: "/app/inventory/requests",
  procurement: "/app/purchase/orders",
  suppliers: "/app/purchase/suppliers",
  posts: "/app/website/posts",
  settings: "/app/settings/store",
  audit: "/app/settings/audit",
};

export const LEGACY_PATHS: Record<string, string> = {
  "/admin/formulas": "/app/kitchen/formulas",
  "/admin/procurement": "/app/purchase/orders",
  "/admin/schedule": "/app/hr/schedule",
  "/admin/qr": "/app/tables/qr",
  "/kds": "/app/kitchen/kds",
  "/staff/tables": "/app/tables/floor",
  "/staff/inventory": "/app/inventory/check",
  "/staff/schedule": "/app/hr/my-schedule",
  "/staff/chat": "/app/tables/chat",
  "/staff/order-status": "/app/tables/order-status",
  "/staff/attendance": "/app/hr/attendance",
  "/staff/payslips": "/app/hr/payslips",
  "/staff/requests": "/app/hr/requests",
  "/staff/shipper": "/app/delivery/shipper",
};

/** Tìm app + menu ứng với đường dẫn hiện tại */
export function locate(pathname: string): { app: AppDef; leaf: MenuLeaf } | null {
  if (pathname === "/pos") {
    const app = APPS.find((a) => a.id === "pos")!;
    return { app, leaf: leavesOf(app)[0] };
  }
  const m = /^\/app\/([^/]+)\/([^/]+)/.exec(pathname);
  if (!m) return null;
  const app = APPS.find((a) => a.id === m[1]);
  const leaf = app && leavesOf(app).find((l) => l.id === m[2]);
  return app && leaf ? { app, leaf } : null;
}
