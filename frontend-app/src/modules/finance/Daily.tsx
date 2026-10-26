import { useState, type ReactNode } from "react";
import { activeStoreId, getStaffInfo, isOwnerRole } from "../../lib/staffApi";
import { Alert, Badge, ControlPanel, Kpi, formatVnd } from "../../components/erp";
import { useResource } from "../shared";
import { Money, PrintButton, STATUS, catLabel, flowLabel, type CashEntry, type MethodRow, type SafeSession } from "./shared";
import { ShiftReportModal } from "./Shifts";

type Daily = {
  date: string;
  store: { name: string; address: string | null };
  sales: { orders: number; subTotal: number; discounts: number; vat: number; points: number; shippingFee: number; totalCollected: number; netRevenue: number };
  byMethod: MethodRow[];
  cashTotal: number;
  bankTotal: number;
  unassignedOnline: number;
  shifts: {
    id: number;
    startTime: string;
    endTime: string | null;
    startingCash: number;
    expectedCash: number | null;
    actualCash: number | null;
    differenceAmt: number | null;
    note: string | null;
    reviewedAt: string | null;
    staff: { fullName: string };
  }[];
  income: { category: string; label: string; count: number; amount: number }[];
  expense: { category: string; label: string; count: number; amount: number }[];
  adjustments: CashEntry[];
  pending: CashEntry[];
  entries: CashEntry[];
  safeSessions: SafeSession[];
  funds: { safeStart: number; safeEnd: number; bankStart: number; bankEnd: number };
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function Row({ label, value, strong, muted }: { label: ReactNode; value: ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <tr style={{ fontWeight: strong ? 700 : undefined, color: muted ? "var(--o-text-2)" : undefined }}>
      <td>{label}</td>
      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{value}</td>
    </tr>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="o-panel">
      <div className="o-panel-head">{title}</div>
      <div style={{ padding: "8px 14px" }}>{children}</div>
    </div>
  );
}

/**
 * Tài chính › Báo cáo cuối ngày (1 chi nhánh): tiền theo phương thức, các ca & chênh lệch,
 * thu chi trong ngày, số dư két / ngân hàng đầu – cuối ngày, các lần mở két. In được.
 */
export function DailyReport() {
  const [date, setDate] = useState(today);
  const needStore = isOwnerRole(getStaffInfo()?.role) && activeStoreId() == null;
  const { data: d, loading, error } = useResource<Daily | null>(needStore ? null : `/api/cash/daily?date=${date}`, null);
  const [shift, setShift] = useState<number | null>(null);

  return (
    <div>
      <ControlPanel
        crumbs={[{ label: "Báo cáo cuối ngày" }]}
        actions={
          <>
            <input type="date" className="o-input" style={{ width: 160 }} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Ngày" />
            <PrintButton />
          </>
        }
      />
      <div className="o-content o-stack">
        {needStore && <Alert tone="info">Chọn một chi nhánh ở góc trên để xem báo cáo cuối ngày.</Alert>}
        {error && <Alert>{error}</Alert>}
        {loading && !d && <div className="o-muted">Đang tổng hợp…</div>}
        {d && (
          <div className="cash-print o-stack" style={{ gap: 16 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{d.store.name} — Báo cáo cuối ngày {new Date(d.date).toLocaleDateString("vi-VN")}</div>
              {d.store.address && <div className="o-muted">{d.store.address}</div>}
            </div>

            <div className="o-kpis">
              <Kpi label="Tổng tiền thu" value={formatVnd(d.sales.totalCollected)} />
              <Kpi label="Tiền mặt" value={formatVnd(d.cashTotal)} tone="success" />
              <Kpi label="Chuyển khoản / thẻ / online" value={formatVnd(d.bankTotal)} tone="info" />
              <Kpi label="Doanh thu quán (trừ phí ship)" value={formatVnd(d.sales.netRevenue)} />
            </div>

            <div className="o-groups" style={{ gap: 16 }}>
              <Section title="Tiền thu theo phương thức">
                <table className="o-list"><tbody>
                  {d.byMethod.map((m) => <Row key={m.method} label={`${m.label} (${m.count} giao dịch)`} value={formatVnd(m.amount)} muted={m.method === "Points" || m.method === "PointsRefund"} />)}
                  <Row label="Tổng tiền thật (không gồm điểm)" value={formatVnd(d.sales.totalCollected)} strong />
                  {d.unassignedOnline > 0 && <Row label="— online chưa thu ngân nào xác nhận vào ca" value={formatVnd(d.unassignedOnline)} muted />}
                </tbody></table>
              </Section>

              <Section title="Bán hàng">
                <table className="o-list"><tbody>
                  <Row label="Số đơn đã thanh toán" value={d.sales.orders} />
                  <Row label="Tạm tính" value={formatVnd(d.sales.subTotal)} />
                  <Row label="Giảm giá / voucher" value={formatVnd(d.sales.discounts)} />
                  <Row label="Điểm đổi" value={formatVnd(d.sales.points)} />
                  <Row label="VAT" value={formatVnd(d.sales.vat)} />
                  <Row label="Phí ship (thu hộ shipper, cộng lương)" value={formatVnd(d.sales.shippingFee)} />
                  <Row label="Doanh thu quán" value={formatVnd(d.sales.netRevenue)} strong />
                </tbody></table>
              </Section>
            </div>

            <Section title="Các ca thu ngân">
              {d.shifts.length === 0 ? <div className="o-muted">Không có ca nào.</div> : (
                <table className="o-list">
                  <thead><tr><th>Ca</th><th>Thu ngân</th><th>Giờ</th><th style={{ textAlign: "right" }}>Đầu ca</th><th style={{ textAlign: "right" }}>TM dự kiến</th><th style={{ textAlign: "right" }}>Đếm được</th><th style={{ textAlign: "right" }}>Lệch</th><th>Ghi chú</th></tr></thead>
                  <tbody>
                    {d.shifts.map((s) => (
                      <tr key={s.id} style={{ cursor: "pointer" }} onClick={() => setShift(s.id)}>
                        <td>#{s.id}</td>
                        <td>{s.staff.fullName}</td>
                        <td>{new Date(s.startTime).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} – {s.endTime ? new Date(s.endTime).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "đang mở"}</td>
                        <td style={{ textAlign: "right" }}>{formatVnd(s.startingCash)}</td>
                        <td style={{ textAlign: "right" }}>{s.expectedCash != null ? formatVnd(s.expectedCash) : ""}</td>
                        <td style={{ textAlign: "right" }}>{s.actualCash != null ? formatVnd(s.actualCash) : ""}</td>
                        <td style={{ textAlign: "right" }}>{s.endTime ? <Money value={s.differenceAmt ?? 0} signed /> : ""}</td>
                        <td>{s.note}{s.reviewedAt && <> <Badge tone="success">QL đã xác nhận</Badge></>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            <div className="o-groups" style={{ gap: 16 }}>
              <Section title="Chi trong ngày">
                {d.expense.length === 0 ? <div className="o-muted">Không có khoản chi.</div> : (
                  <table className="o-list"><tbody>
                    {d.expense.map((x) => <Row key={x.category} label={`${x.label} (${x.count})`} value={formatVnd(x.amount)} />)}
                    <Row label="Tổng chi" value={formatVnd(d.expense.reduce((s, x) => s + x.amount, 0))} strong />
                  </tbody></table>
                )}
              </Section>
              <Section title="Thu khác trong ngày">
                {d.income.length === 0 ? <div className="o-muted">Không có khoản thu khác.</div> : (
                  <table className="o-list"><tbody>
                    {d.income.map((x) => <Row key={x.category} label={`${x.label} (${x.count})`} value={formatVnd(x.amount)} />)}
                  </tbody></table>
                )}
              </Section>
            </div>

            <div className="o-groups" style={{ gap: 16 }}>
              <Section title="Số dư quỹ">
                <table className="o-list">
                  <thead><tr><th>Quỹ</th><th style={{ textAlign: "right" }}>Đầu ngày</th><th style={{ textAlign: "right" }}>Cuối ngày</th></tr></thead>
                  <tbody>
                    <tr><td>Két sắt</td><td style={{ textAlign: "right" }}>{formatVnd(d.funds.safeStart)}</td><td style={{ textAlign: "right" }}>{formatVnd(d.funds.safeEnd)}</td></tr>
                    <tr><td>Ngân hàng</td><td style={{ textAlign: "right" }}>{formatVnd(d.funds.bankStart)}</td><td style={{ textAlign: "right" }}>{formatVnd(d.funds.bankEnd)}</td></tr>
                  </tbody>
                </table>
              </Section>
              <Section title="Mở / đóng két trong ngày">
                {d.safeSessions.length === 0 ? <div className="o-muted">Két không được mở.</div> : (
                  <table className="o-list"><tbody>
                    {d.safeSessions.map((x) => (
                      <tr key={x.id}>
                        <td>{new Date(x.openedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} {x.openedBy?.fullName} — {x.reason}</td>
                        <td style={{ textAlign: "right" }}>{x.closedAt ? (x.difference ? <Money value={x.difference} signed /> : <Badge tone="success">Khớp</Badge>) : <Badge tone="warning">Chưa đóng</Badge>}</td>
                      </tr>
                    ))}
                  </tbody></table>
                )}
              </Section>
            </div>

            {(d.pending.length > 0 || d.adjustments.length > 0) && (
              <Section title="Cần chú ý">
                <table className="o-list"><tbody>
                  {d.pending.map((e) => <Row key={e.id} label={<>{e.code} · {catLabel(e.category)} — {e.description} <Badge tone={STATUS.PENDING.tone}>Chờ duyệt</Badge></>} value={formatVnd(e.amount)} />)}
                  {d.adjustments.map((e) => <Row key={e.id} label={`${e.code} · ${e.description}`} value={<Money value={e.toFund ? e.amount : -e.amount} signed />} />)}
                </tbody></table>
              </Section>
            )}

            <Section title="Chi tiết phiếu trong ngày">
              {d.entries.length === 0 ? <div className="o-muted">Không có phiếu.</div> : (
                <table className="o-list">
                  <thead><tr><th>Giờ</th><th>Phiếu</th><th>Nội dung</th><th>Quỹ</th><th>Người lập</th><th style={{ textAlign: "right" }}>Số tiền</th></tr></thead>
                  <tbody>
                    {d.entries.map((e) => (
                      <tr key={e.id} style={{ opacity: e.status === "APPROVED" ? 1 : 0.55 }}>
                        <td>{new Date(e.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</td>
                        <td>{e.code}</td>
                        <td>{catLabel(e.category)} — {e.description}{e.status !== "APPROVED" && ` (${STATUS[e.status].label})`}</td>
                        <td>{flowLabel(e)}</td>
                        <td>{e.createdBy?.fullName}</td>
                        <td style={{ textAlign: "right" }}>{formatVnd(e.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          </div>
        )}
      </div>
      {shift != null && <ShiftReportModal id={shift} onClose={() => setShift(null)} />}
    </div>
  );
}
