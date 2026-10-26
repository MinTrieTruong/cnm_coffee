import { useEffect, useState } from "react";
import { CalendarDays, Clock, CupSoda, ReceiptText } from "lucide-react";
import { getStaffInfo, staffApi } from "../../lib/staffApi";
import { roleLabel } from "../../lib/roles";
import {
  Alert,
  ChartCard,
  DashTable,
  DateRangePicker,
  KpiCard,
  PageHeader,
  errMsg,
  pctChange,
  presetRange,
  previousRange,
  rangeLabel,
  type DateRange,
} from "../../components/erp";
import { BarChart } from "../../components/erp/charts";

type KitchenStats = {
  from: string;
  to: string;
  /** true: series theo giờ (chọn 1 ngày); false: theo ngày */
  byHour: boolean;
  total: number;
  prevTotal: number | null;
  orders: number;
  days: number;
  peakHour: number | null;
  busiestDay: { date: string; cups: number } | null;
  series: { key: string; cups: number }[];
  top: { name: string; quantity: number; sizes: Record<string, number> }[];
  /** Người đang lọc (null = cả quầy) */
  staffId: number | null;
  /** Xếp hạng người pha (luôn tính cả quầy) */
  byStaff: { staffId: number; name: string; role: string; cups: number; orders: number }[];
  /** Ly chưa ghi người pha (món cũ trước khi có tính năng) */
  untracked: number;
  /** Số ly người đang xem đã pha */
  mine: number;
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const n = (v: number) => v.toLocaleString("vi-VN");
const dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; };

/** Cả tháng "YYYY-MM" (tháng hiện tại thì tới hôm nay) */
function monthRange(month: string): DateRange {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0);
  const today = new Date();
  const end = last > today ? today : last;
  return { preset: "custom", from: `${month}-01`, to: `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}` };
}

