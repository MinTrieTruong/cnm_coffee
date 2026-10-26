import { useCallback, useEffect, useMemo, useState } from "react";
import { staffApi } from "../lib/staffApi";
import { ROLE_LABEL } from "../lib/roles";
import { Alert, Badge, Button, ControlPanel, EmptyState, Tabs, errMsg } from "../components/erp";
import { HR_TABS, STATUS_UI, SwapState, itemTitle, useShiftNames, type HrItem, type HrTab } from "./HrRequests";

type StatusFilter = "PENDING" | "APPROVED" | "REJECTED" | "ALL";
const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "PENDING", label: "Chờ duyệt" },
  { id: "APPROVED", label: "Đã duyệt" },
  { id: "REJECTED", label: "Từ chối" },
  { id: "ALL", label: "Tất cả" },
];

const pad2 = (n: number) => String(n).padStart(2, "0");
/** ISO → YYYY-MM-DD theo giờ máy (để so với ô chọn ngày) */
const localDay = (s: string) => { const d = new Date(s); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
/** Khoảng ngày mà đơn áp dụng: nghỉ nhiều ngày → [date, toDate]; đơn gắn ca → ngày ca */
function itemDays(it: HrItem): [string, string] {
  const start: string = (it.date ?? it.schedule?.workDate)?.slice(0, 10) ?? localDay(it.createdAt);
  return [start, it.toDate?.slice(0, 10) ?? start];
}

/** Nhân sự › Duyệt đơn từ (quản lý chi nhánh) */
export function AdminHrRequests() {
  const [tab, setTab] = useState<HrTab>("LEAVE");
  const [items, setItems] = useState<HrItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // Bộ lọc: trạng thái, khoảng ngày (theo ngày của đơn hoặc ngày gửi), tìm theo tên/lý do
  const [status, setStatus] = useState<StatusFilter>("PENDING");
  const [dateBy, setDateBy] = useState<"item" | "created">("item");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
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

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { ALL: items.length, PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const i of items) if (i.status in c) c[i.status as StatusFilter]++;
    return c;
  }, [items]);

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return items.filter((it) => {
      if (status !== "ALL" && it.status !== status) return false;
      if (from || to) {
        const [a, b] = dateBy === "created" ? [localDay(it.createdAt), localDay(it.createdAt)] : itemDays(it);
        if (from && b < from) return false;
        if (to && a > to) return false;
      }
      if (kw) {
        const p = it.user ?? it.requester;
        const hay = [p?.fullName, it.reason, it.targetUser?.fullName].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [items, status, dateBy, from, to, q]);

  const filtered = status !== "PENDING" || !!from || !!to || !!q.trim();
  const clearFilters = () => { setStatus("PENDING"); setFrom(""); setTo(""); setQ(""); };

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
      <ControlPanel crumbs={[{ label: "Duyệt đơn từ" }]} search={q} onSearch={setQ} />
      <div className="o-content o-stack" style={{ maxWidth: 1000, margin: "0 auto" }}>
        <Tabs tabs={HR_TABS} active={tab} onChange={setTab} />
        <div className="o-row">
          <select className="o-input" style={{ width: "auto" }} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Trạng thái">
            {STATUS_FILTERS.map((s) => <option key={s.id} value={s.id}>{s.label} ({counts[s.id]})</option>)}
          </select>
          <select className="o-input" style={{ width: "auto" }} value={dateBy} onChange={(e) => setDateBy(e.target.value as "item" | "created")} aria-label="Lọc ngày theo">
            <option value="item">Theo ngày của đơn</option>
            <option value="created">Theo ngày gửi</option>
          </select>
          <input type="date" className="o-input" style={{ width: 145 }} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Từ ngày" />
          <span className="o-muted">→</span>
          <input type="date" className="o-input" style={{ width: 145 }} value={to} onChange={(e) => setTo(e.target.value)} aria-label="Đến ngày" />
          {filtered && <Button variant="link" onClick={clearFilters}>Xoá lọc</Button>}
        </div>
        {err && <Alert>{err}</Alert>}
        {msg && <Alert tone="info">{msg}</Alert>}
        {loading && <p className="o-muted">Đang tải…</p>}

        {!loading && shown.length === 0 && (
          <EmptyState title={filtered ? "Không có đơn phù hợp bộ lọc" : "Không có đơn chờ duyệt"} />
        )}
        {shown.length > 0 && <section className="o-card">{shown.map(row)}</section>}
      </div>
    </div>
  );
}
