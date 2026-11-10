import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  AlertTriangle,
  ArrowRight,
  Bike,
  CalendarClock,
  ChefHat,
  CircleCheck,
  CircleX,
  ClipboardList,
  Clock,
  Coffee,
  Coins,
  CupSoda,
  LayoutGrid,
  ListChecks,
  Monitor,
  Package,
  ReceiptText,
  Trash2,
  Truck,
  Wallet,
} from "lucide-react";
import { getStaffInfo, staffApi } from "../../lib/staffApi";
import { roleLabel } from "../../lib/roles";
import { Alert, ChartCard, DashTable, KpiCard, PageHeader, errMsg, fmtDate, fmtQty, formatVnd, pctChange, type IconType } from "../../components/erp";
import { useResource } from "../shared";
import { MyTaskItem, useMyTasks } from "../hr/MyTasks";
import { OpenShiftsCard } from "../hr/OpenShifts";
import { doneCount, isOverdue, todayYmd, type WorkTask } from "../../lib/tasks";

export type Pending = {
  lowStock: number;
  urgentFromOthers: number;
  menuProposals: number;
  leave: number;
  swap: number;
  adjust: number;
  purchaseRequisitions: number;
  incomingTransfers: number;
  openPurchaseOrders: number;
  branchProposals?: number;
  branchProposalsNeedInfo?: number;
  inventoryCounts?: number;
};
export type Schedule = {
  id: number;
  shiftCode: string;
  shiftName?: string;
  startMin: number;
  endMin: number;
  actualCheckIn: string | null;
  actualCheckOut: string | null;
};

/** Việc chờ xử lý của Chủ chuỗi / Quản lý chi nhánh */
export function todoItems(role: string, p: Pending) {
  return [
    ...(role === "Owner" ? [{ n: p.menuProposals, text: "đề xuất món mới chờ duyệt", to: "/app/sales/proposals" }] : []),
    ...(role === "Owner"
      ? [{ n: p.branchProposals ?? 0, text: "đề xuất của chi nhánh chờ duyệt", to: "/app/overview/branch-proposals" }]
      : [{ n: p.branchProposalsNeedInfo ?? 0, text: "đề xuất Chủ chuỗi yêu cầu bổ sung", to: "/app/overview/branch-proposals" }]),
    { n: p.lowStock, text: "nguyên liệu sắp hết", to: "/app/inventory/stock" },
    { n: p.leave, text: "đơn xin nghỉ chờ duyệt", to: "/app/hr/approvals" },
    { n: p.swap, text: "đề nghị đổi ca chờ duyệt", to: "/app/hr/approvals" },
    { n: p.adjust, text: "giải trình chấm công chờ duyệt", to: "/app/hr/approvals" },
    { n: p.purchaseRequisitions, text: "đề xuất mua hàng chờ duyệt", to: "/app/purchase/orders" },
    ...(role === "Admin" ? [{ n: p.inventoryCounts ?? 0, text: "phiếu kiểm kê chờ duyệt", to: "/app/inventory/counts" }] : []),
  ];
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

function subtitle() {
  const info = getStaffInfo();
  const date = new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  return `${roleLabel(info?.role ?? "")}${info?.storeName ? ` · ${info.storeName}` : ""} · ${date.charAt(0).toUpperCase()}${date.slice(1)}`;
}

/** Thẻ "Ca hôm nay" (chấm công) */
export function ShiftCard({ schedules, loading, compact }: { schedules: Schedule[]; loading: boolean; compact?: boolean }) {
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
    const now = new Date();
    const late = now.getHours() * 60 + now.getMinutes() - cur.startMin;
    title = `${cur.shiftName ?? `Ca ${cur.shiftCode}`} · ${minToTime(cur.startMin)}–${minToTime(cur.endMin)}`;
    detail = late > 0 ? `Bạn chưa chấm công — đã trễ ${late} phút.` : "Bạn chưa chấm công vào ca.";
    cta = "Chấm công vào";
  } else if (done) {
    state = "done";
    title = "Đã xong các ca hôm nay";
    detail = `${schedules.length} ca đã chấm công đủ.`;
  }
  // Quản lý: chỉ nhắc khi có ca cần chấm
  if (compact && (state === "idle" || state === "done")) return null;

  return (
    <section className={`o-home-shift is-${state}`} aria-label="Ca hôm nay">
      <span className="o-home-shift-icon"><Clock size={20} strokeWidth={1.75} aria-hidden /></span>
      <div className="o-home-shift-text">
        <div className="o-home-shift-eyebrow">Ca hôm nay</div>
        <div className="o-home-shift-title">{title}</div>
        {detail && <div className="o-home-shift-detail">{detail}</div>}
      </div>
      <Link to="/app/hr/attendance" className={state === "due" || state === "working" ? "o-btn o-btn-primary o-home-shift-cta" : "o-btn o-btn-secondary o-home-shift-cta"}>
        {cta} <ArrowRight size={16} aria-hidden />
      </Link>
    </section>
  );
}

