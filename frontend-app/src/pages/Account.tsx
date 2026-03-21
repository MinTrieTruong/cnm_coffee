import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { clearSession, getUser, isGuestMode, mergeSessionUser, type SessionUser } from "../lib/session";

const RANK_LABEL_VI: Record<string, string> = {
  Dong: "Đồng",
  Bac: "Bạc",
  Vang: "Vàng",
  KimCuong: "Kim cương",
};

function rankLabel(tier: string) {
  return RANK_LABEL_VI[tier] ?? tier;
}

type ReviewRow = {
  id: number;
  rating: number;
  comment: string | null;
  customer: { fullName: string };
};

type EligibleOrder = {
  id: number;
  totalAmount: number;
  createdAt: string;
  table: { name: string } | null;
};

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
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

  const refreshMe = useCallback(async () => {
    try {
      const data = await api<{ user: SessionUser }>("/api/auth/me");
      mergeSessionUser(data.user);
      setUser(data.user);
    } catch {
      /* giữ session cũ nếu lỗi mạng */
    }
  }, []);

  const loadEligible = useCallback(async () => {
    try {
      const rows = await api<EligibleOrder[]>("/api/reviews/eligible-orders");
      setEligible(rows);
      setPickOrderId((prev) => {
        if (prev !== "" && rows.some((o) => o.id === prev)) return prev;
        return rows[0]?.id ?? "";
      });
    } catch {
      setEligible([]);
    }
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
    return () => {
      c = true;
    };
  }, []);

  useEffect(() => {
    if (guest || !getUser()) return;
    void refreshMe();
    void loadEligible();
  }, [guest, refreshMe, loadEligible]);

  async function submitReview(e: FormEvent) {
    e.preventDefault();
    setReviewErr(null);
    setReviewOk(null);
    if (pickOrderId === "") {
      setReviewErr("Chọn đơn đã thanh toán để đánh giá.");
      return;
    }
    try {
      await api("/api/reviews", {
        method: "POST",
        body: JSON.stringify({
          orderId: pickOrderId,
          rating: stars,
          comment: comment.trim() || undefined,
        }),
      });
      setReviewOk("Cảm ơn bạn đã đánh giá.");
      setComment("");
      await loadEligible();
      await refreshMe();
    } catch (ex) {
      setReviewErr(ex instanceof Error ? ex.message : "Lỗi");
    }
  }

  if (guest || !user) {
    return (
      <div className="app-shell" style={{ maxWidth: 520 }}>
        <h1 className="page-title">Tài khoản</h1>
        <p className="subtle">Đăng nhập hoặc đăng ký để xem điểm tích lũy.</p>
        <Link to="/" className="btn btn-primary">
          Về trang đăng nhập
        </Link>
      </div>
    );
  }

  return (
    <div className="app-shell" style={{ maxWidth: 560 }}>
      <div className="nav-top">
        <h1 className="page-title" style={{ margin: 0 }}>
          Tài khoản
        </h1>
        <Link to="/menu" className="btn btn-ghost" style={{ padding: "0.5rem 0.85rem", fontSize: "0.9rem" }}>
          Menu
        </Link>
      </div>
      <div className="card" style={{ padding: "1.15rem" }}>
        <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{user.fullName}</div>
        <p className="subtle" style={{ margin: "0.35rem 0 0" }}>
          {user.phone} {user.email && `· ${user.email}`}
        </p>
        <p style={{ marginTop: "0.85rem" }}>
          Điểm hiện tại: <strong style={{ color: "var(--accent)" }}>{user.points}</strong> — hạng{" "}
          <strong>{rankLabel(user.rankTier)}</strong>
        </p>
        <p className="subtle" style={{ margin: "0.5rem 0 0", fontSize: "0.88rem" }}>
          1 điểm giảm được 1đ khi thanh toán (theo cấu hình cửa hàng). Hạng Đồng / Bạc / Vàng / Kim cương theo tổng chi
          tiêu đã thanh toán.
        </p>
      </div>

      <h2 style={{ fontSize: "1.05rem", margin: "1.25rem 0 0.65rem" }}>Đánh giá đơn đã mua</h2>
      {eligible && eligible.length === 0 && (
        <p className="subtle">Không có đơn nào chờ đánh giá (chỉ đơn đã thanh toán, mỗi đơn một lần).</p>
      )}
      {eligible && eligible.length > 0 && (
        <form className="card" style={{ padding: "1rem" }} onSubmit={(e) => void submitReview(e)}>
          <div className="field">
            <label className="label">Chọn đơn</label>
            <select
              className="input"
              value={pickOrderId === "" ? "" : String(pickOrderId)}
              onChange={(e) => setPickOrderId(e.target.value ? Number(e.target.value) : "")}
            >
              {eligible.map((o) => (
                <option key={o.id} value={o.id}>
                  #{o.id} · {formatVnd(o.totalAmount)}
                  {o.table ? ` · ${o.table.name}` : " · Mang về"}
                  {" · "}
                  {new Date(o.createdAt).toLocaleString("vi-VN")}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Số sao (1–5)</label>
            <input
              className="input"
              type="range"
              min={1}
              max={5}
              value={stars}
              onChange={(e) => setStars(Number(e.target.value))}
            />
            <span style={{ marginLeft: "0.5rem" }}>{stars} ⭐</span>
          </div>
          <div className="field">
            <label className="label">Nội dung (tùy chọn)</label>
            <textarea
              className="input"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Trải nghiệm món, phục vụ, không gian…"
            />
          </div>
          {reviewErr && <p style={{ color: "var(--danger)", fontSize: "0.9rem" }}>{reviewErr}</p>}
          {reviewOk && <p style={{ color: "var(--accent)", fontSize: "0.9rem" }}>{reviewOk}</p>}
          <button type="submit" className="btn btn-primary">
            Gửi đánh giá
          </button>
        </form>
      )}

      <h2 style={{ fontSize: "1.05rem", margin: "1.25rem 0 0.65rem" }}>Đánh giá gần đây (công khai)</h2>
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
      {reviews && reviews.length === 0 && <p className="subtle">Chưa có đánh giá.</p>}
      {reviews &&
        reviews.map((r) => (
          <div key={r.id} className="card" style={{ padding: "0.75rem 1rem", marginBottom: "0.5rem" }}>
            ⭐ {r.rating} — {r.customer.fullName}
            <div style={{ fontSize: "0.9rem", marginTop: "0.25rem" }}>{r.comment ?? "—"}</div>
          </div>
        ))}
      <p style={{ marginTop: "1.25rem" }}>
        <Link
          to="/"
          onClick={() => clearSession()}
          style={{ color: "var(--muted)", fontSize: "0.9rem" }}
        >
          Đăng xuất
        </Link>
      </p>
    </div>
  );
}
