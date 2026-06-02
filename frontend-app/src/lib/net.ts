/** Khi `fetch` thất bại (backend tắt, sai URL, mạng, CORS chặn, v.v.) */
export function mapFetchError(e: unknown): Error {
  if (e instanceof TypeError) {
    return new Error(
      "Không kết nối được máy chủ API. Chạy backend (cd backend-node && npm run dev), bật Docker MySQL nếu cần. Dev: dùng Vite proxy — mở đúng URL Vite (localhost hoặc IP) và restart npm run dev sau khi đổi cấu hình. Build production: đặt VITE_API_URL trỏ tới API.",
    );
  }
  return e instanceof Error ? e : new Error(String(e));
}