/** Gọi song song nhiều API; lỗi một API không làm hỏng cả trang */
function useMany<T extends Record<string, unknown>>(paths: { [K in keyof T]: string | null }, refreshMs = 0) {
  const [data, setData] = useState<Partial<T>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const sig = JSON.stringify(paths);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const entries = Object.entries(paths).filter(([, p]) => p) as [string, string][];
      const res = await Promise.allSettled(entries.map(([, p]) => staffApi<unknown>(p)));
      if (!alive) return;
      const next: Record<string, unknown> = {};
      let firstErr: string | null = null;
      res.forEach((r, i) => {
        if (r.status === "fulfilled") next[entries[i][0]] = r.value;
        else firstErr ??= errMsg(r.reason);
      });
      setData(next as Partial<T>);
      setError(firstErr);
      setLoading(false);
    };
    void load();
    const t = refreshMs ? window.setInterval(() => void load(), refreshMs) : undefined;
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [sig, refreshMs]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, loading };
}

const num = (v: number | undefined) => (v == null ? "…" : v.toLocaleString("vi-VN"));

/* ═══════════ Việc được giao hôm nay (mọi nhân viên) ═══════════ */

export function TodayTasksCard() {
  const { tasks, replace, me } = useMyTasks(todayYmd());
  if (!tasks.length) return null;
  const left = tasks.filter((t) => !t.assignees.some((a) => a.staffId === me && a.status === "DONE")).length;
  return (
    <ChartCard
      title="Việc được giao hôm nay"
      description={left ? `Còn ${left}/${tasks.length} việc chưa xong — bấm ô tròn khi làm xong` : `Đã xong cả ${tasks.length} việc`}
      actions={<Link to="/app/hr/my-tasks" className="o-dcard-link">Xem chi tiết <ArrowRight size={14} aria-hidden /></Link>}
    >
      <ul className="o-mytasks">
        {tasks.slice(0, 6).map((t) => <MyTaskItem key={t.id} task={t} me={me} onChange={replace} compact />)}
      </ul>
    </ChartCard>
  );
}

/* ═══════════ Quản lý: chấm công & công việc hôm nay của chi nhánh ═══════════ */

type StoreShift = {
  id: number;
  staffId: number;
  fullName: string;
  role: string;
  shiftCode: string;
  shiftName: string;
  startMin: number;
  endMin: number;
  actualCheckIn: string | null;
  state: "upcoming" | "missing" | "working" | "missing_out" | "done";
};

