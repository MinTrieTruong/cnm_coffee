/**
 * Biểu đồ dùng recharts, cùng một kiểu: lưới ngang mờ, trục chữ xám 12px, chú thích ô vuông nhỏ ở dưới.
 * Import trực tiếp file này (không qua components/erp/index) để recharts chỉ tải cùng màn có biểu đồ.
 */
import {
  Area,
  AreaChart,
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

/** Bảng màu biểu đồ — theo thứ tự cố định, không xoay vòng */
export const CHART_COLORS = ["#6F4E37", "#16A34A", "#2563EB", "#D97706"] as const;
export const CHART_UP = "#16A34A";
export const CHART_DOWN = "#DC2626";

const GRID = "#F3F4F6";
const AXIS = { fill: "#6B7280", fontSize: 12 };

export type Series = { key: string; label: string; color?: string };

const vi = new Intl.NumberFormat("vi-VN");
/** Rút gọn trục: 1.250.000 → "1,3 tr" */
export function compactVnd(n: number) {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ`;
  if (a >= 1e6) return `${(n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
  if (a >= 1e3) return `${(n / 1e3).toLocaleString("vi-VN", { maximumFractionDigits: 0 })}k`;
  return vi.format(n);
}

function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <ul className="o-chart-legend">
      {items.map((i) => (
        <li key={i.label}>
          <span className="o-chart-swatch" style={{ background: i.color }} aria-hidden />
          <span>{i.label}</span>
          {i.value && <span className="o-chart-legend-value">{i.value}</span>}
        </li>
      ))}
    </ul>
  );
}

const colorOf = (s: Series, i: number) => s.color ?? CHART_COLORS[i % CHART_COLORS.length];

function ChartTooltip({ active, payload, label, format, series }: TooltipProps<number, string> & { format: (n: number) => string; series: Series[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="o-chart-tip">
      <div className="o-chart-tip-title">{label}</div>
      {series.map((s, i) => {
        const p = payload.find((x) => x.dataKey === s.key);
        if (!p) return null;
        return (
          <div key={s.key} className="o-chart-tip-row">
            <span className="o-chart-swatch" style={{ background: colorOf(s, i) }} aria-hidden />
            <span>{s.label}</span>
            <strong>{format(Number(p.value ?? 0))}</strong>
          </div>
        );
      })}
    </div>
  );
}

type XYProps = {
  data: Record<string, string | number>[];
  xKey: string;
  series: Series[];
  height?: number;
  /** Định dạng số trong tooltip */
  format?: (n: number) => string;
  /** Định dạng số trên trục dọc */
  yFormat?: (n: number) => string;
  /** Mô tả cho trình đọc màn hình */
  ariaLabel: string;
};

/** Đường cong mềm, tô nền nhạt dưới đường */
export function LineChart({ data, xKey, series, height = 260, format = (n) => vi.format(n), yFormat = compactVnd, ariaLabel }: XYProps) {
  return (
    <figure className="o-chart" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} minTickGap={16} tickMargin={8} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={yFormat} width={56} />
          <Tooltip content={<ChartTooltip format={format} series={series} />} cursor={{ stroke: "#D1D5DB", strokeDasharray: "3 3" }} />
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={colorOf(s, i)}
              strokeWidth={2}
              fill={colorOf(s, i)}
              fillOpacity={0.08}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      {series.length > 1 && <Legend items={series.map((s, i) => ({ label: s.label, color: colorOf(s, i) }))} />}
    </figure>
  );
}

/** Cột mảnh, nhiều series đặt cạnh nhau */
export function BarChart({ data, xKey, series, height = 260, format = (n) => vi.format(n), yFormat = (n) => vi.format(n), ariaLabel, barSize = 10 }: XYProps & { barSize?: number }) {
  return (
    <figure className="o-chart" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={height}>
        <RBarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="24%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} minTickGap={8} tickMargin={8} interval="preserveStartEnd" />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={yFormat} width={56} allowDecimals={false} />
          <Tooltip content={<ChartTooltip format={format} series={series} />} cursor={{ fill: "#F9FAFB" }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={colorOf(s, i)} barSize={barSize} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          ))}
        </RBarChart>
      </ResponsiveContainer>
      {series.length > 1 && <Legend items={series.map((s, i) => ({ label: s.label, color: colorOf(s, i) }))} />}
    </figure>
  );
}

/** Vành khuyên: tổng ở giữa, chú thích kèm giá trị & % ở dưới */
export function DonutChart({
  data,
  height = 220,
  format = (n) => vi.format(n),
  centerLabel,
  ariaLabel,
}: {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  format?: (n: number) => string;
  centerLabel?: string;
  ariaLabel: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const rows = data.map((d, i) => ({ ...d, color: d.color ?? CHART_COLORS[i % CHART_COLORS.length] }));
  const pct = (v: number) => (total > 0 ? `${Math.round((v / total) * 100)}%` : "0%");
  return (
    <figure className="o-chart" aria-label={ariaLabel}>
      <div className="o-donut" style={{ height }}>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={total > 0 ? rows : [{ label: "—", value: 1, color: "#F3F4F6" }]}
              dataKey="value"
              nameKey="label"
              innerRadius="68%"
              outerRadius="92%"
              paddingAngle={total > 0 && rows.filter((r) => r.value > 0).length > 1 ? 2 : 0}
              stroke="#fff"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {(total > 0 ? rows : [{ color: "#F3F4F6" }]).map((r, i) => <Cell key={i} fill={r.color} />)}
            </Pie>
            {total > 0 && (
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.[0] ? (
                    <div className="o-chart-tip">
                      <div className="o-chart-tip-row">
                        <span className="o-chart-swatch" style={{ background: (payload[0].payload as { color: string }).color }} aria-hidden />
                        <span>{payload[0].name}</span>
                        <strong>{format(Number(payload[0].value))} · {pct(Number(payload[0].value))}</strong>
                      </div>
                    </div>
                  ) : null
                }
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="o-donut-center" aria-hidden>
          <strong>{format(total)}</strong>
          {centerLabel && <span>{centerLabel}</span>}
        </div>
      </div>
      <Legend items={rows.map((r) => ({ label: r.label, color: r.color, value: `${format(r.value)} · ${pct(r.value)}` }))} />
    </figure>
  );
}
