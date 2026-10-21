import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowRightLeft,
  BarChart3,
  Bike,
  Building2,
  Calculator,
  CalendarCheck,
  CalendarDays,
  ChefHat,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Coffee,
  FileCheck,
  FileText,
  Globe,
  History,
  LayoutGrid,
  ListTree,
  MessageSquare,
  MessageSquareQuote,
  Monitor,
  Package,
  PieChart,
  QrCode,
  Scale,
  Settings,
  ShoppingCart,
  Star,
  Tags,
  Ticket,
  TrendingUp,
  Truck,
  UserRound,
  Users,
  Wallet,
  Warehouse,
  Lightbulb,
} from "lucide-react";
import { APPS, appPath, canSee, leavesOf, listed } from "../../apps/registry";
import { activeStoreId, getStaffInfo, isAdminRole } from "../../lib/staffApi";
import { roleLabel } from "../../lib/roles";
import { Alert, formatVnd, type IconType } from "../../components/erp";
import { useResource } from "../shared";

type Pending = {
  lowStock: number;
  urgentFromOthers: number;
  menuProposals: number;
  leave: number;
  swap: number;
  adjust: number;
  purchaseRequisitions: number;
  incomingTransfers: number;
  openPurchaseOrders: number;
};
type Stats = {
  todayOrders?: number;
  todayRevenue?: number;
  monthRevenue?: number;
  pending: Pending;
};
type Schedule = {
  id: number;
  shiftCode: string;
  shiftName?: string;
  startMin: number;
  endMin: number;
  actualCheckIn: string | null;
  actualCheckOut: string | null;
};

/** Một ô chức năng: trỏ tới menu `appId/leafId` trong registry */
type Shortcut = { app: string; leaf: string; label?: string; icon: IconType };
/** `support`: màn thao tác ca quản lý vào để hỗ trợ (không hiện trong menu) */
type Group = { title: string; items: Shortcut[]; support?: boolean };

const S = (app: string, leaf: string, icon: IconType, label?: string): Shortcut => ({ app, leaf, icon, label });

const PERSONAL: Group = {
  title: "Cá nhân",
  items: [
    S("hr", "attendance", Clock),
    S("hr", "my-schedule", CalendarCheck),
    S("hr", "schedule", CalendarDays, "Lịch tổng"),
    S("hr", "requests", FileText),
    S("hr", "payslips", Wallet, "Phiếu lương"),
  ],
};