export function ManagerTodayRow() {
  const { data, error } = useMany<{ att: { rows: StoreShift[] }; tasks: { tasks: WorkTask[] } }>(
    { att: "/api/attendance/today-store", tasks: `/api/tasks?date=${todayYmd()}` },
    60_000,
  );
  const rows = data.att?.rows ?? [];
  const missing = rows.filter((r) => r.state === "missing" || r.state === "missing_out");
  const count = (s: StoreShift["state"]) => rows.filter((r) => r.state === s).length;
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const tasks = data.tasks?.tasks ?? [];
  const total = tasks.reduce((s, t) => s + t.assignees.length, 0);
  const done = tasks.reduce((s, t) => s + doneCount(t), 0);
  const overdue = tasks.filter((t) => isOverdue(t));

  return (
    <div className="o-dash-row is-2">
      <ChartCard
        title="Chấm công hôm nay"
        description={data.att ? `${count("working") + count("done") + count("missing_out")} đã vào ca · ${count("missing")} chưa chấm · ${count("upcoming")} chưa tới giờ` : "Đang tải…"}
        actions={<Link to="/app/hr/warnings" className="o-dcard-link">Cảnh báo tháng <ArrowRight size={14} aria-hidden /></Link>}
      >
        {error && !data.att && <p className="o-dash-empty">{error}</p>}
        {data.att && !missing.length && <p className="o-dash-empty">{rows.length ? "Mọi người đã chấm công đúng giờ." : "Hôm nay chưa có ca nào được duyệt."}</p>}
        {missing.length > 0 && (
          <ul className="o-att-list">
            {missing.map((r) => (
              <li key={r.id}>
                <span className={`o-kpic-icon is-sm ${r.state === "missing" ? "is-red" : "is-orange"}`}>
                  <AlertTriangle size={16} strokeWidth={1.75} aria-hidden />
                </span>
                <span className="o-att-list-name">
                  <strong>{r.fullName}</strong>
                  <span>{roleLabel(r.role)} · {r.shiftName} {minToTime(r.startMin)}–{minToTime(r.endMin)}</span>
                </span>
                <span className={r.state === "missing" ? "o-att-tag is-red" : "o-att-tag is-orange"}>
                  {r.state === "missing" ? `Chưa vào · trễ ${Math.max(0, now - r.startMin)} phút` : "Chưa chấm ra"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ChartCard>
      <ChartCard
        title="Công việc hôm nay"
        description={tasks.length ? `${done}/${total} lượt đã xong · ${overdue.length} việc quá hạn` : "Chưa giao việc nào hôm nay"}
        actions={<Link to="/app/hr/tasks" className="o-dcard-link">{tasks.length ? "Xem bảng việc" : "Giao việc"} <ArrowRight size={14} aria-hidden /></Link>}
      >
        {tasks.length > 0 ? (
          <ul className="o-att-list">
            {tasks.slice(0, 6).map((t) => {
              const n = doneCount(t);
              const late = isOverdue(t);
              return (
                <li key={t.id}>
                  <span className={`o-kpic-icon is-sm ${n === t.assignees.length ? "is-green" : late ? "is-red" : "is-primary"}`}>
                    <ClipboardList size={16} strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="o-att-list-name">
                    <strong>{t.title}</strong>
                    <span>{[t.area, t.assignees.map((a) => a.staff.fullName).join(", ")].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className={n === t.assignees.length ? "o-att-tag is-green" : late ? "o-att-tag is-red" : "o-att-tag"}>
                    {n}/{t.assignees.length}{late ? " · quá hạn" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="o-dash-empty">Giao việc như vệ sinh khu vực, kiểm kê… cho nhân viên đang có ca.</p>
        )}
      </ChartCard>
    </div>
  );
}

/* ═══════════ Thủ kho ═══════════ */

type InvItem = { id: number; name: string; unit: string | null; stockQty: number; minLevel: number };
type Expiring = { id: number; remainingQty: number; expiryDate: string; item: { name: string; unit: string | null } };
type Waste = { costValue: number };
type Todo = { key: string; icon: IconType; tone: "red" | "orange" | "blue"; what: string; detail: string; to: string; action: string };

const monthKey = (offset: number) => {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  return `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
};

export function WarehouseDashboard() {
  const today = useResource<{ schedules: Schedule[] }>("/api/attendance/today", { schedules: [] });
  const { data, error, loading } = useMany<{ stats: { pending: Pending }; inv: InvItem[]; exp: Expiring[]; waste: Waste[]; prevWaste: Waste[] }>({
    stats: "/api/admin/stats",
    inv: "/api/admin/inventory",
    exp: "/api/admin/inventory/expiring",
    waste: `/api/kitchen/waste?month=${monthKey(0)}`,
    prevWaste: `/api/kitchen/waste?month=${monthKey(-1)}`,
  });
  const p = data.stats?.pending;
  const low = (data.inv ?? []).filter((i) => i.stockQty <= i.minLevel).sort((a, b) => a.stockQty / (a.minLevel || 1) - b.stockQty / (b.minLevel || 1));
  const exp = data.exp ?? [];
  const wasteSum = (w?: Waste[]) => (w ? w.reduce((s, x) => s + (x.costValue ?? 0), 0) : undefined);
  const waste = wasteSum(data.waste);
  const prevWaste = wasteSum(data.prevWaste);
  const waiting = p ? p.purchaseRequisitions + p.incomingTransfers + p.openPurchaseOrders : undefined;

  const todos: Todo[] = [
    ...low.slice(0, 8).map((i) => ({
      key: `low-${i.id}`,
      icon: AlertTriangle,
      tone: "red" as const,
      what: i.name,
      detail: `Tồn ${fmtQty(i.stockQty)} / tối thiểu ${fmtQty(i.minLevel)} ${i.unit ?? ""}`.trim(),
      to: "/app/purchase/orders",
      action: "Đặt mua",
    })),
    ...exp.slice(0, 6).map((e) => ({
      key: `exp-${e.id}`,
      icon: CalendarClock,
      tone: "orange" as const,
      what: e.item.name,
      detail: `Còn ${fmtQty(e.remainingQty)} ${e.item.unit ?? ""} · HSD ${fmtDate(e.expiryDate)}`,
      to: "/app/inventory/stock",
      action: "Xem lô",
    })),
    ...(p?.urgentFromOthers ? [{ key: "urgent", icon: Package, tone: "blue" as const, what: "Chi nhánh khác cần hàng gấp", detail: `${p.urgentFromOthers} yêu cầu đang mở`, to: "/app/inventory/urgent", action: "Xem" }] : []),
    ...(p?.incomingTransfers ? [{ key: "tr", icon: Truck, tone: "blue" as const, what: "Phiếu chuyển kho chờ nhận", detail: `${p.incomingTransfers} phiếu`, to: "/app/inventory/transfers", action: "Nhận hàng" }] : []),
    ...(p?.openPurchaseOrders ? [{ key: "po", icon: ClipboardList, tone: "blue" as const, what: "Đơn mua chờ nhận hàng", detail: `${p.openPurchaseOrders} đơn`, to: "/app/purchase/orders", action: "Xem" }] : []),
  ];

  return (
    <div className="o-dash">
      <PageHeader title={`${greeting()}, ${getStaffInfo()?.fullName ?? "bạn"}`} description={subtitle()} />
      <ShiftCard schedules={today.data.schedules} loading={today.loading} />
      {error && <Alert>{error}</Alert>}
      <div className="o-dash-kpis">
        <KpiCard icon={AlertTriangle} tone="red" label="Nguyên liệu sắp hết" value={num(p?.lowStock)} sub="Tồn ≤ mức tối thiểu" to="/app/inventory/stock" />
        <KpiCard icon={CalendarClock} tone="orange" label="Sắp hết hạn" value={data.exp ? num(exp.length) : "…"} sub="Lô hết hạn trong 7 ngày" to="/app/inventory/stock" />
        <KpiCard
          icon={ClipboardList}
          tone="blue"
          label="Phiếu chờ xử lý"
          value={num(waiting)}
          sub={p ? `${p.purchaseRequisitions} đề xuất mua · ${p.incomingTransfers} chuyển kho · ${p.openPurchaseOrders} đơn mua` : undefined}
          to="/app/purchase/orders"
        />
        <KpiCard
          icon={Trash2}
          tone="primary"
          label="Giá trị hủy tháng này"
          value={waste == null ? "…" : formatVnd(waste)}
          change={waste == null ? null : pctChange(waste, prevWaste)}
          invert
          sub={prevWaste == null ? "Theo giá vốn" : `Tháng trước: ${formatVnd(prevWaste)}`}
          to="/app/inventory/waste"
        />
      </div>
      <OpenShiftsCard />
      <TodayTasksCard />
      <ChartCard title="Cần xử lý" description="Nguyên liệu cần đặt, lô sắp hết hạn và phiếu đang chờ">
        <DashTable
          rows={todos}
          rowKey={(t) => t.key}
          empty={loading ? "Đang tải…" : "Không có việc nào đang chờ."}
          columns={[
            {
              key: "what",
              label: "Việc",
              render: (t) => (
                <span className="o-dtable-what">
                  <span className={`o-kpic-icon is-${t.tone} is-sm`}><t.icon size={16} strokeWidth={1.75} aria-hidden /></span>
                  <strong className="o-dtable-name">{t.what}</strong>
                </span>
              ),
            },
            { key: "detail", label: "Chi tiết", render: (t) => <span className="o-muted">{t.detail}</span> },
            { key: "act", label: "", numeric: true, render: (t) => <Link to={t.to} className="o-dcard-link">{t.action} <ArrowRight size={14} aria-hidden /></Link> },
          ]}
        />
      </ChartCard>
    </div>
  );
}

/* ═══════════ Thu ngân, Phục vụ, Pha chế, Shipper ═══════════ */

type Main = { to: string; label: string; hint: string; icon: IconType };
type Kpi = { icon: IconType; tone: "primary" | "green" | "blue" | "orange" | "red"; label: string; value: ReactNode; sub?: string; to?: string };

type PendingOrder = { status: string };
type Board = { orders: { deliveryStatus: string }[] };
type TableRow = { orders: { details: { kdsStatus: string }[] }[] };
type QueueRow = { orderId: number; kdsStatus: string };
type ShipperMe = { orders: unknown[]; stats: { deliveredToday: number; failedToday: number; shippingFeeToday: number } };
/** GET /api/staff/me/today — số liệu của chính nhân viên */
type MeToday = {
  cashier: { bills: number; collected: number } | null;
  waiter: { orders: number; items: number; tables: number } | null;
  kitchen: { wasteCount: number; wasteValue: number } | null;
};

/**
 * KPI theo vai trò. "Của tôi" lấy từ /api/staff/me/today; hàng chờ dùng chung
 * (đơn chờ thanh toán, món chờ pha…) vẫn là số của cả chi nhánh và ghi rõ "của quán".
 */
function useFrontline(role: string): { kpis: Kpi[]; main: Main | null; second?: Main; error: string | null } {
  const paths: Record<string, string | null> = {
    me: ["Cashier", "Waiter", "Kitchen"].includes(role) ? "/api/staff/me/today" : null,
    pending: role === "Cashier" ? "/api/pos/pending-orders" : null,
    board: role === "Cashier" ? "/api/delivery/board" : null,
    tables: role === "Waiter" ? "/api/pos/tables" : null,
    queue: role === "Kitchen" ? "/api/kds/queue" : null,
    ship: role === "Shipper" ? "/api/shipper/me" : null,
  };
  const { data, error } = useMany<{ me: MeToday; pending: PendingOrder[]; board: Board; tables: TableRow[]; queue: QueueRow[]; ship: ShipperMe }>(paths as never, 60_000);
  const me = data.me;

  if (role === "Cashier") {
    return {
      error,
      main: { to: "/pos", label: "Mở thu ngân (POS)", hint: "Tạo đơn, thanh toán, in hóa đơn", icon: Monitor },
      second: { to: "/app/delivery/orders", label: "Đơn giao hàng", hint: "Xác nhận và theo dõi đơn online", icon: Bike },
      kpis: [
        { icon: ReceiptText, tone: "primary", label: "Đơn tôi đã thu", value: num(me?.cashier?.bills), sub: "Trong các ca của bạn hôm nay" },
        { icon: Wallet, tone: "green", label: "Tiền tôi đã thu", value: me?.cashier ? formatVnd(me.cashier.collected) : "…", sub: "Không gồm điểm đổi, phí ship" },
        { icon: Clock, tone: "orange", label: "Đơn chờ thanh toán", value: num(data.pending?.filter((o) => o.status !== "Paid").length), sub: "Của quán", to: "/pos" },
        { icon: Bike, tone: "blue", label: "Đơn giao chờ xác nhận", value: num(data.board?.orders.filter((o) => o.deliveryStatus === "Awaiting_Confirm").length), sub: "Của quán", to: "/app/delivery/orders" },
      ],
    };
  }
  if (role === "Waiter") {
    const tables = data.tables;
    const items = tables?.flatMap((t) => t.orders.flatMap((o) => o.details));
    return {
      error,
      main: { to: "/app/tables/floor", label: "Mở sơ đồ bàn", hint: "Gọi món, chuyển / gộp bàn, báo thanh toán", icon: LayoutGrid },
      second: { to: "/app/tables/order-status", label: "Trạng thái món", hint: "Món đã pha xong chờ mang ra", icon: ListChecks },
      kpis: [
        { icon: LayoutGrid, tone: "primary", label: "Bàn tôi đã mở", value: num(me?.waiter?.tables), sub: me?.waiter ? `${me.waiter.orders} đơn hôm nay` : undefined },
        { icon: ReceiptText, tone: "blue", label: "Món tôi đã gọi", value: num(me?.waiter?.items), sub: "Trên các đơn bàn bạn mở" },
        { icon: Coffee, tone: "orange", label: "Món đang chờ pha", value: num(items?.filter((d) => d.kdsStatus === "Waiting" || d.kdsStatus === "Cooking").length), sub: "Của quán" },
        { icon: CircleCheck, tone: "green", label: "Món xong chờ mang ra", value: num(items?.filter((d) => d.kdsStatus === "Ready").length), sub: "Của quán", to: "/app/tables/order-status" },
      ],
    };
  }
  if (role === "Kitchen") {
    const qrows = data.queue;
    return {
      error,
      main: { to: "/app/kitchen/kds", label: "Mở màn pha chế (KDS)", hint: "Nhận món, báo xong, báo hết món", icon: ChefHat },
      second: { to: "/app/kitchen/stats", label: "Thống kê pha chế", hint: "Tổng ly đã pha, món pha nhiều nhất", icon: BarChart3 },
      kpis: [
        { icon: Clock, tone: "orange", label: "Món chờ pha", value: num(qrows?.filter((d) => d.kdsStatus === "Waiting").length), sub: "Hàng chờ chung của quầy", to: "/app/kitchen/kds" },
        { icon: CupSoda, tone: "primary", label: "Món đang pha", value: num(qrows?.filter((d) => d.kdsStatus === "Cooking").length) },
        { icon: ReceiptText, tone: "blue", label: "Đơn đang xử lý", value: num(qrows ? new Set(qrows.map((d) => d.orderId)).size : undefined) },
        { icon: Trash2, tone: "red", label: "Hao hụt tôi ghi", value: me?.kitchen ? formatVnd(me.kitchen.wasteValue) : "…", sub: me?.kitchen ? `${me.kitchen.wasteCount} lần hôm nay` : undefined },
      ],
    };
  }
  if (role === "Shipper") {
    const s = data.ship;
    return {
      error,
      main: { to: "/app/delivery/shipper", label: "Mở đơn giao của tôi", hint: "Nhận đơn, xem tuyến, xác nhận đã giao", icon: Truck },
      kpis: [
        { icon: Package, tone: "primary", label: "Đơn đang giao", value: num(s?.orders.length), to: "/app/delivery/shipper" },
        { icon: CircleCheck, tone: "green", label: "Đã giao hôm nay", value: num(s?.stats.deliveredToday) },
        { icon: CircleX, tone: "red", label: "Giao thất bại", value: num(s?.stats.failedToday) },
        { icon: Coins, tone: "orange", label: "Phí ship hôm nay", value: s ? formatVnd(s.stats.shippingFeeToday) : "…" },
      ],
    };
  }
  return { error, main: null, kpis: [] };
}

export function FrontlineDashboard() {
  const info = getStaffInfo();
  const role = info?.role ?? "";
  const today = useResource<{ schedules: Schedule[] }>("/api/attendance/today", { schedules: [] });
  const { kpis, main, second, error } = useFrontline(role);
  return (
    <div className="o-dash">
      <PageHeader title={`${greeting()}, ${info?.fullName ?? "bạn"}`} description={subtitle()} />
      <ShiftCard schedules={today.data.schedules} loading={today.loading} />
      {error && <Alert>{error}</Alert>}
      {kpis.length > 0 && (
        <div className={kpis.length === 3 ? "o-dash-kpis is-3" : "o-dash-kpis"}>
          {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
        </div>
      )}
      <OpenShiftsCard />
      <TodayTasksCard />
      {main && (
        <div className="o-dash-actions">
          {[main, second].filter((m): m is Main => !!m).map((m, i) => (
            <Link key={m.to} to={m.to} className={i === 0 ? "o-bigaction is-primary" : "o-bigaction"}>
              <span className="o-bigaction-icon"><m.icon size={24} strokeWidth={1.75} aria-hidden /></span>
              <span className="o-bigaction-text">
                <strong>{m.label}</strong>
                <span>{m.hint}</span>
              </span>
              <ArrowRight size={20} aria-hidden />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
