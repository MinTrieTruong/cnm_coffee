import { useRef, useState } from "react";
import { Link, Navigate, NavLink, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronRight, Gift, ReceiptText, Ticket } from "lucide-react";
import { api } from "../lib/api";
import { CustomerAvatar } from "../components/CustomerAvatar";
import { clearSession } from "../lib/session";
import { useLang } from "../lib/i18n";
import { Crumbs } from "../components/site/parts";
import { PhoneReminder } from "./SocialComplete";
import {
  ALL_SECTIONS, LEGACY_TAB, SECTIONS, rankLabel, rankProgress, readImage, sectionLabel, useAccountData, useIsPhone,
  type AccountData, type Section,
} from "./account/shared";
import {
  GiftsSection, InboxSection, OrdersSection, PointsSection, ProfileSection, ReviewsSection, SecuritySection, VouchersSection,
} from "./account/sections";

/** Ảnh đại diện — bấm để đổi (tải lên ngay, không nằm trong form hồ sơ) */
function Avatar({ data, size }: { data: AccountData; size: 48 | 64 }) {
  const { t } = useLang();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const u = data.user!;
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      await api("/api/customer/profile", { method: "PATCH", body: JSON.stringify({ avatarDataUrl: await readImage(file) }) });
      await data.refreshMe();
    } catch (e) {
      alert(e instanceof Error ? t(e.message) : t("Lỗi lưu ảnh đại diện."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" className="c-avatar" style={{ width: size, height: size }} onClick={() => input.current?.click()} aria-label={t("Đổi ảnh đại diện")} title={t("Đổi ảnh đại diện")} disabled={busy}>
      <CustomerAvatar src={u.avatarUrl} name={u.fullName} size={size} />
      <span className="c-avatar-edit" aria-hidden>{busy ? "…" : t("Đổi")}</span>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
    </button>
  );
}

/** Hạng · điểm · thanh tiến độ lên hạng (theo tổng chi tiêu) */
function RankLine({ data, compact }: { data: AccountData; compact?: boolean }) {
  const { t, lang } = useLang();
  const u = data.user!;
  const prog = rankProgress(u.rankTier, data.spent);
  const fmt = (n: number) => n.toLocaleString(lang === "en" ? "en-US" : "vi-VN");
  return (
    <div className={`c-rank${compact ? " is-compact" : ""}`}>
      {!compact && (
        <dl className="c-rank-cells">
          <div><dt>{t("Hạng")}</dt><dd>{t(rankLabel(u.rankTier))}</dd></div>
          <div><dt>{t("Điểm")}</dt><dd>{fmt(u.points)}</dd></div>
        </dl>
      )}
      {compact && <p className="c-rank-pts"><strong>{fmt(u.points)}</strong> {t("điểm")}</p>}
      {prog && (
        <>
          <div className="c-rank-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(prog.pct)} aria-label={t("Tiến độ lên hạng {r}", { r: t(prog.next) })}>
            <span style={{ width: `${prog.pct}%` }} />
          </div>
          <p className="c-rank-note">{t("Chi tiêu thêm {n}đ để lên hạng {r}", { n: fmt(prog.remain), r: t(prog.next) })}</p>
        </>
      )}
    </div>
  );
}

function SectionContent({ s, data }: { s: Section; data: AccountData }) {
  switch (s) {
    case "profile": return <ProfileSection data={data} />;
    case "security": return <SecuritySection />;
    case "orders": return <OrdersSection data={data} />;
    case "reviews": return <ReviewsSection data={data} />;
    case "points": return <PointsSection />;
    case "vouchers": return <VouchersSection data={data} />;
    case "gifts": return <GiftsSection />;
    case "inbox": return <InboxSection data={data} />;
  }
}

export function Account() {
  const { t } = useLang();
  const nav = useNavigate();
  const phone = useIsPhone();
  const { section } = useParams<{ section?: string }>();
  const [params] = useSearchParams();
  const data = useAccountData();
  const logout = () => {
    clearSession();
    nav("/", { replace: true });
  };

  // Link cũ /account?tab=… → route con
  const legacy = params.get("tab");
  if (legacy) return <Navigate to={`/account/${LEGACY_TAB[legacy] ?? "profile"}`} replace />;
  if (section && !ALL_SECTIONS.includes(section as Section)) return <Navigate to="/account" replace />;

  if (!data.loggedIn || !data.user) {
    return (
      <div className="c-wrap c-acc">
        <Crumbs items={[{ label: "Tài khoản" }]} />
        <div className="c-empty">
          <p className="c-empty-title">{t("Tài khoản")}</p>
          <p className="c-muted-txt">{t("Đăng nhập hoặc đăng ký để xem điểm tích luỹ và ưu đãi.")}</p>
          <Link to={`/login?next=${encodeURIComponent(section ? `/account/${section}` : "/account")}`} className="c-btn">{t("Đăng nhập")}</Link>
        </div>
      </div>
    );
  }
  const u = data.user;
  const badge = (id: Section) => (id === "vouchers" ? data.counts.vouchers : id === "gifts" ? data.counts.gifts : id === "inbox" ? data.counts.inbox : 0);

  /* ── Điện thoại: /account là trang hub, mục mở trang con ── */
  if (phone && !section) {
    return (
      <div className="c-wrap c-hub">
        <header className="c-hub-head">
          <Avatar data={data} size={48} />
          <div className="c-hub-who">
            <strong>{u.fullName}</strong>
            <span>{u.phone}</span>
          </div>
          <span className="c-rank-chip">{t(rankLabel(u.rankTier))}</span>
          <RankLine data={data} compact />
        </header>
        <PhoneReminder next="/account" />
        <div className="c-hub-quick">
          <Link to="/account/orders"><ReceiptText size={18} aria-hidden /><strong>{data.counts.openOrders}</strong><span>{t("Đơn đang xử lý")}</span></Link>
          <Link to="/account/vouchers"><Ticket size={18} aria-hidden /><strong>{data.counts.vouchers}</strong><span>{t("Voucher")}</span></Link>
          <Link to="/account/gifts"><Gift size={18} aria-hidden /><strong>{data.counts.gifts}</strong><span>{t("Quà chờ nhận")}</span></Link>
        </div>
        <nav className="c-hub-menu" aria-label={t("Mục tài khoản")}>
          {SECTIONS.map((g) => (
            <section key={g.group}>
              <h2>{t(g.group)}</h2>
              <ul>
                {g.items.map((i) => (
                  <li key={i.id}>
                    <Link to={`/account/${i.id}`}>
                      <span>{t(i.label)}</span>
                      {badge(i.id) > 0 && <span className="c-badge">{badge(i.id)}</span>}
                      <ChevronRight size={18} aria-hidden />
                    </Link>
                  </li>
                ))}
                {g.group === "Khác" && (
                  <li><button type="button" className="c-hub-logout" onClick={logout}>{t("Đăng xuất")}</button></li>
                )}
              </ul>
            </section>
          ))}
        </nav>
      </div>
    );
  }

  const current: Section = (section as Section) ?? "profile";

  /* ── Điện thoại: trang con (tiêu đề + nút quay lại nằm ở header điện thoại) ── */
  if (phone) {
    return (
      <div className="c-wrap c-acc-sub">
        <SectionContent s={current} data={data} />
      </div>
    );
  }

  /* ── Máy tính / máy tính bảng: 2 cột ── */
  return (
    <div className="c-wrap c-acc">
      <Crumbs items={[{ to: "/account", label: "Tài khoản" }, { label: sectionLabel(current) }]} />
      <div className="c-acc-grid">
        <aside className="c-acc-side">
          <div className="c-acc-card">
            <Avatar data={data} size={64} />
            <div className="c-acc-who">
              <strong>{u.fullName}</strong>
              <span>{u.phone}</span>
            </div>
            <RankLine data={data} />
          </div>
          <nav className="c-acc-menu" aria-label={t("Mục tài khoản")}>
            {SECTIONS.map((g) => (
              <div key={g.group} className="c-acc-group">
                <h2>{t(g.group)}</h2>
                {g.items.map((i) => (
                  <NavLink key={i.id} to={`/account/${i.id}`} className={() => (current === i.id ? "is-on" : undefined)} aria-current={current === i.id ? "page" : undefined}>
                    <span>{t(i.label)}</span>
                    {badge(i.id) > 0 && <span className="c-badge">{badge(i.id)}</span>}
                  </NavLink>
                ))}
                {g.group === "Khác" && <button type="button" className="c-acc-logout" onClick={logout}>{t("Đăng xuất")}</button>}
              </div>
            ))}
          </nav>
        </aside>
        <section className="c-acc-main" aria-labelledby="acc-title">
          <h1 id="acc-title" className="c-acc-title">{t(sectionLabel(current))}</h1>
          <PhoneReminder next={`/account/${current}`} />
          <SectionContent s={current} data={data} />
        </section>
      </div>
    </div>
  );
}
