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
  ClipboardCheck,
  Clock,
  FileCheck,
  Coffee,
  FileText,
  LayoutGrid,
  MessageSquare,
  Monitor,
  Package,
  PieChart,
  QrCode,
  Scale,
  Settings,
  ShoppingCart,
  Tags,
  Ticket,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";
import { APPS, appPath, canSee, leavesOf } from "../../apps/registry";
import { activeStoreId, getStaffInfo, isAdminRole } from "../../lib/staffApi";
import { Alert, formatVnd, type IconType } from "../../components/erp";
import { useResource } from "../shared";

type Stats = {
  todayOrders: number;
  todayRevenue: number;
  monthRevenue?: number;
  pendingRequests: number;
};
type Schedule = {
  id: number;
  shiftCode: string;
  startMin: number;
  endMin: number;
  actualCheckIn: string | null;
  actualCheckOut: string | null;
};

/** Một ô chức năng: trỏ tới menu `appId/leafId` trong registry (ẩn nếu vai trò không xem được) */
type Shortcut = { app: string; leaf: string; label?: string; icon: IconType };
type Group = { title: string; items: Shortcut[] };

const GROUPS: Group[] = [
  {
    title: "Bán hàng & phục vụ",
    items: [
      { app: "pos", leaf: "pos", label: "Thu ngân", icon: Monitor },
      { app: "tables", leaf: "floor", icon: LayoutGrid },
      { app: "kitchen", leaf: "kds", label: "Pha chế", icon: ChefHat },
      { app: "tables", leaf: "order-status", icon: Coffee },
      { app: "delivery", leaf: "orders", label: "Đơn giao", icon: Bike },
      { app: "delivery", leaf: "shipper", icon: Truck },
      { app: "tables", leaf: "chat", icon: MessageSquare },
    ],
  },
  {
    title: "Thực đơn & kho",
    items: [
      { app: "sales", leaf: "products", icon: Tags },
      { app: "sales", leaf: "vouchers", icon: Ticket },
      { app: "inventory", leaf: "stock", icon: Warehouse },
      { app: "inventory", leaf: "check", icon: ClipboardCheck },
      { app: "inventory", leaf: "transfers", icon: ArrowRightLeft },
      { app: "purchase", leaf: "orders", icon: ShoppingCart },
      { app: "kitchen", leaf: "formulas", icon: Package },
    ],
  },
  {
    title: "Nhân sự",
    items: [
      { app: "hr", leaf: "attendance", icon: Clock },
      { app: "hr", leaf: "my-schedule", icon: CalendarCheck },
      { app: "hr", leaf: "schedule", label: "Lịch tổng", icon: CalendarDays },
      { app: "hr", leaf: "employees", icon: Users },
      { app: "hr", leaf: "approvals", icon: FileCheck },
      { app: "hr", leaf: "requests", icon: FileText },
      { app: "hr", leaf: "payroll", icon: Calculator },
      { app: "hr", leaf: "payslips", icon: Wallet },
    ],
  },
  {
    title: "Báo cáo & quản trị",
    items: [
      { app: "overview", leaf: "dashboard", label: "Chỉ số", icon: BarChart3 },
      { app: "overview", leaf: "revenue", icon: TrendingUp },
      { app: "overview", leaf: "profit", icon: PieChart },
      { app: "overview", leaf: "compare", label: "So sánh CN", icon: Scale },
      { app: "tables", leaf: "qr", icon: QrCode },
      { app: "settings", leaf: "stores", icon: Building2 },
      { app: "settings", leaf: "store", icon: Settings },
    ],
  },
];

function resolve(s: Shortcut, role: string) {
  const app = APPS.find((a) => a.id === s.app);
  const leaf = app && leavesOf(app).find((l) => l.id === s.leaf);
  if (!app || !leaf || !canSee(leaf, role)) return null;
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

/** Tổng quan › Trang chủ — điểm bắt đầu của mọi nhân viên */
export function Home() {
  const info = getStaffInfo();
  const role = info?.role ?? "";
  const admin = isAdminRole(role);
  const stats = useResource<Stats | null>(admin ? "/api/admin/stats" : null, null);
  const today = useResource<{ schedules: Schedule[] }>("/api/attendance/today", { schedules: [] });

  const groups = GROUPS.map((g) => ({
    title: g.title,
    items: g.items.map((s) => resolve(s, role)).filter((x): x is NonNullable<typeof x> => !!x),
  })).filter((g) => g.items.length > 0);

  const storeLabel = info?.storeName ?? (activeStoreId() == null && admin ? "Tất cả chi nhánh" : null);
  const dateLabel = new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" });

  return (
    <div className="o-home">
      <header className="o-home-head">
        <div>
          <h1 className="o-home-title">{greeting()}, {info?.fullName ?? "bạn"}</h1>
          <p className="o-home-sub">
            {storeLabel && <>{storeLabel} · </>}
            <span className="o-home-date">{dateLabel}</span>
          </p>
        </div>
      </header>

      <ShiftCard schedules={today.data.schedules} loading={today.loading} />

      {admin && (
        <section aria-label="Hôm nay">
          {stats.error && <Alert>{stats.error}</Alert>}
          <div className="o-home-stats">
            <StatTile label="Doanh thu hôm nay" value={stats.data ? formatVnd(stats.data.todayRevenue) : "—"} to="/app/overview/revenue" />
            <StatTile label="Đơn đã thanh toán" value={stats.data?.todayOrders ?? "—"} to="/app/overview/revenue" />
            <StatTile label="Doanh thu tháng" value={stats.data ? formatVnd(stats.data.monthRevenue ?? 0) : "—"} to="/app/overview/profit" />
            <StatTile
              label="Phiếu NL chờ duyệt"
              value={stats.data?.pendingRequests ?? "—"}
              to="/app/inventory/requests"
              attention={!!stats.data?.pendingRequests}
            />
          </div>
        </section>
      )}

      <div className="o-home-groups">
        {groups.map((g) => (
          <section key={g.title} className="o-home-group" aria-labelledby={`grp-${g.title}`}>
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
    title = `Đang trong ca ${cur.shiftCode} · ${minToTime(cur.startMin)}–${minToTime(cur.endMin)}`;
    detail = `Vào ca lúc ${clock(cur.actualCheckIn)}. Nhớ chấm công khi ra về.`;
    cta = "Chấm công ra";
  } else if (cur) {
    state = "due";
    title = `Ca ${cur.shiftCode} · ${minToTime(cur.startMin)}–${minToTime(cur.endMin)}`;
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

function StatTile({ label, value, to, attention }: { label: string; value: string | number; to: string; attention?: boolean }) {
  return (
    <Link to={to} className={attention ? "o-home-stat is-attention" : "o-home-stat"}>
      <span className="o-home-stat-label">{label}</span>
      <span className="o-home-stat-value">{value}</span>
    </Link>
  );
}
