import { useEffect, useState } from "react";
import { Cake, Gift, Ticket } from "lucide-react";
import { staffApi } from "../../lib/staffApi";
import { Alert, Badge, Button, EmptyState, Field, Kpi, Modal, errMsg, fmtDate, fmtDateTime, formatVnd, type Tone } from "../../components/erp";
import { BarChart, CHART_COLORS } from "../../components/erp/charts";

/* ── Kiểu dữ liệu GET /api/admin/customers/:id/insights ── */
export type LifeStatus = "NONE" | "NEW" | "RETURNING" | "LOYAL" | "AT_RISK" | "LOST";
type CountRow = { key: string; count: number };
export type Insights = {
  customer: { avatarUrl: string | null };
  overview: {
    orderCount: number; totalSpent: number; avgOrder: number; firstAt: string | null; lastAt: string | null;
    status: LifeStatus; daysSince: number | null; avgGapDays: number | null; activeMonths6: number;
    lifetimeSpend: number; rankFloor: number; nextRank: { id: string; label: string; min: number; remaining: number } | null;
    birthdayInDays: number | null;
  };
  habits: {
    topItems: { productId: number; name: string; qty: number; orderShare: number; size: string | null; temperature: string | null; sugar: string | null; ice: string | null }[];
    hours: number[]; weekdayParts: number[][]; channels: CountRow[]; stores: CountRow[]; payments: CountRow[];
  };
  vouchers: { id: number; code: string; description: string | null; discountValue: number; minBillValue: number; endDate: string; claimedAt: string; usedAt: string | null; orderId: number | null; state: "ACTIVE" | "USED" | "EXPIRED" }[];
  games: { ticketsUnused: number; plays: { id: number; playedAt: string; prizeLabel: string; prizeKind: string; campaign: string | null }[] };
  gifts: { id: number; code: string; name: string; store: string | null; status: string; expiresAt: string; deliveredAt: string | null; createdAt: string }[];
  reviews: { id: number; rating: number; comment: string | null; createdAt: string; hidden: boolean; adminReply: string | null; product: string | null }[];
};

export const LIFE: Record<LifeStatus, { label: string; tone: Tone; hint: string }> = {
  NONE: { label: "Chưa mua", tone: "neutral", hint: "Chưa có đơn đã thanh toán" },
  NEW: { label: "Mới", tone: "info", hint: "Mới mua 1 đơn" },
  RETURNING: { label: "Quay lại", tone: "primary", hint: "Đã mua từ 2 đơn" },
  LOYAL: { label: "Thân thiết", tone: "success", hint: "Từ 5 đơn, mua đều ít nhất 3 trong 6 tháng gần nhất" },
  AT_RISK: { label: "Sắp rời", tone: "warning", hint: "Lâu hơn 2 lần chu kỳ ghé quen thuộc mà chưa quay lại" },
  LOST: { label: "Đã rời", tone: "danger", hint: "Hơn 60 ngày không ghé" },
};
const CHANNEL: Record<string, string> = { "Dine-in": "Tại quán", Takeaway: "Mang về", Delivery: "Giao hàng" };
const PAY: Record<string, string> = { Cash: "Tiền mặt", SePay: "Chuyển khoản", VNPay: "VNPay", COD: "Thu tiền khi giao", Card: "Thẻ", Points: "Điểm" };
const POINT_TYPE: Record<string, string> = {
  EARN: "Tích điểm", REDEEM: "Dùng điểm", REDEEM_RETURN: "Trả lại điểm đã dùng", EARN_REVERSAL: "Thu hồi điểm thưởng",
  CANCEL_REFUND: "Hoàn điểm khi huỷ đơn", ADJUST: "Điều chỉnh", GAME: "Mini game", REVIEW: "Thưởng đánh giá",
};
const GIFT: Record<string, { label: string; tone: Tone }> = {
  WAITING: { label: "Chờ nhận", tone: "warning" }, DELIVERED: { label: "Đã nhận", tone: "success" }, EXPIRED: { label: "Hết hạn", tone: "neutral" }, CANCELLED: { label: "Đã huỷ", tone: "neutral" },
};
const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const PARTS = ["Sáng 6–11h", "Trưa 11–14h", "Chiều 14–18h", "Tối 18h–"];
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);
/** "10:50 03/11/26" — gọn cho bảng lịch sử */
const shortDT = (s: string) => new Date(s).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "2-digit" });

