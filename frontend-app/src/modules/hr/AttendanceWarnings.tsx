import { useState } from "react";
import { AlarmClock } from "lucide-react";
import { activeStoreId, getStaffInfo, isOwnerRole } from "../../lib/staffApi";
import { ROLE_LABEL } from "../../lib/roles";
import { Alert, Badge, EmptyState, Modal, MonthYearPicker, RecordList } from "../../components/erp";
import { useResource } from "../shared";

type Incident = { scheduleId: number; date: string; shiftCode: string; shiftName: string; kind: "late" | "early" | "absent"; minutes: number };
export type WarningRow = {
  staffId: number;
  fullName: string;
  role: string;
  storeName: string | null;
  shiftCount: number;
  lateCount: number;
  lateMinutes: number;
  earlyCount: number;
  absentCount: number;
  warned: boolean;
  incidents: Incident[];
};
export type WarningData = { month: string; threshold: number; lateGraceMin: number; rows: WarningRow[] };

const KIND = { late: "Đi muộn", early: "Về sớm", absent: "Vắng không phép" } as const;
const pad2 = (n: number) => String(n).padStart(2, "0");
const fmt = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;

/** Dùng chung: tải cảnh báo chấm công của 1 tháng */
export function useAttendanceWarnings(month: number, year: number) {
  return useResource<WarningData | null>(`/api/attendance/warnings?month=${year}-${pad2(month)}`, null);
}

/** Nhân sự › Cảnh báo chấm công */
export function AttendanceWarnings() {
  const now = new Date();
  const [m, setM] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const { data, loading, error } = useAttendanceWarnings(m.month, m.year);
  const [open, setOpen] = useState<WarningRow | null>(null);
  const allStores = isOwnerRole(getStaffInfo()?.role) && activeStoreId() == null;
  const rows = data?.rows ?? [];

  return (
    <>
      <RecordList
        crumbs={[{ label: "Cảnh báo chấm công" }]}
        rows={rows}
        rowKey={(r) => r.staffId}
        loading={loading}
        error={error}
        onOpen={setOpen}
        actions={<MonthYearPicker month={m.month} year={m.year} onChange={(month, year) => setM({ month, year })} />}
        top={
          data && (
            <Alert tone="info">
              Đi muộn = vào trễ quá {data.lateGraceMin} phút mà không có đơn xin đi muộn được duyệt. Đi muộn từ {data.threshold} lần/tháng trở lên sẽ bị cảnh báo. Chủ chuỗi chỉnh các mức này ở "Cấu hình ca & chấm công".
            </Alert>
          )
        }
        columns={[
          { key: "name", label: "Nhân viên", value: (r) => r.fullName },
          { key: "role", label: "Vị trí", value: (r) => ROLE_LABEL[r.role] ?? r.role },
          ...(allStores ? [{ key: "store", label: "Chi nhánh", value: (r: WarningRow) => r.storeName ?? "" }] : []),
          { key: "shifts", label: "Số ca", value: (r) => r.shiftCount, numeric: true },
          { key: "late", label: "Đi muộn", value: (r) => r.lateCount, numeric: true, sum: true, render: (r) => <span style={{ color: r.warned ? "var(--o-danger)" : undefined, fontWeight: r.warned ? 600 : undefined }}>{r.lateCount}</span> },
          { key: "lateMin", label: "Tổng phút trễ", value: (r) => r.lateMinutes, numeric: true, optional: true },
          { key: "early", label: "Về sớm", value: (r) => r.earlyCount, numeric: true, sum: true },
          { key: "absent", label: "Vắng", value: (r) => r.absentCount, numeric: true, sum: true },
          {
            key: "status",
            label: "Tình trạng",
            value: (r) => (r.warned ? "Cảnh báo" : r.incidents.length ? "Cần chú ý" : "Tốt"),
            render: (r) => (r.warned ? <Badge tone="danger">Cảnh báo</Badge> : r.incidents.length ? <Badge tone="warning">Cần chú ý</Badge> : <Badge tone="success">Tốt</Badge>),
          },
        ]}
        searchText={(r) => r.fullName}
        filters={[
          { id: "warned", label: "Bị cảnh báo", test: (r) => r.warned },
          { id: "any", label: "Có vi phạm", test: (r) => r.incidents.length > 0 },
        ]}
        defaultFilters={["any"]}
        groupBys={[{ id: "role", label: "Vị trí", key: (r) => ROLE_LABEL[r.role] ?? r.role }]}
        exportName={`canh-bao-cham-cong-${m.year}-${pad2(m.month)}`}
        emptyState={<EmptyState icon={AlarmClock} title="Không có vi phạm chấm công" hint="Tháng này chưa ai đi muộn, về sớm hay vắng ca." />}
      />
      {open && (
        <Modal title={`${open.fullName} · tháng ${m.month}/${m.year}`} onClose={() => setOpen(null)}>
          {open.incidents.length === 0 ? (
            <p className="o-muted">Không có vi phạm.</p>
          ) : (
            <table className="o-list">
              <thead><tr><th>Ngày</th><th>Ca</th><th>Vi phạm</th><th className="num">Số phút</th></tr></thead>
              <tbody>
                {open.incidents.map((i) => (
                  <tr key={`${i.scheduleId}-${i.kind}`}>
                    <td>{fmt(i.date)}</td>
                    <td>{i.shiftName}</td>
                    <td><Badge tone={i.kind === "early" ? "warning" : "danger"}>{KIND[i.kind]}</Badge></td>
                    <td className="num">{i.kind === "absent" ? "" : i.minutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}
    </>
  );
}
