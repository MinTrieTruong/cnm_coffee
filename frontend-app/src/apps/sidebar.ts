/**
 * Menu sidebar (desktop) và danh sách "Thêm" (mobile) — dựng tự động từ APPS trong registry.
 * Muốn đổi cách gom nhóm / thứ tự mục: sửa SIDEBAR_GROUPS. Muốn đổi icon một mục: sửa LEAF_ICONS.
 */
import {
  ArrowRightLeft,
  BarChart3,
  Bell,
  Bike,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  ChefHat,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Coins,
  FileCheck,
  FileText,
  FlaskConical,
  Globe,
  History,
  Landmark,
  LayoutDashboard,
  LayoutGrid,
  Lightbulb,
  ListChecks,
  ListTodo,
  ListTree,
  Megaphone,
  MessageSquare,
  MessageSquareQuote,
  Monitor,
  Package,
  PieChart,
  QrCode,
  ReceiptText,
  Scale,
  Settings,
  ShoppingCart,
  Siren,
  Tags,
  Ticket,
  TrendingUp,
  Truck,
  UserRound,
  Users,
  Wallet,
  Warehouse,
  Gamepad2,
  Gift,
  AppWindow,
  PhoneCall,
  Inbox,
  GalleryHorizontal,
  Building,
  Palette,
  Trophy,
  type LucideIcon,
  Send,
  Search,
  BadgePercent,
  MessageSquareWarning,
  Library,
  Bot,
  Gauge,
} from "lucide-react";
import { APPS, appPath, canSee, leavesOf, listed, type AppDef, type MenuLeaf } from "./registry";
import type { BadgeKey } from "../lib/navConfig";

/** Mục trong nhóm: khóa `app/leaf`; `roles` / `notRoles` khi cùng một mục nằm ở nhóm khác nhau theo vai trò */
type GroupEntry = string | { key: string; roles?: string[]; notRoles?: string[] };

/** Một nhóm sidebar gom từng mục lá của registry (theo thứ tự trong mảng) — đường dẫn & phân quyền vẫn theo registry */
export type SidebarGroupDef = {
  id: string;
  label: string;
  items: GroupEntry[];
  /** Thu gọn sẵn (người dùng mở ra thì nhớ lựa chọn) */
  collapsed?: boolean;
};

const MANAGERS = ["Owner", "Admin"];

/** Thứ tự theo tần suất dùng trong ngày: làm ca → món → khách → người → tiền → cài đặt → việc cá nhân */
export const SIDEBAR_GROUPS: SidebarGroupDef[] = [
  { id: "overview", label: "Tổng quan", items: ["overview/home", "overview/notifications", "hr/broadcast", "overview/branch-proposals"] },
  // Màn thao tác ca: nhân viên dùng hằng ngày, quản lý vào để hỗ trợ ca
  { id: "ops", label: "Vận hành ca", items: ["pos/pos", "tables/floor", "kitchen/kds", "tables/order-status", "delivery/orders", "delivery/shipper", "tables/chat"] },
  { id: "menu", label: "Thực đơn", items: ["sales/products", "sales/categories", "sales/combos", "kitchen/formulas", "sales/proposals"] },
  { id: "stock", label: "Kho & mua hàng", items: ["inventory/stock", "inventory/urgent", "inventory/transfers", "inventory/counts", "inventory/waste", "purchase/orders", "purchase/suppliers"] },
  {
    id: "customers",
    label: "Khách hàng & khuyến mãi",
    items: ["sales/customers", "sales/reviews", "overview/complaints", "crm/messages", "sales/vouchers", "sales/bulk-promotions", "crm/games", "crm/winners", "crm/gifts"],
  },
  { id: "ai", label: "Trí tuệ nhân tạo", items: ["ai/dashboard", "ai/agents", "ai/knowledge"] },
  {
    id: "hr",
    label: "Nhân sự",
    items: ["hr/employees", "hr/tasks", { key: "hr/schedule", roles: MANAGERS }, "hr/warnings", "hr/approvals", "hr/payroll", "hr/shift-config"],
  },
  { id: "finance", label: "Tài chính", items: ["finance/funds", "finance/entries", "finance/shifts", "finance/daily", "finance/payables"] },
  { id: "reports", label: "Báo cáo", items: ["overview/revenue", "overview/profit", "finance/pnl", "kitchen/stats", "sales/search", "overview/compare"] },
  { id: "website", label: "Website", collapsed: true, items: ["website/banners", "crm/popups", "settings/contact", "website/posts", "website/theme", "website/company"] },
  { id: "settings", label: "Cấu hình", collapsed: true, items: ["settings/stores", "tables/zones", "tables/qr", "settings/store", "settings/audit"] },
  {
    id: "mine",
    label: "Của tôi",
    items: ["hr/attendance", "hr/my-schedule", { key: "hr/schedule", notRoles: MANAGERS }, "hr/open-shifts", "hr/my-tasks", "hr/payslips", "hr/requests"],
  },
];

