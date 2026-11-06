import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";

/**
 * Xác minh đăng nhập Google / Facebook ở server — chỉ tin dữ liệu lấy từ chính Google / Meta,
 * không tin id / email trình duyệt gửi lên. Secret chỉ nằm trong biến môi trường backend.
 */

export type SocialProvider = "GOOGLE" | "FACEBOOK";

/** Thông tin đã xác minh của tài khoản mạng xã hội */
export type SocialProfile = {
  provider: SocialProvider;
  providerUserId: string;
  /** Chỉ có khi nhà cung cấp xác nhận email (Google email_verified / Facebook trả email) */
  email: string | null;
  name: string | null;
  picture: string | null;
};

export class SocialAuthError extends Error {}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim() || "";
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID?.trim() || "";
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET?.trim() || "";
const GRAPH = "https://graph.facebook.com/v19.0";

/**
 * Chỉ cho script kiểm thử (NODE_ENV=test + SOCIAL_TEST_SECRET): token dạng "test.<jwt HS256>" thay cho token thật
 * của Google / Meta, để chạy được luồng nghiệp vụ khi chưa có app thật. Không bao giờ bật ở môi trường khác.
 */
const TEST_SECRET = process.env.NODE_ENV === "test" ? process.env.SOCIAL_TEST_SECRET?.trim() || "" : "";

export const socialConfigured = {
  GOOGLE: !!GOOGLE_CLIENT_ID || !!TEST_SECRET,
  FACEBOOK: (!!FACEBOOK_APP_ID && !!FACEBOOK_APP_SECRET) || !!TEST_SECRET,
};
/** ID công khai gửi cho frontend (không phải secret) */
export const socialPublicIds = { googleClientId: GOOGLE_CLIENT_ID || null, facebookAppId: FACEBOOK_APP_ID || null };

/** Gọi lúc khởi động: thiếu biến môi trường thì chỉ cảnh báo, nút tương ứng tự ẩn */
export function warnSocialConfig() {
  if (TEST_SECRET) console.warn("[social-login] CHẾ ĐỘ KIỂM THỬ: chấp nhận token giả 'test.*' (NODE_ENV=test)");
  if (!GOOGLE_CLIENT_ID) console.warn("[social-login] Thiếu GOOGLE_CLIENT_ID — ẩn nút đăng nhập Google");
  if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) console.warn("[social-login] Thiếu FACEBOOK_APP_ID / FACEBOOK_APP_SECRET — ẩn nút đăng nhập Facebook");
}

function verifyTestToken(provider: SocialProvider, token: string): SocialProfile | null {
  if (!TEST_SECRET || !token.startsWith("test.")) return null;
  try {
    const p = jwt.verify(token.slice(5), TEST_SECRET, { algorithms: ["HS256"], audience: provider }) as {
      sub: string; email?: string; name?: string; picture?: string;
    };
    return { provider, providerUserId: String(p.sub), email: p.email ?? null, name: p.name ?? null, picture: p.picture ?? null };
  } catch {
    throw new SocialAuthError("Token kiểm thử không hợp lệ.");
  }
}

const googleClient = new OAuth2Client();

/** ID token từ Google Identity Services: kiểm chữ ký, aud = GOOGLE_CLIENT_ID, iss, hạn */
export async function verifyGoogle(idToken: string): Promise<SocialProfile> {
  const test = verifyTestToken("GOOGLE", idToken);
  if (test) return test;
  if (!GOOGLE_CLIENT_ID) throw new SocialAuthError("Chưa cấu hình đăng nhập Google.");
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    throw new SocialAuthError("Không xác minh được tài khoản Google, thử lại.");
  }
  // verifyIdToken đã kiểm iss (accounts.google.com) và hạn; kiểm lại cho chắc
  if (!payload?.sub || !["accounts.google.com", "https://accounts.google.com"].includes(payload.iss ?? "")) {
    throw new SocialAuthError("Không xác minh được tài khoản Google, thử lại.");
  }
  return {
    provider: "GOOGLE",
    providerUserId: payload.sub,
    email: payload.email && payload.email_verified ? payload.email.toLowerCase() : null,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  };
}

async function graph<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${GRAPH}${path}`, { signal: AbortSignal.timeout(8000) });
  } catch {
    throw new SocialAuthError("Không kết nối được Facebook, thử lại.");
  }
  const j = (await res.json().catch(() => ({}))) as T & { error?: unknown };
  if (!res.ok || j.error) throw new SocialAuthError("Không xác minh được tài khoản Facebook, thử lại.");
  return j;
}

/** Access token từ Facebook Login: debug_token (app token) phải đúng app và còn hiệu lực, rồi lấy /me */
export async function verifyFacebook(accessToken: string): Promise<SocialProfile> {
  const test = verifyTestToken("FACEBOOK", accessToken);
  if (test) return test;
  if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) throw new SocialAuthError("Chưa cấu hình đăng nhập Facebook.");
  const appToken = `${FACEBOOK_APP_ID}|${FACEBOOK_APP_SECRET}`;
  const dbg = await graph<{ data?: { app_id?: string; is_valid?: boolean; user_id?: string } }>(
    `/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`,
  );
  if (!dbg.data?.is_valid || dbg.data.app_id !== FACEBOOK_APP_ID || !dbg.data.user_id) {
    throw new SocialAuthError("Không xác minh được tài khoản Facebook, thử lại.");
  }
  const me = await graph<{ id?: string; name?: string; email?: string }>(
    `/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`,
  );
  if (!me.id || me.id !== dbg.data.user_id) throw new SocialAuthError("Không xác minh được tài khoản Facebook, thử lại.");
  return {
    provider: "FACEBOOK",
    providerUserId: me.id,
    email: me.email ? me.email.toLowerCase() : null,
    name: me.name ?? null,
    // Link ảnh cố định theo id (link trong picture.data.url dài và hết hạn sau vài ngày)
    picture: `${GRAPH}/${me.id}/picture?type=large`,
  };
}

/* ── Phiếu liên kết: kết quả đã xác minh, giữ tạm 10 phút trong khi khách nhập mật khẩu tài khoản cũ ── */

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

export type LinkTicket = {
  typ: "link";
  profile: SocialProfile;
  /** Tài khoản có sẵn cần nhập mật khẩu để gắn liên kết vào */
  targetId: number;
  /** Tài khoản tạm vừa tạo bằng mạng xã hội (luồng bổ sung SĐT trùng) — gộp xong thì xoá nếu chưa có dữ liệu */
  tempId: number | null;
};

export function signLinkTicket(t: Omit<LinkTicket, "typ">) {
  return jwt.sign({ ...t, typ: "link" } satisfies LinkTicket, JWT_SECRET, { expiresIn: "10m" });
}

export function verifyLinkTicket(token: string): LinkTicket | null {
  try {
    const t = jwt.verify(token, JWT_SECRET) as LinkTicket;
    return t.typ === "link" ? t : null;
  } catch {
    return null;
  }
}
