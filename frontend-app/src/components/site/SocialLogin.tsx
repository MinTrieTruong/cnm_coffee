import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { setSession, type SessionUser } from "../../lib/session";
import { facebookReady, loginFacebook, preloadFacebook, renderGoogleButton, SocialCancelled, useSocialConfig, type SocialProvider } from "../../lib/socialLogin";
import { useLang } from "../../lib/i18n";

/** Kết quả 409 khi trùng tài khoản có sẵn — chuyển sang màn nhập mật khẩu để liên kết */
export type LinkRequired = {
  code: "LINK_REQUIRED";
  ticket: string;
  provider: SocialProvider;
  account: { fullName: string; phone: string | null; email: string | null; hasPassword: boolean };
};
export type SignInResult = { token: string; user: SessionUser; needsPhone: boolean };

export const isLinkRequired = (e: unknown): e is ApiError & { data: LinkRequired } =>
  e instanceof ApiError && e.status === 409 && e.data?.code === "LINK_REQUIRED";

/** Đăng nhập xong: lưu phiên, thiếu SĐT → màn bổ sung, còn lại quay về trang trước */
export function useFinishSignIn(next: string) {
  const nav = useNavigate();
  return useCallback(
    (r: SignInResult) => {
      setSession(r.token, r.user);
      nav(r.needsPhone ? `/login/phone?next=${encodeURIComponent(next)}` : next, { replace: true });
    },
    [nav, next],
  );
}

/** Trang /login, /register: token Google / Facebook → backend → đăng nhập / tạo tài khoản / mời liên kết */
export function useSocialSignIn(next: string) {
  const nav = useNavigate();
  const finish = useFinishSignIn(next);
  return useCallback(
    async (provider: SocialProvider, token: string) => {
      try {
        const r = await api<SignInResult>(provider === "GOOGLE" ? "/api/auth/google" : "/api/auth/facebook", {
          method: "POST",
          body: JSON.stringify(provider === "GOOGLE" ? { idToken: token } : { accessToken: token }),
        });
        finish(r);
      } catch (e) {
        if (isLinkRequired(e)) return nav(`/login/link?next=${encodeURIComponent(next)}`, { state: e.data });
        throw e;
      }
    },
    [finish, nav, next],
  );
}

function FacebookLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#fff" d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07" />
    </svg>
  );
}

/**
 * Nút "Tiếp tục với Google" (nút chính thức của Google) và "Tiếp tục với Facebook".
 * Nhà cung cấp bị tắt / thiếu cấu hình thì không hiện; cả hai tắt thì không hiện gì (kể cả dải "hoặc").
 */
export function SocialButtons({
  onToken,
  only,
  divider = false,
  googleText = "continue_with",
}: {
  onToken: (provider: SocialProvider, token: string) => Promise<unknown>;
  only?: SocialProvider;
  divider?: boolean;
  googleText?: "continue_with" | "signin_with" | "signup_with";
}) {
  const { t } = useLang();
  const cfg = useSocialConfig();
  const googleId = only === "FACEBOOK" ? null : cfg?.google ?? null;
  const fbId = only === "GOOGLE" ? null : cfg?.facebook ?? null;
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fbReady, setFbReady] = useState(false);
  const gRef = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  const run = useCallback(async (provider: SocialProvider, getToken: () => Promise<string>) => {
    setErr(null);
    setBusy(provider);
    try {
      await onTokenRef.current(provider, await getToken());
    } catch (e) {
      setErr(e instanceof SocialCancelled ? t("Bạn đã hủy đăng nhập.") : e instanceof Error ? e.message : t("Đăng nhập thất bại"));
    } finally {
      setBusy(null);
    }
  }, [t]);

  useEffect(() => {
    if (!googleId || !gRef.current) return;
    renderGoogleButton(gRef.current, googleId, (idToken) => void run("GOOGLE", async () => idToken), googleText).catch((e: Error) => setErr(e.message));
  }, [googleId, googleText, run]);

  useEffect(() => {
    if (!fbId) return;
    if (facebookReady(fbId)) return setFbReady(true);
    let live = true;
    preloadFacebook(fbId).then(() => live && setFbReady(true)).catch((e: Error) => live && setErr(e.message));
    return () => {
      live = false;
    };
  }, [fbId]);

  if (!googleId && !fbId) return null;
  return (
    <div className="c-social">
      {divider && (
        <div className="c-social-or" role="separator">
          <span>{t("Hoặc")}</span>
        </div>
      )}
      {googleId && (
        <div className={busy === "GOOGLE" ? "c-social-google is-busy" : "c-social-google"} aria-busy={busy === "GOOGLE"}>
          <div ref={gRef} className="c-social-gbtn" />
        </div>
      )}
      {fbId && (
        <button
          type="button"
          className="c-social-fb"
          disabled={!fbReady || busy !== null}
          onClick={() => void run("FACEBOOK", loginFacebook)}
        >
          <FacebookLogo />
          {busy === "FACEBOOK" ? t("Đang xử lý…") : t("Tiếp tục với Facebook")}
        </button>
      )}
      {busy === "GOOGLE" && <p className="c-social-note">{t("Đang xác minh tài khoản Google…")}</p>}
      {err && <p className="c-social-err" role="alert">{err}</p>}
    </div>
  );
}