/** Icon từng mục lá, khóa `app/leaf`; thiếu thì dùng icon của app */
const LEAF_ICONS: Record<string, LucideIcon> = {
  "overview/home": LayoutDashboard,
  "overview/notifications": Bell,
  "hr/broadcast": Megaphone,
  "overview/revenue": TrendingUp,
  "overview/profit": PieChart,
  "overview/compare": Scale,
  "overview/branch-proposals": Send,
  "overview/complaints": MessageSquareWarning,
  "pos/pos": Monitor,
  "tables/floor": LayoutGrid,
  "tables/zones": Building2,
  "tables/qr": QrCode,
  "tables/order-status": ListChecks,
  "tables/chat": MessageSquare,
  "delivery/orders": Bike,
  "delivery/shipper": Truck,
  "sales/products": Tags,
  "sales/categories": ListTree,
  "sales/combos": Package,
  "sales/vouchers": Ticket,
  "crm/games": Gamepad2,
  "crm/winners": Trophy,
  "crm/gifts": Gift,
  "crm/popups": AppWindow,
  "settings/contact": PhoneCall,
  "crm/messages": Inbox,
  "website/banners": GalleryHorizontal,
  "website/company": Building,
  "website/theme": Palette,
  "sales/bulk-promotions": BadgePercent,
  "sales/proposals": Lightbulb,
  "sales/search": Search,
  "sales/customers": UserRound,
  "sales/reviews": MessageSquareQuote,
  "kitchen/kds": ChefHat,
  "kitchen/stats": BarChart3,
  "kitchen/formulas": FlaskConical,
  "inventory/stock": Warehouse,
  "inventory/urgent": Siren,
  "inventory/transfers": ArrowRightLeft,
  "inventory/waste": ClipboardCheck,
  "inventory/counts": ListChecks,
  "purchase/orders": ShoppingCart,
  "purchase/suppliers": Truck,
  "finance/funds": Landmark,
  "finance/entries": ReceiptText,
  "finance/shifts": ClipboardList,
  "finance/daily": CalendarCheck,
  "finance/payables": Coins,
  "finance/pnl": BarChart3,
  "hr/employees": Users,
  "hr/tasks": ClipboardCheck,
  "hr/my-tasks": ListTodo,
  "hr/schedule": CalendarDays,
  "hr/my-schedule": CalendarCheck,
  "hr/open-shifts": CalendarPlus,
  "hr/attendance": Clock,
  "hr/warnings": Siren,
  "hr/shift-config": Settings,
  "hr/payroll": Wallet,
  "hr/payslips": Wallet,
  "hr/approvals": FileCheck,
  "hr/requests": FileText,
  "website/posts": Globe,
  "settings/stores": Building2,
  "settings/store": Settings,
  "settings/audit": History,
  "ai/knowledge": Library,
  "ai/agents": Bot,
  "ai/dashboard": Gauge,
};

