import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarPlus } from "lucide-react";
import { staffApi } from "../../lib/staffApi";
import { acquireSocket } from "../../lib/sharedSocket";
import { refreshBadges } from "../../lib/navBadges";
import { Alert, Button, ChartCard, EmptyState, PageHeader, errMsg } from "../../components/erp";

export type OpenShift = {
  id: number;
  workDate: string;
  shiftCode: string;
  shiftName: string;
  startMin: number;
  endMin: number;
  role: string | null;
  managerNote: string | null;
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const hhmm = (m: number) => `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
/** "Thứ hai, 26/10" — workDate là ngày (00:00 UTC) */
const dayText = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const s = d.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Ca trống tôi nhận được; tự tải lại khi có người nhận / có ca trống mới */
export function useOpenShifts() {
  const [shifts, setShifts] = useState<OpenShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setShifts((await staffApi<{ shifts: OpenShift[] }>("/api/schedule/open")).shifts);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const shared = acquireSocket();
    shared.join("staff");
    const h = () => void load();
    const events = ["openshift:update", "notify:recalled", "connect"];
    for (const ev of events) shared.socket.on(ev, h);
    return () => {
      for (const ev of events) shared.socket.off(ev, h);
      shared.release();
    };
  }, [load]);
  return { shifts, loading, error, reload: load };
}

/** Danh sách ca trống, mỗi ca một nút "Nhận ca" */
function OpenShiftList({ shifts, reload, onMsg }: { shifts: OpenShift[]; reload: () => Promise<void>; onMsg: (m: { ok: boolean; text: string }) => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  async function claim(s: OpenShift) {
    if (!confirm(`Nhận ${s.shiftName} ${dayText(s.workDate)} (${hhmm(s.startMin)}–${hhmm(s.endMin)})?`)) return;
    setBusy(s.id);
    try {
      await staffApi(`/api/schedule/open/${s.id}/claim`, { method: "POST" });
      onMsg({ ok: true, text: `Đã nhận ${s.shiftName} ${dayText(s.workDate)}. Ca đã vào lịch cá nhân của bạn.` });
    } catch (e) {
      onMsg({ ok: false, text: errMsg(e) });
    } finally {
      setBusy(null);
      refreshBadges();
      await reload();
    }
  }
  return (
    <ul className="o-att-list">
      {shifts.map((s) => (
        <li key={s.id}>
          <span className="o-kpic-icon is-sm is-orange"><CalendarPlus size={16} strokeWidth={1.75} aria-hidden /></span>
          <span className="o-att-list-name">
            <strong>{s.shiftName} · {dayText(s.workDate)}</strong>
            <span>{hhmm(s.startMin)}–{hhmm(s.endMin)}{s.managerNote ? ` · ${s.managerNote}` : ""}</span>
          </span>
          <Button size="sm" variant="primary" disabled={busy != null} onClick={() => void claim(s)}>
            {busy === s.id ? "Đang nhận…" : "Nhận ca"}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Nhân sự › Lịch & chấm công › Ca trống cần người */
export function OpenShifts() {
  const { shifts, loading, error, reload } = useOpenShifts();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="o-dash">
      <PageHeader title="Ca trống cần người" description="Ca của đồng nghiệp xin nghỉ, đúng vị trí của bạn và vào ngày bạn chưa có ca. Ai bấm nhận trước được ca." />
      {error && <Alert>{error}</Alert>}
      {msg && <Alert tone={msg.ok ? "info" : "danger"}>{msg.text}</Alert>}
      {loading && !shifts.length ? (
        <div className="o-muted">Đang tải…</div>
      ) : !shifts.length ? (
        <EmptyState title="Hiện không có ca trống nào cho bạn" hint="Khi có ca cần người, bạn sẽ nhận được thông báo." />
      ) : (
        <section className="o-dcard">
          <OpenShiftList shifts={shifts} reload={reload} onMsg={setMsg} />
        </section>
      )}
    </div>
  );
}

/** Thẻ trên Trang chủ nhân viên — ẩn khi không có ca trống */
export function OpenShiftsCard() {
  const { shifts, reload } = useOpenShifts();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!shifts.length && !msg) return null;
  return (
    <ChartCard
      title="Ca trống cần người"
      description={shifts.length ? `${shifts.length} ca bạn có thể nhận — ai bấm trước được ca` : "Không còn ca trống nào"}
      actions={<Link to="/app/hr/open-shifts" className="o-dcard-link">Xem tất cả <ArrowRight size={14} aria-hidden /></Link>}
    >
      {msg && <Alert tone={msg.ok ? "info" : "danger"}>{msg.text}</Alert>}
      {shifts.length > 0 && <OpenShiftList shifts={shifts.slice(0, 4)} reload={reload} onMsg={setMsg} />}
    </ChartCard>
  );
}
