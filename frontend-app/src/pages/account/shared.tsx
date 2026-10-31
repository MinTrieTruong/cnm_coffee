import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { getUser, isGuestMode, mergeSessionUser, type SessionUser } from "../../lib/session";
import { useLang } from "../../lib/i18n";

/* ── Mục của trang tài khoản (route con /account/:section, dùng chung máy tính + điện thoại) ── */
export type Section = "profile" | "security" | "orders" | "reviews" | "points" | "vouchers" | "gifts" | "feedback";
export const SECTIONS: { group: string; items: { id: Section; label: string }[] }[] = [
  { group: "Tài khoản", items: [{ id: "profile", label: "Thông tin cá nhân" }, { id: "security", label: "Bảo mật" }] },
  { group: "Mua hàng", items: [{ id: "orders", label: "Đơn hàng" }, { id: "reviews", label: "Đánh giá đơn" }] },
  { group: "Ưu đãi#account", items: [{ id: "points", label: "Lịch sử điểm" }, { id: "vouchers", label: "Ví voucher" }, { id: "gifts", label: "Quà của tôi" }] },
  { group: "Khác", items: [{ id: "feedback", label: "Nhận xét chung" }] },
];
export const ALL_SECTIONS = SECTIONS.flatMap((g) => g.items.map((i) => i.id));
export const sectionLabel = (s: Section) => SECTIONS.flatMap((g) => g.items).find((i) => i.id === s)!.label;
/** Link cũ /account?tab=… → route con */
export const LEGACY_TAB: Record<string, Section> = {
  profile: "profile", orders: "orders", points: "points", vouchers: "vouchers", gifts: "gifts",
  reviews_write: "reviews", reviews_public: "feedback", security: "security",
};

/* ── Hạng thành viên: theo tổng chi tiêu đơn đã thanh toán (backend lib/rank.ts) ── */
export const RANKS: { id: string; label: string; min: number }[] = [
  { id: "Dong", label: "Đồng", min: 0 },
  { id: "Bac", label: "Bạc", min: 5_000_000 },
  { id: "Vang", label: "Vàng", min: 20_000_000 },
  { id: "KimCuong", label: "Kim cương", min: 50_000_000 },
];
export const rankLabel = (tier: string) => RANKS.find((r) => r.id === tier)?.label ?? tier;
/** Tiến độ lên hạng kế tiếp; null khi đã hạng cao nhất hoặc chưa có dữ liệu chi tiêu */
export function rankProgress(tier: string, spent: number | null) {
  if (spent == null) return null;
  const i = RANKS.findIndex((r) => r.id === tier);
  const next = RANKS[i + 1];
  if (i < 0 || !next) return null;
  const cur = RANKS[i].min;
  return { next: next.label, remain: Math.max(0, next.min - spent), pct: Math.min(100, Math.max(0, ((spent - cur) / (next.min - cur)) * 100)) };
}

/* ── Kiểu dữ liệu ── */
export type CustomerOrder = {
  id: number; createdAt: string; totalAmount: number; status: string; orderType: string; deliveryStatus?: string | null;
  details: { quantity: number; product: { name: string } }[];
  /** Đơn giao đã trả: hạn tự hủy (null = hết hạn / không áp dụng) và số điểm sẽ nhận lại */
  cancelUntil?: string | null; refundPreview?: number | null;
  refundStatus?: string | null; refundPoints?: number;
};
export type PublicVoucher = { id: number; code: string; description: string | null; discountValue: number; minBillValue: number; endDate: string; goldHourStart: number | null; goldHourEnd: number | null };
export type MyVoucher = { id: number; isUsed: boolean; claimedAt: string; usedAt: string | null; voucher: PublicVoucher & { isActive: boolean } };
type GamesMe = { plays: { giftClaim: { status: string; expiresAt: string } | null }[] };

