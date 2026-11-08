import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bar, BarChart as RBarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Clock, MousePointerClick, ShoppingCart, Star, TrendingUp, UsersRound } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { Alert, Badge, Button, ChartCard, DashTable, EmptyState, KpiCard, Modal, PageHeader, RecordList, pctChange } from "../../components/erp";
import { CHART_COLORS, DonutChart, LineChart } from "../../components/erp/charts";
import { useResource } from "../shared";
import "../../styles/behavior.css";

type Flag = "VIEW_NO_BUY" | "CART_DROP" | null;
type ProductFunnelRow = {
  productId: number; name: string; image: string | null; active: boolean;
  views: number; viewers: number; adds: number; addQty: number; removes: number; ordersQty: number;
  viewToCartPct: number; cartToOrderPct: number; flag: Flag;
};
type ScreenRow = { screen: string; label: string; views: number; medianSec: number; avgSec: number; totalMin: number; exits: number; exitPct: number; ranked: boolean };
type Insights = {
  range: { from: string; to: string; prevFrom: string; prevTo: string };
  summary: {
    visits: number; visitors: number; loggedInPct: number; productViews: number; addToCarts: number; orders: number;
    conversionPct: number; cartAbandonPct: number; avgVisitSec: number;
    prev: { visits: number; visitors: number; conversionPct: number; cartAbandonPct: number; avgVisitSec: number };
  };
  funnel: { step: string; visits: number }[];
  topViewed: { productId: number; name: string; image: string | null; views: number; viewers: number }[];
  topAdded: { productId: number; name: string; image: string | null; adds: number; qty: number; adders: number }[];
  productFunnel: ProductFunnelRow[];
  screens: ScreenRow[];
  addSources: { source: string; label: string; adds: number; pct: number }[];
  heatmap: { dow: number; hour: number; visits: number }[];
  devices: { device: string; visits: number; conversionPct: number }[];
  channels: { channel: string; visits: number; conversionPct: number }[];
};
type ProductDetail = {
  product: { id: number; name: string; image: string | null; active: boolean };
  days: { day: string; views: number; adds: number; removes: number; orders: number }[];
  sources: { source: string; label: string; adds: number; pct: number }[];
  prevScreens: { screen: string; label: string; views: number; pct: number }[];
};

const FUNNEL_LABEL: Record<string, string> = {
  visit: "Vào web", product_view: "Xem món", add_to_cart: "Thêm giỏ", cart_view: "Vào giỏ hàng", checkout_start: "Bấm đặt đơn", order: "Đặt đơn",
};
const FLAG: Record<Exclude<Flag, null>, { label: string; tone: "warning" | "danger" }> = {
  VIEW_NO_BUY: { label: "Xem nhiều, ít mua", tone: "warning" },
  CART_DROP: { label: "Hay bị bỏ khỏi giỏ", tone: "danger" },
};
const DEVICE_LABEL: Record<string, string> = { mobile: "Điện thoại", desktop: "Máy tính", unknown: "Không rõ" };
const CHANNEL_LABEL: Record<string, string> = { web: "Web (đặt online)", qr_table: "QR tại bàn" };
const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const PERIODS = [7, 30, 90] as const;

const n = (v: number) => v.toLocaleString("vi-VN");
const pct = (v: number) => `${v.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
const secText = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} phút ${Math.round(s % 60)} giây` : `${s.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} giây`);
const dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
/** Chênh lệch điểm % (tỉ lệ) so kỳ trước → hiển thị như % thay đổi của KpiCard */
const rateChange = (cur: number, prev: number, hasPrev: boolean) => (hasPrev ? pctChange(cur, prev) : null);

function Thumb({ src, name }: { src: string | null; name: string }) {
  const url = mediaUrl(src);
  return url ? <img className="o-bh-thumb" src={url} alt="" loading="lazy" /> : <span className="o-bh-thumb is-empty" aria-label={name} />;
}

