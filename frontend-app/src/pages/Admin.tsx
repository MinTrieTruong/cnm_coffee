import { useCallback, useEffect, useState, type FormEvent, type JSX } from "react";

import { Link, Navigate } from "react-router-dom";
import { LogoMark } from "../components/LogoMark";
import { mediaUrl } from "../lib/api";
import { clearStaffSession, getStaffInfo, staffApi, staffDownloadBlob, staffUploadImage } from "../lib/staffApi";
import { PostEditor } from "../components/PostEditor";
import { PostViewModal, type PostPreview } from "../components/PostViewModal";
import { AdminStoreSettings } from "../components/AdminStoreSettings";

type ProductRow = {
  id: number;
  name: string;
  sku: string | null;
  sellPrice: number;
  costPrice: number;
  categoryId: number;
  isActive: boolean;
  outOfStock: boolean;
  imageUrl: string | null;
  category?: { name: string };
};

type InvRow = {
  id: number;
  name: string;
  skuCode: string | null;
  unit: string | null;
  stockQty: number;
  minLevel: number;
  supplier: string | null;
  imageUrl: string | null;
};

type ReviewAdminRow = {
  id: number;
  rating: number;
  comment: string | null;
  adminReply: string | null;
  hidden: boolean;
  createdAt: string;
  customer: { fullName: string; phone: string | null };
  order: { id: number; totalAmount: number };
  replyBy: { fullName: string } | null;
};

type Tab =
  | "dash"
  | "products"
  | "categories"
  | "staff"
  | "customers"
  | "tables"
  | "inventory"
  | "requests"
  | "reviews"
  | "settings"
  | "reports"
  | "suppliers"
  | "audit"
  | "profit"
  | "vouchers"
  | "posts";

type Stats = {
  todayOrders: number;
  todayRevenue: number;
  weekOrders: number;
  weekRevenue: number;
  monthOrders: number;
  monthRevenue: number;
  products: number;
  tables: number;
  staff: number;
  pendingRequests: number;
};

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

