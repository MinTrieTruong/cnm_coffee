import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Megaphone, Send, Undo2 } from "lucide-react";
import { getStaffInfo, staffApi } from "../../lib/staffApi";
import { timeAgo } from "../../lib/notifications";
import { Alert, Button, ChartCard, PageHeader, errMsg } from "../../components/erp";

type Audience = {
  stores: { id: number; name: string }[];
  roles: { id: string; label: string }[];
  counts: Record<string, Record<string, number>>;
  defaultStoreIds: number[];
};
type Sent = {
  id: number;
  title: string;
  body: string | null;
  severity: "NORMAL" | "IMPORTANT";
  audience: string | null;
  storeName: string | null;
  sender: { fullName: string } | null;
  createdAt: string;
  recalledAt: string | null;
  total: number;
  read: number;
  canRecall: boolean;
};

const PRESETS = [
  { title: "Máy quẹt thẻ đang lỗi", body: "Tạm thời chỉ nhận tiền mặt và chuyển khoản QR.", severity: "IMPORTANT" as const, roles: ["Cashier", "Waiter"] },
  { title: "Hôm nay mưa bão — quán nghỉ", body: "Mọi người được nghỉ có lương, không cần đến ca.", severity: "IMPORTANT" as const, roles: [] },
  { title: "Họp nhanh đầu ca", body: "Mọi người tập trung ở quầy lúc 15 phút trước giờ vào ca.", severity: "NORMAL" as const, roles: [] },
];