/* ═════════ Tab Tổng quan: số liệu chính ═════════ */
export function OverviewKpis({ d, rankLabel }: { d: Insights; rankLabel: string }) {
  const o = d.overview;
  const life = LIFE[o.status];
  const progress = o.nextRank ? Math.min(100, Math.round(((o.lifetimeSpend - o.rankFloor) / (o.nextRank.min - o.rankFloor)) * 100)) : 100;
  return (
    <div className="o-stack">
      <div className="o-row" style={{ gap: 8 }}>
        <span title={life.hint}><Badge tone={life.tone}>{life.label}</Badge></span>
        {o.daysSince != null && <span className="o-muted">Ghé gần nhất {o.daysSince === 0 ? "hôm nay" : `${o.daysSince} ngày trước`}</span>}
        {o.birthdayInDays != null && o.birthdayInDays <= 7 && (
          <Badge tone="warning"><Cake size={12} aria-hidden /> {o.birthdayInDays === 0 ? "Sinh nhật hôm nay" : `Sinh nhật sau ${o.birthdayInDays} ngày`}</Badge>
        )}
      </div>
      <div className="o-kpis">
        <Kpi label="Tổng chi tiêu" value={formatVnd(o.totalSpent)} />
        <Kpi label="Số đơn" value={o.orderCount} />
        <Kpi label="Trung bình / đơn" value={formatVnd(o.avgOrder)} />
        <Kpi label="Chu kỳ ghé" value={o.avgGapDays != null ? `${o.avgGapDays} ngày/lần` : "—"} />
        <Kpi label="Tháng có mua (6 tháng)" value={`${o.activeMonths6}/6`} />
        <Kpi label="Lần đầu · gần nhất" value={o.firstAt ? `${fmtDate(o.firstAt)} · ${fmtDate(o.lastAt)}` : "—"} />
      </div>
      <div className="o-cust-rank">
        <div className="o-row" style={{ justifyContent: "space-between" }}>
          <span>Hạng <strong>{rankLabel}</strong> · tích luỹ {formatVnd(o.lifetimeSpend)}</span>
          <span className="o-muted">{o.nextRank ? `Còn ${formatVnd(o.nextRank.remaining)} để lên ${o.nextRank.label}` : "Hạng cao nhất"}</span>
        </div>
        <div className="o-cust-bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ lên hạng">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}

/* ═════════ Tab Thói quen ═════════ */
export function HabitsTab({ d }: { d: Insights }) {
  const h = d.habits;
  const total = d.overview.orderCount;
  if (!total) return <EmptyState title="Chưa có đơn đã thanh toán" hint="Khi khách mua hàng, thói quen sẽ hiện ở đây." />;
  const hourData = h.hours.map((n, i) => ({ hour: `${i}h`, orders: n })).filter((_, i) => i >= 6 || h.hours[i] > 0);
  const maxCell = Math.max(1, ...h.weekdayParts.flat());
  const opt = (it: Insights["habits"]["topItems"][number]) =>
    [it.size && `size ${it.size}`, it.temperature === "HOT" ? "nóng" : it.temperature === "ICED" ? "đá" : null, it.sugar && `đường ${it.sugar}`, it.ice && it.temperature !== "HOT" && `đá ${it.ice}`].filter(Boolean).join(" · ");
  return (
    <div className="o-stack">
      <section className="o-card">
        <div className="o-card-head"><h3>Món hay gọi</h3><span className="o-muted">tỷ lệ = số đơn có món / tổng {total} đơn</span></div>
        <table className="o-list">
          <thead><tr><th>Món</th><th className="num">Số ly</th><th className="num">Tỷ lệ đơn</th><th>Hay chọn</th></tr></thead>
          <tbody>
            {h.topItems.map((it) => (
              <tr key={it.productId}>
                <td>{it.name}</td>
                <td className="num">{it.qty}</td>
                <td className="num">{it.orderShare}%</td>
                <td className="o-muted">{opt(it) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="o-cust-2col">
        <section className="o-card">
          <div className="o-card-head"><h3>Khung giờ mua</h3><span className="o-muted">số đơn theo giờ</span></div>
          <div style={{ padding: "8px 8px 4px" }}>
            <BarChart data={hourData} xKey="hour" series={[{ key: "orders", label: "Số đơn", color: CHART_COLORS[0] }]} height={200} ariaLabel="Số đơn theo giờ trong ngày" />
          </div>
        </section>
        <section className="o-card">
          <div className="o-card-head"><h3>Ngày trong tuần × buổi</h3><span className="o-muted">ô đậm = ghé nhiều</span></div>
          <div className="o-cust-heat-wrap">
            <table className="o-cust-heat">
              <thead><tr><th />{PARTS.map((p) => <th key={p}>{p}</th>)}</tr></thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
                  <tr key={wd}>
                    <th>{WEEKDAY[wd]}</th>
                    {h.weekdayParts[wd].map((n, pi) => (
                      <td key={pi} title={`${WEEKDAY[wd]} · ${PARTS[pi]}: ${n} đơn`} style={{ background: n ? `color-mix(in srgb, ${CHART_COLORS[0]} ${Math.round(15 + (n / maxCell) * 70)}%, transparent)` : undefined, color: n / maxCell > 0.55 ? "#fff" : undefined }}>
                        {n || ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="o-cust-3col">
        <ShareCard title="Kênh mua" rows={h.channels} total={total} label={(k) => CHANNEL[k] ?? k} />
        <ShareCard title="Chi nhánh hay ghé" rows={h.stores} total={total} label={(k) => k} />
        <ShareCard title="Cách thanh toán" rows={h.payments} total={h.payments.reduce((s, r) => s + r.count, 0)} label={(k) => PAY[k] ?? k} />
      </div>
    </div>
  );
}

function ShareCard({ title, rows, total, label }: { title: string; rows: CountRow[]; total: number; label: (k: string) => string }) {
  return (
    <section className="o-card">
      <div className="o-card-head"><h3>{title}</h3></div>
      <ul className="o-cust-share">
        {rows.length === 0 && <li className="o-muted">—</li>}
        {rows.map((r) => (
          <li key={r.key}>
            <span className="o-cust-share-top"><span>{label(r.key)}</span><span className="o-muted">{r.count} · {pct(r.count, total)}%</span></span>
            <span className="o-cust-bar is-thin"><span style={{ width: `${pct(r.count, total)}%` }} /></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ═════════ Tab Lịch sử mua ═════════ */
type OrderRow = {
  id: number; orderType: string; subTotal: number; discountAmt: number; pointsUsed: number; pointsRedeemAmt: number; pointsEarned: number;
  shippingFee: number; totalAmount: number; voucherCode: string | null; paidAt: string | null; createdAt: string;
  store: { name: string } | null;
  details: { id: number; quantity: number; unitPrice: number; size: string | null; customNotes: string | null; isGift: boolean; product: { name: string } }[];
};
export function OrdersTab({ customerId }: { customerId: number }) {
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<{ total: number; limit: number; rows: OrderRow[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    const q = new URLSearchParams({ page: String(page) });
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    staffApi<{ total: number; limit: number; rows: OrderRow[] }>(`/api/admin/customers/${customerId}/orders?${q}`).then(setData).catch((e) => setErr(errMsg(e)));
  }, [customerId, page, from, to]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  return (
    <div className="o-stack">
      <div className="o-row">
        <label className="o-inline">Từ <input className="o-input" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></label>
        <label className="o-inline">đến <input className="o-input" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></label>
        {data && <span className="o-muted">{data.total} đơn</span>}
      </div>
      {err && <Alert>{err}</Alert>}
      {data && data.rows.length === 0 ? (
        <EmptyState title="Không có đơn trong khoảng này" />
      ) : (
        <div className="o-list-wrap o-cust-scroll">
          <table className="o-list">
            <thead>
              <tr><th>Đơn</th><th>Thời gian</th><th>Chi nhánh</th><th>Loại</th><th>Món</th><th className="num">Tổng</th><th className="num">Điểm</th></tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((o) => {
                const items = o.details.filter((x) => !x.isGift);
                return [
                  <tr key={o.id} className="clickable" onClick={() => setOpen(open === o.id ? null : o.id)} aria-expanded={open === o.id}>
                    <td>#{o.id}</td>
                    <td>{shortDT(o.paidAt ?? o.createdAt)}</td>
                    <td className="o-cust-wrap">{o.store?.name ?? "—"}</td>
                    <td>{CHANNEL[o.orderType] ?? o.orderType}</td>
                    <td className="o-muted o-cust-wrap">{items.slice(0, 2).map((x) => `${x.product.name} ×${x.quantity}`).join(", ")}{items.length > 2 ? ` +${items.length - 2} món` : ""}</td>
                    <td className="num">{formatVnd(o.totalAmount)}</td>
                    <td className="num">{o.pointsEarned ? `+${o.pointsEarned.toLocaleString("vi-VN")}` : ""}{o.pointsUsed ? ` −${o.pointsUsed.toLocaleString("vi-VN")}` : ""}</td>
                  </tr>,
                  open === o.id && (
                    <tr key={`${o.id}-d`} className="o-cust-detail">
                      <td colSpan={7}>
                        <ul>
                          {o.details.map((x) => (
                            <li key={x.id}>
                              <span>{x.product.name} ×{x.quantity}{x.isGift ? " (quà tặng)" : ""}{x.customNotes ? <span className="o-muted"> · {x.customNotes}</span> : null}</span>
                              <span>{formatVnd(x.unitPrice * x.quantity)}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="o-cust-detail-sum">
                          Tạm tính {formatVnd(o.subTotal)}
                          {o.discountAmt > 0 && <> · Giảm {formatVnd(o.discountAmt)}{o.voucherCode ? ` (voucher ${o.voucherCode})` : ""}</>}
                          {o.pointsRedeemAmt > 0 && <> · Dùng điểm −{formatVnd(o.pointsRedeemAmt)}</>}
                          {o.shippingFee > 0 && <> · Phí giao {formatVnd(o.shippingFee)}</>}
                          {" "}· <strong>Tổng {formatVnd(o.totalAmount)}</strong>
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="o-row">
          <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Trước</Button>
          <span className="o-muted">Trang {page}/{pages}</span>
          <Button size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Sau</Button>
        </div>
      )}
    </div>
  );
}

/* ═════════ Tab Điểm ═════════ */
type PointRow = { id: number; createdAt: string; type: string; delta: number; note: string | null; orderId: number | null; balanceAfter: number };
export function PointsTab({ customerId }: { customerId: number }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; limit: number; balance: number; rows: PointRow[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    staffApi<{ total: number; limit: number; balance: number; rows: PointRow[] }>(`/api/admin/customers/${customerId}/points?page=${page}`).then(setData).catch((e) => setErr(errMsg(e)));
  }, [customerId, page]);
  if (err) return <Alert>{err}</Alert>;
  if (!data) return <p className="o-muted">Đang tải…</p>;
  if (!data.rows.length) return <EmptyState title="Chưa có giao dịch điểm" />;
  const pages = Math.max(1, Math.ceil(data.total / data.limit));
  return (
    <div className="o-stack">
      <div className="o-muted">Số dư hiện tại: <strong style={{ color: "var(--o-text)" }}>{data.balance.toLocaleString("vi-VN")} điểm</strong> · điểm dùng chung cả chuỗi</div>
      <div className="o-list-wrap">
        <table className="o-list">
          <thead><tr><th>Thời gian</th><th>Loại</th><th>Ghi chú</th><th className="num">Điểm</th><th className="num">Số dư sau</th></tr></thead>
          <tbody>
            {data.rows.map((t) => (
              <tr key={t.id}>
                <td>{fmtDateTime(t.createdAt)}</td>
                <td>{POINT_TYPE[t.type] ?? t.type}</td>
                <td className="o-muted">{t.note ?? (t.orderId ? `Đơn #${t.orderId}` : "—")}</td>
                <td className="num" style={{ color: t.delta >= 0 ? "var(--o-success)" : "var(--o-danger)", fontWeight: 600 }}>{t.delta >= 0 ? "+" : "−"}{Math.abs(t.delta).toLocaleString("vi-VN")}</td>
                <td className="num">{t.balanceAfter.toLocaleString("vi-VN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="o-row">
          <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Trước</Button>
          <span className="o-muted">Trang {page}/{pages}</span>
          <Button size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Sau</Button>
        </div>
      )}
    </div>
  );
}

/* ═════════ Tab Ưu đãi & quà ═════════ */
export function PerksTab({ d }: { d: Insights }) {
  const [showOld, setShowOld] = useState(false);
  const active = d.vouchers.filter((v) => v.state === "ACTIVE");
  const old = d.vouchers.filter((v) => v.state !== "ACTIVE");
  return (
    <div className="o-stack">
      <section className="o-card">
        <div className="o-card-head"><h3><Ticket size={15} aria-hidden /> Voucher đang có ({active.length})</h3></div>
        {active.length === 0 ? <p className="o-card-note o-muted">Không có voucher còn hạn.</p> : (
          <table className="o-list">
            <thead><tr><th>Mã</th><th>Ưu đãi</th><th>Đơn tối thiểu</th><th>Hạn dùng</th></tr></thead>
            <tbody>
              {active.map((v) => (
                <tr key={v.id}><td><strong>{v.code}</strong></td><td>{v.description ?? `Giảm ${formatVnd(v.discountValue)}`}</td><td>{v.minBillValue ? formatVnd(v.minBillValue) : "—"}</td><td>{fmtDate(v.endDate)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        {old.length > 0 && (
          <>
            <Button size="sm" variant="link" onClick={() => setShowOld((x) => !x)} style={{ margin: "4px 14px 10px" }}>{showOld ? "Ẩn" : "Xem"} {old.length} voucher đã dùng / hết hạn</Button>
            {showOld && (
              <table className="o-list">
                <tbody>
                  {old.map((v) => (
                    <tr key={v.id} className="o-muted"><td>{v.code}</td><td>{v.state === "USED" ? `Đã dùng ${fmtDate(v.usedAt)}${v.orderId ? ` · đơn #${v.orderId}` : ""}` : `Hết hạn ${fmtDate(v.endDate)}`}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>

      <div className="o-stack">
        <section className="o-card o-cust-scroll">
          <div className="o-card-head"><h3>Mini game</h3><span className="o-muted">{d.games.ticketsUnused} vé chưa dùng</span></div>
          {d.games.plays.length === 0 ? <p className="o-card-note o-muted">Chưa chơi lượt nào.</p> : (
            <table className="o-list">
              <thead><tr><th>Thời gian</th><th>Chương trình</th><th>Kết quả</th></tr></thead>
              <tbody>
                {d.games.plays.map((p) => (
                  <tr key={p.id}><td>{fmtDateTime(p.playedAt)}</td><td>{p.campaign ?? "—"}</td><td>{p.prizeKind === "NONE" ? <span className="o-muted">{p.prizeLabel}</span> : <strong>{p.prizeLabel}</strong>}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="o-card o-cust-scroll">
          <div className="o-card-head"><h3><Gift size={15} aria-hidden /> Quà hiện vật</h3></div>
          {d.gifts.length === 0 ? <p className="o-card-note o-muted">Chưa trúng quà hiện vật.</p> : (
            <table className="o-list">
              <thead><tr><th>Quà</th><th>Mã</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {d.gifts.map((g) => (
                  <tr key={g.id}>
                    <td>{g.name}{g.store ? <span className="o-muted"> · {g.store}</span> : null}</td>
                    <td>{g.code}</td>
                    <td>
                      <Badge tone={(GIFT[g.status] ?? GIFT.WAITING).tone}>{(GIFT[g.status] ?? { label: g.status }).label}</Badge>
                      <span className="o-muted"> {g.status === "DELIVERED" ? fmtDate(g.deliveredAt) : `hạn ${fmtDate(g.expiresAt)}`}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="o-card">
        <div className="o-card-head"><h3>Đánh giá đã viết ({d.reviews.length})</h3></div>
        {d.reviews.length === 0 ? <p className="o-card-note o-muted">Chưa có đánh giá.</p> : (
          <ul className="o-cust-reviews">
            {d.reviews.map((v) => (
              <li key={v.id}>
                <div className="o-row" style={{ gap: 6 }}>
                  <strong>{"★".repeat(v.rating)}<span className="o-muted">{"★".repeat(5 - v.rating)}</span></strong>
                  <span>{v.product ?? "Chung cho quán"}</span>
                  <span className="o-muted">· {fmtDate(v.createdAt)}</span>
                  {v.hidden && <Badge tone="danger">Đang ẩn</Badge>}
                </div>
                {v.comment && <p>{v.comment}</p>}
                {v.adminReply && <p className="o-muted">Quán phản hồi: {v.adminReply}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ═════════ Thao tác chăm sóc: tặng voucher · điều chỉnh điểm · nhắn khách ═════════ */
type GiftVoucher = { id: number; code: string; description: string | null; discountValue: number; minBillValue: number; endDate: string; alreadyOwned: boolean };
export type CareKind = "voucher" | "points" | "message";

export function CareModal({ kind, customerId, name, points, onClose, onDone }: {
  kind: CareKind; customerId: number; name: string; points: number; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [vouchers, setVouchers] = useState<GiftVoucher[] | null>(null);
  const [voucherId, setVoucherId] = useState("");
  const [note, setNote] = useState("");
  const [sign, setSign] = useState<1 | -1>(1);
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (kind !== "voucher") return;
    staffApi<GiftVoucher[]>(`/api/admin/customers/${customerId}/care/vouchers`).then(setVouchers).catch((e) => setErr(errMsg(e)));
  }, [kind, customerId]);

  async function submit() {
    setErr(null);
    let path = "";
    let payload: Record<string, unknown> = {};
    let done = "";
    if (kind === "voucher") {
      if (!voucherId) return setErr("Chọn voucher.");
      path = "voucher";
      payload = { voucherId: Number(voucherId), note };
      done = `Đã tặng voucher cho ${name}.`;
    } else if (kind === "points") {
      const n = Math.trunc(Number(amount));
      if (!(n > 0 && n <= 100_000)) return setErr("Số điểm từ 1 đến 100.000.");
      if (note.trim().length < 5) return setErr("Nhập lý do (tối thiểu 5 ký tự).");
      if (sign < 0 && n > points) return setErr(`Khách chỉ có ${points.toLocaleString("vi-VN")} điểm.`);
      path = "points";
      payload = { delta: sign * n, reason: note.trim() };
      done = `Đã ${sign > 0 ? "cộng" : "trừ"} ${n.toLocaleString("vi-VN")} điểm cho ${name}.`;
    } else {
      if (title.trim().length < 3 || body.trim().length < 3) return setErr("Nhập tiêu đề và nội dung.");
      path = "message";
      payload = { title: title.trim(), body: body.trim() };
      done = `Đã gửi tin vào Hộp thư của ${name}.`;
    }
    setBusy(true);
    try {
      await staffApi(`/api/admin/customers/${customerId}/care/${path}`, { method: "POST", body: JSON.stringify(payload) });
      onDone(done);
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  }

  const TITLE: Record<CareKind, string> = { voucher: "Tặng voucher", points: "Điều chỉnh điểm", message: "Nhắn khách" };
  const picked = vouchers?.find((v) => String(v.id) === voucherId);
  return (
    <Modal
      title={`${TITLE[kind]} · ${name}`}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" disabled={busy} onClick={() => void submit()}>{kind === "message" ? "Gửi tin" : kind === "voucher" ? "Tặng" : "Lưu"}</Button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      {kind === "voucher" && (
        <>
          <Field label="Voucher">
            {vouchers === null ? <span className="o-muted">Đang tải…</span> : vouchers.length === 0 ? (
              <span className="o-muted">Chưa có voucher cá nhân còn hạn. Tạo ở Sản phẩm › Voucher (loại "cá nhân").</span>
            ) : (
              <select className="o-input" value={voucherId} onChange={(e) => setVoucherId(e.target.value)}>
                <option value="">Chọn…</option>
                {vouchers.map((v) => (
                  <option key={v.id} value={v.id} disabled={v.alreadyOwned}>
                    {v.code} · {v.description ?? `Giảm ${formatVnd(v.discountValue)}`}{v.alreadyOwned ? " (khách đã có)" : ""}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {picked && <p className="o-hint">Đơn tối thiểu {picked.minBillValue ? formatVnd(picked.minBillValue) : "—"} · hạn dùng {fmtDate(picked.endDate)}</p>}
          <Field label="Lời nhắn (tuỳ chọn)"><input className="o-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Cảm ơn bạn đã ghé quán thường xuyên!" maxLength={500} /></Field>
        </>
      )}
      {kind === "points" && (
        <>
          <p className="o-muted" style={{ marginTop: 0 }}>Hiện có {points.toLocaleString("vi-VN")} điểm. Điểm điều chỉnh không làm đổi hạng (hạng tính theo chi tiêu).</p>
          <Field label="Thao tác">
            <select className="o-input" value={sign} onChange={(e) => setSign(Number(e.target.value) as 1 | -1)}>
              <option value={1}>Cộng điểm</option>
              <option value={-1}>Trừ điểm</option>
            </select>
          </Field>
          <Field label="Số điểm"><input className="o-input" type="number" min={1} max={100000} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Lý do"><input className="o-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={sign > 0 ? "VD: Bù đơn #52 làm sai món" : "VD: Cộng nhầm ngày 01/11"} maxLength={200} /></Field>
          <p className="o-hint">Khách nhận tin trong Hộp thư kèm lý do; giao dịch hiện ở tab Điểm.</p>
        </>
      )}
      {kind === "message" && (
        <>
          <Field label="Tiêu đề"><input className="o-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Lâu rồi không gặp bạn!" maxLength={150} /></Field>
          <Field label="Nội dung"><textarea className="o-input" rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} /></Field>
          <p className="o-hint">Tin hiện trong mục Hộp thư ở trang tài khoản của khách.</p>
        </>
      )}
    </Modal>
  );
}
