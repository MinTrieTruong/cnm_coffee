import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Coins, MessageSquare, Store, Ticket } from "lucide-react";
import { api } from "../../lib/api";
import { deliveryLabel } from "../../lib/delivery";
import { formatVnd } from "../../lib/site";
import { useLang } from "../../lib/i18n";
import { PasswordInput } from "../../components/PasswordInput";
import { MyGifts } from "../../modules/games/MyGifts";
import { ReviewComposer } from "../../components/site/ReviewComposer";
import { ProductImage } from "../../components/site/parts";
import { SocialButtons } from "../../components/site/SocialLogin";
import { useSocialConfig, type SocialProvider } from "../../lib/socialLogin";
import { Pager, usePaged, voucherActive, type AccountData, type CustomerOrder, type MyVoucher, type PublicVoucher } from "./shared";

type Msg = { text: string; ok: boolean } | null;
const Note = ({ msg }: { msg: Msg }) => (msg ? <p className={msg.ok ? "c-acc-ok" : "c-err"} role={msg.ok ? "status" : "alert"}>{msg.text}</p> : null);

/* ═══════════ Thông tin cá nhân ═══════════ */
export function ProfileSection({ data }: { data: AccountData }) {
  const { t } = useLang();
  const u = data.user!;
  const [f, setF] = useState({ fullName: "", phone: "", email: "", dob: "", gender: "", address: "" });
  const [msg, setMsg] = useState<Msg>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setF({
      fullName: u.fullName ?? "",
      phone: u.phone ?? "",
      email: u.email ?? "",
      dob: u.dob ? new Date(u.dob).toISOString().split("T")[0] : "",
      gender: u.gender ?? "",
      address: u.address ?? "",
    });
  }, [u.fullName, u.phone, u.email, u.dob, u.gender, u.address]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setSaving(true);
    try {
      await api("/api/customer/profile", { method: "PATCH", body: JSON.stringify(f) });
      setMsg({ text: t("Đã lưu thông tin."), ok: true });
      await data.refreshMe();
    } catch (ex) {
      setMsg({ text: ex instanceof Error ? ex.message : t("Lỗi cập nhật"), ok: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="c-acc-form" onSubmit={(e) => void save(e)}>
      <div className="c-acc-fields">
        <label className="c-field"><span className="c-field-label">{t("Họ tên")} *</span><input className="c-input" value={f.fullName} onChange={set("fullName")} required autoComplete="name" /></label>
        <label className="c-field"><span className="c-field-label">{t("Số điện thoại")} *</span><input className="c-input" value={f.phone} onChange={set("phone")} required inputMode="tel" autoComplete="tel" /></label>
        <label className="c-field"><span className="c-field-label">{t("Email")}</span><input className="c-input" type="email" value={f.email} onChange={set("email")} autoComplete="email" /></label>
        <label className="c-field"><span className="c-field-label">{t("Ngày sinh")}</span><input className="c-input" type="date" value={f.dob} onChange={set("dob")} /></label>
        <label className="c-field">
          <span className="c-field-label">{t("Giới tính")}</span>
          <select className="c-input" value={f.gender} onChange={set("gender")}>
            <option value="">{t("Chưa chọn")}</option>
            <option value="Nam">{t("Nam")}</option>
            <option value="Nữ">{t("Nữ")}</option>
            <option value="Khác">{t("Khác")}</option>
          </select>
        </label>
        <span className="c-acc-gap" aria-hidden />
        <label className="c-field c-acc-full"><span className="c-field-label">{t("Địa chỉ")}</span><input className="c-input" value={f.address} onChange={set("address")} autoComplete="street-address" /></label>
      </div>
      <Note msg={msg} />
      <div className="c-acc-save">
        <button type="submit" className="c-btn" disabled={saving}>{saving ? t("Đang lưu…") : t("Lưu thông tin")}</button>
      </div>
    </form>
  );
}

/* ═══════════ Bảo mật ═══════════ */
type Identities = {
  hasPassword: boolean;
  canPasswordLogin: boolean;
  identities: { provider: SocialProvider; email: string | null; name: string | null; createdAt: string }[];
};

export function SecuritySection() {
  const [ids, setIds] = useState<Identities | null>(null);
  const load = useCallback(() => {
    api<Identities>("/api/auth/identities").then(setIds).catch(() => setIds(null));
  }, []);
  useEffect(load, [load]);
  return (
    <div className="c-acc-form">
      {/* Chưa tải xong coi như đã có mật khẩu (form đổi mật khẩu như cũ) */}
      <PasswordForm hasPassword={ids?.hasPassword ?? true} onDone={load} />
      {ids && <LinkedAccounts ids={ids} reload={load} />}
    </div>
  );
}

function PasswordForm({ hasPassword, onDone }: { hasPassword: boolean; onDone: () => void }) {
  const { t } = useLang();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next.length < 6) return setMsg({ text: t("Mật khẩu mới phải từ 6 ký tự."), ok: false });
    if (next !== again) return setMsg({ text: t("Hai lần nhập mật khẩu mới chưa khớp."), ok: false });
    setSaving(true);
    try {
      await api("/api/customer/password", { method: "PATCH", body: JSON.stringify({ currentPassword: hasPassword ? cur : undefined, newPassword: next }) });
      setMsg({ text: hasPassword ? t("Đã đổi mật khẩu.") : t("Đã đặt mật khẩu — từ giờ bạn đăng nhập được bằng số điện thoại hoặc email."), ok: true });
      setCur("");
      setNext("");
      setAgain("");
      onDone();
    } catch (ex) {
      setMsg({ text: ex instanceof Error ? ex.message : t("Lỗi đổi mật khẩu"), ok: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="c-acc-form c-acc-narrow" onSubmit={(e) => void save(e)}>
      {!hasPassword && (
        <>
          <h2 className="c-acc-h2">{t("Đặt mật khẩu")}</h2>
          <p className="c-acc-hint">{t("Bạn đang đăng nhập bằng Google / Facebook. Đặt mật khẩu để đăng nhập được cả bằng số điện thoại hoặc email.")}</p>
        </>
      )}
      {hasPassword && (
        <label className="c-field"><span className="c-field-label">{t("Mật khẩu hiện tại")}</span><PasswordInput className="c-input" value={cur} onChange={(e) => setCur(e.target.value)} required autoComplete="current-password" /></label>
      )}
      <label className="c-field"><span className="c-field-label">{t("Mật khẩu mới")}</span><PasswordInput className="c-input" value={next} onChange={(e) => setNext(e.target.value)} required minLength={6} autoComplete="new-password" /></label>
      <label className="c-field"><span className="c-field-label">{t("Nhập lại mật khẩu mới")}</span><PasswordInput className="c-input" value={again} onChange={(e) => setAgain(e.target.value)} required minLength={6} autoComplete="new-password" /></label>
      <Note msg={msg} />
      <div className="c-acc-save">
        <button type="submit" className="c-btn" disabled={saving}>{saving ? t("Đang lưu…") : hasPassword ? t("Đổi mật khẩu") : t("Đặt mật khẩu")}</button>
      </div>
    </form>
  );
}

const PROVIDERS: { id: SocialProvider; label: string }[] = [
  { id: "GOOGLE", label: "Google" },
  { id: "FACEBOOK", label: "Facebook" },
];

/** Liên kết / hủy liên kết Google, Facebook — không cho hủy phương thức đăng nhập cuối cùng */
function LinkedAccounts({ ids, reload }: { ids: Identities; reload: () => void }) {
  const { t } = useLang();
  const cfg = useSocialConfig();
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const isLast = !ids.canPasswordLogin && ids.identities.length <= 1;
  const enabled = (p: SocialProvider) => !!(p === "GOOGLE" ? cfg?.google : cfg?.facebook);
  // Cả hai đều tắt và chưa liên kết gì → không hiện khối này
  if (!cfg || (!cfg.google && !cfg.facebook && ids.identities.length === 0)) return null;

  async function link(provider: SocialProvider, token: string) {
    setMsg(null);
    await api(`/api/auth/identities/${provider.toLowerCase()}`, {
      method: "POST",
      body: JSON.stringify(provider === "GOOGLE" ? { idToken: token } : { accessToken: token }),
    });
    setMsg({ text: t("Đã liên kết {p}.", { p: provider === "GOOGLE" ? "Google" : "Facebook" }), ok: true });
    reload();
  }

  async function unlink(provider: SocialProvider, label: string) {
    if (!window.confirm(t("Hủy liên kết {p}? Bạn sẽ không đăng nhập bằng {p} được nữa.", { p: label }))) return;
    setMsg(null);
    setBusy(provider);
    try {
      await api(`/api/auth/identities/${provider.toLowerCase()}`, { method: "DELETE" });
      setMsg({ text: t("Đã hủy liên kết {p}.", { p: label }), ok: true });
      reload();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : t("Hủy liên kết thất bại"), ok: false });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="c-acc-narrow c-linked" aria-labelledby="linked-title">
      <h2 id="linked-title" className="c-acc-h2">{t("Liên kết tài khoản")}</h2>
      <ul className="c-linked-list">
        {PROVIDERS.map((p) => {
          const ident = ids.identities.find((i) => i.provider === p.id);
          return (
            <li key={p.id} className="c-linked-row">
              <div className="c-linked-info">
                <strong>{p.label}</strong>
                {ident ? (
                  <span>{ident.email ?? ident.name ?? t("Đã liên kết")} · {t("liên kết ngày {d}", { d: new Date(ident.createdAt).toLocaleDateString("vi-VN") })}</span>
                ) : (
                  <span>{enabled(p.id) ? t("Chưa liên kết") : t("Quán chưa bật đăng nhập bằng {p}", { p: p.label })}</span>
                )}
              </div>
              {ident ? (
                <button
                  type="button"
                  className="c-btn is-outline"
                  disabled={isLast || busy !== null}
                  title={isLast ? t("Hãy đặt mật khẩu trước khi hủy phương thức đăng nhập cuối cùng") : undefined}
                  onClick={() => void unlink(p.id, p.label)}
                >
                  {busy === p.id ? t("Đang hủy…") : t("Hủy liên kết")}
                </button>
              ) : (
                enabled(p.id) && (
                  <div className="c-linked-action">
                    <SocialButtons only={p.id} onToken={link} googleText="continue_with" />
                  </div>
                )
              )}
            </li>
          );
        })}
      </ul>
      {isLast && ids.identities.length > 0 && <p className="c-acc-hint">{t("Đây là cách đăng nhập duy nhất của bạn — hãy đặt mật khẩu trước khi hủy liên kết.")}</p>}
      <Note msg={msg} />
    </section>
  );
}

/* ═══════════ Đơn hàng ═══════════ */
const ORDER_STATUS: Record<string, string> = {
  Pending_Grace: "Chờ xác nhận", Confirmed: "Đã xác nhận", Paid: "Đã thanh toán", Assigning_Shipper: "Đang tìm tài xế",
  Shipping: "Đang giao hàng", Delivered: "Hoàn thành", Failed: "Giao thất bại", Cancelled: "Đã hủy",
};
const ORDER_TYPE: Record<string, string> = { Delivery: "Giao tận nơi", Takeaway: "Mang về" };

/** Đếm ngược thời gian còn được tự hủy; hết giờ thì gọi onExpire */
function CancelCountdown({ until, onExpire }: { until: string; onExpire: () => void }) {
  const end = new Date(until).getTime();
  const [left, setLeft] = useState(() => Math.max(0, end - Date.now()));
  useEffect(() => {
    const iv = setInterval(() => {
      const l = Math.max(0, end - Date.now());
      setLeft(l);
      if (l <= 0) {
        clearInterval(iv);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [end, onExpire]);
  const sec = Math.ceil(left / 1000);
  return <span>{Math.floor(sec / 60)}:{String(sec % 60).padStart(2, "0")}</span>;
}

export function OrdersSection({ data }: { data: AccountData }) {
  const { t, lang } = useLang();
  const p = usePaged(data.orders);
  const tone = (o: CustomerOrder) => (o.status === "Cancelled" || o.status === "Failed" ? "is-bad" : o.status === "Paid" || o.deliveryStatus === "Delivered" ? "is-good" : "is-wait");

  async function cancel(o: CustomerOrder, refund?: number | null) {
    const ask = refund
      ? t("Hủy đơn #{id}? Số tiền đã thanh toán được hoàn 100% thành điểm — bạn nhận lại {n} điểm.", { id: o.id, n: refund.toLocaleString("vi-VN") })
      : t("Bạn có chắc muốn hủy đơn hàng này không?");
    if (!window.confirm(ask)) return;
    try {
      const r = await api<{ ok: boolean; totalReturned?: number }>(`/api/orders/${o.id}/cancel`, { method: "POST" });
      alert(r.totalReturned != null ? t("Đã hủy đơn. Bạn nhận lại {n} điểm.", { n: r.totalReturned.toLocaleString("vi-VN") }) : t("Đã hủy đơn hàng."));
      void data.loadOrders();
      void data.refreshMe();
    } catch (e) {
      alert(e instanceof Error ? e.message : t("Lỗi khi hủy đơn"));
    }
  }

  if (data.orders === null) return <p className="c-muted-txt">{t("Đang tải…")}</p>;
  if (!data.orders.length) return <p className="c-muted-txt">{t("Chưa có đơn hàng nào.")} <Link to="/menu" className="c-sec-more">{t("Xem thực đơn →")}</Link></p>;
  const done = data.orders.filter((o) => o.status === "Paid").length;
  return (
    <>
      <p className="c-acc-stat">
        {t("{n} đơn hoàn thành", { n: done })} · {t("Đã chi {n}", { n: formatVnd(data.spent ?? 0) })}
      </p>
      <ul className="c-acc-list">
        {p.rows.map((o) => (
          <li key={o.id} className="c-order">
            <div className="c-order-head">
              <Link to={`/order/${o.id}/checkout`} className="c-order-id">{t("Đơn #{id}", { id: o.id })}</Link>
              <span className={`c-order-st ${tone(o)}`}>
                {t(o.orderType === "Delivery" && o.deliveryStatus ? deliveryLabel(o.deliveryStatus) : ORDER_STATUS[o.status] ?? o.status)} · {t(ORDER_TYPE[o.orderType] ?? "Tại bàn")}
              </span>
              <span className="c-price">{formatVnd(o.totalAmount)}</span>
            </div>
            <p className="c-order-items">
              <time dateTime={o.createdAt}>{new Date(o.createdAt).toLocaleString(lang === "en" ? "en-GB" : "vi-VN")}</time> · {o.details.map((d) => `${d.quantity}× ${d.product.name}`).join(", ")}
            </p>
            {(o.orderType === "Delivery" && o.status !== "Cancelled") || o.refundStatus || o.cancelUntil || ["Pending_Grace", "Confirmed"].includes(o.status) ? (
              <div className="c-order-actions">
                {o.orderType === "Delivery" && o.status !== "Cancelled" && (
                  <Link to={`/order/${o.id}/tracking`} className="c-linkbtn">{o.deliveryStatus === "Delivered" ? t("Xem chi tiết giao hàng") : t("Theo dõi đơn")}</Link>
                )}
                {o.refundStatus === "Refunded" && <span className="c-acc-ok">{t("Đã hoàn {n} điểm", { n: (o.refundPoints ?? 0).toLocaleString("vi-VN") })}</span>}
                {o.refundStatus === "Pending" && <span className="c-muted-txt">{t("Quán đang xem xét hoàn tiền")}</span>}
                {o.refundStatus === "Declined" && <span className="c-muted-txt">{t("Không được hoàn tiền")}</span>}
                {o.cancelUntil && o.refundPreview != null && (
                  <button type="button" className="c-linkbtn is-danger" onClick={() => void cancel(o, o.refundPreview)}>
                    {t("Hủy, nhận lại {n} điểm", { n: o.refundPreview.toLocaleString("vi-VN") })} · <CancelCountdown until={o.cancelUntil} onExpire={data.loadOrders} />
                  </button>
                )}
                {["Pending_Grace", "Confirmed"].includes(o.status) && (!o.deliveryStatus || o.deliveryStatus === "Awaiting_Confirm") && (
                  <button type="button" className="c-linkbtn is-danger" onClick={() => void cancel(o)}>{t("Hủy đơn")}</button>
                )}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <Pager {...p} />
    </>
  );
}

/* ═══════════ Lịch sử điểm ═══════════ */
type PointTx = { id: number; orderId: number | null; delta: number; type: string; note: string | null; createdAt: string };
const POINT_TX: Record<string, string> = {
  EARN: "Tích điểm", REDEEM: "Dùng điểm", CANCEL_REFUND: "Hoàn tiền đơn hủy", REDEEM_RETURN: "Trả lại điểm đã dùng", EARN_REVERSAL: "Thu hồi điểm thưởng",
};
export function PointsSection() {
  const { t, date } = useLang();
  const [rows, setRows] = useState<PointTx[] | null>(null);
  useEffect(() => {
    api<PointTx[]>("/api/customer/points-history").then(setRows).catch(() => setRows([]));
  }, []);
  const p = usePaged(rows);
  if (rows === null) return <p className="c-muted-txt">{t("Đang tải…")}</p>;
  if (!rows.length) return <p className="c-muted-txt">{t("Chưa có biến động điểm.")}</p>;
  return (
    <>
      <table className="c-acc-table">
        <thead><tr><th>{t("Ngày")}</th><th>{t("Loại")}</th><th>{t("Ghi chú")}</th><th className="is-num">{t("Điểm")}</th></tr></thead>
        <tbody>
          {p.rows.map((r) => (
            <tr key={r.id}>
              <td>{date(r.createdAt)}</td>
              <td>{t(POINT_TX[r.type] ?? r.type)}</td>
              <td className="c-muted-txt">{r.note ?? ""}</td>
              <td className={`is-num ${r.delta > 0 ? "is-plus" : "is-minus"}`}>{r.delta > 0 ? "+" : ""}{r.delta.toLocaleString("vi-VN")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager {...p} />
    </>
  );
}

/* ═══════════ Ví voucher ═══════════ */
function VoucherRow({ v, state }: { v: PublicVoucher; state?: "used" | "expired" | null }) {
  const { t, date } = useLang();
  return (
    <li className={`c-vrow${state ? " is-dim" : ""}`}>
      <span className="c-vrow-val">−{formatVnd(v.discountValue)}</span>
      <span className="c-vrow-txt">
        <strong>{v.code}</strong>
        {state === "used" && <span className="c-vrow-tag">{t("Đã dùng")}</span>}
        {state === "expired" && <span className="c-vrow-tag">{t("Hết hạn")}</span>}
        <span className="c-muted-txt">
          {v.description ? `${v.description} · ` : ""}
          {v.minBillValue > 0 ? `${t("Đơn từ {n}", { n: formatVnd(v.minBillValue) })} · ` : ""}
          {v.goldHourStart != null && v.goldHourEnd != null ? `${t("Giờ vàng {a}:00–{b}:00", { a: v.goldHourStart, b: v.goldHourEnd })} · ` : ""}
          {t("HSD")} {date(v.endDate)}
        </span>
      </span>
    </li>
  );
}
export function VouchersSection({ data }: { data: AccountData }) {
  const { t } = useLang();
  const [tab, setTab] = useState<"my" | "public">("my");
  const [pub, setPub] = useState<PublicVoucher[] | null>(null);
  useEffect(() => {
    if (tab === "public" && pub === null) api<PublicVoucher[]>("/api/vouchers/public").then(setPub).catch(() => setPub([]));
  }, [tab, pub]);
  const mine: MyVoucher[] = data.myVouchers ? [...data.myVouchers].sort((a, b) => Number(voucherActive(b)) - Number(voucherActive(a))) : [];
  const pm = usePaged(data.myVouchers ? mine : null);
  const pp = usePaged(pub);
  return (
    <>
      <div className="c-seg c-acc-subtabs" role="group" aria-label={t("Loại voucher")}>
        <button type="button" className={tab === "my" ? "is-on" : undefined} aria-pressed={tab === "my"} onClick={() => setTab("my")}>{t("Của tôi")}</button>
        <button type="button" className={tab === "public" ? "is-on" : undefined} aria-pressed={tab === "public"} onClick={() => setTab("public")}>{t("Công khai")}</button>
      </div>
      {tab === "my" &&
        (data.myVouchers === null ? <p className="c-muted-txt">{t("Đang tải…")}</p> : !mine.length ? <p className="c-muted-txt">{t("Bạn chưa có voucher nào trong ví.")} <Link to="/promotions" className="c-sec-more">{t("Xem khuyến mãi →")}</Link></p> : (
          <>
            <ul className="c-acc-list">{pm.rows.map((v) => <VoucherRow key={v.id} v={v.voucher} state={v.isUsed ? "used" : !voucherActive(v) ? "expired" : null} />)}</ul>
            <Pager {...pm} />
          </>
        ))}
      {tab === "public" &&
        (pub === null ? <p className="c-muted-txt">{t("Đang tải…")}</p> : !pub.length ? <p className="c-muted-txt">{t("Hiện chưa có mã ưu đãi công khai.")}</p> : (
          <>
            <ul className="c-acc-list">{pp.rows.map((v) => <VoucherRow key={v.id} v={v} />)}</ul>
            <Pager {...pp} />
          </>
        ))}
    </>
  );
}

/* ═══════════ Quà của tôi (mini game) ═══════════ */
export function GiftsSection() {
  return <MyGifts />;
}

/* ═══════════ Đánh giá đơn ═══════════ */
type EligibleItem = { id: number; name: string; imageUrl: string | null };
type EligibleOrder = { id: number; totalAmount: number; createdAt: string; overallDone: boolean; items: EligibleItem[] };
export function ReviewsSection({ data }: { data: AccountData }) {
  const { t, date } = useLang();
  const [eligible, setEligible] = useState<EligibleOrder[] | null>(null);
  const [orderId, setOrderId] = useState<number | "">("");
  /** Đang mở form cho: "overall" = đánh giá chung, số = productId */
  const [open, setOpen] = useState<"overall" | number | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  const load = useCallback(async () => {
    try {
      const rows = await api<EligibleOrder[]>("/api/reviews/eligible-orders");
      setEligible(rows);
      setOrderId((prev) => (prev !== "" && rows.some((o) => o.id === prev) ? prev : rows[0]?.id ?? ""));
    } catch {
      setEligible([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function done() {
    setOpen(null);
    setMsg({ text: t("Cảm ơn bạn đã gửi đánh giá!"), ok: true });
    await load();
    await data.refreshMe();
  }

  if (eligible === null) return <p className="c-muted-txt">{t("Đang tải…")}</p>;
  if (!eligible.length) return (
    <>
      <Note msg={msg} />
      <p className="c-muted-txt">{t("Bạn không có đơn hàng nào cần đánh giá lúc này.")}</p>
    </>
  );
  const order = eligible.find((o) => o.id === orderId) ?? eligible[0];
  const left = (o: EligibleOrder) => o.items.length + (o.overallDone ? 0 : 1);
  return (
    <div className="c-acc-form">
      <label className="c-field">
        <span className="c-field-label">{t("Đơn hàng")}</span>
        <select className="c-input" value={order.id} onChange={(e) => { setOrderId(Number(e.target.value)); setOpen(null); setMsg(null); }}>
          {eligible.map((o) => <option key={o.id} value={o.id}>{t("Đơn #{id}", { id: o.id })} · {formatVnd(o.totalAmount)} · {date(o.createdAt)} · {t("còn {n} mục", { n: left(o) })}</option>)}
        </select>
      </label>
      <Note msg={msg} />
      <ul className="c-rv-targets">
        {order.items.map((it) => (
          <li key={it.id} className="c-rv-target">
            <div className="c-rv-head">
              <span className="c-rv-img"><ProductImage p={it} /></span>
              <div className="c-rv-title">
                <Link to={`/product/${it.id}`} className="c-rv-name">{it.name}</Link>
                <span className="c-muted-txt">{t("Đánh giá món")}</span>
              </div>
              {open !== it.id && <button type="button" className="c-btn is-outline" onClick={() => { setOpen(it.id); setMsg(null); }}>{t("Viết đánh giá")}</button>}
            </div>
            {open === it.id && <ReviewComposer key={`${order.id}-${it.id}`} orderId={order.id} productId={it.id} placeholder={t("Hương vị, độ ngọt, cách trình bày…")} onDone={() => void done()} onCancel={() => setOpen(null)} />}
          </li>
        ))}
        {!order.overallDone && (
          <li className="c-rv-target">
            <div className="c-rv-head">
              <span className="c-rv-img c-rv-shop" aria-hidden><Store size={26} /></span>
              <div className="c-rv-title">
                <span className="c-rv-name">{t("Đánh giá chung cho quán")}</span>
                <span className="c-muted-txt">{t("Không gian, phục vụ, giao hàng…")}</span>
              </div>
              {open !== "overall" && <button type="button" className="c-btn is-outline" onClick={() => { setOpen("overall"); setMsg(null); }}>{t("Viết đánh giá")}</button>}
            </div>
            {open === "overall" && <ReviewComposer key={`${order.id}-overall`} orderId={order.id} onDone={() => void done()} onCancel={() => setOpen(null)} />}
          </li>
        )}
      </ul>
    </div>
  );
}

/* ═══════════ Hộp thư: tin quán gửi (chăm sóc khách, tặng voucher, điều chỉnh điểm) ═══════════ */
type InboxMsg = { id: number; kind: "MESSAGE" | "VOUCHER" | "POINTS"; title: string; body: string | null; readAt: string | null; createdAt: string };
export function InboxSection({ data }: { data: AccountData }) {
  const { t, date } = useLang();
  const [rows, setRows] = useState<InboxMsg[] | null>(null);
  useEffect(() => {
    api<{ rows: InboxMsg[] }>("/api/customer/messages")
      .then(async (d) => {
        setRows(d.rows);
        // Mở hộp thư = đã đọc hết (vẫn tô đậm các tin mới trong lần xem này)
        if (d.rows.some((m) => !m.readAt)) {
          await api("/api/customer/messages/read", { method: "POST" }).catch(() => undefined);
          void data.loadInbox();
        }
      })
      .catch(() => setRows([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const p = usePaged(rows);
  if (rows === null) return <p className="c-muted-txt">{t("Đang tải…")}</p>;
  if (!rows.length) return <p className="c-muted-txt">{t("Chưa có tin nhắn nào từ quán.")}</p>;
  const ICON = { MESSAGE: MessageSquare, VOUCHER: Ticket, POINTS: Coins } as const;
  return (
    <>
      <ul className="c-inbox">
        {p.rows.map((m) => {
          const Icon = ICON[m.kind] ?? MessageSquare;
          return (
            <li key={m.id} className={m.readAt ? undefined : "is-new"}>
              <span className="c-inbox-ico" aria-hidden><Icon size={18} /></span>
              <div className="c-inbox-main">
                <div className="c-inbox-head">
                  <strong>{m.title}</strong>
                  <time dateTime={m.createdAt}>{date(m.createdAt)}</time>
                </div>
                {m.body && <p>{m.body}</p>}
                {m.kind === "VOUCHER" && <Link to="/account/vouchers" className="c-linkbtn">{t("Xem ví voucher")}</Link>}
                {m.kind === "POINTS" && <Link to="/account/points" className="c-linkbtn">{t("Xem lịch sử điểm")}</Link>}
              </div>
            </li>
          );
        })}
      </ul>
      <Pager {...p} />
    </>
  );
}
