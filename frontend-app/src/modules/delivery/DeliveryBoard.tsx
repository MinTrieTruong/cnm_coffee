import { useCallback, useState } from "react";
import { PosDeliveryPanel } from "../../components/PosDeliveryPanel";

/** Giao hàng › Trạng thái đơn: bảng điều phối đơn giao (dùng chung với POS). */
export function DeliveryBoard() {
  const [toast, setToast] = useState<string | null>(null);
  const onToast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 3000);
  }, []);
  return (
    <>
      <PosDeliveryPanel onToast={onToast} />
      {toast && <div className="o-toast" role="status">{toast}</div>}
    </>
  );
}
