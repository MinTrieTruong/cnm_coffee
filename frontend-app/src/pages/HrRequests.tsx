import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { getStaffInfo, staffApi } from "../lib/staffApi";
import { ROLE_LABEL } from "../lib/roles";
import { Alert, Badge, Button, ControlPanel, EmptyState, Field, Modal, Tabs, errMsg, type Tone } from "../components/erp";

export type HrTab = "LEAVE" | "SWAP" | "WORK" | "ATTENDANCE";
export const HR_TABS: { id: HrTab; label: string; endpoint: string }[] = [
  { id: "LEAVE", label: "Xin nghỉ", endpoint: "/api/hr/leave" },
  { id: "SWAP", label: "Đổi ca", endpoint: "/api/hr/swap" },
  { id: "WORK", label: "Làm thêm / xin phép", endpoint: "/api/hr/work" },
  { id: "ATTENDANCE", label: "Giải trình chấm công", endpoint: "/api/hr/attendance" },
];

export const STATUS_UI: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Chờ duyệt", tone: "warning" },
  APPROVED: { label: "Đã duyệt", tone: "success" },
  REJECTED: { label: "Từ chối", tone: "danger" },
};
export const WORK_TYPE: Record<string, string> = { OVERTIME: "Làm thêm giờ", EARLY_LEAVE: "Xin về sớm", LATE_ARRIVAL: "Xin đi muộn", OTHER: "Đề xuất khác" };
export const ADJUST_TYPE: Record<string, string> = {
  FORGET_CHECKIN: "Quên check-in",
  FORGET_CHECKOUT: "Quên check-out",
  LATE_IN: "Sửa giờ vào",
  EARLY_OUT: "Sửa giờ ra",
};

