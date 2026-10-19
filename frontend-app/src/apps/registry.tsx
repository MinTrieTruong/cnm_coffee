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
import { getOwnerStore } from "../lib/staffApi";

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

const Home = L(() => import("../modules/overview/Home"), "Home");
const Dashboard = L(() => import("../modules/overview/Dashboard"), "Dashboard");
const Revenue = L(() => import("../modules/overview/Revenue"), "Revenue");
const Profit = L(() => import("../modules/overview/Profit"), "Profit");
const StoresCompare = L(() => import("../modules/overview/StoresCompare"), "StoresCompare");

const EmployeeList = L(() => import("../modules/hr/Employees"), "EmployeeList");
const EmployeeForm = L(() => import("../modules/hr/Employees"), "EmployeeForm");

const StockList = L(() => import("../modules/inventory/Stock"), "StockList");
const StockForm = L(() => import("../modules/inventory/Stock"), "StockForm");
const RequestList = L(() => import("../modules/inventory/Requests"), "RequestList");
const RequestForm = L(() => import("../modules/inventory/Requests"), "RequestForm");
const TransferList = L(() => import("../modules/inventory/Transfers"), "TransferList");

const SupplierList = L(() => import("../modules/purchase/Suppliers"), "SupplierList");
const SupplierForm = L(() => import("../modules/purchase/Suppliers"), "SupplierForm");

const PostList = L(() => import("../modules/website/Posts"), "PostList");
const PostForm = L(() => import("../modules/website/Posts"), "PostForm");

const StoreSettings = L(() => import("../modules/settings/StoreSettings"), "StoreSettings");
const AuditLog = L(() => import("../modules/settings/AuditLog"), "AuditLog");
const StoreList = L(() => import("../modules/settings/Stores"), "StoreList");
const StoreForm = L(() => import("../modules/settings/Stores"), "StoreForm");

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
  /** Vai trò vào được để hỗ trợ ca nhưng không hiện trong menu */
  supportFor?: string[];
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

/* ── Nhóm vai trò (xem lib/roles.ts) ── */
/** Chủ chuỗi: dữ liệu dùng chung cả chuỗi */
const OWNER = ["Owner"];
/** Quản lý chi nhánh (Owner thấy thêm các mục này khi đang chọn 1 chi nhánh — xem canSee) */
const ADMIN = ["Admin"];
const CHAIN_AND_BRANCH = ["Owner", "Admin"];
const STOCK = ["Admin", "Warehouse"];
/** Nhân viên có lịch/đơn từ cá nhân */
const STAFF = ["Admin", "Warehouse", "Waiter", "Kitchen", "Cashier", "Shipper"];
/** Quản lý vào được màn thao tác ca để hỗ trợ, nhưng không hiện trong menu (nhóm "Theo dõi ca" ở Trang chủ) */
const SUPPORT = ["Admin"];

