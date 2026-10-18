import { useState } from "react";
import { AdminStoreSettings } from "../../components/AdminStoreSettings";
import { Alert, ControlPanel } from "../../components/erp";
import { useResource } from "../shared";

type Settings = {
  vatRatePercent: number;
  pointPerVnd: number;
  pointValueVnd: number;
  cashRoundTo: number;
  pointEarnEveryVnd?: number;
  pointEarnEach?: number;
  storeLat?: number | null;
  storeLng?: number | null;
  storeAddress?: string | null;
  allowedRadius?: number;
  faceMatchThreshold?: number;
};

/** Cấu hình › Cài đặt cửa hàng (giữ nguyên form AdminStoreSettings) */
export function StoreSettings() {
  const { data, error, reload } = useResource<Settings | null>("/api/admin/settings", null);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <ControlPanel crumbs={[{ label: "Cài đặt cửa hàng" }]} />
      <div className="o-content o-stack" style={{ maxWidth: 1140, margin: "0 auto" }}>
        {(error || msg) && <Alert>{error ?? msg}</Alert>}
        {data && (
          <AdminStoreSettings
            settings={{
              ...data,
              pointEarnEveryVnd: data.pointEarnEveryVnd ?? 1000,
              pointEarnEach: data.pointEarnEach ?? 100,
              storeLat: data.storeLat ?? null,
              storeLng: data.storeLng ?? null,
              storeAddress: data.storeAddress ?? null,
              allowedRadius: data.allowedRadius ?? 50,
              faceMatchThreshold: data.faceMatchThreshold ?? 0.5,
            }}
            onSaved={reload}
            onErr={setMsg}
          />
        )}
      </div>
    </div>
  );
}