/** Nhóm chức năng ở Trang chủ theo vai trò (vẫn lọc thêm theo quyền trong registry) */
const HOME_BY_ROLE: Record<string, Group[]> = {
  Owner: [
    {
      title: "Thực đơn & khuyến mãi",
      items: [S("sales", "products", Tags), S("sales", "proposals", Lightbulb), S("sales", "categories", ListTree), S("sales", "combos", Package), S("kitchen", "formulas", ClipboardList), S("sales", "vouchers", Ticket)],
    },
    {
      title: "Khách hàng & website",
      items: [S("sales", "customers", UserRound), S("sales", "reviews", Star), S("website", "posts", Globe)],
    },
    {
      title: "Chi nhánh & nhân sự",
      items: [S("settings", "stores", Building2), S("hr", "employees", Users), S("purchase", "suppliers", Truck)],
    },
    {
      title: "Báo cáo & cấu hình",
      items: [
        S("overview", "compare", Scale, "So sánh CN"),
        S("overview", "dashboard", BarChart3, "Chỉ số"),
        S("overview", "revenue", TrendingUp),
        S("overview", "profit", PieChart),
        S("settings", "store", Settings),
        S("settings", "audit", History),
      ],
    },
    // Chỉ hiện khi Chủ chuỗi đang chọn 1 chi nhánh (canSee)
    {
      title: "Vận hành chi nhánh đang chọn",
      items: [
        S("hr", "approvals", FileCheck),
        S("hr", "schedule", CalendarDays, "Lịch tổng"),
        S("hr", "payroll", Calculator),
        S("inventory", "stock", Warehouse),
        S("purchase", "orders", ShoppingCart),
        S("tables", "zones", LayoutGrid),
      ],
    },
  ],
  Admin: [
    {
      title: "Nhân sự chi nhánh",
      items: [
        S("hr", "employees", Users),
        S("hr", "schedule", CalendarDays, "Quản lý lịch"),
        S("hr", "approvals", FileCheck),
        S("hr", "payroll", Calculator),
        S("hr", "attendance", Clock),
      ],
    },
    {
      title: "Kho & mua hàng",
      items: [S("purchase", "orders", ShoppingCart, "Duyệt mua hàng"), S("inventory", "stock", Warehouse), S("inventory", "urgent", ClipboardList)],
    },
    {
      title: "Bàn & thực đơn chi nhánh",
      items: [
        S("sales", "products", Tags, "Thực đơn CN"),
        S("tables", "zones", LayoutGrid),
        S("tables", "qr", QrCode),
        S("sales", "vouchers", Ticket),
        S("sales", "reviews", MessageSquareQuote),
      ],
    },
    {
      title: "Báo cáo chi nhánh",
      items: [
        S("overview", "dashboard", BarChart3, "Chỉ số"),
        S("overview", "revenue", TrendingUp),
        S("overview", "profit", PieChart),
        S("settings", "stores", Building2, "Chi nhánh"),
        S("settings", "audit", History),
      ],
    },
    {
      title: "Theo dõi ca",
      support: true,
      items: [
        S("pos", "pos", Monitor, "Thu ngân"),
        S("tables", "floor", LayoutGrid),
        S("kitchen", "kds", ChefHat, "Pha chế"),
        S("tables", "order-status", Coffee),
        S("delivery", "orders", Bike, "Đơn giao"),
        S("tables", "chat", MessageSquare),
      ],
    },
    { ...PERSONAL, items: PERSONAL.items.filter((i) => i.leaf !== "attendance" && i.leaf !== "schedule") },
  ],
  Warehouse: [
    {
      title: "Kho",
      items: [S("inventory", "stock", Warehouse), S("inventory", "urgent", ClipboardList), S("inventory", "transfers", ArrowRightLeft), S("inventory", "waste", ClipboardCheck)],
    },
    {
      title: "Mua hàng",
      items: [S("purchase", "orders", ShoppingCart), S("purchase", "suppliers", Truck)],
    },
    PERSONAL,
  ],
};

/** Thu ngân, phục vụ, pha chế, shipper: việc trong ca + cá nhân */
const FRONTLINE: Group[] = [
  {
    title: "Công việc trong ca",
    items: [
      S("pos", "pos", Monitor, "Thu ngân"),
      S("tables", "floor", LayoutGrid),
      S("kitchen", "kds", ChefHat, "Pha chế"),
      S("tables", "order-status", Coffee),
      S("delivery", "orders", Bike, "Đơn giao"),
      S("delivery", "shipper", Truck, "Đơn của tôi"),
      S("tables", "chat", MessageSquare),
    ],
  },
  PERSONAL,
];

function resolve(s: Shortcut, role: string, support: boolean) {
  const app = APPS.find((a) => a.id === s.app);
  const leaf = app && leavesOf(app).find((l) => l.id === s.leaf);
  if (!app || !leaf || !(support ? canSee(leaf, role) : listed(leaf, role))) return null;
  return { to: appPath(app, leaf), label: s.label ?? leaf.label, icon: s.icon };
}