/** Đơn còn đang xử lý (chưa xong, chưa hủy) — ô truy cập nhanh trên điện thoại */
export const isOpenOrder = (o: CustomerOrder) =>
  !["Cancelled", "Failed"].includes(o.status) && !(o.orderType === "Delivery" ? o.deliveryStatus === "Delivered" || o.deliveryStatus === "Rejected" : o.status === "Paid");
export const voucherActive = (v: MyVoucher) => !v.isUsed && v.voucher.isActive && new Date(v.voucher.endDate) >= new Date();

/** Tải dữ liệu tài khoản dùng chung cho thẻ tóm tắt, menu (badge) và các mục */
export function useAccountData() {
  const [user, setUser] = useState<SessionUser | null>(() => getUser());
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);
  const [spent, setSpent] = useState<number | null>(null);
  const [myVouchers, setMyVouchers] = useState<MyVoucher[] | null>(null);
  const [giftsWaiting, setGiftsWaiting] = useState(0);
  const loggedIn = !isGuestMode() && !!user;

  const refreshMe = useCallback(async () => {
    try {
      const data = await api<{ user: SessionUser }>("/api/auth/me");
      mergeSessionUser(data.user);
      setUser(data.user);
    } catch {
      /* giữ thông tin phiên cũ */
    }
  }, []);
  const loadOrders = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([api<CustomerOrder[]>("/api/customer/orders"), api<{ totalSpent: number }>("/api/customer/summary")]);
      setOrders(o);
      setSpent(s.totalSpent);
    } catch {
      setOrders((x) => x ?? []);
    }
  }, []);
  const loadVouchers = useCallback(async () => {
    setMyVouchers(await api<MyVoucher[]>("/api/vouchers/my").catch(() => [] as MyVoucher[]));
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    void refreshMe();
    void loadOrders();
    void loadVouchers();
    api<GamesMe>("/api/games/me")
      .then((d) => setGiftsWaiting(d.plays.filter((p) => p.giftClaim?.status === "WAITING" && +new Date(p.giftClaim.expiresAt) > Date.now()).length))
      .catch(() => undefined);
  }, [loggedIn, refreshMe, loadOrders, loadVouchers]);

  return {
    user, loggedIn, orders, spent, myVouchers, giftsWaiting, refreshMe, loadOrders, loadVouchers,
    counts: {
      openOrders: (orders ?? []).filter(isOpenOrder).length,
      vouchers: (myVouchers ?? []).filter(voucherActive).length,
      gifts: giftsWaiting,
    },
  };
}
export type AccountData = ReturnType<typeof useAccountData>;

/* ── Phân trang 10 dòng ── */
export const PAGE = 10;
export function usePaged<T>(rows: T[] | null, size = PAGE) {
  const [page, setPage] = useState(1);
  const total = rows ? Math.max(1, Math.ceil(rows.length / size)) : 1;
  useEffect(() => {
    if (page > total) setPage(total);
  }, [page, total]);
  return { page, setPage, total, rows: (rows ?? []).slice((page - 1) * size, page * size) };
}
export function Pager({ page, total, setPage }: { page: number; total: number; setPage: (p: number) => void }) {
  const { t } = useLang();
  if (total <= 1) return null;
  return (
    <nav className="c-pager" aria-label={t("Phân trang")}>
      <button type="button" className="c-btn is-outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ {t("Trước")}</button>
      <span>{t("Trang {a}/{b}", { a: page, b: total })}</span>
      <button type="button" className="c-btn is-outline" disabled={page >= total} onClick={() => setPage(page + 1)}>{t("Sau")} ›</button>
    </nav>
  );
}

/** Đọc file ảnh thành data URL (≤ 2MB) */
export function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 2 * 1024 * 1024) return reject(new Error("Ảnh quá lớn (tối đa 2MB)."));
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Không đọc được ảnh."));
    r.readAsDataURL(file);
  });
}

/** Khớp màn hình điện thoại (< 768px) — điện thoại dùng kiểu trang hub + trang con */
export function useIsPhone() {
  const q = "(max-width: 767px)";
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
}
