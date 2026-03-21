import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { clearStaffSession, getStaffInfo, staffApi, staffDownloadBlob } from "../lib/staffApi";

type Tab =
  | "dash"
  | "products"
  | "categories"
  | "staff"
  | "tables"
  | "inventory"
  | "requests"
  | "reviews"
  | "settings"
  | "reports";

type Stats = {
  todayOrders: number;
  todayRevenue: number;
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
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [products, setProducts] = useState<
    Array<{
      id: number;
      name: string;
      sellPrice: number;
      categoryId: number;
      isActive: boolean;
      category?: { name: string };
    }>
  >([]);
  const [categories, setCategories] = useState<Array<{ id: number; name: string; sortOrder: number }>>([]);
  const [staffRows, setStaffRows] = useState<
    Array<{ id: number; username: string | null; fullName: string; role: string; status: string }>
  >([]);
  const [tables, setTables] = useState<Array<{ id: number; name: string; status: string; location: string | null }>>([]);
  const [inventory, setInventory] = useState<Array<{ id: number; name: string; stockQty: number; minLevel: number }>>([]);
  const [requests, setRequests] = useState<
    Array<{
      id: number;
      status: string;
      requestQty: number;
      item: { name: string };
      staff: { fullName: string };
    }>
  >([]);
  const [reviews, setReviews] = useState<
    Array<{
      id: number;
      rating: number;
      comment: string | null;
      adminReply: string | null;
      hidden: boolean;
      customer: { fullName: string };
    }>
  >([]);
  const [settings, setSettings] = useState<{
    vatRatePercent: number;
    pointPerVnd: number;
    pointValueVnd: number;
    cashRoundTo: number;
    pointEarnEveryVnd?: number;
    pointEarnEach?: number;
  } | null>(null);
  const [revenueReport, setRevenueReport] = useState<{ total: number; byDay: Record<string, number> } | null>(null);
  const [topProducts, setTopProducts] = useState<Array<{ name: string; quantity: number; revenue: number }>>([]);

  const loadDash = useCallback(async () => {
    const s = await staffApi<Stats>("/api/admin/stats");
    setStats(s);
  }, []);

  const loadProducts = useCallback(async () => {
    const p = await staffApi<typeof products>("/api/admin/products");
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

  const loadTables = useCallback(async () => {
    const t = await staffApi<typeof tables>("/api/admin/tables");
    setTables(t);
  }, []);

  const loadInventory = useCallback(async () => {
    const i = await staffApi<typeof inventory>("/api/admin/inventory");
    setInventory(i);
  }, []);

  const loadRequests = useCallback(async () => {
    const r = await staffApi<typeof requests>("/api/admin/requests");
    setRequests(r);
  }, []);

  const loadReviews = useCallback(async () => {
    const r = await staffApi<typeof reviews>("/api/admin/reviews");
    setReviews(r);
  }, []);

  const loadSettings = useCallback(async () => {
    const s = await staffApi<NonNullable<typeof settings>>("/api/admin/settings");
    setSettings(s);
  }, []);

  const loadReports = useCallback(async () => {
    const [rev, top] = await Promise.all([
      staffApi<{ total: number; byDay: Record<string, number> }>("/api/admin/reports/revenue"),
      staffApi<{ items: typeof topProducts }>("/api/admin/reports/top-products"),
    ]);
    setRevenueReport(rev);
    setTopProducts(top.items.slice(0, 15));
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
        if (tab === "tables") await loadTables();
        if (tab === "inventory") await loadInventory();
        if (tab === "requests") await loadRequests();
        if (tab === "reviews") await loadReviews();
        if (tab === "settings") await loadSettings();
        if (tab === "reports") await loadReports();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Lỗi");
      }
    })();
  }, [tab, info, loadDash, loadProducts, loadCategories, loadStaff, loadTables, loadInventory, loadRequests, loadReviews, loadSettings, loadReports]);

  if (!info || info.role !== "Admin") {
    return <Navigate to="/staff/login" replace />;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "dash", label: "Tổng quan" },
    { id: "products", label: "Món & giá" },
    { id: "categories", label: "Danh mục" },
    { id: "staff", label: "Nhân sự" },
    { id: "tables", label: "Bàn" },
    { id: "inventory", label: "Kho" },
    { id: "requests", label: "Phiếu xin NL" },
    { id: "reviews", label: "Đánh giá" },
    { id: "settings", label: "Cài đặt CH" },
    { id: "reports", label: "Báo cáo" },
  ];

  return (
    <div className="app-shell" style={{ maxWidth: 1100 }}>
      <div className="nav-top">
        <h1 className="page-title" style={{ margin: 0 }}>
          Quản trị
        </h1>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link to="/pos" className="btn btn-ghost" style={{ padding: "0.5rem 0.85rem", fontSize: "0.9rem" }}>
            POS
          </Link>
          <Link
            to="/staff/login"
            className="btn btn-ghost"
            style={{ padding: "0.5rem 0.85rem", fontSize: "0.9rem" }}
            onClick={() => clearStaffSession()}
          >
            Đăng xuất
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? "btn btn-primary" : "btn btn-ghost"}
            style={{ padding: "0.45rem 0.75rem", fontSize: "0.88rem" }}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

      {tab === "dash" && stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "0.75rem" }}>
          <div className="card" style={{ padding: "1rem" }}>
            <div className="subtle" style={{ fontSize: "0.85rem" }}>
              Hôm nay (đơn)
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
              Món
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
      )}

      {tab === "products" && (
        <section>
          <ProductForm
            categories={categories}
            onCreated={async () => {
              await loadProducts();
              await loadCategories();
            }}
          />
          <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {products.map((p) => (
              <div key={p.id} className="card" style={{ padding: "0.75rem 1rem", display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <strong>{p.name}</strong>
                  <span className="subtle" style={{ marginLeft: "0.5rem" }}>
                    {p.category?.name}
                  </span>
                  <div style={{ color: "var(--accent)", fontWeight: 600 }}>{formatVnd(p.sellPrice)}</div>
                </div>
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
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "categories" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {categories.map((c) => (
            <div key={c.id} className="card" style={{ padding: "0.65rem 1rem" }}>
              #{c.id} — {c.name} <span className="subtle">(thứ tự {c.sortOrder})</span>
            </div>
          ))}
        </div>
      )}

      {tab === "staff" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {staffRows.map((s) => (
            <div key={s.id} className="card" style={{ padding: "0.65rem 1rem" }}>
              <strong>{s.fullName}</strong> — {s.role}{" "}
              <span className="subtle">
                ({s.username ?? "—"}) {s.status}
              </span>
            </div>
          ))}
        </div>
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
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {inventory.map((it) => (
            <InventoryRow key={it.id} item={it} onSaved={loadInventory} onErr={setErr} />
          ))}
        </div>
      )}

      {tab === "requests" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {requests.map((r) => (
            <div key={r.id} className="card" style={{ padding: "0.85rem 1rem" }}>
              <div>
                #{r.id} — {r.item.name} × {r.requestQty} — <strong>{r.status}</strong> — {r.staff.fullName}
              </div>
              {r.status === "Pending" && (
                <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: "0.35rem 0.75rem", fontSize: "0.88rem" }}
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
                    style={{ padding: "0.35rem 0.75rem", fontSize: "0.88rem" }}
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
      )}

      {tab === "reviews" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {reviews.map((r) => (
            <div key={r.id} className="card" style={{ padding: "0.85rem 1rem" }}>
              <div>
                ⭐ {r.rating} — {r.customer.fullName}
              </div>
              <div style={{ marginTop: "0.35rem" }}>{r.comment ?? "—"}</div>
              {r.adminReply && (
                <div className="subtle" style={{ marginTop: "0.35rem" }}>
                  Phản hồi: {r.adminReply}
                </div>
              )}
              <label style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.88rem" }}>
                <input
                  type="checkbox"
                  checked={r.hidden}
                  onChange={async (e) => {
                    try {
                      await staffApi(`/api/admin/reviews/${r.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ hidden: e.target.checked }),
                      });
                      await loadReviews();
                    } catch (ex) {
                      setErr(ex instanceof Error ? ex.message : "Lỗi");
                    }
                  }}
                />
                Ẩn trên web
              </label>
            </div>
          ))}
        </div>
      )}

      {tab === "settings" && settings && (
        <SettingsForm
          settings={{
            ...settings,
            pointEarnEveryVnd: settings.pointEarnEveryVnd ?? 1000,
            pointEarnEach: settings.pointEarnEach ?? 100,
          }}
          onSaved={loadSettings}
          onErr={setErr}
        />
      )}

      {tab === "reports" && revenueReport && (
        <section>
          <div className="card" style={{ padding: "1rem", marginBottom: "1rem" }}>
            <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>30 ngày gần nhất</div>
            <div>Tổng: {formatVnd(revenueReport.total)}</div>
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
              Tải CSV doanh thu
            </button>
          </div>
          <h3 style={{ fontSize: "1rem" }}>Món bán chạy (doanh thu)</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            {topProducts.map((p) => (
              <div key={p.name} className="card" style={{ padding: "0.5rem 0.85rem" }}>
                {p.name} — SL {p.quantity} — {formatVnd(p.revenue)}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ProductForm({
  categories,
  onCreated,
}: {
  categories: Array<{ id: number; name: string }>;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || categoryId === "") return;
    const price = Number(sellPrice.replace(/\D/g, ""));
    if (Number.isNaN(price) || price <= 0) return;
    setBusy(true);
    try {
      await staffApi("/api/admin/products", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), sellPrice: price, categoryId }),
      });
      setName("");
      setSellPrice("");
      await onCreated();
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
        <label className="label">Giá bán</label>
        <input className="input" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} required />
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
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "…" : "Tạo"}
      </button>
    </form>
  );
}

function InventoryRow({
  item,
  onSaved,
  onErr,
}: {
  item: { id: number; name: string; stockQty: number; minLevel: number };
  onSaved: () => Promise<void>;
  onErr: (s: string | null) => void;
}) {
  const [qty, setQty] = useState("");
  return (
    <div className="card" style={{ padding: "0.85rem 1rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
      <div style={{ flex: "1 1 200px" }}>
        <strong>{item.name}</strong>
        <div className="subtle" style={{ fontSize: "0.88rem" }}>
          Tồn: {item.stockQty} — tối thiểu: {item.minLevel}
        </div>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label className="label">Nhập thêm</label>
        <input className="input" style={{ width: 120 }} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="SL" />
      </div>
      <button
        type="button"
        className="btn btn-primary"
        onClick={async () => {
          const n = Number(qty.replace(/\D/g, ""));
          if (Number.isNaN(n) || n <= 0) {
            onErr("Số lượng không hợp lệ");
            return;
          }
          onErr(null);
          try {
            await staffApi(`/api/admin/inventory/${item.id}/receive`, {
              method: "POST",
              body: JSON.stringify({ qty: n }),
            });
            setQty("");
            await onSaved();
          } catch (e) {
            onErr(e instanceof Error ? e.message : "Lỗi");
          }
        }}
      >
        Ghi nhận
      </button>
    </div>
  );
}

function SettingsForm({
  settings,
  onSaved,
  onErr,
}: {
  settings: {
    vatRatePercent: number;
    pointPerVnd: number;
    pointValueVnd: number;
    cashRoundTo: number;
    pointEarnEveryVnd: number;
    pointEarnEach: number;
  };
  onSaved: () => Promise<void>;
  onErr: (s: string | null) => void;
}) {
  const [vat, setVat] = useState(String(settings.vatRatePercent));
  const [earnEvery, setEarnEvery] = useState(String(settings.pointEarnEveryVnd));
  const [earnEach, setEarnEach] = useState(String(settings.pointEarnEach));
  const [pval, setPval] = useState(String(settings.pointValueVnd));
  const [round, setRound] = useState(String(settings.cashRoundTo));

  useEffect(() => {
    setVat(String(settings.vatRatePercent));
    setEarnEvery(String(settings.pointEarnEveryVnd));
    setEarnEach(String(settings.pointEarnEach));
    setPval(String(settings.pointValueVnd));
    setRound(String(settings.cashRoundTo));
  }, [settings]);

  async function save(e: FormEvent) {
    e.preventDefault();
    onErr(null);
    try {
      await staffApi("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          vatRatePercent: Number(vat),
          pointValueVnd: Number(pval),
          cashRoundTo: Number(round),
          pointEarnEveryVnd: Number(earnEvery),
          pointEarnEach: Number(earnEach),
        }),
      });
      await onSaved();
    } catch (err) {
      onErr(err instanceof Error ? err.message : "Lỗi");
    }
  }

  return (
    <form className="card" style={{ padding: "1rem" }} onSubmit={(e) => void save(e)}>
      <h3 style={{ marginTop: 0, fontSize: "1rem" }}>VAT, tích điểm, làm tròn tiền mặt</h3>
      <div className="field">
        <label className="label">VAT (%)</label>
        <input className="input" value={vat} onChange={(e) => setVat(e.target.value)} />
      </div>
      <div className="field">
        <label className="label">Cứ mỗi (VND) thanh toán thực tế</label>
        <input className="input" value={earnEvery} onChange={(e) => setEarnEvery(e.target.value)} placeholder="1000" />
      </div>
      <div className="field">
        <label className="label">…thì cộng (điểm)</label>
        <input className="input" value={earnEach} onChange={(e) => setEarnEach(e.target.value)} placeholder="100" />
      </div>
      <p className="subtle" style={{ margin: "-0.35rem 0 0.5rem", fontSize: "0.85rem" }}>
        Ví dụ 1.000đ → 100 điểm. Đổi điểm: 1 điểm = số đồng bên dưới.
      </p>
      <div className="field">
        <label className="label">1 điểm quy đổi (VND giảm trừ)</label>
        <input className="input" value={pval} onChange={(e) => setPval(e.target.value)} />
      </div>
      <div className="field">
        <label className="label">Làm tròn tiền mặt (đơn vị)</label>
        <input className="input" value={round} onChange={(e) => setRound(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary">
        Lưu
      </button>
    </form>
  );
}
