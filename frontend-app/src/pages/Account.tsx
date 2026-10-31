import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { clearSession, getUser, isGuestMode, mergeSessionUser, type SessionUser } from "../lib/session";
import { Star, ImagePlus, X } from "lucide-react";
import { Crumbs } from "../components/site/parts";
import { MyGifts } from "../modules/games/MyGifts";
import { deliveryLabel } from "../lib/delivery";
import { PasswordInput } from "../components/PasswordInput";

const RANK_LABEL_VI: Record<string, string> = {
  Dong: "Đồng", Bac: "Bạc", Vang: "Vàng", KimCuong: "Kim cương",
};

function rankLabel(tier: string) {
  return RANK_LABEL_VI[tier] ?? tier;
}

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

function translateStatus(s: string) {
  if (s === "Pending_Grace") return "Chờ xác nhận";
  if (s === "Confirmed") return "Đã xác nhận";
  if (s === "Paid") return "Đã thanh toán";
  if (s === "Assigning_Shipper") return "Đang tìm tài xế";
  if (s === "Shipping") return "Đang giao hàng";
  if (s === "Delivered") return "Hoàn thành";
  if (s === "Failed") return "Giao thất bại";
  if (s === "Cancelled") return "Đã hủy";
  return s;
}

function translateType(t: string) {
  if (t === "Delivery") return "Giao tận nơi";
  if (t === "Takeaway") return "Mang về";
  return "Tại bàn";
}

type ReviewRow = { id: number; rating: number; comment: string | null; imageUrl: string | null; adminReply: string | null; customer: { fullName: string }; };
type EligibleOrder = { id: number; totalAmount: number; createdAt: string; table: { name: string } | null; };
type PublicVoucher = { id: number; code: string; description: string | null; discountValue: number; minBillValue: number; endDate: string; quantity: number; usedCount: number; goldHourStart: number | null; goldHourEnd: number | null; };
type MyVoucher = { id: number; isUsed: boolean; claimedAt: string; usedAt: string | null; voucher: { id: number; code: string; description: string | null; discountValue: number; minBillValue: number; endDate: string; isActive: boolean; goldHourStart: number | null; goldHourEnd: number | null; }; };

type CustomerOrder = {
  id: number; createdAt: string; totalAmount: number; status: string; orderType: string; deliveryStatus?: string | null;
  details: { quantity: number; product: { name: string } }[];
  /** Đơn giao đã trả: hạn tự hủy (null = hết hạn / không áp dụng) và số điểm sẽ nhận lại */
  cancelUntil?: string | null; refundPreview?: number | null;
  refundStatus?: string | null; refundPoints?: number;
};
type PointTx = { id: number; orderId: number | null; delta: number; type: string; note: string | null; createdAt: string };

const POINT_TX_LABEL: Record<string, string> = {
  EARN: "Tích điểm", REDEEM: "Dùng điểm", CANCEL_REFUND: "Hoàn tiền đơn hủy",
  REDEEM_RETURN: "Trả lại điểm đã dùng", EARN_REVERSAL: "Thu hồi điểm thưởng",
};

/** Đếm ngược thời gian còn được tự hủy; hết giờ thì gọi onExpire */
function CancelCountdown({ until, onExpire }: { until: string; onExpire: () => void }) {
  const end = new Date(until).getTime();
  const [left, setLeft] = useState(() => Math.max(0, end - Date.now()));
  useEffect(() => {
    const iv = setInterval(() => {
      const l = Math.max(0, end - Date.now());
      setLeft(l);
      if (l <= 0) { clearInterval(iv); onExpire(); }
    }, 1000);
    return () => clearInterval(iv);
  }, [end, onExpire]);
  const sec = Math.ceil(left / 1000);
  return <span>còn {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, "0")}</span>;
}
type CustomerSummary = { totalSpent: number; totalOrders: number; };

