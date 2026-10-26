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
  Wallet,
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
const WorkSchedule = L(() => import("../pages/WorkSchedule"), "WorkSchedule");
const Schedule = L(() => import("../modules/hr/Schedule"), "Schedule");
const ShiftConfig = L(() => import("../modules/hr/ShiftConfig"), "ShiftConfig");
const StockRequests = L(() => import("../modules/inventory/StockRequests"), "StockRequests");
const ProposalList = L(() => import("../modules/sales/Proposals"), "ProposalList");
const WasteList = L(() => import("../modules/inventory/Waste"), "WasteList");
const InventoryCounts = L(() => import("../modules/inventory/Counts"), "InventoryCounts");
const AttendanceWarnings = L(() => import("../modules/hr/AttendanceWarnings"), "AttendanceWarnings");
const StaffChat = L(() => import("../pages/StaffChat"), "StaffChat");
const StaffOrderStatus = L(() => import("../pages/StaffOrderStatus"), "StaffOrderStatus");
const Attendance = L(() => import("../pages/Attendance"), "Attendance");
const StaffPayslips = L(() => import("../pages/StaffPayslips"), "StaffPayslips");
const HrRequests = L(() => import("../pages/HrRequests"), "HrRequests");
const ShipperDashboard = L(() => import("../pages/ShipperDashboard"), "ShipperDashboard");
const KitchenStats = L(() => import("../modules/kitchen/KitchenStats"), "KitchenStats");
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
const StoresCompare = L(() => import("../modules/overview/StoresCompare"), "StoresCompare");

const EmployeeList = L(() => import("../modules/hr/Employees"), "EmployeeList");
const EmployeeForm = L(() => import("../modules/hr/Employees"), "EmployeeForm");
const TaskBoard = L(() => import("../modules/hr/Tasks"), "TaskBoard");
const MyTasks = L(() => import("../modules/hr/MyTasks"), "MyTasks");
const OpenShifts = L(() => import("../modules/hr/OpenShifts"), "OpenShifts");
const Broadcast = L(() => import("../modules/hr/Broadcast"), "Broadcast");
const BranchProposals = L(() => import("../modules/overview/BranchProposals"), "BranchProposals");
const NotificationsPage = L(() => import("../modules/overview/Notifications"), "NotificationsPage");

const StockList = L(() => import("../modules/inventory/Stock"), "StockList");
const StockForm = L(() => import("../modules/inventory/Stock"), "StockForm");
const TransferList = L(() => import("../modules/inventory/Transfers"), "TransferList");

// Tài chính: két, thu chi, báo cáo ca / cuối ngày, công nợ, lãi lỗ
const Funds = L(() => import("../modules/finance/Funds"), "Funds");
const CashEntries = L(() => import("../modules/finance/Entries"), "Entries");
const ShiftReports = L(() => import("../modules/finance/Shifts"), "Shifts");
const DailyReport = L(() => import("../modules/finance/Daily"), "DailyReport");
const Payables = L(() => import("../modules/finance/Payables"), "Payables");
const ProfitLoss = L(() => import("../modules/finance/Pnl"), "ProfitLoss");

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
  /** Mô tả 1 dòng dưới tiêu đề trang (PageHeader) */
  description?: string;
  /** Trang tự vẽ PageHeader (vd dashboard có bộ chọn ngày) */
  ownHeader?: boolean;
  /** Cùng màn hình với mục `alias` của app — không hiện trong menu, sidebar tô sáng mục kia */
  alias?: string;
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
/** Nhân viên làm theo ca (không gồm quản lý) — nhận ca trống */
const SHIFT_STAFF = ["Warehouse", "Waiter", "Kitchen", "Cashier", "Shipper"];
/** Thu ngân + quản lý + chủ chuỗi (chủ chuỗi xem tổng hợp mọi chi nhánh) */
const CASH = ["Owner", "Admin", "Cashier"];
/** Quản lý vào được màn thao tác ca để hỗ trợ, nhưng không hiện trong menu thường (nhóm "Theo dõi ca" ở sidebar) */
const SUPPORT = ["Admin"];