export function Admin() {
  const info = getStaffInfo();
  const [tab, setTab] = useState<Tab>("dash");
  const [siderOpen, setSiderOpen] = useState(false);
  const closeTab = (t: Tab) => { setTab(t); setSiderOpen(false); }
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<Array<{ id: number; name: string; sortOrder: number }>>([]);
  const [staffRows, setStaffRows] = useState<
    Array<{
      id: number;
      username: string | null;
      fullName: string;
      role: string;
      status: string;
      phone: string | null;
      address: string | null;
      dob: string | null;
      hireDate: string;
      hasFaceData?: boolean;
    }>
  >([]);
  const [customerRows, setCustomerRows] = useState<
    Array<{
      id: number;
      fullName: string;
      phone: string | null;
      email: string | null;
      address: string | null;
      dob: string | null;
      points: number;
      rankTier: string;
      createdAt: string;
      lastLogin: string | null;
    }>
  >([]);
  const [tables, setTables] = useState<Array<{ id: number; name: string; status: string; location: string | null }>>([]);
  const [inventory, setInventory] = useState<InvRow[]>([]);
  const [requests, setRequests] = useState<
    Array<{
      id: number;
      type: string;
      status: string;
      requestQty: number;
      note: string | null;
      createdAt: string;
      approvedAt: string | null;
      item: { name: string; unit: string | null };
      staff: { fullName: string };
      approvedBy: { fullName: string } | null;
    }>
  >([]);
  const [reviews, setReviews] = useState<ReviewAdminRow[]>([]);
  const [settings, setSettings] = useState<{
    vatRatePercent: number;
    pointPerVnd: number;
    pointValueVnd: number;
    cashRoundTo: number;
    pointEarnEveryVnd?: number;
    pointEarnEach?: number;
    storeLat?: number | null;
    storeLng?: number | null;
    storeAddress?: string | null;
    allowedRadius?: number;
    faceMatchThreshold?: number;
  } | null>(null);
  const [revenueReport, setRevenueReport] = useState<{ total: number; pointsRedeemTotal: number; grandTotal: number; byDay: Record<string, { cash: number; points: number }> } | null>(null);
  const [topProducts, setTopProducts] = useState<Array<{ name: string; quantity: number; revenue: number }>>([]);
  const [repColDay, setRepColDay] = useState(true);
  const [repColRev, setRepColRev] = useState(true);
  const [repTopName, setRepTopName] = useState(true);
  const [repTopQty, setRepTopQty] = useState(true);
  const [repTopRev, setRepTopRev] = useState(true);
  const [editProduct, setEditProduct] = useState<ProductRow | null>(null);
  const [invDetail, setInvDetail] = useState<InvRow | null>(null);
  const [requestFilter, setRequestFilter] = useState<"all" | "Pending" | "Approved" | "Rejected">("all");
  const [reviewFilterRating, setReviewFilterRating] = useState<number | null>(null);

  type SupplierRow = { id: number; name: string; phone: string | null; address: string | null; email: string | null; note: string | null; isActive: boolean; createdAt: string };
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [repFrom, setRepFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [repTo, setRepTo] = useState(() => new Date().toISOString().slice(0, 10));
  type OrderDetailRow = { id: number; createdAt: string; orderType: string; status: string; totalAmount: number; subTotal: number; discountAmt: number; vatAmount: number; staff: { fullName: string } | null; table: { name: string } | null; details: { quantity: number; product: { name: string } }[]; payments: { method: string; amount: number }[] };
  const [detailOrders, setDetailOrders] = useState<OrderDetailRow[]>([]);
  const [detailOrdersTotal, setDetailOrdersTotal] = useState(0);

  type VoucherRow = {
    id: number; code: string; description: string | null;
    discountValue: number; minBillValue: number;
    startDate: string; endDate: string;
    quantity: number; usedCount: number; isActive: boolean;
    voucherType: string;
    goldHourStart: number | null; goldHourEnd: number | null;
    _count?: { userVouchers: number };
  };
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [voucherForm, setVoucherForm] = useState({
    code: "", description: "", discountValue: "", minBillValue: "0",
    endDate: "", quantity: "100", voucherType: "public",
    goldHourStart: "", goldHourEnd: "", autoGift: false,
  });

  const loadDash = useCallback(async () => {
    const s = await staffApi<Stats>("/api/admin/stats");
    setStats({
      ...s,
      weekOrders: s.weekOrders ?? 0,
      weekRevenue: s.weekRevenue ?? 0,
      monthOrders: s.monthOrders ?? 0,
      monthRevenue: s.monthRevenue ?? 0,
    });
  }, []);

  const loadProducts = useCallback(async () => {
    const p = await staffApi<ProductRow[]>("/api/admin/products");
    setProducts(p);
  }, []);

  const loadCategories = useCallback(async () => {
    const c = await staffApi<typeof categories>("/api/admin/categories");
    setCategories(c);
  }, []);

  const loadStaff = useCallback(async () => {
    const s = await staffApi<typeof staffRows>("/api/admin/staff");
    setStaffRows(s);
  }, []);

  const loadCustomers = useCallback(async () => {
    const rows = await staffApi<typeof customerRows>("/api/admin/customers");
    setCustomerRows(rows);
  }, []);

  const loadTables = useCallback(async () => {
    const t = await staffApi<typeof tables>("/api/admin/tables");
    setTables(t);
  }, []);

  const loadInventory = useCallback(async () => {
    const i = await staffApi<InvRow[]>("/api/admin/inventory");
    setInventory(i);
  }, []);

  const loadRequests = useCallback(async () => {
    const r = await staffApi<typeof requests>("/api/admin/requests");
    setRequests(r);
  }, []);

  const loadReviews = useCallback(async () => {
    const r = await staffApi<ReviewAdminRow[]>("/api/admin/reviews");
    setReviews(r);
  }, []);

  const loadSettings = useCallback(async () => {
    const s = await staffApi<NonNullable<typeof settings>>("/api/admin/settings");
    setSettings(s);
  }, []);

  const loadReports = useCallback(async () => {
    const [rev, top] = await Promise.all([
      staffApi<{ total: number; pointsRedeemTotal: number; grandTotal: number; byDay: Record<string, { cash: number; points: number }> }>("/api/admin/reports/revenue"),
      staffApi<{ items: typeof topProducts }>("/api/admin/reports/top-products"),
    ]);
    setRevenueReport(rev);
    setTopProducts(top.items.slice(0, 15));
  }, []);

  const loadSuppliers = useCallback(async () => {
    const rows = await staffApi<typeof suppliers>("/api/admin/suppliers");
    setSuppliers(rows);
  }, []);

  const loadVouchers = useCallback(async () => {
    const rows = await staffApi<VoucherRow[]>("/api/vouchers/admin");
    setVouchers(rows);
  }, []);

  type PostRow = { id: number; title: string; body: string; imageUrl: string | null; pinned: boolean; isPublished: boolean; createdAt: string; updatedAt: string; };
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [postForm, setPostForm] = useState({ title: "", body: "", imageUrl: "", pinned: false, isPublished: true });
  const [editPostId, setEditPostId] = useState<number | null>(null);
  const [adminPreviewPost, setAdminPreviewPost] = useState<PostPreview | null>(null);

  const loadPosts = useCallback(async () => {
    const rows = await staffApi<PostRow[]>("/api/posts/admin");
    setPosts(rows);
  }, []);

  const loadDetailOrders = useCallback(async (from: string, to: string) => {
    const data = await staffApi<{ total: number; orders: typeof detailOrders }>(`/api/admin/reports/orders?from=${from}&to=${to}&limit=100`);
    setDetailOrders(data.orders); setDetailOrdersTotal(data.total);
  }, []);

  useEffect(() => {
    if (!info || info.role !== "Admin") return;
    (async () => {
      try {
        setErr(null);
        if (tab === "dash") await loadDash();
        if (tab === "products") await Promise.all([loadProducts(), loadCategories()]);
        if (tab === "categories") await loadCategories();
        if (tab === "staff") await loadStaff();
        if (tab === "customers") await loadCustomers();
        if (tab === "tables") await loadTables();
        if (tab === "inventory") await loadInventory();
        if (tab === "requests") await loadRequests();
        if (tab === "reviews") await loadReviews();
        if (tab === "settings") await loadSettings();
        if (tab === "reports") await loadReports();
        if (tab === "suppliers") await loadSuppliers();
        if (tab === "vouchers") await loadVouchers();
        if (tab === "posts") await loadPosts();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Lỗi");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, info?.id, info?.role]);

  if (!info || info.role !== "Admin") {
    return <Navigate to="/staff/login" replace />;
  }

  type NavItem = { id: Tab; label: string; icon: JSX.Element };
  type NavGroup = { label: string; items: NavItem[] };

  const I = (path: string) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );

  const navGroups: NavGroup[] = [
    {
      label: "Tổng quan",
      items: [
        { id: "dash", label: "Tổng quan", icon: I("M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6") },
      ],
    },
    {
      label: "Thực đơn",
      items: [
        { id: "products", label: "Món & giá", icon: I("M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C20.832 18.477 19.246 18 17.5 18c-1.746 0-3.332.477-4.5 1.253") },
        { id: "categories", label: "Danh mục", icon: I("M4 6h16M4 10h16M4 14h16M4 18h16") },
        { id: "vouchers" as Tab, label: "Voucher", icon: I("M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z") },
      ],
    },
    {
      label: "Vận hành",
      items: [
        { id: "tables", label: "Bàn", icon: I("M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z") },
        { id: "inventory", label: "Kho", icon: I("M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4") },
        { id: "requests", label: "Phiếu xin NL", icon: I("M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4") },
        { id: "suppliers", label: "Nhà cung cấp", icon: I("M8 18l-4-4m0 0l4-4m-4 4h16M16 6l4 4m0 0l-4 4m4-4H4") },
      ],
    },
    {
      label: "Khách hàng",
      items: [
        { id: "customers", label: "Khách hàng", icon: I("M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z") },
        { id: "reviews", label: "Đánh giá", icon: I("M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z") },
      ],
    },
    {
      label: "Nhân sự",
      items: [
        { id: "staff", label: "Nhân sự", icon: I("M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z") },
      ],
    },
    {
      label: "Nội dung",
      items: [
        { id: "posts" as Tab, label: "Bài đăng", icon: I("M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z") },
      ],
    },
    {
      label: "Tài chính",
      items: [
        { id: "reports", label: "Báo cáo", icon: I("M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z") },
        { id: "profit", label: "Lợi nhuận", icon: I("M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z") },
      ],
    },
    {
      label: "Hệ thống",
      items: [
        { id: "settings", label: "Cài đặt CH", icon: I("M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z") },
        { id: "audit", label: "Audit Log", icon: I("M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2") },
      ],
    },
  ];

  const tabs = navGroups.flatMap((g) => g.items);
  const tabTitle = tabs.find((x) => x.id === tab)?.label ?? "Quản trị";

  return (
    <div className="admin-layout">
      {/* Mobile top bar */}
      <header className="admin-mobile-topbar">
        <button
          type="button"
          className="admin-mobile-menu-btn"
          onClick={() => setSiderOpen(true)}
          aria-label="Mở menu quản trị"
        >
          ☰
        </button>
        <span className="admin-mobile-title">⛓ Quản trị TD Coffee</span>
        <Link to="/staff/login" style={{ fontSize: "1.1rem", textDecoration: "none" }} onClick={() => clearStaffSession()}>
          🚩
        </Link>
      </header>

      {/* Overlay mobile */}
      {siderOpen && (
        <div className="admin-sider-overlay" onClick={() => setSiderOpen(false)} role="presentation" />
      )}

      <aside className={`admin-sider${siderOpen ? " admin-sider-open" : ""}`}>
        <div className="admin-sider-brand">
          <LogoMark width={44} height={44} className="admin-sider-logo-img" />
          <div>
            <div className="admin-sider-logo">TD Coffee</div>
            <div className="admin-sider-sub">Quản trị cửa hàng</div>
          </div>
        </div>
        {/* Nút đóng (chỉ hiện trên mobile) */}
        <button type="button" className="admin-sider-close-btn" onClick={() => setSiderOpen(false)} aria-label="Đóng menu">
          ✕
        </button>
        <nav className="admin-sider-nav" aria-label="Menu quản trị">
          {navGroups.map((group) => (
            <div key={group.label} className="admin-nav-group">
              <div className="admin-nav-group-label">{group.label}</div>
              {group.items.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={tab === t.id ? "admin-nav-link admin-nav-link-active" : "admin-nav-link"}
                  onClick={() => closeTab(t.id)}
                >
                  <span className="admin-nav-icon">{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-sider-footer">
          <Link to="/staff/inventory" className="admin-sider-foot-link">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            Kiểm kho (NV)
          </Link>
          <Link to="/staff/tables" className="admin-sider-foot-link">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            Sơ đồ bàn (NV)
          </Link>
          <Link to="/pos" className="admin-sider-foot-link">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 7H6a2 2 0 00-2 2v9a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
            Mở POS
          </Link>
          <Link to="/staff/login" className="admin-sider-foot-link admin-sider-foot-danger" onClick={() => clearStaffSession()}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            Đăng xuất
          </Link>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-main-header">
          <h1 className="admin-main-title">{tabTitle}</h1>
        </header>
        <div className="admin-main-body">
          {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

          {tab === "dash" && stats && (
            <>
              <h2 className="admin-dash-heading">Doanh thu & đơn đã thanh toán</h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                  gap: "0.75rem",
                  marginBottom: "1.35rem",
                }}
              >
                <div className="card" style={{ padding: "1rem" }}>
                  <div className="subtle" style={{ fontSize: "0.85rem" }}>
                    Hôm nay — số đơn
                  </div>
                  <div style={{ fontSize: "1.35rem", fontWeight: 700 }}>{stats.todayOrders}</div>
                </div>
                <div className="card" style={{ padding: "1rem" }}>
                  <div className="subtle" style={{ fontSize: "0.85rem" }}>
                    Doanh thu hôm nay
                  </div>
                  <div style={{ fontSize: "1.35rem", fontWeight: 700 }}>{formatVnd(stats.todayRevenue)}</div>
                </div>
                <div className="card" style={{ padding: "1rem" }}>
                  <div className="subtle" style={{ fontSize: "0.85rem" }}>
                    7 ngày — số đơn
                  </div>
                  <div style={{ fontSize: "1.35rem", fontWeight: 700 }}>{stats.weekOrders}</div>
                </div>
                <div className="card" style={{ padding: "1rem" }}>
                  <div className="subtle" style={{ fontSize: "0.85rem" }}>
                    Doanh thu 7 ngày
                  </div>
                  <div style={{ fontSize: "1.35rem", fontWeight: 700 }}>{formatVnd(stats.weekRevenue)}</div>
                </div>
                <div className="card" style={{ padding: "1rem" }}>
                  <div className="subtle" style={{ fontSize: "0.85rem" }}>
                    Tháng này — số đơn
                  </div>
                  <div style={{ fontSize: "1.35rem", fontWeight: 700 }}>{stats.monthOrders}</div>
                </div>
                <div className="card" style={{ padding: "1rem" }}>
                  <div className="subtle" style={{ fontSize: "0.85rem" }}>
                    Doanh thu tháng này
                  </div>
                  <div style={{ fontSize: "1.35rem", fontWeight: 700 }}>{formatVnd(stats.monthRevenue)}</div>
                </div>
              </div>
              <h2 className="admin-dash-heading">Vận hành cửa hàng</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "0.75rem" }}>
                <div className="card" style={{ padding: "1rem" }}>
                  <div className="subtle" style={{ fontSize: "0.85rem" }}>
                    Món trong menu
                  </div>
                  <div style={{ fontSize: "1.35rem", fontWeight: 700 }}>{stats.products}</div>
                </div>
                <div className="card" style={{ padding: "1rem" }}>
                  <div className="subtle" style={{ fontSize: "0.85rem" }}>
                    Bàn
                  </div>
                  <div style={{ fontSize: "1.35rem", fontWeight: 700 }}>{stats.tables}</div>
                </div>
                <div className="card" style={{ padding: "1rem" }}>
                  <div className="subtle" style={{ fontSize: "0.85rem" }}>
                    NV hoạt động
                  </div>
                  <div style={{ fontSize: "1.35rem", fontWeight: 700 }}>{stats.staff}</div>
                </div>
                <div className="card" style={{ padding: "1rem" }}>
                  <div className="subtle" style={{ fontSize: "0.85rem" }}>
                    Phiếu NL chờ duyệt
                  </div>
                  <div style={{ fontSize: "1.35rem", fontWeight: 700 }}>{stats.pendingRequests}</div>
                </div>
              </div>
            </>
          )}

          {tab === "products" && (
            <section>
              <ProductAddForm
                categories={categories}
                onCreated={async () => {
                  await loadProducts();
                  await loadCategories();
                }}
                onErr={setErr}
              />
              <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {products.map((p) => {
                  const img = mediaUrl(p.imageUrl);
                  return (
                    <div
                      key={p.id}
                      className="card"
                      style={{
                        padding: "0.75rem 1rem",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "1rem",
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flex: "1 1 220px" }}>
                        <div
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: 8,
                            flexShrink: 0,
                            background: "#1a120d",
                            backgroundImage: img ? `url(${img})` : undefined,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }}
                        />
                        <div>
                          <strong>{p.name}</strong>
                          <span className="subtle" style={{ marginLeft: "0.5rem" }}>
                            {p.category?.name}
                          </span>
                          <div style={{ color: "var(--accent)", fontWeight: 600 }}>{formatVnd(p.sellPrice)}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.9rem" }}>
                          <input
                            type="checkbox"
                            checked={p.isActive}
                            onChange={async (e) => {
                              try {
                                await staffApi(`/api/admin/products/${p.id}`, {
                                  method: "PATCH",
                                  body: JSON.stringify({ isActive: e.target.checked }),
                                });
                                await loadProducts();
                              } catch (ex) {
                                setErr(ex instanceof Error ? ex.message : "Lỗi");
                              }
                            }}
                          />
                          Đang bán
                        </label>
                        <button type="button" className="btn btn-ghost" style={{ padding: "0.35rem 0.75rem", fontSize: "0.88rem" }} onClick={() => setEditProduct(p)}>
                          Sửa món
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {editProduct && (
                <ProductEditModal
                  product={editProduct}
                  categories={categories}
                  onClose={() => setEditProduct(null)}
                  onSaved={async () => {
                    await loadProducts();
                    setEditProduct(null);
                  }}
                  onErr={setErr}
                />
              )}
            </section>
          )}

          {tab === "categories" && (
            <CategoryManager categories={categories} onSaved={loadCategories} onErr={setErr} />
          )}

          {tab === "staff" && (
            <StaffManager
              rows={staffRows}
              onReload={async () => {
                await loadStaff();
                await loadDash();
              }}
              onErr={setErr}
            />
          )}

          {tab === "customers" && (
            <CustomerManager
              rows={customerRows}
              onReload={loadCustomers}
              onErr={setErr}
            />
          )}

          {tab === "tables" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {tables.map((t) => (
                <div key={t.id} className="card" style={{ padding: "0.65rem 1rem" }}>
                  <strong>{t.name}</strong> {t.location && <span className="subtle">{t.location}</span>} — {t.status}
                </div>
              ))}
            </div>
          )}

          {tab === "inventory" && (
            <InventoryPanel
              items={inventory}
              onRefresh={loadInventory}
              onErr={setErr}
              onOpenDetail={setInvDetail}
            />
          )}
          {invDetail && (
            <InventoryDetailModal
              item={invDetail}
              onClose={() => setInvDetail(null)}
              onSaved={loadInventory}
              onErr={setErr}
            />
          )}

          {tab === "requests" && (() => {
            const pending = requests.filter((r) => r.status === "Pending").length;
            const approved = requests.filter((r) => r.status === "Approved").length;
            const rejected = requests.filter((r) => r.status === "Rejected").length;
            const filtered = requestFilter === "all" ? requests : requests.filter((r) => r.status === requestFilter);
            const statusColor = (s: string) =>
              s === "Pending" ? "var(--accent)" : s === "Approved" ? "#22c55e" : "var(--danger)";
            const statusLabel = (s: string) =>
              s === "Pending" ? "Chờ duyệt" : s === "Approved" ? "Đã duyệt" : "Từ chối";
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                {/* Stats */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: "0.6rem" }}>
                  <div className="card" style={{ padding: "0.65rem 1rem" }}>
                    <div className="subtle" style={{ fontSize: "0.8rem" }}>Tổng phiếu</div>
                    <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{requests.length}</div>
                  </div>
                  <div className="card" style={{ padding: "0.65rem 1rem" }}>
                    <div className="subtle" style={{ fontSize: "0.8rem" }}>Chờ duyệt</div>
                    <div style={{ fontSize: "1.3rem", fontWeight: 700, color: pending ? "var(--accent)" : undefined }}>{pending}</div>
                  </div>
                  <div className="card" style={{ padding: "0.65rem 1rem" }}>
                    <div className="subtle" style={{ fontSize: "0.8rem" }}>Đã duyệt</div>
                    <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#22c55e" }}>{approved}</div>
                  </div>
                  <div className="card" style={{ padding: "0.65rem 1rem" }}>
                    <div className="subtle" style={{ fontSize: "0.8rem" }}>Từ chối</div>
                    <div style={{ fontSize: "1.3rem", fontWeight: 700, color: rejected ? "var(--danger)" : undefined }}>{rejected}</div>
                  </div>
                </div>
                {/* Filter chips */}
                <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                  {(["all", "Pending", "Approved", "Rejected"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={requestFilter === f ? "btn btn-primary" : "btn btn-ghost"}
                      style={{ padding: "0.3rem 0.85rem", fontSize: "0.85rem" }}
                      onClick={() => setRequestFilter(f)}
                    >
                      {f === "all" ? "Tất cả" : f === "Pending" ? "Chờ duyệt" : f === "Approved" ? "Đã duyệt" : "Từ chối"}
                    </button>
                  ))}
                </div>
                {filtered.length === 0 && (
                  <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
                    {requests.length === 0 ? "Chưa có phiếu xin nguyên liệu nào." : "Không có phiếu nào ở trạng thái này."}
                  </div>
                )}
                {filtered.map((r) => (
                  <div key={r.id} className="card" style={{ padding: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>Phiếu #{r.id}</span>
                          <span style={{
                            padding: "0.1rem 0.5rem", borderRadius: 99, fontSize: "0.75rem", fontWeight: 600,
                            background: r.type === "Restock" ? "#3b82f622" : "#8b5cf622",
                            color: r.type === "Restock" ? "#3b82f6" : "#8b5cf6",
                            border: `1px solid ${r.type === "Restock" ? "#3b82f644" : "#8b5cf644"}`,
                          }}>
                            {r.type === "Restock" ? "Nhập hàng" : "Xin NL pha chế"}
                          </span>
                          <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
                            {new Date(r.createdAt).toLocaleString("vi-VN")}
                          </span>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: "1rem", marginTop: "0.15rem" }}>{r.item.name}</div>
                        <div style={{ fontSize: "0.88rem", marginTop: "0.25rem" }}>
                          Số lượng: <strong>{r.requestQty}</strong>{r.item.unit ? ` ${r.item.unit}` : ""}
                        </div>
                        <div style={{ fontSize: "0.88rem", color: "var(--muted)", marginTop: "0.15rem" }}>
                          Yêu cầu bởi: <strong>{r.staff.fullName}</strong>
                        </div>
                        {r.note && (
                          <div style={{ fontSize: "0.88rem", marginTop: "0.25rem", fontStyle: "italic", color: "var(--muted)" }}>
                            Ghi chú: {r.note}
                          </div>
                        )}
                        {r.approvedBy && r.status !== "Pending" && (
                          <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                            {r.status === "Approved" ? "Duyệt bởi" : "Từ chối bởi"}: {r.approvedBy.fullName}
                          </div>
                        )}
                      </div>
                      <span style={{
                        padding: "0.25rem 0.75rem",
                        borderRadius: 99,
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        background: statusColor(r.status) + "22",
                        color: statusColor(r.status),
                        border: `1px solid ${statusColor(r.status)}44`,
                        whiteSpace: "nowrap",
                      }}>
                        {statusLabel(r.status)}
                      </span>
                    </div>
                    {r.status === "Pending" && (
                      <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ padding: "0.4rem 1rem", fontSize: "0.88rem" }}
                          onClick={async () => {
                            try {
                              await staffApi(`/api/admin/requests/${r.id}`, {
                                method: "PATCH",
                                body: JSON.stringify({ status: "Approved" }),
                              });
                              await loadRequests();
                              await loadDash();
                            } catch (e) {
                              setErr(e instanceof Error ? e.message : "Lỗi");
                            }
                          }}
                        >
                          Duyệt
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: "0.4rem 1rem", fontSize: "0.88rem", color: "var(--danger)" }}
                          onClick={async () => {
                            try {
                              await staffApi(`/api/admin/requests/${r.id}`, {
                                method: "PATCH",
                                body: JSON.stringify({ status: "Rejected" }),
                              });
                              await loadRequests();
                            } catch (e) {
                              setErr(e instanceof Error ? e.message : "Lỗi");
                            }
                          }}
                        >
                          Từ chối
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}

          {tab === "reviews" && (() => {
            const filtered = reviews.filter((r) => reviewFilterRating === null || r.rating === reviewFilterRating);
            const avgRating = reviews.length
              ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
              : null;
            const starCounts = [5, 4, 3, 2, 1].map((s) => ({ star: s, count: reviews.filter((r) => r.rating === s).length }));
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                {/* Stats */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: "0.6rem" }}>
                  <div className="card" style={{ padding: "0.65rem 1rem" }}>
                    <div className="subtle" style={{ fontSize: "0.8rem" }}>Tổng đánh giá</div>
                    <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{reviews.length}</div>
                  </div>
                  {avgRating && (
                    <div className="card" style={{ padding: "0.65rem 1rem" }}>
                      <div className="subtle" style={{ fontSize: "0.8rem" }}>Trung bình</div>
                      <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#f59e0b" }}>★ {avgRating}</div>
                    </div>
                  )}
                  <div className="card" style={{ padding: "0.65rem 1rem" }}>
                    <div className="subtle" style={{ fontSize: "0.8rem" }}>Đã phản hồi</div>
                    <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#22c55e" }}>{reviews.filter((r) => !!r.adminReply).length}</div>
                  </div>
                  <div className="card" style={{ padding: "0.65rem 1rem" }}>
                    <div className="subtle" style={{ fontSize: "0.8rem" }}>Đang ẩn</div>
                    <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{reviews.filter((r) => r.hidden).length}</div>
                  </div>
                </div>
                {/* Filter by stars */}
                <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", alignItems: "center" }}>
                  <span className="subtle" style={{ fontSize: "0.85rem" }}>Lọc:</span>
                  <button
                    type="button"
                    className={reviewFilterRating === null ? "btn btn-primary" : "btn btn-ghost"}
                    style={{ padding: "0.3rem 0.75rem", fontSize: "0.85rem" }}
                    onClick={() => setReviewFilterRating(null)}
                  >
                    Tất cả
                  </button>
                  {starCounts.map(({ star, count }) => (
                    <button
                      key={star}
                      type="button"
                      className={reviewFilterRating === star ? "btn btn-primary" : "btn btn-ghost"}
                      style={{ padding: "0.3rem 0.75rem", fontSize: "0.85rem" }}
                      onClick={() => setReviewFilterRating(star)}
                    >
                      {"★".repeat(star)} ({count})
                    </button>
                  ))}
                </div>
                {filtered.length === 0 && (
                  <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
                    {reviews.length === 0 ? "Chưa có đánh giá nào." : "Không có đánh giá với bộ lọc này."}
                  </div>
                )}
                {filtered.map((r) => (
                  <ReviewAdminCard key={r.id} row={r} onUpdated={loadReviews} onErr={setErr} />
                ))}
              </div>
            );
          })()}

          {tab === "settings" && settings && (
            <AdminStoreSettings
              settings={{
                ...settings,
                pointEarnEveryVnd: settings.pointEarnEveryVnd ?? 1000,
                pointEarnEach: settings.pointEarnEach ?? 100,
                storeLat: settings.storeLat ?? null,
                storeLng: settings.storeLng ?? null,
                storeAddress: settings.storeAddress ?? null,
                allowedRadius: settings.allowedRadius ?? 50,
                faceMatchThreshold: settings.faceMatchThreshold ?? 0.5,
              }}
              onSaved={loadSettings}
              onErr={setErr}
            />
          )}

          {tab === "reports" && revenueReport && (
            <section>
              <div className="card" style={{ padding: "1rem", marginBottom: "1rem" }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.75rem" }}>30 ngày gần nhất</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: "0.65rem", marginBottom: "1rem" }}>
                  <div className="card" style={{ padding: "0.85rem", border: "1px solid #e5e7eb" }}>
                    <div className="subtle" style={{ fontSize: "0.78rem", marginBottom: "0.25rem" }}>💵 Tiền thực thu</div>
                    <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#16a34a" }}>{formatVnd(revenueReport.total)}</div>
                  </div>
                  <div className="card" style={{ padding: "0.85rem", border: "1px solid #e5e7eb" }}>
                    <div className="subtle" style={{ fontSize: "0.78rem", marginBottom: "0.25rem" }}>🎁 Điểm đã đổi</div>
                    <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#d97706" }}>{formatVnd(revenueReport.pointsRedeemTotal)}</div>
                  </div>
                  <div className="card" style={{ padding: "0.85rem", border: "1px solid #e5e7eb" }}>
                    <div className="subtle" style={{ fontSize: "0.78rem", marginBottom: "0.25rem" }}>📊 Doanh thu gộp</div>
                    <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#2563eb" }}>{formatVnd(revenueReport.grandTotal)}</div>
                  </div>
                </div>
                <p style={{ margin: "0.75rem 0 0.5rem", fontSize: "0.88rem", color: "#9ca3af" }}>
                  Hiển thị cột báo cáo doanh thu theo ngày:
                </p>
                <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", marginRight: "1rem" }}>
                  <input type="checkbox" checked={repColDay} onChange={(e) => setRepColDay(e.target.checked)} />
                  Ngày
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                  <input type="checkbox" checked={repColRev} onChange={(e) => setRepColRev(e.target.checked)} />
                  Doanh thu
                </label>
                <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "0.9rem",
                    }}
                  >
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "2px solid #e5e7eb", background: "#f9fafb" }}>
                        {repColDay && <th style={{ padding: "0.45rem 0.5rem", color: "#374151", fontWeight: 700 }}>Ngày</th>}
                        {repColRev && <th style={{ padding: "0.45rem 0.5rem", color: "#374151", fontWeight: 700 }}>Doanh thu</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(revenueReport.byDay).map(([day, val], idx) => (
                        <tr key={day} style={{ borderBottom: "1px solid #f0f0f0", background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                          {repColDay && <td style={{ padding: "0.4rem 0.5rem", color: "#374151" }}>{day}</td>}
                          {repColRev && <td style={{ padding: "0.4rem 0.5rem", color: "#111827", fontWeight: 600 }}>{typeof val === "object" ? formatVnd(val.cash) : formatVnd(val as unknown as number)}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginTop: "0.75rem" }}
                  onClick={async () => {
                    try {
                      const blob = await staffDownloadBlob("/api/admin/export/revenue.csv");
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "revenue.csv";
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch (e) {
                      setErr(e instanceof Error ? e.message : "Lỗi tải CSV");
                    }
                  }}
                >
                  Tải CSV doanh thu (đầy đủ cột)
                </button>
              </div>
              <h3 style={{ fontSize: "1rem", color: "#111827" }}>Món bán chạy (doanh thu)</h3>
              <p style={{ margin: "0.35rem 0 0.65rem", fontSize: "0.88rem", color: "#6b7280" }}>
                Chọn cột hiển thị:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.65rem" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", color: "#374151", fontSize: "0.88rem" }}>
                  <input type="checkbox" checked={repTopName} onChange={(e) => setRepTopName(e.target.checked)} />
                  Tên món
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", color: "#374151", fontSize: "0.88rem" }}>
                  <input type="checkbox" checked={repTopQty} onChange={(e) => setRepTopQty(e.target.checked)} />
                  Số lượng
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", color: "#374151", fontSize: "0.88rem" }}>
                  <input type="checkbox" checked={repTopRev} onChange={(e) => setRepTopRev(e.target.checked)} />
                  Doanh thu
                </label>
              </div>
              <div style={{ overflowX: "auto", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "2px solid #e5e7eb", background: "#f9fafb" }}>
                      {repTopName && <th style={{ padding: "0.45rem 0.5rem", color: "#374151", fontWeight: 700 }}>Tên</th>}
                      {repTopQty && <th style={{ padding: "0.45rem 0.5rem", color: "#374151", fontWeight: 700 }}>SL</th>}
                      {repTopRev && <th style={{ padding: "0.45rem 0.5rem", color: "#374151", fontWeight: 700 }}>Doanh thu</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p, idx) => (
                      <tr key={p.name} style={{ borderBottom: "1px solid #f0f0f0", background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                        {repTopName && <td style={{ padding: "0.4rem 0.5rem", color: "#111827", fontWeight: 500 }}>{p.name}</td>}
                        {repTopQty && <td style={{ padding: "0.4rem 0.5rem", color: "#374151" }}>{p.quantity}</td>}
                        {repTopRev && <td style={{ padding: "0.4rem 0.5rem", color: "#16a34a", fontWeight: 600 }}>{formatVnd(p.revenue)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── Tab: Nhà cung cấp ── */}
          {tab === "suppliers" && (
            <SuppliersTab
              suppliers={suppliers}
              onReload={() => void loadSuppliers()}
              onErr={setErr}
            />
          )}

          {/* ── Tab: Lợi nhuận ── */}
          {tab === "profit" && <ProfitTab formatVnd={formatVnd} />}

          {/* ── Tab: Audit Log ── */}
          {tab === "audit" && <AuditLogTab />}

          {/* ── Tab: Voucher ── */}
          {tab === "vouchers" && (
            <section style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* FORM TẠO VOUCHER */}
              <div className="card" style={{ padding: "1.15rem" }}>
                <h3 style={{ margin: "0 0 0.85rem", fontSize: "1rem" }}>🎫 Tạo voucher mới</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.65rem" }}>
                  <div>
                    <label className="admin-label">Mã voucher *</label>
                    <input className="admin-input" placeholder="VD: COFFEE2026" value={voucherForm.code}
                      onChange={(e) => setVoucherForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
                  </div>
                  <div>
                    <label className="admin-label">Giảm giá (VND) *</label>
                    <input className="admin-input" type="number" min={1000} placeholder="20000"
                      value={voucherForm.discountValue}
                      onChange={(e) => setVoucherForm(f => ({ ...f, discountValue: e.target.value }))} />
                  </div>
                  <div>
                    <label className="admin-label">Hóa đơn tối thiểu</label>
                    <input className="admin-input" type="number" min={0} value={voucherForm.minBillValue}
                      onChange={(e) => setVoucherForm(f => ({ ...f, minBillValue: e.target.value }))} />
                  </div>
                  <div>
                    <label className="admin-label">Số lượng (-1 = không giới hạn) *</label>
                    <input className="admin-input" type="number" value={voucherForm.quantity}
                      onChange={(e) => setVoucherForm(f => ({ ...f, quantity: e.target.value }))} />
                  </div>
                  <div>
                    <label className="admin-label">Hết hạn *</label>
                    <input className="admin-input" type="date" value={voucherForm.endDate}
                      onChange={(e) => setVoucherForm(f => ({ ...f, endDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="admin-label">Loại</label>
                    <select className="admin-input" value={voucherForm.voucherType}
                      onChange={(e) => setVoucherForm(f => ({ ...f, voucherType: e.target.value }))}>
                      <option value="public">Public — ai cũng dùng được</option>
                      <option value="personal">Personal — phải lưu vào ví</option>
                    </select>
                  </div>
                  <div>
                    <label className="admin-label">Giờ vàng từ (0–23, để trống = cả ngày)</label>
                    <input className="admin-input" type="number" min={0} max={23} placeholder="14"
                      value={voucherForm.goldHourStart}
                      onChange={(e) => setVoucherForm(f => ({ ...f, goldHourStart: e.target.value }))} />
                  </div>
                  <div>
                    <label className="admin-label">Giờ vàng đến (0–23)</label>
                    <input className="admin-input" type="number" min={0} max={23} placeholder="17"
                      value={voucherForm.goldHourEnd}
                      onChange={(e) => setVoucherForm(f => ({ ...f, goldHourEnd: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label className="admin-label">Mô tả</label>
                    <input className="admin-input" placeholder="Chương trình tri ân khách hàng..."
                      value={voucherForm.description}
                      onChange={(e) => setVoucherForm(f => ({ ...f, description: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.88rem" }}>
                      <input type="checkbox" checked={voucherForm.autoGift}
                        onChange={(e) => setVoucherForm(f => ({ ...f, autoGift: e.target.checked }))} />
                      Tự động tặng cho tất cả khách hiện tại
                    </label>
                    <button type="button" className="btn btn-primary" style={{ padding: "0.5rem 1.35rem" }}
                      onClick={async () => {
                        try {
                          setErr(null);
                          await staffApi("/api/vouchers/admin", {
                            method: "POST",
                            body: JSON.stringify({
                              code: voucherForm.code,
                              description: voucherForm.description || null,
                              discountValue: Number(voucherForm.discountValue),
                              minBillValue: Number(voucherForm.minBillValue),
                              endDate: voucherForm.endDate,
                              quantity: Number(voucherForm.quantity),
                              voucherType: voucherForm.voucherType,
                              goldHourStart: voucherForm.goldHourStart ? Number(voucherForm.goldHourStart) : null,
                              goldHourEnd: voucherForm.goldHourEnd ? Number(voucherForm.goldHourEnd) : null,
                              autoGift: voucherForm.autoGift,
                            }),
                          });
                          setVoucherForm({ code: "", description: "", discountValue: "", minBillValue: "0", endDate: "", quantity: "100", voucherType: "public", goldHourStart: "", goldHourEnd: "", autoGift: false });
                          await loadVouchers();
                        } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi tạo voucher"); }
                      }}>
                      Tạo voucher
                    </button>
                  </div>
                </div>
              </div>

              {/* DANH SÁCH VOUCHER */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {vouchers.length === 0 && (
                  <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
                    Chưa có voucher nào. Tạo voucher đầu tiên ở trên.
                  </div>
                )}
                {vouchers.map((v) => {
                  const now = new Date();
                  const expired = new Date(v.endDate) < now;
                  const exhausted = v.quantity !== -1 && v.usedCount >= v.quantity;
                  const statusColor = !v.isActive ? "var(--danger)" : expired || exhausted ? "var(--muted)" : "#22c55e";
                  const statusLabel = !v.isActive ? "Đã khóa" : expired ? "Hết hạn" : exhausted ? "Hết lượt" : "Đang chạy";
                  return (
                    <div key={v.id} className="card" style={{ padding: "1rem", opacity: (!v.isActive || expired) ? 0.65 : 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                            <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "1.05rem", background: "rgba(201,162,39,0.12)", padding: "0.1rem 0.5rem", borderRadius: 6, border: "1px solid rgba(201,162,39,0.3)" }}>{v.code}</span>
                            <span style={{ fontWeight: 700, color: "var(--accent)", fontSize: "1rem" }}>-{formatVnd(v.discountValue)}</span>
                            <span style={{ padding: "0.1rem 0.5rem", borderRadius: 99, fontSize: "0.75rem", fontWeight: 600, background: statusColor + "22", color: statusColor, border: `1px solid ${statusColor}44` }}>{statusLabel}</span>
                            <span style={{ padding: "0.1rem 0.5rem", borderRadius: 99, fontSize: "0.75rem", background: v.voucherType === "personal" ? "#8b5cf622" : "#3b82f622", color: v.voucherType === "personal" ? "#8b5cf6" : "#3b82f6", border: `1px solid ${v.voucherType === "personal" ? "#8b5cf644" : "#3b82f644"}` }}>
                              {v.voucherType === "personal" ? "Cá nhân" : "Công khai"}
                            </span>
                          </div>
                          {v.description && <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.2rem" }}>{v.description}</div>}
                          <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: "0.3rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                            <span>Tối thiểu: {formatVnd(v.minBillValue)}</span>
                            <span>Đã dùng: {v.usedCount}/{v.quantity === -1 ? "∞" : v.quantity}</span>
                            <span>Đã lưu ví: {v._count?.userVouchers ?? 0}</span>
                            <span>Hết hạn: {new Date(v.endDate).toLocaleDateString("vi-VN")}</span>
                            {v.goldHourStart !== null && v.goldHourEnd !== null && (
                              <span style={{ color: "#f59e0b" }}>⏰ Giờ vàng: {v.goldHourStart}h–{v.goldHourEnd}h</span>
                            )}
                          </div>
                        </div>
                        <button type="button"
                          className={v.isActive ? "btn btn-ghost" : "btn btn-primary"}
                          style={{ padding: "0.3rem 0.85rem", fontSize: "0.82rem" }}
                          onClick={async () => {
                            try {
                              await staffApi(`/api/vouchers/admin/${v.id}`, {
                                method: "PATCH",
                                body: JSON.stringify({ isActive: !v.isActive }),
                              });
                              await loadVouchers();
                            } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi"); }
                          }}>
                          {v.isActive ? "🔒 Khóa" : "🔓 Mở khóa"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Tab: Bài đăng ── */}
          {tab === "posts" && (
            <section>
              <h3 style={{ margin: "0 0 1rem", fontSize: "1rem", color: "#111827" }}>📢 Quản lý bài đăng / Khuyến mãi</h3>

              {/* Form tạo / sửa bài */}
              <div className="card" style={{ padding: "1.1rem", marginBottom: "1.5rem" }}>
                <h4 style={{ margin: "0 0 0.85rem", fontSize: "0.95rem" }}>
                  {editPostId ? "✏️ Chỉnh sửa bài" : "➕ Tạo bài mới"}
                </h4>
                <div className="field">
                  <label className="admin-label">Tiêu đề *</label>
                  <input className="admin-input" placeholder="VD: Khuyến mãi mùa hè 2026" value={postForm.title}
                    onChange={(e) => setPostForm((f) => ({ ...f, title: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="admin-label">Nội dung * <span style={{ fontSize: "0.75rem", color: "#9ca3af", fontWeight: 400 }}>(WYSIWYG — chèn ảnh, định dạng như Word)</span></label>
                  <PostEditor
                    key={editPostId ?? "new"}
                    content={postForm.body}
                    onChange={(html) => setPostForm((f) => ({ ...f, body: html }))}
                    height="360px"
                    theme="light"
                  />
                </div>
                <div style={{ display: "flex", gap: "1.5rem", margin: "0.65rem 0" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.45rem", cursor: "pointer", fontSize: "0.88rem" }}>
                    <input type="checkbox" checked={postForm.pinned}
                      onChange={(e) => setPostForm((f) => ({ ...f, pinned: e.target.checked }))} />
                    📌 Ghim nổi bật
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.45rem", cursor: "pointer", fontSize: "0.88rem" }}>
                    <input type="checkbox" checked={postForm.isPublished}
                      onChange={(e) => setPostForm((f) => ({ ...f, isPublished: e.target.checked }))} />
                    👁 Đã xuất bản
                  </label>
                </div>
                <div style={{ display: "flex", gap: "0.65rem" }}>
                  <button type="button" className="btn btn-primary"
                    disabled={!postForm.title.trim() || !postForm.body.trim()}
                    onClick={async () => {
                      try {
                        if (editPostId) {
                          await staffApi(`/api/posts/${editPostId}`, { method: "PATCH", body: JSON.stringify(postForm) });
                        } else {
                          await staffApi("/api/posts", { method: "POST", body: JSON.stringify(postForm) });
                        }
                        setPostForm({ title: "", body: "", imageUrl: "", pinned: false, isPublished: true });
                        setEditPostId(null);
                        await loadPosts();
                      } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi"); }
                    }}
                  >
                    {editPostId ? "Lưu thay đổi" : "Đăng bài"}
                  </button>
                  {editPostId && (
                    <button type="button" className="btn btn-ghost"
                      onClick={() => { setEditPostId(null); setPostForm({ title: "", body: "", imageUrl: "", pinned: false, isPublished: true }); }}>
                      Huỷ
                    </button>
                  )}
                </div>
              </div>

              {/* Danh sách bài */}
              {posts.length === 0 && <p className="subtle">Chưa có bài đăng nào.</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                {posts.map((p) => (
                  <div key={p.id} className="card" style={{ padding: "1rem", opacity: p.isPublished ? 1 : 0.6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap", marginBottom: "0.3rem" }}>
                          {p.pinned && <span style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", background: "rgba(var(--accent-rgb),0.15)", color: "var(--accent)", borderRadius: 999, padding: "0.1rem 0.45rem", border: "1px solid rgba(var(--accent-rgb),0.3)" }}>📌 Ghim</span>}
                          {!p.isPublished && <span style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", background: "rgba(100,100,100,0.2)", color: "var(--muted)", borderRadius: 999, padding: "0.1rem 0.45rem" }}>Ẩn</span>}
                          <strong style={{ fontSize: "0.95rem" }}>{p.title}</strong>
                        </div>
                        <p style={{ margin: "0 0 0.3rem", fontSize: "0.85rem", color: "#6b7280", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {p.body.replace(/<[^>]*>/g, "").slice(0, 100)}
                        </p>
                        {p.imageUrl && <p style={{ margin: 0, fontSize: "0.75rem", color: "#9ca3af" }}>🖼 {p.imageUrl}</p>}
                        <p style={{ margin: "0.3rem 0 0", fontSize: "0.75rem", color: "#9ca3af" }}>
                          {new Date(p.createdAt).toLocaleString("vi-VN")}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0, alignItems: "flex-start", flexWrap: "wrap" }}>
                        <button type="button" className="btn btn-ghost admin-btn-compact"
                          onClick={() => {
                            setEditPostId(p.id);
                            setPostForm({ title: p.title, body: p.body, imageUrl: p.imageUrl ?? "", pinned: p.pinned, isPublished: p.isPublished });
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}>
                          ✏️ Sửa
                        </button>
                        <button type="button" className="btn btn-ghost admin-btn-compact"
                          onClick={() => setAdminPreviewPost(p)}>
                          👁 Xem
                        </button>
                        <button type="button" className="btn btn-ghost admin-btn-compact"
                          onClick={async () => {
                            try {
                              await staffApi(`/api/posts/${p.id}`, { method: "PATCH", body: JSON.stringify({ pinned: !p.pinned }) });
                              await loadPosts();
                            } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi"); }
                          }}>
                          {p.pinned ? "📌 Bỏ ghim" : "📌 Ghim"}
                        </button>
                        <button type="button" className="btn btn-ghost admin-btn-compact"
                          onClick={async () => {
                            try {
                              await staffApi(`/api/posts/${p.id}`, { method: "PATCH", body: JSON.stringify({ isPublished: !p.isPublished }) });
                              await loadPosts();
                            } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi"); }
                          }}>
                          {p.isPublished ? "👁 Ẩn" : "👁 Hiện"}
                        </button>
                        <button type="button" className="btn btn-ghost admin-btn-compact"
                          style={{ color: "#ef4444" }}
                          onClick={async () => {
                            if (!confirm("Xóa bài này?")) return;
                            try {
                              await staffApi(`/api/posts/${p.id}`, { method: "DELETE" });
                              await loadPosts();
                            } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi"); }
                          }}>
                          🗑 Xóa
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Modal xem bài trong Admin */}
          {adminPreviewPost && (
            <PostViewModal post={adminPreviewPost} onClose={() => setAdminPreviewPost(null)} />
          )}

          {/* ── Export đơn hàng chi tiết (nút trong tab reports) ── */}
          {tab === "reports" && (
            <div style={{ marginTop: "1rem" }}>
              <div className="card" style={{ padding: "0.85rem 1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                <label className="label" style={{ margin: 0 }}>Export đơn hàng — Từ:</label>
                <input type="date" className="input" value={repFrom} onChange={e => setRepFrom(e.target.value)} style={{ width: 155 }} />
                <label className="label" style={{ margin: 0 }}>Đến:</label>
                <input type="date" className="input" value={repTo} onChange={e => setRepTo(e.target.value)} style={{ width: 155 }} />
                <button className="btn btn-primary" style={{ padding: "0.4rem 1rem" }}
                  onClick={async () => {
                    try {
                      const blob = await staffDownloadBlob(`/api/admin/reports/orders/export?from=${repFrom}&to=${repTo}`);
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url; a.download = `donhang_${repFrom}_${repTo}.csv`; a.click();
                      URL.revokeObjectURL(url);
                    } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi tải CSV"); }
                  }}>
                  📥 Export CSV đầy đủ
                </button>
                <button className="btn btn-ghost staff-btn-light" style={{ padding: "0.4rem 1rem" }}
                  onClick={() => void loadDetailOrders(repFrom, repTo)}>
                  Xem danh sách đơn
                </button>
              </div>
              {detailOrders.length > 0 && (
                <div style={{ marginTop: "0.75rem", overflowX: "auto" }}>
                  <div style={{ marginBottom: "0.5rem", fontSize: "0.85rem", color: "var(--muted)" }}>
                    Hiển thị {detailOrders.length} / {detailOrdersTotal} đơn hàng
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                        {["Mã ĐH", "Thời gian", "Loại", "Bàn", "Nhân viên", "Món", "Tổng tiền", "Thanh toán", "Trạng thái"].map(h => (
                          <th key={h} style={{ padding: "0.35rem 0.5rem", color: "#4a3f38", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detailOrders.map(o => (
                        <tr key={o.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                          <td style={{ padding: "0.35rem 0.5rem", color: "#6b5e55" }}>#{o.id}</td>
                          <td style={{ padding: "0.35rem 0.5rem", whiteSpace: "nowrap", fontSize: "0.78rem" }}>{new Date(o.createdAt).toLocaleString("vi-VN")}</td>
                          <td style={{ padding: "0.35rem 0.5rem" }}>{o.orderType}</td>
                          <td style={{ padding: "0.35rem 0.5rem" }}>{o.table?.name ?? "Mang về"}</td>
                          <td style={{ padding: "0.35rem 0.5rem" }}>{o.staff?.fullName ?? "—"}</td>
                          <td style={{ padding: "0.35rem 0.5rem", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {o.details.map(d => `${d.product.name} ×${d.quantity}`).join(", ")}
                          </td>
                          <td style={{ padding: "0.35rem 0.5rem", fontWeight: 700 }}>{formatVnd(o.totalAmount)}</td>
                          <td style={{ padding: "0.35rem 0.5rem", fontSize: "0.78rem" }}>
                            {o.payments.map(p => `${p.method}`).join(", ")}
                          </td>
                          <td style={{ padding: "0.35rem 0.5rem" }}>
                            <span style={{
                              padding: "0.1rem 0.45rem", borderRadius: 99, fontSize: "0.75rem", fontWeight: 600,
                              background: o.status === "Paid" ? "#22c55e22" : "#f59e0b22",
                              color: o.status === "Paid" ? "#22c55e" : "#f59e0b"
                            }}>{o.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

/* ─── Báo cáo đơn hàng chi tiết (dùng trong tab reports) ─── */
/* Được gọi từ tab reports bằng nút riêng */

function StaffManager({
  rows,
  onReload,
  onErr,
}: {
  rows: Array<{
    id: number;
    username: string | null;
    fullName: string;
    role: string;
    status: string;
    phone: string | null;
    address: string | null;
    dob: string | null;
    hireDate: string;
    hasFaceData?: boolean;
  }>;
  onReload: () => Promise<void>;
  onErr: (s: string | null) => void;
}) {
  const emptyForm = {
    username: "",
    password: "",
    fullName: "",
    role: "Cashier",
    status: "Active",
    phone: "",
    address: "",
    dob: "",
    hireDate: new Date().toISOString().slice(0, 10),
  };
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!form.fullName.trim()) return onErr("Thiếu họ tên nhân viên.");
    if (!editId && form.password.length < 4) return onErr("Mật khẩu tối thiểu 4 ký tự.");
    setBusy(true);
    onErr(null);
    try {
      const payload = {
        username: form.username.trim() || undefined,
        password: form.password || undefined,
        fullName: form.fullName.trim(),
        role: form.role,
        status: form.status,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        dob: form.dob || null,
        hireDate: form.hireDate || undefined,
      };
      if (editId) {
        await staffApi(`/api/admin/staff/${editId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await staffApi("/api/admin/staff", { method: "POST", body: JSON.stringify(payload) });
      }
      setForm(emptyForm);
      setEditId(null);
      await onReload();
    } catch (e) {
      onErr(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(id: number) {
    if (!window.confirm("Khóa nhân viên này?")) return;
    try {
      await staffApi(`/api/admin/staff/${id}`, { method: "DELETE" });
      await onReload();
    } catch (e) {
      onErr(e instanceof Error ? e.message : "Lỗi");
    }
  }

  async function resetFaceID(s: typeof rows[0]) {
    if (!window.confirm(`Bạn chắc chắn muốn xóa dữ liệu khuôn mặt của [${s.fullName}]? Nhân viên sẽ phải đăng ký lại.`)) return;
    try {
      await staffApi(`/api/admin/staff/${s.id}/reset-face`, { method: "PATCH" });
      alert("Đã xóa dữ liệu khuôn mặt thành công!");
      await onReload();
    } catch (e) {
      onErr(e instanceof Error ? e.message : "Lỗi");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div className="card card-padded-md">
        <h3 style={{ marginTop: 0, fontSize: "1rem" }}>{editId ? `Sửa nhân viên #${editId}` : "Tạo tài khoản nhân viên"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(200px,1fr))", gap: "0.6rem" }}>
          <div className="field" style={{ margin: 0 }}>
            <label className="label">Họ tên *</label>
            <input className="input" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="label">Tên đăng nhập</label>
            <input className="input" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="Để trống để tự sinh TN_Tram..." />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="label">{editId ? "Mật khẩu mới (nếu đổi)" : "Mật khẩu *"}</label>
            <input type="password" className="input" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="label">Vai trò</label>
            <select className="input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="Admin">Admin</option>
              <option value="Cashier">Cashier</option>
              <option value="Kitchen">Kitchen</option>
              <option value="Waiter">Waiter</option>
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="label">Số điện thoại</label>
            <input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="label">Địa chỉ</label>
            <input className="input" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="label">Ngày sinh</label>
            <input type="date" className="input" value={form.dob} onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="label">Ngày vào làm</label>
            <input type="date" className="input" value={form.hireDate} onChange={(e) => setForm((f) => ({ ...f, hireDate: e.target.value }))} />
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            {busy ? "..." : editId ? "Cập nhật nhân viên" : "Tạo tài khoản"}
          </button>
          {editId && (
            <button type="button" className="btn btn-ghost" onClick={() => { setEditId(null); setForm(emptyForm); }}>
              Hủy
            </button>
          )}
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th><th>Username</th><th>Họ tên</th><th>Vai trò</th><th>Ngày vào làm</th><th>Ngày sinh</th><th>SĐT</th><th>Địa chỉ</th><th>Trạng thái</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>#{s.id}</td>
                <td>{s.username ?? "—"}</td>
                <td>{s.fullName}</td>
                <td>{s.role}</td>
                <td>{new Date(s.hireDate).toLocaleDateString("vi-VN")}</td>
                <td>{s.dob ? new Date(s.dob).toLocaleDateString("vi-VN") : "—"}</td>
                <td>{s.phone ?? "—"}</td>
                <td>{s.address ?? "—"}</td>
                <td>{s.status}</td>
                <td>
                  <div style={{ display: "flex", gap: "0.35rem" }}>
                    <button
                      type="button"
                      className="btn btn-ghost admin-btn-compact"
                      onClick={() => {
                        setEditId(s.id);
                        setForm({
                          username: s.username ?? "",
                          password: "",
                          fullName: s.fullName,
                          role: s.role,
                          status: s.status,
                          phone: s.phone ?? "",
                          address: s.address ?? "",
                          dob: s.dob ? s.dob.slice(0, 10) : "",
                          hireDate: s.hireDate.slice(0, 10),
                        });
                      }}
                    >
                      Sửa
                    </button>
                    <button type="button" className="btn btn-ghost admin-btn-compact text-danger" onClick={() => void deactivate(s.id)}>
                      Khóa
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost admin-btn-compact"
                      style={{ filter: !s.hasFaceData ? "grayscale(100%) opacity(0.5)" : "none", cursor: !s.hasFaceData ? "not-allowed" : "pointer" }}
                      disabled={!s.hasFaceData}
                      title="Xóa dữ liệu FaceID"
                      onClick={() => void resetFaceID(s)}
                    >
                      🔄 Reset Face
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CustomerManager({
  rows,
  onReload,
  onErr,
}: {
  rows: Array<{
    id: number;
    fullName: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    dob: string | null;
    points: number;
    rankTier: string;
    createdAt: string;
    lastLogin: string | null;
  }>;
  onReload: () => Promise<void>;
  onErr: (s: string | null) => void;
}) {
  const [editId, setEditId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    address: "",
    dob: "",
    points: "0",
    rankTier: "Dong",
  });

  async function saveCustomer() {
    if (!editId) return;
    try {
      await staffApi(`/api/admin/customers/${editId}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullName: form.fullName,
          phone: form.phone,
          email: form.email,
          address: form.address,
          dob: form.dob || null,
          points: Number(form.points) || 0,
          rankTier: form.rankTier,
        }),
      });
      await onReload();
    } catch (e) {
      onErr(e instanceof Error ? e.message : "Lỗi");
    }
  }

  async function resetPassword() {
    if (!editId) return;
    if (newPassword.length < 6) return onErr("Mật khẩu mới tối thiểu 6 ký tự.");
    try {
      await staffApi(`/api/admin/customers/${editId}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ newPassword }),
      });
      setNewPassword("");
      onErr("Đã reset mật khẩu khách hàng.");
    } catch (e) {
      onErr(e instanceof Error ? e.message : "Lỗi");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ overflowX: "auto" }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th><th>Họ tên</th><th>SĐT</th><th>Email</th><th>Điểm</th><th>Hạng</th><th>Ngày tạo</th><th>Đăng nhập gần nhất</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>#{c.id}</td>
                <td>{c.fullName}</td>
                <td>{c.phone ?? "—"}</td>
                <td>{c.email ?? "—"}</td>
                <td>{c.points}</td>
                <td>{c.rankTier}</td>
                <td>{new Date(c.createdAt).toLocaleDateString("vi-VN")}</td>
                <td>{c.lastLogin ? new Date(c.lastLogin).toLocaleString("vi-VN") : "—"}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-ghost admin-btn-compact"
                    onClick={() => {
                      setEditId(c.id);
                      setForm({
                        fullName: c.fullName,
                        phone: c.phone ?? "",
                        email: c.email ?? "",
                        address: c.address ?? "",
                        dob: c.dob ? c.dob.slice(0, 10) : "",
                        points: String(c.points),
                        rankTier: c.rankTier,
                      });
                    }}
                  >
                    Sửa
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editId && (
        <div className="card card-padded-md">
          <h3 style={{ marginTop: 0, fontSize: "1rem" }}>Cập nhật khách hàng #{editId}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(200px,1fr))", gap: "0.6rem" }}>
            <div className="field" style={{ margin: 0 }}><label className="label">Họ tên</label><input className="input" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} /></div>
            <div className="field" style={{ margin: 0 }}><label className="label">SĐT</label><input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
            <div className="field" style={{ margin: 0 }}><label className="label">Email</label><input className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
            <div className="field" style={{ margin: 0 }}><label className="label">Địa chỉ</label><input className="input" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></div>
            <div className="field" style={{ margin: 0 }}><label className="label">Ngày sinh</label><input type="date" className="input" value={form.dob} onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))} /></div>
            <div className="field" style={{ margin: 0 }}><label className="label">Điểm</label><input className="input" value={form.points} onChange={(e) => setForm((f) => ({ ...f, points: e.target.value }))} /></div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
            <button type="button" className="btn btn-primary" onClick={() => void saveCustomer()}>Lưu thông tin</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditId(null)}>Đóng</button>
          </div>
          <div style={{ marginTop: "1rem", borderTop: "1px solid var(--panel-border)", paddingTop: "0.8rem" }}>
            <label className="label">Reset mật khẩu khách</label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <input type="password" className="input" style={{ maxWidth: 260 }} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mật khẩu mới (>= 6)" />
              <button type="button" className="btn btn-ghost admin-btn-compact" onClick={() => void resetPassword()}>Reset mật khẩu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Tab: Nhà cung cấp ─── */
function SuppliersTab({ suppliers, onReload, onErr }: {
  suppliers: { id: number; name: string; phone: string | null; address: string | null; email: string | null; note: string | null; isActive: boolean }[];
  onReload: () => void;
  onErr: (e: string) => void;
}) {
  const [form, setForm] = useState({ name: "", phone: "", address: "", email: "", note: "" });
  const [editId, setEditId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!form.name.trim()) return onErr("Thiếu tên nhà cung cấp");
    setBusy(true);
    try {
      if (editId) {
        await staffApi(`/api/admin/suppliers/${editId}`, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await staffApi("/api/admin/suppliers", { method: "POST", body: JSON.stringify(form) });
      }
      setForm({ name: "", phone: "", address: "", email: "", note: "" });
      setEditId(null);
      onReload();
    } catch (e) { onErr(e instanceof Error ? e.message : "Lỗi"); }
    finally { setBusy(false); }
  };

  const del = async (id: number) => {
    if (!confirm("Xóa nhà cung cấp này?")) return;
    await staffApi(`/api/admin/suppliers/${id}`, { method: "DELETE" });
    onReload();
  };

  const startEdit = (s: typeof suppliers[0]) => {
    setEditId(s.id);
    setForm({ name: s.name, phone: s.phone ?? "", address: s.address ?? "", email: s.email ?? "", note: s.note ?? "" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div className="card" style={{ padding: "1rem" }}>
        <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>{editId ? `Sửa NCC #${editId}` : "Thêm nhà cung cấp mới"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
          {[["Tên *", "name", "text"], ["Số điện thoại", "phone", "tel"], ["Địa chỉ", "address", "text"], ["Email", "email", "email"]].map(([label, key, type]) => (
            <div className="field" key={key} style={{ margin: 0 }}>
              <label className="label">{label}</label>
              <input className="input" type={type} value={(form as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}
        </div>
        <div className="field" style={{ marginTop: "0.6rem" }}>
          <label className="label">Ghi chú</label>
          <input className="input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
        </div>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
          <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? "…" : editId ? "Cập nhật" : "Thêm"}</button>
          {editId && <button className="btn btn-ghost" onClick={() => { setEditId(null); setForm({ name: "", phone: "", address: "", email: "", note: "" }); }}>Hủy</button>}
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: "1rem", margin: "0 0 0.65rem", color: "#111827" }}>Danh sách nhà cung cấp</h3>
        <div style={{ overflowX: "auto", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem", color: "#111827" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left", background: "#f9fafb" }}>
                {["#", "Tên", "SĐT", "Địa chỉ", "Email", "Ghi chú", ""].map(h => (
                  <th key={h} style={{ padding: "0.5rem 0.6rem", color: "#374151", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {suppliers.filter(s => s.isActive).map((s, idx) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #f0f0f0", background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: "0.45rem 0.6rem", color: "#6b7280", fontSize: "0.82rem" }}>#{s.id}</td>
                  <td style={{ padding: "0.45rem 0.6rem", fontWeight: 600, color: "#111827" }}>{s.name}</td>
                  <td style={{ padding: "0.45rem 0.6rem", color: "#374151" }}>{s.phone ?? "—"}</td>
                  <td style={{ padding: "0.45rem 0.6rem", color: "#374151" }}>{s.address ?? "—"}</td>
                  <td style={{ padding: "0.45rem 0.6rem", color: "#374151" }}>{s.email ?? "—"}</td>
                  <td style={{ padding: "0.45rem 0.6rem", color: "#4b5563", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.note ?? "—"}</td>
                  <td style={{ padding: "0.45rem 0.6rem", display: "flex", gap: "0.4rem" }}>
                    <button className="btn btn-ghost" style={{ padding: "0.2rem 0.6rem", fontSize: "0.82rem", color: "#374151", background: "#f3f4f6", border: "1px solid #d1d5db" }} onClick={() => startEdit(s)}>Sửa</button>
                    <button className="btn btn-ghost" style={{ padding: "0.2rem 0.6rem", fontSize: "0.82rem", color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca" }} onClick={() => void del(s.id)}>Xóa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Lợi nhuận ─── */
function ProfitTab({ formatVnd }: { formatVnd: (n: number) => string }) {
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  type ProfitData = { totalRevenue: number; totalProductCost: number; grossProfit: number; byDay: Record<string, { revenue: number; cost: number; profit: number }>; byProduct: { name: string; qty: number; revenue: number; cost: number }[] };
  const [data, setData] = useState<ProfitData | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const d = await staffApi<ProfitData>(`/api/admin/reports/profit?from=${from}&to=${to}`);
      setData(d);
    } finally { setBusy(false); }
  };

  useEffect(() => { void load(); }, []);

  const days = data ? Object.entries(data.byDay).sort(([a], [b]) => a.localeCompare(b)) : [];
  const maxRev = days.reduce((m, [, v]) => Math.max(m, v.revenue), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Bộ lọc ngày */}
      <div className="card" style={{ padding: "0.85rem 1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
        <label className="label" style={{ margin: 0 }}>Từ:</label>
        <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 160 }} />
        <label className="label" style={{ margin: 0 }}>Đến:</label>
        <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} style={{ width: 160 }} />
        <button className="btn btn-primary" onClick={() => void load()} disabled={busy} style={{ padding: "0.4rem 1.1rem" }}>
          {busy ? "Đang tải..." : "Xem"}
        </button>
      </div>

      {data && (
        <>
          {/* Tổng kết */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: "0.75rem" }}>
            {[
              { label: "Doanh thu", value: data.totalRevenue, color: "#22c55e" },
              { label: "Giá vốn SP", value: data.totalProductCost, color: "#f59e0b" },
              { label: "Lợi nhuận gộp", value: data.grossProfit, color: data.grossProfit >= 0 ? "#818cf8" : "#ef4444" },
              { label: "Biên lợi nhuận", value: data.totalRevenue > 0 ? Math.round(data.grossProfit / data.totalRevenue * 100) : 0, color: "#38bdf8", suffix: "%" },
            ].map(c => (
              <div key={c.label} className="card" style={{ padding: "1rem" }}>
                <div style={{ fontSize: "0.82rem", color: "#6b7280", marginBottom: "0.3rem" }}>{c.label}</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 800, color: c.color }}>{c.suffix ? `${c.value}${c.suffix}` : formatVnd(c.value)}</div>
              </div>
            ))}
          </div>

          {/* Biểu đồ cột doanh thu vs chi phí theo ngày */}
          {days.length > 0 && (
            <div className="card" style={{ padding: "1rem" }}>
              <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem" }}>Biểu đồ doanh thu / chi phí theo ngày</h3>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: 140, overflowX: "auto" }}>
                {days.map(([day, v]) => (
                  <div key={day} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 28, flex: 1 }}>
                    <div style={{ width: "100%", display: "flex", gap: 2, alignItems: "flex-end", height: 110 }}>
                      <div title={`DT: ${formatVnd(v.revenue)}`} style={{ flex: 1, background: "#22c55e88", borderRadius: "3px 3px 0 0", height: `${Math.round(v.revenue / maxRev * 100)}%` }} />
                      <div title={`CP: ${formatVnd(v.cost)}`} style={{ flex: 1, background: "#f59e0b88", borderRadius: "3px 3px 0 0", height: `${Math.round(v.cost / maxRev * 100)}%` }} />
                    </div>
                    <div style={{ fontSize: "0.6rem", color: "#6b7280", marginTop: 2, writingMode: "vertical-rl", transform: "rotate(180deg)", height: 30 }}>{day.slice(5)}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: "1rem", fontSize: "0.78rem", marginTop: "0.5rem", color: "#374151" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 12, background: "#22c55e88", display: "inline-block", borderRadius: 2 }} />Doanh thu</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 12, background: "#f59e0b88", display: "inline-block", borderRadius: 2 }} />Giá vốn</span>
              </div>
            </div>
          )}

          {/* Top sản phẩm theo lợi nhuận */}
          <div>
            <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.65rem", color: "#111827" }}>Lợi nhuận theo sản phẩm</h3>
            <div style={{ overflowX: "auto", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left", background: "#f9fafb" }}>
                    {["Sản phẩm", "SL bán", "Doanh thu", "Giá vốn", "Lợi nhuận", "Biên %"].map(h => (
                      <th key={h} style={{ padding: "0.5rem 0.6rem", color: "#374151", whiteSpace: "nowrap", fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.byProduct.map((p, idx) => {
                    const profit = p.revenue - p.cost;
                    const margin = p.revenue > 0 ? Math.round(profit / p.revenue * 100) : 0;
                    return (
                      <tr key={p.name} style={{ borderBottom: "1px solid #f0f0f0", background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "0.45rem 0.6rem", fontWeight: 600, color: "#111827" }}>{p.name}</td>
                        <td style={{ padding: "0.45rem 0.6rem", color: "#374151" }}>{p.qty}</td>
                        <td style={{ padding: "0.45rem 0.6rem", color: "#16a34a", fontWeight: 600 }}>{formatVnd(p.revenue)}</td>
                        <td style={{ padding: "0.45rem 0.6rem", color: "#d97706", fontWeight: 600 }}>{formatVnd(p.cost)}</td>
                        <td style={{ padding: "0.45rem 0.6rem", fontWeight: 700, color: profit >= 0 ? "#4f46e5" : "#dc2626" }}>{formatVnd(profit)}</td>
                        <td style={{ padding: "0.45rem 0.6rem", fontWeight: 600, color: margin >= 30 ? "#16a34a" : margin >= 10 ? "#d97706" : "#dc2626" }}>{margin}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Tab: Audit Log ─── */
function AuditLogTab() {
  type AuditRow = { id: number; action: string; target: string | null; detail: string | null; createdAt: string; staff: { fullName: string; username: string | null; role: string } | null };
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [dateFilter, setDateFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (p = 1, date = dateFilter, action = actionFilter) => {
    setBusy(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "50" });
      if (date) params.set("date", date);
      if (action) params.set("action", action);
      const data = await staffApi<{ total: number; rows: AuditRow[] }>(`/api/admin/audit-logs?${params}`);
      setRows(data.rows); setTotal(data.total); setPage(p);
    } finally { setBusy(false); }
  };

  useEffect(() => { void load(1); }, []);

  const ACTION_COLORS: Record<string, string> = {
    SHIFT_OPEN: "#f59e0b", SHIFT_CLOSE: "#818cf8",
    INVENTORY_CHECK_OPEN: "#22c55e", INVENTORY_CHECK_CLOSE: "#38bdf8",
    INVENTORY_RECEIVE: "#a78bfa", SUPPLIER_CREATE: "#34d399",
    SUPPLIER_UPDATE: "#fbbf24", SUPPLIER_DELETE: "#ef4444",
    LOW_STOCK_ALERT: "#f87171",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Bộ lọc */}
      <div className="card" style={{ padding: "0.85rem 1rem", display: "flex", gap: "0.65rem", flexWrap: "wrap", alignItems: "center" }}>
        <input type="date" className="input" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ width: 160 }} placeholder="Lọc theo ngày" />
        <input type="text" className="input" value={actionFilter} onChange={e => setActionFilter(e.target.value)} style={{ width: 200 }} placeholder="Lọc action (VD: SHIFT)" />
        <button className="btn btn-primary" style={{ padding: "0.4rem 1rem" }} disabled={busy} onClick={() => void load(1)}>Lọc</button>
        <button className="btn btn-ghost staff-btn-light" style={{ padding: "0.4rem 1rem" }} onClick={() => { setDateFilter(""); setActionFilter(""); void load(1, "", ""); }}>Xóa lọc</button>
        <span style={{ color: "#9ca3af", fontSize: "0.85rem", marginLeft: "auto" }}>Tổng: {total} log</span>
      </div>

      <div style={{ overflowX: "auto", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left", background: "#f9fafb" }}>
              {["Thời gian", "Nhân viên", "Hành động", "Đối tượng", "Chi tiết"].map(h => (
                <th key={h} style={{ padding: "0.45rem 0.6rem", color: "#374151", whiteSpace: "nowrap", fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f0f0f0", background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                <td style={{ padding: "0.4rem 0.6rem", color: "#6b7280", fontSize: "0.8rem", whiteSpace: "nowrap" }}>{new Date(r.createdAt).toLocaleString("vi-VN")}</td>
                <td style={{ padding: "0.4rem 0.6rem" }}>
                  {r.staff ? (
                    <div>
                      <div style={{ fontWeight: 600, color: "#111827" }}>{r.staff.fullName}</div>
                      <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{r.staff.username ?? ""}</div>
                    </div>
                  ) : <span style={{ color: "#6b7280", fontStyle: "italic" }}>Hệ thống</span>}
                </td>
                <td style={{ padding: "0.4rem 0.6rem" }}>
                  <span style={{ padding: "0.15rem 0.55rem", borderRadius: 99, fontSize: "0.75rem", fontWeight: 700, background: (ACTION_COLORS[r.action] ?? "#94a3b8") + "22", color: ACTION_COLORS[r.action] ?? "#374151", border: `1px solid ${(ACTION_COLORS[r.action] ?? "#94a3b8")}55`, whiteSpace: "nowrap" }}>
                    {r.action}
                  </span>
                </td>
                <td style={{ padding: "0.4rem 0.6rem", color: "#374151", fontWeight: 600 }}>{r.target ?? "—"}</td>
                <td style={{ padding: "0.4rem 0.6rem", color: "#6b7280", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.detail ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>Không có log{busy ? " (đang tải...)" : ""}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Phân trang */}
      {total > 50 && (
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", flexWrap: "wrap" }}>
          {Array.from({ length: Math.ceil(total / 50) }, (_, i) => i + 1).slice(0, 10).map(p => (
            <button key={p} className={page === p ? "btn btn-primary" : "btn btn-ghost staff-btn-light"} style={{ padding: "0.3rem 0.75rem", minWidth: 36 }} onClick={() => void load(p)}>
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Không đọc được file."));
    r.readAsDataURL(file);
  });
}

function ProductImageField({
  label,
  imageUrl,
  onUrlChange,
  onBusy,
}: {
  label: string;
  imageUrl: string;
  onUrlChange: (url: string) => void;
  onBusy?: (b: boolean) => void;
}) {
  const img = mediaUrl(imageUrl || undefined);
  return (
    <div className="field">
      <label className="label">{label}</label>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div
          style={{
            width: 88,
            height: 88,
            borderRadius: 8,
            background: "#1a120d",
            backgroundImage: img ? `url(${img})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            flexShrink: 0,
          }}
        />
        <div style={{ flex: "1 1 180px" }}>
          <input
            className="input"
            value={imageUrl}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="URL ảnh hoặc tải file bên dưới"
          />
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ marginTop: "0.45rem", fontSize: "0.85rem" }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              onBusy?.(true);
              try {
                const dataUrl = await readFileAsDataUrl(f);
                const url = await staffUploadImage(dataUrl);
                onUrlChange(url);
              } catch (ex) {
                alert(ex instanceof Error ? ex.message : "Lỗi tải ảnh");
              } finally {
                onBusy?.(false);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

function ProductAddForm({
  categories,
  onCreated,
  onErr,
}: {
  categories: Array<{ id: number; name: string }>;
  onCreated: () => Promise<void>;
  onErr: (s: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || categoryId === "") return;
    const price = Number(sellPrice.replace(/\D/g, ""));
    const cost = Number(costPrice.replace(/\D/g, ""));
    if (Number.isNaN(price) || price <= 0) return;
    setBusy(true);
    onErr(null);
    try {
      await staffApi("/api/admin/products", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          sellPrice: price,
          categoryId,
          costPrice: Number.isNaN(cost) ? 0 : cost,
          sku: sku.trim() || undefined,
          imageUrl: imageUrl.trim() || undefined,
        }),
      });
      setName("");
      setSku("");
      setCostPrice("");
      setSellPrice("");
      setImageUrl("");
      await onCreated();
    } catch (ex) {
      onErr(ex instanceof Error ? ex.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ padding: "1rem", marginBottom: "1rem" }} onSubmit={(e) => void submit(e)}>
      <h3 style={{ marginTop: 0, fontSize: "1rem" }}>Thêm món</h3>
      <div className="field">
        <label className="label">Tên</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="field">
        <label className="label">SKU (tùy chọn)</label>
        <input className="input" value={sku} onChange={(e) => setSku(e.target.value)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div className="field">
          <label className="label">Giá vốn (đ)</label>
          <input className="input" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
        </div>
        <div className="field">
          <label className="label">Giá bán (đ)</label>
          <input className="input" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} required />
        </div>
      </div>
      <div className="field">
        <label className="label">Danh mục</label>
        <select
          className="input"
          value={categoryId === "" ? "" : String(categoryId)}
          onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : "")}
          required
        >
          <option value="">—</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <ProductImageField label="Ảnh món" imageUrl={imageUrl} onUrlChange={setImageUrl} onBusy={setBusy} />
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "…" : "Tạo món"}
      </button>
    </form>
  );
}

function ProductEditModal({
  product,
  categories,
  onClose,
  onSaved,
  onErr,
}: {
  product: ProductRow;
  categories: Array<{ id: number; name: string }>;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onErr: (s: string | null) => void;
}) {
  const [name, setName] = useState(product.name);
  const [sku, setSku] = useState(product.sku ?? "");
  const [costPrice, setCostPrice] = useState(String(product.costPrice));
  const [sellPrice, setSellPrice] = useState(String(product.sellPrice));
  const [categoryId, setCategoryId] = useState(product.categoryId);
  const [imageUrl, setImageUrl] = useState(product.imageUrl ?? "");
  const [isActive, setIsActive] = useState(product.isActive);
  const [outOfStock, setOutOfStock] = useState(product.outOfStock);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(product.name);
    setSku(product.sku ?? "");
    setCostPrice(String(product.costPrice));
    setSellPrice(String(product.sellPrice));
    setCategoryId(product.categoryId);
    setImageUrl(product.imageUrl ?? "");
    setIsActive(product.isActive);
    setOutOfStock(product.outOfStock);
  }, [product]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const price = Number(sellPrice.replace(/\D/g, ""));
    const cost = Number(costPrice.replace(/\D/g, ""));
    if (Number.isNaN(price) || price <= 0) return;
    setBusy(true);
    onErr(null);
    try {
      await staffApi(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          sku: sku.trim() || null,
          sellPrice: price,
          costPrice: Number.isNaN(cost) ? 0 : cost,
          categoryId,
          imageUrl: imageUrl.trim() || null,
          isActive,
          outOfStock,
        }),
      });
      await onSaved();
    } catch (ex) {
      onErr(ex instanceof Error ? ex.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ padding: "1.15rem", maxWidth: 480, width: "100%", maxHeight: "90vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, fontSize: "1.05rem" }}>Sửa món #{product.id}</h3>
        <form onSubmit={(e) => void save(e)}>
          <div className="field">
            <label className="label">Tên</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label className="label">SKU</label>
            <input className="input" value={sku} onChange={(e) => setSku(e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div className="field">
              <label className="label">Giá vốn</label>
              <input className="input" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Giá bán</label>
              <input className="input" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} required />
            </div>
          </div>
          <div className="field">
            <label className="label">Danh mục</label>
            <select className="input" value={String(categoryId)} onChange={(e) => setCategoryId(Number(e.target.value))}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <ProductImageField label="Ảnh món" imageUrl={imageUrl} onUrlChange={setImageUrl} onBusy={setBusy} />
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem", fontSize: "0.9rem" }}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Đang bán
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.85rem", fontSize: "0.9rem" }}>
            <input type="checkbox" checked={outOfStock} onChange={(e) => setOutOfStock(e.target.checked)} />
            Hết hàng (hiển thị trên menu)
          </label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "…" : "Lưu"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Đóng
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CategoryManager({
  categories,
  onSaved,
  onErr,
}: {
  categories: Array<{ id: number; name: string; sortOrder: number }>;
  onSaved: () => Promise<void>;
  onErr: (s: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("");

  async function addCat(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onErr(null);
    try {
      await staffApi("/api/admin/categories", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          sortOrder: sortOrder.trim() ? Number(sortOrder.replace(/\D/g, "")) : undefined,
        }),
      });
      setName("");
      setSortOrder("");
      await onSaved();
    } catch (ex) {
      onErr(ex instanceof Error ? ex.message : "Lỗi");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <form className="card" style={{ padding: "1rem" }} onSubmit={(e) => void addCat(e)}>
        <h3 style={{ marginTop: 0, fontSize: "1rem" }}>Thêm danh mục</h3>
        <div className="field">
          <label className="label">Tên</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label className="label">Thứ tự (tùy chọn)</label>
          <input className="input" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} placeholder="Số nhỏ hiện trước" />
        </div>
        <button type="submit" className="btn btn-primary">
          Thêm
        </button>
      </form>
      {categories.map((c) => (
        <CategoryRow key={c.id} c={c} onSaved={onSaved} onErr={onErr} />
      ))}
    </div>
  );
}

function CategoryRow({
  c,
  onSaved,
  onErr,
}: {
  c: { id: number; name: string; sortOrder: number };
  onSaved: () => Promise<void>;
  onErr: (s: string | null) => void;
}) {
  const [name, setName] = useState(c.name);
  const [sortOrder, setSortOrder] = useState(String(c.sortOrder));
  useEffect(() => {
    setName(c.name);
    setSortOrder(String(c.sortOrder));
  }, [c]);

  return (
    <div className="card" style={{ padding: "0.85rem 1rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", alignItems: "flex-end" }}>
        <div className="field" style={{ marginBottom: 0, flex: "1 1 160px" }}>
          <label className="label">Tên</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0, width: 120 }}>
          <label className="label">Thứ tự</label>
          <input className="input" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </div>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: "0.45rem 0.85rem" }}
          onClick={async () => {
            onErr(null);
            try {
              await staffApi(`/api/admin/categories/${c.id}`, {
                method: "PATCH",
                body: JSON.stringify({ name: name.trim(), sortOrder: Number(sortOrder.replace(/\D/g, "")) || 0 }),
              });
              await onSaved();
            } catch (ex) {
              onErr(ex instanceof Error ? ex.message : "Lỗi");
            }
          }}
        >
          Lưu
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: "0.45rem 0.85rem", color: "var(--danger)" }}
          onClick={async () => {
            if (!window.confirm(`Xóa danh mục "${c.name}"? Chỉ xóa được khi không còn món.`)) return;
            onErr(null);
            try {
              await staffApi(`/api/admin/categories/${c.id}`, { method: "DELETE" });
              await onSaved();
            } catch (ex) {
              onErr(ex instanceof Error ? ex.message : "Lỗi");
            }
          }}
        >
          Xóa
        </button>
      </div>
    </div>
  );
}

function InventoryPanel({
  items,
  onRefresh,
  onErr,
  onOpenDetail,
}: {
  items: InvRow[];
  onRefresh: () => Promise<void>;
  onErr: (s: string | null) => void;
  onOpenDetail: (it: InvRow) => void;
}) {
  const low = items.filter((i) => i.stockQty <= i.minLevel).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "0.6rem" }}>
        <div className="card" style={{ padding: "0.75rem 1rem" }}>
          <div className="subtle" style={{ fontSize: "0.82rem" }}>
            Tổng loại NL
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{items.length}</div>
        </div>
        <div className="card" style={{ padding: "0.75rem 1rem" }}>
          <div className="subtle" style={{ fontSize: "0.82rem" }}>
            Sắp hết / dưới mức tối thiểu
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: low ? "var(--danger)" : undefined }}>{low}</div>
        </div>
      </div>
      <InventoryAddForm onCreated={onRefresh} onErr={onErr} />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {items.map((it) => {
          const img = mediaUrl(it.imageUrl);
          const warn = it.stockQty <= it.minLevel;
          return (
            <div
              key={it.id}
              className="card"
              style={{
                padding: "0.75rem 1rem",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                flexWrap: "wrap",
                borderLeft: warn ? "3px solid var(--danger)" : undefined,
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 8,
                  flexShrink: 0,
                  background: "#1a120d",
                  backgroundImage: img ? `url(${img})` : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
              <div style={{ flex: "1 1 200px" }}>
                <strong>{it.name}</strong>
                <div className="subtle" style={{ fontSize: "0.85rem" }}>
                  {it.unit && `${it.unit} · `}
                  Tồn: <strong style={{ color: warn ? "var(--danger)" : undefined }}>{it.stockQty}</strong> / tối thiểu {it.minLevel}
                  {it.skuCode && ` · SKU ${it.skuCode}`}
                </div>
              </div>
              <button type="button" className="btn btn-primary" style={{ padding: "0.4rem 0.85rem", fontSize: "0.88rem" }} onClick={() => onOpenDetail(it)}>
                Chi tiết & sửa
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InventoryAddForm({ onCreated, onErr }: { onCreated: () => Promise<void>; onErr: (s: string | null) => void }) {
  const [name, setName] = useState("");
  const [skuCode, setSkuCode] = useState("");
  const [unit, setUnit] = useState("");
  const [stockQty, setStockQty] = useState("");
  const [minLevel, setMinLevel] = useState("");
  const [supplier, setSupplier] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onErr(null);
    setBusy(true);
    try {
      await staffApi("/api/admin/inventory", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          skuCode: skuCode.trim() || null,
          unit: unit.trim() || null,
          stockQty: Number(stockQty.replace(/\D/g, "")) || 0,
          minLevel: Number(minLevel.replace(/\D/g, "")) || 0,
          supplier: supplier.trim() || null,
          imageUrl: imageUrl.trim() || null,
        }),
      });
      setName("");
      setSkuCode("");
      setUnit("");
      setStockQty("");
      setMinLevel("");
      setSupplier("");
      setImageUrl("");
      await onCreated();
    } catch (ex) {
      onErr(ex instanceof Error ? ex.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ padding: "1rem" }} onSubmit={(e) => void submit(e)}>
      <h3 style={{ marginTop: 0, fontSize: "1rem" }}>Thêm nguyên liệu</h3>
      <div className="field">
        <label className="label">Tên *</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" }}>
        <div className="field">
          <label className="label">SKU</label>
          <input className="input" value={skuCode} onChange={(e) => setSkuCode(e.target.value)} />
        </div>
        <div className="field">
          <label className="label">Đơn vị</label>
          <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg, hộp…" />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" }}>
        <div className="field">
          <label className="label">Tồn ban đầu</label>
          <input className="input" value={stockQty} onChange={(e) => setStockQty(e.target.value)} />
        </div>
        <div className="field">
          <label className="label">Mức tối thiểu</label>
          <input className="input" value={minLevel} onChange={(e) => setMinLevel(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label className="label">Nhà cung cấp</label>
        <input className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
      </div>
      <ProductImageField label="Ảnh minh họa" imageUrl={imageUrl} onUrlChange={setImageUrl} onBusy={setBusy} />
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "…" : "Tạo nguyên liệu"}
      </button>
    </form>
  );
}

function InventoryDetailModal({
  item,
  onClose,
  onSaved,
  onErr,
}: {
  item: InvRow;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onErr: (s: string | null) => void;
}) {
  const [name, setName] = useState(item.name);
  const [skuCode, setSkuCode] = useState(item.skuCode ?? "");
  const [unit, setUnit] = useState(item.unit ?? "");
  const [stockQty, setStockQty] = useState(String(item.stockQty));
  const [minLevel, setMinLevel] = useState(String(item.minLevel));
  const [supplier, setSupplier] = useState(item.supplier ?? "");
  const [imageUrl, setImageUrl] = useState(item.imageUrl ?? "");
  const [recvQty, setRecvQty] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(item.name);
    setSkuCode(item.skuCode ?? "");
    setUnit(item.unit ?? "");
    setStockQty(String(item.stockQty));
    setMinLevel(String(item.minLevel));
    setSupplier(item.supplier ?? "");
    setImageUrl(item.imageUrl ?? "");
  }, [item]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    onErr(null);
    try {
      await staffApi(`/api/admin/inventory/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          skuCode: skuCode.trim() || null,
          unit: unit.trim() || null,
          stockQty: Number(stockQty.replace(/\D/g, "")) || 0,
          minLevel: Number(minLevel.replace(/\D/g, "")) || 0,
          supplier: supplier.trim() || null,
          imageUrl: imageUrl.trim() || null,
        }),
      });
      await onSaved();
      onClose();
    } catch (ex) {
      onErr(ex instanceof Error ? ex.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  async function receive() {
    const n = Number(recvQty.replace(/\D/g, ""));
    if (Number.isNaN(n) || n <= 0) {
      onErr("Số lượng nhập không hợp lệ");
      return;
    }
    onErr(null);
    setBusy(true);
    try {
      await staffApi(`/api/admin/inventory/${item.id}/receive`, {
        method: "POST",
        body: JSON.stringify({ qty: n }),
      });
      setRecvQty("");
      await onSaved();
      onClose();
    } catch (ex) {
      onErr(ex instanceof Error ? ex.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Xóa hẳn nguyên liệu "${item.name}"? Các phiếu xin liên quan cũng bị xóa.`)) return;
    onErr(null);
    try {
      await staffApi(`/api/admin/inventory/${item.id}`, { method: "DELETE" });
      await onSaved();
      onClose();
    } catch (ex) {
      onErr(ex instanceof Error ? ex.message : "Lỗi");
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ padding: "1.15rem", maxWidth: 500, width: "100%", maxHeight: "92vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Nguyên liệu #{item.id}</h3>
        <form onSubmit={(e) => void save(e)}>
          <div className="field">
            <label className="label">Tên</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" }}>
            <div className="field">
              <label className="label">SKU</label>
              <input className="input" value={skuCode} onChange={(e) => setSkuCode(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Đơn vị</label>
              <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" }}>
            <div className="field">
              <label className="label">Tồn kho</label>
              <input className="input" value={stockQty} onChange={(e) => setStockQty(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Mức tối thiểu</label>
              <input className="input" value={minLevel} onChange={(e) => setMinLevel(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label className="label">Nhà cung cấp</label>
            <input className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </div>
          <ProductImageField label="Ảnh" imageUrl={imageUrl} onUrlChange={setImageUrl} onBusy={setBusy} />
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Lưu
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Đóng
            </button>
          </div>
        </form>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "0.85rem", marginTop: "0.25rem" }}>
          <div className="field">
            <label className="label">Nhập thêm vào kho</label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <input className="input" style={{ width: 140 }} value={recvQty} onChange={(e) => setRecvQty(e.target.value)} placeholder="Số lượng" />
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void receive()}>
                Ghi nhận nhập
              </button>
            </div>
          </div>
          <button type="button" className="btn btn-ghost" style={{ color: "var(--danger)", marginTop: "0.5rem" }} onClick={() => void remove()}>
            Xóa nguyên liệu
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewAdminCard({
  row,
  onUpdated,
  onErr,
}: {
  row: ReviewAdminRow;
  onUpdated: () => Promise<void>;
  onErr: (s: string | null) => void;
}) {
  const [reply, setReply] = useState(row.adminReply ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => setReply(row.adminReply ?? ""), [row.id, row.adminReply]);

  async function sendReply() {
    setBusy(true);
    onErr(null);
    try {
      await staffApi(`/api/admin/reviews/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ adminReply: reply.trim() || null }),
      });
      await onUpdated();
    } catch (ex) {
      onErr(ex instanceof Error ? ex.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  const stars = [1, 2, 3, 4, 5];
  const dateStr = row.createdAt ? new Date(row.createdAt).toLocaleDateString("vi-VN") : null;

  return (
    <div className="card" style={{ padding: "1rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex" }}>
              {stars.map((s) => (
                <span key={s} style={{ color: s <= row.rating ? "#f59e0b" : "#3a3a3a", fontSize: "1.15rem" }}>★</span>
              ))}
            </div>
            <strong style={{ fontSize: "0.95rem" }}>{row.customer.fullName}</strong>
            {row.customer.phone && (
              <span className="subtle" style={{ fontSize: "0.82rem" }}>{row.customer.phone}</span>
            )}
            {dateStr && <span className="subtle" style={{ fontSize: "0.8rem" }}>· {dateStr}</span>}
          </div>
          <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: "0.15rem" }}>
            Đơn #{row.order.id} · {formatVnd(row.order.totalAmount)}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {row.hidden && (
            <span style={{
              padding: "0.2rem 0.6rem", borderRadius: 99, fontSize: "0.78rem",
              background: "rgba(239,68,68,0.15)", color: "var(--danger)",
              border: "1px solid rgba(239,68,68,0.3)",
            }}>Đang ẩn</span>
          )}
          {row.adminReply && (
            <span style={{
              padding: "0.2rem 0.6rem", borderRadius: 99, fontSize: "0.78rem",
              background: "rgba(34,197,94,0.12)", color: "#22c55e",
              border: "1px solid rgba(34,197,94,0.25)",
            }}>Đã phản hồi</span>
          )}
        </div>
      </div>

      {/* Comment */}
      <div style={{
        marginTop: "0.6rem", fontSize: "0.93rem", lineHeight: 1.55,
        borderLeft: "3px solid rgba(255,255,255,0.1)", paddingLeft: "0.75rem",
      }}>
        {row.comment ?? <span className="subtle">Không có nội dung.</span>}
      </div>

      {/* Current reply */}
      {row.adminReply && (
        <div style={{
          marginTop: "0.6rem", padding: "0.6rem 0.85rem",
          background: "rgba(212,167,95,0.08)", borderRadius: 8,
          fontSize: "0.88rem", borderLeft: "3px solid var(--accent)",
        }}>
          <span className="subtle" style={{ fontSize: "0.8rem" }}>
            Phản hồi{row.replyBy ? ` (${row.replyBy.fullName})` : ""}:
          </span>
          <div style={{ marginTop: "0.15rem" }}>{row.adminReply}</div>
        </div>
      )}

      {/* Reply textarea */}
      <div className="field" style={{ marginTop: "0.75rem" }}>
        <label className="label">Phản hồi hiển thị trên web</label>
        <textarea
          className="input"
          rows={2}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Cảm ơn bạn đã ghé TD Coffee…"
        />
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: "0.35rem 0.9rem", fontSize: "0.88rem" }}
            disabled={busy}
            onClick={() => void sendReply()}
          >
            {busy ? "…" : row.adminReply ? "Cập nhật phản hồi" : "Lưu phản hồi"}
          </button>
          {row.adminReply && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: "0.35rem 0.75rem", fontSize: "0.88rem", color: "var(--danger)" }}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await staffApi(`/api/admin/reviews/${row.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ adminReply: null }),
                  });
                  setReply("");
                  await onUpdated();
                } catch (ex) {
                  onErr(ex instanceof Error ? ex.message : "Lỗi");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Xóa phản hồi
            </button>
          )}
        </div>
      </div>

      {/* Hide toggle */}
      <label style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.88rem", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={row.hidden}
          onChange={async (e) => {
            try {
              await staffApi(`/api/admin/reviews/${row.id}`, {
                method: "PATCH",
                body: JSON.stringify({ hidden: e.target.checked }),
              });
              await onUpdated();
            } catch (ex) {
              onErr(ex instanceof Error ? ex.message : "Lỗi");
            }
          }}
        />
        Ẩn khỏi trang công khai
      </label>
    </div>
  );
}


