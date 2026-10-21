import { useEffect, useState } from "react";
import { Plus, Save } from "lucide-react";
import { getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
import { ROLE_LABEL } from "../../lib/roles";
import { Alert, Button, ControlPanel, Field, FormGroup, FormGroups, errMsg } from "../../components/erp";
import { useResource } from "../shared";

type Rule = { role: string; weekdayCount: number; weekendCount: number };
type Template = {
  id?: number;
  code?: string;
  name: string;
  startMin: number;
  endMin: number;
  color: string;
  isActive: boolean;
  staffing: Rule[];
};
type Config = {
  lateGraceMin: number;
  earlyLeaveGraceMin: number;
  lateWarnThreshold: number;
  earlyCheckInMin: number;
  minRestHours: number;
  maxShiftsPerWeek: number;
  overtimeRatePercent: number;
  maxOvertimeMinutes: number;
};
type Payload = { config: Config; templates: Template[]; roles: string[] };

const toTime = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromTime = (s: string, isEnd: boolean) => {
  const [h, m] = s.split(":").map(Number);
  const v = (h || 0) * 60 + (m || 0);
  return isEnd && v === 0 ? 1440 : v; // 00:00 ở giờ ra = nửa đêm
};
const hours = (t: Template) => ((t.endMin > t.startMin ? t.endMin : t.endMin + 1440) - t.startMin) / 60;

const RULE_FIELDS: { key: keyof Config; label: string; hint: string; unit: string }[] = [
  { key: "lateGraceMin", label: "Cho phép vào trễ", hint: "Vào trễ quá số phút này mới tính là đi muộn", unit: "phút" },
  { key: "lateWarnThreshold", label: "Cảnh báo khi đi muộn", hint: "Số lần đi muộn trong tháng thì nhân viên bị cảnh báo", unit: "lần / tháng" },
  { key: "earlyLeaveGraceMin", label: "Cho phép về sớm", hint: "Ra sớm quá số phút này mới tính là về sớm", unit: "phút" },
  { key: "earlyCheckInMin", label: "Check-in sớm tối đa", hint: "Được check-in trước giờ vào ca bao nhiêu phút", unit: "phút" },
  { key: "minRestHours", label: "Nghỉ tối thiểu giữa 2 ca", hint: "Tự xếp lịch không xếp 2 ca sát nhau hơn mức này", unit: "giờ" },
  { key: "maxShiftsPerWeek", label: "Số ca tối đa mỗi tuần", hint: "Mỗi nhân viên, tính từ Thứ 2 đến Chủ nhật", unit: "ca" },
  { key: "overtimeRatePercent", label: "Phụ cấp làm thêm giờ", hint: "1 giờ làm thêm được trả = lương 1 giờ × (100% + mức này). VD 15% → 115%", unit: "% / giờ" },
  { key: "maxOvertimeMinutes", label: "Làm thêm tối đa mỗi phiếu", hint: "Nhân viên xin làm thêm không quá số phút này cho 1 ca", unit: "phút" },
];

/** Nhân sự › Cấu hình ca & chấm công — Chủ chuỗi đặt, áp dụng cho mọi chi nhánh */
export function ShiftConfig() {
  const { data, error, setData } = useResource<Payload | null>("/api/hr/config", null);
  const owner = isOwnerRole(getStaffInfo()?.role);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setTemplates(data.templates);
    setConfig(data.config);
  }, [data]);

  const roles = data?.roles ?? [];
  const ro = !owner;
  const patchT = (i: number, p: Partial<Template>) => setTemplates((ts) => ts.map((t, j) => (j === i ? { ...t, ...p } : t)));
  const ruleOf = (t: Template, role: string): Rule => t.staffing.find((r) => r.role === role) ?? { role, weekdayCount: 0, weekendCount: 0 };
  const setRule = (i: number, role: string, field: "weekdayCount" | "weekendCount", v: number) =>
    patchT(i, { staffing: [...templates[i].staffing.filter((r) => r.role !== role), { ...ruleOf(templates[i], role), [field]: Math.max(0, v) }] });

  async function save() {
    if (!config) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await staffApi<Payload>("/api/hr/config", {
        method: "PUT",
        body: JSON.stringify({
          config,
          templates: templates.map((t) => ({ ...t, staffing: roles.map((r) => ruleOf(t, r)) })),
        }),
      });
      setData(res);
      setMsg({ ok: true, text: "Đã lưu. Cấu hình mới áp dụng cho tất cả chi nhánh." });
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <ControlPanel
        crumbs={[{ label: "Cấu hình ca & chấm công" }]}
        actions={owner && <Button variant="primary" icon={Save} onClick={() => void save()} disabled={saving || !config}>{saving ? "Đang lưu…" : "Lưu"}</Button>}
      />
      <div className="o-content o-stack" style={{ maxWidth: 1140, margin: "0 auto" }}>
        {error && <Alert>{error}</Alert>}
        {msg && <Alert tone={msg.ok ? "info" : "danger"}>{msg.text}</Alert>}
        {ro && <Alert tone="info">Chỉ Chủ chuỗi được thay đổi cấu hình này. Cấu hình áp dụng cho mọi chi nhánh.</Alert>}

        <section className="o-card">
          <div className="o-card-head">
            <h3>Ca làm việc</h3>
            {owner && (
              <Button size="sm" icon={Plus} onClick={() => setTemplates((ts) => [...ts, { name: "Ca mới", startMin: 480, endMin: 960, color: "#0d9488", isActive: true, staffing: [] }])}>
                Thêm ca
              </Button>
            )}
          </div>
          <div className="o-list-wrap">
            <table className="o-list">
              <thead>
                <tr>
                  <th>Tên ca</th>
                  <th>Giờ vào</th>
                  <th>Giờ ra</th>
                  <th className="num">Số giờ</th>
                  <th>Màu</th>
                  <th>Đang dùng</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t, i) => (
                  <tr key={t.id ?? `new-${i}`}>
                    <td><input className="o-input" value={t.name} disabled={ro} onChange={(e) => patchT(i, { name: e.target.value })} aria-label="Tên ca" /></td>
                    <td><input className="o-input" type="time" value={toTime(t.startMin)} disabled={ro} onChange={(e) => patchT(i, { startMin: fromTime(e.target.value, false) })} aria-label="Giờ vào" /></td>
                    <td><input className="o-input" type="time" value={toTime(t.endMin)} disabled={ro} onChange={(e) => patchT(i, { endMin: fromTime(e.target.value, true) })} aria-label="Giờ ra" /></td>
                    <td className="num">{hours(t)} giờ</td>
                    <td><input type="color" value={t.color} disabled={ro} onChange={(e) => patchT(i, { color: e.target.value })} aria-label="Màu" className="o-color" /></td>
                    <td><input type="checkbox" checked={t.isActive} disabled={ro} onChange={(e) => patchT(i, { isActive: e.target.checked })} aria-label="Đang dùng" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="o-muted o-card-note">Ca không dùng nữa thì bỏ chọn "Đang dùng" (không xoá để giữ lịch cũ). Ca qua đêm: giờ ra nhỏ hơn giờ vào.</p>
        </section>

        <section className="o-card">
          <div className="o-card-head"><h3>Định biên — số người cần mỗi ca</h3></div>
          <div className="o-list-wrap">
            <table className="o-list">
              <thead>
                <tr>
                  <th rowSpan={2}>Vị trí</th>
                  {templates.filter((t) => t.isActive).map((t) => (
                    <th key={t.id ?? t.name} colSpan={2} style={{ borderBottom: `2px solid ${t.color}` }}>{t.name}</th>
                  ))}
                </tr>
                <tr>
                  {templates.filter((t) => t.isActive).flatMap((t) => [
                    <th key={`${t.id ?? t.name}-wd`} className="num">T2 – T6</th>,
                    <th key={`${t.id ?? t.name}-we`} className="num">T7, CN</th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role}>
                    <td>{ROLE_LABEL[role] ?? role}</td>
                    {templates.map((t, i) => t.isActive && (["weekdayCount", "weekendCount"] as const).map((f) => (
                      <td key={`${i}-${f}`} className="num">
                        <input
                          className="o-input o-input-num"
                          type="number"
                          min={0}
                          max={50}
                          value={ruleOf(t, role)[f]}
                          disabled={ro}
                          onChange={(e) => setRule(i, role, f, Number(e.target.value))}
                          aria-label={`${ROLE_LABEL[role] ?? role} ${t.name} ${f === "weekdayCount" ? "ngày thường" : "cuối tuần"}`}
                        />
                      </td>
                    )))}
                  </tr>
                ))}
                <tr className="o-total-row">
                  <td>Tổng</td>
                  {templates.map((t) => t.isActive && (["weekdayCount", "weekendCount"] as const).map((f) => (
                    <td key={`${t.name}-${f}`} className="num">{roles.reduce((a, r) => a + ruleOf(t, r)[f], 0)}</td>
                  )))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {config && (
          <section className="o-card">
            <div className="o-card-head"><h3>Quy tắc chấm công & xếp lịch</h3></div>
            <FormGroups>
              <FormGroup>
                {RULE_FIELDS.map((f) => (
                  <Field key={f.key} label={f.label}>
                    <span className="o-inline">
                      <input
                        className="o-input o-input-num"
                        type="number"
                        min={0}
                        value={config[f.key]}
                        disabled={ro}
                        onChange={(e) => setConfig({ ...config, [f.key]: Number(e.target.value) })}
                      />
                      <span className="o-muted">{f.unit}</span>
                    </span>
                    <div className="o-muted o-field-hint">{f.hint}</div>
                  </Field>
                ))}
              </FormGroup>
            </FormGroups>
          </section>
        )}
      </div>
    </div>
  );
}