export const APPS: AppDef[] = [
  {
    id: "overview",
    label: "Tổng quan",
    icon: LayoutDashboard,
    menus: [
      { id: "home", label: "Trang chủ", roles: "all", component: Home, layout: "full" },
      { id: "dashboard", label: "Bảng điều khiển", roles: CHAIN_AND_BRANCH, component: Dashboard, layout: "erp" },
      { id: "revenue", label: "Doanh thu", roles: CHAIN_AND_BRANCH, component: Revenue, layout: "erp" },
      { id: "profit", label: "Lợi nhuận", roles: CHAIN_AND_BRANCH, component: Profit, layout: "erp" },
      { id: "compare", label: "So sánh chi nhánh", roles: OWNER, component: StoresCompare, layout: "erp" },
    ],
  },
  {
    id: "sales",
    label: "Thực đơn & khuyến mãi",
    icon: ShoppingBag,
    menus: [
      // Quản lý chi nhánh: xem, bật/tắt & báo hết món tại chi nhánh; giá/món do Chủ chuỗi sửa
      { id: "products", label: "Món & giá", labelFor: (r) => (r === "Admin" ? "Thực đơn chi nhánh" : "Món & giá"), roles: CHAIN_AND_BRANCH, component: ProductList, form: ProductForm, layout: "erp" },
      { id: "categories", label: "Danh mục", roles: OWNER, component: CategoryList, layout: "erp" },
      { id: "combos", label: "Combo", roles: OWNER, component: AdminCombos, layout: "legacy" },
      { id: "vouchers", label: "Voucher", roles: CHAIN_AND_BRANCH, component: VoucherList, form: VoucherForm, layout: "erp" },
      { id: "customers", label: "Khách hàng", roles: OWNER, component: CustomerList, form: CustomerForm, layout: "erp" },
      { id: "reviews", label: "Đánh giá", roles: CHAIN_AND_BRANCH, component: ReviewList, form: ReviewForm, layout: "erp" },
    ],
  },
  {
    id: "pos",
    label: "Điểm bán (POS)",
    icon: Monitor,
    href: "/pos",
    menus: [{ id: "pos", label: "Thu ngân", roles: ["Admin", "Cashier"], supportFor: SUPPORT, component: Pos, layout: "full" }],
  },
  {
    id: "tables",
    label: "Bàn & phục vụ",
    icon: UtensilsCrossed,
    menus: [
      { id: "floor", label: "Sơ đồ bàn", roles: ["Admin", "Waiter", "Cashier"], supportFor: SUPPORT, component: StaffTables, layout: "full" },
      { id: "zones", label: "Bàn & khu vực", roles: ADMIN, component: AdminZones, layout: "legacy" },
      { id: "qr", label: "Mã QR", roles: ADMIN, component: QrGenerator, props: { embedded: true }, layout: "legacy" },
      { id: "order-status", label: "Trạng thái món", roles: ["Admin", "Waiter"], supportFor: SUPPORT, component: StaffOrderStatus, layout: "full" },
      { id: "chat", label: "Tin nhắn", roles: ["Admin", "Cashier", "Waiter"], supportFor: SUPPORT, component: StaffChat, layout: "full" },
    ],
  },
  {
    id: "kitchen",
    label: "Bếp & pha chế",
    icon: ChefHat,
    menus: [
      { id: "kds", label: "KDS", roles: ["Admin", "Kitchen"], supportFor: SUPPORT, component: Kds, layout: "full" },
      { id: "formulas", label: "Định mức NL", roles: OWNER, component: IngredientFormula, props: { embedded: true }, layout: "legacy" },
    ],
  },
  {
    id: "inventory",
    label: "Kho",
    icon: Warehouse,
    menus: [
      { id: "stock", label: "Tồn kho", roles: STOCK, component: StockList, form: StockForm, layout: "erp" },
      { id: "check", label: "Kiểm kho", roles: ["Warehouse", "Kitchen"], component: InventoryCheck, layout: "full" },
      { id: "requests", label: "Phiếu xin NL", roles: STOCK, component: RequestList, form: RequestForm, layout: "erp" },
      { id: "transfers", label: "Chuyển kho", roles: ["Warehouse"], component: TransferList, layout: "erp" },
    ],
  },
  {
    id: "purchase",
    label: "Mua hàng",
    icon: ShoppingCart,
    menus: [
      { id: "orders", label: "Mua hàng", roles: STOCK, component: ProcurementAdmin, props: { embedded: true }, layout: "legacy" },
      { id: "suppliers", label: "Nhà cung cấp", roles: ["Owner", "Warehouse"], component: SupplierList, form: SupplierForm, layout: "erp" },
    ],
  },
  {
    id: "delivery",
    label: "Giao hàng",
    icon: Bike,
    menus: [
      { id: "orders", label: "Trạng thái đơn", roles: ["Admin", "Cashier"], supportFor: SUPPORT, component: DeliveryBoard, layout: "legacy" },
      { id: "shipper", label: "Shipper", roles: ["Shipper"], component: ShipperDashboard, layout: "full" },
    ],
  },
  {
    id: "hr",
    label: "Nhân sự",
    icon: UsersRound,
    menus: [
      { id: "employees", label: "Nhân viên", roles: CHAIN_AND_BRANCH, component: EmployeeList, form: EmployeeForm, layout: "erp" },
      {
        id: "time",
        label: "Lịch & chấm công",
        children: [
          {
            id: "schedule",
            label: "Bảng lịch tổng",
            labelFor: (r) => (r === "Admin" || r === "Owner" ? "Quản lý lịch" : "Bảng lịch tổng"),
            roles: STAFF,
            component: AdminSchedule,
            props: { embedded: true },
            layout: "legacy",
          },
          { id: "my-schedule", label: "Lịch cá nhân", roles: STAFF, component: WorkSchedule, layout: "legacy" },
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
          { id: "requests", label: "Đơn từ của tôi", roles: STAFF, component: HrRequests, layout: "legacy" },
        ],
      },
    ],
  },
  {
    id: "website",
    label: "Website",
    icon: Globe,
    menus: [{ id: "posts", label: "Bài đăng", roles: OWNER, component: PostList, form: PostForm, layout: "erp" }],
  },
  {
    id: "settings",
    label: "Cấu hình",
    icon: Cog,
    menus: [
      { id: "stores", label: "Chi nhánh", roles: CHAIN_AND_BRANCH, component: StoreList, form: StoreForm, layout: "erp" },
      { id: "store", label: "Cài đặt chung", roles: OWNER, component: StoreSettings, layout: "erp" },
      { id: "audit", label: "Nhật ký hệ thống", roles: CHAIN_AND_BRANCH, component: AuditLog, layout: "erp" },
    ],
  },
];

