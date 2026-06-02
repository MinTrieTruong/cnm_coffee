import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { getUser, isGuestMode, mergeSessionUser, type SessionUser } from "../lib/session";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, User, Star, Award, Ticket, MessageSquare, ImagePlus, X } from "lucide-react";

const RANK_LABEL_VI: Record<string, string> = {
  Dong: "Đồng", Bac: "Bạc", Vang: "Vàng", KimCuong: "Kim cương",
};

function rankLabel(tier: string) {
  return RANK_LABEL_VI[tier] ?? tier;
}

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

type ReviewRow = { id: number; rating: number; comment: string | null; imageUrl: string | null; adminReply: string | null; customer: { fullName: string }; };
type EligibleOrder = { id: number; totalAmount: number; createdAt: string; table: { name: string } | null; };
type PublicVoucher = { id: number; code: string; description: string | null; discountValue: number; minBillValue: number; endDate: string; quantity: number; usedCount: number; goldHourStart: number | null; goldHourEnd: number | null; };
type MyVoucher = { id: number; isUsed: boolean; claimedAt: string; usedAt: string | null; voucher: { id: number; code: string; description: string | null; discountValue: number; minBillValue: number; endDate: string; isActive: boolean; goldHourStart: number | null; goldHourEnd: number | null; }; };