/** Bán hàng › Hành vi khách — khách xem món gì, thêm giỏ món gì, ở lâu màn hình nào */
export function BehaviorInsights() {
  const [days, setDays] = useState<number | "custom">(30);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [channel, setChannel] = useState("");
  const [device, setDevice] = useState("");
  const [open, setOpen] = useState<{ id: number; name: string } | null>(null);
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (days === "custom") {
      if (from) p.set("from", from);
      if (to) p.set("to", to);
    } else p.set("days", String(days));
    if (channel) p.set("channel", channel);
    if (device) p.set("device", device);
    return p.toString();
  }, [days, from, to, channel, device]);
  const { data, loading, error } = useResource<Insights | null>(`/api/behavior-insights?${qs}`, null);
  const s = data?.summary;
  const hasPrev = !!s && s.prev.visits > 0;
  const empty = !!data && data.summary.visits === 0;

  return (
    <div className="o-dash o-bh">
      <PageHeader
        title="Hành vi khách"
        description={<>Khách xem món gì, thêm giỏ món gì, ở lâu màn hình nào trên web khách · xem thêm <Link to="/app/sales/search">Khách tìm kiếm</Link></>}
        actions={
          <div className="o-bh-filters">
            <select className="o-input" value={days} onChange={(e) => setDays(e.target.value === "custom" ? "custom" : Number(e.target.value))} aria-label="Khoảng thời gian">
              {PERIODS.map((d) => <option key={d} value={d}>{d} ngày gần nhất</option>)}
              <option value="custom">Tuỳ chọn ngày…</option>
            </select>
            {days === "custom" && (
              <>
                <input type="date" className="o-input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="Từ ngày" />
                <input type="date" className="o-input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="Đến ngày" />
              </>
            )}
            <select className="o-input" value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Kênh">
              <option value="">Mọi kênh</option>
              <option value="web">Web</option>
              <option value="qr_table">QR tại bàn</option>
            </select>
            <select className="o-input" value={device} onChange={(e) => setDevice(e.target.value)} aria-label="Thiết bị">
              <option value="">Mọi thiết bị</option>
              <option value="mobile">Điện thoại</option>
              <option value="desktop">Máy tính</option>
            </select>
          </div>
        }
      />
      {error && <Alert>{error}</Alert>}
      {empty ? (
        <EmptyState icon={MousePointerClick} title="Chưa có dữ liệu — số liệu sẽ có sau khi khách truy cập web" hint="Ghi nhận ẩn danh: màn hình khách xem, món được xem, thêm / bớt giỏ và đơn đặt từ web khách." />
      ) : (
        <>
          <div className="o-dash-kpis o-bh-kpis" aria-busy={loading}>
            <KpiCard icon={MousePointerClick} tone="primary" label="Lượt ghé (phiên)" value={s ? n(s.visits) : "…"} change={hasPrev ? pctChange(s!.visits, s!.prev.visits) : null} sub={s ? (hasPrev ? `Kỳ trước: ${n(s.prev.visits)}` : "Chưa có số kỳ trước") : undefined} />
            <KpiCard icon={UsersRound} tone="blue" label="Khách" value={s ? n(s.visitors) : "…"} change={hasPrev ? pctChange(s!.visitors, s!.prev.visitors) : null} sub={s ? `${pct(s.loggedInPct)} phiên đã đăng nhập` : undefined} />
            <KpiCard icon={TrendingUp} tone="green" label="Tỉ lệ đặt đơn" value={s ? pct(s.conversionPct) : "…"} change={s ? rateChange(s.conversionPct, s.prev.conversionPct, hasPrev) : null} sub={s ? `${n(s.orders)} đơn · kỳ trước ${hasPrev ? pct(s.prev.conversionPct) : "—"}` : undefined} />
            <KpiCard icon={ShoppingCart} tone="red" invert label="Tỉ lệ bỏ giỏ" value={s ? pct(s.cartAbandonPct) : "…"} change={s ? rateChange(s.cartAbandonPct, s.prev.cartAbandonPct, hasPrev) : null} sub="Thêm giỏ mà không đặt trong 24 giờ" />
            <KpiCard icon={Clock} tone="orange" label="Thời gian TB / phiên" value={s ? secText(s.avgVisitSec) : "…"} change={hasPrev ? pctChange(s!.avgVisitSec, s!.prev.avgVisitSec) : null} sub="Chỉ tính lúc khách thật sự xem" />
          </div>

          {data && <Funnel steps={data.funnel} />}

          {data && (
            <div className="o-dash-row is-2">
              <ChartCard title="Xem nhiều nhất" description="Lượt mở trang chi tiết món · số khách khác nhau">
                <TopList rows={data.topViewed.slice(0, 10).map((p) => ({ ...p, main: p.views, sub: `${n(p.viewers)} khách` }))} unit="lượt xem" onOpen={setOpen} />
              </ChartCard>
              <ChartCard title="Thêm giỏ nhiều nhất" description="Lượt thêm vào giỏ (mọi nguồn) · số ly · số khách">
                <TopList rows={data.topAdded.slice(0, 10).map((p) => ({ ...p, main: p.adds, sub: `${n(p.qty)} ly · ${n(p.adders)} khách` }))} unit="lượt thêm" onOpen={setOpen} />
              </ChartCard>
            </div>
          )}

          {data && <ProductTable rows={data.productFunnel} loading={loading} onOpen={setOpen} />}

          {data && <Screens rows={data.screens} />}

          {data && (
            <div className="o-dash-row o-bh-row-3">
              <ChartCard title="Nguồn thêm giỏ" description="Khách thêm món từ đâu">
                {data.addSources.length ? (
                  <DonutChart ariaLabel="Nguồn thêm giỏ" centerLabel="lượt thêm" data={data.addSources.map((r, i) => ({ label: r.label, value: r.adds, color: [...CHART_COLORS, "#7C3AED", "#DB2777"][i % 6] }))} />
                ) : <p className="o-dash-empty">Chưa có lượt thêm giỏ.</p>}
              </ChartCard>
              <ChartCard title="Thiết bị & kênh" description="Số phiên và tỉ lệ phiên có đặt đơn">
                <DashTable
                  rows={[...data.devices.map((d) => ({ k: `d-${d.device}`, label: DEVICE_LABEL[d.device] ?? d.device, visits: d.visits, conv: d.conversionPct })), ...data.channels.map((c) => ({ k: `c-${c.channel}`, label: CHANNEL_LABEL[c.channel] ?? c.channel, visits: c.visits, conv: c.conversionPct }))]}
                  rowKey={(r) => r.k}
                  columns={[
                    { key: "label", label: "Nhóm", render: (r) => r.label },
                    { key: "visits", label: "Phiên", numeric: true, render: (r) => n(r.visits) },
                    { key: "conv", label: "Đặt đơn", numeric: true, render: (r) => pct(r.conv) },
                  ]}
                />
              </ChartCard>
              <ChartCard title="Khung giờ khách ghé" description="Số phiên theo giờ × thứ (giờ Việt Nam)">
                <Heatmap cells={data.heatmap} />
              </ChartCard>
            </div>
          )}
        </>
      )}
      {open && <ProductModal id={open.id} name={open.name} qs={qs} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Phễu tổng: thanh ngang 6 bước, số phiên và % rơi rụng giữa các bước */
function Funnel({ steps }: { steps: Insights["funnel"] }) {
  const top = steps[0]?.visits || 1;
  return (
    <ChartCard title="Phễu mua hàng" description="Số phiên đi tới từng bước · % rơi rụng so với bước trước">
      <ol className="o-bh-funnel">
        {steps.map((st, i) => {
          const prev = i ? steps[i - 1].visits : 0;
          const drop = i && prev ? Math.round(((prev - st.visits) / prev) * 1000) / 10 : null;
          return (
            <li key={st.step}>
              <span className="o-bh-funnel-label">{FUNNEL_LABEL[st.step] ?? st.step}</span>
              <span className="o-bh-funnel-track">
                <span className="o-bh-funnel-bar" style={{ width: `${Math.max(2, (st.visits / top) * 100)}%` }} />
              </span>
              <span className="o-bh-funnel-num">
                <strong>{n(st.visits)}</strong> <span className="o-muted">{pct(Math.round((st.visits / top) * 1000) / 10)}</span>
                {drop != null && drop > 0 && <span className="o-bh-drop">−{pct(drop)}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </ChartCard>
  );
}

function TopList({ rows, unit, onOpen }: { rows: { productId: number; name: string; image: string | null; main: number; sub: string }[]; unit: string; onOpen: (p: { id: number; name: string }) => void }) {
  if (!rows.length) return <p className="o-dash-empty">Chưa có dữ liệu.</p>;
  const max = rows[0].main || 1;
  return (
    <ol className="o-bh-top">
      {rows.map((r, i) => (
        <li key={r.productId}>
          <button type="button" onClick={() => onOpen({ id: r.productId, name: r.name })} title="Xem chi tiết món">
            <span className="o-bh-rank">{i + 1}</span>
            <Thumb src={r.image} name={r.name} />
            <span className="o-bh-top-txt">
              <span className="o-bh-top-name">{r.name}</span>
              <span className="o-bh-top-bar"><span style={{ width: `${(r.main / max) * 100}%` }} /></span>
            </span>
            <span className="o-bh-top-num">
              <strong>{n(r.main)}</strong> <span className="o-muted">{unit}</span>
              <span className="o-muted">{r.sub}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function ProductTable({ rows, loading, onOpen }: { rows: ProductFunnelRow[]; loading: boolean; onOpen: (p: { id: number; name: string }) => void }) {
  const nav = useNavigate();
  return (
    <section className="o-dcard o-bh-table">
      <div className="o-dcard-head">
        <div>
          <h2 className="o-dcard-title">Phễu theo món</h2>
          <p className="o-dcard-desc">Xem → thêm giỏ → đặt. "Xem → giỏ" = trong các phiên đã mở trang món, % phiên thêm chính món đó; "Giỏ → đặt" = số ly đặt ÷ số ly thêm giỏ.</p>
        </div>
      </div>
      <RecordList
        crumbs={[{ label: "Món" }]}
        rows={rows}
        rowKey={(r) => r.productId}
        loading={loading}
        onOpen={(r) => onOpen({ id: r.productId, name: r.name })}
        columns={[
          { key: "name", label: "Món", value: (r) => r.name, render: (r) => <span className="o-bh-name"><Thumb src={r.image} name={r.name} /> {r.name}{!r.active && <Badge>Ngừng bán</Badge>}</span> },
          { key: "views", label: "Xem", value: (r) => r.views, numeric: true },
          { key: "viewers", label: "Khách xem", value: (r) => r.viewers, numeric: true, optional: true },
          { key: "adds", label: "Thêm giỏ (ly)", value: (r) => r.addQty, numeric: true },
          { key: "removes", label: "Bớt (ly)", value: (r) => r.removes, numeric: true },
          { key: "orders", label: "Đặt (ly)", value: (r) => r.ordersQty, numeric: true },
          { key: "v2c", label: "Xem → giỏ", value: (r) => r.viewToCartPct, numeric: true, render: (r) => pct(r.viewToCartPct) },
          { key: "c2o", label: "Giỏ → đặt", value: (r) => r.cartToOrderPct, numeric: true, render: (r) => pct(r.cartToOrderPct) },
          {
            key: "flag", label: "Cảnh báo", value: (r) => (r.flag ? FLAG[r.flag].label : ""),
            render: (r) =>
              r.flag ? (
                <span className="o-inline" onClick={(e) => e.stopPropagation()}>
                  <Badge tone={FLAG[r.flag].tone}>{FLAG[r.flag].label}</Badge>
                  {r.flag === "VIEW_NO_BUY" && <Button size="sm" icon={Star} onClick={() => nav("/app/sales/reviews")}>Xem đánh giá món</Button>}
                </span>
              ) : null,
          },
        ]}
        searchText={(r) => r.name}
        filters={[
          { id: "VIEW_NO_BUY", label: "Xem nhiều, ít mua", test: (r) => r.flag === "VIEW_NO_BUY" },
          { id: "CART_DROP", label: "Hay bị bỏ khỏi giỏ", test: (r) => r.flag === "CART_DROP" },
        ]}
        exportName="hanh-vi-khach-theo-mon"
        pageSize={30}
        emptyState={<EmptyState icon={MousePointerClick} title="Chưa có món nào được xem / thêm giỏ" />}
      />
    </section>
  );
}

/** Màn hình: cột ngang thời gian trung vị + bảng lượt xem, tổng phút, % thoát */
function Screens({ rows }: { rows: ScreenRow[] }) {
  const ranked = rows.filter((r) => r.ranked);
  const chart = ranked.slice(0, 10).map((r) => ({ label: r.label, sec: r.medianSec }));
  return (
    <ChartCard title="Khách ở lại màn hình nào lâu nhất" description="Xếp theo thời gian trung vị (một vài người treo máy không làm lệch) · chỉ xếp hạng màn có ≥ 20 lượt">
      <div className="o-bh-screens">
        {chart.length ? (
          <figure className="o-chart" aria-label="Thời gian trung vị theo màn hình">
            <ResponsiveContainer width="100%" height={Math.max(160, chart.length * 34)}>
              <RBarChart data={chart} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid horizontal={false} stroke="#F3F4F6" />
                <XAxis type="number" tick={{ fill: "#6B7280", fontSize: 12 }} axisLine={false} tickLine={false} unit="s" />
                <YAxis type="category" dataKey="label" tick={{ fill: "#374151", fontSize: 12 }} axisLine={false} tickLine={false} width={120} />
                <Tooltip formatter={(v) => [secText(Number(v)), "Trung vị"]} cursor={{ fill: "#F9FAFB" }} />
                <Bar dataKey="sec" fill={CHART_COLORS[0]} barSize={14} radius={[0, 4, 4, 0]} isAnimationActive={false} />
              </RBarChart>
            </ResponsiveContainer>
          </figure>
        ) : <p className="o-dash-empty">Chưa có màn hình nào đủ 20 lượt xem.</p>}
        <div className="o-bh-scroll">
          <DashTable
            rows={rows}
            rowKey={(r) => r.screen}
            columns={[
              { key: "label", label: "Màn hình", render: (r) => <>{r.label}{!r.ranked && <span className="o-muted"> (ít lượt)</span>}</> },
              { key: "views", label: "Lượt xem", numeric: true, render: (r) => n(r.views) },
              { key: "median", label: "Trung vị", numeric: true, render: (r) => secText(r.medianSec) },
              { key: "avg", label: "Trung bình", numeric: true, render: (r) => secText(r.avgSec) },
              { key: "total", label: "Tổng phút", numeric: true, render: (r) => n(r.totalMin) },
              { key: "exit", label: "% thoát", numeric: true, render: (r) => (r.exits ? pct(r.exitPct) : "—") },
            ]}
          />
        </div>
      </div>
      <p className="o-bh-note">Tính thời gian khách thật sự xem, không tính lúc ẩn tab hoặc để yên quá 60 giây. "% thoát": trong các phiên rời đi mà không đặt đơn, % phiên có màn cuối là màn này.</p>
    </ChartCard>
  );
}

function Heatmap({ cells }: { cells: Insights["heatmap"] }) {
  const grid = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c.visits]));
  const max = Math.max(1, ...cells.map((c) => c.visits));
  // Thứ 2 → Chủ nhật; chỉ hiện các giờ có khách (bỏ đêm khuya trống)
  const hours = Array.from({ length: 24 }, (_, h) => h).filter((h) => cells.some((c) => c.hour === h && c.visits > 0));
  if (!hours.length) return <p className="o-dash-empty">Chưa có dữ liệu.</p>;
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="o-bh-scroll">
      <table className="o-bh-heat" aria-label="Số phiên theo giờ và thứ">
        <thead>
          <tr><th scope="col" />{hours.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
        </thead>
        <tbody>
          {order.map((d) => (
            <tr key={d}>
              <th scope="row">{DOW[d]}</th>
              {hours.map((h) => {
                const v = grid.get(`${d}-${h}`) ?? 0;
                return <td key={h} title={`${DOW[d]} ${h}:00 — ${n(v)} phiên`} style={{ background: v ? `rgba(111, 78, 55, ${0.08 + (v / max) * 0.85})` : undefined }} />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Chi tiết 1 món: xem / thêm / đặt theo ngày, nguồn thêm giỏ, màn hình ngay trước khi mở món */
function ProductModal({ id, name, qs, onClose }: { id: number; name: string; qs: string; onClose: () => void }) {
  const { data, loading, error } = useResource<ProductDetail | null>(`/api/behavior-insights/product/${id}?${qs}`, null);
  return (
    <Modal title={data?.product.name ?? name} size="lg" onClose={onClose}>
      <div className="o-stack">
        {error && <Alert>{error}</Alert>}
        {loading && !data && <p className="o-muted">Đang tải…</p>}
        {data && (
          <>
            {data.days.length ? (
              <LineChart
                ariaLabel="Xem, thêm giỏ, đặt theo ngày"
                data={data.days.map((d) => ({ label: dm(d.day), views: d.views, adds: d.adds, orders: d.orders }))}
                xKey="label"
                series={[{ key: "views", label: "Lượt xem" }, { key: "adds", label: "Thêm giỏ (ly)" }, { key: "orders", label: "Đặt (ly)" }]}
                yFormat={(v) => n(v)}
                height={220}
              />
            ) : <p className="o-dash-empty">Không có lượt xem / thêm giỏ trong kỳ.</p>}
            <div className="o-dash-row is-2">
              <div>
                <h3 className="o-bh-h3">Nguồn thêm giỏ</h3>
                <DashTable rows={data.sources} rowKey={(r) => r.source} empty="Chưa có lượt thêm giỏ." columns={[
                  { key: "l", label: "Nguồn", render: (r) => r.label },
                  { key: "a", label: "Lượt", numeric: true, render: (r) => n(r.adds) },
                  { key: "p", label: "%", numeric: true, render: (r) => pct(r.pct) },
                ]} />
              </div>
              <div>
                <h3 className="o-bh-h3">Khách mở món này từ đâu</h3>
                <DashTable rows={data.prevScreens} rowKey={(r) => r.screen} empty="Chưa có lượt xem." columns={[
                  { key: "l", label: "Màn hình trước", render: (r) => r.label },
                  { key: "v", label: "Lượt", numeric: true, render: (r) => n(r.views) },
                  { key: "p", label: "%", numeric: true, render: (r) => pct(r.pct) },
                ]} />
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
