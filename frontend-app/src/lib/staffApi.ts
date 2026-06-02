import { mapFetchError } from "./net";
import { apiBase } from "./api";

const STAFF_TOKEN_KEY = "cmn_staff_token";

export function getStaffToken(): string | null {
  return localStorage.getItem(STAFF_TOKEN_KEY);
}

export function clearStaffSession() {
  localStorage.removeItem(STAFF_TOKEN_KEY);
  localStorage.removeItem("cmn_staff_info");
}

export function getStaffInfo(): { id: number; role: string; fullName?: string } | null {
  const raw = localStorage.getItem("cmn_staff_info");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { id: number; role: string; fullName?: string };
  } catch {
    return null;
  }
}

export async function staffApi<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const t = getStaffToken();
  if (t) headers.set("Authorization", `Bearer ${t}`);
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
