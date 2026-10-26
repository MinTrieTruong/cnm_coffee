import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Banknote, ChevronRight, Download, ReceiptText, ShoppingBag, TrendingUp } from "lucide-react";
import { activeStoreId, getStaffInfo, isAdminRole, staffApi, staffDownloadBlob } from "../../lib/staffApi";
import { roleLabel } from "../../lib/roles";
import {
  Alert,
  ChartCard,
  DashTable,
  DateRangePicker,
  KpiCard,
  PageHeader,
  errMsg,
  formatVnd,
  pctChange,
  presetRange,
  previousRange,
  rangeLabel,
  type DateRange,
} from "../../components/erp";
import { BarChart, CHART_COLORS, CHART_DOWN, DonutChart, LineChart, compactVnd } from "../../components/erp/charts";
import { useResource } from "../shared";
import { FrontlineDashboard, ManagerTodayRow, ShiftCard, TodayTasksCard, WarehouseDashboard, todoItems, type Pending, type Schedule } from "./DashboardStaff";

/** Tổng quan › Bảng điều khiển — nội dung theo vai trò */
export function Dashboard() {
  const role = getStaffInfo()?.role ?? "";
  if (isAdminRole(role)) return <ManagerDashboard />;
  if (role === "Warehouse") return <WarehouseDashboard />;
  return <FrontlineDashboard />;
}

/* ═══════════ Dữ liệu ═══════════ */

type Revenue = { total: number; grandTotal?: number };
type Profit = { grossProfit: number; totalRevenue: number };
type TopItem = { name: string; quantity: number; revenue: number };
type StoreStat = { id: number; name: string; revenue: number; orders: number; grossProfit: number };
/** GET /api/admin/reports/dashboard — gộp sẵn ở máy chủ, ngày/giờ theo giờ quán */
type DashReport = {
  granularity: "hour" | "day";
  summary: { sales: number; debt: number; orders: number; cancelled: number };
  series: { key: string; sales: number; cash: number; created: number; cancelled: number }[];
  channels: { id: string; label: string; value: number }[];
};

const q = (r: { from: string; to: string }) => `from=${r.from}&to=${r.to}`;

/** Nhãn trục: "14h" (theo giờ) hoặc "25/10" (theo ngày) */
const bucketLabel = (granularity: DashReport["granularity"], key: string) => (granularity === "hour" ? `${key}h` : `${key.slice(8, 10)}/${key.slice(5, 7)}`);

type DashData = {
  cur: DashReport;
  prev: DashReport;
  revenue: Revenue;
  prevRevenue: Revenue;
  profit: Profit;
  prevProfit: Profit;
  top: TopItem[];
  stores: StoreStat[] | null;
};

