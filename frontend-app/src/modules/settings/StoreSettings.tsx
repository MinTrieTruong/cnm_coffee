import { useState } from "react";
import { AdminStoreSettings } from "../../components/AdminStoreSettings";
import { Alert, ControlPanel } from "../../components/erp";
import { getStaffInfo, isOwnerRole } from "../../lib/staffApi";
import { useResource } from "../shared";

type Settings = {
  vatRatePercent: number;
  pointPerVnd: number;
  pointValueVnd: number;
  cashRoundTo: number;
  pointEarnEveryVnd?: number;
  pointEarnEach?: number;
  faceMatchThreshold?: number;
  pettyCashLimit?: number;
  cancelWindowMinutes?: number;
};

/** Cấu hình › Cài đặt chung (cả chuỗi — chỉ Chủ chuỗi sửa) */
export function StoreSettings() {
  const { data, error, reload } = useResource<Settings | null>("/api/admin/settings", null);
  const [msg, setMsg] = useState<string | null>(null);
  const owner = isOwnerRole(getStaffInfo()?.role);
  return (
    <div>
      <ControlPanel crumbs={[{ label: "Cài đặt chung" }]} />
      <div className="o-content o-stack" style={{ maxWidth: 1140, margin: "0 auto" }}>
        {(error || msg) && <Alert>{error ?? msg}</Alert>}
        {data && (
          <AdminStoreSettings
            settings={{
              ...data,
              pointEarnEveryVnd: data.pointEarnEveryVnd ?? 1000,
              pointEarnEach: data.pointEarnEach ?? 100,
              faceMatchThreshold: data.faceMatchThreshold ?? 0.5,
              pettyCashLimit: data.pettyCashLimit ?? 200000,
              cancelWindowMinutes: data.cancelWindowMinutes ?? 5,
            }}
            onSaved={reload}
            onErr={setMsg}
            readOnly={!owner}
          />
        )}
      </div>
    </div>
  );
}
