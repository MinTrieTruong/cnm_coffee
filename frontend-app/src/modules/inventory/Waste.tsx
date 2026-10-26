import { useState } from "react";
import { PackageMinus } from "lucide-react";
import { activeStoreId, getStaffInfo, isOwnerRole } from "../../lib/staffApi";
import { EmptyState, MonthYearPicker, RecordList, fmtDateTime, formatVnd } from "../../components/erp";
import { WASTE_REASON as KDS_REASON } from "../../components/KdsTools";
import { useResource } from "../shared";

/** Lý do pha chế chọn + lý do hệ thống tự ghi (kiểm kê thiếu) */
const WASTE_REASON: Record<string, string> = { ...KDS_REASON, STOCKTAKE: "Kiểm kê thiếu", SUPPLIER: "Lỗi nhà cung cấp" };

type WasteRow = {
  id: number;
  qty: number;
  size: string | null;
  reason: string;
  note: string | null;
  costValue: number;
  createdAt: string;
  staff: { fullName: string };
  product: { name: string } | null;
  item: { name: string; unit: string | null } | null;
  store: { name: string };
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const what = (w: WasteRow) => (w.product ? `${w.product.name}${w.size ? ` (${w.size})` : ""}` : w.item?.name ?? "");
const amount = (w: WasteRow) => (w.product ? `${w.qty} ly` : `${w.qty}${w.item?.unit ? ` ${w.item.unit}` : ""}`);

/** Kho › Sổ hao hụt — đổ bể, hư hỏng, làm lại món do pha chế báo từ màn KDS */
export function WasteList() {
  const now = new Date();
  const [m, setM] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const { data: rows, loading, error } = useResource<WasteRow[]>(`/api/kitchen/waste?month=${m.year}-${pad2(m.month)}`, []);
  const allStores = isOwnerRole(getStaffInfo()?.role) && activeStoreId() == null;

  return (
    <RecordList
      crumbs={[{ label: "Sổ hao hụt" }]}
      rows={rows}
      rowKey={(w) => w.id}
      loading={loading}
      error={error}
      actions={<MonthYearPicker month={m.month} year={m.year} onChange={(month, year) => setM({ month, year })} />}
      columns={[
        { key: "time", label: "Thời gian", value: (w) => w.createdAt, render: (w) => fmtDateTime(w.createdAt) },
        ...(allStores ? [{ key: "store", label: "Chi nhánh", value: (w: WasteRow) => w.store.name }] : []),
        { key: "kind", label: "Loại", value: (w) => (w.product ? "Hỏng món" : "Nguyên liệu") },
        { key: "what", label: "Món / nguyên liệu", value: what },
        { key: "qty", label: "Số lượng", value: (w) => w.qty, render: amount, numeric: true },
        { key: "reason", label: "Lý do", value: (w) => WASTE_REASON[w.reason] ?? w.reason },
        { key: "note", label: "Ghi chú", value: (w) => w.note ?? "", wrap: true, optional: true },
        { key: "staff", label: "Người báo", value: (w) => w.staff.fullName },
        { key: "cost", label: "Giá trị ước tính", value: (w) => w.costValue, numeric: true, sum: true, formatSum: formatVnd, render: (w) => formatVnd(w.costValue) },
      ]}
      searchText={(w) => `${what(w)} ${w.staff.fullName} ${w.note ?? ""}`}
      filters={Object.entries(WASTE_REASON).map(([id, label]) => ({ id, label, test: (w: WasteRow) => w.reason === id }))}
      groupBys={[
        { id: "reason", label: "Lý do", key: (w) => WASTE_REASON[w.reason] ?? w.reason },
        { id: "what", label: "Món / nguyên liệu", key: what },
        { id: "staff", label: "Người báo", key: (w) => w.staff.fullName },
      ]}
      exportName={`hao-hut-${m.year}-${pad2(m.month)}`}
      emptyState={<EmptyState icon={PackageMinus} title="Chưa có hao hụt nào trong tháng" hint="Pha chế báo hao hụt ở màn KDS (nút Báo hao hụt)." />}
    />
  );
}