function VoucherCard({
  code, description, discountValue, minBillValue, endDate,
  goldHourStart, goldHourEnd, isUsed = false, isPersonal = false, isExpired = false,
}: any) {
  const expired = isExpired || new Date(endDate) < new Date();
  const dim = isUsed || expired;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      style={{
        borderRadius: 16, padding: "1.25rem",
        background: dim ? "rgba(255,255,255,0.02)" : "linear-gradient(135deg, rgba(201,162,39,0.1) 0%, rgba(201,162,39,0.02) 100%)",
        border: `1px solid ${dim ? "rgba(255,255,255,0.05)" : "rgba(201,162,39,0.2)"}`,
        opacity: dim ? 0.6 : 1, position: "relative", overflow: "hidden",
        boxShadow: dim ? "none" : "0 10px 20px rgba(0,0,0,0.2)"
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: dim ? "rgba(255,255,255,0.1)" : "var(--accent)" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.1rem", letterSpacing: "0.05em", color: dim ? "var(--muted)" : "var(--accent)" }}>
              {code}
            </span>
            {isPersonal && <span style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", background: "rgba(99,102,241,0.15)", color: "#818cf8", borderRadius: 999, padding: "0.15rem 0.5rem" }}>Cá nhân</span>}
            {isUsed && <span style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", background: "rgba(255,255,255,0.1)", color: "var(--muted)", borderRadius: 999, padding: "0.15rem 0.5rem" }}>Đã dùng</span>}
            {expired && !isUsed && <span style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", background: "rgba(220,38,38,0.15)", color: "#f87171", borderRadius: 999, padding: "0.15rem 0.5rem" }}>Hết hạn</span>}
          </div>
          {description && <p style={{ margin: "0 0 0.5rem", fontSize: "0.9rem", color: "rgba(245,235,227,0.7)" }}>{description}</p>}
          <div style={{ fontSize: "0.8rem", color: "var(--muted)", display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
            {minBillValue > 0 && <span>Tối thiểu: {formatVnd(minBillValue)}</span>}
            {goldHourStart != null && goldHourEnd != null && <span>⏰ {goldHourStart}h – {goldHourEnd}h</span>}
            <span>HSD: {new Date(endDate).toLocaleDateString("vi-VN")}</span>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: "1.35rem", color: dim ? "var(--muted)" : "#22c55e" }}>
            −{formatVnd(discountValue)}
          </div>
        </div>
      </div>
    </motion.div>
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
  
  // Dashboard Tabs
  const [mainTab, setMainTab] = useState<"vouchers" | "reviews_write" | "reviews_public">("vouchers");
  const [voucherSubTab, setVoucherSubTab] = useState<"my" | "public">("my");

  const refreshMe = useCallback(async () => {
    try {
      const data = await api<{ user: SessionUser }>("/api/auth/me");
      mergeSessionUser(data.user);
      setUser(data.user);
    } catch { }
  }, []);

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
  }, [guest, refreshMe, loadEligible, loadVouchers]);

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
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="site-page" style={{ maxWidth: 520, textAlign: "center", paddingTop: "4rem" }}>
        <User size={48} color="rgba(255,255,255,0.2)" style={{ margin: "0 auto 1rem" }} />
        <h1 className="page-title" style={{ color: "var(--accent)" }}>Tài khoản</h1>
        <p className="subtle" style={{ marginBottom: "2rem" }}>Đăng nhập hoặc đăng ký để xem điểm tích lũy và ưu đãi.</p>
        <Link to="/" className="btn btn-primary" style={{ borderRadius: 999, padding: "0.85rem 2.5rem" }}>Đăng nhập ngay</Link>
      </motion.div>
    );
  }

  const myActive = (myVouchers ?? []).filter((v) => !v.isUsed && v.voucher.isActive && new Date(v.voucher.endDate) >= new Date());
  const myUsedOrExpired = (myVouchers ?? []).filter((v) => v.isUsed || !v.voucher.isActive || new Date(v.voucher.endDate) < new Date());

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      className="site-page" style={{ maxWidth: 800, padding: "1.5rem" }}
    >
      <div style={{ marginBottom: "2rem", display: "flex", alignItems: "center", gap: "1rem" }}>
        <Link to="/menu" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", color: "var(--muted)", textDecoration: "none", fontSize: "0.95rem", fontWeight: 500, transition: "color 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.color = "var(--text)"} onMouseLeave={(e) => e.currentTarget.style.color = "var(--muted)"}>
          <ArrowLeft size={18} /> Menu
        </Link>
        <h1 className="page-title" style={{ margin: 0, fontSize: "1.75rem", color: "var(--text)" }}>Tài khoản cá nhân</h1>
      </div>

      {/* MEMBERSHIP CARD */}
      <div style={{
        position: "relative", padding: "2rem", borderRadius: 24, overflow: "hidden",
        background: "linear-gradient(135deg, rgba(201,162,39,0.2) 0%, rgba(201,162,39,0.05) 100%)",
        border: "1px solid rgba(201,162,39,0.3)", boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
        backdropFilter: "blur(20px)", marginBottom: "2.5rem"
      }}>
        {/* Glow effects */}
        <div style={{ position: "absolute", top: "-50%", left: "-20%", width: "100%", height: "200%", background: "radial-gradient(ellipse at center, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 70%)", transform: "rotate(30deg)", pointerEvents: "none" }} />
        
        <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1.5rem" }}>
          <div>
            <h2 style={{ margin: "0 0 0.5rem", fontFamily: "var(--font-display)", fontSize: "1.8rem", color: "var(--text)", textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>{user.fullName}</h2>
            <p style={{ margin: 0, color: "rgba(245,235,227,0.8)", fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {user.phone} {user.email && `· ${user.email}`}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(245,235,227,0.7)", marginBottom: "0.25rem" }}>Hạng thành viên</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.5rem" }}>
              <Award size={24} /> {rankLabel(user.rankTier)}
            </div>
          </div>
        </div>
        <div style={{ position: "relative", zIndex: 1, marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(245,235,227,0.7)", marginBottom: "0.25rem" }}>Điểm tích luỹ</div>
            <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>{user.points}</div>
          </div>
          <div style={{ fontSize: "0.85rem", color: "rgba(245,235,227,0.5)" }}>1 điểm = 1 VNĐ</div>
        </div>
      </div>

      {/* DASHBOARD TABS */}
      <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "1rem", marginBottom: "2rem" }} className="hide-scroll">
        {[
          { id: "vouchers", label: "Ví Voucher", icon: Ticket },
          { id: "reviews_write", label: "Đánh giá đơn hàng", icon: Star },
          { id: "reviews_public", label: "Xem nhận xét chung", icon: MessageSquare },
        ].map(t => (
          <button
            key={t.id} type="button" onClick={() => setMainTab(t.id as any)}
            style={{
              display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0,
              padding: "0.75rem 1.25rem", borderRadius: 999, fontSize: "0.95rem",
              background: mainTab === t.id ? "rgba(201,162,39,0.15)" : "transparent",
              color: mainTab === t.id ? "var(--accent)" : "rgba(245,235,227,0.6)",
              border: `1px solid ${mainTab === t.id ? "rgba(201,162,39,0.3)" : "transparent"}`,
              transition: "all 0.2s", cursor: "pointer"
            }}
          >
            <t.icon size={18} /> {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* TAB 1: VOUCHERS */}
        {mainTab === "vouchers" && (
          <motion.div key="vouchers" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
              <button
                type="button" onClick={() => setVoucherSubTab("my")}
                style={{ padding: "0.5rem 1.2rem", borderRadius: 999, fontSize: "0.9rem", background: voucherSubTab === "my" ? "rgba(255,255,255,0.1)" : "transparent", color: voucherSubTab === "my" ? "var(--text)" : "var(--muted)", border: "none", cursor: "pointer", transition: "all 0.2s" }}
              >Của tôi</button>
              <button
                type="button" onClick={() => setVoucherSubTab("public")}
                style={{ padding: "0.5rem 1.2rem", borderRadius: 999, fontSize: "0.9rem", background: voucherSubTab === "public" ? "rgba(255,255,255,0.1)" : "transparent", color: voucherSubTab === "public" ? "var(--text)" : "var(--muted)", border: "none", cursor: "pointer", transition: "all 0.2s" }}
              >Công khai</button>
            </div>

            {voucherSubTab === "my" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {myVouchers === null && <p className="subtle">Đang tải…</p>}
                {myVouchers !== null && myVouchers.length === 0 && (
                  <div style={{ textAlign: "center", padding: "3rem", background: "rgba(255,255,255,0.02)", borderRadius: 20 }}>
                    <Ticket size={40} color="rgba(255,255,255,0.1)" style={{ margin: "0 auto 1rem" }} />
                    <p style={{ color: "rgba(245,235,227,0.5)", margin: 0 }}>Bạn chưa có voucher nào trong ví.</p>
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
                  <div style={{ textAlign: "center", padding: "3rem", background: "rgba(255,255,255,0.02)", borderRadius: 20 }}>
                    <p style={{ color: "rgba(245,235,227,0.5)", margin: 0 }}>Hiện chưa có mã ưu đãi công khai.</p>
                  </div>
                )}
                {(publicVouchers ?? []).map((v) => (
                  <div key={v.id}>
                    <VoucherCard code={v.code} description={v.description} discountValue={v.discountValue} minBillValue={v.minBillValue} endDate={v.endDate} goldHourStart={v.goldHourStart} goldHourEnd={v.goldHourEnd} />
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* TAB 2: REVIEW WRITE */}
        {mainTab === "reviews_write" && (
          <motion.div key="reviews_write" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {eligible && eligible.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem", background: "rgba(255,255,255,0.02)", borderRadius: 20 }}>
                <Star size={40} color="rgba(255,255,255,0.1)" style={{ margin: "0 auto 1rem" }} />
                <p style={{ color: "rgba(245,235,227,0.5)", margin: 0 }}>Bạn không có đơn hàng nào cần đánh giá lúc này.</p>
              </div>
            ) : (
              <form onSubmit={(e) => void submitReview(e)} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 24, padding: "2rem" }}>
                <div className="field" style={{ marginBottom: "1.5rem" }}>
                  <label className="label" style={{ color: "var(--muted)", marginBottom: "0.5rem", display: "block" }}>Đơn hàng của bạn</label>
                  <select className="input" value={pickOrderId === "" ? "" : String(pickOrderId)} onChange={(e) => setPickOrderId(e.target.value ? Number(e.target.value) : "")} style={{ background: "rgba(0,0,0,0.3)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", padding: "0.85rem 1rem" }}>
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
                    <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--accent)", width: 40, textAlign: "right" }}>{stars} ⭐</span>
                  </div>
                </div>

                <div className="field" style={{ marginBottom: "1.5rem" }}>
                  <label className="label" style={{ color: "var(--muted)", marginBottom: "0.5rem", display: "block" }}>Chia sẻ cảm nhận</label>
                  <textarea className="input" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Không gian, hương vị, phục vụ..." style={{ background: "rgba(0,0,0,0.3)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", padding: "1rem" }} />
                </div>

                <div className="field" style={{ marginBottom: "2rem" }}>
                  <label className="label" style={{ color: "var(--muted)", marginBottom: "0.5rem", display: "block" }}>Hình ảnh đính kèm</label>
                  {!reviewImage ? (
                    <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 1.25rem", background: "rgba(255,255,255,0.05)", border: "1px dashed rgba(255,255,255,0.2)", borderRadius: 12, cursor: "pointer", color: "var(--text)", transition: "all 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background="rgba(255,255,255,0.08)"} onMouseLeave={(e) => e.currentTarget.style.background="rgba(255,255,255,0.05)"}>
                      <ImagePlus size={18} /> {uploadingImage ? "Đang tải..." : "Thêm ảnh"}
                      <input type="file" accept="image/*" onChange={(e) => void handleImageUpload(e)} style={{ display: "none" }} />
                    </label>
                  ) : (
                    <div style={{ position: "relative", display: "inline-block" }}>
                      <img src={reviewImage} alt="Preview" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)" }} />
                      <button type="button" onClick={() => setReviewImage(null)} style={{ position: "absolute", top: -8, right: -8, width: 28, height: 28, background: "var(--danger)", border: "none", borderRadius: "50%", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={14} /></button>
                    </div>
                  )}
                </div>

                {reviewErr && <p style={{ color: "var(--danger)", fontSize: "0.9rem", marginBottom: "1rem" }}>{reviewErr}</p>}
                {reviewOk && <p style={{ color: "var(--success)", fontSize: "0.9rem", marginBottom: "1rem" }}>{reviewOk}</p>}

                <button type="submit" className="btn btn-primary" style={{ padding: "1rem 2.5rem", borderRadius: 999, background: "linear-gradient(135deg, #e8b84a 0%, var(--accent) 100%)", fontSize: "1.05rem" }}>Gửi đánh giá</button>
              </form>
            )}
          </motion.div>
        )}

        {/* TAB 3: REVIEW PUBLIC */}
        {mainTab === "reviews_public" && (
          <motion.div key="reviews_public" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
            {reviews && reviews.length === 0 && <p className="subtle">Chưa có đánh giá.</p>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem" }}>
              {reviews?.map((r) => (
                <div key={r.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 20, padding: "1.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                    <strong style={{ fontSize: "1.05rem", color: "var(--text)" }}>{r.customer.fullName}</strong>
                    <div style={{ display: "flex", color: "var(--accent)" }}>
                      {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={16} fill={i < r.rating ? "currentColor" : "none"} opacity={i < r.rating ? 1 : 0.3} />)}
                    </div>
                  </div>
                  <p style={{ margin: "0 0 1rem", color: "rgba(245,235,227,0.8)", lineHeight: 1.5 }}>{r.comment ?? "Đánh giá không có bình luận."}</p>
                  {r.imageUrl && <img src={r.imageUrl} alt="Review" style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 12, marginBottom: "1rem" }} />}
                  {r.adminReply && (
                    <div style={{ background: "rgba(201,162,39,0.05)", borderLeft: "3px solid var(--accent)", padding: "1rem", borderRadius: "0 12px 12px 0" }}>
                      <strong style={{ fontSize: "0.85rem", textTransform: "uppercase", color: "var(--accent)", display: "block", marginBottom: "0.25rem" }}>Phản hồi từ quán</strong>
                      <span style={{ fontSize: "0.95rem", color: "rgba(245,235,227,0.8)" }}>{r.adminReply}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
