import { useState } from "react";
import { Search } from "lucide-react";
import { Alert, Badge, Button, ControlPanel, Kpi, ListView, formatVnd, ymd } from "../../components/erp";
import { useResource } from "../shared";

type StoreStat = {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  revenue: number;
  orders: number;
  avgOrderValue: number;
  grossProfit: number;
};
type Compare = {
  from: string;
  to: string;
  stores: StoreStat[];
  total: { revenue: number; orders: number; grossProfit: number };
};

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
};

/** Tổng quan › So sánh chi nhánh (chỉ Chủ chuỗi) */
export function StoresCompare() {
  const [from, setFrom] = useState(() => daysAgo(29));
  const [to, setTo] = useState(() => daysAgo(0));
  const [range, setRange] = useState({ from, to });
  const { data, loading, error } = useResource<Compare | null>(
    `/api/admin/reports/stores-compare?from=${range.from}&to=${range.to}`,
    null,
  );
  const total = data?.total.revenue ?? 0;
  const share = (s: StoreStat) => (total > 0 ? Math.round((s.revenue / total) * 1000) / 10 : 0);

  return (
    <div>
      <ControlPanel crumbs={[{ label: "So sánh chi nhánh" }]} />
      <div className="o-content o-stack">
        {error && <Alert>{error}</Alert>}
        <div className="o-row" style={{ gap: 8, alignItems: "flex-end" }}>
          <label className="o-stack" style={{ gap: 4 }}>
            <span className="o-field-label">Từ ngày</span>
            <input className="o-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="o-stack" style={{ gap: 4 }}>
            <span className="o-field-label">Đến ngày</span>
            <input className="o-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <Button variant="primary" icon={Search} onClick={() => setRange({ from, to })}>Xem</Button>
        </div>
        <div className="o-kpis">
          <Kpi label="Doanh thu cả chuỗi" value={formatVnd(total)} />
          <Kpi label="Số đơn" value={data?.total.orders ?? 0} />
          <Kpi label="Lợi nhuận gộp" value={formatVnd(data?.total.grossProfit ?? 0)} />
          <Kpi label="Số chi nhánh" value={data?.stores.length ?? 0} />
        </div>
        <ListView
          rows={data?.stores ?? []}
          rowKey={(s) => s.id}
          loading={loading}
          columns={[
            { key: "code", label: "Mã", value: (s) => s.code, width: 80 },
            {
              key: "name",
              label: "Chi nhánh",
              value: (s) => s.name,
              render: (s) => (
                <span className="o-row" style={{ gap: 6 }}>
                  {s.name}
                  {!s.isActive && <Badge>Ngừng</Badge>}
                </span>
              ),
            },
            { key: "revenue", label: "Doanh thu", value: (s) => s.revenue, numeric: true, sum: true, formatSum: formatVnd, render: (s) => formatVnd(s.revenue) },
            { key: "share", label: "% doanh thu", value: share, numeric: true, render: (s) => `${share(s)}%` },
            { key: "orders", label: "Số đơn", value: (s) => s.orders, numeric: true, sum: true },
            { key: "aov", label: "Giá trị đơn TB", value: (s) => s.avgOrderValue, numeric: true, render: (s) => formatVnd(s.avgOrderValue) },
            { key: "profit", label: "Lợi nhuận gộp", value: (s) => s.grossProfit, numeric: true, sum: true, formatSum: formatVnd, render: (s) => formatVnd(s.grossProfit) },
          ]}
        />
      </div>
    </div>
  );
}
