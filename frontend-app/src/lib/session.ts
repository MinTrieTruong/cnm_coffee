const TOKEN_KEY = "cmn_token";
const USER_KEY = "cmn_user";
const GUEST_KEY = "cmn_guest";
const TABLE_KEY = "cmn_table_id";
const TAKEAWAY_SESSION_KEY = "cmn_takeaway_session_id";

/** Theo API /api/auth sau đăng nhập khách */
export type SessionUser = {
  customerId: number;
  fullName: string;
  phone: string | null;
  email: string | null;
  points: number;
  rankTier: string;
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

export function setTableId(id: number | null) {
  if (id == null) localStorage.removeItem(TABLE_KEY);
  else localStorage.setItem(TABLE_KEY, String(id));
}

export function getTableId(): number | null {
  const v = localStorage.getItem(TABLE_KEY);
  if (!v) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export function setTakeawaySessionId(id: string | null) {
  const v = id?.trim();
  if (!v) localStorage.removeItem(TAKEAWAY_SESSION_KEY);
  else localStorage.setItem(TAKEAWAY_SESSION_KEY, v);
}

export function getTakeawaySessionId(): string | null {
  const v = localStorage.getItem(TAKEAWAY_SESSION_KEY);
  return v && v.trim() ? v : null;
}
