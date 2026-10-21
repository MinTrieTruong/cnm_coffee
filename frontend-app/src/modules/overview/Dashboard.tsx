import { useNavigate } from "react-router-dom";
import { Alert, ControlPanel, Kpi, formatVnd } from "../../components/erp";
import { useResource } from "../shared";

type Stats = {
  todayOrders: number;
  todayRevenue: number;
  weekOrders?: number;
  weekRevenue?: number;
  monthOrders?: number;
  monthRevenue?: number;
  products: number;
  tables: number;
  staff: number;
  lowStock: number;
};

export function Dashboard() {
  const { data: s, error, loading } = useResource<Stats | null>("/api/admin/stats", null);
  const nav = useNavigate();
  return (
    <div>
      <ControlPanel crumbs={[{ label: "Bảng điều khiển" }]} />
      <div className="o-content">
        {error && <Alert>{error}</Alert>}
        {loading && !s && <div className="o-muted">Đang tải…</div>}
        {s && (
          <>
            <div className="o-section-title" style={{ marginTop: 0 }}>Doanh thu & đơn đã thanh toán</div>
            <div className="o-kpis">
              <Kpi label="Hôm nay — số đơn" value={s.todayOrders} />
              <Kpi label="Doanh thu hôm nay" value={formatVnd(s.todayRevenue)} onClick={() => nav("/app/overview/revenue")} />
              <Kpi label="7 ngày — số đơn" value={s.weekOrders ?? 0} />
              <Kpi label="Doanh thu 7 ngày" value={formatVnd(s.weekRevenue ?? 0)} onClick={() => nav("/app/overview/revenue")} />
              <Kpi label="Tháng này — số đơn" value={s.monthOrders ?? 0} />
              <Kpi label="Doanh thu tháng này" value={formatVnd(s.monthRevenue ?? 0)} onClick={() => nav("/app/overview/profit")} />
            </div>
            <div className="o-section-title">Vận hành cửa hàng</div>
            <div className="o-kpis">
              <Kpi label="Món trong menu" value={s.products} onClick={() => nav("/app/sales/products")} />
              <Kpi label="Bàn" value={s.tables} onClick={() => nav("/app/tables/zones")} />
              <Kpi label="Nhân viên hoạt động" value={s.staff} onClick={() => nav("/app/hr/employees")} />
              <Kpi
                label="Nguyên liệu sắp hết"
                value={s.lowStock}
                tone={s.lowStock ? "warning" : undefined}
                onClick={() => nav("/app/inventory/stock")}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
