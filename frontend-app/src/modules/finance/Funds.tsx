import { useState } from "react";
import { Plus, Vault } from "lucide-react";
import { activeStoreId, getStaffInfo, isOwnerRole } from "../../lib/staffApi";
import { Alert, Badge, Button, ControlPanel, Kpi, ListView, Modal, fmtDateTime, formatVnd } from "../../components/erp";
import { useResource } from "../shared";
import {
  DenominationTable,
  EntryDialog,
  FUND_LABEL,
  Money,
  SafeCloseDialog,
  SafeOpenDialog,
  STATUS,
  catLabel,
  flowLabel,
  signedFor,
  useSafe,
  type SafeSession,
} from "./shared";

type StoreFunds = {
  store: { id: number; name: string };
  /** null: thu ngân đếm mù, không xem số dư theo sổ */
  safe: number | null;
  bank: number | null;
  drawerTotal: number | null;
  drawers: { shiftId: number; staff: { fullName: string }; startTime: string; expectedCash: number }[];
  safeSession: (SafeSession & { openedBy: { fullName: string } }) | null;
  pendingCount: number;
};

/** Tài chính › Két & quỹ — số dư két / ngân hàng / ngăn kéo, mở & đóng két, lịch sử mở két */
export function Funds() {
  const allStores = isOwnerRole(getStaffInfo()?.role) && activeStoreId() == null;
  return allStores ? <ChainFunds /> : <StoreFundsView />;
}

