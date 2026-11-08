import { api } from "./api";
import { sessionKey } from "./track";

/** Mã ẩn danh trình duyệt dùng chung với ghi nhận hành vi (lib/track.ts) */
export { sessionKey };

/** Ghi 1 lượt tìm món (gọi khi khách đã ngừng gõ). Lỗi thì bỏ qua — không ảnh hưởng thực đơn. */
export function logMenuSearch(query: string, storeId: number | null | undefined) {
  const q = query.trim();
  if (q.length < 2) return;
  void api("/api/search-log", { method: "POST", body: JSON.stringify({ query: q, sessionKey: sessionKey(), store: storeId ?? null }) }).catch(() => {});
}
