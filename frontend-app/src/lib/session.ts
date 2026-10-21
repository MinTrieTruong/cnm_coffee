const TOKEN_KEY = "cmn_token";
const USER_KEY = "cmn_user";
const GUEST_KEY = "cmn_guest";
const TABLE_KEY = "cmn_table_id";
const TAKEAWAY_SESSION_KEY = "cmn_takeaway_session_id";
/** Thời điểm quét QR / gán bàn — bàn và phiên mang về tự hết hạn để lần ghé sau không dính bàn cũ */
const ORDER_CTX_AT_KEY = "cmn_order_ctx_at";
const ORDER_CTX_TTL_MS = 4 * 60 * 60 * 1000;

/** Theo API /api/auth sau đăng nhập khách */
export type SessionUser = {
  customerId: number;
  fullName: string;
  phone: string | null;
  email: string | null;
  points: number;
  rankTier: string;
  address?: string | null;
  dob?: string | null;
  gender?: string | null;
  avatarUrl?: string | null;
};

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSession(token: string, user: SessionUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.removeItem(GUEST_KEY);
}

/** Cập nhật điểm / hạng sau khi gọi API (ví dụ GET /api/auth/me). */
export function mergeSessionUser(updates: Partial<SessionUser>) {
  const t = getToken();
  const u = getUser();
  if (!t || !u) return;
  localStorage.setItem(USER_KEY, JSON.stringify({ ...u, ...updates }));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(GUEST_KEY);
}

export function getUser(): SessionUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function setGuestMode() {
  localStorage.setItem(GUEST_KEY, "1");
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isGuestMode(): boolean {
  return localStorage.getItem(GUEST_KEY) === "1";
}

function touchOrderCtx() {
  localStorage.setItem(ORDER_CTX_AT_KEY, String(Date.now()));
}

function orderCtxExpired(): boolean {
  const at = Number(localStorage.getItem(ORDER_CTX_AT_KEY));
  return !at || Date.now() - at > ORDER_CTX_TTL_MS;
}

export function setTableId(id: number | null) {
  if (id == null) localStorage.removeItem(TABLE_KEY);
  else {
    localStorage.setItem(TABLE_KEY, String(id));
    touchOrderCtx();
  }
}

export function getTableId(): number | null {
  const v = localStorage.getItem(TABLE_KEY);
  if (!v) return null;
  if (orderCtxExpired()) {
    localStorage.removeItem(TABLE_KEY);
    return null;
  }
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function setTakeawaySessionId(id: string | null) {
  const v = id?.trim();
  if (!v) localStorage.removeItem(TAKEAWAY_SESSION_KEY);
  else {
    localStorage.setItem(TAKEAWAY_SESSION_KEY, v);
    touchOrderCtx();
  }
}

export function getTakeawaySessionId(): string | null {
  const v = localStorage.getItem(TAKEAWAY_SESSION_KEY);
  if (!v || !v.trim()) return null;
  if (orderCtxExpired()) {
    localStorage.removeItem(TAKEAWAY_SESSION_KEY);
    return null;
  }
  return v;
}

/** crypto.randomUUID chỉ có trên HTTPS/localhost — demo qua IP LAN (http) cần dự phòng */
export function newSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `ta-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