/** Nhân sự › Gửi thông báo (Quản lý chi nhánh / Chủ chuỗi) */
export function Broadcast() {
  const owner = getStaffInfo()?.role === "Owner";
  const [aud, setAud] = useState<Audience | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<"NORMAL" | "IMPORTANT">("NORMAL");
  const [roles, setRoles] = useState<string[]>([]);
  const [storeIds, setStoreIds] = useState<number[]>([]);
  const [sent, setSent] = useState<Sent[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSent = useCallback(() => staffApi<Sent[]>("/api/notifications/sent").then(setSent).catch((e) => setErr(errMsg(e))), []);
  useEffect(() => {
    staffApi<Audience>("/api/notifications/audience")
      .then((a) => {
        setAud(a);
        setStoreIds(a.defaultStoreIds);
      })
      .catch((e) => setErr(errMsg(e)));
    void loadSent();
  }, [loadSent]);

  // Số người sẽ nhận (trừ chính mình nếu thuộc nhóm — máy chủ tự loại)
  const reach = useMemo(() => {
    if (!aud) return 0;
    const ids = owner ? storeIds : aud.stores.map((s) => s.id);
    return ids.reduce((sum, id) => {
      const c = aud.counts[String(id)] ?? {};
      return sum + Object.entries(c).reduce((a, [r, n]) => a + (roles.length === 0 || roles.includes(r) ? n : 0), 0);
    }, 0);
  }, [aud, roles, storeIds, owner]);

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  async function send() {
    if (!title.trim()) return setErr("Nhập tiêu đề thông báo.");
    if (owner && !storeIds.length) return setErr("Chọn ít nhất một chi nhánh.");
    if (severity === "IMPORTANT" && !confirm(`Gửi thông báo QUAN TRỌNG tới khoảng ${reach} người? Màn hình của họ sẽ bật hộp thoại phải bấm "Đã hiểu".`)) return;
    setBusy(true);
    try {
      const r = await staffApi<{ recipients: number }>("/api/notifications/broadcast", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), body: body.trim(), severity, roles, storeIds }),
      });
      setMsg(`Đã gửi tới ${r.recipients} người.`);
      setErr(null);
      setTitle("");
      setBody("");
      setSeverity("NORMAL");
      void loadSent();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function recall(s: Sent) {
    if (!confirm(`Thu hồi "${s.title}"? Thông báo sẽ biến mất khỏi máy của mọi người nhận.`)) return;
    try {
      await staffApi(`/api/notifications/${s.id}/recall`, { method: "POST" });
      void loadSent();
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  return (
    <div className="o-dash">
      <PageHeader title="Gửi thông báo" description="Đẩy thông báo tức thì tới màn hình nhân viên — hiện ở chuông, thẻ nổi và thông báo trình duyệt" />
      {err && <Alert>{err}</Alert>}
      {msg && <Alert tone="info">{msg}</Alert>}

      <div className="o-dash-row is-2-1 o-bc-row">
        <ChartCard title="Soạn thông báo" description="Mẫu nhanh">
          <div className="o-bc-form">
            <div className="o-tf-presets">
              {PRESETS.map((p) => (
                <button
                  key={p.title}
                  type="button"
                  className="o-chip"
                  onClick={() => {
                    setTitle(p.title);
                    setBody(p.body);
                    setSeverity(p.severity);
                    setRoles(p.roles);
                  }}
                >
                  {p.title}
                </button>
              ))}
            </div>
            <label className="o-tf-field">
              <span>Tiêu đề <span className="req">*</span></span>
              <input className="o-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} placeholder="VD: Máy quẹt thẻ lỗi, chỉ thu tiền mặt" />
            </label>
            <label className="o-tf-field">
              <span>Nội dung</span>
              <textarea className="o-input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} placeholder="Chi tiết (không bắt buộc)" />
            </label>

            <div className="o-tf-field">
              <span>Mức độ</span>
              <div className="o-seg" role="radiogroup" aria-label="Mức độ">
                <button type="button" role="radio" aria-checked={severity === "NORMAL"} className={severity === "NORMAL" ? "active" : ""} onClick={() => setSeverity("NORMAL")}>
                  <Megaphone size={16} aria-hidden /> Thường
                </button>
                <button type="button" role="radio" aria-checked={severity === "IMPORTANT"} className={severity === "IMPORTANT" ? "active" : ""} onClick={() => setSeverity("IMPORTANT")}>
                  <BellRing size={16} aria-hidden /> Quan trọng
                </button>
              </div>
              <small className="o-muted" style={{ fontWeight: 400 }}>
                {severity === "IMPORTANT" ? "Bật hộp thoại giữa màn hình, nhân viên phải bấm “Đã hiểu”." : "Hiện ở chuông và thẻ nổi vài giây."}
              </small>
            </div>

            {owner && aud && (
              <div className="o-tf-field">
                <span>Chi nhánh</span>
                <div className="o-tf-presets">
                  {aud.stores.map((s) => (
                    <button key={s.id} type="button" className={storeIds.includes(s.id) ? "o-chip active" : "o-chip"} aria-pressed={storeIds.includes(s.id)} onClick={() => setStoreIds((x) => toggle(x, s.id))}>
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="o-tf-field">
              <span>Gửi tới</span>
              <div className="o-tf-presets">
                <button type="button" className={roles.length === 0 ? "o-chip active" : "o-chip"} aria-pressed={roles.length === 0} onClick={() => setRoles([])}>Mọi nhân viên</button>
                {aud?.roles.map((r) => (
                  <button key={r.id} type="button" className={roles.includes(r.id) ? "o-chip active" : "o-chip"} aria-pressed={roles.includes(r.id)} onClick={() => setRoles((x) => toggle(x, r.id))}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="o-bc-send">
              <span className="o-muted">Khoảng <strong>{reach}</strong> người sẽ nhận</span>
              <Button variant="primary" icon={Send} onClick={() => void send()} disabled={busy || !title.trim() || reach === 0}>
                {busy ? "Đang gửi…" : "Gửi ngay"}
              </Button>
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Đã gửi gần đây" description="Tỉ lệ đã đọc cập nhật khi nhân viên mở thông báo">
          {!sent.length ? (
            <p className="o-dash-empty">Chưa gửi thông báo nào.</p>
          ) : (
            <ul className="o-bc-history">
              {sent.map((s) => (
                <li key={s.id} className={s.recalledAt ? "is-recalled" : undefined}>
                  <div className="o-bc-history-main">
                    <strong>
                      {s.severity === "IMPORTANT" && <span className="o-task-chip is-late">Quan trọng</span>} {s.title}
                    </strong>
                    {s.body && <span className="o-bc-history-body">{s.body}</span>}
                    <span className="o-muted">
                      {s.audience} · {s.sender?.fullName ?? "—"} · {timeAgo(s.createdAt)}
                      {s.recalledAt && " · đã thu hồi"}
                    </span>
                    <div className="o-task-progress" aria-label={`${s.read}/${s.total} đã đọc`}>
                      <span style={{ width: `${s.total ? (s.read / s.total) * 100 : 0}%` }} />
                    </div>
                  </div>
                  <div className="o-bc-history-side">
                    <span className="o-att-tag">{s.read}/{s.total} đã đọc</span>
                    {s.canRecall && <Button variant="link" size="sm" icon={Undo2} onClick={() => void recall(s)}>Thu hồi</Button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
