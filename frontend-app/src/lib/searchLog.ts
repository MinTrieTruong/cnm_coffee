import { api } from "./api";

const KEY = "searchSid";

/** Mã ẩn danh của trình duyệt — đếm khách vãng lai khác nhau khi thống kê tìm kiếm */
function sessionKey() {
  try {
    let v = localStorage.getItem(KEY);
    if (!v) {
      v = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(KEY, v);
    }
    return v;
  } catch {
    return "no-storage";
  }
}

/** Ghi 1 lượt tìm món (gọi khi khách đã ngừng gõ). Lỗi thì bỏ qua — không ảnh hưởng thực đơn. */
export function logMenuSearch(query: string, storeId: number | null | undefined) {
  const q = query.trim();
  if (q.length < 2) return;
  void api("/api/search-log", { method: "POST", body: JSON.stringify({ query: q, sessionKey: sessionKey(), store: storeId ?? null }) }).catch(() => {});
}