/** Nhãn riêng khi nhiều app gom chung một nhóm dễ trùng nghĩa */
const LEAF_LABELS: Record<string, string> = {
  "delivery/orders": "Đơn giao hàng",
  "purchase/orders": "Đơn mua hàng",
};

/** Số badge từ useStaffBadges */
export const LEAF_BADGES: Record<string, BadgeKey> = {
  "kitchen/kds": "kds",
  "delivery/orders": "deliveryNew",
  "delivery/shipper": "shipperOrders",
  "overview/notifications": "notifications",
  "overview/branch-proposals": "branchProposals",
  "hr/my-tasks": "tasks",
  "hr/open-shifts": "openShifts",
  "hr/attendance": "attendance",
  "hr/approvals": "approvals",
  "purchase/orders": "purchase",
  "sales/proposals": "proposals",
  "inventory/stock": "lowStock",
  "inventory/transfers": "transfers",
  "inventory/urgent": "urgentStock",
  "inventory/counts": "inventoryCounts",
};

export type SideLeaf = { kind: "leaf"; key: string; label: string; to: string; icon: LucideIcon; badge?: BadgeKey; app: AppDef; leaf: MenuLeaf };
export type SideNode = { kind: "node"; key: string; label: string; icon: LucideIcon; children: SideLeaf[] };
export type SideItem = SideLeaf | SideNode;
export type SideGroup = { id: string; label: string; items: SideItem[]; collapsed?: boolean };

const keyOf = (app: AppDef, leaf: MenuLeaf) => `${app.id}/${leaf.id}`;

function toLeaf(app: AppDef, leaf: MenuLeaf, role: string): SideLeaf {
  const key = keyOf(app, leaf);
  return {
    kind: "leaf",
    key,
    label: LEAF_LABELS[key] ?? (leaf.labelFor ? leaf.labelFor(role) : leaf.label),
    to: appPath(app, leaf),
    icon: LEAF_ICONS[key] ?? (app.icon as LucideIcon),
    badge: LEAF_BADGES[key],
    app,
    leaf,
  };
}

/** Hiện trong menu: mục thường của vai trò, hoặc màn thao tác ca mà quản lý vào để hỗ trợ */
const showLeaf = (l: MenuLeaf, role: string) => listed(l, role) || (!!l.supportFor && canSee(l, role) && !l.alias && !l.hidden);

/** Dựng menu theo vai trò; bỏ nhóm rỗng. Mục registry chưa xếp nhóm nào rơi vào nhóm "Khác" để không bị mất */
export function buildSidebar(role: string): SideGroup[] {
  const all = new Map<string, { app: AppDef; leaf: MenuLeaf }>();
  for (const app of APPS) for (const leaf of leavesOf(app)) all.set(keyOf(app, leaf), { app, leaf });

  const placed = new Set<string>();
  const groups: SideGroup[] = [];
  for (const g of SIDEBAR_GROUPS) {
    const items: SideItem[] = [];
    for (const e of g.items) {
      const { key, roles, notRoles } = typeof e === "string" ? { key: e, roles: undefined, notRoles: undefined } : e;
      if ((roles && !roles.includes(role)) || notRoles?.includes(role)) continue;
      const hit = all.get(key);
      if (!hit || placed.has(key) || !showLeaf(hit.leaf, role)) continue;
      placed.add(key);
      items.push(toLeaf(hit.app, hit.leaf, role));
    }
    if (items.length) groups.push({ id: g.id, label: g.label, items, collapsed: g.collapsed });
  }
  const rest = [...all].filter(([k, { leaf }]) => !placed.has(k) && showLeaf(leaf, role)).map(([, { app, leaf }]) => toLeaf(app, leaf, role));
  if (rest.length) groups.push({ id: "other", label: "Khác", items: rest });
  return groups;
}

export const leavesOfGroup = (g: SideGroup): SideLeaf[] => g.items.flatMap((i) => (i.kind === "leaf" ? [i] : i.children));
