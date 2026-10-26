/**
 * Menu sidebar (desktop) và danh sách "Thêm" (mobile) — dựng tự động từ APPS trong registry.
 * Muốn đổi cách gom nhóm: sửa SIDEBAR_GROUPS. Muốn đổi icon một mục: sửa LEAF_ICONS.
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
  type LucideIcon,
  Send,
} from "lucide-react";
import { APPS, appPath, canSee, isLeaf, listed, type AppDef, type MenuLeaf } from "./registry";
import type { BadgeKey } from "../lib/navConfig";

/** Một nhóm sidebar gom một hoặc nhiều app của registry (theo thứ tự app trong mảng) */
export type SidebarGroupDef = {
  id: string;
  label: string;
  apps: string[];
  /** Nhóm chỉ chứa màn "hỗ trợ ca" (vào được nhưng không liệt kê trong menu thường) */
  support?: boolean;
};

export const SIDEBAR_GROUPS: SidebarGroupDef[] = [
  { id: "overview", label: "Tổng quan", apps: ["overview"] },
  { id: "sales", label: "Bán hàng", apps: ["pos", "tables", "delivery"] },
  { id: "products", label: "Sản phẩm", apps: ["sales", "kitchen"] },
  { id: "stock", label: "Kho & mua hàng", apps: ["inventory", "purchase"] },
  { id: "finance", label: "Tài chính", apps: ["finance"] },
  { id: "hr", label: "Nhân sự", apps: ["hr"] },
  { id: "website", label: "Website", apps: ["website"] },
  { id: "settings", label: "Cấu hình", apps: ["settings"] },
  // Quản lý chi nhánh vào các màn thao tác ca để hỗ trợ
  { id: "support", label: "Theo dõi ca", apps: ["pos", "tables", "kitchen", "delivery"], support: true },
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
  "sales/proposals": Lightbulb,
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
export type SideGroup = { id: string; label: string; items: SideItem[]; support?: boolean };

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

/** Dựng menu theo vai trò; bỏ nhóm rỗng */
export function buildSidebar(role: string): SideGroup[] {
  const groups: SideGroup[] = [];
  for (const g of SIDEBAR_GROUPS) {
    const show = (l: MenuLeaf) => (g.support ? canSee(l, role) && !listed(l, role) : listed(l, role));
    const items: SideItem[] = [];
    for (const appId of g.apps) {
      const app = APPS.find((a) => a.id === appId);
      if (!app) continue;
      for (const m of app.menus) {
        if (isLeaf(m)) {
          if (show(m)) items.push(toLeaf(app, m, role));
          continue;
        }
        const kids = m.children.filter(show).map((c) => toLeaf(app, c, role));
        if (kids.length === 1) items.push(kids[0]);
        else if (kids.length > 1) items.push({ kind: "node", key: `${app.id}/${m.id}`, label: m.label, icon: kids[0].icon, children: kids });
      }
    }
    if (items.length) groups.push({ id: g.id, label: g.label, items, support: g.support });
  }
  return groups;
}

export const leavesOfGroup = (g: SideGroup): SideLeaf[] => g.items.flatMap((i) => (i.kind === "leaf" ? [i] : i.children));