/** Bếp & pha chế › Thống kê pha chế: số ly đã pha, món pha nhiều nhất, theo từng người pha */
export function KitchenStats() {
  const meId = getStaffInfo()?.id;
  const [range, setRange] = useState<DateRange>(() => presetRange("today"));
  /** Lọc theo người pha; null = cả quầy */
  const [who, setWho] = useState<number | null>(null);
  const [month, setMonth] = useState("");
  const [data, setData] = useState<KitchenStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const prev = previousRange(range);
    setLoading(true);
    staffApi<KitchenStats>(`/api/staff/kitchen/stats?from=${range.from}&to=${range.to}&prevFrom=${prev.from}&prevTo=${prev.to}${who ? `&staffId=${who}` : ""}`)
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => alive && setError(errMsg(e)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [range, who]);

  const pickRange = (r: DateRange) => { setMonth(""); setRange(r); };
  const pickMonth = (m: string) => { setMonth(m); if (m) setRange(monthRange(m)); };

  const avg = data && data.days > 1 ? Math.round(data.total / data.days) : null;
  const chart = (data?.series ?? []).map((s) => ({ label: data?.byHour ? `${s.key}h` : dm(s.key), cups: s.cups }));
  // Theo giờ: bỏ các giờ quán đóng cửa ở 2 đầu cho biểu đồ gọn
  const first = data?.byHour ? chart.findIndex((c) => c.cups > 0) : 0;
  const last = data?.byHour ? chart.length - 1 - [...chart].reverse().findIndex((c) => c.cups > 0) : chart.length - 1;
  const shown = first < 0 ? [] : chart.slice(first, last + 1);
  const people = data?.byStaff ?? [];
  const whoName = who == null ? null : who === meId ? "bạn" : people.find((p) => p.staffId === who)?.name ?? "người này";
  const teamTotal = people.reduce((s, p) => s + p.cups, 0) + (data?.untracked ?? 0);
  const iAmListed = people.some((p) => p.staffId === meId);

  return (
    <div className="o-dash">
      <PageHeader
        title="Thống kê pha chế"
        description={`Số ly / món ${whoName ? `${whoName} đã pha` : "quầy đã pha xong"} · ${rangeLabel(range)}`}
        actions={
          <>
            <select className="o-input" style={{ width: "auto" }} value={who ?? ""} onChange={(e) => setWho(e.target.value ? Number(e.target.value) : null)} aria-label="Người pha">
              <option value="">Cả quầy</option>
              {iAmListed && <option value={meId}>Của tôi</option>}
              {people.filter((p) => p.staffId !== meId).map((p) => <option key={p.staffId} value={p.staffId}>{p.name}</option>)}
            </select>
            <DateRangePicker value={range} onChange={pickRange} />
            <input type="month" className="o-input" style={{ width: 160 }} value={month} max={thisMonth()} onChange={(e) => pickMonth(e.target.value)} aria-label="Chọn tháng" title="Xem cả tháng" />
          </>
        }
      />
      {error && <Alert>{error}</Alert>}

      <div className="o-dash-kpis" aria-busy={loading}>
        <KpiCard
          icon={CupSoda}
          tone="primary"
          label={whoName ? `Ly ${whoName} đã pha` : "Tổng ly đã pha"}
          value={data ? n(data.total) : "…"}
          change={data && data.prevTotal != null ? pctChange(data.total, data.prevTotal) : null}
          sub={
            data
              ? who == null && iAmListed
                ? `Bạn pha ${n(data.mine)} ly · kỳ trước cả quầy ${n(data.prevTotal ?? 0)}`
                : data.prevTotal != null ? `Kỳ trước: ${n(data.prevTotal)} ly` : undefined
              : undefined
          }
        />
        <KpiCard icon={ReceiptText} tone="blue" label="Số đơn" value={data ? n(data.orders) : "…"} sub={data && data.orders ? `TB ${(data.total / data.orders).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ly/đơn` : undefined} />
        <KpiCard
          icon={CalendarDays}
          tone="green"
          label={avg != null ? "Trung bình mỗi ngày" : "Món pha nhiều nhất"}
          value={data ? (avg != null ? `${n(avg)} ly` : data.top[0]?.name ?? "—") : "…"}
          sub={avg != null ? (data?.busiestDay ? `Đông nhất ${dm(data.busiestDay.date)}: ${n(data.busiestDay.cups)} ly` : undefined) : data?.top[0] ? `${n(data.top[0].quantity)} ly` : undefined}
        />
        <KpiCard icon={Clock} tone="orange" label="Giờ cao điểm" value={data ? (data.peakHour != null ? `${pad2(data.peakHour)}:00–${pad2(data.peakHour + 1)}:00` : "—") : "…"} sub="Khung giờ có nhiều ly nhất" />
      </div>

      <div className="o-dash-row is-2-1">
        <ChartCard title={data?.byHour ? "Số ly theo giờ" : "Số ly theo ngày"} description="Theo giờ khách đặt món (giờ Việt Nam)">
          {shown.length ? (
            <BarChart ariaLabel="Biểu đồ số ly đã pha" data={shown} xKey="label" series={[{ key: "cups", label: "Số ly" }]} format={(v) => `${n(v)} ly`} barSize={data?.byHour ? 18 : 12} />
          ) : (
            <p className="o-dash-empty">{loading ? "Đang tải…" : "Chưa pha ly nào trong kỳ này."}</p>
          )}
        </ChartCard>
        <ChartCard title="Món pha nhiều nhất" description={data?.top.length ? `${data.top.length} món trong kỳ` : "Xếp theo số ly"}>
          <DashTable
            rows={data?.top.slice(0, 15) ?? []}
            rowKey={(r) => r.name}
            empty={loading ? "Đang tải…" : "Chưa có món nào trong kỳ."}
            columns={[
              { key: "rank", label: "#", render: (r) => <span className="o-muted">{(data?.top.indexOf(r) ?? 0) + 1}</span> },
              {
                key: "name",
                label: "Món",
                render: (r) => (
                  <span>
                    <strong className="o-dtable-name">{r.name}</strong>
                    {Object.keys(r.sizes).length > 0 && (
                      <span className="o-muted" style={{ display: "block", fontSize: 13 }}>
                        {Object.entries(r.sizes).sort((a, b) => b[1] - a[1]).map(([s, q]) => `${s}: ${n(q)}`).join(" · ")}
                      </span>
                    )}
                  </span>
                ),
              },
              { key: "qty", label: "Số ly", numeric: true, render: (r) => n(r.quantity) },
              { key: "pct", label: "Tỉ lệ", numeric: true, render: (r) => (data?.total ? `${Math.round((r.quantity / data.total) * 100)}%` : "") },
            ]}
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Theo người pha"
        description={
          data?.untracked
            ? `Tính theo người bấm "Xong" trên KDS · ${n(data.untracked)} ly của đơn cũ chưa ghi người pha`
            : `Tính theo người bấm "Xong" trên KDS · bấm vào tên để xem riêng người đó`
        }
      >
        <DashTable
          rows={people}
          rowKey={(r) => r.staffId}
          empty={loading ? "Đang tải…" : "Chưa có ai trong danh sách."}
          columns={[
            { key: "rank", label: "#", render: (r) => <span className="o-muted">{r.cups ? people.indexOf(r) + 1 : "–"}</span> },
            {
              key: "name",
              label: "Người pha",
              render: (r) => (
                <button type="button" className="o-btn o-btn-link" style={{ padding: 0, textAlign: "left" }} onClick={() => setWho(who === r.staffId ? null : r.staffId)} aria-pressed={who === r.staffId}>
                  <strong className="o-dtable-name">{r.name}{r.staffId === meId ? " (bạn)" : ""}</strong>
                  {r.role !== "Kitchen" && <span className="o-muted"> · {roleLabel(r.role)}</span>}
                </button>
              ),
            },
            { key: "cups", label: "Số ly", numeric: true, render: (r) => n(r.cups) },
            { key: "orders", label: "Số đơn", numeric: true, render: (r) => n(r.orders) },
            { key: "pct", label: "Tỉ lệ", numeric: true, render: (r) => (teamTotal ? `${Math.round((r.cups / teamTotal) * 100)}%` : "") },
          ]}
        />
      </ChartCard>
    </div>
  );
}
