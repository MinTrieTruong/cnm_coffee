import { io, type Socket } from "socket.io-client";
import { mapFetchError } from "./net";
import { apiBase, apiOrigin } from "./api";

const STAFF_TOKEN_KEY = "cmn_staff_token";
/** Chi nhánh Owner đang chọn (nhân viên thường luôn làm ở chi nhánh của mình) */
const OWNER_STORE_KEY = "cmn_staff_store";

export type StaffInfo = {
  id: number;
  role: string;
  fullName?: string;
  storeId?: number | null;
  storeName?: string | null;
};

export function getStaffToken(): string | null {
  return localStorage.getItem(STAFF_TOKEN_KEY);
}

export function clearStaffSession() {
  localStorage.removeItem(STAFF_TOKEN_KEY);
  localStorage.removeItem("cmn_staff_info");
  localStorage.removeItem(OWNER_STORE_KEY);
}

export function getStaffInfo(): StaffInfo | null {
  const raw = localStorage.getItem("cmn_staff_info");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StaffInfo;
  } catch {
    return null;
  }
}

export function isOwnerRole(role: string | undefined) {
  return role === "Owner";
}

/** Owner: chi nhánh đang chọn, `null` = tất cả chi nhánh. */
export function getOwnerStore(): number | null {
  const n = Number(localStorage.getItem(OWNER_STORE_KEY));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function setOwnerStore(storeId: number | null) {
  if (storeId == null) localStorage.removeItem(OWNER_STORE_KEY);
  else localStorage.setItem(OWNER_STORE_KEY, String(storeId));
}

/** Chi nhánh đang làm việc của phiên nhân sự hiện tại. */
export function activeStoreId(): number | null {
  const info = getStaffInfo();
  if (!info) return null;
  return isOwnerRole(info.role) ? getOwnerStore() : info.storeId ?? null;
}

function setStoreHeader(headers: Headers) {
  const info = getStaffInfo();
  const sid = getOwnerStore();
  if (isOwnerRole(info?.role) && sid != null) headers.set("X-Store-Id", String(sid));
}

/**
 * Socket cho màn hình nhân sự: gửi token để server cho vào phòng của chi nhánh
 * (client vẫn `emit("join", "pos" | "kds" | "staff" | "admin_room")` như cũ).
 */
export function staffSocket(): Socket {
  const info = getStaffInfo();
  return io(apiOrigin(), {
    transports: ["websocket", "polling"],
    auth: {
      token: getStaffToken(),
      ...(isOwnerRole(info?.role) && getOwnerStore() != null ? { storeId: getOwnerStore() } : {}),
    },
  });
}

export async function staffApi<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const t = getStaffToken();
  if (t) headers.set("Authorization", `Bearer ${t}`);
  setStoreHeader(headers);
  const base = apiBase();
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...init, headers });
  } catch (e) {
    throw mapFetchError(e);
  }
  if (!res.ok) {
    // Token hết hạn (12h) hoặc không hợp lệ — xóa session và redirect về login
    if (res.status === 401) {
      clearStaffSession();
      window.location.href = "/staff/login";
      throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    }
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("Content-Type") ?? "";
  if (ct.includes("application/json")) return res.json() as Promise<T>;
  return (await res.text()) as unknown as T;
}

/** Tải CSV / blob có kèm Bearer */
export async function staffDownloadBlob(path: string): Promise<Blob> {
  const t = getStaffToken();
  const headers = new Headers();
  if (t) headers.set("Authorization", `Bearer ${t}`);
  setStoreHeader(headers);
  const base = apiBase();
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { headers });
  } catch (e) {
    throw mapFetchError(e);
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.blob();
}

/** Upload ảnh (data URL từ FileReader). Trả về path /uploads/... để lưu vào DB. */
export async function staffUploadImage(dataUrl: string): Promise<string> {
  const r = await staffApi<{ url: string }>("/api/admin/upload-image", {
    method: "POST",
    body: JSON.stringify({ dataUrl }),
  });
  return r.url;
}