function VoucherCard({
  code, description, discountValue, minBillValue, endDate,
  goldHourStart, goldHourEnd, isUsed = false, isPersonal = false, isExpired = false,
}: any) {
  const expired = isExpired || new Date(endDate) < new Date();
  const dim = isUsed || expired;

  return (
    <div
     
      style={{
        borderRadius: 6, padding: "1.25rem",
        background: dim ? "var(--c-paper-2)" : "var(--c-surface)",
        border: `1px solid ${dim ? "#e7e5e4" : "rgba(146,64,14,0.2)"}`,
        opacity: dim ? 0.6 : 1, position: "relative", overflow: "hidden",
        boxShadow: dim ? "none" : "0 10px 20px rgba(0,0,0,0.2)"
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: dim ? "#f5f5f4" : "var(--accent)" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.1rem", letterSpacing: "0.05em", color: dim ? "var(--muted)" : "var(--accent)" }}>
              {code}
            </span>
            {isPersonal && <span style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", background: "rgba(99,102,241,0.15)", color: "#818cf8", borderRadius: 4, padding: "0.15rem 0.5rem" }}>Cá nhân</span>}
            {isUsed && <span style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", background: "var(--surface2)", color: "var(--muted)", borderRadius: 4, padding: "0.15rem 0.5rem" }}>Đã dùng</span>}
            {expired && !isUsed && <span style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", background: "rgba(220,38,38,0.15)", color: "#b91c1c", borderRadius: 4, padding: "0.15rem 0.5rem" }}>Hết hạn</span>}
          </div>
          {description && <p style={{ margin: "0 0 0.5rem", fontSize: "0.9rem", color: "var(--text)" }}>{description}</p>}
          <div style={{ fontSize: "0.8rem", color: "var(--muted)", display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
            {minBillValue > 0 && <span>Tối thiểu: {formatVnd(minBillValue)}</span>}
            {goldHourStart != null && goldHourEnd != null && <span>Giờ vàng {goldHourStart}h – {goldHourEnd}h</span>}
            <span>HSD: {new Date(endDate).toLocaleDateString("vi-VN")}</span>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: "1.35rem", color: dim ? "var(--muted)" : "#15803d" }}>
            −{formatVnd(discountValue)}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Account() {
  const [user, setUser] = useState<SessionUser | null>(() => getUser());
  const guest = isGuestMode();
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [eligible, setEligible] = useState<EligibleOrder[] | null>(null);
  const [reviewErr, setReviewErr] = useState<string | null>(null);
  const [reviewOk, setReviewOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pickOrderId, setPickOrderId] = useState<number | "">("");
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewImage, setReviewImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [publicVouchers, setPublicVouchers] = useState<PublicVoucher[] | null>(null);
  const [myVouchers, setMyVouchers] = useState<MyVoucher[] | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [pointTxs, setPointTxs] = useState<PointTx[] | null>(null);

  const [profileMsg, setProfileMsg] = useState<{ text: string, ok: boolean } | null>(null);
  const [pwdMsg, setPwdMsg] = useState<{ text: string, ok: boolean } | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [pwdCurrent, setPwdCurrent] = useState("");
  const [pwdNew, setPwdNew] = useState("");

  // Dashboard Tabs
  type MainTab = "profile" | "orders" | "points" | "vouchers" | "gifts" | "reviews_write" | "reviews_public";
  const MAIN_TABS: MainTab[] = ["profile", "orders", "points", "vouchers", "gifts", "reviews_write", "reviews_public"];
  const [params, setParams] = useSearchParams();
  const navTo = useNavigate();
  const tabParam = params.get("tab") as MainTab | null;
  const [mainTab, setMainTab] = useState<MainTab>(tabParam && MAIN_TABS.includes(tabParam) ? tabParam : "profile");
  // ?tab= (từ thanh điều hướng đáy "Đơn của tôi") → đồng bộ tab
  useEffect(() => {
    if (tabParam && MAIN_TABS.includes(tabParam)) setMainTab(tabParam);
    else if (!tabParam) setMainTab("profile");
  }, [tabParam]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectTab = (t: MainTab) => setParams(t === "profile" ? {} : { tab: t }, { replace: true });
  const [voucherSubTab, setVoucherSubTab] = useState<"my" | "public">("my");

  const refreshMe = useCallback(async () => {
    try {
      const data = await api<{ user: SessionUser }>("/api/auth/me");
      mergeSessionUser(data.user);
      setUser(data.user);
      setFullName(data.user.fullName || "");
      setPhone(data.user.phone || "");
      setEmail(data.user.email || "");
      setAddress(data.user.address || "");
      setGender(data.user.gender || "");
      if (data.user.dob) setDob(new Date(data.user.dob).toISOString().split("T")[0]);
    } catch { }
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([
        api<CustomerOrder[]>("/api/customer/orders"),
        api<CustomerSummary>("/api/customer/summary"),
      ]);
      setOrders(o); setSummary(s);
    } catch { }
  }, []);

  const loadPoints = useCallback(async () => {
    try { setPointTxs(await api<PointTx[]>("/api/customer/points-history")); } catch { setPointTxs([]); }
  }, []);
  useEffect(() => {
    if (mainTab === "points" && !guest && getUser()) void loadPoints();
  }, [mainTab, guest, loadPoints]);

  const loadEligible = useCallback(async () => {
    try {
      const rows = await api<EligibleOrder[]>("/api/reviews/eligible-orders");
      setEligible(rows);
      setPickOrderId((prev) => {
        if (prev !== "" && rows.some((o) => o.id === prev)) return prev;
        return rows[0]?.id ?? "";
      });
    } catch { setEligible([]); }
  }, []);

  const loadVouchers = useCallback(async () => {
    try {
      const [pub, my] = await Promise.all([
        api<PublicVoucher[]>("/api/vouchers/public"),
        api<MyVoucher[]>("/api/vouchers/my").catch(() => [] as MyVoucher[]),
      ]);
      setPublicVouchers(pub); setMyVouchers(my);
    } catch { setPublicVouchers([]); }
  }, []);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const rows = await api<ReviewRow[]>("/api/reviews");
        if (!c) setReviews(rows);
      } catch (e) {
        if (!c) setErr(e instanceof Error ? e.message : "Lỗi");
      }
    })();
    return () => { c = true; };
  }, []);

  useEffect(() => {
    if (guest || !getUser()) return;
    void refreshMe();
    void loadEligible();
    void loadVouchers();
    void loadOrders();
  }, [guest, refreshMe, loadEligible, loadVouchers, loadOrders]);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert("Ảnh quá lớn (< 2MB)."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAvatarDataUrl(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    try {
      await api("/api/customer/profile", {
        method: "PATCH",
        body: JSON.stringify({ fullName, phone, email, address, dob, gender, avatarDataUrl })
      });
      setProfileMsg({ text: "Cập nhật thông tin thành công!", ok: true });
      await refreshMe();
    } catch (ex) {
      setProfileMsg({ text: ex instanceof Error ? ex.message : "Lỗi cập nhật", ok: false });
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwdMsg(null);
    try {
      await api("/api/customer/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword: pwdCurrent, newPassword: pwdNew })
      });
      setPwdMsg({ text: "Đổi mật khẩu thành công!", ok: true });
      setPwdCurrent(""); setPwdNew("");
    } catch (ex) {
      setPwdMsg({ text: ex instanceof Error ? ex.message : "Lỗi đổi mật khẩu", ok: false });
    }
  }

  async function cancelOrder(orderId: number, refundPreview?: number | null) {
    const ask = refundPreview
      ? `Hủy đơn #${orderId}? Số tiền đã thanh toán sẽ được hoàn 100% thành điểm — bạn nhận lại ${refundPreview.toLocaleString("vi-VN")} điểm để dùng cho lần mua sau.`
      : "Bạn có chắc muốn hủy đơn hàng này không?";
    if (!window.confirm(ask)) return;
    try {
      const r = await api<{ ok: boolean; totalReturned?: number }>(`/api/orders/${orderId}/cancel`, { method: "POST" });
      alert(r.totalReturned != null ? `Đã hủy đơn. Bạn nhận lại ${r.totalReturned.toLocaleString("vi-VN")} điểm.` : "Đã hủy đơn hàng thành công!");
      void loadOrders();
      void refreshMe();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Lỗi khi hủy đơn");
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert("Ảnh quá lớn, vui lòng chọn ảnh < 2MB."); return; }
    setUploadingImage(true); setReviewErr(null);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        try {
          const res = await api<{ url: string }>("/api/reviews/upload-image", { method: "POST", body: JSON.stringify({ dataUrl }) });
          setReviewImage(res.url);
        } catch (ex) { setReviewErr(ex instanceof Error ? ex.message : "Lỗi tải ảnh"); }
        finally { setUploadingImage(false); }
      };
      reader.readAsDataURL(file);
    } catch (ex) { setReviewErr(ex instanceof Error ? ex.message : "Lỗi đọc file"); setUploadingImage(false); }
  }

  async function submitReview(e: FormEvent) {
    e.preventDefault();
    setReviewErr(null); setReviewOk(null);
    if (pickOrderId === "") { setReviewErr("Chọn đơn đã thanh toán để đánh giá."); return; }
    try {
      await api("/api/reviews", {
        method: "POST",
        body: JSON.stringify({ orderId: pickOrderId, rating: stars, comment: comment.trim() || undefined, imageUrl: reviewImage || undefined }),
      });
      setReviewOk("Cảm ơn bạn đã gửi đánh giá tuyệt vời!");
      setComment(""); setReviewImage(null);
      await loadEligible(); await refreshMe();
    } catch (ex) { setReviewErr(ex instanceof Error ? ex.message : "Lỗi"); }
  }

  if (guest || !user) {
    return (
      <div className="c-wrap c-account">
        <Crumbs items={[{ label: "Tài khoản" }]} />
        <div className="c-empty">
          <p className="c-empty-title">Tài khoản</p>
          <p className="c-muted-txt">Đăng nhập hoặc đăng ký để xem điểm tích luỹ và ưu đãi.</p>
          <Link to="/login" className="c-btn">Đăng nhập</Link>
        </div>
      </div>
    );
  }

  const myActive = (myVouchers ?? []).filter((v) => !v.isUsed && v.voucher.isActive && new Date(v.voucher.endDate) >= new Date());
  const myUsedOrExpired = (myVouchers ?? []).filter((v) => v.isUsed || !v.voucher.isActive || new Date(v.voucher.endDate) < new Date());

  return (
    <div className="c-wrap c-account">
      <Crumbs items={[{ label: "Tài khoản" }]} />

      {/* Thẻ thành viên */}
      <section className="c-member">
        <div>
          <h1 className="c-member-name">{user.fullName}</h1>
          <p className="c-muted-txt">{user.phone} {user.email && `· ${user.email}`}</p>
        </div>
        <dl className="c-member-facts">
          <div><dt>Hạng thành viên</dt><dd>{rankLabel(user.rankTier)}</dd></div>
          <div><dt>Điểm tích luỹ</dt><dd>{user.points}</dd><span className="c-muted-txt">1 điểm = 1đ</span></div>
        </dl>
      </section>

      <div className="c-tabs" role="tablist" aria-label="Mục tài khoản">
        {[
          { id: "profile", label: "Hồ sơ" },
          { id: "orders", label: "Đơn hàng" },
          { id: "points", label: "Lịch sử điểm" },
          { id: "vouchers", label: "Ví voucher" },
          { id: "gifts", label: "Quà của tôi" },
          { id: "reviews_write", label: "Đánh giá đơn" },
          { id: "reviews_public", label: "Nhận xét chung" },
        ].map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={mainTab === t.id} className={mainTab === t.id ? "is-on" : undefined} onClick={() => selectTab(t.id as MainTab)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Mobile: không còn drawer nên đặt Đăng xuất ở đây (desktop có trên header) */}
      <button
        type="button"
        className="btn btn-ghost account-mobile-logout"
        onClick={() => {
          clearSession();
          navTo("/", { replace: true });
        }}
      >
        Đăng xuất
      </button>
        {/* TAB: PROFILE */}
        {mainTab === "profile" && (
          <div key="profile" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>

            <form onSubmit={(e) => void saveProfile(e)} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, padding: "2rem" }}>
              <h2 className="c-pd-h">Cập nhật thông tin</h2>

              <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap" }}>
                <div style={{ position: "relative", width: 100, height: 100, borderRadius: "50%", overflow: "hidden", background: "var(--surface2)", border: "2px solid var(--border)" }}>
                  <img src={avatarDataUrl || user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.fullName)}&background=333&color=fff`} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <label style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.6)", padding: "0.25rem", textAlign: "center", cursor: "pointer" }}>
                    <ImagePlus size={14} color="#fff" style={{ margin: "0 auto" }} />
                    <input type="file" accept="image/*" onChange={(e) => void handleAvatarUpload(e)} style={{ display: "none" }} />
                  </label>
                </div>
                <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div className="field">
                    <label className="label">Họ tên *</label>
                    <input className="input" value={fullName} onChange={e => setFullName(e.target.value)} required />
                  </div>
                  <div className="field">
                    <label className="label">Số điện thoại *</label>
                    <input className="input" value={phone} onChange={e => setPhone(e.target.value)} required />
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
                <div className="field">
                  <label className="label">Email</label>
                  <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div className="field">
                  <label className="label">Ngày sinh</label>
                  <input type="date" className="input" value={dob} onChange={e => setDob(e.target.value)} />
                </div>
                <div className="field">
                  <label className="label">Giới tính</label>
                  <select className="input" value={gender} onChange={e => setGender(e.target.value)}>
                    <option value="">Chưa xác định</option>
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                    <option value="Khác">Khác</option>
                  </select>
                </div>
              </div>

              <div className="field" style={{ marginBottom: "1.5rem" }}>
                <label className="label">Địa chỉ</label>
                <input className="input" value={address} onChange={e => setAddress(e.target.value)} />
              </div>

              {profileMsg && <p style={{ color: profileMsg.ok ? "var(--success)" : "var(--danger)", marginBottom: "1rem" }}>{profileMsg.text}</p>}
              <button type="submit" className="btn btn-primary" style={{ padding: "0.75rem 2rem", borderRadius: 4 }}>Lưu thông tin</button>
            </form>

            <form onSubmit={(e) => void changePassword(e)} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, padding: "2rem" }}>
              <h2 className="c-pd-h">Đổi mật khẩu</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 400 }}>
                <div className="field">
                  <label className="label">Mật khẩu hiện tại</label>
                  <PasswordInput className="input" value={pwdCurrent} onChange={e => setPwdCurrent(e.target.value)} required />
                </div>
                <div className="field">
                  <label className="label">Mật khẩu mới</label>
                  <PasswordInput className="input" value={pwdNew} onChange={e => setPwdNew(e.target.value)} required minLength={6} />
                </div>
                {pwdMsg && <p style={{ color: pwdMsg.ok ? "var(--success)" : "var(--danger)" }}>{pwdMsg.text}</p>}
                <button type="submit" className="btn btn-primary" style={{ padding: "0.75rem 2rem", borderRadius: 4, alignSelf: "flex-start" }}>Đổi mật khẩu</button>
              </div>
            </form>
          </div>
        )}

        {/* TAB: ORDERS */}
        {mainTab === "orders" && (
          <div key="orders">
            {summary && (
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "2rem" }}>
                <div style={{ flex: 1, minWidth: 200, background: "var(--surface2)", border: "1px solid var(--border)", padding: "1.5rem", borderRadius: 6 }}>
                  <div style={{ color: "var(--muted)", fontSize: "0.9rem", marginBottom: "0.5rem" }}>Tổng đơn hoàn thành</div>
                  <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--text)" }}>{summary.totalOrders}</div>
                </div>
                <div style={{ flex: 1, minWidth: 200, background: "var(--surface2)", border: "1px solid var(--border)", padding: "1.5rem", borderRadius: 6 }}>
                  <div style={{ color: "var(--muted)", fontSize: "0.9rem", marginBottom: "0.5rem" }}>Tổng tiền đã chi</div>
                  <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--accent)" }}>{formatVnd(summary.totalSpent)}</div>
                </div>
              </div>
            )}

            <h3 className="c-pd-h">Danh sách đơn hàng</h3>
            {orders === null ? <p className="subtle">Đang tải…</p> : orders.length === 0 ? <p className="subtle">Chưa có đơn hàng nào.</p> : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {orders.map(o => (
                  <div key={o.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", padding: "1.5rem", borderRadius: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                      <div>
                        <Link to={`/order/${o.id}/checkout`} style={{ fontWeight: 800, fontSize: "1.2rem", color: "var(--accent)", textDecoration: "none" }}>Đơn #{o.id}</Link>
                        <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.25rem" }}>{new Date(o.createdAt).toLocaleString("vi-VN")}</div>
                      </div>
                      <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.5rem" }}>
                        <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>{formatVnd(o.totalAmount)}</div>
                        <div style={{ padding: "0.25rem 0.75rem", borderRadius: 4, fontSize: "0.8rem", fontWeight: 600, background: o.status === "Delivered" || o.status === "Paid" ? "rgba(34,197,94,0.15)" : o.status === "Cancelled" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)", color: o.status === "Delivered" || o.status === "Paid" ? "#15803d" : o.status === "Cancelled" ? "#b91c1c" : "#b45309" }}>
                          {o.orderType === "Delivery" && o.deliveryStatus ? deliveryLabel(o.deliveryStatus) : translateStatus(o.status)} ({translateType(o.orderType)})
                        </div>
                        {o.orderType === "Delivery" && o.status !== "Cancelled" && (
                          <Link to={`/order/${o.id}/tracking`} className="btn btn-primary" style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem", borderRadius: 4, display: "flex", gap: "0.25rem", alignItems: "center" }}>
                            {o.deliveryStatus === "Delivered" ? "Xem chi tiết giao hàng" : "Theo dõi đơn"}
                          </Link>
                        )}
                        {o.refundStatus === "Refunded" && (
                          <div style={{ fontSize: "0.8rem", color: "#15803d", fontWeight: 600 }}>Đã hoàn {(o.refundPoints ?? 0).toLocaleString("vi-VN")} điểm</div>
                        )}
                        {o.refundStatus === "Pending" && <div style={{ fontSize: "0.8rem", color: "#b45309" }}>Quán đang xem xét hoàn tiền</div>}
                        {o.refundStatus === "Declined" && <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Không được hoàn tiền</div>}
                        {o.cancelUntil && o.refundPreview != null && (
                          <button type="button" onClick={() => cancelOrder(o.id, o.refundPreview)} className="btn btn-ghost" style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem", borderRadius: 4, display: "flex", gap: "0.25rem", alignItems: "center", color: "var(--danger)", border: "1px solid var(--danger)", marginTop: "0.25rem" }}>
                            Hủy, nhận lại {o.refundPreview.toLocaleString("vi-VN")} điểm · <CancelCountdown until={o.cancelUntil} onExpire={loadOrders} />
                          </button>
                        )}
                        {["Pending_Grace", "Confirmed"].includes(o.status) && (!o.deliveryStatus || o.deliveryStatus === "Awaiting_Confirm") && (
                          <button type="button" onClick={() => cancelOrder(o.id)} className="btn btn-ghost" style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem", borderRadius: 4, display: "flex", gap: "0.25rem", alignItems: "center", color: "var(--danger)", border: "1px solid var(--danger)", marginTop: "0.25rem" }}>
                            Hủy đơn
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                      {o.details.map((d, idx) => (
                        <span key={idx} style={{ fontSize: "0.85rem", color: "var(--text)", background: "var(--surface2)", padding: "0.25rem 0.75rem", borderRadius: 4 }}>{d.quantity}x {d.product.name}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: LỊCH SỬ ĐIỂM */}
        {mainTab === "points" && (
          <div key="points">
            <h3 className="c-pd-h">Lịch sử điểm</h3>
            {pointTxs === null ? <p className="subtle">Đang tải…</p> : pointTxs.length === 0 ? <p className="subtle">Chưa có biến động điểm.</p> : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {pointTxs.map((t) => (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", background: "var(--surface2)", border: "1px solid var(--border)", padding: "0.85rem 1.1rem", borderRadius: 6 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "var(--text)" }}>{POINT_TX_LABEL[t.type] ?? t.type}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{t.note ?? ""} · {new Date(t.createdAt).toLocaleString("vi-VN")}</div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: "1.05rem", whiteSpace: "nowrap", color: t.delta > 0 ? "#15803d" : "#b91c1c" }}>
                      {t.delta > 0 ? "+" : ""}{t.delta.toLocaleString("vi-VN")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 1: VOUCHERS */}
        {mainTab === "vouchers" && (
          <div key="vouchers">
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
              <button
                type="button" onClick={() => setVoucherSubTab("my")}
                style={{ padding: "0.5rem 1.2rem", borderRadius: 4, fontSize: "0.9rem", background: voucherSubTab === "my" ? "#f5f5f4" : "transparent", color: voucherSubTab === "my" ? "var(--text)" : "var(--muted)", border: "none", cursor: "pointer", transition: "all 0.2s" }}
              >Của tôi</button>
              <button
                type="button" onClick={() => setVoucherSubTab("public")}
                style={{ padding: "0.5rem 1.2rem", borderRadius: 4, fontSize: "0.9rem", background: voucherSubTab === "public" ? "#f5f5f4" : "transparent", color: voucherSubTab === "public" ? "var(--text)" : "var(--muted)", border: "none", cursor: "pointer", transition: "all 0.2s" }}
              >Công khai</button>
            </div>

            {voucherSubTab === "my" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {myVouchers === null && <p className="subtle">Đang tải…</p>}
                {myVouchers !== null && myVouchers.length === 0 && (
                  <div style={{ textAlign: "center", padding: "3rem", background: "var(--surface2)", borderRadius: 6 }}>
                    <p style={{ color: "var(--muted)", margin: 0 }}>Bạn chưa có voucher nào trong ví.</p>
                  </div>
                )}
                {myActive.length > 0 && myActive.map(v => (
                  <VoucherCard key={v.id} code={v.voucher.code} description={v.voucher.description} discountValue={v.voucher.discountValue} minBillValue={v.voucher.minBillValue} endDate={v.voucher.endDate} goldHourStart={v.voucher.goldHourStart} goldHourEnd={v.voucher.goldHourEnd} isPersonal />
                ))}
                {myUsedOrExpired.length > 0 && (
                  <div style={{ marginTop: "1rem", opacity: 0.8 }}>
                    <h3 style={{ fontSize: "0.9rem", color: "var(--muted)", marginBottom: "1rem" }}>Đã sử dụng / Hết hạn</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                      {myUsedOrExpired.map(v => (
                        <VoucherCard key={v.id} code={v.voucher.code} description={v.voucher.description} discountValue={v.voucher.discountValue} minBillValue={v.voucher.minBillValue} endDate={v.voucher.endDate} goldHourStart={v.voucher.goldHourStart} goldHourEnd={v.voucher.goldHourEnd} isPersonal isUsed={v.isUsed} isExpired={new Date(v.voucher.endDate) < new Date()} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {voucherSubTab === "public" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {publicVouchers === null && <p className="subtle">Đang tải…</p>}
                {publicVouchers !== null && publicVouchers.length === 0 && (
                  <div style={{ textAlign: "center", padding: "3rem", background: "var(--surface2)", borderRadius: 6 }}>
                    <p style={{ color: "var(--muted)", margin: 0 }}>Hiện chưa có mã ưu đãi công khai.</p>
                  </div>
                )}
                {(publicVouchers ?? []).map((v) => (
                  <div key={v.id}>
                    <VoucherCard code={v.code} description={v.description} discountValue={v.discountValue} minBillValue={v.minBillValue} endDate={v.endDate} goldHourStart={v.goldHourStart} goldHourEnd={v.goldHourEnd} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: REVIEW WRITE */}
        {mainTab === "reviews_write" && (
          <div key="reviews_write">
            {eligible && eligible.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem", background: "var(--surface2)", borderRadius: 6 }}>
                <p style={{ color: "var(--muted)", margin: 0 }}>Bạn không có đơn hàng nào cần đánh giá lúc này.</p>
              </div>
            ) : (
              <form onSubmit={(e) => void submitReview(e)} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, padding: "2rem" }}>
                <div className="field" style={{ marginBottom: "1.5rem" }}>
                  <label className="label" style={{ color: "var(--muted)", marginBottom: "0.5rem", display: "block" }}>Đơn hàng của bạn</label>
                  <select className="input" value={pickOrderId === "" ? "" : String(pickOrderId)} onChange={(e) => setPickOrderId(e.target.value ? Number(e.target.value) : "")} style={{ background: "var(--surface)", borderRadius: 6, border: "1px solid var(--border)", padding: "0.85rem 1rem" }}>
                    {eligible?.map((o) => (
                      <option key={o.id} value={o.id}>
                        Đơn #{o.id} · {formatVnd(o.totalAmount)} · {new Date(o.createdAt).toLocaleDateString("vi-VN")}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field" style={{ marginBottom: "1.5rem" }}>
                  <label className="label" style={{ color: "var(--muted)", marginBottom: "0.5rem", display: "block" }}>Chất lượng (1-5 Sao)</label>
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <input type="range" min={1} max={5} value={stars} onChange={(e) => setStars(Number(e.target.value))} style={{ flex: 1, accentColor: "var(--accent)" }} />
                    <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--accent)", width: 40, textAlign: "right" }}>{stars}/5</span>
                  </div>
                </div>

                <div className="field" style={{ marginBottom: "1.5rem" }}>
                  <label className="label" style={{ color: "var(--muted)", marginBottom: "0.5rem", display: "block" }}>Chia sẻ cảm nhận</label>
                  <textarea className="input" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Không gian, hương vị, phục vụ..." style={{ background: "var(--surface)", borderRadius: 6, border: "1px solid var(--border)", padding: "1rem" }} />
                </div>

                <div className="field" style={{ marginBottom: "2rem" }}>
                  <label className="label" style={{ color: "var(--muted)", marginBottom: "0.5rem", display: "block" }}>Hình ảnh đính kèm</label>
                  {!reviewImage ? (
                    <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 1.25rem", background: "var(--surface2)", border: "1px dashed var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--text)", transition: "all 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "#f5f5f4"} onMouseLeave={(e) => e.currentTarget.style.background = "#f5f5f4"}>
                      <ImagePlus size={18} /> {uploadingImage ? "Đang tải..." : "Thêm ảnh"}
                      <input type="file" accept="image/*" onChange={(e) => void handleImageUpload(e)} style={{ display: "none" }} />
                    </label>
                  ) : (
                    <div style={{ position: "relative", display: "inline-block" }}>
                      <img src={reviewImage} alt="Preview" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} />
                      <button type="button" onClick={() => setReviewImage(null)} style={{ position: "absolute", top: -8, right: -8, width: 28, height: 28, background: "var(--danger)", border: "none", borderRadius: "50%", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={14} /></button>
                    </div>
                  )}
                </div>

                {reviewErr && <p style={{ color: "var(--danger)", fontSize: "0.9rem", marginBottom: "1rem" }}>{reviewErr}</p>}
                {reviewOk && <p style={{ color: "var(--success)", fontSize: "0.9rem", marginBottom: "1rem" }}>{reviewOk}</p>}

                <button type="submit" className="btn btn-primary" style={{ padding: "1rem 2.5rem", borderRadius: 4, background: "var(--accent)", fontSize: "1.05rem" }}>Gửi đánh giá</button>
              </form>
            )}
          </div>
        )}

        {/* TAB: QUÀ CỦA TÔI (mini game) */}
        {mainTab === "gifts" && (
          <div key="gifts">
            <MyGifts />
          </div>
        )}

        {/* TAB 3: REVIEW PUBLIC */}
        {mainTab === "reviews_public" && (
          <div key="reviews_public">
            {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
            {reviews && reviews.length === 0 && <p className="subtle">Chưa có đánh giá.</p>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem" }}>
              {reviews?.map((r) => (
                <div key={r.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, padding: "1.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                    <strong style={{ fontSize: "1.05rem", color: "var(--text)" }}>{r.customer.fullName}</strong>
                    <div style={{ display: "flex", color: "var(--accent)" }}>
                      {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={16} fill={i < r.rating ? "currentColor" : "none"} opacity={i < r.rating ? 1 : 0.3} />)}
                    </div>
                  </div>
                  <p style={{ margin: "0 0 1rem", color: "var(--text)", lineHeight: 1.5 }}>{r.comment ?? "Đánh giá không có bình luận."}</p>
                  {r.imageUrl && <img src={r.imageUrl} alt="Review" style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 6, marginBottom: "1rem" }} />}
                  {r.adminReply && (
                    <div style={{ background: "rgba(146,64,14,0.05)", borderLeft: "3px solid var(--accent)", padding: "1rem", borderRadius: "0 12px 12px 0" }}>
                      <strong style={{ fontSize: "0.85rem", textTransform: "uppercase", color: "var(--accent)", display: "block", marginBottom: "0.25rem" }}>Phản hồi từ quán</strong>
                      <span style={{ fontSize: "0.95rem", color: "var(--text)" }}>{r.adminReply}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

    </div>
  );
}