function useManagerData(range: DateRange, owner: boolean) {
  const [data, setData] = useState<DashData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const prev = previousRange(range);
    setLoading(true);
    Promise.all([
      staffApi<DashReport>(`/api/admin/reports/dashboard?${q(range)}`),
      staffApi<DashReport>(`/api/admin/reports/dashboard?${q(prev)}`),
      staffApi<Revenue>(`/api/admin/reports/revenue?${q(range)}`),
      staffApi<Revenue>(`/api/admin/reports/revenue?${q(prev)}`),
      staffApi<Profit>(`/api/admin/reports/profit?${q(range)}`),
      staffApi<Profit>(`/api/admin/reports/profit?${q(prev)}`),
      staffApi<{ items: TopItem[] }>(`/api/admin/reports/top-products?${q(range)}&limit=8`),
      owner ? staffApi<{ stores: StoreStat[] }>(`/api/admin/reports/stores-compare?${q(range)}`).then((x) => x.stores) : Promise.resolve(null),
    ])
      .then(([cur, prevReport, revenue, prevRevenue, profit, prevProfit, top, stores]) => {
        if (!alive) return;
        setData({ cur, prev: prevReport, revenue, prevRevenue, profit, prevProfit, top: top.items, stores });
        setError(null);
      })
      .catch((e) => alive && setError(errMsg(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [range, owner]);
  return { data, error, loading };
}

/* ═══════════ Chủ chuỗi / Quản lý chi nhánh ═══════════ */

const RANGE_KEY = "td.dashboard.range";
function initialRange(): DateRange {
  try {
    const p = localStorage.getItem(RANGE_KEY);
    if (p && p !== "custom") return presetRange(p as Exclude<DateRange["preset"], "custom">);
  } catch {
    /* bỏ qua */
  }
  return presetRange("7d");
}

async function saveBlob(path: string, filename: string) {
  const blob = await staffDownloadBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ManagerDashboard() {
  const info = getStaffInfo();
  const role = info?.role ?? "";
  const owner = role === "Owner";
  const allStores = owner && activeStoreId() == null;
  const [range, setRange] = useState<DateRange>(initialRange);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const { data, error, loading } = useManagerData(range, owner);
  const stats = useResource<{ pending: Pending } | null>("/api/admin/stats", null);
  const today = useResource<{ schedules: Schedule[] }>(owner ? null : "/api/attendance/today", { schedules: [] });

  const pick = (r: DateRange) => {
    setRange(r);
    try {
      localStorage.setItem(RANGE_KEY, r.preset);
    } catch {
      /* bỏ qua */
    }
  };

  const cur = data ? { ...data.cur.summary, count: data.cur.summary.orders } : null;
  const prev = data ? { ...data.prev.summary, count: data.prev.summary.orders } : null;
  const series = data ? data.cur.series.map((b) => ({ ...b, label: bucketLabel(data.cur.granularity, b.key) })) : [];
  const byHour = data?.cur.granularity === "hour";
  const channels = data ? data.cur.channels.map(({ label, value }) => ({ label, value })) : [];
  const todos = stats.data ? todoItems(role, stats.data.pending).filter((t) => t.n > 0 && (!allStores || t.to === "/app/sales/proposals" || t.to === "/app/overview/branch-proposals")) : [];
  const prevLabel = rangeLabel(previousRange(range));

  return (
    <div className="o-dash">
      <PageHeader
        title="Bảng điều khiển"
        description={`${roleLabel(role)}${info?.storeName ? ` · ${info.storeName}` : allStores ? " · Tất cả chi nhánh" : ""} · so với kỳ trước ${prevLabel}`}
        actions={
          <>
            <DateRangePicker value={range} onChange={pick} />
            <button
              type="button"
              className="o-btn o-btn-secondary"
              onClick={() =>
                saveBlob(`/api/admin/reports/orders/export?${q(range)}`, `donhang_${range.from}_${range.to}.csv`)
                  .then(() => setExportErr(null))
                  .catch((e) => setExportErr(errMsg(e, "Lỗi xuất báo cáo")))
              }
            >
              <Download size={16} strokeWidth={1.75} aria-hidden /> Xuất báo cáo
            </button>
          </>
        }
      />

      {!owner && <ShiftCard schedules={today.data.schedules} loading={today.loading} compact />}
      {(error || exportErr) && <Alert>{error ?? exportErr}</Alert>}

      <div className="o-dash-kpis" aria-busy={loading}>
        <KpiCard
          icon={TrendingUp}
          tone="primary"
          label="Doanh số"
          value={cur ? formatVnd(cur.sales) : "…"}
          change={cur && prev ? pctChange(cur.sales, prev.sales) : null}
          sub="Đơn không hủy, chưa gồm phí ship"
          to="/app/overview/revenue"
        />
        <KpiCard
          icon={Banknote}
          tone="green"
          label="Thực thu"
          value={data ? formatVnd(data.revenue.total) : "…"}
          change={data ? pctChange(data.revenue.total, data.prevRevenue.total) : null}
          sub={cur ? <>Công nợ: <strong>{formatVnd(cur.debt)}</strong></> : "Công nợ: …"}
          to="/app/overview/revenue"
        />
        <KpiCard
          icon={ReceiptText}
          tone="blue"
          label="Số đơn"
          value={cur ? cur.count.toLocaleString("vi-VN") : "…"}
          change={cur && prev ? pctChange(cur.count, prev.count) : null}
          sub={cur ? <>TB: <strong>{formatVnd(cur.count ? Math.round(cur.sales / cur.count) : 0)}</strong>/đơn</> : "TB: …"}
        />
        <KpiCard
          icon={ShoppingBag}
          tone="orange"
          label="Lợi nhuận gộp"
          value={data ? formatVnd(data.profit.grossProfit) : "…"}
          change={data ? pctChange(data.profit.grossProfit, data.prevProfit.grossProfit) : null}
          sub={data && data.profit.totalRevenue > 0 ? `Biên ${Math.round((data.profit.grossProfit / data.profit.totalRevenue) * 100)}%` : "Doanh thu − giá vốn món"}
          to="/app/overview/profit"
        />
      </div>

      {/* Việc vận hành của 1 chi nhánh — Chủ chuỗi xem khi đang chọn chi nhánh */}
      {!allStores && <ManagerTodayRow />}
      {!owner && <TodayTasksCard />}

      <div className="o-dash-row is-2">
        <ChartCard title="Doanh số & thực thu" description={byHour ? "Theo giờ tạo đơn trong ngày (giờ Việt Nam)" : "Theo ngày tạo đơn (giờ Việt Nam)"}>
          <LineChart
            ariaLabel="Biểu đồ doanh số và thực thu"
            data={series}
            xKey="label"
            series={[
              { key: "sales", label: "Doanh số" },
              { key: "cash", label: "Thực thu" },
            ]}
            format={formatVnd}
          />
        </ChartCard>
        <ChartCard title="Đơn tạo & đơn hủy" description={cur ? `${cur.count + cur.cancelled} đơn tạo · ${cur.cancelled} đơn hủy` : "Số đơn theo thời gian"}>
          <BarChart
            ariaLabel="Biểu đồ số đơn tạo và đơn hủy"
            data={series}
            xKey="label"
            series={[
              { key: "created", label: "Đơn tạo", color: CHART_COLORS[2] },
              { key: "cancelled", label: "Đơn hủy", color: CHART_DOWN },
            ]}
            format={(n) => `${n} đơn`}
          />
        </ChartCard>
      </div>

      <div className="o-dash-row is-2-1">
        <ChartCard title="Doanh số theo kênh" description="Tại quán · mang đi · giao hàng">
          <DonutChart ariaLabel="Biểu đồ doanh số theo kênh bán" data={channels} format={compactVnd} centerLabel="Doanh số" />
        </ChartCard>
        <ChartCard
          title="Món bán chạy"
          description="Theo số lượng bán trong kỳ"
          actions={<Link to="/app/overview/revenue" className="o-dcard-link">Xem tất cả <ChevronRight size={16} aria-hidden /></Link>}
        >
          <DashTable
            rows={data?.top ?? []}
            rowKey={(r) => r.name}
            empty={loading ? "Đang tải…" : "Chưa có món nào được bán trong kỳ."}
            columns={[
              { key: "rank", label: "#", render: (r) => <span className="o-muted">{(data?.top.indexOf(r) ?? 0) + 1}</span> },
              { key: "name", label: "Món", render: (r) => <strong className="o-dtable-name">{r.name}</strong> },
              { key: "qty", label: "Số lượng", numeric: true, render: (r) => r.quantity.toLocaleString("vi-VN") },
              { key: "rev", label: "Doanh thu", numeric: true, render: (r) => formatVnd(r.revenue) },
            ]}
          />
        </ChartCard>
      </div>

      {owner && data?.stores && (
        <ChartCard title="Doanh thu theo chi nhánh" description="Tiền thực thu trong kỳ, không gồm phí ship">
          <BarChart
            ariaLabel="Biểu đồ doanh thu theo chi nhánh"
            data={data.stores.map((s) => ({ label: s.name, revenue: s.revenue }))}
            xKey="label"
            series={[{ key: "revenue", label: "Doanh thu" }]}
            format={formatVnd}
            yFormat={compactVnd}
            barSize={24}
          />
        </ChartCard>
      )}

      {todos.length > 0 && (
        <ChartCard title="Cần xử lý" description="Việc đang chờ bạn duyệt">
          <ul className="o-todo">
            {todos.map((t) => (
              <li key={t.text}>
                <Link to={t.to} className="o-todo-item">
                  <span className="o-todo-count">{t.n}</span>
                  <span className="o-todo-text">{t.text}</span>
                  <ChevronRight size={16} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </ChartCard>
      )}
    </div>
  );
}