/* ── Tiện ích phân quyền & điều hướng ── */
export const isLeaf = (m: MenuNode): m is MenuLeaf => !("children" in m);

/**
 * Vai trò được mở màn hình này không.
 * Chủ chuỗi thấy thêm mục của Quản lý chi nhánh khi đang chọn 1 chi nhánh
 * (ở chế độ "Tất cả chi nhánh" chỉ thấy việc của chuỗi).
 */
export const canSee = (leaf: MenuLeaf, role: string) =>
  leaf.roles === "all" ||
  leaf.roles.includes(role) ||
  (role === "Owner" && leaf.roles.includes("Admin") && getOwnerStore() != null);

/** Có hiện trong menu/lưới ứng dụng không (màn "hỗ trợ ca" của quản lý chỉ mở từ Trang chủ) */
export const listed = (leaf: MenuLeaf, role: string) => {
  if (!canSee(leaf, role)) return false;
  const support = leaf.supportFor ?? [];
  return !(support.includes(role) || (role === "Owner" && support.includes("Admin") && !leaf.roles.includes("Owner")));
};

export const leavesOf = (app: AppDef): MenuLeaf[] => app.menus.flatMap((m) => (isLeaf(m) ? [m] : m.children));
export const appPath = (app: AppDef, leaf: MenuLeaf) => (app.href && leaf.id === app.menus[0].id ? app.href : `/app/${app.id}/${leaf.id}`);

export function visibleApps(role: string) {
  return APPS.filter((a) => leavesOf(a).some((l) => listed(l, role)));
}

export function firstPathOf(app: AppDef, role: string) {
  const leaf = leavesOf(app).find((l) => listed(l, role)) ?? leavesOf(app).find((l) => canSee(l, role));
  return leaf ? appPath(app, leaf) : "/staff/login";
}

/** Trang mặc định sau đăng nhập: mọi vai trò vào Trang chủ (ca hôm nay + chức năng theo nhóm) */
export function defaultRouteForRole(_role: string): string {
  return "/app/overview/home";
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