/** Chủ chuỗi xem tất cả chi nhánh */
function ChainFunds() {
  const { data, loading, error } = useResource<{ stores: StoreFunds[] } | null>("/api/cash/overview", null);
  const rows = data?.stores ?? [];
  return (
    <div>
      <ControlPanel crumbs={[{ label: "Két & quỹ" }]} />
      <div className="o-content o-stack">
        {error && <Alert>{error}</Alert>}
        <div className="o-kpis">
          <Kpi label="Tổng tiền trong két" value={formatVnd(rows.reduce((s, r) => s + (r.safe ?? 0), 0))} />
          <Kpi label="Tổng ngăn kéo đang mở" value={formatVnd(rows.reduce((s, r) => s + (r.drawerTotal ?? 0), 0))} />
          <Kpi label="Tổng ngân hàng (theo sổ)" value={formatVnd(rows.reduce((s, r) => s + (r.bank ?? 0), 0))} tone="info" />
        </div>
        <div className="o-panel">
          <div className="o-panel-head">Theo chi nhánh <span className="o-muted">Chọn chi nhánh ở góc trên để xem chi tiết & lịch sử mở két</span></div>
          <ListView
            rows={rows}
            rowKey={(r) => r.store.id}
            loading={loading}
            exportName="ket-quy-chi-nhanh"
            columns={[
              { key: "store", label: "Chi nhánh", value: (r) => r.store.name },
              { key: "safe", label: "Két sắt", value: (r) => r.safe ?? 0, numeric: true, sum: true, formatSum: formatVnd, render: (r) => formatVnd(r.safe ?? 0) },
              { key: "drawer", label: "Ngăn kéo đang mở", value: (r) => r.drawerTotal ?? 0, numeric: true, sum: true, formatSum: formatVnd, render: (r) => `${formatVnd(r.drawerTotal ?? 0)} (${r.drawers.length} ca)` },
              { key: "bank", label: "Ngân hàng", value: (r) => r.bank ?? 0, numeric: true, sum: true, formatSum: formatVnd, render: (r) => formatVnd(r.bank ?? 0) },
              {
                key: "status",
                label: "Két",
                value: (r) => (r.safeSession ? "Đang mở" : "Đóng"),
                render: (r) => (r.safeSession ? <Badge tone="warning">Đang mở — {r.safeSession.openedBy.fullName}</Badge> : <Badge tone="success">Đóng</Badge>),
              },
              { key: "pending", label: "Phiếu chờ duyệt", value: (r) => r.pendingCount, numeric: true },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

/** Thu ngân đếm mù → máy chủ không trả số dư */
const money = (n: number | null | undefined) => (n == null ? <span className="o-muted" style={{ fontSize: "0.9rem" }}>Ẩn (đếm mù)</span> : formatVnd(n));

function StoreFundsView() {
  const overview = useResource<{ pettyCashLimit: number; stores: StoreFunds[] } | null>("/api/cash/overview", null);
  const { safe, error, reload } = useSafe();
  const [dialog, setDialog] = useState<"open" | "close" | "entry" | null>(null);
  const [detail, setDetail] = useState<number | null>(null);
  const s = overview.data?.stores[0];
  const session = safe?.session ?? null;
  const refresh = async () => {
    await Promise.all([reload(), overview.reload()]);
  };

  return (
    <div>
      <ControlPanel
        crumbs={[{ label: "Két & quỹ" }]}
        actions={
          <>
            <Button icon={Plus} onClick={() => setDialog("entry")}>Lập phiếu</Button>
            {session ? (
              <Button variant="primary" icon={Vault} onClick={() => setDialog("close")}>Đóng két</Button>
            ) : (
              <Button variant="primary" icon={Vault} onClick={() => setDialog("open")}>Mở két</Button>
            )}
          </>
        }
      />
      <div className="o-content o-stack">
        {(error || overview.error) && <Alert>{error ?? overview.error}</Alert>}
        <div className="o-kpis">
          <Kpi label="Két sắt (theo sổ)" value={money(safe?.balance)} />
          <Kpi label="Ngăn kéo các ca đang mở" value={money(s?.drawerTotal)} />
          <Kpi label="Ngân hàng (theo sổ)" value={money(s?.bank)} tone="info" />
          <Kpi label="Phiếu chờ duyệt" value={s?.pendingCount ?? 0} tone={s?.pendingCount ? "warning" : undefined} />
        </div>

        {session ? (
          <div className="o-panel">
            <div className="o-panel-head">
              <span><Badge tone="warning">Két đang mở</Badge> {session.openedBy?.fullName} · {fmtDateTime(session.openedAt)} · Lý do: {session.reason}</span>
              {session.openingBalance != null && <span className="o-muted">Số dư lúc mở {formatVnd(session.openingBalance)}</span>}
            </div>
            <ListView
              rows={session.entries ?? []}
              rowKey={(e) => e.id}
              columns={[
                { key: "time", label: "Giờ", value: (e) => e.createdAt, render: (e) => fmtDateTime(e.createdAt) },
                { key: "cat", label: "Nội dung", value: (e) => `${catLabel(e.category)} — ${e.description ?? ""}`, wrap: true },
                { key: "by", label: "Người làm", value: (e) => e.createdBy?.fullName ?? "" },
                { key: "amt", label: "Két +/−", value: (e) => signedFor(e, "SAFE"), numeric: true, sum: true, formatSum: (n) => <Money value={n} signed />, render: (e) => <Money value={signedFor(e, "SAFE")} signed /> },
              ]}
            />
          </div>
        ) : (
          <Alert tone="info">Két đang đóng. Mở két khi cần lấy tiền đầu ca, lấy thêm tiền lẻ hoặc cất tiền — mọi lần mở/đóng đều được ghi lại.</Alert>
        )}

        {s && s.drawers.length > 0 && (
          <div className="o-panel">
            <div className="o-panel-head">Ngăn kéo đang mở</div>
            <ListView
              rows={s.drawers}
              rowKey={(d) => d.shiftId}
              columns={[
                { key: "shift", label: "Ca", value: (d) => d.shiftId, render: (d) => `#${d.shiftId}` },
                { key: "staff", label: "Thu ngân", value: (d) => d.staff.fullName },
                { key: "start", label: "Mở lúc", value: (d) => d.startTime, render: (d) => fmtDateTime(d.startTime) },
                { key: "cash", label: "Tiền mặt dự kiến", value: (d) => d.expectedCash, numeric: true, render: (d) => formatVnd(d.expectedCash) },
              ]}
            />
          </div>
        )}

        <div className="o-panel">
          <div className="o-panel-head">Lịch sử mở / đóng két</div>
          <ListView
            rows={safe?.sessions ?? []}
            rowKey={(x) => x.id}
            onRowClick={(x) => setDetail(x.id)}
            exportName="lich-su-mo-ket"
            columns={[
              { key: "open", label: "Mở lúc", value: (x) => x.openedAt, render: (x) => fmtDateTime(x.openedAt) },
              { key: "by", label: "Người mở", value: (x) => x.openedBy?.fullName ?? "" },
              { key: "reason", label: "Lý do", value: (x) => x.reason, wrap: true },
              { key: "n", label: "Lần lấy/bỏ", value: (x) => x._count?.entries ?? 0, numeric: true },
              { key: "close", label: "Đóng lúc", value: (x) => x.closedAt ?? "", render: (x) => (x.closedAt ? `${fmtDateTime(x.closedAt)} · ${x.closedBy?.fullName ?? ""}` : <Badge tone="warning">Đang mở</Badge>) },
              { key: "counted", label: "Đếm được", value: (x) => x.countedBalance ?? "", numeric: true, render: (x) => (x.countedBalance != null ? formatVnd(x.countedBalance) : "") },
              {
                key: "diff",
                label: "Lệch",
                value: (x) => x.difference ?? 0,
                numeric: true,
                render: (x) => (x.difference == null ? "" : x.difference ? <Money value={x.difference} signed /> : <Badge tone="success">Khớp</Badge>),
              },
            ]}
          />
        </div>
      </div>

      {dialog === "open" && <SafeOpenDialog onClose={() => setDialog(null)} onDone={() => { setDialog(null); void refresh(); }} />}
      {dialog === "close" && safe && <SafeCloseDialog expected={safe.balance} onClose={() => setDialog(null)} onDone={() => { setDialog(null); void refresh(); }} />}
      {dialog === "entry" && <EntryDialog preset={{ fund: "SAFE" }} onClose={() => setDialog(null)} onDone={() => { setDialog(null); void refresh(); }} />}
      {detail != null && <SessionDetail id={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

/** Chi tiết 1 lần mở két: ai mở, lý do, từng lần lấy/bỏ tiền, kết quả kiểm két */
function SessionDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: x, error } = useResource<SafeSession | null>(`/api/cash/safe/sessions/${id}`, null);
  return (
    <Modal title={`Phiên mở két #${id}`} size="lg" onClose={onClose}>
      {error && <Alert>{error}</Alert>}
      {x && (
        <div className="o-stack" style={{ gap: 12 }}>
          <div>
            Mở: <b>{x.openedBy?.fullName}</b> lúc {fmtDateTime(x.openedAt)} — {x.reason}
            <br />
            {x.openingBalance != null && <>Số dư sổ lúc mở: {formatVnd(x.openingBalance)}</>}
          </div>
          <ListView
            rows={x.entries ?? []}
            rowKey={(e) => e.id}
            columns={[
              { key: "code", label: "Phiếu", value: (e) => e.code },
              { key: "time", label: "Giờ", value: (e) => e.createdAt, render: (e) => fmtDateTime(e.createdAt) },
              { key: "cat", label: "Nội dung", value: (e) => `${catLabel(e.category)} — ${e.description ?? ""}`, wrap: true },
              { key: "flow", label: "Hướng", value: flowLabel },
              { key: "by", label: "Người làm", value: (e) => e.createdBy?.fullName ?? "" },
              { key: "st", label: "", value: (e) => e.status, render: (e) => <Badge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Badge> },
              { key: "amt", label: "Két +/−", value: (e) => signedFor(e, "SAFE"), numeric: true, sum: true, formatSum: (n) => <Money value={n} signed />, render: (e) => <Money value={signedFor(e, "SAFE")} signed /> },
            ]}
          />
          {x.closedAt ? (
            <div>
              Đóng: <b>{x.closedBy?.fullName}</b> lúc {fmtDateTime(x.closedAt)}
              <br />
              Sổ: {formatVnd(x.expectedBalance ?? 0)} · Đếm được: {formatVnd(x.countedBalance ?? 0)} · Lệch: <Money value={x.difference ?? 0} signed />
              {x.note && <div className="o-muted">Lý do: {x.note}</div>}
              <DenominationTable json={x.denominations} />
            </div>
          ) : (
            <Badge tone="warning">Két chưa đóng</Badge>
          )}
          <div className="o-muted">{FUND_LABEL.SAFE}: mọi thay đổi số dư ngoài phiên này (nộp tiền cuối ca qua khe) sẽ được đối chiếu ở lần kiểm két kế tiếp.</div>
        </div>
      )}
    </Modal>
  );
}
