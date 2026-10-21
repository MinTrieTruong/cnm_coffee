import { saveStoreId } from "./customerStore";
import { newSessionId, setTableId, setTakeawaySessionId } from "./session";

/**
 * Xử lý link từ mã QR ngay khi trang vừa tải (trước khi React render):
 * - QR bàn:     /menu?table={id}                → gán bàn, vào thẳng thực đơn
 * - QR mang về: /menu?type=takeaway&store={id}  → mỗi lần quét sinh phiên mang về mới
 * Link cũ (/?table=…, /login?idtable=…, ?sid=…) vẫn nhận. Sau khi xử lý thì xoá tham số
 * khỏi URL để tải lại trang không sinh phiên mới.
 */
const QR_LANDING_PATHS = ["/", "/menu", "/login", "/welcome", "/cart"];

export function consumeQrLink() {
  const url = new URL(window.location.href);
  if (!QR_LANDING_PATHS.includes(url.pathname.replace(/\/$/, "") || "/")) return;
  const q = url.searchParams;
  const table = Number(q.get("table") ?? q.get("idtable"));
  const sid = (q.get("sid") ?? q.get("session"))?.trim();
  const isTakeaway = q.get("type") === "takeaway" || !!sid;

  if (!isTakeaway && !(Number.isInteger(table) && table > 0)) return;

  if (isTakeaway) {
    setTableId(null);
    setTakeawaySessionId(sid || newSessionId());
    const store = Number(q.get("store"));
    if (Number.isInteger(store) && store > 0) saveStoreId(store);
  } else {
    setTakeawaySessionId(null);
    setTableId(table);
  }

  window.history.replaceState(null, "", "/menu");
}
