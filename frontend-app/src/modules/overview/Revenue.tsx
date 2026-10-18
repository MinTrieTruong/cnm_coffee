import { useState } from "react";
import { Download, Search } from "lucide-react";
import { staffApi, staffDownloadBlob } from "../../lib/staffApi";
import { Alert, Badge, Button, ControlPanel, Kpi, ListView, errMsg, fmtDateTime, formatVnd } from "../../components/erp";
import { useResource } from "../shared";

type RevenueReport = {
  total: number;
  /** Có thể vắng: route /admin/reports/revenue trong admin.ts chỉ trả total */
  pointsRedeemTotal?: number;
  grandTotal?: number;
  byDay: Record<string, { cash: number; points: number } | number>;
};
type TopItem = { name: string; quantity: number; revenue: number };
type OrderRow = {
  id: number;
  createdAt: string;
  orderType: string;
  status: string;
  totalAmount: number;
  subTotal: number;
  discountAmt: number;
  vatAmount: number;
  staff: { fullName: string } | null;
  table: { name: string } | null;
  details: { quantity: number; product: { name: string } }[];
  payments: { method: string; amount: number }[];
};

async function saveBlob(path: string, filename: string) {
  const blob = await staffDownloadBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const vnd = (n: number | undefined) => (typeof n === "number" ? formatVnd(n) : "—");
const today = () => new Date().toISOString().slice(0, 10);

export function Revenue() {
  const rev = useResource<RevenueReport | null>("/api/admin/reports/revenue", null);
  const top = useResource<{ items: TopItem[] }>("/api/admin/reports/top-products", { items: [] });
  const [err, setErr] = useState<string | null>(null);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [orders, setOrders] = useState<{ total: number; orders: OrderRow[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const days = rev.data
    ? Object.entries(rev.data.byDay).map(([day, v]) => ({ day, cash: typeof v === "object" ? v.cash : v, points: typeof v === "object" ? v.points : 0 }))
    : [];

  async function loadOrders() {
    setBusy(true);
    try {
      setOrders(await staffApi<{ total: number; orders: OrderRow[] }>(`/api/admin/reports/orders?from=${from}&to=${to}&limit=100`));
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <ControlPanel
        crumbs={[{ label: "Doanh thu" }]}
        actions={
          <Button
            icon={Download}
            onClick={() => saveBlob("/api/admin/export/revenue.csv", "revenue.csv").catch((e) => setErr(errMsg(e, "Lỗi tải CSV")))}
          >
            CSV doanh thu (đầy đủ cột)
          </Button>
        }
      />
      <div className="o-content o-stack">
        {(err || rev.error || top.error) && <Alert>{err ?? rev.error ?? top.error}</Alert>}
        {rev.data && (
          <>
            <div className="o-section-title" style={{ margin: 0 }}>30 ngày gần nhất</div>
            <div className="o-kpis">
              <Kpi label="Tiền thực thu" value={formatVnd(rev.data.total)} tone="success" />
              <Kpi label="Điểm đã đổi" value={vnd(rev.data.pointsRedeemTotal)} tone="warning" />
              <Kpi label="Doanh thu gộp" value={vnd(rev.data.grandTotal)} tone="info" />
            </div>
          </>
        )}

        <div className="o-groups" style={{ gap: 16 }}>
          <div className="o-panel">
            <div className="o-panel-head">Doanh thu theo ngày</div>
            <ListView
              rows={days}
              rowKey={(d) => d.day}
              loading={rev.loading}
              exportName="doanh-thu-theo-ngay"
              columns={[
                { key: "day", label: "Ngày", value: (d) => d.day, optional: true },
                { key: "cash", label: "Doanh thu", value: (d) => d.cash, numeric: true, sum: true, optional: true, render: (d) => formatVnd(d.cash), formatSum: formatVnd },
              ]}
            />
          </div>
          <div className="o-panel">
            <div className="o-panel-head">Món bán chạy (doanh thu)</div>
            <ListView
              rows={top.data.items.slice(0, 15)}
              rowKey={(p) => p.name}
              loading={top.loading}
              exportName="mon-ban-chay"
              columns={[
                { key: "name", label: "Tên món", value: (p) => p.name, optional: true },
                { key: "qty", label: "SL", value: (p) => p.quantity, numeric: true, sum: true, optional: true },
                { key: "rev", label: "Doanh thu", value: (p) => p.revenue, numeric: true, sum: true, optional: true, render: (p) => formatVnd(p.revenue), formatSum: formatVnd },
              ]}
            />
          </div>
        </div>

        <div className="o-panel">
          <div className="o-panel-head">
            <span>Đơn hàng chi tiết</span>
            <span className="o-row">
              <label className="o-row" style={{ gap: 4 }}>Từ <input type="date" className="o-input" style={{ width: 150 }} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
              <label className="o-row" style={{ gap: 4 }}>Đến <input type="date" className="o-input" style={{ width: 150 }} value={to} onChange={(e) => setTo(e.target.value)} /></label>
              <Button icon={Search} onClick={() => void loadOrders()} disabled={busy}>Xem danh sách đơn</Button>
              <Button
                variant="primary"
                icon={Download}
                onClick={() => saveBlob(`/api/admin/reports/orders/export?from=${from}&to=${to}`, `donhang_${from}_${to}.csv`).catch((e) => setErr(errMsg(e, "Lỗi tải CSV")))}
              >
                Export CSV đầy đủ
              </Button>
            </span>
          </div>
          {orders && (
            <>
              <div className="o-muted" style={{ padding: "6px 14px" }}>Hiển thị {orders.orders.length} / {orders.total} đơn hàng</div>
              <ListView
                rows={orders.orders}
                rowKey={(o) => o.id}
                columns={[
                  { key: "id", label: "Mã ĐH", value: (o) => o.id, render: (o) => `#${o.id}` },
                  { key: "time", label: "Thời gian", value: (o) => o.createdAt, render: (o) => fmtDateTime(o.createdAt) },
                  { key: "type", label: "Loại", value: (o) => o.orderType },
                  { key: "table", label: "Bàn", value: (o) => o.table?.name ?? "Mang về" },
                  { key: "staff", label: "Nhân viên", value: (o) => o.staff?.fullName ?? "" },
                  { key: "items", label: "Món", value: (o) => o.details.map((d) => `${d.product.name} ×${d.quantity}`).join(", "), wrap: true },
                  { key: "total", label: "Tổng tiền", value: (o) => o.totalAmount, numeric: true, sum: true, render: (o) => formatVnd(o.totalAmount), formatSum: formatVnd },
                  { key: "pay", label: "Thanh toán", value: (o) => o.payments.map((p) => p.method).join(", ") },
                  { key: "status", label: "Trạng thái", value: (o) => o.status, render: (o) => <Badge tone={o.status === "Paid" ? "success" : "warning"}>{o.status}</Badge> },
                ]}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
