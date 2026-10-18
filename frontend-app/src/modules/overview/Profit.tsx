import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { staffApi } from "../../lib/staffApi";
import { Alert, Button, ControlPanel, Kpi, ListView, errMsg, formatVnd } from "../../components/erp";

type ProfitData = {
  totalRevenue: number;
  totalProductCost: number;
  grossProfit: number;
  byDay: Record<string, { revenue: number; cost: number; profit: number }>;
  byProduct: { name: string; qty: number; revenue: number; cost: number }[];
};

export function Profit() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<ProfitData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setBusy(true);
    try {
      setData(await staffApi<ProfitData>(`/api/admin/reports/profit?from=${from}&to=${to}`));
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const days = data ? Object.entries(data.byDay).sort(([a], [b]) => a.localeCompare(b)) : [];
  const maxRev = days.reduce((m, [, v]) => Math.max(m, v.revenue), 1);
  const margin = data && data.totalRevenue > 0 ? Math.round((data.grossProfit / data.totalRevenue) * 100) : 0;

  return (
    <div>
      <ControlPanel
        crumbs={[{ label: "Lợi nhuận" }]}
        actions={
          <span className="o-row">
            <label className="o-row" style={{ gap: 4 }}>Từ <input type="date" className="o-input" style={{ width: 150 }} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="o-row" style={{ gap: 4 }}>Đến <input type="date" className="o-input" style={{ width: 150 }} value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <Button variant="primary" icon={RefreshCw} onClick={() => void load()} disabled={busy}>{busy ? "Đang tải…" : "Xem"}</Button>
          </span>
        }
      />
      <div className="o-content o-stack">
        {err && <Alert>{err}</Alert>}
        {data && (
          <>
            <div className="o-kpis">
              <Kpi label="Doanh thu" value={formatVnd(data.totalRevenue)} tone="success" />
              <Kpi label="Giá vốn sản phẩm" value={formatVnd(data.totalProductCost)} tone="warning" />
              <Kpi label="Lợi nhuận gộp" value={formatVnd(data.grossProfit)} tone={data.grossProfit >= 0 ? "info" : "danger"} />
              <Kpi label="Biên lợi nhuận" value={`${margin}%`} />
            </div>

            {days.length > 0 && (
              <div className="o-panel">
                <div className="o-panel-head">
                  <span>Doanh thu / giá vốn theo ngày</span>
                  <span className="o-row" style={{ fontWeight: 400, fontSize: 12 }}>
                    <span className="o-row" style={{ gap: 4 }}><span style={{ width: 10, height: 10, background: "var(--o-primary)", display: "inline-block" }} />Doanh thu</span>
                    <span className="o-row" style={{ gap: 4 }}><span style={{ width: 10, height: 10, background: "#d6c3b4", display: "inline-block" }} />Giá vốn</span>
                  </span>
                </div>
                <div className="o-panel-body">
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 150, overflowX: "auto" }}>
                    {days.map(([day, v]) => (
                      <div key={day} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 24, flex: 1 }}>
                        <div style={{ width: "100%", display: "flex", gap: 2, alignItems: "flex-end", height: 120 }}>
                          <div title={`Doanh thu ${day}: ${formatVnd(v.revenue)}`} style={{ flex: 1, background: "var(--o-primary)", height: `${Math.round((v.revenue / maxRev) * 100)}%` }} />
                          <div title={`Giá vốn ${day}: ${formatVnd(v.cost)}`} style={{ flex: 1, background: "#d6c3b4", height: `${Math.round((v.cost / maxRev) * 100)}%` }} />
                        </div>
                        <div className="o-muted" style={{ fontSize: 10, marginTop: 4 }}>{day.slice(8)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="o-panel">
              <div className="o-panel-head">Lợi nhuận theo sản phẩm</div>
              <ListView
                rows={data.byProduct}
                rowKey={(p) => p.name}
                exportName="loi-nhuan-san-pham"
                columns={[
                  { key: "name", label: "Sản phẩm", value: (p) => p.name },
                  { key: "qty", label: "SL bán", value: (p) => p.qty, numeric: true, sum: true },
                  { key: "rev", label: "Doanh thu", value: (p) => p.revenue, numeric: true, sum: true, render: (p) => formatVnd(p.revenue), formatSum: formatVnd },
                  { key: "cost", label: "Giá vốn", value: (p) => p.cost, numeric: true, sum: true, render: (p) => formatVnd(p.cost), formatSum: formatVnd },
                  {
                    key: "profit",
                    label: "Lợi nhuận",
                    value: (p) => p.revenue - p.cost,
                    numeric: true,
                    sum: true,
                    formatSum: formatVnd,
                    render: (p) => <span style={{ color: p.revenue - p.cost >= 0 ? undefined : "var(--o-danger)" }}>{formatVnd(p.revenue - p.cost)}</span>,
                  },
                  {
                    key: "margin",
                    label: "Biên %",
                    value: (p) => (p.revenue > 0 ? Math.round(((p.revenue - p.cost) / p.revenue) * 100) : 0),
                    numeric: true,
                    render: (p) => {
                      const m = p.revenue > 0 ? Math.round(((p.revenue - p.cost) / p.revenue) * 100) : 0;
                      return <span style={{ color: m >= 30 ? "var(--o-success)" : m >= 10 ? "var(--o-warning)" : "var(--o-danger)" }}>{m}%</span>;
                    },
                  },
                ]}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
