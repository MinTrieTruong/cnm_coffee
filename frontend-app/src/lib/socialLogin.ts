import { useEffect, useState } from "react";
import { api } from "./api";

/**
 * Đăng nhập Google / Facebook phía trình duyệt: chỉ lấy token rồi gửi backend xác minh.
 * SDK tải lười — chỉ khi trang đăng nhập / mục liên kết tài khoản mở ra, không làm chậm trang chủ.
 */

export type SocialProvider = "GOOGLE" | "FACEBOOK";
type ProvidersResponse = { google: { enabled: boolean; clientId: string | null }; facebook: { enabled: boolean; appId: string | null } };
export type SocialConfig = { google: string | null; facebook: string | null };

let providersCache: Promise<SocialConfig> | null = null;

/** Nút nào được hiện: công tắc của chủ chuỗi + có ID app (VITE_… hoặc backend trả về). null = đang tải */
export function useSocialConfig(): SocialConfig | null {
  const [cfg, setCfg] = useState<SocialConfig | null>(null);
  useEffect(() => {
    providersCache ??= api<ProvidersResponse>("/api/auth/providers")
      .then((p) => ({
        google: p.google.enabled ? import.meta.env.VITE_GOOGLE_CLIENT_ID || p.google.clientId : null,
        facebook: p.facebook.enabled ? import.meta.env.VITE_FACEBOOK_APP_ID || p.facebook.appId : null,
      }))
      .catch(() => {
        providersCache = null;
        return { google: null, facebook: null };
      });
    let live = true;
    void providersCache.then((c) => live && setCfg(c));
    return () => {
      live = false;
    };
  }, []);
  return cfg;
}

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scripts.delete(src);
        s.remove();
        reject(new Error("Không tải được thư viện đăng nhập — kiểm tra kết nối mạng."));
      };
      document.head.appendChild(s);
    });
    scripts.set(src, p);
  }
  return p;
}

/* ── Google Identity Services: nút chính thức → ID token ── */

type GoogleId = {
  initialize: (o: { client_id: string; callback: (r: { credential?: string }) => void; ux_mode?: string; use_fedcm_for_prompt?: boolean }) => void;
  renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
    FB?: {
      init: (o: Record<string, unknown>) => void;
      login: (cb: (r: { authResponse?: { accessToken: string } | null; status?: string }) => void, o?: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

/** Callback hiện tại — GIS chỉ nên initialize một lần cho mỗi client id */
let googleCallback: ((idToken: string) => void) | null = null;
let googleInitFor: string | null = null;

export async function renderGoogleButton(
  el: HTMLElement,
  clientId: string,
  onIdToken: (idToken: string) => void,
  text: "continue_with" | "signin_with" | "signup_with" = "continue_with",
) {
  await loadScript("https://accounts.google.com/gsi/client");
  const gid = window.google?.accounts.id;
  if (!gid) throw new Error("Không tải được thư viện đăng nhập Google.");
  googleCallback = onIdToken;
  if (googleInitFor !== clientId) {
    gid.initialize({ client_id: clientId, callback: (r) => r.credential && googleCallback?.(r.credential) });
    googleInitFor = clientId;
  }
  el.innerHTML = "";
  gid.renderButton(el, {
    type: "standard",
    theme: "outline",
    size: "large",
    shape: "rectangular",
    text,
    logo_alignment: "center",
    locale: document.documentElement.lang === "en" ? "en" : "vi",
    // GIS giới hạn 200–400px
    width: Math.max(200, Math.min(400, Math.floor(el.clientWidth || 320))),
  });
}

/* ── Facebook Login: SDK JS → access token ── */

let fbReadyFor: string | null = null;
let fbLoading: Promise<void> | null = null;

/** Tải sẵn SDK khi trang mở (FB.login phải gọi ngay trong cú bấm, nếu chờ tải trình duyệt sẽ chặn popup) */
export function preloadFacebook(appId: string): Promise<void> {
  if (fbReadyFor === appId) return Promise.resolve();
  fbLoading ??= new Promise<void>((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, version: "v19.0", cookie: false, xfbml: false });
      fbReadyFor = appId;
      resolve();
    };
    loadScript("https://connect.facebook.net/vi_VN/sdk.js").catch((e) => {
      fbLoading = null;
      reject(e);
    });
  });
  return fbLoading;
}

export const facebookReady = (appId: string) => fbReadyFor === appId && !!window.FB;

export class SocialCancelled extends Error {
  constructor() {
    super("Bạn đã hủy đăng nhập.");
  }
}

/** Gọi trực tiếp trong onClick (SDK phải tải xong trước) */
export function loginFacebook(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.FB) return reject(new Error("Thư viện Facebook chưa sẵn sàng, thử lại sau giây lát."));
    window.FB.login(
      (r) => (r.authResponse?.accessToken ? resolve(r.authResponse.accessToken) : reject(new SocialCancelled())),
      { scope: "public_profile,email" },
    );
  });
}