const pad = (n: number) => String(n).padStart(2, "0");
const minToTime = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const clock = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Chào buổi sáng";
  if (h < 14) return "Chào buổi trưa";
  if (h < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

/** Việc chờ xử lý theo vai trò */
function todoItems(role: string, p: Pending) {
  if (role === "Warehouse") {
    return [
      { n: p.lowStock, text: "nguyên liệu sắp hết — cần đặt hàng", to: "/app/inventory/stock" },
      { n: p.urgentFromOthers, text: "chi nhánh khác đang cần hàng gấp", to: "/app/inventory/urgent" },
      { n: p.incomingTransfers, text: "phiếu chuyển kho chờ nhận", to: "/app/inventory/transfers" },
      { n: p.openPurchaseOrders, text: "đơn mua hàng chờ nhận hàng", to: "/app/purchase/orders" },
    ];
  }
  return [
    ...(role === "Owner" ? [{ n: p.menuProposals, text: "đề xuất món mới chờ duyệt", to: "/app/sales/proposals" }] : []),
    { n: p.lowStock, text: "nguyên liệu sắp hết", to: "/app/inventory/stock" },
    { n: p.leave, text: "đơn xin nghỉ chờ duyệt", to: "/app/hr/approvals" },
    { n: p.swap, text: "đề nghị đổi ca chờ duyệt", to: "/app/hr/approvals" },
    { n: p.adjust, text: "giải trình chấm công chờ duyệt", to: "/app/hr/approvals" },
    { n: p.purchaseRequisitions, text: "đề xuất mua hàng chờ duyệt", to: "/app/purchase/orders" },
  ];
}

/** Tổng quan › Trang chủ — điểm bắt đầu của mọi vai trò */
export function Home() {
  const info = getStaffInfo();
  const role = info?.role ?? "";
  const admin = isAdminRole(role);
  const owner = role === "Owner";
  const allStores = owner && activeStoreId() == null;
  const stats = useResource<Stats | null>(admin || role === "Warehouse" ? "/api/admin/stats" : null, null);
  const today = useResource<{ schedules: Schedule[] }>("/api/attendance/today", { schedules: [] });
  // Chủ chuỗi đang chọn 1 chi nhánh: lấy tên để hiển thị
  const stores = useResource<{ id: number; name: string }[]>(owner && !allStores ? "/api/stores" : null, []);

  const groups = (HOME_BY_ROLE[role] ?? FRONTLINE)
    .map((g) => ({
      title: g.title,
      support: !!g.support,
      items: g.items.map((s) => resolve(s, role, !!g.support)).filter((x): x is NonNullable<typeof x> => !!x),
    }))
    .filter((g) => g.items.length > 0);

  // Việc chờ là của 1 chi nhánh — Chủ chuỗi xem "tất cả" thì chỉ hiện đề xuất món (việc của cả chuỗi)
  const todos = stats.data
    ? todoItems(role, stats.data.pending).filter((t) => t.n > 0 && (!allStores || t.to === "/app/sales/proposals"))
    : null;

  const storeLabel = info?.storeName ?? (allStores ? "Tất cả chi nhánh" : stores.data.find((s) => s.id === activeStoreId())?.name ?? null);
  const dateLabel = new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" });

  return (
    <div className="o-home">
      <header className="o-home-head">
        <h1 className="o-home-title">{greeting()}, {info?.fullName ?? "bạn"}</h1>
        <p className="o-home-sub">
          {roleLabel(role)}
          {storeLabel && <> · {storeLabel}</>}
          {" · "}
          <span className="o-home-date">{dateLabel}</span>
        </p>
      </header>

      {/* Chủ chuỗi không chấm công theo ca */}
      {!owner && <ShiftCard schedules={today.data.schedules} loading={today.loading} />}

      {stats.error && <Alert>{stats.error}</Alert>}

      {todos && (
        <section className="o-home-todo" aria-labelledby="home-todo">
          <h2 id="home-todo" className="o-home-group-title">{role === "Warehouse" ? "Cần làm" : "Cần xử lý"}</h2>
          {todos.length === 0 ? (
            <p className="o-home-todo-empty">Không có việc nào đang chờ.</p>
          ) : (
            <ul className="o-home-todo-list">
              {todos.map((t) => (
                <li key={t.text}>
                  <Link to={t.to} className="o-home-todo-item">
                    <span className="o-home-todo-count">{t.n}</span>
                    <span className="o-home-todo-text">{t.text}</span>
                    <ChevronRight size={16} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {admin && stats.data && (
        <section aria-label="Hôm nay">
          <div className="o-home-stats">
            <StatTile label="Doanh thu hôm nay" value={formatVnd(stats.data.todayRevenue ?? 0)} to="/app/overview/revenue" />
            <StatTile label="Đơn đã thanh toán" value={stats.data.todayOrders ?? 0} to="/app/overview/revenue" />
            <StatTile label="Doanh thu tháng" value={formatVnd(stats.data.monthRevenue ?? 0)} to="/app/overview/profit" />
            {owner && <StatTile label="So sánh chi nhánh" value="Xem bảng" to="/app/overview/compare" />}
          </div>
        </section>
      )}

      <div className="o-home-groups">
        {groups.map((g) => (
          <section key={g.title} className={g.support ? "o-home-group is-support" : "o-home-group"} aria-labelledby={`grp-${g.title}`}>
            <h2 id={`grp-${g.title}`} className="o-home-group-title">{g.title}</h2>
            <div className="o-home-tiles">
              {g.items.map((it) => {
                const Icon = it.icon;
                return (
                  <Link key={it.to} to={it.to} className="o-home-tile">
                    <span className="o-home-tile-icon"><Icon aria-hidden /></span>
                    <span className="o-home-tile-label">{it.label}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ShiftCard({ schedules, loading }: { schedules: Schedule[]; loading: boolean }) {
  // Ca đang làm, nếu không thì ca sắp tới chưa vào
  const cur = schedules.find((s) => s.actualCheckIn && !s.actualCheckOut) ?? schedules.find((s) => !s.actualCheckIn);
  const done = schedules.length > 0 && !cur;

  let title = "Hôm nay bạn không có ca";
  let detail = "Xem lịch cá nhân để đăng ký ca.";
  let cta = "Mở chấm công";
  let state: "idle" | "due" | "working" | "done" = "idle";
  if (loading) {
    title = "Đang tải ca hôm nay…";
    detail = "";
  } else if (cur?.actualCheckIn) {
    state = "working";
    title = `Đang trong ${cur.shiftName ?? `ca ${cur.shiftCode}`} · ${minToTime(cur.startMin)}–${minToTime(cur.endMin)}`;
    detail = `Vào ca lúc ${clock(cur.actualCheckIn)}. Nhớ chấm công khi ra về.`;
    cta = "Chấm công ra";
  } else if (cur) {
    state = "due";
    title = `${cur.shiftName ?? `Ca ${cur.shiftCode}`} · ${minToTime(cur.startMin)}–${minToTime(cur.endMin)}`;
    detail = "Bạn chưa chấm công vào ca.";
    cta = "Chấm công vào";
  } else if (done) {
    state = "done";
    title = "Đã xong các ca hôm nay";
    detail = `${schedules.length} ca đã chấm công đủ.`;
  }

  return (
    <section className={`o-home-shift is-${state}`} aria-label="Ca làm hôm nay">
      <span className="o-home-shift-icon"><Clock aria-hidden /></span>
      <div className="o-home-shift-text">
        <div className="o-home-shift-title">{title}</div>
        {detail && <div className="o-home-shift-detail">{detail}</div>}
      </div>
      <Link to="/app/hr/attendance" className={state === "due" || state === "working" ? "o-btn o-btn-primary o-home-shift-cta" : "o-btn o-home-shift-cta"}>
        {cta} <ArrowRight size={16} aria-hidden />
      </Link>
    </section>
  );
}

function StatTile({ label, value, to }: { label: string; value: string | number; to: string }) {
  return (
    <Link to={to} className="o-home-stat">
      <span className="o-home-stat-label">{label}</span>
      <span className="o-home-stat-value">{value}</span>
    </Link>
  );
}
