import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Ticket, Clock, Tag, ChevronRight, Gift, Zap } from "lucide-react";

type Voucher = {
  id: number;
  code: string;
  description: string | null;
  discountValue: number;
  minBillValue: number;
  startDate: string;
  endDate: string;
  quantity: number;
  usedCount: number;
  isActive: boolean;
  voucherType: string;
  goldHourStart: number | null;
  goldHourEnd: number | null;
};

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function getRemainingDays(endDate: string): number {
  const diff = new Date(endDate).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function VoucherCard({ v }: { v: Voucher }) {
  const remaining = v.quantity - v.usedCount;
  const daysLeft = getRemainingDays(v.endDate);
  const isGoldHour = v.goldHourStart != null && v.goldHourEnd != null;
  const pct = Math.round((v.usedCount / v.quantity) * 100);

  const [copied, setCopied] = useState(false);
  function copyCode() {
    void navigator.clipboard.writeText(v.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div
      className="promo-card"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 20,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.3s ease",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-6px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-lg)"; (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(201,162,39,0.5)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 12px 32px rgba(0,0,0,.15)"; (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"; }}
    >
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)", padding: "1.5rem", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -20, right: -20, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.1)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          {isGoldHour ? <Zap size={22} color="#fff" /> : <Ticket size={22} color="#fff" />}
          <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {isGoldHour ? "Giờ Vàng" : v.voucherType === "public" ? "Công khai" : "Đặc biệt"}
          </span>
        </div>
        <div style={{ color: "#fff", fontSize: "2rem", fontWeight: 800, lineHeight: 1 }}>
          -{formatVnd(v.discountValue)}
        </div>
        {v.minBillValue > 0 && (
          <div style={{ color: "rgba(255,255,255,.9)", fontSize: "0.82rem", marginTop: 4 }}>
            Đơn tối thiểu {formatVnd(v.minBillValue)}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "1.25rem", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
        {v.description && (
          <p style={{ color: "var(--text)", fontSize: "0.9rem", margin: 0, lineHeight: 1.5 }}>{v.description}</p>
        )}

        {isGoldHour && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--accent)", fontSize: "0.85rem", fontWeight: 600 }}>
            <Clock size={14} />
            Áp dụng {v.goldHourStart}:00 – {v.goldHourEnd}:00
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: "var(--muted)" }}>
          <Tag size={13} />
          HSD: {formatDate(v.endDate)}
          {daysLeft <= 7 && daysLeft > 0 && (
            <span style={{ marginLeft: 4, background: "#fee2e2", color: "#dc2626", padding: "1px 7px", borderRadius: 20, fontSize: "0.75rem", fontWeight: 600 }}>
              Còn {daysLeft} ngày
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--muted)", marginBottom: 4 }}>
            <span>Đã dùng {v.usedCount}/{v.quantity}</span>
            <span>{remaining} còn lại</span>
          </div>
          <div style={{ height: 6, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: pct > 80 ? "#ef4444" : "var(--accent)", borderRadius: 99, transition: "width .6s" }} />
          </div>
        </div>

        {/* Code */}
        <button
          type="button"
          onClick={copyCode}
          style={{
            marginTop: "auto",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            border: "2px dashed var(--accent)", borderRadius: 10,
            background: "transparent", padding: "0.6rem 1rem",
            cursor: "pointer", color: "var(--accent)", fontWeight: 700,
            fontSize: "1rem", letterSpacing: "0.08em",
            transition: "background .15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(201,162,39,.08)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          <Gift size={16} />
          {copied ? "Đã sao chép!" : v.code}
        </button>
      </div>
    </div>
  );
}

export function Promotions() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Voucher[]>("/api/vouchers/public")
      .then((data) => setVouchers(data.filter((v) => v.isActive && new Date(v.endDate) > new Date())))
      .catch((e) => setErr(e instanceof Error ? e.message : "Không tải được khuyến mãi"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ width: "100%" }}>
      {/* Hero */}
      <div style={{
        position: "relative",
        padding: "6rem 1.5rem 5.5rem",
        textAlign: "center",
        marginBottom: "3.5rem",
        borderBottom: "1px solid var(--border)",
        backgroundImage: "url('https://images.unsplash.com/photo-1445116572660-236099ce83f0?auto=format&fit=crop&q=80&w=1920')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(28,25,23,0.55) 0%, rgba(28,25,23,0.75) 100%)", zIndex: 0 }} />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 800, margin: "0 auto" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.95)", borderRadius: 99, padding: "6px 20px", marginBottom: 20 }}>
            <Ticket size={16} color="var(--accent)" />
            <span style={{ color: "var(--accent)", fontSize: "0.85rem", fontWeight: 700, letterSpacing: "0.08em" }}>CHƯƠNG TRÌNH ƯU ĐÃI</span>
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.5rem, 6vw, 4rem)", color: "#fff", margin: "0 0 1rem", lineHeight: 1.2 }}>
            Khuyến mãi & Ưu đãi
          </h1>
          <p style={{ color: "rgba(255,255,255,0.92)", fontSize: "1.1rem", margin: "0 auto", lineHeight: 1.6 }}>
            Tiết kiệm hơn với các mã giảm giá độc quyền từ TD Coffee. Áp dụng khi đặt món trực tuyến.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 1.5rem 4rem" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "4rem 0" }}>
            <div className="hp-loader" />
            <p className="subtle" style={{ marginTop: 12 }}>Đang tải khuyến mãi…</p>
          </div>
        )}

        {err && (
          <div style={{ textAlign: "center", padding: "4rem 0", color: "var(--danger)" }}>
            <p>{err}</p>
          </div>
        )}

        {!loading && !err && vouchers.length === 0 && (
          <div style={{ textAlign: "center", padding: "5rem 0" }}>
            <Ticket size={48} color="var(--muted)" style={{ marginBottom: 16, opacity: .4 }} />
            <p style={{ color: "var(--muted)", fontSize: "1.05rem" }}>Hiện chưa có khuyến mãi nào đang hoạt động.</p>
            <Link to="/menu" style={{ color: "var(--accent)", marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
              Xem thực đơn <ChevronRight size={16} />
            </Link>
          </div>
        )}

        {!loading && vouchers.length > 0 && (
          <>
            <p style={{ color: "var(--muted)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
              {vouchers.length} ưu đãi đang hoạt động
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: "1.5rem" }}>
              {vouchers.map((v) => <VoucherCard key={v.id} v={v} />)}
            </div>
          </>
        )}

        <div style={{ marginTop: "3rem", textAlign: "center", paddingTop: "2rem", borderTop: "1px solid var(--border)" }}>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
            Mã voucher áp dụng khi thanh toán tại bước <strong>xác nhận đơn hàng</strong>.
            Mỗi tài khoản chỉ sử dụng 1 lần / mã.
          </p>
          <Link to="/menu" className="hp-hero-btn hp-hero-btn--primary" style={{ marginTop: 16, display: "inline-flex" }}>
            Đặt món ngay <ChevronRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