export const APPS: AppDef[] = [
  {
    id: "overview",
    label: "Tổng quan",
    icon: LayoutDashboard,
    menus: [
      { id: "home", label: "Bảng điều khiển", roles: "all", component: Dashboard, layout: "erp", ownHeader: true },
      // Đường dẫn cũ — cùng màn hình với "home", không lặp lại trong menu
      { id: "dashboard", label: "Bảng điều khiển", roles: CHAIN_AND_BRANCH, component: Dashboard, layout: "erp", ownHeader: true, alias: "home" },
      { id: "revenue", label: "Doanh thu", description: "Tiền thực thu theo ngày, món bán chạy và danh sách đơn", roles: CHAIN_AND_BRANCH, component: Revenue, layout: "erp" },
      { id: "profit", label: "Lợi nhuận", description: "Doanh thu, giá vốn và lợi nhuận gộp theo ngày, theo món", roles: CHAIN_AND_BRANCH, component: Profit, layout: "erp" },
      { id: "notifications", label: "Thông báo", roles: "all", component: NotificationsPage, layout: "erp", ownHeader: true },
      { id: "branch-proposals", label: "Đề xuất chi nhánh", description: "Thiếu nhân sự, hư hỏng, cần cấp thêm — quản lý gửi, Chủ chuỗi duyệt", roles: CHAIN_AND_BRANCH, component: BranchProposals, layout: "erp" },
      { id: "compare", label: "So sánh chi nhánh", description: "Doanh thu, số đơn và lợi nhuận của từng chi nhánh", roles: OWNER, component: StoresCompare, layout: "erp" },
    ],
  },
  {
    id: "sales",
    label: "Thực đơn & khuyến mãi",
    icon: ShoppingBag,
    menus: [
      // Quản lý chi nhánh: xem, bật/tắt & báo hết món tại chi nhánh; giá/món do Chủ chuỗi sửa
      { id: "products", label: "Món & giá", description: "Món, giá theo size và trạng thái bán", labelFor: (r) => (r === "Admin" ? "Thực đơn chi nhánh" : "Món & giá"), roles: CHAIN_AND_BRANCH, component: ProductList, form: ProductForm, layout: "erp" },
      { id: "categories", label: "Danh mục", description: "Nhóm món hiển thị trên thực đơn", roles: OWNER, component: CategoryList, layout: "erp" },
      { id: "combos", label: "Combo", description: "Gói món bán kèm giá ưu đãi", roles: OWNER, component: AdminCombos, layout: "legacy" },
      { id: "vouchers", label: "Voucher", description: "Mã giảm giá và điều kiện áp dụng", roles: CHAIN_AND_BRANCH, component: VoucherList, form: VoucherForm, layout: "erp" },
      { id: "proposals", label: "Đề xuất món", description: "Món mới do chi nhánh đề xuất chờ duyệt", roles: CHAIN_AND_BRANCH, component: ProposalList, layout: "erp" },
      { id: "customers", label: "Khách hàng", description: "Khách thành viên, điểm tích lũy và lịch sử mua", roles: OWNER, component: CustomerList, form: CustomerForm, layout: "erp" },
      { id: "reviews", label: "Đánh giá", description: "Nhận xét của khách về món và chi nhánh", roles: CHAIN_AND_BRANCH, component: ReviewList, form: ReviewForm, layout: "erp" },
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
      { id: "zones", label: "Bàn & khu vực", description: "Khu vực và bàn của chi nhánh", roles: ADMIN, component: AdminZones, layout: "legacy" },
      { id: "qr", label: "Mã QR", description: "In mã QR gọi món tại bàn", roles: ADMIN, component: QrGenerator, props: { embedded: true }, layout: "legacy" },
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
      { id: "stats", label: "Thống kê pha chế", description: "Tổng ly đã pha, món pha nhiều nhất theo ngày / tháng", roles: ["Admin", "Kitchen"], component: KitchenStats, layout: "erp", ownHeader: true },
      { id: "formulas", label: "Công thức & giá vốn", description: "Định mức nguyên liệu và giá vốn từng món", roles: CHAIN_AND_BRANCH, component: IngredientFormula, layout: "erp" },
    ],
  },
  {
    id: "inventory",
    label: "Kho",
    icon: Warehouse,
    menus: [
      { id: "stock", label: "Tồn kho", description: "Tồn kho nguyên liệu, mức tối thiểu và lô nhập", roles: STOCK, component: StockList, form: StockForm, layout: "erp" },
      { id: "urgent", label: "Cần hàng gấp", description: "Yêu cầu hàng gấp giữa các chi nhánh", roles: STOCK, component: StockRequests, layout: "erp" },
      { id: "transfers", label: "Chuyển kho", description: "Phiếu chuyển hàng giữa các chi nhánh", roles: ["Warehouse"], component: TransferList, layout: "erp" },
      { id: "counts", label: "Kiểm kê", description: "Đếm thực tế, điều chỉnh tồn kho theo phiếu có duyệt", roles: STOCK, component: InventoryCounts, layout: "erp" },
      { id: "waste", label: "Sổ hao hụt", description: "Ghi nhận hàng hỏng, đổ, hết hạn", roles: STOCK, component: WasteList, layout: "erp" },
    ],
  },
  {
    id: "purchase",
    label: "Mua hàng",
    icon: ShoppingCart,
    menus: [
      { id: "orders", label: "Mua hàng", description: "Đề xuất mua, đơn mua và nhận hàng từ nhà cung cấp", roles: STOCK, component: ProcurementAdmin, props: { embedded: true }, layout: "legacy" },
      { id: "suppliers", label: "Nhà cung cấp", description: "Danh bạ và điều khoản nhà cung cấp", roles: ["Owner", "Warehouse"], component: SupplierList, form: SupplierForm, layout: "erp" },
    ],
  },
  {
    id: "finance",
    label: "Tài chính",
    icon: Wallet,
    menus: [
      { id: "funds", label: "Két & quỹ", description: "Số dư két tiền mặt và các quỹ", roles: CASH, component: Funds, layout: "erp" },
      { id: "entries", label: "Phiếu thu chi", description: "Phiếu thu, phiếu chi ngoài bán hàng", roles: CASH, component: CashEntries, layout: "erp" },
      { id: "shifts", label: "Báo cáo ca", description: "Tổng kết tiền và đơn theo ca thu ngân", roles: CASH, component: ShiftReports, layout: "erp" },
      { id: "daily", label: "Báo cáo cuối ngày", description: "Chốt số liệu bán hàng và tiền cuối ngày", roles: ADMIN, component: DailyReport, layout: "erp" },
      { id: "payables", label: "Công nợ NCC", description: "Khoản phải trả nhà cung cấp", roles: CHAIN_AND_BRANCH, component: Payables, layout: "erp" },
      { id: "pnl", label: "Lãi lỗ", description: "Doanh thu, chi phí và lãi lỗ theo kỳ", roles: CHAIN_AND_BRANCH, component: ProfitLoss, layout: "erp" },
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
      { id: "employees", label: "Nhân viên", description: "Hồ sơ, vai trò và trạng thái nhân viên", roles: CHAIN_AND_BRANCH, component: EmployeeList, form: EmployeeForm, layout: "erp" },
      { id: "broadcast", label: "Gửi thông báo", roles: CHAIN_AND_BRANCH, component: Broadcast, layout: "erp", ownHeader: true },
      {
        id: "work",
        label: "Công việc",
        children: [
          { id: "tasks", label: "Giao việc", description: "Giao việc trong ngày cho nhân viên và theo dõi tiến độ", roles: ADMIN, component: TaskBoard, layout: "erp", ownHeader: true },
          { id: "my-tasks", label: "Việc được giao", description: "Việc quản lý giao cho bạn — báo xong khi làm xong", roles: STAFF, component: MyTasks, layout: "erp", ownHeader: true },
        ],
      },
      {
        id: "time",
        label: "Lịch & chấm công",
        children: [
          {
            id: "schedule",
            label: "Bảng lịch tổng",
            description: "Lịch làm việc của cả chi nhánh theo tháng",
            labelFor: (r) => (r === "Admin" || r === "Owner" ? "Xếp lịch tháng" : "Bảng lịch tổng"),
            roles: STAFF,
            component: Schedule,
            layout: "erp",
          },
          { id: "my-schedule", label: "Lịch cá nhân", description: "Ca làm của bạn và đăng ký ca", roles: STAFF, component: WorkSchedule, layout: "legacy" },
          { id: "open-shifts", label: "Ca trống cần người", description: "Nhận ca của đồng nghiệp xin nghỉ — ai bấm trước được ca", roles: SHIFT_STAFF, component: OpenShifts, layout: "erp", ownHeader: true },
          { id: "attendance", label: "Chấm công", roles: "all", component: Attendance, layout: "full" },
          { id: "warnings", label: "Cảnh báo chấm công", description: "Đi muộn, về sớm, quên chấm công", roles: CHAIN_AND_BRANCH, component: AttendanceWarnings, layout: "erp" },
          { id: "shift-config", label: "Cấu hình ca & chấm công", description: "Khung giờ ca và quy tắc chấm công", roles: CHAIN_AND_BRANCH, component: ShiftConfig, layout: "erp" },
        ],
      },
      {
        id: "pay",
        label: "Bảng lương",
        children: [
          { id: "payroll", label: "Bảng lương", description: "Tính và chốt lương tháng của chi nhánh", roles: ADMIN, component: AdminPayroll, layout: "legacy" },
          { id: "payslips", label: "Phiếu lương của tôi", description: "Phiếu lương các tháng của bạn", roles: "all", component: StaffPayslips, layout: "legacy" },
        ],
      },
      {
        id: "forms",
        label: "Đơn từ",
        children: [
          { id: "approvals", label: "Duyệt đơn từ", description: "Đơn nghỉ, đổi ca, giải trình chấm công chờ duyệt", roles: ADMIN, component: AdminHrRequests, layout: "erp" },
          { id: "requests", label: "Đơn từ của tôi", description: "Gửi và theo dõi đơn nghỉ, đổi ca, giải trình", roles: STAFF, component: HrRequests, layout: "erp" },
        ],
      },
    ],
  },
  {
    id: "website",
    label: "Website",
    icon: Globe,
    menus: [{ id: "posts", label: "Bài đăng", description: "Tin tức và bài viết trên trang khách", roles: OWNER, component: PostList, form: PostForm, layout: "erp" }],
  },
  {
    id: "settings",
    label: "Cấu hình",
    icon: Cog,
    menus: [
      { id: "stores", label: "Chi nhánh", description: "Thông tin, vị trí và giờ mở cửa chi nhánh", roles: CHAIN_AND_BRANCH, component: StoreList, form: StoreForm, layout: "erp" },
      { id: "store", label: "Cài đặt chung", description: "Thông tin chuỗi, thuế, điểm thưởng, thanh toán", roles: OWNER, component: StoreSettings, layout: "erp" },
      { id: "audit", label: "Nhật ký hệ thống", description: "Lịch sử thao tác của nhân viên", roles: CHAIN_AND_BRANCH, component: AuditLog, layout: "erp" },
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

/** Có hiện trong menu không (màn "hỗ trợ ca" của quản lý nằm ở nhóm "Theo dõi ca" của sidebar) */
export const listed = (leaf: MenuLeaf, role: string) => {
  if (!canSee(leaf, role) || leaf.alias) return false;
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

/** Trang mặc định sau đăng nhập: mọi vai trò vào Bảng điều khiển (số liệu theo vai trò) */
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
  requests: "/app/inventory/stock",
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
  "/staff/inventory": "/app/inventory/stock",
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