type Sched = { id: number; workDate: string; shiftCode: string; startMin: number; endMin: number; status: string };
type ShiftDef = { code: string; name: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HrItem = any;

const pad2 = (n: number) => String(n).padStart(2, "0");
export const fmtDate = (s: string | null | undefined) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");
export const hhmm = (m: number) => `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
export const shiftText = (s: Sched | null | undefined, names?: Map<string, string>) =>
  s ? `${fmtDate(s.workDate)} · ${names?.get(s.shiftCode) ?? s.shiftCode} ${hhmm(s.startMin)}–${hhmm(s.endMin)}` : "";
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };

/** Tiêu đề 1 đơn (dùng chung cho trang nhân viên & trang duyệt) */
export function itemTitle(tab: HrTab, it: HrItem, names?: Map<string, string>) {
  if (tab === "LEAVE") return it.toDate ? `Nghỉ ${fmtDate(it.date)} → ${fmtDate(it.toDate)}` : `Nghỉ ngày ${fmtDate(it.date)}`;
  if (tab === "SWAP") return `Nhường ca ${shiftText(it.schedule, names)} cho ${it.targetUser?.fullName ?? ""}`;
  if (tab === "WORK") return `${WORK_TYPE[it.type] ?? it.type}${it.minutes ? ` ${it.minutes} phút` : ""}${it.schedule ? ` · ${shiftText(it.schedule, names)}` : ""}`;
  return `${ADJUST_TYPE[it.adjustmentType] ?? it.adjustmentType} ${fmtDate(it.date)} · đề xuất ${new Date(it.proposedTime).toLocaleString("vi-VN")}`;
}

/** Tên ca theo mã (SANG → Ca sáng) */
export function useShiftNames() {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    staffApi<{ templates: ShiftDef[] }>("/api/hr/config")
      .then((r) => setNames(new Map(r.templates.map((t) => [t.code, t.name]))))
      .catch(() => {});
  }, []);
  return names;
}

/** Nhân sự › Đơn từ của tôi */
export function HrRequests() {
  const me = getStaffInfo();
  const [tab, setTab] = useState<HrTab>("LEAVE");
  const [items, setItems] = useState<HrItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const names = useShiftNames();
  const endpoint = HR_TABS.find((t) => t.id === tab)!.endpoint;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await staffApi<HrItem[]>(`${endpoint}?mine=1`));
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [endpoint]);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(errMsg(e));
    }
  };
  const cancel = (id: number) => confirm("Huỷ đơn này?") && void act(() => staffApi(`${endpoint}/${id}`, { method: "DELETE" }));
  const answer = (id: number, status: "ACCEPTED" | "REJECTED") =>
    void act(() => staffApi(`/api/hr/swap/${id}/target-review`, { method: "PUT", body: JSON.stringify({ status }) }));

  const incoming = tab === "SWAP" ? items.filter((i) => i.targetUserId === me?.id) : [];
  const mine = tab === "SWAP" ? items.filter((i) => i.requesterId === me?.id) : items;

  return (
    <div>
      <ControlPanel crumbs={[{ label: "Đơn từ của tôi" }]} actions={<Button variant="primary" icon={Plus} onClick={() => setForm(true)}>Tạo đơn</Button>} />
      <div className="o-content o-stack" style={{ maxWidth: 900, margin: "0 auto" }}>
        <Tabs tabs={HR_TABS} active={tab} onChange={setTab} />
        {err && <Alert>{err}</Alert>}
        {loading && <p className="o-muted">Đang tải…</p>}

        {incoming.length > 0 && (
          <section className="o-card">
            <div className="o-card-head"><h3>Đồng nghiệp nhờ bạn nhận ca</h3></div>
            {incoming.map((it) => (
              <div key={it.id} className="o-req">
                <div className="o-req-main">
                  <strong>{it.requester?.fullName} nhờ nhận ca {shiftText(it.schedule, names)}</strong>
                  <div className="o-muted">Lý do: {it.reason}</div>
                </div>
                {it.status === "PENDING" && it.targetUserStatus === "PENDING" ? (
                  <span className="o-inline">
                    <Button size="sm" onClick={() => answer(it.id, "REJECTED")}>Từ chối</Button>
                    <Button size="sm" variant="primary" onClick={() => answer(it.id, "ACCEPTED")}>Đồng ý</Button>
                  </span>
                ) : (
                  <SwapState it={it} />
                )}
              </div>
            ))}
          </section>
        )}

        {!loading && mine.length === 0 && incoming.length === 0 && <EmptyState title="Chưa có đơn nào" hint="Bấm Tạo đơn để gửi đơn cho quản lý." />}
        {mine.length > 0 && (
          <section className="o-card">
            {mine.map((it) => (
              <div key={it.id} className="o-req">
                <div className="o-req-main">
                  <strong>{itemTitle(tab, it, names)}</strong>
                  <div className="o-muted">Lý do: {it.reason}</div>
                  {it.managerNote && <div className="o-muted">Quản lý: {it.managerNote}</div>}
                </div>
                <span className="o-inline">
                  {tab === "SWAP" ? <SwapState it={it} /> : <Badge tone={STATUS_UI[it.status]?.tone}>{STATUS_UI[it.status]?.label ?? it.status}</Badge>}
                  {it.status === "PENDING" && <Button size="sm" variant="link" onClick={() => cancel(it.id)}>Huỷ</Button>}
                </span>
              </div>
            ))}
          </section>
        )}
      </div>
      {form && <RequestForm tab={tab} names={names} onClose={() => setForm(false)} onSent={() => { setForm(false); void load(); }} />}
    </div>
  );
}

/** Trạng thái đơn đổi ca: chờ người nhận → chờ quản lý → xong */
export function SwapState({ it }: { it: HrItem }) {
  if (it.status === "APPROVED") return <Badge tone="success">Đã duyệt</Badge>;
  if (it.status === "REJECTED") return <Badge tone="danger">{it.targetUserStatus === "REJECTED" ? "Người nhận từ chối" : "Quản lý từ chối"}</Badge>;
  if (it.targetUserStatus === "ACCEPTED") return <Badge tone="warning">Chờ quản lý duyệt</Badge>;
  return <Badge>Chờ người nhận đồng ý</Badge>;
}

function RequestForm({ tab, names, onClose, onSent }: { tab: HrTab; names: Map<string, string>; onClose: () => void; onSent: () => void }) {
  const me = getStaffInfo();
  const [v, setV] = useState<Record<string, string>>({ type: "OVERTIME", adjustmentType: "FORGET_CHECKIN" });
  const [otRule, setOtRule] = useState<{ overtimeRatePercent: number; maxOvertimeMinutes: number } | null>(null);
  const [shifts, setShifts] = useState<Sched[]>([]);
  const [mates, setMates] = useState<{ id: number; fullName: string; role: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const set = (k: string, val: string) => setV((x) => ({ ...x, [k]: val }));
  const needShift = tab === "SWAP" || tab === "WORK";

  useEffect(() => {
    if (tab === "WORK") staffApi<{ config: { overtimeRatePercent: number; maxOvertimeMinutes: number } }>("/api/hr/config").then((r) => setOtRule(r.config)).catch(() => {});
  }, [tab]);

  useEffect(() => {
    if (!needShift) return;
    // Ca đã công bố từ hôm nay đến hết tháng sau
    const d = new Date();
    const months = [0, 1].map((n) => { const x = new Date(d.getFullYear(), d.getMonth() + n, 1); return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}`; });
    Promise.all(months.map((m) => staffApi<{ schedules: Sched[] }>(`/api/schedule/my?month=${m}`)))
      .then((rs) => setShifts(rs.flatMap((r) => r.schedules).filter((s) => s.status === "APPROVED" && s.workDate.slice(0, 10) >= todayStr())))
      .catch((e) => setErr(errMsg(e)));
    if (tab === "SWAP" && me?.storeId) {
      staffApi<{ id: number; fullName: string; role: string }[]>(`/api/staff/members?store=${me.storeId}`)
        .then((rs) => setMates(rs.filter((s) => s.id !== me.id && s.role === me.role)))
        .catch((e) => setErr(errMsg(e)));
    }
  }, [tab, needShift, me?.id, me?.storeId, me?.role]);

  async function send() {
    setSending(true);
    setErr(null);
    const body =
      tab === "LEAVE" ? { date: v.date, toDate: v.toDate || undefined, reason: v.reason }
      : tab === "SWAP" ? { scheduleId: Number(v.scheduleId), targetUserId: Number(v.targetUserId), reason: v.reason }
      : tab === "WORK" ? { type: v.type, scheduleId: v.scheduleId ? Number(v.scheduleId) : undefined, minutes: v.minutes ? Number(v.minutes) : undefined, reason: v.reason }
      : { date: v.date, adjustmentType: v.adjustmentType, proposedTime: v.proposedTime ? new Date(v.proposedTime).toISOString() : "", reason: v.reason };
    try {
      await staffApi(HR_TABS.find((t) => t.id === tab)!.endpoint, { method: "POST", body: JSON.stringify(body) });
      onSent();
    } catch (e) {
      setErr(errMsg(e));
      setSending(false);
    }
  }

  const shiftSelect = (optional = false) => (
    <Field label="Ca làm" required={!optional}>
      <select className="o-input" value={v.scheduleId ?? ""} onChange={(e) => set("scheduleId", e.target.value)}>
        <option value="">{optional ? "Không gắn với ca" : shifts.length ? "Chọn ca…" : "Bạn chưa có ca nào sắp tới"}</option>
        {shifts.map((s) => <option key={s.id} value={s.id}>{shiftText(s, names)}</option>)}
      </select>
    </Field>
  );

  return (
    <Modal
      title={`Tạo đơn · ${HR_TABS.find((t) => t.id === tab)!.label}`}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Huỷ</Button><Button variant="primary" disabled={sending} onClick={() => void send()}>{sending ? "Đang gửi…" : "Gửi đơn"}</Button></>}
    >
      {err && <Alert>{err}</Alert>}
      <div className="o-stack">
        {tab === "LEAVE" && (
          <>
            <Field label="Từ ngày" required><input className="o-input" type="date" min={todayStr()} value={v.date ?? ""} onChange={(e) => set("date", e.target.value)} /></Field>
            <Field label="Đến ngày"><input className="o-input" type="date" min={v.date ?? todayStr()} value={v.toDate ?? ""} onChange={(e) => set("toDate", e.target.value)} /></Field>
            <p className="o-muted">Nghỉ 1 ngày thì để trống "Đến ngày". Khi được duyệt, các ca trong những ngày này thành ca trống để quản lý xếp người thay.</p>
          </>
        )}
        {tab === "SWAP" && (
          <>
            {shiftSelect()}
            <Field label={`Nhường cho (${ROLE_LABEL[me?.role ?? ""] ?? "cùng vị trí"})`} required>
              <select className="o-input" value={v.targetUserId ?? ""} onChange={(e) => set("targetUserId", e.target.value)}>
                <option value="">Chọn đồng nghiệp…</option>
                {mates.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
              </select>
            </Field>
            <p className="o-muted">Đồng nghiệp đồng ý xong, quản lý duyệt thì ca mới chuyển sang người đó.</p>
          </>
        )}
        {tab === "WORK" && (
          <>
            <Field label="Loại đơn" required>
              <select className="o-input" value={v.type} onChange={(e) => set("type", e.target.value)}>
                {Object.entries(WORK_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            {shiftSelect(v.type === "OTHER")}
            {v.type !== "OTHER" && (
              <Field label={v.type === "OVERTIME" ? "Làm thêm bao nhiêu phút (sau giờ hết ca)" : v.type === "EARLY_LEAVE" ? "Về sớm bao nhiêu phút" : "Đến muộn bao nhiêu phút"} required>
                <input
                  className="o-input"
                  type="number"
                  min={1}
                  step={v.type === "OVERTIME" ? 15 : 1}
                  max={v.type === "OVERTIME" ? otRule?.maxOvertimeMinutes ?? 240 : 600}
                  value={v.minutes ?? ""}
                  onChange={(e) => set("minutes", e.target.value)}
                />
              </Field>
            )}
            {v.type === "OVERTIME" ? (
              <p className="o-muted">
                Quản lý duyệt xong, bạn ở lại làm và check-out đúng giờ thì hệ thống tự xác nhận và tính lương làm thêm
                {otRule ? ` (+${otRule.overtimeRatePercent}% mỗi giờ)` : ""}. Về sớm hơn thì tính theo giờ check-out thực tế.
              </p>
            ) : v.type !== "OTHER" && (
              <p className="o-muted">Đơn được duyệt thì lần {v.type === "EARLY_LEAVE" ? "về sớm" : "đi muộn"} này không tính vào cảnh báo chấm công.</p>
            )}
          </>
        )}
        {tab === "ATTENDANCE" && (
          <>
            <Field label="Ngày" required><input className="o-input" type="date" value={v.date ?? ""} onChange={(e) => set("date", e.target.value)} /></Field>
            <Field label="Loại" required>
              <select className="o-input" value={v.adjustmentType} onChange={(e) => set("adjustmentType", e.target.value)}>
                {Object.entries(ADJUST_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Giờ đúng" required><input className="o-input" type="datetime-local" value={v.proposedTime ?? ""} onChange={(e) => set("proposedTime", e.target.value)} /></Field>
          </>
        )}
        <Field label="Lý do" required>
          <textarea className="o-input" rows={3} value={v.reason ?? ""} onChange={(e) => set("reason", e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
