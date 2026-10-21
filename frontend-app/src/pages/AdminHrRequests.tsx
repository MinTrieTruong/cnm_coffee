import { useCallback, useEffect, useState } from "react";
import { staffApi } from "../lib/staffApi";
import { ROLE_LABEL } from "../lib/roles";
import { Alert, Badge, Button, ControlPanel, EmptyState, Tabs, errMsg } from "../components/erp";
import { HR_TABS, STATUS_UI, SwapState, itemTitle, useShiftNames, type HrItem, type HrTab } from "./HrRequests";

/** Nhân sự › Duyệt đơn từ (quản lý chi nhánh) */
export function AdminHrRequests() {
  const [tab, setTab] = useState<HrTab>("LEAVE");
  const [items, setItems] = useState<HrItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const names = useShiftNames();
  const endpoint = HR_TABS.find((t) => t.id === tab)!.endpoint;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await staffApi<HrItem[]>(endpoint));
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [endpoint]);
  useEffect(() => { void load(); setMsg(null); }, [load]);

  async function review(it: HrItem, status: "APPROVED" | "REJECTED") {
    let approvedMinutes: number | undefined;
    if (status === "APPROVED" && it.type === "OVERTIME") {
      // Làm thêm: quản lý có thể duyệt ít phút hơn số xin
      const ans = prompt(`Duyệt cho ${it.user?.fullName} làm thêm bao nhiêu phút? (xin ${it.minutes} phút)`, String(it.minutes));
      if (ans === null) return;
      approvedMinutes = Number(ans);
    } else if (!confirm(`${status === "APPROVED" ? "Duyệt" : "Từ chối"} đơn của ${it.user?.fullName ?? it.requester?.fullName}?`)) return;
    try {
      const r = await staffApi<{ openedShifts?: number }>(`${endpoint}/${it.id}/review`, { method: "PUT", body: JSON.stringify({ status, approvedMinutes }) });
      setMsg(
        status === "APPROVED" && tab === "LEAVE" && r.openedShifts
          ? `Đã duyệt. ${r.openedShifts} ca trong thời gian nghỉ đã thành ca trống, vào "Lịch làm việc" để xếp người thay.`
          : status === "APPROVED" ? "Đã duyệt đơn." : "Đã từ chối đơn.",
      );
      await load();
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  const who = (it: HrItem) => it.user ?? it.requester;
  const pending = items.filter((i) => i.status === "PENDING");
  const done = items.filter((i) => i.status !== "PENDING");

  const row = (it: HrItem) => {
    // Đổi ca: chỉ duyệt được khi người nhận đã đồng ý
    const waitingTarget = tab === "SWAP" && it.targetUserStatus !== "ACCEPTED";
    return (
      <div key={it.id} className="o-req">
        <div className="o-req-main">
          <strong>{who(it)?.fullName}</strong>
          {who(it)?.role && <span className="o-muted"> · {ROLE_LABEL[who(it).role] ?? who(it).role}</span>}
          <div>{itemTitle(tab, it, names)}</div>
          <div className="o-muted">Lý do: {it.reason} · gửi {new Date(it.createdAt).toLocaleString("vi-VN")}</div>
          {it.manager && <div className="o-muted">Xử lý bởi {it.manager.fullName}</div>}
        </div>
        <span className="o-inline">
          {it.status === "PENDING" ? (
            <>
              {tab === "SWAP" && <SwapState it={it} />}
              <Button size="sm" variant="danger" onClick={() => void review(it, "REJECTED")}>Từ chối</Button>
              <Button size="sm" variant="primary" disabled={waitingTarget} title={waitingTarget ? "Người nhận ca chưa đồng ý" : undefined} onClick={() => void review(it, "APPROVED")}>
                Duyệt
              </Button>
            </>
          ) : tab === "SWAP" ? (
            <SwapState it={it} />
          ) : (
            <Badge tone={STATUS_UI[it.status]?.tone}>{STATUS_UI[it.status]?.label ?? it.status}</Badge>
          )}
        </span>
      </div>
    );
  };

  return (
    <div>
      <ControlPanel crumbs={[{ label: "Duyệt đơn từ" }]} />
      <div className="o-content o-stack" style={{ maxWidth: 1000, margin: "0 auto" }}>
        <Tabs tabs={HR_TABS} active={tab} onChange={setTab} />
        {err && <Alert>{err}</Alert>}
        {msg && <Alert tone="info">{msg}</Alert>}
        {loading && <p className="o-muted">Đang tải…</p>}

        {!loading && pending.length === 0 && <EmptyState title="Không có đơn chờ duyệt" />}
        {pending.length > 0 && <section className="o-card">{pending.map(row)}</section>}

        {done.length > 0 && (
          <>
            <Button variant="link" onClick={() => setShowDone((s) => !s)}>{showDone ? "Ẩn" : "Xem"} đơn đã xử lý ({done.length})</Button>
            {showDone && <section className="o-card">{done.map(row)}</section>}
          </>
        )}
      </div>
    </div>
  );
}
