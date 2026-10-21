import { useState, type ReactNode } from "react";
import { Alert, ControlPanel, Kpi, formatVnd } from "../../components/erp";
import { useResource } from "../shared";
import { Money, PrintButton } from "./shared";

type Pnl = {
  from: string;
  to: string;
  collected: number;
  points: number;
  shippingFee: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  wasteCost: number;
  operating: number;
  operatingByCategory: { category: string; label: string; amount: number }[];
  salary: number;
  netProfit: number;
};

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function Row({ label, value, strong, indent, minus }: { label: ReactNode; value: number; strong?: boolean; indent?: boolean; minus?: boolean }) {
  return (
    <tr style={{ fontWeight: strong ? 700 : undefined }}>
      <td style={{ paddingLeft: indent ? 28 : undefined }}>{label}</td>
      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{strong ? <Money value={value} signed /> : `${minus ? "− " : ""}${formatVnd(value)}`}</td>
    </tr>
  );
}

/** Tài chính › Lãi lỗ — doanh thu thuần − giá vốn − hao hụt − chi phí vận hành − lương */
export function ProfitLoss() {
  const now = new Date();
  const [from, setFrom] = useState(() => ymd(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(() => ymd(now));
  const { data: p, loading, error } = useResource<Pnl | null>(`/api/cash/pnl?from=${from}&to=${to}`, null);

  return (
    <div>
      <ControlPanel
        crumbs={[{ label: "Lãi lỗ" }]}
        actions={
          <>
            <input type="date" className="o-input" style={{ width: 150 }} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Từ ngày" />
            <input type="date" className="o-input" style={{ width: 150 }} value={to} onChange={(e) => setTo(e.target.value)} aria-label="Đến ngày" />
            <PrintButton />
          </>
        }
      />
      <div className="o-content o-stack">
        {error && <Alert>{error}</Alert>}
        {loading && !p && <div className="o-muted">Đang tính…</div>}
        {p && (
          <div className="cash-print o-stack" style={{ gap: 16 }}>
            <div className="o-kpis">
              <Kpi label="Doanh thu thuần" value={formatVnd(p.revenue)} />
              <Kpi label="Lãi gộp" value={formatVnd(p.grossProfit)} tone="info" />
              <Kpi label="Tổng chi phí" value={formatVnd(p.wasteCost + p.operating + p.salary)} tone="warning" />
              <Kpi label="Lãi ròng" value={formatVnd(p.netProfit)} tone={p.netProfit >= 0 ? "success" : "danger"} />
            </div>
            <div className="o-panel" style={{ maxWidth: 720 }}>
              <div className="o-panel-head">Báo cáo lãi lỗ {new Date(p.from).toLocaleDateString("vi-VN")} – {new Date(new Date(p.to).getTime() - 1).toLocaleDateString("vi-VN")}</div>
              <table className="o-list">
                <tbody>
                  <Row label="Tiền khách trả (không gồm điểm)" value={p.collected} />
                  <Row label="Phí ship thu hộ shipper" value={p.shippingFee} indent minus />
                  <Row label="Doanh thu thuần" value={p.revenue} strong />
                  <Row label="Giá vốn món bán" value={p.cogs} indent minus />
                  <Row label="Lãi gộp" value={p.grossProfit} strong />
                  <Row label="Hao hụt (đổ, hỏng, làm lại)" value={p.wasteCost} indent minus />
                  {p.operatingByCategory.map((c) => <Row key={c.category} label={c.label} value={c.amount} indent minus />)}
                  {p.operatingByCategory.length === 0 && <Row label="Chi phí vận hành" value={0} indent minus />}
                  <Row label="Lương nhân viên (không gồm phí ship của shipper)" value={p.salary} indent minus />
                  <Row label="Lãi ròng" value={p.netProfit} strong />
                </tbody>
              </table>
              <div className="o-muted" style={{ padding: "8px 14px" }}>
                Điểm khách đổi ({formatVnd(p.points)}) không phải tiền thu nên không tính vào doanh thu. Tiền trả nhà cung cấp không phải chi phí ở đây — nguyên liệu đã nằm trong giá vốn món bán.
                Lương lấy theo phiếu lương các tháng trong kỳ (cần tính lương trước).
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
