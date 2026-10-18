import { useCallback, useEffect, useRef, useState, type ComponentType, type FormEvent } from "react";

import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  ChartColumn,
  ChevronDown,
  ClipboardList,
  Coffee,
  Ellipsis,
  FileCheck,
  FlaskConical,
  FolderTree,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Megaphone,
  Menu,
  Newspaper,
  Package,
  QrCode,
  Receipt,
  ScrollText,
  Settings,
  ShoppingCart,
  Star,
  Store,
  Ticket,
  TrendingUp,
  Truck,
  UserRound,
  Users,
  Wallet,
  Warehouse,
  X,
} from "lucide-react";
import { LogoMark } from "../components/LogoMark";
import { mediaUrl } from "../lib/api";
import { AdminZones } from "./AdminZones";
import { clearStaffSession, getStaffInfo, staffApi, staffDownloadBlob, staffUploadImage } from "../lib/staffApi";
import { PostEditor } from "../components/PostEditor";
import { PostViewModal, type PostPreview } from "../components/PostViewModal";
import { AdminStoreSettings } from "../components/AdminStoreSettings";
import { AdminCombos } from "./AdminCombos";
import { AdminHrRequests } from "./AdminHrRequests";
import { AdminPayroll } from "./AdminPayroll";
import { AdminSchedule } from "./AdminSchedule";
import { IngredientFormula } from "./IngredientFormula";
import { ProcurementAdmin } from "./ProcurementAdmin";
import { QrGenerator } from "./QrGenerator";
import { useResponsiveTables } from "../lib/useResponsiveTables";

type ProductRow = {
  id: number;
  name: string;
  sku: string | null;
  sellPrice: number;
  priceSizeS?: number | null;
  priceSizeL?: number | null;
  costPrice: number;
  categoryId: number;
  isActive: boolean;
  outOfStock: boolean;
  imageUrl: string | null;
  tags?: any;
  category?: { name: string };
  discountPercent?: number | null;
};

const PREDEFINED_TAGS = ["🔥 Best Seller", "☕ Nóng", "🧊 Đá", "🆕 Món Mới", "⭐ Đề cử"];

function AdminTagsInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [newTag, setNewTag] = useState("");
  const toggle = (t: string) => {
    if (tags.includes(t)) onChange(tags.filter(x => x !== t));
    else onChange([...tags, t]);
  };
  return (
    <div className="field">
      <label className="label">Tags (đặc tính / nhãn)</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}>
        {PREDEFINED_TAGS.map(t => (
          <button type="button" key={t} onClick={() => toggle(t)} style={{
            padding: "0.35rem 0.75rem", borderRadius: 999, fontSize: "0.85rem",
            background: tags.includes(t) ? "var(--accent)" : "#f5f5f4",
            color: tags.includes(t) ? "#000" : "var(--text)", border: "none", cursor: "pointer", fontWeight: tags.includes(t) ? 600 : 400
          }}>
            {t}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        {tags.filter(t => !PREDEFINED_TAGS.includes(t)).map(t => (
          <span key={t} style={{
            padding: "0.35rem 0.75rem", borderRadius: 999, fontSize: "0.85rem",
            background: "var(--accent)", color: "#000", display: "flex", alignItems: "center", gap: "0.35rem", fontWeight: 600
          }}>
            {t} <button type="button" onClick={() => toggle(t)} style={{ background: "none", border: "none", color: "#000", cursor: "pointer", padding: 0, fontSize: "1.1rem", lineHeight: 1 }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input className="input" style={{ flex: 1 }} value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="Nhập tag khác..."
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (newTag.trim() && !tags.includes(newTag.trim())) {
                toggle(newTag.trim());
                setNewTag("");
              }
            }
          }}
        />
        <button type="button" className="btn btn-ghost" onClick={() => {
          if (newTag.trim() && !tags.includes(newTag.trim())) {
            toggle(newTag.trim());
            setNewTag("");
          }
        }}>Thêm tag</button>
      </div>
    </div>
  );
}

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

export type Tab =
  | "dash"
  | "products"
  | "categories"
  | "staff"
  | "payroll"
  | "schedule"
  | "zones"
  | "customers"
  | "tables"
  | "inventory"
  | "requests"
  | "hrRequests"
  | "reviews"
  | "settings"
  | "reports"
  | "suppliers"
  | "audit"
  | "profit"
  | "vouchers"
  | "posts"
  | "combos"
  | "formulas"
  | "qr"
  | "procurement";

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

/* ─── Kiến trúc thông tin: Phân hệ (module) → Mục con (tab) ─── */
type IconType = ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;
type TabMeta = { id: Tab; label: string; icon: IconType };
type AdminModule = { id: string; label: string; short: string; icon: IconType; tabs: TabMeta[] };

const ADMIN_MODULES: AdminModule[] = [
  {
    id: "overview", label: "Tổng quan", short: "Tổng quan", icon: LayoutDashboard,
    tabs: [
      { id: "dash", label: "Bảng điều khiển", icon: LayoutDashboard },
      { id: "reports", label: "Doanh thu", icon: ChartColumn },
      { id: "profit", label: "Lợi nhuận", icon: TrendingUp },
    ],
  },
  {
    id: "store", label: "Cửa hàng", short: "Cửa hàng", icon: Store,
    tabs: [
      { id: "products", label: "Món & giá", icon: Coffee },
      { id: "categories", label: "Danh mục", icon: FolderTree },
      { id: "combos", label: "Combo", icon: Layers },
      { id: "formulas", label: "Định mức NL", icon: FlaskConical },
      { id: "tables", label: "Bàn & khu vực", icon: LayoutGrid },
      { id: "qr", label: "Mã QR", icon: QrCode },
    ],
  },
  {
    id: "hr", label: "Nhân sự", short: "Nhân sự", icon: Users,
    tabs: [
      { id: "staff", label: "Nhân viên", icon: Users },
      { id: "schedule", label: "Lịch & chấm công", icon: CalendarDays },
      { id: "payroll", label: "Bảng lương", icon: Wallet },
      { id: "hrRequests", label: "Duyệt đề xuất", icon: FileCheck },
    ],
  },
  {
    id: "ops", label: "Vận hành & Kho", short: "Kho", icon: Warehouse,
    tabs: [
      { id: "inventory", label: "Tồn kho", icon: Package },
      { id: "requests", label: "Phiếu xin NL", icon: ClipboardList },
      { id: "procurement", label: "Mua hàng", icon: ShoppingCart },
      { id: "suppliers", label: "Nhà cung cấp", icon: Truck },
    ],
  },
  {
    id: "marketing", label: "Khách hàng & Marketing", short: "Marketing", icon: Megaphone,
    tabs: [
      { id: "customers", label: "Khách hàng", icon: UserRound },
      { id: "vouchers", label: "Voucher", icon: Ticket },
      { id: "posts", label: "Bài đăng", icon: Newspaper },
      { id: "reviews", label: "Đánh giá", icon: Star },
    ],
  },
  {
    id: "system", label: "Hệ thống", short: "Hệ thống", icon: Settings,
    tabs: [
      { id: "settings", label: "Cài đặt cửa hàng", icon: Settings },
      { id: "audit", label: "Nhật ký hệ thống", icon: ScrollText },
    ],
  },
];

/** 4 phân hệ hay dùng nhất hiện trên bottom nav (mobile); phần còn lại nằm trong nút "Thêm" (drawer) */
const BOTTOM_MODULE_IDS = ["overview", "store", "hr", "ops"];

const ALL_TABS = ADMIN_MODULES.flatMap((m) => m.tabs);
const isTab = (v: string | null): v is Tab => !!v && ALL_TABS.some((t) => t.id === v);
const moduleOf = (t: Tab) => ADMIN_MODULES.find((m) => m.tabs.some((x) => x.id === t)) ?? ADMIN_MODULES[0];

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

/** Tạm thời: AppShell nhúng từng tab cũ (embeddedTab) trong lúc chuyển sang modules/. */
export function Admin({ embeddedTab }: { embeddedTab?: Tab } = {}) {
  const info = getStaffInfo();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab");
  const tab: Tab = embeddedTab ?? (isTab(rawTab) ? rawTab : "dash");
  const [siderOpen, setSiderOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  /** Nhớ mục con mở gần nhất của từng phân hệ để quay lại đúng chỗ */
  const lastTabOf = useRef<Record<string, Tab>>({});
  lastTabOf.current[moduleOf(tab).id] = tab;
  const goTab = (t: Tab) => {
    setParams({ tab: t });
    setSiderOpen(false);
    window.scrollTo({ top: 0 });
  };
  const openModule = (m: AdminModule) => goTab(lastTabOf.current[m.id] ?? m.tabs[0].id);
  useResponsiveTables(bodyRef);
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
      baseSalary: number;
      allowance: number;
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

  const activeModule = moduleOf(tab);
  const activeTab = ALL_TABS.find((x) => x.id === tab) ?? ALL_TABS[0];
  const bottomModules = ADMIN_MODULES.filter((m) => BOTTOM_MODULE_IDS.includes(m.id));
  const activeInBottom = BOTTOM_MODULE_IDS.includes(activeModule.id);

  const body = (
  <div className="admin-main-body" ref={bodyRef}>
    {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

    {tab === "formulas" && <IngredientFormula embedded />}
    {tab === "qr" && <QrGenerator embedded />}
    {tab === "schedule" && <AdminSchedule embedded />}
    {tab === "payroll" && <AdminPayroll />}
    {tab === "procurement" && <ProcurementAdmin embedded />}
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
                      background: "var(--surface)",
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
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.2rem" }}>
                      <div style={{ color: "var(--accent)", fontWeight: 600 }}>{formatVnd(p.sellPrice)}</div>
                      {p.discountPercent != null && p.discountPercent > 0 && (
                        <span style={{ background: "var(--danger)", color: "#fff", padding: "0.1rem 0.4rem", borderRadius: 4, fontSize: "0.75rem", fontWeight: 700 }}>
                          -{p.discountPercent}%
                        </span>
                      )}
                    </div>
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

    {tab === "combos" && (
      <AdminCombos />
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

    {tab === "hrRequests" && (
      <AdminHrRequests />
    )}

    {tab === "customers" && (
      <CustomerManager
        rows={customerRows}
        onReload={loadCustomers}
        onErr={setErr}
      />
    )}

    {tab === "tables" && (
      <AdminZones />
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
        s === "Pending" ? "var(--accent)" : s === "Approved" ? "#15803d" : "var(--danger)";
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
              <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#15803d" }}>{approved}</div>
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
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#b45309" }}>★ {avgRating}</div>
              </div>
            )}
            <div className="card" style={{ padding: "0.65rem 1rem" }}>
              <div className="subtle" style={{ fontSize: "0.8rem" }}>Đã phản hồi</div>
              <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#15803d" }}>{reviews.filter((r) => !!r.adminReply).length}</div>
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
            const statusColor = !v.isActive ? "var(--danger)" : expired || exhausted ? "var(--muted)" : "#15803d";
            const statusLabel = !v.isActive ? "Đã khóa" : expired ? "Hết hạn" : exhausted ? "Hết lượt" : "Đang chạy";
            return (
              <div key={v.id} className="card" style={{ padding: "1rem", opacity: (!v.isActive || expired) ? 0.65 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "1.05rem", background: "rgba(146,64,14,0.12)", padding: "0.1rem 0.5rem", borderRadius: 6, border: "1px solid rgba(146,64,14,0.3)" }}>{v.code}</span>
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
                        <span style={{ color: "#b45309" }}>⏰ Giờ vàng: {v.goldHourStart}h–{v.goldHourEnd}h</span>
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
                    style={{ color: "#b91c1c" }}
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
                        color: o.status === "Paid" ? "#15803d" : "#b45309"
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
  );
  if (embeddedTab) return body;

  return (
    <div className="admin-layout">
      {/* Mobile top bar: tên phân hệ + mục con hiện tại */}
      <header className="admin-mobile-topbar">
        <button
          type="button"
          className="admin-mobile-menu-btn"
          onClick={() => setSiderOpen(true)}
          aria-label="Mở menu quản trị"
          aria-expanded={siderOpen}
        >
          <Menu size={22} aria-hidden />
        </button>
        <div className="admin-mobile-title">
          <span className="admin-mobile-title-module">{activeModule.label}</span>
          <span className="admin-mobile-title-tab">{activeTab.label}</span>
        </div>
        <Link
          to="/staff/login"
          className="admin-mobile-action"
          onClick={() => clearStaffSession()}
          aria-label="Đăng xuất"
        >
          <LogOut size={20} aria-hidden />
        </Link>
      </header>

      {/* Overlay mobile */}
      {siderOpen && (
        <div className="admin-sider-overlay" onClick={() => setSiderOpen(false)} role="presentation" />
      )}

      {/* Sidebar: chỉ hiện các phân hệ; phân hệ đang mở bung ra danh sách mục con */}
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
          <X size={18} aria-hidden />
        </button>
        <nav className="admin-sider-nav" aria-label="Menu quản trị">
          {ADMIN_MODULES.map((m) => {
            const open = m.id === activeModule.id;
            const Icon = m.icon;
            return (
              <div key={m.id} className={open ? "admin-module admin-module-open" : "admin-module"}>
                <button
                  type="button"
                  className={open ? "admin-module-btn admin-module-btn-active" : "admin-module-btn"}
                  aria-expanded={open}
                  onClick={() => (open ? undefined : openModule(m))}
                >
                  <span className="admin-nav-icon"><Icon size={18} strokeWidth={2} aria-hidden /></span>
                  <span className="admin-module-label">{m.label}</span>
                  <ChevronDown size={16} className="admin-module-chevron" aria-hidden />
                </button>
                {open && (
                  <div className="admin-module-items">
                    {m.tabs.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={tab === t.id ? "admin-nav-link admin-nav-link-active" : "admin-nav-link"}
                        aria-current={tab === t.id ? "page" : undefined}
                        onClick={() => goTab(t.id)}
                      >
                        <span>{t.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="admin-sider-footer">
          <div className="admin-nav-group-label">Công cụ nhân viên</div>
          <Link to="/pos" className="admin-sider-foot-link">
            <Receipt size={16} aria-hidden /> Thu ngân (POS)
          </Link>
          <Link to="/staff/tables" className="admin-sider-foot-link">
            <LayoutGrid size={16} aria-hidden /> Sơ đồ bàn
          </Link>
          <Link to="/staff/inventory" className="admin-sider-foot-link">
            <ClipboardList size={16} aria-hidden /> Kiểm kho
          </Link>
          <Link to="/staff/login" className="admin-sider-foot-link admin-sider-foot-danger" onClick={() => clearStaffSession()}>
            <LogOut size={16} aria-hidden /> Đăng xuất
          </Link>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-main-header">
          <div className="admin-main-crumb">{activeModule.label}</div>
          <h1 className="admin-main-title">{activeTab.label}</h1>
        </header>

        {/* Thanh mục con của phân hệ: tabs trên desktop, chip cuộn ngang trên mobile */}
        {activeModule.tabs.length > 1 && (
          <nav className="admin-subtabs" aria-label={`Mục trong ${activeModule.label}`}>
            {activeModule.tabs.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={tab === t.id ? "admin-subtab admin-subtab-active" : "admin-subtab"}
                  aria-current={tab === t.id ? "page" : undefined}
                  onClick={() => goTab(t.id)}
                >
                  <Icon size={16} aria-hidden />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </nav>
        )}

        {body}
      </main>

      {/* Bottom nav (mobile): 4 phân hệ chính + "Thêm" mở drawer */}
      <nav className="staff-bottom-nav admin-bottom-nav" aria-label="Phân hệ quản trị">
        {bottomModules.map((m) => {
          const Icon = m.icon;
          const active = m.id === activeModule.id;
          return (
            <button
              key={m.id}
              type="button"
              className={active ? "staff-bottom-nav-item staff-bottom-nav-active" : "staff-bottom-nav-item"}
              aria-current={active ? "page" : undefined}
              onClick={() => openModule(m)}
            >
              <span className="staff-bottom-nav-icon"><Icon size={20} aria-hidden /></span>
              <span className="staff-bottom-nav-label">{m.short}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={!activeInBottom ? "staff-bottom-nav-item staff-bottom-nav-active" : "staff-bottom-nav-item"}
          onClick={() => setSiderOpen(true)}
          aria-label="Mở toàn bộ menu"
        >
          <span className="staff-bottom-nav-icon"><Ellipsis size={20} aria-hidden /></span>
          <span className="staff-bottom-nav-label">Thêm</span>
        </button>
      </nav>
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
    baseSalary: number;
    allowance: number;
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
    baseSalary: "0",
    allowance: "0",
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
        baseSalary: Number(form.baseSalary),
        allowance: Number(form.allowance),
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
              <option value="Shipper">Shipper</option>
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
          <div className="field" style={{ margin: 0 }}>
            <label className="label">Lương cơ bản / Tháng</label>
            <input type="number" className="input" value={form.baseSalary} onChange={(e) => setForm((f) => ({ ...f, baseSalary: e.target.value }))} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="label">Phụ cấp cố định</label>
            <input type="number" className="input" value={form.allowance} onChange={(e) => setForm((f) => ({ ...f, allowance: e.target.value }))} />
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
                          baseSalary: s.baseSalary.toString(),
                          allowance: s.allowance.toString(),
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
  const [form, setForm] = useState({ name: "", phone: "", address: "", email: "", note: "", username: "", password: "" });
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
      setForm({ name: "", phone: "", address: "", email: "", note: "", username: "", password: "" });
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
    setForm({ name: s.name, phone: s.phone ?? "", address: s.address ?? "", email: s.email ?? "", note: s.note ?? "", username: (s as any).username ?? "", password: "" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div className="card" style={{ padding: "1rem" }}>
        <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>{editId ? `Sửa NCC #${editId}` : "Thêm nhà cung cấp mới"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
          {[["Tên *", "name", "text"], ["Số điện thoại", "phone", "tel"], ["Địa chỉ", "address", "text"], ["Email", "email", "email"], ["Tên đăng nhập (Portal)", "username", "text"], ["Mật khẩu (Portal)", "password", "password"]].map(([label, key, type]) => (
            <div className="field" key={key} style={{ margin: 0 }}>
              <label className="label">{label}</label>
              <input className="input" type={type} placeholder={key === "password" && editId ? "(Để trống nếu không đổi)" : ""} value={(form as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}
        </div>
        <div className="field" style={{ marginTop: "0.6rem" }}>
          <label className="label">Ghi chú</label>
          <input className="input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
        </div>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
          <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? "…" : editId ? "Cập nhật" : "Thêm"}</button>
          {editId && <button className="btn btn-ghost" onClick={() => { setEditId(null); setForm({ name: "", phone: "", address: "", email: "", note: "", username: "", password: "" }); }}>Hủy</button>}
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
              { label: "Doanh thu", value: data.totalRevenue, color: "#15803d" },
              { label: "Giá vốn SP", value: data.totalProductCost, color: "#b45309" },
              { label: "Lợi nhuận gộp", value: data.grossProfit, color: data.grossProfit >= 0 ? "#818cf8" : "#b91c1c" },
              { label: "Biên lợi nhuận", value: data.totalRevenue > 0 ? Math.round(data.grossProfit / data.totalRevenue * 100) : 0, color: "#0369a1", suffix: "%" },
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
    SHIFT_OPEN: "#b45309", SHIFT_CLOSE: "#818cf8",
    INVENTORY_CHECK_OPEN: "#15803d", INVENTORY_CHECK_CLOSE: "#0369a1",
    INVENTORY_RECEIVE: "#6d28d9", SUPPLIER_CREATE: "#047857",
    SUPPLIER_UPDATE: "#b45309", SUPPLIER_DELETE: "#b91c1c",
    LOW_STOCK_ALERT: "#b91c1c",
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
            background: "var(--surface)",
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
  const [priceSizeS, setPriceSizeS] = useState("");
  const [priceSizeL, setPriceSizeL] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [imageUrl, setImageUrl] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [discountPercent, setDiscountPercent] = useState("");
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
          priceSizeS: priceSizeS ? Number(priceSizeS.replace(/\D/g, "")) : undefined,
          priceSizeL: priceSizeL ? Number(priceSizeL.replace(/\D/g, "")) : undefined,
          categoryId,
          costPrice: Number.isNaN(cost) ? 0 : cost,
          sku: sku.trim() || undefined,
          imageUrl: imageUrl.trim() || undefined,
          tags: tags.length > 0 ? tags : undefined,
          discountPercent: discountPercent ? Number(discountPercent) : undefined,
        }),
      });
      setName("");
      setSku("");
      setCostPrice("");
      setSellPrice("");
      setPriceSizeS("");
      setPriceSizeL("");
      setImageUrl("");
      setTags([]);
      setDiscountPercent("");
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
          <label className="label">Giá bán Size M / Gốc (đ)</label>
          <input className="input" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} required />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "-0.5rem", marginBottom: "0.5rem" }}>
        <div className="field">
          <label className="label">Giá Size S (đ)</label>
          <input className="input" placeholder="Tùy chọn" value={priceSizeS} onChange={(e) => setPriceSizeS(e.target.value)} />
        </div>
        <div className="field">
          <label className="label">Giá Size L (đ)</label>
          <input className="input" placeholder="Tùy chọn" value={priceSizeL} onChange={(e) => setPriceSizeL(e.target.value)} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div className="field">
          <label className="label">Giảm giá (%)</label>
          <input className="input" type="number" min="0" max="100" placeholder="VD: 10, 20" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} />
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
      </div>
      <AdminTagsInput tags={tags} onChange={setTags} />
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
  const [priceSizeS, setPriceSizeS] = useState(product.priceSizeS != null ? String(product.priceSizeS) : "");
  const [priceSizeL, setPriceSizeL] = useState(product.priceSizeL != null ? String(product.priceSizeL) : "");
  const [categoryId, setCategoryId] = useState(product.categoryId);
  const [imageUrl, setImageUrl] = useState(product.imageUrl ?? "");
  const [tags, setTags] = useState<string[]>(() => {
    if (typeof product.tags === "string") {
      try { return JSON.parse(product.tags); } catch { return []; }
    } else if (Array.isArray(product.tags)) {
      return product.tags;
    }
    return [];
  });
  const [discountPercent, setDiscountPercent] = useState(product.discountPercent != null ? String(product.discountPercent) : "");
  const [isActive, setIsActive] = useState(product.isActive);
  const [outOfStock, setOutOfStock] = useState(product.outOfStock);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(product.name);
    setSku(product.sku ?? "");
    setCostPrice(String(product.costPrice));
    setSellPrice(String(product.sellPrice));
    setPriceSizeS(product.priceSizeS != null ? String(product.priceSizeS) : "");
    setPriceSizeL(product.priceSizeL != null ? String(product.priceSizeL) : "");
    setCategoryId(product.categoryId);
    setImageUrl(product.imageUrl ?? "");
    setTags(() => {
      if (typeof product.tags === "string") {
        try { return JSON.parse(product.tags); } catch { return []; }
      } else if (Array.isArray(product.tags)) {
        return product.tags;
      }
      return [];
    });
    setDiscountPercent(product.discountPercent != null ? String(product.discountPercent) : "");
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
          tags: tags.length > 0 ? tags : null,
          discountPercent: discountPercent ? Number(discountPercent) : null,
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
              <label className="label">Giá bán Size M / Gốc</label>
              <input className="input" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} required />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "-0.5rem", marginBottom: "0.5rem" }}>
            <div className="field">
              <label className="label">Giá Size S</label>
              <input className="input" placeholder="Trống = Trừ 3k" value={priceSizeS} onChange={(e) => setPriceSizeS(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Giá Size L</label>
              <input className="input" placeholder="Trống = Cộng 5k" value={priceSizeL} onChange={(e) => setPriceSizeL(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div className="field">
              <label className="label">Giảm giá (%)</label>
              <input className="input" type="number" min="0" max="100" placeholder="VD: 10, 20" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} />
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
          </div>
          <AdminTagsInput tags={tags} onChange={setTags} />
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
  const [expiring, setExpiring] = useState<any[]>([]);

  const loadExpiring = async () => {
    try {
      const data = await staffApi<any[]>("/api/admin/inventory/expiring");
      setExpiring(data);
    } catch (ex) {
      console.error(ex);
    }
  };

  useEffect(() => {
    void loadExpiring();
  }, [items]); // Reload when items refresh

  const discardReceipt = async (id: number) => {
    if (!window.confirm("Bạn có chắc chắn muốn hủy lô hàng này không? Sẽ bị trừ khỏi tồn kho!")) return;
    try {
      await staffApi(`/api/admin/inventory/receipts/${id}/discard`, { method: "POST" });
      await loadExpiring();
      await onRefresh();
    } catch (ex) {
      onErr(ex instanceof Error ? ex.message : "Lỗi");
    }
  };

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
      
      {expiring.length > 0 && (
        <div className="card" style={{ padding: "1rem", borderLeft: "4px solid var(--accent)", background: "rgba(146,64,14, 0.05)" }}>
          <h3 style={{ marginTop: 0, fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--accent)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Cảnh báo lô hàng sắp/đã hết hạn
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {expiring.map((r) => {
              const isOverdue = new Date(r.expiryDate).getTime() < Date.now();
              return (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem", background: "var(--surface)", borderRadius: 6 }}>
                  <div>
                    <strong>{r.item.name}</strong> {r.item.unit ? `(${r.item.unit})` : ""} - Lô #{r.id}
                    <div style={{ fontSize: "0.85rem", color: isOverdue ? "var(--danger)" : "var(--accent)" }}>
                      Hết hạn: {new Date(r.expiryDate).toLocaleDateString("vi-VN")} 
                      {isOverdue && " (Đã quá hạn!)"}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <span style={{ fontSize: "0.9rem" }}>Còn lại: <strong>{r.remainingQty}</strong></span>
                    <button type="button" className="btn btn-ghost" style={{ padding: "0.3rem 0.6rem", color: "var(--danger)", fontSize: "0.85rem" }} onClick={() => void discardReceipt(r.id)}>
                      Hủy lô
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
                  background: "var(--surface)",
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
  const [expiryDate, setExpiryDate] = useState("");
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
        body: JSON.stringify({ qty: n, expiryDate: expiryDate || undefined }),
      });
      setRecvQty("");
      setExpiryDate("");
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
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.85rem", marginTop: "0.25rem" }}>
          <div className="field">
            <label className="label">Nhập thêm vào kho</label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <input className="input" style={{ width: 120 }} value={recvQty} onChange={(e) => setRecvQty(e.target.value)} placeholder="Số lượng" />
              <input className="input" type="date" style={{ width: 160 }} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} title="Hạn sử dụng (không bắt buộc)" />
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void receive()}>
                Nhập kho
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
                <span key={s} style={{ color: s <= row.rating ? "#b45309" : "#3a3a3a", fontSize: "1.15rem" }}>★</span>
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
              background: "rgba(34,197,94,0.12)", color: "#15803d",
              border: "1px solid rgba(34,197,94,0.25)",
            }}>Đã phản hồi</span>
          )}
        </div>
      </div>

      {/* Comment */}
      <div style={{
        marginTop: "0.6rem", fontSize: "0.93rem", lineHeight: 1.55,
        borderLeft: "3px solid var(--border)", paddingLeft: "0.75rem",
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


